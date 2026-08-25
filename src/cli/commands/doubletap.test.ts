/**
 * `doubletap <x> <y>` 명령 테스트
 * (SPEC-GESTURE-002 M4 — REQ-GEST2-DTAP-001 · 004, REQ-GEST2-COMMON-001 · 002;
 *  AC-GEST2-007 · 008 · 009 · 013 · 014).
 *
 * `pinch.test.ts`와 **같은 규약**으로 `runCli`를 통해 전체 CLI 디스패치 경로를
 * mock `DeviceBackend`로 검증한다. mock의 사정거리는 **백엔드에 무엇이
 * 전달됐는가**까지이며 **더블탭으로 인식됐는지는 여기서 볼 수 없다**
 * (acceptance.md 원칙 2) — 그 판정은 AC-GEST2-012(M6 실기기 관측)의 몫이다.
 *
 * **간격에 대한 단언을 여기에 두지 않는다.** 두 탭 사이 간격은 봉투 계층의
 * 상수(`DOUBLE_TAP_GAP_MS`)이고 그 구조 검사는 `wda-backend.test.ts`가 이미
 * 진다(AC-GEST2-004). 특히 "간격이 짧으면 인식되지 않는다" 계열의 단언은
 * 쓰지 않는다 — 그 주장은 `pointerMove`에서 반증됐고 `pause`에서는 애초에
 * 측정된 적이 없다(spec.md §C.1-⑪).
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { UnsupportedGestureOnAndroidError } from "../../backend/gesture-errors.js";
import type { DeviceBackend, DeviceInfo, ScreenSize } from "../../schema/device-backend.js";
import { runCli } from "../router.js";

const EVEN: ScreenSize = { width: 1080, height: 2220 };

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

/**
 * `null`은 "화면 크기 불명"을 뜻한다 — `undefined`를 넘기면 JS 기본 파라미터
 * 의미론에 따라 기본값으로 조용히 대체된다(`pinch.test.ts`가 같은 함정을 적었다).
 */
function createMockBackend(screen: ScreenSize | null = EVEN): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue([device()]),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi
      .fn()
      .mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue(screen ?? undefined),
    pinch: vi.fn().mockResolvedValue(undefined),
    doubleTap: vi.fn().mockResolvedValue(undefined),
  };
}

/** `doubleTap`에 실제로 전달된 `(serial, x, y)`. */
function sentTap(backend: DeviceBackend): [string, number, number] {
  return (backend.doubleTap as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number, number];
}

