import { describe, expect, it, vi } from "vitest";

import type { ProcessExecutor } from "./process-executor.js";
import { WdaClient, type WdaHttpClient } from "./wda-client.js";
import { WdaDoctor } from "./wda-doctor.js";

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

describe("WdaDoctor.checkWda", () => {
  it("WDA가 응답하면 reachable + 빌드 요약을 보고한다", async () => {
    const doctor = doctorWith(async () => ({ status: 200, body: REAL_STATUS_BODY }));

    await expect(doctor.checkWda("UDID-A")).resolves.toEqual({
      reachable: true,
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

describe("WdaDoctor.resetDevice / installGuidance", () => {
  it("reset은 no-op이다 — iOS에는 되돌릴 IME/APK 상태가 없다", async () => {
    const doctor = doctorWith(async () => ({ status: 200, body: "{}" }));
    await expect(doctor.resetDevice("UDID-A")).resolves.toMatchObject({ noOp: true });
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
