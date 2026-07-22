---
id: SPEC-IOS-001
title: "iOS 시뮬레이터(idb) 백엔드 — 공통 스키마/백엔드 인터페이스 iOS 확장"
version: "0.1.0"
status: in-progress
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
priority: P1
phase: "v0.2.0 target"
module: "src/"
lifecycle: spec-anchored
tags: "ios, idb, simulator, cli, mobile-automation, device-control, typescript"
tier: L
related_specs: [SPEC-ANDROID-001]
---

# SPEC-IOS-001 — iOS 시뮬레이터(idb) 백엔드

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-07-22 | manager-spec | 최초 초안(draft). SPEC-ANDROID-001의 공통 스키마 + device-backend interface에 iOS/idb 백엔드를 연결. 백엔드 레지스트리(플랫폼 자동 감지 라우팅), `DeviceInfo.platform` 추가, `dumpUiHierarchy` 반환 타입을 `CommonElement[]`로 변경(정규화의 백엔드 이관), `IdbBackend`(8개 메서드), idb 정규화 순수 함수, iOS 환경 서비스 정의. idb는 미유지보수(최종 릴리스 2022-08 v1.1.8) → 버전 고정 + interface 격리. |

---

## §A. 개요 (Context & Goal)

### A.1 배경

`explore-mobile`은 에이전트 비종속(agent-agnostic) 모바일 기기 제어 CLI이다. SPEC-ANDROID-001(SPEC-01)이 Android/adb 기본기 + `doctor` 환경 부트스트랩 + **공통 요소 스키마**와 **device-backend interface**를 정의했다. 그 설계의 핵심 목표는 "iOS 백엔드가 **재설계 없이** 연결되는 것"이었다(SPEC-01 REQ-ARCH-003, REQ-SCHEMA-003, AC-ANDROID-006).

본 SPEC(SPEC-02)은 그 약속을 실제 코드로 이행한다 — **iOS 시뮬레이터를 `idb`로 제어하는 백엔드**를 추가하고, idb 접근성 필드를 공통 스키마로 매핑하며, 두 백엔드(adb + idb)를 **레지스트리**로 묶어 `--device <serial>`만으로 플랫폼이 자동 라우팅되게 한다.

> **Baseline-pin(D6)**: SPEC-ANDROID-001은 현재 frontmatter `in-progress`(개정 0.2.0 진행 중)이며 아직 `completed`가 아니다. 본 SPEC은 그 **현재 상태의 인터페이스**(`src/schema/device-backend.ts`, `src/schema/common-element.ts`)를 **baseline**으로 확장한다. run-phase 차단을 피하기 위해 `depends_on`(완료 게이트)은 두지 않는다 — baseline-pin 참조로만 표기한다. SPEC-01의 `completed` 재-close는 별도 하위 follow-up(`/moai sync`)이다.

### A.2 목표 (WHY)

- iOS 시뮬레이터를 Android와 **동일한 8개 원시 명령**(`devices`/`dump`/`screenshot`/`tap`/`text`/`key`/`launch`/`stop`)으로 제어한다(full parity).
- `idb`의 iOS 접근성 필드(`AXLabel`/`AXUniqueId`/`frame`/`type`·`role`/`enabled`)를 공통 스키마로 매핑하되, **각 백엔드가 자기 원시 포맷의 정규화를 소유**하도록 계층을 재정렬한다(adb: XML, idb: JSON).
- 두 백엔드를 **레지스트리**로 통합하여 사용자는 `--device`만 지정하고 **플랫폼은 자동 감지**되게 한다(idb 미설치 시 Android만 노출 — graceful degradation).
- idb가 미유지보수임을 전제로 **버전을 고정(pin)** 하고 모든 idb 호출을 **backend interface 뒤로 격리**한다.

### A.3 확정된 아키텍처 결정 (USER-APPROVED — FIXED)

본 SPEC은 아래 3개 결정을 **전제(고정)** 로 설계한다. 재론의 대상이 아니다.

