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
 * 8-method surface.
 * @MX:REASON — every CLI command and the backend registry (`registry.ts`)
 * depend on this method surface; changing it ripples through every backend
 * and the command layer above it.
 */

import type { CommonElement } from "./common-element.js";

/** Device connection state as reported by the platform's device-listing tool. */
export type DeviceConnectionState = "device" | "offline" | "unauthorized";

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
}

// Re-exported so consumers of this module can reference the schema type
// alongside the backend interface without a second import.
export type { CommonElement };
