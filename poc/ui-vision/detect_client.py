"""
`model_server.py`(상주 모델 서버)에 탐지를 요청하는 얇은 클라이언트.

서버가 안 떠 있으면 **조용히 예전 방식(매번 모델 재로드)으로 돌아가지
않는다** — 명확한 에러를 낸다. 속도 개선이 실제로 적용됐는지 아닌지
헷갈리게 만드는 조용한 폴백은 두지 않는다.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

from schema import BBox, UIElement

DEFAULT_URL = "http://127.0.0.1:8765"


class ModelServerError(RuntimeError):
    """서버가 안 떠 있거나, 요청이 실패했을 때."""


def is_server_up(base_url: str = DEFAULT_URL) -> bool:
    try:
        with urllib.request.urlopen(f"{base_url}/health", timeout=1) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError):
        return False


def detect_via_server(image_path: Path, base_url: str = DEFAULT_URL) -> list[UIElement]:
    payload = json.dumps({"image_path": str(image_path)}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/detect", data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, OSError) as err:
        raise ModelServerError(
            f"모델 서버({base_url})에 연결할 수 없습니다. "
            "`.venv/bin/python model_server.py`로 먼저 띄워주세요."
        ) from err

    if not data.get("ok"):
        raise ModelServerError(f"서버 탐지 실패: {data.get('error')}")

    return [
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