1. **백엔드 라우팅 = 레지스트리 + 자동 감지.** `DeviceInfo`에 `platform: "android" | "ios"`를 추가한다. 레지스트리는 가용한 모든 백엔드(adb + idb)에서 기기를 나열하며 각 기기에 플랫폼을 태깅한다. 명령 라우팅은 대상 serial을 **소유한** 백엔드를 선택한다. 사용자는 `--device <serial>`만 전달하고 플랫폼은 자동 감지된다. idb 미설치 시 Android 기기만 노출된다(graceful degradation).
2. **정규화를 백엔드 안으로 이관.** 인터페이스 메서드 `dumpUiHierarchy(serial): Promise<string>` → `dumpUiHierarchy(serial): Promise<CommonElement[]>`로 변경한다. 각 백엔드가 자기 원시→CommonElement 매핑을 소유한다(adb: uiautomator XML을 `AdbBackend`가 **내부에서** `normalizeUiAutomatorXml` 호출; idb: JSON을 **신규 정규화기**가 처리). 명령 계층(`dump.ts` 및 `tap.ts`/`text.ts` 셀렉터 모드)은 플랫폼 비종속이 된다 — 하드코딩된 `normalizeUiAutomatorXml` import/호출을 제거한다. 이는 **@MX:ANCHOR** 인터페이스(`device-backend.ts`)를 변경한다. 이 결정은 SPEC-01의 원래 설계 노트("정규화는 백엔드 밖에 유지")를 **의도적으로 override** 한다 — adb(XML)와 idb(JSON)의 원시 포맷이 다르므로, 백엔드별 소유가 결합을 근본에서 제거한다(재배치가 아니라 근본 해소).
3. **범위 = 전체 8-명령 parity.** idb에 대해 8개 백엔드 메서드를 모두 구현한다: `listDevices`, `dumpUiHierarchy`, `screenshot`, `tap`, `inputText`, `sendKeyEvent`, `launchApp`, `stopApp` → CLI 표면 `devices`/`dump`/`screenshot`/`tap`/`text`/`key`/`launch`/`stop`.

### A.4 공통 요소 스키마 (불변 — iOS 수용 계약 이행)

공통 스키마 `{ role, text, id, bounds:{x,y,w,h}, tappable, enabled, children }`는 SPEC-01에서 **안정 계약(invariant)** 으로 정의되었고 iOS-ready로 설계되었다. 본 SPEC은 스키마를 **변경하지 않는다** — idb 필드를 이 스키마로 매핑할 뿐이다(§B.3, plan.md §F.9).

### A.5 아키텍처 계층 (개정 — 정규화 이관 + 레지스트리)

```
[ agent (Claude skill wrapper) ]         ← CLI만 호출
            │  (JSON in/out)
            ▼
[ CLI 명령 계층 ]                          ← 플랫폼 비종속 (정규화기 직접 참조 제거)
            │
            ▼
[ 백엔드 레지스트리 ]                       ← serial→백엔드 라우팅, listDevices 병합, graceful degradation
            │
     ┌──────┴──────┐
     ▼             ▼
[ AdbBackend ]   [ IdbBackend ]           ← 각 백엔드가 자기 정규화 소유
     │               │
 uiautomator XML   idb JSON
 → 공통 스키마     → 공통 스키마
 (내부 호출)       (신규 정규화기)
     │               │
     ▼               ▼
[ adb 래퍼 ]      [ idb 래퍼 ]            ← 서브프로세스, 버전 고정 격리
```

---

## §B. 요구사항 (GEARS)

> 표기: GEARS 5패턴(Ubiquitous / When 이벤트 / While 상태 / Where 역량 게이트 / When 감지된-이상상태). 구조 키워드(**When/While/Where/shall/shall not**)는 영어로 유지하고 본문은 한국어로 기술한다. REQ-IOS-* / AC-IOS-* 규약은 SPEC-01(REQ-*/AC-ANDROID-*)을 계승한다.

