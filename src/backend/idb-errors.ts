/**
 * Distinct error types thrown by `IdbBackend` (SPEC-IOS-001), mirroring
 * the `ime-errors.ts` pattern: a `code` property lets a caller
 * `instanceof`-check + surface a dedicated JSON error code instead of a
 * generic failure message.
 */

/**
 * Thrown when an idb subprocess invocation exits non-zero
 * (REQ-IOS-ERR-002). Carries the backend-detail code `IDB_COMMAND_FAILED`
 * — per the D7 error-code priority (spec.md §C.3): the CLI command layer's
 * terminal catch always surfaces `BACKEND_COMMAND_FAILED` as the top-level
 * envelope code; this error's `code`/`message` are the backend-detail
 * carried in `error.message`/`error.details`, never the top-level code.
 *
 * @MX:WARN — a thrown-but-uncaught instance means the idb subprocess
 * failed; device state is left unchanged (no partial side effects —
 * REQ-IOS-ERR-002).
 * @MX:REASON — idb is an unmaintained tool (research.md §4); surfacing its
 * stderr distinctly is what lets a caller diagnose an idb-specific failure
 * (e.g. `idb_companion` not running) versus a generic subprocess error.
 */
export class IdbCommandFailedError extends Error {
  public readonly code = "IDB_COMMAND_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "IdbCommandFailedError";
  }
}

/**
 * Thrown when `sendKeyEvent` is given a key alias with no iOS HID keycode
 * mapping (REQ-IOS-BACKEND-007) — e.g. `home`/`back`/`menu`/`app_switch`/
 * `power`/`volume_up`/`volume_down`, which have no hardware-keyboard
 * equivalent on iOS. This is a graceful REJECT, never a silent no-op — the
 * caller must be told the key was not sent (spec.md §C.2).
 */
export class UnsupportedKeyOnIosError extends Error {
  public readonly code = "UNSUPPORTED_KEY_ON_IOS";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedKeyOnIosError";
  }
}
