/**
 * Device-backend interface (REQ-ARCH-003) — the thin plug-in point through
 * which the iOS backend replaces the Android/adb backend without redesign
 * (spec.md §A.4 architecture layers).
 *
 * SPEC-ANDROID-001 defined the interface and its Android implementation
 * (`AdbBackend`). SPEC-IOS-001 fulfilled the original promise with an iOS
 * implementation of this SAME interface, unchanged in shape
 * (REQ-IOS-ARCH-005 — thin/swappable), plus the additive
 * `DeviceInfo.platform` field. SPEC-VISION-001 M3 then swapped that iOS
 * implementation for `WdaBackend` (WebDriverAgent HTTP) **without touching
 * this interface** — the strongest evidence so far that the plug-in point
 * is thin enough to be worth its existence.
 *
 * **SPEC-VISION-001 M2 (REQ-VISION-002) removed the UI-tree dump method** —
 * that read path and the `--id`/`--text` selectors above it are gone. The
 * screen is read through `screenshot()` alone, and the only screen-shaped
 * query left is `getScreenSize()` (M1's additive method), which asks the
 * platform directly instead of deriving two numbers from a full element
 * tree. This is the first NON-additive change to the surface.
 *
 * @MX:ANCHOR — invariant contract for backend substitution (REQ-ARCH-003,
 * REQ-IOS-ARCH-005). Both `AdbBackend` and `WdaBackend` implement this exact
 * 10-method surface (SPEC-GESTURE-001 M1 added `swipe`, M8 added
 * `getMinEffectiveSwipeThreshold`, SPEC-VISION-001 M1 added `getScreenSize`
 * and M2 removed the UI-tree dump method).
 * @MX:REASON — every CLI command and the backend registry (`registry.ts`)
 * depend on this method surface; changing it ripples through every backend
 * and the command layer above it.
 */

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
 * regardless of backend. Each backend is responsible for converting to its
 * own tool's unit internally; both current backends happen to take
 * milliseconds already (`adb shell input swipe`'s duration argument, and
 * the W3C actions `pause`/`pointerMove` duration `WdaBackend` sends), so
 * neither converts today. **The contract is still "the caller always passes
 * ms"** — a future backend on a seconds-based tool converts inside itself,
 * never by changing this field's meaning (spec.md §C.1-⑦; a seconds/ms
 * mix-up is the exact defect SPEC-GESTURE-001 was written to close).
 * Omit to use the platform default duration.
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
 * device and never re-measured (`"measured-constant"`, `WdaBackend` —
 * 11pt measured on one iPhone 17 Pro simulator, spec.md §C.1-⑭; SPEC-VISION-001
 * M3 scales that constant into screenshot pixels but does NOT re-measure it,
 * so the basis stays `"measured-constant"`). A caller
 * receiving a `minValidRatio` (e.g. in the `AMOUNT_TOO_SMALL` error
 * payload) can use this to tell whether the value came from its OWN device
 * or from somewhere else entirely (spec.md §C.1-⑰ — the exact defect this
 * SPEC exists to prevent: "a wrong number and a right number looking
 * identical").
 */
export type SwipeThresholdBasis = "device-query" | "measured-constant";

/**
 * The minimum swipe distance — device pixels, the SAME coordinate system
 * as `swipe()`'s `SwipePoint` — that reliably
 * moves a device's screen (REQ-GEST-SCROLL-007/008, SPEC-GESTURE-001 M8).
 */
export interface SwipeThreshold {
  minEffectiveSwipePx: number;
  basis: SwipeThresholdBasis;
}

/**
 * A device's screen size in device pixels — the SAME coordinate system as
 * `swipe()`'s `SwipePoint` and `tap()`'s `x`/`y` (REQ-VISION-001,
 * SPEC-VISION-001 M1).
 *
 * Relocated here from `cli/commands/scroll-geometry.ts`, where it was
 * defined back when screen size was DERIVED from a UI-hierarchy dump. It is
 * now a value the backend supplies directly, so the type belongs with the
 * interface that supplies it. `scroll-geometry.ts` re-exports it so its
 * existing importers are unaffected.
 */
export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Which backend owns a device (REQ-IOS-SCHEMA-001, SPEC-IOS-001) — set by
 * each backend's `listDevices()` (`AdbBackend` -> `"android"`, `WdaBackend`
 * -> `"ios"`) and consumed by the backend registry (`registry.ts`) to route
 * `--device <serial>` to the owning backend without the user specifying a
 * platform.
 */
