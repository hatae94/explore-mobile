---
id: SPEC-IOS-001
title: "iOS 시뮬레이터(idb) 백엔드 — 인수 기준"
version: "0.1.0"
status: completed
created: 2026-07-22
updated: 2026-07-26
author: manager-spec
---

# 인수 기준 — SPEC-IOS-001

> 형식: Given-When-Then. 각 AC는 관찰 가능(테스트 출력/파일 존재/필드 검증)해야 한다. 검증 방식(unit / mock / e2e·manual / doc-review)을 명시한다. idb 정규화·레지스트리·명령 구성은 시뮬레이터 없이 단위 테스트 가능하고, 실제 탭/입력 착지 등 기기 의존 항목은 e2e·manual이다.

## §D. 인수 기준 매트릭스

| AC ID | 요약 | 관련 REQ | 검증 방식 |
|-------|------|----------|-----------|
| AC-IOS-001 | `DeviceInfo.platform` 가법 추가 + 백엔드별 설정 | REQ-IOS-SCHEMA-001 | unit(mock) |
| AC-IOS-002 | `dumpUiHierarchy` 반환 타입 `CommonElement[]` + AdbBackend 내부 정규화(동작 보존) | REQ-IOS-SCHEMA-002/003 | unit(mock) |
| AC-IOS-003 | 명령 계층(dump/tap/text)에 정규화기 직접 import 0건(greppable) | REQ-IOS-SCHEMA-004 | unit(grep) |
| AC-IOS-004 | idb 정규화: describe-all JSON 픽스처 → 기대 CommonElement[] | REQ-IOS-NORM-001/002 | unit |
| AC-IOS-005 | idb `tappable` 파생(AXTraits 미사용, type/role/custom_actions + enabled) | REQ-IOS-NORM-004 | unit |
| AC-IOS-006 | idb 정규화 평면 배열 → `children:[]` + 손상 JSON graceful | REQ-IOS-NORM-003/005 | unit |
| AC-IOS-007 | 레지스트리: adb+idb 병합 나열 + 플랫폼 태깅 | REQ-IOS-ARCH-001 | unit(mock) |
| AC-IOS-008 | 레지스트리: `--device serial` → 소유 백엔드 라우팅(플랫폼 자동 감지) | REQ-IOS-ARCH-002 | unit(mock) |
| AC-IOS-009 | graceful degradation: idb 미설치 → Android만 노출(오류 없음) | REQ-IOS-ARCH-003 | unit(mock) + e2e |
| AC-IOS-010 | 크로스-플랫폼 `--device` 생략 다중 기기 → `AMBIGUOUS_DEVICE` | REQ-IOS-ARCH-004 | unit(mock) |
| AC-IOS-011 | IdbBackend 8개 메서드 모두 `DeviceBackend` 구현 | REQ-IOS-BACKEND-001 | unit(type/mock) |
| AC-IOS-012 | `listDevices`: `idb list-targets` → DeviceInfo(udid/sim-device/platform:ios) | REQ-IOS-BACKEND-002 | unit(mock) + e2e |
| AC-IOS-013 | `dumpUiHierarchy`: `idb ui describe-all` → CommonElement[] | REQ-IOS-BACKEND-003 | unit(mock) + e2e |
| AC-IOS-014 | `screenshot`: 유효 PNG(매직바이트 `\x89PNG`) | REQ-IOS-BACKEND-004 | e2e·manual |
| AC-IOS-015 | `tap x y`: `idb ui tap` 좌표 탭 | REQ-IOS-BACKEND-005 | unit(mock) + e2e |
| AC-IOS-016 | `text`: ASCII는 `idb ui text` 단일 호출, 비ASCII는 `simctl pbcopy` + Command-V 붙여넣기(IME 절차 없음) + hideKeyboard no-op | REQ-IOS-BACKEND-006 | unit(mock) + e2e |
| AC-IOS-017 | `key`: HID 매핑 전송 + 미대응 별칭 `UNSUPPORTED_KEY_ON_IOS` 거부 | REQ-IOS-BACKEND-007 | unit(mock) + e2e |
| AC-IOS-018 | `launch`/`stop`: `idb launch`/`terminate` | REQ-IOS-BACKEND-008 | e2e·manual |
| AC-IOS-019 | iOS 환경 서비스: idb/companion/부팅 시뮬레이터 점검 JSON 보고 | REQ-IOS-DOCTOR-001 | unit(mock) + e2e |
| AC-IOS-020 | idb 미설치 → 설치 안내(macOS pip/brew) + 비-macOS 미지원 명시 | REQ-IOS-DOCTOR-002 | unit(mock) |
| AC-IOS-021 | `doctor`/`reset` 대상 플랫폼 분기(Android→AdbDoctor, iOS→iOS 서비스) | REQ-IOS-DOCTOR-003 | unit(mock) |
| AC-IOS-022 | iOS `reset` near-no-op + "iOS 정리 불필요" 보고(Android 의미 미강제) | REQ-IOS-DOCTOR-004 | unit(mock) + e2e |
| AC-IOS-023 | 오류 코드 일반화: 7개 명령 계층 파일(dump/tap/text/screenshot/launch/stop/key) `BACKEND_COMMAND_FAILED` + 우선순위 | REQ-IOS-ERR-001 | unit(mock) |
| AC-IOS-024 | idb 버전 고정 + 명령 계층 idb 누출 0건(greppable) | REQ-IOS-ISOLATE-001/002 | doc + unit(grep) |
| AC-IOS-025 | 요소 셀렉터 tap/text가 iOS에서도 동작(정규화 이관 부수효과) | REQ-IOS-SCHEMA-002 | unit(mock) + e2e |
| AC-IOS-026 | device-backend interface 얇음/교체가능 — 8개 메서드 표면 고정 assertion | REQ-IOS-ARCH-005 | unit(type) |
| AC-IOS-027 | IdbBackend 서브프로세스 실패 → `IDB_COMMAND_FAILED` 세부 + 기기 상태 무변경 | REQ-IOS-ERR-002 | unit(mock) |
| AC-IOS-028 | 공통 스키마 불변 — `CommonElement` 형태 무변경 type-level assertion | REQ-IOS-SCHEMA-005 | unit(type) |

