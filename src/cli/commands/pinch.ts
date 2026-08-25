/**
 * `pinch <in|out> <x> <y> [--amount <ratio>]` 명령
 * (SPEC-GESTURE-002 M3 — REQ-GEST2-PINCH-001~006;
 *  AC-GEST2-002 · 005 · 006 · 007 · 009 · 013 · 014).
 *
 * **새 플래그도 새 파서도 만들지 않는다**(spec.md §A.5): 방향 토큰은
 * `scroll` 문법, 좌표는 `tap` 문법, 비율은 이미 선언된 `--amount`와 이미 있는
 * `parseRatio`다. `args.ts`는 손대지 않는다 — 손대야 한다고 판단되면 그 자체가
 * 설계가 어긋났다는 신호다(plan.md §F M3 3번).
 *
 * 거부 순서는 `scroll.ts`와 **같은 구조**다:
 *   방향 파싱 → 좌표 파싱 → `--amount` 파싱 → `resolveCoordinateMapper`(`--from`)
 *   → `resolveTargetDevice` → `getScreenSize` → `getMinEffectiveSwipeThreshold`
 *   → 기하 판정 → `backend.pinch`
 *
 * 앞의 네 단계에서 거부되면 **백엔드 조작 호출이 0회**다. `--from` 해석이
 * 백엔드 호출보다 앞서는 것은 우연이 아니다 — 배율을 모르는 채 되돌릴 수 없는
 * 제스처를 보낸 뒤에 사정을 설명할 수는 없다(`from-capture.ts`의 `@MX:ANCHOR`).
 */

import type { PinchPayload } from "../../schema/command-payloads.js";
import type { ScreenSize, SwipeThreshold } from "../../schema/device-backend.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { parseCoordinate, parseRatio } from "../validators.js";
import { resolveCoordinateMapper } from "./from-capture.js";
import {
  computePinchFingers,
  isPinchOutOfBounds,
  isPinchTravelTooSmall,
  pinchTravelPx,
  pinchValidRatioRange,
  type PinchDirection,
} from "./pinch-geometry.js";
import { backendFailure, type CommandHandler } from "./types.js";

/**
 * 생략 시 기본 비율(REQ-GEST2-PINCH-002) — SPEC은 구체적 수치를 정하지 않았다
 * (구현 세부, spec.md §D). `scroll`의 `DEFAULT_AMOUNT`와 **같은 값**을 쓴다:
 * 두 명령이 같은 플래그 이름으로 다른 기본값을 가지면 호출자가 명령별로
 * 기억해야 할 것이 하나 늘어나고, 그 차이를 정당화할 측정이 없다.
 *
 * **이 값은 설계 선택이지 실측값이 아니다.** 어떤 비율이 어느 정도로 확대되는지는
 * 측정된 적이 없다(spec.md §C.1-⑫ — 확대 폭은 미측정).
 */
const DEFAULT_AMOUNT = 0.5;

const DIRECTIONS: ReadonlySet<string> = new Set<PinchDirection>(["in", "out"]);

function isPinchDirection(value: string | undefined): value is PinchDirection {
  return value !== undefined && DIRECTIONS.has(value);
}

