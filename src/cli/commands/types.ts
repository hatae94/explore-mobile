import type { DeviceBackend } from "../../schema/device-backend.js";
import type { ParsedCommandArgs } from "../args.js";
import type { CommandResult } from "../envelope.js";

/**
 * Every command handler receives its parsed argv and the (possibly mock)
 * `DeviceBackend` to operate through — never raw adb argv directly. This
 * is the enforcement point for the 3-layer boundary: CLI -> normalize /
 * device-backend interface -> adb wrapper.
 */
export type CommandHandler = (args: ParsedCommandArgs, backend: DeviceBackend) => Promise<CommandResult>;

/** Extracts a readable message from a thrown value of unknown shape. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
