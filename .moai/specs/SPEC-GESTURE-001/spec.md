---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — swipe · scroll, 그리고 화면 밖 웹 요소 도달"
version: "0.2.0"
status: draft
created: 2026-07-27
updated: 2026-07-27
author: hatae
priority: P1
phase: "v0.3.0 target"
module: "src/"
lifecycle: spec-anchored
tags: "gesture, swipe, scroll, ios, android, webview, cli, mobile-automation"
tier: M
depends_on: [SPEC-ANDROID-001, SPEC-IOS-001, SPEC-WEBVIEW-001]
---

# SPEC-GESTURE-001 — 제스처 원시 동작

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-07-27 | hatae | 최초 작성. SPEC-04 선행 스파이크로 iOS 쪽을 실측한 뒤 작성 — §C.1. SPEC-WEBVIEW-001 §D가 SPEC-04로 미뤄둔 제스처 항목을 분리해 먼저 처리한다. |
| 0.2.0 | 2026-07-27 | hatae | plan-auditor 1차 감사 **FAIL(0.66 / Tier M 기준 0.80)** 반영. 주요 수정: ① `--duration` 단위 비대칭 명시(CLI ms / iOS 초 — 그대로 흘리면 500초 스와이프, §C.1-⑦) ② `BackendRegistry`를 세 번째 구현체로 명시(§A.4) ③ 화면 크기 파생 규칙을 `CommonElement[]`에 대해 결정적으로 재정의(REQ-GEST-SCROLL-002) ④ `--amount` 범위 오류에 `INVALID_AMOUNT` 코드 부여 ⑤ `adb` 미설치 사실 정정(§C.2) ⑥ REQ-GEST-SCROLL-001에 섞여 있던 응답 표기 요구를 REQ-GEST-SCROLL-005로 분리 ⑦ GEARS 패턴 라벨 정정(Where→When/While, When→Ubiquitous) ⑧ `related_specs` → `depends_on`. |

## §A. 개요 (Context & Goal)

### A.1 배경 — 공백이 실증됐다

현재 CLI 명령은 10개이고 `DeviceBackend`는 8개 메서드다. **스크롤·스와이프 같은 제스처가 하나도 없다.**

추정이 아니라 겪은 일이다. SPEC-WEBVIEW-001 e2e(2026-07-26~27)에서 페이지를 위로 올려야 했는데 CLI에 방법이 없어 **`idb ui swipe`를 직접 호출해 CLI를 우회**했다. 자기 도구로 자기 검증을 못 한 것이다.

같은 뿌리에서 나온 제약이 하나 더 있다. SPEC-WEBVIEW-001은 화면 밖 웹 요소를 **JS `click()` 폴백으로만** 누를 수 있다. 진짜 터치가 필요한 사이트에서는 이 폴백이 통하지 않는다.

세 선행 SPEC이 모두 제스처를 "SPEC-04 영역"으로 미뤄뒀지만(SPEC-WEBVIEW-001 §D), SPEC-04(탐색 루프)는 **제스처 위에 서는** 작업이다. 순서가 뒤집혀 있어 분리한다.

### A.2 목표 (WHY)

- 기기를 스와이프·스크롤할 수 있게 한다 — 화면 밖 내용에 닿는 유일한 수단.
- 화면 밖 웹 요소를 **끌어와서 진짜 터치로** 누른다 — JS 폴백 의존을 줄인다.
- 위를 **원시 동작**으로 제공한다. 무엇을 언제 스크롤할지 판단하는 것은 CLI의 일이 아니다.

### A.3 확정된 설계 결정 (USER-APPROVED — FIXED)

| # | 결정 | 근거 |
|---|------|------|
| D1 | **CLI는 원시 동작만, 판단은 에이전트** | 사용자 확정(2026-07-27). "에이전트 무관 CLI 코어 + 얇은 스킬"이라는 프로젝트 정체성과 일치. 자율 탐색 로직은 SPEC-04로 분리 |
| D2 | **`swipe`(좌표) + `scroll`(방향) 둘 다 제공** | `swipe`만 두면 호출자가 화면 크기를 알아야 해 추측을 강요한다. `scroll`은 그 계산을 CLI가 대신하는 얇은 편의층 |
| D3 | **화면 크기는 기존 `dump`의 루트 요소에서 파생** | 새 백엔드 메서드를 만들지 않는다. 루트 요소 bounds가 양 플랫폼 모두 화면 전체다(§C.1-③) |
| D4 | **화면 밖 웹 요소는 끌어온 뒤 네이티브 탭** | 스파이크에서 성립 확인(§C.1-②). 실패 시에만 기존 JS 폴백 |

