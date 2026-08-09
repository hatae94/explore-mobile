/**
 * 권한 상실에서의 1회 재기동 복구 (SPEC-IOS-002 REQ-IOS2-005).
 *
 * **어느 계층인가** (design.md §F.1): HTTP 계층(`WdaClient`) 위, 명령 계층
 * (CLI 핸들러) 아래. 복구는 두 가지를 동시에 알아야 하기 때문이다 —
 * ① 이 호출이 재시도 가능한가(클라이언트가 아는 것), ② 러너를 다시 띄울 수
 * 있는가(프로세스 관리). 클라이언트에 프로세스 관리를 넣으면 계층이 무너지고,
 * 명령 핸들러마다 넣으면 같은 코드가 12곳에 흩어진다.
 *
 * **왜 1회인가** (design.md §F.4): 성능이 아니라 관측 가능성이다. N회 재시도는
 * 실패를 지연시키고 원인을 흐린다. 1회로 묶으면 "재기동으로 낫는 문제"와
 * "그렇지 않은 문제"가 즉시 갈린다.
 */

import { WdaCommandFailedError } from "./wda-errors.js";

/**
 * 복구가 러너에게 물어야 하는 두 가지. 구현은 `WdaDoctor`가 들고 있다 —
 * 이 모듈은 러너 생명주기를 직접 다루지 않는다.
 */
export interface WdaRecoveryPort {
  /**
   * CLI가 띄운 러너인가 — **재기동 자격**의 판정이다
   * (design.md §B.1.1 2행, AC-IOS2-027).
   */
  isOwnedByCli(serial: string): Promise<boolean>;
  /** 기존 러너를 끄고 다시 띄운다. 러너가 다시 응답하면 true. */
  relaunch(serial: string): Promise<boolean>;
}

export interface WdaRecoveryOutcome<T> {
  value: T;
  /** 재기동을 거쳐 얻은 값인가 (AC-IOS2-016). */
  recovered: boolean;
}

/**
 * 이 실패를 러너 권한 상실로 볼 것인가.
 *
 * **응답했고 5xx인 경우만** 참이다. 세 경계가 각각 이유를 가진다.
 *
 *   - **응답 유실(`WDA_RESPONSE_LOST`) 제외** — 응답을 잃어도 효과는 적용된
 *     관측이 있다(앱 종료 4/4, 탭 1/5). 재시도가 곧 중복 실행이 된다
 *     (design.md §F.3, AC-IOS2-015).
 *   - **도달 불가(`WDA_UNREACHABLE`) 제외** — 러너가 아예 없는 상태이며,
 *     그것은 복구가 아니라 기동의 일이다(design.md §B.1.1 3번).
 *   - **4xx 제외** — 러너가 요청을 이해하고 거부한 것이다. 다시 띄워도
 *     같은 요청은 같은 이유로 거부된다.
 *
 * @MX:ANCHOR — 판정 근거는 `status` **필드**이지 메시지 문구가 아니다.
 * @MX:REASON — 문구에서 정책을 역추론했다가 반증당한 이력이 이 저장소에 있다
 * (`wda-client.ts`의 @MX:REASON). 상태를 모르는 실패(`status`가 없는 경우)는
 * 추정하지 않고 복구 대상에서 뺀다 — 모르는 것을 아는 척하지 않는다.
 */
export function isRunnerPermissionFailure(err: unknown): boolean {
  return err instanceof WdaCommandFailedError && err.status !== undefined && err.status >= 500;
}

/**
 * 조작을 실행하고, 권한 오류면 **1회** 재기동 후 **1회** 재시도한다.
 *
 * 반복문이 없는 것이 AC-IOS2-014의 구조적 보장이다 — 횟수를 세는 변수가
 * 아니라 코드 모양 자체가 2회를 넘길 수 없게 되어 있다.
 */
export async function withRunnerRecovery<T>(
  serial: string,
  operation: () => Promise<T>,
  port: WdaRecoveryPort,
): Promise<WdaRecoveryOutcome<T>> {
  let original: unknown;
  try {
    return { value: await operation(), recovered: false };
  } catch (err) {
    if (!isRunnerPermissionFailure(err)) throw err;
    original = err;
  }

  // 남의 러너는 끄지 않는다 — 소유권 규칙이 복구 경로에도 그대로 걸린다.
  let owned: boolean;
  try {
    owned = await port.isOwnedByCli(serial);
  } catch (ownershipError) {
    // 소유 여부를 모르면 끄지 않는다. 판정 실패를 삼키지 않고 원인에 붙인다.
    throw attachCause(original, ownershipError);
  }
  if (!owned) throw original;

  let relaunched: boolean;
  try {
    relaunched = await port.relaunch(serial);
  } catch (relaunchError) {
    throw attachCause(original, relaunchError);
  }
  if (!relaunched) throw original;

  try {
    return { value: await operation(), recovered: true };
  } catch (retryError) {
    // 재기동 실패로 원인을 덮지 않는다(AC-IOS2-017). 다만 두 번째 실패도
    // 버리지 않는다 — `cause`에 붙여 둔다.
    throw attachCause(original, retryError);
  }
}

/**
 * 원래 오류를 그대로 돌려주되 뒤이은 실패를 `cause`로 보존한다.
 * 이미 `cause`가 있으면 덮어쓰지 않는다 — 먼저 붙은 원인이 더 가깝다.
 */
function attachCause(original: unknown, later: unknown): unknown {
  if (original === later) return original;
  if (original instanceof Error && original.cause === undefined) {
    original.cause = later;
  }
  return original;
}
