/**
 * `screenshot` command (REQ-SCREENSHOT-001/002).
 *
 * Always emits JSON (REQ-ARCH-001): with `--out <path>` the PNG bytes are
 * written to that host path and the JSON response is a small pointer;
 * without `--out` the PNG bytes are embedded as base64 in the JSON body
 * so the contract holds either way. Neither mode leaves a file on the
 * device — the bytes are streamed host-side via `adb exec-out`.
 */

import { writeFile } from "node:fs/promises";

import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const screenshotCommand: CommandHandler = async (args, backend) => {
  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("screenshot", target.code, target.message, target.details);

  let bytes: Uint8Array;
  try {
    bytes = await backend.screenshot(target.serial);
  } catch (err) {
    return failure("screenshot", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  const buffer = Buffer.from(bytes);

  if (args.out !== undefined) {
    try {
      await writeFile(args.out, buffer);
    } catch (err) {
      return failure("screenshot", "WRITE_FAILED", errorMessage(err), { path: args.out });
    }
    return success("screenshot", {
      serial: target.serial,
      savedTo: args.out,
      byteLength: buffer.length,
    });
  }

  return success("screenshot", {
    serial: target.serial,
    byteLength: buffer.length,
    pngBase64: buffer.toString("base64"),
  });
};
