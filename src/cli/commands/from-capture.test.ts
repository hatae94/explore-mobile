/**
 * `--from` 좌표 변환 배선 검사 (SPEC-IMAGE-001 M4 — AC-IMAGE-019, 023,
 * 025~029, 035).
 *
 * **판정하는 것**: 변환된 좌표가 백엔드에 그대로 도달하는가, `--from` 없는
 * 호출이 이 SPEC 이전과 같이 동작하는가, 사이드카 부재·손상·낡음이 **백엔드
 * 조작 호출 0회**로 거부되는가.
 *
 * **판정하지 못하는 것**: 변환된 좌표가 실기기에서 의도한 요소를 누르는가.
 * 산술이 맞아도 배율 자체가 틀렸을 수 있다 — 그래서 acceptance.md는 양성
 * 대조(AC-IMAGE-017)를 함께 요구한다. 검사가 변환을 실제로 타는지는 일부러
 * 틀린 배율로 빗나감을 확인해야만 알 수 있고, 그것은 D 등급이다.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { geometrySidecarPath, type CaptureGeometry } from "../../image/geometry.js";
import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { runCli } from "../router.js";

/** iPad 2732×2048 → 1024×768. scale = 2732/1024 = 2.66796875. */
const IPAD_1024: CaptureGeometry = {
  width: 1024,
  height: 768,
  deviceWidth: 2732,
  deviceHeight: 2048,
  scale: 2732 / 1024,
  format: "jpeg",
  capturedAt: new Date().toISOString(),
};

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

function createMockBackend(): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue([device()]),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 2732, height: 2048 }),
    pinch: vi.fn().mockResolvedValue(undefined),
    doubleTap: vi.fn().mockResolvedValue(undefined),
  };
}

let root: string;
let capture: string;

/** 캡처 파일과 사이드카를 만든다. `geometry`를 주면 그 값으로 기록한다. */
async function makeCapture(geometry: CaptureGeometry = IPAD_1024): Promise<string> {
  const path = join(root, "shot.jpeg");
  await writeFile(path, Buffer.from("fake-image"));
  await writeFile(geometrySidecarPath(path), JSON.stringify(geometry));
  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "from-capture-"));
  capture = join(root, "shot.jpeg");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tap --from (REQ-IMAGE-004)", () => {
  it("이미지 좌표를 기기 좌표로 되돌려 백엔드에 넘긴다", async () => {
    await makeCapture();
    const backend = createMockBackend();

    // 512 × 2.66796875 = 1366.016 → 1366
    // 384 × 2.66796875 = 1024.5    → 1025
    const result = await runCli(["tap", "512", "384", "--from", capture], backend);

    expect(result.ok).toBe(true);
    expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 1366, 1025);
  });

  it("응답이 실제로 보낸 기기 좌표를 되돌려준다 — 이미지 좌표가 아니다", async () => {
    await makeCapture();
    const backend = createMockBackend();

    const result = await runCli(["tap", "512", "384", "--from", capture], backend);

    expect((result as { data: { x: number; y: number } }).data).toEqual({
      serial: "R58N90ABCDE",
      x: 1366,
      y: 1025,
    });
  });

  it("AC-IMAGE-019(회귀): --from 없는 tap은 좌표를 그대로 넘긴다", async () => {
    const backend = createMockBackend();

    const result = await runCli(["tap", "512", "384"], backend);

    expect(result.ok).toBe(true);
    expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 512, 384);
  });
});