### B.1 아키텍처 · 레지스트리 라우팅 (REQ-IOS-ARCH)

- **REQ-IOS-ARCH-001** (Ubiquitous): The backend registry **shall** 가용한 모든 백엔드(adb + idb)에서 기기를 나열하고 각 `DeviceInfo`에 플랫폼(`android`/`ios`)을 태깅한다.
- **REQ-IOS-ARCH-002** (When 이벤트): **When** 명령이 `--device <serial>`로 대상 기기를 지정할 때, the backend registry **shall** 그 serial을 **소유한** 백엔드를 선택하여 명령을 라우팅한다(사용자는 플랫폼을 지정하지 않는다 — 자동 감지).
- **REQ-IOS-ARCH-003** (Where 역량 게이트): **Where** idb가 설치/가용하지 않은 경우, the backend registry **shall** Android 기기만 노출하고 오류 없이 정상 동작한다(graceful degradation). **Where** adb가 가용하지 않은 경우에도 대칭적으로 iOS 기기만 노출한다.
- **REQ-IOS-ARCH-004** (When 감지된-이상상태): **When** 2대 이상(플랫폼을 가로질러)의 기기가 연결되고 `--device`가 생략된 경우, the CLI **shall** `AMBIGUOUS_DEVICE` graceful 오류와 함께 플랫폼별 기기 목록을 출력한다(임의 선택 없음 — SPEC-01 REQ-MULTIDEV-002의 크로스-플랫폼 확장).
- **REQ-IOS-ARCH-005** (Ubiquitous): The device-backend interface **shall** 얇게(thin) 유지되어 adb/idb 어느 백엔드도 동일한 메서드 표면으로 교체·병존 가능해야 한다(SPEC-01 REQ-ARCH-003 이행).

### B.2 공통 스키마 확장 — DeviceInfo.platform · dumpUiHierarchy 반환 타입 (REQ-IOS-SCHEMA)

- **REQ-IOS-SCHEMA-001** (Ubiquitous): The `DeviceInfo` type **shall** `platform: "android" | "ios"` 필드를 **가법적으로(additive)** 포함하며, `AdbBackend`는 `"android"`, `IdbBackend`는 `"ios"`로 설정한다.
- **REQ-IOS-SCHEMA-002** (Ubiquitous): The device-backend interface method `dumpUiHierarchy` **shall** 원시 문자열 대신 `Promise<CommonElement[]>`를 반환하도록 변경되어, 정규화 책임이 각 백엔드로 이관된다.
- **REQ-IOS-SCHEMA-003** (When 이벤트): **When** `AdbBackend.dumpUiHierarchy`가 호출될 때, it **shall** uiautomator XML을 수집한 뒤 `normalizeUiAutomatorXml`을 **내부에서** 호출하여 `CommonElement[]`를 반환한다(기존 동작 보존, 계층만 이동).
- **REQ-IOS-SCHEMA-004** (Unwanted): The CLI 명령 계층(`dump`/`tap`/`text`) **shall not** `normalizeUiAutomatorXml`을 직접 import·호출한다 — 명령 계층은 정규화된 `CommonElement[]`를 백엔드로부터 수신할 뿐 플랫폼 원시 포맷을 알지 못한다.
- **REQ-IOS-SCHEMA-005** (Ubiquitous): The common element schema `{ role, text, id, bounds, tappable, enabled, children }` **shall** 변경되지 않으며, iOS 매핑은 이 스키마를 그대로 채운다(SPEC-01 불변 계약 준수).

### B.3 idb 정규화 (REQ-IOS-NORM)

