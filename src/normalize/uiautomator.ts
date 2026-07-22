/**
 * Normalization layer (REQ-SCHEMA-001/002/004, REQ-DUMP-002) — a pure
 * function converting Android uiautomator `dump` XML into the common
 * element schema. No device, subprocess, or I/O is involved: given the
 * same XML string it always returns the same result, which is what makes
 * it unit-testable with fixtures alone (acceptance.md AC-ANDROID-008).
 *
 * @MX:ANCHOR — invariant contract + high fan_in: every recognition path
 * (`dump`, and any future backend feeding uiautomator-shaped XML) depends
 * on this mapping staying correct. This is also the SPEC's designated iOS
 * plug-in point — a future iOS/idb normalizer must produce the same
 * {@link CommonElement} shape (see device-backend.ts).
 * @MX:REASON — REQ-SCHEMA-002 defines this mapping as the SPEC's core
 * data-model contract; regressions here silently corrupt every consumer
 * of `dump` output.
 */

import { XMLParser } from "fast-xml-parser";

import type { CommonElement, ElementBounds } from "../schema/common-element.js";

const DEFAULT_BOUNDS: ElementBounds = { x: 0, y: 0, w: 0, h: 0 };

/** A parsed XML node's attribute/child bag, as produced by fast-xml-parser. */
type RawNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: true,
});

/**
 * Parses uiautomator's `"[x1,y1][x2,y2]"` bounds string into
 * `{x, y, w, h}`. Any value that does not match the expected shape
 * (missing attribute, malformed string) safely falls back to a
 * zero-rectangle instead of throwing (acceptance.md §D.1).
 */
function parseBounds(raw: unknown): ElementBounds {
  if (typeof raw !== "string") return { ...DEFAULT_BOUNDS };

  const match = raw.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/);
  if (!match) return { ...DEFAULT_BOUNDS };

  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);

  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function attrString(node: RawNode, key: string): string {
  const value = node[`@_${key}`];
  return typeof value === "string" ? value : "";
}

function attrBool(node: RawNode, key: string): boolean {
  return attrString(node, key) === "true";
}

/** uiautomator's XML nests children directly as the `node` key: a single
 * child parses to an object, multiple children parse to an array. Both
 * shapes are normalized to an array here. */
function collectChildNodes(node: RawNode): RawNode[] {
  const raw = node["node"];
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw as RawNode[];
  return [raw as RawNode];
}

function toCommonElement(node: RawNode): CommonElement {
  const text = attrString(node, "text") || attrString(node, "content-desc");
  const clickable = attrBool(node, "clickable");
  const enabled = attrBool(node, "enabled");

  return {
    role: attrString(node, "class"),
    text,
    id: attrString(node, "resource-id"),
    bounds: parseBounds(node["@_bounds"]),
    tappable: clickable && enabled,
    enabled,
    children: collectChildNodes(node).map(toCommonElement),
  };
}

/**
 * Normalizes a uiautomator `dump` XML string into the common element
 * schema (spec.md §A.3, REQ-SCHEMA-002). Pure function — no device or I/O
 * required, safe to call with only a saved XML fixture.
 *
 * Never throws: an empty, whitespace-only, or malformed/truncated document
 * returns an empty array (or a safe partial tree when some — but not all —
 * of the document parses), matching acceptance.md §D.1's edge-case
 * requirement that malformed input degrade gracefully rather than raise.
 */
export function normalizeUiAutomatorXml(xml: string): CommonElement[] {
  // Runtime boundary guard: uiautomator XML crosses a subprocess/device
  // I/O boundary, so it is not guaranteed to satisfy the compile-time
  // `string` contract at runtime (Secured — validate external input).
  if (typeof xml !== "string" || xml.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];

  const hierarchy = (parsed as RawNode)["hierarchy"];
  if (typeof hierarchy !== "object" || hierarchy === null) return [];

  try {
    return collectChildNodes(hierarchy as RawNode).map(toCommonElement);
  } catch {
    return [];
  }
}
