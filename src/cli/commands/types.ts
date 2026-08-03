import {
  WdaPortUnmappedError,
  WdaResponseLostError,
  WdaUnreachableError,
  WdaUnsupportedKeyError,
} from "../../backend/wda-errors.js";
import type { ParsedCommandArgs } from "../args.js";
import type { DeviceSource } from "../device-targeting.js";
import { failure, type CommandError, type CommandResult } from "../envelope.js";
import type { EnvServices } from "../env-services.js";

/**
 * Every command handler receives its parsed argv, the (possibly mock)
 * device source to operate through — never raw platform-tool argv directly —
 * and the per-platform `EnvServices` holder (REQ-IOS-DOCTOR-003,
 * SPEC-IOS-001 — generalized from the original Android-only `AdbDoctor`
 * parameter) used only by `doctor`/`reset`, which dispatch to
 * `envServices.android`/`envServices.ios` based on the resolved target
 * device's platform. This is the enforcement point for the 3-layer
 * boundary: CLI -> device-backend interface -> platform-tool wrapper.
 * Handlers that don't need `envServices` simply omit the third parameter
 * (TypeScript's bivariant function typing allows this).
 *
 * **SPEC-VISION-001 M5 (REQ-VISION-005)**: 두 번째 인자가 `DeviceBackend`가
 * 아니라 `DeviceSource`다. 핸들러는 `source.listAllDevices()`로 **한 번만**
 * 열거하고, `resolveTargetDevice`가 돌려준 `target.backend`로 기기를
 * 조작한다. 이전처럼 `backend.tap(...)`을 부르면 registry facade가 소유
 * 백엔드를 다시 찾느라 두 번째 열거가 발생했다(design.md §D.1).
 */
export type CommandHandler = (
  args: ParsedCommandArgs,
  source: DeviceSource,
  envServices: EnvServices,
) => Promise<CommandResult>;

/** Extracts a readable message from a thrown value of unknown shape. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 백엔드가 던진 예외를 명령 실패 봉투로 바꾼다.
 *
 * 기본값은 기존 그대로 `BACKEND_COMMAND_FAILED`다(D7 오류 코드 우선순위,
 * spec.md §C.3 — 일반 백엔드 실패는 계속 이 코드 뒤에 놓인다). 다만
 * **호출자가 서로 다르게 대응해야 하는** 아래 넷만은 자기 코드를 그대로
 * 노출한다. "타입이 식별된 백엔드 오류는 일반 코드 뒤에 가리지 않는다"는
 * 관례이며, 원래 `key.ts`에 흩어져 있던 판단을 여기 한곳으로 모았다.
 *
 * 구분해야 하는 이유(design.md §B.3, AC-VISION-015/016):
 *   - `WDA_UNREACHABLE`      → WDA를 띄워라 (사용자 행동이 필요)
 *   - `WDA_RESPONSE_LOST`    → 응답만 유실됐다. 조작 호출이면 적용됐을 수 있으니
 *                              스크린샷으로 확인하고, 읽기 호출이면 상태가
 *                              바뀌지 않았으니 다시 불러도 된다 (SPEC-VISION-002 —
 *                              메시지가 어느 쪽인지 알려준다)
 *   - `WDA_PORT_UNMAPPED`    → 포트 매핑에 이 기기를 추가하라
 *   - `UNSUPPORTED_KEY_ON_IOS` → 이 키는 iOS에 대응 동작이 없다 (재시도 무의미)
 * 넷을 하나로 뭉개면 호출자는 "왜 안 되는지 모르는 상태"에 놓인다.
 */
export function backendFailure(command: string, err: unknown): CommandError {
  if (
    err instanceof WdaUnreachableError ||
    err instanceof WdaResponseLostError ||
    err instanceof WdaPortUnmappedError ||
    err instanceof WdaUnsupportedKeyError
  ) {
    return failure(command, err.code, err.message);
  }
  return failure(command, "BACKEND_COMMAND_FAILED", errorMessage(err));
}
