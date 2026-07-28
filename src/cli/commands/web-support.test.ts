/**
 * M5 — `--web` command wiring (REQ-WEB-ACT-001..004, REQ-WEB-CLI-001..003;
 * AC-WEB-012..015, 018, 019).
 *
 * The proxy, the inspector connection, and the calibration store are all
 * injected, so these run with no proxy, no simulator, and no disk.
 */

import { describe, expect, it } from "vitest";
import type { CommonElement, DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import type { ProcessExecResult } from "../../backend/process-executor.js";
import { CalibrationStore } from "../../webview/calibration.js";
import { AmbiguousWebPageError, IwdpNotInstalledError } from "../../webview/webkit-errors.js";
import type { WebInspectorClient } from "../../webview/inspector-client.js";
import type { WebProxySession } from "../../webview/proxy-service.js";
import { parseCommandArgs } from "../args.js";
import { runWebDump, runWebTap, runWebText, type WebRunDeps } from "./web-support.js";

const IOS_DEVICE: DeviceInfo = {
  serial: "UDID-1",
  model: "iPhone 17 Pro",
  osVersion: "26.0",
  connectionState: "device",
  isEmulator: true,
  platform: "ios",
};

const ANDROID_DEVICE: DeviceInfo = { ...IOS_DEVICE, serial: "R58N90", platform: "android" };

const VIEWPORT_SIGNATURE = { innerWidth: 402, innerHeight: 714, screenWidth: 402, screenHeight: 874 };

/** A raw collected element as the in-page collector emits it. */
function rawEl(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag: "a",
    role: "",
    text: "뉴스",
    label: "",
    placeholder: "",
    id: "",
    rect: { x: 20, y: 348, w: 66, h: 48 },
    disabled: false,
    onclick: false,
    ...overrides,
  };
}

interface Harness {
  deps: WebRunDeps;
  backend: DeviceBackend;
  taps: { x: number; y: number }[];
  typed: string[];
  evaluated: string[];
  disposed: () => boolean;
  clientClosed: () => boolean;
}

