"""
이미지 좌표 → 기기 좌표 변환.

**이 파일은 `src/image/geometry.ts`의 `toDeviceCoordinate`를 그대로 미러링한
것이다.** 그 함수가 `tap`/`swipe`/`scroll` 세 명령이 공유하는 유일한 변환
지점(@MX:ANCHOR)이므로, 실제 통합 단계에서는 이 Python 복제본을 지우고
TS 쪽 함수를 호출하는 경계(서브프로세스나 작은 브리지 명령)를 두는 편이
맞다 — 같은 산술을 두 언어로 각자 유지하면 한쪽만 고쳐졌을 때 조용히
갈라진다. 지금은 PoC 범위라 최소 복제로 둔다.

요구사항 2: 탐지 결과 JSON에는 **이미지 좌표** bbox만 담는다. 이 변환은
실제로 탭을 보내기 직전, 그 순간의 최신 geometry로만 호출한다 — 저장된
JSON에 기기 좌표를 미리 구워 넣지 않는다.
"""

from __future__ import annotations

import math

from schema import ScreenshotGeometry


def to_device_coordinate(geometry: ScreenshotGeometry, x: float, y: float) -> tuple[int, int]:
    """`Math.round`와 동일하게(0.5는 항상 올림) 반올림한 뒤 기기 해상도
    경계 안으로 자른다. bbox 좌표는 항상 0 이상이므로 `floor(v + 0.5)`로
    충분하다 — 파이썬 내장 `round()`는 banker's rounding이라 이 지점에서
    JS의 `Math.round`와 어긋날 수 있다."""

    def js_round(value: float) -> int:
        return math.floor(value + 0.5)

    def clamp(value: int, max_value: int) -> int:
        return min(max(value, 0), max_value)

    device_x = clamp(js_round(x * geometry.scale), geometry.deviceWidth - 1)
    device_y = clamp(js_round(y * geometry.scale), geometry.deviceHeight - 1)
    return device_x, device_y
