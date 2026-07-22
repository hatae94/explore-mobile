---
id: SPEC-IOS-001
title: "iOS 시뮬레이터(idb) 백엔드 — 구현 계획"
version: "0.1.0"
status: in-progress
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
---

# 구현 계획 — SPEC-IOS-001

> 마일스톤은 **결정 번복 가능성(decision-reversibility)** 순으로 정렬한다. 가장 바뀔 확률이 높은 결정(데이터 모델/타입 인터페이스, 사용자 대면 라우팅 흐름)을 먼저 배치하고, 기계적 단계를 뒤로 미뤄 인간 리뷰가 고-변경 결정에 집중하도록 한다.

## §A. 컨텍스트

SPEC-ANDROID-001이 정의한 공통 요소 스키마 + device-backend interface에 **iOS/idb 백엔드**를 연결한다. 그린필드가 아니라 **기존 코드 확장**(brownfield) — device-backend interface, `AdbBackend`, 명령 계층이 이미 존재하고 테스트되어 있다(SPEC-ANDROID-001 — 현재 frontmatter `in-progress`, 개정 0.2.0 진행 중; 본 SPEC은 그 **현재 상태의 인터페이스**를 baseline으로 확장한다, §B.3 baseline-pin). 개발 방식은 **TDD**(정규화 순수 함수 + 레지스트리 라우팅 + 명령 구성이 핵심 테스트 단위, 기존 mock 패턴 계승).

본 세션에 iOS 시뮬레이터가 없어 idb JSON 스키마는 **문서 기반 검증**이며, 실 픽스처 확정은 Run 단계다(research.md §6, 게이트 결정 §B.0).

## §B. 알려진 이슈 / 리스크

- **idb 미유지보수(핵심 리스크)**: 최종 릴리스 v1.1.8(2022-08). 버전 고정 + interface 격리로 봉인(REQ-IOS-ISOLATE).
- **@MX:ANCHOR 인터페이스 변경 blast radius**: `dumpUiHierarchy` 반환 타입 변경은 **원자적**이다 — 인터페이스 + AdbBackend + 소비자가 함께 바뀌지 않으면 컴파일 실패(§B.1).
- **오류 코드 계약 변경**: `ADB_COMMAND_FAILED → BACKEND_COMMAND_FAILED`는 CLI JSON 출력 계약 변경(§B.2)으로, **레지스트리 경유 7개 명령 계층 파일 전부**(dump/tap/text/screenshot/launch/stop/key)와 관련 테스트 갱신 필요.
- **파운데이션 상태(baseline)**: §B.3.

### B.0 Run-phase 확정 항목 (게이트 결정: **DEFER** — 미해소 open question 아님)

> 아래 idb 기술 미확정은 사용자의 **명시적 게이트 결정으로 run-phase 실기기 픽스처 확정에 위임(DEFER)** 되었다. **열린 질문이 아니라 확정된 게이트 결정**이다. 각 항목은 (a) 현재 best-guess 가정 + (b) run-phase 확정 방법을 명시한다.
>
> **핵심 정규화 단위 테스트(AC-IOS-004/005/006)는 이 위임에 영향받지 않는다** — 이미 검증된 `describe-all` 실 예시(research.md §2)를 골든 픽스처로 사용하므로, 아래 미확정이 확정되기 전에도 GREEN 가능하다.

1. **`idb list-targets --json` 필드명** — 가정: `udid`/`name`/`os_version`/`state`/`target_type`(simulator/device). **Run-phase 실 `idb list-targets --json` 출력으로 확정.** 필드명이 다르면 `IdbBackend.listDevices` 파싱만 조정(격리, 인터페이스 무영향).
2. **`--udid` 타겟 플래그 + `describe-all`/`screenshot` 인자·출력 형태** — 가정: 타겟 지정 `--udid <udid>`, `screenshot`은 PNG stdout 스트림. **Run-phase 실 CLI로 확정.** 형태가 다르면 IdbBackend argv 구성만 조정(명령 계층 무영향).
3. **`idb ui key` HID 코드 해석** — 가정: USB HID Usage(Return≈40, Backspace≈42, 방향키≈79-82, Tab≈43). **Run-phase 실 `idb ui key` 동작으로 확정.** (미대응 별칭 home/back/…은 `UNSUPPORTED_KEY_ON_IOS` 거부 — 이는 확정, 위임 아님.)

