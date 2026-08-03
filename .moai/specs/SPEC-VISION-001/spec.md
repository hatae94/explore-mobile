---
id: SPEC-VISION-001
title: "iOS/Android 비전 통합 — idb 전면 제거, UI 트리 폐기, 스크린샷 좌표 단일 경로"
version: "0.1.0"
status: completed
created: 2026-08-02
updated: 2026-08-03
author: hatae
priority: P1
phase: "v0.5.0 target"
module: "src/"
lifecycle: spec-anchored
tags: "vision, ios, android, wda, idb-removal, dump-removal, screenshot, coordinates, performance"
tier: L
depends_on: [SPEC-ANDROID-001, SPEC-IOS-001, SPEC-GESTURE-001, SPEC-WEBVIEW-001]
---

# SPEC-VISION-001 — iOS/Android 비전 통합

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-02 | hatae | 최초 작성. 2026-08-02 Android 무선 adb 실기기 실측(`research.md` §1)과 CLI 오버헤드 인과 규명(§1.3)을 근거로 삼는다. 사용자 결정 3건이 범위를 확정했다 — ① `dumpUiHierarchy` **전면 제거**(비전 단일 경로, `tap/text --id/--text` 동반 제거) ② 기기 열거 중복 제거를 **이번 SPEC에 포함** ③ iOS 백엔드는 **WDA HTTP 단일**. 조사 중 드러난 연쇄 영향 3건(`scroll`의 dump 필수 의존, `text`의 동일 셀렉터 경로, `--web`의 독립성)을 §C에 기록하고 마일스톤 순서로 흡수했다. |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 두 개의 잘못된 전제가 동시에 무너졌다

이 프로젝트는 두 전제 위에 서 있었다.

**전제 1: iOS는 idb로 제어한다.** SPEC-IOS-001(completed)이 `idb-backend.ts`를 세우고 `BackendRegistry`가 adb/idb를 병합하는 구조를 만들었다. 이 전제는 iOS **시뮬레이터**에서는 성립했다.

**전제 2: 화면을 읽는 정규 경로는 UI 트리 덤프다.** `dumpUiHierarchy()`가 공통 `CommonElement[]`를 반환하고, `tap --id/--text` 셀렉터와 `scroll`의 화면 크기 파생이 그 위에 서 있다.

두 전제가 모두 실기기 앞에서 무너졌다.

전제 1은 idb가 iOS **실기기**에서 UI 계열 명령을 사실상 수행하지 못한다는 관측(`research.md` §2.1, 인용)으로 무너졌고, 그 자리를 WDA가 전 경로 실증으로 대체했다(캡처·앱 실행·좌표 탭·한글 입력 — `research.md` §2, 인용). 전제 1의 잔해는 이제 비용만 남았다: **`idb list-targets`가 735~763ms**이고(① 관측), CLI가 명령마다 기기 열거를 2회 하므로 iOS를 쓰지 않는 Android 명령조차 idb 호출 비용을 두 번 문다.

전제 2는 실기기 검증에서 dump가 Chrome 웹 콘텐츠를 보지 못한다는 사실과, 반대로 **스크린샷 좌표 판정이 정확했다**는 사실이 함께 쌓이며 흔들렸다. 2026-08-02 관측에서 표시 좌표 (340,149)에 배율 1.56을 곱한 (530,232) 탭이 Chrome Omnibox를 정확히 명중했고(`research.md` §1.5), 같은 경로로 한글+이모지 입력이 성공했다. 이전 iOS 세션에서도 스크린샷만 보고 산출한 좌표가 22/22 정확했다(②).

### A.2 목표 — 하나의 읽기 경로, 하나의 iOS 백엔드, 한 번의 열거

이 SPEC은 셋을 동시에 닫는다.

1. **읽기 경로를 스크린샷 하나로 통일한다.** UI 트리 덤프와 그 위의 네이티브 셀렉터를 제거한다.
2. **iOS 제어를 WDA HTTP 단일로 교체한다.** idb를 전면 제거한다.
3. **기기 열거를 명령당 1회로 줄인다.** registry facade의 재열거를 없앤다.

셋은 독립적으로 보이지만 한 병목에서 만난다: 현재 CLI `tap`은 1916~2327ms이고 그중 약 2000ms가 열거 2회이며, 그 열거의 대부분이 idb다(`research.md` §1.3). 읽기 경로 통일은 이 사슬에서 dump 호출까지 걷어낸다.