> **D3 운용 주석(0.2.0 추가 — 결정 자체는 불변)**: D3의 "루트 요소"는 `dumpUiHierarchy`가 `CommonElement[]`(배열)를 돌려주므로 그대로는 결정적이지 않다. iOS는 `describe-all`이 **중첩 없는 평탄 배열**을 주고(§C.1-⑧) 최상위 항목이 여럿일 수 있어 "루트"가 유일하지 않다. D3을 실행 가능한 규칙으로 만드는 산식은 REQ-GEST-SCROLL-002에 둔다. **새 백엔드 메서드를 만들지 않는다는 D3의 결정은 그대로다.**

### A.4 아키텍처 — 인터페이스 1개 확장

```
CLI 명령 계층      ← swipe / scroll 신규, tap --web 동작 보강
      ↓
DeviceBackend      ← swipe() 1개 추가 (8 → 9 메서드). 기존 8개 동작 불변
      ↓
구현체 3개 — 전부 swipe를 얻어야 한다
  ├─ AdbBackend        ← adb shell input swipe (ms)
  ├─ IdbBackend        ← idb ui swipe --duration (초, float)
  └─ BackendRegistry   ← DeviceBackend 파사드. serial→소유 백엔드 해석 후 위임
```

**`BackendRegistry`도 `DeviceBackend`를 구현한다**(`src/backend/registry.ts:40` — `export class BackendRegistry implements DeviceBackend`). `bin.ts`가 `runCli`에 넘기는 것이 바로 이 파사드이므로, 레지스트리에 `swipe`가 없으면 (a) 타입 체크가 깨지고 (b) `swipe`가 프로덕션 경로에서 기기에 **도달하지 못한다**. 위임 형태는 기존 `stopApp`(`registry.ts:160-162`)과 동일한 resolve-then-delegate다.

`swipe`는 기기 제어 원시 동작이므로 `DeviceBackend`에 들어가는 것이 맞다. SPEC-WEBVIEW-001의 웹 경로가 인터페이스 밖에 붙은 것과는 성격이 다르다 — 그쪽은 특정 플랫폼의 별도 전송 계층이었다.

## §B. 요구사항 (GEARS)

### B.1 스와이프 원시 동작 (REQ-GEST-SWIPE)

- **REQ-GEST-SWIPE-001** (When 이벤트): **When** `swipe <x1> <y1> <x2> <y2>`가 호출될 때, the CLI **shall** 시작점에서 끝점으로 스와이프를 전송한다. Android·iOS 양쪽에서 동작한다.
- **REQ-GEST-SWIPE-002** (When 이벤트): **When** `--duration <ms>`가 주어질 때, the CLI **shall** 그 지속시간으로 스와이프한다. 생략 시 플랫폼 기본값을 쓴다.
  - **CLI 계약 단위는 밀리초(ms)다.** 하나의 CLI가 두 단위를 노출할 수는 없으므로 ms로 고정한다.
  - `AdbBackend`는 ms를 **그대로 통과**시킨다 — `adb shell input swipe`의 지속시간 인자가 이미 ms다(§C.1-⑥).
  - `IdbBackend`는 argv를 만들기 **전에 ms → 초(float)로 환산**한다 — `idb`의 `--duration`은 **초**다(§C.1-⑦). 이 환산을 빠뜨리면 오류 없이 `--duration 500`이 **500초 스와이프**가 되어 e2e에서 정지처럼 보인다.
- **REQ-GEST-SWIPE-003** (When 감지된-이상상태): **When** 좌표가 음이 아닌 정수 4개가 아닐 때, the CLI **shall** `INVALID_COORDINATES`로 거부한다 — 기존 `tap`과 동일한 계약.
- **REQ-GEST-SWIPE-004** (Ubiquitous): the `DeviceBackend` 인터페이스 **shall** `swipe`를 얻되 **기존 8개 메서드의 시그니처·동작은 변경하지 않는다**(가법 확장). 구현체는 `AdbBackend`·`IdbBackend`·`BackendRegistry` **세 개 전부**다(§A.4).