describe("doubletap", () => {
  describe("성공 경로 (REQ-GEST2-DTAP-001, AC-GEST2-013)", () => {
    it("좌표를 그대로 백엔드에 전달하고 한 요청으로 끝난다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "100", "200"], backend);

      expect(result.ok).toBe(true);
      expect(backend.doubleTap).toHaveBeenCalledTimes(1);
      expect(sentTap(backend)).toEqual(["R58N90ABCDE", 100, 200]);
    });

    it("성공 페이로드는 tap과 같은 형태다 — { serial, x, y }", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "100", "200"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ serial: "R58N90ABCDE", x: 100, y: 200 });
        // 키 집합까지 고정한다 — 필드가 하나 늘거나 줄면 여기서 갈린다.
        expect(Object.keys(result.data as object).sort()).toEqual(["serial", "x", "y"]);
      }
    });

    it("명령 이름은 한 단어 `doubletap`이다 — `double-tap`은 알려진 명령이 아니다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["double-tap", "100", "200"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNKNOWN_COMMAND");
      expect(backend.doubleTap).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST2-014 — 화면 크기를 쓰지 않는다 (REQ-GEST2-COMMON-003)", () => {
    it("화면 크기가 불명인 mock에서도 정상 동작한다 — 조회 자체를 하지 않는다", async () => {
      const backend = createMockBackend(null);

      const result = await runCli(["doubletap", "100", "200"], backend);

      expect(result.ok).toBe(true);
      expect(backend.getScreenSize).not.toHaveBeenCalled();
      expect(backend.doubleTap).toHaveBeenCalledTimes(1);
    });

    it("문턱도 조회하지 않는다 — 쓰지 않는 값을 조회하면 tap보다 느려질 이유가 없는 명령이 느려진다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "100", "200"], backend);

      // **0회를 부재의 증거로 쓰기 전에 명령이 실제로 실행됐음을 세운다**
      // (acceptance.md 원칙 3). 이 두 줄이 없으면 명령이 존재하지 않아
      // 아무것도 호출되지 않는 상태에서도 아래 0회가 통과한다.
      expect(result.ok).toBe(true);
      expect(backend.doubleTap).toHaveBeenCalledTimes(1);
      expect(backend.getMinEffectiveSwipeThreshold).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST2-007 — 잘못된 입력 거부 (REQ-GEST2-DTAP-004)", () => {
    it.each([
      ["좌표가 하나뿐", ["doubletap", "100"]],
      ["좌표가 정수가 아님", ["doubletap", "1.5", "200"]],
      ["좌표가 아예 없음", ["doubletap"]],
      ["좌표가 숫자가 아님", ["doubletap", "abc", "200"]],
    ])("%s → INVALID_COORDINATES이고 어떤 제스처도 전송되지 않는다", async (_label, argv) => {
      const backend = createMockBackend();

      const result = await runCli(argv, backend);

      expect(result.ok).toBe(false);
      // 코드까지 단언한다 — `ok:false`만 보면 `UNKNOWN_COMMAND`도 통과한다.
      if (!result.ok) expect(result.error.code).toBe("INVALID_COORDINATES");
      expect(backend.doubleTap).not.toHaveBeenCalled();
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("음수 리터럴은 parseArgs 계층이 INVALID_ARGS로 거부한다 — tap과 같은 두 계층 구조", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "100", "-50"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.doubleTap).not.toHaveBeenCalled();
    });

    it("(양성 대조) 같은 mock에서 유효한 입력은 조작 호출 1회를 낸다", async () => {
      const backend = createMockBackend();

      await runCli(["doubletap", "100", "200"], backend);

      expect(backend.doubleTap).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST2-008 — Android 거부 코드가 호출자에게 그대로 닿는다 (REQ-GEST2-COMMON-002)", () => {
    it("UNSUPPORTED_GESTURE_ON_ANDROID가 BACKEND_COMMAND_FAILED 뒤에 가려지지 않는다", async () => {
      const backend = createMockBackend();
      (backend.doubleTap as ReturnType<typeof vi.fn>).mockRejectedValue(
        new UnsupportedGestureOnAndroidError("`input` 호출당 약 400 ms가 인식 창을 넘는다."),
      );

      const result = await runCli(["doubletap", "100", "200"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_GESTURE_ON_ANDROID");
        expect(result.error.message).toMatch(/input/);
      }
    });

    it("pinch도 같은 코드를 그대로 노출한다 — 두 명령이 한 배선을 공유한다", async () => {
      const backend = createMockBackend();
      (backend.pinch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new UnsupportedGestureOnAndroidError("SELinux가 입력 장치 직접 쓰기를 거부한다."),
      );

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_GESTURE_ON_ANDROID");
    });

    it("(양성 대조) 타입 없는 실패는 여전히 BACKEND_COMMAND_FAILED로 가려진다", async () => {
      const backend = createMockBackend();
      (backend.doubleTap as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("무언가 실패"));

      const result = await runCli(["doubletap", "100", "200"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });
  });

  describe("AC-GEST2-009 — --from 좌표 변환과 신선도 (REQ-GEST2-COMMON-001)", () => {
    let dir: string;
    let fresh: string;
    let stale: string;
    let noSidecar: string;

    /** 사이드카 형태는 `from-capture.test.ts`가 쓰는 것과 같다 — 새 계약을 만들지 않는다. */
    async function writeCapture(path: string, capturedAt: Date): Promise<void> {
      await writeFile(path, "not-a-real-image");
      await writeFile(
        `${path}.geometry.json`,
        JSON.stringify({
          width: 360,
          height: 740,
          deviceWidth: 1080,
          deviceHeight: 2220,
          scale: 3,
          format: "jpeg",
          capturedAt: capturedAt.toISOString(),
        }),
      );
    }

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), "doubletap-from-"));
      fresh = join(dir, "fresh.jpg");
      stale = join(dir, "stale.jpg");
      noSidecar = join(dir, "bare.jpg");
      await writeCapture(fresh, new Date());
      await writeCapture(stale, new Date(Date.now() - 60 * 60 * 1000));
      await writeFile(noSidecar, "not-a-real-image");
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("--from을 준 좌표가 tap과 정확히 같은 좌표로 변환된다 — 두 명령의 변환이 갈라지면 실패다", async () => {
      const doubleTapBackend = createMockBackend();
      const tapBackend = createMockBackend();

      await runCli(["doubletap", "180", "370", "--from", fresh], doubleTapBackend);
      await runCli(["tap", "180", "370", "--from", fresh], tapBackend);

      const tapCall = (tapBackend.tap as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number, number];
      expect(sentTap(doubleTapBackend)).toEqual(tapCall);
      // 변환이 실제로 일어났음을 함께 고정한다 — 두 명령이 나란히 항등이어도
      // 위 단언은 통과하므로, 그것만으로는 "변환이 같다"의 증거가 되지 못한다.
      expect(tapCall).toEqual(["R58N90ABCDE", 540, 1110]); // 배율 3
    });

    it("--from 없이 같은 좌표를 주면 변환 없이 그대로 전달된다 (기존 계약 무변경)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "180", "370"], backend);

      expect(result.ok).toBe(true);
      expect(sentTap(backend)).toEqual(["R58N90ABCDE", 180, 370]);
    });

    it("사이드카가 없으면 거부되고 어떤 백엔드 조작도 호출되지 않는다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "180", "370", "--from", noSidecar], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CAPTURE_GEOMETRY_UNAVAILABLE");
      expect(backend.doubleTap).not.toHaveBeenCalled();
      expect(backend.listDevices).not.toHaveBeenCalled();
    });

    it("5분 상한을 넘은 캡처는 거부되고 어떤 백엔드 조작도 호출되지 않는다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "180", "370", "--from", stale], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CAPTURE_STALE");
      expect(backend.doubleTap).not.toHaveBeenCalled();
    });

    it("--stale-ok를 주면 신선도 거부만 꺼지고 변환은 그대로 일어난다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doubletap", "180", "370", "--from", stale, "--stale-ok"], backend);

      expect(result.ok).toBe(true);
      expect(sentTap(backend)).toEqual(["R58N90ABCDE", 540, 1110]);
    });

    it("(양성 대조) 같은 mock으로 --from 없는 호출은 백엔드를 정상적으로 호출한다", async () => {
      const backend = createMockBackend();

      await runCli(["doubletap", "180", "370"], backend);

      expect(backend.doubleTap).toHaveBeenCalledTimes(1);
    });
  });
});