기타 확정 위임(동일 처리 — 가정 명시 + run-phase 확정, 정규화 코어 테스트 무영향):
- **`INTERACTIVE_TYPES` 최종 집합** — 가정 `{Button, Cell, TextField, Switch, Link}` 시작, run-phase 실 요소 타입 관찰로 보정(tappable 파생 단위 테스트는 검증된 예시로 선행 GREEN — AC-IOS-005).
- **`AXValue` 보조 사용 여부** — 가정 `text ← AXLabel` 기본, `AXValue`(입력값) 보조는 run-phase 유스케이스 확인 후 결정.
- **`fb-idb==1.1.8` 최신 Python 호환성 + `idb-companion` 현행 설치 가능성** — 가정 고정 버전 설치 가능, run-phase 실제 설치로 확정.

### B.1 dumpUiHierarchy 반환 타입 변경 — blast radius (검증됨)

> **[검증 정정 — 중요]** 미션 브리핑은 "raw-string 소비자는 정확히 `dump.ts`와 `tap.ts`"라 했으나, 코드 grep 결과 정확히는 **명령 계층 import-and-call 소비자 3개**(dump.ts / tap.ts / **text.ts** — `focusElementBySelector`가 `normalizeUiAutomatorXml` import·호출) + **`src/index.ts:24`의 무영향 re-export 1개**(`export { normalizeUiAutomatorXml }` — 심볼 존속, 파괴 없음; 정규화 함수 자체는 무변경)다.

| 파일 | 현재 | 변경 후 |
|------|------|---------|
| `src/schema/device-backend.ts` | `dumpUiHierarchy(serial): Promise<string>` | `dumpUiHierarchy(serial): Promise<CommonElement[]>` + `DeviceInfo.platform` 추가 |
| `src/backend/adb-backend.ts` | 원시 XML 반환 | 내부에서 `normalizeUiAutomatorXml(xml)` 호출 → `CommonElement[]` 반환; `listDevices`에 `platform:"android"` 설정 |
| `src/cli/commands/dump.ts` | `normalizeUiAutomatorXml` import + 호출 | import·호출 제거; `const elements = await backend.dumpUiHierarchy(serial)` |
| `src/cli/commands/tap.ts` | `tapBySelector`가 정규화기 import + 호출 | import·호출 제거; `dumpUiHierarchy`가 반환한 `CommonElement[]` 직접 사용 |
| `src/cli/commands/text.ts` | `focusElementBySelector`가 정규화기 import + 호출 | import·호출 제거; 동일 |
| `src/index.ts:24` | `export { normalizeUiAutomatorXml }` re-export | **무변경**(심볼 존속 — 파괴 없음) |

**갱신 필요 테스트 파일(반환 타입 변경 + D3 오류코드 rename으로 무효화 — SPEC 구현 범위 포함)**:
- `src/cli/router.test.ts` — `dumpUiHierarchy`가 raw XML 문자열을 mock 반환하고 명령 계층이 정규화하던 동작을 단언(예: `:415` + `:33`/`:186`/`:202`/`:220` XML 문자열 mock). 반환 타입이 `CommonElement[]`로 바뀌므로 mock을 정규화 결과로 교체.
- `src/backend/adb-backend.test.ts` — `dumpUiHierarchy` 문자열 반환 mock(`:151`~`:222`) 및 `ADB_COMMAND_FAILED` 기대치. 반환 타입 변경 + `BACKEND_COMMAND_FAILED` rename으로 갱신.

부수 효과(긍정): 명령 계층이 플랫폼 비종속이 되면서 **요소 셀렉터(`--id`/`--text`) tap/text가 iOS에서 자동 동작**한다(IdbBackend.dumpUiHierarchy가 CommonElement[]를 반환하므로). `normalize/element-query.ts`는 무변경.

