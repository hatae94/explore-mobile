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

> Run-phase는 M0(scaffold)부터 진행 중(in-progress). M5-M8은 후속 위임(future delegation) 범위이며 이번 청크(M3+M4)에서 구현하지 않는다. 아래 매트릭스는 누적 로그로, 이후 M5-M8 청크가 해당 행을 갱신한다.

### 진행된 마일스톤 (누적)

- **M0 (scaffold)**: TypeScript(ESM) + pnpm + vitest 프로젝트 뼈대. `package.json`(`type:"module"`, `bin`/`files`/`exports` 설정), `tsconfig.json`+`tsconfig.build.json`, `vitest.config.ts`.
- **M1 (공통 요소 스키마 + device-backend interface)**: `src/schema/common-element.ts`(`CommonElement`/`ElementBounds`), `src/schema/device-backend.ts`(`DeviceBackend`/`DeviceInfo`) — REQ-SCHEMA-001/003, REQ-ARCH-002/003. `@MX:ANCHOR` 부착(REASON 포함).
- **M2 (정규화 계층, TDD)**: `src/normalize/uiautomator.ts`의 `normalizeUiAutomatorXml()` 순수 함수. RED(테스트 작성, 모듈 부재로 실패 확인) → GREEN(구현, 9/9 통과) → 커버리지 측정(92.1% stmt) 완료. REQ-SCHEMA-002/004, REQ-DUMP-002. `src/index.ts` 배럴 export 추가.
- **M3 (CLI 명령 라우터 + JSON in/out 계약, TDD)**: `src/cli/router.ts`(`runCli`), `src/cli/commands/*`(devices/launch/stop/tap/key/dump/screenshot + text/doctor/reset 스텁), `src/cli/envelope.ts`(SUCCESS/ERROR JSON 봉투), `src/cli/device-targeting.ts`(`resolveTargetDevice` — REQ-MULTIDEV-001/002), `src/cli/args.ts`(`node:util parseArgs` 기반), `src/cli/validators.ts`, `src/schema/key-alias.ts`. **`DeviceBackend`(M1) 인터페이스만 의존 — 실제 adb 래퍼(M4) 없이 mock backend로 전 커맨드 테스트 완료**(3계층 경계: CLI가 adb argv를 직접 다루지 않음을 이 커밋 자체가 증명). RED(router.test.ts가 `./router.js` 부재로 실패 확인) → GREEN(53/53 통과, M3 단독 트리 검증) 완료. REQ-ARCH-001, REQ-MULTIDEV-001/002.
- **M4 (adb 서브프로세스 래퍼 + 무상태 원시 명령, TDD)**: `src/backend/adb-executor.ts`(`AdbExecutor` 타입 + `spawnAdb` — `child_process.spawn` argv 배열, `shell` 옵션 미사용으로 shell injection 원천 차단), `src/backend/device-list-parser.ts`(`parseAdbDevicesList` 순수 함수), `src/backend/keycodes.ts`(REQ-INPUT-005 KEYCODE 매핑), `src/backend/adb-backend.ts`(`AdbBackend implements DeviceBackend`). `listDevices`(`adb devices -l` → 기기별 `getprop ro.build.version.release`), `dumpUiHierarchy`(`uiautomator dump` → `exec-out cat` 스트리밍 → `rm -f` 정리, REQ-IDEMP-003), `screenshot`(`exec-out screencap -p`), `tap`/`sendKeyEvent`/`launchApp`(`am start -a MAIN -c LAUNCHER -p`)/`stopApp`(`am force-stop`) 전부 구현. `src/cli/bin.ts`를 `runCli`+`AdbBackend`로 실제 연결(M0 스텁 → 실동작). RED(adb-backend.test.ts가 `./adb-backend.js` 부재로 실패 확인) → GREEN(전체 73/73 통과) → 커버리지 갭 보강(branch coverage 79%→93%) 완료. REQ-DEVICES-001/002, REQ-APP-001/002, REQ-SCREENSHOT-001/002, REQ-INPUT-001/005, REQ-DUMP-001/002.

### AC 매트릭스 — M4 커밋 시점 (최종, 이번 청크 완료) — §D 19건 전체, M5-M8 범위 외 항목은 PENDING

