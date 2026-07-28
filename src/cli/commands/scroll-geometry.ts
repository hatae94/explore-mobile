/**
 * `scroll` 편의 계층이 방향+비율을 실제 swipe 좌표로 바꾸는 순수 함수 모듈
 * (SPEC-GESTURE-001 M3, REQ-GEST-SCROLL-001/002/003).
 *
 * 새 백엔드 메서드를 추가하지 않는다(spec.md §F, plan.md §F M3) — 화면
 * 크기는 기존 `dumpUiHierarchy()`가 돌려주는 `CommonElement[]`에서
 * 파생하고(REQ-GEST-SCROLL-002), 방향·비율 변환은 기기 없이 테스트
 * 가능한 순수 함수로 뗀다(plan.md §F M3 item 3 — 두 실수를 각각 다른
 * 픽스처로 잡기 위해 같은 함수 경계 안에 둔다: 최상위 여러 개 + witness
 * 있음(AC-GEST-008)으로 인덱스 0 가정을 배제하고, 조각들만 있고 witness
 * 없음(AC-GEST-017)으로 witness 누락을 배제한다).
 */

import type { CommonElement } from "../../schema/common-element.js";
import type { SwipePoint } from "../../schema/device-backend.js";

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface ScreenSize {
  width: number;
  height: number;
}

export interface SwipeCoordinates {
  from: SwipePoint;
  to: SwipePoint;
}

/**
 * REQ-GEST-SCROLL-002 화면 크기 파생 — 두 단계 모두 필요하다:
 *
 * ① 후보 산출: 최상위 항목 전체를 훑어 `width = max(x+w)`, `height = max(y+h)`.
 * ② witness 검증: 후보를 채택하려면 최상위 항목 중 bounds가 **정확히**
 *    `{x:0, y:0, w:width, h:height}`인 것이 하나 이상 있어야 한다.
 *
 * 원점 조건(`x===0 && y===0`)이 빠지면 우하단 모서리에만 닿는 조각(예:
 * Safari 크롬-only 상태의 진행 표시 `{0,104,402,16}` — `x+w=402`,
 * `y+h=120`은 후보와 일치하지만 `y=104`)도 witness로 통과해 버린다
 * (AC-GEST-017). ①만으로는 조각들의 외접 상자(같은 상태에서 402x120)가
 * 화면 크기로 잘못 채택된다 — max-extent는 크기 0이 아닌 요소가 하나라도
 * 있으면 언제나 양수를 낸다. ②가 그 구멍을 막는다.
 *
 * 인덱스 0을 루트로 가정하지 않는다 — 최상위 항목이 여럿일 수 있고(iOS
 * `describe-all`은 중첩 없는 평탄 배열, Android도 `hierarchy`의 자식들을
 * 배열로 반환) 화면 전체 요소가 어느 위치에 있는지 보장되지 않는다
 * (AC-GEST-008).
 *
 * 화면 크기를 신뢰할 수 없으면(빈 배열, 퇴화 크기, witness 없음)
 * `undefined`를 반환한다 — REQ-GEST-SCROLL-004, 호출자(`scroll.ts`)가
 * 이를 `SCREEN_SIZE_UNKNOWN`으로 거부하고 어떤 제스처도 보내지 않는다.
 *
 * @MX:ANCHOR: [AUTO] scroll 편의 계층 전체가 기대는 화면 크기 파생 불변식 — witness 없이 채택하면 되돌릴 수 없는 제스처를 잘못된 크기로 보낸다
 * @MX:REASON: fan_in >= 3(scroll.ts 호출 + scroll.test.ts·scroll-geometry.test.ts 다수 픽스처가 이 계약에 고정) — witness 요건(원점 조건 포함)을 깨면 AC-GEST-008/017이 검증하는 정확한 회귀(Safari 크롬-only 402x120 오채택)가 조용히 재발한다(plan.md §B.5)
 */
export function deriveScreenSize(elements: CommonElement[]): ScreenSize | undefined {
  if (elements.length === 0) return undefined;

  let width = 0;
  let height = 0;
  for (const element of elements) {
    const right = element.bounds.x + element.bounds.w;
    const bottom = element.bounds.y + element.bounds.h;
    if (right > width) width = right;
    if (bottom > height) height = bottom;
  }

  if (width <= 0 || height <= 0) return undefined;

  const hasWitness = elements.some(
    (element) =>
      element.bounds.x === 0 && element.bounds.y === 0 && element.bounds.w === width && element.bounds.h === height,
  );
  if (!hasWitness) return undefined;

  return { width, height };
}

/**
 * 화면 가장자리 여백 비율(B-8) — `--amount 1`이어도 손가락이 화면 맨
 * 끝(좌표 0 또는 화면 크기)에서 시작/종료하지 않도록 한다. 5%는 임의의
 * 값이지만 문서화된 정책이다 — 더 큰 값은 최대 이동 거리를 과도하게
 * 줄이고, 0은 B-8이 지적한 "맨 끝에서 시작" 문제를 그대로 남긴다.
 */
const EDGE_MARGIN_RATIO = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 픽셀 좌표 반올림 규칙(B-2) — bounds는 정수가 아닐 수 있다(2026-07-27
 * 실측: Safari 주소창 TextField의 `h: 14.333333333333371`). 백엔드는 정수
 * 픽셀만 받으므로(`parseCoordinate`의 `^\d+$` 정규식) 화면 크기나 중간
 * 계산이 소수여도 최종 좌표는 반드시 정수여야 한다. 표준 반올림
 * (`Math.round`, 사사오입)을 택했다 — ±0.5px 오차는 제스처 정확도에
 * 영향이 없고, 올림/버림 같은 다른 정책을 정당화할 근거가 없다.
 */
