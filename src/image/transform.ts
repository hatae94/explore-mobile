/**
 * 캡처 이미지 축소·재인코딩 (SPEC-IMAGE-001 REQ-IMAGE-001/008).
 *
 * macOS 내장 `sips`를 쓴다 — 이 패키지의 런타임 의존성은 0개이며(`package.json`),
 * 이미지 한 장 줄이자고 그 사실을 깨지 않는다(spec.md §D.3). 프로세스 실행은
 * 기존 `process-executor.ts`를 그대로 재사용한다: 새 실행 방식을 만들면
 * argv 배열·무셸 원칙이 두 곳으로 갈라진다.
 *
 * **여기가 CLI 계층이라는 사실이 이 모듈의 존재 이유다.** 축소를 백엔드의
 * `screenshot()` 안에 넣으면, iOS가 캡처에서 도출하는 배율
 * (`wda-backend.ts:406`)과 새로 생긴 축소 배율이 **곱해져** 좌표가 조용히
 * 어긋난다(spec.md §C.1 이중 배율). 그래서 이 모듈은 백엔드가 이미 돌려준
 * 원본 바이트만 받고, 백엔드 쪽은 한 줄도 건드리지 않는다.
 *
 * @MX:ANCHOR — 축소는 CLI 계층에서만 일어난다. 이 함수를 백엔드
 * (`adb-backend.ts` / `wda-backend.ts`)에서 호출하면 안 된다.
 * @MX:REASON — iOS 배율은 상수가 아니라 감싸지 않은 내부 캡처에서 도출된다.
 * 백엔드가 축소된 바이트를 돌려주기 시작하면 그 도출이 축소 배율까지 흡수해
 * 좌표가 두 번 나뉜다 — 실패가 조용하다는 점이 이 위험의 본질이다.
 * @MX:SPEC: SPEC-IMAGE-001 REQ-IMAGE-001
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { spawnProcess, type ProcessExecutor } from "../backend/process-executor.js";
import { ImageTransformError } from "./image-errors.js";

/** 출력 포맷. `sips -s format`이 받는 이름과 같은 문자열을 쓴다. */
export type ImageFormat = "jpeg" | "png";

export interface ImageSize {
  width: number;
  height: number;
}

export interface TransformOptions {
  /** 긴 변의 상한(px). 긴 변이 이 값 이하이면 축소하지 않는다. */
  maxEdge: number;
  format: ImageFormat;
  /** JPEG 품질(0~100). PNG에는 쓰이지 않는다. */
  quality: number;
}

export interface TransformedImage {
  bytes: Uint8Array;
  /** **출력 파일에서 관측한** 값이다 — 요청 상한에서 역산하지 않는다(REQ-IMAGE-003). */
  width: number;
  height: number;
  /**
   * 기기 원본 캡처의 해상도. 변환 과정에서 이미 관측했으므로 함께 돌려준다 —
   * 호출부가 같은 파일을 한 번 더 프로브하면 `sips` 호출이 공짜로 하나 는다.
   */
  sourceWidth: number;
  sourceHeight: number;
  format: ImageFormat;
}

/** 파일명으로 원본/출력을 가른다 — 검사 대역도 같은 규칙을 쓴다. */
const SOURCE_BASENAME = "source.png";

/**
 * `sips -g pixelWidth -g pixelHeight <file>`의 출력에서 해상도를 읽는다.
 *
 * 실제 출력 형태:
 * ```
 * /tmp/shot.png
 *   pixelWidth: 1080
 *   pixelHeight: 2220
 * ```
 *
 * 두 값 중 하나라도 없으면 `undefined`다 — 한쪽만 읽어 나머지를 추정하지
 * 않는다. 반쪽 기하는 없는 기하보다 위험하다(엉뚱한 배율이 계산된다).
 */
export function parseSipsDimensions(stdout: string): ImageSize | undefined {
  const width = stdout.match(/pixelWidth:\s*(\d+)/);
  const height = stdout.match(/pixelHeight:\s*(\d+)/);
  if (!width?.[1] || !height?.[1]) return undefined;
  return { width: Number(width[1]), height: Number(height[1]) };
}

/** stderr에서 사람이 읽을 첫 줄을 뽑는다 — 원인 줄을 보존하기 위한 것(REQ-IMAGE-008). */
function firstMeaningfulLine(buffer: Buffer): string {
  const line = buffer
    .toString()
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? "(원인 출력 없음)";
}

