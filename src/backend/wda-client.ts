/**
 * WDA(WebDriverAgent) HTTP 호출 래퍼 (SPEC-VISION-001 M3, design.md §B.1).
 * 이전 iOS 백엔드의 프로세스 실행기가 있던 자리를 대신한다 — iOS 제어의
 * 유일한 전송 계층이며, `WdaBackend`의 모든 명령이 여기를 지난다.
 *
 * 두 가지를 여기서 책임진다:
 *   1. **serial → 포트 해석** — WDA 포트 하나는 기기 한 대에 묶인다
 *   2. **실패의 분류** — 도달 불가 / 응답 유실 / 명령 실패 (wda-errors.ts)
 *
 * @MX:ANCHOR — iOS 제어의 단일 전송 지점. `WdaBackend`의 10개 메서드가 전부
 * 이 클래스를 통과하므로, 여기서의 회귀는 iOS 경로 전체에 파급된다.
 * @MX:REASON — 이전 iOS 백엔드의 실행기가 맡던 격리 역할
 * (REQ-IOS-ISOLATE-001)을 그대로 이어받는다. 재시도 정책을 이 파일 밖으로
 * 흩뜨리면 비멱등 요청이 어딘가에서 조용히 재시도돼 조작이 두 번 적용될 수
 * 있다.
 */

import {
  WDA_DEFAULT_PORT,
  WdaCommandFailedError,
  WdaPortUnmappedError,
  WdaResponseLostError,
  WdaUnreachableError,
  wdaRecoveryHint,
} from "./wda-errors.js";

/** WDA HTTP 응답 — 상태 코드와 본문 문자열만 쓴다. */
export interface WdaHttpResponse {
  status: number;
  body: string;
}

/**
 * 주입 가능한 HTTP 실행기. 네트워크 단계 실패(연결 거부/끊김/타임아웃)는
 * **throw**하고, HTTP 응답이 온 경우에는 상태 코드가 무엇이든 resolve한다 —
 * 이 구분이 `WDA_UNREACHABLE`/`WDA_RESPONSE_LOST`와 `WDA_COMMAND_FAILED`를
 * 가르는 경계이기 때문이다.
 */
export type WdaHttpClient = (
  url: string,
  init: { method: "GET" | "POST"; body?: string; timeoutMs: number },
) => Promise<WdaHttpResponse>;

/** 실제 HTTP 실행기 (Node 전역 `fetch`). */
export const nodeWdaHttpClient: WdaHttpClient = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method,
      signal: controller.signal,
      ...(init.body === undefined
        ? {}
        : { body: init.body, headers: { "Content-Type": "application/json" } }),
    });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * `EXPLORE_MOBILE_WDA_PORTS` 파싱 — `"<udid>=<port>,<udid>=<port>"` 형식.
 * 형식이 깨진 항목은 조용히 버리지 않고 제외하되, 유효한 항목은 살린다.
 */
export function parseWdaPortMap(raw: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (raw === undefined || raw.trim().length === 0) return map;

  for (const entry of raw.split(",")) {
    const [serial, portText] = entry.split("=");
    const port = Number.parseInt((portText ?? "").trim(), 10);
    const key = (serial ?? "").trim();
    if (key.length > 0 && Number.isInteger(port) && port > 0 && port < 65536) {
      map.set(key, port);
    }
  }
  return map;
}

/**
 * serial에 대응하는 WDA 포트를 정한다.
 *
 * - `EXPLORE_MOBILE_WDA_PORTS`에 매핑이 있으면 그 포트
 * - 매핑이 **선언돼 있는데** serial이 없으면 `WdaPortUnmappedError` (거부)
 * - 매핑이 아예 없으면 `EXPLORE_MOBILE_WDA_PORT` 또는 기본 8100
 *
 * 마지막 갈래가 남는 위험이다: 매핑을 선언하지 않은 채 iOS 기기를 2대 이상
 * 붙이면, CLI는 8100 너머의 기기가 요청된 기기인지 확인할 수 없다
 * (`/status`는 `"device": "iphone"`처럼 기기 **종류**만 알려준다 — M3 실측).
 * `doctor`가 이 상태를 보고하므로 사용자가 눈으로 확인할 수 있다.
 *
 * @MX:DEBT: 매핑 미선언 시 기본 포트로 흘려보내며, 포트 너머 기기의 신원을 검증하지 못한다
 * @MX:CEILING: iOS 기기가 1대만 연결된 환경에서는 틀릴 수 없다
 * @MX:UPGRADE: WDA가 기기 UDID를 노출하는 엔드포인트가 확인되면 매핑 없이도 검증한다
 */
