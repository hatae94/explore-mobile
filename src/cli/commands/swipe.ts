/**
 * `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` command (SPEC-GESTURE-001 M2,
 * REQ-GEST-SWIPE-001~003, REQ-GEST-SWIPE-005).
 *
 * Mirrors `tap.ts`'s coordinate-validation shape (B-6): resolve the target
 * device via `resolveTargetDevice`, never throw, always return
 * `failure(...)`/`success(...)`.
 *
 * `--duration` is validated (REQ-GEST-SWIPE-005) BEFORE `backend.swipe` is
 * ever called, so this handler never hands a backend a value that failed
 * to parse as a positive integer. A `NaN` that gets past this point is
 * carried all the way to the wire — as a `NaN` duration in a W3C actions
 * body on iOS, or in the adb argv on Android — and neither backend can
 * tell it apart from a value the caller meant (spec.md §B.1
 * REQ-GEST-SWIPE-005). The specific downstream shape has changed across
 * SPECs; the ordering requirement has not.
 *
 * Negative coordinate/duration LITERALS (e.g. `-50`, `-100`) never reach
 * this handler at all — `node:util.parseArgs` treats a leading `-` token as
 * an unrecognized option and throws before `router.ts` calls this command,
 * degrading to `INVALID_ARGS` (plan.md §F M2 — deliberate decision NOT to
 * add argv preprocessing; the "zero gestures sent" guarantee holds on both
 * the `INVALID_COORDINATES`/`INVALID_DURATION` and `INVALID_ARGS` branches).
 */

import type { SwipePayload } from "../../schema/command-payloads.js";
import type { DeviceBackend, SwipeOptions } from "../../schema/device-backend.js";
import { resolveTargetDevice, type DeviceSource } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { MAX_DURATION_MS, parseCoordinate, parseDurationMs } from "../validators.js";
import { resolveCoordinateMapper } from "./from-capture.js";
import { backendFailure, errorMessage, type CommandHandler } from "./types.js";

export const swipeCommand: CommandHandler = async (args, source: DeviceSource) => {
  const [x1Raw, y1Raw, x2Raw, y2Raw, ...rest] = args.positionals;

  if (rest.length > 0 || x1Raw === undefined || y1Raw === undefined || x2Raw === undefined || y2Raw === undefined) {
    return failure(
      "swipe",
      "INVALID_COORDINATES",
      "swipe requires exactly four non-negative integer coordinates: swipe <x1> <y1> <x2> <y2>.",
      { received: args.positionals },
    );
  }

  const x1 = parseCoordinate(x1Raw);
  const y1 = parseCoordinate(y1Raw);
  const x2 = parseCoordinate(x2Raw);
  const y2 = parseCoordinate(y2Raw);

  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return failure(
      "swipe",
      "INVALID_COORDINATES",
      "swipe requires exactly four non-negative integer coordinates: swipe <x1> <y1> <x2> <y2>.",
      { received: { x1: x1Raw, y1: y1Raw, x2: x2Raw, y2: y2Raw } },
    );
  }

  // REQ-GEST-SWIPE-005: validated BEFORE any backend call — never let an
  // unparsable value reach a backend as NaN.
  //
  // @MX:NOTE: [AUTO] --duration 검증은 반드시 backend.swipe 호출보다 앞서야 한다 -- 순서를 뒤집으면 파싱 실패값이 그대로 백엔드에 전달돼 NaN이 그대로 기기로 나간다(spec.md §B.1 REQ-GEST-SWIPE-005)
  let durationMs: number | undefined;
  if (args.duration !== undefined) {
    durationMs = parseDurationMs(args.duration);
    if (durationMs === undefined) {
      return failure(
        "swipe",
        "INVALID_DURATION",
        `swipe --duration requires a positive integer number of milliseconds, at most ${MAX_DURATION_MS}.`,
        { received: args.duration },
      );
    }
  }

  // SPEC-IMAGE-001 REQ-IMAGE-004: `--from`이 있으면 네 좌표 모두 축소 이미지의
  // 좌표다. `--duration` 검증과 같은 이유로 백엔드 호출보다 앞선다 —
  // 거부되면 어떤 제스처도 나가지 않는다(AC-IMAGE-023).
  const mapper = await resolveCoordinateMapper("swipe", args);
  if (!mapper.ok) return mapper.error;

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("swipe", target.code, target.message, target.details);

  const from = mapper.map(x1, y1);
  const to = mapper.map(x2, y2);
  const options: SwipeOptions | undefined = durationMs !== undefined ? { durationMs } : undefined;

  try {
    await target.backend.swipe(target.serial, from, to, options);
  } catch (err) {
    return backendFailure("swipe", err);
  }

  return success<SwipePayload>("swipe", {
    serial: target.serial,
    from,
    to,
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
};
