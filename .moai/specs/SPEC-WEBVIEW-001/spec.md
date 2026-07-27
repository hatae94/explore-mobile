---
id: SPEC-WEBVIEW-001
title: "iOS 시뮬레이터 웹뷰 DOM 인지 · 조작 — WebKit Inspector 백엔드"
version: "0.2.0"
status: completed
created: 2026-07-27
updated: 2026-07-27
author: hatae
amendment_of: SPEC-WEBVIEW-001
priority: P1
phase: "v0.3.0 target"
module: "src/"
lifecycle: spec-anchored
tags: "webview, dom, webkit, ios, simulator, iwdp, cli, mobile-automation"
tier: M
related_specs: [SPEC-ANDROID-001, SPEC-IOS-001]
---

# SPEC-WEBVIEW-001 — iOS 시뮬레이터 웹뷰 DOM 인지 · 조작

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-07-27 | hatae | 최초 작성. **선행 스파이크(버리는 코드)로 프로토콜을 실측한 뒤** 작성됨 — §C.1 참조. 로드맵의 "SPEC-03"에 해당하며, 범위를 iOS 시뮬레이터로 한정한다. |
| 0.2.0 | 2026-07-27 | hatae | **제자리 개정** — 다중 페이지 선택 규칙 오류 수정. 아래 §Amendments 참조. |

## Amendments

### 0.2.0 — "첫 번째 페이지를 쓴다" 규칙 폐기

| 항목 | 값 |
|------|-----|
| 직전 completed 버전 | 0.1.0 |
| `prior_completed_sha` | `b469c58` |
| 개정 범위 | REQ-WEB-PROXY-005 · REQ-WEB-CLI-004 신설, plan.md §B.2 규칙 대체, AC 4건 추가 |

**무엇이 틀렸나.** 0.1.0은 디버그 대상이 여러 개일 때 "첫 번째 페이지"를 쓰기로 했다(plan.md §B.2). 이 규칙은 마감 시점에 **미검증**으로 기록돼 있었고, SPEC-04 선행 스파이크(2026-07-27) 중 **틀린 것으로 확인**됐다.

**재현.** 시뮬레이터에서 `tap --web`으로 링크를 한 번 눌러 새 대상이 생긴 직후:

```
프록시가 보는 대상 2개
  [0] page/1 | "NAVER"            | m.naver.com     ← 화면에 없음
  [1] page/2 | "여름에만 느낄 수…" | clip.naver.com  ← 실제 화면

$ dump --web        (화면은 clip.naver.com)
elements: 338, m.naver.com 고유 요소(메일/카페/추천) 4건 발견
→ 화면에 없는 낡은 페이지를 보고
```

오류도 경고도 없다. **링크를 한 번 누른 뒤부터 모든 `--web` 명령이 다른 페이지를 조작한다.**

**왜 규칙 자체가 틀렸나.** 어느 대상이 화면에 떠 있는지 프록시의 `/json`은 알려주지 않는다. 순서에 의미가 있다는 근거도 없다(관측 1건뿐). 즉 **어떤 추측 규칙을 골라도 조용히 틀릴 수 있다** — 추측을 고르는 것 자체가 오류다.

**무엇으로 바꾸나.** 이 프로젝트가 기기 다중 연결에 이미 쓰는 규칙을 그대로 확장한다: 기기가 2대이고 `--device`가 없으면 첫 번째를 고르지 않고 `AMBIGUOUS_DEVICE`로 거부한다(REQ-MULTIDEV-002). 페이지도 동일하게 — 여러 개면 목록과 함께 거부하고 `--page <n>`으로 지정하게 한다. 새 개념이 아니라 기존 원칙의 적용이다.

덧붙여, 페이지가 하나뿐일 때도 **어느 페이지를 조작했는지 응답에 밝힌다**(REQ-WEB-CLI-004). 이 결함이 조용했던 이유가 바로 그것이 응답에 없었기 때문이다.

## §A. 개요 (Context & Goal)

### A.1 배경 — 왜 필요한지가 실측으로 증명됨

SPEC-IOS-001 검증(2026-07-26) 중 결정적 한계가 관측되었다: **`idb ui describe-all`은 네이티브 UI만 반환한다.** naver.com이 로드된 사파리에서 접근성 트리를 덤프하면 브라우저 크롬 6개 요소만 나오고, 페이지 내부의 링크·버튼·입력창은 **하나도 나오지 않는다**.

