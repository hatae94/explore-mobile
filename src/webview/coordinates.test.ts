/**
 * M1 — web CSS-pixel to device-point conversion (REQ-WEB-ACT-005, AC-WEB-016).
 *
 * The fixtures in `MEASURED_CALIBRATION` are NOT invented: each row is a real
 * observation taken on iPhone 17 Pro / iOS 26.0 (UDID D0B3A18C-…) on
 * 2026-07-27, by covering the page with a transparent overlay, sending a
 * native `idb` tap at a known device point, and reading back the `pageY` the
 * page observed. See progress.md §E.2 M1 for the raw log.
 */

import { describe, expect, it } from "vitest";
import { deriveTopOffset, webRectToDevicePoint, type ViewportMetrics } from "./coordinates.js";

/** Real measurements: [deviceY sent, pageY observed, scrollY at the time]. */
const MEASURED_CALIBRATION: ReadonlyArray<readonly [number, number, number]> = [
  // scrollY = 0
  [150, 88, 0],
  [300, 238, 0],
  [500, 438, 0],
  [700, 638, 0],
  // scrollY = 1500 — the same taps after a real swipe gesture scrolled the page
  [150, 1588, 1500],
  [300, 1738, 1500],
  [500, 1938, 1500],
  [700, 2138, 1500],
];

const VIEWPORT: ViewportMetrics = { topOffset: 62, innerWidth: 402, innerHeight: 714 };

describe("deriveTopOffset", () => {
  it("recovers 62 from every real measurement, at both scroll positions", () => {
    const offsets = MEASURED_CALIBRATION.map(([deviceY, pageY, scrollY]) =>
      deriveTopOffset(deviceY, pageY, scrollY),
    );
    expect(offsets).toEqual([62, 62, 62, 62, 62, 62, 62, 62]);
  });

  it("is scroll-independent: the same viewport point yields the same offset at any scrollY", () => {
    expect(deriveTopOffset(300, 238, 0)).toBe(deriveTopOffset(300, 1738, 1500));
  });
});

describe("webRectToDevicePoint", () => {
  it("maps x 1:1 and shifts y by the measured top offset", () => {
    // A 100x40 element at viewport (50, 176) has center (100, 196).
    expect(webRectToDevicePoint({ x: 50, y: 176, w: 100, h: 40 }, VIEWPORT)).toEqual({
      x: 100,
      y: 258, // 196 + 62
    });
  });

  it("round-trips the calibration: a rect centered at viewport y maps back to the device y measured", () => {
    // deviceY 500 was observed as viewport y 438 (pageY 438, scrollY 0).
    expect(webRectToDevicePoint({ x: 240, y: 428, w: 20, h: 20 }, VIEWPORT)?.y).toBe(500);
  });

  it("rounds fractional centers to whole device points, matching elementCenter", () => {
    expect(webRectToDevicePoint({ x: 0, y: 0, w: 15, h: 15 }, VIEWPORT)).toEqual({
      x: 8, // round(7.5)
      y: 70, // round(7.5) + 62
    });
  });

  it("applies no y shift when the top offset is zero", () => {
    const noChrome: ViewportMetrics = { ...VIEWPORT, topOffset: 0 };
    expect(webRectToDevicePoint({ x: 10, y: 10, w: 20, h: 20 }, noChrome)).toEqual({ x: 20, y: 20 });
  });

  it("returns null for a zero-size element (invisible — AC-WEB-010's 0x0 links)", () => {
    expect(webRectToDevicePoint({ x: 100, y: 100, w: 0, h: 0 }, VIEWPORT)).toBeNull();
    expect(webRectToDevicePoint({ x: 100, y: 100, w: 50, h: 0 }, VIEWPORT)).toBeNull();
    expect(webRectToDevicePoint({ x: 100, y: 100, w: 0, h: 50 }, VIEWPORT)).toBeNull();
  });

  it("returns null for a negative-size rect rather than inventing a point", () => {
    expect(webRectToDevicePoint({ x: 100, y: 100, w: -10, h: 20 }, VIEWPORT)).toBeNull();
  });

  it("returns null when the element's center sits above the viewport (scrolled out)", () => {
    // Center y = -30: the element is above the fold.
    expect(webRectToDevicePoint({ x: 100, y: -50, w: 40, h: 40 }, VIEWPORT)).toBeNull();
  });

  it("returns null when the element's center sits below the viewport", () => {
    // innerHeight is 714; center y = 800.
    expect(webRectToDevicePoint({ x: 100, y: 780, w: 40, h: 40 }, VIEWPORT)).toBeNull();
  });

  it("returns null when the element's center sits outside horizontally", () => {
    // innerWidth is 402; center x = 500.
    expect(webRectToDevicePoint({ x: 480, y: 100, w: 40, h: 40 }, VIEWPORT)).toBeNull();
    expect(webRectToDevicePoint({ x: -60, y: 100, w: 40, h: 40 }, VIEWPORT)).toBeNull();
  });

  it("converts a partially-offscreen element whose center is still inside", () => {
    // Top half is cut off, but the center (y = 10) is on screen.
    expect(webRectToDevicePoint({ x: 100, y: -30, w: 40, h: 80 }, VIEWPORT)).toEqual({
      x: 120,
      y: 72, // 10 + 62
    });
  });

  it("accepts an element flush against the viewport edges", () => {
    expect(webRectToDevicePoint({ x: 0, y: 0, w: 804, h: 1428 }, VIEWPORT)).toEqual({
      x: 402, // center == innerWidth, still in range
      y: 776, // 714 + 62
    });
  });
});