### B.2 오류 코드 일반화 근거 (7개 파일 · 우선순위 확정)

레지스트리 경유 명령 계층 **7개 파일**(`dump.ts`/`tap.ts`/`text.ts`/`screenshot.ts`/`launch.ts`/`stop.ts`/`key.ts` — 각 `:26`대 `ADB_COMMAND_FAILED`)의 catch 지점은 변경 후 플랫폼을 알 수 없다(백엔드 뒤로 격리 + 8-명령 parity로 이들 전부가 IdbBackend로도 라우팅됨). 7개 전부에서 `ADB_COMMAND_FAILED`(Android 특정)를 백엔드 중립 `BACKEND_COMMAND_FAILED`로 일반화한다(그대로 두면 iOS 실패 시 Android 특정 코드 누출). 대안(플랫폼별 코드)은 catch 지점 플랫폼 판별 곤란으로 기각.

**오류 코드 우선순위(D7 — 결정적 계약)**: 명령 계층 catch가 **최종(terminal) 경계**다. IdbBackend 서브프로세스 실패는 IdbBackend가 stderr를 담아 throw → 명령 계층 catch가 이를 감싸 **top-level `error.code = BACKEND_COMMAND_FAILED`가 항상 이긴다**(ERR-001). `IDB_COMMAND_FAILED`(ERR-002)는 백엔드 내부 세부로서 `error.message`/`error.details`에 실린다(top-level 코드 아님). 예외: 명령 핸들러가 `instanceof`로 인식하는 **타입 지정 백엔드 오류**는 그 자체 코드 우선(text.ts의 기존 `ImeRestoreFailedError`/`AdbKeyboardInstallFailedError` 분기 패턴과 동일). 우선순위: **타입 지정 인식 오류 > `BACKEND_COMMAND_FAILED`(명령 계층 일반 catch) > (message/details의) `IDB_COMMAND_FAILED`**.

### B.3 파운데이션 상태 · baseline-pin (D6)

SPEC-ANDROID-001은 현재 frontmatter `in-progress`(개정 0.2.0 진행 중)이며 **아직 `completed`가 아니다**. 본 SPEC은 그 **현재 상태의 인터페이스**(`src/schema/device-backend.ts`, `src/schema/common-element.ts`)를 **baseline**으로 확장한다. run-phase 차단을 피하기 위해 `depends_on`(완료 게이트)은 **두지 않는다** — baseline-pin 노트로만 참조한다. (SPEC-01을 `completed`로 재-close하는 것은 별도 하위 follow-up: `/moai sync`.)

## §C. 사전 점검 (Pre-flight)

- SPEC-01 코드 존재·테스트 GREEN 확인(brownfield 토대).
- SPEC ID 중복 없음(`NO_DUPLICATE`), 정규식 self-check `PASS`(단일 세그먼트 `SPEC-IOS-001` — canonical + 프로젝트 stricter 양쪽 통과).
- 기존 테스트 baseline 측정(`pnpm test`) — NEW vs pre-existing 구분 기준.
- idb 설치 가능 여부는 Run 단계(macOS+Xcode 필요). 본 세션은 문서 검증만.

## §D. 제약

- TypeScript(ESM), Node.js 20 LTS 이상, JSON in/out, `npx` 무설치.
- 공통 스키마 불변(변경 금지). device-backend interface는 **얇게** 유지(REQ-IOS-ARCH-005).
- 모든 idb 호출은 IdbBackend/idb-executor 뒤로 격리. 명령 계층 idb 누출 금지.
- iOS는 macOS+Xcode 전용 — 비-macOS graceful degradation.
- 시간 추정 금지 — 우선순위 라벨로만 표기.
- **PLAN PHASE ONLY**(본 문서는 계획). 코드는 Run 단계.

## §E. 자체 검증 (Self-Verification)

