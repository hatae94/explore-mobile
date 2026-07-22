/**
 * `IdbBackend` — the SPEC-IOS-001 concrete `DeviceBackend` (SPEC-ANDROID-001
 * M1 interface) implementation, wrapping `idb` subprocess calls to control
 * iOS Simulators. Implements all 8 methods (REQ-IOS-BACKEND-001), proving
 * the interface is thin enough to be backend-swappable exactly as
 * SPEC-ANDROID-001 designed it to be (REQ-IOS-ARCH-005).
 *
 * Every idb command's exact argv/output shape below follows design.md §B;
 * three shapes are explicitly DEFERRED to Run-phase real-simulator
 * confirmation (plan.md §B.0 gate decision — DEFER, not an open question):
 * `list-targets --json` field names, the `--udid` target flag + describe-
 * all/screenshot argument shape, and `ui key`'s HID code interpretation.
 * A mismatch in any of these only requires adjusting this class's argv
 * construction / field parsing — the `DeviceBackend` interface and the
 * command layer above it are unaffected (isolation is the point).
 *
 * @MX:ANCHOR — this is SPEC-IOS-001's iOS implementation of the
 * device-backend interface contract (spec.md §A.4, REQ-ARCH-003,
 * REQ-IOS-ARCH-005). Every CLI command that targets an iOS device depends
 * on this class's method surface staying compatible with `DeviceBackend`.
 * @MX:REASON — `AdbBackend` is the reference implementation this class
 * must match structurally; both implement the exact same 8-method
 * interface so the backend registry (`registry.ts`) can swap between them
 * transparently.
 */

import type { CommonElement } from "../schema/common-element.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { isKeyAlias, type KeyAlias } from "../schema/key-alias.js";
import type { IdbExecResult, IdbExecutor } from "./idb-executor.js";
import { spawnIdb } from "./idb-executor.js";
import { IdbCommandFailedError, UnsupportedKeyOnIosError } from "./idb-errors.js";
import { IOS_HID_KEYCODE } from "./keycodes-ios.js";
import { normalizeIdbAccessibility } from "../normalize/idb.js";

/** One raw `idb list-targets --json` target entry (research.md §3.1 — assumed field names, run-phase DEFER). */
interface RawIdbTarget {
  udid?: unknown;
  name?: unknown;
  os_version?: unknown;
  state?: unknown;
  target_type?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Maps an idb simulator `state` string to the shared `DeviceConnectionState`
 * enum (Android-originated, but generalizes: "actively usable" -> "device",
 * anything else -> "offline"). A booted simulator is the iOS equivalent of
 * an Android device in the "device" state.
 */
function mapConnectionState(state: unknown): DeviceInfo["connectionState"] {
  return stringField(state).toLowerCase() === "booted" ? "device" : "offline";
}

function toDeviceInfo(raw: RawIdbTarget): DeviceInfo {
  return {
    serial: stringField(raw.udid),
    model: stringField(raw.name),
    osVersion: stringField(raw.os_version),
    connectionState: mapConnectionState(raw.state),
    isEmulator: stringField(raw.target_type).toLowerCase() === "simulator",
    platform: "ios",
  };
}

/** Throws IdbCommandFailedError (carrying stderr) when the invocation failed. */
function assertSuccess(result: IdbExecResult, context: string): void {
  if (result.exitCode !== 0) {
    const stderrText = result.stderr.toString("utf-8").trim();
    throw new IdbCommandFailedError(
      stderrText.length > 0
        ? `idb ${context} failed (exit ${result.exitCode}): ${stderrText}`
        : `idb ${context} failed (exit ${result.exitCode})`,
    );
  }
}

export class IdbBackend implements DeviceBackend {
  constructor(private readonly exec: IdbExecutor = spawnIdb) {}

  async listDevices(): Promise<DeviceInfo[]> {
    const result = await this.exec(["list-targets", "--json"]);
    assertSuccess(result, "list-targets --json");

    const stdout = result.stdout.toString("utf-8").trim();
    if (stdout.length === 0) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // Runtime boundary guard (Secured): unparseable idb output degrades
      // to an empty list rather than throwing (REQ-IOS-ARCH-003 spirit —
      // never let one backend's output shape drift crash the whole CLI).
      return [];
    }

    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((entry) => toDeviceInfo(entry as RawIdbTarget));
  }

  /**
   * REQ-IOS-BACKEND-003: collects `idb ui describe-all` JSON and returns
   * it already normalized to CommonElement[] via the idb normalizer —
   * mirrors AdbBackend.dumpUiHierarchy's internal-normalization contract
   * (REQ-IOS-SCHEMA-002/003).
   */
  async dumpUiHierarchy(serial: string): Promise<CommonElement[]> {
    const result = await this.exec(["ui", "describe-all", "--udid", serial, "--json"]);
    assertSuccess(result, "ui describe-all");

    const stdout = result.stdout.toString("utf-8").trim();
    if (stdout.length === 0) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return [];
    }

    return normalizeIdbAccessibility(parsed);
  }

  async screenshot(serial: string): Promise<Uint8Array> {
    const result = await this.exec(["screenshot", "--udid", serial]);
    assertSuccess(result, "screenshot");
    return result.stdout;
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    const result = await this.exec(["ui", "tap", "--udid", serial, String(x), String(y)]);
    assertSuccess(result, "ui tap");
  }

  /**
   * REQ-IOS-BACKEND-006: idb's `ui text` is Unicode-native — no IME
   * switch, no ADBKeyBoard, no base64 broadcast, no session/disk state
   * (spec.md §C.2). `options.hideKeyboardAfter` has no iOS equivalent
   * action, so it is accepted but ignored (an observable no-op, never an
   * error) rather than rejected as an unknown option.
   */
  async inputText(serial: string, text: string, _options?: { hideKeyboardAfter?: boolean }): Promise<void> {
    const result = await this.exec(["ui", "text", "--udid", serial, text]);
    assertSuccess(result, "ui text");
  }

  /**
   * REQ-IOS-BACKEND-007: rejects an alias with no iOS HID keycode mapping
   * with `UnsupportedKeyOnIosError` (graceful reject, never a silent
   * no-op) — no idb invocation is attempted for an unsupported alias.
   */
  async sendKeyEvent(serial: string, keyName: string): Promise<void> {
    if (!isKeyAlias(keyName)) {
      throw new Error(`Unsupported key alias '${keyName}'.`);
    }
    const alias = keyName as KeyAlias;
    const hidCode = IOS_HID_KEYCODE[alias];
    if (hidCode === undefined) {
      throw new UnsupportedKeyOnIosError(
        `Key alias '${alias}' has no iOS HID keycode mapping — no hardware-keyboard equivalent exists on iOS.`,
      );
    }

    const result = await this.exec(["ui", "key", "--udid", serial, String(hidCode)]);
    assertSuccess(result, "ui key");
  }

  async launchApp(serial: string, bundleId: string): Promise<void> {
    const result = await this.exec(["launch", "--udid", serial, bundleId]);
    assertSuccess(result, "launch");
  }

  async stopApp(serial: string, bundleId: string): Promise<void> {
    const result = await this.exec(["terminate", "--udid", serial, bundleId]);
    assertSuccess(result, "terminate");
  }
}
