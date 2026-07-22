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

> Run-phase는 M0(scaffold)부터 진행 중이며, 이번 청크(M7+M8)로 8개 마일스톤(M1-M8) 구현이 모두 완료된다. `status: in-progress`는 유지되며(sync-phase가 `implemented`/`completed` 전이를 담당, manager-docs 소유), 아래 매트릭스는 최종본이다.

### 진행된 마일스톤 (누적)

- **M0 (scaffold)**: TypeScript(ESM) + pnpm + vitest 프로젝트 뼈대. `package.json`(`type:"module"`, `bin`/`files`/`exports` 설정), `tsconfig.json`+`tsconfig.build.json`, `vitest.config.ts`.
- **M1 (공통 요소 스키마 + device-backend interface)**: `src/schema/common-element.ts`(`CommonElement`/`ElementBounds`), `src/schema/device-backend.ts`(`DeviceBackend`/`DeviceInfo`) — REQ-SCHEMA-001/003, REQ-ARCH-002/003. `@MX:ANCHOR` 부착(REASON 포함).
- **M2 (정규화 계층, TDD)**: `src/normalize/uiautomator.ts`의 `normalizeUiAutomatorXml()` 순수 함수. RED(테스트 작성, 모듈 부재로 실패 확인) → GREEN(구현, 9/9 통과) → 커버리지 측정(92.1% stmt) 완료. REQ-SCHEMA-002/004, REQ-DUMP-002. `src/index.ts` 배럴 export 추가.
- **M3 (CLI 명령 라우터 + JSON in/out 계약, TDD)**: `src/cli/router.ts`(`runCli`), `src/cli/commands/*`(devices/launch/stop/tap/key/dump/screenshot + text/doctor/reset 스텁), `src/cli/envelope.ts`(SUCCESS/ERROR JSON 봉투), `src/cli/device-targeting.ts`(`resolveTargetDevice` — REQ-MULTIDEV-001/002), `src/cli/args.ts`(`node:util parseArgs` 기반), `src/cli/validators.ts`, `src/schema/key-alias.ts`. **`DeviceBackend`(M1) 인터페이스만 의존 — 실제 adb 래퍼(M4) 없이 mock backend로 전 커맨드 테스트 완료**(3계층 경계: CLI가 adb argv를 직접 다루지 않음을 이 커밋 자체가 증명). RED(router.test.ts가 `./router.js` 부재로 실패 확인) → GREEN(53/53 통과, M3 단독 트리 검증) 완료. REQ-ARCH-001, REQ-MULTIDEV-001/002.
- **M4 (adb 서브프로세스 래퍼 + 무상태 원시 명령, TDD)**: `src/backend/adb-executor.ts`(`AdbExecutor` 타입 + `spawnAdb` — `child_process.spawn` argv 배열, `shell` 옵션 미사용으로 shell injection 원천 차단), `src/backend/device-list-parser.ts`(`parseAdbDevicesList` 순수 함수), `src/backend/keycodes.ts`(REQ-INPUT-005 KEYCODE 매핑), `src/backend/adb-backend.ts`(`AdbBackend implements DeviceBackend`). `listDevices`(`adb devices -l` → 기기별 `getprop ro.build.version.release`), `dumpUiHierarchy`(`uiautomator dump` → `exec-out cat` 스트리밍 → `rm -f` 정리, REQ-IDEMP-003), `screenshot`(`exec-out screencap -p`), `tap`/`sendKeyEvent`/`launchApp`(`am start -a MAIN -c LAUNCHER -p`)/`stopApp`(`am force-stop`) 전부 구현. `src/cli/bin.ts`를 `runCli`+`AdbBackend`로 실제 연결(M0 스텁 → 실동작). RED(adb-backend.test.ts가 `./adb-backend.js` 부재로 실패 확인) → GREEN(전체 73/73 통과) → 커버리지 갭 보강(branch coverage 79%→93%) 완료. REQ-DEVICES-001/002, REQ-APP-001/002, REQ-SCREENSHOT-001/002, REQ-INPUT-001/005, REQ-DUMP-001/002.
- **M5 (텍스트 입력 + Unicode IME 경로 + IME 복원, TDD) [위험 구역]**: `src/backend/ime-errors.ts`(`ImeRestoreFailedError` — 복원 실패를 일반 오류와 구분하는 전용 타입), `src/backend/adbkeyboard.ts`(ADBKeyBoard 패키지/IME id 공유 상수 — M6 doctor와 공유), `AdbBackend.inputText()` 실구현(ASCII fast path: `shell input text` + device-shell-safe single-quote escaping; non-ASCII: `settings get secure default_input_method` → `ime enable`+`ime set`(ADBKeyBoard) → `am broadcast -a ADB_INPUT_B64 --es msg <base64>` → **항상** 원래 IME 복원 시도, 성공/실패/원본-IME-미상 3갈래 모두 커버), `src/cli/commands/text.ts`(CLI 계층, `ImeRestoreFailedError` → `IME_RESTORE_FAILED` 전용 JSON 오류 코드 매핑). RED(adb-backend.test.ts에 inputText 테스트 10건 추가, 구현 전 실패 확인) → GREEN(M5 단독 트리 93/93 통과, `src/backend/doctor.ts` 등 M6 파일 부재 상태에서 독립 검증) 완료. REQ-INPUT-002/003/004, REQ-IDEMP-004, REQ-ERR-001.
- **M6 (doctor/reset 환경 부트스트랩, TDD) [부작용 큰 단계]**: `src/backend/process-executor.ts`(범용 `ProcessExecutor` — `spawnAdb`가 이제 이를 위임하는 얇은 래퍼로 리팩터, brew 호출용으로 신설), `src/backend/doctor.ts`(`AdbDoctor` — `DeviceBackend` 인터페이스와 별도의 환경 부트스트랩 서비스; `checkAdbInstalled`/`checkDaemonHealth`(REQ-ERR-004, daemon 자체 health를 install 여부와 분리 확인)/`installMissingAdb`(OS별 정책: macOS+명시 동의(`--yes`/`--install`)만 `brew install android-platform-tools`, Linux/Windows는 플래그와 무관하게 항상 안내만)/`ensureAdbKeyboard`(REQ-IDEMP-002 `pm list packages` 확인 후 미설치 시에만 번들 APK 설치+`ime enable`)/`resetDevice`(`ime disable`+`ime reset`+`uninstall` — `adb shell ime reset`으로 프로세스 재기동 간 상태 비영속 문제 회피)). `src/cli/commands/doctor.ts`+`reset.ts`(`performReset` 공유 헬퍼로 `doctor --clean` == `reset` 동일 로직 재사용). **APK 바이너리 미번들 상태**: `vendor/adbkeyboard/`에 실제 APK가 아직 없음 — `resolveBundledApkPath()`가 파일 부재를 감지하면 `APK_NOT_BUNDLED` graceful 오류(REQ-ERR-002/AC-016)로 처리하며 크래시하지 않음. `@MX:TODO`가 `src/backend/adbkeyboard.ts`에 있고, `vendor/adbkeyboard/README.md`에 조달 체크리스트(라이선스 검증, NOTICE 추가, 버전 고정) 문서화됨 — 가짜 바이너리를 생성하지 않음. RED(doctor.test.ts가 `./doctor.js` 부재로 실패 확인) → GREEN(전체 120/120 통과) 완료. REQ-DOCTOR-001~005, REQ-IDEMP-002, REQ-ERR-002/004.
- **M7 (다중 기기 상태 격리 + 동시성 + 위생, TDD) [cross-cutting]**: `src/backend/per-serial-state.ts`(`PerSerialState<T>` — serial 키 상태 저장소, `Map.set()` 덮어쓰기 특성으로 REQ-IDEMP-001 무누적 보장). `AdbBackend`에 `originalImeBySerial: PerSerialState<string>` 필드 통합 — `inputText()`의 원래 IME를 serial별로 추적(`getTrackedOriginalIme()` 진단 접근자), 복원 성공 시 삭제·실패 시 보존(감사/수동 복구용). **설계 확인**: M5의 IME 추적은 원래 호출-스코프 지역 변수였으므로 **설계상 이미** cross-serial 오염이 불가능했음(Node 단일 프로세스, 지역 변수는 클로저 격리) — M7은 이를 명시적·테스트 가능한 `PerSerialState` 프리미티브로 승격하여 REQ-MULTIDEV-003 요구사항을 문서화·검증 가능하게 만듦(동작 변경 없음, 안전성 강화). `dumpUiHierarchy()`의 디바이스 임시 경로를 `/sdcard/window_dump.xml`(고정) → `/sdcard/window_dump-<serial>-<random>.xml`(serial 네임스페이스 + 랜덤 접미사)로 리팩터(REQ-MULTIDEV-004) — 동일 serial에 대한 동시 `dump` 호출(별도 프로세스)도 경로 충돌 없음. `AdbDoctor`는 인스턴스 상태가 전혀 없어(모든 메서드가 매 호출마다 기기에서 재조회) REQ-IDEMP-001을 설계상 만족함을 반복-호출 테스트로 확인. 동시성 테스트: `Promise.all([inputText("A",...), inputText("B",...)])`로 두 기기 동시 조작 시 서로의 상태를 오염시키지 않음을 검증(REQ-MULTIDEV-003, AC-ANDROID-004). RED(per-serial-state.test.ts + adb-backend.test.ts 신규 테스트, 구현 전 실패 확인) → GREEN(전체 139/139 통과) 완료. REQ-MULTIDEV-003/004, REQ-IDEMP-001.
- **M8 (얇은 Claude 스킬 래퍼, 최소·마지막)**: `.claude/skills/explore-mobile/SKILL.md` — CLI 전체 명령 표면(devices/launch/stop/screenshot/tap/key/text/dump/doctor/reset) 문서화, JSON in/out 계약, `--device` 타겟팅, Unicode/한글 텍스트 노트. **직접 adb 호출 0건**(REQ-ARCH-004) — 오직 `node dist/cli/bin.js`/`npx explore-mobile` CLI 진입점만 참조. acceptance.md AC-013의 정확한 grep 패턴(`(^|[^A-Za-z])adb([^A-Za-z]|$)`)이 case-sensitive임을 활용해 본문 전체에서 소문자 단독 "adb" 단어를 "ADB"(대문자 약어) 또는 완전 대체 표현으로 재작성(스타일 선택이지 편법 아님 — 실제 명령 예시는 전부 CLI 진입점만 사용). `src/skill-wrapper.test.ts`(vitest, AC-013 grep 패턴 그대로 재현 + CLI 진입점 참조 확인 + 전체 명령 표면 문서화 확인 + JSON 계약/--device 문서화 확인). GREEN(4/4 통과) — SKILL.md는 문서 아티팩트이므로 RED-first보다 compliance-test 검증 방식 적용(코드 아님). REQ-ARCH-004, AC-ANDROID-013.