export function resolveWdaPort(serial: string, env: NodeJS.ProcessEnv = process.env): number {
  const map = parseWdaPortMap(env.EXPLORE_MOBILE_WDA_PORTS);

  if (map.size > 0) {
    const mapped = map.get(serial);
    if (mapped !== undefined) return mapped;
    throw new WdaPortUnmappedError(
      `EXPLORE_MOBILE_WDA_PORTS에 '${serial}'의 포트가 선언돼 있지 않습니다. ` +
        `선언된 기기: ${[...map.keys()].join(", ")}. ` +
        "다른 기기의 포트로 조작하지 않기 위해 거부합니다 — 매핑에 이 기기를 추가하세요.",
    );
  }

  const single = Number.parseInt((env.EXPLORE_MOBILE_WDA_PORT ?? "").trim(), 10);
  return Number.isInteger(single) && single > 0 && single < 65536 ? single : WDA_DEFAULT_PORT;
}

/** 응답 유실 후 WDA가 다시 살아났는지 확인할 때의 폴링 간격/횟수. */
const PROBE_ATTEMPTS = 12;
const PROBE_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 3000;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** WDA 응답 봉투 — 성공 시 `value`에 결과가 담긴다. */
interface WdaEnvelope {
  value?: unknown;
  sessionId?: unknown;
}

function parseEnvelope(body: string): WdaEnvelope | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null ? (parsed as WdaEnvelope) : undefined;
  } catch {
    return undefined;
  }
}

export class WdaClient {
  private readonly port: number;
  private cachedSessionId: string | undefined;