---

### AC-IOS-001 — DeviceInfo.platform 가법 추가
- **Given** 확장된 `DeviceInfo` 타입,
- **When** `AdbBackend.listDevices` / `IdbBackend.listDevices`가 기기를 반환하면,
- **Then** 각 `DeviceInfo`에 `platform` 필드가 존재하고 AdbBackend는 `"android"`, IdbBackend는 `"ios"`로 설정되며, 기존 필드(serial/model/osVersion/connectionState/isEmulator)는 보존된다(가법 변경).

### AC-IOS-002 — dumpUiHierarchy 반환 타입 변경 + AdbBackend 정규화 내부화
- **Given** 대표 uiautomator XML을 반환하는 mock adb executor,
- **When** `AdbBackend.dumpUiHierarchy(serial)`를 호출하면,
- **Then** 반환값은 원시 문자열이 아니라 `CommonElement[]`이고, 그 내용은 기존 `normalizeUiAutomatorXml(xml)` 결과와 동일하다(정규화 위치만 이동, 동작 보존).

### AC-IOS-003 — 명령 계층 정규화기 직접 참조 제거 (greppable)
- **Given** `src/cli/commands/{dump,tap,text}.ts`,
- **When** `grep -rn "normalizeUiAutomatorXml" src/cli/commands/ | grep -v '^[^:]*:[0-9]*:[ \t]*\*'`를 실행하면(주석 라인 제외 — `grep -rn`의 `file:line:` 접두사 뒤에서 실제 소스 라인이 공백 후 `*`로 시작하는 doc-comment 연속행인지 판별한다. dump.ts/tap.ts/text.ts의 doc-comment는 "…import/call was removed"라고 정규화기 이름을 **서술**할 뿐 실제 import/호출이 아니므로, 코드 라인만 대상으로 하는 이 필터가 검사 의도와 일치한다),
- **Then** 매칭이 **0건**이다(명령 계층은 백엔드가 반환한 `CommonElement[]`만 소비하며, 정규화기를 직접 import·호출하지 않는다). 기계적으로 greppable.

