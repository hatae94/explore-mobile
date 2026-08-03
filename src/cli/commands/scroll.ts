/**
 * `scroll <up|down|left|right> [--amount <ratio>]` 명령 (SPEC-GESTURE-001
 * M3, REQ-GEST-SCROLL-001~006; AC-GEST-007~010, AC-GEST-016, AC-GEST-017.
 * M8/0.6.0 amendment로 문턱 조회 배선 추가, REQ-GEST-SCROLL-007/008).
 *
 * SPEC-GESTURE-001 M3은 새 백엔드 메서드를 추가하지 않고 화면 크기를
 * 기존 UI 계층 덤프 결과에서 파생했다(`scroll-geometry.ts`
 * `deriveScreenSize`). **SPEC-VISION-001 M1이 그 결정을 뒤집는다**
 * (REQ-VISION-001): 화면 크기는 이제 백엔드가 직접 공급하며
 * (`backend.getScreenSize`), `scroll`은 UI 계층 dump를 전혀 호출하지
 * 않는다. 폭과 높이 두 숫자를 얻자고 화면 전체의 요소 트리를 기기에서
 * 끌어오던 비용이 사라진다 — dump는 Android에서 명령 지연의 가장 큰
 * 단일 항목이었다(research.md §1.2).
 *
 * 거부 경로 순서(B-5, `swipe.ts`와 동일한 구조; M8/0.6.0 amendment로
 * 문턱 조회 단계 추가, SPEC-VISION-001 M1으로 화면 크기 소스 교체):
 * 방향 파싱 -> `--amount` 파싱/검증 -> `resolveTargetDevice` ->
 * `backend.getScreenSize`(화면 크기 조회, REQ-VISION-001) ->
 * `backend.getMinEffectiveSwipeThreshold`(문턱 조회, REQ-GEST-SCROLL-008)
 * -> 기하 판정(`isDegenerateSwipe`) -> `backend.swipe`. 앞의 두 단계에서
 * 거부되면 어떤 백엔드 호출도 일어나지 않는다(무동작 보장) —
 * `SCREEN_SIZE_UNKNOWN` 단계에서는 `getScreenSize`는 이미 호출됐지만
 * `swipe`는 호출되지 않는다.
 */

import type { ScrollPayload } from "../../schema/command-payloads.js";
import type { DeviceBackend, ScreenSize, SwipeThreshold } from "../../schema/device-backend.js";
import { resolveTargetDevice, type DeviceSource } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { parseRatio } from "../validators.js";
import {
  computeScrollSwipe,
  isDegenerateSwipe,
  minNonDegenerateRatio,
  type ScrollDirection,
} from "./scroll-geometry.js";
import { backendFailure, errorMessage, type CommandHandler } from "./types.js";

/**
 * 생략 시 기본 비율(REQ-GEST-SCROLL-003) — SPEC은 구체적 수치를 정하지
 * 않았다(구현 세부, spec.md §D "구현 세부(HOW)"). 화면의 절반을
 * 스크롤하는 값을 택했다 — "한 번에 반 화면"이라는 흔한 관례와
 * 일치하고, `--amount 1`(전체 화면)의 절반이라는 직관적인 기준점이다.
 */
const DEFAULT_AMOUNT = 0.5;

/**
 * `scroll`이 내부적으로 호출하는 `backend.swipe`에 항상 싣는 지속시간(ms).
 *
 * 실기기 실측(2026-07-27, 부팅된 iPhone 17 Pro 시뮬레이터
 * D0B3A18C-E485-4E7C-A25E-504BF4CA6163, Safari로 긴 페이지 표시 중):
 * `durationMs`를 생략하면(플랫폼 기본 지속시간) 스크린샷 전/후 SSIM이
 * **1.000000**(완전 동일) — 스와이프가 전송됐지만 페이지가 전혀
 * 움직이지 않았다. 같은 좌표에 `durationMs: 500`을 명시하자 SSIM이
 * **0.52**로 떨어져 실제 스크롤이 확증됐다 — M2의 AC-GEST-005가 같은
 * 값으로 이미 확증한 결과와 일치한다. `scroll`은 진짜 화면 이동을
 * 보장할 책임이 있으므로(spec.md §A.2 "기기를 스와이프·스크롤할 수
 * 있게 한다"), 사용자에게 노출하지 않는 이 내부 기본값을 항상 싣는다.
 * `swipe` 명령 자체의 `--duration` 옵션(REQ-GEST-SWIPE-002)과는 별개다.
 *
 * @MX:NOTE: [AUTO] 500이라는 값 자체가 위 실측(SSIM 1.000000 -> 0.52)에서 나온 매직 넘버다 -- 바꾸려면 같은 시뮬레이터·페이지에서 재실측이 필요하다
 */
const SCROLL_SWIPE_DURATION_MS = 500;

/** `--amount`와 같은 명명 계열(INVALID_COORDINATES/INVALID_INDEX/INVALID_PAGE)의 방향 검증. */
const DIRECTIONS: ReadonlySet<string> = new Set<ScrollDirection>(["up", "down", "left", "right"]);

function isScrollDirection(value: string | undefined): value is ScrollDirection {
  return value !== undefined && DIRECTIONS.has(value);
}

