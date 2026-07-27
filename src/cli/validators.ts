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

/** 소수(0 초과 1 이하)를 허용하는 정규식 — 정수 전용인 `^\d+$`로는 `--amount`의 비율 값을 받을 수 없다. */
const RATIO_PATTERN = /^\d+(\.\d+)?$/;

/**
 * `scroll --amount` 문자열을 0 초과 1 이하 비율로 파싱한다. 실패하거나
 * 범위를 벗어나면 `undefined`(REQ-GEST-SCROLL-003/006, SPEC-GESTURE-001
 * M3). 기존 `parseCoordinate`/`parseIndex`가 감싼 `parseNonNegativeInteger`
 * (정규식 `^\d+$`)는 소수를 통과시키지 못하므로 재사용할 수 없다 — 새
 * 파서가 필요하다(plan.md §F M3 item 2). 다만 거부 SHAPE(파싱 실패
 * 또는 범위 밖 모두 `undefined`)는 `parseDurationMs`와 동일하게 맞춰
 * `swipeCommand`/`scrollCommand`가 같은 구조의 rejection을 적용할 수
 * 있게 한다.
 */
export function parseRatio(value: string): number | undefined {
  if (!RATIO_PATTERN.test(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : undefined;
}
