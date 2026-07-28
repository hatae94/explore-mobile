/**
 * `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` command (SPEC-GESTURE-001 M2,
 * REQ-GEST-SWIPE-001~003, REQ-GEST-SWIPE-005).
 *
 * Mirrors `tap.ts`'s coordinate-validation shape (B-6): resolve the target
 * device via `resolveTargetDevice`, never throw, always return
 * `failure(...)`/`success(...)`.
 *
 * `--duration` is validated (REQ-GEST-SWIPE-005) BEFORE `backend.swipe` is
 * ever called — the ms → seconds conversion for iOS happens INSIDE
 * `IdbBackend.swipe` (M1), so this handler must never pass a value that
 * failed to parse as a positive integer. A `NaN` reaching that
 * conversion would silently become `--duration NaN` on the wire
 * (spec.md §B.1 REQ-GEST-SWIPE-005).
 *
 * Negative coordinate/duration LITERALS (e.g. `-50`, `-100`) never reach
 * this handler at all — `node:util.parseArgs` treats a leading `-` token as
 * an unrecognized option and throws before `router.ts` calls this command,
 * degrading to `INVALID_ARGS` (plan.md §F M2 — deliberate decision NOT to
 * add argv preprocessing; the "zero gestures sent" guarantee holds on both
 * the `INVALID_COORDINATES`/`INVALID_DURATION` and `INVALID_ARGS` branches).
 */

import type { DeviceBackend, SwipeOptions } from "../../schema/device-backend.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { MAX_DURATION_MS, parseCoordinate, parseDurationMs } from "../validators.js";
import { errorMessage, type CommandHandler } from "./types.js";

export const swipeCommand: CommandHandler = async (args, backend: DeviceBackend) => {
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
  // unparsable value reach `IdbBackend`'s ms/1000 conversion as NaN.
  //
  // @MX:NOTE: [AUTO] --duration 검증은 반드시 backend.swipe 호출보다 앞서야 한다 -- 순서를 뒤집으면 파싱 실패값이 그대로 IdbBackend의 ms/1000 환산에 들어가 NaN이 argv에 실릴 수 있다(spec.md §B.1 REQ-GEST-SWIPE-005)
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

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return failure("swipe", target.code, target.message, target.details);

  const from = { x: x1, y: y1 };
  const to = { x: x2, y: y2 };
  const options: SwipeOptions | undefined = durationMs !== undefined ? { durationMs } : undefined;

  try {
    await backend.swipe(target.serial, from, to, options);
  } catch (err) {
    return failure("swipe", "BACKEND_COMMAND_FAILED", errorMessage(err));
  }

  return success("swipe", {
    serial: target.serial,
    from,
    to,
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
};
