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
  /**
   * `tap`/`text --web "<CSS>" --index <n>`: 0-based match index when the CSS
   * selector matches more than one element. Kept as a raw string here
   * (parsed by the command handler) to match the existing coordinate-parsing
   * pattern.
   *
   * **SPEC-VISION-001 M2**: this is now a WEB-ONLY flag. The native
   * `--id`/`--text` selectors it used to disambiguate were removed with the
   * UI-tree dump (REQ-VISION-002); `--index` itself survives because
   * `web-support.ts` `readSelector` still needs it and REQ-VISION-007
   * (웹뷰 회귀 금지) is the ceiling on that removal (spec.md §C.4).
   * AC-VISION-008's `--index` clause is therefore explicitly unmet — see
   * progress.md §G.
   */
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
  /**
   * `swipe --duration <ms>` (SPEC-GESTURE-001 M2, REQ-GEST-SWIPE-002/005):
   * gesture duration in milliseconds — the CLI's single contract unit
   * regardless of backend; a backend whose tool uses a different unit
   * converts internally rather than changing this flag's meaning
   * (spec.md §C.1-⑦). Kept as a raw string here and validated by the handler
   * (`parseDurationMs` in `validators.ts`), matching the `--index`/`--id`
   * pattern.
   */
  duration: string | undefined;
  /**
   * `scroll --amount <ratio>` (SPEC-GESTURE-001 M3, REQ-GEST-SCROLL-003/006):
   * 화면의 몇 비율을 스크롤할지(0 초과 1 이하). `--duration`/`--index`와
   * 같은 패턴으로 원시 문자열만 여기서 들고, 핸들러가 `parseRatio`
   * (validators.ts)로 검증한다.
   */
  amount: string | undefined;
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
 * and `--index` (tap/text --web: which CSS-selector match to act on)
 * options. Throws on unrecognized flags; callers (the router) convert
 * that into a graceful JSON error rather than letting it crash the
 * process.
 *
 * **SPEC-VISION-001 M2**: `--id` and `--text` are GONE (REQ-VISION-002).
 * Because they are no longer declared here, `parseArgs` throws on them and
 * the router surfaces `INVALID_ARGS` — the removed flags are refused
 * explicitly rather than silently degrading to a coordinate tap
 * (AC-VISION-009).
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
      index: { type: "string" },
      duration: { type: "string" },
      amount: { type: "string" },
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
    index: typeof values.index === "string" ? values.index : undefined,
    web: typeof values.web === "string" ? values.web : undefined,
    page: typeof values.page === "string" ? values.page : undefined,
    duration: typeof values.duration === "string" ? values.duration : undefined,
    amount: typeof values.amount === "string" ? values.amount : undefined,
  };
}