function harness(
  options: {
    device?: DeviceInfo;
    collected?: unknown;
    /** What the M4 re-measure (the second `buildCollectExpression` call, after a scroll) returns. Defaults to `collected` — i.e. scrolling changed nothing. */
    postScrollCollected?: unknown;
    /**
     * Overrides the `scrollIntoView` eval's return. Defaults to
     * `{found: true, moved: true}` (element found and the page actually
     * moved) — SPEC-GESTURE-001 M6, AC-GEST-021. Pass
     * `{found: true, moved: false}` for the "ran but nothing moved"
     * regression, or `false` for "node not found at all".
     */
    scrollResult?: unknown;
    clickResult?: unknown;
    proxyError?: Error;
    onOpenProxy?: (opts: { pageIndex?: number }) => void;
  } = {},
): Harness {
  const device = options.device ?? IOS_DEVICE;
  const collected = options.collected ?? [rawEl()];
  const taps: { x: number; y: number }[] = [];
  const typed: string[] = [];
  const evaluated: string[] = [];
  let disposed = false;
  let clientClosed = false;
  let collectCalls = 0;

  const backend = {
    listDevices: async (): Promise<DeviceInfo[]> => [device],
    dumpUiHierarchy: async (): Promise<CommonElement[]> => [],
    screenshot: async (): Promise<Uint8Array> => new Uint8Array(),
    tap: async (_serial: string, x: number, y: number): Promise<void> => {
      taps.push({ x, y });
    },
    inputText: async (_serial: string, text: string): Promise<void> => {
      typed.push(text);
    },
    sendKeyEvent: async (): Promise<void> => undefined,
    launchApp: async (): Promise<void> => undefined,
    stopApp: async (): Promise<void> => undefined,
    swipe: async (): Promise<void> => undefined,
  } satisfies DeviceBackend;

  const client: WebInspectorClient = {
    targetId: "page-12",
    close: () => {
      clientClosed = true;
    },
    evaluate: async <T>(expression: string): Promise<T> => {
      evaluated.push(expression);
      if (expression.includes("screenHeight")) return VIEWPORT_SIGNATURE as T;
      // SPEC-GESTURE-001 M6 (AC-GEST-021): production now returns
      // `{found, moved}` instead of a bare boolean. Defaulting to
      // `{found: true, moved: true}` keeps every pre-existing "-scrolled"
      // fixture's expectation unchanged; tests that need the drawer-link
      // regression shape (found but not moved) pass `scrollResult` explicitly.
      if (expression.includes("scrollIntoView")) return (options.scrollResult ?? { found: true, moved: true }) as T;
      if (expression.includes(".click()")) return (options.clickResult ?? true) as T;
      // buildCollectExpression: the first call is the initial lookup: later
      // calls are the M4 re-measure after a scroll (REQ-GEST-WEB-001).
      collectCalls += 1;
      if (collectCalls > 1 && options.postScrollCollected !== undefined) {
        return options.postScrollCollected as T;
      }
      return collected as T;
    },
  };

  const session: WebProxySession = {
    pageWebSocketUrl: "ws://localhost:9222/devtools/page/1",
    page: {
      index: 0,
      title: "NAVER",
      url: "https://m.naver.com/",
      webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1",
    },
    startedByUs: true,
    dispose: () => {
      disposed = true;
    },
  };

  const files = new Map<string, Buffer>();
  const store = new CalibrationStore("/tmp/fake/web-calibration.json", {
    read: async (path) => files.get(path) ?? null,
    write: async (path, data) => {
      files.set(path, data);
    },
  });
  // Pre-seed so the command layer never needs a calibration tap of its own;
  // measurement itself is covered by calibration.test.ts.
  void store.set(device.serial, { topOffset: 62, signature: VIEWPORT_SIGNATURE });

  return {
    deps: {
      openProxy: async (opts): Promise<WebProxySession> => {
        options.onOpenProxy?.(opts);
        if (options.proxyError) throw options.proxyError;
        return session;
      },
      connect: async (): Promise<WebInspectorClient> => client,
      store,
      exec: async (): Promise<ProcessExecResult> => ({
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        exitCode: 0,
      }),
    },
    backend,
    taps,
    typed,
    evaluated,
    disposed: () => disposed,
    clientClosed: () => clientClosed,
  };
}

describe("runWebDump", () => {
  it("returns normalized web elements", async () => {
    const h = harness();
    const result = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { serial: string; elements: CommonElement[] };
    expect(data.serial).toBe("UDID-1");
    expect(data.elements).toHaveLength(1);
    expect(data.elements[0]).toMatchObject({ role: "a", text: "뉴스", tappable: true });
  });

  it("drops invisible elements before reporting", async () => {
    const h = harness({ collected: [rawEl(), rawEl({ id: "ghost", rect: { x: 0, y: 0, w: 0, h: 0 } })] });
    const result = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);
    expect(result.ok && (result.data as { elements: CommonElement[] }).elements).toHaveLength(1);
  });

  it("emits a single parseable JSON document (AC-WEB-018)", async () => {
    const h = harness();
    const result = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });

  it("always releases the proxy and the connection", async () => {
    const h = harness();
    await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);
    expect(h.disposed()).toBe(true);
    expect(h.clientClosed()).toBe(true);
  });
});

