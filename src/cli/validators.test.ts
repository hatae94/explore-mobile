import { describe, expect, it } from "vitest";

import { isValidPackageName, parseCoordinate, parseIndex, parseRatio } from "./validators.js";

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

describe("parseIndex", () => {
  it("parses a non-negative integer string", () => {
    expect(parseIndex("0")).toBe(0);
    expect(parseIndex("3")).toBe(3);
  });

  it("rejects non-digit strings", () => {
    expect(parseIndex("abc")).toBeUndefined();
    expect(parseIndex("-1")).toBeUndefined();
    expect(parseIndex("1.5")).toBeUndefined();
  });
});

describe("parseRatio", () => {
  it("소수를 포함해 0 초과 1 이하 범위를 파싱한다 (REQ-GEST-SCROLL-003/006)", () => {
    expect(parseRatio("0.25")).toBe(0.25);
    expect(parseRatio("0.75")).toBe(0.75);
    expect(parseRatio("1")).toBe(1);
  });

  it("0은 이동 거리 0인 제스처이므로 거부한다", () => {
    expect(parseRatio("0")).toBeUndefined();
  });

  it("1을 초과하면 거부한다", () => {
    expect(parseRatio("1.5")).toBeUndefined();
  });

  it("수로 파싱되지 않는 값을 거부한다", () => {
    expect(parseRatio("abc")).toBeUndefined();
    expect(parseRatio("")).toBeUndefined();
  });

  it("음수 리터럴은 이 함수에 도달하기 전에 파서 계층(node:util.parseArgs)이 걸러내지만, 방어적으로도 거부한다", () => {
    expect(parseRatio("-0.5")).toBeUndefined();
  });
});
