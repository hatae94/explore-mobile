/**
 * iOS 빌드에 필요한 **사용자별 설정**을 선언된 단일 위치에서 읽는다
 * (SPEC-IOS-002 REQ-IOS2-001).
 *
 * 자리는 **환경 변수**다(design.md §C.1). 이유는 둘이다.
 *
 *   1. 선례가 이미 있다 — `EXPLORE_MOBILE_WDA_PORTS`가 같은 성격의 값(사용자·
 *      머신마다 다르고 저장소에 넣으면 안 되는 값)을 같은 방식으로 받는다.
 *      다른 자리에 두면 사용자가 두 곳을 봐야 한다.
 *   2. 설정 파일을 만들면 누군가 개발팀 식별자를 커밋한다. 비밀은 아니지만
 *      남의 저장소에 남을 이유도 없다.
 *
 * @MX:ANCHOR — 값이 없을 때 **유추해 채우지 않는다**. 없으면 실패한다.
 * @MX:REASON — 개발팀 식별자를 잘못 유추하면 남의 팀으로 서명을 시도하고,
 * 그 실패는 원인이 보이지 않는다(spec.md REQ-IOS2-001 · design.md §C.3).
 * 그래서 이 파일에는 키체인 조회도, Xcode 빌드 설정 조회도, 프로비저닝
 * 프로파일 디렉터리 탐색도 **존재하지 않는다**. 이 부재는 부재 주장이므로
 * `wda-build-config.test.ts`의 AC-IOS2-004 절이 **자기 소유의 양성 대조**와
 * 함께 검사한다 — 그 검사는 이 파일의 소스를 읽어 유추 패턴이 걸리지 않음을
 * 판정하므로, 여기에 유추 코드를 넣으면 검사가 깨진다.
 */

import { WdaBuildConfigMissingError } from "./wda-errors.js";

/**
 * 설정 항목과 그것을 담는 환경 변수 이름의 대응.
 *
 * 접두사 `EXPLORE_MOBILE_`은 기존 `EXPLORE_MOBILE_WDA_PORTS`의 관례를 따른다.
 */
export const WDA_BUILD_CONFIG_ENV = {
  /** Apple 개발팀 식별자. */
  teamId: "EXPLORE_MOBILE_IOS_TEAM_ID",
  /** 러너에 부여할 번들 식별자. */
  bundleId: "EXPLORE_MOBILE_IOS_BUNDLE_ID",
  /** WDA 소스 트리의 위치. */
  wdaSourcePath: "EXPLORE_MOBILE_WDA_SOURCE",
} as const satisfies Record<string, string>;

export interface WdaBuildConfig {
  teamId: string;
  bundleId: string;
  wdaSourcePath: string;
}

/** 각 항목이 무엇인지 — 실패 메시지에서 사용자가 읽을 설명. */
const FIELD_DESCRIPTION: Record<keyof WdaBuildConfig, string> = {
  teamId: "Apple 개발팀 식별자",
  bundleId: "러너 번들 식별자",
  wdaSourcePath: "WebDriverAgent 소스 트리 경로",
};

/**
 * 선언된 환경 변수에서 빌드 설정을 읽는다.
 *
 * 값이 하나라도 비어 있으면 `WdaBuildConfigMissingError`를 던진다 —
 * **빠진 것만** 지목하고, 이미 선언된 값은 메시지에 담지 않는다. 전부
 * 나열하면 사용자가 무엇을 더 적어야 하는지 다시 골라내야 한다.
 *
 * 공백만 있는 값은 부재로 본다. 셸에서 `export X=` 로 비워 둔 경우가
 * 선언과 구별되지 않으면, 사용자는 선언했다고 믿는 채로 실패한다.
 */
export function readWdaBuildConfig(env: NodeJS.ProcessEnv = process.env): WdaBuildConfig {
  const keys = Object.keys(WDA_BUILD_CONFIG_ENV) as (keyof WdaBuildConfig)[];
  const values = {} as WdaBuildConfig;
  const missing: (keyof WdaBuildConfig)[] = [];

  for (const key of keys) {
    const raw = (env[WDA_BUILD_CONFIG_ENV[key]] ?? "").trim();
    if (raw.length === 0) {
      missing.push(key);
    } else {
      values[key] = raw;
    }
  }

  if (missing.length > 0) {
    throw new WdaBuildConfigMissingError(missingMessage(missing));
  }
  return values;
}

/** 무엇을 어디에 적어야 하는지 지목하는 문구 (AC-IOS2-001). */
function missingMessage(missing: (keyof WdaBuildConfig)[]): string {
  const lines = missing.map((key) => `  export ${WDA_BUILD_CONFIG_ENV[key]}="<${FIELD_DESCRIPTION[key]}>"`);
  return [
    `iOS 빌드 설정이 선언돼 있지 않습니다 (${missing.length}개). 다음을 **환경 변수**로 선언하세요:`,
    ...lines,
    "",
    "이 값들은 사용자·머신마다 다르므로 저장소에 넣지 않고 셸 프로파일에 둡니다.",
  ].join("\n");
}