describe("page selection (0.2.0 amendment, AC-WEB-021..023)", () => {
  it("names the page it acted on in every success response", async () => {
    const h = harness();
    const dumped = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);
    const tapped = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);
    const typed = await runWebText(parseCommandArgs(["안녕", "--web", "a"]), h.backend, h.deps);

    for (const result of [dumped, tapped, typed]) {
      expect(result.ok).toBe(true);
      // toEqual: the debugger socket is transport plumbing and must not reach
      // the caller's envelope.
      expect(result.ok && (result.data as { page: unknown }).page).toEqual({
        index: 0,
        title: "NAVER",
        url: "https://m.naver.com/",
      });
    }
  });

  it("surfaces AMBIGUOUS_PAGE with the candidate list so the caller can choose", async () => {
    const pages = [
      { index: 0, title: "NAVER", url: "https://m.naver.com/" },
      { index: 1, title: "클립", url: "https://clip.naver.com/" },
    ];
    const h = harness({ proxyError: new AmbiguousWebPageError("2 debuggable pages are open", pages) });
    const result = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AMBIGUOUS_PAGE");
    expect(result.error.details).toEqual({ pages });
  });

  it("passes --page through to the proxy", async () => {
    const seen: { pageIndex?: number }[] = [];
    const h = harness({ onOpenProxy: (opts) => seen.push(opts) });
    await runWebDump(parseCommandArgs(["--web", "--page", "1"]), h.backend, h.deps);
    expect(seen[0]?.pageIndex).toBe(1);
  });

  it("omits pageIndex entirely when --page is absent", async () => {
    const seen: { pageIndex?: number }[] = [];
    const h = harness({ onOpenProxy: (opts) => seen.push(opts) });
    await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);
    expect(seen[0]?.pageIndex).toBeUndefined();
  });

  it("rejects a non-numeric --page without opening a proxy", async () => {
    const seen: { pageIndex?: number }[] = [];
    const h = harness({ onOpenProxy: (opts) => seen.push(opts) });
    const result = await runWebDump(parseCommandArgs(["--web", "--page", "abc"]), h.backend, h.deps);

    expect(!result.ok && result.error.code).toBe("INVALID_PAGE");
    expect(seen).toEqual([]);
  });
});

describe("platform guard (REQ-WEB-CLI-003, AC-WEB-019)", () => {
  it("refuses --web against an Android device", async () => {
    const h = harness({ device: ANDROID_DEVICE });
    const result = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNSUPPORTED_ON_PLATFORM");
  });

  it("does not open a proxy for an unsupported platform", async () => {
    const h = harness({ device: ANDROID_DEVICE, proxyError: new Error("must not be reached") });
    const result = await runWebDump(parseCommandArgs(["--web"]), h.backend, h.deps);
    expect(result.ok).toBe(false);
  });
});

