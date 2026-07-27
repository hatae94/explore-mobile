/**
 * M5 — runtime viewport calibration + per-device cache (REQ-WEB-ACT-005).
 *
 * The top-chrome offset is measured, never assumed (progress.md §E.2 M1).
 * These tests drive a fake page and a fake tap, so no proxy, simulator, or
 * disk is touched.
 */

import { describe, expect, it, vi } from "vitest";
import {
  CalibrationStore,
  measureViewport,
  resolveViewport,
  sameViewportSignature,
  type PageMetrics,
} from "./calibration.js";
import { WebInspectorConnectionError } from "./webkit-errors.js";

const METRICS: PageMetrics = { innerWidth: 402, innerHeight: 714, screenWidth: 402, screenHeight: 874 };

/**
 * Fake inspector page: answers the install probe with `METRICS`, records the
 * tap the caller sends, and answers the read probe with what a page at
 * `topOffset` would have observed.
 */
function fakePage(options: { topOffset: number; metrics?: PageMetrics; recordTouch?: boolean; scrollY?: number }) {
  const metrics = options.metrics ?? METRICS;
  const scrollY = options.scrollY ?? 0;
  const taps: { x: number; y: number }[] = [];
  const expressions: string[] = [];

  const client = {
    targetId: "page-1",
    close: () => undefined,
    evaluate: async <T>(expression: string): Promise<T> => {
      expressions.push(expression);
      // The install probe is the one that reports the page's metrics.
      if (expression.includes("screenHeight")) return metrics as T;
      const tap = taps[0];
      if (options.recordTouch === false || tap === undefined) return null as T;
      return { pageX: tap.x, pageY: tap.y - options.topOffset + scrollY, scrollX: 0, scrollY } as T;
    },
  };

  return {
    client,
    taps,
    expressions,
    tap: async (x: number, y: number): Promise<void> => {
      taps.push({ x, y });
    },
  };
}

describe("sameViewportSignature", () => {
  it("matches identical geometry", () => {
    expect(sameViewportSignature(METRICS, { ...METRICS })).toBe(true);
  });

  it("differs when the device rotates (width and height swap)", () => {
    const rotated: PageMetrics = { innerWidth: 874, innerHeight: 340, screenWidth: 874, screenHeight: 402 };
    expect(sameViewportSignature(METRICS, rotated)).toBe(false);
  });

  it("differs when the browser chrome changes height", () => {
    expect(sameViewportSignature(METRICS, { ...METRICS, innerHeight: 802 })).toBe(false);
  });
});

describe("measureViewport", () => {
  it("recovers the offset the page actually applied", async () => {
    const page = fakePage({ topOffset: 62 });
    const viewport = await measureViewport(page.client, page.tap);
    expect(viewport.topOffset).toBe(62);
    expect(viewport.innerWidth).toBe(402);
    expect(viewport.innerHeight).toBe(714);
  });

  it("probes the middle of the screen, which is always inside the web viewport", async () => {
    const page = fakePage({ topOffset: 62 });
    await measureViewport(page.client, page.tap);
    expect(page.taps).toEqual([{ x: 201, y: 437 }]);
  });

  it("recovers the same offset when the page is scrolled", async () => {
    const page = fakePage({ topOffset: 62, scrollY: 1500 });
    expect((await measureViewport(page.client, page.tap)).topOffset).toBe(62);
  });

  it("removes the overlay and the listener afterwards", async () => {
    const page = fakePage({ topOffset: 62 });
    await measureViewport(page.client, page.tap);
    const cleanup = page.expressions[page.expressions.length - 1] ?? "";
    expect(cleanup).toContain("removeEventListener");
    expect(cleanup).toContain("remove()");
  });

  it("fails loudly when the calibration tap was never observed", async () => {
    const page = fakePage({ topOffset: 62, recordTouch: false });
    await expect(measureViewport(page.client, page.tap)).rejects.toBeInstanceOf(WebInspectorConnectionError);
  });

  it("refuses an offset that could not be real rather than returning it", async () => {
    // 400 would put the web viewport's top below the middle of the screen,
    // which contradicts innerHeight — a wrong offset taps the wrong element.
    const page = fakePage({ topOffset: 400 });
    await expect(measureViewport(page.client, page.tap)).rejects.toThrow(/offset/i);
  });

  it("refuses a negative offset", async () => {
    const page = fakePage({ topOffset: -20 });
    await expect(measureViewport(page.client, page.tap)).rejects.toThrow(/offset/i);
  });
});

