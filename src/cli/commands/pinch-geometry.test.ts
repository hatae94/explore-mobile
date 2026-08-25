import { describe, expect, it } from "vitest";

import {
  computePinchFingers,
  isPinchOutOfBounds,
  isPinchTravelTooSmall,
  pinchTravelPx,
  pinchValidRatioRange,
} from "./pinch-geometry.js";
import type { ScreenSize } from "../../schema/device-backend.js";

/**
 * 화면 픽스처 세 벌 (AC-GEST2-001) — **한 화면 크기로 기하를 검증하면 그
 * 화면의 성질(축 길이의 홀짝)이 규칙처럼 보인다.** SPEC-GESTURE-001 B.7이
 * 같은 실수를 두 번 겪었고, 반올림이 개입하는 산식은 축 길이의 홀짝에 민감하다.
 */
const EVEN: ScreenSize = { width: 1080, height: 2220 };
const ODD_WIDTH: ScreenSize = { width: 1081, height: 2220 };
const ODD_BOTH: ScreenSize = { width: 1081, height: 2221 };

/**
 * 아래 기댓값은 **함수를 부르지 않고 손으로 유도한 상수**다(AC-GEST2-001).
 * 함수의 자기 출력을 기댓값으로 쓰면 산식이 틀려도 테스트가 통과한다.
 *
 * 유도 규칙(REQ-GEST2-PINCH-002 ①~③):
 *   wideGap   = round(r × screen.width)
 *   narrowGap = round(wideGap / 2)
 *   간격 g에서 두 손가락 = round(x − g/2), round(x + g/2)   ... y는 앵커의 y
 *   out: narrowGap → wideGap,  in: wideGap → narrowGap
 */

