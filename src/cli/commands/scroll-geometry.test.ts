/**
 * `scroll-geometry.ts` 순수 함수 단위 테스트 (SPEC-GESTURE-001 M3).
 *
 * 기기 없이 검증 가능해야 한다는 요구(plan.md §F M3)에 따라, 화면 크기
 * 파생(`deriveScreenSize`)과 방향·비율 -> 좌표 변환(`computeScrollSwipe`)을
 * `CommonElement[]` 픽스처만으로 테스트한다.
 */

import { describe, expect, it } from "vitest";
import {
  computeScrollSwipe,
  isDegenerateSwipe,
  minNonDegenerateRatio,
  roundPixel,
  type ScrollDirection,
} from "./scroll-geometry.js";

/**
 * `minNonDegenerateRatio()`가 M10/0.8.0 amendment로 `number | undefined`를
 * 반환하게 되면서(AC-GEST-034 -- 문턱을 넘는 비율이 없는 화면은 undefined),
 * 그 값이 존재함을 이미 아는(독립적으로 유도한 화면·문턱 조합) 테스트
 * 호출부의 타입을 좁힌다. undefined라면 그 자체가 테스트 가정이 깨진
 * 것이므로 즉시 던진다.
 */
function assertDefined(value: number | undefined): number {
  if (value === undefined) {
    throw new Error("expected minNonDegenerateRatio() to return a number, got undefined");
  }
  return value;
}


describe("roundPixel", () => {
  it("실측 비정수 bounds(h: 14.333333333333371)를 정수로 반올림한다", () => {
    // Section E 항목 3 증거 — B-2 사전 점검에서 관측된 리터럴 값.
    expect(roundPixel(14.333333333333371)).toBe(14);
  });

  it("사사오입(표준 반올림) 규칙을 따른다", () => {
    expect(roundPixel(633.65)).toBe(634);
    expect(roundPixel(240.35)).toBe(240);
    expect(roundPixel(0.4)).toBe(0);
    expect(roundPixel(0.5)).toBe(1);
  });
});

describe("computeScrollSwipe", () => {
  const screen400x800 = { width: 400, height: 800 };

  describe("AC-GEST-007 — 방향별 좌표 계산 + AC-GEST-016 — 방향 의미", () => {
    it("down: 아래 내용을 보기 위해 손가락이 위로 움직인다 (끝점 y < 시작점 y)", () => {
      const { from, to } = computeScrollSwipe("down", 0.5, screen400x800);
      expect(to.y).toBeLessThan(from.y);
    });

    it("up: 위 내용을 보기 위해 손가락이 아래로 움직인다 (끝점 y > 시작점 y)", () => {
      const { from, to } = computeScrollSwipe("up", 0.5, screen400x800);
      expect(to.y).toBeGreaterThan(from.y);
    });

    it("right: 오른쪽 내용을 보기 위해 손가락이 왼쪽으로 움직인다 (끝점 x < 시작점 x)", () => {
      const { from, to } = computeScrollSwipe("right", 0.5, screen400x800);
      expect(to.x).toBeLessThan(from.x);
    });

    it("left: 왼쪽 내용을 보기 위해 손가락이 오른쪽으로 움직인다 (끝점 x > 시작점 x)", () => {
      const { from, to } = computeScrollSwipe("left", 0.5, screen400x800);
      expect(to.x).toBeGreaterThan(from.x);
    });

    it("좌표가 화면 밖으로 나가지 않는다 (--amount 1 경계 포함)", () => {
      for (const direction of ["up", "down", "left", "right"] as const) {
        for (const ratio of [0.1, 0.5, 1]) {
          const { from, to } = computeScrollSwipe(direction, ratio, screen400x800);
          for (const point of [from, to]) {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(screen400x800.width);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(screen400x800.height);
          }
        }
      }
    });

    it("좌표는 항상 정수다 (백엔드 계약 — parseCoordinate의 `^\\d+$`)", () => {
      for (const direction of ["up", "down", "left", "right"] as const) {
        const { from, to } = computeScrollSwipe(direction, 0.37, screen400x800);
        for (const point of [from, to]) {
          expect(Number.isInteger(point.x)).toBe(true);
          expect(Number.isInteger(point.y)).toBe(true);
        }
      }
    });
  });

  describe("AC-GEST-009 — --amount 비율에 비례한 이동 거리", () => {
    it("0.75 쪽 이동 거리가 0.25 쪽의 정확히 3배다", () => {
      const quarter = computeScrollSwipe("down", 0.25, screen400x800);
      const threeQuarters = computeScrollSwipe("down", 0.75, screen400x800);

      const quarterDistance = Math.abs(quarter.from.y - quarter.to.y);
      const threeQuartersDistance = Math.abs(threeQuarters.from.y - threeQuarters.to.y);

      expect(threeQuartersDistance).toBe(quarterDistance * 3);
    });
  });

  it("생략 시 기본 여백 정책이 화면 세로축 중앙을 가로축으로 고정한다 (좌우 스크롤)", () => {
    const { from, to } = computeScrollSwipe("left", 0.5, screen400x800);
    expect(from.y).toBe(400); // height / 2
    expect(to.y).toBe(400);
  });
});

