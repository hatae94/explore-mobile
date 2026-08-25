/**
 * `pinch` 편의 계층이 방향·비율·앵커·화면 크기를 실제 두 손가락 좌표로 바꾸는
 * 순수 함수 모듈 (SPEC-GESTURE-002 M2, REQ-GEST2-PINCH-001/002/003/004).
 *
 * `scroll-geometry.ts`와 **같은 성격**이다: 기기 없이 픽스처로 검증되고,
 * 백엔드는 여기서 나온 좌표를 봉투에 싣는 일만 한다(spec.md §A.3 E5). 방향·
 * 비율·화면 크기는 백엔드 계층에 들어가지 않는다.
 *
 * 반올림 규칙은 `scroll-geometry.ts`의 `roundPixel`을 **그대로 재사용**한다 —
 * 두 기하 모듈이 서로 다른 반올림 정책을 가지면 같은 화면에서 `scroll`과
 * `pinch`의 좌표가 이유 없이 갈라진다.
 */

import type { PinchGesture, ScreenSize, SwipePoint } from "../../schema/device-backend.js";
import { roundPixel } from "./scroll-geometry.js";

export type PinchDirection = "in" | "out";

/**
 * 좁은 간격을 넓은 간격의 몇 배로 둘 것인가 (REQ-GEST2-PINCH-002 ②).
 *
 * **이 값은 설계 선택이지 실측값이 아니다.** spec.md §C.1-⑨가 기록하듯 실기기
 * 측정은 **기구**(포인터 2개가 한 요청에 실리면 확대가 일어난다)만 확인했고
 * 손가락 좌표를 남기지 않았다. 논증이 말할 수 있는 것은 양 끝을 배제하는
 * 것까지다: 두 손가락이 겹친 지점에서 출발하면 터치 두 개가 하나로 병합될 수
 * 있고, 좁은 간격을 넓은 간격 가까이 두면 이동 거리가 사라진다. 그 사이
 * 어딘가여야 한다는 것이 전부다.
 *
 * @MX:WARN — 실기기에서 확대가 관측되지 않으면 **먼저 이 값을 의심한다.**
 * @MX:REASON — 이 SPEC에서 유일하게 실측이 뒷받침하지 않는 축이 간격 산식이다
 * (지속시간 축은 spec.md §C.1-⑪이 여섯 값에서 동작을 관측했다). 확대 폭이
 * 부족해 보일 때 지속시간을 만지는 것은 헛수고일 가능성이 높고, 조정 순서는
 * plan.md §B.2가 정한다.
 */
const NARROW_GAP_RATIO = 0.5;

/** 이진 탐색 반복 횟수 — `minNonDegenerateRatio`와 같은 정밀도를 쓴다. */
const RATIO_SEARCH_ITERATIONS = 30;

/**
 * 이 화면에서 요청 비율이 만드는 **넓은 간격**(REQ-GEST2-PINCH-002 ①).
 * 화면 크기는 `backend.getScreenSize`가 공급하며(REQ-VISION-001) 이 모듈은
 * 새 화면 크기 출처를 만들지 않는다.
 */
function wideGapPx(ratio: number, screen: ScreenSize): number {
  return roundPixel(ratio * screen.width);
}

/** 좁은 간격 (REQ-GEST2-PINCH-002 ②). */
function narrowGapPx(ratio: number, screen: ScreenSize): number {
  return roundPixel(wideGapPx(ratio, screen) * NARROW_GAP_RATIO);
}

/**
 * 간격 `gap`일 때 두 손가락의 x 좌표 (REQ-GEST2-PINCH-002 ③).
 *
 * **간격이 홀수면 앵커 기준 대칭이 1px 어긋난다.** 두 끝점을 각각 반올림하면
 * 실제 좌표 간격은 `gap`과 **정확히** 같게 보존되지만(양쪽이 같은 방향으로
 * 0.5px 밀리므로), 앵커까지의 거리는 한쪽이 1px 멀어진다. 정수 픽셀 위에서 두
 * 성질을 동시에 만족시킬 수는 없으며, **간격 보존이 이긴다** — 기기의
 * 인식기가 읽는 신호는 두 손가락 사이 거리의 변화이지 앵커까지의 거리가
 * 아니고, 간격을 흔들면 같은 `--amount`가 화면·앵커에 따라 다른 간격을 내어
 * ②가 요구한 결정성이 깨진다(REQ-GEST2-PINCH-002 ③, 실행 확인 spec.md §C.1-⑮:
 * 6000표본 중 간격 보존 6000 · 비대칭 3005).
 *
 * 따라서 REQ-GEST2-PINCH-001의 "좌우 대칭"은 **간격이 짝수일 때 성립하는
 * 성질**이지 불변식이 아니다.
 */
