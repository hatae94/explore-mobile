/**
 * `reset` command, and the shared implementation behind `doctor --clean`
 * (REQ-DOCTOR-004): both restore the target device to its pre-`doctor`
 * state via the same `AdbDoctor.resetDevice()` call. Exported as a
 * reusable function (not just the `CommandHandler`) so `doctor.ts` can
 * invoke the identical logic under its own command name when `--clean`
 * is passed, rather than duplicating the device-targeting + response
 * shaping.
 *
 * `reset` is also the ONLY place a session-based IME switch (REQ-INPUT-004
 * revised — `AdbBackend.inputText()`) is actually restored: the resolved
 * `AdbBackend` instance is narrowed via `instanceof` (an Android-specific
 * concern kept out of the backend-agnostic `DeviceBackend` interface,
 * consistent with `AdbDoctor` itself already being a concrete,
 * non-abstracted parameter here) to read and clear the per-serial tracked
 * original IME. `backend` may be a plain `AdbBackend` OR a `BackendRegistry`
 * (SPEC-IOS-001, `bin.ts`) wrapping one alongside `IdbBackend` — either way,
 * `resolveAdbBackend` below finds the real `AdbBackend` instance for the
 * resolved serial, if any. A backend with no such concept (`IdbBackend`)
 * simply skips this (near-no-op reset — `IdbDoctor.resetDevice`).
 */

import { AdbBackend } from "../../backend/adb-backend.js";
import type { DeviceBackend } from "../../schema/device-backend.js";
import type { AdbDoctor } from "../../backend/doctor.js";
import { BackendRegistry } from "../../backend/registry.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import type { ParsedCommandArgs } from "../args.js";
import type { CommandResult } from "../envelope.js";
import type { CommandHandler } from "./types.js";

/**
 * Resolves the concrete `AdbBackend` instance actually handling `serial`,
 * whether `backend` is a bare `AdbBackend` or a `BackendRegistry` wrapping
 * one (SPEC-IOS-001) — so the session-based IME restore below keeps
 * working identically through either construction. Returns `undefined`
 * when `serial` is owned by a non-Android backend (e.g. `IdbBackend`) or
 * cannot be resolved.
 */
async function resolveAdbBackend(backend: DeviceBackend, serial: string): Promise<AdbBackend | undefined> {
  if (backend instanceof AdbBackend) return backend;
  if (backend instanceof BackendRegistry) {
    const resolved = await backend.resolveBackend(serial);
    if (resolved?.backend instanceof AdbBackend) return resolved.backend;
  }
  return undefined;
}

export async function performReset(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  doctor: AdbDoctor,
  commandName: string,
): Promise<CommandResult> {
  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure(commandName, target.code, target.message, target.details);

  const adbBackend = await resolveAdbBackend(backend, target.serial);
  const trackedOriginalIme = adbBackend ? await adbBackend.getTrackedOriginalIme(target.serial) : undefined;

  const result = await doctor.resetDevice(target.serial, trackedOriginalIme);

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

export const resetCommand: CommandHandler = (args, backend, doctor) => performReset(args, backend, doctor, "reset");
