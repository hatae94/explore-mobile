/**
 * Pure version selector for Android SDK `build-tools/<version>/` directories
 * (SPEC-INSTALL-001 plan.md §A.2 M1, AC-INSTALL-013).
 *
 * `adb` lives at a fixed `platform-tools/adb` path, but `aapt`/`aapt2` live
 * under a *versioned* `build-tools/<version>/` directory — the host observed
 * on 2026-08-29 had three (`35.0.0`, `36.0.0`, `36.1.0`). This module owns
 * the one new sub-problem that `adb` path resolution never had: picking which
 * version to use.
 *
 * The comparison is by NUMERIC component, never by string. A string compare
 * ranks `"9.0.0"` above `"36.1.0"` (because `'9' > '3'`), which would pick a
 * years-old build-tools over the newest — AC-INSTALL-013's negative control
 * exists precisely to catch that regression.
 */

/** A build-tools directory name that parses as a pure dotted-numeric version. */
const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/**
 * Picks the highest version from a list of `build-tools` directory names.
 * Entries that are not pure dotted-numeric (`36.1.0`) are ignored — a
 * `build-tools` directory can hold stray files or preview dirs that are not
 * usable version roots. Returns `null` when no entry qualifies.
 */
export function pickHighestBuildToolsVersion(versions: readonly string[]): string | null {
  let best: string | null = null;
  for (const candidate of versions) {
    if (!VERSION_PATTERN.test(candidate)) continue;
    if (best === null || compareNumericVersion(candidate, best) > 0) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Compares two dotted-numeric version strings component-by-component.
 * A missing trailing component counts as 0, so `36.1` == `36.1.0`.
 * Returns >0 if `a` is newer, <0 if `b` is newer, 0 if equal.
 */
function compareNumericVersion(a: string, b: string): number {
  const aParts = a.split(".");
  const bParts = b.split(".");
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i++) {
    const aVal = Number(aParts[i] ?? "0");
    const bVal = Number(bParts[i] ?? "0");
    if (aVal !== bVal) return aVal - bVal;
  }
  return 0;
}