### A.3 비목표 (Non-Goals)

- **`--web` CSS 셀렉터 경로 변경** — WebKit Inspector 기반 웹뷰 제어(SPEC-WEBVIEW-001)는 `CommonElement` dump를 쓰지 않는 독립 축이며 이 SPEC의 범위 밖이다. 유지된다.
- **iOS 시뮬레이터 지원의 신규 기능** — idb 제거로 시뮬레이터 경로가 영향을 받으나, 시뮬레이터용 대체 백엔드 신설은 이 SPEC의 범위가 아니다(§C.5 참조).
- **캡처 자체의 성능 최적화** — Android ~600ms는 기기 측 PNG 인코딩 하한이며(`research.md` §1.1), 비디오 스트림(scrcpy 계열) 도입은 별도 SPEC이다.
- **탐색 루프·재시도 전략·화면 판단** — `interview.md`가 OUT으로 못박은 에이전트 담당 영역이다.

### A.4 Out of Scope

#### A.4.1 Out of Scope — 명시적 제외

- Android WebView(CDP over `adb forward`) 신규 트랜스포트
- iOS 물리 기기 웹뷰(USB 트랜스포트)
- WDA 자동 기동·자동 재빌드(7일 만료 대응 자동화)
- 캡처 비디오 스트림 백엔드

---

## §B. 요구사항 (GEARS)

### REQ-VISION-001 — 화면 크기는 플랫폼 네이티브 소스에서 얻는다

**Where** `scroll`이 방향·비율을 좌표로 변환하기 위해 화면 크기를 필요로 하고, **when** 화면 크기 조회가 요청되면, **the system shall** UI 트리 덤프가 아니라 플랫폼 네이티브 소스에서 크기를 얻는다 — Android는 `wm size`, iOS는 WDA 창 크기 조회 또는 스크린샷 PNG 헤더.

- 조회 실패 시 기존 `SCREEN_SIZE_UNKNOWN` 오류 코드를 유지한다(호출자 계약 보존).
- 이 요구사항은 REQ-VISION-002보다 **먼저** 충족되어야 한다. 순서가 뒤바뀌면 `scroll`이 화면 크기를 얻을 경로 없이 남는다(§C.1).

### REQ-VISION-002 — UI 트리 덤프와 네이티브 셀렉터를 제거한다

**When** 이 SPEC이 구현되면, **the system shall** 다음을 제거한다:

- `dump` 명령
- `tap --id` / `tap --text` / `tap --index`
- `text --id` / `text --text` / `text --index`
- `DeviceBackend.dumpUiHierarchy()` 인터페이스 메서드
- 요소 질의·정규화 모듈(`normalize/element-query.ts`, `normalize/uiautomator.ts`, `normalize/idb.ts`)

**Where** 호출자가 제거된 플래그를 지정하면, **the system shall** 침묵하지 않고 명확한 오류를 반환한다 — 알 수 없는 옵션으로 거부하며, 좌표 탭으로 임의 대체하지 않는다.

`--web` CSS 셀렉터(`--web "<selector>"`)는 이 요구사항의 대상이 **아니다**.

### REQ-VISION-003 — iOS 제어는 WDA HTTP 단일 경로다

**Where** 대상 기기가 iOS 플랫폼이고, **when** 캡처·탭·스와이프·텍스트 입력·앱 실행/종료가 요청되면, **the system shall** WebDriverAgent HTTP 엔드포인트를 통해 수행한다.

- WDA 접속 실패(미기동, 포트 미개방, `iproxy` 부재)는 **조용한 실패가 아니라 명시적 오류**여야 한다. 오류는 원인과 복구 절차(WDA 기동, `iproxy 8100:8100 -u <UDID>`)를 포함한다.
- WDA 좌표계는 포인트 단위이며 스크린샷 픽셀과 배율이 다르다. 이 배율은 REQ-VISION-006이 다룬다.

### REQ-VISION-004 — idb 의존을 전면 제거한다

**When** 이 SPEC이 구현되면, **the system shall** idb 실행 파일을 호출하는 모든 경로를 제거한다 — 백엔드 구현, 실행기, 오류 매핑, 대상 파싱, 클립보드, doctor 점검, 환경 서비스 배선, CLI 검증기의 idb 분기.