### AC-IOS-004 — idb 정규화 순수 함수 (핵심 단위 테스트)
- **Given** research.md §2의 실 예시를 담은 `idb ui describe-all` JSON 픽스처(시뮬레이터 불필요),
- **When** `normalizeIdbAccessibility(json)`를 호출하면,
- **Then** `type→role`, `AXLabel→text`, `AXUniqueId→id`, `frame{x,y,width,height}→bounds{x,y,w,h}`, `enabled→enabled`가 기대 CommonElement와 정확히 일치한다.
- **And** 예시 요소 `{"AXUniqueId":"Wallet","frame":{"y":116,"x":199,"width":64,"height":87.5},"AXLabel":"Wallet","type":"Button","enabled":true,...}` → `{ id:"Wallet", bounds:{x:199,y:116,w:64,h:87.5}, text:"Wallet", role:"Button", enabled:true, tappable:true, children:[] }`.

### AC-IOS-005 — idb tappable 파생 (AXTraits 미사용)
- **Given** 다양한 `type`/`role`/`custom_actions`/`enabled` 조합의 idb 요소 픽스처,
- **When** 정규화하면,
- **Then** `(type ∈ 상호작용 집합 OR role/subrole 상호작용 OR custom_actions 비어있지 않음) AND enabled === true`인 경우에만 `tappable = true`이고, `enabled === false`이면 항상 `tappable = false`이다(Android `clickable && enabled`와 대칭).
- **And** 파생 로직이 `AXTraits` 필드를 참조하지 않는다(부재 확인 — 존재하지 않는 필드 미의존).

### AC-IOS-006 — 평면 배열 + graceful
- **Given** 평면 배열 JSON 픽스처 및 (별도로) 비어있음/손상 JSON,
- **When** 정규화하면,
- **Then** 평면 배열의 각 요소는 `children: []`로 변환되고, 비어있음/손상 JSON은 예외 없이 빈 배열(또는 파싱 가능한 부분만의 안전한 결과)을 반환한다.

### AC-IOS-007 — 레지스트리 병합 나열
- **Given** adb(1대) + idb(1대) mock 백엔드가 등록된 레지스트리,
- **When** `listAllDevices()`를 호출하면,
- **Then** 두 기기가 모두 나열되고 각각 `platform:"android"`/`platform:"ios"`로 태깅된다.

### AC-IOS-008 — serial → 소유 백엔드 라우팅
- **Given** adb+idb 기기가 등록된 레지스트리,
- **When** `--device <idb-udid>`로 명령을 실행하면,
- **Then** 레지스트리가 그 serial을 소유한 IdbBackend를 선택하여 명령을 라우팅한다(사용자는 플랫폼 미지정 — 자동 감지). Android serial이면 AdbBackend로 라우팅된다.

### AC-IOS-009 — graceful degradation (idb 미설치)
- **Given** idb가 설치되지 않은 환경(mock: idb 백엔드 미가용),
- **When** `devices`를 실행하면,
- **Then** Android 기기만 노출되고 오류 없이 정상 종료한다(idb 부재가 전체 실패를 유발하지 않음).
- **And** (대칭) adb 미가용이면 iOS 기기만 노출된다.

### AC-IOS-010 — 크로스-플랫폼 AMBIGUOUS_DEVICE
- **Given** Android 1대 + iOS 1대(총 2대)가 연결되고 `--device`가 생략된 호출,
- **When** 임의 명령을 실행하면,
- **Then** 조용히 첫 기기를 고르지 않고 `AMBIGUOUS_DEVICE` graceful 오류 + 플랫폼별 기기 목록을 출력한다.

### AC-IOS-011 — IdbBackend 8개 메서드 구현
- **Given** `IdbBackend`,
- **When** `DeviceBackend` 인터페이스에 대해 타입 체크/구현 확인하면,
- **Then** `listDevices`/`dumpUiHierarchy`/`screenshot`/`tap`/`inputText`/`sendKeyEvent`/`launchApp`/`stopApp` 8개가 모두 구현되어 있다(컴파일 성공 + mock 호출 성공).

