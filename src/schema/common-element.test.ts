import { describe, expect, it } from "vitest";

import type { CommonElement, ElementBounds } from "./common-element.js";

describe("CommonElement schema (type-level invariant)", () => {
  it("shape is EXACTLY { role, text, id, bounds, tappable, enabled, children } — unchanged by SPEC-IOS-001 (REQ-IOS-SCHEMA-005, AC-IOS-028)", () => {
    // A `Record<keyof CommonElement, true>` object literal is a
    // bidirectional exhaustiveness check (see device-backend.test.ts for
    // the same pattern): TypeScript's excess-property checking rejects
    // both a missing field and an extra one. iOS mapping fills this
    // schema (design.md §F) without adding to or removing from it.
    const fieldPresence: Record<keyof CommonElement, true> = {
      role: true,
      text: true,
      id: true,
      bounds: true,
      tappable: true,
      enabled: true,
      children: true,
    };

    expect(Object.keys(fieldPresence)).toHaveLength(7);
  });

  it("ElementBounds shape is EXACTLY { x, y, w, h }", () => {
    const fieldPresence: Record<keyof ElementBounds, true> = {
      x: true,
      y: true,
      w: true,
      h: true,
    };

    expect(Object.keys(fieldPresence)).toHaveLength(4);
  });
});
