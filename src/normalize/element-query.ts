/**
 * Element query — pure selector matching over a {@link CommonElement} tree.
 *
 * This is a NEW capability beyond SPEC-ANDROID-001's original coordinate-
 * only input primitives (REQ-INPUT-001/002/003) — added to support
 * real-device automation where a caller cannot manually determine pixel
 * coordinates ahead of time. See the SPEC-scope flag raised alongside this
 * change; no REQ id is claimed here pending an orchestrator scope decision.
 *
 * No device, subprocess, or I/O is involved: given the same tree and
 * selector, this always returns the same result, matching the
 * normalize/uiautomator.ts pure-function pattern (unit-testable with
 * in-memory fixtures alone).
 *
 * @MX:NOTE — when a selector supplies BOTH `id` and `text`, matching uses
 * AND semantics (an element must satisfy every given criterion) rather
 * than OR — a caller narrowing by both fields expects the narrower match,
 * not a broader one.
 */

import type { CommonElement } from "../schema/common-element.js";

/**
 * Selector describing which element to find in a {@link CommonElement}
 * tree. `id` and `text` are exact matches; `text` is trimmed before
 * comparison. Since the uiautomator normalizer folds Android's
 * `content-desc` into `text` whenever `text` itself is empty (see
 * normalize/uiautomator.ts), matching on `text` also matches
 * content-desc-derived text — there is no separate content-desc field to
 * select on.
 */
export interface ElementSelector {
  /** Exact match against `CommonElement.id` (Android resource-id). */
  id?: string;
  /** Exact, trimmed match against `CommonElement.text` (also matches content-desc-derived text). */
  text?: string;
  /** 0-based index into the ordered set of matches, when more than one element satisfies `id`/`text`. Defaults to 0 (the first match). */
  index?: number;
}

function matchesSelector(el: CommonElement, selector: ElementSelector): boolean {
  if (selector.id !== undefined && el.id !== selector.id) return false;
  if (selector.text !== undefined && el.text.trim() !== selector.text.trim()) return false;
  return true;
}

/** Depth-first pre-order collection of every element satisfying selector's `id`/`text` criteria (ignoring `index`). */
function collectMatches(roots: CommonElement[], selector: ElementSelector, acc: CommonElement[]): void {
  for (const el of roots) {
    if (matchesSelector(el, selector)) acc.push(el);
    collectMatches(el.children, selector, acc);
  }
}

/**
 * Finds the element matching `selector` via a depth-first pre-order walk
 * of `roots`. The first match wins unless `selector.index` selects the
 * Nth match (0-based) among all matches.
 *
 * An unconstrained selector (`id` and `text` both omitted) matches
 * nothing — it never falls back to "match everything", which would make
 * an accidentally-empty selector silently tap/focus the first element in
 * the tree.
 *
 * Returns `null` when no element matches, or when `index` is out of
 * range for the number of matches found.
 */
export function findElement(roots: CommonElement[], selector: ElementSelector): CommonElement | null {
  if (selector.id === undefined && selector.text === undefined) return null;

  const matches: CommonElement[] = [];
  collectMatches(roots, selector, matches);

  const index = selector.index ?? 0;
  return matches[index] ?? null;
}

/** Computes the pixel-space center point of an element's bounding rectangle, rounded to the nearest device pixel. */
export function elementCenter(el: CommonElement): { x: number; y: number } {
  return {
    x: Math.round(el.bounds.x + el.bounds.w / 2),
    y: Math.round(el.bounds.y + el.bounds.h / 2),
  };
}
