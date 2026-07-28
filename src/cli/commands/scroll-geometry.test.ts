/**
 * `scroll-geometry.ts` 순수 함수 단위 테스트 (SPEC-GESTURE-001 M3).
 *
 * 기기 없이 검증 가능해야 한다는 요구(plan.md §F M3)에 따라, 화면 크기
 * 파생(`deriveScreenSize`)과 방향·비율 -> 좌표 변환(`computeScrollSwipe`)을
 * `CommonElement[]` 픽스처만으로 테스트한다.
 */

import { describe, expect, it } from "vitest";
import type { CommonElement } from "../../schema/common-element.js";
import {
  computeScrollSwipe,
  deriveScreenSize,
  isDegenerateSwipe,
  minNonDegenerateRatio,
  roundPixel,
} from "./scroll-geometry.js";

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

describe("deriveScreenSize", () => {
  describe("AC-GEST-008 — 인덱스 0을 루트로 가정하지 않는다", () => {
    it("최상위 3개 중 인덱스 1이 witness일 때 402x874로 파생한다", () => {
      const elements = [
        element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }), // 인덱스 0 — 상단 바, 화면 전체 아님
        element({ bounds: { x: 0, y: 0, w: 402, h: 874 } }), // 인덱스 1 — 화면 전체 (witness)
        element({ bounds: { x: 0, y: 800, w: 402, h: 74 } }), // 인덱스 2 — 하단 바
      ];

      expect(deriveScreenSize(elements)).toEqual({ width: 402, height: 874 });
    });

    it("인덱스 0만 보는 구현이라면 402x60을 얻는다 — 이 테스트는 그 실수를 잡는다", () => {
      const elements = [
        element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }),
        element({ bounds: { x: 0, y: 0, w: 402, h: 874 } }),
        element({ bounds: { x: 0, y: 800, w: 402, h: 74 } }),
      ];

      const size = deriveScreenSize(elements);
      expect(size).not.toEqual({ width: 402, height: 60 });
    });
  });

  describe("실측 pre-flight 픽스처 — Safari 전면, witness가 인덱스 0 (plan.md §B.5 해소 증거)", () => {
    it("[Application 402x874(witness), TextField 84x14.333...] -> 402x874로 파생한다", () => {
      // 2026-07-27 실측: `node dist/cli/bin.js dump --device D0B3A18C-...`
      // 최상위 요소 2개, 두 번째 요소의 h가 14.333333333333371(비정수).
      const elements = [
        element({
          role: "Application",
          text: "Safari",
          bounds: { x: 0, y: 0, w: 402, h: 874 },
        }),
        element({
          role: "TextField",
          text: "주소",
          bounds: { x: 159, y: 837, w: 84, h: 14.333333333333371 },
        }),
      ];

      expect(deriveScreenSize(elements)).toEqual({ width: 402, height: 874 });
    });
  });

  describe("AC-GEST-010 — 퇴화 케이스", () => {
    it("빈 배열이면 undefined를 반환한다", () => {
      expect(deriveScreenSize([])).toBeUndefined();
    });

    it("모든 bounds가 0이면 undefined를 반환한다", () => {
      const elements = [element({ bounds: { x: 0, y: 0, w: 0, h: 0 } })];
      expect(deriveScreenSize(elements)).toBeUndefined();
    });
  });

  describe("AC-GEST-017 — witness 없는 조각 집합 (비퇴화이지만 틀린 크기)", () => {
    it("Safari 크롬-only 픽스처(402x120 후보, witness 없음) -> undefined", () => {
      const elements = [
        element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }), // 상단 바
        element({ bounds: { x: 0, y: 60, w: 402, h: 44 } }), // URL 바
        element({ bounds: { x: 0, y: 104, w: 402, h: 16 } }), // 진행 표시
      ];

      // 후보 산출(①)은 402x120으로 비퇴화 양수 — AC-GEST-010의 퇴화 검사로는
      // 절대 잡히지 않는다. witness 검증(②)만이 이 케이스를 막는다.
      expect(deriveScreenSize(elements)).toBeUndefined();
    });

    it("느슨한 witness 규칙(원점 조건 없이 x+w===width && y+h===height)이라면 통과했을 인덱스 2를 거부한다", () => {
      const elements = [
        element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }),
        element({ bounds: { x: 0, y: 60, w: 402, h: 44 } }),
        // 인덱스 2: x+w=402(=width), y+h=120(=height)이지만 y=104 (원점 아님)
        element({ bounds: { x: 0, y: 104, w: 402, h: 16 } }),
      ];

      // 원점 조건(x===0 && y===0)을 요구하지 않으면 인덱스 2가 witness로
      // 통과해 402x120이 채택되어 버린다 — 이 테스트가 그 실수를 잡는다.
      expect(deriveScreenSize(elements)).toBeUndefined();
    });
  });
});

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

