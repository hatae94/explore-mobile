/**
 * `reset` command, and the shared implementation behind `doctor --clean`
 * (REQ-DOCTOR-004): both restore the target device to its pre-`doctor`
 * state via the same `AdbDoctor.resetDevice()` call. Exported as a
 * reusable function (not just the `CommandHandler`) so `doctor.ts` can
 * invoke the identical logic under its own command name when `--clean`
 * is passed, rather than duplicating the device-targeting + response
 * shaping.
 */

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

  const result = await doctor.resetDevice(target.serial);
  return success(commandName, { serial: target.serial, ...result });
}

export const resetCommand: CommandHandler = (args, backend, doctor) => performReset(args, backend, doctor, "reset");
