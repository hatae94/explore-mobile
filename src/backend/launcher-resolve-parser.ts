/**
 * Pure parser for `cmd package resolve-activity --brief -a
 * android.intent.action.MAIN -c android.intent.category.LAUNCHER <pkg>`
 * stdout (REQ-APP-001 개정 0.3.0, plan.md §F M11 산출물 1).
 *
 * @MX:NOTE — this parser deliberately looks ONLY at stdout, never at the
 * process exit code. Real-device measurement (spec.md §C.3-②) confirmed a
 * failed resolution still exits 0 — a caller keying on exit code alone
 * would misread failure as success.
 */

export type LauncherResolveResult =
  | { readonly resolved: true; readonly component: string }
  | { readonly resolved: false };

/**
 * The exact, real-device-observed single-line failure marker (spec.md
 * §C.3-②/③): emitted identically whether the package has no launcher
 * activity OR the package is not installed at all — the two causes are
 * indistinguishable from this output alone.
 */
const UNRESOLVED_MARKER = "No activity found";

/**
 * Success is real-device-observed as exactly TWO lines (a metadata line
 * plus the component on its own line); failure is a single `No activity
 * found` line. Both shapes reduce to the same rule: take the LAST
 * non-empty line, and treat it as unresolved iff it equals the failure
 * marker verbatim. The resolved activity MAY be a leading-dot relative
 * form (e.g. `com.sec.android.app.popupcalculator/.Calculator`) — this
 * parser passes it through unmodified; `am start -n` accepts that form
 * as-is (real-device-verified), so no expansion/normalization is
 * attempted here (spec.md §D.1 edge case — "정규화·확장 시도 금지").
 */
export function parseLauncherResolveOutput(stdout: string): LauncherResolveResult {
  const nonEmptyLines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (nonEmptyLines.length === 0) return { resolved: false };

  const lastLine = nonEmptyLines[nonEmptyLines.length - 1] as string;
  if (lastLine === UNRESOLVED_MARKER) return { resolved: false };

  return { resolved: true, component: lastLine };
}
