import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessExecutor } from "./process-executor.js";
import { WdaClient, type WdaHttpClient } from "./wda-client.js";
import { WdaDoctor } from "./wda-doctor.js";
import type { BackgroundSpawner } from "./wda-launcher.js";
import { WdaRunnerState } from "./wda-runner-state.js";

/**
 * `resetDevice`는 이제 실제로 프로세스를 끈다. 검사가 기본 생성자를 쓰면
 * **사용자의 진짜 `~/.explore-mobile/`을 읽고 진짜 PID에 `process.kill`을
 * 날린다.** 그래서 모든 검사가 임시 디렉터리와 가짜 kill을 주입한다.
 */
let stateHome: string;
let runnerState: WdaRunnerState;
let killSpy: ReturnType<typeof vi.fn<(pid: number) => void>>;

beforeEach(async () => {
  stateHome = await mkdtemp(join(tmpdir(), "wda-doctor-"));
  runnerState = new WdaRunnerState(stateHome);
  killSpy = vi.fn<(pid: number) => void>();
});

afterEach(async () => {
  await rm(stateHome, { recursive: true, force: true });
});

/**
 * AC-VISION-020(`doctor`가 WDA를 점검한다)은 실기기 JSON 출력으로
 * 확인하지 못했다 — 이 호스트에 adb가 PATH에 없어 `doctor`가 iOS 분기 전에
 * 조기 반환한다(progress.md §E.2 M3 Gap 1). 그래서 이 파일이 그 분기에 대해
 * 남은 유일한 증거다. 실기기 판정을 대체하지는 못하며, 대체한다고 주장하지도
 * 않는다.
 */

const okExec: ProcessExecutor = async () => ({
  stdout: Buffer.from("devicectl version 397"),
  stderr: Buffer.alloc(0),
  exitCode: 0,
});

/** M3 실측 그대로의 `/status` 응답. */
const REAL_STATUS_BODY = JSON.stringify({
  value: {
    build: { version: "16.1.1" },
    os: { name: "iOS", version: "26.5.2" },
    device: "iphone",
    ready: true,
  },
  sessionId: "5E50BA12-DEAD-4D09-9289-3E1A43A080AD",
});

function doctorWith(http: WdaHttpClient, env: NodeJS.ProcessEnv = {}, exec: ProcessExecutor = okExec): WdaDoctor {
  return new WdaDoctor(
    exec,
    "darwin",
    env,
    (serial) => new WdaClient(serial, http, env, async () => undefined),
    runnerState,
    killSpy,
  );
}

describe("WdaDoctor.checkDevicectl", () => {
  it("darwin에서 devicectl이 실행되면 available", async () => {
    await expect(doctorWith(async () => ({ status: 200, body: "{}" })).checkDevicectl()).resolves.toEqual({
      available: true,
    });
  });

  it("darwin이 아니면 지원하지 않는다고 보고한다", async () => {
    const doctor = new WdaDoctor(okExec, "linux", {});
    const result = await doctor.checkDevicectl();
    expect(result.available).toBe(false);
    expect(result.message).toContain("macOS");
  });

  it("devicectl이 non-zero면 available:false (던지지 않는다)", async () => {
    const failing: ProcessExecutor = async () => ({
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      exitCode: 1,
    });
    const result = await doctorWith(async () => ({ status: 200, body: "{}" }), {}, failing).checkDevicectl();
    expect(result.available).toBe(false);
  });

  it("executor가 throw해도 던지지 않는다 — doctor의 일은 진단이지 실패가 아니다", async () => {
    const throwing: ProcessExecutor = async () => {
      throw new Error("ENOENT");
    };
    await expect(
      doctorWith(async () => ({ status: 200, body: "{}" }), {}, throwing).checkDevicectl(),
    ).resolves.toMatchObject({ available: false });
  });
});

