# ui-vision PoC

안드로이드 기기 화면을 캡처해서, **YOLO UI 탐지기**(아이콘/버튼 위치를
찾는 모델)와 **OCR**(화면 속 글자를 읽는 기술)로 화면 속 요소를 인식하고,
① 인식 결과를 그려 넣은 합성 이미지와 ② 요소 데이터 리스트(JSON)를
산출하는 것을 검증하는 PoC(시범 프로젝트)입니다.

`explore-mobile`(이 저장소의 메인 TypeScript CLI)은 런타임 의존성이
0개인 게 설계 의도라서(`src/image/transform.ts` 참고), YOLO·OCR처럼
무거운 ML 라이브러리는 여기 이 별도 Python 디렉토리에 격리했습니다.
화면 캡처 자체는 새로 만들지 않고 기존 `explore-mobile screenshot`
명령을 그대로 호출해서 씁니다.

## 왜 이 구조인가

- **좌표계**: 탐지 결과의 bbox는 축소된 스크린샷 이미지 좌표입니다.
  기기 원본 좌표로 바꾸는 계산(`coords.py`)은 실제로 탭을 보내기
  **직전**에만 호출하세요 — JSON에 기기 좌표를 미리 구워 넣지 않습니다.
  (이 부분은 `src/image/geometry.ts`의 `toDeviceCoordinate`를 그대로
  미러링한 것으로, 실제 통합 시에는 이 Python 복제본 대신 TS 쪽 함수를
  부르는 경계를 두는 편이 맞습니다 — 같은 산술을 두 곳에서 각자 유지하면
  갈라집니다.)
- **의도 vs 좌표 선택 분리**: 나중에 JEV 같은 상위 판단 로직이 "텍스트가
  Save인 버튼"처럼 의도를 고르고, 실제 좌표 선택은 이 결정론적 로직이
  맡는 편이 안전합니다. `schema.py`의 `text` 필드가 그 연결고리입니다 —
  아이콘과 그 라벨 텍스트를 합쳐서(`detect.py`의 `_merge_icon_labels`)
  "이름으로 찾을 수 있는" 요소를 만듭니다.
- **클릭 후 검증은 이 PoC 범위 밖**입니다. 탭 자체는 기존 `tap`/
  `doubletap` 명령이 이미 하고, 그 응답만으로 실제 입력 성공을 보장할 수
  없다는 제약도 이미 알려져 있습니다. 이 PoC가 검증하는 것은 "화면을 보고
  구조화된 요소 목록을 뽑아낼 수 있는가"이지, 클릭-확인 루프 자체는
  다음 단계입니다. (탭 전후로 이 파이프라인을 두 번 돌려 요소 목록을
  비교하면 "무엇이 바뀌었는지"는 바로 확인할 수 있습니다 — 그 비교
  로직만 아직 없습니다.)

## 설치

```bash
cd poc/ui-vision
uv venv --python 3.11 .venv
uv sync
```

첫 실행 시 OmniParser 아이콘 탐지 가중치를 받아야 합니다(약 수백MB,
`models/`에 저장되며 git에는 커밋하지 않습니다):

```bash
.venv/bin/python -c "
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='microsoft/OmniParser-v2.0', filename='icon_detect/model.pt', local_dir='models')
"
```

## 실행

```bash
# 저장소 루트에서 explore-mobile CLI가 먼저 빌드되어 있어야 합니다: pnpm build

# 실기기에서 새로 캡처
.venv/bin/python main.py --device <시리얼>

# 이미 있는 캡처를 재사용(재탐지만)
.venv/bin/python main.py --image output/capture.jpg
```

### jev에게 다음 액션 선택 맡기기 (decide.py)

`main.py`가 만든 `<name>.elements.json`을 가지고, jev(TypeSafe AI)에게
"다음에 어떤 동작을, 어떤 요소에 할지" 선택을 맡깁니다. `TYPESAFE_API_KEY`
환경변수가 필요합니다(SDK가 자동으로 읽습니다 — 코드에는 적지 않습니다).

```bash
export TYPESAFE_API_KEY=<발급받은 키>
.venv/bin/python decide.py --json output/capture.elements.json --goal "저장 버튼을 눌러줘"
```

