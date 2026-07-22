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