**Where** 시스템에 idb가 설치되어 있더라도, **the system shall** 이를 조회하거나 호출하지 않는다.

### REQ-VISION-005 — 기기 열거는 명령 1회당 1회다

**Where** 하나의 CLI 명령이 실행되고, **when** 대상 기기 해석과 백엔드 라우팅이 모두 필요하면, **the system shall** 기기 열거를 **정확히 한 번만** 수행한다.

현재는 명령 핸들러가 `listDevices()`로 한 번, registry facade가 `resolveOwningBackend()`에서 다시 한 번, 총 2회 열거한다(`research.md` §1.3). 해석 단계에서 이미 확정된 소유 백엔드를 실행 단계로 전달해 재열거를 없앤다.

### REQ-VISION-006 — 좌표계 계약을 플랫폼별로 명시한다

**Where** 호출자가 스크린샷에서 읽은 좌표로 `tap`·`swipe`를 호출하고, **when** 그 좌표가 백엔드로 전달되면, **the system shall** 플랫폼별 좌표 변환 계약을 문서화된 상수로 적용한다.

- Android: 스크린샷 픽셀 = 기기 좌표 (배율 1.0, ① 관측 확인)
- iOS: WDA 포인트 = 스크린샷 픽셀 ÷ 화면 배율 (인용 기준 ÷3, 기기별로 다를 수 있으므로 하드코딩이 아니라 조회된 값으로 도출)

배율은 추측하지 않고 관측 가능한 두 값(스크린샷 해상도, 창 크기)에서 도출한다.

### REQ-VISION-007 — 기존 웹뷰 경로에 회귀를 만들지 않는다

**Where** `--web` 플래그가 지정되고, **when** `tap`·`text`·`dump`가 웹 경로로 라우팅되면, **the system shall** SPEC-WEBVIEW-001이 정의한 동작을 그대로 유지한다.

- 네이티브 셀렉터 제거에 따라 무의미해진 네이티브/CSS 셀렉터 충돌 검사는 정리하되, CSS 셀렉터 자체의 동작은 변경하지 않는다.
- `dump --web`의 처리 방침은 §C.4가 정한다.

### REQ-VISION-008 — 제거는 실기기 검증으로 닫는다

**When** 모든 제거·교체가 완료되면, **the system shall** Android 실기기와 iOS 실기기 양쪽에서 비전 루프(캡처 → 좌표 판정 → 탭 → 검증 캡처 → 한글 입력 → 검증 캡처)를 end-to-end로 통과시킨다.

- 판정 오라클은 **스크린샷**이다. `ok:true` 응답은 오라클이 아니다.
- 성능 수치는 제거 전후를 같은 tree·같은 기기에서 측정해 비교한다. 추정치를 실측으로 보고하지 않는다.

---

## §C. 조사에서 드러난 사실과 연쇄 영향

### C.1 `scroll`은 dump에 필수 의존한다 (① 코드 확인)

`src/cli/commands/scroll.ts:104`가 `backend.dumpUiHierarchy(target.serial)`를 호출하고, `scroll-geometry.ts:55` `deriveScreenSize()`가 반환된 `CommonElement[]`의 bounds 최대값에서 화면 크기를 파생한다(69~71행에서 루트 요소를 witness로 검증). **dump를 먼저 제거하면 `scroll`이 화면 크기를 얻을 경로 없이 남는다.**

대안이 더 싸다: Android `wm size`는 단순 shell 호출이고(① `adb devices -l`과 같은 급, 25ms 수준), iOS는 WDA 창 크기 조회 또는 캡처 PNG의 IHDR 파싱으로 얻는다. dump 호출 한 번보다 저렴하므로 **퇴행이 아니라 개선**이다. 이 사실이 마일스톤 순서를 결정한다(M1 → M2).

### C.2 `text`도 같은 셀렉터 경로를 쓴다 (① 코드 확인)

`src/cli/commands/text.ts:57·63·97`이 `args.id`/`args.selectorText`를 받아 `dumpUiHierarchy`로 해석한다. `tap`의 셀렉터만 제거하면 `text`에 **동작하지 않는 플래그가 남는다.** 두 명령의 셀렉터를 함께 제거한다.

### C.3 `--web` 경로는 dump와 무관하다 (① 코드 확인)