### AC-IOS-012 — listDevices via list-targets
- **Given** `idb list-targets`(JSON) mock 출력,
- **When** `IdbBackend.listDevices`를 호출하면,
- **Then** udid→serial, 이름/OS버전/상태, `target_type`(simulator/device)→`isEmulator`, `platform:"ios"`로 매핑된 DeviceInfo[]를 반환한다.
- **Note**: `list-targets --json` 실제 필드명은 run-phase 실 픽스처로 확정(게이트 결정: DEFER — plan.md §B.0). 본 AC는 mock 기반이므로 필드명 확정 전에도 검증 가능(mock이 계약을 고정).

### AC-IOS-013 — dumpUiHierarchy via describe-all
- **Given** `idb ui describe-all`(JSON) mock 출력,
- **When** `IdbBackend.dumpUiHierarchy`를 호출하면,
- **Then** idb 정규화기를 거쳐 `CommonElement[]`를 반환한다(mock으로 argv 구성 + 정규화 연동 검증).

### AC-IOS-014 — screenshot 유효 PNG [e2e·manual]
- **Given** 부팅된 iOS 시뮬레이터,
- **When** `screenshot`를 실행하면,
- **Then** PNG 매직바이트 `\x89PNG`로 시작하는 유효 PNG 바이트를 반환한다.

### AC-IOS-015 — tap 좌표
- **Given** mock idb executor,
- **When** `IdbBackend.tap(serial, x, y)`를 호출하면,
- **Then** `idb ui tap <x> <y>`(대상 지정 플래그 포함)가 정확한 argv로 호출된다.

### AC-IOS-016 — text: ASCII 직접 입력 + 비ASCII 클립보드 경로
> **개정(2026-07-26, 실기기 검증)**: 최초 기준은 `idb ui text "안녕 😸"`를 요구했으나, 실측 결과 `idb ui text`는 **Unicode를 지원하지 않는다**. fb-idb 1.1.7 `idb/common/hid.py`의 `text_to_events`가 고정 미국 자판표(`KEY_MAP` = 출력 가능 ASCII 95자 + 개행)만 처리하고, 그 외 문자에는 `No keycode found for 네` 예외를 던진다. 원래 기준은 **달성 불가능**하므로 아래로 개정한다.

- **Given** mock idb executor,
- **When** `IdbBackend.inputText(serial, "hello world")`(ASCII)를 호출하면,
- **Then** `idb ui text "hello world"`가 **단일 호출**로 실행되고, ADBKeyBoard/IME 전환/base64/디스크 세션 절차가 **전혀 수행되지 않는다**.
- **And** `IdbBackend.inputText(serial, "네이버 한글 🎉")`(비ASCII)를 호출하면, `simctl pbcopy`로 기기 페이스트보드에 기록한 뒤 Command(HID 227)를 누른 상태에서 V(HID 25)를 눌러 붙여넣는다(`ui text`는 호출하지 않는다).
- **And** 페이스트보드 기록 실패 및 붙여넣기 키 실패는 각각 오류로 표면화된다(무음 실패 금지).
- **And** `options.hideKeyboardAfter`는 iOS에서 no-op이며 오류를 유발하지 않는다.
- **알려진 제약**: ASCII 경로는 시뮬레이터의 **활성 자판 배열**에 종속된다. 한글 자판이 선택된 상태에서는 `ui text "naver"`가 오류 없이 `ㅜㅁㅍㄷㄱ`로 입력된다. idb에는 활성 입력 모드를 읽거나 지정하는 수단이 없다(HID 57이 한/영을 토글하지만 현재 상태를 알 수 없어 맹목적). 붙여넣기 경로는 자판을 우회하므로 이 문제가 없다.

### AC-IOS-017 — key HID 매핑 + 미대응 거부
- **Given** iOS 키 별칭 맵,
- **When** HID 대응이 있는 별칭(예: `enter`)으로 `sendKeyEvent`를 호출하면,
- **Then** `idb ui key <HID코드>`가 호출된다.
- **And** HID 대응이 없는 별칭(예: `home`/`back`/`volume_up`)으로 호출하면 `UNSUPPORTED_KEY_ON_IOS` graceful 오류로 거부하고 아무 키도 전송하지 않는다(무음 무시 금지).

### AC-IOS-018 — launch/stop [e2e·manual]
- **Given** 대상 번들(예: `com.apple.Preferences`)이 설치된 시뮬레이터,
- **When** `launch com.apple.Preferences` 후 `dump`를 실행하면,
- **Then** 해당 앱이 포그라운드로 관찰되고,
- **And** `stop com.apple.Preferences` 실행 후에는 포그라운드가 아니다.

