/**
 * `--from <capture-path>` 좌표 변환 (SPEC-IMAGE-001 REQ-IMAGE-004~006).
 *
 * `tap` / `swipe` / `scroll` 세 명령이 **이 한 함수를 공유한다**. 같은 산술을
 * 세 곳에 복사하면 한 곳만 고쳐졌을 때 세 명령이 서로 다른 좌표를 보내게 되고,
 * 그 차이는 실기기 탭이 빗나가기 전까지 드러나지 않는다(plan.md §A.2 M4).
 *
 * 이 SPEC 이전에는 곱셈의 주인이 호출자였다 — `SKILL.md`가 "줄어든 이미지를
 * 보면 곱해서 되돌리라"고 지시했다. 이제 코드가 한다.
 *
 * **거부는 조작보다 먼저다.** 사이드카 부재·손상·낡음은 백엔드를 부르기 전에
 * 걸러야 한다 — 되돌릴 수 없는 제스처를 보낸 뒤에 "사실 배율을 몰랐다"고
 * 말할 수는 없다(AC-IMAGE-025/026/027이 「백엔드 조작 호출 0회」를 함께
 * 판정하는 이유).
 */

import { CAPTURE_STALE_MS } from "../../image/constants.js";
import {
  assertCaptureFresh,
  readCaptureGeometry,
  toDeviceCoordinate,
  type DevicePoint,
} from "../../image/geometry.js";
import { CaptureGeometryUnavailableError, CaptureStaleError } from "../../image/image-errors.js";
import type { ParsedCommandArgs } from "../args.js";
import { failure, type CommandError } from "../envelope.js";

/** 이미지 좌표를 기기 좌표로 옮기는 함수. `--from`이 없으면 항등 함수다. */
export type CoordinateMapper = (x: number, y: number) => DevicePoint;

export type MapperResolution =
  | { ok: true; map: CoordinateMapper }
  | { ok: false; error: CommandError };

const identity: CoordinateMapper = (x, y) => ({ x, y });

/**
 * `--from`을 해석해 좌표 변환 함수를 만든다. 실패는 그대로 반환할 오류 봉투로
 * 돌려준다 — 호출부가 던지지 않고 계속 `failure(...)`를 반환하는 기존 구조를
 * 유지하기 위해서다(`swipe.ts` / `scroll.ts`의 거부 경로 형태).
 *
 * `--from`이 없으면 항등 함수다: 기존 계약(좌표는 기기 좌표)이 그대로 유지된다
 * (REQ-IMAGE-004 후반부, AC-IMAGE-019).
 */
export async function resolveCoordinateMapper(
  command: string,
  args: ParsedCommandArgs,
  now: Date = new Date(),
): Promise<MapperResolution> {
  if (args.from === undefined) return { ok: true, map: identity };

  try {
    const geometry = await readCaptureGeometry(args.from);
    assertCaptureFresh(geometry, { now, staleMs: CAPTURE_STALE_MS, staleOk: args.staleOk });
    return { ok: true, map: (x, y) => toDeviceCoordinate(geometry, x, y) };
  } catch (err) {
    if (err instanceof CaptureGeometryUnavailableError || err instanceof CaptureStaleError) {
      return { ok: false, error: failure(command, err.code, err.message, { from: args.from }) };
    }
    throw err;
  }
}
