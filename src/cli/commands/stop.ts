/** `stop <package>` command (REQ-APP-002). */

import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { isValidPackageName } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const stopCommand: CommandHandler = async (args, backend) => {
  const packageId = args.positionals[0];
  if (!packageId || !isValidPackageName(packageId)) {
    return failure(
      "stop",
      "INVALID_PACKAGE",
      "A valid Android package name is required, e.g. com.example.app.",
      { received: packageId ?? null },
    );
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("stop", target.code, target.message, target.details);

  try {
    await backend.stopApp(target.serial, packageId);
  } catch (err) {
    return failure("stop", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  return success("stop", { serial: target.serial, package: packageId });
};