describe("computePinchFingers — 가로축 대칭 배치 (AC-GEST2-001, REQ-GEST2-PINCH-001/002)", () => {
  it("짝·짝 화면 중앙 앵커, out, r=0.5 — 손으로 유도한 좌표와 정확히 같다", () => {
    // wideGap = round(0.5×1080) = 540, narrowGap = round(270) = 270
    // narrow: round(540−135)=405, round(540+135)=675
    // wide:   round(540−270)=270, round(540+270)=810
    expect(computePinchFingers("out", 0.5, { x: 540, y: 1110 }, EVEN)).toEqual([
      { from: { x: 405, y: 1110 }, to: { x: 270, y: 1110 } },
      { from: { x: 675, y: 1110 }, to: { x: 810, y: 1110 } },
    ]);
  });

  it("같은 입력의 in은 out의 정확한 역방향이다 — 방향 반전은 오류 없이 조용히 일어난다", () => {
    expect(computePinchFingers("in", 0.5, { x: 540, y: 1110 }, EVEN)).toEqual([
      { from: { x: 270, y: 1110 }, to: { x: 405, y: 1110 } },
      { from: { x: 810, y: 1110 }, to: { x: 675, y: 1110 } },
    ]);
  });

  it("폭 홀 화면(1081)에서 홀수 간격이 나와도 간격 자체는 정확히 보존된다", () => {
    // wideGap = round(0.5×1081) = round(540.5) = 541, narrowGap = round(270.5) = 271
    // narrow g=271: round(540−135.5)=round(404.5)=405, round(540+135.5)=round(675.5)=676
    // wide   g=541: round(540−270.5)=round(269.5)=270, round(540+270.5)=round(810.5)=811
    const [left, right] = computePinchFingers("out", 0.5, { x: 540, y: 1110 }, ODD_WIDTH);

    expect(left).toEqual({ from: { x: 405, y: 1110 }, to: { x: 270, y: 1110 } });
    expect(right).toEqual({ from: { x: 676, y: 1110 }, to: { x: 811, y: 1110 } });
    // 실제 좌표 간격이 산식의 간격과 정확히 같다: 676−405 = 271, 811−270 = 541.
    expect(right.from.x - left.from.x).toBe(271);
    expect(right.to.x - left.to.x).toBe(541);
  });

  it("홀·홀 화면의 가장자리 근접 앵커에서도 같은 규칙이 적용된다", () => {
    // wideGap = round(0.25×1081) = round(270.25) = 270, narrowGap = round(135) = 135
    // narrow g=135: round(900−67.5)=round(832.5)=833, round(900+67.5)=round(967.5)=968
    // wide   g=270: 900−135=765, 900+135=1035
    expect(computePinchFingers("out", 0.25, { x: 900, y: 1500 }, ODD_BOTH)).toEqual([
      { from: { x: 833, y: 1500 }, to: { x: 765, y: 1500 } },
      { from: { x: 968, y: 1500 }, to: { x: 1035, y: 1500 } },
    ]);
  });

  it.each([
    ["짝·짝 / 중앙", EVEN, { x: 540, y: 1110 }],
    ["폭 홀 / 가장자리 근접", ODD_WIDTH, { x: 1000, y: 40 }],
    ["홀·홀 / 모서리", ODD_BOTH, { x: 1, y: 1 }],
  ] as const)("네 점 모두 y가 앵커의 y와 같다 (%s) — 세로축·대각선을 쓰지 않는다", (_label, screen, anchor) => {
    const fingers = computePinchFingers("out", 0.4, anchor, screen);

    for (const finger of fingers) {
      expect(finger.from.y).toBe(anchor.y);
      expect(finger.to.y).toBe(anchor.y);
    }
  });

  /**
   * AC-GEST2-001(0.4.0) — **간격 보존이 대칭을 이긴다.**
   *
   * 0.3.0까지 이 AC는 "`x`는 앵커를 중심으로 대칭이다"라고 적었고, 그 문장은
   * 홀수 간격에서 만족될 수 없다. 아래 두 테스트가 **AC의 문장 자체**를
   * 검사한다 — 이전 M2 테스트는 손으로 유도한 좌표만 단언했으므로 이 절을
   * 검사한 적이 없었다(progress.md 재판정 참조).
   */
  describe("간격 보존 vs 앵커 대칭 (AC-GEST2-001, REQ-GEST2-PINCH-002 ③)", () => {
    const gapOf = (fingers: readonly { from: { x: number }; to: { x: number } }[], at: "from" | "to"): number =>
      fingers[1]![at].x - fingers[0]![at].x;

    it.each([
      // [화면, r, 앵커x, wideGap, narrowGap]  — 간격은 손으로 유도한 값이다.
      ["짝 간격 / 중앙", EVEN, 0.5, 540, 540, 270],
      ["짝 간격 / 가장자리 근접", EVEN, 0.5, 900, 540, 270],
      ["홀 간격 / 중앙", ODD_WIDTH, 0.5, 540, 541, 271],
      ["홀 간격 / 모서리 근접", ODD_WIDTH, 0.5, 3, 541, 271],
      ["엇갈린 홀짝 / 중앙", ODD_BOTH, 0.25, 540, 270, 135],
    ] as const)(
      "%s: 실제 좌표 간격이 산식의 간격과 정확히 같다 (짝·홀 모두)",
      (_label, screen, ratio, anchorX, wideGap, narrowGap) => {
        const fingers = computePinchFingers("out", ratio, { x: anchorX, y: 700 }, screen);

        expect(gapOf(fingers, "from")).toBe(narrowGap);
        expect(gapOf(fingers, "to")).toBe(wideGap);
      },
    );

    it("간격이 짝수이면 두 손가락이 앵커를 중심으로 대칭이다", () => {
      // EVEN 1080 · r=0.5 → wideGap 540(짝) · narrowGap 270(짝)
      const anchorX = 540;
      const [left, right] = computePinchFingers("out", 0.5, { x: anchorX, y: 700 }, EVEN);

      expect(anchorX - left.from.x).toBe(right.from.x - anchorX);
      expect(anchorX - left.to.x).toBe(right.to.x - anchorX);
    });

    it("간격이 홀수이면 한쪽이 앵커에서 정확히 1px 더 멀다 — 대칭은 불변식이 아니다", () => {
      // ODD_WIDTH 1081 · r=0.5 → wideGap 541(홀) · narrowGap 271(홀)
      const anchorX = 540;
      const [left, right] = computePinchFingers("out", 0.5, { x: anchorX, y: 700 }, ODD_WIDTH);

      expect(right.from.x - anchorX).toBe(anchorX - left.from.x + 1);
      expect(right.to.x - anchorX).toBe(anchorX - left.to.x + 1);
      // 그럼에도 간격은 정확히 보존된다 — 이것이 대칭을 이기는 쪽이다.
      expect(right.from.x - left.from.x).toBe(271);
      expect(right.to.x - left.to.x).toBe(541);
    });
  });

  it.each([
    ["짝·짝", EVEN],
    ["폭 홀", ODD_WIDTH],
    ["홀·홀", ODD_BOTH],
  ] as const)("out은 끝 간격이 시작 간격보다 크고 in은 그 반대다 (%s)", (_label, screen) => {
    const anchor = { x: 400, y: 700 };
    const gap = (finger: { from: { x: number }; to: { x: number } }[], at: "from" | "to"): number =>
      finger[1]![at].x - finger[0]![at].x;

    const out = computePinchFingers("out", 0.5, anchor, screen);
    const into = computePinchFingers("in", 0.5, anchor, screen);

    expect(gap(out, "to")).toBeGreaterThan(gap(out, "from"));
    expect(gap(into, "to")).toBeLessThan(gap(into, "from"));
  });
});