  constructor(
    private readonly serial: string,
    private readonly http: WdaHttpClient = nodeWdaHttpClient,
    env: NodeJS.ProcessEnv = process.env,
    /** 테스트가 실제 대기를 겪지 않도록 주입 가능. */
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    this.port = resolveWdaPort(serial, env);
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** WDA가 지금 응답하는가. 어떤 실패도 밖으로 던지지 않는다. */
  async isResponsive(): Promise<boolean> {
    try {
      const response = await this.http(`${this.baseUrl}/status`, {
        method: "GET",
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * WDA가 다시 응답할 때까지 기다린다. M3 실측에서 상태를 바꾸는 호출 뒤
   * WDA가 수 초간 무응답이었다가 스스로 회복했다(최장 관측 6초).
   */
  async waitUntilResponsive(attempts: number = PROBE_ATTEMPTS): Promise<boolean> {
    for (let i = 0; i < attempts; i += 1) {
      if (await this.isResponsive()) return true;
      await this.sleep(PROBE_INTERVAL_MS);
    }
    return false;
  }

  /**
   * WDA에 요청을 보내고 `value`를 돌려준다.
   *
   * `idempotent`가 true인 읽기 호출만 네트워크 실패에서 재시도한다. 조작
   * 호출은 재시도하지 않는다 — M3 실측에서 응답이 유실된 조작이 실제로는
   * 적용돼 있었으므로, 재시도는 두 번 적용을 뜻한다.
   */
  async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    options?: { idempotent?: boolean; timeoutMs?: number },
  ): Promise<unknown> {
    return (await this.requestEnvelope(method, path, body, options)).value;
  }

  /**
   * `request`와 같지만 봉투 전체를 돌려준다. `/status`의 세션 ID는 `value`가
   * 아니라 봉투 최상위(`{"value": {...}, "sessionId": "..."}`)에 실려 오므로
   * (M3 실측), 그 값을 읽으려면 이 경로가 필요하다.
   */
  private async requestEnvelope(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    options?: { idempotent?: boolean; timeoutMs?: number },
  ): Promise<WdaEnvelope> {
    const idempotent = options?.idempotent ?? false;
    const attempts = idempotent ? 3 : 1;
    let lastNetworkError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.http(`${this.baseUrl}${path}`, {
          method,
          timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return this.unwrapEnvelope(response, path);
      } catch (err) {
        // WDA가 응답했고 그 응답이 실패인 경우는 네트워크 실패가 아니다.
        // 아래 재시도/프로브 경로에 흘려보내면 정상적으로 전달된 4xx가
        // `WDA_UNREACHABLE`로 둔갑해 "WDA를 다시 띄우라"는 엉뚱한 복구 절차를
        // 안내하게 된다.
        if (err instanceof WdaCommandFailedError) throw err;
        lastNetworkError = err;
        if (attempt < attempts - 1) await this.sleep(PROBE_INTERVAL_MS);
      }
    }

    // 네트워크 단계에서 실패했다. WDA 자체가 없는 것인지, 응답만 유실된
    // 것인지는 여기서만 구분할 수 있다 — 프로브가 살아나면 후자다.
    const recovered = await this.waitUntilResponsive();
    const detail = lastNetworkError instanceof Error ? lastNetworkError.message : String(lastNetworkError);

    if (!recovered) {
      throw new WdaUnreachableError(`${wdaRecoveryHint(this.serial, this.port)}\n원인: ${detail}`);
    }

    // @MX:NOTE: 안내 문구는 **그 호출이 멱등이었는지**에 따라 갈린다. 하나로
    // 고정하면 읽기 호출에서 두 문장 모두 거짓이 된다 — 적용될 조작이 없고,
    // 재시도는 이미 수행됐기 때문이다. 이 CLI는 에이전트가 읽는 것을 전제로
    // 하므로 오류 메시지는 장식이 아니라 다음 행동을 정하는 입력이다.
    // @MX:REASON: SPEC-VISION-001 M6은 이 문구를 보고 "재시도 정책이 읽기/조작을
    // 구분하지 않는다"고 진단했으나, 정책은 위 `idempotent ? 3 : 1`로 이미
    // 구분하고 있었다. 문구에서 정책을 역추론한 오진이었다 — 틀린 것은 문구뿐.
    // @MX:SPEC: SPEC-VISION-002 REQ-WDAERR-001/002
    const guidance = idempotent
      ? `읽기 호출이라 ${attempts}회 재시도했으나 모두 응답이 없었습니다 — 기기 상태를 바꾸지 않는 호출이므로 다시 불러도 안전합니다. `
      : "조작이 적용됐을 수 있으니 스크린샷으로 확인하세요 — 자동 재시도는 두 번 적용될 위험이 있어 수행하지 않았습니다. ";

    throw new WdaResponseLostError(
      `WDA가 ${method} ${path} 요청의 응답을 돌려주지 않았습니다(요청은 전송됨, WDA는 이후 정상 응답). ` +
        guidance +
        `원인: ${detail}`,
    );
  }

  private unwrapEnvelope(response: WdaHttpResponse, path: string): WdaEnvelope {
    const envelope = parseEnvelope(response.body);

    if (response.status < 200 || response.status >= 300) {
      throw new WdaCommandFailedError(
        `WDA ${path} 실패 (HTTP ${response.status}): ${JSON.stringify(envelope?.value ?? response.body).slice(0, 400)}`,
      );
    }
    if (envelope === undefined) {
      throw new WdaCommandFailedError(`WDA ${path} 응답을 JSON으로 읽을 수 없습니다: ${response.body.slice(0, 200)}`);
    }
    return envelope;
  }

  /**
   * 조작 엔드포인트가 요구하는 세션 ID를 확보한다 (progress.md §G 결정).
   *
   * `/status`가 세션 ID를 주면 그것을 쓰고, `null`이면 `POST /session`으로
   * 만든다. design.md §B.2는 "`/status`에서 얻는다"만 채택했으나, 콜드
   * 스타트에서는 `{"sessionId": null}`이라는 것이 M3 실측으로 확인됐다 —
   * 그래서 §B.2가 기각했던 생성 경로가 복권됐다. 생성이 화면을 바꾸지
   * 않는다는 것도 같은 실측에서 확인됐다(캡처 바이트 길이 동일).
   */
  async sessionId(): Promise<string> {
    if (this.cachedSessionId !== undefined) return this.cachedSessionId;

    const status = await this.requestEnvelope("GET", "/status", undefined, { idempotent: true });
    const existing = asNonEmptyString(status.sessionId);
    if (existing !== undefined) {
      this.cachedSessionId = existing;
      return existing;
    }

    const created = await this.request("POST", "/session", {
      capabilities: { alwaysMatch: {}, firstMatch: [{}] },
    });
    const createdId = readSessionIdFromValue(created);
    if (createdId === undefined) {
      throw new WdaCommandFailedError("POST /session 응답에서 sessionId를 찾지 못했습니다.");
    }
    this.cachedSessionId = createdId;
    return createdId;
  }

  /** 세션이 무효해졌을 때 다음 호출이 다시 확보하도록 캐시를 비운다. */
  forgetSession(): void {
    this.cachedSessionId = undefined;
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `POST /session`은 `value.sessionId`에 새 세션 ID를 담아 준다 (M3 실측). */
function readSessionIdFromValue(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return asNonEmptyString((value as { sessionId?: unknown }).sessionId);
}
