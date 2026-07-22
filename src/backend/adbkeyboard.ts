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
 *
 * @MX:NOTE — ADBKeyBoard is licensed GPL-2.0. This package (explore-mobile)
 * is MIT-licensed, so the compiled APK is NEVER bundled or redistributed
 * inside this npm package — `doctor` downloads it on demand at install
 * time, directly from the upstream project's official GitHub release
 * (see apk-downloader.ts), and caches the download locally. This is a
 * deliberate license-compliance choice, not an oversight: bundling a
 * GPL-2.0 binary inside an MIT-licensed distribution would have been a
 * license violation.
 */

export const ADBKEYBOARD_PACKAGE_ID = "com.android.adbkeyboard";
export const ADBKEYBOARD_IME_ID = `${ADBKEYBOARD_PACKAGE_ID}/.AdbIME`;
export const ADBKEYBOARD_BROADCAST_ACTION = "ADB_INPUT_B64";

const ADBKEYBOARD_REPO = "senzhk/ADBKeyBoard";

/**
 * Pinned release ref (a tag, NEVER `master`) for reproducibility — every
 * download resolves to the exact same bytes regardless of upstream
 * changes after this ref was chosen.
 */
export const ADBKEYBOARD_PINNED_VERSION = "v2.4-dev";

const ADBKEYBOARD_RELEASE_ASSET_NAME = "ADBKeyboard.apk";

/**
 * Primary download source: the pinned release's asset on GitHub
 * Releases. This is the canonical, versioned distribution point for a
 * tagged release.
 */
export function adbKeyboardReleaseDownloadUrl(): string {
  return `https://github.com/${ADBKEYBOARD_REPO}/releases/download/${ADBKEYBOARD_PINNED_VERSION}/${ADBKEYBOARD_RELEASE_ASSET_NAME}`;
}

/**
 * Fallback download source: the raw file at the pinned ref, used when
 * the release-asset path above doesn't resolve (e.g. the asset was
 * renamed or the release entry lacks a binary attachment). Still pinned
 * to the same ref — never `master` — so reproducibility holds either way.
 */
export function adbKeyboardRawFallbackUrl(): string {
  return `https://github.com/${ADBKEYBOARD_REPO}/raw/${ADBKEYBOARD_PINNED_VERSION}/ADBKeyboard.apk`;
}
