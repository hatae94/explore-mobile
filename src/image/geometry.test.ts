/**
 * 좌표 변환 산술 + 사이드카 검사 (SPEC-IMAGE-001 M2 — AC-IMAGE-010~012,
 * 024~029).
 *
 * **판정하는 것**: 배율·반올림 경계에서 변환 함수가 기대값을 내는가, 결과가
 * 기기 해상도를 넘지 않는가, 사이드카 부재·손상·낡음이 **거부**되는가.
 *
 * **판정하지 못하는 것**: 변환된 좌표가 실제 기기에서 의도한 요소를 누르는가.
 * 산술이 맞아도 화면이 그 사이 바뀌었을 수 있고, 배율 자체가 틀렸을 수도 있다
 * — 그것은 D 등급 AC-IMAGE-013~015와 양성 대조 AC-IMAGE-017이 닫는다.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CaptureGeometryUnavailableError, CaptureStaleError } from "./image-errors.js";
import {
  assertCaptureFresh,
  geometrySidecarPath,
  readCaptureGeometry,
  roundingResidual,
  toDeviceCoordinate,
  writeCaptureGeometry,
  type CaptureGeometry,
} from "./geometry.js";

/** `--full` 경로: 배율 1.0, 항등 변환이어야 한다. */
const IDENTITY: CaptureGeometry = {
  width: 1080,
  height: 2220,
  deviceWidth: 1080,
  deviceHeight: 2220,
  scale: 1,
  format: "png",
  capturedAt: "2026-08-10T10:00:00.000Z",
};

/** iPad 2732×2048 → 1024×768. scale = 2732/1024 = 2.66796875 (spec.md 예시 배율). */
const IPAD_1024: CaptureGeometry = {
  width: 1024,
  height: 768,
  deviceWidth: 2732,
  deviceHeight: 2048,
  scale: 2732 / 1024,
  format: "jpeg",
  capturedAt: "2026-08-10T10:00:00.000Z",
};