- **REQ-IOS-NORM-001** (Ubiquitous): The idb normalizer **shall** 순수 함수(pure function)로 구현되어 기기/시뮬레이터 없이 JSON 픽스처만으로 단위 테스트가 가능해야 한다(SPEC-01 `normalizeUiAutomatorXml` 패턴 계승).
- **REQ-IOS-NORM-002** (When 이벤트): **When** `idb ui describe-all` JSON을 정규화할 때, the idb normalizer **shall** 다음 매핑을 적용한다 — `type→role`(1차, `role`은 보조), `AXLabel→text`, `AXUniqueId→id`, `frame{x,y,width,height}→bounds{x,y,w,h}`, `enabled→enabled`, `tappable`는 파생(§B.3 REQ-IOS-NORM-004).
- **REQ-IOS-NORM-003** (When 이벤트): **When** `idb ui describe-all` 출력이 **평면(flat) JSON 배열**인 경우, the idb normalizer **shall** 각 요소를 `children: []`(빈 배열)로 변환한다. (검증됨: idb `describe-all`은 중첩 트리가 아니라 평면 배열을 반환한다 — research.md §2. 프레임 포함관계 기반 계층 재구성은 본 SPEC 범위 밖 — §D.)
- **REQ-IOS-NORM-004** (While 상태): **While** idb 요소의 `tappable`을 파생하는 경우, the idb normalizer **shall** `(type ∈ 상호작용 타입 집합 OR role/subrole이 상호작용을 지시 OR custom_actions 비어있지 않음) AND enabled === true`인 경우에만 `tappable = true`로 파생한다. 이는 Android `clickable && enabled → tappable`과 **의미상 대칭**이다. **[검증 정정]** idb 실제 출력에는 SPEC-01 §F.9.1이 가정한 `AXTraits` 필드가 **존재하지 않는다**(research.md §2) — 파생 규칙은 `AXTraits`에 의존하지 않도록 `type`/`role`/`subrole`/`custom_actions`를 근거로 재정의한다.
- **REQ-IOS-NORM-005** (Unwanted): The idb normalizer **shall not** 예외를 던진다 — 비어있거나 손상/부분적인 JSON은 빈 배열(또는 파싱 가능한 부분만의 안전한 결과)을 반환한다(SPEC-01 §D.1 graceful 계약 계승).

### B.4 IdbBackend — 8-명령 parity (REQ-IOS-BACKEND)

- **REQ-IOS-BACKEND-001** (Ubiquitous): `IdbBackend` **shall** `DeviceBackend` 인터페이스의 8개 메서드를 모두 구현한다(`listDevices`/`dumpUiHierarchy`/`screenshot`/`tap`/`inputText`/`sendKeyEvent`/`launchApp`/`stopApp`).
- **REQ-IOS-BACKEND-002** (When 이벤트): **When** `IdbBackend.listDevices`가 호출될 때, it **shall** `idb list-targets`(JSON)로 시뮬레이터/기기를 나열하고 `udid→serial`, 이름/OS버전/상태, `target_type`(simulator/device)→`isEmulator`로 매핑하며 `platform:"ios"`를 설정한다.
- **REQ-IOS-BACKEND-003** (When 이벤트): **When** `IdbBackend.dumpUiHierarchy`가 호출될 때, it **shall** `idb ui describe-all`(JSON)을 수집하고 idb 정규화기(REQ-IOS-NORM)를 통해 `CommonElement[]`를 반환한다.
- **REQ-IOS-BACKEND-004** (When 이벤트): **When** `IdbBackend.screenshot`가 호출될 때, it **shall** `idb screenshot`로 PNG 바이트를 반환한다(기기 파일 무잔류 — SPEC-01 REQ-SCREENSHOT-002 정신 계승).
- **REQ-IOS-BACKEND-005** (When 이벤트): **When** `IdbBackend.tap(x,y)`가 호출될 때, it **shall** `idb ui tap <x> <y>`로 좌표를 탭한다.
- **REQ-IOS-BACKEND-006** (When 이벤트): **When** `IdbBackend.inputText`가 호출될 때, it **shall** `idb ui text "<...>"`로 텍스트를 입력한다. iOS 텍스트 입력은 **Unicode-native**이므로 ADBKeyBoard/IME 전환/GPL 다운로드/디스크 세션 절차가 **불필요**하다(Android 대비 대폭 단순화 — §C.2). `options.hideKeyboardAfter`는 iOS에서 대응 동작이 없어 no-op이다(관찰 가능한 무해 무시).
- **REQ-IOS-BACKEND-007** (When 이벤트 / When 감지된-이상상태): **When** `IdbBackend.sendKeyEvent(alias)`가 호출될 때, it **shall** iOS 키 별칭→HID 키코드 맵으로 변환하여 `idb ui key <code>`를 전송한다. **When** 별칭이 iOS에 대응 HID 키가 없는 경우(예: `home`/`back`/`menu`/`app_switch`/`power`/`volume_*`), the CLI **shall** graceful 오류(`UNSUPPORTED_KEY_ON_IOS`)로 거부한다(무음 무시 금지 — §C.2).
- **REQ-IOS-BACKEND-008** (When 이벤트): **When** `IdbBackend.launchApp(bundleId)` / `stopApp(bundleId)`가 호출될 때, it **shall** 각각 `idb launch <bundleId>` / `idb terminate <bundleId>`를 실행한다.

