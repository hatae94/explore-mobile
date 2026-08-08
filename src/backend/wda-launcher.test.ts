/**
 * `wda-launcher.ts` 검사 (SPEC-IOS-002 REQ-IOS2-003 · REQ-IOS2-009).
 * 대응 AC: AC-IOS2-008 · 009 · 026 · 027.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchWdaRunner, stopWdaRunner, type BackgroundSpawner, type WdaProbe } from "./wda-launcher.js";
import { WdaRunnerState } from "./wda-runner-state.js";

const UDID = "00008103-000458360A63401E";
const XCTESTRUN = "/Users/tester/.explore-mobile/wda/Build/Products/WebDriverAgentRunner_iphoneos26.0-arm64.xctestrun";

let home: string;
let state: WdaRunnerState;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "wda-launch-"));
  state = new WdaRunnerState(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

/** 처음엔 죽어 있다가 N회 뒤 살아나는 러너. */
function probeThatWakesAfter(polls: number, controllable: "ok" | "failed" = "ok"): WdaProbe {
  let seen = 0;
  return {
    alive: async () => ++seen > polls,
    controllable: async () => controllable,
  };
}

const deadProbe: WdaProbe = { alive: async () => false, controllable: async () => "unknown" };
const healthyProbe: WdaProbe = { alive: async () => true, controllable: async () => "ok" };

function spawner() {
  let next = 5000;
  return vi.fn<BackgroundSpawner>(async () => ++next);
}

