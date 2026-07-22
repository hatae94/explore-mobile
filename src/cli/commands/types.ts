import type { AdbDoctor } from "../../backend/doctor.js";
import type { DeviceBackend } from "../../schema/device-backend.js";
import type { ParsedCommandArgs } from "../args.js";
import type { CommandResult } from "../envelope.js";

/**
 * Every command handler receives its parsed argv, the (possibly mock)
 * `DeviceBackend` to operate through — never raw adb argv directly — and
 * (M6) the `AdbDoctor` environment-bootstrap service used only by
 * `doctor`/`reset`. This is the enforcement point for the 3-layer
 * boundary: CLI -> normalize/device-backend interface -> adb wrapper.
 * Handlers that don't need `doctor` simply omit the third parameter
 * (TypeScript's bivariant function typing allows this).
 */
export type CommandHandler = (
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  doctor: AdbDoctor,
) => Promise<CommandResult>;

/** Extracts a readable message from a thrown value of unknown shape. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
