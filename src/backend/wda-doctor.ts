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
import { spawnBackground, spawnProcess } from "./process-executor.js";
import { buildWdaRunner, findXctestrun, wdaArtifactRoot, type WdaBuildResult } from "./wda-build.js";
import { readWdaBuildConfig, type WdaBuildConfig } from "./wda-build-config.js";
import { WdaClient } from "./wda-client.js";
import { WDA_DEFAULT_PORT, wdaRecoveryHint } from "./wda-errors.js";
import { readGates, type WdaGatesReport } from "./wda-gates.js";
import { launchWdaRunner, stopWdaRunner, type BackgroundSpawner } from "./wda-launcher.js";
import { WdaRunnerState } from "./wda-runner-state.js";
import { readSigningStatus, WDA_SIGNING_EXPIRED, type WdaSigningStatus } from "./wda-signing.js";

export interface DevicectlCheck {
  available: boolean;
  message?: string;
}

/**
 * 러너를 **조작할 수 있는가** — 생존과는 다른 축이다 (SPEC-IOS-002 REQ-IOS2-004).
 *
 *   - `"ok"`      권한을 요구하는 읽기 호출이 성공했다
 *   - `"failed"`  러너는 응답하는데 그 호출이 실패했다
 *   - `"unknown"` 러너가 응답하지 않아 **물을 수단이 없다**
 *
 * `"failed"`의 원인은 지금 가르지 않는다. 권한 상실로 인한 500과 그 밖의
 * 원인으로 인한 500을 가를 판별자가 없고, 그 판별자는 조사 대상도 아니다
 * (design.md §A.5 · §B.1.1). 판별자가 확인되면 그때 값을 나눈다.
 */
export type WdaControllable = "ok" | "failed" | "unknown";

