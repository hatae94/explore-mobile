import { describe, expect, it } from "vitest";

import { isValidPackageName, parseCoordinate, parseDurationMs, parseIndex, parseRatio } from "./validators.js";

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

describe("parseDurationMs (SPEC-GESTURE-001 M6 — AC-GEST-019)", () => {
  it("parses a positive integer string", () => {
    expect(parseDurationMs("500")).toBe(500);
    expect(parseDurationMs("1")).toBe(1); // 경계값 — 거부되지 않는다
  });

  it("0.4.0에서 0을 거부한다 (0.3.0은 '음이 아닌 정수'라 0을 허용했다 — REQ 결함이었다)", () => {
    expect(parseDurationMs("0")).toBeUndefined();
  });

  it("rejects non-digit strings", () => {
    expect(parseDurationMs("abc")).toBeUndefined();
    expect(parseDurationMs("-5")).toBeUndefined();
    expect(parseDurationMs("1.5")).toBeUndefined();
    expect(parseDurationMs("")).toBeUndefined();
  });

  it("parseCoordinate와 다른 판정 함수다 — 좌표 0은 여전히 유효하다 (공유하면 AC-GEST-003/AC-GEST-019가 동시에 통과할 수 없다)", () => {
    expect(parseCoordinate("0")).toBe(0);
    expect(parseDurationMs("0")).toBeUndefined();
  });

  describe("0.5.0(M7) 상한 -- AC-GEST-025, C-4", () => {
    it("60000(경계)은 거부되지 않는다", () => {
      expect(parseDurationMs("60000")).toBe(60000);
    });

    it("60001(상한 초과)은 거부된다", () => {
      expect(parseDurationMs("60001")).toBeUndefined();
    });

    it("1e24는 지수 표기라 어휘 검증부터 거부된다 (^\\d+$가 'e'를 포함한 문자열을 통과시키지 않는다)", () => {
      expect(parseDurationMs("1e24")).toBeUndefined();
    });

    it("상한을 훨씬 넘는 순수 십진 문자열도 거부된다 (지수 표기가 아니어도 상한 자체가 막는다)", () => {
      expect(parseDurationMs("99999999999999999999")).toBeUndefined();
      expect(parseDurationMs("3600000")).toBeUndefined(); // 1시간 -- 상한 60000ms를 훨씬 초과
    });
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
