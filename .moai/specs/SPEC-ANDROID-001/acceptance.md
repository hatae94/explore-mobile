---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 인수 기준"
version: "0.4.0"
status: completed
created: 2026-07-22
updated: 2026-07-29
author: manager-spec
amendment_of: SPEC-ANDROID-001
---

# 인수 기준 — SPEC-ANDROID-001

> 형식: Given-When-Then. 각 AC는 관찰 가능(테스트 출력/파일 존재/필드 검증)해야 한다. 검증 방식(unit / mock / e2e·manual)을 명시한다.

## §D. 인수 기준 매트릭스

| AC ID | 요약 | 관련 REQ | 검증 방식 |
|-------|------|----------|-----------|
| AC-ANDROID-001 | `doctor` 환경 감지·설치·`reset` 복원 | REQ-DOCTOR-001~005 | e2e·manual |
| AC-ANDROID-002 | 각 원시 명령이 실기 에뮬레이터에서 동작 | REQ-SCREENSHOT/INPUT/DUMP | e2e·manual |
| AC-ANDROID-003 | 한글+이모지 입력 착지 + 세션 기반 IME(reset시 복원) | REQ-INPUT-003/004 | e2e·manual |
| AC-ANDROID-004 | 에뮬레이터+실기기 동시 — `devices` 구분·독립 대상·격리 | REQ-DEVICES/MULTIDEV | e2e·manual |
| AC-ANDROID-005 | 멱등성 + 중복 설치·잔여 파일 없음 | REQ-IDEMP-001~003 | e2e·manual + mock |
| AC-ANDROID-006 | iOS-readiness: 스키마/interface가 idb 필드셋 수용 + 매핑 표/파생 정책 문서화 | REQ-SCHEMA-003, REQ-ARCH-003 | doc/design-review |
| AC-ANDROID-007 | `doctor` 후 단일 `npx` 명령으로 설치·실행 | REQ-ARCH-005 | e2e·manual |
| AC-ANDROID-008 | 정규화 순수 함수: XML 픽스처 → 기대 JSON | REQ-SCHEMA-002/004 | unit |
| AC-ANDROID-009 | `--device` 생략 + 다중 기기 → graceful failure | REQ-MULTIDEV-002 | unit(mock) + e2e |
| AC-ANDROID-010 | IME 전환 후 전송 실패 시에도 원래 IME 디스크 영속(reset 복원 가능) | REQ-INPUT-004, REQ-IDEMP-004 | unit(mock) + e2e |
| AC-ANDROID-011 | `launch`/`stop`이 앱을 시작/강제종료 | REQ-APP-001/002 | e2e·manual |
| AC-ANDROID-012 | 모든 명령이 유효한 JSON in/out 방출 | REQ-ARCH-001 | unit(mock) |
| AC-ANDROID-013 | Claude 스킬 래퍼에 직접 `adb` 호출 없음(greppable) | REQ-ARCH-004 | unit(grep) |
| AC-ANDROID-014 | 3계층 아키텍처 유지 (design-review only) | REQ-ARCH-002 | design-review |
| AC-ANDROID-015 | IME 복원 실패 → 원래 IME id 보고(수동 복구) | REQ-ERR-001 | unit(mock) + e2e |
| AC-ANDROID-016 | ADBKeyBoard 설치 실패 → graceful 오류, 기기 무변경 | REQ-ERR-002 | unit(mock) + e2e |
| AC-ANDROID-017 | device offline/unauthorized → graceful 오류 | REQ-ERR-003 | unit(mock) + e2e |
| AC-ANDROID-018 | adb 데몬 미기동/서버 기동 실패 → graceful + doctor health | REQ-ERR-004, REQ-DOCTOR-001 | unit(mock) + e2e |
| AC-ANDROID-019 | `doctor` adb 설치 OS별 분기 + macOS 명시 동의 게이트(무음 금지) | REQ-DOCTOR-002 | unit(mock) + e2e |
| AC-ANDROID-020 | `text` 자가치유: ADBKeyBoard 미설치 시 런타임 자동 설치(공유 설치기) | REQ-INPUT-003(개정) | unit(mock) + e2e |
| AC-ANDROID-021 | 디스크 영속 IME: 별도 CLI 프로세스 간 원래 IME 복원(reset) | REQ-INPUT-004(개정) | unit(mock) + e2e |
| AC-ANDROID-022 | `text` 후 소프트키보드 기본 숨김 + `--keep-keyboard` 옵트아웃 | REQ-INPUT-004(개정) | unit(mock) + e2e |
| AC-ANDROID-023 | 요소 셀렉터 `tap --id/--text/--index` 중심 탭 + 좌표 XOR 셀렉터 | REQ-SELECT-001/003/004/005 | unit(mock) + e2e |
| AC-ANDROID-024 | 요소 셀렉터 `text ... --id/--text/--index` 포커스 후 타이핑 | REQ-SELECT-002/004/005 | unit(mock) + e2e |
| AC-ANDROID-025 | `launch`: DEFAULT 선언 앱을 명시적 컴포넌트로 시작 | REQ-APP-001(개정 0.3.0) | unit(mock) + 실측 |
| AC-ANDROID-026 | `launch`: **DEFAULT 미선언 앱**을 시작 — 결함 회귀 증명 | REQ-APP-001(개정 0.3.0) | **실측 필수**(mock 단독 불가) |
| AC-ANDROID-027 | `launch` 태스크 재개 의미 보존(경고 행은 실패 아님) | REQ-APP-001(개정 0.3.0) | **실측** |
| AC-ANDROID-028 | 런처 컴포넌트 미해석 → 구분된 graceful 오류, 원인 미단정, 인텐트 미전송 | REQ-APP-001(개정 0.3.0) | unit(mock) + 실측 |
| AC-ANDROID-029 | cold 경로(설치 직후) 비-ASCII `text`가 실제로 착지 | REQ-INPUT-003/004(개정 0.3.0) | **실측 필수**(mock 단독 불가) |
| AC-ANDROID-030 | warm 경로 불변 — 이미 바인딩이면 대기 없이 즉시 전송 | REQ-INPUT-004(개정 0.3.0) | unit(mock) + 실측 |
| AC-ANDROID-031 | 바인딩 대기 타임아웃 → **브로드캐스트 미전송 + `ok:false`**(응답 계약 변경) | REQ-INPUT-004(개정 0.3.0) | unit(mock) |
| AC-ANDROID-032 | 준비 술어의 IME-id 결합항을 실기기에서 확인(미측정 항목) — **관측 완료** | REQ-INPUT-004(개정 0.3.0) | **실측 필수** |
| AC-ANDROID-033 | cold 반복 시행에서 `ime enable` 등록 경쟁 회복 + 착지 | REQ-INPUT-003(개정 0.3.0 M12) | **실측 필수**(mock 단독 불가, **시행 횟수 규정**) |
| AC-ANDROID-034 | 비매칭 `ime enable` 실패는 재시도 없이 즉시 표면화 | REQ-INPUT-003(개정 0.3.0 M12) | unit(mock) |
| AC-ANDROID-035 | `ime enable` 재시도가 상한 있음 — 유한 종료 + 브로드캐스트 미전송 | REQ-INPUT-003(개정 0.3.0 M12) | unit(mock) |
| AC-ANDROID-036 | **Chrome 웹 입력란**에서 키보드 숨김 후 입력 텍스트 생존 — 결함 회귀 증명 | REQ-INPUT-004(개정 0.4.0) | **실측 필수**(mock 단독 불가, **무대 지정**) |
| AC-ANDROID-037 | 네이티브 `EditText`에서 키보드 숨김 후 입력 텍스트 생존 — 비회귀 | REQ-INPUT-004(개정 0.4.0) | **실측** |
| AC-ANDROID-038 | 숨김 후 소프트키보드가 실제로 내려감(두 표면) | REQ-INPUT-004(개정 0.4.0) | **실측** + unit(mock, argv) |
| AC-ANDROID-039 | 숨김 실패가 `text`를 실패시키지 않음(best-effort 불변) | REQ-INPUT-004(개정 0.4.0) | unit(mock) |
| AC-ANDROID-040 | 가드 — 키보드 미표시/조회 실패 시 숨김 키 미전송 | REQ-INPUT-004(개정 0.4.0) | unit(mock) |
| AC-ANDROID-041 | 계수·오류 메시지가 미연결 항목을 제외 | REQ-MULTIDEV-002(개정 0.4.0) | unit(mock) + 실측 보강 |
| AC-ANDROID-042 | 연결 1대 + 미연결 다수 → 자동 선택 발동(도달 가능성 복구) | REQ-MULTIDEV-002(개정 0.4.0) | unit(mock) + 실측 보강 |
| AC-ANDROID-043 | 명시 지정한 미연결 기기 → `DEVICE_NOT_CONNECTED`, 백엔드 미실행 | REQ-MULTIDEV-001(개정 0.4.0) | unit(mock) + 실측 보강 |
| AC-ANDROID-044 | `details.availableDevices`는 연결된 기기만 + 미연결은 개수 요약 | REQ-MULTIDEV-002(개정 0.4.0) | unit(mock) |
| AC-ANDROID-045 | `devices` 출력 불변 — 미연결 항목 계속 나열(비회귀) | REQ-DEVICES-001, REQ-MULTIDEV-002(개정 0.4.0) | unit(mock) + 실측 |

> **판정 방식 주의(개정 0.4.0)**: AC-036은 **mock 단독으로 충족할 수 없고**, 추가로 **판정 무대가 AC의 일부**다 — 네이티브 `EditText`에서 도는 판정은 **수정 전에도 통과하므로 판정이 아니다**(§D.4.2). 반대로 **AC-041~045는 mock으로 완전히 판정된다** — `resolveTargetDevice`는 `DeviceInfo[]`를 받는 순수 함수이고 기기의 해석·시점·화면 효과가 개입하지 않는다. 이 다섯을 "실측 필수"로 적지 않는 것이 규율이며, 그 이유는 §D.4.2에 있다.

> **판정 방식 주의(개정 0.3.0)**: AC-026·AC-029·AC-033은 **mock 단독으로 충족할 수 없다.** 근거는 §D.4에 있다 — 이 셋이 세 결함이 실제로 고쳐졌음을 증명하는 유일한 판정이다. **AC-033은 추가로 "1회 green ≠ PASS"** 라는 조건을 갖는다: 결함 3은 간헐적(3/8)이라 **미수정 상태에서도 5/8 확률로 통과**하므로, 시행 횟수가 판정의 일부다.