describe("runWebTap", () => {
  it("taps the converted device coordinate natively (AC-WEB-012)", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    // rect {20,348,66,48} -> centre (53,372) -> +62 -> (53,434)
    expect(h.taps).toEqual([{ x: 53, y: 434 }]);
    expect(result.ok && (result.data as { method: string }).method).toBe("native");
  });

  it("reports the coordinate it used", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);
    expect(result.ok && result.data).toMatchObject({ x: 53, y: 434 });
  });

  it("falls back to JS click for an element outside the viewport, and says so (AC-WEB-013)", async () => {
    // SPEC-GESTURE-001 M4 (REQ-GEST-WEB-001) now attempts a scrollIntoView +
    // re-measure before this fallback; since this fixture reports the same
    // off-viewport rect both before and after (no `postScrollCollected`
    // override), the coordinate is still unconvertible and the JS click path
    // that SPEC-WEBVIEW-001 established is unchanged — only the `method`
    // label gains the `-scrolled` suffix (REQ-GEST-WEB-002) to record that a
    // scroll was attempted. See AC-GEST-014 below for the dedicated M4 test.
    const h = harness({ collected: [rawEl({ rect: { x: 719, y: 142, w: 64, h: 45 } })] });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click-scrolled");
    expect(h.taps).toEqual([]);
  });

  it("rejects an unmatched selector without tapping or clicking (AC-WEB-015)", async () => {
    const h = harness({ collected: [] });
    const result = await runWebTap(parseCommandArgs(["--web", "a.nope"]), h.backend, h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ELEMENT_NOT_FOUND");
    expect(h.taps).toEqual([]);
    expect(h.evaluated.some((e) => e.includes(".click()"))).toBe(false);
  });

  it("treats an all-invisible match set as not found", async () => {
    const h = harness({ collected: [rawEl({ rect: { x: 0, y: 0, w: 0, h: 0 } })] });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
  });

  it("requires a selector", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web"]), h.backend, h.deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_SELECTOR");
  });

  it("addresses the Nth VISIBLE match by its position in the raw match list", async () => {
    const h = harness({
      collected: [
        rawEl({ id: "ghost", rect: { x: 0, y: 0, w: 0, h: 0 } }),
        rawEl({ id: "first-visible" }),
        rawEl({ id: "second-visible", rect: { x: 719, y: 142, w: 64, h: 45 } }),
      ],
    });
    // --index 1 selects the second VISIBLE element, which is raw index 2.
    const result = await runWebTap(parseCommandArgs(["--web", "a", "--index", "1"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    const clickExpr = h.evaluated.find((e) => e.includes(".click()")) ?? "";
    expect(clickExpr).toContain("[2]");
  });

  it("rejects an out-of-range index", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a", "--index", "5"]), h.backend, h.deps);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
  });

  it("refuses to combine --web with coordinates rather than ignoring one of them", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["100", "200", "--web", "a"]), h.backend, h.deps);
    expect(!result.ok && result.error.code).toBe("TARGET_CONFLICT");
    expect(h.taps).toEqual([]);
  });

  it("refuses to combine --web with the native --id/--text selectors", async () => {
    const h = harness();
    const byId = await runWebTap(parseCommandArgs(["--web", "a", "--id", "btn"]), h.backend, h.deps);
    const byText = await runWebTap(parseCommandArgs(["--web", "a", "--text", "OK"]), h.backend, h.deps);
    expect(!byId.ok && byId.error.code).toBe("TARGET_CONFLICT");
    expect(!byText.ok && byText.error.code).toBe("TARGET_CONFLICT");
  });

  it("surfaces a proxy failure with its own code (AC-WEB-003)", async () => {
    const h = harness({ proxyError: new IwdpNotInstalledError("not installed") });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("IWDP_NOT_INSTALLED");
  });
});

