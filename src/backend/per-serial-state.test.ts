import { describe, expect, it } from "vitest";

import { PerSerialState } from "./per-serial-state.js";

describe("PerSerialState (REQ-MULTIDEV-003/004)", () => {
  it("stores and retrieves a value scoped to one serial", () => {
    const state = new PerSerialState<string>();

    state.set("A", "value-for-A");

    expect(state.get("A")).toBe("value-for-A");
  });

  it("returns undefined for a serial that has never been set", () => {
    const state = new PerSerialState<string>();

    expect(state.get("unknown-serial")).toBeUndefined();
  });

  it("isolates state across serials — setting one serial never affects another", () => {
    const state = new PerSerialState<string>();

    state.set("A", "value-for-A");
    state.set("B", "value-for-B");

    expect(state.get("A")).toBe("value-for-A");
    expect(state.get("B")).toBe("value-for-B");

    state.set("A", "updated-A");

    expect(state.get("A")).toBe("updated-A");
    expect(state.get("B")).toBe("value-for-B"); // untouched by A's update
  });

  it("delete() removes only the targeted serial's entry", () => {
    const state = new PerSerialState<string>();
    state.set("A", "value-for-A");
    state.set("B", "value-for-B");

    state.delete("A");

    expect(state.has("A")).toBe(false);
    expect(state.has("B")).toBe(true);
    expect(state.get("B")).toBe("value-for-B");
  });

  it("does not accumulate entries across repeated set() calls for the same serial (REQ-IDEMP-001)", () => {
    const state = new PerSerialState<string>();

    state.set("A", "first");
    state.set("A", "second");
    state.set("A", "third");

    expect(state.size).toBe(1);
    expect(state.get("A")).toBe("third");
  });

  it("size reflects the number of distinct tracked serials", () => {
    const state = new PerSerialState<string>();

    expect(state.size).toBe(0);

    state.set("A", "x");
    state.set("B", "y");

    expect(state.size).toBe(2);

    state.delete("A");

    expect(state.size).toBe(1);
  });
});