두 질문(`action_type`, `target_element`) 모두 `"unsure"`(판단불가: 이 화면
정보만으로는 확신 있게 고르기 어려움) 선택지를 기본으로 갖습니다.
`decide_next_action`에 `text_inputs={"검색어": "설명"}`를 주면, 텍스트를
입력해야 할 때 어떤 값을 쓸지도 같은 방식(Choice)으로 물어봅니다.

### 실제 기기에서 한 스텝씩 실행하기 (act.py / autostep.py)

`act.py`는 `Decision`을 실제 기기 명령(tap/text/key/scroll)으로 바꿔서
보냅니다. `autostep.py`는 "jev에게 묻기 → 실행 → 녹화 → 재탐지"를 한
스텝으로 묶습니다 — 여러 스텝을 이어 붙일 전체 흐름은 스크립트 하나가
혼자 돌지 않고, 호출자가 반복 실행하면서 지켜보는 구조입니다(아래
"판단불가일 때" 참고).

```bash
.venv/bin/python autostep.py --device <시리얼> --name auto-001 \
  --current output/auto-000.elements.json \
  --goal "저장 버튼을 눌러줘"
```

**판단불가(`needs_intervention`)일 때**: 아무 것도 실행되지 않습니다.
그 시점의 `<name>.annotated.png`(합성 이미지)를 보고 사람이 직접 다음
행동을 정한 뒤, `decide.make_manual_decision(action_type, target_element,
text_value)`로 만든 `Decision`을 `run_auto_step(..., override=결정)`에
넘기면 그대로 실행됩니다.

### 모델을 매번 새로 안 불러오게 하기 (model_server.py)

`detect()`는 호출할 때마다 YOLO·EasyOCR을 새로 불러와서 실측 ≈4.7초가
걸립니다. `model_server.py`를 먼저 띄워두고 `--server`를 붙이면, 이미
불러온 모델을 재사용하는 상주 프로세스에 탐지를 요청합니다.

```bash
# 터미널 1 — 서버를 계속 띄워둔다
.venv/bin/python model_server.py

# 터미널 2 — --server만 붙이면 된다
.venv/bin/python main.py --device <시리얼> --full --server
.venv/bin/python autostep.py --device <시리얼> --name auto-001 \
  --current output/auto-000.elements.json --goal "..." --server
```

서버가 안 떠 있으면 `--server`는 조용히 예전 방식으로 안 돌아가고
명확한 에러를 냅니다(`model_server.py로 먼저 띄워주세요`). 다 쓰면
서버 터미널에서 Ctrl+C로 종료합니다.

결과는 `output/`에 저장됩니다:
- `<name>.jpg` — 캡처 원본 (+ `.geometry.json` 사이드카, explore-mobile이 만듦)
- `<name>.elements.json` — 탐지 데이터 리스트
- `<name>.annotated.png` — 합성 이미지 (탐지 상자 + 라벨)

## 데이터 스키마

```json
{
  "source_image": "output/capture.jpg",
  "geometry": {
    "width": 498, "height": 1024,
    "deviceWidth": 1080, "deviceHeight": 2220,
    "scale": 2.1686746987951806,
    "format": "jpeg", "capturedAt": "2026-09-17T10:05:13.391Z"
  },
  "elements": [
    {
      "type": "icon",
      "text": "YouTube",
      "bbox": { "x": 42, "y": 693, "width": 62, "height": 62 },
      "confidence": 0.81,
      "enabled": true,
      "clickable": true
    }
  ]
}
```

`type`은 `icon | text | keyboard | permission_popup | toast | status_bar
| bottom_nav` 중 하나입니다.

## 알려진 한계 (정직하게 밝힘)

- **`enabled` 필드는 항상 `true`입니다.** 버튼이 실제로 비활성(회색)
  상태인지는 이 비전 파이프라인만으로는 신뢰성 있게 구분하지 못해서,
  추측해서 채우지 않고 고정값으로 뒀습니다. 실제로 쓰려면 별도 검증이
  필요합니다.
- **키보드·권한 팝업·토스트 분류는 위치·텍스트 키워드 휴리스틱입니다.**
  이번 검증에 실제로 캡처한 화면(홈 화면)에는 세 유형이 등장하지 않아서,
  "동작은 하지만 실제로 맞게 분류하는지"는 아직 확인되지 않았습니다
  (`classify.py` 상단 주석 참고). 상태 바·하단 내비게이션만 실제 캡처로
  눈으로 확인했습니다.
