/**
 * `reset` command, and the shared implementation behind `doctor --clean`
 * (REQ-DOCTOR-004): both restore the target device to its pre-`doctor`
 * state via the same `AdbDoctor.resetDevice()` call. Exported as a
 * reusable function (not just the `CommandHandler`) so `doctor.ts` can
 * invoke the identical logic under its own command name when `--clean`
 * is passed, rather than duplicating the device-targeting + response
 * shaping.
 *
 * `reset` is also the ONLY place a session-based IME switch (REQ-INPUT-004
 * revised — `AdbBackend.inputText()`) is actually restored: `backend` is
 * narrowed via `instanceof AdbBackend` (an Android-specific concern kept
 * out of the backend-agnostic `DeviceBackend` interface, consistent with
 * `AdbDoctor` itself already being a concrete, non-abstracted parameter
 * here) to read and clear the per-serial tracked original IME. A backend
 * with no such concept (e.g. a future iOS/idb backend) simply skips this.
 */

import { AdbBackend } from "../../backend/adb-backend.js";
import type { DeviceBackend } from "../../schema/device-backend.js";
import type { AdbDoctor } from "../../backend/doctor.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { ParsedCommandArgs } from "../args.js";
import type { CommandResult } from "../envelope.js";
import type { CommandHandler } from "./types.js";

export async function performReset(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  doctor: AdbDoctor,
  commandName: string,
): Promise<CommandResult> {
  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure(commandName, target.code, target.message, target.details);

  const trackedOriginalIme =
    backend instanceof AdbBackend ? await backend.getTrackedOriginalIme(target.serial) : undefined;

  const result = await doctor.resetDevice(target.serial, trackedOriginalIme);

  // Clear the session once `resetDevice()` has taken responsibility for
  // restoring it — but only on success (or when there was nothing precise
  // to restore to); on a genuine restore failure, retain the tracked entry
  // for audit / manual recovery (mirrors the prior per-call retain-on-
  // failure behavior, now scoped to the session boundary).
  if (backend instanceof AdbBackend && trackedOriginalIme !== undefined && result.originalImeRestored !== false) {
    await backend.clearTrackedOriginalIme(target.serial);
  }

  return success(commandName, { serial: target.serial, ...result });
}

export const resetCommand: CommandHandler = (args, backend, doctor) => performReset(args, backend, doctor, "reset");
