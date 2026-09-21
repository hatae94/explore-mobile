"""
탐색 스텝 하나를 "녹화 + 액션 + 탐지"로 묶어서 실행한다.

녹화(record.py)와 탐지(main.run)를 시작/중지 타이밍만 맞춰서 잇는
얇은 접착제다 — 둘 다 이미 있는 걸 그대로 재사용한다.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from detect import draw_annotated_image
from main import OUTPUT_DIR, run as run_detection
from record import RecordingError, concat_clips, concat_mixed_clips, image_to_clip, start_recording
from schema import DetectionResult

DEFAULT_TIME_LIMIT_SECONDS = 6  # 워밍업+액션+정착을 담기에 충분한, 짧은 고정 녹화 길이
AFTER_COMPOSITE_SECONDS = 2.5  # 액션 뒤 탐지 합성 이미지를 보여줄 시간
TARGET_HIGHLIGHT_SECONDS = 2.0  # 다음 액션 대상을 강조해서 보여줄 시간


@dataclass(slots=True)
class Step:
    """`run_flow`에 넘기는 스텝 하나.

    `action_point`는 이 스텝의 액션이 실제로 향한 **이미지 좌표**다(탭
    지점 등). 있으면 직전 스텝의 결과 화면 위에 "다음에 이걸 누른다"를
    강조해서 보여주는 데 쓰인다(`run_flow_narrated`). 텍스트 입력처럼
    특정 좌표가 없는 액션은 `None`으로 둔다.
    """

    name: str
    action: Callable[[], None]
    time_limit: int = DEFAULT_TIME_LIMIT_SECONDS
    action_point: tuple[int, int] | None = None


def run_step(
    device: str,
    name: str,
    action: Callable[[], None],
    time_limit: int = DEFAULT_TIME_LIMIT_SECONDS,
    use_server: bool = False,
) -> DetectionResult:
    """`action()`을 녹화하면서 실행한 뒤, 정착된 화면을 원본 화질로 캡처·탐지한다.

    녹화는 `time_limit`초가 지나 자연 종료될 때까지 기다린다(SIGINT로
    일찍 끊지 않는다 — record.py 참고, 그러면 파일이 깨진다). 액션이
    빨리 끝나도 나머지 시간이 화면 정착 여유가 된다.

    산출물은 전부 `output/<name>.*`로 묶인다:
    - `<name>.mp4`   — 액션 전후를 담은 녹화(사람이 볼 관찰용, 탐지엔 안 씀)
    - `<name>.png`   — 액션 뒤 정착된 화면(탐지 입력)
    - `<name>.elements.json` / `<name>.annotated.png` — 기존 탐지 파이프라인 그대로
    """
    recording = start_recording(device, name, time_limit=time_limit)
    action()

    video_path = OUTPUT_DIR / f"{name}.mp4"
    try:
        recording.wait_and_pull(video_path)
    except RecordingError as err:
        # 녹화가 실패해도 탐지 자체는 막지 않는다 — 관찰용 부가 산출물이지
        # 탐지 파이프라인의 필수 입력이 아니기 때문이다.
        print(f"[explore_step] 녹화 실패(탐지는 계속 진행): {err}")

    return run_detection(name=name, device=device, existing_image=None, full=True, use_server=use_server)


def run_flow(device: str, flow_name: str, steps: list[Step]) -> tuple[list[DetectionResult], Path]:
    """스텝 여러 개를 순서대로 실행하고, 각 스텝의 짧은 클립을 하나의
    플로우 영상(`output/<flow_name>.mp4`)으로 이어붙인다.

    스텝별 산출물(`output/<step.name>.*`)은 그대로 남는다 — 특정 스텝만
    다시 보고 싶을 때 쓸 수 있다. 합쳐진 영상은 그 위에 "전체 흐름을
    한 파일로 보고 싶을 때"를 위한 것이다.
    """
    results: list[DetectionResult] = []
    clip_paths: list[Path] = []

    for step in steps:
        results.append(run_step(device, step.name, step.action, time_limit=step.time_limit))
        clip_paths.append(OUTPUT_DIR / f"{step.name}.mp4")

    flow_video_path = OUTPUT_DIR / f"{flow_name}.mp4"
    concat_clips(clip_paths, flow_video_path)

    return results, flow_video_path


def run_flow_narrated(device: str, flow_name: str, steps: list[Step]) -> tuple[list[DetectionResult], Path]:
    """`run_flow`와 같지만, 원본 녹화 사이사이에 "이 스텝에서 이렇게
    인식했다"(탐지 합성 이미지)와, 다음 스텝의 `action_point`가 있으면
    "다음에 이걸 누른다"(빨간 박스+십자선 강조)까지 끼워 넣는다.

    스텝 순서:
    ```
    [스텝1 원본 녹화] → [스텝1 탐지 합성] → [스텝2 액션 대상 강조]
      → [스텝2 원본 녹화] → [스텝2 탐지 합성] → [스텝3 액션 대상 강조] → ...
    ```

    이미지→영상 변환 + 합치기는 `concat_mixed_clips`(concat 필터 방식)를
    쓴다 — `-f concat` 데뮤서는 화면 녹화(가변 프레임레이트)와 이미지
    변환 클립(고정 fps)이 섞이면 일부 구간을 통째로 빠뜨리는 문제가
    있었다(record.py 참고).
    """
    results: list[DetectionResult] = []
    sequence: list[Path] = []

    for i, step in enumerate(steps):
        result = run_step(device, step.name, step.action, time_limit=step.time_limit)
        results.append(result)

        sequence.append(OUTPUT_DIR / f"{step.name}.mp4")
        after_clip = image_to_clip(
            OUTPUT_DIR / f"{step.name}.annotated.png",
            OUTPUT_DIR / f"{step.name}.after-clip.mp4",
            duration=AFTER_COMPOSITE_SECONDS,
        )
        sequence.append(after_clip)

        next_step = steps[i + 1] if i + 1 < len(steps) else None
        if next_step is not None and next_step.action_point is not None:
            target_image = OUTPUT_DIR / f"{next_step.name}.target.png"
            draw_annotated_image(
                Path(result.source_image), result.elements, target_image, highlight_point=next_step.action_point
            )
            target_clip = image_to_clip(
                target_image, OUTPUT_DIR / f"{next_step.name}.target-clip.mp4", duration=TARGET_HIGHLIGHT_SECONDS
            )
            sequence.append(target_clip)

    flow_video_path = OUTPUT_DIR / f"{flow_name}.mp4"
    concat_mixed_clips(sequence, flow_video_path)

    return results, flow_video_path
