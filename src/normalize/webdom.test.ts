/**
 * M3 — web DOM normalization (REQ-WEB-NORM-001..004, AC-WEB-009..011).
 *
 * Pure-function tests: fixtures only, no device, no proxy, no page — the same
 * contract `normalize/idb.test.ts` and `normalize/uiautomator.test.ts` hold.
 */

import { describe, expect, it } from "vitest";
import {
  buildCollectExpression,
  DEFAULT_WEB_SELECTOR,
  normalizeWebDom,
  normalizeWebDomIndexed,
} from "./webdom.js";

/** A fully-populated raw element, as the in-page collector emits it. */
function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag: "a",
    role: "",
    text: "뉴스",
    label: "",
    placeholder: "",
    id: "newsLink",
    rect: { x: 10, y: 20, w: 100, h: 40 },
    disabled: false,
    onclick: false,
    ...overrides,
  };
}

describe("normalizeWebDom — field mapping (spec.md §F)", () => {
  it("maps every CommonElement field from its documented web source", () => {
    expect(normalizeWebDom([raw()])).toEqual([
      {
        role: "a",
        text: "뉴스",
        id: "newsLink",
        bounds: { x: 10, y: 20, w: 100, h: 40 },
        tappable: true,
        enabled: true,
        children: [],
      },
    ]);
  });

  it("lowercases the tag name into role", () => {
    expect(normalizeWebDom([raw({ tag: "BUTTON" })])[0]?.role).toBe("button");
  });

  it("falls back to the role attribute when there is no tag", () => {
    expect(normalizeWebDom([raw({ tag: "", role: "button" })])[0]?.role).toBe("button");
  });

  it("prefers textContent, then aria-label, then placeholder", () => {
    expect(normalizeWebDom([raw({ text: "본문", label: "라벨", placeholder: "힌트" })])[0]?.text).toBe("본문");
    expect(normalizeWebDom([raw({ text: "", label: "라벨", placeholder: "힌트" })])[0]?.text).toBe("라벨");
    expect(normalizeWebDom([raw({ text: "", label: "", placeholder: "힌트" })])[0]?.text).toBe("힌트");
    expect(normalizeWebDom([raw({ text: "", label: "", placeholder: "" })])[0]?.text).toBe("");
  });

  it("trims surrounding whitespace from text", () => {
    expect(normalizeWebDom([raw({ text: "  검색  " })])[0]?.text).toBe("검색");
  });

  it("defaults a missing id to the empty string", () => {
    expect(normalizeWebDom([raw({ id: undefined })])[0]?.id).toBe("");
  });

  it("keeps children flat — selector queries are the access path, not tree walks", () => {
    expect(normalizeWebDom([raw()])[0]?.children).toEqual([]);
  });
});

describe("normalizeWebDom — tappable derivation", () => {
  it("treats the interactive tags as tappable", () => {
    for (const tag of ["a", "button", "input", "select", "textarea", "summary"]) {
      expect(normalizeWebDom([raw({ tag })])[0]?.tappable).toBe(true);
    }
  });

  it("treats a non-interactive tag as not tappable", () => {
    expect(normalizeWebDom([raw({ tag: "div" })])[0]?.tappable).toBe(false);
    expect(normalizeWebDom([raw({ tag: "span" })])[0]?.tappable).toBe(false);
  });

  it("treats an interactive ARIA role on a plain element as tappable", () => {
    expect(normalizeWebDom([raw({ tag: "div", role: "button" })])[0]?.tappable).toBe(true);
    expect(normalizeWebDom([raw({ tag: "div", role: "LINK" })])[0]?.tappable).toBe(true);
  });

  it("treats an onclick handler on a plain element as tappable", () => {
    expect(normalizeWebDom([raw({ tag: "div", onclick: true })])[0]?.tappable).toBe(true);
  });

  it("is never tappable when disabled, whatever the tag says", () => {
    expect(normalizeWebDom([raw({ tag: "button", disabled: true })])[0]?.tappable).toBe(false);
    expect(normalizeWebDom([raw({ tag: "div", role: "button", disabled: true })])[0]?.tappable).toBe(false);
  });

  it("mirrors disabled into enabled", () => {
    expect(normalizeWebDom([raw({ disabled: true })])[0]?.enabled).toBe(false);
    expect(normalizeWebDom([raw({ disabled: false })])[0]?.enabled).toBe(true);
  });
});