describe("AC-IOS2-009 — 이미 떠 있으면 중복 기동하지 않는다", () => {
  it("러너가 살아 있으면 새 프로세스를 띄우지 않는다", async () => {
    const spawn = spawner();
    const result = await launchWdaRunner(UDID, XCTESTRUN, { probe: healthyProbe, spawn, state, port: 8100 });

    expect(result.alreadyRunning).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("이미 떠 있는 러너는 우리 것이 아니어도 인정한다 — 포트가 1차 신호다", async () => {
    // 상태 파일이 비어 있다 = CLI가 띄운 적 없다. 그래도 살아 있으면 인정한다.
    expect(await state.owns(UDID)).toBe(false);

    const result = await launchWdaRunner(UDID, XCTESTRUN, { probe: healthyProbe, spawn: spawner(), state, port: 8100 });
    expect(result.alreadyRunning).toBe(true);
  });

  it("남의 러너를 인정했을 때 그것을 우리 것으로 기록하지 않는다", async () => {
    await launchWdaRunner(UDID, XCTESTRUN, { probe: healthyProbe, spawn: spawner(), state, port: 8100 });

    // 기록하면 이후 reset이 남의 러너를 끄게 된다 (AC-IOS2-027 위반).
    expect(await state.owns(UDID)).toBe(false);
  });
});

describe("AC-IOS2-008 — 조작 가능 확인까지 마친 뒤 성공을 보고한다", () => {
  it("기동 후 조작 가능하면 성공으로 보고한다", async () => {
    const result = await launchWdaRunner(UDID, XCTESTRUN, {
      probe: probeThatWakesAfter(2),
      spawn: spawner(),
      state,
      port: 8100,
      pollIntervalMs: 0,
    });

    expect(result.launched).toBe(true);
    expect(result.controllable).toBe("ok");
  });

  it("프로세스는 떴는데 조작이 안 되면 성공으로 보고하지 않는다", async () => {
    const result = await launchWdaRunner(UDID, XCTESTRUN, {
      probe: probeThatWakesAfter(2, "failed"),
      spawn: spawner(),
      state,
      port: 8100,
      pollIntervalMs: 0,
    });

    // "프로세스를 띄웠다"를 성공으로 보고하면 사용자가 다음 명령에서 실패한다.
    expect(result.controllable).toBe("failed");
    expect(result.ok).toBe(false);
  });

  it("러너가 끝내 응답하지 않으면 실패로 보고한다 (던지지 않는다)", async () => {
    const result = await launchWdaRunner(UDID, XCTESTRUN, {
      probe: deadProbe,
      spawn: spawner(),
      state,
      port: 8100,
      pollIntervalMs: 0,
      maxPolls: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.controllable).toBe("unknown");
  });

  it("우리가 띄운 것은 상태 파일에 기록한다 — 나중에 정리하려면 필요하다", async () => {
    await launchWdaRunner(UDID, XCTESTRUN, {
      probe: probeThatWakesAfter(1),
      spawn: spawner(),
      state,
      port: 8100,
      pollIntervalMs: 0,
    });

    expect(await state.owns(UDID)).toBe(true);
    expect(await state.get(UDID)).toMatchObject({ port: 8100 });
  });

  it("iproxy와 러너 둘 다 띄운다", async () => {
    const spawn = spawner();
    await launchWdaRunner(UDID, XCTESTRUN, {
      probe: probeThatWakesAfter(1),
      spawn,
      state,
      port: 8100,
      pollIntervalMs: 0,
    });

    const commands = spawn.mock.calls.map((call) => call[0]);
    expect(commands).toEqual(["iproxy", "xcodebuild"]);
  });

  it("러너 기동은 재빌드하지 않는다 — test-without-building이다", async () => {
    const spawn = spawner();
    await launchWdaRunner(UDID, XCTESTRUN, {
      probe: probeThatWakesAfter(1),
      spawn,
      state,
      port: 8100,
      pollIntervalMs: 0,
    });

    const xcodebuildArgs = spawn.mock.calls.find((call) => call[0] === "xcodebuild")?.[1] ?? [];
    expect(xcodebuildArgs).toContain("test-without-building");
    expect(xcodebuildArgs).toContain(XCTESTRUN);
    expect(xcodebuildArgs).not.toContain("build-for-testing");
  });
});

describe("AC-IOS2-026 — reset이 CLI가 띄운 프로세스를 정리한다", () => {
  it("우리가 띄운 것이면 두 프로세스를 끄고 기록을 지운다", async () => {
    await state.remember({
      udid: UDID,
      port: 8100,
      iproxyPid: 5001,
      runnerPid: 5002,
      startedAt: "2026-08-08T00:00:00.000Z",
    });
    const kill = vi.fn();

    const result = await stopWdaRunner(UDID, { state, kill });

    expect(result.stopped).toBe(true);
    expect(kill.mock.calls.map((call) => call[0]).sort()).toEqual([5001, 5002]);
    expect(await state.owns(UDID)).toBe(false);
  });

  it("이미 죽은 프로세스를 끄려다 나는 오류는 삼킨다 — 정리가 오류로 죽지 않는다", async () => {
    await state.remember({
      udid: UDID,
      port: 8100,
      iproxyPid: 5001,
      runnerPid: 5002,
      startedAt: "2026-08-08T00:00:00.000Z",
    });
    const kill = vi.fn(() => {
      throw new Error("ESRCH");
    });

    const result = await stopWdaRunner(UDID, { state, kill });

    expect(result.stopped).toBe(true);
    expect(await state.owns(UDID)).toBe(false); // 기록은 지운다 — 프로세스가 없으니 남길 이유가 없다
  });
});

describe("AC-IOS2-027 — 사용자가 손으로 띄운 러너는 CLI가 끄지 않는다 (경계 대조)", () => {
  /**
   * 이 대조가 없으면 구현이 포트를 쓰는 모든 프로세스를 죽여도 AC-026은 통과한다.
   */
  it("기록에 없으면 아무 프로세스도 끄지 않는다", async () => {
    const kill = vi.fn();

    const result = await stopWdaRunner(UDID, { state, kill });

    expect(result.stopped).toBe(false);
    expect(result.reason).toContain("CLI가 띄우지 않");
    expect(kill).not.toHaveBeenCalled();
  });

  it("다른 기기를 우리가 띄웠어도, 이 기기는 끄지 않는다", async () => {
    await state.remember({
      udid: "OTHER-UDID",
      port: 8101,
      iproxyPid: 6001,
      runnerPid: 6002,
      startedAt: "2026-08-08T00:00:00.000Z",
    });
    const kill = vi.fn();

    const result = await stopWdaRunner(UDID, { state, kill });

    expect(result.stopped).toBe(false);
    expect(kill).not.toHaveBeenCalled();
    expect(await state.owns("OTHER-UDID")).toBe(true); // 남의 기기 기록은 건드리지 않는다
  });
});
