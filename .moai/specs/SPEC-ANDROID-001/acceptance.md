---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 인수 기준"
version: "0.1.2"
status: completed
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
---

# 인수 기준 — SPEC-ANDROID-001

> 형식: Given-When-Then. 각 AC는 관찰 가능(테스트 출력/파일 존재/필드 검증)해야 한다. 검증 방식(unit / mock / e2e·manual)을 명시한다.

## §D. 인수 기준 매트릭스

| AC ID | 요약 | 관련 REQ | 검증 방식 |
|-------|------|----------|-----------|
| AC-ANDROID-001 | `doctor` 환경 감지·설치·`reset` 복원 | REQ-DOCTOR-001~005 | e2e·manual |
| AC-ANDROID-002 | 각 원시 명령이 실기 에뮬레이터에서 동작 | REQ-SCREENSHOT/INPUT/DUMP | e2e·manual |
| AC-ANDROID-003 | 한글+이모지 입력 착지 + IME 복원 | REQ-INPUT-003/004 | e2e·manual |
| AC-ANDROID-004 | 에뮬레이터+실기기 동시 — `devices` 구분·독립 대상·격리 | REQ-DEVICES/MULTIDEV | e2e·manual |
| AC-ANDROID-005 | 멱등성 + 중복 설치·잔여 파일 없음 | REQ-IDEMP-001~003 | e2e·manual + mock |
| AC-ANDROID-006 | iOS-readiness: 스키마/interface가 idb 필드셋 수용 + 매핑 표/파생 정책 문서화 | REQ-SCHEMA-003, REQ-ARCH-003 | doc/design-review |
| AC-ANDROID-007 | `doctor` 후 단일 `npx` 명령으로 설치·실행 | REQ-ARCH-005 | e2e·manual |
| AC-ANDROID-008 | 정규화 순수 함수: XML 픽스처 → 기대 JSON | REQ-SCHEMA-002/004 | unit |
| AC-ANDROID-009 | `--device` 생략 + 다중 기기 → graceful failure | REQ-MULTIDEV-002 | unit(mock) + e2e |
| AC-ANDROID-010 | 오류 경로에서도 원래 IME 복원 | REQ-INPUT-004, REQ-IDEMP-004 | unit(mock) + e2e |
| AC-ANDROID-011 | `launch`/`stop`이 앱을 시작/강제종료 | REQ-APP-001/002 | e2e·manual |
| AC-ANDROID-012 | 모든 명령이 유효한 JSON in/out 방출 | REQ-ARCH-001 | unit(mock) |
| AC-ANDROID-013 | Claude 스킬 래퍼에 직접 `adb` 호출 없음(greppable) | REQ-ARCH-004 | unit(grep) |
| AC-ANDROID-014 | 3계층 아키텍처 유지 (design-review only) | REQ-ARCH-002 | design-review |
| AC-ANDROID-015 | IME 복원 실패 → 원래 IME id 보고(수동 복구) | REQ-ERR-001 | unit(mock) + e2e |
| AC-ANDROID-016 | ADBKeyBoard 설치 실패 → graceful 오류, 기기 무변경 | REQ-ERR-002 | unit(mock) + e2e |
| AC-ANDROID-017 | device offline/unauthorized → graceful 오류 | REQ-ERR-003 | unit(mock) + e2e |
| AC-ANDROID-018 | adb 데몬 미기동/서버 기동 실패 → graceful + doctor health | REQ-ERR-004, REQ-DOCTOR-001 | unit(mock) + e2e |
| AC-ANDROID-019 | `doctor` adb 설치 OS별 분기 + macOS 명시 동의 게이트(무음 금지) | REQ-DOCTOR-002 | unit(mock) + e2e |

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

### AC-ANDROID-003 — 한글+이모지 입력 + IME 복원
- **Given** 입력 포커스가 있는 텍스트 필드,
- **When** `text "안녕하세요 😸"`를 실행하면,
- **Then** 해당 한글+이모지 문자열이 입력 필드에 정확히 착지하고,
- **And** 입력 완료 후 원래 IME가 복원된다.

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

### AC-ANDROID-010 — 오류 경로 IME 복원 (cleanup on error)
- **Given** 비-ASCII 입력 도중 예외가 발생하는 상황(mock),
- **When** `text` 실행이 실패로 종료되면,
- **Then** 원래 IME가 여전히 복원된다(finally/cleanup 경로 검증).

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

---

## §D.1 엣지 케이스

- 기기 0대 연결 → 명확한 "no device" 오류 JSON.
- `--device`에 존재하지 않는 serial → 명확한 오류 + 유효 기기 목록.
- `dump` XML이 비어 있거나 손상 → 정규화 함수가 안전하게 빈/부분 트리를 반환(예외 대신 관찰 가능한 오류).
- 이모지만/공백만 입력 → 비-ASCII 경로가 올바르게 선택됨.
- 동일 serial에 대한 동시 `text` 호출 → 상태 경합 없이 IME 복원 일관성 유지.
- `screenshot` 스트림 중단 → 부분 파일이 호스트/기기에 남지 않음.
- `key`에 미지원 별칭(예: `key foobar`) → graceful 오류로 거부(REQ-INPUT-005).
- 복원할 원래 IME id를 알 수 없음(최초 상태 미기록) → 안전 기본값/수동 복구 안내(REQ-ERR-001).
- `stop`이 이미 종료된 앱에 실행 → 오류 아님(graceful no-op, force-stop 멱등적 관찰).

## §D.2 품질 게이트 (TRUST 5)

- **Tested**: 정규화 함수·명령 구성(mock) 단위 커버리지 85%+. 기기 의존 항목은 e2e/manual로 표식.
- **Readable**: 명확한 네이밍, 영어 코드 주석(프로젝트 규약).
- **Unified**: 프로젝트 포매터/린터 통과(oxfmt·oxlint 또는 확정된 툴체인).
- **Secured**: 외부 입력(패키지명/좌표/텍스트) 검증. 임의 shell 주입 방지.
- **Trackable**: Conventional Commits, SPEC ID 참조.

## §D.3 Definition of Done

- [ ] **REQ ↔ AC 추적성**: 39개 REQ 전 항목이 §D 매트릭스에서 하나 이상의 AC로 커버됨(REQ-ARCH-002는 AC-014 design-review로 커버). 커버리지 클레임은 매트릭스 대조로 검증된 사실이다.
- [ ] 정규화 순수 함수 단위 테스트 GREEN(XML 픽스처) — AC-008.
- [ ] 명령 구성 + 오류 경로 mock 테스트 GREEN — AC-009/010/012/015~019.
- [ ] `--device` 다중 기기 graceful failure 검증 — AC-009.
- [ ] IME 복원(정상/오류/복원-실패 경로) 검증 — AC-003/010/015.
- [ ] iOS 필드 매핑 표 + 파생 정책이 plan.md §F.9/§F.9.1에 존재 — AC-006(doc/design-review).
- [ ] 스킬 래퍼 직접 adb 호출 0건(grep) — AC-013.
- [ ] 기기 의존 AC(001~005, 007, 011)는 e2e/manual 체크리스트 또는 CI 에뮬레이터로 검증(오류 경로 015~019는 mock 우선).
- [ ] spec.md에 구현 세부 없음(WHAT/WHY만).
- [ ] @MX 태그 대상이 Run 단계에서 부착됨.