describe("isDegenerateSwipe / minNonDegenerateRatio (SPEC-GESTURE-001 M6/M7/M8 — AC-GEST-018/022/024/026)", () => {
  // spec.md §C.1-⑫ 실측 화면 크기 — 402x874, witness 있음.
  const SCREEN_402X874 = { width: 402, height: 874 };

  // M8/0.6.0 amendment (REQ-GEST-SCROLL-008): 문턱은 더 이상 모듈 상수가
  // 아니라 호출자가 공급하는 인자다. 아래 값들은 이 파일의 기존 픽스처가
  // 가정했던 iOS 실측 문턱(spec.md §C.1-⑭)을 그대로 재현하기 위한 테스트
  // 전용 상수다 -- 실제 값의 출처(iOS 측정 상수 vs AdbBackend 밀도 파생)는
  // adb-backend.test.ts / wda-backend.test.ts가 검증한다.
  const IOS_THRESHOLD_PX = 11;
  const ANDROID_THRESHOLD_PX = 32; // spec.md §C.1-⑰ 600dpi 권장 문턱

  describe("0.4.0(M6) 실측값은 M7 문턱(11pt) 아래라 이제도 퇴화다 — spec.md §C.1-⑫/⑭ 재해석", () => {
    it("0.001 -> from.y=to.y=437 (거리 0, 퇴화)", () => {
      const coords = computeScrollSwipe("down", 0.001, SCREEN_402X874);
      expect(coords.from.y).toBe(437);
      expect(coords.to.y).toBe(437);
      expect(isDegenerateSwipe(coords, IOS_THRESHOLD_PX)).toBe(true);
    });

    it("0.0012 -> from.y=to.y=437 (거리 0, 퇴화)", () => {
      const coords = computeScrollSwipe("down", 0.0012, SCREEN_402X874);
      expect(isDegenerateSwipe(coords, IOS_THRESHOLD_PX)).toBe(true);
    });

    it("0.002 -> from.y=438 to.y=436 (거리 2) -- 0.4.0 기준으로는 비퇴화였지만, 거리 2 < 문턱(11)이라 M7 문턱으로는 여전히 퇴화다", () => {
      const coords = computeScrollSwipe("down", 0.002, SCREEN_402X874);
      expect(coords.from.y).toBe(438);
      expect(coords.to.y).toBe(436);
      expect(isDegenerateSwipe(coords, IOS_THRESHOLD_PX)).toBe(true);
    });
  });

  describe("네 방향 전부에서 퇴화·비퇴화 대역이 존재한다 (가로·세로 임계 비율이 다르다)", () => {
    for (const direction of ["up", "down", "left", "right"] as const) {
      it(`${direction}: --amount 0.0001은 퇴화하고, minNonDegenerateRatio()가 계산한 경계 비율은 퇴화하지 않는다`, () => {
        expect(isDegenerateSwipe(computeScrollSwipe(direction, 0.0001, SCREEN_402X874), IOS_THRESHOLD_PX)).toBe(true);

        const boundary = assertDefined(minNonDegenerateRatio(direction, SCREEN_402X874, IOS_THRESHOLD_PX));
        expect(boundary).toBeGreaterThan(0);
        expect(boundary).toBeLessThan(0.1); // 넉넉한 상한 -- 402x874 화면에서 문턱 11pt는 이 범위 안이다
        expect(isDegenerateSwipe(computeScrollSwipe(direction, boundary, SCREEN_402X874), IOS_THRESHOLD_PX)).toBe(
          false,
        );
      });
    }

    it("가로(width=402)와 세로(height=874)의 임계 비율이 서로 다르다 -- 한 축만 맞춘 구현은 이 테스트에서 걸린다", () => {
      const verticalBoundary = assertDefined(minNonDegenerateRatio("down", SCREEN_402X874, IOS_THRESHOLD_PX));
      const horizontalBoundary = assertDefined(minNonDegenerateRatio("right", SCREEN_402X874, IOS_THRESHOLD_PX));
      expect(verticalBoundary).not.toBeCloseTo(horizontalBoundary, 5);
    });
  });

  it("--amount 1은 모든 방향에서 비퇴화다 (동작 경계)", () => {
    for (const direction of ["up", "down", "left", "right"] as const) {
      expect(isDegenerateSwipe(computeScrollSwipe(direction, 1, SCREEN_402X874), IOS_THRESHOLD_PX)).toBe(false);
    }
  });

  describe("AC-GEST-022 — 홀수 축 화면에서도 움직임 불가 스와이프를 거부한다 (0.5.0, M7)", () => {
    // 0.4.0의 `from === to` 판정은 축 길이가 짝수일 때만 발동할 수 있었다 --
    // `center = dimension/2`가 홀수 축에서는 반정수라 반올림이 항상 갈라져
    // 1px을 방출했다(spec.md §C.1-⑬, 빌드 모듈로 재현된 정확한 회귀).
    const SCREENS: Record<string, { width: number; height: number }> = {
      "402x874(짝x짝)": { width: 402, height: 874 },
      "393x852(폭 홀)": { width: 393, height: 852 },
      "375x667(홀x홀)": { width: 375, height: 667 },
    };

    for (const [label, screen] of Object.entries(SCREENS)) {
      for (const direction of ["up", "down", "left", "right"] as const) {
        for (const ratio of [1e-12, 1e-8, 1e-4]) {
          it(`${label} ${direction} ratio=${ratio}: 극소 비율은 거부된다 (from===to 판정이라면 홀수 축에서 실패했을 조합)`, () => {
            const coords = computeScrollSwipe(direction, ratio, screen);
            expect(isDegenerateSwipe(coords, IOS_THRESHOLD_PX)).toBe(true);
          });
        }
      }
    }

    it("393x852의 down은 짝수 축(높이 852)이라 from===to가 성립하지만, left는 폭(393, 홀수)이라 from===to가 결코 성립하지 않는다 -- 그런데도 새 술어는 둘 다 거부한다", () => {
      const screen = { width: 393, height: 852 };
      const downCoords = computeScrollSwipe("down", 1e-12, screen);
      const leftCoords = computeScrollSwipe("left", 1e-12, screen);

      // 0.4.0 술어(from===to)라면 down만 거부되고 left는 통과(1px 방출)했을
      // 지점 -- 새 술어(거리 < 문턱)는 둘 다 거부한다.
      expect(downCoords.from.x === downCoords.to.x && downCoords.from.y === downCoords.to.y).toBe(true);
      expect(leftCoords.from.x === leftCoords.to.x && leftCoords.from.y === leftCoords.to.y).toBe(false);

      expect(isDegenerateSwipe(downCoords, IOS_THRESHOLD_PX)).toBe(true);
      expect(isDegenerateSwipe(leftCoords, IOS_THRESHOLD_PX)).toBe(true);
    });

    it("375x667은 두 축 모두 홀수라 어느 방향도 from===to가 성립하지 않지만, 새 술어는 극소 비율을 여전히 거부한다", () => {
      const screen = { width: 375, height: 667 };
      for (const direction of ["up", "down", "left", "right"] as const) {
        const coords = computeScrollSwipe(direction, 1e-12, screen);
        expect(coords.from.x === coords.to.x && coords.from.y === coords.to.y).toBe(false);
        expect(isDegenerateSwipe(coords, IOS_THRESHOLD_PX)).toBe(true);
      }
    });

    for (const [label, screen] of Object.entries(SCREENS)) {
      it(`${label}: minNonDegenerateRatio()가 계산한 경계는 세 화면 모두에서 실제로 비퇴화다`, () => {
        for (const direction of ["up", "down", "left", "right"] as const satisfies ScrollDirection[]) {
          const boundary = assertDefined(minNonDegenerateRatio(direction, screen, IOS_THRESHOLD_PX));
          expect(isDegenerateSwipe(computeScrollSwipe(direction, boundary, screen), IOS_THRESHOLD_PX)).toBe(false);
        }
      });
    }
  });

  describe("AC-GEST-026 — 문턱은 호출자가 공급하는 인자다 (SPEC-GESTURE-001 M8/0.6.0 amendment)", () => {
    // 0.5.0까지 이 파일은 MIN_EFFECTIVE_SWIPE_PX(11, iOS 전용)를 모듈
    // 상수로 참조했다. Android 실기기에서 그 값이 무효(세로 0/5·가로
    // 0/6)임이 드러났다(spec.md §C.1-⑰) -- 이 순수 함수 계층은 이제
    // 어느 플랫폼의 값인지 알지 못한 채 인자로 받은 문턱만 비교한다.
    it("같은 화면·거리에서 Android 문턱(32)을 쓰면 퇴화이고, iOS 문턱(11)을 쓰면 비퇴화다 -- 한 상수를 두 플랫폼에 쓰던 결함이 재발하면 이 테스트가 잡는다", () => {
      // 402x874 화면에서 거리 12px을 만드는 비율(손 계산 -- BOUNDARY_FIXTURES와
      // 무관한 독립 유도, scroll.test.ts의 "up" 경계와 동일한 산식).
      const coords = computeScrollSwipe("down", 0.014, SCREEN_402X874);
      const distance = Math.abs(coords.from.y - coords.to.y);
      expect(distance).toBeGreaterThanOrEqual(11);
      expect(distance).toBeLessThan(32);

      expect(isDegenerateSwipe(coords, IOS_THRESHOLD_PX)).toBe(false);
      expect(isDegenerateSwipe(coords, ANDROID_THRESHOLD_PX)).toBe(true);
    });

    it("minNonDegenerateRatio()가 계산하는 경계 비율은 문턱이 클수록 커진다 (Android 문턱 > iOS 문턱 -> Android 경계 비율 > iOS 경계 비율)", () => {
      const iosBoundary = assertDefined(minNonDegenerateRatio("down", SCREEN_402X874, IOS_THRESHOLD_PX));
      const androidBoundary = assertDefined(minNonDegenerateRatio("down", SCREEN_402X874, ANDROID_THRESHOLD_PX));
      expect(androidBoundary).toBeGreaterThan(iosBoundary);
    });

    it("경계 자체(슬롭+1, 확률적 구간)를 문턱으로 주면 그 거리는 비퇴화로 판정된다 -- 최종 문턱은 반드시 슬롭+2 이상을 공급해야 한다는 요구는 백엔드 쪽 책임이다(adb-backend.test.ts)", () => {
      // 이 계층 자체는 "문턱 미만이면 퇴화"만 판정한다 -- 문턱값이
      // 안전한 여유를 포함하는지는 순수 함수의 책임 밖이다(호출자 책임).
      const coords = { from: { x: 0, y: 31 }, to: { x: 0, y: 0 } };
      expect(isDegenerateSwipe(coords, 31)).toBe(false); // distance(31) >= threshold(31)
      expect(isDegenerateSwipe(coords, 32)).toBe(true); // distance(31) < threshold(32)
    });
  });

  describe("AC-GEST-034 — minValidRatio는 자기 자신이 거부할 값을 권하지 않는다 (SPEC-GESTURE-001 M10/0.8.0 amendment)", () => {
    // 문턱을 넘는 비율이 아예 없는 화면 -- acceptance.md가 든 실행 가능한
    // 반례 그대로(문턱 32px에 12x12 화면). ratio=1조차 이 조합에서는
    // 퇴화다: usable = 12 - 12*0.05*2 = 10.8, distance round(11)-round(1) = 10 < 32.
    const TINY_SCREEN = { width: 12, height: 12 };
    const THRESHOLD_PX = 32;

    // NN5의 전제("12x12 같은 화면은 이미 REQ-GEST-SCROLL-004가 거부한다"는 거짓)를
    // 세우던 `deriveScreenSize` 반례 테스트는 SPEC-CLEAN-001이 그 함수를 제거하며
    // 함께 사라졌다. 전제 자체는 없어지지 않았고 **더 강한 형태로** 남아 있다 —
    // `scroll.test.ts`가 `backend.getScreenSize`가 12x12를 돌려주는 실제 경로로
    // 같은 것을 검증한다(AC-GEST-034 블록). 아래 두 테스트가 그 전제 위에 선다.

    it("ratio=1조차 이 화면·문턱에서는 퇴화다 -- 문턱을 넘는 비율이 아예 존재하지 않는다", () => {
      for (const direction of ["up", "down", "left", "right"] as const) {
        expect(isDegenerateSwipe(computeScrollSwipe(direction, 1, TINY_SCREEN), THRESHOLD_PX)).toBe(true);
      }
    });

    it("minNonDegenerateRatio는 이런 화면·문턱 조합에서 undefined를 반환한다 -- 이분 탐색의 hi=1을 그대로 돌려주면 자기 자신이 거부할 값을 권하게 된다(세 번째 입구)", () => {
      for (const direction of ["up", "down", "left", "right"] as const) {
        expect(minNonDegenerateRatio(direction, TINY_SCREEN, THRESHOLD_PX)).toBeUndefined();
      }
    });

    it("문턱을 넘는 비율이 존재하는 화면에서는 여전히 숫자를 반환하고, 그 값을 되먹이면 퇴화 판정을 통과한다 (왕복 불변 -- 회귀 아님)", () => {
      const boundary = minNonDegenerateRatio("down", { width: 402, height: 874 }, 11);
      expect(boundary).not.toBeUndefined();
      if (boundary !== undefined) {
        expect(isDegenerateSwipe(computeScrollSwipe("down", boundary, { width: 402, height: 874 }), 11)).toBe(false);
      }
    });
  });
});
