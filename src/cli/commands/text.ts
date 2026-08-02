/**
 * `text <string>` command (REQ-INPUT-002/003/004, M5).
 *
 * **SPEC-VISION-001 M2가 focus-before-type 셀렉터 경로를 제거했다**
 * (REQ-VISION-002): `text <string> --id <id>` / `--text <selector>`와 그 뒤의
 * UI 계층 덤프 조회가 사라졌다. 입력 대상에 포커스를 주려면 호출자가
 * 스크린샷에서 좌표를 읽어 `tap <x> <y>`를 먼저 보낸다 — 읽기 경로
 * 단일화의 직접적 귀결이다(spec.md §A.2, §C.2).
 *
 * Delegates entirely to `DeviceBackend.inputText()` for the ASCII-vs-
 * Unicode routing and the IME lifecycle — this handler's only job is
 * device targeting, forwarding `--keep-keyboard` (default: hide the
 * keyboard after send, REQ-INPUT-004 revised), and translating the outcome
 * (success, a distinguished IME-restore failure, or a generic adb failure)
 * into the standard JSON envelope.
 */

import { AdbKeyboardInstallFailedError, ImeBindTimeoutError, ImeRestoreFailedError } from "../../backend/ime-errors.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { errorMessage, type CommandHandler } from "./types.js";
import { runWebText } from "./web-support.js";

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
