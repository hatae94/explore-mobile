/**
 * `dump` command (REQ-DUMP-001/002).
 *
 * Layer boundary in action: this handler asks the backend for the already-
 * normalized element tree (REQ-IOS-SCHEMA-002/003, SPEC-IOS-001 — each
 * backend normalizes its own raw format internally) — the CLI layer never
 * touches a platform's raw markup/JSON shape directly, which is what lets
 * this same handler work unchanged for both `AdbBackend` and `IdbBackend`.
 */

import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { CommonElement } from "../../schema/common-element.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const dumpCommand: CommandHandler = async (args, backend) => {
  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("dump", target.code, target.message, target.details);

  let elements: CommonElement[];
  try {
    elements = await backend.dumpUiHierarchy(target.serial);
  } catch (err) {
    return failure("dump", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  return success("dump", { serial: target.serial, elements });
};
