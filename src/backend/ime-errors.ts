/**
 * Thrown when restoring the device's original IME after a `text` (M5)
 * input session fails — REQ-ERR-001 / acceptance.md AC-ANDROID-015.
 *
 * This is deliberately a distinct error TYPE (not just a message string)
 * so the CLI layer can `instanceof`-check it and surface a dedicated
 * `IME_RESTORE_FAILED` JSON error code carrying `originalImeId`, instead
 * of the generic `ADB_COMMAND_FAILED` — the user needs the original IME
 * id to manually recover (`adb shell ime set <id>`), which a generic
 * error message would bury in prose.
 *
 * @MX:WARN — a thrown-but-uncaught instance of this error means the
 * device's active IME may be left on ADBKeyBoard instead of the user's
 * original keyboard.
 * @MX:REASON — REQ-INPUT-004/REQ-IDEMP-004 require restore to be
 * *attempted* unconditionally, but attempting is not the same as
 * succeeding; this type is how "attempted but failed" is distinguished
 * from "succeeded" or "never attempted" at every layer above the backend.
 */
export class ImeRestoreFailedError extends Error {
  constructor(
    message: string,
    public readonly originalImeId: string | undefined,
  ) {
    super(message);
    this.name = "ImeRestoreFailedError";
  }
}

/**
 * Thrown when the ADBKeyBoard self-heal install — triggered from a
 * non-ASCII `AdbBackend.inputText()` call (REQ-INPUT-003 revised: `reset`
 * uninstalls ADBKeyBoard as part of restoring the device, so a fresh
 * device or a post-`reset` device is missing it and `text` must re-install
 * it on demand) — fails: the package-presence query, the runtime APK
 * download, or the `adb install` itself.
 *
 * Carries the same `code` values `AdbDoctor.ensureAdbKeyboard()` already
 * surfaces for the identical failure classes (`PM_LIST_FAILED` /
 * `APK_DOWNLOAD_FAILED` / `APK_INSTALL_FAILED`), so the CLI layer can
 * reuse doctor's existing, already-documented error codes instead of
 * degrading to the generic `ADB_COMMAND_FAILED`. No IME switch is
 * attempted when this is thrown — the device is left in its pre-call
 * state (REQ-ERR-002 graceful degradation).
 */
export class AdbKeyboardInstallFailedError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AdbKeyboardInstallFailedError";
  }
}

/**
 * Thrown when the pre-broadcast IME-binding-readiness wait
 * (`AdbBackend.inputText()`'s cold path, REQ-INPUT-004 개정 0.3.0) times
 * out — the device never reported `mBoundToMethod=true` within the bounded
 * wait after an `ime set` switch to ADBKeyBoard.
 *
 * This is a deliberate, user-decided response-contract change (spec.md §B
 * Amendment 0.3.0 risk note): the path that used to silently return
 * `{"ok":true}` while losing the input (spec.md §C.3-⑤/⑧) now returns
 * `ok:false` instead. A distinct error TYPE (not a generic failure) lets
 * the CLI layer `instanceof`-check it and surface a dedicated
 * `IME_BIND_TIMEOUT` JSON code, matching the existing
 * `ImeRestoreFailedError`/`AdbKeyboardInstallFailedError` shape.
 *
 * @MX:WARN — a thrown instance means NO base64 broadcast was sent for this
 * `text` call; the caller MUST NOT fall back to sending it anyway "just in
 * case" — that is precisely the silent-loss defect this error exists to
 * prevent (AC-ANDROID-031).
 * @MX:REASON — spec.md §C.3-⑤/⑧ established that a broadcast fired before
 * the IME service finishes binding is silently dropped by the device even
 * though the adb command itself reports success; re-introducing an
 * "attempt anyway" fallback here would resurrect the exact defect this
 * amendment fixes.
 */
export class ImeBindTimeoutError extends Error {
  constructor(
    public readonly serial: string,
    timeoutMs: number,
  ) {
    super(
      `Timed out after ${timeoutMs}ms waiting for the ADBKeyBoard IME to finish binding on device '${serial}'. ` +
        "The text was NOT sent, to avoid the input being silently lost. Retry the command, or run 'doctor' first " +
        "to confirm ADBKeyBoard and adb are healthy on this device.",
    );
    this.name = "ImeBindTimeoutError";
  }
}