그 결과 현재 CLI로 웹 페이지 내부를 탐색하려면 **좌표 탭밖에 없다**. 좌표는 화면이 조금만 바뀌어도 깨지고, "뉴스 탭을 눌러"라는 자연어 지시를 받을 수 없다. 이 프로젝트의 최종 목적(자연어로 모바일 조작)에 정면으로 걸리는 격차다.

본 SPEC은 그 격차를 닫는다.

### A.2 목표 (WHY)

- 웹 페이지의 DOM을 읽어 **기존 공통 요소 스키마(`CommonElement`)로 정규화**한다 — 네이티브와 동일한 모양으로 다룰 수 있게.
- CSS 선택자로 웹 요소를 **탭·입력**한다 — 좌표 의존에서 벗어난다.
- 위 둘을 **기존 명령의 플래그**로 제공한다 — 명령 표면을 늘리지 않는다.

### A.3 확정된 설계 결정 (USER-APPROVED — FIXED)

| # | 결정 | 근거 |
|---|------|------|
| D1 | **조작은 네이티브 탭 기본 + JS click() 폴백** | 진짜 터치 이벤트가 필요한 사이트 대응 + 기존 `tap` 경로 재사용. 화면 밖 요소 등 좌표 변환이 불가한 경우만 JS로 폴백 |
| D2 | **프록시(iwdp) 생명주기는 CLI가 자동 관리** | 사용자는 명령 한 줄만 쓰면 됨. 소켓 탐색 방식은 스파이크에서 검증됨(§C.1-④) |
| D3 | **기존 명령에 플래그로 확장** (`dump --web`, `tap --web`, `text --web`) | 네이티브·웹이 같은 멘탈 모델을 공유. 명령 개수 유지 |
| D4 | **범위는 iOS 시뮬레이터로 한정** | Android CDP(`adb forward`)와 iOS 실기기는 별도 SPEC. 전송 계층이 다르므로 한 SPEC에 묶으면 검증 축이 흐려짐 |

### A.4 아키텍처 계층 (기존 3계층에 웹 경로 추가)

```
CLI 명령 계층 (dump / tap / text)  ← --web 플래그로 분기, 계층 경계 유지
      ↓
정규화 계층                        ← normalize/webdom.ts (신규, 순수 함수)
      ↓
WebKit Inspector 클라이언트         ← Target 래퍼 프로토콜 (신규)
      ↓
iwdp 프로세스 (자동 기동/정리)      ← 신규
      ↓
시뮬레이터 WebInspector 유닉스 소켓
```

기존 `DeviceBackend` 인터페이스는 **변경하지 않는다**. 웹 경로는 별도 서비스로 붙고, CLI 계층이 플래그에 따라 어느 쪽을 쓸지 고른다.

## §B. 요구사항 (GEARS)

### B.1 프록시 생명주기 (REQ-WEB-PROXY)

- **REQ-WEB-PROXY-001** (When 이벤트): **When** `--web` 플래그가 있는 명령이 실행될 때, the CLI **shall** 살아있는 시뮬레이터 WebInspector 유닉스 소켓을 탐색하고 `ios_webkit_debug_proxy -s unix:<소켓>`을 기동한다. **소켓 탐색은 파일 존재가 아니라 점유 여부로 판별한다** — `/private/tmp/com.apple.launchd.*/` 아래에 죽은 소켓 파일이 여러 개 남기 때문이다(§C.1-④).
- **REQ-WEB-PROXY-002** (When 이벤트): **When** 명령이 끝날 때, the CLI **shall** 자신이 기동한 프록시를 종료한다. 자신이 기동하지 않은(이미 떠 있던) 프록시는 **종료하지 않는다**.
- **REQ-WEB-PROXY-003** (When 감지된-이상상태): **When** `ios_webkit_debug_proxy`가 미설치일 때, the CLI **shall** graceful 오류(`IWDP_NOT_INSTALLED`)로 설치 안내를 반환한다 — 크래시 금지. `doctor`도 이 항목을 점검·보고한다.
- **REQ-WEB-PROXY-004** (While 상태): **While** 시뮬레이터에 열린 웹 페이지가 하나도 없을 때, the CLI **shall** graceful 오류(`NO_WEB_PAGE`)를 반환한다.
- **REQ-WEB-PROXY-005** (Where 조건, 0.2.0 신설): **Where** 디버그 가능한 페이지가 둘 이상이고 `--page`가 주어지지 않았을 때, the CLI **shall** 어느 하나를 고르지 않고 `AMBIGUOUS_PAGE`로 거부하며 전체 목록(인덱스·제목·URL)을 함께 반환한다. `--page <n>`이 주어지면 그 페이지를 쓰고, 범위를 벗어나면 graceful 오류로 거부한다. **어느 대상이 화면에 떠 있는지 프록시는 알려주지 않으므로 추측은 조용히 틀린다** — REQ-MULTIDEV-002(`AMBIGUOUS_DEVICE`)와 동일한 원칙이다.