export type DevicePlatform = "android" | "ios";

/** One connected device, as reported by `devices` (REQ-DEVICES-001/002). */
export interface DeviceInfo {
  /** Device serial / unique identifier (adb serial, iOS hardware UDID). */
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
 * async because every real implementation reaches an external system —
 * a subprocess (`adb`, `xcrun devicectl`) or an HTTP agent on the device
 * (WebDriverAgent).
 *
 * Two concrete implementations exist: `AdbBackend` (Android) and
 * `WdaBackend` (iOS). The original wording here — "design-time contract
 * only, no concrete class implements it yet" — dated from
 * SPEC-ANDROID-001's authoring and is no longer true.
 */
export interface DeviceBackend {
  /** Lists all devices currently visible to the backend. */
  listDevices(): Promise<DeviceInfo[]>;

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
   * would force the iOS backend to fabricate a `dp × density` rule for a
   * value (iOS's 11pt) that was never measured that way, inventing an
   * unmeasured iOS platform rule (spec.md §A.3 D3 운용 주석 보강, §D). Each
   * backend answers in its OWN way: `AdbBackend` queries `wm density` on
   * THIS device at call time and derives `8dp × density` plus a safety
   * margin; `WdaBackend` starts from a constant measured on a DIFFERENT
   * device (11pt) and only converts it into this device's coordinate system
   * — it queries the device for the SCALE, never for the threshold itself.
   *
   * `SwipeThreshold.basis` distinguishes the two so neither's value can
   * silently pass for the other's. Note the iOS side stays
   * `"measured-constant"` even though a query happens: what `basis`
   * reports is where the NUMBER came from, not whether any device call was
   * made. Re-labelling it `"device-query"` because a scale lookup occurs
   * would tell the caller this device was asked how far it needs to move —
   * which it never was.
   */
  getMinEffectiveSwipeThreshold(serial: string): Promise<SwipeThreshold>;

  /**
   * Returns this device's screen size in device pixels (REQ-VISION-001,
   * SPEC-VISION-001 M1). This is the screen-size SOURCE: before M1, `scroll`
   * asked for the whole UI element tree and derived the size from the
   * returned element bounds, which made a full UI-hierarchy dump a
   * prerequisite for a gesture that needs nothing but a width and a height.
   * M2 then removed that tree-read method outright (REQ-VISION-002), leaving
   * this as the only screen-shaped query on the interface.
   *
   * Returns `undefined` — never a guessed size — when the backend's own
   * screen-size source answers but is unparseable; the command layer
   * surfaces that as `SCREEN_SIZE_UNKNOWN`, the pre-existing error contract
   * previously produced by `deriveScreenSize()` returning `undefined`. A
   * FAILING query (dead device, non-zero exit) throws instead and surfaces
   * as `BACKEND_COMMAND_FAILED`. The two are deliberately distinct: "the
   * tool could not answer" and "the tool answered something we cannot read"
   * are different facts, and a caller that cannot tell them apart cannot
   * know whether retrying is worthwhile.
   */
  getScreenSize(serial: string): Promise<ScreenSize | undefined>;
}

// Re-exported so consumers of this module can reference the schema type
// alongside the backend interface without a second import. The interface
// itself no longer traffics in `CommonElement` (SPEC-VISION-001 M2 removed
// the UI-tree method); the re-export is kept because `--web` still uses the
// schema (spec.md §C.3, AC-VISION-011) and dropping it would be a breaking
// change outside this SPEC's scope.
export type { CommonElement } from "./common-element.js";
