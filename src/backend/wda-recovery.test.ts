/**
 * 자동 복구 검사 (SPEC-IOS-002 REQ-IOS2-005 — AC-IOS2-013 ~ 017).
 *
 * **이 파일이 판정하는 것과 판정하지 못하는 것을 먼저 적는다**(plan.md §E.2).
 * 여기서 확인되는 것은 **분기와 호출 횟수**다 — 어떤 오류에서 복구를 시도하고,
 * 몇 번 시도하며, 실패하면 무엇을 돌려주는가. 실제 러너가 권한을 잃었을 때
 * 재기동이 그것을 고치는가는 이 검사가 답할 수 없다. 권한 상실 상태를 만들
 * 수 없기 때문이며(`acceptance.md` §E), 그 한계는 SPEC 착수 전에 선언됐다.
 */

import { describe, expect, it } from "vitest";
import {
  WdaCommandFailedError,
  WdaResponseLostError,
  WdaUnreachableError,
} from "./wda-errors.js";
import { isRunnerPermissionFailure, withRunnerRecovery, type WdaRecoveryPort } from "./wda-recovery.js";

const SERIAL = "00008103-000A4D9C0C68001E";

/** 호출 횟수를 세는 복구 포트. 기본은 "우리 러너이고 재기동은 성공한다". */
function makePort(overrides: Partial<WdaRecoveryPort> = {}): WdaRecoveryPort & {
  ownedCalls: number;
  relaunchCalls: number;
} {
  const counters = { ownedCalls: 0, relaunchCalls: 0 };
  return {
    get ownedCalls() {
      return counters.ownedCalls;
    },
    get relaunchCalls() {
      return counters.relaunchCalls;
    },
    isOwnedByCli: async (serial) => {
      counters.ownedCalls += 1;
      return overrides.isOwnedByCli === undefined ? true : overrides.isOwnedByCli(serial);
    },
    relaunch: async (serial) => {
      counters.relaunchCalls += 1;
      return overrides.relaunch === undefined ? true : overrides.relaunch(serial);
    },
  };
}

/** n번째 호출까지는 주어진 오류를 던지고, 그 뒤로는 값을 돌려주는 조작. */
function makeOperation(failTimes: number, error: unknown, value = "ok") {
  const calls = { count: 0 };
  return {
    calls,
    run: async (): Promise<string> => {
      calls.count += 1;
      if (calls.count <= failTimes) throw error;
      return value;
    },
  };
}

describe("isRunnerPermissionFailure — 무엇을 복구 대상으로 보는가", () => {
  it("러너가 5xx로 응답한 경우만 복구 대상이다", () => {
    expect(isRunnerPermissionFailure(new WdaCommandFailedError("권한 실패", 500))).toBe(true);
    expect(isRunnerPermissionFailure(new WdaCommandFailedError("서버 오류", 503))).toBe(true);
  });

  it("4xx는 복구 대상이 아니다 — 재기동해도 요청 자체가 거부된 사실은 안 바뀐다", () => {
    expect(isRunnerPermissionFailure(new WdaCommandFailedError("잘못된 요청", 400))).toBe(false);
    expect(isRunnerPermissionFailure(new WdaCommandFailedError("없음", 404))).toBe(false);
  });

  it("상태를 모르는 실패는 복구 대상이 아니다 — 문구로 추정하지 않는다", () => {
    expect(isRunnerPermissionFailure(new WdaCommandFailedError("JSON으로 읽을 수 없습니다"))).toBe(false);
  });

  it("응답 유실과 도달 불가는 복구 대상이 아니다", () => {
    expect(isRunnerPermissionFailure(new WdaResponseLostError("응답 유실"))).toBe(false);
    expect(isRunnerPermissionFailure(new WdaUnreachableError("도달 불가"))).toBe(false);
  });
});

describe("AC-IOS2-013 — 권한 오류에서 1회 재기동 후 재시도한다", () => {
  it("재기동 1회 뒤 원래 명령을 재시도해 성공하면 그 값을 돌려준다", async () => {
    const port = makePort();
    const operation = makeOperation(1, new WdaCommandFailedError("권한 실패", 500), "탭 완료");

    const outcome = await withRunnerRecovery(SERIAL, operation.run, port);

    expect(outcome.value).toBe("탭 완료");
    expect(port.relaunchCalls).toBe(1);
    expect(operation.calls.count).toBe(2); // 최초 1회 + 재시도 1회
  });

  it("처음부터 성공하면 재기동하지 않는다", async () => {
    const port = makePort();
    const operation = makeOperation(0, new WdaCommandFailedError("권한 실패", 500));

    const outcome = await withRunnerRecovery(SERIAL, operation.run, port);

    expect(outcome.recovered).toBe(false);
    expect(port.relaunchCalls).toBe(0);
    expect(operation.calls.count).toBe(1);
  });

  it("CLI가 띄우지 않은 러너는 재기동하지 않는다 — 소유권 규칙(AC-IOS2-027)이 이 경로에도 걸린다", async () => {
    const port = makePort({ isOwnedByCli: async () => false });
    const original = new WdaCommandFailedError("권한 실패", 500);
    const operation = makeOperation(1, original);

    await expect(withRunnerRecovery(SERIAL, operation.run, port)).rejects.toBe(original);
    expect(port.relaunchCalls).toBe(0);
    expect(operation.calls.count).toBe(1);
  });
});