/** 비정수 나머지 케이스. scale = 2732/1930 = 1.41554... (spec.md 예시 배율). */
const IPAD_1930: CaptureGeometry = {
  width: 1930,
  height: 1447,
  deviceWidth: 2732,
  deviceHeight: 2048,
  scale: 2732 / 1930,
  format: "jpeg",
  capturedAt: "2026-08-10T10:00:00.000Z",
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "image-geometry-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("toDeviceCoordinate — AC-IMAGE-010 (배율·반올림 경계 표)", () => {
  it("scale 1.0은 항등 변환이다 (--full 경로)", () => {
    expect(toDeviceCoordinate(IDENTITY, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(toDeviceCoordinate(IDENTITY, 540, 1110)).toEqual({ x: 540, y: 1110 });
    expect(toDeviceCoordinate(IDENTITY, 1079, 2219)).toEqual({ x: 1079, y: 2219 });
  });

  it("좌표 0은 어떤 배율에서도 0이다", () => {
    expect(toDeviceCoordinate(IPAD_1024, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(toDeviceCoordinate(IPAD_1930, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("scale 2.66796875 — 중앙과 우하단 경계", () => {
    // 512 × 2.66796875 = 1366.016 → 1366
    // 384 × 2.66796875 = 1024.5    → 1025 (JS Math.round는 .5를 위로 올린다)
    expect(toDeviceCoordinate(IPAD_1024, 512, 384)).toEqual({ x: 1366, y: 1025 });
    // 1023 × 2.66796875 = 2729.332... → 2729
    //  767 × 2.66796875 = 2046.332... → 2046
    expect(toDeviceCoordinate(IPAD_1024, 1023, 767)).toEqual({ x: 2729, y: 2046 });
  });

  it("scale 1.41554... — 비정수 나머지에서도 경계를 넘지 않는다", () => {
    // 1929 × (2732/1930) = 2730.584... → 2731 (= deviceWidth - 1)
    // 1446 × (2732/1930) = 2046.876... → 2047 (= deviceHeight - 1)
    expect(toDeviceCoordinate(IPAD_1930, 1929, 1446)).toEqual({ x: 2731, y: 2047 });
  });
});

describe("toDeviceCoordinate — AC-IMAGE-011 (기기 해상도 경계)", () => {
  it("이미지 범위를 벗어난 좌표도 기기 해상도-1을 넘지 않는다", () => {
    // 1024 × 2.66796875 = 2732 (deviceWidth와 같음) → 2731로 잘린다
    //  768 × 2.66796875 = 2049 (deviceHeight 초과)  → 2047로 잘린다
    expect(toDeviceCoordinate(IPAD_1024, 1024, 768)).toEqual({ x: 2731, y: 2047 });
  });

  it("모든 배율 케이스에서 결과가 [0, device-1] 안에 있다", () => {
    for (const g of [IDENTITY, IPAD_1024, IPAD_1930]) {
      for (const [x, y] of [
        [0, 0],
        [g.width - 1, g.height - 1],
        [g.width * 2, g.height * 2],
      ] as const) {
        const p = toDeviceCoordinate(g, x, y);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(g.deviceWidth - 1);
        expect(p.y).toBeLessThanOrEqual(g.deviceHeight - 1);
      }
    }
  });
});

describe("roundingResidual — AC-IMAGE-012 (관측 기록, 임계 판정 아님)", () => {
  it("자르지 않은 좌표의 잔차는 반올림 한계인 0.5 이하다", () => {
    const cases = [
      { g: IPAD_1024, x: 512, y: 384 },
      { g: IPAD_1024, x: 1023, y: 767 },
      { g: IPAD_1930, x: 1929, y: 1446 },
    ];
    for (const c of cases) {
      const r = roundingResidual(c.g, c.x, c.y);
      expect(r.x).toBeLessThanOrEqual(0.5);
      expect(r.y).toBeLessThanOrEqual(0.5);
    }
  });

  it("자른 좌표는 잔차가 0.5를 넘을 수 있다 — 그 사실을 감추지 않는다", () => {
    // 768 × 2.66796875 = 2049 → 2047로 잘리므로 잔차는 2다.
    const r = roundingResidual(IPAD_1024, 1024, 768);
    expect(r.y).toBeCloseTo(2, 6);
  });
});

describe("사이드카 — AC-IMAGE-024/025/026", () => {
  it("AC-IMAGE-024: 기록한 기하를 그대로 되읽는다", async () => {
    const capture = join(root, "shot.jpeg");
    await writeFile(capture, Buffer.from("fake"));
    await writeCaptureGeometry(capture, IPAD_1024);

    expect(geometrySidecarPath(capture)).toBe(`${capture}.geometry.json`);
    await expect(readCaptureGeometry(capture)).resolves.toEqual(IPAD_1024);
  });

  it("AC-IMAGE-025: 사이드카가 없으면 거부한다", async () => {
    const capture = join(root, "orphan.jpeg");
    await writeFile(capture, Buffer.from("fake"));

    await expect(readCaptureGeometry(capture)).rejects.toBeInstanceOf(CaptureGeometryUnavailableError);
  });

  it("AC-IMAGE-026: 비-JSON 사이드카를 임의 해석하지 않는다", async () => {
    const capture = join(root, "broken.jpeg");
    await writeFile(capture, Buffer.from("fake"));
    await writeFile(geometrySidecarPath(capture), "not json at all");

    await expect(readCaptureGeometry(capture)).rejects.toBeInstanceOf(CaptureGeometryUnavailableError);
  });

  it("AC-IMAGE-026: 필드가 빠진 사이드카를 배율 1.0으로 대체하지 않는다", async () => {
    const capture = join(root, "partial.jpeg");
    await writeFile(capture, Buffer.from("fake"));
    await writeFile(
      geometrySidecarPath(capture),
      JSON.stringify({ width: 1024, height: 768, capturedAt: "2026-08-10T10:00:00.000Z" }),
    );

    const err = await readCaptureGeometry(capture).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CaptureGeometryUnavailableError);
    // 조용한 1.0 대체가 없음을 함께 확인한다 — 결과가 기하 객체이면 안 된다.
    expect(err).not.toHaveProperty("scale");
  });

  it("비균등 축소(가로·세로 배율 불일치)를 거부한다", async () => {
    const capture = join(root, "squashed.jpeg");
    await writeFile(capture, Buffer.from("fake"));
    await writeCaptureGeometry(capture, {
      // 가로는 2배, 세로는 4배로 줄어든 상태 — 한쪽 배율만 쓰면 조용히 어긋난다.
      width: 1000,
      height: 500,
      deviceWidth: 2000,
      deviceHeight: 2000,
      scale: 2,
      format: "jpeg",
      capturedAt: "2026-08-10T10:00:00.000Z",
    });

    await expect(readCaptureGeometry(capture)).rejects.toBeInstanceOf(CaptureGeometryUnavailableError);
  });
});

describe("신선도 — AC-IMAGE-027/028/029", () => {
  const capturedAt = "2026-08-10T10:00:00.000Z";
  const fresh: CaptureGeometry = { ...IPAD_1024, capturedAt };
  const staleMs = 60_000;

  it("AC-IMAGE-027: 상한을 넘긴 캡처는 거부된다", () => {
    const now = new Date("2026-08-10T10:02:00.000Z"); // 120초 경과
    expect(() => assertCaptureFresh(fresh, { now, staleMs, staleOk: false })).toThrow(CaptureStaleError);
  });

  it("상한 이내면 통과한다", () => {
    const now = new Date("2026-08-10T10:00:30.000Z"); // 30초 경과
    expect(() => assertCaptureFresh(fresh, { now, staleMs, staleOk: false })).not.toThrow();
  });

  it("AC-IMAGE-028: 오류 메시지가 캡처 시각과 경과 시간을 밝힌다", () => {
    const now = new Date("2026-08-10T10:02:00.000Z");
    const err = (() => {
      try {
        assertCaptureFresh(fresh, { now, staleMs, staleOk: false });
        return undefined;
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(err).toBeInstanceOf(CaptureStaleError);
    const message = (err as CaptureStaleError).message;
    expect(message).toContain(capturedAt);
    expect(message).toContain("120");
  });

  it("AC-IMAGE-029: --stale-ok를 주면 거부하지 않는다", () => {
    const now = new Date("2026-08-10T11:00:00.000Z"); // 1시간 경과
    expect(() => assertCaptureFresh(fresh, { now, staleMs, staleOk: true })).not.toThrow();
  });

  it("읽을 수 없는 capturedAt은 신선하다고 가정하지 않는다", () => {
    const broken: CaptureGeometry = { ...IPAD_1024, capturedAt: "언젠가" };
    expect(() => assertCaptureFresh(broken, { now: new Date(), staleMs, staleOk: false })).toThrow(
      CaptureStaleError,
    );
  });
});
