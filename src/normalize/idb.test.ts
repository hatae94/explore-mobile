import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeIdbAccessibility } from "./idb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../../tests/fixtures/idb");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf-8"));
}

describe("normalizeIdbAccessibility", () => {
  it("maps the VERIFIED research.md §2 describe-all example exactly (AC-IOS-004)", () => {
    const json = loadFixture("basic.json");

    const result = normalizeIdbAccessibility(json);

    expect(result).toEqual([
      {
        id: "Wallet",
        bounds: { x: 199, y: 116, w: 64, h: 87.5 },
        text: "Wallet",
        role: "Button",
        enabled: true,
        tappable: true,
        children: [],
      },
    ]);
  });

  it("normalizes a flat multi-element array with each element's children:[] (REQ-IOS-NORM-003, AC-IOS-006)", () => {
    const json = loadFixture("flat-multi.json");

    const result = normalizeIdbAccessibility(json);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "btn_submit",
      text: "Submit",
      role: "Button",
      bounds: { x: 10, y: 20, w: 100, h: 44 },
      tappable: true,
      enabled: true,
      children: [],
    });
    expect(result[1]).toEqual({
      id: "lbl_title",
      text: "Title",
      role: "StaticText",
      bounds: { x: 10, y: 80, w: 200, h: 30 },
      tappable: false, // StaticText is not in INTERACTIVE_TYPES, no custom_actions
      enabled: true,
      children: [],
    });
  });

  describe("tappable derivation (REQ-IOS-NORM-004, AC-IOS-005 — no AXTraits dependency)", () => {
    function element(overrides: Record<string, unknown>): unknown[] {
      return [
        {
          AXUniqueId: "x",
          AXLabel: "x",
          frame: { x: 0, y: 0, width: 1, height: 1 },
          type: "StaticText",
          role: "AXStaticText",
          subrole: null,
          custom_actions: [],
          enabled: true,
          ...overrides,
        },
      ];
    }

    it("derives tappable=true when type is in the interactive set AND enabled", () => {
      expect(normalizeIdbAccessibility(element({ type: "Button", enabled: true }))[0]!.tappable).toBe(true);
      expect(normalizeIdbAccessibility(element({ type: "TextField", enabled: true }))[0]!.tappable).toBe(true);
      expect(normalizeIdbAccessibility(element({ type: "Switch", enabled: true }))[0]!.tappable).toBe(true);
    });

    it("derives tappable=false when enabled is false, regardless of interactive type", () => {
      expect(normalizeIdbAccessibility(element({ type: "Button", enabled: false }))[0]!.tappable).toBe(false);
    });

    it("derives tappable=false for a non-interactive type with no custom_actions", () => {
      expect(
        normalizeIdbAccessibility(element({ type: "StaticText", custom_actions: [], enabled: true }))[0]!.tappable,
      ).toBe(false);
    });

    it("derives tappable=true from a non-empty custom_actions even when type is not in the interactive set", () => {
      expect(
        normalizeIdbAccessibility(
          element({ type: "StaticText", custom_actions: ["Edit mode"], enabled: true }),
        )[0]!.tappable,
      ).toBe(true);
    });

    it("falls back to an AX-prefixed role (e.g. AXButton) as an interactivity signal when type is absent", () => {
      expect(
        normalizeIdbAccessibility(element({ type: undefined, role: "AXButton", enabled: true }))[0]!.tappable,
      ).toBe(true);
    });

    it("never references an AXTraits field — passing one has no effect on the derivation", () => {
      const result = normalizeIdbAccessibility(
        element({ type: "StaticText", AXTraits: 999999, enabled: true, custom_actions: [] }),
      );
      expect(result[0]!.tappable).toBe(false);
    });
  });

  describe("role derivation (design.md §F.1)", () => {
    it("prefers `type` over `role` when both are present", () => {
      const [el] = normalizeIdbAccessibility([
        { AXUniqueId: "a", AXLabel: "a", frame: {}, type: "Button", role: "AXButton", enabled: true },
      ]);
      expect(el!.role).toBe("Button");
    });

    it("falls back to `role` when `type` is absent", () => {
      const [el] = normalizeIdbAccessibility([
        { AXUniqueId: "a", AXLabel: "a", frame: {}, role: "AXButton", enabled: true },
      ]);
      expect(el!.role).toBe("AXButton");
    });

    it("falls back to an empty string when neither `type` nor `role` is present", () => {
      const [el] = normalizeIdbAccessibility([{ AXUniqueId: "a", AXLabel: "a", frame: {}, enabled: true }]);
      expect(el!.role).toBe("");
    });
  });

  describe("bounds derivation", () => {
    it("preserves float frame values without rounding", () => {
      const [el] = normalizeIdbAccessibility([
        { AXUniqueId: "a", frame: { x: 1.5, y: 2.25, width: 3.75, height: 4.125 }, enabled: true },
      ]);
      expect(el!.bounds).toEqual({ x: 1.5, y: 2.25, w: 3.75, h: 4.125 });
    });

    it("defaults to the zero-rectangle when frame is missing or malformed", () => {
      const [el1] = normalizeIdbAccessibility([{ AXUniqueId: "a", enabled: true }]);
      expect(el1!.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });

      const [el2] = normalizeIdbAccessibility([{ AXUniqueId: "a", frame: "not-an-object", enabled: true }]);
      expect(el2!.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    });
  });

  describe("graceful degradation (REQ-IOS-NORM-005)", () => {
    it("never throws and returns an empty array for non-array input", () => {
      expect(normalizeIdbAccessibility(null)).toEqual([]);
      expect(normalizeIdbAccessibility(undefined)).toEqual([]);
      expect(normalizeIdbAccessibility("not-json")).toEqual([]);
      expect(normalizeIdbAccessibility({ not: "an array" })).toEqual([]);
    });

    it("returns an empty array for an empty describe-all array", () => {
      expect(normalizeIdbAccessibility([])).toEqual([]);
    });

    it("skips non-object array entries rather than throwing", () => {
      expect(() => normalizeIdbAccessibility([null, 42, "x", { AXUniqueId: "ok", enabled: true }])).not.toThrow();
      const result = normalizeIdbAccessibility([null, 42, "x", { AXUniqueId: "ok", enabled: true }]);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("ok");
    });

    it("treats a missing AXLabel/AXUniqueId as empty strings rather than throwing", () => {
      const [el] = normalizeIdbAccessibility([{ enabled: true }]);
      expect(el!.text).toBe("");
      expect(el!.id).toBe("");
    });
  });
});