describe("pinchTravelPx — 손가락당 **실제 좌표** 이동 거리 (AC-GEST2-001/006, REQ-GEST2-PINCH-002 ④)", () => {
  /**
   * 0.4.0이 판정 대상을 바꿨다: 간격에서 유도한 이상적 산식
   * `round((wideGap − narrowGap)/2)`가 아니라, ③이 만든 **정수 좌표**에서
   * 손가락별로 잰 `|to.x − from.x|`의 **작은 쪽**이다.
   *
   * 아래 기댓값은 전부 **함수를 부르지 않고 손으로 유도한 상수**다. 유도 규칙:
   *   왼쪽 x(간격 g) = anchor − floor(g/2),  오른쪽 x(간격 g) = anchor + ceil(g/2)
   *   (정수 앵커에서 `Math.round(a ± g/2)`가 내는 값 — 반올림은 항상 +∞ 방향)
   *   travel_왼쪽 = |floor(W/2) − floor(N/2)|,  travel_오른쪽 = |ceil(W/2) − ceil(N/2)|
   */
  it.each([
    // [화면, r, wideGap, narrowGap, 왼쪽 이동, 오른쪽 이동, 판정 대상(작은 쪽)]
    ["짝·짝 r=0.5", EVEN, 0.5, 540, 270, 135, 135, 135],
    ["폭 홀 r=0.5", ODD_WIDTH, 0.5, 541, 271, 135, 135, 135],
    // W=270(짝) · N=135(홀) → 두 간격의 홀짝이 엇갈려 두 손가락이 갈린다.
    // 이상적 산식은 round((270−135)/2) = round(67.5) = 68을 내지만 오른쪽
    // 손가락은 실제로 67px만 움직인다 — 산식이 1px 크게 읽는 그 절반이다.
    ["홀·홀 r=0.25", ODD_BOTH, 0.25, 270, 135, 68, 67, 67],
    // AC-GEST2-006 회귀 픽스처(spec.md §C.1-⑭ 실행 출력):
    // 산식은 round((11−6)/2) = round(2.5) = 3을 내지만 왼쪽 손가락은 2px만 움직인다.
    ["회귀 픽스처 1080 r=0.01", EVEN, 0.01, 11, 6, 2, 3, 2],
  ] as const)(
    "%s — 왼쪽·오른쪽 이동량을 각각 재고 작은 쪽을 판정 대상으로 돌려준다",
    (_label, screen, ratio, _wide, _narrow, expectedLeft, expectedRight, expectedTravel) => {
      const [left, right] = computePinchFingers("out", ratio, { x: 540, y: 1110 }, screen);

      expect(Math.abs(left.to.x - left.from.x)).toBe(expectedLeft);
      expect(Math.abs(right.to.x - right.from.x)).toBe(expectedRight);
      expect(pinchTravelPx(ratio, screen)).toBe(expectedTravel);
    },
  );

  it("AC-GEST2-006 회귀 방지 — 간격에서 유도한 산식(3)을 판정 대상으로 쓰는 구현은 여기서 갈린다", () => {
    // 이 한 줄이 0.4.0 결함 2의 회귀 가드다. 산식을 되돌리면 3이 나오고,
    // 그 3은 실제로 2px만 움직이는 제스처를 문턱 2 아래에서 통과시킨다.
    expect(pinchTravelPx(0.01, EVEN)).toBe(2);
    expect(pinchTravelPx(0.01, EVEN)).not.toBe(3);
  });

  it("판정 대상은 두 손가락 중 **작은 쪽**이다 — 큰 쪽을 고르면 한 번도 작게 읽지 않는 성질이 깨진다", () => {
    const [left, right] = computePinchFingers("out", 0.01, { x: 540, y: 1110 }, EVEN);
    const travels = [Math.abs(left.to.x - left.from.x), Math.abs(right.to.x - right.from.x)];

    expect(pinchTravelPx(0.01, EVEN)).toBe(Math.min(...travels));
    expect(Math.min(...travels)).not.toBe(Math.max(...travels)); // 두 값이 실제로 갈리는 입력이다
  });

  it.each([
    ["짝·짝", EVEN],
    ["폭 홀", ODD_WIDTH],
    ["홀·홀", ODD_BOTH],
  ] as const)(
    "앵커에 의존하지 않는다 (%s) — 그래서 판정 함수가 앵커를 인자로 받지 않아도 된다",
    (_label, screen) => {
      for (const ratio of [0.01, 0.05, 0.13, 0.25, 0.5, 0.77]) {
        const expected = pinchTravelPx(ratio, screen);

        for (const anchorX of [0, 1, 2, 3, 137, 540, 541, screen.width - 1]) {
          const [left, right] = computePinchFingers("out", ratio, { x: anchorX, y: 100 }, screen);
          const travel = Math.min(Math.abs(left.to.x - left.from.x), Math.abs(right.to.x - right.from.x));

          expect(travel).toBe(expected);
        }
      }
    },
  );

  it("방향에 의존하지 않는다 — in과 out은 같은 거리를 반대로 움직인다", () => {
    for (const ratio of [0.01, 0.25, 0.5]) {
      const [outLeft, outRight] = computePinchFingers("out", ratio, { x: 540, y: 1110 }, ODD_BOTH);
      const [inLeft, inRight] = computePinchFingers("in", ratio, { x: 540, y: 1110 }, ODD_BOTH);

      expect(Math.abs(inLeft.to.x - inLeft.from.x)).toBe(Math.abs(outLeft.to.x - outLeft.from.x));
      expect(Math.abs(inRight.to.x - inRight.from.x)).toBe(Math.abs(outRight.to.x - outRight.from.x));
    }
  });

  it.each([
    ["짝·짝", EVEN],
    ["폭 홀", ODD_WIDTH],
    ["홀·홀", ODD_BOTH],
  ] as const)(
    "비율이 커질수록 이동 거리가 줄지 않는다 (단조 비감소, %s) — 유효 비율 탐색이 이 성질에 기댄다",
    (_label, screen) => {
      let previous = 0;
      for (let step = 1; step <= 1000; step++) {
        const travel = pinchTravelPx(step / 1000, screen);
        expect(travel).toBeGreaterThanOrEqual(previous);
        previous = travel;
      }
    },
  );
});

