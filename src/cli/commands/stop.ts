/** `stop <package>` command (REQ-APP-002). */

import type { AppCommandPayload } from "../../schema/command-payloads.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { isValidPackageName } from "../validators.js";
import { backendFailure, errorMessage, type CommandHandler } from "./types.js";

export const stopCommand: CommandHandler = async (args, source) => {
  const packageId = args.positionals[0];
  if (!packageId || !isValidPackageName(packageId)) {
    return failure(
      "stop",
      "INVALID_PACKAGE",
      "A valid Android package name is required, e.g. com.example.app.",
      { received: packageId ?? null },
    );
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("stop", target.code, target.message, target.details);

  try {
    await target.backend.stopApp(target.serial, packageId);
  } catch (err) {
    return backendFailure("stop", err);
  }

  return success<AppCommandPayload>("stop", { serial: target.serial, package: packageId });
};
