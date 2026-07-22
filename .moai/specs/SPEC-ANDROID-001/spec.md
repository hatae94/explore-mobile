---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어"
version: "0.1.2"
status: in-progress
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
priority: P0
phase: "v0.1.0 target"
module: "src/"
lifecycle: spec-anchored
tags: "android, adb, cli, mobile-automation, device-control, typescript"
tier: M
---

# SPEC-ANDROID-001 — Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-07-22 | manager-spec | 최초 초안(draft) 작성. explore-mobile 프로젝트의 첫 SPEC. Android/adb 제어 원시 명령(primitive) + `doctor` 환경 부트스트랩 + 공통 요소 스키마 정의. |
| 0.1.1 | 2026-07-22 | manager-spec | Clarifications resolved — 4개 clarification 항목 해소를 §C 제약과 REQ-DOCTOR-002/003에 반영(pnpm 개발/npm 배포/npx, Node ≥ 20 LTS, ADBKeyBoard 번들+버전 고정, adb OS별 설치 정책). status는 draft 유지. |
| 0.1.2 | 2026-07-22 | manager-spec | audit iter-1 fixes + Tier M downgrade — SPEC ID를 2-도메인-세그먼트 구 형식에서 `SPEC-ANDROID-001`로 정규식 준수 리네임(D4), 오류 처리 요구사항 §B.10 추가(D3), REQ-INPUT-002 While화(D7)·REQ-IDEMP-001 범위 축소(D8)·REQ-INPUT-005 키셋 열거(D11)·REQ-DOCTOR-001 데몬 health(D3d), §C SOURCES 추가(D2), tier L→M. status는 draft 유지. |

---

## §A. 개요 (Context & Goal)

### A.1 배경

`explore-mobile`은 오픈소스이며 **에이전트 비종속(agent-agnostic, Claude + Codex)** 도구로, 자연어 프롬프트가 모바일 기기(에뮬레이터/시뮬레이터/실기기)를 구동·탐색할 수 있도록 `adb`(Android)와 `idb`(iOS)를 감싼다. 최종 목표는 **다중 기기 상호작용 테스트를 포함한 모바일 테스트 자동화**다.

본 SPEC(SPEC-01)은 그 토대인 **Android/adb 제어 기본기와 자동 환경 세팅 CLI 코어**를 정의한다. iOS/idb, WebView 인지, 프롬프트 탐색 루프, Codex 래퍼는 후속 SPEC(§로드맵)으로 분리한다.

### A.2 목표 (WHY)

- 자연어 에이전트가 호출할 수 있는 **JSON in/out CLI 원시 명령** 집합을 제공한다.
- **전역 설치 없이 `npx`로 실행**되는 오픈소스 배포 형태를 만든다.
- adb 백엔드를 얇은 계층으로 감싸 **향후 iOS/idb 백엔드가 재설계 없이 연결**되도록 한다.
- 한국어/이모지 입력, 다중 기기, 멱등성/리소스 위생을 **첫 SPEC부터 1급 요구사항**으로 다룬다.

### A.3 핵심 데이터 모델 — 공통 요소 스키마 (Common Element Schema)

모든 UI 인지 결과는 아래 공통 스키마로 정규화된다. 이 스키마는 본 SPEC의 가장 중요한 설계 산출물이며, iOS 백엔드가 나중에 그대로 매핑되어야 하는 **불변 계약(invariant contract)**이다.

```json
{
  "role": "string",
  "text": "string",
  "id": "string",
  "bounds": { "x": 0, "y": 0, "w": 0, "h": 0 },
  "tappable": true,
  "enabled": true,
  "children": []
}
```

Android(uiautomator) 매핑: `class → role`, `resource-id → id`, `text`/`content-desc → text`, `bounds → bounds`, `clickable + enabled → tappable`.

