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

### 진행된 마일스톤 (이번 청크)

- **M0 (scaffold)**: TypeScript(ESM) + pnpm + vitest 프로젝트 뼈대. `package.json`(`type:"module"`, `bin`/`files`/`exports` 설정), `tsconfig.json`+`tsconfig.build.json`, `vitest.config.ts`.
- **M1 (공통 요소 스키마 + device-backend interface)**: `src/schema/common-element.ts`(`CommonElement`/`ElementBounds`), `src/schema/device-backend.ts`(`DeviceBackend`/`DeviceInfo`) — REQ-SCHEMA-001/003, REQ-ARCH-002/003. `@MX:ANCHOR` 부착(REASON 포함).
- **M2 (정규화 계층, TDD)**: 커밋 2에서 진행 예정 (`src/normalize/uiautomator.ts`의 `normalizeUiAutomatorXml()` 순수 함수, RED→GREEN TDD 사이클).

### AC 매트릭스 — M1 커밋 시점 스냅샷 (§D 19건 전체 — 이번 커밋 범위 외 항목은 PENDING)

| AC ID | 요약 | 관련 REQ | 검증 방식 | Status | Actual Output |
|-------|------|----------|-----------|--------|----------------|
| AC-ANDROID-001 | `doctor` 환경 부트스트랩 + `reset` 복원 | REQ-DOCTOR-001~005 | e2e·manual | PENDING | M6 범위, 미구현(this chunk 제외) |
| AC-ANDROID-002 | 원시 명령이 에뮬레이터에서 동작 | REQ-SCREENSHOT/INPUT/DUMP | e2e·manual | PENDING | M4/M5 범위, 미구현 |
| AC-ANDROID-003 | 한글+이모지 입력 + IME 복원 | REQ-INPUT-003/004 | e2e·manual | PENDING | M5 범위, 미구현. 단 정규화 계층의 유니코드 무결성은 단위 테스트로 선검증됨(아래 참고) |
| AC-ANDROID-004 | 에뮬레이터+실기기 동시 — 격리 | REQ-DEVICES/MULTIDEV | e2e·manual | PENDING | M4/M7 범위, 미구현 |
| AC-ANDROID-005 | 멱등성 + 잔여 파일 없음 | REQ-IDEMP-001~003 | e2e·manual + mock | PENDING | M6/M7 범위, 미구현 |
| AC-ANDROID-006 | iOS-readiness: 스키마/interface가 idb 필드셋 수용 | REQ-SCHEMA-003, REQ-ARCH-003 | doc/design-review | **PASS** | `src/schema/common-element.ts` + `src/schema/device-backend.ts` 필드/메서드가 Android 전용 가정을 포함하지 않는 범용 string/boolean/number 타입으로 설계됨(design-review). plan.md §F.9/§F.9.1 매핑 표·파생 정책은 이미 plan-phase에 존재. 재설계 없이 idb 필드(AXLabel/AXUniqueId/frame/type-role) 수용 가능함을 확인 |
| AC-ANDROID-007 | 단일 `npx` 실행 | REQ-ARCH-005 | e2e·manual | PENDING | CLI 명령 표면(M3) 미구현. `package.json` `bin`/`files`/`exports` 스캐폴딩만 완료 |
| AC-ANDROID-008 | 정규화 순수 함수: XML 픽스처 → 기대 JSON | REQ-SCHEMA-002/004 | unit | PENDING | M2 범위 — 이 커밋(M1)에는 스키마/interface만 존재, 정규화 함수는 다음 커밋에서 TDD로 구현 예정 |
| AC-ANDROID-009 | `--device` 생략 + 다중 기기 → graceful failure | REQ-MULTIDEV-002 | unit(mock) + e2e | PENDING | M3/M7 범위, 미구현 |
| AC-ANDROID-010 | 오류 경로에서도 원래 IME 복원 | REQ-INPUT-004, REQ-IDEMP-004 | unit(mock) + e2e | PENDING | M5 범위, 미구현 |
| AC-ANDROID-011 | `launch`/`stop`이 앱을 시작/강제종료 | REQ-APP-001/002 | e2e·manual | PENDING | M4 범위, 미구현 |
| AC-ANDROID-012 | 모든 명령이 유효한 JSON in/out 방출 | REQ-ARCH-001 | unit(mock) | PARTIAL | CLI 명령 표면(M3) 미구현. 단 placeholder `src/cli/bin.ts` 스텁이 유효 JSON을 방출함을 스모크 테스트로 확인(`node dist/cli/bin.js` → 유효 JSON, exit=1) — 실제 명령 계약 검증은 M3에서 완료 |
| AC-ANDROID-013 | 스킬 래퍼에 직접 adb 호출 없음(greppable) | REQ-ARCH-004 | unit(grep) | PENDING | M8 범위(Claude 스킬 래퍼), 미구현 |
| AC-ANDROID-014 | 3계층 아키텍처 유지 | REQ-ARCH-002 | design-review | PENDING | 정규화 계층(M2)·CLI 계층(M3)·adb 래퍼(M4)가 아직 없어 3계층 경계 확인은 보류 |
| AC-ANDROID-015 | IME 복원 실패 → 원래 IME id 보고 | REQ-ERR-001 | unit(mock) + e2e | PENDING | M5/M6 범위, 미구현 |
| AC-ANDROID-016 | ADBKeyBoard 설치 실패 → graceful 오류 | REQ-ERR-002 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |
| AC-ANDROID-017 | device offline/unauthorized → graceful 오류 | REQ-ERR-003 | unit(mock) + e2e | PENDING | M3/M4 범위, 미구현 |
| AC-ANDROID-018 | adb 데몬 미기동 → graceful + doctor health | REQ-ERR-004, REQ-DOCTOR-001 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |
| AC-ANDROID-019 | doctor adb 설치 OS별 안전 게이트 | REQ-DOCTOR-002 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |

**요약 (M1 커밋 시점)**: 19건 중 PASS 1건(AC-006), PARTIAL 1건(AC-012), PENDING 17건(M2-M8 후속 범위). FAIL 0건. M2 커밋에서 AC-008이 PASS로 갱신될 예정.

### Evidence Commands (verbatim, M1 커밋 시점)

```
$ pnpm tsc --noEmit
(no output; exit=0)

$ pnpm build
(exit=0; dist/index.js, dist/cli/bin.js, dist/schema/*.js emitted)

$ node dist/cli/bin.js
{"status":"not_implemented","message":"...M1/M2 only."}
(exit=1 — placeholder stub, valid JSON confirmed)
```

### 남은 범위 (후속 위임)

M3(CLI 명령 표면) → M4(adb 서브프로세스 래퍼) → M5(텍스트/IME) → M6(doctor/reset) → M7(다중 기기/멱등성) → M8(Claude 스킬 래퍼)는 이번 청크에서 의도적으로 구현하지 않음(scope discipline). 각 청크는 별도 manager-develop 위임으로 진행된다.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase — manager-develop 소유>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase — manager-docs 소유>_
