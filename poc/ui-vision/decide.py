"""
jev(TypeSafe AI System One)에게 "다음에 뭘 할지" 선택을 맡긴다.

탐지 파이프라인(main.py)이 만든 요소 목록(`<name>.elements.json`)과 목표
문장을 받아서, jev에게 두 단계로 순차 질문한다:

  1. phase: 지금 화면이 목표를 기준으로 어느 구조적 단계인지 먼저 분류
     (앱·목표 무관 고정 6개 후보 — PHASE_CRITERIA 참고)
  2. 그 단계에 맞는 일반 지시문을 골라 아래 Choice 질문에 goal 대신 넘김:
     - action_type: tap/swipe/scroll/text/key 중 어떤 종류의 동작을 할지
     - target_element: clickable한 요소 중 어떤 걸 대상으로 할지
     - text_value: (text_inputs를 줬을 때만) 입력할 텍스트로 어떤 후보가 맞는지

목표 문장 원문은 `state`에 한 번만 실려 jev에게 전달되고, 각 질문의
`instructions`에는 반복 인용하지 않는다 — 목표 문장 속 단어가 화면
라벨과 우연히 겹치면(예: 목표 "...보관함에 저장해줘" + 화면의 "보관함"
하단 탭) jev가 문맥과 무관하게 그 글자로 끌려가는 문제가 실측 재현됐기
때문(자세한 사례는 blog-draft.md 참고).

네 질문(phase/action_type/target_element/text_value) 모두 "unsure"(판단불가)
선택지를 기본으로 갖는다 — 화면 정보만으로
확신 있게 고르기 어려우면 jev가 그걸 고르고, 호출자는 `Decision.
needs_intervention`으로 사람(Claude)의 개입이 필요한지 확인한다. 또한
jev가 스스로는 확신했다고 답해도 그 확신도(confidence)가 낮으면(0.85
이하) 마찬가지로 개입이 필요하다고 본다 — CONFIDENCE_HIGH_RISK 참고.

이 모듈은 "무엇을 할지"만 고른다 — 실제 기기 좌표 변환(coords.py)과 명령
실행은 호출자의 몫이다(README의 "의도 vs 좌표 선택 분리" 원칙 그대로).

사용법:
    .venv/bin/python decide.py --json output/capture.elements.json \
        --goal "저장 버튼을 눌러줘"

환경변수 TYPESAFE_API_KEY가 필요하다(SDK가 자동으로 읽는다).
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path

from schema import BBox, DetectionResult, ScreenshotGeometry, UIElement

UNSURE = "unsure"
UNSURE_DESCRIPTION = "이 화면 정보만으로는 확신 있게 고르기 어려움 — 사람 판단이 필요"

# Android용 explore-mobile CLI가 구조적으로 지원하지 못하는 제스처
# (doubletap: adb input 왕복 지연이 더블탭 인식 창보다 김, pinch: SELinux가
# 멀티터치 이벤트 직접 쓰기를 막음 — blog-draft.md 5차 검증에서 실측
# 확인됨)는 jev에게 애초에 선택지로 주지 않는다.
ACTION_TYPE_CRITERIA = {
    "tap": "화면의 한 지점을 한 번 짧게 누른다",
    "swipe": "화면을 한 방향으로 빠르게 쓸어넘긴다",
    "scroll": "화면을 한 방향으로 길게 밀어서 목록을 넘긴다",
    "text": "텍스트 입력창에 글자를 입력한다",
    "key": "뒤로가기·엔터 같은 시스템 키를 보낸다",
    UNSURE: UNSURE_DESCRIPTION,
}

# --- 구조적 단계 분류 (앱·목표 무관, 고정 6개) ---
# action_type/target_element를 묻기 전에 먼저 "화면과 목표의 관계"를
# 분류한다. 목표 문장 자체가 아니라 이 구조로 다음 질문의 지시문을
# 고르기 때문에, 목표 문장 속 단어와 화면 라벨이 우연히 겹쳐도(예:
# "보관함") 그 글자 자체로 끌려가지 않는다.
PHASE_TARGET_VISIBLE = "목표_요소_보임"
PHASE_NEEDS_NAVIGATION = "탐색_필요"
PHASE_NEEDS_INPUT = "입력_필요"
PHASE_INTERMEDIATE_DIALOG = "중간_확인창"
PHASE_COMPLETION_CHECK = "완료_확인"

PHASE_INSTRUCTIONS = "이 화면은 목표를 기준으로 다음 중 어느 단계에 해당하나?"

PHASE_CRITERIA = {
    PHASE_TARGET_VISIBLE: "목표와 직접 연결된 요소가 지금 화면에 바로 보인다",
    PHASE_NEEDS_NAVIGATION: "목표를 이루려면 다른 화면이나 메뉴로 먼저 이동해야 한다",
    PHASE_NEEDS_INPUT: "목표를 이루려면 지금 텍스트를 입력해야 한다",
    PHASE_INTERMEDIATE_DIALOG: "예상 밖의 확인창·팝업·권한 요청이 떠서 먼저 처리해야 한다",
    PHASE_COMPLETION_CHECK: "목표가 이미 이뤄졌을 가능성이 높아 완료 여부만 확인하면 된다",
    UNSURE: UNSURE_DESCRIPTION,
}

# 단계별로 다음 질문(action_type/target_element)에 줄 일반 지시문 — 목표
# 문장을 재인용하지 않는다(목표 원문은 state에 이미 한 번 들어가 있음).
PHASE_INSTRUCTION_TEMPLATES: dict[str, str] = {
    PHASE_TARGET_VISIBLE: "목표와 직접 연결된 요소가 화면에 보인다.",
    PHASE_NEEDS_NAVIGATION: "목표를 이루려면 다른 화면이나 메뉴로 이동해야 한다. 이동에 필요한 요소를 찾아라.",
    PHASE_NEEDS_INPUT: "목표를 이루려면 지금 텍스트를 입력해야 한다. 입력할 위치를 찾아라.",
    PHASE_INTERMEDIATE_DIALOG: "예상 밖의 확인창이나 팝업이 떠 있다. 이를 닫거나 확인하는 요소를 찾아라.",
    PHASE_COMPLETION_CHECK: "목표가 이미 이뤄졌을 가능성이 높다. 완료를 나타내는 요소가 있는지 확인하라.",
    UNSURE: "지금 화면과 목표의 관계가 불분명하다.",
}

# --- confidence 임계값 라우팅 (jev 공식 문서 patterns/confidence-routing.md) ---
CONFIDENCE_FLOOR = 0.6
"""이 밑이면 무조건 불확실 — 공식 문서가 제시하는 기본 바닥선."""

CONFIDENCE_HIGH_RISK = 0.85
"""화면 조작(탭 등)은 되돌리기 까다로운 '고위험 작업'으로 보고, 이 값을
넘어야 확신 있다고 본다. 0.6~0.85 구간은 문서가 "사용자 확인 요청"을
권하는 애매한 지대인데, 이 파이프라인엔 별도 확인 단계가 없어서 그
구간도 needs_intervention=True로 사람(Claude)에게 넘긴다."""


def _confidence_tier(confidence: float | None) -> str:
    """confidence-routing 패턴의 3단계 중 하나로 분류한다.

    "high"(그대로 실행) / "review"(애매 — 확인 필요) / "low"(바닥선 미만).
    review와 low는 이 파이프라인에서 둘 다 사람 개입으로 합쳐지지만,
    어느 쪽이었는지는 이 함수로 구분해 볼 수 있다(진단용)."""
    if confidence is None or confidence < CONFIDENCE_FLOOR:
        return "low"
    if confidence <= CONFIDENCE_HIGH_RISK:
        return "review"
    return "high"


@dataclass(slots=True)
class Decision:
    action_type: str
    action_type_confidence: float
    target_element: UIElement | None
    target_confidence: float | None
    text_value: str | None
    text_value_confidence: float | None
    phase: str = ""
    phase_confidence: float = 0.0
    raw_probabilities: dict[str, dict[str, float]] = field(default_factory=dict)

    @property
    def needs_intervention(self) -> bool:
        """jev 스스로 불확실하다고 답했거나(unsure), 확신도가 고위험 작업
        기준(CONFIDENCE_HIGH_RISK)을 못 넘으면 True — action_type별 실행
        가능 여부(예: swipe 미지원)는 act.py가 실행 시점에 별도로 판단한다."""
        if self.action_type == UNSURE:
            return True
        if _confidence_tier(self.action_type_confidence) != "high":
            return True
        if self.action_type in ("tap", "text", "swipe"):
            if self.target_element is None or _confidence_tier(self.target_confidence) != "high":
                return True
        if self.action_type == "text":
            if self.text_value is None or _confidence_tier(self.text_value_confidence) != "high":
                return True
        return False


def _element_criteria(elements: list[UIElement]) -> tuple[dict[str, str], dict[str, UIElement]]:
    """clickable 요소만 후보로 올린다 — 후보 id -> 설명, id -> 원본 요소."""
    criteria: dict[str, str] = {UNSURE: UNSURE_DESCRIPTION}
    lookup: dict[str, UIElement] = {}
    for i, el in enumerate(elements):
        if not el.clickable:
            continue
        eid = f"e{i}"
        criteria[eid] = f"{el.type}" + (f": {el.text}" if el.text else "")
        lookup[eid] = el
    return criteria, lookup


class DecisionError(RuntimeError):
    """jev 호출이 실패했거나(인증 등) 응답을 해석할 수 없을 때."""


def decide_next_action(
    goal: str,
    result: DetectionResult,
    text_inputs: dict[str, str] | None = None,
) -> Decision:
    """jev에게 다음 액션을 묻는다.

    `text_inputs`는 "실제로 입력할 글자 -> 그 글자를 쓰는 상황 설명"
    딕셔너리다(예: `{"빈지노": "검색할 아티스트 이름"}`). 주어지면 jev에게
    `text_value` 질문도 같이 묻는다 — 후보 키가 곧 실제로 입력될 문자열이라,
    별도 조회表 없이 jev의 응답을 그대로 쓸 수 있다. 후보를 늘리고 싶으면
    이 딕셔너리에 항목만 추가하면 된다(코드 변경 불필요).
    """
    from typesafe_sdk import Choice, TypeSafeClient, TypeSafeError  # 무거운 import라 실제로 쓸 때만 불러온다.

    element_criteria, element_lookup = _element_criteria(result.elements)

    # 목표 원문은 여기 state에만 한 번 싣는다 — 아래 질문들의 instructions엔
    # 반복 인용하지 않는다(모듈 docstring의 "보관함 함정" 참고).
    state = json.dumps(
        {"goal": goal, "elements": [e.to_dict() for e in result.elements]},
        ensure_ascii=False,
    )

    # 1단계: 화면-목표 구조적 단계 분류. 그 답으로 2단계 질문의 지시문을
    # 고른다 — hierarchical_classification 체이닝 패턴(직전 답으로 다음
    # 질문을 좁힘)과 같은 구조.
    try:
        with TypeSafeClient() as client:
            phase_response = client.system_one(
                state=state,
                questions={"phase": Choice(instructions=PHASE_INSTRUCTIONS, criteria=PHASE_CRITERIA)},
            )
    except TypeSafeError as err:
        raise DecisionError(f"jev 호출 실패(단계 분류): {err}") from err

    phase_answer = phase_response.answers["phase"]
    phase_sentence = PHASE_INSTRUCTION_TEMPLATES.get(phase_answer.choice, PHASE_INSTRUCTION_TEMPLATES[UNSURE])

    # 2단계: 그 단계에 맞는 일반 지시문으로 action_type/target_element/
    # text_value를 묻는다.
    questions = {
        "action_type": Choice(
            instructions=f"{phase_sentence} 다음에 어떤 종류의 동작을 해야 하나?",
            criteria=ACTION_TYPE_CRITERIA,
        ),
        "target_element": Choice(
            instructions=f"{phase_sentence} 이 화면 요소 중 그 동작의 대상은 무엇인가?",
            criteria=element_criteria,
        ),
    }
    if text_inputs:
        questions["text_value"] = Choice(
            instructions="지금 텍스트를 입력해야 한다면, 어떤 값을 입력해야 하나?",
            criteria={**text_inputs, UNSURE: UNSURE_DESCRIPTION},
        )

    try:
        with TypeSafeClient() as client:
            response = client.system_one(state=state, questions=questions)
    except TypeSafeError as err:
        raise DecisionError(f"jev 호출 실패: {err}") from err

    action_answer = response.answers["action_type"]
    target_answer = response.answers["target_element"]
    text_answer = response.answers.get("text_value")

    probabilities = {
        "phase": dict(phase_answer.probabilities),
        "action_type": dict(action_answer.probabilities),
        "target_element": dict(target_answer.probabilities),
    }
    if text_answer is not None:
        probabilities["text_value"] = dict(text_answer.probabilities)

    text_value = None if text_answer is None or text_answer.choice == UNSURE else text_answer.choice

    return Decision(
        action_type=action_answer.choice,
        action_type_confidence=action_answer.confidence,
        target_element=element_lookup.get(target_answer.choice),
        target_confidence=target_answer.confidence,
        text_value=text_value,
        text_value_confidence=text_answer.confidence if text_answer is not None else None,
        phase=phase_answer.choice,
        phase_confidence=phase_answer.confidence,
        raw_probabilities=probabilities,
    )


def make_manual_decision(
    action_type: str,
    target_element: UIElement | None = None,
    text_value: str | None = None,
) -> Decision:
    """jev가 판단불가를 고른 뒤, Claude가 직접 판단해서 개입할 때 쓰는
    간단한 Decision 생성자. 확신도는 항상 1.0(사람이 직접 골랐으므로)."""
    return Decision(
        action_type=action_type,
        action_type_confidence=1.0,
        target_element=target_element,
        target_confidence=1.0 if target_element is not None else None,
        text_value=text_value,
        text_value_confidence=1.0 if text_value is not None else None,
        phase="manual",
        phase_confidence=1.0,
        raw_probabilities={},
    )


def _load_detection_result(json_path: Path) -> DetectionResult:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    geometry = ScreenshotGeometry(**data["geometry"])
    elements = [
        UIElement(
            type=e["type"],
            text=e["text"],
            bbox=BBox(**e["bbox"]),
            confidence=e["confidence"],
            enabled=e["enabled"],
            clickable=e["clickable"],
        )
        for e in data["elements"]
    ]
    return DetectionResult(source_image=data["source_image"], geometry=geometry, elements=elements)


def _parse_text_input(raw: str) -> tuple[str, str]:
    text, _, description = raw.partition("=")
    if not description:
        raise argparse.ArgumentTypeError(f"'텍스트=설명' 형태가 아닙니다: {raw!r}")
    return text, description


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, required=True, help="main.py가 만든 <name>.elements.json 경로")
    parser.add_argument("--goal", required=True, help="jev에게 줄 목표 문장 (예: '저장 버튼을 눌러줘')")
    parser.add_argument(
        "--text-input",
        action="append",
        type=_parse_text_input,
        default=[],
        metavar="텍스트=설명",
        help="text 액션일 때 입력할 후보 (반복 가능, 예: --text-input '빈지노=검색할 아티스트 이름')",
    )
    args = parser.parse_args()

    result = _load_detection_result(args.json)
    text_inputs = dict(args.text_input)
    try:
        decision = decide_next_action(args.goal, result, text_inputs=text_inputs)
    except DecisionError as err:
        raise SystemExit(str(err)) from err

    print(f"phase: {decision.phase} (confidence {decision.phase_confidence:.2f})")
    print(f"action_type: {decision.action_type} (confidence {decision.action_type_confidence:.2f})")
    if decision.target_element is not None:
        el = decision.target_element
        cx = el.bbox.x + el.bbox.width // 2
        cy = el.bbox.y + el.bbox.height // 2
        print(f"target_element: {el.type} '{el.text}' @ image({cx}, {cy}) (confidence {decision.target_confidence:.2f})")
    else:
        print("target_element: (선택 안 됨)")
    if decision.text_value is not None:
        print(f"text_value: {decision.text_value!r} (confidence {decision.text_value_confidence:.2f})")
    print(f"needs_intervention: {decision.needs_intervention}")


if __name__ == "__main__":
    main()
