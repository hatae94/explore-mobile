/**
 * `ios_webkit_debug_proxy` lifecycle (REQ-WEB-PROXY-001..004).
 *
 * The proxy is the transport under the inspector client: it bridges a TCP
 * port to the simulator's Web Inspector unix socket. The CLI manages it so a
 * caller only ever runs one command (design decision D2, spec.md §A.3).
 *
 * Two behaviours here are measured, not assumed (spec.md §C.1-④):
 *   - The proxy's default `localhost:27753` does NOT find a simulator;
 *     `-s unix:<socket>` is required.
 *   - Dead socket files accumulate under the per-boot
 *     `/private/tmp/com.apple.launchd.<id>` directories (five were present,
 *     one live), so the socket is chosen by whether a process holds it open
 *     — never by the file existing.
 *
 * @MX:WARN — this module starts and kills an external long-running process.
 * @MX:REASON — killing a proxy the CLI did not start would break whatever
 * else was using it (a DevTools window, another tool), so ownership is
 * tracked explicitly and `dispose` only kills what `openWebProxy` launched.
 */

import { spawn } from "node:child_process";
import type { ProcessExecutor } from "../backend/process-executor.js";
import { IwdpNotInstalledError, NoWebPageError, WebInspectorConnectionError } from "./webkit-errors.js";

const IWDP_BINARY = "ios_webkit_debug_proxy";
const SOCKET_MARKER = "com.apple.webinspectord_sim.socket";
const DEFAULT_PORT = 9222;
/** Width of the device port range handed to `-c`, matching the tool's own documented default span. */
const PORT_RANGE_SPAN = 77;
const DEFAULT_MAX_START_ATTEMPTS = 20;
const START_POLL_INTERVAL_MS = 250;

/** A running proxy the caller may terminate. */
export interface ProxyProcess {
  kill(): void;
}

export type ProxyLauncher = (command: string, args: string[]) => ProxyProcess;
export type JsonFetcher = (url: string) => Promise<unknown>;

export interface OpenWebProxyOptions {
  /** Runs `which` and `lsof`. */
  exec: ProcessExecutor;
  launch?: ProxyLauncher;
  fetchJson?: JsonFetcher;
  sleep?: (ms: number) => Promise<void>;
  port?: number;
  maxStartAttempts?: number;
}

