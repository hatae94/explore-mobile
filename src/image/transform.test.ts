/**
 * 이미지 변환 검사 (SPEC-IMAGE-001 M1 — AC-IMAGE-003, 032~034).
 *
 * **판정하는 것**: 실패가 원본 반환으로 조용히 대체되지 않는가, 실패 메시지가
 * 단계와 원인 줄을 보존하는가, 상한 이하 입력이 확대되지 않는가, 상한 초과
 * 입력에 축소 인자가 실리는가, 출력 해상도를 **출력 파일에서 읽는가**.
 *
 * **판정하지 못하는 것**: `sips`가 실제로 그 크기의 이미지를 만드는가.
 * 여기서는 `ProcessExecutor`를 대역으로 세우므로 외부 프로세스의 실제 동작은
 * 이 검사 너머에 있다(acceptance.md 「mock 한계 원칙」). 그것은 D 등급
 * AC-IMAGE-001/002가 실기기에서 닫는다.
 */

import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import type { ProcessExecutor } from "../backend/process-executor.js";
import { ImageTransformError } from "./image-errors.js";
import { parseSipsDimensions, transformImage } from "./transform.js";

const SOURCE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const CONVERTED_BYTES = "converted-image-bytes";

interface FakeSipsOptions {
  /** `sips -g`가 원본 파일에 대해 보고할 해상도. */
  sourceSize: { width: number; height: number };
  /** `sips -g`가 출력 파일에 대해 보고할 해상도. */
  outputSize: { width: number; height: number };
  /** 변환 호출의 종료 코드. 0이 아니면 출력 파일을 만들지 않는다. */
  convertExit?: number;
  convertStderr?: string;
  /** 종료 코드가 0인데도 출력 파일을 만들지 않는 경우 (도구가 조용히 실패한 경우). */
  suppressOutput?: boolean;
}

/** 원본 경로인지 출력 경로인지는 파일명으로 가른다 (`transform.ts`가 정하는 이름). */
function isSourcePath(path: string): boolean {
  return path.includes("source.");
}

function fakeSips(options: FakeSipsOptions): { exec: ProcessExecutor; calls: string[][] } {
  const calls: string[][] = [];
  const exec: ProcessExecutor = async (command, args) => {
    calls.push([command, ...args]);

    if (args.includes("-g")) {
      const path = args[args.length - 1] ?? "";
      const size = isSourcePath(path) ? options.sourceSize : options.outputSize;
      return {
        stdout: Buffer.from(`${path}\n  pixelWidth: ${size.width}\n  pixelHeight: ${size.height}\n`),
        stderr: Buffer.alloc(0),
        exitCode: 0,
      };
    }

    const exitCode = options.convertExit ?? 0;
    const outIndex = args.indexOf("--out");
    const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;
    if (exitCode === 0 && options.suppressOutput !== true && outPath !== undefined) {
      await writeFile(outPath, Buffer.from(CONVERTED_BYTES));
    }
    return {
      stdout: Buffer.alloc(0),
      stderr: Buffer.from(options.convertStderr ?? ""),
      exitCode,
    };
  };
  return { exec, calls };
}

/** 변환 호출(= `-g` 프로브가 아닌 호출)의 argv. */
function convertCall(calls: string[][]): string[] {
  const call = calls.find((c) => !c.includes("-g"));
  expect(call).toBeDefined();
  return call ?? [];
}

describe("parseSipsDimensions", () => {
  it("실기기에서 나온 sips -g 출력 형태를 그대로 읽는다", () => {
    const stdout = "/tmp/shot.png\n  pixelWidth: 1080\n  pixelHeight: 2220\n";
    expect(parseSipsDimensions(stdout)).toEqual({ width: 1080, height: 2220 });
  });

  it("두 값 중 하나라도 없으면 undefined — 반쪽 값을 지어내지 않는다", () => {
    expect(parseSipsDimensions("/tmp/shot.png\n  pixelWidth: 1080\n")).toBeUndefined();
    expect(parseSipsDimensions("")).toBeUndefined();
  });
});

