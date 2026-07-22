---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 구현 계획"
version: "0.1.2"
status: completed
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
---

# 구현 계획 — SPEC-ANDROID-001

> 마일스톤은 **결정 번복 가능성(decision-reversibility)** 순으로 정렬한다. 가장 바뀔 확률이 높은 결정(데이터 모델, 타입 인터페이스, 사용자 대면 흐름)을 먼저 배치하고, 기계적/반복적 단계를 뒤로 미뤄 인간 리뷰가 고-변경 결정에 집중하도록 한다.

## §A. 컨텍스트

`explore-mobile`의 첫 SPEC. Android/adb 원시 제어 명령 + `doctor` 환경 부트스트랩 + 공통 요소 스키마를 구현한다. 그린필드(현재 소스 코드 없음). 개발 방식은 **TDD 기본**(정규화 순수 함수가 핵심 테스트 단위).

## §B. 알려진 이슈 / 리스크

- **ADBKeyBoard 의존성**: 유니코드 입력이 외부 APK에 의존. APK 배포 경로/라이선스/버전 고정 필요.
- **`doctor` 자동 설치의 권한**: adb/platform-tools 자동 설치는 OS별 패키지 매니저·권한 상승이 필요할 수 있어 항상 자동 설치가 가능하다고 가정 불가.
- **기기 의존 검증**: 스크린샷 유효성/탭·텍스트 효과/한글 입력 착지/다중 기기 격리는 실기기·에뮬레이터가 있어야 검증 가능 → e2e/수동(또는 CI 에뮬레이터).
- **idb 미유지보수(선반영)**: SPEC-02에서 idb 버전 고정 + interface 격리 필요(본 SPEC 아님).

### Decisions (해소됨 — 2026-07-22, Implementation Kickoff Approval 전 확정)

기존 4개 미해소 항목이 사용자 결정으로 해소되었다. 아래 결정은 spec.md §C 제약과 REQ-DOCTOR-002/003에 반영되었다.

1. **패키지 매니저 / 배포**: 개발은 **pnpm**을 표준으로 사용하고, **npm 레지스트리**에 배포하여 최종 사용자는 전역 설치 없이 `npx`로 실행한다. 개발용 PM(pnpm)은 최종 사용자 `npx` 실행과 **독립적**(사용자는 pnpm 불필요).
2. **adb 자동 설치 정책(OS별)**: macOS는 **사용자 명시 동의 후 Homebrew 자동 설치**, Linux/Windows는 **안내만(정확한 수동 설치 단계 출력, 자동 설치 없음)**. 자동 설치는 절대 무음이 아니며 동의 필수 → REQ-DOCTOR-002 반영.
3. **ADBKeyBoard APK 조달**: 버전 고정된 APK를 패키지에 **번들**(오프라인 재현 가능). 사전 조건 — APK 라이선스가 재배포를 허용함을 검증(예: Apache-2.0)하고 attribution 포함 → REQ-DOCTOR-003 / §C 제약 반영.
4. **Node 최소 버전**: **Node 20 LTS 이상**(ESM) → §C 제약 반영.

## §C. 사전 점검 (Pre-flight)

- 그린필드 확인 완료(소스 코드/package.json 없음).
- SPEC ID 중복 없음(`NO_DUPLICATE`), 정규식 self-check `PASS`.
- product/structure/tech.md 미존재 — 필요 시 `/moai project`로 초기화 권장.

## §D. 제약

- TypeScript(ESM), Node.js, JSON in/out, `npx` 무설치 실행.
- 3계층 얇은 구조 유지(CLI → 정규화 → adb 래퍼). iOS/idb 백엔드 대체 지점 보존.
- 시간 추정 금지 — 우선순위 라벨로만 표기.

## §E. 자체 검증 (Self-Verification)

- 정규화 순수 함수는 샘플 XML 픽스처로 단위 테스트(기기 불필요).
- adb 서브프로세스는 mock으로 명령 구성(command construction) 테스트.
- 기기 의존 항목은 e2e/manual로 분류(acceptance.md §D 참조).

## §F. 마일스톤 (번복 가능성 내림차순)

> 상단일수록 "바뀔 확률이 높은 결정" → 리뷰 집중. 하단일수록 기계적 단계.

### M1 — 공통 요소 스키마 + device-backend interface 설계 [최고 변경 확률]
- 공통 스키마 `{ role, text, id, bounds, tappable, enabled, children }` 타입 확정.
- device-backend interface(추상) 정의 — iOS/idb 대체 지점.
- **iOS 필드 매핑 표(§F.9) 확정** — 스키마가 idb 필드를 수용함을 문서로 검증(AC-ANDROID-006).
- 관련: REQ-SCHEMA-001/003, REQ-ARCH-002/003. `@MX:ANCHOR` 대상.

### M2 — 정규화 계층(순수 함수, uiautomator XML → 공통 스키마) [높은 변경 확률·핵심 테스트 단위]
- `class→role`, `resource-id→id`, `text`/`content-desc→text`, `bounds→bounds`, `clickable+enabled→tappable`.
- 샘플 XML 픽스처 기반 TDD.
- 관련: REQ-SCHEMA-002/004, REQ-DUMP-002.

### M3 — CLI 명령 표면 + JSON in/out 계약 [사용자 대면 흐름]
- 명령 표면: `doctor`/`devices`/`launch`/`stop`/`screenshot`/`tap`/`text`/`key`/`dump`.
- 공통 옵션 `--device <serial>`, 표준 JSON 응답 형태, graceful error 형태.
- 관련: REQ-ARCH-001/005, REQ-MULTIDEV-001/002.

