/**
 * Shared "ensure ADBKeyBoard is installed" logic (REQ-INPUT-003 revised,
 * REQ-DOCTOR-003), extracted so both `AdbDoctor.ensureAdbKeyboard()` (the
 * `doctor`/`doctor --clean` install+enable flow) and `AdbBackend.inputText()`
 * (the `text` command's self-heal path — `reset` uninstalls ADBKeyBoard as
 * part of restoring the device to its pre-`doctor` state, so a subsequent
 * `text` call on a fresh/reset device must re-install it on demand rather
 * than fail with "Unknown input method") share ONE package-presence-check +
 * runtime-download + `adb install` implementation, instead of drifting
 * apart across two call sites.
 *
 * Deliberately does NOT enable the IME — that remains each caller's own
 * concern (`doctor` enables unconditionally; `text` enables as part of its
 * existing session-based `ime enable` + `ime set` switch), keeping this
 * helper's single responsibility to "is the package present, and if not,
 * make it present."
 */

import { ADBKEYBOARD_PACKAGE_ID } from "./adbkeyboard.js";
import type { AdbExecutor } from "./adb-executor.js";
import type { ApkAcquirer } from "./apk-downloader.js";

export interface AdbKeyboardInstallResult {
  alreadyInstalled: boolean;
  installed: boolean;
  /** Present only on a fresh install (installed=true): where the APK came from. */
  apkSource?: { cached: boolean; url?: string };
  error?: { code: string; message: string };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Idempotent (REQ-IDEMP-002): a `pm list packages` query on the target
 * device decides whether a download+`adb install` is even needed. Download
 * or install failure returns a graceful `error` result rather than
 * throwing — every failure mode is a value the caller can branch on, so the
 * device is never left in a half-changed state.
 */
export async function ensureAdbKeyboardInstalled(
  serial: string,
  adbExec: AdbExecutor,
  acquireApk: ApkAcquirer,
): Promise<AdbKeyboardInstallResult> {
  const listResult = await adbExec(["-s", serial, "shell", "pm", "list", "packages"]);
  if (listResult.exitCode !== 0) {
    const stderrText = listResult.stderr.toString("utf-8").trim();
    return {
      alreadyInstalled: false,
      installed: false,
      error: {
        code: "PM_LIST_FAILED",
        message: `Could not query installed packages: ${stderrText.length > 0 ? stderrText : "unknown error"}`,
      },
    };
  }

  const alreadyInstalled = listResult.stdout.toString("utf-8").includes(`package:${ADBKEYBOARD_PACKAGE_ID}`);
  if (alreadyInstalled) {
    return { alreadyInstalled: true, installed: false };
  }

  let acquisition;
  try {
    acquisition = await acquireApk();
  } catch (err) {
    return {
      alreadyInstalled: false,
      installed: false,
      error: { code: "APK_DOWNLOAD_FAILED", message: errorMessage(err) },
    };
  }

  const apkSource = acquisition.sourceUrl
    ? { cached: acquisition.fromCache, url: acquisition.sourceUrl }
    : { cached: acquisition.fromCache };

  const installResult = await adbExec(["-s", serial, "install", acquisition.path]);
  if (installResult.exitCode !== 0) {
    const stderrText = installResult.stderr.toString("utf-8").trim();
    return {
      alreadyInstalled: false,
      installed: false,
      error: {
        code: "APK_INSTALL_FAILED",
        message: `ADBKeyBoard install failed: ${stderrText.length > 0 ? stderrText : "unknown adb install error"}. Try manually: adb -s ${serial} install ${acquisition.path}`,
      },
    };
  }

  return { alreadyInstalled: false, installed: true, apkSource };
}
