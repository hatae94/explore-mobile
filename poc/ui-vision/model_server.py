"""
YOLO·EasyOCR 모델을 한 번만 불러온 채로 계속 떠 있는 상주 프로세스.

`detect()`를 매번 호출할 때마다 모델을 새로 불러오는 비용(실측 ≈4.7초 —
같은 프로세스 안에서 두 번 불러도 거의 안 줄어든다, YOLO·EasyOCR 객체를
매번 새로 만들기 때문)을 없애려고 만들었다. `detect_client.py`가 이
서버에 HTTP로 탐지를 요청한다.

표준 라이브러리(`http.server`)만 쓴다 — 로컬 PoC용 엔드포인트 하나에
새 의존성을 추가할 이유가 없다.

사용법:
    .venv/bin/python model_server.py [--port 8765]

서버를 띄운 채로 다른 터미널에서 `main.py --server ...` /
`autostep.py --server ...`를 쓰면 이 서버로 탐지 요청을 보낸다.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent / "models" / "icon_detect" / "model.pt"

_model = None
_reader = None


def _load_models() -> None:
    global _model, _reader
    from ultralytics import YOLO  # 무거운 import — 서버 시작 시 한 번만 낸다.
    import easyocr

    print("모델 로딩 중 (YOLO + EasyOCR)...")
    _model = YOLO(str(MODEL_PATH))
    # gpu=True: MPS(애플 실리콘 GPU) 가속 — CPU 대비 OCR 추론 5배 개선,
    # 정확도 손실 없음 확인됨 (detect.py의 _run_ocr 주석 참고).
    _reader = easyocr.Reader(["ko", "en"], gpu=True, verbose=False)
    print("모델 로딩 완료 — 준비됨.")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass  # 기본 접속 로그는 생략한다 — 필요하면 여기서 print로 바꾼다.

    def do_GET(self) -> None:
        if self.path == "/health":
            self._respond(200, {"ok": True})
        else:
            self._respond(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/detect":
            self._respond(404, {"ok": False, "error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
            image_path = Path(body["image_path"])
        except (json.JSONDecodeError, KeyError) as err:
            self._respond(400, {"ok": False, "error": f"잘못된 요청: {err}"})
            return

        from detect import detect  # 순환 import를 피하려고 요청 시점에 불러온다.

        try:
            elements = detect(image_path, MODEL_PATH, model=_model, reader=_reader)
        except Exception as err:  # noqa: BLE001 — 서버는 요청 하나 실패로 죽지 않아야 한다.
            self._respond(500, {"ok": False, "error": f"탐지 실패: {err}"})
            return

        self._respond(200, {"ok": True, "elements": [e.to_dict() for e in elements]})

    def _respond(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    _load_models()
    server = HTTPServer(("127.0.0.1", args.port), Handler)
    print(f"모델 서버 시작: http://127.0.0.1:{args.port} (Ctrl+C로 종료)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("서버 종료.")


if __name__ == "__main__":
    main()
