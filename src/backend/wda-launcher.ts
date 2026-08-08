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

import type { WdaControllable } from "./wda-doctor.js";
import { WdaRunnerState } from "./wda-runner-state.js";

/** 러너의 생존과 조작 가능성을 묻는 경로. HTTP 세부는 호출자가 넣는다. */
export interface WdaProbe {
  alive(port: number): Promise<boolean>;
  controllable(port: number): Promise<WdaControllable>;
}

/** 백그라운드로 띄우고 프로세스 식별자를 돌려준다. */
export type BackgroundSpawner = (command: string, args: string[]) => Promise<number>;

export interface WdaLaunchOptions {
  probe: WdaProbe;
  spawn: BackgroundSpawner;
  state: WdaRunnerState;
  port: number;
  pollIntervalMs?: number;
  maxPolls?: number;
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

  const iproxyPid = await spawn("iproxy", [`${port}:8100`, "-u", udid]);
  const runnerPid = await spawn("xcodebuild", [
    "test-without-building",
    "-xctestrun",
    xctestrunPath,
    "-destination",
    `id=${udid}`,
  ]);

  const alive = await waitUntilAlive(probe, port, pollIntervalMs, maxPolls);
  if (!alive) {
    return {
      udid,
      port,
      ok: false,
      alreadyRunning: false,
      launched: true,
      controllable: "unknown",
      message: `러너가 ${port} 포트에서 응답하지 않습니다. 기기의 UI 자동화 승인을 확인하세요.`,
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
