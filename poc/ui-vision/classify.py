"""
요구사항 4 — 키보드·권한 팝업·토스트·상태 바·하단 내비게이션을 별도
객체 유형으로 인식한다.

**검증 이력**:
- 상태 바·하단 내비게이션: 실제 화면으로 확인.
- 키보드: 처음엔 "작은 icon이 격자로 몰려 있으면 키보드"로 짰는데, 실제
  검색 화면(키보드 켜짐)을 돌려보니 **YOLO가 키보드 키를 icon으로 단
  하나도 못 찾았다**(개수 0) — 대신 EasyOCR이 낱글자("q","w","1" 등)를
  1~2글자 `text`로 정확히 읽고 있었다. 그래서 판별 신호를 "작은 icon
  격자"에서 "짧은(1~2자) text가 하단에 격자로 몰려 있음"으로 바꿨다.
- 토스트: 처음 짠 규칙("넓고 납작한 상자가 하단 근처")이 실제로 돌려보니
  YT Music의 "지금 재생 중" 미니 플레이어를 토스트로 오분류했다. 그
  영역을 보니 앨범아트 아이콘·곡명 텍스트 등 **다른 요소 3개가 같은
  줄에 같이 있었다** — 진짜 토스트는 보통 혼자 떠 있으므로, "같은 줄에
  다른 요소가 있으면 토스트가 아니다"라는 조건을 추가했다.
- 권한 팝업: 아직 실제 사례로 검증하지 못했다 — 키워드 매칭 규칙만 있고
  실제 권한 다이얼로그 화면은 못 띄워봤다.
"""

from __future__ import annotations

from schema import ScreenshotGeometry, UIElement

# 상태 바: 화면 맨 위 ~4% 띠. 실측 캡처(1024px 높이)에서 시계·아이콘이
# y≈15~25px(1.5~2.4%)에 있었다 — 여유를 두어 4%로 잡는다.
STATUS_BAR_BAND = 0.04

# 하단 내비게이션(뒤로/홈/최근앱 버튼): 화면 맨 아래 ~5% 띠. 이 캡처에서
# 버튼 3개가 y≈980~1010px(95.7~98.6%)에 있었다. 홈 화면의 "독(dock)"
# 아이콘(전화·메시지 등, y≈86~92%)과는 명확히 분리된다.
BOTTOM_NAV_BAND = 0.05

# 권한 팝업으로 보이는 강한 신호 문구. "확인"/"취소"처럼 일반 버튼에도
# 흔한 단어는 오탐이 커서 제외했다 — 권한 다이얼로그 특유의 문구만 남김.
PERMISSION_KEYWORDS = {
    "허용", "허용 안함", "이번만 허용", "앱 사용 중에만 허용", "차단",
    "allow", "deny", "while using the app", "only this time", "don't allow",
}

# 토스트(짧게 떴다 사라지는 알림 배너) 후보 형태: 아주 납작하고 넓은
# 상자가, 하단 내비게이션 바로 위 영역에 혼자 떠 있는 경우.
TOAST_BAND_TOP = 0.75
TOAST_BAND_BOTTOM = 0.95
TOAST_MIN_ASPECT_RATIO = 3.0  # width / height

# 소프트 키보드 후보 영역: 화면 하단 ~45%. 실측(검색 화면, 키보드 켜짐)
# 결과: YOLO는 키를 icon으로 못 찾았지만, EasyOCR은 낱글자("q","1" 등)를
# 1~2글자 text로 정확히 읽었다 — 그래서 "작은 icon" 신호와 "짧은 text"
# 신호를 OR로 합쳐서 후보를 센다.
KEYBOARD_BAND_TOP = 0.55
KEYBOARD_MAX_ELEMENT_WIDTH_RATIO = 0.2  # 화면 너비의 20% 미만인 요소만 "키" 후보
KEYBOARD_MAX_TEXT_LENGTH = 2  # 낱글자·숫자 한두 개까지만 "키 글자" 후보
KEYBOARD_MIN_CANDIDATE_COUNT = 10

