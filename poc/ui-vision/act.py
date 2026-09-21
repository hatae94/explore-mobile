"""
jev(또는 Claude)가 고른 Decision(decide.py)을 실제 기기 명령으로 바꿔서 보낸다.

탭 대상은 이미지 좌표(bbox)로 들어오므로, 보내기 **직전에만** `coords.py`로
기기 좌표로 바꾼다(README의 "탭 직전에만 변환" 원칙 그대로) — 어디에도
저장하지 않는다. 캡처와 마찬가지로 새로 만들지 않고 `explore-mobile` CLI를
서브프로세스로 호출한다(capture.py와 같은 패턴).

이번 실행기는 범위를 좁게 잡았다(README §알려진 한계 참고):
  - scroll은 방향을 "down" 고정으로 보낸다 — 검색 결과를 더 찾아 내려가는
    상황이 이 PoC 플로우의 전형이라서.
  - key는 "enter" 고정으로 보낸다 — 검색어 확정 용도.
  - swipe(좌표 두 쌍이 필요)는 아직 지원하지 않는다 — ExecutionError로
    실패시켜서, 호출자가 개입 필요 상황과 동일하게 다루게 한다.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from coords import to_device_coordinate
from decide import Decision
from schema import ScreenshotGeometry, UIElement

REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_ENTRY = REPO_ROOT / "dist" / "cli" / "bin.js"


class ExecutionError(RuntimeError):
    """CLI 명령이 실패했거나, 이 실행기가 아직 지원하지 않는 동작일 때."""


def _run_cli(args: list[str], device: str | None) -> dict:
    if not CLI_ENTRY.exists():
        raise ExecutionError(f"CLI 빌드 산출물을 찾을 수 없습니다: {CLI_ENTRY}. 먼저 `pnpm build`를 실행하세요.")

    full_args = ["node", str(CLI_ENTRY), *args]
    if device is not None:
        full_args += ["--device", device]

    result = subprocess.run(full_args, capture_output=True, text=True, cwd=REPO_ROOT)

    try:
        envelope = json.loads(result.stdout)
    except json.JSONDecodeError as err:
        raise ExecutionError(
            f"{args[0]} 명령의 출력이 JSON이 아닙니다 (exit={result.returncode}). "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        ) from err

    if not envelope.get("ok"):
        error = envelope.get("error", {})
        raise ExecutionError(f"{args[0]} 명령 실패: {error.get('code')} — {error.get('message')}")

    return envelope


def _center_device_point(el: UIElement, geometry: ScreenshotGeometry) -> tuple[int, int]:
    cx = el.bbox.x + el.bbox.width / 2
    cy = el.bbox.y + el.bbox.height / 2
    return to_device_coordinate(geometry, cx, cy)


def execute(decision: Decision, geometry: ScreenshotGeometry, device: str | None) -> None:
    """Decision을 실제 기기 명령으로 실행한다.

    `decision.needs_intervention`이 True인 Decision은 호출자(autostep.py)가
    먼저 걸러내야 한다 — 여기서는 그 확인을 다시 하지 않는다.
    """
    if decision.action_type == "tap":
        if decision.target_element is None:
            raise ExecutionError("tap인데 target_element가 없습니다.")
        x, y = _center_device_point(decision.target_element, geometry)
        _run_cli(["tap", str(x), str(y)], device)

    elif decision.action_type == "text":
        if decision.target_element is None or decision.text_value is None:
            raise ExecutionError("text인데 target_element 또는 text_value가 없습니다.")
        x, y = _center_device_point(decision.target_element, geometry)
        _run_cli(["tap", str(x), str(y)], device)  # 입력창에 먼저 포커스를 준다
        _run_cli(["text", decision.text_value], device)

    elif decision.action_type == "key":
        _run_cli(["key", "enter"], device)

    elif decision.action_type == "scroll":
        _run_cli(["scroll", "down"], device)

    else:
        raise ExecutionError(f"이 실행기는 '{decision.action_type}' 동작을 아직 지원하지 않습니다.")