### B.2 스크롤 편의 (REQ-GEST-SCROLL)

- **REQ-GEST-SCROLL-001** (When 이벤트): **When** `scroll <up|down|left|right>`가 호출될 때, the CLI **shall** 해당 방향으로 내용이 움직이도록 스와이프를 전송한다. **`scroll down`은 아래 내용을 보기 위해 손가락을 위로 미는 동작이다.**
- **REQ-GEST-SCROLL-002** (When 이벤트): **When** 스와이프 좌표를 계산할 때, the CLI **shall** 화면 크기를 기존 `dumpUiHierarchy`의 결과에서 얻는다 — 새 백엔드 메서드를 추가하지 않는다. 파생 규칙은 결정적이어야 한다:
  - `dumpUiHierarchy`는 `CommonElement[]`를 돌려준다. **최상위 항목 전체를 훑어** `width = max(x + w)`, `height = max(y + h)`로 화면 크기를 정한다.
  - 최상위 항목이 하나뿐일 때도 같은 식이 적용된다(그 항목의 `x+w`, `y+h`). 즉 단일 루트는 이 규칙의 특수한 경우이지 별도 분기가 아니다.
  - **인덱스 0을 루트로 가정하지 않는다.** iOS `describe-all`은 평탄 배열이라 최상위가 여럿일 수 있고(§C.1-⑧), 첫 항목이 화면 전체라는 보장이 없다.
  - 산출된 `width` 또는 `height`가 0 이하이거나 배열이 비어 있으면 REQ-GEST-SCROLL-004로 넘어간다.
- **REQ-GEST-SCROLL-003** (When 이벤트): **When** `--amount <0..1>`이 주어질 때, the CLI **shall** 화면의 그 비율만큼 스크롤한다. 생략 시 기본 비율을 쓴다. **When** 값이 0..1 범위 밖이거나 수로 파싱되지 않을 때, the CLI **shall** `INVALID_AMOUNT`로 거부하고 **어떤 제스처도 전송하지 않는다** — 기존 `INVALID_COORDINATES`/`INVALID_INDEX`/`INVALID_PAGE`와 같은 명명 계열.
- **REQ-GEST-SCROLL-004** (When 감지된-이상상태): **When** 화면 크기를 신뢰할 수 없을 때(루트 bounds가 0이거나 요소가 없을 때), the CLI **shall** `SCREEN_SIZE_UNKNOWN`으로 거부한다 — **추측한 좌표로 스와이프하지 않는다.** 엉뚱한 제스처는 되돌릴 수 없다.
- **REQ-GEST-SCROLL-005** (When 이벤트): **When** `scroll`이 성공할 때, the CLI **shall** 응답에 **방향과 실제 시작·끝 좌표를 함께** 싣는다. 방향 의미는 반대로 구현해도 오류가 나지 않으므로(plan.md §B.2), 호출자가 응답만 보고 즉시 검증할 수 있어야 한다.

### B.3 화면 밖 웹 요소 도달 (REQ-GEST-WEB)

> **전제 불변식**: `normalizeWebDomIndexed`가 이미 크기 0·음수인 사각형을 걸러낸다(`src/normalize/webdom.ts:175`). 따라서 `activateElement`(`src/cli/commands/web-support.ts:217-233`)에 도달하는 `webRectToDevicePoint`의 `null`은 **뷰포트 밖 하나뿐**이다. REQ-GEST-WEB-001의 트리거는 이 불변식 위에 서 있다 — 정규화기가 나중에 필터를 잃으면 이 트리거는 조용히 잘못된 대상까지 스크롤하려 든다.

- **REQ-GEST-WEB-001** (While 상태): **While** `tap --web`의 대상이 뷰포트 밖일 때, the CLI **shall** 먼저 그 요소를 뷰포트 안으로 끌어오고(`scrollIntoView`) 좌표를 **다시 측정**한 뒤 네이티브 탭을 시도한다.
- **REQ-GEST-WEB-002** (When 이벤트): **When** 위 스크롤이 일어났을 때, the CLI **shall** 그 사실을 응답에 표기한다 — 페이지 스크롤 위치는 **부작용**이므로 조용히 바꾸지 않는다. 경로 표기는 기존 `method` 필드를 확장한다.
- **REQ-GEST-WEB-003** (When 감지된-이상상태): **When** 끌어온 뒤에도 좌표 변환이 불가능할 때, the CLI **shall** 기존 JS `click()` 폴백으로 내려간다(SPEC-WEBVIEW-001 REQ-WEB-ACT-002 불변).

