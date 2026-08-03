/**
 * `scroll <up|down|left|right> [--amount <ratio>]` 명령 테스트
 * (SPEC-GESTURE-001 M3 — REQ-GEST-SCROLL-001~006; AC-GEST-007~010,
 * AC-GEST-015~017).
 *
 * `swipe.test.ts`와 동일한 규약으로 `runCli`를 통해 전체 CLI 디스패치
 * 경로를 mock `DeviceBackend`로 검증한다.
 */

import { describe, expect, it, vi } from "vitest";
import type { CommonElement } from "../../schema/common-element.js";
import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { runCli } from "../router.js";
import { deriveScreenSize, minNonDegenerateRatio } from "./scroll-geometry.js";

/**
 * `minNonDegenerateRatio()`가 M10/0.8.0 amendment로 `number | undefined`를
 * 반환하게 되면서(AC-GEST-034), 이미 비퇴화 경계가 존재함을 아는(402x874
 * 화면, 독립 유도 문턱) 아래 왕복 테스트의 호출부 타입을 좁힌다.
 */
function assertDefined(value: number | undefined): number {
  if (value === undefined) {
    throw new Error("expected minNonDegenerateRatio() to return a number, got undefined");
  }
  return value;
}

/**
 * 독립적으로 유도한(즉 `minNonDegenerateRatio()`를 호출하지 않은) 402x874
 * 화면·방향별 경계 픽스처(SPEC-GESTURE-001 M7/0.5.0 amendment, C-5).
 *
 * `minNonDegenerateRatio()`가 계산한 값을 그대로 되먹여 "성공했다"고
 * 단언하는 이전 테스트는 동어반복이었다 — `minNonDegenerateRatio`와
 * `scroll.ts`의 거부 판정이 같은 `isDegenerateSwipe`를 공유하므로, 그
 * 술어가 무엇이든(심지어 틀렸어도) 함수 자신의 출력을 다시 넣으면 항상
 * "성공"으로 보인다(spec.md 0.5.0 §Amendments, B.7). 아래 값은
 * `computeScrollSwipe`를 **직접** 호출해 반올림된 좌표를 관찰하고 손으로
 * 거리(10 vs 12)를 계산해 얻었다 — MIN_EFFECTIVE_SWIPE_PX(11)를 넘는지
 * 아닌지를 독립적으로 판정한다.
 */
const BOUNDARY_FIXTURES_402X874: Record<
  "up" | "down" | "left" | "right",
  {
    rejectRatio: string;
    rejectDistance: number;
    acceptRatio: string;
    acceptFrom: number;
    acceptTo: number;
  }
> = {
  up: { rejectRatio: "0.0135", rejectDistance: 10, acceptRatio: "0.014", acceptFrom: 431, acceptTo: 443 },
  down: { rejectRatio: "0.0135", rejectDistance: 10, acceptRatio: "0.014", acceptFrom: 443, acceptTo: 431 },
  left: { rejectRatio: "0.030", rejectDistance: 10, acceptRatio: "0.0305", acceptFrom: 195, acceptTo: 207 },
  right: { rejectRatio: "0.030", rejectDistance: 10, acceptRatio: "0.0305", acceptFrom: 207, acceptTo: 195 },
};

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R58N90ABCDE",
    model: "Pixel_7",
    osVersion: "14",
    connectionState: "device",
    isEmulator: false,
    platform: "android",
    ...overrides,
  };
}

function element(overrides: Partial<CommonElement> = {}): CommonElement {
  return {
    role: "Other",
    text: "",
    id: "",
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    tappable: false,
    enabled: true,
    children: [],
    ...overrides,
  };
}

/** 알려진 400x800 화면 하나로 이루어진 dump 결과 (witness == 유일한 최상위 요소). */
const KNOWN_SCREEN_400X800: CommonElement[] = [element({ bounds: { x: 0, y: 0, w: 400, h: 800 } })];

