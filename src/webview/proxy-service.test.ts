/**
 * M4 — ios_webkit_debug_proxy lifecycle (REQ-WEB-PROXY-001..004,
 * AC-WEB-001..004).
 *
 * Every dependency (subprocess exec, proxy launch, HTTP) is injected, so
 * these run with no proxy, no simulator, and no network.
 */

import { describe, expect, it } from "vitest";
import type { ProcessExecResult } from "../backend/process-executor.js";
import { AmbiguousWebPageError, IwdpNotInstalledError, NoWebPageError } from "./webkit-errors.js";
import {
  checkWebInspectorProxy,
  openWebProxy,
  parseLiveInspectorSockets,
  type ProxyProcess,
} from "./proxy-service.js";

/** Real `lsof -U` output shape: five listed sockets, only one held open. */
const LSOF_OUTPUT = `launchd_s 66077 hatae    8u  unix 0x14ea92eb53399cbe      0t0      /private/tmp/com.apple.launchd.a594appE48/com.apple.webinspectord_sim.socket
launchd_s 66077 hatae    9u  unix 0x14ea92eb53399cbe      0t0      /private/tmp/com.apple.launchd.a594appE48/com.apple.webinspectord_sim.socket
Dropbox   612 hatae   21u  unix 0x9f1a2b3c4d5e6f70      0t0      /private/tmp/some.other.socket`;

const LIVE_SOCKET = "/private/tmp/com.apple.launchd.a594appE48/com.apple.webinspectord_sim.socket";

const PAGE_LIST = [
  { title: "NAVER", url: "https://m.naver.com/", webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1" },
];

/**
 * The real two-target state observed after one link tap (spec.md §Amendments
 * 0.2.0): index 0 is the stale page that is NOT on screen, index 1 is.
 */
const TWO_PAGE_LIST = [
  { title: "NAVER", url: "https://m.naver.com/", webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1" },
  {
    title: "여름에만 느낄 수 있는 풍경",
    url: "https://clip.naver.com/contents?recType=CLIP_PC",
    webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/2",
  },
];

function execResult(exitCode: number, stdout = ""): ProcessExecResult {
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(""), exitCode };
}

class FakeProxyProcess implements ProxyProcess {
  killed = false;
  kill(): void {
    this.killed = true;
  }
}

/** Builds a dependency set whose defaults describe a healthy, proxy-not-yet-running host. */
function deps(overrides: Partial<Parameters<typeof openWebProxy>[0]> = {}) {
  const launched: { command: string; args: string[] }[] = [];
  const proc = new FakeProxyProcess();
  let proxyUp = false;

  return {
    launched,
    proc,
    options: {
      exec: async (command: string, args: string[]): Promise<ProcessExecResult> => {
        if (command === "which") return execResult(0, "/opt/homebrew/bin/ios_webkit_debug_proxy\n");
        if (command === "lsof") return execResult(0, LSOF_OUTPUT);
        return execResult(1);
      },
      launch: (command: string, args: string[]): ProxyProcess => {
        launched.push({ command, args });
        proxyUp = true;
        return proc;
      },
      fetchJson: async (): Promise<unknown> => {
        if (!proxyUp) throw new Error("ECONNREFUSED");
        return PAGE_LIST;
      },
      sleep: async (): Promise<void> => undefined,
      ...overrides,
    },
  };
}

describe("parseLiveInspectorSockets", () => {
  it("returns only the webinspector sockets actually held open, deduplicated", () => {
    expect(parseLiveInspectorSockets(LSOF_OUTPUT)).toEqual([LIVE_SOCKET]);
  });

  it("returns an empty list when nothing holds an inspector socket open", () => {
    expect(parseLiveInspectorSockets("")).toEqual([]);
    expect(parseLiveInspectorSockets("Dropbox 612 hatae 21u unix 0x1 0t0 /private/tmp/other.socket")).toEqual([]);
  });
});

describe("checkWebInspectorProxy (doctor, AC-WEB-003)", () => {
  it("reports the proxy as installed and counts the live inspector sockets", async () => {
    const result = await checkWebInspectorProxy(async (command: string) =>
      command === "which" ? execResult(0, "/opt/homebrew/bin/ios_webkit_debug_proxy") : execResult(0, LSOF_OUTPUT),
    );

    expect(result.installed).toBe(true);
    expect(result.liveSocketCount).toBe(1);
    expect(result.guidance).toBeUndefined();
  });

  it("reports it as missing and offers install guidance", async () => {
    const result = await checkWebInspectorProxy(async (command: string) =>
      command === "which" ? execResult(1) : execResult(0, LSOF_OUTPUT),
    );

    expect(result.installed).toBe(false);
    expect(result.guidance).toContain("brew install ios-webkit-debug-proxy");
  });

  it("never throws when the probes themselves fail", async () => {
    const result = await checkWebInspectorProxy(async () => {
      throw new Error("spawn failed");
    });
    expect(result).toMatchObject({ installed: false, liveSocketCount: 0 });
  });
});

describe("openWebProxy — starting", () => {
  it("starts the proxy against the occupied socket, not a merely-existing file", async () => {
    const { options, launched } = deps();
    const session = await openWebProxy(options);

    expect(launched).toHaveLength(1);
    expect(launched[0]?.command).toBe("ios_webkit_debug_proxy");
    expect(launched[0]?.args.join(" ")).toContain(`-s unix:${LIVE_SOCKET}`);
    session.dispose();
  });

  it("resolves the only page's debugger URL", async () => {
    const { options } = deps();
    const session = await openWebProxy(options);
    expect(session.pageWebSocketUrl).toBe("ws://localhost:9222/devtools/page/1");
    session.dispose();
  });

  it("reports which page it attached to, even when there is only one (AC-WEB-023)", async () => {
    const { options } = deps();
    const session = await openWebProxy(options);
    expect(session.page).toEqual({
      index: 0,
      title: "NAVER",
      url: "https://m.naver.com/",
      webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1",
    });
    session.dispose();
  });

  it("kills the proxy it started", async () => {
    const { options, proc } = deps();
    const session = await openWebProxy(options);
    expect(proc.killed).toBe(false);
    session.dispose();
    expect(proc.killed).toBe(true);
  });

  it("is safe to dispose more than once", async () => {
    const { options } = deps();
    const session = await openWebProxy(options);
    session.dispose();
    expect(() => session.dispose()).not.toThrow();
  });
});

describe("openWebProxy — reuse (REQ-WEB-PROXY-002)", () => {
  it("reuses a proxy that is already running instead of starting another", async () => {
    const { options, launched } = deps({ fetchJson: async () => PAGE_LIST });
    const session = await openWebProxy(options);
    expect(launched).toHaveLength(0);
    expect(session.startedByUs).toBe(false);
    session.dispose();
  });

  it("does NOT kill a proxy it did not start", async () => {
    const { options, proc } = deps({ fetchJson: async () => PAGE_LIST });
    const session = await openWebProxy(options);
    session.dispose();
    expect(proc.killed).toBe(false);
  });
});

describe("openWebProxy — multiple pages (0.2.0 amendment, AC-WEB-021/022)", () => {
  it("refuses to guess when more than one page is debuggable", async () => {
    const { options } = deps({ fetchJson: async () => TWO_PAGE_LIST });
    await expect(openWebProxy(options)).rejects.toBeInstanceOf(AmbiguousWebPageError);
  });

  it("lists every candidate, without leaking the debugger socket into the report", async () => {
    const { options } = deps({ fetchJson: async () => TWO_PAGE_LIST });
    const error = await openWebProxy(options).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AmbiguousWebPageError);
    if (!(error instanceof AmbiguousWebPageError)) return;
    // toEqual, not toMatchObject: the ws URL is transport plumbing and must
    // NOT appear in what the caller is shown.
    expect(error.pages).toEqual([
      { index: 0, title: "NAVER", url: "https://m.naver.com/" },
      { index: 1, title: "여름에만 느낄 수 있는 풍경", url: "https://clip.naver.com/contents?recType=CLIP_PC" },
    ]);
  });

  it("does not start a proxy of its own while refusing", async () => {
    const { options, launched } = deps({ fetchJson: async () => TWO_PAGE_LIST });
    await expect(openWebProxy(options)).rejects.toBeInstanceOf(AmbiguousWebPageError);
    expect(launched).toHaveLength(0);
  });

  it("selects the requested page when --page is given", async () => {
    const { options } = deps({ fetchJson: async () => TWO_PAGE_LIST });
    const session = await openWebProxy({ ...options, pageIndex: 1 });
    expect(session.pageWebSocketUrl).toBe("ws://localhost:9222/devtools/page/2");
    expect(session.page.title).toBe("여름에만 느낄 수 있는 풍경");
    session.dispose();
  });

  it("accepts --page even when only one page exists", async () => {
    const { options } = deps();
    const session = await openWebProxy({ ...options, pageIndex: 0 });
    expect(session.page.index).toBe(0);
    session.dispose();
  });

  it("refuses an out-of-range --page rather than falling back to another page", async () => {
    const { options } = deps({ fetchJson: async () => TWO_PAGE_LIST });
    await expect(openWebProxy({ ...options, pageIndex: 5 })).rejects.toBeInstanceOf(AmbiguousWebPageError);
  });
});

