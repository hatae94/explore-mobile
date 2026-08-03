import { describe, expect, it, vi } from "vitest";

import { WdaClient, parseWdaPortMap, resolveWdaPort, type WdaHttpClient } from "./wda-client.js";
import {
  WdaCommandFailedError,
  WdaPortUnmappedError,
  WdaResponseLostError,
  WdaUnreachableError,
} from "./wda-errors.js";

const noSleep = async (): Promise<void> => undefined;

/** WDA 봉투 형태 응답을 만든다 (M3 실측 형태: `{value, sessionId}`). */
function envelope(value: unknown, sessionId?: string): string {
  return JSON.stringify(sessionId === undefined ? { value } : { value, sessionId });
}

describe("parseWdaPortMap", () => {
  it("쉼표로 나뉜 <udid>=<port> 쌍을 읽는다", () => {
    const map = parseWdaPortMap("UDID-A=8100, UDID-B=8101");
    expect(map.get("UDID-A")).toBe(8100);
    expect(map.get("UDID-B")).toBe(8101);
  });

  it.each([undefined, "", "   ", "쓰레기", "UDID=포트", "UDID=0", "UDID=99999"])(
    "형식이 어긋난 입력(%s)에서 유효 항목만 남긴다",
    (raw) => {
      expect(parseWdaPortMap(raw).size).toBe(0);
    },
  );
});

describe("resolveWdaPort", () => {
  it("매핑이 없으면 기본 8100을 쓴다", () => {
    expect(resolveWdaPort("UDID-A", {})).toBe(8100);
  });

  it("EXPLORE_MOBILE_WDA_PORT로 단일 포트를 덮어쓸 수 있다", () => {
    expect(resolveWdaPort("UDID-A", { EXPLORE_MOBILE_WDA_PORT: "8200" })).toBe(8200);
  });

  it("매핑에 있는 serial은 그 포트를 쓴다", () => {
    expect(resolveWdaPort("UDID-B", { EXPLORE_MOBILE_WDA_PORTS: "UDID-A=8100,UDID-B=8101" })).toBe(8101);
  });

  /**
   * 이 거부가 이 SPEC에서 다기기 안전을 지탱하는 지점이다. `/status`는 기기
   * 종류만 알려주므로(M3 실측) CLI는 포트 너머 기기의 신원을 스스로 확인할 수
   * 없다. 매핑이 선언된 이상, 미등록 serial을 기본 포트로 흘려보내면 **다른
   * 기기를 조작**하게 된다.
   */
  it("매핑이 선언됐는데 serial이 빠져 있으면 기본 포트로 흘리지 않고 거부한다", () => {
    expect(() => resolveWdaPort("UDID-C", { EXPLORE_MOBILE_WDA_PORTS: "UDID-A=8100" })).toThrow(WdaPortUnmappedError);
  });
});