> **[HARD 설계 제약]** 이 스키마와 device-backend interface는 idb의 iOS 접근성 필드(AXLabel → text, AXUniqueId → id, frame → bounds, type/role → role)가 **재설계 없이** 플러그인될 수 있도록 설계되어야 한다. iOS는 본 SPEC에서 구현하지 않으나, iOS 필드 매핑 표는 `plan.md`에 문서화한다(AC-ANDROID-006).

### A.4 아키텍처 계층 (thin layers)

```
[ agent (Claude skill wrapper) ]      ← CLI만 호출 (adb 직접 실행 금지)
            │  (JSON in/out)
            ▼
[ CLI 명령 계층 ]                      ← doctor / devices / launch / stop / screenshot / tap / text / key / dump
            │
            ▼
[ 정규화 계층 (adb XML → 공통 스키마) ]  ← 순수 함수, 기기 없이 단위 테스트 가능
            │
            ▼
[ adb 서브프로세스 래퍼 ]              ← device-backend interface (iOS/idb 대체 지점)
```

---

## §B. 요구사항 (GEARS)

> 표기: GEARS 5패턴(Ubiquitous / When 이벤트 / While 상태 / Where 역량 게이트 / When 감지된-이상상태). 구조 키워드(**When/While/Where/shall/shall not**)는 영어로 유지하고 본문은 한국어로 기술한다.

### B.1 아키텍처 · 배포 (REQ-ARCH)

- **REQ-ARCH-001** (Ubiquitous): The CLI core **shall** 에이전트 비종속(agent-agnostic)이어야 하며, 모든 명령은 표준 입력/출력에서 **JSON in/out**을 주고받는다.
- **REQ-ARCH-002** (Ubiquitous): The CLI core **shall** `CLI 명령 계층 → 정규화 계층 → adb 서브프로세스 래퍼`의 3계층 구조를 유지한다.
- **REQ-ARCH-003** (Where): **Where** iOS/idb 백엔드가 향후 추가되는 경우, the device-backend interface **shall** 재설계 없이 iOS 백엔드를 연결할 수 있도록 얇게(thin) 정의되어야 한다.
- **REQ-ARCH-004** (Ubiquitous): The Claude skill wrapper **shall** CLI만 호출해야 하며, adb를 직접 실행하지 **않는다**(shall not).
- **REQ-ARCH-005** (Ubiquitous): The CLI **shall** `npx`를 통해 전역 설치(global install) 없이 실행 가능해야 한다.

### B.2 공통 요소 스키마 · 정규화 (REQ-SCHEMA)

- **REQ-SCHEMA-001** (Ubiquitous): The normalization layer **shall** UI 요소를 공통 스키마 `{ role, text, id, bounds:{x,y,w,h}, tappable, enabled, children:[...] }`로 표현한다.
- **REQ-SCHEMA-002** (When 이벤트): **When** Android uiautomator XML을 정규화할 때, the normalization layer **shall** `class→role`, `resource-id→id`, `text`/`content-desc→text`, `bounds→bounds`, `clickable+enabled→tappable` 매핑을 적용한다.
- **REQ-SCHEMA-003** (Ubiquitous): The common element schema **shall** idb의 iOS 접근성 필드 집합(AXLabel, AXUniqueId, frame, type/role)을 재설계 없이 수용할 수 있어야 한다.
- **REQ-SCHEMA-004** (Ubiquitous): The normalization layer **shall** 순수 함수(pure function)로 구현되어 기기 없이 XML 픽스처만으로 단위 테스트가 가능해야 한다.

### B.3 환경 부트스트랩 (REQ-DOCTOR)