export function roundPixel(value: number): number {
  return Math.round(value);
}

/**
 * 방향·비율·화면 크기로부터 swipe 시작·끝 좌표를 계산한다(REQ-GEST-SCROLL-001,
 * REQ-GEST-SCROLL-003, REQ-GEST-SCROLL-005).
 *
 * 방향 의미(B-2, REQ-GEST-SCROLL-001): "scroll down"은 **아래 내용을
 * 보기 위해** 손가락을 위로 미는 동작이다 — 끝점 y가 시작점 y보다
 * 작다(AC-GEST-007/016). 좌우도 같은 규칙을 대칭 적용한다: "scroll
 * right"는 오른쪽 내용을 보기 위해 손가락을 왼쪽으로 민다.
 *
 * 여백 정책(B-8): `EDGE_MARGIN_RATIO`만큼 화면 가장자리를 피해 좌표를
 * clamp한다. 스크롤 축이 아닌 좌표(세로 스크롤의 x, 가로 스크롤의 y)는
 * 화면 중앙으로 고정한다.
 */
export function computeScrollSwipe(direction: ScrollDirection, ratio: number, screen: ScreenSize): SwipeCoordinates {
  const isVertical = direction === "up" || direction === "down";
  const dimension = isVertical ? screen.height : screen.width;
  const margin = dimension * EDGE_MARGIN_RATIO;
  const usable = Math.max(dimension - margin * 2, 0);
  const distance = ratio * usable;
  const center = dimension / 2;
  const half = distance / 2;

  // "scroll down"/"scroll right"는 화면의 먼 쪽 내용을 보여준다 -> 손가락은
  // 가까운 쪽으로 움직인다(시작점이 먼 쪽 값, 끝점이 가까운 쪽 값).
  const revealsFarSide = direction === "down" || direction === "right";
  const startPos = clamp(revealsFarSide ? center + half : center - half, margin, dimension - margin);
  const endPos = clamp(revealsFarSide ? center - half : center + half, margin, dimension - margin);

  const fixedAxis = roundPixel(isVertical ? screen.width / 2 : screen.height / 2);
  const from: SwipePoint = isVertical
    ? { x: fixedAxis, y: roundPixel(startPos) }
    : { x: roundPixel(startPos), y: fixedAxis };
  const to: SwipePoint = isVertical
    ? { x: fixedAxis, y: roundPixel(endPos) }
    : { x: roundPixel(endPos), y: fixedAxis };

  return { from, to };
}

/**
 * `computeScrollSwipe`가 만든 좌표가 퇴화(같은 점)인지 판정한다(SPEC-GESTURE-001
 * M6/0.4.0 amendment — F1, REQ-GEST-SCROLL-007, plan.md §F M6 item 2).
 *
 * 판정 위치는 **반올림 이후** 좌표다 — 반올림 전 거리는 0.79px처럼 0이
 * 아닐 수 있지만, 정수 픽셀로 반올림된 뒤 같은 픽셀로 접히는 것이 실제
 * 결함이다(402x874에서 `--amount 0.001` -> `from.y=to.y=437`, 실측
 * `scrollY 3212->3212`, 스크린샷 바이트 동일, spec.md §C.1-⑫). 반올림
 * 전 값으로 판정하면 이 결함을 못 잡는다.
 *
 * 스크롤 축이 아닌 좌표(세로 스크롤의 x, 가로 스크롤의 y)는 항상 두 점에서
 * 같으므로(§ computeScrollSwipe `fixedAxis`), `from`·`to` 전체가 같은지만
 * 보면 방향에 관계없이 충분하다.
 */
export function isDegenerateSwipe(coords: SwipeCoordinates): boolean {
  return coords.from.x === coords.to.x && coords.from.y === coords.to.y;
}

/**
 * 이 화면·방향에서 퇴화하지 않는 최소 `--amount` 비율을 찾는다(F1,
 * REQ-GEST-SCROLL-007) — 거부 응답에 실어 호출자가 다시 시도할 값을 알 수
 * 있게 한다(AC-GEST-018).
 *
 * 반올림된 좌표 차이는 비율이 커질수록 늘거나 그대로다(단조 비감소) —
 * `center ± half`가 각각 바깥으로만 움직이므로 독립 반올림 결과의 차이도
 * 줄어들 수 없다. 그래서 이진 탐색으로 임계값을 찾는 것이 안전하다.
 * 화면의 정확한 중심 정렬(정수/반정수)에 따라 임계 비율이 달라지므로
 * 닫힌 형태 공식 대신 실제 `computeScrollSwipe` 출력으로 직접 탐색한다.
 *
 * `ratio=1`은 비퇴화라고 가정한다 — 실제 기기 화면 크기(수백 px 이상)에서는
 * 항상 참이다. 화면이 지나치게 작아 `ratio=1`도 퇴화라면(비현실적인 입력),
 * 그 경우는 이미 REQ-GEST-SCROLL-004의 화면 크기 거부 대상이다.
 */
export function minNonDegenerateRatio(direction: ScrollDirection, screen: ScreenSize): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (isDegenerateSwipe(computeScrollSwipe(direction, mid, screen))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}