### B.2 WebKit Inspector 프로토콜 (REQ-WEB-PROTO)

- **REQ-WEB-PROTO-001** (When 이벤트): **When** 페이지에 연결할 때, the client **shall** 모든 명령을 `Target.sendMessageToTarget`으로 감싸 보내고, 응답을 `Target.dispatchMessageFromTarget` 이벤트에서 꺼낸다. **감싸지 않은 명령은 `'<domain>' domain was not found`로 거부된다**(§C.1-②).
- **REQ-WEB-PROTO-002** (When 이벤트): **When** 연결이 열릴 때, the client **shall** `Target.targetCreated` 이벤트에서 `targetId`를 얻는다 — 하드코딩 금지.
- **REQ-WEB-PROTO-003** (When 감지된-이상상태): **When** 평가 결과가 `wasThrown: true`일 때, the client **shall** 이를 오류로 취급한다. **WebKit은 CDP의 `exceptionDetails`가 아니라 `wasThrown`을 쓴다**(§C.1-③).
- **REQ-WEB-PROTO-004** (When 이벤트): **When** 응답이 시간 내에 오지 않을 때, the client **shall** 타임아웃 오류를 반환하고 연결을 정리한다 — 무한 대기 금지.

### B.3 DOM 정규화 (REQ-WEB-NORM)

- **REQ-WEB-NORM-001** (When 이벤트): **When** 웹 DOM을 수집할 때, the normalizer **shall** 각 요소를 `CommonElement`(`role`/`text`/`id`/`bounds`/`tappable`/`enabled`/`children`)로 매핑한다. 매핑 규칙은 §F 표를 따른다.
- **REQ-WEB-NORM-002** (While 상태): **While** 요소가 화면에 보이지 않을 때(`getBoundingClientRect()`가 0 크기이거나 `display:none`), the normalizer **shall** 해당 요소를 결과에서 제외한다 — 스파이크에서 naver.com의 링크 다수가 0 크기로 관측되었다(§C.1-⑤).
- **REQ-WEB-NORM-003** (When 이벤트): the normalizer **shall** 순수 함수로 구현되어 기기·서브프로세스 없이 픽스처만으로 단위 테스트 가능해야 한다 — `normalize/uiautomator.ts`·`normalize/idb.ts`와 동일한 계약.
- **REQ-WEB-NORM-004** (When 감지된-이상상태): **When** 수집 결과가 예상 모양이 아닐 때, the normalizer **shall** 빈 배열로 degrade한다 — 예외 전파 금지.

### B.4 웹 요소 조작 (REQ-WEB-ACT)

- **REQ-WEB-ACT-001** (When 이벤트): **When** `tap --web "<CSS>"`가 호출될 때, the CLI **shall** 선택자로 요소를 찾아 그 중심의 **기기 좌표를 계산해 네이티브 탭**을 보낸다(D1 기본 경로).
- **REQ-WEB-ACT-002** (Where 조건): **Where** 요소가 뷰포트 밖이거나 좌표 변환이 불가능할 때, the CLI **shall** JS `element.click()` 폴백을 쓰고, 어떤 경로를 썼는지 응답에 표기한다 — 조용한 경로 전환 금지.
- **REQ-WEB-ACT-003** (When 이벤트): **When** `text "<문자열>" --web "<CSS>"`가 호출될 때, the CLI **shall** 해당 요소에 포커스한 뒤 문자열을 입력한다.
- **REQ-WEB-ACT-004** (When 감지된-이상상태): **When** 선택자가 아무 요소에도 매칭되지 않을 때, the CLI **shall** `ELEMENT_NOT_FOUND`로 거부하고 **아무 동작도 하지 않는다** — 기존 네이티브 선택자와 동일한 계약(엉뚱한 곳을 누르지 않음).
- **REQ-WEB-ACT-005** (When 이벤트): **When** 좌표를 변환할 때, the CLI **shall** 웹 CSS 픽셀을 기기 포인트로 매핑한다. **x축은 1:1이고 y축은 상단 크롬 오프셋 보정이 필요하다**(§C.1-⑥).

