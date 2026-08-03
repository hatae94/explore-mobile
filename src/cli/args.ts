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
   * `swipe --duration <ms>` (SPEC-GESTURE-001 M2, REQ-GEST-SWIPE-002/005):
   * gesture duration in milliseconds — the CLI's single contract unit
   * regardless of backend; a backend whose tool uses a different unit
   * converts internally rather than changing this flag's meaning
   * (spec.md §C.1-⑦). Kept as a raw string here and validated by the handler
   * (`parseDurationMs` in `validators.ts`).
   */
  duration: string | undefined;
  /**
   * `scroll --amount <ratio>` (SPEC-GESTURE-001 M3, REQ-GEST-SCROLL-003/006):
   * 화면의 몇 비율을 스크롤할지(0 초과 1 이하). `--duration`과 같은 패턴으로
   * 원시 문자열만 여기서 들고, 핸들러가 `parseRatio`(validators.ts)로 검증한다.
   */
  amount: string | undefined;
}

/**
 * Parses a subcommand's argv (everything after the command word) into
 * positionals plus the shared `--device <serial>` (REQ-MULTIDEV-001),
 * `--out <path>` (screenshot host-file option), `--yes`/`--install`
 * (doctor auto-install consent), `--clean` (doctor --clean == reset),
 * `--keep-keyboard` (text: skip the default post-send keyboard dismissal),
 * `--duration` (swipe), and `--amount` (scroll) options. Throws on
 * unrecognized flags; callers (the router) convert that into a graceful
 * JSON error rather than letting it crash the process.
 *
 * **SPEC-VISION-001 M2**: `--id` and `--text` are GONE (REQ-VISION-002).
 * **SPEC-WEBVIEW-002**: `--web`, `--page`, `--index` are GONE too — the web
 * selector path they served was iOS-simulator-only and became unreachable
 * once M3 dropped simulator enumeration. `--index` had no other consumer.
 *
 * Because none of these are declared here, `parseArgs` throws on them and
 * the router surfaces `INVALID_ARGS` — the removed flags are refused
 * explicitly rather than silently degrading to a coordinate tap
 * (AC-VISION-009 · REQ-WEBRM-003).
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
    duration: typeof values.duration === "string" ? values.duration : undefined,
    amount: typeof values.amount === "string" ? values.amount : undefined,
  };
}
