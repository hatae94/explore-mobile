/**
 * Typed errors thrown by `installApp` (SPEC-INSTALL-001 M3, REQ-INSTALL-005).
 *
 * A new module for the same reason as `launch-errors.ts` / `gesture-errors.ts`:
 * these are install-path errors, unrelated to IME, launch, or gesture
 * lifecycles. Each carries a `code` so the CLI layer can surface a DISTINCT
 * error code (spec.md §C.3) rather than collapsing every install failure into
 * one generic code — the three below (signature / downgrade / unsupported)
 * each call for a different user action.
 */

/**
 * The installed app was signed with a different key than the APK being
 * installed. The upgrade path (spec.md §C.3) hits this whenever a submitter
 * rebuilds with a new key. Fix: re-sign with the original key.
 */
export class InstallSignatureMismatchError extends Error {
  public readonly code = "INSTALL_SIGNATURE_MISMATCH";
  constructor(
    public readonly packageId: string,
    public readonly raw: string,
  ) {
    super(
      `Cannot overwrite '${packageId}': the installed app and this APK are signed with different keys. ` +
        "Re-sign the APK with the original signing key.\nadb output:\n" +
        raw,
    );
    this.name = "InstallSignatureMismatchError";
  }
}

/**
 * The APK's `versionCode` is lower than the installed app's. Android refuses
 * a downgrade. Fix: bump the versionCode and rebuild.
 */
export class InstallVersionDowngradeError extends Error {
  public readonly code = "INSTALL_VERSION_DOWNGRADE";
  constructor(
    public readonly packageId: string,
    public readonly raw: string,
  ) {
    super(
      `Cannot overwrite '${packageId}': the APK's versionCode is lower than the installed version (downgrade refused). ` +
        "Raise the versionCode and rebuild.\nadb output:\n" +
        raw,
    );
    this.name = "InstallVersionDowngradeError";
  }
}

/**
 * An install failure that could not be classified. The raw adb output is
 * PRESERVED (spec.md §C.4 / AC-INSTALL-024) — the message does not assert a
 * single cause, mirroring `LauncherActivityNotFoundError`'s "present both
 * possibilities" discipline.
 */
export class InstallFailedError extends Error {
  public readonly code = "INSTALL_FAILED";
  constructor(public readonly raw: string) {
    super("Install failed. adb reported:\n" + raw);
    this.name = "InstallFailedError";
  }
}

/**
 * `installApp` was routed to the iOS backend. iOS APK install is out of this
 * SPEC's scope (spec.md §B.2 — this SPEC is Android-only), so the iOS backend
 * rejects EXPLICITLY rather than pretending — a silent no-op that answered
 * `ok:true` would be worse than an error for an agent caller (the same
 * discipline as `UnsupportedGestureOnAndroidError`).
 */
export class InstallUnsupportedOnIosError extends Error {
  public readonly code = "INSTALL_UNSUPPORTED_ON_IOS";
  constructor() {
    super(
      "APK install is not supported on iOS (SPEC-INSTALL-001 is Android-only). " +
        "Target an Android device with --device <serial>.",
    );
    this.name = "InstallUnsupportedOnIosError";
  }
}