export interface WdaCheck {
  /**
   * **러너 생존** — WDA가 이 포트에서 응답하는가(`GET /status`). 2값이다.
   *
   * @MX:ANCHOR — 이 값과 `controllable`을 하나로 합치지 않는다.
   * @MX:REASON — 2026-08-03 관측에서 러너가 **살아 있으면서 조작만 안 되는**
   * 상태가 실재했다(`/status` 200 · `/screenshot` 500). 합치면 그 상태가
   * "없는 것"으로 판정돼 중복 기동을 부르고(AC-IOS2-009 회귀), 반대로 "정상"
   * 으로 판정되면 사용자가 다음 명령에서 실패한다. 두 축을 따로 싣는 것이
   * AC-IOS2-029가 요구하는 전부다.
   */
  reachable: boolean;
  /** **조작 가능성** — 권한을 요구하는 호출의 결과. 3값(위 타입 주석 참조). */
  controllable: WdaControllable;
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

/**
 * iOS 준비 자동화의 결과 (SPEC-IOS-002 REQ-IOS2-002 · 003).
 *
 * `doctor`는 던지지 않으므로 실패도 이 형태로 보고된다. Android의
 * `installAttempt`와 같은 자리·같은 성격이다.
 */
export interface IosBringUpAttempt {
  /** 실제로 무언가를 했는가. false면 `reason`이 왜 안 했는지 말한다. */
  attempted: boolean;
  reason?: string;
  /** 산출물이 없어 빌드까지 했는가. */
  built?: boolean;
  launched?: boolean;
  /** 조작 가능 확인까지 마쳤는가. */
  ok?: boolean;
  message?: string;
  runnerLogPath?: string;
  /** 실패 시 오류 코드 — 설정 부재와 빌드 실패를 호출자가 가를 수 있게. */
  code?: string;
}

export interface IosInstallGuidance {
  platformSupported: boolean;
  message: string;
  steps?: string[];
}

/**
 * iOS `reset`의 결과. **더 이상 no-op이 아니다** (design.md §G.1).
 *
 * 이전 계약("iOS에는 정리할 IME/APK 상태가 없다")은 **CLI가 아무것도 띄우지
 * 않던 시점의 사실**이었다. 이 SPEC이 포트 포워딩과 러너를 띄우기 시작하면서
 * 그 전제가 무너졌다 — 되돌릴 것을 만들어 놓고 `reset`을 no-op으로 두면
 * 사용자는 정리 경로 없이 유령 프로세스를 쌓게 된다.
 */
export interface IosResetResult {
  /** 정리할 것이 없었는가. CLI가 띄운 러너가 없으면 true. */
  noOp: boolean;
  message: string;
}

/** 재기동 전 포트가 조용해지기를 기다리는 간격과 횟수. */
const DEFAULT_QUIET_POLL_INTERVAL_MS = 500;
const DEFAULT_QUIET_MAX_POLLS = 20;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 러너가 더 이상 응답하지 않을 때까지 기다린다. 끝내 응답하면 false. */
async function waitUntilQuiet(client: WdaClient, intervalMs: number, maxPolls: number): Promise<boolean> {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (!(await client.isResponsive())) return true;
    if (intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** `exactOptionalPropertyTypes` 아래에서는 `code: undefined`를 넣을 수 없다. */
function errorCodeField(err: unknown): { code?: string } {
  const code = (err as { code?: string }).code;
  return code === undefined ? {} : { code };
}

export class WdaDoctor {
  constructor(
    private readonly processExec: ProcessExecutor = spawnProcess,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly makeClient: (serial: string) => WdaClient = (serial) => new WdaClient(serial),
    /** CLI가 띄운 러너의 기록 — 종료 자격의 판정 근거(design.md §B.1). */
    private readonly runnerState: WdaRunnerState = new WdaRunnerState(),
    private readonly killProcess: (pid: number) => void = (pid) => process.kill(pid),
    /** 백그라운드 기동. 검사에서 실제 프로세스를 띄우지 않도록 주입한다. */
    private readonly spawnBg: BackgroundSpawner = spawnBackground,
    /** 빌드. 검사에서 실제 `xcodebuild`를 돌리지 않도록 주입한다. */
    private readonly buildRunner: (config: WdaBuildConfig, udid: string) => Promise<WdaBuildResult> = (config, udid) =>
      buildWdaRunner(config, udid),
    /** 서명 만료 판정. 검사에서 실제 `security`를 부르지 않도록 주입한다. */
    private readonly readSigning: () => Promise<WdaSigningStatus> = () => readSigningStatus(),
  ) {}

  /**
   * 관문 셋이 각각 어떤 상태인가 (REQ-IOS2-006).
   *
   * 지금은 셋 다 "구분 불가"다 — 판별 신호가 없기 때문이며, 그 사유는
   * `wda-gates.ts` 상단에 있다. 주입 자리를 두지 않은 것은 입출력이 없어서다.
   */
  checkGates(): WdaGatesReport {
    return readGates();
  }

  /**
   * 서명이 지금 유효한가 (REQ-IOS2-007).
   *
   * 기동 실패를 기다리지 않는다 — 만료일은 산출물 안의 프로파일에서 **직접**
   * 읽히므로(`wda-signing.ts` 상단), 실패하기 전에 답할 수 있다. `doctor`가
   * 이 값을 늘 실어 주면 사용자는 만료가 닥치기 전에 안다.
   */
  async checkSigning(): Promise<WdaSigningStatus> {
    return this.readSigning();
  }

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
   * WDA가 이 기기의 포트에서 **살아 있는가**, 그리고 **조작할 수 있는가**
   * (AC-VISION-020 · SPEC-IOS-002 AC-IOS2-010 · 029). 두 질문을 따로 답한다.
   * 절대 던지지 않는다 — `doctor`의 일은 진단하고 보고하는 것이지 실패하는
   * 것이 아니다.
   */
  async checkWda(serial: string): Promise<WdaCheck> {
    const portMapDeclared = (this.env.EXPLORE_MOBILE_WDA_PORTS ?? "").trim().length > 0;

    let client: WdaClient;
    try {
      client = this.makeClient(serial);
    } catch (err) {
      // 매핑이 선언됐는데 이 기기가 빠져 있는 경우 (WdaPortUnmappedError)
      return {
        reachable: false,
        controllable: "unknown",
        port: WDA_DEFAULT_PORT,
        message: errorMessage(err),
        portMapDeclared,
      };
    }

    const port = Number.parseInt(new URL(client.baseUrl).port, 10);
    try {
      const status = await client.request("GET", "/status", undefined, { idempotent: true });
      const build = summarizeStatus(status);
      const controllable = await probeControllable(client);
      return { reachable: true, controllable, port, portMapDeclared, ...(build === undefined ? {} : { build }) };
    } catch (err) {
      // `/status`가 응답하지 않으면 권한을 물을 수단 자체가 없다 (design.md §B.1.1 3번).
      return {
        reachable: false,
        controllable: "unknown",
        port,
        message: `${wdaRecoveryHint(serial, port)}\n원인: ${errorMessage(err)}`,
        portMapDeclared,
      };
    }
  }

  /**
   * iOS를 쓸 수 있는 상태로 만든다 — 필요하면 빌드하고, 러너를 띄운다
   * (REQ-IOS2-002 · 003).
   *
   * @MX:ANCHOR — `consent`가 참일 때만 빌드·설치한다.
   * @MX:REASON — 이 경로는 사용자 폰에 앱을 설치한다. Android의 IME 자동 설치와
   * 달리 되돌리기가 서명·프로비저닝과 얽히므로 더 약한 동의를 받을 이유가 없다
   * (design.md §H.2). 동의 없이 부르면 아무것도 하지 않고 이유만 보고한다.
   *
   * 던지지 않는다 — `doctor`의 일은 진단하고 보고하는 것이다.
   */
  async bringUpWda(
    serial: string,
    consent: boolean,
    /**
     * 기동 대기 조율. 기본값은 `launchWdaRunner`가 정한다 — 검사가 실패 경로를
     * 80초 기다리지 않고 밟을 수 있도록 열어 둔 자리이며, 실사용 경로는 기본값을 쓴다.
     */
    options: { pollIntervalMs?: number; maxPolls?: number } = {},
  ): Promise<IosBringUpAttempt> {
    if (!consent) {
      return { attempted: false, reason: "동의가 필요합니다 — 기기에 러너를 설치하므로 `--yes`로 실행하세요." };
    }

    // 이미 쓸 수 있으면 건드리지 않는다. 판정은 checkWda가 이미 하는 그 판정이다.
    const current = await this.checkWda(serial);
    if (current.reachable && current.controllable === "ok") {
      return { attempted: false, reason: "이미 사용 가능합니다 — 기동하지 않았습니다." };
    }

    let client: WdaClient;
    try {
      client = this.makeClient(serial);
    } catch (err) {
      return { attempted: false, reason: errorMessage(err), ...errorCodeField(err) };
    }
    const port = Number.parseInt(new URL(client.baseUrl).port, 10);

    let xctestrunPath = await findXctestrun(wdaArtifactRoot());
    let built = false;

    if (xctestrunPath === undefined) {
      let config;
      try {
        config = readWdaBuildConfig(this.env);
      } catch (err) {
        // 설정 부재와 빌드 실패는 복구 절차가 다르다 — 코드를 그대로 올려보낸다.
        return { attempted: true, built: false, ok: false, message: errorMessage(err), ...errorCodeField(err) };
      }
      try {
        const result = await this.buildRunner(config, serial);
        xctestrunPath = result.xctestrunPath;
        built = true;
      } catch (err) {
        return { attempted: true, built: false, ok: false, message: errorMessage(err), ...errorCodeField(err) };
      }
    }

    const launch = await launchWdaRunner(serial, xctestrunPath, {
      probe: {
        alive: async () => (await this.checkWda(serial)).reachable,
        controllable: async () => probeControllable(client),
      },
      spawn: this.spawnBg,
      state: this.runnerState,
      port,
      ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
      ...(options.maxPolls === undefined ? {} : { maxPolls: options.maxPolls }),
    });

    // 기동이 실패했을 때만 서명을 읽는다 (REQ-IOS2-007). 성공한 기동에서는
    // 물을 이유가 없고, `doctor`의 실패 전 경고는 `checkSigning`이 따로 싣는다.
    //
    // @MX:NOTE — 만료를 확인해도 그것이 **유일한** 원인이라고 말하지 않는다.
    // 기동 실패 메시지(후보 나열)를 지우지 않고 앞에 덧붙이는 이유가 그것이다.
    // 2026-08-09 실측에서 같은 실패 문구가 서로 다른 조건 넷에서 나왔다.
    const signing = launch.ok ? undefined : await this.readSigning().catch(() => undefined);
    const expired = signing?.verdict === "expired";
    const message = expired
      ? [signing.message, launch.message].filter((part) => part !== undefined && part.length > 0).join("\n\n")
      : launch.message;

    return {
      attempted: true,
      built,
      launched: launch.launched,
      ok: launch.ok,
      ...(message === undefined ? {} : { message }),
      ...(expired ? { code: WDA_SIGNING_EXPIRED } : {}),
      ...(launch.runnerLogPath === undefined ? {} : { runnerLogPath: launch.runnerLogPath }),
    };
  }

  /**
   * CLI가 띄운 러너인가 — 자동 복구의 **재기동 자격** 판정 (REQ-IOS2-005).
   *
   * 생존 판정이 아니다. 생존은 포트가 답하고(design.md §B.1), 이 질문은
   * 기록이 답한다. 두 축을 섞으면 손으로 띄운 러너를 우리가 끄게 된다.
   */
  async isRunnerOwnedByCli(serial: string): Promise<boolean> {
    return (await this.runnerState.get(serial)) !== undefined;
  }

  /**
   * CLI가 띄운 러너를 끄고 다시 띄운다 — 자동 복구의 재기동 1회(REQ-IOS2-005).
   *
   * 성공 여부는 **러너가 다시 응답하는가**로만 답한다. 조작 권한이 실제로
   * 돌아왔는지는 묻지 않는다 — 자동 복구 경로에서는 판정 호출(`/screenshot`,
   * 기기에 따라 10MiB)을 생략하며(design.md §A.4 후단), 진짜 판정은 곧 이어질
   * 원래 명령의 재시도가 대신한다.
   *
   * @MX:ANCHOR — 기록에 없는 기기에서는 아무것도 하지 않고 false를 돌려준다.
   * @MX:REASON — 재기동은 "끄고 다시 띄우기"이므로 남의 러너에 적용하면
   * 그 사용자의 러너를 죽인다. 소유권 규칙(design.md §B.2 · §G.3)은 `reset`
   * 뿐 아니라 이 경로에도 그대로 걸린다(AC-IOS2-027).
   *
   * @MX:NOTE — 산출물이 없으면 재기동하지 않고 false를 돌려준다. 빌드는
   * 사용자 폰에 앱을 설치하는 동작이라 명시적 동의를 요구하며(design.md §H),
   * 복구가 그 동의를 대신 삼킬 수는 없다.
   */
  async relaunchOwnedRunner(
    serial: string,
    options: { pollIntervalMs?: number; maxPolls?: number } = {},
  ): Promise<boolean> {
    const record = await this.runnerState.get(serial);
    if (record === undefined) return false;

    let client: WdaClient;
    try {
      client = this.makeClient(serial);
    } catch {
      return false;
    }

    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_QUIET_POLL_INTERVAL_MS;
    const maxPolls = options.maxPolls ?? DEFAULT_QUIET_MAX_POLLS;

    await stopWdaRunner(serial, { state: this.runnerState, kill: this.killProcess });

    // 방금 끈 러너가 아직 응답하는 동안 다시 띄우면 `launchWdaRunner`가
    // "이미 떠 있다"로 보고 아무것도 하지 않는다 — 포트가 조용해질 때까지 기다린다.
    if (!(await waitUntilQuiet(client, pollIntervalMs, maxPolls))) return false;

    const xctestrunPath = await findXctestrun(wdaArtifactRoot());
    if (xctestrunPath === undefined) return false;

    await launchWdaRunner(serial, xctestrunPath, {
      probe: {
        alive: () => client.isResponsive(),
        controllable: async () => "unknown",
      },
      spawn: this.spawnBg,
      state: this.runnerState,
      port: record.port,
      ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
      ...(options.maxPolls === undefined ? {} : { maxPolls: options.maxPolls }),
    });

    return client.isResponsive();
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
   * CLI가 띄운 포트 포워딩과 러너를 정리한다 (REQ-IOS2-009, AC-IOS2-026 · 027).
   *
   * @MX:ANCHOR — 사용자가 손으로 띄운 러너는 끄지 않는다.
   * @MX:REASON — 손으로 띄우는 경로는 이 SPEC 이전부터 정당했고 지금도 정당하다
   * (design.md §B.2 · §G.3). 포트를 쓰는 프로세스를 모두 죽이면 그 사용자의
   * 러너가 사라진다 — 판정 근거는 포트가 아니라 **우리가 적어 둔 기록**이다.
   */
  async resetDevice(serial: string): Promise<IosResetResult> {
    const result = await stopWdaRunner(serial, { state: this.runnerState, kill: this.killProcess });
    return { noOp: !result.stopped, message: result.reason };
  }
}

/**
 * 조작 가능성을 묻는다 — **권한을 요구하는 읽기 호출**의 성공 여부로 판정한다
 * (design.md §A.1, REQ-IOS2-004).
 *
 * `GET /screenshot`을 쓰는 이유는 2026-08-03 관측이 후보를 갈랐기 때문이다.
 * 권한 상실 상태에서 `/status`는 200, `/wda/locked`도 정상 응답이었고
 * `/screenshot`만 500이었다 — 응답 여부가 아니라 **권한을 요구하는가**가
 * 갈랐다(design.md §A.2).
 *
 * @MX:WARN — 조작 계열(탭·스와이프·키 입력)이나 세션 생성으로 바꾸지 않는다.
 * @MX:REASON — 판정이 기기 상태를 바꾸면 그것은 관측이 아니다. 이 호출은
 * 세션을 만들지 않는 읽기 전용 GET이며, `wda-doctor.test.ts`의 AC-IOS2-011
 * 절이 호출된 경로 전부를 읽어 그 사실을 판정한다.
 *
 * @MX:NOTE — 비용은 기기에 따라 크게 다르다. 2026-08-08 iPad Pro 12.9" 실측은
 * 680ms / 10.2MiB로, design.md §A.4가 적은 "111ms · 약 1MB"(아이폰 기준으로
 * 보인다)의 6~10배다. `doctor`는 자주 부르는 명령이 아니므로 수용하되,
 * 자동 복구 경로에서는 이 판정을 생략한다(design.md §A.4 후단).
 */
async function probeControllable(client: WdaClient): Promise<WdaControllable> {
  try {
    await client.request("GET", "/screenshot", undefined, { idempotent: true });
    return "ok";
  } catch {
    // 원인은 가르지 않는다 — 판별자가 없다(design.md §A.5 · §B.1.1).
    return "failed";
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
