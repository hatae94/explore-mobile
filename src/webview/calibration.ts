/**
 * Runtime viewport calibration (REQ-WEB-ACT-005).
 *
 * Converting a web rectangle to a device point needs the height of the
 * browser chrome above the web viewport. That number is MEASURED here rather
 * than hardcoded: the 62pt observed on iPhone 17 Pro is that device's status
 * bar, not a property of iOS, and baking it in would tap the wrong place on
 * any device with a different one (progress.md §E.2 M1).
 *
 * How the measurement works, and why it is harmless:
 *   1. A transparent full-viewport overlay is placed over the page, so the
 *      calibration tap cannot reach any real element.
 *   2. A native tap is sent to the middle of the SCREEN — always inside the
 *      web viewport, since chrome never occupies half the display.
 *   3. The page reports where it saw the touch; the difference is the offset.
 *   4. Overlay and listener are removed.
 *
 * @MX:WARN — the listener is bound to `document` in the capture phase, NOT to
 * the overlay element.
 * @MX:REASON — a listener bound to the overlay never fires on iOS Safari
 * (verified during M1); binding it to the overlay would make calibration
 * silently time out.
 *
 * The result is cached per device and re-measured whenever the page geometry
 * changes (rotation, chrome resize), so a stale offset cannot survive a layout
 * change unnoticed.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveApkCacheDir } from "../backend/apk-downloader.js";
import type { ViewportMetrics } from "./coordinates.js";
import { deriveTopOffset } from "./coordinates.js";
import type { WebInspectorClient } from "./inspector-client.js";
import { WebInspectorConnectionError } from "./webkit-errors.js";

/** Page geometry used both to place the probe tap and to detect a stale cache. */
export interface PageMetrics {
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
}

/** What the page observed for the calibration tap. */
interface TouchRecord {
  pageX: number;
  pageY: number;
  scrollY: number;
}

/** One device's cached calibration, valid only while the geometry it was taken under still holds. */
export interface CalibrationRecord {
  topOffset: number;
  signature: PageMetrics;
}

/** Only the part of the client calibration needs, so tests can pass a fake page. */
type Evaluator = Pick<WebInspectorClient, "evaluate">;

/** Sends a native tap at a device point — the existing `DeviceBackend.tap`, bound to a serial. */
export type NativeTap = (x: number, y: number) => Promise<void>;

const CALIBRATION_MARKER = "data-explore-mobile-calibration";
const STORE_FILENAME = "web-calibration.json";

/** Reads page geometry only — no overlay, no listener. Used to decide whether a cached calibration still applies. */
const GEOMETRY_PROBE = `(function(){
  var W = window;
  return {
    innerWidth: W.innerWidth,
    innerHeight: W.innerHeight,
    screenWidth: W.screen.width,
    screenHeight: W.screen.height
  };
})()`;

/** Installs the overlay + capture listener and reports the page's geometry. */
const INSTALL_PROBE = `(function(){
  var W = window;
  W.__exploreMobileCalibration = null;
  if (W.__exploreMobileCalibrationHandler) {
    document.removeEventListener("touchstart", W.__exploreMobileCalibrationHandler, true);
  }
  W.__exploreMobileCalibrationHandler = function (e) {
    var t = e.touches[0];
    if (!t) return;
    W.__exploreMobileCalibration = { pageX: t.pageX, pageY: t.pageY, scrollY: W.scrollY };
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener("touchstart", W.__exploreMobileCalibrationHandler, { capture: true, passive: false });
  var stale = document.querySelectorAll("[${CALIBRATION_MARKER}]");
  for (var i = 0; i < stale.length; i++) stale[i].remove();
  var overlay = document.createElement("div");
  overlay.setAttribute("${CALIBRATION_MARKER}", "1");
  overlay.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:transparent";
  document.documentElement.appendChild(overlay);
  return {
    innerWidth: W.innerWidth,
    innerHeight: W.innerHeight,
    screenWidth: W.screen.width,
    screenHeight: W.screen.height
  };
})()`;

/**
 * Reads the recorded touch and tears the probe down in one round trip.
 *
 * Overlays are removed by attribute, never by id: an element id becomes a
 * global of the same name, which shadowed the recorded value during M1, and
 * `getElementById` removes only the first of any duplicates.
 */
const READ_AND_CLEANUP_PROBE = `(function(){
  var W = window;
  var record = W.__exploreMobileCalibration;
  if (W.__exploreMobileCalibrationHandler) {
    document.removeEventListener("touchstart", W.__exploreMobileCalibrationHandler, true);
    W.__exploreMobileCalibrationHandler = null;
  }
  var overlays = document.querySelectorAll("[${CALIBRATION_MARKER}]");
  for (var i = 0; i < overlays.length; i++) overlays[i].remove();
  W.__exploreMobileCalibration = null;
  return record;
})()`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePageMetrics(value: unknown): PageMetrics | null {
  if (!isRecord(value)) return null;
  const innerWidth = readNumber(value, "innerWidth");
  const innerHeight = readNumber(value, "innerHeight");
  const screenWidth = readNumber(value, "screenWidth");
  const screenHeight = readNumber(value, "screenHeight");
  if (innerWidth === null || innerHeight === null || screenWidth === null || screenHeight === null) return null;
  return { innerWidth, innerHeight, screenWidth, screenHeight };
}

function parseTouchRecord(value: unknown): TouchRecord | null {
  if (!isRecord(value)) return null;
  const pageX = readNumber(value, "pageX");
  const pageY = readNumber(value, "pageY");
  const scrollY = readNumber(value, "scrollY");
  if (pageX === null || pageY === null || scrollY === null) return null;
  return { pageX, pageY, scrollY };
}