/** 한 파일의 해상도를 `sips`로 관측한다. 실패는 던진다 — 추정하지 않는다. */
async function probeSize(exec: ProcessExecutor, stage: string, path: string): Promise<ImageSize> {
  const result = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path]);
  if (result.exitCode !== 0) {
    throw new ImageTransformError(stage, firstMeaningfulLine(result.stderr));
  }
  const size = parseSipsDimensions(result.stdout.toString());
  if (size === undefined) {
    throw new ImageTransformError(stage, `sips 출력에서 해상도를 읽지 못했습니다: ${result.stdout.toString().trim()}`);
  }
  return size;
}

/**
 * 원본 PNG 바이트를 축소·재인코딩해 새 바이트와 **관측된** 출력 해상도를 돌려준다.
 *
 * 실패는 전부 `ImageTransformError`로 던진다 — 어떤 실패 경로에서도 원본
 * 바이트를 대신 돌려주지 않는다(REQ-IMAGE-008, AC-IMAGE-033). 종료 코드가
 * 0인데 출력 파일이 없는 경우도 실패다: 도구가 조용히 아무것도 안 한 상태를
 * 성공으로 읽으면 그 뒤의 모든 좌표 계산이 어긋난다.
 */
export async function transformImage(
  source: Uint8Array,
  options: TransformOptions,
  exec: ProcessExecutor = spawnProcess,
): Promise<TransformedImage> {
  const dir = await mkdtemp(join(tmpdir(), "explore-mobile-img-"));
  const sourcePath = join(dir, SOURCE_BASENAME);
  const outputPath = join(dir, `output.${options.format}`);

  try {
    await writeFile(sourcePath, Buffer.from(source));

    const sourceSize = await probeSize(exec, "probe-source", sourcePath);

    // 긴 변이 이미 상한 이하이면 축소 인자를 아예 싣지 않는다 — `sips -Z`는
    // 작은 이미지를 **확대**하므로, 조건 없이 걸면 REQ-IMAGE-001의
    // "확대는 하지 않는다"가 깨진다(AC-IMAGE-003).
    //
    // 확대한다는 것은 추측이 아니라 실측이다 (2026-08-10, macOS Darwin 25.6.0):
    // `sips -Z 1568`을 194×400 PNG에 걸었더니 760×1568이 나왔다. 이 방어가
    // 없으면 작은 화면 기기에서 이미지가 커지며 파일이 오히려 불어난다.
    const longestEdge = Math.max(sourceSize.width, sourceSize.height);
    const resizeArgs = longestEdge > options.maxEdge ? ["-Z", String(options.maxEdge)] : [];
    const qualityArgs = options.format === "jpeg" ? ["-s", "formatOptions", String(options.quality)] : [];

    const convert = await exec("sips", [
      "-s",
      "format",
      options.format,
      ...qualityArgs,
      ...resizeArgs,
      sourcePath,
      "--out",
      outputPath,
    ]);
    if (convert.exitCode !== 0) {
      throw new ImageTransformError("convert", firstMeaningfulLine(convert.stderr));
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(outputPath);
    } catch (err) {
      // 종료 코드가 0이었는데 출력이 없다 — 성공으로 읽으면 조용한 대체가 된다.
      throw new ImageTransformError(
        "read-output",
        `변환 도구가 성공을 보고했으나 출력 파일이 없습니다: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const outputSize = await probeSize(exec, "probe-output", outputPath);

    return {
      bytes: new Uint8Array(bytes),
      width: outputSize.width,
      height: outputSize.height,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      format: options.format,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * 변환하지 않고 해상도만 관측한다 — `--full` 경로가 쓴다(REQ-IMAGE-002/003).
 *
 * `--full`은 바이트를 그대로 내보내지만, 응답에는 여전히 기하가 실려야 한다
 * (`scale`은 1.0이지만 `width`/`height`는 실제 값이어야 한다). 그 값도
 * **관측**해서 얻는다 — 백엔드에 물어보면 그것은 논리 화면 크기이지 캡처
 * 해상도가 아니며, 두 값은 iOS에서 서로 다르다(spec.md §C.1).
 */
export async function measureImageBytes(
  source: Uint8Array,
  exec: ProcessExecutor = spawnProcess,
): Promise<ImageSize> {
  const dir = await mkdtemp(join(tmpdir(), "explore-mobile-img-"));
  const sourcePath = join(dir, SOURCE_BASENAME);
  try {
    await writeFile(sourcePath, Buffer.from(source));
    return await probeSize(exec, "probe-source", sourcePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
