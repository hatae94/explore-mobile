/**
 * `screenshot` 배선 검사 (SPEC-IMAGE-001 M3 — AC-IMAGE-005~009, 024, 031~033).
 *
 * **판정하는 것**: 응답에 기하 7필드가 실리는가, 사이드카가 응답과 일치하는가,
 * `--full`이 백엔드 바이트를 그대로 내보내며 배율 1.0을 보고하는가, 변환 실패가
 * 원본 반환으로 대체되지 않는가, 잘못된 인자가 **캡처 이전에** 거부되는가.
 *
 * **판정하지 못하는 것**: `sips`가 실제로 그 크기의 이미지를 만드는가. 여기서는
 * 변환 모듈을 대역으로 세운다 — 변환 모듈 자체는 `transform.test.ts`가 별도로
 * 검사하고, 외부 프로세스의 실제 동작은 D 등급 AC-IMAGE-001/002가 실기기에서
 * 닫는다(acceptance.md 「mock 한계 원칙」).
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { DEFAULT_FORMAT, DEFAULT_MAX_EDGE, DEFAULT_QUALITY } from "../../image/constants.js";
import { ImageTransformError } from "../../image/image-errors.js";
import { geometrySidecarPath } from "../../image/geometry.js";
import { measureImageBytes, transformImage } from "../../image/transform.js";
import { runCli } from "../router.js";

vi.mock("../../image/transform.js", () => ({
  transformImage: vi.fn(),
  measureImageBytes: vi.fn(),
}));

const DEVICE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x11, 0x22, 0x33]);
const SHRUNK_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x44]);

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R58N90ABCDE",
    model: "Pixel_7",
    osVersion: "14",
    connectionState: "device",
    unavailableReason: null,
    alternateSerials: [],
    isEmulator: false,
    platform: "android",
    ...overrides,
  };
}

function createMockBackend(devices: DeviceInfo[] = [device()]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    screenshot: vi.fn().mockResolvedValue(DEVICE_BYTES),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
  };
}

/** iPad 2732×2048 → 1568×1176 축소를 흉내낸다. */
function mockShrink(): void {
  vi.mocked(transformImage).mockResolvedValue({
    bytes: SHRUNK_BYTES,
    width: 1568,
    height: 1176,
    sourceWidth: 2732,
    sourceHeight: 2048,
    format: "jpeg",
  });
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "screenshot-cmd-"));
  vi.mocked(transformImage).mockReset();
  vi.mocked(measureImageBytes).mockReset();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("기본 경로 — 축소가 기본이다 (REQ-IMAGE-001/003/007)", () => {
  it("AC-IMAGE-008/031: base64 모드 응답이 기하 7필드를 싣는다", async () => {
    mockShrink();
    const backend = createMockBackend();

    const result = await runCli(["screenshot"], backend);

    expect(result.ok).toBe(true);
    const data = (result as { data: Record<string, unknown> }).data;
    expect(data.width).toBe(1568);
    expect(data.height).toBe(1176);
    expect(data.deviceWidth).toBe(2732);
    expect(data.deviceHeight).toBe(2048);
    expect(data.scale).toBeCloseTo(2732 / 1568, 10);
    expect(data.format).toBe("jpeg");
    expect(typeof data.capturedAt).toBe("string");
    expect(Date.parse(data.capturedAt as string)).not.toBeNaN();
  });

  it("base64에 실리는 것은 축소된 바이트다 — 원본이 아니다", async () => {
    mockShrink();
    const backend = createMockBackend();

    const result = await runCli(["screenshot"], backend);

    const data = (result as { data: { pngBase64: string } }).data;
    expect(Buffer.from(data.pngBase64, "base64").equals(Buffer.from(SHRUNK_BYTES))).toBe(true);
    expect(Buffer.from(data.pngBase64, "base64").equals(Buffer.from(DEVICE_BYTES))).toBe(false);
  });

  it("상수 모듈의 기본 상한·포맷·품질로 변환을 요청한다", async () => {
    // 숫자를 여기 다시 적지 않는다 — 상수 모듈이 유일한 출처이고, 그 값은
    // M5 실측이 정한다(constants.ts 주석). 손으로 적어두면 상수를 바꿀 때
    // 이 파일이 조용히 낡는다.
    mockShrink();
    const backend = createMockBackend();

    await runCli(["screenshot"], backend);

    expect(transformImage).toHaveBeenCalledWith(DEVICE_BYTES, {
      maxEdge: DEFAULT_MAX_EDGE,
      format: DEFAULT_FORMAT,
      quality: DEFAULT_QUALITY,
    });
  });

  it("AC-IMAGE-009(음성 대조): 기하를 --max-edge에서 역산하지 않는다", async () => {
    // 상한은 1568을 요청했는데 변환기는 1000×750을 냈다고 보고한다.
    // 역산 구현이면 1568이, 관측값 사용 구현이면 1000이 응답에 실린다.
    vi.mocked(transformImage).mockResolvedValue({
      bytes: SHRUNK_BYTES,
      width: 1000,
      height: 750,
      sourceWidth: 2732,
      sourceHeight: 2048,
      format: "jpeg",
    });
    const backend = createMockBackend();

    const result = await runCli(["screenshot", "--max-edge", "1568"], backend);

    const data = (result as { data: Record<string, unknown> }).data;
    expect(data.width).toBe(1000);
    expect(data.scale).toBeCloseTo(2732 / 1000, 10);
  });
});

