import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeUiAutomatorXml } from "./uiautomator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../../tests/fixtures/uiautomator");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
}

describe("normalizeUiAutomatorXml", () => {
  it("maps class->role, resource-id->id, bounds->{x,y,w,h}, clickable+enabled->tappable, and nests children (REQ-SCHEMA-002)", () => {
    const xml = loadFixture("basic.xml");

    const result = normalizeUiAutomatorXml(xml);

    expect(result).toHaveLength(1);
    const container = result[0]!;
    expect(container.role).toBe("android.widget.FrameLayout");
    expect(container.id).toBe("");
    expect(container.text).toBe("");
    expect(container.bounds).toEqual({ x: 0, y: 0, w: 1080, h: 2280 });
    expect(container.tappable).toBe(false); // clickable="false"
    expect(container.enabled).toBe(true);
    expect(container.children).toHaveLength(2);

    const [checkbox, textField] = container.children;

    expect(checkbox).toEqual({
      role: "android.widget.CheckBox",
      text: "Agree checkbox", // falls back to content-desc, since text=""
      id: "cb_agree",
      bounds: { x: 40, y: 120, w: 80, h: 80 },
      tappable: true, // clickable=true AND enabled=true
      enabled: true,
      children: [],
    });

    expect(textField).toEqual({
      role: "android.widget.EditText",
      text: "Name field",
      id: "et_name",
      bounds: { x: 40, y: 220, w: 1000, h: 100 },
      tappable: true,
      enabled: true,
      children: [],
    });
  });

  it("prefers a non-empty text attribute over content-desc (REQ-SCHEMA-002 text/content-desc->text)", () => {
    const xml = loadFixture("text-priority.xml");

    const result = normalizeUiAutomatorXml(xml);

    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe("Hello");
  });

  it("preserves unicode text (Korean + emoji) without corruption", () => {
    const xml = loadFixture("unicode.xml");

    const result = normalizeUiAutomatorXml(xml);

    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe("안녕하세요 😸");
  });

  it("defaults bounds to {x:0,y:0,w:0,h:0} when the bounds attribute is missing or malformed (acceptance.md §D.1)", () => {
    const xml = loadFixture("no-bounds.xml");

    const result = normalizeUiAutomatorXml(xml);

    expect(result).toHaveLength(2);
    expect(result[0]!.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(result[1]!.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("returns an empty array for an empty or whitespace-only XML string (acceptance.md §D.1 edge case)", () => {
    expect(normalizeUiAutomatorXml("")).toEqual([]);
    expect(normalizeUiAutomatorXml("   \n\t  ")).toEqual([]);
  });

  it("returns an empty array for a hierarchy with no child nodes", () => {
    expect(normalizeUiAutomatorXml("<hierarchy rotation=\"0\"></hierarchy>")).toEqual([]);
  });

  it("never throws on malformed/truncated XML and returns a safe (possibly partial) array (acceptance.md §D.1)", () => {
    const xml = loadFixture("malformed.xml");

    let result: unknown;
    expect(() => {
      result = normalizeUiAutomatorXml(xml);
    }).not.toThrow();
    expect(Array.isArray(result)).toBe(true);
  });

  it("is defensive against non-string input at the runtime boundary (Secured — external device output)", () => {
    // uiautomator output crosses a subprocess/device boundary at runtime, so
    // it is not guaranteed to satisfy the compile-time `string` contract.
    // @ts-expect-error intentional runtime-boundary test with invalid types
    expect(normalizeUiAutomatorXml(null)).toEqual([]);
    // @ts-expect-error intentional runtime-boundary test with invalid types
    expect(normalizeUiAutomatorXml(undefined)).toEqual([]);
  });

  it("requires BOTH clickable AND enabled to derive tappable=true", () => {
    const clickableOnly =
      '<hierarchy><node class="a" resource-id="x" bounds="[0,0][1,1]" clickable="true" enabled="false" /></hierarchy>';
    const enabledOnly =
      '<hierarchy><node class="a" resource-id="x" bounds="[0,0][1,1]" clickable="false" enabled="true" /></hierarchy>';
    const neither =
      '<hierarchy><node class="a" resource-id="x" bounds="[0,0][1,1]" clickable="false" enabled="false" /></hierarchy>';
    const both =
      '<hierarchy><node class="a" resource-id="x" bounds="[0,0][1,1]" clickable="true" enabled="true" /></hierarchy>';

    expect(normalizeUiAutomatorXml(clickableOnly)[0]!.tappable).toBe(false);
    expect(normalizeUiAutomatorXml(enabledOnly)[0]!.tappable).toBe(false);
    expect(normalizeUiAutomatorXml(neither)[0]!.tappable).toBe(false);
    expect(normalizeUiAutomatorXml(both)[0]!.tappable).toBe(true);
  });
});