- **아이콘-라벨 병합은 "아이콘 아래 또는 위에 겹치는 텍스트"만 봅니다.**
  아이콘과 라벨이 멀리 떨어져 있거나 세로로 나열되지 않은 레이아웃에서는
  놓칠 수 있습니다.
- **(수정됨) `type: "text"`도 이제 클릭 후보에 포함됩니다** (`detect.py`
  `CLICKABLE_TYPES`). 처음엔 OCR 글자에는 "눌릴 것 같다"는 신호가 없어서
  `clickable: false`로 고정해뒀는데, 실측해보니 Android 오버플로우
  메뉴("⋮" → "보관함에 저장")·하단 탭 라벨("검색")처럼 실제로 눌리는
  요소 상당수가 순수 텍스트로만 잡혀서 후보에서 전부 빠지는 게 더 큰
  문제였습니다. `status_bar`·`toast`는 실제로 안 눌리는 게 확실해서
  그대로 제외했습니다. **트레이드오프**: 이제 조회수("2.8억회 재생")나
  아티스트명처럼 실제로는 안 눌리는 정보성 텍스트도 후보에 올라가므로,
  jev가 그런 텍스트를 잘못 고를 위험이 늘었습니다 — 아직 실측으로
  확인되진 않았습니다.
- **확신도(confidence)가 판단불가를 대신하지 않습니다.** 검색 자동완성
  화면에서 jev가 confidence 0.97로 "(Bonus Track) Always Awake" 항목을
  골랐는데도, 실제로는 아이콘 상자가 부정확하게 잡혀 있어 바로 위 아티스트
  행이 눌린 적이 있습니다. 또 confidence 0.67짜리 애매한 선택(아이콘·
  라벨이 잘못 병합된 요소)이 "판단불가" 문턱을 넘지 못해 그대로 실행되며
  엉뚱한 화면(보관함 탭)으로 넘어간 적도 있습니다 — 둘 다 실제 실행
  중에 확인된 사례입니다. `needs_intervention`은 "jev 스스로 불확실하다고
  답했는가"만 보므로, 중간 정도 확신도의 오답까지는 걸러주지 못합니다.
  이번 실행에서는 사람이 결과 화면을 보고 발견해서 수동으로 복구했습니다
  — 탭 전후 화면을 비교해 "의도한 화면 변화가 실제로 일어났는지" 확인하는
  루프가 없으면, 이런 오답은 자동으로는 못 잡습니다(§왜 이 구조인가 참고).
- **(수정됨) EasyOCR을 CPU로 고정해뒀던 게 진짜 병목이었습니다.**
  `model_server.py`로 모델 로딩만 없애면 스텝당 ≈2.8초까지만 줄고
  (`--full` 원본 해상도 기준), 나눠 재보니 YOLO는 0.2초인데 **EasyOCR
  추론 자체가 CPU에서 ≈3초** 걸렸습니다. 원인은 `gpu=False`로 고정해둔
  것 — 이 기기(애플 실리콘)에서 easyocr 1.7.2는 `gpu=True`를 주면 자동
  으로 MPS(애플 실리콘 GPU)를 쓰는데, CPU로만 강제하고 있었습니다.
  `gpu=True`로 바꾸자 같은 원본 해상도에서 OCR이 **0.65초**로 줄었고
  (첫 호출만 MPS 워밍업으로 ~2.7초), 인식된 텍스트 37개는 CPU 결과와
  글자 하나까지 완전히 동일했습니다 — 정확도 손실 없는 순수 속도
  개선입니다. **`--server`와 함께 쓸 때만 이 이득이 확실합니다** — 서버
  (모델 재로드 제거) + MPS(OCR 가속)를 합치면 캡처+탐지 전체가 ≈5.4초 →
  **≈1.7초**(실측 평균)로 줄었습니다. `--server` 없이(매번 새 파이썬
  프로세스로) 쓰면 MPS 워밍업(~2초)을 매번 새로 내야 해서 이득이
  상쇄됩니다 — 실측해보니 4.8~6.6초로 원래 CPU 경로(~5.4초)와 비슷하거나
  오히려 느렸습니다.