describe("isDegenerateSwipe / minNonDegenerateRatio (SPEC-GESTURE-001 M6 — AC-GEST-018, F1)", () => {
  // spec.md §C.1-⑫ 실측 화면 크기 — 402x874, witness 있음.
  const SCREEN_402X874 = { width: 402, height: 874 };

  describe("실측 재현 — 402x874에서 --amount 0.001/0.0012는 퇴화, 0.002는 정상", () => {
    it("0.001 -> from.y=to.y=437 (거리 0, 퇴화)", () => {
      const coords = computeScrollSwipe("down", 0.001, SCREEN_402X874);
      expect(coords.from.y).toBe(437);
      expect(coords.to.y).toBe(437);
      expect(isDegenerateSwipe(coords)).toBe(true);
    });

    it("0.0012 -> from.y=to.y=437 (거리 0, 퇴화)", () => {
      const coords = computeScrollSwipe("down", 0.0012, SCREEN_402X874);
      expect(isDegenerateSwipe(coords)).toBe(true);
    });

    it("0.002 -> from.y=438 to.y=436 (거리 2, 비퇴화)", () => {
      const coords = computeScrollSwipe("down", 0.002, SCREEN_402X874);
      expect(coords.from.y).toBe(438);
      expect(coords.to.y).toBe(436);
      expect(isDegenerateSwipe(coords)).toBe(false);
    });
  });

  describe("네 방향 전부에서 퇴화·비퇴화 대역이 존재한다 (가로·세로 임계 비율이 다르다)", () => {
    for (const direction of ["up", "down", "left", "right"] as const) {
      it(`${direction}: --amount 0.0001은 퇴화하고, minNonDegenerateRatio()가 계산한 경계 비율은 퇴화하지 않는다`, () => {
        expect(isDegenerateSwipe(computeScrollSwipe(direction, 0.0001, SCREEN_402X874))).toBe(true);

        const boundary = minNonDegenerateRatio(direction, SCREEN_402X874);
        expect(boundary).toBeGreaterThan(0);
        expect(boundary).toBeLessThan(0.01); // 실측 임계값(약 0.0013)과 같은 자릿수
        expect(isDegenerateSwipe(computeScrollSwipe(direction, boundary, SCREEN_402X874))).toBe(false);
      });
    }

    it("가로(width=402)와 세로(height=874)의 임계 비율이 서로 다르다 -- 한 축만 맞춘 구현은 이 테스트에서 걸린다", () => {
      const verticalBoundary = minNonDegenerateRatio("down", SCREEN_402X874);
      const horizontalBoundary = minNonDegenerateRatio("right", SCREEN_402X874);
      expect(verticalBoundary).not.toBeCloseTo(horizontalBoundary, 5);
    });
  });

  it("--amount 1은 모든 방향에서 비퇴화다 (동작 경계)", () => {
    for (const direction of ["up", "down", "left", "right"] as const) {
      expect(isDegenerateSwipe(computeScrollSwipe(direction, 1, SCREEN_402X874))).toBe(false);
    }
  });
});
