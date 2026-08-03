/** `devices` command (REQ-DEVICES-001/002, AC-ANDROID-004). */

import type { DevicesPayload } from "../../schema/command-payloads.js";
import { failure, success } from "../envelope.js";
import type { CommandHandler } from "./types.js";

export const devicesCommand: CommandHandler = async (args, source) => {
  const all = await source.listAllDevices();

  if (args.device === undefined) {
    return success<DevicesPayload>("devices", all);
  }

  const filtered = all.filter((d) => d.serial === args.device);
  if (filtered.length === 0) {
    return failure("devices", "DEVICE_NOT_FOUND", `No connected device with serial '${args.device}'.`, {
      requestedSerial: args.device,
      availableDevices: all,
    });
  }
  return success<DevicesPayload>("devices", filtered);
};
