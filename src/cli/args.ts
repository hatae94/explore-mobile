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
  /** `tap`/`text --id <resource-id>`: selector-mode element target, matched against `CommonElement.id` (element-selector interaction, new capability — see element-query.ts). */
  id: string | undefined;
  /** `tap`/`text --text <label>`: selector-mode element target, matched against `CommonElement.text` (also matches content-desc-derived text). Named `selectorText` (not `text`) to stay unambiguous next to `text`'s own positional "string to type". */
  selectorText: string | undefined;
  /** `tap`/`text --index <n>`: 0-based match index when a selector matches more than one element. Kept as a raw string here (parsed by the command handler) to match the existing coordinate-parsing pattern. */
  index: string | undefined;
  /**
   * `--web` (SPEC-WEBVIEW-001, REQ-WEB-CLI-001): routes the command through
   * the WebKit Inspector path instead of the native accessibility path.
   *
   * Three states, because the flag carries an OPTIONAL value:
   *   `undefined`  — flag absent; the native path, entirely unchanged
   *   `""`         — `dump --web`, web mode with no selector
   *   non-empty    — `tap --web "<CSS>"`, the CSS selector to act on
   */
  web: string | undefined;
  /**
   * `--page <n>` (SPEC-WEBVIEW-001 0.2.0, REQ-WEB-PROXY-005): which
   * debuggable web page to act on. Required once the simulator exposes more
   * than one, because the proxy does not report which is on screen. Kept as
   * a raw string here and parsed by the handler, matching `--index`.
   */
  page: string | undefined;
}

/**
 * Gives a valueless `--web` an explicit empty value so `node:util.parseArgs`
 * can treat `--web` as a string option.
 *
 * `parseArgs` has no "optional value" option type: declaring `--web` as a
 * string makes a bare `dump --web` fail, and declaring it boolean makes
 * `tap --web "<CSS>"` drop the selector. The SPEC's command surface
 * (REQ-WEB-CLI-001) needs both forms, so the argv is normalized first.
 *
 * A token after `--web` is treated as its value unless it starts with `-`.
 * A CSS selector cannot begin with `-` at the top level, so this cannot
 * swallow a real selector.
 */
export function normalizeWebFlagArgv(argv: string[]): string[] {
  const normalized: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    normalized.push(token);
    if (token !== "--web") continue;

    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) normalized.push("");
  }

  return normalized;
}

/**
 * Parses a subcommand's argv (everything after the command word) into
 * positionals plus the shared `--device <serial>` (REQ-MULTIDEV-001),
 * `--out <path>` (screenshot host-file option), `--yes`/`--install`
 * (doctor auto-install consent), `--clean` (doctor --clean == reset),
 * `--keep-keyboard` (text: skip the default post-send keyboard dismissal),
 * and `--id`/`--text`/`--index` (tap/text: element-selector targeting)
 * options. Throws on unrecognized flags; callers (the router) convert
 * that into a graceful JSON error rather than letting it crash the
 * process.
 */
export function parseCommandArgs(argv: string[]): ParsedCommandArgs {
  const { values, positionals } = parseArgs({
    args: normalizeWebFlagArgv(argv),
    options: {
      web: { type: "string" },
      page: { type: "string" },
      device: { type: "string" },
      out: { type: "string" },
      yes: { type: "boolean" },
      install: { type: "boolean" },
      clean: { type: "boolean" },
      "keep-keyboard": { type: "boolean" },
      id: { type: "string" },
      text: { type: "string" },
      index: { type: "string" },
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
    id: typeof values.id === "string" ? values.id : undefined,
    selectorText: typeof values.text === "string" ? values.text : undefined,
    index: typeof values.index === "string" ? values.index : undefined,
    web: typeof values.web === "string" ? values.web : undefined,
    page: typeof values.page === "string" ? values.page : undefined,
  };
}
