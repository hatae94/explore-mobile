---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 진행"
version: "0.1.2"
status: in-progress
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
---

# 진행 상태 — SPEC-ANDROID-001

## §E.1 Plan-phase Audit-Ready Signal

- Plan-phase 산출물 생성 완료 (Tier M = 3 artifact + progress): spec.md + plan.md + acceptance.md + progress.md. design.md/research.md 없음(Tier M).
- SPEC ID: `SPEC-ANDROID-001` — 정규식 self-check `PASS` (`SPEC ✓ | ANDROID ✓ | 001 ✓`). audit iter-1에서 2-도메인-세그먼트 구 형식(ANDROID+PRIMITIVES)에서 정규식 준수 ID로 리네임(D4).
- 요구사항 **39개**(GEARS; REQ-ERR 4개 추가), 인수 기준 **19개**(+엣지 케이스). Out of Scope 4개 H3 + 구현세부 제외.
- clarification 4건 모두 해소됨(plan.md §B Decisions). audit iter-1 결함 D1~D11 반영(traceability/error-path/safety AC/sources/regex 등). 미해소 blocker 없음. spec v0.1.2.
- REQ↔AC 추적성: 39 REQ 전부 ≥1 AC 커버(REQ-ARCH-002는 AC-014 design-review). Tier M PASS 임계 0.80.
- 상태: `draft` (초기값 유지). 다음 전이(`draft → in-progress`)는 manager-develop 소유.

## §E.2 Run-phase Evidence

> Run-phase는 M0(scaffold)+M1+M2 청크부터 진행 중(in-progress). M3-M8은 후속 위임(future delegation) 범위이며 본 청크에서 구현하지 않는다. 아래 매트릭스는 누적 로그로, 이후 M3-M8 청크가 해당 행을 갱신한다.

### 진행된 마일스톤 (누적)

- **M0 (scaffold)**: TypeScript(ESM) + pnpm + vitest 프로젝트 뼈대. `package.json`(`type:"module"`, `bin`/`files`/`exports` 설정), `tsconfig.json`+`tsconfig.build.json`, `vitest.config.ts`.
- **M1 (공통 요소 스키마 + device-backend interface)**: `src/schema/common-element.ts`(`CommonElement`/`ElementBounds`), `src/schema/device-backend.ts`(`DeviceBackend`/`DeviceInfo`) — REQ-SCHEMA-001/003, REQ-ARCH-002/003. `@MX:ANCHOR` 부착(REASON 포함).
- **M2 (정규화 계층, TDD)**: `src/normalize/uiautomator.ts`의 `normalizeUiAutomatorXml()` 순수 함수. RED(테스트 작성, 모듈 부재로 실패 확인) → GREEN(구현, 9/9 통과) → 커버리지 측정(92.1% stmt) 완료. REQ-SCHEMA-002/004, REQ-DUMP-002. `src/index.ts` 배럴 export 추가.
- **M3 (CLI 명령 라우터 + JSON in/out 계약, TDD)**: `src/cli/router.ts`(`runCli`), `src/cli/commands/*`(devices/launch/stop/tap/key/dump/screenshot + text/doctor/reset 스텁), `src/cli/envelope.ts`(SUCCESS/ERROR JSON 봉투), `src/cli/device-targeting.ts`(`resolveTargetDevice` — REQ-MULTIDEV-001/002), `src/cli/args.ts`(`node:util parseArgs` 기반), `src/cli/validators.ts`, `src/schema/key-alias.ts`. **`DeviceBackend`(M1) 인터페이스만 의존 — 실제 adb 래퍼(M4) 없이 mock backend로 전 커맨드 테스트 완료**(3계층 경계: CLI가 adb argv를 직접 다루지 않음을 이 커밋 자체가 증명). RED(router.test.ts가 `./router.js` 부재로 실패 확인) → GREEN(53/53 통과, M3 단독 트리 검증) 완료. REQ-ARCH-001, REQ-MULTIDEV-001/002.

