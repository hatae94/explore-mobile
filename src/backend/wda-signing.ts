/**
 * 서명 만료 식별 (SPEC-IOS-002 REQ-IOS2-007).
 *
 * **실패를 분류하지 않고 상태를 직접 읽는다.** `design.md` §I.3은 식별 근거를
 * ① 종료 코드 → ② 구조화된 출력의 필드 → ③ 자유 문구 순으로 고르라고 정했고,
 * 2026-08-09 조사가 **②를 찾았다**: 빌드 산출물 안의 프로비저닝 프로파일
 * (`embedded.mobileprovision`)에 만료 시각이 `ExpirationDate` 필드로 들어 있다.
 *
 * ```
 * $ security cms -D -i <앱>/embedded.mobileprovision
 *   <key>ExpirationDate</key>
 *   <date>2026-08-11T07:19:34Z</date>      # 발급 08-04 → 정확히 7일
 * ```
 *
 * 이것이 ③(문구 매칭)보다 나은 이유는 도구 버전 종속을 피하는 것만이 아니다.
 * **실패하기 전에 답할 수 있다** — 기동이 깨진 뒤 원인을 되짚는 대신, 만료를
 * 미리 읽어 경고할 수 있다.
 *
 * @MX:ANCHOR — 판정 근거는 프로파일의 `ExpirationDate` 필드다.
 * @MX:REASON — `xcodebuild`의 stderr 문구로 만료를 가르려 하면 이 저장소가 이미
 * 겪은 실패를 반복한다. `Timed out while enabling automation mode.`를 관문 하나의
 * 신호로 귀속했다가 서로 다른 조건 넷에서 같은 문구가 나오는 것이 관측돼
 * 반증됐다(`progress.md` M3+M4 절). 문구는 여러 원인이 합류하는 지점이고,
 * 날짜 필드는 하나의 사실이다.
 */

import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";
import { wdaArtifactRoot } from "./wda-build.js";

/** 만료로 식별된 실패의 오류 코드. 기존 4종의 의미는 건드리지 않는다(AC-IOS2-025). */
export const WDA_SIGNING_EXPIRED = "WDA_SIGNING_EXPIRED";

/**
 * 세 값이며 **`unknown`이 진짜 값**이다 — 읽지 못한 것을 유효로도 만료로도
 * 적지 않는다(`design.md` §I.3 마지막 행: "구별 불가"를 그대로 보고한다).
 */
export type WdaSigningVerdict = "valid" | "expired" | "unknown";

export interface WdaSigningStatus {
  verdict: WdaSigningVerdict;
  /** 읽어낸 만료 시각(ISO). 읽지 못했으면 없다. */
  expiresAt?: string;
  /** 사람이 읽을 한 줄 — 만료면 무엇을 해야 하는지, 아니면 왜 모르는지. */
  message: string;
  /** 판정에 쓴 프로파일 경로. 찾지 못했으면 없다. */
  profilePath?: string;
}

export interface WdaSigningOptions {
  /** 빌드 산출물 뿌리. 기본은 `~/.explore-mobile/wda`. */
  artifactRoot?: string;
  exec?: ProcessExecutor;
  /** 비교 기준 시각. 검사가 고정할 수 있게 열어 둔다. */
  now?: Date;
}

/**
 * 재빌드 경로 — **재빌드로 끝나지 않는다는 사실을 함께 싣는다**(REQ-IOS2-007).
 *
 * 러너를 다시 설치하면 기기에서 UI 자동화 승인이 다시 요구된다
 * (`research.md` §2.3). 재빌드만 안내하면 사용자는 자동으로 끝나는 줄 알고
 * 기다리다가 기기 화면에 뜬 승인 창을 놓친다.
 */
export function rebuildGuidance(): string[] {
  return [
    "1) 산출물을 지웁니다: rm -rf ~/.explore-mobile/wda/Build",
    "2) 다시 빌드하고 띄웁니다: explore-mobile doctor --device <UDID> --yes",
    "3) **기기 화면을 보고 계세요** — 러너를 다시 설치하면 UI 자동화 승인이 다시 요구됩니다",
    "   (설정 > 개발자 > UI 자동화 사용). 재빌드만으로 끝나지 않습니다.",
    "참고: 유효한 프로파일이 남아 있으면 재빌드가 그것을 재사용하는 것이 관측됐습니다",
    "      (2026-08-08). 재빌드 뒤에도 만료일이 그대로면 Xcode의 자동 서명 설정을 확인하세요.",
  ];
}

