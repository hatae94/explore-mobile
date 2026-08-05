/**
 * `devices` command (REQ-DEVICES-001/002, AC-ANDROID-004).
 *
 * **경로 B** (SPEC-READY-001 §B.6.3): 이 명령은 `resolveTargetDevice()`
 * (경로 A)를 거치지 않는 유일한 device-facing 명령이고, 자체 필터를 쓴다.
 * REQ-READY-006의 세 규칙(조회 범위 확장·대표 정규화·충돌 거부)을 경로 A와
 * **같게** 유지한다 — 다르면 사용자가 `devices --device X`와 다른
 * 명령에서 다른 답을 받는다. 연결 상태 검사만은 의도적으로 **하지
 * 않는다**(목록 명령이므로 연결 안 된 기기도 보여 주는 것이 목적이다) —
 * 이 SPEC이 바꾸지 않는 유일한 의도적 차이(§B.6.3 마지막 행).
 */

import type { DevicesPayload } from "../../schema/command-payloads.js";
import { collidingSerialMessage, matchesRequestedSerial } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { CommandHandler } from "./types.js";

export const devicesCommand: CommandHandler = async (args, source) => {
  const all = await source.listAllDevices();

  if (args.device === undefined) {
    return success<DevicesPayload>("devices", all);
  }

  // 대표 시리얼뿐 아니라 부속 시리얼로도 매치한다(REQ-READY-006, AC-READY-017).
  const filtered = all.filter((d) => matchesRequestedSerial(d, args.device!));
  if (filtered.length === 0) {
    return failure("devices", "DEVICE_NOT_FOUND", `No connected device with serial '${args.device}'.`, {
      requestedSerial: args.device,
      availableDevices: all,
    });
  }
  if (filtered.length > 1) {
    // 한 시리얼이 둘 이상 항목에 걸린다 — 임의로 고르지 않고 거부한다.
    // 경로 A와 같은 코드·문구(§B.6.2/§B.6.3, AC-READY-020).
    return failure(
      "devices",
      "BACKEND_COMMAND_FAILED",
      collidingSerialMessage(args.device, filtered.length),
      { requestedSerial: args.device, collidingEntries: filtered.length },
    );
  }
  // filtered.length === 1: 돌려주는 항목 자체가 이미 합쳐진 대표 항목이므로
  // 그 serial이 곧 대표다 — 정규화를 위한 추가 코드가 필요 없다(§B.6.3).
  return success<DevicesPayload>("devices", filtered);
};