## §C. 제약 (Constraints)

### C.1 출처 (SOURCES) — 무엇을 실측했고 무엇을 못 했나

| # | 관측 사실 | 근거 | 검증 수준 |
|---|-----------|------|-----------|
| ① | `idb ui swipe x_start y_start x_end y_end [--duration] [--delta] [--udid]` | `idb ui swipe --help` 재확인(2026-07-27) + SPEC-WEBVIEW-001 e2e에서 실제 스크롤 성공 | **실측** |
| ② | `scrollIntoView({block:"center"})`로 화면 밖 요소가 들어오고 사각형이 갱신됨. `y:1672.5`(밖) → `y:212.5`(안), `scrollY 0→1460` | SPEC-04 선행 스파이크 | **실측** |
| ③ | `dump` 루트 요소 bounds가 화면 전체 — iOS `{0,0,402,874}` | 시뮬레이터 실측 | **실측(iOS)** |
| ④ | 같은 규칙이 Android에도 성립 — 루트 노드 bounds `{0,0,1080,2280}` | uiautomator 정규화 테스트 픽스처 | **픽스처만** |
| ⑤ | 스크롤 후에도 상단 크롬 오프셋 62 불변 | 스파이크 재보정 | **실측** |
| ⑥ | `adb shell input swipe x1 y1 x2 y2 [duration]` — 지속시간 단위는 **밀리초** | adb 문서 | **미실측** |
| ⑦ | **`idb`의 `--duration`은 초(float)다** — `adb`의 ms와 단위가 다르다 | fb-idb `idb/common/hid.py`(`duration: Optional[float]` → `HIDDelay(duration=duration)`), 그리고 이 저장소가 이미 그 의미에 의존한다: `src/backend/idb-backend.ts:100` `MODIFIER_HOLD_SECONDS = 2`를 `--duration 2`로 넘겨(`:239-247`) "2초 홀드"로 동작 중 | **실측(iOS)** |
| ⑧ | iOS `describe-all`은 **중첩 없는 평탄 배열**이고, Safari로 웹 페이지를 띄우면 **브라우저 크롬 6개만** 돌아온다(페이지 내용 0) | `src/backend/idb-backend.ts:154-159` @MX:NOTE/@MX:WARN(SPEC-IOS-001 실측 기록) | **실측(iOS)** |

### C.2 Android는 실측하지 못했다

작성 시점에 이 머신에 **`adb`가 설치돼 있지 않다**(`command -v adb` → `command not found`, 2026-07-27 확인). 기기 연결 여부 이전에 도구 자체가 없다. 따라서 ⑥(adb swipe 문법·단위)과 ④(루트 노드가 화면 전체)는 **문서·픽스처 근거일 뿐 기기 확인이 아니다**.

이 프로젝트는 문서 기반 가정이 틀렸던 전례가 있다 — SPEC-IOS-001에서 idb 가정 3건이 **전부** 틀렸다. 따라서 Android 관련 인수 기준은 기기가 연결되기 전까지 **PARTIAL로 남긴다.** 통과했다고 쓰지 않는다.

승격 조건은 두 가지가 **모두** 필요하다: (a) `adb` 설치, (b) 기기 연결. 둘 중 하나만으로는 AC-GEST-006을 PASS로 올릴 수 없고, ⑥의 검증 수준도 **로컬 수단으로는 미실측에서 올릴 방법이 없다.**

### C.3 알려진 한계