- **REQ-DOCTOR-001** (When 이벤트): **When** `doctor` 명령이 실행될 때, the CLI **shall** adb/platform-tools 설치 여부, **adb 데몬/서버 상태(health)**, 기기 연결 상태를 점검한다(설치 여부만이 아니라 데몬 기동 여부 포함).
- **REQ-DOCTOR-002** (When 감지된-이상상태): **When** adb 또는 platform-tools가 감지되지 않은 경우, the CLI **shall** OS별 정책을 적용한다 — macOS에서는 **사용자의 명시적 동의를 받은 뒤** Homebrew로 자동 설치하고(무음 설치 금지), Linux/Windows에서는 자동 설치 없이 **정확한 수동 설치 단계만 안내**한다.
- **REQ-DOCTOR-003** (When 이벤트): **When** `doctor`가 실행될 때, the CLI **shall** 패키지에 **번들된 버전 고정(pinned) ADBKeyBoard APK**를 사용해 Unicode IME를 설치하고 활성화(`ime enable`)한다(오프라인 재현 가능). APK의 라이선스가 재배포를 허용함이 사전 검증되어야 하며 저작자 표시(attribution)를 포함한다.
- **REQ-DOCTOR-004** (When 이벤트): **When** `doctor --clean`(또는 `reset`)이 실행될 때, the CLI **shall** 원래 IME를 복원하고 임시 리소스를 제거하여 기기를 원래 상태로 되돌린다.
- **REQ-DOCTOR-005** (Ubiquitous): The `doctor` command **shall** 모든 점검·설치 결과를 JSON으로 보고한다.

### B.4 기기 목록 (REQ-DEVICES)

- **REQ-DEVICES-001** (When 이벤트): **When** `devices` 명령이 실행될 때, the CLI **shall** 연결된 모든 기기를 나열하고 각 항목에 `serial`, `model`, Android 버전, `connection state`를 포함한다.
- **REQ-DEVICES-002** (Ubiquitous): The `devices` command **shall** 각 기기가 emulator인지 physical device인지 구분하여 표시한다.

### B.5 앱 제어 (REQ-APP)

- **REQ-APP-001** (When 이벤트): **When** `launch <package>`가 실행될 때, the CLI **shall** 지정한 앱을 시작한다.
- **REQ-APP-002** (When 이벤트): **When** `stop <package>`가 실행될 때, the CLI **shall** 지정한 앱을 강제 종료(force-stop)한다.

### B.6 화면 캡처 (REQ-SCREENSHOT)

- **REQ-SCREENSHOT-001** (When 이벤트): **When** `screenshot` 명령이 실행될 때, the CLI **shall** `adb exec-out screencap -p`로 PNG를 호스트로 스트리밍한다.
- **REQ-SCREENSHOT-002** (Unwanted): The `screenshot` command **shall not** 기기에 파일을 남긴다.

### B.7 입력 원시 명령 (REQ-INPUT)

- **REQ-INPUT-001** (When 이벤트): **When** `tap <x> <y>`가 실행될 때, the CLI **shall** `adb shell input tap`으로 좌표를 탭한다.
- **REQ-INPUT-002** (While 상태): **While** 입력 문자열이 ASCII로만 구성된 상태일 때, the `text` command **shall** `adb shell input text` 빠른 경로(fast path)를 사용한다(비-ASCII 경로 REQ-INPUT-003과 대칭).
- **REQ-INPUT-003** (When 이벤트): **When** `text "<...>"`의 입력에 비-ASCII(한글/이모지)가 포함된 경우, the CLI **shall** ADBKeyBoard IME를 통해 base64 브로드캐스트(`ADB_INPUT_B64`)로 입력한다.
- **REQ-INPUT-004** (Ubiquitous): The `text` command **shall** 입력 완료 후 **항상 원래 IME를 복원**한다(오류가 발생한 경우에도 — §B.9 REQ-IDEMP-004와 결합).
- **REQ-INPUT-005** (When 이벤트): **When** `key <name>`이 실행될 때, the CLI **shall** `adb shell input keyevent`로 키 이벤트를 전송한다. 지원 키 별칭 → Android KEYCODE 매핑: `back`→BACK(4), `home`→HOME(3), `enter`→ENTER(66), `menu`→MENU(82), `app_switch`→APP_SWITCH(187), `up`/`down`/`left`/`right`→DPAD_UP/DOWN/LEFT/RIGHT(19/20/21/22), `del`→DEL(67), `tab`→TAB(61), `power`→POWER(26), `volume_up`/`volume_down`→VOLUME_UP/DOWN(24/25). 목록 외 별칭은 graceful 오류로 거부한다(전체 keycode는 Android `KeyEvent` KEYCODE 목록 참조).

