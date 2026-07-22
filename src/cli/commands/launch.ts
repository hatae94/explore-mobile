/** `launch <package>` command (REQ-APP-001). */

import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { isValidPackageName } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const launchCommand: CommandHandler = async (args, backend) => {
  const packageId = args.positionals[0];
  if (!packageId || !isValidPackageName(packageId)) {
    return failure(
      "launch",
      "INVALID_PACKAGE",
      "A valid Android package name is required, e.g. com.example.app.",
      { received: packageId ?? null },
    );
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("launch", target.code, target.message, target.details);

  try {
    await backend.launchApp(target.serial, packageId);
  } catch (err) {
    return failure("launch", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  return success("launch", { serial: target.serial, package: packageId });
};
