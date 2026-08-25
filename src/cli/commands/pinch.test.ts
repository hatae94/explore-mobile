/**
 * `pinch <in|out> <x> <y> [--amount <ratio>]` 명령 테스트
 * (SPEC-GESTURE-002 M3 — REQ-GEST2-PINCH-001~006;
 *  AC-GEST2-002 · 005 · 006 · 007 · 009 · 013 · 014).
 *
 * `scroll.test.ts`와 **같은 규약**으로 `runCli`를 통해 전체 CLI 디스패치
 * 경로를 mock `DeviceBackend`로 검증한다. mock의 사정거리는 봉투까지이며
 * **화면이 실제로 확대됐는지는 여기서 볼 수 없다**(acceptance.md 원칙 2) —
 * 그 판정은 AC-GEST2-011(M6 실기기 관측)의 몫이다.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { DeviceBackend, DeviceInfo, ScreenSize } from "../../schema/device-backend.js";
import { runCli } from "../router.js";
import { computePinchFingers, pinchTravelPx, pinchValidRatioRange } from "./pinch-geometry.js";

const EVEN: ScreenSize = { width: 1080, height: 2220 };
const ODD_BOTH: ScreenSize = { width: 1081, height: 2221 };

/** 화면 밖 판정이 걸릴 만큼 작은 화면 (AC-GEST2-005). */
const TINY: ScreenSize = { width: 40, height: 40 };

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
 * 의미론에 따라 기본값으로 조용히 대체된다(`scroll.test.ts`가 같은 함정을 적었다).
 */
