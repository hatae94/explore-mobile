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

/**
 * Parses a string as a positive integer (`>= 1`), or undefined if invalid.
 * Deliberately a SEPARATE predicate from `parseNonNegativeInteger` (SPEC-GESTURE-001
 * M6, F3/AC-GEST-019) — `0` must be valid for coordinates (`parseCoordinate`)
 * but invalid for `--duration` (`parseDurationMs`). Sharing one predicate
 * between the two would make AC-GEST-003 (coordinate `0` valid) and
 * AC-GEST-019 (`--duration 0` rejected) mutually exclusive.
 */
function parsePositiveInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
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
 * Upper bound for `swipe --duration`, in milliseconds (REQ-GEST-SWIPE-005,
 * SPEC-GESTURE-001 M7/0.5.0 amendment — C-4). Unlike the per-platform
 * swipe-movement threshold (`DeviceBackend.getMinEffectiveSwipeThreshold` —
 * `AdbBackend`'s density-derived slop, `WdaBackend`'s measured constant,
 * SPEC-GESTURE-001 M8), this is a DESIGN CHOICE, not a measured value —
 * spec.md's reasoning: (i) beyond this a gesture is no longer a swipe but a
 * long-press-drag, which §D already puts out of scope; (ii) the goal is
 * only "no infinite hang", so a generous-but-finite ceiling is sufficient;
 * (iii) this makes no device-behavior claim, so no measurement obligation
 * attaches (contrast with the touch-slop floor, which does).
 *
 * 60,000ms (60s) is the SPEC's recommended value — no legitimate swipe
 * scenario needs longer, and no real device scenario reaches it.
 *
 * @MX:NOTE: [AUTO] 60000이라는 값은 설계 선택이지 실측값이 아니다 -- 다른 값을 택하려면 spec.md REQ-GEST-SWIPE-005의 근거(롱프레스-드래그와의 경계, 무한 정지 방지 목적)를 재검토해야 한다
 */
export const MAX_DURATION_MS = 60_000;

/**
 * Parses a `swipe --duration` string into a bounded positive integer of
 * milliseconds, or undefined if invalid (REQ-GEST-SWIPE-005,
 * SPEC-GESTURE-001 M6/0.4.0 + M7/0.5.0 amendments — F3, C-4).
 *
 * 0.3.0 used `parseNonNegativeInteger` here (same seam as
 * `parseCoordinate`/`parseIndex`), so `--duration 0` parsed to `0` and the
 * command returned `{"ok":true, ..., "durationMs":0}` — a REQ defect, not
 * an implementation defect: a zero-duration gesture cannot move anything,
 * but the 0.3.0 REQ text said "non-negative integer" and the implementation
 * correctly followed it. 0.4.0 narrows REQ-GEST-SWIPE-005 to "positive
 * integer", so this parser switches to `parsePositiveInteger` — a
 * DELIBERATELY SEPARATE predicate from `parseCoordinate`'s
 * `parseNonNegativeInteger` (AC-GEST-019: coordinate `0` stays valid,
 * `--duration 0` does not; sharing one predicate would make AC-GEST-003 and
 * AC-GEST-019 mutually exclusive). The rejection SHAPE (parse failure or
 * out-of-range both return `undefined`) still matches `parseRatio`'s, so
 * `swipeCommand`/`scrollCommand` apply the same structure of rejection.
 *
 * 0.5.0 (M7, AC-GEST-025) adds the upper bound: an unbounded duration let
 * `--duration 1e24` hang a command indefinitely (spec.md §C.1-⑮ — measured,
 * forced kill required). `parsePositiveInteger`'s underlying `^\d+$` regex
 * already rejects exponential notation like `"1e24"` lexically (it is not
 * all-decimal-digits), so that half of the fix predates this change; what
 * was missing was a ceiling on purely-numeric values (e.g. a huge
 * all-digits string). The check runs on the PARSED numeric value, matching
 * every other validator in this module.
 */
export function parseDurationMs(value: string): number | undefined {
  const n = parsePositiveInteger(value);
  return n !== undefined && n <= MAX_DURATION_MS ? n : undefined;
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
