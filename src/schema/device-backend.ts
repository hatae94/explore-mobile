/**
 * Device-backend interface (REQ-ARCH-003) — the thin plug-in point through
 * which a future iOS/idb backend can replace the Android/adb backend
 * without redesign (spec.md §A.4 architecture layers).
 *
 * This SPEC (SPEC-ANDROID-001) defines the interface only. Concrete
 * implementations land in later milestones:
 *   - `AdbBackend` (adb subprocess wrapper) — M4/M5/M6, this SPEC.
 *   - An iOS/idb backend — SPEC-02 (spec.md §E roadmap), out of scope here.
 *
 * @MX:ANCHOR — invariant contract for backend substitution (REQ-ARCH-003).
 * @MX:REASON — every CLI command (M3) and the normalization layer depend on
 * this method surface; changing it ripples through every backend and the
 * command layer above it.
 */

import type { CommonElement } from "./common-element.js";

/** Device connection state as reported by the platform's device-listing tool. */
export type DeviceConnectionState = "device" | "offline" | "unauthorized";

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
   * Captures the current UI hierarchy as raw platform-native markup
   * (Android: uiautomator XML). The normalization layer (M2, this SPEC)
   * converts the raw string into {@link CommonElement}[] — normalization
   * is deliberately NOT a backend responsibility, so the same normalizer
   * can be reused across backends once each backend's raw format is mapped.
   */
  dumpUiHierarchy(serial: string): Promise<string>;

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