/** AC-GEST-008 — 최상위 3개, 인덱스 0은 화면 전체가 아님, 인덱스 1이 witness. */
const MULTI_ROOT_WITH_WITNESS: CommonElement[] = [
  element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }),
  element({ bounds: { x: 0, y: 0, w: 402, h: 874 } }),
  element({ bounds: { x: 0, y: 800, w: 402, h: 74 } }),
];

/** AC-GEST-017 — Safari 크롬-only, witness 없음 (402x120 후보는 비퇴화이지만 틀림). */
const CHROME_ONLY_NO_WITNESS: CommonElement[] = [
  element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }),
  element({ bounds: { x: 0, y: 60, w: 402, h: 44 } }),
  element({ bounds: { x: 0, y: 104, w: 402, h: 16 } }),
];

/** AC-GEST-018 — spec.md §C.1-⑫ 실측 화면 크기(witness == 유일한 최상위 요소). */
const KNOWN_SCREEN_402X874: CommonElement[] = [element({ bounds: { x: 0, y: 0, w: 402, h: 874 } })];

/**
 * AC-GEST-034 — 문턱을 넘는 비율이 아예 없는 화면(acceptance.md가 든
 * 실행 가능한 반례 그대로: 문턱 32px에 12x12 화면, witness == 유일한
 * 최상위 요소이므로 SCREEN_SIZE_UNKNOWN으로 걸러지지 않는다).
 */
const KNOWN_SCREEN_12X12: CommonElement[] = [element({ bounds: { x: 0, y: 0, w: 12, h: 12 } })];

function createMockBackend(
  devices: DeviceInfo[] = [device()],
  elements: CommonElement[] = KNOWN_SCREEN_400X800,
): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    // M8/0.6.0 amendment (REQ-GEST-SCROLL-008): default threshold matches the
    // iOS measured constant (11pt) so every pre-M8 fixture in this file
    // (BOUNDARY_FIXTURES_402X874, minNonDegenerateRatio() call sites) keeps
    // resolving against the SAME threshold it was derived against.
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    // SPEC-VISION-001 M1 (REQ-VISION-001): 화면 크기의 출처가 UI 계층
    // 덤프에서 `backend.getScreenSize`로 바뀌었다. 이 mock은 기존
    // 픽스처(`elements`)에 M1 이전과 **같은 파생 규칙**을 적용해 크기를
    // 만들어 돌려준다 — 그래야 이 파일에 M1 이전에 작성된 모든 화면 크기
    // 픽스처가 여전히 같은 크기를 의미하고, 바뀐 것이 크기의 출처뿐임을
    // 기존 테스트들이 그대로 증언한다.
    //
    // M2(REQ-VISION-002) 이후 `elements`는 오직 이 파생의 입력으로만
    // 남는다 — 백엔드에는 트리를 읽는 메서드가 더 이상 없다.
    getScreenSize: vi.fn().mockResolvedValue(deriveScreenSize(elements)),
  };
}