export const pinchCommand: CommandHandler = async (args, source) => {
  const [directionRaw, xRaw, yRaw, ...rest] = args.positionals;

  if (!isPinchDirection(directionRaw)) {
    return failure(
      "pinch",
      "INVALID_DIRECTION",
      "pinch requires a direction: pinch <in|out> <x> <y>.",
      { received: args.positionals },
    );
  }

  const rawX = xRaw !== undefined ? parseCoordinate(xRaw) : undefined;
  const rawY = yRaw !== undefined ? parseCoordinate(yRaw) : undefined;

  if (rest.length > 0 || rawX === undefined || rawY === undefined) {
    return failure(
      "pinch",
      "INVALID_COORDINATES",
      "pinch requires two non-negative integer coordinates: pinch <in|out> <x> <y>.",
      { received: { x: xRaw ?? null, y: yRaw ?? null } },
    );
  }

  let ratio = DEFAULT_AMOUNT;
  if (args.amount !== undefined) {
    const parsed = parseRatio(args.amount);
    if (parsed === undefined) {
      return failure(
        "pinch",
        "INVALID_AMOUNT",
        "pinch --amount requires a number greater than 0 and at most 1.",
        { received: args.amount },
      );
    }
    ratio = parsed;
  }

  // REQ-GEST2-COMMON-001: 앵커는 `tap`/`swipe`와 **완전히 같은** 변환을 탄다.
  // 비율은 배율과 무관하므로 변환 대상이 아니다 — `--from`이 있든 없든 같은
  // `--amount`가 같은 손가락 간격을 만든다(AC-GEST2-009).
  const mapper = await resolveCoordinateMapper("pinch", args);
  if (!mapper.ok) return mapper.error;
  const anchor = mapper.map(rawX, rawY);

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("pinch", target.code, target.message, target.details);

  // REQ-GEST2-COMMON-003: 조회가 실패하면(기기 끊김) BACKEND_COMMAND_FAILED,
  // 조회는 됐으나 답을 읽을 수 없으면 SCREEN_SIZE_UNKNOWN — 두 사실은 다르며,
  // 호출자는 재시도가 의미 있는지 구분할 수 있어야 한다(기존 계약).
  let screen: ScreenSize | undefined;
  try {
    screen = await target.backend.getScreenSize(target.serial);
  } catch (err) {
    return backendFailure("pinch", err);
  }

  if (!screen) {
    return failure("pinch", "SCREEN_SIZE_UNKNOWN", "Could not determine the device's screen size.");
  }

  // REQ-GEST2-PINCH-004: 문턱은 `scroll`과 **같은 출처**가 공급한다. 이 SPEC은
  // 두 번째 문턱 출처를 만들지 않는다(spec.md §A.3 E6).
  let threshold: SwipeThreshold;
  try {
    threshold = await target.backend.getMinEffectiveSwipeThreshold(target.serial);
  } catch (err) {
    return backendFailure("pinch", err);
  }

  const fingers = computePinchFingers(directionRaw, ratio, anchor, screen);

  // 두 거부는 **한 구간의 양 끝**이므로 되먹일 값도 한 번에 구한다: 화면 안
  // 판정은 비율이 커질수록 조여들고, 문턱 판정은 커질수록 풀린다. 구간이 비면
  // `undefined`이고, 그때는 권고 필드를 **싣지 않는다** — 자기 자신이 거부할
  // 값을 권하지 않는다(AC-GEST2-005/006, SPEC-GESTURE-001 0.8.0 NN5).
  const validRange = pinchValidRatioRange(anchor, screen, threshold.minEffectiveSwipePx);

  // REQ-GEST2-PINCH-003을 먼저 본다: 손가락을 화면에 **놓을 수조차 없는** 요청은
  // 이동 거리를 따지기 이전의 문제다. **자르지 않는다(clamp 금지)** — 좌표를
  // 화면 안으로 접으면 실제 확대 배율이 요청과 달라지는데 응답은 `ok:true`가
  // 된다. 탐지 가능한 실패를 탐지 불가능한 실패로 바꾸지 않는다.
  if (isPinchOutOfBounds(fingers, screen)) {
    return failure(
      "pinch",
      "PINCH_OUT_OF_BOUNDS",
      "pinch --amount places a finger outside the screen at this anchor; no gesture was sent.",
      {
        requestedRatio: ratio,
        ...(validRange !== undefined ? { maxValidRatio: validRange.max } : {}),
      },
    );
  }

  // REQ-GEST2-PINCH-004: 판정 대상은 **실제 좌표에서 잰 두 이동량 중 작은
  // 쪽**이다(0.4.0). 응답 형태는 `scroll`의 `AMOUNT_TOO_SMALL`과 같다 — 두
  // 명령이 다른 형태를 내면 호출자가 명령별 분기를 하게 된다.
  if (isPinchTravelTooSmall(pinchTravelPx(ratio, screen), threshold.minEffectiveSwipePx)) {
    return failure(
      "pinch",
      "AMOUNT_TOO_SMALL",
      "pinch --amount moves each finger too little to zoom at this screen size; no gesture was sent.",
      {
        requestedRatio: ratio,
        ...(validRange !== undefined
          ? { minValidRatio: validRange.min, minValidRatioBasis: threshold.basis }
          : {}),
      },
    );
  }

  try {
    await target.backend.pinch(target.serial, fingers);
  } catch (err) {
    return backendFailure("pinch", err);
  }

  // REQ-GEST2-PINCH-005: 방향과 **두 손가락의 실제 좌표**를 함께 싣는다. 방향
  // 토큰은 반대로 구현해도 오류가 나지 않으므로(spec.md §A.5), 호출자가 응답만
  // 보고 "in인데 벌어졌다"를 즉시 판정할 수 있어야 한다. 좌표만 있고 방향이
  // 없거나 그 반대이면 불충족이다.
  return success<PinchPayload>("pinch", { serial: target.serial, direction: directionRaw, fingers });
};