describe("isPinchOutOfBounds — 화면 밖 판정 (AC-GEST2-005, REQ-GEST2-PINCH-003)", () => {
  it("모서리 앵커에서 r=1이면 손가락이 화면 왼쪽 밖으로 나간다", () => {
    // wideGap = 1081 → 왼쪽 = round(0 − 540.5) = −540 < 0
    const fingers = computePinchFingers("out", 1, { x: 0, y: 0 }, ODD_BOTH);

    expect(isPinchOutOfBounds(fingers, ODD_BOTH)).toBe(true);
  });

  it("중앙 앵커에서도 r=1이면 오른쪽 끝점이 마지막 유효 픽셀을 넘는다", () => {
    // wideGap = 1080 → 오른쪽 = 540+540 = 1080, 유효 최대 x는 1079다.
    expect(isPinchOutOfBounds(computePinchFingers("out", 1, { x: 540, y: 1110 }, EVEN), EVEN)).toBe(true);
  });

  it("(양성 대조) 같은 화면·같은 앵커에서 범위 안의 비율은 화면 밖이 아니다", () => {
    // wideGap = round(0.9×1080) = 972 → 54 .. 1026, 둘 다 화면 안이다.
    expect(isPinchOutOfBounds(computePinchFingers("out", 0.9, { x: 540, y: 1110 }, EVEN), EVEN)).toBe(false);
  });

  it("앵커의 y가 화면 밖이면 간격과 무관하게 화면 밖이다", () => {
    expect(isPinchOutOfBounds(computePinchFingers("out", 0.1, { x: 540, y: 9999 }, EVEN), EVEN)).toBe(true);
  });
});