- **스크롤 가능 여부를 알 수 없다.** 스와이프는 보냈지만 화면이 실제로 움직였는지 CLI는 판단하지 않는다. 판단은 호출자가 `dump`를 다시 떠서 한다(D1 — 판단은 에이전트).
- **스크롤 컨테이너를 고르지 못한다.** 화면 전체 기준 스와이프이므로, 중첩 스크롤 영역 중 어디가 움직일지는 OS와 앱이 정한다.
- **웹 페이지가 떠 있으면 iOS `dump`가 화면 크기를 못 준다.** Safari 전면 상태에서 `describe-all`은 크롬 6개만 돌려준다(§C.1-⑧). 그 6개 중 화면 전체 크기를 가진 항목이 없으면 `scroll`은 REQ-GEST-SCROLL-004에 따라 `SCREEN_SIZE_UNKNOWN`으로 거부한다 — 본 SPEC의 대표 사용례에서 바로 걸릴 수 있는 한계다(plan.md §B.5).
- `scrollIntoView`는 **웹 경로 전용**이다. 네이티브 화면 밖 요소를 끌어오는 기능은 이 SPEC에 없다.

## §D. 범위에서 제외 (Exclusions)

### Out of Scope — 멀티터치 제스처
핀치·줌·회전은 두 손가락 입력이라 전송 계층이 다르다(`idb`는 지원하지 않는다). 필요해지면 별도 SPEC.

### Out of Scope — 롱프레스 · 드래그앤드롭
`--duration`이 긴 스와이프로 흉내낼 수 있으나 의미가 다르다. SPEC-WEBVIEW-001에서 롱프레스 붙여넣기 메뉴 시도가 실패한 전례가 있어(재시도 금지 기록) 별도 검증이 필요하다.

### Out of Scope — 자율 탐색 루프
무엇을 언제 스크롤할지 결정하는 로직은 **SPEC-04**다. 본 SPEC은 그 재료만 만든다(D1).

### Out of Scope — 다중 기기 상호작용
SPEC-04.

### Out of Scope — 네이티브 요소의 화면 밖 도달
`tap --id`/`--text`가 화면 밖 네이티브 요소를 스크롤해서 찾아내는 동작은 탐색 루프 영역이다.

### Out of Scope — 스크롤 성공 여부 판정
스와이프 후 화면이 실제로 움직였는지 CLI가 재확인·재시도하는 동작은 넣지 않는다(§C.3, D1).

### Out of Scope — 구현 세부(HOW)
plan.md 소관.

## §E. 로드맵 위치

| SPEC | 상태 | 관계 |
|------|------|------|
| SPEC-ANDROID-001 | completed | `DeviceBackend` 인터페이스의 출처 — 본 SPEC이 확장한다. JSON 봉투 계약(REQ-ARCH-001)도 여기서 온다 |
| SPEC-IOS-001 | completed | iOS 백엔드 — 본 SPEC이 `swipe`를 추가한다 |
| SPEC-WEBVIEW-001 | completed (0.2.0) | §D에서 제스처를 미뤄뒀고, 화면 밖 요소 제약을 본 SPEC이 완화한다 |
| **SPEC-GESTURE-001** | **draft** | **본 SPEC** |
| SPEC-04 | 커밋 | 탐색 루프 + 두 기기 상호작용. **본 SPEC의 제스처를 전제로 함** |

## §F. 명령 → 백엔드 → 도구 매핑 (설계 계약)

| CLI | DeviceBackend | Android (`adb`) | iOS (`idb`) |
|-----|---------------|-----------------|-------------|
| `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` | `swipe(serial, from, to, opts)` | `-s <serial> shell input swipe x1 y1 x2 y2 [<ms> 그대로]` | `ui swipe --udid <serial> x1 y1 x2 y2 [--duration <초, float> = ms/1000]` |
| `scroll <dir> [--amount]` | (동일 `swipe` 재사용) | 〃 | 〃 |
| `tap --web` 보강 | (백엔드 변경 없음) | 해당 없음 | 웹 경로 내부 |

**단위 비대칭이 이 표의 핵심이다.** CLI는 ms 하나만 노출하고, `IdbBackend`가 argv를 만들기 전에 초로 환산한다(REQ-GEST-SWIPE-002, §C.1-⑦). argv에 기기 셀렉터(`-s <serial>` / `--udid <serial>`)가 포함된다는 점도 기존 `tap` 구현과 동일하다(`adb-backend.ts:218`, `idb-backend.ts:196`).

`scroll`은 백엔드 메서드를 추가하지 않는다 — 방향·비율을 좌표로 바꿔 `swipe`를 호출하는 CLI 계층 편의다.
