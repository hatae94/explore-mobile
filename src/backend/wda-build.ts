/**
 * WDA 러너 빌드 (SPEC-IOS-002 REQ-IOS2-002).
 *
 * 산출물은 **사용자 홈 아래 전용 디렉터리**에 남긴다 — 저장소 안이 아니다
 * (design.md §D.1). 이 CLI는 전역 설치돼 아무 폴더에서나 실행되므로, 저장소
 * 안에 두면 저장소 밖에서 실행할 때 못 찾는다. 그리고 산출물은 기기별이지
 * 프로젝트별이 아니다 — 같은 폰을 여러 프로젝트에서 쓰면 빌드를 공유해야 한다.
 *
 * Xcode 기본 위치(`DerivedData/WebDriverAgent-<해시>/`)를 쓰지 않는 이유가
 * 그것이다. 2026-08-08 실측에서 그 경로는 `WebDriverAgent-cxqdatdnwyclcwczomwgvseyritt`
 * 였다 — 호스트마다 다르고 프로젝트 경로가 바뀌면 또 달라진다.
 */

import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";
import type { WdaBuildConfig } from "./wda-build-config.js";
import { WdaBuildFailedError } from "./wda-errors.js";

/** 빌드 산출물이 사는 결정적 위치. */
export function wdaArtifactRoot(home: string = homedir()): string {
  return join(home, ".explore-mobile", "wda");
}

/**
 * `xcodebuild` argv를 만든다 (AC-IOS2-003).
 *
 * 설정 값 셋이 그대로 실린다 — 유추하거나 변형하지 않는다. 그 값이 실제로
 * 빌드를 성공시키는지는 이 함수가 답할 수 없다(AC-IOS2-005가 실기기로 판정).
 */
export function xcodebuildArgs(config: WdaBuildConfig, udid: string, derivedDataPath: string): string[] {
  return [
    "build-for-testing",
    "-project",
    join(config.wdaSourcePath, "WebDriverAgent.xcodeproj"),
    "-scheme",
    "WebDriverAgentRunner",
    "-destination",
    `id=${udid}`,
    "-derivedDataPath",
    derivedDataPath,
    "-allowProvisioningUpdates",
    `DEVELOPMENT_TEAM=${config.teamId}`,
    `PRODUCT_BUNDLE_IDENTIFIER=${config.bundleId}`,
    "CODE_SIGN_STYLE=Automatic",
  ];
}

export interface WdaBuildResult {
  /** 이후 기동이 쓸 `.xctestrun` 경로. */
  xctestrunPath: string;
  derivedDataPath: string;
}

export interface WdaBuildOptions {
  exec?: ProcessExecutor;
  home?: string;
}

/**
 * 러너를 빌드하고 산출물 경로를 돌려준다.
 *
 * 실패하면 `xcodebuild`의 출력을 **그대로 실어** 던진다(AC-IOS2-006).
 *
 * @MX:WARN — 동의 없이 부르지 않는다.
 * @MX:REASON — 이 함수는 사용자 폰에 앱을 설치하는 경로의 출발점이다.
 * Android의 IME 자동 설치와 달리 되돌리기가 서명·프로비저닝과 얽힌다
 * (design.md §H). 호출자가 명시적 동의를 받은 뒤에 부른다.
 */
export async function buildWdaRunner(
  config: WdaBuildConfig,
  udid: string,
  options: WdaBuildOptions = {},
): Promise<WdaBuildResult> {
  const exec = options.exec ?? spawnProcess;
  const derivedDataPath = wdaArtifactRoot(options.home);
  const args = xcodebuildArgs(config, udid, derivedDataPath);

  const result = await exec("xcodebuild", args);
  if (result.exitCode !== 0) {
    throw new WdaBuildFailedError(buildFailureMessage(result.exitCode, result.stdout, result.stderr));
  }

  const xctestrunPath = await findXctestrun(derivedDataPath);
  if (xctestrunPath === undefined) {
    throw new WdaBuildFailedError(
      [
        `xcodebuild는 성공했으나(${derivedDataPath}) .xctestrun 산출물을 찾지 못했습니다.`,
        "빌드 설정이 러너 대상을 만들지 않았을 수 있습니다.",
      ].join("\n"),
    );
  }
  return { xctestrunPath, derivedDataPath };
}

/**
 * 빌드된 `.xctestrun`을 결정적 위치에서 찾는다 (AC-IOS2-007).
 * 여러 개면 이름순 마지막을 쓴다 — SDK 버전이 이름에 들어가므로 최신이 뒤에 온다.
 */
export async function findXctestrun(derivedDataPath: string): Promise<string | undefined> {
  const productsDir = join(derivedDataPath, "Build", "Products");
  let entries: string[];
  try {
    entries = await readdir(productsDir);
  } catch {
    return undefined;
  }
  const candidates = entries.filter((name) => name.endsWith(".xctestrun")).sort();
  const chosen = candidates.at(-1);
  return chosen === undefined ? undefined : join(productsDir, chosen);
}

/** `xcodebuild` 출력을 요약하지 않고 그대로 싣는다 (AC-IOS2-006). */
function buildFailureMessage(exitCode: number, stdout: Buffer, stderr: Buffer): string {
  const output = [stderr.toString().trim(), stdout.toString().trim()].filter((part) => part.length > 0).join("\n");
  return [`xcodebuild가 실패했습니다 (exit ${exitCode}).`, "", output].join("\n");
}
