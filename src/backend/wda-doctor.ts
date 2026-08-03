/**
 * `WdaDoctor` — iOS 환경 점검 서비스 (SPEC-VISION-001 M3). 이전 iOS 환경
 * 점검 서비스가 있던 자리를 대신하며, 점검 대상이 devicectl 가용성과 WDA
 * 도달성으로 바뀐다 (design.md §B.3).
 *
 * `AdbDoctor`와 마찬가지로 `DeviceBackend` 인터페이스 밖에 있다.
 * 호스트 환경 부트스트랩(도구가 PATH에 있는가, 터널이 떠 있는가)은 도구마다
 * 다른 관심사여서, 백엔드 무관 제어 인터페이스에 들어갈 자리가 없다.
 *
 * @MX:WARN — `checkDevicectl`(백엔드 가용성 게이트)과 `checkWda`(제어 가능
 * 여부)는 반드시 분리된 채로 남아야 한다.
 * @MX:REASON — 둘을 합치면 WDA가 안 떠 있을 때 iOS 백엔드 전체가 비가용으로
 * 판정돼 연결된 기기가 `devices` 목록에서 통째로 사라진다. SPEC-IOS-001에서
 * 이전 iOS 백엔드에서 도구의 버전 조회 실패를 "미설치"로 처리했다가 부팅된
 * 기기가 목록에서 통째로 사라진 이력이 있다 — 존재 여부와 버전 판독 가능
 * 여부는 다른 질문이며, 백엔드를 막을 수 있는 것은 전자뿐이다.
 */

import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";
import { WdaClient } from "./wda-client.js";
import { WDA_DEFAULT_PORT, wdaRecoveryHint } from "./wda-errors.js";

export interface DevicectlCheck {
  available: boolean;
  message?: string;
}

export interface WdaCheck {
  /** WDA가 이 포트에서 응답하는가. */
  reachable: boolean;
  port: number;
  /** WDA 빌드/OS 요약 (도달했을 때만). */
  build?: string;
  /** 도달하지 못했을 때의 복구 절차. */
  message?: string;
  /**
   * 포트 매핑이 선언돼 있는가. false면 기본 포트를 쓰고 있다는 뜻이며,
   * 그 경우 CLI는 포트 너머 기기의 신원을 검증할 수 없다(wda-client.ts
   * `resolveWdaPort` 참조). 이 사실을 보고서에 드러내 사용자가 눈으로
   * 확인할 수 있게 한다.
   */
  portMapDeclared: boolean;
}

export interface IosInstallGuidance {
  platformSupported: boolean;
  message: string;
  steps?: string[];
}

export interface IosResetResult {
  noOp: true;
  message: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class WdaDoctor {
  constructor(
    private readonly processExec: ProcessExecutor = spawnProcess,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly makeClient: (serial: string) => WdaClient = (serial) => new WdaClient(serial),
  ) {}

  /**
   * `xcrun devicectl`을 쓸 수 있는가 — iOS 백엔드 **가용성 게이트**다.
   * WDA 기동 여부와 무관해야 한다(파일 상단 @MX:WARN 참조).
   */
  async checkDevicectl(): Promise<DevicectlCheck> {
    if (this.platform !== "darwin") {
      return { available: false, message: "iOS 기기 제어는 macOS + Xcode에서만 가능합니다." };
    }
    try {
      const result = await this.processExec("xcrun", ["devicectl", "--version"]);
      return result.exitCode === 0
        ? { available: true }
        : { available: false, message: "xcrun devicectl을 실행할 수 없습니다 — Xcode 설치를 확인하세요." };
    } catch (err) {
      return { available: false, message: errorMessage(err) };
    }
  }

  /**
   * WDA가 이 기기의 포트에서 응답하는가 (AC-VISION-020). 절대 던지지 않는다 —
   * `doctor`의 일은 진단하고 보고하는 것이지 실패하는 것이 아니다.
   */
  async checkWda(serial: string): Promise<WdaCheck> {
    const portMapDeclared = (this.env.EXPLORE_MOBILE_WDA_PORTS ?? "").trim().length > 0;

    let client: WdaClient;
    try {
      client = this.makeClient(serial);
    } catch (err) {
      // 매핑이 선언됐는데 이 기기가 빠져 있는 경우 (WdaPortUnmappedError)
      return { reachable: false, port: WDA_DEFAULT_PORT, message: errorMessage(err), portMapDeclared };
    }

    const port = Number.parseInt(new URL(client.baseUrl).port, 10);
    try {
      const status = await client.request("GET", "/status", undefined, { idempotent: true });
      const build = summarizeStatus(status);
      return { reachable: true, port, portMapDeclared, ...(build === undefined ? {} : { build }) };
    } catch (err) {
      return { reachable: false, port, message: `${wdaRecoveryHint(serial, port)}\n원인: ${errorMessage(err)}`, portMapDeclared };
    }
  }

  /** 안내만 한다 — 설치를 대신 수행하지 않는다(iOS 도구 체인 공통 방침). */
  async installGuidance(): Promise<IosInstallGuidance> {
    if (this.platform !== "darwin") {
      return {
        platformSupported: false,
        message: "iOS 기기 제어는 macOS + Xcode가 필요하며 이 호스트 OS에서는 지원되지 않습니다.",
      };
    }
    return {
      platformSupported: true,
      message: "WDA는 사용자가 직접 기동해 두어야 하는 외부 프로세스입니다. 기기당 1회 다음을 실행하세요.",
      steps: [
        "brew install libimobiledevice   # iproxy 제공",
        "iproxy 8100:8100 -u <UDID> &",
        'xcodebuild test-without-building -xctestrun <WebDriverAgentRunner_*.xctestrun> -destination "id=<UDID>"',
        "기기가 2대 이상이면 EXPLORE_MOBILE_WDA_PORTS=\"<UDID>=8100,<UDID2>=8101\" 로 포트를 선언하세요.",
      ],
    };
  }

  /**
   * iOS `reset`은 사실상 no-op이다 — 되돌릴 IME 세션도, 설치한 APK도 없다
   * (SPEC-IOS-001이 정한 계약 그대로. WDA 입력은 상태를 남기지 않는다).
   */
  async resetDevice(_serial: string): Promise<IosResetResult> {
    return {
      noOp: true,
      message: "iOS에는 정리할 IME/APK 상태가 없습니다(WDA 문자 입력은 무상태) — 되돌릴 것이 없습니다.",
    };
  }
}

/** `/status`의 `value`에서 사람이 읽을 요약 한 줄을 만든다. */
function summarizeStatus(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as { build?: { version?: unknown }; os?: { version?: unknown }; device?: unknown };
  const parts = [
    typeof record.build?.version === "string" ? `WDA ${record.build.version}` : undefined,
    typeof record.os?.version === "string" ? `iOS ${record.os.version}` : undefined,
    typeof record.device === "string" ? record.device : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(" / ") : undefined;
}