### B.5 iOS 환경 서비스 · doctor/reset (REQ-IOS-DOCTOR)

- **REQ-IOS-DOCTOR-001** (When 이벤트): **When** `doctor`가 iOS 대상(또는 iOS 환경 점검)으로 실행될 때, the CLI **shall** idb 클라이언트 설치 여부, `idb_companion` 존재 여부, 부팅된 시뮬레이터 존재 여부를 점검하고 JSON으로 보고한다(AdbDoctor와 병렬인 별도 서비스).
- **REQ-IOS-DOCTOR-002** (When 감지된-이상상태 / Where 역량 게이트): **When** idb 또는 `idb_companion`이 감지되지 않은 경우, the CLI **shall** 설치 안내(macOS 전용: `pip3 install fb-idb==1.1.8` + `brew tap facebook/fb && brew install idb-companion`)를 제공한다. **Where** 호스트가 macOS가 아닌 경우, iOS 시뮬레이터 제어는 지원되지 않음을 명시한다(iOS 시뮬레이터는 macOS+Xcode 전용).
- **REQ-IOS-DOCTOR-003** (When 이벤트): **When** `doctor`/`reset`이 실행될 때, the CLI **shall** 대상 기기의 플랫폼으로 환경 서비스를 분기한다(Android→AdbDoctor, iOS→iOS 환경 서비스).
- **REQ-IOS-DOCTOR-004** (Ubiquitous): The iOS `reset` semantics **shall** Android와 다르게 정의된다 — iOS에는 제거할 ADBKeyBoard도, 복원할 세션 IME도 없으므로(idb 텍스트는 무상태 Unicode-native), `reset`은 near-no-op이며 "iOS-specific 정리 불필요"를 명시적으로 보고한다. Android의 IME/APK 정리 의미를 iOS에 강제하지 않는다.

### B.6 오류 코드 일반화 (REQ-IOS-ERR)

- **REQ-IOS-ERR-001** (When 감지된-이상상태): **When** 레지스트리 경유 플랫폼 비종속 명령 계층 **7개 파일**(`dump`/`tap`/`text`/`screenshot`/`launch`/`stop`/`key`)에서 백엔드 호출이 일반 실패하는 경우, the CLI **shall** 백엔드 중립 오류 코드 `BACKEND_COMMAND_FAILED`를 방출한다(기존 `ADB_COMMAND_FAILED`를 7개 전부 대체 — §C.3). 명령 계층 catch가 최종 경계이므로 top-level `error.code`는 `BACKEND_COMMAND_FAILED`가 우선하며, 백엔드 세부(`IDB_COMMAND_FAILED`)는 message/details에 실린다(우선순위 §C.3).
- **REQ-IOS-ERR-002** (When 감지된-이상상태): **When** idb 서브프로세스가 실패하는 경우, `IdbBackend` **shall** 원인(stderr)을 메시지에 담아 graceful 오류로 표면화하며(백엔드 세부 코드 `IDB_COMMAND_FAILED` 가용), 기기 상태를 변경하지 않는다(부분 부작용 없음). 명령 계층 경유 시 top-level 코드는 `BACKEND_COMMAND_FAILED`가 우선한다(§C.3 우선순위).

