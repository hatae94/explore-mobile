/**
 * Web CSS-pixel to device-point conversion (REQ-WEB-ACT-005, AC-WEB-016).
 *
 * Pure functions only — no device, no subprocess, no I/O — matching the
 * `normalize/*` and `element-query.ts` contract so the conversion rule is
 * unit-testable from fixtures alone.
 *
 * @MX:NOTE — the top-chrome offset is deliberately NOT a constant in this
 * file. It arrives as `ViewportMetrics.topOffset`, measured at runtime by
 * the calibration described below. Baking in the observed 62 would repeat
 * SPEC-IOS-001's failure mode: 62 is the status-bar height of ONE device
 * (iPhone 17 Pro), not a property of iOS, and a device with a different
 * status bar would silently tap the wrong place.
 *
 * How the offset is obtained (measured 2026-07-27, iPhone 17 Pro / iOS 26.0):
 *   1. Cover the page with a transparent full-viewport overlay so the
 *      calibration tap cannot reach any real page element.
 *   2. Send a native tap at a known device point.
 *   3. Read back the `pageY` the page observed (via a `document`-level
 *      capture listener — a listener bound to the overlay element itself
 *      does NOT fire on iOS Safari, verified during M1).
 *   4. offset = deviceY - (pageY - scrollY)  →  {@link deriveTopOffset}
 *
 * Across 8 measurements (device y ∈ {150, 300, 500, 700} × scrollY ∈
 * {0, 1500}) the offset was 62 with zero variance, so it is stable for a
 * given device/browser-chrome state and can be cached per session — but it
 * is still measured, never assumed. Raw log: progress.md §E.2 M1.
 *
 * Why `pageY - scrollY` rather than the touch's `clientY`: on this Safari,
 * `Touch.clientY` was observed reporting page-relative values once the page
 * was scrolled (deviceY 500 at scrollY 1200 reported clientY 1638.5), so
 * `clientY` is not trustworthy here. `pageY - scrollY` reproduced the
 * correct viewport coordinate in every measurement.
 */

/** A `getBoundingClientRect()` result: viewport-relative CSS pixels. */
export interface WebRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Live viewport metrics read from the page at conversion time. */
export interface ViewportMetrics {
  /** Device points between the top of the screen and the top of the web viewport. Measured — see the module comment. */
  topOffset: number;
  /** `window.innerWidth`. On iOS the CSS pixel maps 1:1 to a device point, so this is also the usable device width. */
  innerWidth: number;
  /** `window.innerHeight`. */
  innerHeight: number;
}

/** A tap target in device points, ready to hand to `DeviceBackend.tap`. */
export interface DevicePoint {
  x: number;
  y: number;
}

/**
 * Recovers the top-chrome offset from one calibration observation.
 *
 * `pageY - scrollY` converts the page-relative coordinate the touch
 * reported back into a viewport-relative one; the remainder is the chrome
 * above the web viewport.
 */
export function deriveTopOffset(deviceY: number, pageY: number, scrollY: number): number {
  return deviceY - (pageY - scrollY);
}

/**
 * Converts an element's viewport rectangle to the device point at its
 * center, or `null` when a native tap cannot legitimately reach it.
 *
 * `null` is the signal for the JS `click()` fallback (REQ-WEB-ACT-002) —
 * the caller must report which path it took rather than switching
 * silently. Returning a coordinate we cannot stand behind would be worse
 * than returning nothing: it taps some other element.
 *
 * Rejected as unreachable:
 *   - zero- or negative-size rects (invisible; AC-WEB-010 saw many such
 *     links on naver.com)
 *   - centers outside the viewport (scrolled out of view, or off-screen) —
 *     scrolling them into view is SPEC-04 territory, out of scope here
 */
export function webRectToDevicePoint(rect: WebRect, viewport: ViewportMetrics): DevicePoint | null {
  if (rect.w <= 0 || rect.h <= 0) return null;

  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;

  if (centerX < 0 || centerX > viewport.innerWidth) return null;
  if (centerY < 0 || centerY > viewport.innerHeight) return null;

  return {
    x: Math.round(centerX),
    y: Math.round(centerY + viewport.topOffset),
  };
}
