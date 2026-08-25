/**
 * `doubletap <x> <y>` 명령 (SPEC-GESTURE-002 M4 — REQ-GEST2-DTAP-001 · 004,
 * REQ-GEST2-COMMON-001; AC-GEST2-007 · 008 · 009 · 013 · 014).
 *
 * **`tap.ts`의 형태를 그대로 따른다**: 좌표 파싱 → `resolveCoordinateMapper`
 * (`--from`) → `resolveTargetDevice` → `backend.doubleTap`. 화면 크기도 문턱도
 * 쓰지 않는다 — 쓰지 않는 값을 조회하면 `tap`보다 느려질 이유가 없는 명령이
 * 느려진다(AC-GEST2-014). **이 파일이 `tap.ts`보다 복잡해지면 무언가 잘못된
 * 것이다**(plan.md §F M4 1번).
 *
 * **두 탭 사이 간격은 여기 없다.** 간격은 봉투를 만드는 유일한 자리인
 * `wda-backend.ts`의 이름 붙은 상수 `DOUBLE_TAP_GAP_MS`이며
 * (REQ-GEST2-DTAP-002), CLI 표면에 노출하지 않는다 — `SCROLL_SWIPE_DURATION_MS`가
 * `scroll`에서 지는 것과 같은 성격이다(spec.md §D). 따라서 이 명령에는
 * `--duration` 계열 플래그가 없고, `args.ts`도 손대지 않는다.
 *
 * 명령명은 **한 단어 `doubletap`**이다 — 기존 명령이 전부 한 단어이거나 하이픈
 * 없는 형태다(`screenshot` / `scroll` / `swipe`).
 *
 * **`tap`을 두 번 부르는 것으로 대체할 수 없다**(REQ-GEST2-DTAP-003). 측정에서
 * `tap` 2회의 왕복 간격은 iOS에서 2,531 ms였고, 그때 일어난 일은 확대가 아니라
 * **단일 탭 두 번**이었다(spec.md §C.1-③). 그래서 두 탭이 **한 요청 안에**
 * 실려야 하며, 그 봉투 구성은 백엔드가 진다.
 */

import type { DoubleTapPayload } from "../../schema/command-payloads.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { parseCoordinate } from "../validators.js";
import { resolveCoordinateMapper } from "./from-capture.js";
import { backendFailure, type CommandHandler } from "./types.js";

export const doubleTapCommand: CommandHandler = async (args, source) => {
  const [xRaw, yRaw] = args.positionals;

  const rawX = xRaw !== undefined ? parseCoordinate(xRaw) : undefined;
  const rawY = yRaw !== undefined ? parseCoordinate(yRaw) : undefined;

  if (rawX === undefined || rawY === undefined) {
    return failure(
      "doubletap",
      "INVALID_COORDINATES",
      "doubletap requires two non-negative integer coordinates: doubletap <x> <y>.",
      { received: { x: xRaw ?? null, y: yRaw ?? null } },
    );
  }

  // REQ-GEST2-COMMON-001: 좌표는 `tap`과 **완전히 같은** 변환을 탄다. 거부는
  // 백엔드 호출보다 **먼저** 끝난다 — 배율을 모르는 채 되돌릴 수 없는 제스처를
  // 보낸 뒤에 사정을 설명할 수는 없다(`from-capture.ts`의 `@MX:ANCHOR`).
  const mapper = await resolveCoordinateMapper("doubletap", args);
  if (!mapper.ok) return mapper.error;
  const { x, y } = mapper.map(rawX, rawY);

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("doubletap", target.code, target.message, target.details);

  try {
    await target.backend.doubleTap(target.serial, x, y);
  } catch (err) {
    // REQ-GEST2-COMMON-002: Android의 `UNSUPPORTED_GESTURE_ON_ANDROID`는
    // `backendFailure`의 타입 통과 목록에 있으므로 일반 `BACKEND_COMMAND_FAILED`
    // 뒤에 가려지지 않고 그대로 호출자에게 닿는다(`types.ts`).
    return backendFailure("doubletap", err);
  }

  // AC-GEST2-013: 타입을 **명시**한다. 객체 리터럴 추론에 맡기면 필드를 지워도
  // 컴파일과 테스트가 통과한다(SPEC-CONTRACT-001이 존재하는 이유).
  return success<DoubleTapPayload>("doubletap", { serial: target.serial, x, y });
};
