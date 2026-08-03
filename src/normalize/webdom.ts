/**
 * Web DOM normalization (REQ-WEB-NORM-001..004, SPEC-WEBVIEW-001) — a pure
 * function converting elements collected from a page into the common element
 * schema. It was written to mirror the two native normalizers that existed
 * at the time; SPEC-VISION-001 M2 removed both along with the UI-tree read
 * path, leaving this as the only normalizer. No device, proxy, or page is
 * involved: given the same input it always returns the same result,
 * unit-testable with fixtures alone (AC-WEB-009).
 *
 * @MX:ANCHOR — invariant mapping contract for the web recognition path
 * (`dump --web`, and the selector lookup behind `tap --web` / `text --web`).
 * @MX:REASON — the field mapping is spec.md §F; changing it silently changes
 * what every web selector matches against.
 */

import type { CommonElement, ElementBounds } from "../schema/common-element.js";

const DEFAULT_BOUNDS: ElementBounds = { x: 0, y: 0, w: 0, h: 0 };

/** HTML tags that are interactive without needing an ARIA role or handler. */
const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary"]);

/** ARIA roles that make an otherwise inert element interactive. */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "switch",
  "textbox",
  "combobox",
  "option",
]);

/**
 * Default query for `dump --web`: the interactive surface of a page.
 *
 * Deliberately NOT `*` — the spike measured 486 `a,button,input` elements on
 * one naver.com screen, and widening that to every node would bury the
 * tappable ones. Roles are listed explicitly rather than as `[role]`, which
 * would sweep in presentational roles.
 */
export const DEFAULT_WEB_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[onclick]",
  ...[...INTERACTIVE_ROLES].map((role) => `[role=${role}]`),
].join(",");

/** One raw element as the in-page collector emits it. Fields are `unknown`: this crosses a JSON/protocol boundary at runtime. */
interface RawWebElement {
  tag?: unknown;
  role?: unknown;
  text?: unknown;
  label?: unknown;
  placeholder?: unknown;
  id?: unknown;
  rect?: unknown;
  disabled?: unknown;
  onclick?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Parses the collector's `{x,y,w,h}` rect. Any missing/non-numeric field degrades to the zero rectangle, which the visibility filter then drops. */
function parseBounds(raw: unknown): ElementBounds {
  if (!isRecord(raw)) return { ...DEFAULT_BOUNDS };

  const { x, y, w, h } = raw;
  if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number") {
    return { ...DEFAULT_BOUNDS };
  }

  return { x, y, w, h };
}

/** `tagName` lowercased (primary), falling back to the `role` attribute when the tag is unavailable (spec.md §F). */
function deriveRole(el: RawWebElement): string {
  const tag = stringField(el.tag).toLowerCase();
  if (tag.length > 0) return tag;
  return stringField(el.role).toLowerCase();
}

/**
 * `textContent` (primary), then `aria-label`, then `placeholder` — the same
 * fallback shape as Android's `text` -> `content-desc` chain, so a `--text`
 * selector behaves the same way on both platforms.
 */
function deriveText(el: RawWebElement): string {
  const text = stringField(el.text).trim();
  if (text.length > 0) return text;

  const label = stringField(el.label).trim();
  if (label.length > 0) return label;

  return stringField(el.placeholder).trim();
}

/**
 * tappable = (interactive tag OR interactive ARIA role OR an onclick
 * handler) AND enabled — semantically symmetric with Android's
 * `clickable && enabled` and iOS's interactive-type derivation.
 *
 * @MX:NOTE — handlers attached with `addEventListener` are invisible to this
 * check: the DOM exposes no way to enumerate them. A `div` wired up that way
 * reports `tappable: false` while still being clickable. That is a
 * false-negative (a caller can still tap it by coordinates), never a
 * false-positive, which is the safer direction to be wrong in.
 */
function deriveTappable(el: RawWebElement, enabled: boolean): boolean {
  if (!enabled) return false;

  if (INTERACTIVE_TAGS.has(stringField(el.tag).toLowerCase())) return true;
  if (INTERACTIVE_ROLES.has(stringField(el.role).toLowerCase())) return true;

  return el.onclick === true;
}