### B.8 UI 계층 덤프 (REQ-DUMP)

- **REQ-DUMP-001** (When 이벤트): **When** `dump` 명령이 실행될 때, the CLI **shall** `uiautomator dump`로 UI 계층(XML)을 수집한다.
- **REQ-DUMP-002** (When 이벤트): **When** UI 계층 XML을 수집한 뒤, the CLI **shall** 이를 공통 요소 스키마로 정규화한 JSON을 출력한다.

### B.9 다중 기기 · 멱등성 · 리소스 위생 (REQ-MULTIDEV / REQ-IDEMP)

- **REQ-MULTIDEV-001** (Ubiquitous): Every command **shall** `--device <serial>` 옵션을 수용하고 adb `-s`로 대상 기기를 지정한다.
- **REQ-MULTIDEV-002** (When 감지된-이상상태): **When** 2대 이상의 기기가 연결되고 `--device`가 생략된 경우, the CLI **shall** 실행을 중단하고 **명확한 오류 메시지와 기기 목록**을 출력한다(graceful failure).
- **REQ-MULTIDEV-003** (Ubiquitous): The CLI **shall** 기기별 상태(원래 IME, 임시 리소스)를 `serial`을 키로 격리(isolation)한다.
- **REQ-MULTIDEV-004** (Ubiquitous): The CLI **shall** 임시 리소스를 `serial`로 네임스페이스화하여 동시 실행(concurrency)에 안전해야 한다.
- **REQ-IDEMP-001** (Ubiquitous): The setup/install/`doctor` operations **shall** 멱등(idempotent)해야 한다. (참고: `tap`/`text`/`key`/`screenshot`은 기기 효과 측면에서 본질적으로 비멱등이므로 멱등 대상에서 제외 — AC-ANDROID-005는 설치 멱등성만 검증한다.)
- **REQ-IDEMP-002** (When 이벤트): **When** 앱 또는 IME 설치가 요청될 때, the CLI **shall** `pm list packages`로 기존 설치 여부를 먼저 확인하여 **중복 설치를 하지 않는다**.
- **REQ-IDEMP-003** (Unwanted): The CLI **shall not** 기기에 잔여 파일을 남긴다(exec-out 스트리밍 우선).
- **REQ-IDEMP-004** (While 상태): **While** 명령이 오류로 종료되는 경우에도, the CLI **shall** 원래 IME 복원을 보장한다(cleanup on error).

### B.10 오류 처리 (REQ-ERR)

- **REQ-ERR-001** (When 감지된-이상상태): **When** 원래 IME 복원이 실패한 경우, the CLI **shall** 실패를 보고하고 **원래 IME id를 출력**하여 사용자가 수동 복구(`ime set <id>`)할 수 있게 한다(무음 실패 금지).
- **REQ-ERR-002** (When 감지된-이상상태): **When** ADBKeyBoard 설치가 실패한 경우(비호환 API 레벨/설치 거부 등), the CLI **shall** graceful 오류로 원인과 대안(수동 설치 안내)을 JSON으로 보고하고 기기 상태를 변경하지 않는다.
- **REQ-ERR-003** (When 감지된-이상상태): **When** 대상 기기가 `offline` 또는 `unauthorized` 상태인 경우, the CLI **shall** 조용히 진행하지 않고 상태를 명시한 graceful 오류를 반환한다.
- **REQ-ERR-004** (When 감지된-이상상태): **When** adb 데몬이 실행 중이 아니거나 서버 기동에 실패한 경우, the CLI **shall** graceful 오류를 반환하고 `doctor`는 데몬 health를 점검·안내한다(설치 성공만으로 정상으로 간주하지 않음).

---

## §C. 제약 (Constraints)