describe("--out 경로와 사이드카 (REQ-IMAGE-005)", () => {
  it("AC-IMAGE-024: 사이드카가 생성되고 응답 기하와 일치한다", async () => {
    mockShrink();
    const backend = createMockBackend();
    const out = join(root, "shot.jpeg");

    const result = await runCli(["screenshot", "--out", out], backend);

    const data = (result as { data: Record<string, unknown> }).data;
    const sidecar = JSON.parse(await readFile(geometrySidecarPath(out), "utf8")) as Record<string, unknown>;

    expect(sidecar).toEqual({
      width: data.width,
      height: data.height,
      deviceWidth: data.deviceWidth,
      deviceHeight: data.deviceHeight,
      scale: data.scale,
      format: data.format,
      capturedAt: data.capturedAt,
    });
  });

  it("저장된 파일이 축소된 바이트다", async () => {
    mockShrink();
    const backend = createMockBackend();
    const out = join(root, "shot.jpeg");

    await runCli(["screenshot", "--out", out], backend);

    expect((await readFile(out)).equals(Buffer.from(SHRUNK_BYTES))).toBe(true);
  });
});

describe("--full 경로 (REQ-IMAGE-002)", () => {
  it("AC-IMAGE-006: 백엔드가 준 바이트를 그대로 기록한다", async () => {
    vi.mocked(measureImageBytes).mockResolvedValue({ width: 1080, height: 2220 });
    const backend = createMockBackend();
    const out = join(root, "full.png");

    await runCli(["screenshot", "--full", "--out", out], backend);

    expect((await readFile(out)).equals(Buffer.from(DEVICE_BYTES))).toBe(true);
    expect(transformImage).not.toHaveBeenCalled();
  });

  it("AC-IMAGE-007: 응답의 scale이 1.0이고 포맷이 png다", async () => {
    vi.mocked(measureImageBytes).mockResolvedValue({ width: 1080, height: 2220 });
    const backend = createMockBackend();

    const result = await runCli(["screenshot", "--full"], backend);

    const data = (result as { data: Record<string, unknown> }).data;
    expect(data.scale).toBe(1);
    expect(data.format).toBe("png");
    expect(data.width).toBe(1080);
    expect(data.deviceWidth).toBe(1080);
    expect(data.height).toBe(2220);
    expect(data.deviceHeight).toBe(2220);
  });
});

describe("변환 실패 (REQ-IMAGE-008)", () => {
  it("AC-IMAGE-032/033: 실패는 오류로 나가며 원본으로 대체되지 않는다", async () => {
    vi.mocked(transformImage).mockRejectedValue(new ImageTransformError("convert", "sips: Error 4"));
    const backend = createMockBackend();

    const result = await runCli(["screenshot"], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("IMAGE_TRANSFORM_FAILED");
    expect(JSON.stringify(result)).not.toContain(Buffer.from(DEVICE_BYTES).toString("base64"));
  });

  it("AC-IMAGE-033: 변환이 실패하면 --out 파일도 만들어지지 않는다", async () => {
    vi.mocked(transformImage).mockRejectedValue(new ImageTransformError("convert", "sips: Error 4"));
    const backend = createMockBackend();
    const out = join(root, "never.jpeg");

    const result = await runCli(["screenshot", "--out", out], backend);

    expect(result.ok).toBe(false);
    await expect(readFile(out)).rejects.toThrow();
    await expect(readFile(geometrySidecarPath(out))).rejects.toThrow();
  });

  it("AC-IMAGE-034: 오류 메시지가 원인 줄을 보존한다", async () => {
    vi.mocked(transformImage).mockRejectedValue(
      new ImageTransformError("convert", "sips: Error 4: no such file or directory"),
    );
    const backend = createMockBackend();

    const result = await runCli(["screenshot"], backend);

    expect((result as { error: { message: string } }).error.message).toContain(
      "sips: Error 4: no such file or directory",
    );
  });
});

describe("인자 검증은 캡처보다 먼저다", () => {
  it("--max-edge가 잘못되면 캡처를 하지 않는다", async () => {
    const backend = createMockBackend();

    const result = await runCli(["screenshot", "--max-edge", "0"], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("INVALID_MAX_EDGE");
    expect(backend.screenshot).not.toHaveBeenCalled();
  });

  it("--format이 아는 값이 아니면 캡처를 하지 않는다", async () => {
    const backend = createMockBackend();

    const result = await runCli(["screenshot", "--format", "webp"], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("INVALID_FORMAT");
    expect(backend.screenshot).not.toHaveBeenCalled();
  });

  it("--quality가 범위를 벗어나면 캡처를 하지 않는다", async () => {
    const backend = createMockBackend();

    const result = await runCli(["screenshot", "--quality", "101"], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("INVALID_QUALITY");
    expect(backend.screenshot).not.toHaveBeenCalled();
  });
});
