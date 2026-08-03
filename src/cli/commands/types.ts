import type { ParsedCommandArgs } from "../args.js";
import type { DeviceSource } from "../device-targeting.js";
import type { CommandResult } from "../envelope.js";
import type { EnvServices } from "../env-services.js";

/**
 * Every command handler receives its parsed argv, the (possibly mock)
 * device source to operate through — never raw adb/idb argv directly —
 * and the per-platform `EnvServices` holder (REQ-IOS-DOCTOR-003,
 * SPEC-IOS-001 — generalized from the original Android-only `AdbDoctor`
 * parameter) used only by `doctor`/`reset`, which dispatch to
 * `envServices.android`/`envServices.ios` based on the resolved target
 * device's platform. This is the enforcement point for the 3-layer
 * boundary: CLI -> normalize/device-backend interface -> adb/idb wrapper.
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
