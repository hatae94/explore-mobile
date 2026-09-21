"""
jev의 판단(decide.py) + 실제 실행(act.py) + 녹화(explore_step.py, 이미 있는
기능)를 "한 스텝" 단위로 묶는다.

이 모듈은 전체 흐름을 혼자 끝까지 돌리지 않는다 — 파이썬 스크립트 하나가
도는 중간에는 Claude를 부를 방법이 없기 때문이다. 대신 호출자(Claude)가
`run_auto_step()`을 반복 호출하면서 한 스텝씩 지켜보는 구조다:

  - `decision.needs_intervention`이 True면 아무 것도 실행하지 않고 그대로
    돌려준다 — 호출자가 그 시점 화면(`<name>.annotated.png`)과 인식 데이터
    (`current_result.elements`)를 보고 직접 다음 행동을 정해서,
    `decide.make_manual_decision(...)`로 만든 Decision을 `override`로
    넘기면 그걸 그대로 실행한다.
  - 실행됐으면 다음 스텝을 위한 새 `DetectionResult`를 돌려준다.

`narrate=True`를 주면(기본 False), 실행 직전 화면 위에 액션 대상을
빨간 박스+좌표 십자선으로 강조한 프레임(`<name>.action-highlight.png`)과,
실행 뒤 탐지 합성 이미지(`<name>.annotated.png`, 이미 만들어지던 것)를
각각 짧은 영상 클립으로도 만든다 — 최종 흐름 영상에 [강조 클립] →
[실제 녹화] → [합성 이미지 클립] 순서로 끼워 넣을 수 있게
(`explore_step.run_flow_narrated()`가 쓰는 것과 같은 재료).
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from act import ExecutionError, execute
from decide import Decision, _load_detection_result, _parse_text_input, decide_next_action
from detect import draw_annotated_image
from explore_step import AFTER_COMPOSITE_SECONDS, TARGET_HIGHLIGHT_SECONDS, run_step
from main import OUTPUT_DIR
from record import image_to_clip
from schema import DetectionResult, UIElement


@dataclass(slots=True)
class StepOutcome:
    decision: Decision
    result: DetectionResult
    """다음 스텝에 넘길 DetectionResult. 실행 안 됐으면 입력받은 그대로다."""
    executed: bool
    intervention_reason: str | None
    highlight_clip: Path | None = None
    """실행 직전 액션 대상을 강조한 클립 (narrate=True 이고 액션에 좌표가
    있을 때만 생성됨 — scroll/key처럼 특정 지점이 없는 액션은 None)."""
    composite_clip: Path | None = None
    """실행 뒤 탐지 합성 이미지를 담은 클립 (narrate=True 이고 executed=True일 때만)."""


def _decision_image_point(decision: Decision) -> tuple[int, int] | None:
    """이 Decision이 실제로 향하는 이미지 좌표(있으면)를 돌려준다."""
    if decision.target_element is None:
        return None
    el: UIElement = decision.target_element
    return (el.bbox.x + el.bbox.width // 2, el.bbox.y + el.bbox.height // 2)


def run_auto_step(
    device: str,
    step_name: str,
    goal: str,
    current_result: DetectionResult,
    *,
    text_inputs: dict[str, str] | None = None,
    override: Decision | None = None,
    narrate: bool = False,
    use_server: bool = False,
) -> StepOutcome:
    """한 스텝을 실행한다.

    `override`를 주면 jev에게 묻지 않고 그 Decision을 그대로 실행한다
    (Claude의 수동 개입용 — `decide.make_manual_decision()` 참고).
    """
    decision = override if override is not None else decide_next_action(goal, current_result, text_inputs=text_inputs)

    if decision.needs_intervention:
        return StepOutcome(
            decision=decision,
            result=current_result,
            executed=False,
            intervention_reason="jev가 판단불가를 선택했습니다 — 사람 개입이 필요합니다.",
        )

    highlight_clip: Path | None = None
    if narrate:
        point = _decision_image_point(decision)
        if point is not None:
            highlight_path = OUTPUT_DIR / f"{step_name}.action-highlight.png"
            draw_annotated_image(
                Path(current_result.source_image),
                current_result.elements,
                highlight_path,
                highlight_point=point,
            )
            highlight_clip = image_to_clip(
                highlight_path, OUTPUT_DIR / f"{step_name}.action-highlight-clip.mp4", duration=TARGET_HIGHLIGHT_SECONDS
            )

    def action() -> None:
        execute(decision, current_result.geometry, device)

    try:
        new_result = run_step(device, step_name, action, use_server=use_server)
    except ExecutionError as err:
        return StepOutcome(
            decision=decision,
            result=current_result,
            executed=False,
            intervention_reason=f"실행 실패: {err}",
            highlight_clip=highlight_clip,
        )

    composite_clip: Path | None = None
    if narrate:
        composite_clip = image_to_clip(
            OUTPUT_DIR / f"{step_name}.annotated.png",
            OUTPUT_DIR / f"{step_name}.composite-clip.mp4",
            duration=AFTER_COMPOSITE_SECONDS,
        )

    return StepOutcome(
        decision=decision,
        result=new_result,
        executed=True,
        intervention_reason=None,
        highlight_clip=highlight_clip,
        composite_clip=composite_clip,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", required=True, help="explore-mobile 기기 시리얼")
    parser.add_argument("--name", required=True, help="이 스텝의 산출물 베이스 이름 (예: auto-001)")
    parser.add_argument("--current", type=Path, required=True, help="직전 스텝의 <name>.elements.json 경로")
    parser.add_argument("--goal", required=True, help="jev에게 줄 목표 문장")
    parser.add_argument(
        "--text-input",
        action="append",
        type=_parse_text_input,
        default=[],
        metavar="텍스트=설명",
        help="text 액션일 때 입력할 후보 (반복 가능)",
    )
    parser.add_argument(
        "--narrate",
        action="store_true",
        help="액션 대상 강조 클립 + 탐지 합성 클립도 함께 만든다 (최종 흐름 영상용)",
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="model_server.py(상주 프로세스)로 탐지 — 먼저 서버를 띄워둬야 한다",
    )
    args = parser.parse_args()

    current_result = _load_detection_result(args.current)
    outcome = run_auto_step(
        args.device,
        args.name,
        args.goal,
        current_result,
        text_inputs=dict(args.text_input),
        narrate=args.narrate,
        use_server=args.server,
    )

    d = outcome.decision
    print(f"action_type: {d.action_type} (confidence {d.action_type_confidence:.2f})")
    if d.target_element is not None:
        print(f"target_element: {d.target_element.type} '{d.target_element.text}' (confidence {d.target_confidence:.2f})")
    if d.text_value is not None:
        print(f"text_value: {d.text_value!r}")
    print(f"executed: {outcome.executed}")
    if outcome.intervention_reason is not None:
        print(f"intervention_reason: {outcome.intervention_reason}")
    print(f"result_json: output/{args.name}.elements.json" if outcome.executed else f"result_json: {args.current} (변화 없음)")
    if outcome.highlight_clip is not None:
        print(f"highlight_clip: {outcome.highlight_clip}")
    if outcome.composite_clip is not None:
        print(f"composite_clip: {outcome.composite_clip}")


if __name__ == "__main__":
    main()