- **언어/런타임**: TypeScript(ESM), **Node.js 20 LTS 이상**. 오픈소스.
- **패키지 매니저/배포**: 개발은 **pnpm**을 표준으로 사용하고, **npm 레지스트리**에 배포하여 최종 사용자는 전역 설치 없이 `npx`로 실행한다. 개발용 PM(pnpm)은 최종 사용자 `npx` 실행과 독립적이다(사용자는 pnpm 불필요).
- **입출력 규약**: 모든 명령은 JSON in/out.
- **외부 의존성**: `adb`(platform-tools), ADBKeyBoard APK(Unicode IME). idb는 본 SPEC 범위 아님.
  - **adb 설치 정책(OS별)**: macOS는 사용자 명시 동의 후 Homebrew 자동 설치, Linux/Windows는 안내만(자동 설치 없음). 무음 설치 금지(REQ-DOCTOR-002).
  - **ADBKeyBoard 조달**: 버전 고정된 APK를 패키지에 **번들**(오프라인 재현 가능). 재배포 허용 라이선스(예: Apache-2.0) 사전 검증 + attribution 포함(REQ-DOCTOR-003).
- **검증된 기술 사실(2026-07-22 문서 확인, ground truth)**:
  - `adb shell input text`는 유니코드를 전송할 수 없다 → 한국어 입력은 ADBKeyBoard + base64 브로드캐스트(`ADB_INPUT_B64`)가 신뢰 경로이며, `ime enable`/`ime set` 후 반드시 원래 IME를 복원한다.
  - `adb exec-out screencap -p`는 기기에 파일을 남기지 않고 PNG를 호스트로 스트리밍한다.
  - `uiautomator dump`는 `class`/`resource-id`/`text`/`content-desc`/`bounds`/`clickable` 필드를 가진 UI 계층 XML을 생성한다.

### C.1 출처 (SOURCES) — §C ground-truth 근거

> Tier M(3-artifact)에는 research.md가 없으므로, ground-truth 기술 사실의 출처를 인라인으로 명시한다.

- idb 명령 레퍼런스: `https://fbidb.io/docs/commands`
- idb 접근성(accessibility) 필드: `https://fbidb.io/docs/accessibility`
- idb 저장소(유지보수 상태/버전): `https://github.com/facebook/idb`
- ADBKeyBoard(Unicode IME, `ADB_INPUT_B64` 브로드캐스트): `https://github.com/senzhk/ADBKeyBoard`
- Android WebView 원격 디버깅(CDP): `https://developer.chrome.com` (WebView remote debugging)
- iOS WebView 디버깅 프록시: `ios-webkit-debug-proxy` (`https://github.com/google/ios-webkit-debug-proxy`)
- adb `input text` 유니코드 제약 및 IME 우회 근거: Appium Unicode 입력 문서(Appium docs, unicode keyboard/IME)

> 주의: 위 URL은 계획 근거 표기이며, 구현 시 최신 상태를 재검증한다(WebSearch→WebFetch). 특히 idb는 미유지보수이므로 SPEC-02에서 버전 고정 시 재확인.

---

## §D. 범위에서 제외 (Exclusions)

본 SPEC(SPEC-01)은 Android/adb 기본기와 환경 부트스트랩만 다룬다. 아래 항목은 **out of scope**이며 후속 SPEC으로 분리한다. 어느 것도 버려지지 않도록 §E 로드맵에 커밋한다.

### Out of Scope — iOS/idb 구현
- iOS 시뮬레이터/실기기 제어(`idb ui describe-all`/`describe-point`/`tap`/`text`)는 구현하지 않는다 → SPEC-02.
- 본 SPEC은 device-backend interface와 공통 스키마가 iOS를 **수용 가능**함만 설계로 검증한다(코드 구현 아님).

### Out of Scope — WebView / 브라우저 DOM 인지
- Android Chrome DevTools Protocol(`adb forward`) 및 iOS `ios_webkit_debug_proxy`를 통한 WebView/DOM 인지는 다루지 않는다 → SPEC-03.