---

### AC-ANDROID-001 — `doctor` 환경 부트스트랩 + `reset` 복원
- **Given** adb/platform-tools가 없거나 IME가 미설치인 호스트/기기,
- **When** `doctor`를 실행하면,
- **Then** CLI는 adb·기기 연결을 감지하고, 누락 시 자동 설치를 시도하거나 정확한 수동 단계를 안내하며, Unicode IME(ADBKeyBoard)를 설치·활성화하고, 결과를 JSON으로 보고한다.
- **And** `doctor --clean`(또는 `reset`) 실행 시 원래 IME가 복원되고 임시 리소스가 제거된다.

### AC-ANDROID-002 — 원시 명령이 에뮬레이터에서 동작
- **Given** 실행 중인 Android 에뮬레이터와 알려진 위젯(예: 체크박스 `resource-id=cb_agree`, 텍스트 필드 `resource-id=et_name`)이 있는 화면,
- **When** `screenshot` / `tap` / `text` / `key` / `dump`를 실행하면,
- **Then** `screenshot`은 **유효한 PNG**(PNG 매직바이트 `\x89PNG`로 시작)를 반환하고,
- **And** `tap`을 체크박스 좌표에 실행하면 후속 `dump`에서 해당 요소의 `checked=true`(상태 토글)로 관찰되며,
- **And** `text "abc"`를 텍스트 필드에 실행하면 후속 `dump`에서 그 요소의 `text`가 `"abc"`로 변경되고,
- **And** `key back`은 후속 `dump`에서 화면 전환(이전 요소 트리 소멸)으로 관찰되며,
- **And** `dump`는 기대 필드를 가진 **정규화 JSON**을 반환한다.

### AC-ANDROID-003 — 한글+이모지 입력 + 세션 기반 IME(개정 0.2.0)
- **Given** 입력 포커스가 있는 텍스트 필드,
- **When** `text "안녕하세요 😸"`를 실행하면,
- **Then** 해당 한글+이모지 문자열이 base64 브로드캐스트(`ADB_INPUT_B64`)로 입력 필드에 정확히 착지하고,
- **And** IME는 ADBKeyBoard로 **1회만 전환**되며(이미 ADBKeyBoard면 재전환 없음 — 깜빡임 방지), 전환 직전 원래 IME가 `serial`별로 **디스크에 영속**된다,
- **And** 입력 완료 후 원래 IME를 매 호출 복원하지 **않는다**(세션 유지) — 원래 IME 복원은 이후 `reset`/`doctor --clean` 실행 시 수행된다(AC-021),
- **And** 입력 완료 후 소프트키보드가 기본으로 숨겨진다(AC-022).

### AC-ANDROID-004 — 에뮬레이터 + 실기기 동시 연결
- **Given** 에뮬레이터와 실기기가 동시에 연결된 상태,
- **When** `devices`를 실행하면,
- **Then** 두 기기가 모두 나열되고 emulator/physical이 올바르게 구분되며,
- **And** `--device <serial>`로 각 기기를 독립 대상으로 명령해도 상호 간섭이 없고, 기기별 상태(IME/임시 리소스)가 serial로 격리된다.

### AC-ANDROID-005 — 멱등성 + 리소스 위생
- **Given** 이미 `doctor`가 한 번 수행된 기기,
- **When** 동일 명령(설치 포함)을 반복 실행하면,
- **Then** `pm list packages` 확인으로 **중복 설치가 발생하지 않고**,
- **And** 기기에 잔여 파일이 남지 않는다(exec-out 스트리밍).

### AC-ANDROID-006 — iOS-readiness (schema/interface + 매핑 표) [doc/design-review]
- **Given** 공통 요소 스키마와 device-backend interface,
- **When** idb의 iOS 접근성 필드(AXLabel, AXUniqueId, frame, type/role)를 매핑하면,
- **Then** 스키마/interface가 **재설계 없이** 해당 필드를 수용할 수 있음이 **문서/설계 리뷰로 검증**되고(본 SPEC 범위에 idb fixture 없음 → 자동화 단위 테스트 아님),
- **And** iOS 필드 매핑 표 + `tappable` 파생 정책(AXTraits+isEnabled)이 `plan.md §F.9`/`§F.9.1`에 문서로 존재한다.

### AC-ANDROID-007 — 단일 `npx` 실행
- **Given** `doctor`가 완료된 환경,
- **When** 단일 `npx <package> <command>` 명령을 실행하면,
- **Then** 전역 설치 없이 CLI가 설치·실행되어 결과 JSON을 반환한다.

### AC-ANDROID-008 — 정규화 순수 함수 (핵심 단위 테스트)
- **Given** 대표 `uiautomator dump` 샘플 XML 픽스처,
- **When** 정규화 함수를 호출하면(기기 불필요),
- **Then** `class→role`, `resource-id→id`, `text`/`content-desc→text`, `bounds→{x,y,w,h}`, `clickable+enabled→tappable`, 중첩→`children`이 기대 JSON과 정확히 일치한다.

### AC-ANDROID-009 — 다중 기기 graceful failure
- **Given** 2대 이상 기기가 연결되고 `--device`가 생략된 호출,
- **When** 임의의 명령을 실행하면,
- **Then** CLI는 조용히 첫 기기를 고르지 않고, **명확한 오류 메시지 + 기기 목록**을 출력하고 비정상 종료한다.

### AC-ANDROID-010 — 전송 실패 시에도 원래 IME 디스크 영속 (개정 0.2.0)
- **Given** 비-ASCII 입력에서 IME 전환은 성공했으나 이후 `am broadcast` 전송이 실패하는 상황(mock),
- **When** `text` 실행이 실패로 종료되면,
- **Then** 전환 직전의 원래 IME가 이미 디스크(`ime-sessions.json`)에 영속되어 있어 유실되지 않으며(전송 실패가 원래-IME 추적을 무효화하지 않음),
- **And** 이후 `reset`/`doctor --clean`(별도 프로세스 포함)이 영속된 원래 IME를 읽어 복원할 수 있다(AC-021과 결합). ADBKeyBoard 자체를 "원래 IME"로 잘못 기록하지 않는다(기존 항목 미덮어쓰기).

### AC-ANDROID-011 — 앱 시작/강제종료 (launch/stop)
- **Given** 대상 패키지(예: `com.android.settings`)가 설치된 기기,
- **When** `launch com.android.settings` 실행 후 `dump`를 실행하면,
- **Then** 해당 앱이 포그라운드로 관찰되고,
- **And** `stop com.android.settings` 실행 후에는 후속 `dump`/프로세스 확인에서 포그라운드가 아니다(force-stop 관찰).

### AC-ANDROID-012 — 모든 명령 JSON in/out (REQ-ARCH-001)
- **Given** 임의의 CLI 명령,
- **When** 각 명령을 실행하면,
- **Then** stdout은 파싱 가능한 유효 JSON이고(스키마 파싱 성공), 오류도 JSON 형태로 방출된다(비-JSON 자유 텍스트 없음). mock으로 각 명령의 출력이 `JSON.parse` 가능함을 검증.

### AC-ANDROID-013 — 스킬 래퍼에 직접 adb 호출 없음 (REQ-ARCH-004, greppable)
- **Given** `.claude/skills/` 하위 Claude 스킬 래퍼 파일,
- **When** `grep -rnE '(^|[^A-Za-z])adb([^A-Za-z]|$)' <skill wrapper dir>`를 실행하면,
- **Then** 직접 `adb` 실행 호출이 **0건**이다(래퍼는 CLI만 호출). 기계적으로 greppable한 인수 기준.

### AC-ANDROID-014 — 3계층 아키텍처 (REQ-ARCH-002, design-review only)
- **Given** 구현된 코드 구조,
- **When** 설계 리뷰로 계층 경계를 확인하면,
- **Then** `CLI 명령 → 정규화 계층 → adb 래퍼`의 3계층이 유지되고 정규화 계층이 adb 래퍼에만 의존함이 확인된다.
- **Note**: 본 AC는 자동화 테스트가 아닌 **design-review 전용**(구조 관찰) 검증이다.

### AC-ANDROID-015 — IME 복원 실패 보고 (REQ-ERR-001)
- **Given** `ime set <original>` 복원이 실패하도록 강제된 상황(mock),
- **When** `text`가 복원 단계에서 실패하면,
- **Then** CLI는 무음 실패하지 않고 실패 사실 + **원래 IME id**를 JSON으로 출력하여 사용자가 수동 복구(`ime set <id>`)할 수 있게 한다.

### AC-ANDROID-016 — ADBKeyBoard 설치 실패 (REQ-ERR-002)
- **Given** ADBKeyBoard 설치가 거부/비호환 API로 실패하는 상황(mock),
- **When** `doctor`가 IME 설치를 시도하면,
- **Then** CLI는 graceful 오류로 원인 + 수동 설치 대안을 JSON으로 보고하고, 기기 상태(기존 IME 등)를 변경하지 않는다.

### AC-ANDROID-017 — device offline/unauthorized (REQ-ERR-003)
- **Given** 대상 기기가 `offline` 또는 `unauthorized` 상태(mock `adb devices` 출력),
- **When** 임의 명령을 해당 기기 대상으로 실행하면,
- **Then** CLI는 조용히 진행하지 않고 기기 상태를 명시한 graceful 오류를 반환한다.

### AC-ANDROID-018 — adb 데몬 미기동 / 서버 기동 실패 (REQ-ERR-004, REQ-DOCTOR-001)
- **Given** adb 데몬이 실행 중이 아니거나 서버 기동에 실패하는 상황(mock),
- **When** 명령 또는 `doctor`를 실행하면,
- **Then** 명령은 graceful 오류를 반환하고, `doctor`는 설치 성공만으로 정상 처리하지 않고 **데몬 health를 점검·안내**한다.

### AC-ANDROID-019 — doctor adb 설치 OS별 안전 게이트 (REQ-DOCTOR-002, D5)
- **Given** adb/platform-tools 미설치 상태,
- **When** macOS에서 `doctor`를 실행하면,
- **Then** 자동 설치 전 **명시적 사용자 동의**를 요구하고(무음 설치 없음), 동의가 있어야만 Homebrew 설치를 진행한다.
- **And** Linux/Windows에서 `doctor`를 실행하면 자동 설치를 시도하지 않고 **정확한 수동 설치 단계만** 출력한다(OS-conditional 분기 검증).