export const scrollCommand: CommandHandler = async (args, source: DeviceSource) => {
  const [directionRaw, ...rest] = args.positionals;

  if (rest.length > 0 || !isScrollDirection(directionRaw)) {
    return failure(
      "scroll",
      "INVALID_DIRECTION",
      "scroll requires exactly one direction: scroll <up|down|left|right>.",
      { received: args.positionals },
    );
  }

  let ratio = DEFAULT_AMOUNT;
  if (args.amount !== undefined) {
    const parsed = parseRatio(args.amount);
    if (parsed === undefined) {
      return failure(
        "scroll",
        "INVALID_AMOUNT",
        "scroll --amount requires a number greater than 0 and at most 1.",
        { received: args.amount },
      );
    }
    ratio = parsed;
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("scroll", target.code, target.message, target.details);

  // REQ-VISION-001 (SPEC-VISION-001 M1): 화면 크기는 백엔드가 공급한다.
  // 조회 자체가 실패하면(기기 끊김, 도구 비정상 종료) BACKEND_COMMAND_FAILED,
  // 조회는 됐으나 응답을 읽을 수 없으면 SCREEN_SIZE_UNKNOWN — 두 사실은
  // 다르며, 호출자는 재시도가 의미 있는지 구분할 수 있어야 한다.
  let screen: ScreenSize | undefined;
  try {
    screen = await target.backend.getScreenSize(target.serial);
  } catch (err) {
    return backendFailure("scroll", err);
  }

  // REQ-GEST-SCROLL-004: 화면 크기를 신뢰할 수 없으면 추측하지 않고
  // 거부한다 — 되돌릴 수 없는 제스처를 보내지 않는다. 오류 코드는
  // SPEC-GESTURE-001에서 확립된 계약 그대로 유지된다(AC-VISION-004);
  // 바뀐 것은 크기의 출처뿐이다.
  if (!screen) {
    return failure(
      "scroll",
      "SCREEN_SIZE_UNKNOWN",
      "Could not determine the device's screen size.",
    );
  }

  // REQ-GEST-SCROLL-008 (SPEC-GESTURE-001 M8/0.6.0 amendment): 문턱은 더
  // 이상 플랫폼 독립 상수가 아니라 백엔드가 공급한다 — Android는 이
  // 기기의 밀도를 조회해 파생하고, iOS는 실측 상수를 돌려준다. 어느
  // 쪽도 상대의 값을 빌리지 않는다(spec.md §C.1-⑰).
  let threshold: SwipeThreshold;
  try {
    threshold = await target.backend.getMinEffectiveSwipeThreshold(target.serial);
  } catch (err) {
    return backendFailure("scroll", err);
  }

  const { from, to } = computeScrollSwipe(directionRaw, ratio, screen);

  // REQ-GEST-SCROLL-007 (SPEC-GESTURE-001 M6/0.4.0 amendment, F1; M7/0.5.0
  // amendment로 술어를 실측 문턱 기반으로 교체; M8/0.6.0 amendment로 문턱을
  // 백엔드 공급으로 전환): 반올림 후 스크롤 축 거리가 이 기기의 문턱
  // 미만이면 화면을 신뢰성 있게 움직이지 못한다 — ok:true로 보고하면서
  // 아무 것도 움직이지 않는 결함(sync-auditor 사후 감사)을 여기서
  // 거부한다. 어떤 제스처도 보내지 않는다 — 1px 클램프 같은 "성공하게
  // 만드는" 보정은 하지 않는다(spec.md REQ-GEST-SCROLL-007 근거, plan.md
  // §F M6 item 3). 응답에는 되먹일 최소 비율과 **그 값의 출처**를 함께
  // 싣는다(REQ-GEST-SCROLL-008, AC-GEST-027) — 호출자가 이 값이 자기
  // 기기에서 나온 것인지 판단할 수 있어야 한다.
  if (isDegenerateSwipe({ from, to }, threshold.minEffectiveSwipePx)) {
    // M10/0.8.0 amendment (AC-GEST-034, NN5): 문턱을 넘는 비율이 이
    // 화면·문턱 조합에 아예 존재하지 않으면 `minNonDegenerateRatio`는
    // `undefined`를 반환한다 — 그 경우 필드 자체를 응답에서 생략한다.
    // 없는 값을 지어내지 않는다: 자기 자신이 다시 거부당할 값을 권고로
    // 싣는 것(3회 라운드째 반복된 계열)보다, 권고를 아예 안 싣는 편이
    // 정직하다. 거부(`AMOUNT_TOO_SMALL`) 자체와 무제스처 보장은 그대로다
    // — 사라지는 것은 권고뿐이다.
    const minValidRatio = minNonDegenerateRatio(directionRaw, screen, threshold.minEffectiveSwipePx);
    return failure(
      "scroll",
      "AMOUNT_TOO_SMALL",
      "scroll --amount is too small to move the screen at this size; no gesture was sent.",
      {
        requestedRatio: ratio,
        ...(minValidRatio !== undefined ? { minValidRatio, minValidRatioBasis: threshold.basis } : {}),
      },
    );
  }

  try {
    await target.backend.swipe(target.serial, from, to, { durationMs: SCROLL_SWIPE_DURATION_MS });
  } catch (err) {
    return backendFailure("scroll", err);
  }

  // REQ-GEST-SCROLL-005: 방향과 실제 좌표를 응답에 함께 실어, 호출자가
  // 응답만 보고 방향 의미가 맞는지 즉시 검증할 수 있게 한다(AC-GEST-016).
  return success<ScrollPayload>("scroll", { serial: target.serial, direction: directionRaw, from, to });
};
