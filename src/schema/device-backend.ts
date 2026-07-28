/**
 * Device-backend interface (REQ-ARCH-003) — the thin plug-in point through
 * which the iOS/idb backend replaces the Android/adb backend without
 * redesign (spec.md §A.4 architecture layers).
 *
 * SPEC-ANDROID-001 defined the interface and its Android implementation
 * (`AdbBackend`). SPEC-IOS-001 fulfills the original promise: `IdbBackend`
 * implements this SAME interface unchanged in shape (REQ-IOS-ARCH-005 —
 * thin/swappable), plus two additive/relocated changes: `DeviceInfo.platform`
 * (additive) and `dumpUiHierarchy`'s return type moving from raw string to
 * normalized `CommonElement[]` (REQ-IOS-SCHEMA-002 — normalization ownership
 * moves INTO each backend).
 *
 * @MX:ANCHOR — invariant contract for backend substitution (REQ-ARCH-003,
 * REQ-IOS-ARCH-005). Both `AdbBackend` and `IdbBackend` implement this exact
 * 10-method surface (SPEC-GESTURE-001 M1 added `swipe`, M8 added
 * `getMinEffectiveSwipeThreshold` — both additive only, the pre-existing
 * methods are unchanged in shape/behavior).
 * @MX:REASON — every CLI command and the backend registry (`registry.ts`)
 * depend on this method surface; changing it ripples through every backend
 * and the command layer above it.
 */

import type { CommonElement } from "./common-element.js";

/** Device connection state as reported by the platform's device-listing tool. */
export type DeviceConnectionState = "device" | "offline" | "unauthorized";

/**
 * A device-pixel coordinate for a gesture endpoint (REQ-GEST-SWIPE-001,
 * SPEC-GESTURE-001). Shared by `swipe`'s `from`/`to` parameters.
 */
export interface SwipePoint {
  x: number;
  y: number;
}

/**
 * Optional `swipe` parameters (REQ-GEST-SWIPE-002, SPEC-GESTURE-001).
 *
 * `durationMs` is expressed in the CLI's contract unit — milliseconds —
 * regardless of backend. Each backend converts to its own tool's unit
 * internally: `AdbBackend` passes ms straight through (`adb shell input
 * swipe`'s duration argument is already ms); `IdbBackend` converts ms to
 * seconds (float) before building argv, because `idb`'s `--duration` is
 * seconds (spec.md §C.1-⑦). Omit to use the platform default duration.
 */
export interface SwipeOptions {
  durationMs?: number;
}

/**
 * How a device's swipe-movement threshold was determined
 * (REQ-GEST-SCROLL-008, SPEC-GESTURE-001 M8). The two backends answer the
 * SAME domain question — "what is the minimum swipe distance that reliably
 * moves this device's screen?" — in fundamentally different ways, and a
 * bare number cannot distinguish them: a value derived from a live query of
 * THIS device (`"device-query"`, `AdbBackend` — `wm density`) is a
 * different kind of evidence than a constant measured on a DIFFERENT
 * device and never re-queried (`"measured-constant"`, `IdbBackend` —
 * 11pt measured on one iPhone 17 Pro simulator, spec.md §C.1-⑭). A caller
 * receiving a `minValidRatio` (e.g. in the `AMOUNT_TOO_SMALL` error
 * payload) can use this to tell whether the value came from its OWN device
 * or from somewhere else entirely (spec.md §C.1-⑰ — the exact defect this
 * SPEC exists to prevent: "a wrong number and a right number looking
 * identical").
 */
export type SwipeThresholdBasis = "device-query" | "measured-constant";

/**
 * The minimum swipe distance — device pixels, the SAME coordinate system
 * as `swipe()`'s `SwipePoint`/`dumpUiHierarchy()`'s bounds — that reliably
 * moves a device's screen (REQ-GEST-SCROLL-007/008, SPEC-GESTURE-001 M8).
 */
export interface SwipeThreshold {
  minEffectiveSwipePx: number;
  basis: SwipeThresholdBasis;
}

/**
 * Which backend owns a device (REQ-IOS-SCHEMA-001, SPEC-IOS-001) — set by
 * each backend's `listDevices()` (`AdbBackend` -> `"android"`, `IdbBackend`
 * -> `"ios"`) and consumed by the backend registry (`registry.ts`) to route
 * `--device <serial>` to the owning backend without the user specifying a
 * platform.
 */
export type DevicePlatform = "android" | "ios";

/** One connected device, as reported by `devices` (REQ-DEVICES-001/002). */
export interface DeviceInfo {
  /** Device serial / unique identifier (adb serial, idb udid). */
  serial: string;
  /** Human-readable model name. */
  model: string;
  /** Platform OS version string. */
  osVersion: string;
  /** Current connection state. */
  connectionState: DeviceConnectionState;
  /** True for an emulator/simulator, false for a physical device. */
  isEmulator: boolean;
  /** Which backend owns this device (REQ-IOS-SCHEMA-001, additive field). */
  platform: DevicePlatform;
}