describe("거부 경로는 조작보다 먼저다 (REQ-IMAGE-005/006)", () => {
  it("AC-IMAGE-025: 사이드카가 없으면 거부하고 백엔드 조작을 하지 않는다", async () => {
    await writeFile(capture, Buffer.from("fake-image")); // 사이드카 없음
    const backend = createMockBackend();

    const result = await runCli(["tap", "10", "10", "--from", capture], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("CAPTURE_GEOMETRY_UNAVAILABLE");
    expect(backend.tap).not.toHaveBeenCalled();
  });

  it("AC-IMAGE-026: 비-JSON 사이드카를 임의 해석하지 않는다", async () => {
    await writeFile(capture, Buffer.from("fake-image"));
    await writeFile(geometrySidecarPath(capture), "definitely not json");
    const backend = createMockBackend();

    const result = await runCli(["tap", "10", "10", "--from", capture], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("CAPTURE_GEOMETRY_UNAVAILABLE");
    expect(backend.tap).not.toHaveBeenCalled();
  });

  it("AC-IMAGE-026: 필드가 빠진 사이드카를 배율 1.0으로 대체하지 않는다", async () => {
    await writeFile(capture, Buffer.from("fake-image"));
    await writeFile(geometrySidecarPath(capture), JSON.stringify({ width: 1024, height: 768 }));
    const backend = createMockBackend();

    const result = await runCli(["tap", "10", "10", "--from", capture], backend);

    expect(result.ok).toBe(false);
    // 조용한 1.0 대체가 있었다면 성공하며 (10,10)이 그대로 전달됐을 것이다.
    expect(backend.tap).not.toHaveBeenCalled();
  });

  it("AC-IMAGE-027/028: 낡은 캡처는 거부되고 메시지가 시각과 경과를 밝힌다", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10분 전
    await makeCapture({ ...IPAD_1024, capturedAt: old });
    const backend = createMockBackend();

    const result = await runCli(["tap", "10", "10", "--from", capture], backend);

    expect(result.ok).toBe(false);
    const error = (result as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("CAPTURE_STALE");
    expect(error.message).toContain(old);
    expect(error.message).toMatch(/60\d초|\d+초/);
    expect(backend.tap).not.toHaveBeenCalled();
  });

  it("AC-IMAGE-029: --stale-ok를 주면 낡은 캡처로도 진행한다", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await makeCapture({ ...IPAD_1024, capturedAt: old });
    const backend = createMockBackend();

    const result = await runCli(["tap", "512", "384", "--from", capture, "--stale-ok"], backend);

    expect(result.ok).toBe(true);
    expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 1366, 1025);
  });
});

describe("AC-IMAGE-023 — swipe / scroll도 같은 처리를 받는다", () => {
  it("swipe --from은 네 좌표를 모두 변환한다", async () => {
    await makeCapture();
    const backend = createMockBackend();

    // 100 × 2.66796875 = 266.796... → 267
    // 700 × 2.66796875 = 1867.578... → 1868
    // 100 → 267, 200 × 2.66796875 = 533.59375 → 534
    const result = await runCli(["swipe", "100", "700", "100", "200", "--from", capture], backend);

    expect(result.ok).toBe(true);
    expect(backend.swipe).toHaveBeenCalledWith("R58N90ABCDE", { x: 267, y: 1868 }, { x: 267, y: 534 }, undefined);
  });

  it("swipe --from의 낡은 캡처는 제스처를 보내지 않고 거부된다", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await makeCapture({ ...IPAD_1024, capturedAt: old });
    const backend = createMockBackend();

    const result = await runCli(["swipe", "1", "2", "3", "4", "--from", capture], backend);

    expect(result.ok).toBe(false);
    expect(backend.swipe).not.toHaveBeenCalled();
  });

  it("scroll --from은 좌표를 바꾸지 않는다 — scroll의 좌표는 이미 기기 공간이다", async () => {
    await makeCapture();
    const backend = createMockBackend();

    const withFrom = await runCli(["scroll", "down", "--from", capture], backend);
    const swipeWithFrom = vi.mocked(backend.swipe).mock.calls[0];

    vi.mocked(backend.swipe).mockClear();
    const withoutFrom = await runCli(["scroll", "down"], backend);
    const swipeWithoutFrom = vi.mocked(backend.swipe).mock.calls[0];

    expect(withFrom.ok).toBe(true);
    expect(withoutFrom.ok).toBe(true);
    expect(swipeWithFrom).toEqual(swipeWithoutFrom);
  });

  it("scroll --from도 낡은 캡처를 거부한다 — 화면이 이미 바뀌었을 수 있다", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await makeCapture({ ...IPAD_1024, capturedAt: old });
    const backend = createMockBackend();

    const result = await runCli(["scroll", "down", "--from", capture], backend);

    expect(result.ok).toBe(false);
    expect((result as { error: { code: string } }).error.code).toBe("CAPTURE_STALE");
    expect(backend.swipe).not.toHaveBeenCalled();
  });
});

describe("AC-IMAGE-035 — 제거된 플래그는 여전히 거부된다", () => {
  it.each([["--id"], ["--text"], ["--web"], ["--page"], ["--index"]])(
    "tap %s는 INVALID_ARGS로 거부된다",
    async (flag) => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "10", "10", flag, "x"], backend);

      expect(result.ok).toBe(false);
      expect((result as { error: { code: string } }).error.code).toBe("INVALID_ARGS");
      expect(backend.tap).not.toHaveBeenCalled();
    },
  );
});
