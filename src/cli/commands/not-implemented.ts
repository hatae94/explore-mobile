/**
 * Placeholder handlers for commands scoped to future milestones.
 *
 * `text` (Unicode/IME input path, REQ-INPUT-002/003/004) lands in M5.
 * `doctor`/`reset` (environment bootstrap, REQ-DOCTOR-001~005) land in M6.
 * Each still emits a valid JSON error envelope (REQ-ARCH-001) rather than
 * silently no-op'ing or crashing, so the full command surface stays
 * discoverable and every invocation stays within the JSON in/out contract.
 */

import { failure } from "../envelope.js";
import type { CommandHandler } from "./types.js";

function notImplemented(command: string, milestone: string, reqRefs: string): CommandHandler {
  return async () =>
    failure(
      command,
      "NOT_IMPLEMENTED",
      `'${command}' is implemented in SPEC-ANDROID-001 milestone ${milestone} (${reqRefs}).`,
    );
}

export const textCommand: CommandHandler = notImplemented(
  "text",
  "M5",
  "REQ-INPUT-002/003/004 — Unicode/IME input path",
);

export const doctorCommand: CommandHandler = notImplemented(
  "doctor",
  "M6",
  "REQ-DOCTOR-001~005 — environment bootstrap",
);

export const resetCommand: CommandHandler = notImplemented(
  "reset",
  "M6",
  "REQ-DOCTOR-004 — environment reset/restore",
);