function fingerXs(anchor: SwipePoint, gap: number): [number, number] {
  return [roundPixel(anchor.x - gap / 2), roundPixel(anchor.x + gap / 2)];
}

/**
 * 방향·비율·앵커·화면 크기로부터 두 손가락의 시작·끝 좌표를 계산한다
 * (REQ-GEST2-PINCH-001, REQ-GEST2-PINCH-002 ①~③).
 *
 * 두 손가락은 앵커를 지나는 **가로축** 위에 놓인다 — 네 점의 y가 모두 앵커의
 * y와 같다. 세로축이나 대각선을 쓰지 않는 이유는 단순성이다: 축을 고르는 것은
 * 측정으로 정해지지 않았고, 한 축을 고정해야 기하가 픽스처로 검증 가능해진다
 * (spec.md §D "대각선 · 세로축 핀치").
 *
 * `out`은 좁은 간격 → 넓은 간격(벌리기·확대), `in`은 그 반대다. **방향을
 * 반대로 구현해도 오류가 나지 않으므로**(spec.md §A.5), 응답이 실제 좌표를
 * 함께 실어 호출자가 즉시 검증할 수 있어야 한다(REQ-GEST2-PINCH-005).
 *
 * 반환값은 `backend.pinch`가 그대로 받는 2-튜플이다 — 이 계층이 좌표를
 * 계산하고 백엔드가 봉투 형태만 책임지는 분업은 `scroll`이 좌표를 계산해
 * `backend.swipe`에 넘기는 것과 같다.
 */
export function computePinchFingers(
  direction: PinchDirection,
  ratio: number,
  anchor: SwipePoint,
  screen: ScreenSize,
): [PinchGesture, PinchGesture] {
  const [narrowLeft, narrowRight] = fingerXs(anchor, narrowGapPx(ratio, screen));
  const [wideLeft, wideRight] = fingerXs(anchor, wideGapPx(ratio, screen));

  const spreading = direction === "out";
  const [leftStart, leftEnd] = spreading ? [narrowLeft, wideLeft] : [wideLeft, narrowLeft];
  const [rightStart, rightEnd] = spreading ? [narrowRight, wideRight] : [wideRight, narrowRight];

  return [
    { from: { x: leftStart, y: anchor.y }, to: { x: leftEnd, y: anchor.y } },
    { from: { x: rightStart, y: anchor.y }, to: { x: rightEnd, y: anchor.y } },
  ];
}

/**
 * 이동량 측정에 쓰는 기준 앵커.
 *
 * 실제 이동량은 **앵커에 의존하지 않으므로**(아래 산술 + spec.md §C.1-⑭의
 * 1200 비교 중 0건) 어느 앵커에서 재도 같은 값이 나온다. 정수 앵커 `a`와
 * 정수 간격 `g`에서 `Math.round`(항상 +∞ 방향)는
 * `왼쪽 = a − floor(g/2)` · `오른쪽 = a + ceil(g/2)`를 내므로, 두 이동량
 * `|floor(W/2) − floor(N/2)|` · `|ceil(W/2) − ceil(N/2)|`에서 `a`가 소거된다.
 */
const TRAVEL_REFERENCE_ANCHOR: SwipePoint = { x: 0, y: 0 };

