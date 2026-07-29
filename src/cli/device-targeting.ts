/**
 * Basic device-targeting resolution (REQ-MULTIDEV-001/002, M3 scope; the
 * "connected" definition is REQ-MULTIDEV-001/002 개정 0.4.0 / M13).
 *
 * This resolves WHICH single device a command should target from the
 * currently connected device list plus an optional `--device <serial>`.
 * Full per-device STATE isolation (serial-namespaced temp resources,
 * concurrency safety across simultaneous commands) is M7 scope — this
 * function only answers "which serial do we pass to `adb -s`".
 *
 * @MX:NOTE — platform-neutral (REQ-MULTIDEV-001 개정 0.4.0): this module
 * serves BOTH backends (Android/adb, iOS/idb) — do not narrow "connected"
 * handling to the Android path. Every `connectionState !== "device"` entry
 * observed in real usage (spec.md §C.4-⑳) was an offline iOS simulator,
 * which Xcode registers on every macOS host regardless of whether one is
 * actually booted.
 */

import type { DeviceInfo } from "../schema/device-backend.js";
import type { CommandErrorInfo } from "./envelope.js";

export type DeviceTargetResolution =
  | { ok: true; serial: string }
  | ({ ok: false } & CommandErrorInfo);

/**
 * A device is "connected" iff `connectionState === "device"`
 * (REQ-MULTIDEV-001 개정 0.4.0 — this is the definition that was missing
 * before 0.4.0, which let un-booted/offline entries be counted as if they
 * were targetable). `offline` and `unauthorized` entries may appear in the
 * raw list but are never connected.
 */
function connectedOnly(devices: DeviceInfo[]): DeviceInfo[] {
  return devices.filter((d) => d.connectionState === "device");
}

/**
 * Resolves the target device serial for a device-targeting command.
 *
 * - `--device <serial>` given, absent from the list entirely:
 *   `DEVICE_NOT_FOUND` (acceptance.md §D.1 edge case).
 * - `--device <serial>` given, present in the list but not connected:
 *   `DEVICE_NOT_CONNECTED` — distinct from both `DEVICE_NOT_FOUND` (absent)
 *   and a late backend failure; no backend command runs for this serial
 *   (REQ-MULTIDEV-001 개정 0.4.0, AC-ANDROID-043).
 * - `--device` omitted, 0 devices connected: `NO_DEVICE` (acceptance.md
 *   §D.1); the message notes disconnected entries when the raw list is
 *   non-empty ("exists but not booted" vs "nothing at all" call for
 *   different user action).
 * - `--device` omitted, exactly 1 device connected: that device is
 *   selected, regardless of how many disconnected entries are also listed
 *   (AC-ANDROID-042 — this is the documented auto-select behavior becoming
 *   reachable again, not a new capability).
 * - `--device` omitted, >1 devices connected: `AMBIGUOUS_DEVICE`, never
 *   silently picking the first (REQ-MULTIDEV-002, AC-ANDROID-009/041).
 */
export function resolveTargetDevice(
  devices: DeviceInfo[],
  requestedSerial: string | undefined,
): DeviceTargetResolution {
  if (requestedSerial !== undefined) {
    const found = devices.find((d) => d.serial === requestedSerial);
    if (!found) {
      return {
        ok: false,
        code: "DEVICE_NOT_FOUND",
        message: `No connected device with serial '${requestedSerial}'.`,
        details: { requestedSerial, availableDevices: connectedOnly(devices) },
      };
    }
    if (found.connectionState !== "device") {
      return {
        ok: false,
        code: "DEVICE_NOT_CONNECTED",
        message: `Device '${requestedSerial}' exists but is not connected (connectionState: '${found.connectionState}'). Reconnect or boot it, then retry.`,
        details: { requestedSerial, connectionState: found.connectionState },
      };
    }
    return { ok: true, serial: found.serial };
  }

  const connected = connectedOnly(devices);

  if (connected.length === 0) {
    const message =
      devices.length > 0
        ? `No connected device (${devices.length} device(s) listed, but none are connected — run 'devices' for the full list).`
        : "No device connected.";
    return { ok: false, code: "NO_DEVICE", message };
  }

  if (connected.length > 1) {
    const disconnectedCount = devices.length - connected.length;
    return {
      ok: false,
      code: "AMBIGUOUS_DEVICE",
      message: `${connected.length} devices connected; specify --device <serial>.`,
      details: {
        availableDevices: connected,
        ...(disconnectedCount > 0 ? { disconnectedCount } : {}),
      },
    };
  }

  return { ok: true, serial: connected[0]!.serial };
}