### AC-IOS-019 — iOS 환경 서비스 점검
- **Given** idb/`idb_companion`/시뮬레이터 상태(mock),
- **When** iOS 대상으로 `doctor`를 실행하면,
- **Then** idb 클라이언트 설치, `idb_companion` 존재, 부팅 시뮬레이터 존재를 점검하고 결과를 JSON으로 보고한다.

### AC-IOS-020 — 설치 안내 + 플랫폼 게이트
- **Given** idb 미설치 상태,
- **When** macOS에서 iOS `doctor`를 실행하면,
- **Then** `pip3 install fb-idb==1.1.8` + `brew tap facebook/fb && brew install idb-companion` 설치 안내를 제공한다.
- **And** 비-macOS 호스트에서는 iOS 시뮬레이터 미지원을 명시한다(자동 설치 시도 없음).

### AC-IOS-021 — doctor/reset 플랫폼 분기
- **Given** Android 기기와 iOS 기기가 각각 연결된 상황(mock),
- **When** 각 기기를 대상으로 `doctor`/`reset`을 실행하면,
- **Then** Android 대상은 AdbDoctor로, iOS 대상은 iOS 환경 서비스로 분기된다(플랫폼별 정확한 서비스 선택).

### AC-IOS-022 — iOS reset near-no-op
- **Given** iOS 시뮬레이터 대상,
- **When** `reset`(또는 `doctor --clean`)을 실행하면,
- **Then** iOS에는 제거할 ADBKeyBoard/복원할 세션 IME가 없으므로 near-no-op이며 "iOS-specific 정리 불필요"(무상태 idb 텍스트)를 명시적으로 보고한다.
- **And** Android의 IME 복원/APK 제거 로직을 iOS에 강제하지 않는다.

### AC-IOS-023 — 오류 코드 일반화 (7개 명령 계층 파일)
- **Given** 백엔드 호출이 실패하도록 강제된 mock,
- **When** 레지스트리 경유 7개 명령(`dump`/`tap`/`text`/`screenshot`/`launch`/`stop`/`key`) 중 임의 명령이 일반 실패하면,
- **Then** 7개 전부에서 방출 top-level 오류 코드가 `BACKEND_COMMAND_FAILED`이다(기존 `ADB_COMMAND_FAILED` 전면 대체 — 플랫폼 비종속),
- **And** idb 서브프로세스 실패는 `IDB_COMMAND_FAILED` 세부가 `message`/`details`에 실리되 top-level은 `BACKEND_COMMAND_FAILED`가 우선한다(D7 우선순위); `instanceof` 인식 타입 지정 오류만 그 자체 코드가 우선.

### AC-IOS-024 — 버전 고정 + idb 격리 (greppable)
- **Given** 구현 코드,
- **When** `grep -rn "spawnIdb\|idb-executor\|IdbBackend\b" src/cli/commands/ | grep -v '^[^:]*:[0-9]*:[ \t]*\*'`를 실행하면(REQ-IOS-DOCTOR-003에 따라 명령 계층이 `IdbDoctor` 서비스를 정당하게 참조하므로, 단순 문자열 `"idb"` 리터럴 검사는 `IdbDoctor`/`idbEnvironment` 같은 합법적 식별자에 false-positive를 낸다 — 이 정제된 패턴은 실제 격리 불변량(idb 서브프로세스/executor/백엔드로의 직접 접근 금지)만을 포착하고, 뒤의 주석-제외 필터는 `IdbBackend`를 언급만 하는 doc-comment 서술(예: reset.ts/dump.ts의 "either way, resolveAdbBackend..." 문장)을 제외한다),
- **Then** 매칭이 **0건**이다(모든 idb 서브프로세스 호출은 IdbBackend/idb-executor 경유이며, 명령 계층 코드는 `IdbDoctor` 같은 서비스 추상화를 통해서만 idb 환경에 접근한다 — 직접 idb 백엔드/executor 참조는 없다).
- **And** idb 버전 고정(`fb-idb==1.1.8`)이 문서/설치 안내에 명시된다.

