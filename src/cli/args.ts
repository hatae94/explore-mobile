/**
 * Shared CLI argument parsing (M3). Uses `node:util.parseArgs` (Node
 * standard library) rather than an external dependency (`commander`),
 * per the simplicity ladder — the option surface here (a handful of
 * positionals + `--device`/`--out`) does not need a full CLI framework.
 */

import { parseArgs } from "node:util";

export interface ParsedCommandArgs {
  positionals: string[];
  device: string | undefined;
  out: string | undefined;
  /** Explicit consent for `doctor`'s auto-install step (REQ-DOCTOR-002) — true if `--yes` or `--install` was given. */
  yes: boolean;
  /** `doctor --clean` == `reset` (REQ-DOCTOR-004). */
  clean: boolean;
  /** `text --keep-keyboard`: opts out of the default post-send soft-keyboard dismissal (REQ-INPUT-004 revised, real-device UX). */
  keepKeyboard: boolean;
}

/**
 * Parses a subcommand's argv (everything after the command word) into
 * positionals plus the shared `--device <serial>` (REQ-MULTIDEV-001),
 * `--out <path>` (screenshot host-file option), `--yes`/`--install`
 * (doctor auto-install consent), `--clean` (doctor --clean == reset), and
 * `--keep-keyboard` (text: skip the default post-send keyboard dismissal)
 * options. Throws on unrecognized flags; callers (the router) convert
 * that into a graceful JSON error rather than letting it crash the
 * process.
 */
export function parseCommandArgs(argv: string[]): ParsedCommandArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      device: { type: "string" },
      out: { type: "string" },
      yes: { type: "boolean" },
      install: { type: "boolean" },
      clean: { type: "boolean" },
      "keep-keyboard": { type: "boolean" },
    },
    allowPositionals: true,
  });

  return {
    positionals,
    device: typeof values.device === "string" ? values.device : undefined,
    out: typeof values.out === "string" ? values.out : undefined,
    yes: values.yes === true || values.install === true,
    clean: values.clean === true,
    keepKeyboard: values["keep-keyboard"] === true,
  };
}
