import { describe, expect, it } from "vitest";

import { isValidPackageName, parseCoordinate } from "./validators.js";

describe("isValidPackageName", () => {
  it("accepts reverse-DNS-style dotted package names", () => {
    expect(isValidPackageName("com.android.settings")).toBe(true);
    expect(isValidPackageName("com.example.app_name")).toBe(true);
  });

  it("rejects single-segment names, whitespace, and empty strings", () => {
    expect(isValidPackageName("settings")).toBe(false);
    expect(isValidPackageName("not a package")).toBe(false);
    expect(isValidPackageName("")).toBe(false);
  });
});

describe("parseCoordinate", () => {
  it("parses a non-negative integer string", () => {
    expect(parseCoordinate("100")).toBe(100);
    expect(parseCoordinate("0")).toBe(0);
  });

  it("rejects non-digit strings", () => {
    expect(parseCoordinate("abc")).toBeUndefined();
    expect(parseCoordinate("-5")).toBeUndefined();
    expect(parseCoordinate("1.5")).toBeUndefined();
  });

  it("rejects a digit string so large it overflows to a non-finite number", () => {
    const enormous = "9".repeat(400);
    expect(parseCoordinate(enormous)).toBeUndefined();
  });
});
