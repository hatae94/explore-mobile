/**
 * `text <string>` command (REQ-INPUT-002/003/004, M5).
 *
 * Delegates entirely to `DeviceBackend.inputText()` for the ASCII-vs-
 * Unicode routing and the IME lifecycle — this handler's only job is
 * device targeting, forwarding `--keep-keyboard` (default: hide the
 * keyboard after send, REQ-INPUT-004 revised), and translating the
 * backend's outcome (success, a distinguished IME-restore failure, or a
 * generic adb failure) into the standard JSON envelope.
 */

import { AdbKeyboardInstallFailedError, ImeRestoreFailedError } from "../../backend/ime-errors.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const textCommand: CommandHandler = async (args, backend) => {
  const text = args.positionals[0];
  if (text === undefined) {
    return failure("text", "MISSING_TEXT", 'text requires an input string: text "<...>".');
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("text", target.code, target.message, target.details);

  try {
    await backend.inputText(target.serial, text, { hideKeyboardAfter: !args.keepKeyboard });
  } catch (err) {
    if (err instanceof ImeRestoreFailedError) {
      // REQ-ERR-001 / AC-ANDROID-015: never fail silently — surface the
      // original IME id (if known) so the user can manually recover.
      return failure("text", "IME_RESTORE_FAILED", err.message, {
        originalImeId: err.originalImeId ?? null,
      });
    }
    if (err instanceof AdbKeyboardInstallFailedError) {
      // REQ-INPUT-003 revised (self-heal): reuse the identical error code
      // AdbDoctor.ensureAdbKeyboard() already surfaces for the same
      // failure classes (PM_LIST_FAILED / APK_DOWNLOAD_FAILED /
      // APK_INSTALL_FAILED) instead of degrading to ADB_COMMAND_FAILED.
      return failure("text", err.code, err.message);
    }
    return failure("text", "ADB_COMMAND_FAILED", errorMessage(err));
  }

  return success("text", { serial: target.serial });
};
