/**
 * Input validation at the CLI trust boundary (Secured). These run BEFORE
 * any value reaches the adb wrapper — `child_process.spawn` with an argv
 * array already prevents shell injection (see backend/adb-executor.ts),
 * but validating shape here rejects obviously malformed input early with
 * a clear graceful error instead of a confusing adb-level failure.
 */

const PACKAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** Loose Android package-name check: reverse-DNS-style dotted segments. */
export function isValidPackageName(value: string): boolean {
  return PACKAGE_NAME_PATTERN.test(value);
}

/** Parses a string as a non-negative integer, or undefined if invalid. */
function parseNonNegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Parses a coordinate string into a non-negative integer, or undefined if invalid. */
export function parseCoordinate(value: string): number | undefined {
  return parseNonNegativeInteger(value);
}

/** Parses a `--index` selector-match string into a non-negative integer, or undefined if invalid (element-selector interaction, new capability). */
export function parseIndex(value: string): number | undefined {
  return parseNonNegativeInteger(value);
}

/**
 * Parses a `swipe --duration` string into a non-negative integer of
 * milliseconds, or undefined if invalid (REQ-GEST-SWIPE-005,
 * SPEC-GESTURE-001 M2). Deliberately reuses the same
 * `parseNonNegativeInteger` seam as `parseCoordinate`/`parseIndex` — the
 * three rejection paths (coordinates, `--duration`, and M3's `--amount`)
 * must not diverge in shape (plan.md §F M2 item 3).
 */
export function parseDurationMs(value: string): number | undefined {
  return parseNonNegativeInteger(value);
}
