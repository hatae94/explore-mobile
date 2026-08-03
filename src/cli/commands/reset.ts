/**
 * `reset` command, and the shared implementation behind `doctor --clean`
 * (REQ-DOCTOR-004, REQ-IOS-DOCTOR-003/004): restores the target device to
 * its pre-`doctor` state, dispatching by the resolved target's platform —
 * `envServices.android.resetDevice()` (Android, IME restore) or
 * `envServices.ios.resetDevice()` (iOS, near-no-op). Exported as a
 * reusable function (not just the `CommandHandler`) so `doctor.ts` can
 * invoke the identical logic under its own command name when `--clean`
 * is passed, rather than duplicating the device-targeting + response
 * shaping.
 *
 * `reset` is also the ONLY place a session-based IME switch (REQ-INPUT-004
 * revised — `AdbBackend.inputText()`) is actually restored, and this is
 * Android-only: the resolved `AdbBackend` instance is narrowed via
 * `instanceof` (an Android-specific concern kept out of the
 * backend-agnostic `DeviceBackend` interface) to read and clear the
 * per-serial tracked original IME. `backend` may be a plain `AdbBackend`
 * OR a `BackendRegistry` (SPEC-IOS-001, `bin.ts`) wrapping one alongside
 * the iOS backend — either way, `resolveAdbBackend` below finds the real
 * `AdbBackend` instance for the resolved serial, if any. This entire IME
 * path is skipped on the iOS branch (`WdaDoctor.resetDevice` — no IME
 * concept on iOS, and WDA text input leaves no state behind).
 *
 * @MX:NOTE — platform branching (REQ-IOS-DOCTOR-003, SPEC-IOS-001): the
 * target device is resolved FIRST (unchanged position — `resolveTargetDevice`
 * already ran here before SPEC-IOS-001), then `resolvedDevice.platform`
 * decides which of `envServices.{android,ios}` handles the reset. The
 * Android branch is byte-for-byte the pre-existing logic; only the iOS
 * branch (near-no-op) is new.
 */

import { AdbBackend } from "../../backend/adb-backend.js";
import type { DeviceBackend } from "../../schema/device-backend.js";
import { BackendRegistry } from "../../backend/registry.js";
import { resolveTargetDevice, type DeviceSource } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { ParsedCommandArgs } from "../args.js";
import type { CommandResult } from "../envelope.js";
import type { EnvServices } from "../env-services.js";
import type { CommandHandler } from "./types.js";

/**
 * Resolves the concrete `AdbBackend` instance actually handling `serial`,
 * whether `backend` is a bare `AdbBackend` or a `BackendRegistry` wrapping
 * one (SPEC-IOS-001) — so the session-based IME restore below keeps
 * working identically through either construction. Returns `undefined`
 * when `serial` is owned by a non-Android backend (e.g. `WdaBackend`) or
 * cannot be resolved.
 */
export async function performReset(
  args: ParsedCommandArgs,
  source: DeviceSource,
  envServices: EnvServices,
  commandName: string,
): Promise<CommandResult> {
  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure(commandName, target.code, target.message, target.details);

  // REQ-IOS-DOCTOR-003/004 (SPEC-IOS-001): iOS has no IME/APK state to
  // clean, so its reset is a near-no-op reported by WdaDoctor — the
  // Android-only IME-restore machinery below never runs for this branch.
  if (target.device.platform === "ios") {
    const result = await envServices.ios.resetDevice(target.serial);
    return success(commandName, { serial: target.serial, ...result });
  }

  // M5(REQ-VISION-005): 소유 백엔드는 해석 단계가 이미 확정했다. 이전에는
  // 여기서 `BackendRegistry.resolveBackend`를 다시 불러 **세 번째** 열거가
  // 발생했다(핸들러 1회 + facade 1회 + 이 조회 1회).
  const adbBackend = target.backend instanceof AdbBackend ? target.backend : undefined;
  const trackedOriginalIme = adbBackend ? await adbBackend.getTrackedOriginalIme(target.serial) : undefined;

  const result = await envServices.android.resetDevice(target.serial, trackedOriginalIme);

  // Clear the session once `resetDevice()` has taken responsibility for
  // restoring it — but only on success (or when there was nothing precise
  // to restore to); on a genuine restore failure, retain the tracked entry
  // for audit / manual recovery (mirrors the prior per-call retain-on-
  // failure behavior, now scoped to the session boundary).
  if (adbBackend && trackedOriginalIme !== undefined && result.originalImeRestored !== false) {
    await adbBackend.clearTrackedOriginalIme(target.serial);
  }

  return success(commandName, { serial: target.serial, ...result });
}

export const resetCommand: CommandHandler = (args, source, envServices) =>
  performReset(args, source, envServices, "reset");
