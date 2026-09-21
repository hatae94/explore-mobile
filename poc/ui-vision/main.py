"""
PoC 실행 진입점 — 캡처 → 탐지(YOLO+OCR) → 특수 영역 분류 → 합성 이미지·
JSON 데이터 리스트 저장까지 한 번에 잇는다.

사용법:
    .venv/bin/python main.py --device <시리얼>       # 실기기 캡처부터
    .venv/bin/python main.py --image output/foo.jpg  # 이미 있는 캡처 재사용
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from capture import CaptureError, capture_screenshot, load_geometry_sidecar
from classify import classify_elements
from detect import apply_clickable, detect, draw_annotated_image
from schema import DetectionResult

POC_ROOT = Path(__file__).resolve().parent
MODEL_PATH = POC_ROOT / "models" / "icon_detect" / "model.pt"
OUTPUT_DIR = POC_ROOT / "output"


def run(
    name: str, device: str | None, existing_image: Path | None, full: bool = False, use_server: bool = False
) -> DetectionResult:
    if existing_image is not None:
        image_path = existing_image
        geometry = load_geometry_sidecar(image_path)
    else:
        # --full은 CLI가 PNG로 돌려준다(screenshot.ts) — 확장자를 실제 내용과 맞춘다.
        image_path = OUTPUT_DIR / (f"{name}.png" if full else f"{name}.jpg")
        geometry = capture_screenshot(image_path, device=device, full=full)

    if use_server:
        from detect_client import detect_via_server

        elements = detect_via_server(image_path)
    else:
        elements = detect(image_path, MODEL_PATH)
    classify_elements(elements, geometry)
    apply_clickable(elements)

    result = DetectionResult(source_image=str(image_path), geometry=geometry, elements=elements)

    json_path = OUTPUT_DIR / f"{name}.elements.json"
    json_path.write_text(json.dumps(result.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    annotated_path = OUTPUT_DIR / f"{name}.annotated.png"
    draw_annotated_image(image_path, elements, annotated_path)

    print(f"요소 {len(elements)}개 탐지")
    print(f"JSON: {json_path}")
    print(f"합성 이미지: {annotated_path}")

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", help="explore-mobile 기기 시리얼 (여러 대 연결 시 필요)")
    parser.add_argument("--image", type=Path, help="재캡처하지 않고 재사용할 기존 이미지 경로")
    parser.add_argument("--name", default="capture", help="출력 파일 베이스 이름 (기본: capture)")
    parser.add_argument(
        "--full",
        action="store_true",
        help="축소·JPEG 압축 없이 원본 해상도로 캡처 (비전 파이프라인 권장)",
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="model_server.py(상주 프로세스)로 탐지 — 먼저 서버를 띄워둬야 한다",
    )
    args = parser.parse_args()

    try:
        run(name=args.name, device=args.device, existing_image=args.image, full=args.full, use_server=args.server)
    except CaptureError as err:
        raise SystemExit(f"캡처 실패: {err}") from err


if __name__ == "__main__":
    main()