/** 2026-08-08 아이패드 실측 그대로의 `/screenshot` 성공 응답(본문은 줄임). */
const REAL_SCREENSHOT_BODY = JSON.stringify({ value: "iVBORw0KGgoAAAANSUhEUgAACqw", sessionId: null });

/** 권한을 잃은 러너의 `/screenshot` 응답 — `/status`는 200인데 이쪽만 500. */
const PERMISSION_DENIED_BODY = JSON.stringify({
  value: { error: "unknown error", message: "Error Domain=com.apple.dt.XCTest" },
});

/**
 * 경로별로 다른 응답을 내면서 **무엇을 어떤 메서드로 불렀는지 기록**하는 대역.
 * AC-IOS2-010(판정 근거)과 AC-IOS2-011(읽기 전용)은 둘 다 "무엇을 불렀는가"를
 * 물으므로, 호출 기록 없이는 판정할 수 없다.
 */
function recordingHttp(responder: (url: string) => { status: number; body: string } | Error) {
  const calls: { url: string; method: string }[] = [];
  const http: WdaHttpClient = async (url, init) => {
    calls.push({ url, method: init.method ?? "GET" });
    const result = responder(url);
    if (result instanceof Error) throw result;
    return result;
  };
  return { http, calls };
}

/** 정상 러너 — `/status`도 `/screenshot`도 200. (design.md §B.1.1 1번) */
function healthyResponder(url: string) {
  return url.includes("/screenshot")
    ? { status: 200, body: REAL_SCREENSHOT_BODY }
    : { status: 200, body: REAL_STATUS_BODY };
}

/** 권한 상실 러너 — `/status` 200, `/screenshot` 500. (design.md §B.1.1 2번) */
function permissionLostResponder(url: string) {
  return url.includes("/screenshot")
    ? { status: 500, body: PERMISSION_DENIED_BODY }
    : { status: 200, body: REAL_STATUS_BODY };
}

/** 동기 응답기를 `WdaHttpClient`(Promise 반환)로 감싼다. */
function asHttp(responder: (url: string) => { status: number; body: string }): WdaHttpClient {
  return async (url) => responder(url);
}