# 토스트 후보가 "혼자 떠 있는지" 판정할 때, 다른 요소와 겹친다고 볼
# 최소 가로 겹침(px). 이보다 적게 겹치면 우연한 스침으로 보고 무시한다.
TOAST_SIBLING_MIN_X_OVERLAP = 10


def classify_elements(elements: list[UIElement], geometry: ScreenshotGeometry) -> None:
    """요소의 `type`을 제자리에서(in place) 갱신한다.

    적용 순서: 상태 바 → 하단 내비게이션 → 권한 팝업(텍스트 키워드) →
    토스트(모양) → 그 외는 원래 분류(icon/text)를 유지한다.
    """
    status_bar_cutoff = geometry.height * STATUS_BAR_BAND
    bottom_nav_cutoff = geometry.height * (1 - BOTTOM_NAV_BAND)
    toast_top = geometry.height * TOAST_BAND_TOP
    toast_bottom = geometry.height * TOAST_BAND_BOTTOM
    keyboard_band_top = geometry.height * KEYBOARD_BAND_TOP
    max_key_width = geometry.width * KEYBOARD_MAX_ELEMENT_WIDTH_RATIO

    def is_keyboard_key_candidate(el: UIElement) -> bool:
        in_band = el.bbox.y >= keyboard_band_top and el.bbox.y + el.bbox.height < bottom_nav_cutoff
        if not in_band:
            return False
        if el.type == "icon":
            return el.bbox.width < max_key_width
        if el.type == "text":
            return len(el.text.strip()) <= KEYBOARD_MAX_TEXT_LENGTH
        return False

    def _x_overlap(a: UIElement, b: UIElement) -> float:
        a1, a2 = a.bbox.x, a.bbox.x + a.bbox.width
        b1, b2 = b.bbox.x, b.bbox.x + b.bbox.width
        return max(0.0, min(a2, b2) - max(a1, b1))

    def has_row_sibling(candidate: UIElement, all_elements: list[UIElement]) -> bool:
        """토스트 판정 전 "정말 혼자 떠 있는지" 확인한다 — 실제 토스트는
        단독으로 뜨지만, 미니 플레이어처럼 아이콘·텍스트가 같이 있는
        합성 바는 토스트가 아니다(실측으로 확인된 오탐 사례)."""
        c_top, c_bottom = candidate.bbox.y, candidate.bbox.y + candidate.bbox.height
        for other in all_elements:
            if other is candidate:
                continue
            o_top, o_bottom = other.bbox.y, other.bbox.y + other.bbox.height
            vertically_overlaps = o_top < c_bottom and o_bottom > c_top
            if vertically_overlaps and _x_overlap(candidate, other) >= TOAST_SIBLING_MIN_X_OVERLAP:
                return True
        return False

    # 키보드가 열려 있는지는 "후보 개수"로만 판단한다 — 한 번에 하나씩
    # 보고 결정할 수 없다(자판 한 칸만 봐서는 그게 키보드 키인지 그냥
    # 아이콘인지 모른다). 그래서 먼저 전체를 훑어 개수를 센다.
    keyboard_active = sum(1 for el in elements if is_keyboard_key_candidate(el)) >= KEYBOARD_MIN_CANDIDATE_COUNT

    for el in elements:
        bottom = el.bbox.y + el.bbox.height
        top = el.bbox.y

        if bottom <= status_bar_cutoff:
            el.type = "status_bar"
            continue

        if top >= bottom_nav_cutoff:
            el.type = "bottom_nav"
            continue

        if keyboard_active and is_keyboard_key_candidate(el):
            el.type = "keyboard"
            continue

        text_lower = el.text.strip().lower()
        if el.type == "text" and any(kw in text_lower or kw in el.text for kw in PERMISSION_KEYWORDS):
            el.type = "permission_popup"
            continue

        aspect_ratio = el.bbox.width / max(el.bbox.height, 1)
        if (
            toast_top <= top <= toast_bottom
            and aspect_ratio >= TOAST_MIN_ASPECT_RATIO
            and el.bbox.width >= geometry.width * 0.5
            and not has_row_sibling(el, elements)
        ):
            el.type = "toast"
            continue

        # 그 외는 원래 분류(icon/text)를 유지한다.
