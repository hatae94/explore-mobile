/**
 * M5 — `--web` command wiring (REQ-WEB-ACT-001..004, REQ-WEB-CLI-001..003;
 * AC-WEB-012..015, 018, 019).
 *
 * The proxy, the inspector connection, and the calibration store are all
 * injected, so these run with no proxy, no simulator, and no disk.
 */

import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import type {
  CommonElement,
  DeviceBackend,
  DeviceInfo,
  ScreenSize,
  SwipeThreshold,
} from "../../schema/device-backend.js";
import type { ProcessExecResult } from "../../backend/process-executor.js";
import { CalibrationStore } from "../../webview/calibration.js";
import { AmbiguousWebPageError, IwdpNotInstalledError } from "../../webview/webkit-errors.js";
import type { WebInspectorClient } from "../../webview/inspector-client.js";
import type { WebProxySession } from "../../webview/proxy-service.js";
import { parseCommandArgs } from "../args.js";
import { toDeviceSource } from "../device-targeting.js";
import { buildScrollIntoViewExpression, runWebTap, runWebText, type WebRunDeps } from "./web-support.js";

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
    getMinEffectiveSwipeThreshold: async (): Promise<SwipeThreshold> => ({
      minEffectiveSwipePx: 11,
      basis: "measured-constant",
    }),
    getScreenSize: async (): Promise<ScreenSize> => ({ width: 1080, height: 1920 }),
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

// SPEC-VISION-001 M2 (REQ-VISION-002): `describe("runWebDump")` was removed
// with the `dump` command itself (사용자 결정, progress.md §G). The session
// lifecycle it also happened to exercise — page selection, the platform
// guard, proxy/connection release — lives in `runInWebSession`, which
// `runWebTap`/`runWebText` still use, so those tests were RE-POINTED at
// `runWebTap` rather than deleted. Deleting them would have dropped
// coverage of a surviving path, which REQ-VISION-007 forbids.

describe("session lifecycle (was exercised via runWebDump before SPEC-VISION-001 M2)", () => {
  it("emits a single parseable JSON document (AC-WEB-018)", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });

  it("always releases the proxy and the connection", async () => {
    const h = harness();
    await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(h.disposed()).toBe(true);
    expect(h.clientClosed()).toBe(true);
  });
});