describe("CalibrationStore", () => {
  function memoryStore() {
    const files = new Map<string, Buffer>();
    return new CalibrationStore("/tmp/fake/web-calibration.json", {
      read: async (path) => files.get(path) ?? null,
      write: async (path, data) => {
        files.set(path, data);
      },
    });
  }

  it("round-trips a record per serial", async () => {
    const store = memoryStore();
    await store.set("UDID-A", { topOffset: 62, signature: METRICS });
    await store.set("UDID-B", { topOffset: 47, signature: METRICS });

    expect(await store.get("UDID-A")).toEqual({ topOffset: 62, signature: METRICS });
    expect(await store.get("UDID-B")).toEqual({ topOffset: 47, signature: METRICS });
  });

  it("returns undefined for an unknown serial", async () => {
    expect(await memoryStore().get("nope")).toBeUndefined();
  });

  it("treats a malformed store file as empty rather than throwing", async () => {
    const store = new CalibrationStore("/tmp/fake/x.json", {
      read: async () => Buffer.from("{ not json"),
      write: async () => undefined,
    });
    expect(await store.get("UDID-A")).toBeUndefined();
  });
});

describe("resolveViewport", () => {
  function memoryStore() {
    const files = new Map<string, Buffer>();
    return new CalibrationStore("/tmp/fake/web-calibration.json", {
      read: async (path) => files.get(path) ?? null,
      write: async (path, data) => {
        files.set(path, data);
      },
    });
  }

  it("measures and caches on a cold start", async () => {
    const page = fakePage({ topOffset: 62 });
    const store = memoryStore();

    const viewport = await resolveViewport("UDID-A", page.client, page.tap, store);
    expect(viewport.topOffset).toBe(62);
    expect(page.taps).toHaveLength(1);
    expect(await store.get("UDID-A")).toEqual({ topOffset: 62, signature: METRICS });
  });

  it("reuses the cached offset without tapping again", async () => {
    const store = memoryStore();
    await store.set("UDID-A", { topOffset: 62, signature: METRICS });

    const page = fakePage({ topOffset: 62 });
    const viewport = await resolveViewport("UDID-A", page.client, page.tap, store);

    expect(viewport.topOffset).toBe(62);
    expect(page.taps).toEqual([]);
  });

  it("re-measures when the geometry changed under the cache (rotation, chrome change)", async () => {
    const store = memoryStore();
    await store.set("UDID-A", {
      topOffset: 999,
      signature: { innerWidth: 874, innerHeight: 340, screenWidth: 874, screenHeight: 402 },
    });

    const page = fakePage({ topOffset: 62 });
    const viewport = await resolveViewport("UDID-A", page.client, page.tap, store);

    expect(viewport.topOffset).toBe(62);
    expect(page.taps).toHaveLength(1);
    expect((await store.get("UDID-A"))?.topOffset).toBe(62);
  });

  it("keeps one device's calibration separate from another's", async () => {
    const store = memoryStore();
    await store.set("UDID-A", { topOffset: 62, signature: METRICS });

    const page = fakePage({ topOffset: 47 });
    await resolveViewport("UDID-B", page.client, page.tap, store);

    expect((await store.get("UDID-A"))?.topOffset).toBe(62);
    expect((await store.get("UDID-B"))?.topOffset).toBe(47);
  });

  it("still returns a viewport when the cache cannot be written", async () => {
    const store = new CalibrationStore("/tmp/fake/x.json", {
      read: async () => null,
      write: async () => {
        throw new Error("EROFS: read-only file system");
      },
    });
    const page = fakePage({ topOffset: 62 });
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(resolveViewport("UDID-A", page.client, page.tap, store)).resolves.toMatchObject({ topOffset: 62 });
    warn.mockRestore();
  });
});