describe("WdaDoctor.checkWda", () => {
  it("WDA가 응답하면 reachable + 빌드 요약을 보고한다", async () => {
    const { http } = recordingHttp(healthyResponder);
    const doctor = doctorWith(http);

    await expect(doctor.checkWda("UDID-A")).resolves.toEqual({
      reachable: true,
      controllable: "ok",
      port: 8100,
      portMapDeclared: false,
      build: "WDA 16.1.1 / iOS 26.5.2 / iphone",
    });
  });

  it("WDA가 죽어 있으면 복구 절차를 담아 보고한다 (던지지 않는다)", async () => {
    const doctor = doctorWith(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await doctor.checkWda("UDID-A");
    expect(result.reachable).toBe(false);
    expect(result.message).toContain("iproxy");
    expect(result.message).toContain("UDID-A");
  });

  it("매핑에 선언된 포트를 쓴다", async () => {
    const doctor = doctorWith(async () => ({ status: 200, body: REAL_STATUS_BODY }), {
      EXPLORE_MOBILE_WDA_PORTS: "UDID-A=8101",
    });

    await expect(doctor.checkWda("UDID-A")).resolves.toMatchObject({ port: 8101, portMapDeclared: true });
  });

  /**
   * 매핑이 선언됐는데 이 기기가 빠져 있으면 `WdaClient` 생성 자체가 던진다.
   * `doctor`는 그것도 보고로 바꿔야 한다 — 진단 명령이 예외로 죽으면 사용자는
   * 무엇이 잘못됐는지 알 수 없다.
   */
  it("매핑 누락 기기도 예외 대신 보고로 돌려준다", async () => {
    const doctor = doctorWith(async () => ({ status: 200, body: REAL_STATUS_BODY }), {
      EXPLORE_MOBILE_WDA_PORTS: "OTHER-UDID=8100",
    });

    const result = await doctor.checkWda("UDID-A");
    expect(result.reachable).toBe(false);
    expect(result.portMapDeclared).toBe(true);
    expect(result.message).toContain("선언돼 있지 않습니다");
  });

  /**
   * 매핑 미선언 상태를 보고서에 드러내는 것이 이 필드의 존재 이유다.
   * `/status`는 기기 종류만 알려주므로, CLI는 포트 너머 기기의 신원을
   * 검증하지 못한다는 사실을 사용자가 눈으로 확인할 수 있어야 한다.
   */
  it("매핑 미선언 상태를 portMapDeclared:false로 드러낸다", async () => {
    const doctor = doctorWith(async () => ({ status: 200, body: REAL_STATUS_BODY }));
    await expect(doctor.checkWda("UDID-A")).resolves.toMatchObject({ portMapDeclared: false });
  });
});

describe("AC-IOS2-010 — 가용성 판정이 /status 단독이 아니다 (REQ-IOS2-004)", () => {
  /**
   * 근거: 2026-08-03 권한 상실 관측 — `/status`는 **200 정상**, `/wda/locked`도
   * 정상 응답, `/screenshot`만 500이었다(design.md §A.2). 응답 여부가 아니라
   * **권한을 요구하는 호출인가**가 갈랐다.
   */
  it("판정 경로가 권한 요구 호출(/screenshot)을 실제로 부른다", async () => {
    const { http, calls } = recordingHttp(healthyResponder);
    await doctorWith(http).checkWda("UDID-A");

    expect(calls.some((call) => call.url.includes("/screenshot"))).toBe(true);
  });

  it("/status가 200이어도 권한 호출이 실패하면 조작 가능으로 보고하지 않는다", async () => {
    const { http } = recordingHttp(permissionLostResponder);
    const result = await doctorWith(http).checkWda("UDID-A");

    // 이 상태가 REQ-IOS2-004의 존재 이유다 — 이전 코드는 여기서 "정상"을 답했다.
    expect(result.reachable).toBe(true);
    expect(result.controllable).not.toBe("ok");
  });
});

describe("AC-IOS2-011 — 판정 호출이 화면을 바꾸지 않는다 (주 판정: 코드 확인)", () => {
  /** 판정 경로가 불러도 되는 읽기 전용 엔드포인트. */
  const READ_ONLY_PATHS = ["/status", "/screenshot"];

  it("판정 경로의 모든 호출이 GET이다", async () => {
    const { http, calls } = recordingHttp(healthyResponder);
    await doctorWith(http).checkWda("UDID-A");

    expect(calls.length).toBeGreaterThan(0); // 0건 통과 방지
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("판정 경로가 읽기 전용 엔드포인트만 부른다 — 세션 생성도 조작 계열도 없다", async () => {
    const { http, calls } = recordingHttp(healthyResponder);
    await doctorWith(http).checkWda("UDID-A");

    const paths = calls.map((call) => new URL(call.url).pathname);
    expect(paths.length).toBeGreaterThan(0); // 0건 통과 방지
    for (const path of paths) {
      expect(READ_ONLY_PATHS).toContain(path);
    }
    // 조작 계열(탭·스와이프·키 입력)과 세션 생성이 섞여 들어오지 않았다.
    expect(paths.some((path) => path.includes("/actions"))).toBe(false);
    expect(paths.some((path) => path.includes("/session"))).toBe(false);
  });

  it("권한 호출이 실패하는 상태에서도 조작 계열로 되묻지 않는다", async () => {
    const { http, calls } = recordingHttp(permissionLostResponder);
    await doctorWith(http).checkWda("UDID-A");

    const paths = calls.map((call) => new URL(call.url).pathname);
    for (const path of paths) {
      expect(READ_ONLY_PATHS).toContain(path);
    }
  });
});

describe("AC-IOS2-029 — 생존과 조작 가능성이 별개 필드로 실린다 (REQ-IOS2-004)", () => {
  /**
   * design.md §B.1.1의 세 상태가 **서로 다른 필드 조합**으로 나타나야 한다.
   * 특히 2번(생존=응답 / 권한=실패)이 3번(생존=무응답 / 권한=물을 수 없음)과
   * 구별돼야 한다 — 합치면 §B.1이 고친 자기모순이 조용히 되돌아온다.
   */
  it("§B.1.1 1번 — 생존=응답 / 권한=성공", async () => {
    const { http } = recordingHttp(healthyResponder);
    await expect(doctorWith(http).checkWda("UDID-A")).resolves.toMatchObject({
      reachable: true,
      controllable: "ok",
    });
  });

  it("§B.1.1 2번 — 생존=응답 / 권한=실패 (§A.2가 실제로 관측한 상태)", async () => {
    const { http } = recordingHttp(permissionLostResponder);
    await expect(doctorWith(http).checkWda("UDID-A")).resolves.toMatchObject({
      reachable: true,
      controllable: "failed",
    });
  });

  it("§B.1.1 3번 — 생존=무응답 / 권한=물을 수 없음", async () => {
    const { http } = recordingHttp(() => new Error("ECONNREFUSED"));
    await expect(doctorWith(http).checkWda("UDID-A")).resolves.toMatchObject({
      reachable: false,
      controllable: "unknown",
    });
  });

  it("세 상태가 서로 다른 조합이다 — 두 값이 하나로 합쳐지지 않았다", async () => {
    const results = await Promise.all([
      doctorWith(recordingHttp(healthyResponder).http).checkWda("UDID-A"),
      doctorWith(recordingHttp(permissionLostResponder).http).checkWda("UDID-A"),
      doctorWith(recordingHttp(() => new Error("ECONNREFUSED")).http).checkWda("UDID-A"),
    ]);

    const combos = results.map((result) => `${result.reachable}/${result.controllable}`);
    expect(new Set(combos).size).toBe(3);
  });

  it("생존이 2값·권한이 3값으로 서로 다른 축이다 — 권한은 불리언이 아니다", async () => {
    const { http } = recordingHttp(permissionLostResponder);
    const result = await doctorWith(http).checkWda("UDID-A");

    expect(typeof result.reachable).toBe("boolean");
    expect(typeof result.controllable).toBe("string");
    expect(["ok", "failed", "unknown"]).toContain(result.controllable);
  });
});

describe("WdaDoctor.bringUpWda — 동의와 무동작 (REQ-IOS2-002 · 003)", () => {
  /** 빌드·기동을 절대 실행하지 않는 대역. 무엇이 불렸는지만 센다. */
  function doctorWithSpies(http: WdaHttpClient) {
    const spawnBg = vi.fn<BackgroundSpawner>(async () => 9999);
    const buildRunner = vi.fn(async () => ({
      xctestrunPath: "/tmp/없는/경로.xctestrun",
      derivedDataPath: "/tmp/없는",
    }));
    const doctor = new WdaDoctor(
      okExec,
      "darwin",
      {},
      (serial) => new WdaClient(serial, http, {}, async () => undefined),
      runnerState,
      killSpy,
      spawnBg,
      buildRunner,
    );
    return { doctor, spawnBg, buildRunner };
  }

  it("동의가 없으면 아무것도 하지 않는다 (design.md §H)", async () => {
    const { doctor, spawnBg, buildRunner } = doctorWithSpies(asHttp(healthyResponder));

    const result = await doctor.bringUpWda("UDID-A", false);

    expect(result.attempted).toBe(false);
    expect(result.reason).toContain("--yes");
    expect(spawnBg).not.toHaveBeenCalled();
    expect(buildRunner).not.toHaveBeenCalled();
  });

  it("동의가 없으면 판정 호출조차 하지 않는다 — 10MiB를 공짜로 받지 않는다", async () => {
    const { http, calls } = recordingHttp(healthyResponder);
    const { doctor } = doctorWithSpies(http);

    await doctor.bringUpWda("UDID-A", false);

    expect(calls).toEqual([]);
  });

  it("이미 사용 가능하면 기동하지 않는다", async () => {
    const { doctor, spawnBg, buildRunner } = doctorWithSpies(asHttp(healthyResponder));

    const result = await doctor.bringUpWda("UDID-A", true);

    expect(result.attempted).toBe(false);
    expect(result.reason).toContain("이미 사용 가능");
    expect(spawnBg).not.toHaveBeenCalled();
    expect(buildRunner).not.toHaveBeenCalled();
  });

  /**
   * 러너가 살아 있어도 **조작이 안 되면** 사용 가능이 아니다 — 그 상태가
   * REQ-IOS2-004의 존재 이유이고, 준비 경로도 같은 판정을 써야 한다.
   */
  it("생존하지만 조작이 안 되면 사용 가능으로 보지 않는다", async () => {
    const { doctor } = doctorWithSpies(asHttp(permissionLostResponder));

    const result = await doctor.bringUpWda("UDID-A", true);

    expect(result.attempted).toBe(true);
  });

  it("설정이 없으면 전용 코드로 보고하고 빌드하지 않는다", async () => {
    // 산출물이 없는 상태를 만들 수 없으므로, 설정 부재가 먼저 걸리는지만 본다.
    // (산출물이 이미 있으면 이 경로에 도달하지 않는다 — 아래 주석 참조.)
    const { doctor } = doctorWithSpies(asHttp(permissionLostResponder));

    const result = await doctor.bringUpWda("UDID-A", true);

    // 이 호스트에 산출물이 있으면 빌드를 건너뛰고 기동으로 간다. 어느 쪽이든
    // **설정 부재를 WDA_UNREACHABLE로 뭉개지 않는다**는 것이 여기서 볼 것이다.
    expect(result.code).not.toBe("WDA_UNREACHABLE");
  });
});

describe("WdaDoctor.resetDevice / installGuidance", () => {
  /**
   * `reset`의 계약이 바뀌었다 (design.md §G.1). 이전 계약("iOS에는 정리할
   * IME/APK 상태가 없다 — 되돌릴 것이 없다")은 CLI가 아무것도 띄우지 않던
   * 시점의 사실이었고, 이 SPEC이 프로세스를 띄우기 시작하면서 무너졌다.
   */
  it("AC-IOS2-027 — CLI가 띄우지 않았으면 아무것도 끄지 않는다", async () => {
    const doctor = doctorWith(async () => ({ status: 200, body: "{}" }));

    const result = await doctor.resetDevice("UDID-A");

    expect(result.noOp).toBe(true);
    expect(result.message).toContain("CLI가 띄우지 않");
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("AC-IOS2-026 — CLI가 띄운 것은 끄고 기록을 지운다", async () => {
    await runnerState.remember({
      udid: "UDID-A",
      port: 8100,
      iproxyPid: 7001,
      runnerPid: 7002,
      startedAt: "2026-08-08T00:00:00.000Z",
    });
    const doctor = doctorWith(async () => ({ status: 200, body: "{}" }));

    const result = await doctor.resetDevice("UDID-A");

    expect(result.noOp).toBe(false);
    expect(killSpy.mock.calls.map((call) => call[0]).sort()).toEqual([7001, 7002]);
    expect(await runnerState.owns("UDID-A")).toBe(false);
  });

  it("설치를 대신 수행하지 않고 안내만 한다", async () => {
    const exec = vi.fn(okExec);
    const doctor = doctorWith(async () => ({ status: 200, body: "{}" }), {}, exec);

    const guidance = await doctor.installGuidance();

    expect(guidance.platformSupported).toBe(true);
    expect(guidance.steps?.some((step) => step.includes("iproxy"))).toBe(true);
    expect(exec).not.toHaveBeenCalled(); // 어떤 설치 명령도 실행하지 않았다
  });
});