describe("transformImage — 실패 경로 (REQ-IMAGE-008)", () => {
  it("AC-IMAGE-032: 변환 도구가 비정상 종료하면 구조화된 오류를 던진다", async () => {
    const { exec } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
      convertExit: 1,
      convertStderr: "Error 4: no such file or directory\n",
    });

    await expect(
      transformImage(SOURCE_BYTES, { maxEdge: 1568, format: "jpeg", quality: 75 }, exec),
    ).rejects.toBeInstanceOf(ImageTransformError);
  });

  it("AC-IMAGE-033(음성 대조): 실패가 원본 반환으로 대체되지 않는다", async () => {
    const { exec } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
      convertExit: 1,
      convertStderr: "Error 4\n",
    });

    // 반환값이 원본 바이트인 결과는 어떤 형태로도 나오면 안 된다.
    const result = await transformImage(
      SOURCE_BYTES,
      { maxEdge: 1568, format: "jpeg", quality: 75 },
      exec,
    ).then(
      (value) => ({ resolved: true as const, value }),
      (err: unknown) => ({ resolved: false as const, err }),
    );

    expect(result.resolved).toBe(false);
  });

  it("AC-IMAGE-033: 종료 코드가 0이어도 출력 파일이 없으면 원본으로 대체하지 않는다", async () => {
    const { exec } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
      suppressOutput: true,
    });

    await expect(
      transformImage(SOURCE_BYTES, { maxEdge: 1568, format: "jpeg", quality: 75 }, exec),
    ).rejects.toBeInstanceOf(ImageTransformError);
  });

  it("AC-IMAGE-034: 오류 메시지가 실패 단계와 stderr 원인 줄을 보존한다", async () => {
    const { exec } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
      convertExit: 1,
      convertStderr: "sips: Error 4: no such file or directory\n",
    });

    const err = await transformImage(
      SOURCE_BYTES,
      { maxEdge: 1568, format: "jpeg", quality: 75 },
      exec,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ImageTransformError);
    const message = (err as ImageTransformError).message;
    expect(message).toContain("sips: Error 4: no such file or directory");
    expect((err as ImageTransformError).stage).toBe("convert");
  });
});

describe("transformImage — 성공 경로", () => {
  it("AC-IMAGE-003: 긴 변이 이미 상한 이하이면 축소 인자를 싣지 않는다", async () => {
    const { exec, calls } = fakeSips({
      sourceSize: { width: 800, height: 600 },
      outputSize: { width: 800, height: 600 },
    });

    const result = await transformImage(
      SOURCE_BYTES,
      { maxEdge: 1568, format: "jpeg", quality: 75 },
      exec,
    );

    expect(convertCall(calls)).not.toContain("-Z");
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("긴 변이 상한을 넘으면 -Z <상한>이 실린다", async () => {
    const { exec, calls } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
    });

    await transformImage(SOURCE_BYTES, { maxEdge: 1568, format: "jpeg", quality: 75 }, exec);

    const call = convertCall(calls);
    const zIndex = call.indexOf("-Z");
    expect(zIndex).toBeGreaterThanOrEqual(0);
    expect(call[zIndex + 1]).toBe("1568");
  });

  it("세로가 긴 화면도 긴 변 기준으로 판정한다 (Android 1080×2220)", async () => {
    const { exec, calls } = fakeSips({
      sourceSize: { width: 1080, height: 2220 },
      outputSize: { width: 763, height: 1568 },
    });

    const result = await transformImage(
      SOURCE_BYTES,
      { maxEdge: 1568, format: "jpeg", quality: 75 },
      exec,
    );

    expect(convertCall(calls)).toContain("-Z");
    expect(result.width).toBe(763);
    expect(result.height).toBe(1568);
  });

  it("AC-IMAGE-009(음성 대조): 해상도를 요청 인자에서 역산하지 않고 출력 파일에서 읽는다", async () => {
    // 요청 상한은 1568인데 도구가 1000×750을 냈다고 보고하는 대역.
    // 역산 구현이라면 1568이 나오고, 관측 구현이라면 1000이 나온다.
    const { exec } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1000, height: 750 },
    });

    const result = await transformImage(
      SOURCE_BYTES,
      { maxEdge: 1568, format: "jpeg", quality: 75 },
      exec,
    );

    expect(result.width).toBe(1000);
    expect(result.height).toBe(750);
  });

  it("변환된 바이트를 돌려주고 품질 인자를 싣는다", async () => {
    const { exec, calls } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
    });

    const result = await transformImage(
      SOURCE_BYTES,
      { maxEdge: 1568, format: "jpeg", quality: 75 },
      exec,
    );

    expect(Buffer.from(result.bytes).toString()).toBe(CONVERTED_BYTES);
    expect(result.format).toBe("jpeg");

    const call = convertCall(calls);
    expect(call).toContain("formatOptions");
    expect(call).toContain("75");
  });

  it("임시 파일을 남기지 않는다", async () => {
    const { exec, calls } = fakeSips({
      sourceSize: { width: 2732, height: 2048 },
      outputSize: { width: 1568, height: 1176 },
    });

    await transformImage(SOURCE_BYTES, { maxEdge: 1568, format: "jpeg", quality: 75 }, exec);

    const call = convertCall(calls);
    const outIndex = call.indexOf("--out");
    const outPath = call[outIndex + 1];
    expect(outPath).toBeDefined();
    await expect(readFile(outPath ?? "")).rejects.toThrow();
  });
});
