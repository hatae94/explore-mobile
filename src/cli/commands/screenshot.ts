/**
 * `screenshot` command (REQ-SCREENSHOT-001/002; SPEC-IMAGE-001 M3으로 개정).
 *
 * Always emits JSON (REQ-ARCH-001): with `--out <path>` the image bytes are
 * written to that host path and the JSON response is a small pointer;
 * without `--out` the bytes are embedded as base64 in the JSON body
 * so the contract holds either way. Neither mode leaves a file on the
 * device — the bytes are streamed host-side.
 *
 * **SPEC-IMAGE-001이 기본 동작을 바꾼다**: 캡처는 이제 기본적으로 축소·JPEG
 * 재인코딩되어 나간다(REQ-IMAGE-001). 원본을 원하면 `--full`을 명시한다
 * (REQ-IMAGE-002). 바꾼 이유는 만든 해상도의 대부분이 판독 단계에서 버려지기
 * 때문이다 — iPad 캡처 7.7 MB를 옮긴 대가가 회수되지 않았다(spec.md §A.1).
 *
 * **축소는 여기서만 일어난다.** 백엔드의 `screenshot()`은 원본 PNG 바이트를
 * 그대로 돌려주며 이 SPEC은 그 계약을 건드리지 않는다 — iOS가 캡처에서
 * 도출하는 배율과 축소 배율이 곱해지는 이중 배율을 피하기 위해서다
 * (spec.md §C.1, §D.2). `src/backend/`는 읽기만 했다.
 *
 * @MX:ANCHOR — 축소·기하 산출의 유일한 지점. 이 로직이 백엔드로 내려가면
 * 좌표가 조용히 두 번 나뉜다.
 * @MX:REASON — `wda-backend.ts:406`의 배율 도출이 감싸지 않은 내부 캡처를
 * 쓰기 때문이다. 백엔드가 축소된 바이트를 돌려주기 시작하면 그 도출이
 * 축소분까지 흡수한다.
 * @MX:SPEC: SPEC-IMAGE-001 REQ-IMAGE-001
 */

import type { ScreenshotPayload } from "../../schema/command-payloads.js";
import { writeFile } from "node:fs/promises";

import { DEFAULT_FORMAT, DEFAULT_MAX_EDGE, DEFAULT_QUALITY } from "../../image/constants.js";
import { writeCaptureGeometry, type CaptureGeometry } from "../../image/geometry.js";
import { ImageTransformError } from "../../image/image-errors.js";
import { measureImageBytes, transformImage, type ImageFormat } from "../../image/transform.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { parseImageFormat, parseMaxEdge, parseQuality } from "../validators.js";
import { backendFailure, errorMessage, type CommandHandler } from "./types.js";

export const screenshotCommand: CommandHandler = async (args, source) => {
  // 인자 검증은 기기 조작보다 **먼저** 한다 — `swipe.ts`가 확립한 순서
  // (REQ-GEST-SWIPE-005)와 같다. 캡처는 Android에서 2.4초가 걸리므로,
  // 어차피 거부할 요청 때문에 그 시간을 쓰지 않는다.
  let maxEdge = DEFAULT_MAX_EDGE;
  if (args.maxEdge !== undefined) {
    const parsed = parseMaxEdge(args.maxEdge);
    if (parsed === undefined) {
      return failure("screenshot", "INVALID_MAX_EDGE", "screenshot --max-edge requires a positive integer number of pixels.", {
        received: args.maxEdge,
      });
    }
    maxEdge = parsed;
  }

  let format: ImageFormat = DEFAULT_FORMAT;
  if (args.format !== undefined) {
    const parsed = parseImageFormat(args.format);
    if (parsed === undefined) {
      return failure("screenshot", "INVALID_FORMAT", "screenshot --format requires one of: jpeg, png.", {
        received: args.format,
      });
    }
    format = parsed;
  }

  let quality = DEFAULT_QUALITY;
  if (args.quality !== undefined) {
    const parsed = parseQuality(args.quality);
    if (parsed === undefined) {
      return failure("screenshot", "INVALID_QUALITY", "screenshot --quality requires an integer from 1 to 100.", {
        received: args.quality,
      });
    }
    quality = parsed;
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("screenshot", target.code, target.message, target.details);

  let bytes: Uint8Array;
  try {
    bytes = await target.backend.screenshot(target.serial);
  } catch (err) {
    return backendFailure("screenshot", err);
  }

  // 캡처 시각은 **백엔드가 바이트를 돌려준 직후**로 잡는다. 변환 뒤에 잡으면
  // 변환에 걸린 시간만큼 캡처가 실제보다 새것으로 기록돼, 신선도 판정이
  // 그만큼 관대해진다(REQ-IMAGE-006).
  const capturedAt = new Date().toISOString();

  let outputBytes: Uint8Array;
  let geometry: CaptureGeometry;
  try {
    if (args.full) {
      // REQ-IMAGE-002: 바이트를 그대로 낸다. 그래도 기하는 실어야 하므로
      // 해상도만 관측한다 — 배율은 1.0이다.
      const size = await measureImageBytes(bytes);
      outputBytes = bytes;
      geometry = {
        width: size.width,
        height: size.height,
        deviceWidth: size.width,
        deviceHeight: size.height,
        scale: 1,
        format: "png",
        capturedAt,
      };
    } else {
      const result = await transformImage(bytes, { maxEdge, format, quality });
      outputBytes = result.bytes;
      geometry = {
        width: result.width,
        height: result.height,
        deviceWidth: result.sourceWidth,
        deviceHeight: result.sourceHeight,
        scale: result.sourceWidth / result.width,
        format: result.format,
        capturedAt,
      };
    }
  } catch (err) {
    // REQ-IMAGE-008: 원본으로 조용히 대체하지 않는다. 변환에 실패했다면
    // 호출자는 자기가 무엇을 받았는지 몰라야 하는 게 아니라, 못 받았다는
    // 사실을 알아야 한다.
    if (err instanceof ImageTransformError) {
      return failure("screenshot", err.code, err.message, { stage: err.stage });
    }
    return failure("screenshot", "IMAGE_TRANSFORM_FAILED", errorMessage(err));
  }

  const buffer = Buffer.from(outputBytes);

  if (args.out !== undefined) {
    try {
      await writeFile(args.out, buffer);
      // REQ-IMAGE-005: 캡처 옆에 기하를 함께 남긴다. 이것이 없으면 나중에
      // `tap --from`이 배율을 알 방법이 없다.
      await writeCaptureGeometry(args.out, geometry);
    } catch (err) {
      return failure("screenshot", "WRITE_FAILED", errorMessage(err), { path: args.out });
    }
    return success<ScreenshotPayload>("screenshot", {
      serial: target.serial,
      savedTo: args.out,
      byteLength: buffer.length,
      ...geometry,
    });
  }

  // REQ-IMAGE-007: base64 모드도 같은 축소를 받는다. 이 모드에는 사이드카가
  // 없으므로 응답 본문이 기하의 유일한 기록이다.
  return success<ScreenshotPayload>("screenshot", {
    serial: target.serial,
    byteLength: buffer.length,
    pngBase64: buffer.toString("base64"),
    ...geometry,
  });
};