### AC-ANDROID-020 — `text` 자가치유 자동설치 (REQ-INPUT-003 개정)
- **Given** ADBKeyBoard가 설치되지 않은 기기(예: `reset` 직후 또는 신규 기기),
- **When** 비-ASCII `text`를 실행하면,
- **Then** `text`는 실패("Unknown input method")하지 않고, `doctor`와 **동일한 공유 설치기**(`backend/adbkeyboard-installer.ts`)로 ADBKeyBoard를 런타임 설치한 뒤 IME 전환·입력을 진행한다,
- **And** 이미 설치된 경우 `pm list packages` 확인으로 재설치를 건너뛴다(멱등, REQ-IDEMP-002),
- **And** 설치(다운로드/`adb install`) 실패 시 IME 전환을 시도하지 않고 graceful 오류(`APK_DOWNLOAD_FAILED`/`APK_INSTALL_FAILED`/`PM_LIST_FAILED`)로 기기 상태를 변경하지 않는다(REQ-ERR-002).

### AC-ANDROID-021 — 디스크 영속 IME 프로세스 간 복원 (REQ-INPUT-004 개정)
- **Given** 한 CLI 프로세스에서 비-ASCII `text`가 IME를 ADBKeyBoard로 전환하며 원래 IME를 `~/.cache/explore-mobile/ime-sessions.json`에 `serial`별로 영속한 상태,
- **When** **별도의** CLI 프로세스에서 `reset`(또는 `doctor --clean`)을 실행하면,
- **Then** 앞 프로세스가 영속한 원래 IME를 디스크에서 읽어 `ime set <원래-id>`로 정확히 복원하고 해당 항목을 삭제한다(인메모리 추적으로는 불가능한 교차 프로세스 복원),
- **And** `inputText`는 프로세스 메모리가 아니라 **기기의 현재 활성 IME**(`settings get secure default_input_method`)를 source of truth로 사용해 세션 활성 여부를 판단한다.

### AC-ANDROID-022 — `text` 후 소프트키보드 자동 숨김 (REQ-INPUT-004 개정)
- **Given** 입력 포커스가 있는 텍스트 필드,
- **When** `text "..."`를 실행하면,
- **Then** 전송 완료 후 기본적으로 소프트키보드가 숨겨진다(`KEYCODE_ESCAPE`, best-effort — 실패해도 전송은 성공 처리),
- **And** `text "..." --keep-keyboard`를 실행하면 키보드 숨김을 생략한다.

### AC-ANDROID-023 — 요소 셀렉터 `tap` (REQ-SELECT-001/003/004/005)
- **Given** 알려진 요소(`resource-id`/텍스트)가 있는 화면,
- **When** `tap --id <resource-id>`(또는 `tap --text <label>`, `+ --index <n>`)를 실행하면,
- **Then** 현재 UI 덤프 트리에서 매칭 요소를 찾아 그 **중심 좌표를 탭**한다(좌표 모드 `tap <x> <y>`는 불변),
- **And** 좌표와 셀렉터를 동시에 주면 `TARGET_CONFLICT`로 거부하고,
- **And** 매칭 요소가 없거나 `--index` 범위 초과 시 `ELEMENT_NOT_FOUND`, `--index`가 음이 아닌 정수가 아니면 `INVALID_INDEX`로 graceful 거부한다,
- **And** 매칭 요소가 비-tappable이어도 탭은 수행하되 warning을 함께 보고한다.

### AC-ANDROID-024 — 요소 셀렉터 `text` 포커스 후 타이핑 (REQ-SELECT-002/004/005)
- **Given** 알려진 입력 요소가 있는 화면,
- **When** `text "값" --id <resource-id>`(또는 `--text`/`--index`)를 실행하면,
- **Then** 매칭 요소의 중심을 **탭하여 포커스한 뒤** 텍스트를 입력한다,
- **And** 포커스 셀렉터가 매칭되지 않으면(`ELEMENT_NOT_FOUND`) 입력을 **전송하지 않는다**(엉뚱한 포커스로 타이핑 방지).

---

> **개정 0.3.0 신규 인수 기준 (AC-ANDROID-025~032)** — 두 결함 모두 **`ok:true`인데 관측 가능한 효과가 없음** 부류다(spec.md `## Amendments` 0.3.0). 그래서 아래 AC는 **응답 봉투만으로 판정하지 않는다** — 봉투가 거짓말을 한 것이 결함의 내용이었다.

### AC-ANDROID-025 — `launch`: DEFAULT 선언 앱 (REQ-APP-001 개정 0.3.0)
- **Given** 런처 액티비티가 `android.intent.category.DEFAULT`를 선언한 설치된 패키지(실측 확인: `com.android.settings` → `/.Settings`, `isDefault=true`),
- **When** `launch com.android.settings`를 실행하면,
- **Then** CLI는 **런처 컴포넌트를 조회한 뒤 그 컴포넌트를 명시적으로 지정해** 시작하고 `ok:true`를 반환한다(mock: 조회 argv와 명시적 시작 argv가 이 순서로 구성됨을 단언; 암시적 `-p` argv가 **더 이상 구성되지 않음**을 함께 단언),
- **And** 실기기에서 해당 앱이 포그라운드로 관찰된다(`dumpsys`의 포커스 액티비티 또는 `dump` 트리).
- **Note**: 이 AC는 **회귀 방지**다 — 개정 전에도 이 패키지는 열렸다. 수정이 **되던 것을 깨지 않았음**을 확인한다.

### AC-ANDROID-026 — `launch`: DEFAULT 미선언 앱 [결함 회귀 증명 · 실측 필수] (REQ-APP-001 개정 0.3.0)
- **Given** 런처 액티비티가 `DEFAULT`를 선언하지 **않는** 설치된 패키지(실측 확인: `com.sec.android.app.popupcalculator` → `/.Calculator`, `com.sec.android.app.clockpackage` → `/.ClockPackage`. 둘 다 user 0에 설치돼 있고 손으로 누르면 열린다),
- **When** `launch <package>`를 실행하면,
- **Then** **실기기에서 해당 앱이 실제로 포그라운드로 관찰된다** — 개정 전 이 호출은 `BACKEND_COMMAND_FAILED`("Activity not started, unable to resolve Intent")로 실패했다,
- **And** 응답이 `ok:true`인 것만으로는 이 AC를 충족하지 않는다 — **포그라운드 관측이 판정 근거다**.
- **[HARD] mock 단독 불가**: mock은 구성된 argv의 모양만 단언할 수 있고, **기기가 그 argv를 어떻게 해석하는지**는 단언할 수 없다. 결함 1은 argv 모양이 완벽했는데 기기 쪽 매칭 규칙이 달랐던 사례다. §D.4 참조.
- **기기 부재 시**: PASS로 승격하지 않고 미기록으로 남긴다.

### AC-ANDROID-027 — `launch` 태스크 재개 의미 보존 [실측] (REQ-APP-001 개정 0.3.0)
- **Given** 대상 앱이 이미 실행 중이며 앱 내부에 관찰 가능한 상태가 있는 화면(예: 계산기 입력란에 값이 들어 있음),
- **When** 같은 패키지로 `launch`를 다시 실행하면,
- **Then** **새 인스턴스가 만들어지지 않고 기존 태스크가 앞으로 나오며 앱 내부 상태가 보존된다**(실측 관측: 재개를 알리는 경고 행 + 종료 코드 0),
- **And** CLI는 이 경고를 **실패로 처리하지 않는다**(`ok:true`) — 경고 행 존재만으로 오류를 반환하면 이 AC가 깨진다.
- **Note**: 개정 전 `-p` 경로도 재개 동작이었다. 이 AC는 **명시적 컴포넌트 전환이 그 의미를 바꾸지 않았음**을 고정한다(spec.md §C.3-④).

### AC-ANDROID-028 — 런처 컴포넌트 미해석 → 구분된 graceful 오류 (REQ-APP-001 개정 0.3.0)
- **Given** 런처 컴포넌트 조회가 **단일 행 `No activity found`** 를 내면서 **종료 코드는 0**인 상황(mock; 실기기에서는 존재하지 않는 패키지명으로 재현),
- **When** `launch <package>`를 실행하면,
- **Then** CLI는 **종료 코드가 0임에도 실패로 판정**하고(파서가 stdout을 본다는 증거), `BACKEND_COMMAND_FAILED`와 **구분되는 `LAUNCHER_ACTIVITY_NOT_FOUND`** 를 `ok:false`로 반환한다,
- **And** 오류 메시지가 원인을 **"패키지 미설치" 또는 "런처 액티비티 없음" 중 하나로 단정하지 않는다** — 두 가능성을 함께 제시함을 문자열 단언으로 검증한다(두 경우가 같은 출력을 내므로 단정은 거짓 주장이다, spec.md §C.3-③),
- **And** 기기에는 **어떤 시작 인텐트도 전송되지 않는다**(mock: `am start` argv가 mock exec에 도달하지 않음).