### AC 매트릭스 — M3 커밋 시점 스냅샷 (§D 19건 전체 — 이번 청크 범위 외 항목은 PENDING)

| AC ID | 요약 | 관련 REQ | 검증 방식 | Status | Actual Output |
|-------|------|----------|-----------|--------|----------------|
| AC-ANDROID-001 | `doctor` 환경 부트스트랩 + `reset` 복원 | REQ-DOCTOR-001~005 | e2e·manual | PENDING | M6 범위, 미구현(this chunk 제외) |
| AC-ANDROID-002 | 원시 명령이 에뮬레이터에서 동작 | REQ-SCREENSHOT/INPUT/DUMP | e2e·manual | PARTIAL (mock CLI dispatch) | `tap`/`key`/`dump`/`screenshot` 명령이 `DeviceBackend`를 올바른 인자로 호출하고(mock), `dump`는 M2 정규화 함수로 정확히 통합됨을 검증. 실기기/에뮬레이터 e2e는 M4 이후 |
| AC-ANDROID-003 | 한글+이모지 입력 + IME 복원 | REQ-INPUT-003/004 | e2e·manual | PENDING | M5 범위, 미구현. 단 정규화 계층의 유니코드 무결성은 단위 테스트로 선검증됨(아래 참고) |
| AC-ANDROID-004 | 에뮬레이터+실기기 동시 — 격리 | REQ-DEVICES/MULTIDEV | e2e·manual | PENDING | M4/M7 범위, 미구현 |
| AC-ANDROID-005 | 멱등성 + 잔여 파일 없음 | REQ-IDEMP-001~003 | e2e·manual + mock | PENDING | M6/M7 범위, 미구현 |
| AC-ANDROID-006 | iOS-readiness: 스키마/interface가 idb 필드셋 수용 | REQ-SCHEMA-003, REQ-ARCH-003 | doc/design-review | **PASS** | `src/schema/common-element.ts` + `src/schema/device-backend.ts` 필드/메서드가 Android 전용 가정을 포함하지 않는 범용 string/boolean/number 타입으로 설계됨(design-review). plan.md §F.9/§F.9.1 매핑 표·파생 정책은 이미 plan-phase에 존재. 재설계 없이 idb 필드(AXLabel/AXUniqueId/frame/type-role) 수용 가능함을 확인 |
| AC-ANDROID-007 | 단일 `npx` 실행 | REQ-ARCH-005 | e2e·manual | PENDING | `bin.ts`가 아직 router에 연결되지 않음(M4에서 연결). e2e 검증은 실제 배포 후 |
| **AC-ANDROID-008** | **정규화 순수 함수: XML 픽스처 → 기대 JSON** | **REQ-SCHEMA-002/004** | **unit** | **PASS** | `pnpm vitest run` — 9/9 tests passed (see Evidence Commands below). `class→role`/`resource-id→id`/`text`\|`content-desc→text`/`bounds→{x,y,w,h}`/`clickable+enabled→tappable`/nested→`children` 매핑 전항목 검증 |
| **AC-ANDROID-009** | **`--device` 생략 + 다중 기기 → graceful failure** | **REQ-MULTIDEV-002** | **unit(mock) + e2e** | **PASS (unit/mock)** | `resolveTargetDevice()` + `runCli()` mock 테스트: 2대 이상 연결+`--device` 생략 시 `AMBIGUOUS_DEVICE` + 기기 목록 반환, 첫 기기 임의 선택 없음을 검증. e2e/manual 실기기 검증은 M4 이후 |
| AC-ANDROID-010 | 오류 경로에서도 원래 IME 복원 | REQ-INPUT-004, REQ-IDEMP-004 | unit(mock) + e2e | PENDING | M5 범위, 미구현 |
| AC-ANDROID-011 | `launch`/`stop`이 앱을 시작/강제종료 | REQ-APP-001/002 | e2e·manual | PARTIAL (mock CLI dispatch) | `runCli(["launch"/"stop", pkg])`가 `DeviceBackend.launchApp`/`stopApp`을 올바른 인자로 호출함을 mock으로 검증. 실제 adb argv(M4)·실기기 e2e는 아직 |
| **AC-ANDROID-012** | **모든 명령이 유효한 JSON in/out 방출** | **REQ-ARCH-001** | **unit(mock)** | **PASS** | `runCli()`의 모든 명령(devices/launch/stop/tap/key/dump/screenshot/text/doctor/미지정/미상 명령 포함)이 `JSON.parse(JSON.stringify(result))`에서 예외 없이 파싱됨을 검증. 오류도 JSON 봉투(`{ok:false, command, error:{code,message}}`)로 방출, 자유 텍스트 없음 |
| AC-ANDROID-013 | 스킬 래퍼에 직접 adb 호출 없음(greppable) | REQ-ARCH-004 | unit(grep) | PENDING | M8 범위(Claude 스킬 래퍼), 미구현 |
| AC-ANDROID-014 | 3계층 아키텍처 유지 | REQ-ARCH-002 | design-review | PARTIAL | CLI 계층(M3, `src/cli/*`)이 `DeviceBackend`(M1) 인터페이스에만 의존하고 adb argv를 직접 다루지 않음을 확인(commands/*는 backend 메서드만 호출). 정규화 계층(M2)도 독립. adb 래퍼(M4)가 아직 없어 전체 3계층 경계의 최종 확인은 보류 |
| AC-ANDROID-015 | IME 복원 실패 → 원래 IME id 보고 | REQ-ERR-001 | unit(mock) + e2e | PENDING | M5/M6 범위, 미구현 |
| AC-ANDROID-016 | ADBKeyBoard 설치 실패 → graceful 오류 | REQ-ERR-002 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |
| AC-ANDROID-017 | device offline/unauthorized → graceful 오류 | REQ-ERR-003 | unit(mock) + e2e | PENDING | M3/M4 범위, 미구현 |
| AC-ANDROID-018 | adb 데몬 미기동 → graceful + doctor health | REQ-ERR-004, REQ-DOCTOR-001 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |
| AC-ANDROID-019 | doctor adb 설치 OS별 안전 게이트 | REQ-DOCTOR-002 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |

**요약 (M0+M1+M2+M3 커밋 시점)**: 19건 중 PASS 3건(AC-006, AC-008, AC-009, AC-012 — 실제 4건), PARTIAL 3건(AC-002, AC-011, AC-014), PENDING 12건(M4-M8 후속 위임 범위). FAIL 0건. M3 커밋은 `DeviceBackend`(M1) 인터페이스만으로 mock-backend 테스트를 완성했으며, `bin.ts`는 아직 M0 스텁 상태(M4에서 실제 `AdbBackend`로 연결).

### Evidence Commands (verbatim, M3 커밋 시점 — M3 단독 트리 재현)

```
$ pnpm tsc --noEmit   (src/backend/ 제외, M3-only 트리)
(no output; exit=0)

$ pnpm vitest run
 Test Files  4 passed (4)
      Tests  53 passed (53)
```

전체(M0-M2 정규화 9 tests) 누적 evidence는 이전 커밋 로그 참고. M3 신규 테스트: device-targeting.test.ts(5) + router.test.ts(다수, devices/launch/stop/tap/key/dump/screenshot/text/doctor/routing-errors 커버) + validators.test.ts.

### 남은 범위 (후속 위임)

M4(adb 서브프로세스 래퍼) → M5(텍스트/IME) → M6(doctor/reset) → M7(다중 기기/멱등성) → M8(Claude 스킬 래퍼)는 이번 커밋에서 의도적으로 구현하지 않음(scope discipline). 각 청크는 별도 manager-develop 위임으로 진행된다.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase — manager-develop 소유>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase — manager-docs 소유>_