### B.5 CLI 표면 (REQ-WEB-CLI)

- **REQ-WEB-CLI-001** (When 이벤트): the CLI **shall** `dump --web`, `tap --web "<CSS>"`, `text "<문자열>" --web "<CSS>"` 세 조합을 지원한다. 기존 명령·플래그 동작은 **변경하지 않는다**(가법 확장).
- **REQ-WEB-CLI-002** (When 이벤트): the CLI **shall** 기존 JSON 봉투 계약을 그대로 지킨다 — 성공/오류 모두 단일 JSON 문서.
- **REQ-WEB-CLI-003** (Where 조건): **Where** `--web`이 Android 기기를 대상으로 쓰일 때, the CLI **shall** `UNSUPPORTED_ON_PLATFORM`으로 거부한다 — 본 SPEC 범위는 iOS 시뮬레이터다.
- **REQ-WEB-CLI-004** (When 이벤트, 0.2.0 신설): **When** 웹 명령이 성공할 때, the CLI **shall** 조작한 페이지(인덱스·제목·URL)를 응답에 포함한다 — 페이지가 하나뿐일 때도 포함한다. 0.2.0 개정의 결함이 조용했던 원인이 응답에 이 정보가 없었기 때문이다.

## §C. 제약 (Constraints)

### C.1 출처 (SOURCES) — 스파이크 실측 근거

아래는 **문서가 아니라 2026-07-27 스파이크에서 직접 관측한 사실**이다. 각 항목은 SPEC의 요구사항을 직접 뒷받침한다.

| # | 관측 사실 | 근거 |
|---|-----------|------|
| ① | 시뮬레이터는 Web Inspector가 **기본 ON** — 설정 변경 불필요 | `com.apple.mobilesafari` 도메인 자체가 없는 상태에서 페이지가 노출됨 |
| ② | **CDP가 아니다.** 감싸지 않은 `Runtime.evaluate`/`DOM.getDocument`/`Page.enable`은 전부 `'<domain>' domain was not found` | 프로브 1차 실행 결과 |
| ③ | `Target.sendMessageToTarget` 래퍼 안에서는 동일 명령이 **정상 동작** | `{"result":{"result":{"type":"string","value":"NAVER"},"wasThrown":false},"id":1}` |
| ④ | iwdp 기본값 `localhost:27753`으로는 시뮬레이터를 **못 찾는다**. `-s unix:<소켓>` 필수. `/private/tmp/`에 죽은 소켓 파일이 5개 남아 있었고 `lsof`로 점유 중인 1개만 유효 | 기기 목록이 `[]` → 소켓 지정 후 `[{"deviceId":"SIMULATOR",...}]` |
| ⑤ | naver.com에서 `a,button,input` **486개**. 수집된 링크 4개 중 3개가 `w:0,h:0`(비가시) | 링크 수집 프로브 |
| ⑥ | `dpr:3`, `innerWidth:402` = 기기 포인트 402 → **x 1:1**. `outerHeight:874`, `innerHeight:714` → 크롬 총 160pt, 상단 오프셋 ≈62pt(실측 보정 필요) | window 값 프로브 |
| ⑦ | `element.click()`으로 **실제 페이지 전환 확인**(네이버 뉴스 섹션) | 클릭 후 스크린샷 |
| ⑧ | `ios-webkit-debug-proxy` v1.9.2 (2025-07-02 릴리스) — **유지보수 중** | GitHub API 조회 |

### C.2 idb와의 대비 — 의존성 리스크 등급이 다르다