- idb 정규화 순수 함수는 JSON 픽스처로 단위 테스트(시뮬레이터 불필요) — `uiautomator.test.ts` 패턴 계승.
- 레지스트리 라우팅/graceful degradation은 mock 백엔드로 단위 테스트.
- IdbBackend 서브프로세스는 mock executor로 명령 구성(argv) 테스트(`adb-backend.test.ts` 패턴 계승).
- 기기/시뮬레이터 의존 항목(실제 탭/입력 착지, 스크린샷 유효성)은 e2e/manual로 분류(acceptance.md §D 참조).

## §F. 마일스톤 (번복 가능성 내림차순)

> 상단일수록 "바뀔 확률이 높은 결정" → 리뷰 집중. 하단일수록 기계적 단계.

### M1 — 인터페이스 · 데이터 모델 변경 [최고 변경 확률 · @MX:ANCHOR]
- `DeviceInfo.platform: "android"|"ios"` 가법 추가(REQ-IOS-SCHEMA-001).
- `dumpUiHierarchy` 반환 타입 `Promise<string>` → `Promise<CommonElement[]>`(REQ-IOS-SCHEMA-002).
- **원자적 변경**(컴파일 유지): device-backend.ts + AdbBackend(정규화 내부화 + platform 설정) + 소비자 3곳(dump.ts/tap.ts/text.ts, 정규화기 import 제거)을 함께 수정(§B.1 표).
- **테스트 갱신**: `src/cli/router.test.ts`(raw-XML mock → CommonElement[] mock), `src/backend/adb-backend.test.ts`(`dumpUiHierarchy` 문자열 반환 mock 교체).
- **스테일 doc-comment 정정(D5)**: `src/schema/common-element.ts`(33-35행대) iOS 매핑 주석이 옛 가정 `derived(AXTraits, isEnabled) -> tappable` + `plan.md §F.9 (design-only, AC-ANDROID-006)`을 담고 있다. 정정: `AXTraits` 제거(부재 확인) · `isEnabled`→`enabled` · 참조를 SPEC-IOS-001(§F.9/§F.9.1, 정규화 구현)로 갱신. 이 정정이 없으면 스키마 파일이 자기모순(iOS를 실제 구현하는데 주석은 옛 미검증 가정 유지).
- 관련: REQ-IOS-SCHEMA-001~005. `@MX:ANCHOR` 대상.

### M2 — 백엔드 레지스트리 + 크로스-플랫폼 라우팅 [높음 · 사용자 대면 흐름]
- `backend/registry.ts` 신규: `listAllDevices()`(백엔드별 나열 병합 + 플랫폼 태깅), `resolveBackend(serial)`(serial→백엔드), 가용성 기반 graceful degradation.
- `cli/router.ts`/`cli/bin.ts`/`cli/device-targeting.ts` 스레딩: 단일 `DeviceBackend`+`AdbDoctor` 파라미터 → 레지스트리 경유(design.md §C).
- 크로스-플랫폼 `AMBIGUOUS_DEVICE`(REQ-IOS-ARCH-004), serial 충돌 엣지(design.md §C.3).
- 관련: REQ-IOS-ARCH-001~005. `@MX:ANCHOR`(registry) 대상.

### M3 — idb 정규화 순수 함수 [높음 · 핵심 테스트 단위]
- `normalize/idb.ts` 신규: `normalizeIdbAccessibility(json): CommonElement[]`.
- 매핑: `type→role`(1차, `role` 보조), `AXLabel→text`, `AXUniqueId→id`, `frame{x,y,width,height}→bounds{x,y,w,h}`, `enabled→enabled`.
- `tappable` 파생(§F.9.1 정정판, **AXTraits 미사용**): `(type ∈ 상호작용 집합 OR role/subrole 상호작용 OR custom_actions 비어있지 않음) AND enabled`.
- 평면 배열 → 각 요소 `children: []`(REQ-IOS-NORM-003). never-throws/graceful(REQ-IOS-NORM-005).
- JSON 픽스처(research.md §2 실 예시 기반) 단위 테스트.
- 관련: REQ-IOS-NORM-001~005. `@MX:ANCHOR` 대상.