### AC-IOS-025 — 요소 셀렉터 iOS 동작 (정규화 이관 부수효과)
- **Given** idb describe-all이 매칭 요소를 포함하는 상황(mock),
- **When** iOS 기기 대상으로 `tap --id <AXUniqueId>`(또는 `--text <AXLabel>`)를 실행하면,
- **Then** IdbBackend.dumpUiHierarchy가 반환한 CommonElement[]에서 매칭 요소를 찾아 그 중심 좌표를 `idb ui tap`한다(`normalize/element-query.ts` 무변경, 플랫폼 비종속 재사용).

### AC-IOS-026 — thin/swappable device-backend interface (REQ-IOS-ARCH-005)
- **Given** `DeviceBackend` 인터페이스,
- **When** 타입 수준으로 메서드 표면을 확인하면(AdbBackend/IdbBackend가 동일 인터페이스 구현),
- **Then** 인터페이스는 정확히 **8개 메서드**(`listDevices`/`dumpUiHierarchy`/`screenshot`/`tap`/`inputText`/`sendKeyEvent`/`launchApp`/`stopApp`)만 노출하여 얇음이 유지되고, 두 백엔드가 동일 표면으로 상호 교체 가능함이 컴파일 수준으로 보장된다,
- **And** 호스트 환경 관심사(doctor/reset 설치·부트스트랩)는 인터페이스 밖(별도 환경 서비스)에 있어 인터페이스 표면을 넓히지 않는다.

### AC-IOS-027 — IdbBackend 오류 표면화 (REQ-IOS-ERR-002)
- **Given** idb exitCode≠0로 실패하는 mock idb executor,
- **When** `IdbBackend`의 임의 메서드가 실패하면,
- **Then** 원인(stderr)을 담아 graceful 오류로 표면화하며(백엔드 세부 코드 `IDB_COMMAND_FAILED` 가용), 기기 상태를 변경하지 않는다(부분 부작용 없음),
- **And** 명령 계층 경유 시 top-level 코드는 `BACKEND_COMMAND_FAILED`가 우선한다(AC-023 / D7 우선순위와 결합).

### AC-IOS-028 — 공통 스키마 불변 (REQ-IOS-SCHEMA-005, type-level)
- **Given** `src/schema/common-element.ts`의 `CommonElement` 타입,
- **When** 본 SPEC 변경(정규화 이관/레지스트리/idb 백엔드) 후 타입을 확인하면,
- **Then** `CommonElement` 형태 `{ role, text, id, bounds:{x,y,w,h}, tappable, enabled, children }`가 **변경되지 않음**이 type-level assertion으로 보장된다(iOS 매핑은 스키마를 채울 뿐 확장하지 않음 — SPEC-01 불변 계약),
- **And** doc-comment의 옛 iOS 가정(AXTraits/isEnabled)은 정정되나(D5) 타입 형태 자체는 불변이다(주석 정정 ≠ 형태 변경).

---

## §D.1 엣지 케이스

- iOS 기기 0대 + Android 0대 → 명확한 "no device" 오류 JSON(레지스트리 병합 결과 빈 목록).
- idb 미설치 + adb 정상 → Android만 노출, iOS 관련 오류 없음(graceful degradation).
- adb 미설치 + idb 정상 → iOS만 노출(대칭).
- Android serial과 iOS udid 우연 충돌(극히 드묾) → `AMBIGUOUS_DEVICE` 또는 명시적 충돌 오류(design.md §C.3 — 임의 선택 금지).
- idb `describe-all` 빈/손상 JSON → 정규화가 안전하게 빈/부분 배열 반환(예외 없음).
- idb 요소에 `type` 없음/null → `role`(AX 형태) 보조 매핑; 둘 다 없으면 빈 문자열.
- idb `frame`이 float(예 `87.5`) → `bounds`에 그대로 보존; `elementCenter`가 탭 시 반올림(기존 `element-query.ts` 동작).
- `AXLabel` 빈 문자열 + `AXValue` 존재(입력 필드) → `text`는 `AXLabel` 우선(빈 문자열); Run 단계에서 `AXValue` 보조 사용 여부 결정(design.md §F).
- 미대응 iOS 키 별칭(`home` 등) → `UNSUPPORTED_KEY_ON_IOS` graceful 거부(무음 금지).
- 비-macOS 호스트에서 iOS 명령 시도 → iOS 미노출로 `DEVICE_NOT_FOUND`/`NO_DEVICE` 또는 명확한 플랫폼 미지원 안내.
- idb `describe-all`이 평면 배열이므로 `children` 기반 트리 순회는 iOS에서 항상 루트 배열만 순회(셀렉터 정상 동작).

