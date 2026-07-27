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
import {
  AmbiguousWebPageError,
  IwdpNotInstalledError,
  NoWebPageError,
  WebInspectorConnectionError,
  type WebPageSummary,
} from "./webkit-errors.js";

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

/** A debuggable page plus the socket to reach it on. */
export interface WebPageTarget extends WebPageSummary {
  webSocketDebuggerUrl: string;
}

export interface OpenWebProxyOptions {
  /** Runs `which` and `lsof`. */
  exec: ProcessExecutor;
  launch?: ProxyLauncher;
  fetchJson?: JsonFetcher;
  sleep?: (ms: number) => Promise<void>;
  port?: number;
  maxStartAttempts?: number;
  /** `--page <n>`: which debuggable page to attach to. Required once more than one exists. */
  pageIndex?: number;
}

export interface WebProxySession {
  /** Debugger URL of the page to attach to. */
  readonly pageWebSocketUrl: string;
  /** Which page this session attached to — always reported, even when there was only one (REQ-WEB-CLI-004). */
  readonly page: WebPageTarget;
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
async function probePages(fetchJson: JsonFetcher, port: number): Promise<WebPageTarget[] | null> {
  let payload: unknown;
  try {
    payload = await fetchJson(`http://localhost:${port}/json`);
  } catch {
    return null;
  }

  if (!Array.isArray(payload)) return [];

  // Index over the DEBUGGABLE pages only, so the number a caller passes to
  // `--page` matches the list `AMBIGUOUS_PAGE` showed them.
  return payload
    .filter(isRecord)
    .filter((page) => typeof page.webSocketDebuggerUrl === "string" && page.webSocketDebuggerUrl.length > 0)
    .map((page, index) => ({
      index,
      title: typeof page.title === "string" ? page.title : "",
      url: typeof page.url === "string" ? page.url : "",
      webSocketDebuggerUrl: page.webSocketDebuggerUrl as string,
    }));
}

/**
 * Picks the page to attach to, refusing to guess between several
 * (REQ-WEB-PROXY-005).
 *
 * The caller is told every candidate rather than being handed one the proxy
 * happened to list first — which, after a single link tap, is a page that is
 * no longer on screen.
 */
function selectPage(pages: WebPageTarget[], pageIndex: number | undefined): WebPageTarget {
  if (pageIndex !== undefined) {
    const chosen = pages[pageIndex];
    if (chosen === undefined) {
      throw new AmbiguousWebPageError(
        `--page ${pageIndex} is out of range; ${pages.length} debuggable page(s) are open.`,
        pages.map(toPageSummary),
      );
    }
    return chosen;
  }

  const only = pages[0];
  if (pages.length === 1 && only !== undefined) return only;

  throw new AmbiguousWebPageError(
    `${pages.length} debuggable pages are open; specify --page <n>. The proxy does not report which one is on screen, so no page is chosen for you.`,
    pages.map(toPageSummary),
  );
}

/** Drops the debugger socket, which is transport plumbing rather than something a caller acts on. */
export function toPageSummary(page: WebPageTarget): WebPageSummary {
  return { index: page.index, title: page.title, url: page.url };
}

function createSession(page: WebPageTarget, startedByUs: boolean, proc: ProxyProcess | undefined): WebProxySession {
  let disposed = false;
  return {
    pageWebSocketUrl: page.webSocketDebuggerUrl,
    page,
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
    if (existing.length === 0) {
      throw new NoWebPageError(
        `A proxy is running on port ${port} but no debuggable page is open. Open a page in Safari on the simulator and retry.`,
      );
    }
    return createSession(selectPage(existing, options.pageIndex), false, undefined);
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
      if (pages.length === 0) {
        proc.kill();
        throw new NoWebPageError(
          "The simulator has no debuggable page open. Open a page in Safari on the simulator and retry.",
        );
      }
      try {
        return createSession(selectPage(pages, options.pageIndex), true, proc);
      } catch (err) {
        // The proxy we just started is ours to clean up even when the page
        // choice is what failed.
        proc.kill();
        throw err;
      }
    }
    await sleep(START_POLL_INTERVAL_MS);
  }

  proc.kill();
  throw new WebInspectorConnectionError(
    `${IWDP_BINARY} did not start listening on port ${port} after ${maxAttempts} attempts.`,
  );
}
