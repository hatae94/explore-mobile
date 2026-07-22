/**
 * Basic device-targeting resolution (REQ-MULTIDEV-001/002, M3 scope).
 *
 * This resolves WHICH single device a command should target from the
 * currently connected device list plus an optional `--device <serial>`.
 * Full per-device STATE isolation (serial-namespaced temp resources,
 * concurrency safety across simultaneous commands) is M7 scope — this
 * function only answers "which serial do we pass to `adb -s`".
 */

import type { DeviceInfo } from "../schema/device-backend.js";
import type { CommandErrorInfo } from "./envelope.js";

export type DeviceTargetResolution =
  | { ok: true; serial: string }
  | ({ ok: false } & CommandErrorInfo);

/**
 * Resolves the target device serial for a device-targeting command.
 *
 * - `--device <serial>` given: must match a connected device, else
 *   `DEVICE_NOT_FOUND` (acceptance.md §D.1 edge case).
 * - `--device` omitted, 0 devices connected: `NO_DEVICE` (acceptance.md §D.1).
 * - `--device` omitted, 1 device connected: that device is selected.
 * - `--device` omitted, >1 devices connected: `AMBIGUOUS_DEVICE`, never
 *   silently picking the first (REQ-MULTIDEV-002, AC-ANDROID-009).
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
        details: { requestedSerial, availableDevices: devices },
      };
    }
    return { ok: true, serial: found.serial };
  }

  if (devices.length === 0) {
    return { ok: false, code: "NO_DEVICE", message: "No device connected." };
  }

  if (devices.length > 1) {
    return {
      ok: false,
      code: "AMBIGUOUS_DEVICE",
      message: `${devices.length} devices connected; specify --device <serial>.`,
      details: { availableDevices: devices },
    };
  }

  return { ok: true, serial: devices[0]!.serial };
}