describe("isPinchTravelTooSmall — 초과 비교 (AC-GEST2-006, REQ-GEST2-PINCH-004)", () => {
  it("이동 거리가 문턱과 정확히 같으면 거부된다 (`>` 이지 `>=` 가 아니다)", () => {
    expect(isPinchTravelTooSmall(11, 11)).toBe(true);
  });

  it("문턱보다 1 크면 거부되지 않는다", () => {
    expect(isPinchTravelTooSmall(12, 11)).toBe(false);
  });
});

describe("pinchValidRatioRange — 되먹일 비율 (AC-GEST2-005/006, REQ-GEST2-PINCH-003/004)", () => {
  const CENTER = { x: 540, y: 1110 };
  const THRESHOLD = 11;

  it("최대 비율은 그대로 다시 넣으면 화면 안이고, 조금만 키우면 화면 밖이다 (왕복 검증)", () => {
    const range = pinchValidRatioRange(CENTER, EVEN, THRESHOLD);

    expect(range).toBeDefined();
    expect(isPinchOutOfBounds(computePinchFingers("out", range!.max, CENTER, EVEN), EVEN)).toBe(false);
    expect(isPinchOutOfBounds(computePinchFingers("out", range!.max + 0.001, CENTER, EVEN), EVEN)).toBe(true);
  });

  it("최대 비율은 문턱도 함께 넘는다 — 자기 자신이 거부할 값을 권하지 않는다", () => {
    const range = pinchValidRatioRange(CENTER, EVEN, THRESHOLD);

    expect(isPinchTravelTooSmall(pinchTravelPx(range!.max, EVEN), THRESHOLD)).toBe(false);
  });

  it("최소 비율은 문턱을 넘고, 조금만 줄이면 넘지 못한다 (왕복 검증)", () => {
    const range = pinchValidRatioRange(CENTER, EVEN, THRESHOLD);

    expect(isPinchTravelTooSmall(pinchTravelPx(range!.min, EVEN), THRESHOLD)).toBe(false);
    expect(isPinchTravelTooSmall(pinchTravelPx(range!.min * 0.999, EVEN), THRESHOLD)).toBe(true);
  });

  it("최소 비율도 화면 안이다 — 되먹인 값이 다른 코드로 거부되면 안 된다", () => {
    const range = pinchValidRatioRange(CENTER, EVEN, THRESHOLD);

    expect(isPinchOutOfBounds(computePinchFingers("out", range!.min, CENTER, EVEN), EVEN)).toBe(false);
  });

  it("앵커가 화면 가장자리에 붙어 어떤 간격도 들어가지 않으면 undefined다 — 없는 값을 지어내지 않는다", () => {
    // x=1079는 마지막 유효 픽셀이다. 간격이 1px만 되어도 오른쪽이 1080이 된다.
    expect(pinchValidRatioRange({ x: 1079, y: 1110 }, EVEN, THRESHOLD)).toBeUndefined();
  });

  it("화면이 너무 작아 문턱을 넘는 비율이 아예 없으면 undefined다", () => {
    // 12×12 화면에서 화면 안에 들어가는 최대 간격은 10px, 그때 이동 거리는 3px다.
    expect(pinchValidRatioRange({ x: 6, y: 6 }, { width: 12, height: 12 }, THRESHOLD)).toBeUndefined();
  });

  it("앵커 자체가 화면 밖이면 undefined다", () => {
    expect(pinchValidRatioRange({ x: 2000, y: 1110 }, EVEN, THRESHOLD)).toBeUndefined();
  });

  it("문턱을 mock으로 바꾸면 최소 비율이 함께 커진다 — 문턱은 이 모듈의 상수가 아니라 인자다", () => {
    const lenient = pinchValidRatioRange(CENTER, EVEN, 11);
    const strict = pinchValidRatioRange(CENTER, EVEN, 200);

    expect(strict!.min).toBeGreaterThan(lenient!.min);
  });
});