describe("normalizeWebDom — visibility filter (REQ-WEB-NORM-002)", () => {
  it("drops zero-size elements — most naver.com links measured 0x0 (spec.md §C.1-⑤)", () => {
    expect(normalizeWebDom([raw({ rect: { x: 5, y: 5, w: 0, h: 0 } })])).toEqual([]);
  });

  it("drops elements with only one zero dimension", () => {
    expect(normalizeWebDom([raw({ rect: { x: 5, y: 5, w: 100, h: 0 } })])).toEqual([]);
    expect(normalizeWebDom([raw({ rect: { x: 5, y: 5, w: 0, h: 40 } })])).toEqual([]);
  });

  it("drops negative-size elements", () => {
    expect(normalizeWebDom([raw({ rect: { x: 5, y: 5, w: -10, h: 40 } })])).toEqual([]);
  });

  it("keeps only the visible elements out of a mixed batch", () => {
    const result = normalizeWebDom([
      raw({ id: "visible-1" }),
      raw({ id: "hidden", rect: { x: 0, y: 0, w: 0, h: 0 } }),
      raw({ id: "visible-2", rect: { x: 0, y: 100, w: 50, h: 50 } }),
    ]);
    expect(result.map((el) => el.id)).toEqual(["visible-1", "visible-2"]);
  });
});

describe("normalizeWebDom — degrade, never throw (REQ-WEB-NORM-004)", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeWebDom(null)).toEqual([]);
    expect(normalizeWebDom(undefined)).toEqual([]);
    expect(normalizeWebDom("not an array")).toEqual([]);
    expect(normalizeWebDom({ elements: [] })).toEqual([]);
  });

  it("skips entries that are not objects", () => {
    expect(normalizeWebDom(["str", 42, null, raw()])).toHaveLength(1);
  });

  it("drops an element whose rect is missing or malformed rather than inventing coordinates", () => {
    // No readable geometry means no tap target: it degrades to the zero rect
    // and is then removed by the visibility filter.
    expect(normalizeWebDom([raw({ rect: undefined })])).toEqual([]);
    expect(normalizeWebDom([raw({ rect: "nope" })])).toEqual([]);
    expect(normalizeWebDom([raw({ rect: { x: "a", y: 0, w: 10, h: 10 } })])).toEqual([]);
  });

  it("maps defensively when optional string fields are the wrong type", () => {
    const [el] = normalizeWebDom([raw({ text: 42, id: {}, role: [] })]);
    expect(el?.text).toBe("");
    expect(el?.id).toBe("");
  });
});

describe("normalizeWebDomIndexed", () => {
  it("keeps each surviving element's position in the unfiltered input", () => {
    const indexed = normalizeWebDomIndexed([
      raw({ id: "hidden-0", rect: { x: 0, y: 0, w: 0, h: 0 } }),
      raw({ id: "visible-1" }),
      raw({ id: "hidden-2", rect: { x: 0, y: 0, w: 0, h: 0 } }),
      raw({ id: "visible-3" }),
    ]);

    // The filtered positions are 0 and 1, but the page still has them at 1 and 3.
    expect(indexed.map((entry) => entry.sourceIndex)).toEqual([1, 3]);
    expect(indexed.map((entry) => entry.element.id)).toEqual(["visible-1", "visible-3"]);
  });

  it("agrees with normalizeWebDom on the elements themselves", () => {
    const input = [raw({ id: "a" }), raw({ id: "b", rect: { x: 0, y: 0, w: 0, h: 0 } }), raw({ id: "c" })];
    expect(normalizeWebDomIndexed(input).map((entry) => entry.element)).toEqual(normalizeWebDom(input));
  });
});

describe("buildCollectExpression", () => {
  it("embeds the default selector when none is given", () => {
    expect(buildCollectExpression()).toContain(JSON.stringify(DEFAULT_WEB_SELECTOR));
  });

  it("escapes the caller's selector instead of splicing it in raw", () => {
    // A selector carrying a quote must not be able to close the string and
    // append arbitrary statements.
    const hostile = '");window.__pwned=1;("';
    const expression = buildCollectExpression(hostile);
    // Present only in escaped form; the raw sequence that would close the
    // string literal and start a new statement never appears verbatim.
    expect(expression).toContain(JSON.stringify(hostile));
    expect(expression).not.toContain(hostile);
  });

  it("produces a self-contained expression that mentions the fields the normalizer reads", () => {
    const expression = buildCollectExpression();
    for (const field of ["tag", "role", "text", "label", "placeholder", "id", "rect", "disabled", "onclick"]) {
      expect(expression).toContain(field);
    }
  });
});
