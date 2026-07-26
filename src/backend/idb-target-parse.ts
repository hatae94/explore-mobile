/**
 * Shared `idb list-targets --json` stdout parser.
 *
 * Both `IdbBackend.listDevices` (REQ-IOS-BACKEND-002) and
 * `IdbDoctor.checkSimulatorBooted` (REQ-IOS-DOCTOR-001) consume the exact
 * same output, so the shape knowledge lives here once instead of being
 * duplicated (and drifting) between them.
 *
 * @MX:ANCHOR — the single place that knows `idb list-targets --json`'s
 * document shape. Both the backend's device list and doctor's booted-check
 * depend on it.
 * @MX:REASON — the duplicated `JSON.parse(stdout)` this replaces was wrong in
 * BOTH copies (real output is JSONL, not a JSON array), which silently emptied
 * the device list and made every downstream iOS command fail with
 * NO_DEVICES_FOUND. One parser means one place to be right.
 */

/** Real fb-idb 1.1.7 output, confirmed against a booted simulator: one JSON object per line. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parses `idb list-targets --json` stdout into raw target records.
 *
 * Accepts BOTH shapes, so a version bump in either direction cannot silently
 * empty the device list:
 *   - JSONL (what fb-idb 1.1.7 actually emits): one JSON object per line,
 *     with no wrapping array.
 *   - A single whole-document JSON array or object (legacy/assumed shape).
 *
 * Unparseable lines are skipped rather than fatal (Secured — external tool
 * output): `idb` is unmaintained and version-pinned, so one drifted line must
 * not hide the valid targets alongside it. Returns `[]` when nothing parses,
 * letting each caller decide how to report that (an empty device list for the
 * backend, a diagnostic message for doctor).
 */
export function parseIdbTargets(stdout: string): Record<string, unknown>[] {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return [];

  // Whole-document form first: a JSON array (legacy shape), or the
  // single-target case where one JSONL line IS a complete JSON document.
  try {
    const whole: unknown = JSON.parse(trimmed);
    if (Array.isArray(whole)) return whole.filter(isRecord);
    if (isRecord(whole)) return [whole];
    return [];
  } catch {
    // Not one JSON document — fall through to line-by-line JSONL parsing.
  }

  const targets: Record<string, unknown>[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const candidate = line.trim();
    if (candidate.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed)) targets.push(parsed);
    } catch {
      // Drifted/partial line — skip it and keep the parseable ones.
      continue;
    }
  }
  return targets;
}
