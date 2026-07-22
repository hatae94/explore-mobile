# ADBKeyBoard — NOT bundled (license compliance)

This directory intentionally does **not** contain the ADBKeyBoard APK.

**ADBKeyBoard is licensed GPL-2.0.** This package (`explore-mobile`) is
MIT-licensed. Bundling a GPL-2.0 binary inside an MIT-licensed npm
distribution would be a license violation, so we never redistribute the
compiled APK — not in this repository, not in the published npm package.

## How ADBKeyBoard actually gets onto the device

`doctor` downloads ADBKeyBoard **at runtime, on first use**, directly from
its official GitHub release:

- Primary source: the pinned release's asset on GitHub Releases
  (`https://github.com/senzhk/ADBKeyBoard/releases/download/<pinned-ref>/ADBKeyboard.apk`).
- Fallback source: the raw file at the same pinned ref, used if the
  release-asset path doesn't resolve.
- The ref is **pinned** (a specific tag, never `master`) for
  reproducibility — see `ADBKEYBOARD_PINNED_VERSION` in
  `src/backend/adbkeyboard.ts`.
- The download is validated (non-empty + ZIP/APK magic bytes) before
  being passed to `adb install`, and cached locally
  (`~/.cache/explore-mobile/`) so repeated `doctor` runs don't
  re-download.
- Network failure, a 404, or an invalid download all degrade to a
  graceful `APK_DOWNLOAD_FAILED` JSON error with manual-install
  instructions — never a crash, never a fabricated binary, never a
  silent failure.

See `src/backend/apk-downloader.ts` for the download/cache/validation
implementation and `src/backend/doctor.ts`'s `ensureAdbKeyboard()` for
how it's wired into the `doctor` command.

## Runtime contract

- Package id: `com.android.adbkeyboard`
- IME component id: `com.android.adbkeyboard/.AdbIME`
- Unicode input broadcast action: `ADB_INPUT_B64` (base64-encoded UTF-8
  message via `am broadcast -a ADB_INPUT_B64 --es msg <base64>`)

These identifiers are defined once in `src/backend/adbkeyboard.ts` and
consumed by both the `text` command's IME lifecycle (M5) and `doctor`'s
install/enable flow (M6) — do not duplicate them elsewhere.

## Why this directory still exists

Kept as the documented, discoverable home for this license-compliance
note and the runtime-contract reference above — not as a binary staging
area. Do not place an APK file here.