### B.7 idb 버전 고정 · 격리 (REQ-IOS-ISOLATE)

- **REQ-IOS-ISOLATE-001** (Ubiquitous): The project **shall** idb를 버전 고정(pin)하여 참조한다 — `fb-idb==1.1.8`(pip, 최종 릴리스 2022-08), `idb-companion`(brew). 미유지보수 리스크를 고정된 버전으로 봉인한다.
- **REQ-IOS-ISOLATE-002** (Ubiquitous): Every idb 서브프로세스 호출 **shall** `IdbBackend`/`idb-executor`를 통해서만 이루어지며, 명령 계층으로 idb 세부가 누출되지 **않는다**(SPEC-01 adb 격리 규율 계승).

---

## §C. 제약 (Constraints)

- **언어/런타임**: TypeScript(ESM), Node.js 20 LTS 이상. `npx` 무설치 실행(SPEC-01 §C 계승).
- **입출력 규약**: 모든 명령은 JSON in/out(SPEC-01 REQ-ARCH-001).
- **플랫폼 제약**: iOS 시뮬레이터 제어는 **macOS + Xcode 전용**이다. idb는 `idb_companion`(brew) + `fb-idb`(pip) 조합을 요구한다. 비-macOS 호스트에서는 iOS 기능이 graceful degradation(iOS 기기 미노출)된다.

### C.1 출처 (SOURCES) — ground-truth 근거 (research.md 상세)

- idb 접근성 필드(검증): `http://fbidb.io/docs/accessibility/` (2026-07-22 확인).
- idb 명령 시그니처: `http://fbidb.io/docs/commands/` (2026-07-22 확인).
- idb 저장소/버전: `https://github.com/facebook/idb` (최종 릴리스 v1.1.8, 2022-08-11 확인).

### C.2 iOS vs Android 차이 (설계 단순화 · 주의점)

- **텍스트 입력 대폭 단순화**: iOS `idb ui text`는 Unicode-native다. Android의 ADBKeyBoard(GPL-2.0 런타임 다운로드) + base64 브로드캐스트 + 세션 기반 IME + 디스크 영속 + reset 복원 절차가 **전부 불필요**하다. 이는 iOS 백엔드가 Android보다 극적으로 단순해지는 지점이다.
- **키 이벤트 의미 차이**: idb `ui key`는 **HID 키코드**(USB HID usage)를 받는다. Android KEYCODE와 값 체계가 다르다. `enter`/`del`/방향키/`tab` 등은 HID 대응이 있으나, `home`/`back`/`menu`/`app_switch`/`power`/`volume_*`는 iOS HID 키보드에 대응이 없어 graceful 오류로 거부한다(REQ-IOS-BACKEND-007).
- **describe-all은 평면 배열**: idb 접근성 덤프는 중첩 트리가 아니라 평면 요소 배열이다(Android uiautomator는 중첩 트리). 공통 스키마의 `children`은 iOS에서 빈 배열이 된다. 요소 셀렉터(`--id`/`--text`)는 평면 배열에서도 정상 동작한다(DFS가 루트 배열을 순회).
- **필드명 검증 정정**: idb 실제 필드는 `enabled`(NOT `isEnabled`)이며 `AXTraits` 필드는 **존재하지 않는다**. SPEC-01 §F.9.1의 `isEnabled`/`AXTraits` 가정은 본 SPEC에서 정정된다(research.md §2, §5).
- **reset 의미 차이**: iOS `reset`은 near-no-op(정리할 IME/APK 상태 없음).

### C.3 계약 변경 노트 (ADB_COMMAND_FAILED → BACKEND_COMMAND_FAILED, 7개 파일)