describe("openWebProxy — graceful failures", () => {
  it("reports IWDP_NOT_INSTALLED instead of crashing when the binary is absent", async () => {
    const { options } = deps({
      exec: async (command: string) => (command === "which" ? execResult(1) : execResult(0, LSOF_OUTPUT)),
    });
    await expect(openWebProxy(options)).rejects.toBeInstanceOf(IwdpNotInstalledError);
  });

  it("reports NO_WEB_PAGE when the proxy is up but no page is open", async () => {
    const { options } = deps({ fetchJson: async () => [] });
    await expect(openWebProxy(options)).rejects.toBeInstanceOf(NoWebPageError);
  });

  it("reports NO_WEB_PAGE when no simulator is exposing an inspector socket", async () => {
    const { options } = deps({
      exec: async (command: string) =>
        command === "which" ? execResult(0, "/opt/homebrew/bin/ios_webkit_debug_proxy") : execResult(0, ""),
    });
    await expect(openWebProxy(options)).rejects.toBeInstanceOf(NoWebPageError);
  });

  it("gives up and kills the process when the proxy never becomes reachable", async () => {
    const proc = new FakeProxyProcess();
    const { options } = deps({
      launch: () => proc,
      fetchJson: async () => {
        throw new Error("ECONNREFUSED");
      },
      maxStartAttempts: 3,
    });
    await expect(openWebProxy(options)).rejects.toThrow();
    expect(proc.killed).toBe(true);
  });

  it("ignores page entries that carry no debugger URL", async () => {
    const { options } = deps({
      fetchJson: async () => [{ title: "no ws url" }, PAGE_LIST[0]],
    });
    const session = await openWebProxy(options);
    expect(session.pageWebSocketUrl).toBe("ws://localhost:9222/devtools/page/1");
    session.dispose();
  });

  it("reports NO_WEB_PAGE when the page listing is not an array", async () => {
    const { options } = deps({ fetchJson: async () => ({ pages: [] }) });
    await expect(openWebProxy(options)).rejects.toBeInstanceOf(NoWebPageError);
  });
});