SPEC-IOS-001의 `idb`는 2022-08 이후 릴리스가 없어 가정 3건이 전부 틀렸고 결함 4건이 나왔다. `ios-webkit-debug-proxy`는 2025-07 릴리스로 유지보수 중이며, 스파이크에서 문서와 실제 동작이 대체로 일치했다. 그럼에도 **버전을 고정하고 클라이언트 뒤에 격리한다** — 같은 실수를 반복하지 않기 위한 구조적 방어.

### C.3 알려진 한계

- **debug-enabled 웹뷰만 대상**: Web Inspector가 꺼진 실기기나, 디버깅이 비활성화된 앱 내장 웹뷰는 보이지 않는다(black-box). 시뮬레이터는 기본 ON이라 이번 범위에서는 문제되지 않는다.
- **상단 크롬 오프셋은 상수가 아닐 수 있다**: 사파리 UI가 스크롤에 따라 접히거나 펼쳐지면 오프셋이 달라진다. 구현 단계에서 매 호출 실측하는 방식을 검토한다.

## §D. 범위에서 제외 (Exclusions)

### Out of Scope — Android WebView (CDP)
Android는 `adb forward` + Chrome DevTools Protocol이라 전송·프로토콜이 전혀 다르다. 별도 SPEC으로 분리한다.

### Out of Scope — iOS 실기기 웹뷰
실기기는 USB(usbmuxd) 경로이고 Web Inspector 수동 활성화가 필요하다. 시뮬레이터 검증이 끝난 뒤 별도로 다룬다.

### Out of Scope — 앱 내장 웹뷰(WKWebView) 일반
사파리 외 앱의 웹뷰는 앱이 디버깅을 허용해야만 보인다. 본 SPEC은 사파리를 대상으로 계약을 세운다.

### Out of Scope — 스크롤 · 제스처
화면 밖 요소를 위한 스크롤, 스와이프·핀치 등 제스처는 SPEC-04(탐색 루프) 영역이다. 본 SPEC은 뷰포트 안 요소의 탭·입력까지다.

### Out of Scope — 구현 세부(HOW)
클래스 구성·파일 분할·라이브러리 선택은 plan.md 소관이다.

## §E. 로드맵 위치

| SPEC | 상태 | 관계 |
|------|------|------|
| SPEC-ANDROID-001 | completed | 공통 스키마·CLI 계약의 출처 |
| SPEC-IOS-001 | completed | 본 SPEC의 필요성을 실측으로 증명(웹 콘텐츠 미노출) |
| **SPEC-WEBVIEW-001** | **draft** | **본 SPEC — iOS 시뮬레이터 웹뷰** |
| SPEC-04 | 커밋 | 탐색 루프·멀티기기. 본 SPEC의 선택자 조작을 전제로 함 |
| SPEC-05 | 커밋 | Codex 래퍼 |

## §F. 웹 DOM → CommonElement 매핑 (설계 계약)

| CommonElement | 웹 출처 | 비고 |
|---------------|---------|------|
| `role` | `tagName` (소문자) 또는 `role` 속성 | 예: `a`, `button`, `input` |
| `text` | `textContent` 트림 또는 `aria-label`/`placeholder` | 네이티브의 text/content-desc 폴백과 대칭 |
| `id` | `id` 속성 | 없으면 빈 문자열 |
| `bounds` | `getBoundingClientRect()` → `{x,y,w,h}` | **뷰포트 기준 CSS 픽셀** |
| `tappable` | 인터랙티브 태그이거나 클릭 핸들러/`role=button` 보유 + 비활성 아님 | 네이티브 `tappable` 파생과 대칭 |
| `enabled` | `disabled` 속성 부재 | |
| `children` | 평면 배열 유지(빈 배열) | `describe-all`과 동일한 선택 — 선택자 질의가 주 경로이므로 트리 구성 불필요 |

## §G. 교차 참조

- `.moai/specs/SPEC-IOS-001/spec.md` §C.2 — 웹 콘텐츠 미노출 관측(본 SPEC의 출발점)
- `.moai/specs/SPEC-ANDROID-001/spec.md` §B.7.1 — 요소 셀렉터 REQ-SELECT(본 SPEC이 웹으로 확장하는 개념)
- `src/normalize/element-query.ts` — 기존 선택자 질의(웹 경로에서 재사용 검토)
