/**
 * Pure parsers for `adb install` and `pm list packages` output
 * (SPEC-INSTALL-001 M3, REQ-INSTALL-004/005). Same family as
 * `launcher-resolve-parser.ts`: string in, verdict out, no subprocess.
 *
 * @MX:NOTE — classification keys on OUTPUT TOKENS, never on the exit code.
 * spec.md §C.2 recorded a launch-path measurement where a FAILED adb query
 * still exited 0; keying install success on exit code alone would trust the
 * exact signal the SPEC says is unreliable (AC-INSTALL-025). The final
 * classification basis is confirmed by M5 real-device measurement (spec.md
 * §C.4); until then this is provisional and errs toward `failed` (never a
 * false success).
 */

/** The outcome of reading `adb install` output. */
export type InstallClassification =
  | { ok: true }
  | { ok: false; kind: "signature" | "downgrade" | "failed"; raw: string };

// Modern adb prints `Success` on success and `Failure [INSTALL_FAILED_...]`
// (or `adb: failed to install ...`) on failure. Match tokens, not exit code.
const FAILURE_RE = /Failure|INSTALL_FAILED|INSTALL_PARSE_FAILED|failed to install/i;
const SUCCESS_RE = /\bSuccess\b/;
const SIGNATURE_RE = /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES|INSTALL_FAILED_SHARED_USER_INCOMPATIBLE/i;
const DOWNGRADE_RE = /INSTALL_FAILED_VERSION_DOWNGRADE/i;

/**
 * Classifies combined stdout+stderr of `adb install`. A failure token wins
 * over a success token (so an exit-0 response that nonetheless says `Failure`
 * is a failure — AC-INSTALL-025). Insufficient-storage is deliberately NOT
 * classified here: spec.md AC-INSTALL-036 forbids emitting
 * `INSTALL_INSUFFICIENT_STORAGE` until its string is observed on a real
 * device, so a storage failure falls through to `failed` with its raw output
 * preserved.
 */
export function classifyInstallOutput(combined: string): InstallClassification {
  const isFailure = FAILURE_RE.test(combined);
  if (!isFailure && SUCCESS_RE.test(combined)) {
    return { ok: true };
  }
  const raw = combined.trim();
  if (SIGNATURE_RE.test(combined)) return { ok: false, kind: "signature", raw };
  if (DOWNGRADE_RE.test(combined)) return { ok: false, kind: "downgrade", raw };
  return { ok: false, kind: "failed", raw };
}

/**
 * Whether `pm list packages <filter>` output contains an EXACT match for
 * `packageId`. `pm list packages` filters by substring, so `com.foo` also
 * lists `com.foobar` — matching the raw output loosely would misreport a
 * fresh install as an upgrade. Each line is `package:<name>`; an exact match
 * requires `package:<packageId>` verbatim.
 */
export function pmListHasExactPackage(stdout: string, packageId: string): boolean {
  const target = `package:${packageId}`;
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line === target);
}
