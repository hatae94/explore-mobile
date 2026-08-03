/**
 * `tap <x> <y>` command (REQ-INPUT-001).
 *
 * 좌표가 유일한 네이티브 타겟팅 수단이다. **SPEC-VISION-001 M2가 그 이전의
 * 결정을 뒤집는다**(REQ-VISION-002): `tap --id` / `--text` 셀렉터 모드와 그
 * 뒤의 UI 계층 덤프 경로가 제거됐다. 읽기 경로는 스크린샷 하나로 통일되며,
 * 호출자는 스크린샷에서 읽은 좌표를 그대로 넘긴다(spec.md §A.2).
 *
 * **SPEC-WEBVIEW-002가 `--web` CSS 셀렉터 경로까지 제거한다** — 그 경로는 iOS
 * 시뮬레이터 전용이었고, `SPEC-VISION-001` M3이 시뮬레이터 열거를 뺀 뒤로는
 * 대상을 지목할 방법조차 없었다. 이제 좌표가 유일한 타겟팅 수단이며 `--index`도
 * 함께 사라졌다(그 플래그의 유일한 소비자가 웹 경로였다).
 *
 * 제거된 플래그는 조용히 무시되지 않는다 — `args.ts`에서 옵션 자체가
 * 사라졌으므로 `tap --id foo` / `tap --web "css"`는 `parseArgs`가 알 수 없는
 * 옵션으로 거부하고 라우터가 `INVALID_ARGS`로 감싼다. 좌표 탭으로 임의
 * 대체하는 경로는 존재하지 않는다(REQ-VISION-002 후반부, AC-VISION-009 ·
 * REQ-WEBRM-003).
 */

import type { TapPayload } from "../../schema/command-payloads.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { parseCoordinate } from "../validators.js";
import { backendFailure, errorMessage, type CommandHandler } from "./types.js";

export const tapCommand: CommandHandler = async (args, source) => {
  const [xRaw, yRaw] = args.positionals;

  const x = xRaw !== undefined ? parseCoordinate(xRaw) : undefined;
  const y = yRaw !== undefined ? parseCoordinate(yRaw) : undefined;

  if (x === undefined || y === undefined) {
    return failure(
      "tap",
      "INVALID_COORDINATES",
      "tap requires two non-negative integer coordinates: tap <x> <y>.",
      { received: { x: xRaw ?? null, y: yRaw ?? null } },
    );
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("tap", target.code, target.message, target.details);

  try {
    await target.backend.tap(target.serial, x, y);
  } catch (err) {
    return backendFailure("tap", err);
  }

  return success<TapPayload>("tap", { serial: target.serial, x, y });
};
