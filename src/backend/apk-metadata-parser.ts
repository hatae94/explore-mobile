/**
 * Pure parser for `aapt2 dump badging <apk>` stdout (SPEC-INSTALL-001 M2,
 * REQ-INSTALL-002). Same family as `launcher-resolve-parser.ts`: it knows a
 * string, never a process — so it is unit-testable with no aapt binary.
 *
 * The 2026-08-29 real-device-observed shape (spec.md §A.2 실측 ②): the FIRST
 * line of `aapt2 dump badging` is a single `package:` line carrying all three
 * fields we need:
 *
 *   package: name='com.hatae.moyura' versionCode='1' versionName='1.0.0' \
 *     platformBuildVersionName='16' compileSdkVersion='36' ...
 *
 * One `aapt2 dump badging` call yields package + versionCode + versionName
 * together, so M2 does not need the separate `dump packagename` call the plan
 * first sketched — fewer subprocess boundaries, one parse.
 *
 * @MX:NOTE — this parser keys on the PRESENCE of a well-formed `package:` line
 * with a `name`, NOT on any exit code. spec.md §C.2/§C.4 warned that exit
 * codes in this tool family can mislead; a caller that keyed on exit code
 * alone would be trusting the exact signal the SPEC says not to. A valid
 * badging dump always carries this line; invalid input produces an
 * `error: failed opening zip` line and no `package:` line (2026-08-29 real
 * observation), so absence-of-package-line IS the invalid signal.
 */

/** The three fields extracted from an APK's badging dump. */
export interface ApkMetadata {
  readonly packageName: string;
  readonly versionCode: string;
  readonly versionName: string;
}

/** Matches `name='...'` / `versionCode='...'` / `versionName='...'` on the `package:` line. */
const NAME_RE = /\bname='([^']*)'/;
const VERSION_CODE_RE = /\bversionCode='([^']*)'/;
const VERSION_NAME_RE = /\bversionName='([^']*)'/;

/**
 * Extracts package metadata from `aapt2 dump badging` stdout. Returns `null`
 * when no usable `package:` line with a non-empty `name` is present — the
 * caller surfaces that as `APK_INVALID`. `versionCode`/`versionName` may be
 * absent on some APKs; they default to `""` rather than failing the parse,
 * since a missing version is not a "this is not an APK" signal.
 */
export function parseApkBadging(stdout: string): ApkMetadata | null {
  const packageLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("package:"));

  if (packageLine === undefined) return null;

  const nameMatch = NAME_RE.exec(packageLine);
  const packageName = nameMatch?.[1] ?? "";
  if (packageName.length === 0) return null;

  return {
    packageName,
    versionCode: VERSION_CODE_RE.exec(packageLine)?.[1] ?? "",
    versionName: VERSION_NAME_RE.exec(packageLine)?.[1] ?? "",
  };
}