describe("scroll", () => {
  describe("AC-GEST-007/016 — 방향 계산 + 응답 표기", () => {
    it("scroll down: 성공 응답에 direction과 실제 좌표가 실리고, 끝점 y < 시작점 y다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          direction: string;
          from: { x: number; y: number };
          to: { x: number; y: number };
        };
        expect(data.direction).toBe("down");
        expect(data.to.y).toBeLessThan(data.from.y);
      }
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });

    it("backend.swipe에 명시적 durationMs를 실어 보낸다 (실기기 실측 — duration 생략 시 플랫폼 기본값이 너무 빨라 스크롤로 인식되지 않음)", async () => {
      // 실측(2026-07-27, 시뮬레이터 D0B3A18C-...): --duration을 생략한 swipe는
      // 플랫폼 기본 지속시간으로 전송되는데, 이 값이 너무 빨라 Safari가
      // 스크롤로 인식하지 못했다(전/후 스크린샷 SSIM 1.000000 — 완전 동일).
      // --duration 500을 명시하자 같은 좌표에서 실제로 스크롤됨을 확인했다
      // (SSIM 0.52). `scroll`은 이 진짜 동작을 보장할 책임이 있으므로
      // (spec.md §A.2), 사용자에게 노출하지 않는 내부 기본 지속시간을
      // 명시적으로 싣는다.
      const backend = createMockBackend();

      await runCli(["scroll", "down"], backend);

      const call = (backend.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown,
        unknown,
        { durationMs?: number } | undefined,
      ];
      expect(call[3]).toBeDefined();
      expect(call[3]?.durationMs).toBeGreaterThan(0);
    });

    it("scroll up: 응답 좌표의 끝점 y가 시작점 y보다 크다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "up"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { to: { y: number }; from: { y: number } };
        expect(data.to.y).toBeGreaterThan(data.from.y);
      }
    });

    it("scroll에 미지원 방향을 주면 무동작으로 거부한다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "diagonal"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_DIRECTION");
      expect(backend.swipe).not.toHaveBeenCalled();
      expect(backend.listDevices).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-008 — 화면 크기를 인덱스 0이 아니라 전체에서 파생한다", () => {
    it("최상위 3개 중 인덱스 1이 witness인 dump 결과로 402x874를 사용한다", async () => {
      const backend = createMockBackend([device()], MULTI_ROOT_WITH_WITNESS);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { from: { y: number }; to: { y: number } };
        // 인덱스 0(402x60)만 봤다면 y좌표가 [0,60] 안에 갇힌다 — 60을 넘는
        // 좌표는 실제 402x874 파생이 쓰였다는 증거다.
        expect(data.from.y).toBeGreaterThan(60);
        expect(data.to.y).toBeGreaterThan(60);
      }
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST-009 — --amount", () => {
    it("--amount 0.75의 이동 거리가 --amount 0.25의 정확히 3배다", async () => {
      const backendQuarter = createMockBackend();
      const backendThreeQuarters = createMockBackend();

      await runCli(["scroll", "down", "--amount", "0.25"], backendQuarter);
      await runCli(["scroll", "down", "--amount", "0.75"], backendThreeQuarters);

      const quarterCall = (backendQuarter.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { y: number },
        { y: number },
      ];
      const threeQuartersCall = (backendThreeQuarters.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { y: number },
        { y: number },
      ];

      const quarterDistance = Math.abs(quarterCall[1].y - quarterCall[2].y);
      const threeQuartersDistance = Math.abs(threeQuartersCall[1].y - threeQuartersCall[2].y);

      expect(threeQuartersDistance).toBe(quarterDistance * 3);
    });

    it("--amount 1은 허용된다 (경계값, 거부되지 않는다)", async () => {
      const backend = createMockBackend();
      const result = await runCli(["scroll", "down", "--amount", "1"], backend);
      expect(result.ok).toBe(true);
    });

    it("--amount 0.25는 허용된다 (경계값, 거부되지 않는다)", async () => {
      const backend = createMockBackend();
      const result = await runCli(["scroll", "down", "--amount", "0.25"], backend);
      expect(result.ok).toBe(true);
    });

    for (const invalidAmount of ["0", "1.5", "abc", ""]) {
      it(`--amount ${JSON.stringify(invalidAmount)} -> INVALID_AMOUNT, 무동작`, async () => {
        const backend = createMockBackend();

        const result = await runCli(["scroll", "down", "--amount", invalidAmount], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_AMOUNT");
          expect(result.error.details?.["received"]).toBe(invalidAmount);
        }
        expect(backend.swipe).not.toHaveBeenCalled();
      });
    }

    it("--amount -0.5 (음수 리터럴) -> INVALID_ARGS(파서 계층), 무동작", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "down", "--amount", "-0.5"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("값 없는 단독 --amount -> INVALID_ARGS(파서 계층), 무동작", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "down", "--amount"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("--amount 생략 시 기본 비율을 쓰고 무동작으로 거부하지 않는다", async () => {
      const backend = createMockBackend();
      const result = await runCli(["scroll", "down"], backend);
      expect(result.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST-010 — 화면 크기 불명 (퇴화 케이스)", () => {
    it("dump가 빈 배열이면 SCREEN_SIZE_UNKNOWN, 무동작", async () => {
      const backend = createMockBackend([device()], []);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("모든 bounds가 0이면 SCREEN_SIZE_UNKNOWN, 무동작", async () => {
      const backend = createMockBackend([device()], [element({ bounds: { x: 0, y: 0, w: 0, h: 0 } })]);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-017 — witness 없는 조각 집합 (비퇴화이지만 틀린 크기)", () => {
    it("Safari 크롬-only dump 결과 -> SCREEN_SIZE_UNKNOWN, 무동작 (핵심 회귀 방지 테스트)", async () => {
      const backend = createMockBackend([device()], CHROME_ONLY_NO_WITNESS);

      const result = await runCli(["scroll", "down", "--amount", "0.8"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-018 — 퇴화 --amount 거부 + 동작 경계 (SPEC-GESTURE-001 M6/0.4.0 amendment, F1)", () => {
    it("down: --amount 0.001 -> AMOUNT_TOO_SMALL, 무동작 (실측 재현, spec.md §C.1-⑫)", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "0.001"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
        expect(result.error.details?.["requestedRatio"]).toBe(0.001);
        expect(typeof result.error.details?.["minValidRatio"]).toBe("number");
        expect((result.error.details?.["minValidRatio"] as number)).toBeGreaterThan(0.001);
        // M8/0.6.0 amendment (REQ-GEST-SCROLL-008, AC-GEST-027): the
        // rejected minValidRatio carries its source alongside the number,
        // so a caller can tell this came from the default mock backend's
        // measured-constant threshold, not a runtime device query.
        expect(result.error.details?.["minValidRatioBasis"]).toBe("measured-constant");
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("down: --amount 0.002 -> AMOUNT_TOO_SMALL (거리 2 < MIN_EFFECTIVE_SWIPE_PX 11 -- M7이 좁힌 문턱, 0.4.0에서는 동작 경계였다)", async () => {
      // 0.5.0(M7) 이전에는 이 비율(거리 2)이 "동작 경계"였다 -- 0.4.0의
      // isDegenerateSwipe가 거리 0만 거부했기 때문이다. M7은 문턱을 실측값
      // 11pt로 좁혔으므로(spec.md §C.1-⑭), 거리 2는 이제도 화면을 신뢰성
      // 있게 움직이지 못해 거부된다. 실제 새 동작 경계는 아래
      // "AC-GEST-024" 블록의 독립 유도 픽스처를 참조.
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "0.002"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("AMOUNT_TOO_SMALL은 INVALID_AMOUNT와 다른 코드다 -- 0.001은 계약 범위(0 초과 1 이하) 안에 있다", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
      const result = await runCli(["scroll", "down", "--amount", "0.001"], backend);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).not.toBe("INVALID_AMOUNT");
    });

    for (const direction of ["up", "down", "left", "right"] as const) {
      describe(`방향=${direction}`, () => {
        for (const ratio of [0.0001, 0.001, 0.0012]) {
          it(`--amount ${ratio} -> AMOUNT_TOO_SMALL, 무동작`, async () => {
            const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

            const result = await runCli(["scroll", direction, "--amount", String(ratio)], backend);

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
            expect(backend.swipe).not.toHaveBeenCalled();
          });
        }

        it("독립 유도 경계(C-5, minNonDegenerateRatio()를 호출하지 않은 손 계산 값) 바로 아래는 거부되고, 바로 위는 성공한다", async () => {
          const fixture = BOUNDARY_FIXTURES_402X874[direction];

          const rejectBackend = createMockBackend([device()], KNOWN_SCREEN_402X874);
          const rejectResult = await runCli(["scroll", direction, "--amount", fixture.rejectRatio], rejectBackend);
          expect(rejectResult.ok).toBe(false);
          if (!rejectResult.ok) expect(rejectResult.error.code).toBe("AMOUNT_TOO_SMALL");
          expect(rejectBackend.swipe).not.toHaveBeenCalled();

          const acceptBackend = createMockBackend([device()], KNOWN_SCREEN_402X874);
          const acceptResult = await runCli(["scroll", direction, "--amount", fixture.acceptRatio], acceptBackend);
          expect(acceptResult.ok).toBe(true);
          if (acceptResult.ok) {
            const data = acceptResult.data as { from: { x: number; y: number }; to: { x: number; y: number } };
            const isVertical = direction === "up" || direction === "down";
            expect(isVertical ? data.from.y : data.from.x).toBe(fixture.acceptFrom);
            expect(isVertical ? data.to.y : data.to.x).toBe(fixture.acceptTo);
          }
          expect(acceptBackend.swipe).toHaveBeenCalledTimes(1);
        });

        it("minNonDegenerateRatio()가 계산한 경계 비율을 되먹이면 성공한다 (AC-GEST-024 왕복 검증, 응답 배선 회귀 가드 -- 문턱 정확성 증명은 위 독립 유도 테스트와 실기기 확인이 맡는다)", async () => {
          const boundaryRatio = assertDefined(minNonDegenerateRatio(direction, { width: 402, height: 874 }, 11));
          const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

          const result = await runCli(["scroll", direction, "--amount", String(boundaryRatio)], backend);

          expect(result.ok).toBe(true);
          expect(backend.swipe).toHaveBeenCalledTimes(1);
        });

        it("--amount 1은 정상 성공한다 (동작 경계)", async () => {
          const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
          const result = await runCli(["scroll", direction, "--amount", "1"], backend);
          expect(result.ok).toBe(true);
        });
      });
    }
  });

  describe("AC-GEST-034 — minValidRatio는 자기 자신이 거부할 값을 권하지 않는다 (SPEC-GESTURE-001 M10/0.8.0 amendment)", () => {
    it("문턱을 넘는 비율이 없는 화면(12x12, 문턱 32px) -- AMOUNT_TOO_SMALL은 그대로 나가지만 minValidRatio/minValidRatioBasis는 응답에 실리지 않는다", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_12X12);
      (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockResolvedValue({
        minEffectiveSwipePx: 32,
        basis: "device-query",
      });

      const result = await runCli(["scroll", "down", "--amount", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
        // 거부 자체는 불변이다 -- 사라지는 것은 권고뿐이다.
        expect(Object.hasOwn(result.error.details ?? {}, "minValidRatio")).toBe(false);
        expect(Object.hasOwn(result.error.details ?? {}, "minValidRatioBasis")).toBe(false);
      }
      // 무제스처 보장은 이 경로에서도 그대로다.
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("같은 화면·문턱 조합은 네 방향 전부에서 권고 없이 거부된다", async () => {
      for (const direction of ["up", "down", "left", "right"] as const) {
        const backend = createMockBackend([device()], KNOWN_SCREEN_12X12);
        (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockResolvedValue({
          minEffectiveSwipePx: 32,
          basis: "device-query",
        });

        const result = await runCli(["scroll", direction, "--amount", "1"], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
          expect(Object.hasOwn(result.error.details ?? {}, "minValidRatio")).toBe(false);
        }
        expect(backend.swipe).not.toHaveBeenCalled();
      }
    });

    it("권고가 존재하는 일반 화면에서는 여전히 minValidRatio/minValidRatioBasis가 응답에 실린다 (회귀 아님)", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "0.001"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(Object.hasOwn(result.error.details ?? {}, "minValidRatio")).toBe(true);
        expect(Object.hasOwn(result.error.details ?? {}, "minValidRatioBasis")).toBe(true);
      }
    });
  });

  describe("AC-GEST-026/027 — 문턱 조회 배선 (SPEC-GESTURE-001 M8/0.6.0 amendment, REQ-GEST-SCROLL-007/008)", () => {
    it("backend.getMinEffectiveSwipeThreshold를 해석된 serial로 호출한다 -- 화면 크기 조회 이후, backend.swipe 이전", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "1"], backend);

      expect(result.ok).toBe(true);
      expect(backend.getMinEffectiveSwipeThreshold).toHaveBeenCalledWith("R58N90ABCDE");
      expect(backend.getMinEffectiveSwipeThreshold).toHaveBeenCalledTimes(1);
      // SPEC-VISION-001 M1(REQ-VISION-001)으로 화면 크기 조회 단계가
      // UI 계층 덤프에서 `getScreenSize`로 교체됐고, M2(REQ-VISION-002)가
      // 그 덤프 메서드를 인터페이스에서 아예 제거했다. 0.6.0까지 이 자리에
      // 있던 덤프 호출 횟수 단언을 그대로 두면 이 테스트는 사라진 계약을
      // 지키게 된다.
      expect(backend.getScreenSize).toHaveBeenCalledWith("R58N90ABCDE");
      expect(backend.getScreenSize).toHaveBeenCalledTimes(1);
    });

    it("device-query 출처(Android 시뮬레이션)로 응답하는 백엔드를 쓰면 AMOUNT_TOO_SMALL 응답의 출처도 device-query다 -- 한쪽 값이 다른 쪽 경로로 흘러가지 않는다", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
      (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockResolvedValue({
        minEffectiveSwipePx: 32,
        basis: "device-query",
      });

      // 거리 12(0.014 비율)는 iOS 문턱(11) 기준으로는 성공하지만, Android
      // 문턱(32) 기준으로는 여전히 퇴화다 -- 같은 코드 경로가 문턱에 따라
      // 다르게 판정한다는 증거.
      const result = await runCli(["scroll", "down", "--amount", "0.014"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
        expect(result.error.details?.["minValidRatioBasis"]).toBe("device-query");
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("threshold를 되먹이면 그 출처(device-query)로 성공한다 -- 왕복 검증의 응답 배선 가드", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
      (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockResolvedValue({
        minEffectiveSwipePx: 32,
        basis: "device-query",
      });

      const rejected = await runCli(["scroll", "down", "--amount", "0.014"], backend);
      expect(rejected.ok).toBe(false);
      const minValidRatio = !rejected.ok ? (rejected.error.details?.["minValidRatio"] as number) : undefined;
      expect(typeof minValidRatio).toBe("number");

      const accepted = await runCli(["scroll", "down", "--amount", String(minValidRatio)], backend);
      expect(accepted.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });

    it("backend.getMinEffectiveSwipeThreshold가 던지면 BACKEND_COMMAND_FAILED를 반환하고 swipe는 호출되지 않는다", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
      (backend.getMinEffectiveSwipeThreshold as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: wm density failed"),
      );

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/wm density failed/);
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-022 — 홀수 축 화면에서도 움직임 불가 스와이프를 거부한다 (SPEC-GESTURE-001 M7/0.5.0 amendment, CLI 전 구간)", () => {
    // 순수 함수 레벨(scroll-geometry.test.ts)과 별개로, `getScreenSize`
    // -> computeScrollSwipe -> isDegenerateSwipe 전 구간을 CLI 디스패치로
    // 확인한다. 크기는 아래 단일 항목 픽스처에서 파생된다(createMockBackend).
    const ODD_SCREENS: Record<string, CommonElement[]> = {
      "402x874(짝x짝)": [element({ bounds: { x: 0, y: 0, w: 402, h: 874 } })],
      "393x852(폭 홀)": [element({ bounds: { x: 0, y: 0, w: 393, h: 852 } })],
      "375x667(홀x홀)": [element({ bounds: { x: 0, y: 0, w: 375, h: 667 } })],
    };

    for (const [label, elements] of Object.entries(ODD_SCREENS)) {
      for (const direction of ["up", "down", "left", "right"] as const) {
        it(`${label} ${direction}: 극소 비율(1e-8)은 AMOUNT_TOO_SMALL, 무동작`, async () => {
          const backend = createMockBackend([device()], elements);

          const result = await runCli(["scroll", direction, "--amount", "0.00000001"], backend);

          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
          expect(backend.swipe).not.toHaveBeenCalled();
        });
      }
    }
  });

  describe("AC-GEST-020 — swipe/scroll의 --duration argv 비대칭 (SPEC-GESTURE-001 M6, F2 문서 고지의 코드 쪽 anchor)", () => {
    it("swipe는 --duration 생략 시 backend.swipe에 durationMs 옵션을 전혀 싣지 않지만, scroll은 항상 내부 고정값(500ms)을 싣는다", async () => {
      const swipeBackend = createMockBackend();
      const scrollBackend = createMockBackend();

      await runCli(["swipe", "200", "700", "200", "300"], swipeBackend);
      await runCli(["scroll", "down"], scrollBackend);

      // swipe: --duration 생략 -> 옵션 인자 자체가 undefined (REQ-GEST-SWIPE-002,
      // D1 -- CLI가 숨은 기본값을 주입하지 않는다).
      expect(swipeBackend.swipe).toHaveBeenCalledWith(
        "R58N90ABCDE",
        { x: 200, y: 700 },
        { x: 200, y: 300 },
        undefined,
      );

      // scroll: 항상 SCROLL_SWIPE_DURATION_MS(500)를 명시적으로 싣는다 --
      // 편의 계층은 실제 이동을 보장할 책임이 있다(spec.md §A.2,
      // scroll.ts의 SCROLL_SWIPE_DURATION_MS 주석). 이 비대칭은 의도된
      // 것이며 REQ-GEST-SWIPE-006이 문서로 고지한다.
      const scrollCall = (scrollBackend.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown,
        unknown,
        { durationMs?: number } | undefined,
      ];
      expect(scrollCall[3]).toEqual({ durationMs: 500 });
    });
  });

  describe("AC-GEST-015 — JSON 봉투", () => {
    it("성공/오류 모든 경로에서 JSON.parse 가능한 단일 문서를 방출한다", async () => {
      const backend = createMockBackend();
      const invocations: string[][] = [
        ["scroll", "down"],
        ["scroll", "up", "--amount", "0.5"],
        ["scroll", "sideways"],
        ["scroll", "down", "--amount", "abc"],
        ["scroll", "down", "--amount", "-0.5"],
      ];

      for (const argv of invocations) {
        const result = await runCli(argv, backend);
        expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
        expect(typeof result.ok).toBe("boolean");
        expect(result.command).toBe("scroll");
      }
    });
  });

  describe("REQ-VISION-001 — 화면 크기 소스 교체 (SPEC-VISION-001 M1)", () => {
    it("AC-VISION-001/006: 성공 경로의 화면 크기 조회는 getScreenSize 정확히 1회뿐이다 -- M2에서 UI 계층 덤프 메서드 자체가 인터페이스에서 사라졌으므로 '호출하지 않음'은 타입이 보장하고, 이 테스트는 '무엇을 대신 호출하는가'를 증언한다", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "1"], backend);

      expect(result.ok).toBe(true);
      expect(backend.getScreenSize).toHaveBeenCalledTimes(1);
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });

    it("AC-VISION-004: getScreenSize가 undefined를 주면 SCREEN_SIZE_UNKNOWN, 무동작 -- 크기를 추측하지 않는다", async () => {
      const backend = createMockBackend();
      // 백엔드가 화면 크기 소스를 읽었으나 해석할 수 없었던 경우
      // (예: `wm size` 출력에 `Physical size:` 줄이 없음). 명령 자체가
      // 실패한 것과는 다른 사실이며, 다른 오류 코드로 갈라져야 한다.
      (backend.getScreenSize as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("degrades a thrown backend error gracefully", () => {
    it("getScreenSize가 던지면 BACKEND_COMMAND_FAILED를 반환한다", async () => {
      const backend = createMockBackend();
      (backend.getScreenSize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: device offline"),
      );

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/device offline/);
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("swipe가 던지면 BACKEND_COMMAND_FAILED를 반환한다", async () => {
      const backend = createMockBackend();
      (backend.swipe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("iOS backend: connection lost"));

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/connection lost/);
      }
    });
  });
});