describe("page selection (0.2.0 amendment, AC-WEB-021..023)", () => {
  it("names the page it acted on in every success response", async () => {
    const h = harness();
    const tapped = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    const typed = await runWebText(parseCommandArgs(["안녕", "--web", "a"]), toDeviceSource(h.backend), h.deps);

    for (const result of [tapped, typed]) {
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
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AMBIGUOUS_PAGE");
    expect(result.error.details).toEqual({ pages });
  });

  it("passes --page through to the proxy", async () => {
    const seen: { pageIndex?: number }[] = [];
    const h = harness({ onOpenProxy: (opts) => seen.push(opts) });
    await runWebTap(parseCommandArgs(["--web", "a", "--page", "1"]), toDeviceSource(h.backend), h.deps);
    expect(seen[0]?.pageIndex).toBe(1);
  });

  it("omits pageIndex entirely when --page is absent", async () => {
    const seen: { pageIndex?: number }[] = [];
    const h = harness({ onOpenProxy: (opts) => seen.push(opts) });
    await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(seen[0]?.pageIndex).toBeUndefined();
  });

  it("rejects a non-numeric --page without opening a proxy", async () => {
    const seen: { pageIndex?: number }[] = [];
    const h = harness({ onOpenProxy: (opts) => seen.push(opts) });
    const result = await runWebTap(parseCommandArgs(["--web", "a", "--page", "abc"]), toDeviceSource(h.backend), h.deps);

    expect(!result.ok && result.error.code).toBe("INVALID_PAGE");
    expect(seen).toEqual([]);
  });
});

describe("platform guard (REQ-WEB-CLI-003, AC-WEB-019)", () => {
  it("refuses --web against an Android device", async () => {
    const h = harness({ device: ANDROID_DEVICE });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNSUPPORTED_ON_PLATFORM");
  });

  it("does not open a proxy for an unsupported platform", async () => {
    const h = harness({ device: ANDROID_DEVICE, proxyError: new Error("must not be reached") });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(result.ok).toBe(false);
  });
});

describe("runWebTap", () => {
  it("taps the converted device coordinate natively (AC-WEB-012)", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    // rect {20,348,66,48} -> centre (53,372) -> +62 -> (53,434)
    expect(h.taps).toEqual([{ x: 53, y: 434 }]);
    expect(result.ok && (result.data as { method: string }).method).toBe("native");
  });

  it("reports the coordinate it used", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
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
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click-scrolled");
    expect(h.taps).toEqual([]);
  });

  it("rejects an unmatched selector without tapping or clicking (AC-WEB-015)", async () => {
    const h = harness({ collected: [] });
    const result = await runWebTap(parseCommandArgs(["--web", "a.nope"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ELEMENT_NOT_FOUND");
    expect(h.taps).toEqual([]);
    expect(h.evaluated.some((e) => e.includes(".click()"))).toBe(false);
  });

  it("treats an all-invisible match set as not found", async () => {
    const h = harness({ collected: [rawEl({ rect: { x: 0, y: 0, w: 0, h: 0 } })] });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
  });

  it("requires a selector", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web"]), toDeviceSource(h.backend), h.deps);
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
    const result = await runWebTap(parseCommandArgs(["--web", "a", "--index", "1"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    const clickExpr = h.evaluated.find((e) => e.includes(".click()")) ?? "";
    expect(clickExpr).toContain("[2]");
  });

  it("rejects an out-of-range index", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["--web", "a", "--index", "5"]), toDeviceSource(h.backend), h.deps);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
  });

  it("refuses to combine --web with coordinates rather than ignoring one of them", async () => {
    const h = harness();
    const result = await runWebTap(parseCommandArgs(["100", "200", "--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(!result.ok && result.error.code).toBe("TARGET_CONFLICT");
    expect(h.taps).toEqual([]);
  });

  // SPEC-VISION-001 M2 (REQ-VISION-002): the native selectors are gone, so
  // this conflict is now refused one layer EARLIER — at arg parsing, before
  // any handler runs. That is strictly stronger than the old handler-level
  // TARGET_CONFLICT: no proxy is opened and no device is touched, because
  // the command never gets constructed at all.
  it("refuses --web combined with a removed native selector, at parse time (AC-VISION-009)", () => {
    expect(() => parseCommandArgs(["--web", "a", "--id", "btn"])).toThrow(/--id/);
    expect(() => parseCommandArgs(["--web", "a", "--text", "OK"])).toThrow(/--text/);
  });

  it("surfaces a proxy failure with its own code (AC-WEB-003)", async () => {
    const h = harness({ proxyError: new IwdpNotInstalledError("not installed") });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

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
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("native-scrolled");
    expect(h.taps).toEqual([{ x: 50, y: 382 }]);
    expect(h.evaluated.some((e) => e.includes("scrollIntoView"))).toBe(true);
  });

  it("reports a scrolled-then-tapped response that is not the same as a tapped-directly response (AC-GEST-013)", async () => {
    const direct = harness();
    const directResult = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(direct.backend), direct.deps);

    const scrolled = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })],
    });
    const scrolledResult = await runWebTap(
      parseCommandArgs(["--web", "a"]),
      toDeviceSource(scrolled.backend),
      scrolled.deps,
    );

    expect(directResult.ok && (directResult.data as { method: string }).method).toBe("native");
    expect(scrolledResult.ok && (scrolledResult.data as { method: string }).method).toBe("native-scrolled");
    expect(directResult.ok && directResult.data).not.toEqual(scrolledResult.ok && scrolledResult.data);
  });

  it("falls back to a JS click marked as scrolled when the coordinate is still unconvertible after scrolling in (AC-GEST-014)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })], // unchanged -- still off-viewport
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click-scrolled");
    expect(h.taps).toEqual([]);
  });

  it("does not credit a scroll that never happened when scrollIntoView finds no node", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      scrollResult: false,
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

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
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

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
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("js-click-scrolled");
  });

  it("reports plain 'native' (not 'native-scrolled') when the page did not move even though the element became tappable (AC-GEST-021 applies to the native path too)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })],
      scrollResult: { found: true, moved: false },
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("native");
    expect(h.taps).toEqual([{ x: 50, y: 382 }]);
  });

  it("does not attempt a scroll for an element already inside the viewport (regression, B-3)", async () => {
    const h = harness();
    await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(h.evaluated.some((e) => e.includes("scrollIntoView"))).toBe(false);
  });

  it("emits a single parseable JSON document on the scrolled path (AC-GEST-015)", async () => {
    const h = harness({
      collected: [rawEl({ rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ rect: { x: 20, y: 300, w: 60, h: 40 } })],
    });
    const result = await runWebTap(parseCommandArgs(["--web", "a"]), toDeviceSource(h.backend), h.deps);
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });
});