export interface WebProxySession {
  /** Debugger URL of the page to attach to. */
  readonly pageWebSocketUrl: string;
  /** False when an already-running proxy was reused — `dispose` then leaves it alone. */
  readonly startedByUs: boolean;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts the Web Inspector sockets that a process currently holds open,
 * from `lsof -U` output.
 *
 * Pure function — the whole point is that "which socket is live" is decided
 * by occupancy rather than by a directory listing, and that decision is
 * unit-testable without a simulator.
 */
export function parseLiveInspectorSockets(lsofStdout: string): string[] {
  const paths = new Set<string>();

  for (const line of lsofStdout.split(/\r?\n/)) {
    if (!line.includes(SOCKET_MARKER)) continue;
    const tokens = line.trim().split(/\s+/);
    const path = tokens[tokens.length - 1];
    if (path !== undefined && path.includes(SOCKET_MARKER)) paths.add(path);
  }

  return [...paths];
}

/**
 * Asks the proxy for its page list.
 *
 * Returns `null` when the proxy is unreachable and `[]` when it answers with
 * no debuggable page — a distinction the caller needs, since the first means
 * "start one" and the second means "there is nothing to attach to". The
 * unreachable case is expected control flow during startup polling, not a
 * swallowed failure: exhausting the poll budget raises.
 */
async function probePages(fetchJson: JsonFetcher, port: number): Promise<string[] | null> {
  let payload: unknown;
  try {
    payload = await fetchJson(`http://localhost:${port}/json`);
  } catch {
    return null;
  }

  if (!Array.isArray(payload)) return [];

  return payload
    .filter(isRecord)
    .map((page) => page.webSocketDebuggerUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

function createSession(pageWebSocketUrl: string, startedByUs: boolean, proc: ProxyProcess | undefined): WebProxySession {
  let disposed = false;
  return {
    pageWebSocketUrl,
    startedByUs,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (startedByUs) proc?.kill();
    },
  };
}

/** What `doctor` reports about the web path's prerequisites (REQ-WEB-PROXY-003). */
export interface WebInspectorProxyCheck {
  installed: boolean;
  /** How many simulator Web Inspector sockets are currently held open — zero means no simulator is reachable for `--web`. */
  liveSocketCount: number;
  /** Present only when the proxy is missing. */
  guidance?: string;
}

/**
 * Diagnoses the web path for `doctor` (AC-WEB-003).
 *
 * Never throws: `doctor`'s job is to report an unhealthy environment, not to
 * fail because the environment is unhealthy.
 */
export async function checkWebInspectorProxy(exec: ProcessExecutor): Promise<WebInspectorProxyCheck> {
  let installed = false;
  try {
    installed = (await exec("which", [IWDP_BINARY])).exitCode === 0;
  } catch {
    installed = false;
  }

  let liveSocketCount = 0;
  try {
    const lsof = await exec("lsof", ["-U"]);
    liveSocketCount = parseLiveInspectorSockets(lsof.stdout.toString("utf-8")).length;
  } catch {
    liveSocketCount = 0;
  }

  return installed
    ? { installed, liveSocketCount }
    : { installed, liveSocketCount, guidance: `brew install ios-webkit-debug-proxy` };
}

/** Real launcher: a long-lived child that is also killed if this process exits first, so a crash does not leak a proxy. */
export const spawnProxyProcess: ProxyLauncher = (command: string, args: string[]): ProxyProcess => {
  const child = spawn(command, args, { stdio: "ignore" });
  const killOnExit = (): void => {
    child.kill();
  };
  process.once("exit", killOnExit);

  return {
    kill: () => {
      process.removeListener("exit", killOnExit);
      child.kill();
    },
  };
};

/** Real fetcher over Node's built-in `fetch`. */
export const nativeFetchJson: JsonFetcher = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ensures a proxy is available and returns the page to attach to.
 *
 * Reuses a proxy that is already listening (REQ-WEB-PROXY-002) — the session
 * then reports `startedByUs: false` and `dispose` leaves it running.
 */
export async function openWebProxy(options: OpenWebProxyOptions): Promise<WebProxySession> {
  const port = options.port ?? DEFAULT_PORT;
  const fetchJson = options.fetchJson ?? nativeFetchJson;
  const launch = options.launch ?? spawnProxyProcess;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxStartAttempts ?? DEFAULT_MAX_START_ATTEMPTS;

  const existing = await probePages(fetchJson, port);
  if (existing !== null) {
    const url = existing[0];
    if (url === undefined) {
      throw new NoWebPageError(
        `A proxy is running on port ${port} but no debuggable page is open. Open a page in Safari on the simulator and retry.`,
      );
    }
    return createSession(url, false, undefined);
  }

  const which = await options.exec("which", [IWDP_BINARY]);
  if (which.exitCode !== 0) {
    throw new IwdpNotInstalledError(
      `${IWDP_BINARY} is not installed or not on PATH. Install it with: brew install ios-webkit-debug-proxy`,
    );
  }

  const lsof = await options.exec("lsof", ["-U"]);
  const sockets = parseLiveInspectorSockets(lsof.stdout.toString("utf-8"));
  const socket = sockets[0];
  if (socket === undefined) {
    throw new NoWebPageError(
      "No simulator is exposing a Web Inspector socket. Boot a simulator and open a page in Safari, then retry.",
    );
  }

  const proc = launch(IWDP_BINARY, [
    "-F",
    "-c",
    `null:${port - 1},:${port}-${port + PORT_RANGE_SPAN}`,
    "-s",
    `unix:${socket}`,
  ]);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pages = await probePages(fetchJson, port);
    if (pages !== null) {
      const url = pages[0];
      if (url === undefined) {
        proc.kill();
        throw new NoWebPageError(
          "The simulator has no debuggable page open. Open a page in Safari on the simulator and retry.",
        );
      }
      return createSession(url, true, proc);
    }
    await sleep(START_POLL_INTERVAL_MS);
  }

  proc.kill();
  throw new WebInspectorConnectionError(
    `${IWDP_BINARY} did not start listening on port ${port} after ${maxAttempts} attempts.`,
  );
}