레지스트리 경유 명령 계층 **7개 파일**(`dump.ts`/`tap.ts`/`text.ts`/`screenshot.ts`/`launch.ts`/`stop.ts`/`key.ts`)이 플랫폼 비종속이 되면서, 이들이 방출하던 `ADB_COMMAND_FAILED`는 백엔드 중립 `BACKEND_COMMAND_FAILED`로 일반화된다(8-명령 parity로 7개 전부 IdbBackend로도 라우팅되므로, 그대로 두면 iOS 실패 시 Android 특정 코드 누출). 이는 **CLI JSON 오류 출력 계약 변경**(기존 코드 기대 소비자/테스트 갱신 필요). 대안(플랫폼별 코드)은 catch 지점 플랫폼 판별 곤란으로 기각.

**오류 코드 우선순위(결정적 계약 — D7)**: 명령 계층 catch가 최종 경계다 → top-level `error.code = BACKEND_COMMAND_FAILED`가 idb 서브프로세스 일반 실패에 항상 우선한다(ERR-001). `IDB_COMMAND_FAILED`(ERR-002)는 백엔드 내부 세부로 `message`/`details`에 실린다(top-level 아님). 단, 명령 핸들러가 `instanceof`로 인식하는 타입 지정 백엔드 오류는 그 자체 코드 우선(기존 text.ts 특수-오류 분기와 동일). 우선순위: **타입 지정 인식 오류 > `BACKEND_COMMAND_FAILED`(명령 계층 일반 catch) > (message/details의) `IDB_COMMAND_FAILED`**. 상세 근거는 plan.md §B.2 / design.md §D.

---

## §D. 범위에서 제외 (Exclusions)

본 SPEC은 iOS 시뮬레이터를 `idb`로 제어하는 백엔드와 레지스트리 통합만 다룬다. 아래는 **out of scope**다.

### Out of Scope — iOS 실기기(physical device)
- 본 SPEC은 iOS **시뮬레이터**를 1차 대상으로 한다. `idb`는 실기기도 지원하나(별도 프로비저닝/서명 필요), 실기기 특유의 서명/개발자 계정/신뢰 설정은 다루지 않는다 → 후속.
- 단, `listDevices`는 `target_type`으로 시뮬레이터/기기를 구분하여 표시한다(구분만 하고 실기기 전용 워크플로는 미구현).

### Out of Scope — iOS 접근성 계층 재구성
- idb `describe-all`의 평면 배열을 프레임 포함관계로 중첩 트리로 재구성하는 작업은 다루지 않는다(`children: []` 평면 유지) → 후속 개선 후보.

### Out of Scope — WebView / DOM 인지 (iOS)
- iOS `ios_webkit_debug_proxy`를 통한 WebView/DOM 인지는 다루지 않는다 → SPEC-03.

### Out of Scope — idb 키코드 완전 매핑
- iOS HID 키코드의 전체 커버리지(모든 특수키)는 다루지 않는다. 공통 별칭 집합에 대응하는 HID 키만 매핑하고, 대응 없는 별칭은 graceful 오류로 거부한다(REQ-IOS-BACKEND-007).

### Out of Scope — 다중 기기 오케스트레이션 · Codex 래퍼
- 크로스-플랫폼 다중 기기 상호작용 시나리오 오케스트레이션 → SPEC-04. Codex 래퍼/패키징 → SPEC-05.

### Out of Scope — 구현 세부(HOW)
- 구체 함수명/클래스 내부 구조/idb JSON 필드의 최종 확정(실 시뮬레이터 픽스처)은 Run 단계로 이연한다. 본 SPEC은 관찰 가능한 동작·계약·데이터 모델만 규정한다. (단, 본 세션에 iOS 시뮬레이터가 없어 idb JSON 스키마는 문서 기반 검증이며, 실 픽스처 확정은 Run 단계 — research.md §6.)

---

## §E. 로드맵 위치