/**
 * 손가락 **하나**가 실제로 움직이는 거리 중 **작은 쪽**
 * (REQ-GEST2-PINCH-002 ④) — 문턱 판정의 대상이다(REQ-GEST2-PINCH-004).
 *
 * **③이 만든 정수 좌표에서 잰다 — 간격에서 유도하지 않는다(0.4.0).**
 * 0.3.0까지 이 자리는 `round((wideGap − narrowGap) / 2)`였고, 그 값은 손가락이
 * 실제로 움직이는 거리가 **아니었다**: 반올림이 두 번 개입하기 때문이다
 * (①②가 간격을 정수로 만들 때 한 번, ③이 간격을 두 손가락 x로 나눌 때 한 번).
 * 4000표본 실행 결과 산식은 **과대 2001 · 일치 1999 · 과소 0** — 한 번도 작게
 * 읽지 않고 절반에서 정확히 1px 크게 읽었다(spec.md §C.1-⑭).
 *
 * **과대 읽기의 방향이 치명적이다.** 판정 대상이 실제보다 크면 실제 이동이
 * 문턱 아래인 제스처가 검사를 통과한다 — 산물은 `ok:true`인데 화면은 그대로인
 * 것이고, 그것이 REQ-GEST2-PINCH-004가 존재하는 이유 그 자체다. 가장 극단적인
 * 관측은 산식 1px · 왼쪽 손가락 **0px**이었다.
 *
 * **왜 두 손가락 중 작은 쪽인가.** 문턱은 손가락 **하나**의 변위로 측정된
 * 값이고, 느린 쪽이 인식되지 않으면 남는 것은 한 손가락 드래그 —
 * 그것도 `ok:true`-무확대다. 어느 손가락이 인식을 지배하는지는 측정된 적이
 * 없으므로(spec.md §C.2) 보수적인 쪽을 고른다.
 *
 * **간격 변화량으로 대체하지 않는다.** 간격 변화는 정수 좌표 위에서도 정확히
 * 보존되어 반올림 문제가 없어 보이지만, 그것은 두 이동량의 **합**이며
 * **문턱과 단위가 맞지 않는다** — 문턱은 손가락 하나의 변위다. 다음 사람이 이
 * 자리를 "단순화"하지 않도록 적어 둔다.
 *
 * `scroll`의 퇴화 판정(`scroll-geometry.ts`의 `isDegenerateSwipe`)도 반올림
 * **이후** 좌표로 이뤄진다 — 이 함수는 그 전례와 같은 자리로 돌아온 것이다.
 *
 * @MX:ANCHOR: [AUTO] REQ-GEST2-PINCH-004의 판정 대상 — 이 값이 실제 이동량보다 크게 읽히면 문턱 아래 제스처가 검사를 통과해 ok:true인 채로 화면이 그대로인 산물이 나온다
 * @MX:REASON: fan_in >= 3(pinch.ts의 AMOUNT_TOO_SMALL 거부 경로 + pinchValidRatioRange의 이진 탐색 + 두 테스트 파일의 회귀 픽스처) — 간격에서 유도하는 산식으로 되돌리면 표본 절반에서 1px 크게 읽고(과소 읽기 0건) AC-GEST2-006의 회귀 픽스처(폭 1080 · r=0.01 → 2 이지 3이 아니다)가 정확히 그 회귀를 잡는다
 */
export function pinchTravelPx(ratio: number, screen: ScreenSize): number {
  const [left, right] = computePinchFingers("out", ratio, TRAVEL_REFERENCE_ANCHOR, screen);

  return Math.min(Math.abs(left.to.x - left.from.x), Math.abs(right.to.x - right.from.x));
}

/**
 * 계산된 손가락 좌표가 화면 밖으로 나가는지 판정한다
 * (REQ-GEST2-PINCH-003).
 *
 * 유효 좌표는 `0 .. 크기−1`이다 — `image/geometry.ts`의 `toDeviceCoordinate`가
 * 클램프하는 범위와 같은 규칙을 쓴다.
 *
 * **자르지 않는다(clamp 금지).** 좌표를 화면 안으로 접으면 두 손가락 간격이
 * 비대칭이 되고 실제 확대 배율이 요청과 달라지는데, 응답은 `ok:true`가 된다 —
 * SPEC-GESTURE-001이 1px 클램프를 거부하며 확립한 판정 그대로다:
 * **탐지 가능한 실패를 탐지 불가능한 실패로 바꾸지 않는다.**
 *
 * @MX:ANCHOR: [AUTO] REQ-GEST2-PINCH-003 전체가 기대는 판정 — 이 술어가 느슨해지면 화면 밖 좌표가 잘린 채 전송되고 요청과 다른 배율이 ok:true로 보고된다
 * @MX:REASON: fan_in >= 3(pinch.ts의 PINCH_OUT_OF_BOUNDS 거부 경로 + pinchValidRatioRange 내부 이진 탐색 + pinch-geometry.test.ts 다수 픽스처) — 자르는 구현으로 되돌리면 AC-GEST2-005가 막는 정확한 회귀가 조용히 재발한다
 */
export function isPinchOutOfBounds(fingers: [PinchGesture, PinchGesture], screen: ScreenSize): boolean {
  const inside = (point: SwipePoint): boolean =>
    point.x >= 0 && point.x <= screen.width - 1 && point.y >= 0 && point.y <= screen.height - 1;

  return fingers.some((finger) => !inside(finger.from) || !inside(finger.to));
}

/**
 * 손가락당 이동 거리가 이 기기의 화면을 움직이기에 부족한지 판정한다
 * (REQ-GEST2-PINCH-004).
 *
 * **초과 비교다** — 거리가 문턱과 정확히 같으면 거부되고, 문턱보다 1 크면
 * 거부되지 않는다(AC-GEST2-006).
 *
 * 문턱은 이 모듈의 상수가 아니라 **인자**다. `backend.getMinEffectiveSwipeThreshold`가
 * 플랫폼별로 공급하며(REQ-GEST-SCROLL-008), 이 SPEC은 두 번째 문턱 출처를
 * 만들지 않는다.
 *
 * @MX:WARN — 이 문턱은 **한 손가락 스와이프**에서 측정된 값이다. 두 손가락
 * 제스처의 인식 문턱은 아무도 재지 않았다(spec.md §C.1-⑩).
 * @MX:REASON — 그래서 이 술어는 보수적 하한으로만 쓴다: "문턱 이하는 화면을
 * 못 움직인다"는 안전한 방향이지만 **그 역("문턱을 넘으면 인식된다")은 이
 * 저장소가 주장하지 않는다.** 역을 주장하는 테스트를 쓰면 측정하지 않은 기기
 * 동작 주장이 된다(AC-GEST2-006 단서).
 */
