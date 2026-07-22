import type { DeviceBackend } from "../../schema/device-backend.js";
import type { ParsedCommandArgs } from "../args.js";
import type { CommandResult } from "../envelope.js";
import type { EnvServices } from "../env-services.js";

/**
 * Every command handler receives its parsed argv, the (possibly mock)
 * `DeviceBackend` to operate through — never raw adb/idb argv directly —
 * and the per-platform `EnvServices` holder (REQ-IOS-DOCTOR-003,
 * SPEC-IOS-001 — generalized from the original Android-only `AdbDoctor`
 * parameter) used only by `doctor`/`reset`, which dispatch to
 * `envServices.android`/`envServices.ios` based on the resolved target
 * device's platform. This is the enforcement point for the 3-layer
 * boundary: CLI -> normalize/device-backend interface -> adb/idb wrapper.
 * Handlers that don't need `envServices` simply omit the third parameter
 * (TypeScript's bivariant function typing allows this).
 */
export type CommandHandler = (
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  envServices: EnvServices,
) => Promise<CommandResult>;

/** Extracts a readable message from a thrown value of unknown shape. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