describe("WdaClient.request", () => {
  it("성공 응답의 value를 돌려준다", async () => {
    const http: WdaHttpClient = async () => ({ status: 200, body: envelope({ width: 430, height: 932 }) });
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.request("GET", "/window/size", undefined, { idempotent: true })).resolves.toEqual({
      width: 430,
      height: 932,
    });
  });

  it("4xx/5xx는 WDA_COMMAND_FAILED로 올린다", async () => {
    const http: WdaHttpClient = async () => ({ status: 404, body: envelope({ error: "no such element" }) });
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.request("POST", "/session/x/element")).rejects.toBeInstanceOf(WdaCommandFailedError);
  });

  /**
   * M3 실측 현상: 요청은 전송됐고 효과도 적용됐는데 응답만 유실된다. WDA가
   * 이후 정상 응답한다는 사실이 `WDA_UNREACHABLE`과 이 경우를 가른다.
   */
  it("연결이 끊겼지만 WDA가 되살아나면 WDA_RESPONSE_LOST를 던진다", async () => {
    let call = 0;
    const http: WdaHttpClient = async (url) => {
      call += 1;
      if (url.endsWith("/status")) return { status: 200, body: envelope({ ready: true }) };
      throw new Error("socket hang up");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.request("POST", "/session/x/actions", { actions: [] })).rejects.toBeInstanceOf(
      WdaResponseLostError,
    );
    expect(call).toBeGreaterThan(1); // 프로브가 실제로 돌았다
  });

  it("연결이 끊기고 /status도 죽어 있으면 WDA_UNREACHABLE을 던진다", async () => {
    const http: WdaHttpClient = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    const error = await client.request("POST", "/session/x/actions").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(WdaUnreachableError);
    // 복구 절차가 메시지에 들어 있어야 한다 (design.md §B.3, AC-VISION-015)
    expect((error as Error).message).toContain("iproxy");
    expect((error as Error).message).toContain("UDID-A");
  });

  /**
   * 비멱등 요청의 재시도는 조작을 두 번 적용시킬 수 있다 — M3 실측에서
   * 응답이 유실된 조작이 실제로는 적용돼 있었다.
   */
  it("비멱등 요청은 재시도하지 않는다 (조작 1회만 전송)", async () => {
    let mutating = 0;
    const http: WdaHttpClient = async (url) => {
      if (url.endsWith("/status")) return { status: 200, body: envelope({ ready: true }) };
      mutating += 1;
      throw new Error("socket hang up");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.request("POST", "/session/x/actions")).rejects.toBeInstanceOf(WdaResponseLostError);
    expect(mutating).toBe(1);
  });

  /**
   * SPEC-VISION-002 회귀 방지선. 조작 호출의 경고 문구는 M3 실측(응답 유실
   * 4/4인데 효과는 적용됨)이 근거인 **정확한** 문장이다. 멱등 경로를 고치다가
   * 이 문장을 약화시키면 회귀다 — 그래서 멱등 테스트보다 먼저 쓴다.
   */
  it("조작 호출의 유실 경고는 그대로 유지된다 (AC-WDAERR-003)", async () => {
    const http: WdaHttpClient = async (url) => {
      if (url.endsWith("/status")) return { status: 200, body: envelope({ ready: true }) };
      throw new Error("socket hang up");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    const error = await client.request("POST", "/session/x/actions").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WdaResponseLostError);
    expect((error as Error).message).toContain("조작이 적용됐을 수 있으니");
    expect((error as Error).message).toContain("수행하지 않았습니다");
  });

  /**
   * SPEC-VISION-002: 정책은 이미 읽기/조작을 구분한다(위 두 테스트가 고정). 틀린
   * 것은 **문구**다 — 조작 기준으로 하드코딩돼 읽기 호출에서 두 문장 모두 거짓이
   * 된다. 이 CLI는 에이전트가 읽는 것을 전제로 하므로 오류 메시지는 다음 행동을
   * 정하는 입력이며, 거짓 안내는 하지도 않은 조작의 부작용을 확인하게 만든다.
   */
  it("멱등 읽기 호출의 유실 문구에 조작 경고를 붙이지 않는다 (AC-WDAERR-001)", async () => {
    const http: WdaHttpClient = async (url) => {
      if (url.endsWith("/status")) return { status: 200, body: envelope({ ready: true }) };
      throw new Error("socket hang up");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    const error = await client
      .request("GET", "/screenshot", undefined, { idempotent: true })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WdaResponseLostError);
    // 읽기 호출에는 적용될 "조작"이 없다.
    expect((error as Error).message).not.toContain("조작이 적용");
  });

  it("멱등 읽기 호출의 유실 문구가 재시도를 부정하지 않는다 (AC-WDAERR-002)", async () => {
    const http: WdaHttpClient = async (url) => {
      if (url.endsWith("/status")) return { status: 200, body: envelope({ ready: true }) };
      throw new Error("socket hang up");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    const error = await client
      .request("GET", "/screenshot", undefined, { idempotent: true })
      .catch((err: unknown) => err);

    // 실제로 3회 재시도했으므로 "수행하지 않았다"는 거짓이다.
    expect((error as Error).message).not.toContain("수행하지 않았습니다");
    // 수행한 사실이 드러나야 한다 (문자열 완전 일치가 아니라 취지 판정).
    expect((error as Error).message).toContain("재시도");
  });

  it("멱등/비멱등 어느 쪽이든 오류 코드는 WDA_RESPONSE_LOST다 (AC-WDAERR-004)", async () => {
    const http: WdaHttpClient = async (url) => {
      if (url.endsWith("/status")) return { status: 200, body: envelope({ ready: true }) };
      throw new Error("socket hang up");
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    const readError = await client
      .request("GET", "/screenshot", undefined, { idempotent: true })
      .catch((err: unknown) => err);
    const writeError = await client.request("POST", "/session/x/actions").catch((err: unknown) => err);

    expect((readError as WdaResponseLostError).code).toBe("WDA_RESPONSE_LOST");
    expect((writeError as WdaResponseLostError).code).toBe("WDA_RESPONSE_LOST");
  });

  it("멱등 요청은 재시도한다", async () => {
    let attempts = 0;
    const http: WdaHttpClient = async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("transient");
      return { status: 200, body: envelope("ok") };
    };
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.request("GET", "/screenshot", undefined, { idempotent: true })).resolves.toBe("ok");
    expect(attempts).toBe(3);
  });
});

describe("WdaClient.sessionId", () => {
  it("/status가 세션 ID를 주면 그것을 쓰고 새로 만들지 않는다", async () => {
    const http = vi.fn<WdaHttpClient>(async () => ({
      status: 200,
      body: envelope({ ready: true }, "EXISTING-SESSION"),
    }));
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.sessionId()).resolves.toBe("EXISTING-SESSION");
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0]?.[0]).toContain("/status");
  });

  /**
   * design.md §B.2는 "/status에서 얻는다"만 채택했으나 콜드 스타트에서는
   * `sessionId: null`이라는 것이 M3 실측으로 확인됐다 (progress.md §G).
   */
  it("/status의 세션 ID가 null이면 POST /session으로 만든다", async () => {
    const http = vi.fn<WdaHttpClient>(async (url, init) => {
      if (url.endsWith("/status")) return { status: 200, body: JSON.stringify({ value: {}, sessionId: null }) };
      if (init.method === "POST" && url.endsWith("/session")) {
        return { status: 200, body: envelope({ sessionId: "NEW-SESSION" }, "NEW-SESSION") };
      }
      throw new Error(`unexpected ${url}`);
    });
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await expect(client.sessionId()).resolves.toBe("NEW-SESSION");
    // 세션 생성 본문은 W3C 형태여야 한다 (M3 실측으로 200 확인한 그 형태)
    expect(JSON.parse(http.mock.calls[1]?.[1].body ?? "{}")).toEqual({
      capabilities: { alwaysMatch: {}, firstMatch: [{}] },
    });
  });

  it("한 번 확보한 세션 ID는 재조회하지 않는다", async () => {
    const http = vi.fn<WdaHttpClient>(async () => ({ status: 200, body: envelope({}, "S1") }));
    const client = new WdaClient("UDID-A", http, {}, noSleep);

    await client.sessionId();
    await client.sessionId();
    expect(http).toHaveBeenCalledTimes(1);
  });
});