function createMockBackend(screen: ScreenSize | null = EVEN, thresholdPx = 11): DeviceBackend {
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
      .mockResolvedValue({ minEffectiveSwipePx: thresholdPx, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue(screen ?? undefined),
    pinch: vi.fn().mockResolvedValue(undefined),
    doubleTap: vi.fn().mockResolvedValue(undefined),
  };
}

type Finger = { from: { x: number; y: number }; to: { x: number; y: number } };

function sentFingers(backend: DeviceBackend): [Finger, Finger] {
  const call = (backend.pinch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, [Finger, Finger]];
  return call[1];
}

describe("pinch", () => {
  describe("AC-GEST2-002 — 성공 응답의 방향·좌표 표기 (REQ-GEST2-PINCH-005)", () => {
    it("out: 응답에 방향과 두 손가락의 실제 시작·끝 좌표가 함께 실린다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.5"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { serial: string; direction: string; fingers: [Finger, Finger] };
        expect(data.serial).toBe("R58N90ABCDE");
        expect(data.direction).toBe("out");
        // 손으로 유도한 좌표(pinch-geometry.test.ts의 첫 픽스처와 같은 입력):
        // wideGap 540 · narrowGap 270 → narrow 405/675, wide 270/810.
        expect(data.fingers).toEqual([
          { from: { x: 405, y: 1110 }, to: { x: 270, y: 1110 } },
          { from: { x: 675, y: 1110 }, to: { x: 810, y: 1110 } },
        ]);
      }
      expect(backend.pinch).toHaveBeenCalledTimes(1);
    });

    it("응답 좌표만 보고 벌어졌는지 좁혀졌는지 판정된다 — out은 끝 간격이 시작 간격보다 크다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const { fingers } = result.data as { fingers: [Finger, Finger] };
        expect(fingers[1].to.x - fingers[0].to.x).toBeGreaterThan(fingers[1].from.x - fingers[0].from.x);
      }
    });

    it("in은 끝 간격이 시작 간격보다 작다 — 방향 반전은 오류 없이 조용히 일어나므로 응답이 증언한다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "in", "540", "1110"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { direction: string; fingers: [Finger, Finger] };
        expect(data.direction).toBe("in");
        expect(data.fingers[1].to.x - data.fingers[0].to.x).toBeLessThan(
          data.fingers[1].from.x - data.fingers[0].from.x,
        );
      }
    });

    it("응답의 좌표가 백엔드에 실제로 전달된 좌표와 같다 — 응답이 봉투와 갈라지면 방향 검증이 무의미해진다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const { fingers } = result.data as { fingers: [Finger, Finger] };
        expect(sentFingers(backend)).toEqual(fingers);
      }
    });

    it("네 점의 y가 모두 앵커의 y와 같다 — 가로축 위에 놓인다", async () => {
      const backend = createMockBackend();

      await runCli(["pinch", "out", "540", "1110"], backend);

      for (const finger of sentFingers(backend)) {
        expect(finger.from.y).toBe(1110);
        expect(finger.to.y).toBe(1110);
      }
    });

    it("해석된 serial로 backend.pinch를 정확히 1회 호출한다", async () => {
      const backend = createMockBackend();

      await runCli(["pinch", "out", "540", "1110"], backend);

      const call = (backend.pinch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
      expect(call[0]).toBe("R58N90ABCDE");
      expect(backend.pinch).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST2-005 — 화면 밖 손가락 거부 (REQ-GEST2-PINCH-003)", () => {
    it("가장자리 근접 앵커에서 큰 비율 → PINCH_OUT_OF_BOUNDS, 무제스처, 자르지 않음", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "200", "1110", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PINCH_OUT_OF_BOUNDS");
        expect(result.error.details?.["requestedRatio"]).toBe(1);
      }
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    it("거부 응답에 그 앵커·화면에서 유효한 최대 비율이 실린다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "200", "1110", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.details?.["maxValidRatio"]).toBe("number");
        expect(result.error.details?.["maxValidRatio"] as number).toBeLessThan(1);
      }
    });

    it("왕복 검증 — 되돌려받은 최대 비율을 그대로 다시 넣으면 성공한다", async () => {
      const rejectBackend = createMockBackend();
      const rejected = await runCli(["pinch", "out", "200", "1110", "--amount", "1"], rejectBackend);

      expect(rejected.ok).toBe(false);
      const maxValidRatio = !rejected.ok ? (rejected.error.details?.["maxValidRatio"] as number) : undefined;
      expect(typeof maxValidRatio).toBe("number");

      const acceptBackend = createMockBackend();
      const accepted = await runCli(
        ["pinch", "out", "200", "1110", "--amount", String(maxValidRatio)],
        acceptBackend,
      );

      expect(accepted.ok).toBe(true);
      expect(acceptBackend.pinch).toHaveBeenCalledTimes(1);
    });

    it("유효한 최대 비율이 존재하지 않으면 그 필드를 싣지 않는다 — 없는 값을 지어내지 않는다", async () => {
      // x=1079는 마지막 유효 픽셀이다. 간격이 1px만 되어도 오른쪽이 화면 밖이다.
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "1079", "1110", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PINCH_OUT_OF_BOUNDS");
        expect(Object.hasOwn(result.error.details ?? {}, "maxValidRatio")).toBe(false);
      }
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    /**
     * **SPEC으로 되돌리는 관측** — 유효 구간은 "화면 안"과 "문턱 초과"의 **교집합**이라,
     * 화면에는 들어가지만 그 최대 간격조차 문턱을 못 넘는 앵커에서는 `maxValidRatio`가
     * 사라진다. AC-GEST2-005는 "그런 비율이 존재하지 않으면"의 예로 **앵커가 모서리에
     * 붙은 경우**만 들고 있어 이 갈래를 읽는 사람이 예상하기 어렵다.
     *
     * 구현은 이대로 두는 것이 옳다고 본다 — 되돌려받은 값이 이번에는
     * `AMOUNT_TOO_SMALL`로 거부되는 것이야말로 SPEC-GESTURE-001이 세 번 지운 형태다.
     */
    it("[SPEC 되돌림] 화면에는 들어가지만 문턱을 못 넘는 앵커에서는 maxValidRatio가 빠진다", async () => {
      // 앵커 5 · 문턱 11: 화면 안에 남는 최대 간격은 11px이고 그때 작은 쪽 이동량은 2px다.
      const backend = createMockBackend(EVEN, 11);

      const result = await runCli(["pinch", "out", "5", "1110", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PINCH_OUT_OF_BOUNDS");
        expect(Object.hasOwn(result.error.details ?? {}, "maxValidRatio")).toBe(false);
      }
    });

    it("[SPEC 되돌림 · 양성 대조] 같은 앵커·같은 비율에서 문턱만 1로 낮추면 maxValidRatio가 다시 실린다", async () => {
      const backend = createMockBackend(EVEN, 1);

      const result = await runCli(["pinch", "out", "5", "1110", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PINCH_OUT_OF_BOUNDS");
        expect(typeof result.error.details?.["maxValidRatio"]).toBe("number");
      }
    });

    it("(양성 대조) 같은 화면·같은 앵커에서 범위 안의 비율은 성공하고 조작 호출이 1회 발생한다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "200", "1110", "--amount", "0.3"], backend);

      expect(result.ok).toBe(true);
      expect(backend.pinch).toHaveBeenCalledTimes(1);
    });

    it("자르지 않는다 — 화면 밖 요청이 ok:true로 보고되면 이 AC는 실패다", async () => {
      const backend = createMockBackend(TINY, 1);

      const result = await runCli(["pinch", "out", "1", "20", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PINCH_OUT_OF_BOUNDS");
      expect(backend.pinch).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST2-006 — 문턱 이하 이동 거부 (REQ-GEST2-PINCH-004)", () => {
    it("회귀 픽스처(폭 1080 · r=0.01 · 문턱 2) → 판정 대상은 2이므로 거부된다. 산식(3)을 쓰는 구현은 통과시킨다", async () => {
      const backend = createMockBackend(EVEN, 2);

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    it("(양성 대조) 같은 화면·같은 비율에서 문턱을 1로 낮추면 성공하고 조작 호출이 정확히 1회 발생한다", async () => {
      const backend = createMockBackend(EVEN, 1);

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      expect(result.ok).toBe(true);
      expect(backend.pinch).toHaveBeenCalledTimes(1);
    });

    it("그 회귀 픽스처에서 두 손가락은 실제로 2px·3px 움직인다 — 판정 대상이 작은 쪽임을 명령 계층에서도 확인한다", async () => {
      const backend = createMockBackend(EVEN, 1);

      await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      const [left, right] = sentFingers(backend);
      expect(Math.abs(left.to.x - left.from.x)).toBe(2);
      expect(Math.abs(right.to.x - right.from.x)).toBe(3);
    });

    it("응답 형태가 scroll과 같다 — requestedRatio · minValidRatio · minValidRatioBasis", async () => {
      const backend = createMockBackend(EVEN, 2);

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.details?.["requestedRatio"]).toBe(0.01);
        expect(typeof result.error.details?.["minValidRatio"]).toBe("number");
        expect(result.error.details?.["minValidRatioBasis"]).toBe("measured-constant");
      }
    });

    it("문턱을 device-query로 mock하면 basis가 그대로 실린다 — 되먹일 값의 출처가 사라지면 안 된다", async () => {
      const backend = createMockBackend(EVEN, 2);
      (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockResolvedValue({
        minEffectiveSwipePx: 2,
        basis: "device-query",
      });

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details?.["minValidRatioBasis"]).toBe("device-query");
    });

    it("왕복 검증 — 되돌려받은 최소 비율을 그대로 다시 넣으면 성공한다", async () => {
      const rejectBackend = createMockBackend(EVEN, 40);
      const rejected = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], rejectBackend);

      expect(rejected.ok).toBe(false);
      const minValidRatio = !rejected.ok ? (rejected.error.details?.["minValidRatio"] as number) : undefined;
      expect(typeof minValidRatio).toBe("number");

      const acceptBackend = createMockBackend(EVEN, 40);
      const accepted = await runCli(
        ["pinch", "out", "540", "1110", "--amount", String(minValidRatio)],
        acceptBackend,
      );

      expect(accepted.ok).toBe(true);
      expect(acceptBackend.pinch).toHaveBeenCalledTimes(1);
    });

    it("판정은 초과 비교다 — 이동 거리가 문턱과 정확히 같으면 거부되고, 문턱보다 1 크면 거부되지 않는다", async () => {
      // 손으로 고른 입력: EVEN 1080 · r=0.01 → 두 손가락 2px·3px, 판정 대상 2.
      const equalBackend = createMockBackend(EVEN, 2); // 2 <= 2 → 거부
      const belowBackend = createMockBackend(EVEN, 1); // 2 > 1 → 통과

      const rejected = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], equalBackend);
      const accepted = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], belowBackend);

      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error.code).toBe("AMOUNT_TOO_SMALL");
      expect(accepted.ok).toBe(true);
    });

    it("AMOUNT_TOO_SMALL은 INVALID_AMOUNT와 다른 코드다 — 0.01은 계약 범위(0 초과 1 이하) 안에 있다", async () => {
      const backend = createMockBackend(EVEN, 2);

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).not.toBe("INVALID_AMOUNT");
    });

    it("문턱을 넘는 비율이 아예 없는 화면에서는 권고 필드를 싣지 않는다", async () => {
      const backend = createMockBackend({ width: 12, height: 12 }, 11);

      const result = await runCli(["pinch", "out", "6", "6", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(Object.hasOwn(result.error.details ?? {}, "minValidRatio")).toBe(false);
        expect(Object.hasOwn(result.error.details ?? {}, "minValidRatioBasis")).toBe(false);
      }
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    it("해석된 serial로 getMinEffectiveSwipeThreshold를 정확히 1회 조회한다 — 두 번째 문턱 출처를 만들지 않는다", async () => {
      const backend = createMockBackend();

      await runCli(["pinch", "out", "540", "1110"], backend);

      expect(backend.getMinEffectiveSwipeThreshold).toHaveBeenCalledWith("R58N90ABCDE");
      expect(backend.getMinEffectiveSwipeThreshold).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST2-007 — 잘못된 입력 거부 (REQ-GEST2-PINCH-006)", () => {
    it("pinch sideways 100 200 → INVALID_DIRECTION, 무제스처", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "sideways", "100", "200"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_DIRECTION");
      expect(backend.pinch).not.toHaveBeenCalled();
      expect(backend.listDevices).not.toHaveBeenCalled();
    });

    for (const argv of [
      ["pinch", "out", "100"],
      ["pinch", "out", "1.5", "200"],
      ["pinch", "out", "100", "200", "300"],
      ["pinch", "out"],
    ]) {
      it(`${argv.join(" ")} → INVALID_COORDINATES, 무제스처`, async () => {
        const backend = createMockBackend();

        const result = await runCli(argv, backend);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("INVALID_COORDINATES");
        expect(backend.pinch).not.toHaveBeenCalled();
      });
    }

    for (const invalidAmount of ["0", "1.5", "abc", ""]) {
      it(`--amount ${JSON.stringify(invalidAmount)} → INVALID_AMOUNT, 무제스처`, async () => {
        const backend = createMockBackend();

        const result = await runCli(["pinch", "out", "540", "1110", "--amount", invalidAmount], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_AMOUNT");
          expect(result.error.details?.["received"]).toBe(invalidAmount);
        }
        expect(backend.pinch).not.toHaveBeenCalled();
      });
    }

    for (const argv of [
      ["pinch", "out", "100", "-50"],
      ["pinch", "out", "540", "1110", "--amount", "-0.5"],
      ["pinch", "out", "540", "1110", "--amount"],
    ]) {
      it(`${argv.join(" ")} → INVALID_ARGS(파서 계층), 무제스처`, async () => {
        const backend = createMockBackend();

        const result = await runCli(argv, backend);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
        expect(backend.pinch).not.toHaveBeenCalled();
      });
    }

    it("--amount 0.25는 거부되지 않는다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.25"], backend);

      expect(result.ok).toBe(true);
    });

    it("--amount 1(경계 상한)은 파서에 거부되지 않는다 — INVALID_AMOUNT가 아니다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "1"], backend);

      // 계약 범위(0 초과 1 이하) 안의 값이므로 정적 검증기가 막아서는 안 된다.
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).not.toBe("INVALID_AMOUNT");
    });

    /**
     * **SPEC으로 되돌리는 관측 — AC-GEST2-007의 "`--amount 1`은 거부되지
     * 않는다"는 `pinch`에서 만족될 수 없다.**
     *
     * ①이 `wideGap = round(amount × screen.width)`이므로 `--amount 1`의 간격은
     * 화면 폭과 **정확히 같다.** 그런데 유효 좌표는 `0 .. width−1`(폭 `width−1`)
     * 이므로 그 간격은 **어떤 화면·어떤 앵커에서도** 들어가지 않는다. 아래는
     * 그 사실을 픽스처로 못박은 것이며, 처분은 SPEC 소유자의 판단이다.
     */
    it("[SPEC 되돌림] --amount 1은 어떤 앵커에서도 PINCH_OUT_OF_BOUNDS다 — 간격이 화면 폭과 같기 때문", async () => {
      for (const anchorX of [0, 1, 200, 539, 540, 541, 900, 1079]) {
        const backend = createMockBackend();

        const result = await runCli(["pinch", "out", String(anchorX), "1110", "--amount", "1"], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("PINCH_OUT_OF_BOUNDS");
        expect(backend.pinch).not.toHaveBeenCalled();
      }
    });

    it("[SPEC 되돌림 · 양성 대조] 같은 앵커들에서 --amount 0.3은 전부 성공한다 — 위의 전건 거부가 '테스트가 아무것도 실행하지 않았다'가 아니다", async () => {
      for (const anchorX of [200, 539, 540, 541, 900]) {
        const backend = createMockBackend();

        const result = await runCli(["pinch", "out", String(anchorX), "1110", "--amount", "0.3"], backend);

        expect(result.ok).toBe(true);
        expect(backend.pinch).toHaveBeenCalledTimes(1);
      }
    });

    it("(양성 대조) 같은 테스트 파일에서 유효 입력이 조작 호출 1회를 낸다", async () => {
      const backend = createMockBackend();

      await runCli(["pinch", "out", "540", "1110"], backend);

      expect(backend.pinch).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST2-014 — 화면 크기 불명 (REQ-GEST2-COMMON-003)", () => {
    it("getScreenSize가 undefined면 SCREEN_SIZE_UNKNOWN, 무제스처 — 추측한 크기로 좌표를 만들지 않는다", async () => {
      const backend = createMockBackend(null);

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    it("getScreenSize가 던지면 BACKEND_COMMAND_FAILED — '답하지 못했다'와 '답을 읽을 수 없다'는 다른 사실이다", async () => {
      const backend = createMockBackend();
      (backend.getScreenSize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/device offline/);
      }
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    it("getMinEffectiveSwipeThreshold가 던지면 BACKEND_COMMAND_FAILED, 무제스처", async () => {
      const backend = createMockBackend();
      (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: wm density failed"),
      );

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
      expect(backend.pinch).not.toHaveBeenCalled();
    });

    it("backend.pinch가 던지면 BACKEND_COMMAND_FAILED로 우아하게 저하된다", async () => {
      const backend = createMockBackend();
      (backend.pinch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("iOS backend: connection lost"));

      const result = await runCli(["pinch", "out", "540", "1110"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/connection lost/);
      }
    });
  });

  describe("AC-GEST2-013 — JSON 봉투 (REQ-GEST2-COMMON-005)", () => {
    it("성공·오류 모든 경로에서 JSON.parse 가능한 단일 문서를 방출한다", async () => {
      const backend = createMockBackend();
      const invocations: string[][] = [
        ["pinch", "out", "540", "1110"],
        ["pinch", "in", "540", "1110", "--amount", "0.25"],
        ["pinch", "sideways", "540", "1110"],
        ["pinch", "out", "540"],
        ["pinch", "out", "540", "1110", "--amount", "abc"],
        ["pinch", "out", "540", "1110", "--amount", "-0.5"],
        ["pinch", "out", "5", "1110", "--amount", "1"],
      ];

      for (const argv of invocations) {
        const result = await runCli(argv, backend);
        expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
        expect(typeof result.ok).toBe("boolean");
        expect(result.command).toBe("pinch");
      }
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
      dir = await mkdtemp(join(tmpdir(), "pinch-from-"));
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

    it("--from을 준 앵커가 tap과 정확히 같은 좌표로 변환된다 — 세 명령의 변환이 갈라지면 실패다", async () => {
      const pinchBackend = createMockBackend();
      const tapBackend = createMockBackend();

      await runCli(["pinch", "out", "180", "370", "--from", fresh], pinchBackend);
      await runCli(["tap", "180", "370", "--from", fresh], tapBackend);

      const tapCall = (tapBackend.tap as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number, number];
      const [left, right] = sentFingers(pinchBackend);

      // 앵커는 두 손가락의 중점이 아니라 배치 기준점이다 — y가 변환 결과와
      // 같은지, x가 그 좌우로 놓였는지로 판정한다.
      expect(left.from.y).toBe(tapCall[2]);
      expect(left.from.x).toBeLessThan(tapCall[1]);
      expect(right.from.x).toBeGreaterThan(tapCall[1]);
    });

    it("--from 없이 같은 좌표를 주면 변환 없이 그대로 쓰인다 (기존 계약 무변경)", async () => {
      const backend = createMockBackend();

      // 앵커 x는 기본 비율(0.5, 간격 540)이 화면 안에 들어가는 값을 쓴다 —
      // 이 테스트가 보려는 것은 변환 여부이지 화면 밖 판정이 아니다.
      const result = await runCli(["pinch", "out", "540", "370"], backend);

      expect(result.ok).toBe(true);
      const [left] = sentFingers(backend);
      expect(left.from.y).toBe(370);
      expect(left.from.x).toBe(405); // 손으로 유도: round(540 − 270/2) = 405
    });

    it("--amount는 --from 유무와 무관하게 같은 손가락 간격을 만든다 — 비율은 배율과 무관하다", async () => {
      const withFrom = createMockBackend();
      const withoutFrom = createMockBackend();

      await runCli(["pinch", "out", "180", "370", "--amount", "0.5", "--from", fresh], withFrom);
      await runCli(["pinch", "out", "540", "1110", "--amount", "0.5"], withoutFrom);

      const gap = (fingers: [Finger, Finger], at: "from" | "to"): number => fingers[1][at].x - fingers[0][at].x;

      expect(gap(sentFingers(withFrom), "from")).toBe(gap(sentFingers(withoutFrom), "from"));
      expect(gap(sentFingers(withFrom), "to")).toBe(gap(sentFingers(withoutFrom), "to"));
    });

    it("사이드카가 없으면 거부되고 어떤 백엔드 조작도 호출되지 않는다 — 거부는 백엔드 호출보다 먼저 끝난다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "180", "370", "--from", noSidecar], backend);

      expect(result.ok).toBe(false);
      // 코드까지 단언한다 — `ok:false`만 보면 `UNKNOWN_COMMAND`도 통과한다.
      if (!result.ok) expect(result.error.code).toBe("CAPTURE_GEOMETRY_UNAVAILABLE");
      expect(backend.pinch).not.toHaveBeenCalled();
      expect(backend.getScreenSize).not.toHaveBeenCalled();
      expect(backend.listDevices).not.toHaveBeenCalled();
    });

    it("5분 상한을 넘은 캡처는 거부되고 어떤 백엔드 조작도 호출되지 않는다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "180", "370", "--from", stale], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CAPTURE_STALE");
      expect(backend.pinch).not.toHaveBeenCalled();
      expect(backend.getScreenSize).not.toHaveBeenCalled();
    });

    it("--stale-ok를 주면 신선도 거부만 꺼지고 변환은 그대로 일어난다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["pinch", "out", "180", "370", "--from", stale, "--stale-ok"], backend);

      expect(result.ok).toBe(true);
      const [left] = sentFingers(backend);
      // 배율 3 → y 370이 1110으로 옮겨진다(변환이 살아 있다).
      expect(left.from.y).toBe(1110);
    });

    it("(양성 대조) 같은 mock으로 --from 없는 호출은 백엔드를 정상적으로 호출한다", async () => {
      const backend = createMockBackend();

      await runCli(["pinch", "out", "540", "1110"], backend);

      expect(backend.getScreenSize).toHaveBeenCalledTimes(1);
      expect(backend.pinch).toHaveBeenCalledTimes(1);
    });
  });

  describe("기하 모듈과 명령 계층이 같은 산식을 쓴다 (회귀 가드)", () => {
    it("성공 경로가 보낸 좌표는 computePinchFingers의 출력과 같다", async () => {
      const backend = createMockBackend(ODD_BOTH);

      await runCli(["pinch", "out", "900", "1500", "--amount", "0.25"], backend);

      expect(sentFingers(backend)).toEqual(computePinchFingers("out", 0.25, { x: 900, y: 1500 }, ODD_BOTH));
    });

    it("거부 경로의 minValidRatio는 pinchValidRatioRange가 낸 값이다", async () => {
      const backend = createMockBackend(EVEN, 40);

      const result = await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], backend);

      const expected = pinchValidRatioRange({ x: 540, y: 1110 }, EVEN, 40);
      expect(expected).toBeDefined();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details?.["minValidRatio"]).toBe(expected!.min);
    });

    it("문턱 판정은 pinchTravelPx가 낸 값에 걸린다 — 명령 계층이 자기 산식을 따로 두지 않는다", async () => {
      const travel = pinchTravelPx(0.01, EVEN);
      expect(travel).toBe(2);

      const atThreshold = createMockBackend(EVEN, travel); // travel <= threshold → 거부
      const belowThreshold = createMockBackend(EVEN, travel - 1); // travel > threshold → 통과

      expect((await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], atThreshold)).ok).toBe(false);
      expect((await runCli(["pinch", "out", "540", "1110", "--amount", "0.01"], belowThreshold)).ok).toBe(true);
    });
  });
});