| AC ID | 요약 | 관련 REQ | 검증 방식 | Status | Actual Output |
|-------|------|----------|-----------|--------|----------------|
| AC-ANDROID-001 | `doctor` 환경 부트스트랩 + `reset` 복원 | REQ-DOCTOR-001~005 | e2e·manual | PENDING | M6 범위, 미구현(this chunk 제외) |
| AC-ANDROID-002 | 원시 명령이 에뮬레이터에서 동작 | REQ-SCREENSHOT/INPUT/DUMP | e2e·manual | PARTIAL (unit+mock adb argv 완료) | `tap`/`key`/`dump`/`screenshot`/`launch`/`stop` CLI 디스패치(M3) + `AdbBackend`의 정확한 adb argv 구성(M4, `-s <serial> shell input tap <x> <y>` 등)을 mock `AdbExecutor`로 검증. `dump`는 실제 XML→정규화(M2) 통합까지 end-to-end mock 검증 완료. 실기기/에뮬레이터 e2e만 남음(체크박스 상태 토글, PNG 매직바이트 등 실제 관찰) |
| AC-ANDROID-003 | 한글+이모지 입력 + IME 복원 | REQ-INPUT-003/004 | e2e·manual | PENDING | M5 범위, 미구현. 단 정규화 계층의 유니코드 무결성은 단위 테스트로 선검증됨(아래 참고) |
| AC-ANDROID-004 | 에뮬레이터+실기기 동시 — 격리 | REQ-DEVICES/MULTIDEV | e2e·manual | PARTIAL (unit+mock) | `parseAdbDevicesList`가 emulator(`emulator-` prefix)/physical을 정확히 구분하고, `--device <serial>`로 각 기기를 독립 대상 지정함을 mock으로 검증. 기기별 상태(IME/임시 리소스) serial 격리는 M7 범위(REQ-MULTIDEV-003/004, 아직 상태 저장소 없음) |
| AC-ANDROID-005 | 멱등성 + 잔여 파일 없음 | REQ-IDEMP-001~003 | e2e·manual + mock | PENDING | M6/M7 범위, 미구현 |
| AC-ANDROID-006 | iOS-readiness: 스키마/interface가 idb 필드셋 수용 | REQ-SCHEMA-003, REQ-ARCH-003 | doc/design-review | **PASS** | `src/schema/common-element.ts` + `src/schema/device-backend.ts` 필드/메서드가 Android 전용 가정을 포함하지 않는 범용 string/boolean/number 타입으로 설계됨(design-review). plan.md §F.9/§F.9.1 매핑 표·파생 정책은 이미 plan-phase에 존재. 재설계 없이 idb 필드(AXLabel/AXUniqueId/frame/type-role) 수용 가능함을 확인 |
| AC-ANDROID-007 | 단일 `npx` 실행 | REQ-ARCH-005 | e2e·manual | PARTIAL | `bin.ts`가 이제 `runCli`+`AdbBackend`로 실제 연결됨(`node dist/cli/bin.js devices` → adb 부재 환경에서도 안전한 JSON 오류, 크래시 없음을 스모크 테스트로 확인). 실제 `npx` 배포/설치 e2e는 npm 게시 후 |
| **AC-ANDROID-008** | **정규화 순수 함수: XML 픽스처 → 기대 JSON** | **REQ-SCHEMA-002/004** | **unit** | **PASS** | `pnpm vitest run` — 9/9 tests passed (see Evidence Commands below). `class→role`/`resource-id→id`/`text`\|`content-desc→text`/`bounds→{x,y,w,h}`/`clickable+enabled→tappable`/nested→`children` 매핑 전항목 검증 |
| **AC-ANDROID-009** | **`--device` 생략 + 다중 기기 → graceful failure** | **REQ-MULTIDEV-002** | **unit(mock) + e2e** | **PASS (unit/mock)** | `resolveTargetDevice()` + `runCli()` mock 테스트: 2대 이상 연결+`--device` 생략 시 `AMBIGUOUS_DEVICE` + 기기 목록 반환, 첫 기기 임의 선택 없음을 검증. e2e/manual 실기기 검증은 M4 이후 |
| AC-ANDROID-010 | 오류 경로에서도 원래 IME 복원 | REQ-INPUT-004, REQ-IDEMP-004 | unit(mock) + e2e | PENDING | M5 범위, 미구현 |
| AC-ANDROID-011 | `launch`/`stop`이 앱을 시작/강제종료 | REQ-APP-001/002 | e2e·manual | PARTIAL (unit+mock adb argv 완료) | `runCli(["launch"/"stop", pkg])` → `AdbBackend.launchApp`(`am start -a MAIN -c LAUNCHER -p <pkg>`)/`stopApp`(`am force-stop <pkg>`) 정확한 argv를 mock `AdbExecutor`로 검증. 실기기 관찰(포그라운드 전환/force-stop 확인) e2e만 남음 |
| **AC-ANDROID-012** | **모든 명령이 유효한 JSON in/out 방출** | **REQ-ARCH-001** | **unit(mock)** | **PASS** | `runCli()`의 모든 명령(devices/launch/stop/tap/key/dump/screenshot/text/doctor/미지정/미상 명령 포함)이 `JSON.parse(JSON.stringify(result))`에서 예외 없이 파싱됨을 검증. 오류도 JSON 봉투(`{ok:false, command, error:{code,message}}`)로 방출, 자유 텍스트 없음 |
| AC-ANDROID-013 | 스킬 래퍼에 직접 adb 호출 없음(greppable) | REQ-ARCH-004 | unit(grep) | PENDING | M8 범위(Claude 스킬 래퍼), 미구현 |
| AC-ANDROID-014 | 3계층 아키텍처 유지 | REQ-ARCH-002 | design-review | **PASS (design-review)** | 3계층 확인 완료: CLI 계층(`src/cli/*`)은 `DeviceBackend`(M1) 인터페이스에만 의존(commands/*가 backend 메서드만 호출, adb argv 미포함) → 정규화 계층(`src/normalize/uiautomator.ts`)은 `src/schema/*`만 import, CLI/adb 무의존 → adb 래퍼(`src/backend/adb-backend.ts`)가 `DeviceBackend`를 구현하며 실제 adb argv 구성을 캡슐화. 계층 간 역방향 의존 없음(design-review로 import 그래프 확인) |
| AC-ANDROID-015 | IME 복원 실패 → 원래 IME id 보고 | REQ-ERR-001 | unit(mock) + e2e | PENDING | M5/M6 범위, 미구현 |
| AC-ANDROID-016 | ADBKeyBoard 설치 실패 → graceful 오류 | REQ-ERR-002 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |
| AC-ANDROID-017 | device offline/unauthorized → graceful 오류 | REQ-ERR-003 | unit(mock) + e2e | PARTIAL (파싱 데이터 준비 완료) | `parseAdbDevicesList`가 offline/unauthorized 상태를 정확히 파싱하고 `DeviceInfo.connectionState`로 전달함을 검증. 이 상태를 근거로 한 graceful 오류 반환(REQ-ERR-003 본문 동작)은 M6 오류 처리 정책과 함께 완성 예정 |
| AC-ANDROID-018 | adb 데몬 미기동 → graceful + doctor health | REQ-ERR-004, REQ-DOCTOR-001 | unit(mock) + e2e | PENDING | M6 범위, 미구현. 단 `AdbBackend`가 adb 자체 부재(`spawn adb ENOENT`) 시에도 크래시 없이 JSON 오류로 감싸짐을 스모크 테스트로 확인(일반 방어 계층) |
| AC-ANDROID-019 | doctor adb 설치 OS별 안전 게이트 | REQ-DOCTOR-002 | unit(mock) + e2e | PENDING | M6 범위, 미구현 |

**요약 (M0-M4 커밋 완료 시점)**: 19건 중 PASS 5건(AC-006, AC-008, AC-009, AC-012, AC-014), PARTIAL 5건(AC-002, AC-004, AC-007, AC-011, AC-017), PENDING 9건(M5-M8 후속 위임 범위). FAIL 0건. 이번 청크에서 시도된 항목 중 미검증 상태는 없음(verification-claim-integrity 원칙 준수 — 미구현 항목은 PASS로 주장하지 않고 PENDING/PARTIAL로 정확히 구분).

### Evidence Commands (verbatim, M4 커밋 완료 — 전체 트리)

```
$ pnpm tsc --noEmit
(no output; exit=0)

$ pnpm vitest run --reporter=verbose
 Test Files  6 passed (6)
      Tests  73 passed (73)
 (normalize 9 + device-targeting 5 + device-list-parser 6 + adb-backend 14
  + router 34 + validators 5 — see individual test files for full titles)

$ pnpm vitest run --coverage
Statements   : 96.92% ( 221/228 )
Branches     : 93.12% ( 122/131 )
Functions    : 100% ( 38/38 )
Lines        : 99.51% ( 206/207 )
(threshold: 85%+ per acceptance.md §D.2 — MET, all four dimensions)

$ pnpm build
(exit=0; dist/{index,cli/bin,cli/router,cli/commands/*,cli/*,backend/*,
 schema/*,normalize/uiautomator}.js emitted)

$ node dist/cli/bin.js devices     (adb absent on this dev machine — real-world worst case)
{"ok":false,"command":"devices","error":{"code":"INTERNAL_ERROR","message":"spawn adb ENOENT"}}
(exit=1 — graceful JSON, no crash, no stack trace, confirms REQ-ARCH-001 holds even without adb installed)

$ node dist/cli/bin.js frobnicate
{"ok":false,"command":"frobnicate","error":{"code":"UNKNOWN_COMMAND","message":"Unknown command 'frobnicate'. Supported: devices, launch, stop, screenshot, tap, key, dump, text, doctor, reset."}}

$ node dist/cli/bin.js text hello
{"ok":false,"command":"text","error":{"code":"NOT_IMPLEMENTED","message":"'text' is implemented in SPEC-ANDROID-001 milestone M5 (REQ-INPUT-002/003/004 — Unicode/IME input path)."}}
```

### 남은 범위 (후속 위임)

M5(텍스트/IME) → M6(doctor/reset) → M7(다중 기기/멱등성) → M8(Claude 스킬 래퍼)는 이번 청크(M3+M4)에서 의도적으로 구현하지 않음(scope discipline). `AdbBackend.inputText()`는 명시적으로 "M5 not yet implemented" Error를 throw하고, CLI `text`/`doctor`/`reset` 명령은 NOT_IMPLEMENTED JSON을 반환하도록 스텁 처리됨. 각 후속 청크는 별도 manager-develop 위임으로 진행된다.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase — manager-develop 소유>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase — manager-docs 소유>_
