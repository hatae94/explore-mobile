/**
 * `text <string>` command (REQ-INPUT-002/003/004, M5), plus
 * `text <string> --id <id>` / `text <string> --text <selector>` (+
 * optional `--index <n>`) focus-before-type: taps an element by selector
 * to focus it before typing (new capability beyond SPEC-ANDROID-001's
 * original coordinate-only primitives — flagged as a spec-scope note
 * alongside this change).
 *
 * Delegates entirely to `DeviceBackend.inputText()` for the ASCII-vs-
 * Unicode routing and the IME lifecycle — this handler's only job is
 * device targeting, optional selector-based focus, forwarding
 * `--keep-keyboard` (default: hide the keyboard after send, REQ-INPUT-004
 * revised), and translating the outcome (success, a distinguished
 * IME-restore failure, or a generic adb failure) into the standard JSON
 * envelope. When a focus selector is given but not found, the input is
 * NOT sent — the caller gets a graceful `ELEMENT_NOT_FOUND` instead of
 * typing into whatever happened to be focused already.
 *
 * @MX:NOTE — platform-agnostic as of SPEC-IOS-001: `focusElementBySelector`'s
 * prior direct `normalizeUiAutomatorXml` import/call was removed
 * (normalization moved into each backend, spec.md §F) — focus-before-type
 * now works on iOS with zero changes to this file (AC-IOS-025).
 */

import { elementCenter, findElement, type ElementSelector } from "../../normalize/element-query.js";
import { AdbKeyboardInstallFailedError, ImeBindTimeoutError, ImeRestoreFailedError } from "../../backend/ime-errors.js";
import type { DeviceBackend } from "../../schema/device-backend.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { CommandError } from "../envelope.js";
import { parseIndex } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";
import { runWebText } from "./web-support.js";
import type { ParsedCommandArgs } from "../args.js";

/**
 * Fetches the current UI tree (reusing the same dump + normalize path
 * `dump` uses), finds the element matching the given focus selector, and
 * taps its center to focus it. Returns a `CommandError` when the selector
 * is invalid or unmatched (caller MUST NOT proceed to type in that case);
 * returns `null` on a successful focus-tap.
 */
async function focusElementBySelector(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  serial: string,
): Promise<CommandError | null> {
  const index = args.index !== undefined ? parseIndex(args.index) : undefined;
  if (args.index !== undefined && index === undefined) {
    return failure("text", "INVALID_INDEX", "text --index requires a non-negative integer.", {
      received: args.index,
    });
  }

  const selector: ElementSelector = {
    ...(args.id !== undefined ? { id: args.id } : {}),
    ...(args.selectorText !== undefined ? { text: args.selectorText } : {}),
    ...(index !== undefined ? { index } : {}),
  };

  let elements;
  try {
    elements = await backend.dumpUiHierarchy(serial);
  } catch (err) {
    return failure("text", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  const element = findElement(elements, selector);
  if (element === null) {
    return failure("text", "ELEMENT_NOT_FOUND", "No element matched the given focus selector.", { selector });
  }

  const { x, y } = elementCenter(element);
  try {
    await backend.tap(serial, x, y);
  } catch (err) {
    return failure("text", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  return null;
}

export const textCommand: CommandHandler = async (args, backend) => {
  // `--web` routes to the WebKit Inspector path (SPEC-WEBVIEW-001); without
  // it this handler behaves exactly as before (AC-WEB-017).
  if (args.web !== undefined) return runWebText(args, backend);

  const text = args.positionals[0];
  if (text === undefined) {
    return failure("text", "MISSING_TEXT", 'text requires an input string: text "<...>".');
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("text", target.code, target.message, target.details);

  const hasSelector = args.id !== undefined || args.selectorText !== undefined;
  if (hasSelector) {
    const focusError = await focusElementBySelector(args, backend, target.serial);
    if (focusError !== null) return focusError;
  }

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
      // APK_INSTALL_FAILED) instead of degrading to BACKEND_COMMAND_FAILED.
      return failure("text", err.code, err.message);
    }
    if (err instanceof ImeBindTimeoutError) {
      // REQ-INPUT-004 개정 0.3.0 / AC-ANDROID-031: an intended response-
      // contract change — the cold path that used to silently return
      // ok:true while losing the input now returns ok:false with a
      // dedicated code, instead of degrading to BACKEND_COMMAND_FAILED.
      return failure("text", "IME_BIND_TIMEOUT", err.message, { serial: err.serial });
    }
    return failure("text", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  return success("text", { serial: target.serial });
};
