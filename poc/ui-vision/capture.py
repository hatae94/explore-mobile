"""
`explore-mobile screenshot` CLI를 감싸는 얇은 래퍼.

이미지 축소·재인코딩·기하 계산은 전부 기존 TypeScript CLI가 한다
(src/cli/commands/screenshot.ts) — 이 PoC는 그 로직을 다시 만들지 않고
서브프로세스로 호출한 뒤 JSON 응답만 읽는다. `explore-mobile screenshot`이
이미 ScreenshotPayload에 width/height/deviceWidth/deviceHeight/scale/
capturedAt을 싣고 있으므로(REQ-IMAGE-003), 그 7개 필드를 그대로
`ScreenshotGeometry`에 옮긴다 — 다른 이름으로 다시 계산하지 않는다.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from schema import ScreenshotGeometry

REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_ENTRY = REPO_ROOT / "dist" / "cli" / "bin.js"


class CaptureError(RuntimeError):
    """CLI 호출이 실패했거나 JSON 응답이 예상과 다를 때."""


def capture_screenshot(out_path: Path, device: str | None = None, full: bool = False) -> ScreenshotGeometry:
    """기기 화면을 `out_path`에 캡처하고, 캡처 기하를 돌려준다.

    `full=True`면 CLI의 `--full`을 그대로 전달한다 — 기본 축소(2배 이상)·
    JPEG 압축을 건너뛰고 원본 해상도를 받는다. 이 PoC에서는 작은 한글
    글자의 OCR 오독이 대부분 그 축소분에서 나온 것으로 보여, 비전
    파이프라인용 캡처는 `full=True`를 권장한다.

    `explore-mobile`이 이미 만드는 `<out_path>.geometry.json` 사이드카는
    건드리지 않는다 — 여기서는 CLI의 stdout JSON만 읽는다(단일 진실 공급원).
    """
    if not CLI_ENTRY.exists():
        raise CaptureError(f"CLI 빌드 산출물을 찾을 수 없습니다: {CLI_ENTRY}. 먼저 `pnpm build`를 실행하세요.")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    args = ["node", str(CLI_ENTRY), "screenshot", "--out", str(out_path)]
    if device is not None:
        args += ["--device", device]
    if full:
        args += ["--full"]

    result = subprocess.run(args, capture_output=True, text=True, cwd=REPO_ROOT)

    try:
        envelope = json.loads(result.stdout)
    except json.JSONDecodeError as err:
        raise CaptureError(
            f"screenshot 명령의 출력이 JSON이 아닙니다 (exit={result.returncode}). "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        ) from err

    if not envelope.get("ok"):
        error = envelope.get("error", {})
        raise CaptureError(f"screenshot 명령 실패: {error.get('code')} — {error.get('message')}")

    data = envelope["data"]
    return ScreenshotGeometry(
        width=data["width"],
        height=data["height"],
        deviceWidth=data["deviceWidth"],
        deviceHeight=data["deviceHeight"],
        scale=data["scale"],
        format=data["format"],
        capturedAt=data["capturedAt"],
    )


def load_geometry_sidecar(image_path: Path) -> ScreenshotGeometry:
    """이미 캡처된 이미지 옆의 `<image>.geometry.json`을 읽는다 (재캡처 없이
    같은 이미지로 탐지만 다시 돌릴 때 쓴다). 형태는 `writeCaptureGeometry`
    (src/image/geometry.ts)가 쓰는 것과 같다."""
    sidecar = Path(f"{image_path}.geometry.json")
    if not sidecar.exists():
        raise CaptureError(f"기하 사이드카를 찾을 수 없습니다: {sidecar}. --image 대신 재캡처하세요.")

    data = json.loads(sidecar.read_text(encoding="utf-8"))
    return ScreenshotGeometry(
        width=data["width"],
        height=data["height"],
        deviceWidth=data["deviceWidth"],
        deviceHeight=data["deviceHeight"],
        scale=data["scale"],
        format=data["format"],
        capturedAt=data["capturedAt"],
    )
