/**
 * WDA 러너 기동과 정리 (SPEC-IOS-002 REQ-IOS2-003 · REQ-IOS2-009).
 *
 * **소유권 규칙** (design.md §B.1):
 *   - 생존 판정은 **포트**로 한다. 응답하면 러너가 있는 것이고, 누가 띄웠는지
 *     묻지 않는다. 사용자가 손으로 띄운 러너도 정당하기 때문이다 — 지금까지
 *     사용자는 그렇게 써 왔고 이 SPEC이 그 경로를 막을 이유가 없다.
 *   - 종료 자격은 **기록**으로 판정한다. CLI가 띄운 것만 CLI가 끈다.
 *
 * 두 축이 다르다는 것이 핵심이다. 포트로 종료 자격을 판정하면 그 포트를 쓰는
 * 남의 프로세스를 죽이게 되고(AC-IOS2-027 위반), 기록으로 생존을 판정하면
 * 손으로 띄운 러너를 못 보고 중복 기동한다(AC-IOS2-009 위반).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { WdaControllable } from "./wda-doctor.js";
import { WdaRunnerState } from "./wda-runner-state.js";

/** 러너의 생존과 조작 가능성을 묻는 경로. HTTP 세부는 호출자가 넣는다. */
export interface WdaProbe {
  alive(port: number): Promise<boolean>;
  controllable(port: number): Promise<WdaControllable>;
}

/**
 * 백그라운드로 띄우고 프로세스 식별자를 돌려준다.
 *
 * `logPath`가 주어지면 출력을 그 파일로 흘린다. 선택 인자가 아니라 사실상
 * 필수다 — 2026-08-08 실측에서 출력을 버린 채 러너를 띄웠다가 **죽은 이유를
 * 알 수 없는 상태**가 됐다. 기동 실패는 흔한 정상 상태이므로 원인이 남아야 한다.
 */
export type BackgroundSpawner = (command: string, args: string[], logPath?: string) => Promise<number>;

export interface WdaLaunchOptions {
  probe: WdaProbe;
  spawn: BackgroundSpawner;
  state: WdaRunnerState;
  port: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  /** 기동 로그가 쌓이는 곳. 기본은 `~/.explore-mobile/logs`. */
  logDir?: string;
}

