/**
 * `wda-build-config.ts` 검사 (SPEC-IOS-002 M2, REQ-IOS2-001).
 *
 * 대응 AC: AC-IOS2-001 · 002 · 004.
 *
 * AC-IOS2-004는 **부재 주장**("키체인·Xcode에서 유추하는 경로가 없다")이므로
 * 양성 대조를 동반한다(원칙 ② · ③). 대조 표본은 **이 검사 파일이 소유한다** —
 * 제품 코드의 어느 줄을 대조로 지목하면 그 줄이 정리되는 순간 대조가 조용히
 * 죽고 검사는 계속 초록으로 통과한다.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWdaBuildConfig, WDA_BUILD_CONFIG_ENV } from "./wda-build-config.js";
import { WdaBuildConfigMissingError } from "./wda-errors.js";

/** 세 값이 모두 선언된 정상 환경. */
function fullEnv(): NodeJS.ProcessEnv {
  return {
    [WDA_BUILD_CONFIG_ENV.teamId]: "ABCDE12345",
    [WDA_BUILD_CONFIG_ENV.bundleId]: "com.example.wda",
    [WDA_BUILD_CONFIG_ENV.wdaSourcePath]: "/Users/tester/WebDriverAgent",
  };
}

describe("readWdaBuildConfig — 선언된 자리에서 읽는다 (REQ-IOS2-001)", () => {
  it("세 값이 선언돼 있으면 그대로 읽힌다", () => {
    const config = readWdaBuildConfig(fullEnv());
    expect(config).toEqual({
      teamId: "ABCDE12345",
      bundleId: "com.example.wda",
      wdaSourcePath: "/Users/tester/WebDriverAgent",
    });
  });

  it("앞뒤 공백은 제거하고 읽는다", () => {
    const config = readWdaBuildConfig({ ...fullEnv(), [WDA_BUILD_CONFIG_ENV.teamId]: "  ABCDE12345  " });
    expect(config.teamId).toBe("ABCDE12345");
  });
});

describe("AC-IOS2-001 — 설정 부재는 전용 코드로 실패하고 무엇을 어디에 적을지 지목한다", () => {
  it("셋 다 없으면 전용 코드로 실패한다", () => {
    expect(() => readWdaBuildConfig({})).toThrow(WdaBuildConfigMissingError);
  });

  it("오류 코드가 WDA_BUILD_CONFIG_MISSING이다", () => {
    try {
      readWdaBuildConfig({});
      expect.unreachable("설정이 없는데 실패하지 않았다");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("WDA_BUILD_CONFIG_MISSING");
    }
  });

  it("메시지가 빠진 변수 **이름 전부**를 지목한다", () => {
    try {
      readWdaBuildConfig({});
      expect.unreachable("설정이 없는데 실패하지 않았다");
    } catch (err) {
      const message = (err as Error).message;
      for (const name of Object.values(WDA_BUILD_CONFIG_ENV)) {
        expect(message).toContain(name);
      }
    }
  });

  it("일부만 빠진 경우 **빠진 것만** 지목한다 — 이미 선언된 값은 언급하지 않는다", () => {
    const env = fullEnv();
    delete env[WDA_BUILD_CONFIG_ENV.bundleId];
    try {
      readWdaBuildConfig(env);
      expect.unreachable("설정이 없는데 실패하지 않았다");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(WDA_BUILD_CONFIG_ENV.bundleId);
      expect(message).not.toContain(WDA_BUILD_CONFIG_ENV.teamId);
      expect(message).not.toContain(WDA_BUILD_CONFIG_ENV.wdaSourcePath);
    }
  });

  it("빈 문자열·공백만 있는 값은 **부재로 취급**한다", () => {
    const env = { ...fullEnv(), [WDA_BUILD_CONFIG_ENV.teamId]: "   " };
    expect(() => readWdaBuildConfig(env)).toThrow(WdaBuildConfigMissingError);
  });

  it("메시지가 어디에 적을지(환경 변수)를 지목한다", () => {
    try {
      readWdaBuildConfig({});
      expect.unreachable("설정이 없는데 실패하지 않았다");
    } catch (err) {
      expect((err as Error).message).toContain("환경 변수");
    }
  });
});