/**
 * Thin abstraction over a platform's device-control primitives.
 *
 * Method names mirror the CLI command surface planned for M3
 * (`doctor`/`devices`/`launch`/`stop`/`screenshot`/`tap`/`text`/`key`/`dump`)
 * so that a backend swap requires no interface change. All methods are
 * async because every real implementation shells out to an external tool
 * (adb, idb) or streams device I/O.
 *
 * NOTE: this interface is a design-time contract only in this SPEC. No
 * concrete class implements it yet — that is M4+ scope (adb subprocess
 * wrapper) and SPEC-02 scope (iOS/idb backend).
 */
export interface DeviceBackend {
  /** Lists all devices currently visible to the backend. */
  listDevices(): Promise<DeviceInfo[]>;

  /**
   * Captures the current UI hierarchy and returns it already normalized to
   * the common element schema (REQ-IOS-SCHEMA-002, SPEC-IOS-001 — revises
   * the original SPEC-ANDROID-001 design). Each backend owns normalization
   * of its own raw platform format INTERNALLY: `AdbBackend` collects
   * uiautomator XML and calls `normalizeUiAutomatorXml` before returning;
   * `IdbBackend` collects idb's `describe-all` JSON and calls
   * `normalizeIdbAccessibility` before returning. The command layer
   * (`dump.ts`/`tap.ts`/`text.ts`) never sees a raw platform format and is
   * therefore platform-agnostic — this is what lets element-selector
   * tap/text work on iOS with zero command-layer changes.
   */
  dumpUiHierarchy(serial: string): Promise<CommonElement[]>;

  /** Captures a screenshot as raw PNG bytes (REQ-SCREENSHOT-001/002). */
  screenshot(serial: string): Promise<Uint8Array>;

  /** Taps the given device-pixel coordinate (REQ-INPUT-001). */
  tap(serial: string, x: number, y: number): Promise<void>;

  /**
   * Types text into the currently focused input (REQ-INPUT-002/003).
   *
   * `options.hideKeyboardAfter` (default true) best-effort dismisses the
   * soft keyboard after sending, so the app's keyboard-avoiding layout
   * re-triggers on real devices — pass `false` (CLI: `--keep-keyboard`)
   * to leave the keyboard open.
   */
  inputText(serial: string, text: string, options?: { hideKeyboardAfter?: boolean }): Promise<void>;

  /** Sends a named key event, e.g. "back", "home" (REQ-INPUT-005). */
  sendKeyEvent(serial: string, keyName: string): Promise<void>;

  /** Starts the given app package/bundle (REQ-APP-001). */
  launchApp(serial: string, packageId: string): Promise<void>;

  /** Force-stops the given app package/bundle (REQ-APP-002). */
  stopApp(serial: string, packageId: string): Promise<void>;

  /**
   * Sends a swipe/drag gesture from `from` to `to` (REQ-GEST-SWIPE-001,
   * SPEC-GESTURE-001 M1 — additive 9th method, the original 8 are
   * unchanged). `options.durationMs` is always in milliseconds (the CLI's
   * single contract unit); each implementation converts to its own tool's
   * unit — see `SwipeOptions`.
   */
  swipe(serial: string, from: SwipePoint, to: SwipePoint, options?: SwipeOptions): Promise<void>;

  /**
   * Returns the minimum swipe distance (device pixels) that reliably moves
   * this device's screen (REQ-GEST-SCROLL-007/008, SPEC-GESTURE-001 M8 —
   * additive 10th method, the original 9 are unchanged). This interface
   * asks the DOMAIN question ("what distance moves THIS device's screen?"),
   * never "what is this device's density" — exposing a density accessor
   * would force `IdbBackend` to fabricate a `dp × density` rule for a value
   * (iOS's 11pt) that was never measured that way, inventing an unmeasured
   * iOS platform rule (spec.md §A.3 D3 운용 주석 보강, §D). Each backend
   * answers in its OWN way: `AdbBackend` queries `wm density` on THIS
   * device at call time and derives `8dp × density` plus a safety margin;
   * `IdbBackend` returns a measured constant (11pt, measured on a
   * DIFFERENT device) with NO device query at all. `SwipeThreshold.basis`
   * distinguishes the two so neither's value can silently pass for the
   * other's.
   */
  getMinEffectiveSwipeThreshold(serial: string): Promise<SwipeThreshold>;
}

// Re-exported so consumers of this module can reference the schema type
// alongside the backend interface without a second import.
export type { CommonElement };