describe("runWebTap — off-viewport scroll (SPEC-GESTURE-001 M4, REQ-GEST-WEB-001..003)", () => {
  it("scrolls an off-viewport element into view, re-measures, and taps natively (AC-GEST-012)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })], // centerY 2020 > innerHeight 714 -> off-viewport
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })], // centre (50,320) -> +62 -> (50,382)
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("native-scrolled");
    expect(h.taps).toEqual([{ x: 50, y: 382 }]);
    expect(h.evaluated.some((e) => e.includes("scrollIntoView"))).toBe(true);
  });

  it("reports a scrolled-then-tapped response that is not the same as a tapped-directly response (AC-GEST-013)", async () => {
    const direct = harness();
    const directResult = await runWebTap(parseCommandArgs(["--web", "a"]), direct.backend, direct.deps);

    const scrolled = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })],
    });
    const scrolledResult = await runWebTap(parseCommandArgs(["--web", "a"]), scrolled.backend, scrolled.deps);

    expect(directResult.ok && (directResult.data as { method: string }).method).toBe("native");
    expect(scrolledResult.ok && (scrolledResult.data as { method: string }).method).toBe("native-scrolled");
    expect(directResult.ok && directResult.data).not.toEqual(scrolledResult.ok && scrolledResult.data);
  });

  it("falls back to a JS click marked as scrolled when the coordinate is still unconvertible after scrolling in (AC-GEST-014)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })], // unchanged -- still off-viewport
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click-scrolled");
    expect(h.taps).toEqual([]);
  });

  it("does not credit a scroll that never happened when scrollIntoView finds no node", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      scrollResult: false,
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click");
    expect(h.taps).toEqual([]);
  });

  it("does not credit a scrollIntoView that ran but did not move the page (AC-GEST-021, off-canvas-drawer regression)", async () => {
    // The auditor's live repro: an off-viewport drawer link where
    // `scrollIntoView` returns `true` (the node exists) but `scrollY` is
    // unchanged before/after — the element is still off-viewport after the
    // call, so the fallback path applies, and it must NOT be labelled
    // `-scrolled` (spec.md §C.1-⑪, REQ-GEST-WEB-002 강화).
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })], // unchanged -- the page never moved
      scrollResult: { found: true, moved: false },
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click");
    expect(h.taps).toEqual([]);
  });

  it("still credits -scrolled when scrollIntoView both found the node AND the page moved but re-measurement is still off-viewport (AC-GEST-021 does not remove existing js-click-scrolled behavior)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      scrollResult: { found: true, moved: true },
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click-scrolled");
  });

  it("reports plain 'native' (not 'native-scrolled') when the page did not move even though the element became tappable (AC-GEST-021 applies to the native path too)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })],
      scrollResult: { found: true, moved: false },
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("native");
    expect(h.taps).toEqual([{ x: 50, y: 382 }]);
  });

  it("does not attempt a scroll for an element already inside the viewport (regression, B-3)", async () => {
    const h = harness();
    await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);
    expect(h.evaluated.some((e) => e.includes("scrollIntoView"))).toBe(false);
  });

  it("emits a single parseable JSON document on the scrolled path (AC-GEST-015)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })],
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), h.backend, h.deps);
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });
});

describe("runWebText", () => {
  it("activates the element, then types (REQ-WEB-ACT-003)", async () => {
    const h = harness({ collected: [rawEl({ tag: "input", placeholder: "검색" })] });
    const result = await runWebText(parseCommandArgs(["안녕하세요", "--web", "#query"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(h.taps).toEqual([{ x: 53, y: 434 }]);
    expect(h.typed).toEqual(["안녕하세요"]);
  });

  it("does not type when the selector matched nothing (AC-WEB-015)", async () => {
    const h = harness({ collected: [] });
    const result = await runWebText(parseCommandArgs(["안녕", "--web", "#nope"]), h.backend, h.deps);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
    expect(h.typed).toEqual([]);
  });

  it("requires the text positional", async () => {
    const h = harness();
    const result = await runWebText(parseCommandArgs(["--web", "#query"]), h.backend, h.deps);
    expect(!result.ok && result.error.code).toBe("MISSING_TEXT");
  });

  it("refuses to combine --web with the native --id/--text selectors", async () => {
    const h = harness();
    const result = await runWebText(parseCommandArgs(["안녕", "--web", "#query", "--id", "field"]), h.backend, h.deps);
    expect(!result.ok && result.error.code).toBe("TARGET_CONFLICT");
    expect(h.typed).toEqual([]);
  });

  it("releases the session even when the selector fails", async () => {
    const h = harness({ collected: [] });
    await runWebText(parseCommandArgs(["안녕", "--web", "#nope"]), h.backend, h.deps);
    expect(h.disposed()).toBe(true);
    expect(h.clientClosed()).toBe(true);
  });

  it("scrolls an off-viewport field into view before typing (SPEC-GESTURE-001 M4, REQ-GEST-WEB-001)", async () => {
    const h = harness({
      collected: [rawEl({ tag: "input", placeholder: "검색", rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ tag: "input", placeholder: "검색", rect: { x: 20, y: 300, w: 60, h: 40 } })],
    });
    const result = await runWebText(parseCommandArgs(["안녕", "--web", "#query"]), h.backend, h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("native-scrolled");
    expect(h.taps).toEqual([{ x: 50, y: 382 }]);
    expect(h.typed).toEqual(["안녕"]);
  });
});