export interface WdaLaunchResult {
  udid: string;
  port: number;
  /** 조작 가능 확인까지 마쳤는가 (AC-IOS2-008). */
  ok: boolean;
  /** 이미 떠 있어서 새로 띄우지 않았는가 (AC-IOS2-009). */
  alreadyRunning: boolean;
  /** CLI가 이번에 띄웠는가. */
  launched: boolean;
  controllable: WdaControllable;
  message?: string;
  /** 이번에 띄웠을 때 러너 출력이 쌓인 곳 — 실패 원인이 여기 있다. */
  runnerLogPath?: string;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLLS = 40;

/**
 * 러너를 기동한다 — **조작 가능 확인까지 마친 뒤** 성공을 보고한다.
 *
 * "프로세스를 띄웠다"를 성공으로 보고하면 사용자가 바로 다음 명령에서 실패한다.
 * 성공 보고와 실제 사용 가능 사이에 틈이 없어야 한다(AC-IOS2-008).
 *
 * 던지지 않는다 — 기동 실패는 흔한 정상 상태이고, 호출자가 보고할 수 있어야 한다.
 */
export async function launchWdaRunner(
  udid: string,
  xctestrunPath: string,
  options: WdaLaunchOptions,
): Promise<WdaLaunchResult> {
  const { probe, spawn, state, port } = options;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;

  // 1차 신호는 포트다. 살아 있으면 누가 띄웠든 인정하고 새로 띄우지 않는다.
  if (await probe.alive(port)) {
    const controllable = await probe.controllable(port);
    return {
      udid,
      port,
      ok: controllable === "ok",
      alreadyRunning: true,
      launched: false,
      controllable,
      // 우리가 띄운 것이 아니므로 기록하지 않는다 — 기록하면 이후 정리가
      // 남의 러너를 끄게 된다(AC-IOS2-027).
      message: "이미 떠 있는 러너를 그대로 씁니다.",
    };
  }

  const logDir = options.logDir ?? defaultLogDir();
  const iproxyLog = join(logDir, `iproxy-${udid}.log`);
  const runnerLog = join(logDir, `runner-${udid}.log`);

  const iproxyPid = await spawn("iproxy", [`${port}:8100`, "-u", udid], iproxyLog);
  const runnerPid = await spawn(
    "xcodebuild",
    ["test-without-building", "-xctestrun", xctestrunPath, "-destination", `id=${udid}`],
    runnerLog,
  );

  const alive = await waitUntilAlive(probe, port, pollIntervalMs, maxPolls);
  if (!alive) {
    return {
      udid,
      port,
      ok: false,
      alreadyRunning: false,
      launched: true,
      controllable: "unknown",
      // @MX:WARN — 이 문구는 원인을 **단정하지 않는다**.
      // @MX:REASON — 2026-08-09 실측에서 `Timed out while enabling automation
      // mode.`가 서로 다른 조건 넷(미승인 / 재설치 후 / 재승인 후 / 기존 산출물)
      // 에서 모두 같은 문구로 나왔다. 즉 이 문구는 여러 원인이 합류하는 지점이며,
      // 어느 하나로 좁혀 안내하면 사용자를 엉뚱한 곳으로 보낸다. 후보를 나열하되
      // 무엇이 원인인지는 말하지 않는다.
      message: [
        `러너가 ${port} 포트에서 응답하지 않습니다.`,
        "기기 쪽에서 확인할 것 (어느 것이 원인인지는 이 신호로 구별되지 않습니다):",
        "  - 기기가 잠금 해제된 채 깨어 있는가 — 기동에는 1~3분이 걸리고 그동안 내내 필요합니다",
        "  - UI 자동화가 켜져 있는가 (설정 > 개발자)",
        "  - 개발자 인증서를 신뢰했는가 (설정 > 일반 > VPN 및 기기 관리)",
        `원본 출력: ${runnerLog}`,
      ].join("\n"),
      runnerLogPath: runnerLog,
    };
  }

  await state.remember({ udid, port, iproxyPid, runnerPid, startedAt: nowIso() });

  const controllable = await probe.controllable(port);
  return {
    udid,
    port,
    ok: controllable === "ok",
    alreadyRunning: false,
    launched: true,
    controllable,
    ...(controllable === "ok" ? {} : { message: "러너는 떴으나 조작 권한을 확인하지 못했습니다." }),
  };
}

export interface WdaStopOptions {
  state: WdaRunnerState;
  kill: (pid: number) => void;
}

export interface WdaStopResult {
  udid: string;
  stopped: boolean;
  reason: string;
}

/**
 * CLI가 띄운 러너만 정리한다 (AC-IOS2-026 · 027).
 *
 * @MX:ANCHOR — 기록에 없는 기기는 어떤 프로세스도 끄지 않는다.
 * @MX:REASON — 포트를 쓰는 프로세스를 모두 죽이면 사용자가 손으로 띄워 쓰던
 * 러너가 사라진다. 그 경로는 이 SPEC 이전부터 정당했고, 막을 이유가 없다
 * (design.md §B.2 · §G.3).
 */
export async function stopWdaRunner(udid: string, options: WdaStopOptions): Promise<WdaStopResult> {
  const { state, kill } = options;
  const record = await state.get(udid);

  if (record === undefined) {
    return {
      udid,
      stopped: false,
      reason: "CLI가 띄우지 않은 러너입니다 — 끄지 않습니다.",
    };
  }

  // 이미 죽은 프로세스를 끄려는 오류(ESRCH)는 정리의 실패가 아니다.
  for (const pid of [record.runnerPid, record.iproxyPid]) {
    try {
      kill(pid);
    } catch {
      // 이미 없다 — 목표는 이미 달성돼 있다.
    }
  }
  await state.forget(udid);

  return { udid, stopped: true, reason: `CLI가 띄운 러너를 정리했습니다 (포트 ${record.port}).` };
}

async function waitUntilAlive(probe: WdaProbe, port: number, intervalMs: number, maxPolls: number): Promise<boolean> {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (await probe.alive(port)) return true;
    if (intervalMs > 0) await sleep(intervalMs);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `new Date()` 대신 한 자리에 모아 둔다 — 검사에서 시각을 고정하기 쉽다. */
function nowIso(): string {
  return new Date().toISOString();
}

/** 산출물·상태와 같은 뿌리 아래 둔다 (design.md §D.2와 같은 이유). */
function defaultLogDir(): string {
  return join(homedir(), ".explore-mobile", "logs");
}
