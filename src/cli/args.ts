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
  /**
   * `screenshot --full` (SPEC-IMAGE-001 REQ-IMAGE-002): 축소·재인코딩을
   * 건너뛰고 백엔드가 준 PNG 원본을 그대로 낸다. 축소가 **기본**이므로
   * 원본을 원하는 쪽이 명시한다.
   */
  full: boolean;
  /** `screenshot --max-edge <px>` — 긴 변 상한 재정의. 원시 문자열; 핸들러가 검증한다. */
  maxEdge: string | undefined;
  /** `screenshot --format <jpeg|png>` — 출력 포맷 재정의. */
  format: string | undefined;
  /** `screenshot --quality <0-100>` — JPEG 품질 재정의. */
  quality: string | undefined;
  /**
   * `tap|swipe|scroll --from <capture-path>` (SPEC-IMAGE-001 REQ-IMAGE-004):
   * 이 캡처의 기록된 기하로 입력 좌표를 기기 좌표로 되돌린다. 주지 않으면
   * 좌표는 지금까지와 동일하게 기기 좌표로 해석된다(기존 계약 무변경).
   */
  from: string | undefined;
  /** `--stale-ok`: 낡은 캡처 거부를 끈다 (REQ-IMAGE-006). */
  staleOk: boolean;
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
      full: { type: "boolean" },
      "max-edge": { type: "string" },
      format: { type: "string" },
      quality: { type: "string" },
      from: { type: "string" },
      "stale-ok": { type: "boolean" },
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
    full: values.full === true,
    maxEdge: typeof values["max-edge"] === "string" ? values["max-edge"] : undefined,
    format: typeof values.format === "string" ? values.format : undefined,
    quality: typeof values.quality === "string" ? values.quality : undefined,
    from: typeof values.from === "string" ? values.from : undefined,
    staleOk: values["stale-ok"] === true,
  };
}