### M4 — IdbBackend + idb-executor [중간 · 8-명령 parity]
- `backend/idb-executor.ts` 신규: `spawnIdb`/`IdbExecutor`(binary="idb", `process-executor.ts` 위 얇은 래퍼 — `adb-executor.ts` 미러).
- `backend/idb-backend.ts` 신규: `IdbBackend implements DeviceBackend` 8개 메서드(design.md §B).
- 텍스트 입력 Unicode-native(IME 절차 없음), 키 이벤트 HID 매핑, launch/terminate, screenshot PNG.
- mock executor 명령 구성 테스트.
- 관련: REQ-IOS-BACKEND-001~008. `@MX:ANCHOR`(idb-backend), `@MX:WARN`(idb-executor).

### M5 — iOS 환경 서비스 + doctor/reset 플랫폼 분기 [중간 · 부작용 단계]
- `backend/idb-doctor.ts` 신규: idb/`idb_companion` 설치 점검, 부팅 시뮬레이터 점검, 설치 안내(macOS 전용), near-no-op `reset`.
- `cli/commands/doctor.ts`/`reset.ts` 플랫폼 분기: 대상 플랫폼으로 환경 서비스 선택(design.md §E).
- 관련: REQ-IOS-DOCTOR-001~004. `@MX:WARN`(idb-doctor).

### M6 — iOS 키 별칭 → HID 맵 [낮음]
- `backend/keycodes-ios.ts` 신규: `IOS_HID_KEYCODE`(부분 맵) — `enter`/`del`/방향키/`tab` 등 HID 대응 별칭.
- 미대응 별칭(`home`/`back`/`menu`/`app_switch`/`power`/`volume_*`) → `UNSUPPORTED_KEY_ON_IOS` graceful 오류(REQ-IOS-BACKEND-007).
- 별칭 어휘(`schema/key-alias.ts`)는 백엔드 비종속 계약이므로 무변경 — 각 백엔드가 자기 코드맵 소유(`keycodes.ts`는 Android, `keycodes-ios.ts`는 iOS).
- 관련: REQ-IOS-BACKEND-007. `@MX:NOTE` 대상.

### M7 — 오류 코드 일반화 [기계적 · 계약 노트]
- 레지스트리 경유 명령 계층 **7개 파일**(`dump.ts`/`tap.ts`/`text.ts`/`screenshot.ts`/`launch.ts`/`stop.ts`/`key.ts`)의 `ADB_COMMAND_FAILED` → `BACKEND_COMMAND_FAILED`(§B.2). IdbBackend 내부 오류는 `IDB_COMMAND_FAILED`(message/details; top-level은 `BACKEND_COMMAND_FAILED` — §B.2 우선순위).
- 관련 테스트 갱신(`router.test.ts`/`adb-backend.test.ts` 등 `ADB_COMMAND_FAILED` 기대치 → `BACKEND_COMMAND_FAILED`).
- 관련: REQ-IOS-ERR-001/002. (M1 소비자 편집과 인접 수행 가능.)

### M8 — 얇은 스킬 래퍼 갱신(선택) [최소]
- 기존 `explore-mobile` 스킬 래퍼가 iOS 기기도 CLI 경유로 다룰 수 있음을 문서 반영(스킬은 CLI만 호출 — SPEC-01 REQ-ARCH-004 계승). 코드 변경 최소.

## §F.9 iOS 필드 매핑 표 (정정판 — SPEC-01 §F.9 계승·갱신)

> **검증 정정**: 아래 표는 SPEC-01 plan.md §F.9를 이어받되, idb 실제 문서(research.md §2, 2026-07-22 검증)로 필드명을 확정·정정했다. 실 예시 요소 1건:
> `{"AXFrame":"{{199, 116}, {64, 87.5}}","AXUniqueId":"Wallet","frame":{"y":116,"x":199,"width":64,"height":87.5},"role_description":"button","AXLabel":"Wallet","content_required":false,"type":"Button","title":null,"help":null,"custom_actions":["Edit mode","Today"],"AXValue":"","enabled":true,"role":"AXButton","subrole":null}`

