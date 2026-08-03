/** `launch <package>` command (REQ-APP-001 개정 0.3.0 — 명시적 컴포넌트 시작, M11). */

import { LauncherActivityNotFoundError } from "../../backend/launch-errors.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { isValidPackageName } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const launchCommand: CommandHandler = async (args, source) => {
  const packageId = args.positionals[0];
  if (!packageId || !isValidPackageName(packageId)) {
    return failure(
      "launch",
      "INVALID_PACKAGE",
      "A valid Android package name is required, e.g. com.example.app.",
      { received: packageId ?? null },
    );
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("launch", target.code, target.message, target.details);

  try {
    await target.backend.launchApp(target.serial, packageId);
  } catch (err) {
    if (err instanceof LauncherActivityNotFoundError) {
      // REQ-APP-001 개정 0.3.0 / AC-ANDROID-028: a distinct code from
      // BACKEND_COMMAND_FAILED, carrying a message that presents BOTH
      // possible causes (no launcher activity declared OR not installed)
      // rather than asserting one — the resolve query's output cannot
      // distinguish them (spec.md §C.3-③). No start intent was sent.
      return failure("launch", "LAUNCHER_ACTIVITY_NOT_FOUND", err.message, { package: packageId });
    }
    return failure("launch", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  return success("launch", { serial: target.serial, package: packageId });
};
