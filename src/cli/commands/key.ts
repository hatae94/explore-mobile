/** `key <alias>` command (REQ-INPUT-005, REQ-IOS-BACKEND-007). */

import type { KeyPayload } from "../../schema/command-payloads.js";
import { KEY_ALIASES, isKeyAlias } from "../../schema/key-alias.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { backendFailure, type CommandHandler } from "./types.js";

export const keyCommand: CommandHandler = async (args, source) => {
  const alias = args.positionals[0];
  if (!alias || !isKeyAlias(alias)) {
    return failure(
      "key",
      "UNSUPPORTED_KEY",
      `Unsupported key alias. Supported: ${KEY_ALIASES.join(", ")}.`,
      { received: alias ?? null },
    );
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("key", target.code, target.message, target.details);

  try {
    await target.backend.sendKeyEvent(target.serial, alias);
  } catch (err) {
    // REQ-IOS-BACKEND-007 / AC-IOS-017 / D7 precedence (spec.md §C.3): a
    // typed-recognized backend error surfaces its OWN code — never masked
    // behind the generic BACKEND_COMMAND_FAILED. `UNSUPPORTED_KEY_ON_IOS`
    // (a valid alias with no iOS equivalent, e.g. `app_switch`) must be a
    // graceful, distinguishable reject, not a generic failure. That
    // promotion now lives in `backendFailure` (types.ts), which holds the
    // whole promoted set in one place.
    return backendFailure("key", err);
  }

  return success<KeyPayload>("key", { serial: target.serial, key: alias });
};