`src/cli/commands/web-support.ts`는 WebKit Inspector가 반환한 DOM을 `normalizeWebDom`으로 처리하며 `CommonElement` dump를 사용하지 않는다. `args.id`/`args.selectorText` 참조는 389행 `hasNativeSelector` 한 곳 — 네이티브 셀렉터와 CSS 셀렉터 동시 지정 시의 충돌 검사뿐이다. 네이티브 셀렉터가 사라지면 이 검사는 무의미해지므로 정리하되, **`--web` 기능은 유지**된다.

### C.4 `dump --web`의 처리 (미확정 → M2에서 확정)

`dump` 명령 자체는 제거 대상이지만 `web-support.ts:409`가 `dump --web`으로 웹 DOM을 반환한다. 네이티브 dump 제거가 이 웹 경로까지 없애야 하는지는 SPEC-WEBVIEW-001의 표면 문제다. 이 SPEC은 **네이티브 dump만 제거**를 기본으로 하고, `dump --web`의 존치 여부는 M2에서 `--web` 회귀 검증과 함께 확정한다. 어느 쪽이든 REQ-VISION-007(웹뷰 회귀 금지)이 상한이다.

### C.5 iOS 시뮬레이터 경로의 처지 (범위 밖으로 이월)

idb는 시뮬레이터에서는 동작했다. 전면 제거는 시뮬레이터 제어 경로를 잃는다는 뜻이다. WDA는 시뮬레이터에서도 동작하지만 이 SPEC은 **실기기 검증만** 요구한다(REQ-VISION-008). 시뮬레이터 지원 여부는 이 SPEC이 결정하지 않으며, 필요해지면 별도 SPEC이 연다. 이 이월은 §A.3의 비목표와 일치한다.

### C.6 측정용 조작도 실제 조작이다 (① 관측)

지연 측정을 위해 실행한 탭이 "빈 곳"이라는 가정 아래 뉴스 카드를 눌러 검증 무대를 오염시켰다(`research.md` §1.1). REQ-VISION-008의 실기기 검증을 수행할 때, **측정용 조작의 좌표도 사전에 스크린샷으로 확인**해야 한다.

### C.7 Chrome은 프로세스 종료로 초기화되지 않는다 (① 관측)

`stop` 후 `launch`로도 마지막 탭이 복원됐다(`research.md` §1.6). 브라우저 무대에서 결정적 시작 상태를 만들려면 새 탭 생성이나 주소창 직접 입력 같은 별도 절차가 필요하다. REQ-VISION-008의 검증 시나리오 설계에 반영한다.

---

## §D. 제약

- **순서 제약**: REQ-VISION-001(화면 크기 소스 교체)이 REQ-VISION-002(dump 제거)보다 먼저 충족되어야 한다(§C.1).
- **회귀 금지**: SPEC-WEBVIEW-001의 `--web` 동작, SPEC-ANDROID-001의 adb 기본기, SPEC-GESTURE-001의 swipe/scroll 동작 계약(오류 코드 포함)은 유지된다.
- **병행 SPEC**: SPEC-IMESTATE-001이 `in-progress`다. `src/backend/`의 IME 세션 저장소를 건드리고 있으므로, 이 SPEC의 작업이 그 범위와 겹치지 않도록 한다(IME 경로는 이 SPEC의 대상이 아니다).
- **오라클 제약**: 모든 기능 판정은 스크린샷(또는 앱 상태)으로 한다. CLI의 `ok:true`, `dumpsys`의 `mServedView`는 오라클이 아니다.
- **수치 보고 제약**: 제거 후 성능은 실측으로 보고한다. `research.md` §6-3의 산술 추정을 실측처럼 제시하지 않는다.

---

## §E. 성공 기준 요약

이 SPEC은 다음이 모두 참일 때 닫힌다.

1. `grep -rl 'idb' src --include='*.ts'`가 빈 결과를 낸다(테스트 포함).
2. `dumpUiHierarchy`가 `src` 어디에도 존재하지 않는다.
3. `scroll`이 dump 없이 동작하며 기존 오류 코드 계약을 유지한다.
4. 명령 1회당 기기 열거가 1회임이 관측으로 확인된다.
5. Android·iOS 실기기 양쪽에서 비전 루프가 스크린샷 판정으로 통과한다.
6. `--web` 경로에 회귀가 없다.

기계적 판정 기준은 `acceptance.md`가 소유한다.