### M4 — adb 서브프로세스 래퍼 + 무상태 원시 명령 [기계적]
- `devices`/`launch`/`stop`/`screenshot`(exec-out)/`tap`/`key` 구현.
- mock 기반 명령 구성 테스트.
- 관련: REQ-DEVICES-001/002, REQ-APP-001/002, REQ-SCREENSHOT-001/002, REQ-INPUT-001/005.

### M5 — 텍스트 입력 + Unicode IME 경로 + IME 복원 [위험 구역]
- ASCII 빠른 경로(`input text`) / 비-ASCII base64 브로드캐스트(`ADB_INPUT_B64`).
- `ime enable`/`ime set` → 완료 후 **항상 원래 IME 복원**(오류 경로 포함).
- 관련: REQ-INPUT-002/003/004, REQ-IDEMP-004. `@MX:WARN` 대상.

### M6 — `doctor` / `reset` 환경 부트스트랩 [부작용 큰 단계]
- adb/platform-tools 감지 → 자동 설치 또는 정확한 수동 안내.
- ADBKeyBoard 설치·활성화. `pm list packages`로 중복 설치 방지.
- `doctor --clean`/`reset`으로 원래 상태 복원.
- 관련: REQ-DOCTOR-001~005, REQ-IDEMP-002. `@MX:WARN` 대상.

### M7 — 다중 기기 격리 + 동시성 + 멱등성/위생 [기계적·교차 관심사]
- serial 키 상태 격리, 임시 리소스 serial 네임스페이스.
- 멱등성 보장, 잔여 파일 무잔류.
- 관련: REQ-MULTIDEV-003/004, REQ-IDEMP-001/003.

### M8 — 얇은 Claude 스킬 래퍼 [최소·마지막]
- `.claude/skills/` 하위 래퍼 1개 — CLI만 호출(adb 직접 실행 금지).
- 관련: REQ-ARCH-004.

## §F.9 iOS 필드 매핑 표 (iOS-readiness 문서 — AC-ANDROID-006 근거)

> iOS는 본 SPEC에서 **구현하지 않는다**. 아래 표는 공통 스키마/interface가 idb 필드를 재설계 없이 수용함을 증명하는 설계 산출물이다(SPEC-02에서 실제 구현).

| 공통 스키마 필드 | Android (uiautomator) | iOS (idb accessibility) |
|------------------|-----------------------|-------------------------|
| `role` | `class` | `type` / `role` |
| `text` | `text` / `content-desc` | `AXLabel` |
| `id` | `resource-id` | `AXUniqueId` |
| `bounds` | `bounds` | `frame` |
| `tappable` | `clickable` + `enabled` | `AXTraits` + `isEnabled` 조합 파생(§F.9.1) |
| `enabled` | `enabled` | `isEnabled` |
| `children` | 중첩 node | 중첩 element |

idb 참고(SPEC-02 대상): `idb ui describe-all` / `idb ui describe-point`(인지), `idb ui tap`(탭), `idb ui text`(텍스트). idb는 미유지보수(2022-08 v1.1.8) → 버전 고정 + backend interface 뒤 격리.

### F.9.1 iOS 필드 파생 정책 (파생 규칙 명세)

- **`role` 소스 필드 확인**: idb 접근성 요소의 타입은 `type` 필드로 노출된다(예: `Button`, `TextField`, `StaticText`, `Cell`). 일부 버전은 `role` 별칭을 함께 제공하므로, backend 어댑터는 `type`을 1차 소스로, `role`을 보조로 읽어 공통 `role`에 매핑한다(field name 확정: **`type`**, `role`은 alias). SPEC-02에서 실제 idb JSON 스키마로 최종 확정.
- **`tappable` 파생 정책 (AXTraits → tappable)**: iOS에는 Android `clickable`에 직접 대응하는 불리언이 없다. 따라서 `tappable`은 다음 규칙으로 **파생**한다 — `AXTraits`(또는 `traits`)에 상호작용 trait(예: `Button`/`Link`/`SelectableText`에 해당하는 트레이트)가 포함되거나 `type`이 상호작용 타입 집합(Button/Cell/TextField/Switch 등)에 속하고, **동시에** `isEnabled == true`인 경우에만 `tappable = true`. 둘 중 하나라도 불충족이면 `false`. 이 파생 규칙은 Android의 `clickable + enabled → tappable`과 의미상 대칭이다.
- **비구현 확인**: 본 SPEC에서 idb fixture/구현은 범위 밖이므로, 위 파생 정책은 **문서/설계 리뷰 검증**(AC-ANDROID-006)이며 자동화 단위 테스트가 아니다.

## §G. 안티 패턴 (피할 것)

- adb XML을 정규화 없이 그대로 노출(스키마 계약 위반, iOS 플러그인 불가).
- IME 변경 후 복원 누락(오류 경로에서 기기 입력 손상).
- 기기에 임시 파일 잔류(exec-out 스트리밍 미사용).
- `--device` 미지정 다중 기기에서 임의의 첫 기기로 조용히 대상 선정(graceful failure 위반).
- 설치 전 `pm list packages` 미확인으로 중복 설치.
- spec.md에 구현 세부(함수명/클래스) 유입.

## §H. 교차 참조

- 요구사항·스키마·로드맵·@MX 대상: `spec.md`
- 인수 기준·엣지 케이스·DoD: `acceptance.md`
- 진행/감사 신호: `progress.md`
- 관련 사실 출처(2026-07-22 문서 확인): adb `input text` 유니코드 불가 / ADBKeyBoard `ADB_INPUT_B64` / `exec-out screencap -p` / `uiautomator dump` 필드셋.