## §D.2 품질 게이트 (TRUST 5)

- **Tested**: idb 정규화·레지스트리 라우팅·명령 구성(mock) 단위 커버리지 85%+. 기기 의존 항목(014/018 등)은 e2e/manual 표식.
- **Readable**: 명확한 네이밍, 한국어 코드 주석(code_comments=ko 규약).
- **Unified**: 프로젝트 포매터/린터/타입체크 통과(`pnpm typecheck`, 확정 툴체인). `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` 준수.
- **Secured**: 외부 입력(udid/좌표/텍스트/번들ID) 검증. idb argv 배열(shell 미사용) — 주입 방지(SPEC-01 defense 계승).
- **Trackable**: Conventional Commits, SPEC ID 참조.

## §D.3 Definition of Done

- [ ] **REQ ↔ AC 추적성**: 전 REQ-IOS-*(ARCH 5 / SCHEMA 5 / NORM 5 / BACKEND 8 / DOCTOR 4 / ERR 2 / ISOLATE 2 = **31개**)가 §D 매트릭스에서 각각 하나 이상의 AC로 커버됨 — 이전 audit에서 미커버였던 3개(ARCH-005 / ERR-002 / SCHEMA-005)를 신규 AC(각각 AC-026 / AC-027 / AC-028)로 해소함. 이 커버리지는 **§D 매트릭스 대조로 확인된 plan-phase 사실**이며, 실제 GREEN 여부는 run-phase 테스트 실행으로 별도 검증된다(현 시점은 매트릭스 커버리지만 확인 — "테스트 통과"를 주장하지 않음).
- [ ] idb 정규화 순수 함수 단위 테스트 GREEN(JSON 픽스처, tappable 파생 포함) — AC-IOS-004/005/006.
- [ ] 레지스트리 라우팅/graceful degradation/AMBIGUOUS mock 테스트 GREEN — AC-IOS-007~010.
- [ ] IdbBackend 8개 메서드 명령 구성 + 오류 경로 mock 테스트 GREEN — AC-IOS-011~017/023.
- [ ] 인터페이스 변경(반환 타입/platform) + AdbBackend 내부 정규화 동작 보존 검증 — AC-IOS-001/002.
- [ ] 명령 계층 정규화기/idb 직접 참조 0건(grep) — AC-IOS-003/024.
- [ ] iOS 환경 서비스 + doctor/reset 플랫폼 분기 + near-no-op reset 검증 — AC-IOS-019~022.
- [ ] 요소 셀렉터 iOS 재사용 검증 — AC-IOS-025.
- [ ] 인터페이스 얇음(8-메서드)/공통 스키마 불변 type-level assertion + IdbBackend 오류 표면화 검증 — AC-IOS-026/027/028.
- [ ] iOS 필드 매핑 표(정정판) + 파생 정책이 plan.md §F.9/§F.9.1에 존재.
- [ ] idb 버전 고정(`fb-idb==1.1.8`) 명시 + run-phase DEFER 항목(list-targets 필드명 / --udid 플래그 / HID 코드 — 게이트 결정, plan.md §B.0)이 실기기 픽스처로 확정.
- [ ] 기기 의존 AC(014/018, 실착지 계열)는 e2e/manual 체크리스트 또는 CI 시뮬레이터로 검증(오류/구성 경로는 mock 우선).
- [ ] spec.md에 구현 세부 없음(WHAT/WHY만).
- [ ] @MX 태그 대상이 코드에 부착됨(spec.md §F).

> **AC 카운트**: §D 매트릭스 총 **28건**(AC-IOS-001~028; 신규 026/027/028 = ARCH-005/ERR-002/SCHEMA-005 커버 — 이전 audit의 3개 미커버 REQ 해소). 단위/mock 검증 우선, 기기 의존은 e2e/manual 분류.