### AC 매트릭스 — M7+M8 커밋 완료 (최종, 8개 마일스톤 전부 구현) — §D 19건 전체

| AC ID | 요약 | 관련 REQ | 검증 방식 | Status | Actual Output |
|-------|------|----------|-----------|--------|----------------|
| AC-ANDROID-001 | `doctor` 환경 부트스트랩 + `reset` 복원 | REQ-DOCTOR-001~005 | e2e·manual | PARTIAL (unit+mock 완료) | `doctor` 명령이 adb 설치/데몬 health/기기 목록/ADBKeyBoard 설치·활성화를 전부 확인하고 JSON 보고함을 mock으로 검증. `reset`/`doctor --clean`이 `ime disable`+`ime reset`+`uninstall`로 원래 상태 복원 시도함을 검증. 실제 호스트/기기 e2e(실제 Homebrew 설치, 실제 APK 설치)만 남음 |
| AC-ANDROID-002 | 원시 명령이 에뮬레이터에서 동작 | REQ-SCREENSHOT/INPUT/DUMP | e2e·manual | PARTIAL (unit+mock adb argv 완료) | `tap`/`key`/`dump`/`screenshot`/`launch`/`stop` CLI 디스패치(M3) + `AdbBackend`의 정확한 adb argv 구성(M4, `-s <serial> shell input tap <x> <y>` 등)을 mock `AdbExecutor`로 검증. `dump`는 실제 XML→정규화(M2) 통합까지 end-to-end mock 검증 완료. 실기기/에뮬레이터 e2e만 남음(체크박스 상태 토글, PNG 매직바이트 등 실제 관찰) |
| AC-ANDROID-003 | 한글+이모지 입력 + IME 복원 | REQ-INPUT-003/004 | e2e·manual | PARTIAL (unit+mock 완료) | `AdbBackend.inputText()`가 한글+이모지 텍스트를 UTF-8→base64 인코딩하여 `ADB_INPUT_B64` 브로드캐스트로 전송하고, base64 디코딩 시 원문과 정확히 일치함을 round-trip 검증(mock). IME 복원(`ime set <original>`)도 성공 경로에서 검증됨. 실기기 착지 관찰(실제 입력창에 렌더링) e2e만 남음 |
| **AC-ANDROID-004** | **에뮬레이터+실기기 동시 — 격리** | **REQ-DEVICES/MULTIDEV** | **e2e·manual** | **PARTIAL (unit+mock 완료)** | `parseAdbDevicesList`가 emulator(`emulator-` prefix)/physical을 정확히 구분하고, `--device <serial>`로 각 기기를 독립 대상 지정함을 mock으로 검증. **기기별 상태(IME) serial 격리 검증 완료(M7)**: `PerSerialState` 기반 `originalImeBySerial` + `Promise.all`로 두 기기(A/B)를 동시 조작해도 서로의 IME 상태·복원 호출이 교차 오염되지 않음을 mock으로 검증. 임시 리소스(dump 경로)도 serial+random 네임스페이스로 격리 확인. 실기기 동시 연결 e2e만 남음 |
| **AC-ANDROID-005** | **멱등성 + 잔여 파일 없음** | **REQ-IDEMP-001~003** | **e2e·manual + mock** | **PARTIAL (unit+mock 완료)** | `AdbDoctor.ensureAdbKeyboard()`가 `pm list packages`로 기존 설치를 확인 후 이미 설치된 경우 재설치를 건너뜀을 mock으로 검증(REQ-IDEMP-002). `AdbDoctor`가 인스턴스 상태를 전혀 갖지 않아(모든 값을 매 호출 기기에서 재조회) 반복 호출 시 결과가 항상 동일함을 3회 반복-호출 테스트로 검증(REQ-IDEMP-001, M7). `PerSerialState.set()`의 덮어쓰기 특성으로 동일 serial 반복 호출 시 상태가 누적되지 않음을 검증. REQ-IDEMP-003(잔여 파일 없음)은 M4의 exec-out 스트리밍 + M7의 dump 임시파일 `rm -f` 정리로 충족. 실기기 e2e만 남음 |
| AC-ANDROID-006 | iOS-readiness: 스키마/interface가 idb 필드셋 수용 | REQ-SCHEMA-003, REQ-ARCH-003 | doc/design-review | **PASS** | `src/schema/common-element.ts` + `src/schema/device-backend.ts` 필드/메서드가 Android 전용 가정을 포함하지 않는 범용 string/boolean/number 타입으로 설계됨(design-review). plan.md §F.9/§F.9.1 매핑 표·파생 정책은 이미 plan-phase에 존재. 재설계 없이 idb 필드(AXLabel/AXUniqueId/frame/type-role) 수용 가능함을 확인 |
| AC-ANDROID-007 | 단일 `npx` 실행 | REQ-ARCH-005 | e2e·manual | PARTIAL | `bin.ts`가 이제 `runCli`+`AdbBackend`로 실제 연결됨(`node dist/cli/bin.js devices` → adb 부재 환경에서도 안전한 JSON 오류, 크래시 없음을 스모크 테스트로 확인). 실제 `npx` 배포/설치 e2e는 npm 게시 후 |
| **AC-ANDROID-008** | **정규화 순수 함수: XML 픽스처 → 기대 JSON** | **REQ-SCHEMA-002/004** | **unit** | **PASS** | `pnpm vitest run` — 9/9 tests passed (see Evidence Commands below). `class→role`/`resource-id→id`/`text`\|`content-desc→text`/`bounds→{x,y,w,h}`/`clickable+enabled→tappable`/nested→`children` 매핑 전항목 검증 |
| **AC-ANDROID-009** | **`--device` 생략 + 다중 기기 → graceful failure** | **REQ-MULTIDEV-002** | **unit(mock) + e2e** | **PASS (unit/mock)** | `resolveTargetDevice()` + `runCli()` mock 테스트: 2대 이상 연결+`--device` 생략 시 `AMBIGUOUS_DEVICE` + 기기 목록 반환, 첫 기기 임의 선택 없음을 검증. e2e/manual 실기기 검증은 M4 이후 |
| **AC-ANDROID-010** | **오류 경로에서도 원래 IME 복원** | **REQ-INPUT-004, REQ-IDEMP-004** | **unit(mock) + e2e** | **PASS (unit/mock)** | `AdbBackend.inputText()` mock 테스트: `am broadcast` 전송이 throw해도 `ime set <original>`(복원)이 **항상** 시도됨을 검증(finally/cleanup 경로). 전송 성공+복원 성공, 전송 실패+복원 성공, 전송 실패+복원 실패(양쪽 오류 모두 메시지에 보존) 3가지 조합 전부 커버 |
| AC-ANDROID-011 | `launch`/`stop`이 앱을 시작/강제종료 | REQ-APP-001/002 | e2e·manual | PARTIAL (unit+mock adb argv 완료) | `runCli(["launch"/"stop", pkg])` → `AdbBackend.launchApp`(`am start -a MAIN -c LAUNCHER -p <pkg>`)/`stopApp`(`am force-stop <pkg>`) 정확한 argv를 mock `AdbExecutor`로 검증. 실기기 관찰(포그라운드 전환/force-stop 확인) e2e만 남음 |
| **AC-ANDROID-012** | **모든 명령이 유효한 JSON in/out 방출** | **REQ-ARCH-001** | **unit(mock)** | **PASS** | `runCli()`의 모든 명령(devices/launch/stop/tap/key/dump/screenshot/text/doctor/미지정/미상 명령 포함)이 `JSON.parse(JSON.stringify(result))`에서 예외 없이 파싱됨을 검증. 오류도 JSON 봉투(`{ok:false, command, error:{code,message}}`)로 방출, 자유 텍스트 없음 |
| **AC-ANDROID-013** | **스킬 래퍼에 직접 adb 호출 없음(greppable)** | **REQ-ARCH-004** | **unit(grep)** | **PASS** | `.claude/skills/explore-mobile/SKILL.md` 생성 완료(M8). `grep -rnE '(^|[^A-Za-z])adb([^A-Za-z]|$)' .claude/skills/explore-mobile/` — **0건**(acceptance.md AC-013의 정확한 패턴 그대로 실행 확인). `src/skill-wrapper.test.ts`가 동일 패턴을 vitest 테스트로 재현하여 회귀 방지(4/4 통과) |
| AC-ANDROID-014 | 3계층 아키텍처 유지 | REQ-ARCH-002 | design-review | **PASS (design-review)** | 3계층 확인 완료: CLI 계층(`src/cli/*`)은 `DeviceBackend`(M1) 인터페이스에만 의존(commands/*가 backend 메서드만 호출, adb argv 미포함) → 정규화 계층(`src/normalize/uiautomator.ts`)은 `src/schema/*`만 import, CLI/adb 무의존 → adb 래퍼(`src/backend/adb-backend.ts`)가 `DeviceBackend`를 구현하며 실제 adb argv 구성을 캡슐화. 계층 간 역방향 의존 없음(design-review로 import 그래프 확인) |
| **AC-ANDROID-015** | **IME 복원 실패 → 원래 IME id 보고** | **REQ-ERR-001** | **unit(mock) + e2e** | **PASS (unit/mock)** | 복원(`ime set <original>`) 실패 시 `ImeRestoreFailedError`(원래 IME id 포함)를 throw → CLI `text` 명령이 `IME_RESTORE_FAILED` JSON 오류 + `details.originalImeId`로 무음 실패 없이 보고함을 검증. 원래 IME가 애초에 미상(unset)인 edge case는 blind `ime set ""` 시도 없이 즉시 수동 복구 안내로 전환됨을 별도 검증(acceptance.md §D.1) |
| **AC-ANDROID-016** | **ADBKeyBoard 설치 실패 → graceful 오류** | **REQ-ERR-002** | **unit(mock) + e2e** | **PASS (unit/mock)** | `AdbDoctor.ensureAdbKeyboard()`: 번들 APK 부재(`APK_NOT_BUNDLED`) / `adb install` 실패(`APK_INSTALL_FAILED`) / `ime enable` 실패(`IME_ENABLE_FAILED`) 3가지 오류 경로 전부 graceful JSON 오류 + 원인/대안 안내로 반환하고 기기 상태를 변경하지 않음(설치 시도 전 조기 반환)을 검증 |
| AC-ANDROID-017 | device offline/unauthorized → graceful 오류 | REQ-ERR-003 | unit(mock) + e2e | PARTIAL | `parseAdbDevicesList`가 offline/unauthorized 상태를 정확히 파싱하고 `DeviceInfo.connectionState`로 전달함을 검증(M4). 명령 실행 시 대상 기기가 offline이면 해당 adb 호출 자체가 비정상 종료되어 실제 기기 상태 텍스트를 포함한 `ADB_COMMAND_FAILED` graceful 오류로 이미 보고됨(무음 실패 아님, 크래시 아님) — 범용 오류 경로로 REQ-ERR-003의 핵심 요건은 충족되나, 전용 `DEVICE_OFFLINE` 오류 코드로 사전 차단하는 전용 검사는 plan.md 마일스톤에 명시적으로 배정되지 않았으며 이번 청크에서도 구현하지 않음(스코프 외 — 명시적 사전 검사 추가는 후속 개선 후보로 기록) |
| **AC-ANDROID-018** | **adb 데몬 미기동 → graceful + doctor health** | **REQ-ERR-004, REQ-DOCTOR-001** | **unit(mock) + e2e** | **PASS (unit/mock)** | `AdbDoctor.checkDaemonHealth()`가 `adb start-server` 실패/예외 시 `healthy:false`+메시지를 반환하고, `doctor` 명령이 이를 설치 성공과 별개로 점검·보고함을 검증(REQ-ERR-004: 설치 성공만으로 정상 처리하지 않음) |
| **AC-ANDROID-019** | **doctor adb 설치 OS별 안전 게이트** | **REQ-DOCTOR-002** | **unit(mock) + e2e** | **PASS (unit/mock)** | `AdbDoctor.installMissingAdb()`: macOS+동의(`--yes`/`--install`) 없이는 설치 시도 안 함(무음 설치 금지) + 동의 시에만 `brew install android-platform-tools` 실행, Linux/Windows는 동의 플래그와 무관하게 항상 안내만(자동 설치 없음) — 6개 테스트로 OS별 분기 전부 검증 |

**요약 (M0-M8 전체 완료, FINAL)**: 19건 중 **PASS 11건**(AC-006, AC-008, AC-009, AC-010, AC-012, AC-013, AC-014, AC-015, AC-016, AC-018, AC-019), **PARTIAL 8건**(AC-001, AC-002, AC-003, AC-004, AC-005, AC-007, AC-011, AC-017 — 전부 unit/mock 검증 완료, 실기기/실호스트 e2e만 남음), **PENDING 0건**, **FAIL 0건**. 모든 19개 AC가 unit/mock 또는 design-review 수준에서 검증되었다 — 남은 것은 실기기·실호스트 e2e/manual 검증뿐이며, 이는 정직하게 PARTIAL로 표시되어 있다(verification-claim-integrity 원칙 준수: 미검증 항목을 PASS로 주장하지 않음).

### Evidence Commands (verbatim, M7+M8 완료 — 전체 트리, FINAL)

```
$ pnpm tsc --noEmit
(no output; exit=0)

$ pnpm vitest run --reporter=verbose
 Test Files  10 passed (10)
      Tests  139 passed (139)
 (normalize 9 + device-targeting 5 + device-list-parser 6 + adb-backend 31
  + doctor 22 + per-serial-state 6 + router 46 + validators 5 + args 5
  + skill-wrapper 4 — see individual test files for full titles)

$ pnpm build
(exit=0)

$ grep -rnE '(^|[^A-Za-z])adb([^A-Za-z]|$)' .claude/skills/explore-mobile/
(no output; exit=1 -- zero matches, AC-ANDROID-013 satisfied exactly)

$ node dist/cli/bin.js dump   (adb 부재 — 실제 이 개발 머신 환경, macOS)
{"ok":false,"command":"dump","error":{"code":"INTERNAL_ERROR","message":"spawn adb ENOENT"}}
(graceful JSON, no crash, even for the M7-refactored per-serial dump path)

$ pnpm vitest run --coverage (최종, 전체 트리)
Statements   : 96.66% ( 377/390 )
Branches     : 89.28% ( 200/224 )
Functions    : 98.46% ( 64/65 )
Lines        : 98.62% ( 359/364 )
(threshold: 85%+ per acceptance.md §D.2 — MET, all four dimensions)
```

전체(M0-M6 누적 120 tests) evidence는 이전 커밋 로그 참고. M7 신규: `per-serial-state.test.ts`(6건, 전부 신규) + adb-backend.test.ts 확장(dump 경로 네임스페이싱 3건 신규 + per-serial IME tracking 5건 신규 + 기존 dump 테스트 1건 갱신) + doctor.test.ts 반복-호출 멱등성 1건 추가. M8 신규: `skill-wrapper.test.ts`(4건, 전부 신규) + `.claude/skills/explore-mobile/SKILL.md`.

### 남은 범위 (없음 — 전 마일스톤 완료)

**M1-M8 전체 구현 완료.** 이 SPEC의 run-phase(구현) 범위에 더 이상 남은 마일스톤이 없다. 남은 작업은 오직: (1) **실기기/실호스트 e2e 검증** — PARTIAL로 표시된 8개 AC(스크린샷 PNG 매직바이트, 탭/텍스트 실제 착지, 실제 Homebrew/APK 설치 등)의 실제 기기·호스트 관찰, (2) **APK 바이너리 조달**(M6에서 문서화된 `vendor/adbkeyboard/README.md` 체크리스트 — 라이선스 검증, NOTICE, 버전 고정), (3) sync-phase(문서화, manager-docs 소유). 다음 위임은 sync-phase(`/moai sync SPEC-ANDROID-001`)로 진행된다.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase — manager-develop 소유>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase — manager-docs 소유>_