### Out of Scope — 탐색 루프 · 다중 기기 시나리오 오케스트레이션
- 프롬프트 구동 탐색 루프와 다중 기기 상호작용 시나리오 오케스트레이션은 다루지 않는다 → SPEC-04.

### Out of Scope — Codex 래퍼 · 광범위 패키징
- Codex 스킬 래퍼와 확장 패키징은 다루지 않는다(본 SPEC은 얇은 Claude 스킬 래퍼 1개만) → SPEC-05.

### Out of Scope — 구현 세부(HOW)
- 구체 함수명/클래스 구조/내부 API 스키마는 본 SPEC이 규정하지 않는다(Run 단계로 이연). 본 SPEC은 관찰 가능한 동작·계약·데이터 모델만 규정한다.

---

## §E. 로드맵 (후속 SPEC 커밋)

| SPEC | 제목(가칭) | 상태 | 핵심 메모 |
|------|-----------|------|-----------|
| SPEC-02 | iOS(idb) 백엔드 | **커밋(must-do)** | idb는 미유지보수(최종 릴리스 2022-08 v1.1.8), companion+Python+Xcode14 필요 → **idb 버전을 고정(pin)하고 backend interface 뒤로 격리**. |
| SPEC-03 | WebView/DOM 인지 | 커밋 | Android CDP(`adb forward`) / iOS `ios_webkit_debug_proxy`. **한계: webview가 debug-enabled여야 함(black-box)**. |
| SPEC-04 | 탐색 루프 · 다중 기기 시나리오 | 커밋 | 프롬프트 구동 탐색 + 다중 기기 상호작용 테스트 오케스트레이션. |
| SPEC-05 | Codex 래퍼 · 패키징 | 커밋 | Codex 스킬 래퍼 + 배포 확장. |

---

## §F. @MX 태그 대상 (식별)

> 본 SPEC은 코드를 작성하지 않으므로 아래는 Run 단계에서 생성/부착할 **@MX 태그 대상 식별** 목록이다(MoAI MX 프로토콜).

| 대상 (Run 단계 생성 예정) | 태그 | 근거 |
|---------------------------|------|------|
| 정규화 함수 (uiautomator XML → 공통 스키마) | `@MX:ANCHOR` | 불변 계약 + 높은 fan_in(모든 `dump`/인지 경로가 의존). iOS 플러그인 지점. |
| device-backend interface | `@MX:ANCHOR` | iOS/idb 대체를 위한 불변 계약(REQ-ARCH-003). |
| IME 복원 로직(정상/오류 경로) | `@MX:WARN` + `@MX:REASON` | 위험 구역: 복원 실패 시 기기 입력 상태가 손상됨(REQ-INPUT-004/REQ-IDEMP-004). |
| Unicode 입력 base64 브로드캐스트 경로(`ADB_INPUT_B64`) | `@MX:WARN` + `@MX:REASON` | 외부 APK(ADBKeyBoard) 의존, 미유지보수 위험. |
| 다중 기기 serial 격리 / 임시 리소스 네임스페이스 | `@MX:WARN` + `@MX:REASON` | 동시 실행 경합(concurrency) 위험(REQ-MULTIDEV-003/004). |
| `doctor` 자동 설치(호스트/기기 환경 변경) | `@MX:WARN` + `@MX:REASON` | 호스트·기기 환경을 변경하는 부작용. |
| 기기 의존 경로(스크린샷 유효성, 탭/텍스트 효과 등 e2e 미검증) | `@MX:TODO` | 단위 테스트 불가, e2e/수동 검증까지 미완(GREEN에서 해소). |
| exec-out 스트리밍(기기 파일 무잔류) | `@MX:NOTE` | 리소스 위생 의도 문서화(REQ-IDEMP-003). |

---

## §G. 교차 참조

- 구현 계획·마일스톤·iOS 필드 매핑 표: `plan.md`
- 인수 기준(Given-When-Then)·엣지 케이스·DoD: `acceptance.md`
- 진행 상태·감사 신호: `progress.md`
