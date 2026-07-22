/**
 * Shared ADBKeyBoard identity constants (REQ-INPUT-003, REQ-DOCTOR-003).
 * Used by both the text-input IME lifecycle (adb-backend.ts) and the
 * doctor install/enable flow (doctor.ts) — kept in one place so the
 * package id and IME component id never drift between the two call
 * sites.
 *
 * Source: https://github.com/senzhk/ADBKeyBoard (package
 * `com.android.adbkeyboard`, IME service `.AdbIME`, `ADB_INPUT_B64`
 * base64 broadcast action — matches spec.md §C ground-truth facts).
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ADBKEYBOARD_PACKAGE_ID = "com.android.adbkeyboard";
export const ADBKEYBOARD_IME_ID = `${ADBKEYBOARD_PACKAGE_ID}/.AdbIME`;
export const ADBKEYBOARD_BROADCAST_ACTION = "ADB_INPUT_B64";

/**
 * @MX:TODO — the pinned ADBKeyBoard release version is NOT YET SOURCED.
 * A human must, before this ships:
 *   1. Download the APK from https://github.com/senzhk/ADBKeyBoard (or a
 *      verified release mirror) and pick one specific release/commit.
 *   2. Verify the project's license (README states Apache-2.0) actually
 *      permits redistribution of the compiled APK.
 *   3. Record the exact version string below and add a NOTICE/attribution
 *      file alongside the APK per the license's requirements.
 *   4. Place the binary at `vendor/adbkeyboard/ADBKeyBoard-<version>.apk`.
 * See vendor/adbkeyboard/README.md for the full acquisition checklist.
 * Until this is done, `doctor`'s ADBKeyBoard install step gracefully
 * reports `APK_NOT_BUNDLED` (REQ-ERR-002 / AC-ANDROID-016) instead of
 * silently failing or fabricating a binary — this is the correct,
 * intentional behavior for this milestone, not a bug.
 */
export const ADBKEYBOARD_PINNED_VERSION = "UNPINNED";

/** Filename of the bundled APK, relative to `vendor/adbkeyboard/`. */
export function adbKeyboardApkFilename(): string {
  return `ADBKeyBoard-${ADBKEYBOARD_PINNED_VERSION}.apk`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// Compiled location is dist/backend/adbkeyboard.js; the package root
// (where vendor/ lives, sibling to dist/) is two levels up.
const PACKAGE_ROOT = resolve(__dirname, "..", "..");

/** Absolute path to the bundled ADBKeyBoard APK within this npm package. */
export function resolveBundledApkPath(): string {
  return resolve(PACKAGE_ROOT, "vendor", "adbkeyboard", adbKeyboardApkFilename());
}