| 공통 스키마 필드 | Android (uiautomator) | iOS (idb accessibility) — **검증됨** |
|------------------|-----------------------|--------------------------------------|
| `role` | `class` | `type`(1차, 예 `"Button"`) / `role`(보조, 예 `"AXButton"`, AX 접두) |
| `text` | `text` / `content-desc` | `AXLabel`(1차) — 입력 필드 값은 `AXValue` 고려(§F.9.1) |
| `id` | `resource-id` | `AXUniqueId` |
| `bounds` | `bounds` (`[x1,y1][x2,y2]`) | `frame` (`{x, y, width, height}`, float 가능) → `{x, y, w:width, h:height}` |
| `tappable` | `clickable` + `enabled` | 파생(§F.9.1) — **AXTraits 미사용(부재 확인)** |
| `enabled` | `enabled` | `enabled` — **NOT `isEnabled`(정정)** |
| `children` | 중첩 node | `[]` — describe-all은 **평면 배열**(중첩 트리 아님) |

### F.9.1 iOS 필드 파생 정책 (정정 명세)

- **`role` 소스**: `type`(예 `"Button"`, `"TextField"`, `"StaticText"`, `"Cell"`)을 **1차 소스**로, `role`(AX 접두 형태, 예 `"AXButton"`)을 보조로 매핑한다. `subrole`/`role_description`은 부가 정보로 참고. (SPEC-01은 `type` 1차/`role` alias를 이미 지정했고, 본 검증이 이를 확인함.)
- **`text` 소스**: `AXLabel`을 1차로 매핑한다. 단 입력 필드의 **현재 값**은 `AXValue`에 담기므로(라벨과 값이 다를 수 있음), Run 단계에서 `text` 소비 목적(라벨 매칭 vs 값 확인)에 따라 `AXValue` 보조 사용을 결정한다(design.md §F). 기본은 `AXLabel`.
- **`tappable` 파생 (정정 — AXTraits 부재)**: SPEC-01 §F.9.1은 `AXTraits`를 근거로 삼았으나 **idb 출력에 `AXTraits`가 존재하지 않음이 검증됨**(research.md §2). 따라서 파생 규칙을 재정의한다:
  - `tappable = (type ∈ 상호작용 타입 집합 {Button, Cell, TextField, Switch, Link, ...} OR role/subrole이 상호작용 역할 OR custom_actions.length > 0) AND enabled === true`.
  - Android `clickable && enabled → tappable`과 **의미상 대칭**(상호작용 가능성 AND 활성).
  - 상호작용 타입 집합의 최종 목록은 Run 단계 실 픽스처로 보정(design.md §F).
- **비구현 확인**: 본 SPEC은 iOS를 **구현**하므로(SPEC-01과 달리) 위 정책은 **자동화 단위 테스트**로 검증한다(JSON 픽스처 → 기대 `tappable`) — AC-IOS-005/006.

## §G. 안티 패턴 (피할 것)

- idb JSON을 정규화 없이 노출(스키마 계약 위반). 정규화는 IdbBackend 소유.
- `AXTraits`를 존재한다고 가정(부재 확인됨). 미검증 필드를 확정처럼 사용.
- `isEnabled`를 필드명으로 사용(실제는 `enabled`).
- describe-all을 중첩 트리로 가정(평면 배열).
- idb 세부를 명령 계층으로 누출(격리 위반).
- iOS에 Android IME/reset 의미를 강제(idb 텍스트는 무상태).
- 미대응 iOS 키 별칭을 조용히 무시(graceful 오류로 거부).
- spec.md에 구현 세부(함수명/클래스) 유입.

## §H. 교차 참조

- 요구사항·스키마·로드맵·@MX 대상: `spec.md`
- 인수 기준·엣지 케이스·DoD: `acceptance.md`
- 설계(레지스트리/인터페이스 diff/파생/환경 서비스): `design.md`
- idb JSON 스키마·명령 시그니처·버전 검증: `research.md`
- 진행/감사 신호: `progress.md`
- 토대: `.moai/specs/SPEC-ANDROID-001/plan.md §F.9/§F.9.1`(원본 iOS 매핑 — 본 문서가 검증·정정)
