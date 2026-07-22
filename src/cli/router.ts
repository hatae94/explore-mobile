/**
 * CLI command router (M3) — dispatches argv to a command handler and
 * always resolves to a {@link CommandResult}, never throws and never lets
 * a non-JSON error escape (REQ-ARCH-001).
 *
 * @MX:NOTE — this is the sole place `bin.ts` calls into; command handlers
 * are pure of subprocess concerns and only see the `DeviceBackend`
 * interface, preserving the CLI -> normalize/backend-interface -> adb
 * wrapper layering (spec.md §A.4).
 */

import { AdbDoctor } from "../backend/doctor.js";
import type { DeviceBackend } from "../schema/device-backend.js";
import { parseCommandArgs } from "./args.js";
import { devicesCommand } from "./commands/devices.js";
import { doctorCommand } from "./commands/doctor.js";
import { dumpCommand } from "./commands/dump.js";
import { keyCommand } from "./commands/key.js";
import { launchCommand } from "./commands/launch.js";
import { resetCommand } from "./commands/reset.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { stopCommand } from "./commands/stop.js";
import { tapCommand } from "./commands/tap.js";
import { textCommand } from "./commands/text.js";
import type { CommandHandler } from "./commands/types.js";
import { failure } from "./envelope.js";
import type { CommandResult } from "./envelope.js";

const COMMANDS: Record<string, CommandHandler> = {
  devices: devicesCommand,
  launch: launchCommand,
  stop: stopCommand,
  screenshot: screenshotCommand,
  tap: tapCommand,
  key: keyCommand,
  dump: dumpCommand,
  text: textCommand,
  doctor: doctorCommand,
  reset: resetCommand,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs one CLI invocation. `argv` is everything after the program name
 * (e.g. `process.argv.slice(2)`) — the first element is the command word.
 * Always resolves (never rejects): parse errors, unknown commands, and
 * handler-thrown exceptions all degrade to a graceful {@link CommandError}.
 *
 * `doctor` defaults to a real `AdbDoctor()` when not provided, so every
 * pre-M6 call site (`runCli(argv, backend)`, used throughout the M3 test
 * suite) keeps working unchanged — only `doctor`/`reset` command handlers
 * ever touch this parameter.
 */
export async function runCli(
  argv: string[],
  backend: DeviceBackend,
  doctor: AdbDoctor = new AdbDoctor(),
): Promise<CommandResult> {
  const [commandName, ...rest] = argv;
  const supported = Object.keys(COMMANDS).join(", ");

  if (!commandName) {
    return failure("(none)", "MISSING_COMMAND", `A command is required. Supported: ${supported}.`);
  }

  const handler = COMMANDS[commandName];
  if (!handler) {
    return failure(commandName, "UNKNOWN_COMMAND", `Unknown command '${commandName}'. Supported: ${supported}.`);
  }

  let args;
  try {
    args = parseCommandArgs(rest);
  } catch (err) {
    return failure(commandName, "INVALID_ARGS", errorMessage(err));
  }

  try {
    return await handler(args, backend, doctor);
  } catch (err) {
    // Defense in depth: a handler bug still degrades to graceful JSON,
    // never an uncaught exception / non-JSON stack trace.
    return failure(commandName, "INTERNAL_ERROR", errorMessage(err));
  }
}
