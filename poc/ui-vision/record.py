"""
adb screenrecord로 액션 전후를 짧게 녹화한다.

**탐지 파이프라인 입력이 아니다.** YOLO/OCR은 지금처럼 원본 화질 PNG
정지 이미지만 쓴다 — 동영상은 오직 "사람이 나중에 탐색 흐름을 눈으로
볼 수 있게" 남기는 관찰용 기록이다(둘을 섞으면 압축이 OCR 정확도를
다시 깎아먹는다).

**실측 확인(이 PoC에서 직접 테스트)**:
- `adb shell screenrecord`를 백그라운드로 띄운 채로 `adb shell input
  tap`/`keyevent` 같은 별도 adb 명령을 동시에 보내도 서로 안 막고 같이
  동작한다.
- **처음엔 SIGINT(Ctrl-C)로 중간에 끊는 방식으로 짰는데, 4번 중 3번
  파일이 깨졌다**(`moov atom not found` — mp4 마무리 트레일러가 안
  써짐, ffprobe/cv2 둘 다 못 읽음). 신호가 로컬 adb 클라이언트→원격
  screenrecord로 안정적으로 전달돼 "정상 종료"까지 이어지는지가
  보장되지 않는 것으로 보인다.
- **`--time-limit`으로 자연 종료시키니 여러 번 다시 해도 매번 멀쩡한
  파일이 나왔다**(ffprobe로 재생 시간·스트림 정상 확인). 그래서 SIGINT는
  버리고, 정해진 짧은 시간 동안 녹화하고 자연 종료를 기다리는 방식으로
  바꿨다 — 대신 "정확히 이 순간에 멈춰라" 같은 정밀 제어는 포기한다.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

REMOTE_DIR = "/sdcard"
ENCODER_WARMUP_SECONDS = 0.5  # 인코더 초기화 대기 — 이 시간 전 액션은 못 잡을 수 있다


class RecordingError(RuntimeError):
    """녹화 시작/회수 중 하나가 실패했을 때."""


class Recording:
    def __init__(self, process: subprocess.Popen, device: str, remote_path: str, time_limit: int):
        self._process = process
        self._device = device
        self._remote_path = remote_path
        self._time_limit = time_limit

    def wait_and_pull(self, local_path: Path) -> Path:
        """`--time-limit`이 다 될 때까지 기다린 뒤(자연 종료) 파일을 받아온다.

        SIGINT로 일찍 끊지 않는다 — 그게 파일을 깨뜨리는 원인이었다(위
        모듈 docstring 참고). 대신 `time_limit`을 짧게 잡아서 기다림
        자체를 짧게 만든다.
        """
        try:
            self._process.wait(timeout=self._time_limit + 10)
        except subprocess.TimeoutExpired as err:
            self._process.kill()
            raise RecordingError("screenrecord가 time-limit + 10초 안에 자연 종료되지 않았습니다.") from err

        local_path.parent.mkdir(parents=True, exist_ok=True)
        pull = subprocess.run(
            ["adb", "-s", self._device, "pull", self._remote_path, str(local_path)],
            capture_output=True,
            text=True,
        )
        if pull.returncode != 0:
            raise RecordingError(f"녹화 파일을 받아오지 못했습니다: {pull.stderr}")

        # 기기 쪽 사본은 정리한다 — 실패해도 로컬 파일은 이미 받았으니 치명적이지 않다.
        subprocess.run(
            ["adb", "-s", self._device, "shell", "rm", "-f", self._remote_path],
            capture_output=True,
            text=True,
        )
        return local_path


def concat_clips(clip_paths: list[Path], output_path: Path) -> Path:
    """스텝별 짧은 클립 여러 개를 시간 순서대로 하나의 mp4로 이어붙인다.

    재인코딩 없이(`-c copy`, ffmpeg concat demuxer) 이어붙인다 — 모든
    클립이 같은 기기·같은 세션에서 같은 설정(h264, 해상도, 픽셀 포맷)으로
    찍히므로 무손실로 빠르게 합쳐진다(실측: 4개 클립·24초 분량이
    체감 즉시 처리됨). `screenrecord`의 파일당 180초 제한은 클립 하나
    기준이라, 이렇게 짧게 나눠 찍고 합치면 제한에 안 걸린다.
    """
    if not clip_paths:
        raise RecordingError("합칠 클립이 없습니다.")

    filelist_path = output_path.with_suffix(".filelist.txt")
    filelist_path.write_text("\n".join(f"file '{p.resolve()}'" for p in clip_paths), encoding="utf-8")

    result = subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(filelist_path), "-c", "copy", str(output_path)],
        capture_output=True,
        text=True,
    )
    filelist_path.unlink(missing_ok=True)

    if result.returncode != 0:
        raise RecordingError(f"영상 합치기에 실패했습니다: {result.stderr}")
    return output_path


def image_to_clip(image_path: Path, output_path: Path, duration: float = 2.5) -> Path:
    """정지 이미지(합성 이미지 등)를 `duration`초짜리 짧은 영상으로 만든다.

    탐지 합성 이미지를 실제 화면 녹화 사이에 끼워 넣기 위한 변환이다 —
    "이 스텝에서 이렇게 인식했다"를 영상 안에서 몇 초간 멈춰서 보여준다.
    """
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-loop", "1", "-i", str(image_path),
            "-t", str(duration), "-vf", "fps=30,format=yuv420p",
            "-c:v", "libx264", str(output_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RecordingError(f"이미지를 영상으로 변환하지 못했습니다: {result.stderr}")
    return output_path


def concat_mixed_clips(clip_paths: list[Path], output_path: Path) -> Path:
    """서로 다른 방식으로 만들어진 클립(실제 녹화 + 이미지 변환 클립)을
    하나로 합친다.

    **`-f concat` 데뮤서로 처음 시도했다가 실패했다** — 개별 클립은
    각각 멀쩡한데(ffprobe로 확인), 합친 결과에는 이미지 변환 클립들이
    통째로 빠지고 실제 녹화 구간만 남았다. 화면 녹화(가변 프레임레이트,
    타임베이스 90000)와 이미지 변환 클립(고정 30fps)처럼 프레임레이트가
    섞이면 concat 데뮤서가 구간 경계를 잘못 판단하는 경우가 있다고
    알려져 있다.

    그래서 **concat 필터**(`-filter_complex concat=...`)로 바꿨다 — 각
    입력을 프레임 단위로 디코딩해서 이어붙이므로 서로 다른 코덱·
    프레임레이트가 섞여도 안전하다(ffmpeg 공식 문서가 "코덱이 다르면
    필터 방식을 쓰라"고 명시한 방식이다).
    """
    if not clip_paths:
        raise RecordingError("합칠 클립이 없습니다.")

    inputs: list[str] = []
    for clip in clip_paths:
        inputs += ["-i", str(clip)]

    n = len(clip_paths)
    filter_inputs = "".join(f"[{i}:v]" for i in range(n))
    filter_complex = f"{filter_inputs}concat=n={n}:v=1:a=0[outv]"

    result = subprocess.run(
        ["ffmpeg", "-y", *inputs, "-filter_complex", filter_complex, "-map", "[outv]", str(output_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RecordingError(f"영상 합치기에 실패했습니다: {result.stderr}")
    return output_path


def start_recording(device: str, name: str, time_limit: int = 6) -> Recording:
    """스텝 하나를 녹화하기 시작한다.

    `screenrecord`는 파일당 최대 180초 제한이 있지만(기기 실측 --help
    확인), 여기서는 그보다 훨씬 짧은 기본 6초를 쓴다 — 워밍업(0.5초) +
    액션 + 정착 여유를 담기엔 충분하고, 자연 종료까지 기다리는 시간도
    그만큼 짧아진다.
    """
    remote_path = f"{REMOTE_DIR}/poc_record_{name}.mp4"
    process = subprocess.Popen(
        ["adb", "-s", device, "shell", "screenrecord", "--time-limit", str(time_limit), remote_path],
    )
    time.sleep(ENCODER_WARMUP_SECONDS)
    return Recording(process, device, remote_path, time_limit)