function toCommonElement(el: RawWebElement): CommonElement {
  const enabled = el.disabled !== true;

  return {
    role: deriveRole(el),
    text: deriveText(el),
    id: stringField(el.id),
    bounds: parseBounds(el.rect),
    tappable: deriveTappable(el, enabled),
    enabled,
    // Flat, like `describe-all`: selector queries are the access path here,
    // so reconstructing the DOM tree would add cost without a consumer.
    children: [],
  };
}

/** A normalized element paired with its position in the collected (unfiltered) input. */
export interface IndexedWebElement {
  element: CommonElement;
  /** Index into the array the in-page collector returned — i.e. the Nth match of the CSS selector, counting invisible ones. */
  sourceIndex: number;
}

/**
 * Like {@link normalizeWebDom}, but keeps each element's position in the
 * unfiltered input.
 *
 * @MX:ANCHOR — the JS `click()` fallback re-queries the page with the same
 * CSS selector and indexes into the RAW match list, which still contains the
 * invisible elements this normalizer drops.
 * @MX:REASON — using the filtered position there would click a different
 * element than the one that was selected, silently and only on pages that
 * happen to contain hidden matches. `sourceIndex` is what keeps the two
 * sides addressing the same node.
 */
export function normalizeWebDomIndexed(collected: unknown): IndexedWebElement[] {
  // Runtime boundary guard: this arrives as JSON over the inspector
  // protocol, so it is not guaranteed to satisfy the compile-time contract.
  if (!Array.isArray(collected)) return [];

  const results: IndexedWebElement[] = [];
  for (let sourceIndex = 0; sourceIndex < collected.length; sourceIndex++) {
    const raw: unknown = collected[sourceIndex];
    if (!isRecord(raw)) continue;
    try {
      const element = toCommonElement(raw as RawWebElement);
      if (element.bounds.w <= 0 || element.bounds.h <= 0) continue;
      results.push({ element, sourceIndex });
    } catch {
      // Defensive: one element failing to map is skipped rather than
      // aborting the whole normalization (REQ-WEB-NORM-004).
    }
  }
  return results;
}

/**
 * Normalizes collected web elements into the common element schema
 * (REQ-WEB-NORM-001), dropping the ones that are not visible
 * (REQ-WEB-NORM-002).
 *
 * Never throws (REQ-WEB-NORM-004): non-array input, a malformed entry, or
 * missing fields degrade to a safe result rather than raising.
 *
 * An element with no readable geometry is dropped rather than reported at
 * (0,0): it cannot be a tap target, and reporting it at the screen corner
 * would invite a tap on whatever happens to be there.
 */
export function normalizeWebDom(collected: unknown): CommonElement[] {
  return normalizeWebDomIndexed(collected).map((entry) => entry.element);
}

/**
 * Builds the in-page expression that collects elements for
 * {@link normalizeWebDom}. The two are a contract pair — the property names
 * emitted here are exactly the ones the normalizer reads.
 *
 * @MX:WARN — `cssSelector` is caller-supplied and is embedded into JavaScript
 * that runs in the page.
 * @MX:REASON — it is inserted via `JSON.stringify`, which produces a properly
 * escaped JS string literal, so a selector cannot close the literal and append
 * statements. String concatenation here would be an injection hole; keep the
 * `JSON.stringify` call.
 *
 * An invalid selector makes `querySelectorAll` throw, which surfaces through
 * the inspector as `wasThrown` and becomes a `WebInspectorEvaluationError` —
 * a reported failure, not a silently empty result.
 */
export function buildCollectExpression(cssSelector: string = DEFAULT_WEB_SELECTOR): string {
  return `(function(){
  var out = [];
  var nodes = document.querySelectorAll(${JSON.stringify(cssSelector)});
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var r = n.getBoundingClientRect();
    out.push({
      tag: (n.tagName || "").toLowerCase(),
      role: n.getAttribute("role") || "",
      text: (n.textContent || "").trim(),
      label: n.getAttribute("aria-label") || "",
      placeholder: n.getAttribute("placeholder") || "",
      id: n.id || "",
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      disabled: n.disabled === true || n.getAttribute("aria-disabled") === "true",
      onclick: n.getAttribute("onclick") !== null
    });
  }
  return out;
})()`;
}
