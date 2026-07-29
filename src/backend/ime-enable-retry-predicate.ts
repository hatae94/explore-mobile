/**
 * Pure predicate distinguishing the `ime enable` REGISTRATION-RACE failure
 * shape (REQ-INPUT-003 개정 0.3.0 M12, plan.md §F M12 산출물 1) from every
 * other `ime enable` failure. Only a match is safe to retry — any other
 * failure (permission denied, incompatible API level, device offline, ...)
 * MUST surface immediately, with no retry (AC-ANDROID-034). This predicate
 * is the gate that keeps the M12 retry from becoming a swallow-everything
 * loop: widening the match to "any `ime enable` failure" would delay a
 * REAL, unrelated failure by the whole retry ceiling and then report it
 * with its cause obscured behind an irrelevant retry history (plan.md §F
 * M12 안티패턴).
 *
 * The representative fixture is the ONE real-device failure this predicate
 * exists to match (spec.md §C.3-⑫), captured verbatim with the package
 * confirmed installed in the SAME call (`pm list packages` count 0 -> 1):
 *
 *   exit 255: "Unknown input method com.android.adbkeyboard/.AdbIME
 *   cannot be enabled for user #0"
 *
 * i.e. the package install just succeeded, but the IMMS (Input Method
 * Manager Service) has not yet registered the newly-installed IME — a
 * transient, self-clearing condition, NOT a missing/uninstalled package.
 */
const UNKNOWN_INPUT_METHOD_PATTERN = /Unknown input method .* cannot be enabled for user #\d+/;

/** The minimal shape this predicate needs — just the three fields `assertSuccess` already inspects, kept structural (not `AdbExecResult` itself) so this pure function has no import-time dependency on the executor module. */
export interface ImeEnableResult {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

/**
 * Returns `true` only when `result` matches the registration-race shape
 * above. Checked against BOTH stdout and stderr — which stream carries the
 * message is not itself part of this SPEC's measured contract (the
 * verbatim fixture above was observed via the CLI's already-formatted
 * error text, not a raw stream capture), so matching either stream is the
 * conservative choice that does not depend on a stream placement this SPEC
 * never pinned down. A zero exit code is never a failure of any kind, so
 * it is never a match — retry only ever triggers on an actual failure.
 */
export function isImeEnableRegistrationRaceFailure(result: ImeEnableResult): boolean {
  if (result.exitCode === 0) return false;
  const combinedOutput = `${result.stdout.toString("utf-8")}\n${result.stderr.toString("utf-8")}`;
  return UNKNOWN_INPUT_METHOD_PATTERN.test(combinedOutput);
}
