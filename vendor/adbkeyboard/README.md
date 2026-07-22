# ADBKeyBoard — bundled APK (pending)

This directory is where the pinned-version ADBKeyBoard APK ships, so
`doctor` (SPEC-ANDROID-001 REQ-DOCTOR-003) can install and enable a
Unicode-capable IME **offline and reproducibly**, without downloading
anything at runtime.

**Status: no APK is bundled yet.** `doctor` detects this and returns a
graceful `APK_NOT_BUNDLED` error (REQ-ERR-002 / acceptance.md
AC-ANDROID-016) with manual-install guidance, rather than failing
silently or fabricating a binary. See `src/backend/adbkeyboard.ts` for
the runtime path-resolution logic and the `@MX:TODO` marker tracking
this gap.

## Acquisition checklist (must be completed by a human before release)

1. **Source the APK.** Obtain the compiled APK from
   [`senzhk/ADBKeyBoard`](https://github.com/senzhk/ADBKeyBoard) (or a
   verified release mirror). Pick one specific tagged release or commit —
   do not track a moving branch.
2. **Verify the license.** The upstream README states an Apache-2.0
   license. Confirm this still holds for the exact release chosen, and
   that redistributing the compiled binary inside this npm package is
   permitted under those terms.
3. **Record the version.** Update `ADBKEYBOARD_PINNED_VERSION` in
   `src/backend/adbkeyboard.ts` to the exact release/version string
   chosen in step 1.
4. **Add attribution.** Add a `NOTICE` file in this directory crediting
   the upstream project and reproducing the required Apache-2.0
   attribution text.
5. **Place the binary.** Save the APK as
   `ADBKeyBoard-<version>.apk` in this directory (filename must match
   `adbKeyboardApkFilename()` in `src/backend/adbkeyboard.ts`).
6. **Update `package.json`.** Confirm `"vendor"` is listed in the
   `files` array (already done as of the M6 commit) so the APK ships
   with the published npm package.
7. **Re-verify `doctor`.** Run `doctor` against a real or emulated
   device and confirm the ADBKeyBoard install + `ime enable` step now
   succeeds instead of reporting `APK_NOT_BUNDLED`.

## Runtime contract

- Package id: `com.android.adbkeyboard`
- IME component id: `com.android.adbkeyboard/.AdbIME`
- Unicode input broadcast action: `ADB_INPUT_B64` (base64-encoded UTF-8
  message via `am broadcast -a ADB_INPUT_B64 --es msg <base64>`)

These identifiers are defined once in `src/backend/adbkeyboard.ts` and
consumed by both the `text` command's IME lifecycle (M5) and `doctor`'s
install/enable flow (M6) — do not duplicate them elsewhere.
