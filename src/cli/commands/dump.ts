/**
 * `dump` command (REQ-DUMP-001/002).
 *
 * Layer boundary in action: this handler asks the backend for raw XML
 * (adb wrapper, M4) then normalizes it via the M2 pure function — the CLI
 * layer never touches uiautomator's XML shape directly.
 */

import { normalizeUiAutomatorXml } from "../../normalize/uiautomator.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const dumpCommand: CommandHandler = async (args, backend) => {
  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("dump", target.code, target.message, target.details);

  let xml: string;
  try {
    xml = await backend.dumpUiHierarchy(target.serial);
  } catch (err) {
    return failure("dump", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  const elements = normalizeUiAutomatorXml(xml);
  return success("dump", { serial: target.serial, elements });
};