### AC-ANDROID-029 — cold 경로 비-ASCII `text` 착지 [결함 회귀 증명 · 실측 필수] (REQ-INPUT-003/004 개정 0.3.0)
- **Given** ADBKeyBoard가 설치돼 있지 **않은** 기기(`reset` 직후) + 포커스가 잡힌 입력란,
- **When** 비-ASCII `text "알림"`을 실행하면(같은 호출 안에서 자가치유 설치 → IME 전환 → 전송이 일어난다),
- **Then** **스크린샷으로 해당 문자열이 입력란에 실제로 착지했음이 관찰된다** — 개정 전 이 경로는 `{"ok":true}`를 반환하면서 **아무것도 입력하지 않았다**(플레이스홀더 그대로, 5회 분리 실험 #1·#4),
- **And** `doctor`로 방금 설치한 직후의 첫 입력 경로에서도 같은 결과를 확인한다(영향 경로 둘 다 — spec.md §C.3-⑧),
- **And** 응답이 `ok:true`인 것만으로는 이 AC를 충족하지 않는다 — **화면 관측이 판정 근거다**.
- **[HARD] mock 단독 불가**: 결함은 argv 순서가 아니라 **argv 사이의 시간**이었다. mock에는 IME 서비스 바인딩이라는 개념이 없다. §D.4 참조.
- **[HARD] 유효 오라클은 스크린샷뿐**: `dumpsys input_method`의 `mServedView`는 **성공한 경우에도 `null`** 이라 판정 근거로 무효다(spec.md §C.3-⑨). 이 오라클을 다시 시도하지 않는다.
- **기기 부재 시**: PASS로 승격하지 않고 미기록으로 남긴다.

### AC-ANDROID-030 — warm 경로 불변 (REQ-INPUT-004 개정 0.3.0)
- **Given** ADBKeyBoard가 이미 기기의 활성 IME이고 **바인딩된** 상태,
- **When** 비-ASCII `text`를 실행하면,
- **Then** IME 전환도 대기도 수행하지 않고 **즉시** 브로드캐스트한다(mock: 준비 신호 조회가 최대 1회이며 폴링 반복이 없음, `ime set` argv 미구성),
- **And** 실기기에서 문자열이 착지한다(개정 전과 동일 — 이 경로는 원래 성공하던 경로다, 5회 분리 실험 #3·#5),
- **And** 개정이 더한 지연이 **cold 경로에만** 적용됨을 확인한다.

### AC-ANDROID-031 — 바인딩 대기 타임아웃 → 미전송 + `ok:false` [응답 계약 변경] (REQ-INPUT-004 개정 0.3.0)
- **Given** 준비 신호가 상한 안에 참이 되지 않도록 강제된 상황(mock: 준비 신호 조회가 항상 미바인딩을 반환),
- **When** 비-ASCII `text`를 실행하면,
- **Then** CLI는 **base64 브로드캐스트를 전송하지 않는다** — mock exec에 `am broadcast` argv가 **한 번도 도달하지 않음**을 단언한다(미전송은 mock으로 정확히 검증 가능하다),
- **And** `ok:false` + 전용 오류 코드 `IME_BIND_TIMEOUT`을 반환한다. **`ok:true`를 반환하면 이 AC는 FAIL이다** — 이는 의도된 **응답 계약 변경**(사용자 결정: 이 경로는 이미 깨져 있고 무음 실패가 오류보다 나쁘다),
- **And** 전환 직전 원래 IME의 **디스크 영속이 유지된다** — 이후 `reset`/`doctor --clean`이 여전히 복원할 수 있다(REQ-IDEMP-004 불변, AC-021과 결합),
- **And** 대기가 **유한하게 종료된다**(무한 정지 없음). 상한 값 자체는 **설계 선택이므로 이 AC가 특정 수치를 요구하지 않는다** — 요구하는 것은 "유한 종료 + 미전송 + `ok:false`"뿐이다.

### AC-ANDROID-032 — 준비 술어 IME-id 결합항 실기기 확인 [미측정 항목 · 실측 필수] (REQ-INPUT-004 개정 0.3.0)
- **Given** 준비 술어가 바인딩 플래그와 **바인딩된 IME id** 두 필드를 결합해 사용하는 구현,
- **When** cold 사이클에서 미바인딩 창(`mBoundToMethod=false`) 동안 `dumpsys input_method`를 관측하면,
- **Then** 그 창에서 IME id 필드가 **실제로 어떤 값을 갖는지 실기기에서 확인하고 기록한다** — 이 값은 **2026-07-29 검증에서 측정되지 않았다**(spec.md §C.3-⑩),
- **And** 관측 결과가 결합 술어의 전제와 다르면(예: 미바인딩 창에서도 IME id가 이미 ADBKeyBoard로 보인다면) **술어를 관측에 맞게 정정한다** — 전제를 확립된 사실로 취급한 채 진행하지 않는다,
- **And** 구현 주석 또는 spec.md §C.3에 **관측 결과를 기록**하여 다음 사람이 다시 추측하지 않게 한다.
- **Note**: 이 AC의 산출물은 코드가 아니라 **관측 기록**이다. 결합항 없이 바인딩 플래그만으로 술어를 구성하기로 결정했다면, 그 결정과 근거를 기록하는 것으로 충족된다.

> **[해소됨 — 실기기 관측 완료]** M10(`f6e0724`) 검증 세션에서 이 관측이 **수행됐다**. 결과: **미바인딩 창(`mBoundToMethod=false`)에서 `mCurId`는 이미 `com.android.adbkeyboard/.AdbIME`였다.**
>
> 따라서 `bound && mCurId == ADBKeyBoard` 결합 술어는 **`bound` 단독과 정확히 같은 시점에 참이 되며, 판별력이 0이다**(zero discriminating power) — 결합항을 넣었더라도 미바인딩 창을 걸러내지 못했을 것이다.
>
> **구현이 `bound` 단독을 택한 것은 이제 논증이 아니라 관측으로 확증된다.** M10 시점의 근거는 "미측정 전제를 코드에 넣지 않는다"는 **회피 논증**이었고, 그것만으로도 이 AC의 "결정-기록" 대안을 충족했다. 이제는 **결합항이 실제로 무용함이 측정됐으므로** 같은 선택이 적극적 근거를 얻었다.
>
> **후속 규율**: 이 결합항을 "더 엄밀해 보인다"는 이유로 나중에 추가하지 말 것 — 판별력 0인 조건은 술어를 더 안전하게 만들지 않고 실패 모드만 늘린다. 관측 기록의 정본은 spec.md §C.3-⑯이며, §C.3-⑩(미측정 선언)은 그 시점의 기록으로 보존된 채 ⑯을 가리킨다.

---

> **개정 0.3.0 연장 인수 기준 (AC-ANDROID-033~035, M12)** — 결함 3은 앞의 둘과 **부류가 다르다**. `ok:false` + 구체적 메시지를 내는 **소리 내는 실패(loud)** 이지 `ok:true`-무효과(무음)가 아니다. 따라서 아래 AC는 "봉투가 거짓말했는가"를 묻지 않고, **"유효한 연산이 이유 없이 실패하는 빈도가 실제로 사라졌는가"** 를 묻는다. 그리고 결함이 **간헐적**이므로 **시행 횟수가 판정의 일부**다.

### AC-ANDROID-033 — cold 반복 시행에서 `ime enable` 등록 경쟁 회복 [결함 회귀 증명 · 실측 필수 · 시행 횟수 규정] (REQ-INPUT-003 개정 0.3.0 M12)
- **Given** ADBKeyBoard가 설치돼 있지 **않은** 기기(`reset` 직후) + **포커스가 잡힌 입력란**(소프트키보드가 올라온 상태),
- **When** 비-ASCII `text`를 실행하면(같은 호출 안에서 자가치유 `adb install` → `ime enable` → `ime set` → 바인딩 대기 → 전송이 일어난다),
- **Then** `ime enable`이 **`Unknown input method ... cannot be enabled for user #0`(exit 255)로 실패하지 않고** cold 경로가 끝까지 완주하며, **스크린샷으로 문자열이 입력란에 착지했음이 관찰된다**,
- **And** 위 시행을 **최소 8회 연속** 반복하여(매 회 `reset` → `text` cold 사이클, **매 회 포커스된 입력란에서**) **`ime enable` 자연 실패 0회**를 기록한다.
- **[HARD] 1회 green은 PASS가 아니다 — 시행 횟수가 판정의 일부다**: 실측 baseline은 **cold + 포커스된 입력란에서 3/8 실패**였다(spec.md §C.3-⑬). 미수정 상태에서도 **한 번에 통과할 확률이 5/8**이고, 8회 연속 통과할 확률은 `(5/8)^8 ≈ 2.3%`다. 8회는 **"우연히 통과했을 확률"을 계산 가능한 수준으로 낮추기 위한 최소 시행 수**이지, 무결 증명이 아니다. baseline 자체가 8회 표본이므로 이 2.3%도 **추정**이며 보장이 아니다 — 더 많이 돌수록 좋다.
- **[HARD] 포커스 조건은 생략할 수 없다**: 포커스 없이 돈 시행은 baseline에서도 **0/11 실패**였다(spec.md §C.3-⑬). 포커스 없이 8회를 돌면 **결함을 만나지 못한 채 통과**하므로 판정이 아니다. 시행 기록에 **매 회 포커스 상태를 함께 남긴다**.
- **[HARD] mock 단독 불가**: mock에는 IMMS의 IME 등록이라는 개념이 없다. 결함 3은 argv 모양·순서가 모두 옳은데 **`install`과 `ime enable` 사이의 등록 시점**이 문제였다 — 결함 2와 같은 사정거리 밖이다. §D.4 참조.
- **주장 경계 — 포커스 상관을 원인으로 기록하지 말 것**: 3/8 대 0/11은 강한 상관이나 **표본이 작고 메커니즘은 확립되지 않았다**. 판정 기록은 **상관으로만** 서술한다.
- **기기 부재 시**: PASS로 승격하지 않고 미기록으로 남긴다. **부분 시행(예: 3회)도 PASS가 아니다** — 실제 시행 횟수를 그대로 기록하고 미충족으로 남긴다.

### AC-ANDROID-034 — 비매칭 `ime enable` 실패는 재시도 없이 즉시 표면화 (REQ-INPUT-003 개정 0.3.0 M12)
- **Given** `ime enable`이 **등록 경쟁이 아닌 다른 형태로** 실패하도록 강제된 상황(mock: 예 — 권한 거부, 비호환 API 레벨, 기기 오프라인 등 §C.3-⑫의 메시지 형태와 다른 실패),
- **When** 비-ASCII `text`를 실행하면,
- **Then** CLI는 **재시도하지 않고 즉시 실패를 표면화**한다 — mock exec이 받은 **`ime enable` argv가 정확히 1회**임을 단언한다(재시도 횟수 0),
- **And** 원래 실패 메시지가 **재시도로 인해 지연되거나 다른 오류로 대체되지 않는다**,
- **And** 브로드캐스트 argv는 mock exec에 **도달하지 않는다**.
- **Note**: 이 AC가 고정하는 것은 **재시도가 삼키개(swallow-everything) 루프가 되지 않는다**는 것이다. 재시도 조건을 모든 실패로 넓히면, 진짜 실패가 상한만큼 지연된 뒤 같은 오류로 나오면서 **원인만 흐려진다**. 어떤 문자열/코드를 "등록 경쟁"으로 볼지의 정확한 매칭 폭은 구현 재량이나, **§C.3-⑫의 실측 실패는 매칭되고 그와 다른 형태는 매칭되지 않아야 한다**.

### AC-ANDROID-035 — `ime enable` 재시도 상한 (REQ-INPUT-003 개정 0.3.0 M12)
- **Given** `ime enable`이 **등록 경쟁 형태로 계속** 실패하도록 강제된 상황(mock: 매 호출이 §C.3-⑫ 형태로 실패),
- **When** 비-ASCII `text`를 실행하면,
- **Then** 재시도는 **유한하게 종료된다**(무한 루프 없음) — mock exec이 받은 `ime enable` argv 횟수가 **상한 이하의 유한 값**임을 단언한다,
- **And** 소진 후 CLI는 **`ok:false`로 실패를 보고**하고 base64 브로드캐스트 argv는 mock exec에 **한 번도 도달하지 않는다**,
- **And** **응답 계약은 변하지 않는다** — 이 경로는 개정 전에도 `ok:false`였다. M12는 **새 오류 코드를 만들지 않으며**, 이유 없는 실패의 **빈도**를 줄일 뿐이다(M10의 `IME_BIND_TIMEOUT` 같은 계약 변경이 **아니다**).
- **And** 상한 값과 백오프 형태 자체는 **설계 선택이므로 이 AC가 특정 수치를 요구하지 않는다** — 요구하는 것은 "유한 종료 + 미전송 + `ok:false` + 계약 불변"뿐이다(M10의 대기 상한, `MAX_DURATION_MS`와 같은 부류).

---

> **개정 0.4.0 신규 인수 기준 (AC-ANDROID-036~045)** — 두 결함은 **부류가 서로 다르고, mock 축의 반대편 끝에 있다.** 결함 4(036~040)는 `ok:true`인데 효과가 없는 **무음 부류**이며 **판정 무대를 틀리면 수정 전에도 통과한다**. 결함 5(041~045)는 봉투가 정직한 대신 **메시지가 거짓·문서가 모순**인 부류이며, 대상 해석이 순수 함수이므로 **mock으로 완전히 판정된다**. 두 성격을 뭉뚱그리지 않는 것이 이 절의 요점이다.

### AC-ANDROID-036 — Chrome 웹 입력란에서 텍스트 생존 [결함 회귀 증명 · 실측 필수 · 무대 지정] (REQ-INPUT-004 개정 0.4.0)
- **Given** Chrome으로 웹 페이지를 열고 그 페이지의 **입력란에 포커스가 잡힌 상태**(실측 확인 무대: `m.naver.com` 검색창),
- **When** `text "..."`를 **`--keep-keyboard` 없이**(즉 기본 숨김 경로로) 실행하면,
- **Then** **스크린샷으로 입력한 문자열이 입력란에 남아 있음이 관찰된다** — 개정 전 이 경로는 `{"ok":true}`를 반환하면서 숨김 단계의 `KEYCODE_ESCAPE`가 **방금 입력한 텍스트를 지웠다**(플레이스홀더 복귀, spec.md §C.4-⑰),
- **And** 응답이 `ok:true`인 것만으로는 이 AC를 충족하지 않는다 — **화면 관측이 판정 근거다**.
- **[HARD] 판정 무대가 AC의 일부다**: 네이티브 `EditText`에서 도는 판정은 **수정 전에도 통과한다**(ESCAPE는 네이티브에서 키보드만 내린다). 그것이 이 결함이 M10·M12 실기기 판정을 전부 통과한 이유다(전부 Settings 앱). **웹 입력란에서만 판정되며, 네이티브 판정으로 대체할 수 없다.**
- **[HARD] mock 단독 불가**: mock은 "BACK argv가 구성됐다"까지만 답한다. 결함의 전부는 **기기가 그 키를 어떻게 해석하는가**였다 — Chrome은 페이지로 전달, 네이티브는 키보드만 내림. §D.4 참조.
- **유효 오라클은 스크린샷이다**: `mInputShown`은 **키보드 상태**만 말하고 입력란 내용은 말하지 않는다. 두 오라클은 다른 질문에 답하며 대체 관계가 아니다(AC-038과 함께 볼 것).
- **기기 부재 시**: PASS로 승격하지 않고 미기록으로 남긴다.

### AC-ANDROID-037 — 네이티브 `EditText`에서 텍스트 생존 [비회귀 · 실측] (REQ-INPUT-004 개정 0.4.0)
- **Given** 네이티브 `EditText`에 포커스가 잡힌 화면(실측 확인 무대: Settings 검색창),
- **When** `text "..."`를 기본 숨김 경로로 실행하면,
- **Then** 숨김 후에도 입력 문자열이 남아 있음이 관찰된다(실측: BACK은 네이티브 표면에서도 텍스트를 보존한다, spec.md §C.4-⑱).
- **Note**: 이 AC는 **비회귀**다 — 개정 전에도(ESCAPE로도) 네이티브에서는 텍스트가 살아남았다. 확인하는 것은 **수정이 되던 것을 깨지 않았음**이다. **이 AC의 PASS는 AC-036의 근거가 될 수 없다** — 무대가 다르며, 이 무대에서는 결함이 애초에 나타나지 않는다.

### AC-ANDROID-038 — 숨김이 실제로 일어난다 (REQ-INPUT-004 개정 0.4.0)
- **Given** AC-036·037의 두 무대(웹 입력란 / 네이티브 `EditText`) 각각에서 소프트키보드가 올라온 상태(`mInputShown=true`),
- **When** `text "..."`를 기본 숨김 경로로 실행하면,
- **Then** 실행 후 `dumpsys input_method`의 `mInputShown`이 **`false`가 되고**(실측 관측 — BACK 전후로 `true → false` 전환이 직접 관측됐다, spec.md §C.4-⑱), 스크린샷에서도 키보드가 사라진다,
- **And** 이 AC는 **텍스트 생존과 별개의 질문**이다 — 텍스트를 지키느라 키보드를 못 내리면 `--keep-keyboard` 기본값과 같아지므로 개정의 목적 절반이 사라진다. AC-036/037과 **함께** 만족해야 한다.
- **And** mock 레그: 표시된 상태에서 **BACK keycode argv가 구성됨**(그리고 `KEYCODE_ESCAPE` argv가 **더 이상 구성되지 않음**)을 단언한다.
- **오라클 대비 노트**: `mInputShown`은 이번에 **유효한 오라클로 실측됐다** — 결함 2 조사에서 무효로 판명된 `mServedView`(성공 시에도 `null`, spec.md §C.3-⑨)와 다르다. 다만 그것이 `mServedView` 재시도의 근거는 아니다.

### AC-ANDROID-039 — 숨김 실패가 `text`를 실패시키지 않는다 [best-effort 불변] (REQ-INPUT-004 개정 0.4.0)
- **Given** 숨김 단계가 실패하도록 강제된 상황(mock: 숨김 keycode 전송이 비-0 종료 / 표시 여부 조회 자체가 실패),
- **When** 비-ASCII 또는 ASCII `text`를 실행하면,
- **Then** 전송이 이미 성공했으므로 CLI는 **`ok:true`를 반환한다** — 숨김 실패는 봉투를 바꾸지 않는다,
- **And** 이는 개정 **이전과 동일한 계약**이다(AC-ANDROID-022 불변). 결함 4 수정은 숨김의 *수단*만 바꾸며 **응답 계약을 전혀 바꾸지 않는다** — M10의 `IME_BIND_TIMEOUT` 같은 계약 변경이 **아니다**.
- **mock으로 충분하다**: "무엇이 나가지 않았는가"와 "봉투가 무엇인가"는 mock이 정확히 답한다. 실측 레그가 없다고 약한 AC가 아니다.

### AC-ANDROID-040 — 가드: 미표시/조회 실패 시 숨김 키 미전송 (REQ-INPUT-004 개정 0.4.0)
- **Given** 소프트키보드가 표시되지 않은 상태(mock: 표시 여부 조회가 미표시를 반환),
- **When** `text "..."`를 기본 숨김 경로로 실행하면,
- **Then** **숨김 keycode argv가 mock exec에 도달하지 않는다**(미전송은 mock으로 정확히 단언 가능하다),
- **And** 표시 여부 **조회 자체가 실패**한 경우에도 숨김을 **생략한다** — 조회 실패를 "표시됨"으로 낙관하지 않는다(확인되지 않은 신호 위에서 파괴 가능한 키를 쏘지 않는다). 이 경우에도 `text`는 `ok:true`다(AC-039와 결합),
- **And** `--keep-keyboard`가 주어지면 **표시 여부 조회조차 하지 않는다**(숨김 단계 전체 생략 — 옵트아웃 의미 불변).
- **[주장 경계] 이 가드는 예방적이며 실측이 요구한 것이 아니다**: `mInputShown=false`에서 BACK을 보낸 **단 1회의 시행**에서 **포그라운드는 바뀌지 않았다**(spec.md §C.4-⑲). 즉 "키보드가 없을 때 BACK이 화면을 이탈시킨다"는 **관측되지 않았다**. 이 AC는 가드의 **동작**을 고정할 뿐이며, **가드의 필요성이 실측됐다고 주장하지 않는다**. 반대로 그 1회 관측을 근거로 가드를 제거하는 것도 오류다 — 표본 1회는 "이탈하지 않는다"도 확립하지 못한다.

### AC-ANDROID-041 — 계수·오류 메시지가 미연결을 제외 (REQ-MULTIDEV-002 개정 0.4.0)
- **Given** 기기 목록에 **연결된 항목 2건**(`connectionState: "device"`)과 **미연결 항목 21건**(`offline`)이 섞인 상태(unit 픽스처; 실측 확인된 실제 구성 — spec.md §C.4-⑳),
- **When** `--device`를 생략하고 임의의 기기 대상 명령을 실행하면,
- **Then** CLI는 `AMBIGUOUS_DEVICE`를 반환하며 메시지가 **연결된 기기 수(2)** 를 말한다 — 개정 전 메시지는 `23 devices connected; specify --device <serial>.`로 **사실이 아닌 수를 주장했다**,
- **And** 계수 어디에도 미연결 항목이 포함되지 않는다.
- **mock으로 완전히 판정된다**: `resolveTargetDevice`는 `DeviceInfo[]`를 받는 **순수 함수**이며, 기기의 해석도 시점도 화면 효과도 개입하지 않는다. 픽스처가 실제 관측된 분포(23건 중 2건 연결)를 그대로 재현한다.
- **실측 보강(판정 조건 아님)**: 기기 구성 A(연결 2대)에서 실제 CLI 메시지가 2를 말하는지 확인한다. 이는 **배선 확인**이며, 기기가 없어도 이 AC는 unit으로 충족된다.

### AC-ANDROID-042 — 자동 선택 도달 가능성 복구 (REQ-MULTIDEV-002 개정 0.4.0)
- **Given** 기기 목록에 **연결된 항목이 정확히 1건**이고 **미연결 항목이 22건**인 상태(unit 픽스처),
- **When** `--device`를 생략하고 명령을 실행하면,
- **Then** CLI는 그 1건을 **자동 선택한다**(`AMBIGUOUS_DEVICE`를 반환하지 않는다) — 개정 전에는 원시 목록 길이가 23이라 이 분기가 **한 번도 발동하지 않았고**, README/스킬 문서가 약속한 동작이 **도달 불가**였다(spec.md §C.4-㉑),
- **And** 이 AC가 증명하는 것은 새 기능이 아니라 **이미 문서화된 동작이 다시 도달 가능해졌다**는 사실이다.
- **mock으로 완전히 판정된다**(AC-041과 같은 이유).
- **실측 보강(판정 조건 아님)**: 기기 구성 B(시뮬레이터를 종료해 Android 1대만 연결)에서 자동 선택이 실제로 발동하는지 확인한다. **구성 A와 B는 배타적**이므로 한 세션에서 A → B 순으로 전환한다(plan.md §C.2).

### AC-ANDROID-043 — 명시 지정한 미연결 기기 → `DEVICE_NOT_CONNECTED` (REQ-MULTIDEV-001 개정 0.4.0)
- **Given** 기기 목록에 **존재하지만 연결 상태가 아닌** serial(예: 종료된 iOS 시뮬레이터),
- **When** `--device <그 serial>`로 명령을 실행하면,
- **Then** CLI는 `DEVICE_NOT_FOUND`(존재하지 않음)와도 `BACKEND_COMMAND_FAILED`(늦은 실패)와도 **구분되는 `DEVICE_NOT_CONNECTED`** 를 `ok:false`로 반환하고, 메시지에 **관측된 `connectionState` 값**을 포함한다,
- **And** **백엔드 명령이 실행되지 않는다**(mock: 백엔드 argv가 mock exec에 도달하지 않음) — 개정 전에는 대상 해석을 통과한 뒤 백엔드에서 `idb ui describe-all failed (exit 1): ... is not booted`로 실패했다(spec.md §C.4-㉒),
- **And** 대조군 불변: 목록에 **없는** serial은 여전히 `DEVICE_NOT_FOUND`다(개정 전에도 올바르게 동작했다 — 이 경로를 바꾸지 않는다).
- **mock으로 완전히 판정된다**.
- **Note**: 이 AC가 고정하는 것은 **"없다"와 "있는데 부팅되지 않았다"를 구분한다**는 것이다. 후자만 사용자가 조치할 수 있다.

### AC-ANDROID-044 — `details.availableDevices` 구성 (REQ-MULTIDEV-002 개정 0.4.0)
- **Given** 미연결 항목이 다수 섞인 기기 목록에서 `AMBIGUOUS_DEVICE` 또는 `DEVICE_NOT_FOUND`가 발생한 상황,
- **When** 오류 응답의 `details`를 검사하면,
- **Then** `availableDevices`에는 **연결된 기기만** 들어 있고, 미연결 항목은 **개수만** 별도로 요약된다(항목 전체를 덤프하지 않는다) — 개정 전에는 23건이 전부 덤프됐다,
- **And** 요약 필드명은 구현 재량이나 **전체를 덤프하지 않는 것**은 규범이다.
- **Note(기각한 대안)**: 연결/미연결 두 목록으로 **분할 나열**하는 안은 기각했다 — 이 변경을 촉발한 비용(사용자가 읽어야 하는 오류의 23행 덤프)을 그대로 두면서 스키마 분기만 늘린다. 전체 목록이 필요한 사용자에게는 **`devices`가 이미 그 인벤토리**다(AC-045).
- **mock으로 완전히 판정된다**.

### AC-ANDROID-045 — `devices` 출력 불변 [비회귀] (REQ-DEVICES-001, REQ-MULTIDEV-002 개정 0.4.0)
- **Given** 연결 2건 + 미연결 21건이 섞인 환경,
- **When** `devices`를 실행하면,
- **Then** **23건이 전부 나열되고** 각 항목의 `connectionState`가 정확히 보고된다 — 대상 해석 계층의 필터링이 **인벤토리 명령까지 번지지 않는다**,
- **And** 이 AC가 막는 것은 "일관성 있게" 필터를 확장하는 리팩터링이다. `devices`는 사용자가 offline 시뮬레이터의 존재를 확인하는 **유일한 창구**이며, 오류 메시지가 개수만 요약하는 결정(AC-044)은 **`devices`가 전체를 준다는 전제 위에 선다**.
- **mock + 실측**: 목록 형태는 mock으로, 실제 23건 반환은 실측으로 확인한다(후자는 보강).

---

## §D.1 엣지 케이스

- 기기 0대 연결 → 명확한 "no device" 오류 JSON.
- `--device`에 존재하지 않는 serial → 명확한 오류 + 유효 기기 목록.
- `dump` XML이 비어 있거나 손상 → 정규화 함수가 안전하게 빈/부분 트리를 반환(예외 대신 관찰 가능한 오류).
- 이모지만/공백만 입력 → 비-ASCII 경로가 올바르게 선택됨.
- 이모지 정규화 표시(개정 0.2.0): `dump` 정규화 출력의 `text`에서 이모지가 디코드되지 않은 HTML 엔티티로 노출될 수 있음(입력 경로 무영향, 후속 개선 후보 — spec.md §C.2).
- 동일 serial에 대한 동시 IME 세션 쓰기(별도 프로세스) → 디스크 저장소 read-modify-write는 비원자적(last-write-wins) — 단일 CLI 호출의 일반 경로는 무영향(ime-session-store.ts `@MX:NOTE`).
- `screenshot` 스트림 중단 → 부분 파일이 호스트/기기에 남지 않음.
- `key`에 미지원 별칭(예: `key foobar`) → graceful 오류로 거부(REQ-INPUT-005).
- 복원할 원래 IME id를 알 수 없음(최초 상태 미기록, 빈 문자열) → 정밀 복원 없이 `ime reset` 시스템 기본값 폴백(REQ-ERR-001).
- 무제약 셀렉터(`--id`/`--text` 모두 생략) → 아무 요소도 매칭하지 않음(첫 요소 블라인드 탭/포커스 방지, REQ-SELECT-004).
- `resource-id` 미설정 앱(예: React Native) → `--id` 매칭 실패(`ELEMENT_NOT_FOUND`); `--text` 셀렉터 사용(spec.md §C.2).
- `--index`가 매칭 수 범위 초과 → `ELEMENT_NOT_FOUND`(범위 밖은 null 매칭).
- `stop`이 이미 종료된 앱에 실행 → 오류 아님(graceful no-op, force-stop 멱등적 관찰).
- 런처 컴포넌트 조회가 **선행 점 상대 액티비티**를 반환(`com.sec.android.app.popupcalculator/.Calculator`) → 파서가 그대로 통과시킨다(정규화·확장 시도 금지 — 실측된 형태다, 개정 0.3.0).
- 조회 stdout이 **2행**이고 첫 행이 컴포넌트가 아님 → **마지막 비어있지 않은 행**을 취한다(개정 0.3.0).
- 조회가 **종료 코드 0 + 단일 행 `No activity found`** → 실패로 판정한다. 종료 코드 기반 판정은 여기서 성공으로 오판한다(개정 0.3.0).
- `launch` 대상이 이미 포그라운드 → 재개 경고 + 종료 코드 0. **오류 아님**(AC-027, 개정 0.3.0).
- 바인딩 대기 중 상한 도달 → 브로드캐스트 미전송 + `IME_BIND_TIMEOUT`. 이때도 **원래 IME 디스크 영속은 유지**되어 `reset`이 복원 가능하다(AC-031 · REQ-IDEMP-004, 개정 0.3.0).
- 준비 신호 조회(`dumpsys`) 자체가 실패 → 준비 확인 불가이므로 브로드캐스트하지 않는다(무음 유실 방지). graceful 오류로 보고한다(개정 0.3.0).
- Secure Folder 등으로 `pm list packages`가 **stderr에 SecurityException을 내면서 종료 코드 0 + stdout 정상** → 정상 처리한다. stderr 비어있음을 성공 조건으로 삼으면 오탐이다(spec.md §C.3-⑪, 개정 0.3.0).
- 자가치유 `adb install` **성공 직후** `ime enable`이 `Unknown input method ... cannot be enabled for user #0`(exit 255)로 실패 → **IMMS 미등록 창**이므로 상한 안에서 재시도한다. "미설치"로 오독하고 재설치를 시도하지 않는다 — 패키지는 방금 설치에 성공했다(`pm list packages` 계수 0 → 1, spec.md §C.3-⑫, M12).
- `ime enable`이 **그 외의 형태로** 실패(권한/API 레벨/기기 상태) → **재시도하지 않고 즉시 표면화**한다. 재시도가 모든 실패를 삼키면 원인만 흐려진다(AC-034, M12).
- 이미 활성화된 IME에 `ime enable` 재실행 → **exit 0 + `already enabled`**, `ime list -s`에 중복 없음. 재시도가 기기 상태를 누적 변경하지 않는 실측 근거다(spec.md §C.3-⑮, M12).
- `ime enable` 재시도가 상한까지 소진 → 브로드캐스트 미전송 + 기존 실패 전파(`ok:false`). **새 오류 코드를 만들지 않는다** — 이 경로는 개정 전에도 `ok:false`였다(AC-035, M12).
- `text` 대상이 **Chrome 웹 페이지 입력란** → 숨김 단계가 `KEYCODE_ESCAPE`면 방금 입력한 텍스트가 지워진다. `KEYCODE_BACK`을 쓴다(spec.md §C.4-⑰/⑱, 개정 0.4.0).
- 숨김 시점에 소프트키보드가 **이미 내려가 있음**(`mInputShown=false`) → 숨김 키를 **보내지 않는다**. 예방적 가드이며, 미표시 상태 BACK 1회 시행에서 화면 이탈은 **관측되지 않았다**(§C.4-⑲, AC-040).
- 표시 여부 조회(`dumpsys`) 자체가 실패 → 숨김을 **생략**하고 `text`는 성공 처리한다. 조회 실패를 "표시됨"으로 낙관하지 않는다(개정 0.4.0).
- `text ... --keep-keyboard` → 표시 여부 **조회조차 하지 않는다**(숨김 단계 전체 생략 — 옵트아웃 의미 불변, 개정 0.4.0).
- 기기 목록에 **offline iOS 시뮬레이터가 다수** 존재(Xcode 설치 Mac의 기본 상태) → 계수·자동 선택·오류 메시지에서 **전부 제외**된다. `devices` 출력에서는 계속 보인다(AC-041/045, 개정 0.4.0).
- 연결된 기기 0대 + 미연결 항목 다수 → `NO_DEVICE`이되 메시지에 미연결 항목이 있다는 사실을 포함한다. "있는데 부팅 안 됨"과 "아무것도 없음"은 다른 조치를 뜻한다(개정 0.4.0).
- `--device`에 **목록에 있으나 미연결인** serial → `DEVICE_NOT_CONNECTED`(백엔드 미실행). **목록에 없는** serial은 여전히 `DEVICE_NOT_FOUND`다 — 두 경로를 접지 않는다(§C.4-㉒, AC-043).
- `connectionState: "unauthorized"` 기기 → 현재 정의상 **미연결**로 취급한다(대상으로 삼을 수 없다). REQ-ERR-003의 요구를 더 이른 지점에서 충족하는 것이며, 별도 코드를 추가로 만들지 않는다(개정 0.4.0).

## §D.2 품질 게이트 (TRUST 5)

- **Tested**: 정규화 함수·명령 구성(mock) 단위 커버리지 85%+. 기기 의존 항목은 e2e/manual로 표식.
- **Readable**: 명확한 네이밍, 영어 코드 주석(프로젝트 규약).
- **Unified**: 프로젝트 포매터/린터 통과(oxfmt·oxlint 또는 확정된 툴체인).
- **Secured**: 외부 입력(패키지명/좌표/텍스트) 검증. 임의 shell 주입 방지.
- **Trackable**: Conventional Commits, SPEC ID 참조.

## §D.3 Definition of Done

- [ ] **REQ ↔ AC 추적성**: **44개** REQ(REQ-SELECT 5개 추가, 개정 0.2.0. **개정 0.3.0은 신규 REQ 0건 — M12 연장 포함** — 기존 REQ-APP-001/INPUT-003/004에 날을 세웠을 뿐이다. **개정 0.4.0도 신규 REQ 0건** — 기존 REQ-INPUT-004/MULTIDEV-001/002에 날을 세웠다) 전 항목이 §D 매트릭스에서 하나 이상의 AC로 커버됨(REQ-ARCH-002는 AC-014 design-review로 커버). 커버리지 클레임은 매트릭스 대조로 검증된 사실이다.
- [ ] 정규화 순수 함수 단위 테스트 GREEN(XML 픽스처) — AC-008.
- [ ] 명령 구성 + 오류 경로 mock 테스트 GREEN — AC-009/010/012/015~019.
- [ ] `--device` 다중 기기 graceful failure 검증 — AC-009.
- [ ] 세션 기반 IME(전환/디스크 영속/복원-실패/프로세스 간 복원) 검증 — AC-003/010/015/021.
- [ ] `text` 자가치유 자동설치 + 키보드 자동 숨김 검증 — AC-020/022.
- [ ] 요소 셀렉터 tap/text(중심 탭·포커스, TARGET_CONFLICT/ELEMENT_NOT_FOUND/INVALID_INDEX) 검증 — AC-023/024.
- [ ] iOS 필드 매핑 표 + 파생 정책이 plan.md §F.9/§F.9.1에 존재 — AC-006(doc/design-review).
- [ ] 스킬 래퍼 직접 adb 호출 0건(grep) — AC-013.
- [ ] 기기 의존 AC(001~005, 007, 011)는 e2e/manual 체크리스트 또는 CI 에뮬레이터로 검증(오류 경로 015~019는 mock 우선).
- [ ] spec.md에 구현 세부 없음(WHAT/WHY만).
- [ ] @MX 태그 대상이 코드에 부착됨(개정 0.2.0·0.3.0 신규 경로 포함 — spec.md §F).
- [ ] **개정 0.3.0 — `launch` 명시적 컴포넌트**: 조회 파서 + 명시적 시작 + 전용 오류 코드 검증 — AC-025~028. **AC-026은 실측 없이는 미충족**이다.
- [ ] **개정 0.3.0 — IME 바인딩 준비 대기**: cold 착지 / warm 불변 / 타임아웃 미전송+`ok:false` / 결합항 실기기 확인 — AC-029~032. **AC-029는 실측 없이는 미충족**이다. **AC-032는 실기기 관측으로 해소됐다**(미바인딩 창의 `mCurId`가 이미 ADBKeyBoard → 결합항 판별력 0, spec.md §C.3-⑯).
- [ ] **개정 0.3.0 연장(M12) — `ime enable` 등록 경쟁 재시도**: cold 반복 회복 / 비매칭 즉시 표면화 / 상한 유한 종료 — AC-033~035. **AC-033은 실측 없이는 미충족**이며, **최소 8회 연속 포커스-상태 시행**을 요구한다(1회 green은 PASS가 아니다).
- [ ] **개정 0.3.0 — 회귀 없음**: 기존 653건 green 유지 + 신규 테스트만 증가. `pnpm typecheck` / `pnpm build` exit 0. (M10 시점 기준선은 665건 → 679건으로 갱신됐다 — M12는 그 위에 신규 테스트만 더한다.)
- [ ] **개정 0.3.0 연장(M12) — 심각도 서술 규율**: 결함 3을 **무음 실패로 서술하지 않았고**(소리 내는 실패 · 유효 연산의 이유 없는 실패), **포커스 상관을 원인으로 서술하지 않았음**을 문서·주석·커밋에서 확인 — spec.md §C.3-⑫/⑬, plan.md §G.
- [ ] **개정 0.4.0 — 소프트키보드 숨김(M14)**: 메커니즘 교체 + 가드 + best-effort 불변 검증 — AC-036~040. **AC-036은 실측 없이는 미충족**이며, **Chrome 웹 입력란에서 판정해야 한다**(네이티브 판정은 수정 전에도 통과하므로 대체 불가).
- [ ] **개정 0.4.0 — 대상 기기 해석(M13)**: "연결" 정의 + 계수/자동 선택/메시지 + `DEVICE_NOT_CONNECTED` + `details` 구성 + `devices` 불변 — AC-041~045. **다섯 모두 unit으로 충족 가능하며 기기 부재가 미충족 사유가 아니다**(실측 레그는 배선 확인 보강).
- [ ] **개정 0.4.0 — 응답 계약 서술 규율**: 결함 5를 **봉투 변경으로 서술하지 않았음**(`ok`는 불변; 바뀐 것은 오류 코드·실패 지점·`details` 구성), 결함 4를 **응답 계약 변경으로 서술하지 않았음**(숨김은 개정 전에도 best-effort), 그리고 **결함 5를 무음 실패로 서술하지 않았음**을 문서·주석·커밋에서 확인 — spec.md 0.4.0 개정 범위 말미, plan.md §G.
- [ ] **개정 0.4.0 — 주장 경계 규율**: 표시 여부 가드를 **실측 강제로 서술하지 않았음**(예방적 + 반대 관측 1건), `mInputShown` 마커 출현 횟수를 **1회로 단정하지 않았음**을 확인 — spec.md §C.4-⑱/⑲.
- [ ] **개정 0.4.0 — 범위 규율**: 결함 5를 **Android 경로로 좁히지 않았음**(플랫폼 중립 — `device-targeting.ts`는 두 백엔드 공용, 실측 위반 항목은 전부 iOS)을 확인 — spec.md REQ-MULTIDEV-001, §C.4-⑳.
- [ ] **개정 0.4.0 — 회귀 없음**: 기존 테스트 green 유지 + 신규 테스트만 증가. `pnpm typecheck` / `pnpm build` exit 0. M14가 `inputText` 경로 픽스처의 **숨김 argv 기대값만** 갱신했고 M10·M12의 AC 판정 근거를 바꾸지 않았음을 확인.

> **AC 카운트(개정 0.4.0)**: §D 매트릭스 총 **45건**(AC-ANDROID-001~045). 0.3.0 시점 35건 + **0.4.0 신규 10건**(M14: AC-036~040 / M13: AC-041~045). **기존 AC는 하나도 재작성되지 않았다** — AC-022(키보드 자동 숨김)는 숨김의 *수단*이 바뀌어도 판정 내용이 그대로이므로 손대지 않았고, 새 계약은 REQ-INPUT-004 개정 조항 위의 신규 AC로만 들어간다. 이전 카운트: 최초 19건 → 0.2.0 24건 → 0.3.0 32건 → 0.3.0(M12 연장) 35건 → 0.4.0 **45건**.

> **AC 카운트(개정 0.3.0, 기록 보존)**: §D 매트릭스 총 **35건**(AC-ANDROID-001~035). 0.2.0 시점 24건 + M10·M11 신규 8건(AC-025~032) + **M12 신규 3건(AC-033~035)**. **기존 AC는 하나도 재작성되지 않았다** — 0.3.0은 새 계약을 추가할 뿐 기존 판정을 바꾸지 않는다(AC-032에 붙은 것은 판정 변경이 아니라 **관측 결과 기록**이며, 그 AC가 원래 요구한 산출물이다).

---

## §D.4 판정 방식의 한계 — mock으로 충족 불가한 AC (개정 0.3.0)

**두 결함 모두 unit/mock 스위트가 구조적으로 잡을 수 없었다.** 이것은 테스트가 부실해서가 아니라 **mock이 답할 수 있는 질문의 종류가 정해져 있기 때문**이다.

| mock이 답할 수 있는 것 | mock이 답할 수 없는 것 |
|------------------------|------------------------|
| 어떤 `adb` argv가 **구성되는가** | 그 argv를 **기기가 어떻게 해석하는가** |
| argv가 **어떤 순서로** 나가는가 | argv **사이에 흐른 시간**이 충분한가 |
| 어떤 argv가 **나가지 않았는가**(미전송) | 나간 argv가 **화면에 무엇을 남겼는가** |
| 오류 타입 → JSON 코드 매핑 | 오류가 **옳은 상황에서** 났는가 |

- **결함 1**: `am start -a MAIN -c LAUNCHER -p <pkg>`라는 argv는 **모양이 완벽히 맞았다.** 틀린 것은 기기 쪽 매칭 규칙(DEFAULT 선언 요구)이었고, 이는 mock의 사정거리 밖이다.
- **결함 2**: 설치 → `ime set` → 브로드캐스트라는 argv **순서도 맞았다.** 틀린 것은 그 사이 시간이었고, mock에는 IME 서비스 바인딩이라는 개념 자체가 없다.

**따라서 아래 AC들은 mock 단독으로 충족할 수 없으며, 각 결함이 실제로 고쳐졌음을 증명하는 유일한 판정이다.**

| AC | 왜 mock 단독 불가인가 | 판정 근거 |
|----|----------------------|-----------|
| **AC-ANDROID-026** | 기기의 인텐트 매칭 규칙은 mock에 존재하지 않는다 | 실기기에서 DEFAULT 미선언 앱이 **포그라운드로 관찰됨** |
| **AC-ANDROID-029** | IME 서비스 바인딩 시점은 mock에 존재하지 않는다 | **스크린샷**에서 문자열이 입력란에 착지함 |
| **AC-ANDROID-033** | IMMS의 IME **등록** 시점은 mock에 존재하지 않는다 | **포커스 상태에서 8회 이상 연속** cold 사이클, `ime enable` 자연 실패 **0회** + 착지 |
| **AC-ANDROID-036** (개정 0.4.0) | 기기가 keycode를 **어떻게 해석하는가**는 mock에 존재하지 않는다 — Chrome은 ESCAPE를 페이지로 전달하고 네이티브는 키보드만 내린다 | **Chrome 웹 입력란** 스크린샷에서 숨김 후 문자열이 **살아남음**. **무대가 AC의 일부다** — 네이티브 판정은 수정 전에도 통과한다(§D.4.2-a) |

**추가로 실측만으로 판정되는 AC**: AC-ANDROID-027(태스크 재개 의미 — 기기의 태스크 스택 거동), AC-ANDROID-032(미바인딩 창의 IME id — **관측 완료**: 이미 ADBKeyBoard였고 결합항 판별력은 0, spec.md §C.3-⑯), 그리고 개정 0.4.0의 AC-ANDROID-037(네이티브 표면 비회귀)·AC-ANDROID-038(키보드가 실제로 내려감).

**mock으로 충분한 것도 분명히 해 둔다.** AC-031의 "브로드캐스트 미전송", AC-034의 "`ime enable` 호출 정확히 1회", AC-035의 "재시도 유한 종료"는 모두 **mock으로 정확히 단언 가능하다**(mock exec이 무엇을 받았고 몇 번 받았는지). **"무엇이 나가지 않았는가"와 "몇 번 나갔는가"는 mock의 강점**이며, 실측 레그가 없다고 약한 AC가 아니다. 개정 0.4.0에서는 **AC-039·040**(숨김 실패가 봉투를 바꾸지 않음 / 미표시·조회 실패 시 숨김 argv 미도달)과 **AC-041~045 다섯 전부**가 여기 속한다 — 후자는 판정 대상이 **호스트 안의 순수 함수**여서 실측이 판정 조건조차 아니다(§D.4.2-b).

### §D.4.1 간헐 결함의 판정 — 결함 3이 앞의 둘과 다른 축 (M12)

앞의 표는 **"mock이 답할 수 있는 질문의 종류"** 라는 축이었다. 결함 3은 **두 번째 축**을 추가한다: **재현이 결정론적인가, 간헐적인가.**

| | 결함 1(`launch`) · 결함 2(`text` 바인딩) | 결함 3(`ime enable` 등록) |
|---|---|---|
| 조건을 맞췄을 때 재현율 | **100%**(DEFAULT 미선언 앱은 항상 실패 / 미바인딩 창은 항상 유실) | **3/8**(cold + 포커스), 포커스 없으면 **0/11** |
| 1회 관측의 의미 | **판정**이 된다 | **판정이 아니다** — 미수정 상태도 5/8로 통과 |
| 판정에 필요한 것 | 조건을 맞춘 **1회 관측** | 조건을 맞춘 **N회 시행 + 시행 횟수 기록** |

**그래서 AC-033은 시행 횟수를 AC 본문에 못 박는다.** 최소 8회 연속에서 baseline 실패율로 우연히 통과할 확률은 `(5/8)^8 ≈ 2.3%`다. 이 수치는 **보장이 아니라 추정**이다 — baseline 자체가 8회 표본이므로 실패율 3/8에 상당한 불확실성이 있다.

**미수정 상태를 기준선으로 다시 재지 않는 이유**: 수정 후 8회 green과 수정 전 3/8을 비교하는 것이 판정이며, 수정을 되돌려 재측정하는 것(A/B)은 기기 비용이 크고 이미 관측된 baseline이 있다. **다만 8회 green이 "결함이 없어졌다"의 증명이 아니라 "빈도가 계산 가능한 수준 아래로 내려갔다"의 증거임은 정확히 서술한다.**

**기기가 없을 때의 규율**: 실측 판정 AC는 **미기록으로 남기고 PASS로 승격하지 않는다.** 관측하지 않은 것을 PASS로 주장하는 것은 이 SPEC이 0.2.0 마감에서 이미 지킨 규율이며(progress.md §E.4-b: 8건을 PARTIAL로 유지), 하필 그 규율이 없었다면 이번 결함 2건도 "검증됨"으로 덮였을 것이다.

### §D.4.2 판정 무대와 mock 축의 양방향 규율 (개정 0.4.0)

0.4.0의 두 결함은 §D.4가 세운 축에 **각각 반대편 끝**에 놓인다. 한쪽만 보고 규율을 세우면 다른 쪽에서 틀린다.

#### (a) 결함 4 — 새 축: **판정 무대(where)** 가 mock 여부만큼 중요하다

§D.4의 축은 "mock이 답할 수 있는 질문의 종류"였고, §D.4.1은 "재현이 결정론적인가"를 더했다. 결함 4는 **세 번째 축**을 더한다: **어느 화면에서 판정했는가.**

| | 결함 1·2·3 | 결함 4(`text` 숨김) |
|---|---|---|
| 조건을 맞췄을 때 재현율 | 100% (1·2) / 3/8 (3) | **100% — 단, 웹 표면에서만** |
| 네이티브 표면에서의 거동 | 동일하게 실패 | **정상 동작**(ESCAPE도 키보드만 내린다) |
| 1회 관측의 의미 | 판정(1·2) / 판정 아님(3) | **무대가 맞으면 판정, 틀리면 무의미** |
| 판정에 필요한 것 | 조건 + (3은) 시행 횟수 | **무대 지정** — Chrome 웹 입력란 |

**이 결함이 M10·M12의 실기기 판정을 전부 통과한 이유가 이것이다.** 같은 명령, 같은 argv, 같은 봉투인데 검증이 **전부 Settings 앱(네이티브 `EditText`)** 에서 이뤄졌다. `text`가 실제로 쓰이는 자리는 브라우저인데 판정은 네이티브에서만 돌았다 — **판정 무대가 곧 판정력이었다.**

따라서 AC-036은 무대를 **AC 본문에 못 박는다**. AC-037(네이티브)은 비회귀 확인이며 **AC-036을 대신할 수 없다** — 그 무대에서는 결함이 애초에 나타나지 않는다.

#### (b) 결함 5 — 반대 방향: **mock 불신은 mock 과신의 거울상 오류다**

0.3.0의 세 결함이 전부 mock 사정거리 밖이었던 탓에, "이 저장소의 기기 관련 AC는 실측이 필요하다"가 일반 규칙처럼 굳기 쉽다. **결함 5는 그 일반화의 반례다.**

| | 결함 1~4 | 결함 5(대상 해석) |
|---|---|---|
| 결함이 사는 곳 | 기기와의 상호작용(해석·시점·화면) | **호스트 안의 순수 함수** |
| 입력 | adb/idb argv → 기기 | **`DeviceInfo[]` 배열** |
| mock의 사정거리 | 밖 | **안 — 전부 판정 가능** |
| 실측 레그의 역할 | **판정 근거** | **배선 확인(보강)** |

`resolveTargetDevice`는 이미 정규화된 배열을 받아 결과를 내는 순수 함수다. 계수가 미연결을 제외하는가, 연결 1대에서 자동 선택이 발동하는가, 미연결 지정이 구분된 코드를 내는가, `details`가 무엇을 담는가 — **넷 다 픽스처로 완전히 단언된다.** 기기의 해석도, argv 사이의 시간도, 화면 효과도 개입할 자리가 없다.

**그러므로 AC-041~045를 "실측 필수"로 적지 않는 것이 규율이다.** 그렇게 적으면 두 가지를 잃는다:
1. **기기가 없을 때 판정 가능한 AC가 미기록으로 밀린다** — 근거 없이 진행을 막는다.
2. **"실측 필수" 표식이 희석된다** — AC-026·029·033·036처럼 **정말로 실측이 아니면 안 되는** AC와 구별이 사라지고, 표식이 경고로서의 힘을 잃는다.

**단 하나 기기가 답하는 질문**은 "실제 `listDevices()`가 종료된 시뮬레이터를 `connectionState: "offline"`으로 내는가"이며, 이는 **이미 관측됐다**(spec.md §C.4-⑳ — 23건 중 2건이 `"device"`). 픽스처의 전제는 그 관측 위에 서고, 그래서 실측 레그가 판정 조건이 아니라 보강인 것이다.

**두 방향을 함께 적는 이유**: §D.4가 이미 "미전송은 mock의 강점"이라고 못 박았듯, mock을 일괄 불신하는 과잉교정은 mock을 과신하는 것과 **같은 종류의 실수**다 — 둘 다 "이 판정 수단이 무엇에 답하는가"를 묻지 않고 규칙으로 대체한 것이다.
