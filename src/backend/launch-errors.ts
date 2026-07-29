/**
 * Distinct error type thrown by `AdbBackend.launchApp` when the launcher
 * component resolve query cannot resolve a launcher activity for a package
 * (REQ-APP-001 개정 0.3.0, plan.md §F M11 산출물 3).
 *
 * A separate module from `ime-errors.ts` — this is a launch-path error,
 * unrelated to IME lifecycle, and grouping it under the IME-named file
 * would be a poor semantic fit (plan.md §A.6: "파일명이 ime-errors라
 * 어울리지 않으면 신규 모듈").
 */

/**
 * Thrown when `cmd package resolve-activity` reports no launcher activity
 * for the target package (real-device-observed single line `No activity
 * found`, exit code 0 — spec.md §C.3-②). Deliberately a distinct error
 * TYPE (not a generic failure) so the CLI layer can `instanceof`-check it
 * and surface `LAUNCHER_ACTIVITY_NOT_FOUND` instead of collapsing every
 * launch failure into the generic `BACKEND_COMMAND_FAILED`.
 *
 * The message MUST NOT assert which of two indistinguishable causes
 * applies (spec.md §C.3-③, real-device-measured): "package has no
 * launcher activity" and "package is not installed" both produce the
 * IDENTICAL `No activity found` resolve-query output — this error
 * presents both possibilities rather than picking one.
 *
 * @MX:WARN — a thrown instance means NO start intent was sent to the
 * device; the caller MUST NOT fall back to any implicit-intent (`-p`)
 * launch path on this error.
 * @MX:REASON — spec.md §C.3-①/② established that a resolve failure and a
 * resolve success are only distinguishable via stdout content (never exit
 * code), and a resolve failure must never reach `am start` at all —
 * reverting to a best-effort implicit `-p` launch here would resurrect
 * the exact defect this milestone fixes (DEFAULT-undeclared packages
 * silently failing to open).
 */
export class LauncherActivityNotFoundError extends Error {
  constructor(public readonly packageId: string) {
    super(
      `Could not resolve a launcher activity for package '${packageId}'. ` +
        "This can mean EITHER the package has no launcher activity declared OR the package is not installed " +
        "— both cases produce identical resolve output and cannot be distinguished from it alone.",
    );
    this.name = "LauncherActivityNotFoundError";
  }
}