describe("AC-IOS2-014 — 재기동과 재시도가 각각 정확히 1회다", () => {
  it("재기동 뒤에도 계속 실패해도 두 번째 재기동은 없다", async () => {
    const port = makePort();
    const original = new WdaCommandFailedError("권한 실패", 500);
    const operation = makeOperation(Number.MAX_SAFE_INTEGER, original);

    await expect(withRunnerRecovery(SERIAL, operation.run, port)).rejects.toBe(original);

    // 무한 반복은 복구가 아니라 죽음의 고리다(design.md §F.4).
    expect(port.relaunchCalls).toBe(1);
    expect(operation.calls.count).toBe(2);
  });
});

describe("AC-IOS2-015 — 응답 유실에는 자동 복구가 적용되지 않는다", () => {
  it("응답 유실은 재기동도 재시도도 하지 않고 그대로 올려보낸다", async () => {
    const port = makePort();
    const original = new WdaResponseLostError("응답 유실");
    const operation = makeOperation(1, original);

    await expect(withRunnerRecovery(SERIAL, operation.run, port)).rejects.toBe(original);

    // 응답을 잃어도 효과는 적용된 관측이 있다(앱 종료 4/4, 탭 1/5).
    // 재시도는 곧 중복 실행이다(design.md §F.3).
    expect(operation.calls.count).toBe(1);
    expect(port.relaunchCalls).toBe(0);
    expect(port.ownedCalls).toBe(0);
  });

  it("도달 불가도 마찬가지다 — 복구 경로에 들어가지 않는다", async () => {
    const port = makePort();
    const original = new WdaUnreachableError("도달 불가");
    const operation = makeOperation(1, original);

    await expect(withRunnerRecovery(SERIAL, operation.run, port)).rejects.toBe(original);
    expect(operation.calls.count).toBe(1);
    expect(port.relaunchCalls).toBe(0);
  });

  it("양성 대조 — 같은 조작이 5xx였다면 재시도된다", async () => {
    // 위 세 검사는 모두 "일어나지 않았다"를 주장한다. 그것만 있으면 복구 경로
    // 자체가 죽어 있어도 전부 통과한다(원칙 ②·③, AC-IOS2-004와 같은 공허함).
    // 같은 조작·같은 포트에서 오류 종류만 바꿔 경로가 살아 있음을 함께 낸다.
    const port = makePort();
    const operation = makeOperation(1, new WdaCommandFailedError("권한 실패", 500));

    await withRunnerRecovery(SERIAL, operation.run, port);

    expect(operation.calls.count).toBe(2);
    expect(port.relaunchCalls).toBe(1);
  });
});

describe("AC-IOS2-016 — 복구했다는 사실이 결과에 남는다", () => {
  it("재기동으로 살아난 결과는 recovered가 참이다", async () => {
    const port = makePort();
    const operation = makeOperation(1, new WdaCommandFailedError("권한 실패", 500));

    const outcome = await withRunnerRecovery(SERIAL, operation.run, port);

    // 조용히 성공하면 사용자는 러너가 불안정하다는 것을 영원히 모른다(design.md §F.4).
    expect(outcome.recovered).toBe(true);
  });

  it("복구 없이 성공한 결과와 구별된다", async () => {
    const port = makePort();
    const operation = makeOperation(0, new WdaCommandFailedError("권한 실패", 500));

    const outcome = await withRunnerRecovery(SERIAL, operation.run, port);

    expect(outcome.recovered).toBe(false);
  });
});

describe("AC-IOS2-017 — 재기동해도 실패하면 원래 오류를 그대로 돌려준다", () => {
  it("재시도 실패 시 최초 오류 객체가 그대로 올라온다", async () => {
    const port = makePort();
    const original = new WdaCommandFailedError("최초 권한 실패", 500);
    const retryError = new WdaCommandFailedError("재시도 중 다른 실패", 500);

    const calls = { count: 0 };
    const operation = async (): Promise<string> => {
      calls.count += 1;
      throw calls.count === 1 ? original : retryError;
    };

    const caught = await withRunnerRecovery(SERIAL, operation, port).catch((err: unknown) => err);

    // 재기동 실패로 원인을 덮지 않는다.
    expect(caught).toBe(original);
    expect((caught as Error).message).toContain("최초 권한 실패");
  });

  it("재시도 실패도 버리지 않는다 — 원래 오류의 cause에 붙는다", async () => {
    const port = makePort();
    const original = new WdaCommandFailedError("최초 권한 실패", 500);
    const retryError = new WdaCommandFailedError("재시도 중 다른 실패", 500);

    const calls = { count: 0 };
    const operation = async (): Promise<string> => {
      calls.count += 1;
      throw calls.count === 1 ? original : retryError;
    };

    const caught = await withRunnerRecovery(SERIAL, operation, port).catch((err: unknown) => err);

    expect((caught as Error).cause).toBe(retryError);
  });

  it("재기동 자체가 실패해도 원래 오류를 돌려준다", async () => {
    const port = makePort({ relaunch: async () => false });
    const original = new WdaCommandFailedError("최초 권한 실패", 500);
    const operation = makeOperation(1, original);

    await expect(withRunnerRecovery(SERIAL, operation.run, port)).rejects.toBe(original);
    expect(operation.calls.count).toBe(1); // 재기동이 안 됐으므로 재시도도 없다
  });

  it("재기동이 예외를 던져도 원래 오류를 돌려준다", async () => {
    const relaunchError = new Error("재기동 중 폭발");
    const port = makePort({
      relaunch: async () => {
        throw relaunchError;
      },
    });
    const original = new WdaCommandFailedError("최초 권한 실패", 500);
    const operation = makeOperation(1, original);

    const caught = await withRunnerRecovery(SERIAL, operation.run, port).catch((err: unknown) => err);

    expect(caught).toBe(original);
    expect((caught as Error).cause).toBe(relaunchError);
  });
});