describe("AC-IOS2-002 — 설정 부재 실패가 WDA_UNREACHABLE이 아니다 (AC-001의 구분 대조)", () => {
  /**
   * 두 실패의 복구 절차가 전혀 다르다 — 하나는 "환경 변수를 선언하라",
   * 다른 하나는 "러너를 띄우라"다. 코드를 재사용하면 사용자를 엉뚱한 절차로
   * 보낸다. 이 대조가 없으면 구현이 편의상 기존 코드를 재사용해도 AC-001은
   * 통과한다.
   */
  it("코드가 WDA_UNREACHABLE이 아니다", () => {
    try {
      readWdaBuildConfig({});
      expect.unreachable("설정이 없는데 실패하지 않았다");
    } catch (err) {
      expect((err as { code?: string }).code).not.toBe("WDA_UNREACHABLE");
    }
  });

  it("메시지가 러너 기동 절차를 안내하지 않는다", () => {
    try {
      readWdaBuildConfig({});
      expect.unreachable("설정이 없는데 실패하지 않았다");
    } catch (err) {
      expect((err as Error).message).not.toContain("iproxy");
    }
  });
});

describe("AC-IOS2-004 — 설정을 키체인·Xcode에서 유추하지 않는다 (양성 대조 동반)", () => {
  /**
   * 검사 방식: 유추 경로의 모양을 나타내는 패턴 목록을 이 파일이 소유하고,
   *   ① 이 파일이 소유한 **대조 표본**에 대해 패턴이 걸리는지 (대조 성립)
   *   ② 제품 소스에 대해 패턴이 걸리지 않는지 (본 판정)
   * 을 함께 낸다. ①이 실패하면 ②의 통과는 무의미하므로 AC 전체를 FAIL로 본다.
   */

  /** 이 검사 파일이 소유한 유추 경로 표본. 제품 코드에서 빌려오지 않는다(원칙 ③). */
  const INFERENCE_SAMPLE = [
    'const team = execSync("security find-identity -v -p codesigning");',
    'const settings = execSync("xcodebuild -showBuildSettings");',
    'const key = settings.match(/DEVELOPMENT' + '_TEAM = (\\w+)/);',
    'const profiles = readdirSync(homedir() + "/Library/MobileDevice/Provisioning Profiles");',
  ].join("\n");

  /** 유추 경로를 나타내는 패턴들. 이 파일이 소유한다. */
  const INFERENCE_PATTERNS: readonly RegExp[] = [
    /security\s+find-(generic-password|identity)/i,
    /xcodebuild\s+-showBuildSettings/i,
    /DEVELOPMENT_TEAM/,
    /Library\/MobileDevice/i,
  ];

  const PRODUCT_SOURCE = readFileSync(new URL("./wda-build-config.ts", import.meta.url), "utf8");

  function matchedPatterns(source: string): RegExp[] {
    return INFERENCE_PATTERNS.filter((pattern) => pattern.test(source));
  }

  it("대조 표본이 비어 있지 않다 — 0건 통과 방지", () => {
    expect(INFERENCE_PATTERNS.length).toBeGreaterThan(0);
    expect(INFERENCE_SAMPLE.length).toBeGreaterThan(0);
  });

  it("① 대조 성립 — 표본은 패턴에 걸린다", () => {
    // 표본이 안 걸리면 검사식이 망가진 것이므로 ②의 통과는 의미가 없다.
    expect(matchedPatterns(INFERENCE_SAMPLE).length).toBe(INFERENCE_PATTERNS.length);
  });

  it("② 본 판정 — 제품 소스는 어느 패턴에도 걸리지 않는다", () => {
    expect(matchedPatterns(PRODUCT_SOURCE).map(String)).toEqual([]);
  });

  it("설정이 없으면 유추로 채우지 않고 AC-001로 실패한다", () => {
    // 호스트에 실제 Xcode 개발팀 정보가 있든 없든 결과가 같아야 한다.
    expect(() => readWdaBuildConfig({})).toThrow(WdaBuildConfigMissingError);
  });
});
