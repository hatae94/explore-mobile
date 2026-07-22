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
}

/**
 * Parses a subcommand's argv (everything after the command word) into
 * positionals plus the shared `--device <serial>` (REQ-MULTIDEV-001) and
 * `--out <path>` (screenshot host-file option). Throws on unrecognized
 * flags; callers (the router) convert that into a graceful JSON error
 * rather than letting it crash the process.
 */
export function parseCommandArgs(argv: string[]): ParsedCommandArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      device: { type: "string" },
      out: { type: "string" },
    },
    allowPositionals: true,
  });

  return {
    positionals,
    device: typeof values.device === "string" ? values.device : undefined,
    out: typeof values.out === "string" ? values.out : undefined,
  };
}