| SPEC | 상태 | 메모 |
|------|------|------|
| SPEC-ANDROID-001 | in-progress(개정 0.2.0 진행 중) | Android/adb 기본기 + 공통 스키마 + device-backend interface. 본 SPEC의 **baseline 토대**(현재 상태 인터페이스 확장, §A.1 baseline-pin). `completed` 재-close는 별도 follow-up. |
| **SPEC-IOS-001 (본 SPEC)** | **draft** | iOS/idb 백엔드 + 레지스트리 통합. |
| SPEC-03 | 커밋 | WebView/DOM 인지(Android CDP / iOS `ios_webkit_debug_proxy`). |
| SPEC-04 | 커밋 | 탐색 루프 + 다중 기기 시나리오 오케스트레이션. |
| SPEC-05 | 커밋 | Codex 래퍼 + 패키징. |

---

## §F. @MX 태그 대상 (식별)

> Run 단계에서 부착. code_comments=ko 규약에 따라 태그 설명은 한국어.

| 대상 | 태그 | 근거 |
|------|------|------|
| device-backend interface 변경(`schema/device-backend.ts` — `dumpUiHierarchy` 반환 타입, `DeviceInfo.platform`) | `@MX:ANCHOR` + `@MX:REASON` | 불변 계약 변경. 모든 백엔드·명령 계층이 의존(높은 fan_in). |
| 백엔드 레지스트리(`backend/registry.ts` 신규) | `@MX:ANCHOR` + `@MX:REASON` | serial→백엔드 라우팅의 단일 지점. 모든 device 명령이 의존. |
| idb 정규화 순수 함수(`normalize/idb.ts` 신규) | `@MX:ANCHOR` + `@MX:REASON` | idb 인지 경로의 불변 매핑 계약. `tappable` 파생 정책(AXTraits 부재). |
| `IdbBackend`(`backend/idb-backend.ts` 신규) | `@MX:ANCHOR` | iOS device-backend 참조 구현. |
| idb 서브프로세스 래퍼(`backend/idb-executor.ts` 신규) | `@MX:WARN` + `@MX:REASON` | 외부 idb 바이너리 스폰(미유지보수 도구). shell 미사용(argv 배열). |
| iOS 환경 서비스(`backend/idb-doctor.ts` 신규) | `@MX:WARN` + `@MX:REASON` | 호스트 환경 점검/설치 안내(pip/brew). |
| iOS 키 별칭→HID 맵(`backend/keycodes-ios.ts` 신규) | `@MX:NOTE` | 부분 매핑 + 미대응 별칭 gap 문서화. |
| `AdbBackend.dumpUiHierarchy` 정규화 내부화 | `@MX:NOTE` | 계층 이동(동작 보존). |
| 명령 계층 플랫폼 비종속화(`dump.ts`/`tap.ts`/`text.ts`에서 정규화기 import 제거) | `@MX:NOTE` | 정규화 이관 결과. |
| `src/schema/common-element.ts` iOS 매핑 doc-comment 정정(옛 `AXTraits`/`isEnabled` 가정 + `AC-ANDROID-006 (design-only)` 참조 → `enabled`/AXTraits 부재/SPEC-IOS-001 참조) | `@MX:NOTE` | 리서치 정정 반영 — iOS 실 구현과 스키마 주석의 자기모순 제거(D5). |

---

## §G. 교차 참조

- 구현 계획·마일스톤·iOS 필드 매핑 표(정정판): `plan.md`
- 인수 기준(Given-When-Then)·엣지 케이스·DoD: `acceptance.md`
- 설계(레지스트리/인터페이스 diff/정규화 파생/환경 서비스): `design.md`
- idb JSON 스키마·명령 시그니처·버전 고정 검증: `research.md`
- 진행 상태·감사 신호: `progress.md`
- 토대 SPEC: `.moai/specs/SPEC-ANDROID-001/` (공통 스키마 §A.3, device-backend interface, plan.md §F.9/§F.9.1)
