/**
 * idb accessibility normalization (REQ-IOS-NORM-001~005, SPEC-IOS-001) — a
 * pure function converting idb's `ui describe-all` JSON into the common
 * element schema, mirroring `normalize/uiautomator.ts`'s pure-function
 * pattern. No device, subprocess, or I/O is involved: given the same JSON
 * it always returns the same result, unit-testable with fixtures alone
 * (AC-IOS-004/005/006).
 *
 * @MX:ANCHOR — invariant mapping contract for the iOS recognition path
 * (`IdbBackend.dumpUiHierarchy`) and the `tappable` derivation policy.
 * @MX:REASON — verified against idb's real `describe-all` JSON output
 * (research.md §2): the field is named `enabled` (NOT `isEnabled`), and
 * `AXTraits` does NOT exist in idb's output — the original SPEC-ANDROID-001
 * §F.9.1 assumption was wrong. `tappable` is instead derived from
 * `type`/`role`/`subrole`/`custom_actions` + `enabled` (design.md §F.3).
 * The `INTERACTIVE_TYPES` set below is a Run-phase best-guess (plan.md
 * §B.0 — gate decision DEFER) pending real-simulator observation.
 */

import type { CommonElement, ElementBounds } from "../schema/common-element.js";

const DEFAULT_BOUNDS: ElementBounds = { x: 0, y: 0, w: 0, h: 0 };

/**
 * idb `type` values known to be interactive (design.md §F.3).
 * `role`/`subrole` are checked case-insensitively against the same
 * vocabulary as a fallback when `type` is absent or unrecognized.
 *
 * @MX:NOTE — partially confirmed on a real simulator (2026-07-26, iOS 26.0):
 * `describe-all` emitted `Application`, `Group`, `StaticText`, `Button`,
 * `TextField`, and `Heading`. `Button` and `TextField` were correctly derived
 * as tappable; the non-interactive types were correctly excluded.
 * @MX:TODO — `Cell`, `Switch`, and `Link` are still unobserved: the screens
 * exercised so far (home screen, Safari chrome) contain none, and web page
 * content does not appear in the accessibility tree at all. Confirm them
 * against a native app with a table view / toggle before treating this set as
 * complete. A `Slider` was observed on the home screen and is arguably
 * interactive, but was deliberately left out pending a real use case.
 */
const INTERACTIVE_TYPES = new Set(["Button", "Cell", "TextField", "Switch", "Link"]);

/** One raw idb accessibility element, as documented in research.md §2. Fields are optional/untyped since this crosses a subprocess/JSON boundary at runtime. */
interface RawIdbElement {
  frame?: unknown;
  AXUniqueId?: unknown;
  AXLabel?: unknown;
  type?: unknown;
  role?: unknown;
  subrole?: unknown;
  enabled?: unknown;
  custom_actions?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parses idb's `frame: {x,y,width,height}` (numeric, float-capable) into `{x,y,w,h}`. Any missing/non-numeric field falls back to the zero-rectangle rather than throwing (REQ-IOS-NORM-005). */
function parseBounds(raw: unknown): ElementBounds {
  if (!isRecord(raw)) return { ...DEFAULT_BOUNDS };

  const x = raw["x"];
  const y = raw["y"];
  const width = raw["width"];
  const height = raw["height"];

  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") {
    return { ...DEFAULT_BOUNDS };
  }

  return { x, y, w: width, h: height };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** `role` -> `type` (primary source, e.g. "Button"), falling back to `role` (AX-prefixed, e.g. "AXButton") when `type` is absent (design.md §F.1, research.md §2). */
function deriveRole(el: RawIdbElement): string {
  const type = stringField(el.type);
  if (type.length > 0) return type;
  return stringField(el.role);
}

/** Case-insensitive membership check against INTERACTIVE_TYPES for a type/role/subrole-shaped string. */
function isInteractiveToken(value: unknown): boolean {
  const token = stringField(value);
  if (token.length === 0) return false;
  for (const candidate of INTERACTIVE_TYPES) {
    if (candidate.toLowerCase() === token.toLowerCase()) return true;
    // idb's AX-prefixed `role` values (e.g. "AXButton") carry the type name
    // as a suffix — match that shape too.
    if (token.toLowerCase() === `ax${candidate.toLowerCase()}`) return true;
  }
  return false;
}

/**
 * Derives `tappable` (design.md §F.3, REQ-IOS-NORM-004 — corrected: idb's
 * real output has NO `AXTraits` field, so this does NOT reference it):
 *
 *   tappable = (type/role/subrole indicates interactive OR custom_actions
 *               is non-empty) AND enabled === true
 *
 * Semantically symmetric with Android's `clickable && enabled -> tappable`.
 */
function deriveTappable(el: RawIdbElement): boolean {
  const enabled = el.enabled === true;
  if (!enabled) return false;

  const interactive =
    isInteractiveToken(el.type) || isInteractiveToken(el.role) || isInteractiveToken(el.subrole);
  if (interactive) return true;

  return Array.isArray(el.custom_actions) && el.custom_actions.length > 0;
}

function toCommonElement(el: RawIdbElement): CommonElement {
  return {
    role: deriveRole(el),
    text: stringField(el.AXLabel),
    id: stringField(el.AXUniqueId),
    bounds: parseBounds(el.frame),
    tappable: deriveTappable(el),
    enabled: el.enabled === true,
    // describe-all is a FLAT array, not a nested tree (REQ-IOS-NORM-003,
    // research.md §2) — every element's children is always empty.
    children: [],
  };
}

/**
 * Normalizes idb's `ui describe-all` JSON output into the common element
 * schema (REQ-IOS-NORM-002). Pure function — no device or I/O required,
 * safe to call with only a saved JSON fixture.
 *
 * Never throws (REQ-IOS-NORM-005): non-array input, a single malformed
 * element, or missing fields all degrade to a safe result (an empty array,
 * or the array with that element mapped defensively) rather than raising.
 */
export function normalizeIdbAccessibility(json: unknown): CommonElement[] {
  // Runtime boundary guard: idb's JSON crosses a subprocess boundary, so it
  // is not guaranteed to satisfy the compile-time contract at runtime
  // (Secured — validate external input).
  if (!Array.isArray(json)) return [];

  const results: CommonElement[] = [];
  for (const raw of json) {
    if (!isRecord(raw)) continue;
    try {
      results.push(toCommonElement(raw as RawIdbElement));
    } catch {
      // Defensive: an individual element failing to map is skipped rather
      // than aborting the whole normalization (REQ-IOS-NORM-005).
    }
  }
  return results;
}