export function isPinchTravelTooSmall(travelPx: number, thresholdPx: number): boolean {
  return travelPx <= thresholdPx;
}

/**
 * 이 앵커·화면·문턱에서 **유효한 비율의 구간**을 찾는다 — 거부 응답에 실어
 * 호출자가 다시 시도할 값을 알 수 있게 한다(REQ-GEST2-PINCH-003의
 * `maxValidRatio`, REQ-GEST2-PINCH-004의 `minValidRatio`).
 *
 * 두 끝을 한 함수가 돌려주는 이유는 **둘이 한 구간의 양 끝이기 때문**이다.
 * 화면 안 판정은 비율이 커질수록 조여들고(단조 감소) 문턱 판정은 비율이
 * 커질수록 풀리므로(단조 증가), 유효한 비율은 언제나 하나의 닫힌 구간이거나
 * 아예 비어 있다. 구간이 비면 **`undefined`를 돌려주고 없는 값을 지어내지
 * 않는다**(SPEC-GESTURE-001 0.8.0 NN5가 확립한 규율) — 자기 자신이 거부할
 * 값을 권하면 오류 코드가 호출자를 그 코드가 막으려던 상태로 되돌려보낸다.
 *
 * 구간이 비는 경우는 둘이다: **앵커가 가장자리에 붙어** 문턱을 넘는 간격이
 * 화면에 들어가지 않거나, **화면이 너무 작아** 어떤 비율도 문턱을 넘지 못하는
 * 경우다.
 *
 * 닫힌 형태 대신 실제 함수 출력으로 이진 탐색하는 것은 `minNonDegenerateRatio`와
 * 같은 이유다 — 반올림이 두 번 개입해(간격 한 번, 좌표 한 번) 화면의 정확한
 * 중심 정렬에 따라 임계 비율이 달라지므로, 공식으로 유도한 값은 되먹였을 때
 * 다시 거부될 수 있다.
 */
export function pinchValidRatioRange(
  anchor: SwipePoint,
  screen: ScreenSize,
  thresholdPx: number,
): { min: number; max: number } | undefined {
  const outOfBounds = (ratio: number): boolean =>
    isPinchOutOfBounds(computePinchFingers("out", ratio, anchor, screen), screen);
  const tooSmall = (ratio: number): boolean => isPinchTravelTooSmall(pinchTravelPx(ratio, screen), thresholdPx);

  const max = largestInBoundsRatio(outOfBounds);
  // 화면 안에 남는 가장 큰 비율조차 문턱을 넘지 못하면 구간이 비어 있다.
  if (max === undefined || tooSmall(max)) return undefined;

  return { min: smallestEffectiveRatio(tooSmall, max), max };
}

/** 화면 안에 머무는 가장 큰 비율. 어떤 양의 비율도 들어가지 않으면 `undefined`. */
function largestInBoundsRatio(outOfBounds: (ratio: number) => boolean): number | undefined {
  if (!outOfBounds(1)) return 1;
  // 비율 0은 두 손가락이 앵커에 겹친 상태다 — 그조차 화면 밖이면 앵커 자체가
  // 화면 밖이므로 되먹일 비율이 없다.
  if (outOfBounds(0)) return undefined;

  let lo = 0; // 화면 안임이 확인된 값
  let hi = 1; // 화면 밖임이 확인된 값
  for (let i = 0; i < RATIO_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (outOfBounds(mid)) hi = mid;
    else lo = mid;
  }
  // 탐색이 한 번도 전진하지 못했다면 화면 안에 들어가는 양의 비율이 없다.
  return lo > 0 ? lo : undefined;
}

/** 문턱을 넘는 가장 작은 비율. `passingRatio`는 넘는 것이 확인된 상한이다. */
function smallestEffectiveRatio(tooSmall: (ratio: number) => boolean, passingRatio: number): number {
  let lo = 0; // 문턱을 넘지 못함이 확인된 값 (간격 0 → 이동 거리 0)
  let hi = passingRatio; // 문턱을 넘음이 확인된 값
  for (let i = 0; i < RATIO_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (tooSmall(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}