/** True when two geometries are the same, i.e. a cached offset taken under one still applies to the other. */
export function sameViewportSignature(a: PageMetrics, b: PageMetrics): boolean {
  return (
    a.innerWidth === b.innerWidth &&
    a.innerHeight === b.innerHeight &&
    a.screenWidth === b.screenWidth &&
    a.screenHeight === b.screenHeight
  );
}

/**
 * Measures the top-chrome offset by tapping through a transparent overlay.
 *
 * Throws rather than returning a value it cannot stand behind: an offset
 * outside `[0, screenHeight - innerHeight]` contradicts the page's own
 * geometry, and acting on it would tap some unrelated element.
 */
export async function measureViewport(
  client: Evaluator,
  tap: NativeTap,
): Promise<ViewportMetrics & { signature: PageMetrics }> {
  const metrics = parsePageMetrics(await client.evaluate(INSTALL_PROBE));
  if (metrics === null) {
    throw new WebInspectorConnectionError("The page did not report its viewport geometry; cannot calibrate.");
  }

  // The middle of the screen is inside the web viewport for any chrome that
  // occupies less than half the display, which is always the case.
  const probeX = Math.round(metrics.screenWidth / 2);
  const probeY = Math.round(metrics.screenHeight / 2);
  await tap(probeX, probeY);

  const touch = parseTouchRecord(await client.evaluate(READ_AND_CLEANUP_PROBE));
  if (touch === null) {
    throw new WebInspectorConnectionError(
      `The calibration tap at (${probeX}, ${probeY}) was never observed by the page; cannot calibrate the web viewport.`,
    );
  }

  const topOffset = deriveTopOffset(probeY, touch.pageY, touch.scrollY);
  const maxPlausible = metrics.screenHeight - metrics.innerHeight;
  if (topOffset < 0 || topOffset > maxPlausible) {
    throw new WebInspectorConnectionError(
      `Measured a top-chrome offset of ${topOffset}pt, which is outside the plausible range 0..${maxPlausible}pt for this page. Refusing to tap on it.`,
    );
  }

  return {
    topOffset,
    innerWidth: metrics.innerWidth,
    innerHeight: metrics.innerHeight,
    signature: metrics,
  };
}

export interface CalibrationStoreIO {
  read: (path: string) => Promise<Buffer | null>;
  write: (path: string, data: Buffer) => Promise<void>;
}

const defaultIO: CalibrationStoreIO = {
  async read(path) {
    try {
      return await readFile(path);
    } catch {
      // Absent file is the normal cold-start state, not a failure.
      return null;
    }
  },
  async write(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
};

/** `<cache-dir>/web-calibration.json`, sharing the cache directory `ime-session-store.ts` uses. */
export function resolveCalibrationStorePath(): string {
  return join(resolveApkCacheDir(), STORE_FILENAME);
}

/**
 * Disk-backed per-device calibration cache, mirroring `ImeSessionStore`:
 * each CLI invocation is a separate process, so an in-memory cache would
 * never be reused.
 */
export class CalibrationStore {
  constructor(
    private readonly storePath: string = resolveCalibrationStorePath(),
    private readonly io: CalibrationStoreIO = defaultIO,
  ) {}

  private async readAll(): Promise<Record<string, CalibrationRecord>> {
    const raw = await this.io.read(this.storePath);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw.toString("utf-8"));
      return isRecord(parsed) && !Array.isArray(parsed) ? (parsed as Record<string, CalibrationRecord>) : {};
    } catch {
      // Malformed file (partial write, hand edit) — treat as no cache.
      return {};
    }
  }

  async get(serial: string): Promise<CalibrationRecord | undefined> {
    return (await this.readAll())[serial];
  }

  async set(serial: string, record: CalibrationRecord): Promise<void> {
    const all = await this.readAll();
    all[serial] = record;
    await this.io.write(this.storePath, Buffer.from(JSON.stringify(all, null, 2), "utf-8"));
  }
}

/**
 * Returns the viewport metrics for `serial`, measuring only when needed.
 *
 * The cached offset is reused only while the page geometry matches the one it
 * was measured under; a rotation or a chrome-height change invalidates it and
 * triggers a fresh measurement, so a stale offset cannot silently mis-aim a
 * tap.
 */
export async function resolveViewport(
  serial: string,
  client: Evaluator,
  tap: NativeTap,
  store: CalibrationStore = new CalibrationStore(),
): Promise<ViewportMetrics> {
  const current = parsePageMetrics(await client.evaluate(GEOMETRY_PROBE));
  if (current === null) {
    throw new WebInspectorConnectionError("The page did not report its viewport geometry; cannot calibrate.");
  }

  const cached = await store.get(serial);
  if (cached !== undefined && sameViewportSignature(cached.signature, current)) {
    // The common path: nothing is injected into the page and no tap is sent.
    return { topOffset: cached.topOffset, innerWidth: current.innerWidth, innerHeight: current.innerHeight };
  }

  const measured = await measureViewport(client, tap);

  try {
    await store.set(serial, { topOffset: measured.topOffset, signature: measured.signature });
  } catch (err) {
    // A cache we cannot persist costs a re-measure next time; it must not
    // fail the command the user actually asked for.
    console.error(
      `[explore-mobile] could not persist web calibration for ${serial}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { topOffset: measured.topOffset, innerWidth: measured.innerWidth, innerHeight: measured.innerHeight };
}