describe("runWebText", () => {
  it("activates the element, then types (REQ-WEB-ACT-003)", async () => {
    const h = harness({ collected: [rawEl({ tag: "input", placeholder: "검색" })] });
    const result = await runWebText(parseCommandArgs(["안녕하세요", "--web", "#query"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(h.taps).toEqual([{ x: 53, y: 434 }]);
    expect(h.typed).toEqual(["안녕하세요"]);
  });

  it("does not type when the selector matched nothing (AC-WEB-015)", async () => {
    const h = harness({ collected: [] });
    const result = await runWebText(parseCommandArgs(["안녕", "--web", "#nope"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
    expect(h.typed).toEqual([]);
  });

  it("requires the text positional", async () => {
    const h = harness();
    const result = await runWebText(parseCommandArgs(["--web", "#query"]), toDeviceSource(h.backend), h.deps);
    expect(!result.ok && result.error.code).toBe("MISSING_TEXT");
  });

  // SPEC-VISION-001 M2 (REQ-VISION-002): parse-time refusal, same as the
  // runWebTap case above — nothing is typed because nothing runs.
  it("refuses --web combined with a removed native selector, at parse time (AC-VISION-009)", () => {
    expect(() => parseCommandArgs(["안녕", "--web", "#query", "--id", "field"])).toThrow(/--id/);
  });

  it("releases the session even when the selector fails", async () => {
    const h = harness({ collected: [] });
    await runWebText(parseCommandArgs(["안녕", "--web", "#nope"]), toDeviceSource(h.backend), h.deps);
    expect(h.disposed()).toBe(true);
    expect(h.clientClosed()).toBe(true);
  });

  it("scrolls an off-viewport field into view before typing (SPEC-GESTURE-001 M4, REQ-GEST-WEB-001)", async () => {
    const h = harness({
      collected: [rawEl({ tag: "input", placeholder: "검색", rect: { x: 20, y: 2000, w: 60, h: 40 } })],
      postScrollCollected: [rawEl({ tag: "input", placeholder: "검색", rect: { x: 20, y: 300, w: 60, h: 40 } })],
    });
    const result = await runWebText(parseCommandArgs(["안녕", "--web", "#query"]), toDeviceSource(h.backend), h.deps);

    expect(result.ok).toBe(true);
    expect(result.ok && (result.data as { method: string }).method).toBe("native-scrolled");
    expect(h.taps).toEqual([{ x: 50, y: 382 }]);
    expect(h.typed).toEqual(["안녕"]);
  });
});

/**
 * `buildScrollIntoViewExpression`'s generated JS, executed for real inside a
 * `node:vm` sandbox (SPEC-GESTURE-001 M7/0.5.0 amendment — C-3, AC-GEST-023).
 *
 * The `harness()` above mocks `WebInspectorClient.evaluate` entirely, so it
 * can never exercise this function's actual JS body — it only ever returns
 * whatever `scrollResult` a test configured. That is fine for verifying
 * `web-support.ts`'s handling of `{found, moved}`, but it cannot prove the
 * new rect-based oracle itself is correct (the whole point of C-3). These
 * tests run the REAL generated expression string against fake DOM stand-ins
 * with a `vm` sandbox (Node built-in, no new dependency, no jsdom) so the
 * oracle logic itself — not just the caller's branching on its output — is
 * under test.
 */
describe("buildScrollIntoViewExpression — rect-based moved oracle (SPEC-GESTURE-001 M7, C-3, AC-GEST-023)", () => {
  function fakeElement(rects: Array<{ top: number; left: number; bottom: number; right: number }>) {
    let call = 0;
    return {
      getBoundingClientRect: () => rects[Math.min(call, rects.length - 1)],
      scrollIntoView: () => {
        call += 1;
      },
    };
  }

  it("credits movement when the element's rect changed even though this sandbox has no window.scrollY at all (container-scroll generalization)", () => {
    // No `window` global is provided at all -- if the oracle still touched
    // `window.scrollY` this would throw a ReferenceError instead of
    // returning a result. The element's own rect is the only signal used,
    // which is exactly what makes an overflow:auto container's scroll
    // (spec.md §C.1-⑯: containerScrollTop 0->755, scrollY 1626->1626)
    // detectable -- the 0.4.0 window.scrollY-only oracle could not see it.
    const el = fakeElement([
      { top: 900, left: 20, bottom: 948, right: 86 }, // off-viewport, before
      { top: 300, left: 20, bottom: 348, right: 86 }, // in-viewport, after
    ]);
    const document = { querySelectorAll: () => [el] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    expect(outcome).toEqual({ found: true, moved: true });
  });

  it("credits movement from a horizontal-only rect change (left/right, no top/bottom change)", () => {
    const el = fakeElement([
      { top: 300, left: 900, bottom: 340, right: 966 },
      { top: 300, left: 20, bottom: 340, right: 86 },
    ]);
    const document = { querySelectorAll: () => [el] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    expect(outcome).toEqual({ found: true, moved: true });
  });

  it("does not credit movement when the rect is unchanged (AC-GEST-021 regression guard — the off-canvas-drawer repro)", () => {
    const el = fakeElement([{ top: 900, left: 20, bottom: 948, right: 86 }]);
    const document = { querySelectorAll: () => [el] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    expect(outcome).toEqual({ found: true, moved: false });
  });

  it("returns found:false without calling scrollIntoView when no node matches", () => {
    const document = { querySelectorAll: () => [] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    expect(outcome).toEqual({ found: false, moved: false });
  });
});

/**
 * Post-completion sampling under CSS `scroll-behavior: smooth`
 * (SPEC-GESTURE-001 M9/0.7.0 amendment, AC-GEST-031, spec.md §C.1-㉑).
 *
 * `scrollIntoView` is ASYNCHRONOUS when the page (or an ancestor) declares
 * `scroll-behavior: smooth` -- a rect sampled immediately after the call
 * reflects the PRE-scroll position, not the post-scroll one, even though a
 * scroll genuinely did happen. This stub simulates that platform contract:
 * a call that requests SYNCHRONOUS scrolling commits the rect change
 * immediately; any other call defers the commit to a later tick that never
 * arrives within this synchronous `vm` script (mirroring an animation still
 * in flight when the caller samples the rect). The stub asserts NOTHING
 * about which argument shape the generated expression passes (AC-GEST-031
 * deliberately asserts no specific argument) -- any implementation that
 * actually requests synchronous scrolling passes; one that does not, fails.
 */
describe("buildScrollIntoViewExpression — post-completion sampling under async scroll-behavior:smooth (SPEC-GESTURE-001 M9, AC-GEST-031)", () => {
  function fakeAsyncElement(rects: Array<{ top: number; left: number; bottom: number; right: number }>) {
    let committed = false;
    return {
      getBoundingClientRect: () => rects[committed ? 1 : 0],
      scrollIntoView: (opts?: { behavior?: string }) => {
        if (opts?.behavior === "instant") {
          committed = true;
        }
        // else: an animated/smooth scroll -- the commit is deferred past
        // this synchronous call, exactly as the real platform behaves
        // under `scroll-behavior: smooth` (spec.md §C.1-㉑: the audit's
        // own reproduction sampled `containerScrollTop 0 -> 0` immediately
        // after the call, `-> 958` about 11s later).
      },
    };
  }

  it("credits movement when the generated expression requests synchronous scrolling, even though the underlying scroll mechanism is otherwise asynchronous (AC-GEST-031)", () => {
    const el = fakeAsyncElement([
      { top: 900, left: 20, bottom: 948, right: 86 }, // pre-scroll (stale, if sampled too early)
      { top: 300, left: 20, bottom: 348, right: 86 }, // post-scroll (correct, once committed)
    ]);
    const document = { querySelectorAll: () => [el] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    expect(outcome).toEqual({ found: true, moved: true });
  });
});

/**
 * Defensive `behavior:"instant"` fallback under an enum-rejecting WebKit
 * (SPEC-GESTURE-001 M10/0.8.0 amendment, NF3).
 *
 * WebKit validates `ScrollBehavior` as an IDL enum -- a WebKit build that
 * predates `"instant"` (Safari < 17.4) throws a `TypeError` for it (per the
 * 5th-round audit's confirmed finding; not independently re-verified in
 * this milestone -- the live proxy in this environment is flaky, see
 * plan.md §C.1). Without a fallback, that throw would make EVERY
 * off-viewport tap silently degrade to the JS `click()` fallback --
 * strictly broader than the M9 defect and indistinguishable in the
 * response from an ordinary `js-click`. These stubs simulate an
 * enum-rejecting WebKit: `scrollIntoView({behavior:"instant"})` throws;
 * the no-argument fallback call does not.
 */
describe("buildScrollIntoViewExpression — defensive behavior:\"instant\" fallback on enum-rejecting WebKit (SPEC-GESTURE-001 M10, NF3)", () => {
  function fakeEnumRejectingElement(rects: Array<{ top: number; left: number; bottom: number; right: number }>) {
    let committed = false;
    return {
      getBoundingClientRect: () => rects[committed ? 1 : 0],
      scrollIntoView: (opts?: { behavior?: string }) => {
        if (opts?.behavior === "instant") {
          throw new TypeError(
            "Failed to execute 'scrollIntoView' on 'Element': The provided value 'instant' is not a valid enum value of type ScrollBehavior.",
          );
        }
        // Fallback call (no `behavior` argument) -- this stub's default
        // scroll behaviour commits synchronously, same as the primary
        // path would on a page with no declared `scroll-behavior: smooth`.
        committed = true;
      },
    };
  }

  it("falls back to a no-argument call and still finds+credits movement when behavior:\"instant\" throws (the cliff is closed, not merely swallowed)", () => {
    const el = fakeEnumRejectingElement([
      { top: 900, left: 20, bottom: 948, right: 86 },
      { top: 300, left: 20, bottom: 348, right: 86 },
    ]);
    const document = { querySelectorAll: () => [el] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    // Without the fallback, the uncaught TypeError would abort the whole
    // evaluate() call and this selector would report {found:false,
    // moved:false} -- indistinguishable from "no node matched" and
    // silently degrading the caller to js-click.
    expect(outcome).toEqual({ found: true, moved: true });
  });

  /**
   * The fallback is NOT an equivalent substitute (documented trade-off,
   * NF3): on a page/container declaring `scroll-behavior: smooth`, the
   * no-argument fallback call is asynchronous too, so this reopens the
   * exact async-sampling defect M9 closed (spec.md §C.1-㉑) -- narrowed to
   * "old WebKit + a smooth-scrolling page/container" instead of "every
   * off-viewport tap".
   */
  function fakeEnumRejectingSmoothElement(rects: Array<{ top: number; left: number; bottom: number; right: number }>) {
    return {
      getBoundingClientRect: () => rects[0],
      scrollIntoView: (opts?: { behavior?: string }) => {
        if (opts?.behavior === "instant") {
          throw new TypeError(
            "Failed to execute 'scrollIntoView' on 'Element': The provided value 'instant' is not a valid enum value of type ScrollBehavior.",
          );
        }
        // Fallback call runs but the page's own `scroll-behavior: smooth`
        // makes it asynchronous -- the commit never lands within this
        // synchronous script, exactly like the M9 stub's deferred branch.
      },
    };
  }

  it("on a smooth-scrolling page/container, the fallback reads moved:false for a scroll that genuinely happens moments later -- the M9 defect reopened on this narrower path (NOT parity with the primary instant path)", () => {
    const el = fakeEnumRejectingSmoothElement([
      { top: 900, left: 20, bottom: 948, right: 86 }, // never observed to change within this script
      { top: 300, left: 20, bottom: 348, right: 86 },
    ]);
    const document = { querySelectorAll: () => [el] };

    const outcome = runInNewContext(buildScrollIntoViewExpression("a.off", 0), { document });

    expect(outcome).toEqual({ found: true, moved: false });
  });
});
