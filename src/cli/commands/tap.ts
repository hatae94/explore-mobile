/** `tap <x> <y>` command (REQ-INPUT-001). */

import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { parseCoordinate } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const tapCommand: CommandHandler = async (args, backend) => {
  const [xRaw, yRaw] = args.positionals;
  const x = xRaw !== undefined ? parseCoordinate(xRaw) : undefined;
  const y = yRaw !== undefined ? parseCoordinate(yRaw) : undefined;

  if (x === undefined || y === undefined) {
    return failure(
      "tap",
      "INVALID_COORDINATES",
      "tap requires two non-negative integer coordinates: tap <x> <y>.",
      { received: { x: xRaw ?? null, y: yRaw ?? null } },
    );
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("tap", target.code, target.message, target.details);

  try {
    await backend.tap(target.serial, x, y);
  } catch (err) {
    return failure("tap", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  return success("tap", { serial: target.serial, x, y });
};
