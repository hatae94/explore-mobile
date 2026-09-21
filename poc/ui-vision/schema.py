"""
탐지 결과의 데이터 모양(스키마)을 정의한다.

요구사항 1: 각 요소는 type, text, bbox, confidence, enabled, clickable을 가진다.
요구사항 2: bbox는 축소 이미지 좌표만 단독으로 넘기지 않는다 — 이 스키마의
최상위 `DetectionResult`가 요소 목록과 `ScreenshotGeometry`(explore-mobile
CLI의 ScreenshotPayload와 같은 7개 필드: width, height, deviceWidth,
deviceHeight, scale, format, capturedAt)를 함께 묶는다. 실제 기기 좌표로의
변환은 저장 시점이 아니라 탭을 실행하기 직전에 한다(coords.py).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

# "icon"류(버튼/아이콘)과 "text"류(순수 텍스트) 외에, 탐색 안정성을 위해
# 요청받은 특수 영역 4종을 별도 타입으로 둔다(요구사항 4).
ElementType = Literal[
    "icon",
    "text",
    "keyboard",
    "permission_popup",
    "toast",
    "status_bar",
    "bottom_nav",
]


@dataclass(slots=True)
class BBox:
    """축소된 스크린샷 이미지 좌표계의 사각형(px). 기기 좌표가 아니다."""

    x: int
    y: int
    width: int
    height: int


@dataclass(slots=True)
class UIElement:
    type: ElementType
    text: str
    bbox: BBox
    confidence: float
    enabled: bool
    clickable: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class ScreenshotGeometry:
    """`src/schema/command-payloads.ts`의 ScreenshotPayload 기하 7필드와 이름을
    그대로 맞춘다 — 나중에 JEV 쪽에서 두 스키마를 나란히 읽을 때 필드명이
    갈라지지 않게 하기 위해서다."""

    width: int
    height: int
    deviceWidth: int
    deviceHeight: int
    scale: float
    format: str
    capturedAt: str


@dataclass(slots=True)
class DetectionResult:
    """PoC 최종 산출물 — 합성 이미지 옆에 두는 JSON 데이터 리스트."""

    source_image: str
    geometry: ScreenshotGeometry
    elements: list[UIElement] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source_image": self.source_image,
            "geometry": asdict(self.geometry),
            "elements": [e.to_dict() for e in self.elements],
        }
