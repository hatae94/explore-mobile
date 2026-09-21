"""
YOLO UI 탐지기(OmniParser icon_detect) + OCR(EasyOCR) 파이프라인.

1. YOLO로 아이콘/버튼 후보 사각형을 찾는다 (클래스가 "icon" 하나뿐이라
   종류 구분은 하지 않는다 — 그냥 "눌릴 수 있어 보이는 상자"다).
2. OCR로 화면 속 글자를 모두 읽는다 — 위치(bbox)와 텍스트, 신뢰도가 나온다.
3. 아이콘 상자 바로 아래(또는 겹치는) 텍스트를 그 아이콘의 라벨로 합친다
   (요구사항 3 — "텍스트가 Save인 버튼"처럼 나중에 이름으로 찾을 수 있게).
   합쳐지지 않은 텍스트는 독립된 "text" 요소로 남는다.
4. 합성 이미지에 상자와 라벨을 그려 저장한다.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from schema import BBox, UIElement

ICON_CONFIDENCE_THRESHOLD = 0.3

# 아이콘 라벨 병합: 아이콘 가로 범위와 텍스트 가로 범위가 이만큼은
# 겹쳐야 "같은 아이콘의 라벨"로 본다(오탐 방지).
LABEL_MIN_X_OVERLAP_RATIO = 0.3
# 텍스트가 아이콘 바로 아래에 있다고 볼 세로 간격 상한 — 아이콘 높이의 배수
# **이면서 동시에** 절대 픽셀 상한(작은 아이콘일수록 배수만으로는 너무
# 넉넉해진다). 실측(재생 화면)에서 접기 버튼(높이 125px)이 91px 아래의
# 전혀 무관한 앨범아트 워터마크 "IU" 글자를 라벨로 잘못 삼켰다 —
# 125×1.5=187px까지 허용됐던 게 원인. 절대 상한을 추가해 작은 아이콘에는
# 배수가 아니라 이 값이 실제로 걸리게 한다.
LABEL_MAX_VERTICAL_GAP_RATIO = 1.5
LABEL_MAX_VERTICAL_GAP_PX = 40

# 클릭 가능하다고 볼 최종 타입 — classify.py가 type을 바꾼 *이후*에 적용한다.
# "text"도 포함한다: OCR 글자는 icon처럼 "눌릴 것 같은 상자" 신호가 없어
# 원래 clickable=False로 뒀지만, 실측에서 메뉴 항목("보관함에 저장")·하단
# 탭 라벨("검색")처럼 실제로 눌리는 요소 상당수가 순수 텍스트로만 잡혀서
# 후보에서 전부 빠지는 게 더 큰 문제로 확인됐다 — status_bar·toast는
# 실제로 안 눌리는 게 확실해서 그대로 제외한다.
CLICKABLE_TYPES = {"icon", "bottom_nav", "keyboard", "permission_popup", "text"}

TYPE_COLORS = {
    "icon": "#22c55e",
    "text": "#3b82f6",
    "keyboard": "#a855f7",
    "permission_popup": "#f97316",
    "toast": "#eab308",
    "status_bar": "#64748b",
    "bottom_nav": "#64748b",
}


def _run_icon_detection(image_path: Path, model_path: Path, model=None) -> list[UIElement]:
    """`model`을 주면(model_server.py처럼 미리 불러온 걸 재사용할 때) 새로
    불러오지 않는다 — 안 주면 지금까지처럼 매번 새로 불러온다(기존 동작 유지)."""
    if model is None:
        from ultralytics import YOLO  # 무거운 import라 실제로 쓸 때만 불러온다.

        model = YOLO(str(model_path))
    results = model.predict(str(image_path), conf=ICON_CONFIDENCE_THRESHOLD, verbose=False)

    elements: list[UIElement] = []
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            confidence = float(box.conf[0])
            elements.append(
                UIElement(
                    type="icon",
                    text="",
                    bbox=BBox(x=round(x1), y=round(y1), width=round(x2 - x1), height=round(y2 - y1)),
                    confidence=confidence,
                    enabled=True,
                    clickable=True,
                )
            )
    return elements


def _run_ocr(image_path: Path, reader=None) -> list[UIElement]:
    """`reader`를 주면(model_server.py처럼 미리 불러온 걸 재사용할 때) 새로
    불러오지 않는다 — 안 주면 지금까지처럼 매번 새로 불러온다(기존 동작 유지)."""
    if reader is None:
        import easyocr  # 무거운 import라 실제로 쓸 때만 불러온다.

        # gpu=True: 이 macOS 기기는 easyocr 1.7.2가 자동으로 MPS(애플
        # 실리콘 GPU)를 골라 쓴다(easyocr.py의 torch.backends.mps.is_available()
        # 분기). 실측 결과 원본 해상도 추론이 CPU 대비 5배 빨라졌고
        # (~3.0초 → ~0.65초, 첫 호출만 MPS 워밍업으로 ~2.7초), 인식된
        # 텍스트 37개가 CPU 결과와 글자 하나까지 완전히 동일했다 —
        # 정확도 손실 없는 순수 속도 개선이다.
        reader = easyocr.Reader(["ko", "en"], gpu=True, verbose=False)
    results = reader.readtext(str(image_path))

    elements: list[UIElement] = []
    for polygon, text, confidence in results:
        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        x1, x2 = min(xs), max(xs)
        y1, y2 = min(ys), max(ys)
        elements.append(
            UIElement(
                type="text",
                text=text,
                bbox=BBox(x=round(x1), y=round(y1), width=round(x2 - x1), height=round(y2 - y1)),
                confidence=float(confidence),
                enabled=True,
                clickable=False,
            )
        )
    return elements


def _overlap_1d(a1: float, a2: float, b1: float, b2: float) -> float:
    return max(0.0, min(a2, b2) - max(a1, b1))


def _merge_icon_labels(icons: list[UIElement], texts: list[UIElement]) -> list[UIElement]:
    """아이콘과, 그 아이콘의 라벨로 보이는 텍스트를 하나로 합친다."""
    used_text_indices: set[int] = set()

    for icon in icons:
        icon_left, icon_right = icon.bbox.x, icon.bbox.x + icon.bbox.width
        icon_bottom = icon.bbox.y + icon.bbox.height
        best_index = None
        best_overlap = 0.0

        for i, text_el in enumerate(texts):
            if i in used_text_indices:
                continue
            t_left = text_el.bbox.x
            t_right = text_el.bbox.x + text_el.bbox.width
            t_top = text_el.bbox.y
            t_bottom = text_el.bbox.y + text_el.bbox.height

            x_overlap = _overlap_1d(icon_left, icon_right, t_left, t_right)
            min_width = min(icon.bbox.width, text_el.bbox.width, 1)
            if x_overlap / min_width < LABEL_MIN_X_OVERLAP_RATIO:
                continue

            overlapping_vertically = not (t_bottom < icon.bbox.y or t_top > icon_bottom)
            max_gap = min(icon.bbox.height * LABEL_MAX_VERTICAL_GAP_RATIO, LABEL_MAX_VERTICAL_GAP_PX)
            below_within_gap = 0 <= (t_top - icon_bottom) <= max_gap
            if not (overlapping_vertically or below_within_gap):
                continue

            if x_overlap > best_overlap:
                best_overlap = x_overlap
                best_index = i

        if best_index is not None:
            icon.text = texts[best_index].text
            used_text_indices.add(best_index)

    leftover_texts = [t for i, t in enumerate(texts) if i not in used_text_indices]
    return [*icons, *leftover_texts]


def detect(image_path: Path, model_path: Path, *, model=None, reader=None) -> list[UIElement]:
    """`model`/`reader`를 주면 그걸 재사용한다(model_server.py 전용 경로) —
    안 주면 기존과 동일하게 매번 새로 불러온다."""
    icons = _run_icon_detection(image_path, model_path, model=model)
    texts = _run_ocr(image_path, reader=reader)
    return _merge_icon_labels(icons, texts)


def apply_clickable(elements: list[UIElement]) -> None:
    """classify.py가 type을 다 정한 *뒤에* 호출한다 — 최종 타입 기준으로
    클릭 가능 여부를 다시 매긴다."""
    for el in elements:
        el.clickable = el.type in CLICKABLE_TYPES


HIGHLIGHT_COLOR = "#ff1744"  # 다른 타입 색과 안 겹치게 강한 핫핑크/레드


def _find_element_at_point(elements: list[UIElement], point: tuple[int, int]) -> UIElement | None:
    """액션 좌표를 담은 요소를 찾는다. 담은 요소가 없으면 중심이 가장
    가까운 요소로 대체한다(탐지 상자가 실제 탭 지점과 살짝 어긋나는
    경우를 위한 안전장치)."""
    x, y = point
    for el in elements:
        if el.bbox.x <= x <= el.bbox.x + el.bbox.width and el.bbox.y <= y <= el.bbox.y + el.bbox.height:
            return el
    if not elements:
        return None

    def _dist(el: UIElement) -> float:
        cx = el.bbox.x + el.bbox.width / 2
        cy = el.bbox.y + el.bbox.height / 2
        return (cx - x) ** 2 + (cy - y) ** 2

    return min(elements, key=_dist)


def draw_annotated_image(
    image_path: Path,
    elements: list[UIElement],
    out_path: Path,
    highlight_point: tuple[int, int] | None = None,
) -> None:
    """탐지 결과를 그린다. `highlight_point`(액션이 실제로 향한 이미지
    좌표)를 주면, 그 지점의 요소를 다른 색(굵은 핫핑크)으로 덧그리고
    좌표에 십자선을 찍어서 "무엇을 액션 대상으로 골랐는지"를 눈에
    띄게 한다 — 나머지 요소는 원래 타입별 색 그대로 둔다."""
    image = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    for el in elements:
        color = TYPE_COLORS.get(el.type, "#ffffff")
        x1, y1 = el.bbox.x, el.bbox.y
        x2, y2 = x1 + el.bbox.width, y1 + el.bbox.height
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

        label = el.type if not el.text else f"{el.type}:{el.text[:12]}"
        text_y = max(0, y1 - 11)
        draw.rectangle([x1, text_y, x1 + len(label) * 6 + 4, text_y + 11], fill=color)
        draw.text((x1 + 2, text_y), label, fill="#000000", font=font)

    if highlight_point is not None:
        target = _find_element_at_point(elements, highlight_point)
        if target is not None:
            pad = 6
            x1, y1 = target.bbox.x - pad, target.bbox.y - pad
            x2, y2 = target.bbox.x + target.bbox.width + pad, target.bbox.y + target.bbox.height + pad
            draw.rectangle([x1, y1, x2, y2], outline=HIGHLIGHT_COLOR, width=6)

            label = f"ACTION:{target.text[:16]}" if target.text else "ACTION"
            text_y = max(0, y1 - 18)
            draw.rectangle([x1, text_y, x1 + len(label) * 7 + 8, text_y + 18], fill=HIGHLIGHT_COLOR)
            draw.text((x1 + 4, text_y + 2), label, fill="#ffffff", font=font)

        hx, hy = highlight_point
        r = 16
        draw.ellipse([hx - r, hy - r, hx + r, hy + r], outline=HIGHLIGHT_COLOR, width=4)
        draw.line([hx - r, hy, hx + r, hy], fill=HIGHLIGHT_COLOR, width=3)
        draw.line([hx, hy - r, hx, hy + r], fill=HIGHLIGHT_COLOR, width=3)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path)