/**
 * 프로파일 XML에서 만료 시각을 읽는다.
 *
 * `security cms -D`가 내놓는 것은 XML plist이므로, 이것은 **자유 문구 매칭이
 * 아니라 구조화된 문서의 필드 추출**이다. `<key>` 이름으로 지목하며 값의
 * 서식은 plist가 고정한다.
 */
export function parseProfileExpiry(plistXml: string): Date | undefined {
  const matched = /<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/.exec(plistXml);
  if (matched === null) return undefined;

  const parsed = new Date(matched[1]!.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * 산출물 안에서 프로비저닝 프로파일을 찾는다.
 *
 * `~/Library/MobileDevice/Provisioning Profiles/`를 보지 않는다 — 2026-08-09
 * 실측에서 그 디렉터리는 **비어 있었다**(0개). 최신 Xcode가 위치를 옮겼으므로,
 * 실제로 이 기기에 설치된 러너가 들고 있는 프로파일은 산출물 안의 것뿐이다.
 */
export async function findEmbeddedProfile(artifactRoot: string): Promise<string | undefined> {
  const productsDir = join(artifactRoot, "Build", "Products");

  let platformDirs: string[];
  try {
    platformDirs = await readdir(productsDir);
  } catch {
    return undefined;
  }

  for (const platformDir of platformDirs.sort()) {
    let entries: string[];
    try {
      entries = await readdir(join(productsDir, platformDir));
    } catch {
      continue;
    }
    for (const app of entries.filter((name) => name.endsWith(".app")).sort()) {
      const profile = join(productsDir, platformDir, app, "embedded.mobileprovision");
      try {
        await access(profile);
        return profile;
      } catch {
        // 이 앱 번들에는 프로파일이 없다 — 다음 후보로.
      }
    }
  }
  return undefined;
}

/**
 * 서명이 지금 유효한가.
 *
 * 던지지 않는다 — 이 판정은 진단이며, 읽지 못한 것은 `"unknown"`이라는 **답**이다.
 */
export async function readSigningStatus(options: WdaSigningOptions = {}): Promise<WdaSigningStatus> {
  const artifactRoot = options.artifactRoot ?? wdaArtifactRoot();
  const exec = options.exec ?? spawnProcess;
  const now = options.now ?? new Date();

  const profilePath = await findEmbeddedProfile(artifactRoot);
  if (profilePath === undefined) {
    return {
      verdict: "unknown",
      message: `빌드 산출물에서 프로비저닝 프로파일을 찾지 못해 서명 만료를 확인할 수 없습니다 (${artifactRoot}).`,
    };
  }

  let decoded: string;
  try {
    const result = await exec("security", ["cms", "-D", "-i", profilePath]);
    if (result.exitCode !== 0) {
      return {
        verdict: "unknown",
        profilePath,
        message: `프로파일을 해독하지 못해 서명 만료를 확인할 수 없습니다 (security exit ${result.exitCode}): ${result.stderr.toString().trim()}`,
      };
    }
    decoded = result.stdout.toString();
  } catch (err) {
    return {
      verdict: "unknown",
      profilePath,
      message: `프로파일 해독을 실행하지 못해 서명 만료를 확인할 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const expiry = parseProfileExpiry(decoded);
  if (expiry === undefined) {
    return {
      verdict: "unknown",
      profilePath,
      message: "프로파일에서 ExpirationDate 필드를 읽지 못해 서명 만료를 확인할 수 없습니다.",
    };
  }

  const expiresAt = expiry.toISOString();
  if (expiry.getTime() <= now.getTime()) {
    return {
      verdict: "expired",
      expiresAt,
      profilePath,
      message: [`서명이 ${expiresAt}에 만료됐습니다 — 이 상태로는 러너가 기동하지 않습니다.`, ...rebuildGuidance()].join(
        "\n",
      ),
    };
  }

  return {
    verdict: "valid",
    expiresAt,
    profilePath,
    message: `서명이 ${expiresAt}까지 유효합니다.`,
  };
}
