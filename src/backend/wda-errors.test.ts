/**
 * 오류 코드 4종의 **발화 조건**을 고정한다 (SPEC-IOS-002 REQ-IOS2-008 —
 * AC-IOS2-025). 이 SPEC은 `wda-errors.ts`에 코드 2종(`WDA_BUILD_CONFIG_MISSING`
 * · `WDA_BUILD_FAILED`)을 새로 더했다. 더하는 것 자체는 계약 변경이 아니지만,
 * 더하면서 기존 4종의 **의미**가 바뀌면 그것은 계약 변경이다.
 *
 * ## 이 파일이 대조표를 스스로 소유하는 이유
 *
 * 기대 발화 조건을 제품 코드의 상수에서 가져오면 양쪽이 함께 바뀌어 **어떤
 * 변경도 잡히지 않는다.** 아래 `ERROR_CONTRACT`의 코드 문자열은 전부 이 파일이
 * 직접 적은 리터럴이며, `wda-errors.ts`에서 import하지 않는다.
 *
 * ## 두 겹의 주장이 서로 다른 실패를 잡는다
 *
 *   ① 대조표의 항목 수가 **정확히 4**다 — 대조표가 비었을 때 조용히 통과하는
 *      것을 막는다. 이 저장소에는 대조 대상이 사라진 뒤에도 검사가 통과해
 *      아무것도 지키지 못한 이력이 있다.
 *   ② 각 항목의 발화 조건을 **제품 코드를 실제로 그 상황에 몰아넣어** 판정한다.
 *      제품에서 코드가 사라지거나 이름이 바뀌면 여기가 깨진다(①은 대조표가
 *      이 파일 소유라 그대로 통과한다 — 둘은 다른 실패를 잡는다).
 *
 * **이것은 분기 판정이며 동작 판정이 아니다.** HTTP는 대역으로 세운다.
 */

import { describe, expect, it } from "vitest";

import { resolveWdaPort, WdaClient, type WdaHttpClient } from "./wda-client.js";

const noSleep = async (): Promise<void> => undefined;

/** WDA가 죽어 있는 세상 — 어떤 요청도 응답하지 않는다. */
const deadHttp: WdaHttpClient = async () => {
  throw new Error("connect ECONNREFUSED 127.0.0.1:8100");
};

/**
 * 요청은 실패하지만 `/status` 프로브는 살아 있는 세상. 이 갈래가
 * `WDA_RESPONSE_LOST`와 `WDA_UNREACHABLE`을 가르는 유일한 신호다.
 */
const lostResponseHttp: WdaHttpClient = async (url) => {
  if (url.endsWith("/status")) return { status: 200, body: JSON.stringify({ value: { ready: true } }) };
  throw new Error("socket hang up");
};

/** WDA가 응답했고 그 응답이 실패인 세상. */
const failingHttp: WdaHttpClient = async () => ({
  status: 500,
  body: JSON.stringify({ value: { error: "unknown error" } }),
});

function client(http: WdaHttpClient, env: NodeJS.ProcessEnv = {}): WdaClient {
  return new WdaClient("UDID-A", http, env, noSleep);
}

/** 던져진 값에서 `code`를 꺼낸다. 코드가 없으면 그것도 실패다. */
async function codeOfThrown(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `<코드 없음: ${String(err)}>`;
  }
  return "<던지지 않음>";
}

interface ErrorContractRow {
  /** 이 파일이 직접 적은 코드 문자열. 제품 코드에서 import하지 않는다. */
  code: string;
  /** 사람이 읽는 발화 조건 — 아래 `drive`가 그 조건을 실제로 만든다. */
  condition: string;
  drive: () => Promise<unknown>;
}

/**
 * 이 SPEC 이전부터 있던 코드 4종. **이 배열이 대조표이며 검사 파일이 소유한다.**
 * 이 SPEC이 새로 더한 `WDA_BUILD_CONFIG_MISSING` · `WDA_BUILD_FAILED`는 여기
 * 들어가지 않는다 — AC-025가 묻는 것은 "기존 4종의 의미가 그대로인가"다.
 */
const ERROR_CONTRACT: ErrorContractRow[] = [
  {
    code: "WDA_UNREACHABLE",
    condition: "네트워크 단계에서 실패했고 이후 프로브(/status)도 끝내 살아나지 않는다",
    drive: async () => client(deadHttp).request("GET", "/window/size", undefined, { idempotent: true }),
  },
  {
    code: "WDA_RESPONSE_LOST",
    condition: "요청은 전송됐고 응답만 유실됐다 — 프로브가 살아나는 것이 그 증거다",
    drive: async () => client(lostResponseHttp).request("POST", "/wda/apps/terminate", { bundleId: "x" }),
  },
  {
    code: "WDA_COMMAND_FAILED",
    condition: "WDA가 응답했고 그 응답이 실패다(2xx 밖)",
    drive: async () => client(failingHttp).request("GET", "/screenshot", undefined, { idempotent: true }),
  },
  {
    code: "WDA_PORT_UNMAPPED",
    condition: "포트 매핑이 선언돼 있는데 요청된 serial이 그 안에 없다",
    drive: async () => resolveWdaPort("UDID-C", { EXPLORE_MOBILE_WDA_PORTS: "UDID-A=8100" }),
  },
];

describe("AC-IOS2-025 — 기존 오류 코드 4종의 의미가 바뀌지 않았다 (REQ-IOS2-008)", () => {
  /**
   * ① 대조표가 비면 ②는 0건을 돌며 통과한다. 그러니 항목 수를 **먼저** 주장한다.
   * 이 주장이 실패하면 ②의 결과는 무의미하다.
   */
  it("대조표가 정확히 4항목이다 — 0건 통과를 막는다", () => {
    expect(ERROR_CONTRACT).toHaveLength(4);
    expect(new Set(ERROR_CONTRACT.map((row) => row.code)).size).toBe(4);
  });

  it.each(ERROR_CONTRACT)("$code — $condition", async ({ code, drive }) => {
    expect(await codeOfThrown(drive)).toBe(code);
  });

  /**
   * 네 코드가 서로 **다른** 상황을 가리키는지까지 본다. 코드 이름이 그대로여도
   * 두 상황이 같은 코드로 뭉치면 의미는 바뀐 것이다 — 특히 도달 불가와 응답
   * 유실은 복구 절차가 정반대다("러너를 띄우라" vs "스크린샷으로 확인하라").
   */
  it("네 상황이 각각 다른 코드로 갈린다 — 뭉치지 않았다", async () => {
    const observed = await Promise.all(ERROR_CONTRACT.map((row) => codeOfThrown(row.drive)));
    expect(new Set(observed).size).toBe(4);
  });
});
