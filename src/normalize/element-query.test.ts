import { describe, expect, it } from "vitest";

import type { CommonElement } from "../schema/common-element.js";
import { elementCenter, findElement } from "./element-query.js";

function element(overrides: Partial<CommonElement> = {}): CommonElement {
  return {
    role: "android.widget.View",
    text: "",
    id: "",
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    tappable: false,
    enabled: true,
    children: [],
    ...overrides,
  };
}

describe("findElement", () => {
  it("finds an element by exact id", () => {
    const tree = [element({ id: "btn_ok", text: "OK" })];

    expect(findElement(tree, { id: "btn_ok" })).toEqual(tree[0]);
  });

  it("finds an element by exact, trimmed text (also matches content-desc-derived text, since the normalizer folds content-desc into text)", () => {
    const tree = [element({ id: "cb_agree", text: "Agree checkbox" })];

    expect(findElement(tree, { text: "  Agree checkbox  " })).toEqual(tree[0]);
  });

  it("returns null when no element matches the selector", () => {
    const tree = [element({ id: "btn_ok" })];

    expect(findElement(tree, { id: "missing" })).toBeNull();
  });

  it("returns null for an empty tree", () => {
    expect(findElement([], { id: "btn_ok" })).toBeNull();
    expect(findElement([], { text: "anything" })).toBeNull();
  });

  it("returns null when neither id nor text is given (an unconstrained selector matches nothing, not everything)", () => {
    const tree = [element({ id: "btn_ok" })];

    expect(findElement(tree, {})).toBeNull();
  });

  it("searches depth-first into children, finding a nested match", () => {
    const nested = element({ id: "nested_target", text: "deep" });
    const tree = [
      element({
        id: "container",
        children: [element({ id: "sibling" }), nested],
      }),
    ];

    expect(findElement(tree, { id: "nested_target" })).toEqual(nested);
  });

  it("selects the first match by default when a selector matches multiple elements", () => {
    const first = element({ id: "row", text: "Row 1" });
    const second = element({ id: "row", text: "Row 2" });
    const tree = [first, second];

    expect(findElement(tree, { id: "row" })).toEqual(first);
  });

  it("selects the Nth match (0-based) via index when a selector matches multiple elements", () => {
    const first = element({ id: "row", text: "Row 1" });
    const second = element({ id: "row", text: "Row 2" });
    const third = element({ id: "row", text: "Row 3" });
    const tree = [first, second, third];

    expect(findElement(tree, { id: "row", index: 0 })).toEqual(first);
    expect(findElement(tree, { id: "row", index: 1 })).toEqual(second);
    expect(findElement(tree, { id: "row", index: 2 })).toEqual(third);
  });

  it("returns null when index is out of range for the number of matches", () => {
    const tree = [element({ id: "row" })];

    expect(findElement(tree, { id: "row", index: 5 })).toBeNull();
  });

  it("requires BOTH id and text to match when both are given (AND semantics)", () => {
    const tree = [element({ id: "row", text: "Row 1" }), element({ id: "row", text: "Row 2" })];

    expect(findElement(tree, { id: "row", text: "Row 2" })).toEqual(tree[1]);
    expect(findElement(tree, { id: "row", text: "no such text" })).toBeNull();
  });
});

describe("elementCenter", () => {
  it("computes the pixel-space center of an element's bounds", () => {
    const el = element({ bounds: { x: 40, y: 120, w: 80, h: 80 } });

    expect(elementCenter(el)).toEqual({ x: 80, y: 160 });
  });

  it("rounds a non-integer center to the nearest device pixel", () => {
    const el = element({ bounds: { x: 0, y: 0, w: 5, h: 5 } });

    expect(elementCenter(el)).toEqual({ x: 3, y: 3 });
  });

  it("handles a zero-size bounds rectangle without error", () => {
    const el = element({ bounds: { x: 10, y: 20, w: 0, h: 0 } });

    expect(elementCenter(el)).toEqual({ x: 10, y: 20 });
  });
});
