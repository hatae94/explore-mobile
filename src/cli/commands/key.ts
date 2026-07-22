/** `key <alias>` command (REQ-INPUT-005). */

import { KEY_ALIASES, isKeyAlias } from "../../schema/key-alias.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const keyCommand: CommandHandler = async (args, backend) => {
  const alias = args.positionals[0];
  if (!alias || !isKeyAlias(alias)) {
    return failure(
      "key",
      "UNSUPPORTED_KEY",
      `Unsupported key alias. Supported: ${KEY_ALIASES.join(", ")}.`,
      { received: alias ?? null },
    );
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("key", target.code, target.message, target.details);

  try {
    await backend.sendKeyEvent(target.serial, alias);
  } catch (err) {
    return failure("key", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  return success("key", { serial: target.serial, key: alias });
};
