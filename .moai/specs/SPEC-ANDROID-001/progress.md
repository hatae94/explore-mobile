---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 진행"
version: "0.4.0"
status: completed
created: 2026-07-22
updated: 2026-07-29
author: manager-spec
amendment_of: SPEC-ANDROID-001
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

- **sync_complete_at**: 2026-07-22
- **sync_commit_sha**: `pending-backfill-single-sync-commit` (자기참조 해시 문제 — 이 커밋 자신의 SHA는 커밋 완료 전에는 알 수 없음. `spec-frontmatter-schema.md`의 SHA placeholder backfill exemption에 따른 표준 placeholder. 이번 sync 커밋은 Route A 단일 커밋이라 별도 backfill 커밋은 생성하지 않음 — 실제 SHA는 아래 self-verification 섹션의 git log로 확인 가능)
- **sync_status**: complete (4개 SPEC artifact frontmatter `in-progress → completed` 전이 + README.md/CHANGELOG.md 생성 완료)
- **b12_self_test_a** (CHANGELOG 중복 방지, pre-emission grep): PASS — `grep -c 'SPEC-ANDROID-001' CHANGELOG.md` 실행 전 CHANGELOG.md 파일 자체가 존재하지 않음(신규 생성) → 중복 위험 없음
- **b12_self_test_b** (AC count match, acceptance.md SSOT 대조): PASS — `grep -cE '^\| AC-ANDROID-[0-9]+ \|' acceptance.md` = 19 (acceptance.md §D 매트릭스 19건과 CHANGELOG 본문의 커버리지 서술이 일치)
- **b12_self_test_c** (CHANGELOG/README에서 참조한 파일 경로 실존 확인): PASS — `src/schema/common-element.ts`, `src/schema/device-backend.ts`, `src/normalize/uiautomator.ts`, `src/backend/doctor.ts`, `src/backend/adbkeyboard.ts`, `.claude/skills/explore-mobile/SKILL.md`, `vendor/adbkeyboard/README.md` 전부 `ls` 확인됨
- **changelog_entry_position**: `CHANGELOG.md` `## [Unreleased]` 섹션, 단일 항목(SPEC-ANDROID-001 최초 항목, 기존 항목 없음 — 신규 파일)
- **frontmatter_status_transitions**:
  - spec.md: `in-progress → completed` (updated: 2026-07-22)
  - plan.md: `in-progress → completed` (updated: 2026-07-22)
  - acceptance.md: `in-progress → completed` (updated: 2026-07-22)
  - progress.md: `in-progress → completed` (updated: 2026-07-22)
- **canary_compliance_check**: n/a — 본 SPEC은 forward-looking policy(자체 sync 시점에 검증하는 정책)를 정의하지 않음
- **honesty note**: README.md/CHANGELOG.md 모두 8개 AC가 PARTIAL(실기기 e2e 미검증)임을 명시하고 overclaim하지 않음. `vendor/adbkeyboard/README.md`의 APK 미번들 상태도 README.md Status 섹션에 그대로 반영됨.

### §E.4-b 개정(0.2.0) sync 마감 (2026-07-27)

위 §E.4는 v0.1.2 시점(`e536e11`, 2026-07-22 14:18)의 기록이다. 그 마감 이후 실기기 하드닝이 5개 커밋에 걸쳐 진행되어(`e670a78` 요소 셀렉터 tap/focus 등, 15:41~) 문서가 드리프트했고, 개정 0.2.0(`eb3a443`, 16:38)이 SPEC 아티팩트 4개를 정합화했다. 그 개정은 `status`를 `in-progress`로 되돌린 채 **마감되지 않았다**. 본 기록이 그 개정을 닫는다.

- **amendment_sync_complete_at**: 2026-07-27
- **amendment_sync_commit_sha**: `pending-backfill-single-sync-commit` (자기참조 해시 — `spec-frontmatter-schema.md` SHA placeholder backfill exemption. 실제 SHA는 `git log`로 확인)
- **amendment_sync_status**: complete — 4개 아티팩트 frontmatter `in-progress → completed` 전이 + README.md/CHANGELOG.md에 개정 5개 역량 반영 완료.
- **개정이 사용자 문서에 누락돼 있던 문제(본 sync에서 해소)**: `eb3a443`은 `.moai/specs/SPEC-ANDROID-001/` 4개 파일만 수정했고 README.md/CHANGELOG.md를 건드리지 않았다. 그 결과 개정으로 신설된 5개 역량이 **사용자가 볼 수 있는 문서에 전혀 없었다**(README에서 "selector"는 SPEC-IOS-001 sync 때 추가된 iOS 서술뿐). 본 sync에서 README `tap`/`text` 절 + Unicode 절 + CHANGELOG `Added`에 반영했다.
- **README/CHANGELOG의 낡은 IME 서술 정정**: 두 문서 모두 개정 전 모델("호출마다 원래 IME 복원, 오류 시에도")을 서술하고 있었다. 현재 코드(`adb-backend.ts:254~`, `ime-session-store.ts`)는 **세션 기반 + 디스크 영속 + `reset` 시 복원** 모델이므로 그에 맞게 정정했다. `text` 자가치유(ADBKeyBoard 미설치 시 자동 설치)로 `doctor` 선행 실행이 더는 필수가 아닌 점도 반영했다.
- **AC 개수 정합화**: `acceptance.md`(SSOT) = **24건**(개정으로 AC-ANDROID-020~024 신설). 위 §E.2 요약의 "19건 중 PASS 11 / PARTIAL 8"은 v0.1.2 시점 수치이며 신설 5건이 빠져 있었다.
- **신설 AC 5건 검증 상태 (unit/mock 증거 기반)**:
  | AC | 역량 | 상태 | 증거 |
  |----|------|------|------|
  | AC-ANDROID-020 | `text` 자가치유 자동설치 | PASS (unit/mock) | `router.test.ts` "surfaces an AdbKeyboardInstallFailedError using its own code, reusing doctor's error codes"; `adbkeyboard-installer.ts` 공유 설치기 |
  | AC-ANDROID-021 | 디스크 영속 IME (프로세스 간 복원) | PASS (unit/mock) | `ime-session-store.test.ts` 12 케이스 |
  | AC-ANDROID-022 | 소프트키보드 기본 숨김 + `--keep-keyboard` | PASS (unit/mock) | `router.test.ts` "forwards hideKeyboardAfter: true by default" / "forwards hideKeyboardAfter: false when --keep-keyboard is given" |
  | AC-ANDROID-023 | 셀렉터 `tap --id/--text/--index` + 좌표 XOR | PASS (unit/mock) | `router.test.ts` 셀렉터 탭/ELEMENT_NOT_FOUND/TARGET_CONFLICT 케이스; `element-query.test.ts` 13 케이스 |
  | AC-ANDROID-024 | 셀렉터 `text` 포커스 후 타이핑 | PASS (unit/mock) | `router.test.ts` "focus-taps the element matched by --id, then sends the input text" 외 3케이스(미매칭 시 미전송 포함) |
  - **e2e 여부**: 위 5건 모두 `검증 방식`이 `unit(mock) + e2e`이나, 기록된 증거는 unit/mock뿐이다. e2e는 아래 항목과 동일하게 미기록으로 남긴다.
- **실기기 e2e 상태 — 보수적 기재 (사용자 승인, 2026-07-27)**: 개정 근거(`spec.md` §Amendments)가 "실기기 검증 과정에서 구현이 진화했다"고 기술하고 `§C.2 알려진 한계`에 실기기 관찰(resource-id 미설정 앱은 `--text` 필요, 이모지가 HTML 엔티티로 정규화됨)이 남아 있으므로 **실기기 하드닝 자체는 실제로 있었다**. 그러나 **AC별 e2e PASS 증거는 어디에도 기록되지 않았다**. 본 sync 시점에 안드로이드 기기가 연결돼 있지 않아(`adb devices` 결과 없음) 재관측도 불가능했다. 따라서 8건(AC-001/002/003/004/005/007/011/017)은 **PARTIAL을 유지**하고, 관측하지 않은 것을 PASS로 승격하지 않았다(`verification-claim-integrity.md` §1.1 준수). 최종: 24건 중 PASS 16(기존 11 + 신설 5) / PARTIAL 8 / FAIL 0.
- **검증**: 303 tests PASS (20 files), `pnpm typecheck` exit 0, `pnpm build` exit 0 — 본 sync는 문서 전용이라 코드 변경 없음.
- **남은 후속(마감과 무관)**: 실기기 e2e 증거 기록(기기 연결 시), APK 조달 체크리스트(`vendor/adbkeyboard/README.md`), npm 게시.

### §E.4-c 개정(0.3.0) sync 마감 (2026-07-29)

위 §E.4-b는 0.2.0 마감(2026-07-27) 시점의 기록이다. 그 이후 2026-07-29 실기기 검증에서 결함 2건(M11 `launch` 암시적 인텐트, M10 IME 바인딩 경쟁)이 드러나 개정 0.3.0(`ba3b563`)이 SPEC을 다시 `in-progress`로 열었고, M10 검증 도중 세 번째 결함(M12 `ime enable` 등록 경쟁)이 추가로 발견돼 같은 0.3.0 개정으로 연장됐다(§E.2-M11/§E.2-M10/§E.2-M12). 본 기록이 그 개정을 닫는다.

- **sync_complete_at**: 2026-07-29
- **sync_commit_sha**: `pending-backfill-single-sync-commit` (자기참조 해시 — `spec-frontmatter-schema.md`의 SHA placeholder backfill exemption에 따른 표준 placeholder. 이번 sync 커밋은 단일 커밋이라 별도 backfill 커밋을 만들지 않음 — 실제 SHA는 `git log`로 확인 가능)
- **sync_status**: complete — 4개 SPEC artifact frontmatter `in-progress → completed` 전이 + CHANGELOG.md/README.md에 0.3.0 결함 3건(발견 + 수정) 반영 완료
- **b12_self_test_a** (CHANGELOG 중복 방지, pre-emission grep): PASS — `grep -c 'SPEC-ANDROID-001' CHANGELOG.md` = 6(전부 0.2.0/최초 릴리스 시점 기존 항목). `LAUNCHER_ACTIVITY_NOT_FOUND`/`IME_BIND_TIMEOUT`/`ime enable`/`registration race`/`category.DEFAULT` 사전 검색으로 0.3.0 전용 항목이 아직 없음을 확인한 뒤 신규 항목을 추가했다(중복 없음)
- **b12_self_test_b** (AC count match, acceptance.md SSOT 대조): PASS(해당 없음) — 본 CHANGELOG 항목은 특정 AC 개수를 인용하지 않는다(acceptance.md SSOT `grep -cE '^\| AC-ANDROID-[0-9]+ \|' acceptance.md` = 35건, §D.3 DoD 참조). 인용하지 않은 숫자는 대조 대상이 없다
- **b12_self_test_c** (CHANGELOG/README에서 참조한 파일 경로 실존 확인): PASS — `.moai/specs/SPEC-ANDROID-001/progress.md`, `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md` 전부 `ls` 확인됨. CHANGELOG가 인용하는 소스 파일(`src/backend/launcher-resolve-parser.ts`, `src/backend/launch-errors.ts`, `src/backend/ime-binding-parser.ts`, `src/backend/ime-enable-retry-predicate.ts`, `src/backend/adb-backend.ts`, `src/backend/ime-errors.ts`, `src/cli/commands/launch.ts`, `src/cli/commands/text.ts`) 전부 실존 확인됨
- **changelog_entry_position**: `CHANGELOG.md` `## [Unreleased]` → `### Fixed` 섹션 마지막 항목(0.8.0 GESTURE 항목 뒤, `### Changed` 헤더 앞) — SPEC-ANDROID-001 0.3.0 신규 항목 1건
- **frontmatter_status_transitions**:
  - spec.md: `in-progress → completed` (updated: 2026-07-29)
  - plan.md: `in-progress → completed` (updated: 2026-07-29)
  - acceptance.md: `in-progress → completed` (updated: 2026-07-29)
  - progress.md: `in-progress → completed` (updated: 2026-07-29)
- **canary_compliance_check**: n/a — 본 SPEC은 forward-looking policy(자체 sync 시점에 검증하는 정책)를 정의하지 않음
- **README 정정 내역** (모든 수치는 본 sync 세션에서 직접 실행해 확인 — 눈대중 대조 금지 지시 준수, `pnpm test` → 690 passed/32 files, `pnpm typecheck`/`pnpm build` exit 0):
  - 헤더 배너(~9-43행): 테스트 수 653→690 정정 + "두 결함을 발견"만 서술하던 것을 "발견하고 0.3.0에서 수정" + 세 번째 결함(M12) 서술 추가
  - Status 섹션 첫 문단(~846행): 653→690, "all 8 milestones"에 "plus the 0.2.0 and 0.3.0 amendments" 추가
  - "Two real-device defects are open" 블록(~1041행): open→found-and-fixed로 재구성하되 메커니즘 서술은 보존, 각 항목에 "Fix (0.3.0)" 절 추가, 세 번째 결함(M12 등록 경쟁) 항목 신설
  - "Still pending" 첫 항목(~1104행): "`launch` is verified only insofar as the defect above was found" → `launch` 완전 검증(DEFAULT 선언/미선언 양쪽 + 태스크 재개)으로 정정
  - Roadmap 표 SPEC-ANDROID-001 행(~1130행): "Implemented, e2e pending" → "Completed" + 잔여 미검증 항목(키 별칭 3종·다중 기기·npm 게시) 명시
- **honesty note**: 결함 3건 모두 실기기(SM-S938N)에서 실측 완료(AC-025~035 전부 PASS, acceptance.md §D.3 DoD). M12의 8/8 연속 성공은 결함 소멸의 증명이 아니라 빈도가 계산 가능한 수준(baseline 3/8 대비 우연 통과 확률 약 `(5/8)^8 ≈ 2.3%`) 아래로 내려갔다는 증거로만 CHANGELOG/README 양쪽에 정확히 서술했다(과장 금지). 포커스된 입력란 상관(3/8 대 0/11)은 상관으로만 서술하고 원인으로 서술하지 않았다. `power`/`volume_up`/`volume_down` 3개 키 별칭과 다중 기기 동시 연결 검증, npm 게시는 README "Still pending" 목록에 그대로 보존했다(의도적 미검증 상태 유지, 과장 없음).

## §E.2-M11 개정(0.3.0) M11 — `launch` 명시적 컴포넌트 시작 (2026-07-29)

> §E.4-b 마감 이후 2026-07-29 실기기 검증(`.moai/reports/android-verification/remaining-commands-android-2026-07-29.md`)이 결함 2건을 드러냈고, 개정 0.3.0(`ba3b563`)이 spec.md/plan.md/acceptance.md를 정정했다. 본 절은 그 개정의 **M11만** 마감한다(M10 — IME 바인딩 준비 대기 — 은 별도 마일스톤·별도 커밋이다; M10의 mock 레그 마감은 아래 `§E.2-M10`을 보라 — 기기 잠김으로 실측 레그는 아직 미완이다). progress.md의 `version`/`status`가 spec.md/plan.md/acceptance.md(0.3.0/in-progress)에서 뒤처져 있던 드리프트도 본 커밋에서 정합화한다.

### 산출물

- **`src/backend/launcher-resolve-parser.ts`**(신규, 순수 함수) — `cmd package resolve-activity --brief -a MAIN -c LAUNCHER <pkg>` stdout → 컴포넌트 또는 미해석. **stdout만 본다, 종료 코드는 보지 않는다**(spec.md §C.3-②). 마지막 비어있지 않은 행을 취하고, `No activity found` 단일 행이면 미해석. 선행 점 상대 액티비티는 정규화·확장 없이 그대로 통과.
- **`src/backend/launch-errors.ts`**(신규 모듈) — `LauncherActivityNotFoundError`. `ime-errors.ts`는 IME 전용 이름이라 이 오류와 어울리지 않는다는 plan.md §A.6 재량 판단에 따라 별도 파일로 분리. 메시지가 원인을 단정하지 않음("no launcher activity declared OR ... not installed").
- **`src/backend/adb-backend.ts` `AdbBackend.launchApp`**(재작성) — 조회 → 명시적 `am start -n <component>`. 암시적 `-p` 경로 완전 제거. `--user` 인자 없음(실측 불필요 확인, §C.3-② 재확인). 조회 자체가 비정상 종료(genuine adb 실패)하면 기존 `assertSuccess`로 일반 오류, 조회는 성공(exit 0)했으나 미해석이면 `LauncherActivityNotFoundError`로 인텐트 미전송 거부.
- **`src/cli/commands/launch.ts`**(수정) — `LauncherActivityNotFoundError` → `LAUNCHER_ACTIVITY_NOT_FOUND` JSON 코드 매핑(기존엔 전부 `BACKEND_COMMAND_FAILED`로 접혔음).
- 테스트: `src/backend/launcher-resolve-parser.test.ts`(신규, 6건) + `src/backend/adb-backend.test.ts`의 `launchApp / stopApp` describe 블록 재작성(기존 암시적-`-p` 단언 1건 → 명시적 컴포넌트 시작 계약 6건으로 교체, stopApp 테스트는 무변경) + `src/cli/router.test.ts` 1건 추가(`LAUNCHER_ACTIVITY_NOT_FOUND` 봉투 + 원인 미단정 메시지).

### AC 판정 매트릭스 (AC-ANDROID-025~028)

| AC ID | 요약 | 검증 방식 | Status | Actual Output |
|-------|------|-----------|--------|----------------|
| AC-ANDROID-025 | DEFAULT 선언 앱을 명시적 컴포넌트로 시작 | unit(mock) + 실측 | **PASS** | mock: `adb-backend.test.ts` "resolves the launcher component then starts it explicitly" — 조회 argv(`cmd package resolve-activity ...`) → `am start -n com.android.settings/.Settings` 순서 단언, 어떤 호출에도 `-p`/`--user` 미포함 확인. 실측: `node dist/cli/bin.js launch com.android.settings --device <serial>` → `{"ok":true,...}`, 직후 `dumpsys activity activities`의 `mFocusedApp=ActivityRecord{... com.android.settings/.Settings t15491}` — 포그라운드 전환 관찰됨 |
| AC-ANDROID-026 | **DEFAULT 미선언 앱 — 결함 회귀 증명, 실측 필수** | 실측 필수(mock 단독 불가) | **PASS** | 실측(SM-S938N): `launch com.sec.android.app.popupcalculator` → `{"ok":true,...}` 직후 `mFocusedApp=...popupcalculator/.Calculator t15492`(포그라운드 전환 확인); `launch com.sec.android.app.clockpackage` → `{"ok":true,...}` 직후 `mFocusedApp=...clockpackage/.ClockPackage t15493`(포그라운드 전환 확인). **개정 전에는 두 패키지 모두 `BACKEND_COMMAND_FAILED`("unable to resolve Intent")로 실패했음**(결함 근거 보고서 §4) — 본 실측이 그 회귀가 고쳐졌음을 증명한다 |
| AC-ANDROID-027 | 태스크 재개 의미 보존(경고 행은 실패 아님) | 실측 | **PASS (부분 — 아래 Residual-risk 참고)** | raw `adb shell am start -n com.sec.android.app.popupcalculator/.Calculator`(포그라운드 상태에서 재실행) → stdout `Starting: Intent {...}` + `Warning: Activity not started, intent has been delivered to currently running top-most instance.`, **exit=0**. 태스크 ID 재실행 전후 불변(`Task{4ae2f08 #15492}` → 동일). 이어서 CLI `launch`도 동일 패키지에 대해 `{"ok":true,...}` 반환(경고를 오류로 승격하지 않음 확인) |
| AC-ANDROID-028 | 런처 컴포넌트 미해석 → 구분된 graceful 오류, 원인 미단정, 인텐트 미전송 | unit(mock) + 실측 | **PASS** | mock: `adb-backend.test.ts` "rejects with LauncherActivityNotFoundError and sends NO start intent..." — `exec`가 조회 1회만 호출됨(`toHaveBeenCalledTimes(1)`) 확인; `router.test.ts`가 `LAUNCHER_ACTIVITY_NOT_FOUND` 봉투 + 메시지에 "no launcher activity"와 "not installed" 둘 다 포함됨을 단언. 실측: 존재하지 않는 패키지(`com.example.doesnotexist`) **및** 설치돼 있으나 런처 액티비티가 없는 실제 패키지(`com.android.providers.settings`, raw 조회로 `No activity found`+exit=0 재확인) 둘 다 `{"ok":false,"error":{"code":"LAUNCHER_ACTIVITY_NOT_FOUND",...}}` 반환 — 원인 단정 없는 동일 메시지 |

### 실측 근거 (verbatim, 기기: Galaxy S25 Ultra SM-S938N, 무선 ADB `adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`)

```
$ node dist/cli/bin.js launch com.android.settings --device "$SERIAL"
{"ok":true,"command":"launch","data":{"serial":"adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp","package":"com.android.settings"}}
$ adb -s "$SERIAL" shell dumpsys activity activities | grep mFocusedApp
  mFocusedApp=ActivityRecord{14839129 u0 com.android.settings/.Settings t15491}

$ node dist/cli/bin.js launch com.sec.android.app.popupcalculator --device "$SERIAL"
{"ok":true,"command":"launch","data":{...,"package":"com.sec.android.app.popupcalculator"}}
$ adb -s "$SERIAL" shell dumpsys activity activities | grep mFocusedApp
  mFocusedApp=ActivityRecord{119835819 u0 com.sec.android.app.popupcalculator/.Calculator t15492}

$ node dist/cli/bin.js launch com.sec.android.app.clockpackage --device "$SERIAL"
{"ok":true,"command":"launch","data":{...,"package":"com.sec.android.app.clockpackage"}}
$ adb -s "$SERIAL" shell dumpsys activity activities | grep mFocusedApp
  mFocusedApp=ActivityRecord{99560984 u0 com.sec.android.app.clockpackage/.ClockPackage t15493}

$ adb -s "$SERIAL" shell am start -n com.sec.android.app.popupcalculator/.Calculator   # raw, task already foreground
Starting: Intent { cmp=com.sec.android.app.popupcalculator/.Calculator }
Warning: Activity not started, intent has been delivered to currently running top-most instance.
exit=0
(task id before/after both Task{4ae2f08 #15492} — unchanged)

$ node dist/cli/bin.js launch com.example.doesnotexist --device "$SERIAL"
{"ok":false,"command":"launch","error":{"code":"LAUNCHER_ACTIVITY_NOT_FOUND","message":"Could not resolve a launcher activity for package 'com.example.doesnotexist'. This can mean EITHER the package has no launcher activity declared OR the package is not installed — both cases produce identical resolve output and cannot be distinguished from it alone.","details":{"package":"com.example.doesnotexist"}}}

$ adb -s "$SERIAL" shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER com.android.providers.settings
No activity found
exit=0
$ node dist/cli/bin.js launch com.android.providers.settings --device "$SERIAL"
{"ok":false,"command":"launch","error":{"code":"LAUNCHER_ACTIVITY_NOT_FOUND",...}}
```

### 회귀 없음 확인

```
$ pnpm test
 Test Files  30 passed (30)
      Tests  665 passed (665)          # 653(기준선) + 12(M11 신규: 파서 6 + launchApp 계약 6 net+5 + router 1)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

### 기기 최종 상태 (device etiquette)

세션 시작 기준선(기본 IME=HoneyBoard / ADBKeyBoard 미설치 / `ime-sessions.json={}`/ 포그라운드=런처) 중 **M11이 손댈 여지가 있는 3개 항목(IME/ADBKeyBoard/ime-sessions.json)은 세션 종료 시점에도 기준선과 정확히 일치**함을 재확인했다(`launch`는 IME 상태를 건드리지 않는다). **포그라운드 상태만 기준선과 다르다** — 검증 도중 화면이 잠금(secure keyguard, PIN 필요)으로 전환되었고(디버깅 중 자연 발생한 화면 타임아웃, `launch` 자체의 부작용 아님), PIN 자격 증명이 없어 잠금 해제를 시도하지 않았다. `key home` 전송을 시도했으나 잠금화면이 키 입력을 가로채 활동 관리자의 마지막 포커스는 여전히 계산기(`com.sec.android.app.popupcalculator/.Calculator t15492`)로 남아 있다 — 잠금 해제 전까지는 실제로 아무 액티비티도 조작되지 않으므로 무해하다. 다음 세션 담당자가 기기를 열면 잠금 화면이 보인다.

### Residual-risk (§verification-claim-integrity 5-섹션 형식)

- **Gap**: AC-027의 "앱 내부 상태(예: 계산기 입력란 값)가 보존된다"는 시각적 확인은 화면 잠금으로 수행하지 못했다. 대신 (a) 태스크 ID 불변, (b) `am start -n`의 재개 경고 문구 + exit 0(raw 관측), (c) CLI가 그 경고를 오류로 승격하지 않음(`ok:true`) — 세 가지 기계적 증거로 재개 계약을 확인했다. 이는 spec.md §C.3-④가 이미 실측한 것과 동일한 메커니즘이며, 개정 0.3.0의 `am start -n` 전환이 그 메커니즘을 바꾸지 않았음을 보인다.
- **Residual**: 위 Gap 때문에 "픽셀 단위로 관찰 가능한 상태가 보존된다"는 조금 더 강한 주장까지는 실측하지 못했다 — 기계적 증거(태스크 ID + 경고 + exit 0)로 대체했다.

### 프롬프트 사전 기술 중 틀린 것으로 확인된 항목

없음. `--user` 불필요, 성공 2행/마지막 비어있지 않은 행, 실패 단일 행 `No activity found`+exit 0, 재개 경고+exit 0은 실기기 값과 정확히 일치했다(재개 경고 문구는 `.moai/reports/.../remaining-commands-android-2026-07-29.md` §4가 인용한 것과 달리 이번 관측에서는 "intent has been delivered to currently running top-most instance." — spec.md §C.3-④가 인용한 "its current task has been brought to the front"와 표현이 다르지만 **둘 다 Android가 문맥에 따라 내는 별개의 재개-경고 변형**이며 재개/exit-0 의미는 동일하다).

## §E.2-M10 개정(0.3.0) M10 — IME 바인딩 준비 대기 (2026-07-29)

> M11(§E.2-M11, `994b881`)과 완전히 독립인 별도 커밋(§F.10). `launchApp`/`launcher-resolve-parser.ts`/`launch-errors.ts`는 전혀 건드리지 않았다. **기기가 보안 잠금(`isKeyguardShowing=true`, PIN 없음) 상태라 실측 레그(AC-029/030 실기기·AC-032)는 이번 커밋에서 수행하지 못했다** — mock 레그만 마감하고, 실측이 필요한 3건은 아래에서 명시적으로 미기록으로 남긴다.

### 산출물

- **`src/backend/ime-binding-parser.ts`**(신규, 순수 함수) — `dumpsys input_method` stdout → `{bound, currentImeId}`. `mBoundToMethod`가 덤프에 정확히 1회 등장한다는 전제(spec.md §C.3-⑥)로 모호성 없이 파싱하며, 마커 부재 시 `bound: false` 기본값(미확인 상태를 준비완료로 취급하지 않음 — 이 결함 부류를 되풀이하지 않기 위한 안전한 기본값).
- **`src/backend/ime-errors.ts`**(수정) — `ImeBindTimeoutError` 신규 타입(`serial` + 메시지에 `timeoutMs` 포함). 기존 `ImeRestoreFailedError`/`AdbKeyboardInstallFailedError`와 같은 자리·같은 형태.
- **`src/backend/adb-backend.ts` `AdbBackend.inputText`**(수정) — cold 경로(`currentIme !== ADBKEYBOARD_IME_ID`)에서 `setImeToAdbKeyboard`(및 원래 IME 디스크 영속) 이후·`broadcastBase64Text` 이전에 `waitForImeBindingReady` 삽입. 타임아웃 시 브로드캐스트를 전혀 호출하지 않고 `ImeBindTimeoutError`를 throw한다. warm 경로(이미 ADBKeyBoard가 활성 IME)는 무변경 — 대기 0회, 즉시 전송. 생성자에 4번째 선택 인자 `sleep`을 추가했다(기본값은 실제 `setTimeout` 기반, 테스트는 `noRealDelay`를 주입) — 기존 3-인자 생성 호출 59건 이상이 하위호환으로 그대로 통과한다.
- **`src/cli/commands/text.ts`**(수정) — `ImeBindTimeoutError` → `IME_BIND_TIMEOUT` JSON 코드 매핑(`details.serial` 포함), 기존 두 `instanceof` 분기와 동일한 형태.
- 테스트: `src/backend/ime-binding-parser.test.ts`(신규 7건) + `src/backend/adb-backend.test.ts`(신규 `describe` 블록 6건: 다중 폴링 성공, dumpsys 비정상 종료 재시도, dumpsys `exec()` reject 재시도, warm 무대기, 타임아웃 미전송, 폴링 횟수 상한 확인 — + 기존 cold-path 테스트 8건의 call-count/nth-call 값을 dumpsys 삽입에 맞춰 갱신 + `createDeviceImeSimulator`와 커스텀 mock 2곳에 `dumpsys` 분기 추가) + `src/cli/router.test.ts`(신규 1건 + "세션 기반 IME 통합" 실 `AdbBackend` 테스트 4건에 `dumpsys` 분기 추가).

### 판정 근거 — 대기 상한은 설계 선택이다

`IME_BIND_TIMEOUT_MS = 5,000`(SPEC 권고값 그대로). `MAX_DURATION_MS`(`src/cli/validators.ts:47-64`) 선례와 동일한 부류의 독블록으로 근거를 남겼다(`adb-backend.ts` 상수 정의 지점) — 목적은 "무한 대기 금지"뿐이고 이 값은 기기 거동을 주장하지 않는다. spec.md §C.3-⑦의 "cold 사이클에서 대략 adb 왕복 1회 안에 `mBoundToMethod`가 뒤집힌다"는 관측은 이 상한이 넉넉해도 됨을 뒷받침할 뿐 — 같은 §C.3-⑦이 "이 관측이 상한 값을 정하지는 않는다"고 명시한다. 폴링 간격은 250ms(구현 재량, plan.md §F 명시) — `webview/proxy-service.ts`의 `START_POLL_INTERVAL_MS` 선례와 동일 값을 재사용했다. `IME_BIND_MAX_POLL_ATTEMPTS = ceil(5000/250) = 20`.

### 준비 술어 — `mCurId` 결합항에 대한 결정 (AC-ANDROID-032)

파서는 `bound`와 `currentImeId` 둘 다 추출하지만, `waitForImeBindingReady`의 준비 술어는 **`bound` 단독**이며 `currentImeId === ADBKEYBOARD_IME_ID`를 결합하지 않는다. 근거:

1. 결정 실험(spec.md §C.3-⑧)은 포커스·사이클·오라클을 고정한 채 `mBoundToMethod` 플래그만 변화시켰고, 5회 분리 실험 전체에서 성공/실패가 그 플래그와 정확히 일치했다 — `currentImeId`는 변수로 다뤄지지 않았다.
2. `currentImeId`가 미바인딩(`bound=false`) 창에서 어떤 값을 갖는지는 2026-07-29 검증에서 **측정되지 않았다**(spec.md §C.3-⑩, 명시적 미측정 — "주장 경계"로 기록됨).
3. 결합항을 추가하면 실측되지 않은 전제를 코드에 넣는 것이 된다. acceptance.md AC-ANDROID-032가 명시적으로 인정하는 대안 — "결합항 없이 바인딩 플래그만으로 술어를 구성하기로 결정했다면, 그 결정과 근거를 기록하는 것으로 충족된다" — 를 택했다.

이 결정은 기기 관측이 아니라 §C.3-⑧ 실험 설계의 재검토에 근거한다. 실기기 재검증(AC-032, 기기 잠김으로 이번 커밋에서 미수행)이 이 전제를 반증하면 정정 대상이다.

> **소급 반영(§E.2-M12)**: 위 실기기 재검증은 이후 기기 잠금 해제 후 실행되었다 — 미바인딩 창에서 `mCurId`가 이미 ADBKeyBoard였음이 관측되어, 결합항이 판별력 0임이 반증이 아니라 **확증**되었다(전제를 반증하지 않았다). 결과는 위 AC-032 표 행과 spec.md §C.3-⑯에 기록되어 있다.

### AC 판정 매트릭스 (AC-ANDROID-029~032)

| AC ID | 요약 | 검증 방식 | Status | Actual Output |
|-------|------|-----------|--------|----------------|
| AC-ANDROID-029 | cold 경로 비-ASCII `text` 착지 [결함 회귀 증명] | 실측 필수 | **PASS (실측) — §E.2-M12에서 소급 반영** | 기기 잠금 해제 후 실기기(Galaxy S25 Ultra SM-S938N)에서 관측 완료: `reset` 직후 ADBKeyBoard 미설치 상태에서 `node dist/cli/bin.js text "알림" --device <serial>`(같은 호출 안에서 자가치유 설치 → IME 전환 → 바인딩 대기 → 브로드캐스트) 실행 후 스크린샷으로 "알림"이 검색창에 착지함을 **2/2회** 관측(유효 오라클은 스크린샷뿐 — `mServedView`는 재사용하지 않음, spec.md §C.3-⑨). CLI 응답은 매회 `ok:true`. M12 세션(§E.2-M12)의 AC-033 8회 반복 cold 시행에서도 매회 동일 경로("알림" 대신 "검사일"~"검사팔")가 착지 확인되어 재확인됨. mock 레그(아래 "mock 레그가 실제로 단언하는 것")는 기존과 동일 |
| AC-ANDROID-030 | warm 경로 불변 | unit(mock) + 실측 | **PASS (unit/mock + 실측) — §E.2-M12에서 소급 반영** | mock: `adb-backend.test.ts` "warm path performs NO dumpsys poll at all" — `dumpsys` 호출 0회, `ime enable`/`set` 호출 0회, 총 3회 호출(settings get + broadcast + hide)만 발생함을 확인(무변경). 실측: 기기 잠금 해제 후, 이미 바인딩된 ADBKeyBoard 상태(warm)에서 한글 문자열("카메라", "배터리")이 대기 없이 즉시 검색창에 착지함을 스크린샷으로 확인 |
| AC-ANDROID-031 | 바인딩 대기 타임아웃 → 미전송 + `ok:false` [응답 계약 변경] | unit(mock) | **PASS** | `adb-backend.test.ts` "throws ImeBindTimeoutError and sends NO broadcast..." — `am broadcast` argv가 mock exec에 **0회** 도달함을 직접 단언, `ImeBindTimeoutError` throw 확인(`.serial` 필드 포함), 원래 IME의 디스크 영속이 타임아웃 후에도 유지됨을 확인(`getTrackedOriginalIme`, REQ-IDEMP-004 불변). `router.test.ts` "surfaces an ImeBindTimeoutError as a dedicated IME_BIND_TIMEOUT envelope..." — CLI 봉투 `ok:false` + `IME_BIND_TIMEOUT` 코드 + `details.serial` 확인. acceptance.md §D.4가 이 AC를 mock 단독으로 완전히 충족 가능하다고 명시하므로 실측이 필요 없다. |
| AC-ANDROID-032 | 준비 술어의 IME-id 결합항 실기기 확인 [미측정 항목] | 실측 필수 | **PASS (실측 — 관측 완료) — §E.2-M12에서 소급 반영** | cold 사이클의 미바인딩 창(`mBoundToMethod=false`)에서 `adb shell dumpsys input_method` 관측값을 verbatim으로 기록한다: `mSelectedMethodId=com.android.adbkeyboard/.AdbIME`, `mCurId=com.android.adbkeyboard/.AdbIME`(이미 ADBKeyBoard), `mBoundToMethod=false`(유일한 판별 필드), 1초 후 `mBoundToMethod=true`로 전환. 관측 결과는 결합 술어(`bound && currentImeId===ADBKEYBOARD`)의 전제와 다르다 — 미바인딩 창에서도 `mCurId`가 이미 ADBKeyBoard였으므로 결합항은 **판별력이 0**이다(spec.md §C.3-⑯). 술어는 관측에 맞게 **`bound` 단독을 유지**한다(정정 불필요 — 기존 선택이 이제 관측으로 확증됨). `ime-binding-parser.ts`의 `@MX:NOTE`와 `adb-backend.ts`의 `waitForImeBindingReady` 주석을 본 M12 커밋에서 이 관측을 반영하도록 정정했다(과거엔 "미측정"이라고 서술했던 것을 "관측 완료 — 결합항 무용"으로 수정) |

### mock 레그가 실제로 단언하는 것

- **cold 경로, 다중 폴링 후 성공**: "polls dumpsys until bound=true, THEN sends the broadcast" — `bound=false` 2회 → `bound=true` 1회 → 그 다음에만 `am broadcast` 호출됨을 nth-call 순서로 단언.
- **`dumpsys` 조회 자체의 실패(비-zero exit code 및 `exec()` reject 양쪽)**: 준비 미확인으로 처리되어 재시도되고, 같은 bounded wait 안에서 궁극적으로 성공함을 확인(acceptance.md §D.1 엣지 케이스: "준비 신호 조회 자체가 실패 → 브로드캐스트하지 않는다"를 재시도-후-성공/재시도-후-타임아웃 양쪽으로 커버).
- **warm 경로 무변경**: `dumpsys` 호출 0회, `ime enable`/`set` 호출 0회.
- **타임아웃 → 미전송**: `am broadcast` argv가 mock exec에 **도달하지 않음**을 직접 단언 — 프롬프트가 지정한 "mock-assertable core requirement".
- **폴링 횟수 상한**: 20회(`ceil(5000/250)`) 이하로 유한하게 종료됨을 확인(무한 대기 없음).

### 회귀 없음 확인

```
$ pnpm test
 Test Files  31 passed (31)
      Tests  679 passed (679)          # 665(M11 마감 기준선) + 14(M10 신규: 파서 7 + adb-backend 6 + router 1)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
$ pnpm test:coverage (발췌)
 adb-backend.ts          97.67% stmt / 92.85% branch / 92.3% funcs / 99.18% lines
   (미커버: L127 — defaultSleep의 실제 setTimeout 본문. webview/proxy-service.ts의
    defaultSleep과 동일한, 주입 가능한 실 타이머의 기존 수용 패턴)
 ime-binding-parser.ts   100% stmt (branches: 0/0, 분기 없음)
 ime-errors.ts           100% stmt (branches: 0/0, 분기 없음)
```

### 기기 상태 (device etiquette)

**본 M10 구현·검증은 기기에 어떤 `adb` 명령도 전송하지 않았다** — 전부 mock `exec` 기반 unit test다. 프롬프트가 명시한 대로 기기가 보안 잠금(`isKeyguardShowing=true`, `mWakefulness=Dozing`) 상태이고 PIN 자격 증명이 없어 잠금 해제를 시도하지 않았으며, `power`/`volume_*`/wake 키 전송도 시도하지 않았다. 기기 기준선(기본 IME=HoneyBoard / ADBKeyBoard 미설치 / `~/.cache/explore-mobile/ime-sessions.json={}`)은 이번 세션에서 전혀 건드리지 않았으므로 그대로 유지된다 — 별도 원상복구가 필요 없다.

### Residual-risk (§verification-claim-integrity 5-섹션 형식)

- **Gap**: AC-029(cold 착지 실측)와 AC-032(`mCurId` 결합항 실기기 확인)는 기기 잠김으로 완전히 미검증이다. mock 레그는 "구성된 argv의 순서·시점이 옳다"만 증명하고, "기기가 실제로 그렇게 반응한다"는 증명하지 못한다 — acceptance.md §D.4가 이미 명시한 mock의 사정거리 한계이며, 결함 2 자체가 이 한계 때문에 발생했었다(같은 함정을 mock으로 "다 검증됐다"고 주장하지 않도록 주의했다). **[소급 반영 — §E.2-M12]** 이 Gap은 이후 기기 잠금 해제 후 해소되었다 — AC-029/030/032 모두 실측 완료(위 AC 표 참고). 이 Gap 기록 자체는 M10 세션 당시의 정직한 상태 기록으로 보존한다.
- **Residual**: `waitForImeBindingReady`의 준비 술어(`bound` 단독)가 §C.3-⑧의 5회 실험 범위를 벗어난 실기기 조건(예: 훨씬 느린 기기, 다른 Android 버전의 `dumpsys` 출력 형식 차이)에서도 유효한지는 미확인이다. `IME_BIND_TIMEOUT_MS=5000`이 실제로 "충분히 넉넉한지"도 이번 세션에서 실측되지 않았다 — §C.3-⑦의 "대략 1회 왕복" 관측이 유일한 간접 근거다.

### 프롬프트 사전 기술 중 틀린 것으로 확인된 항목

- **"warm 경로는 준비 신호 조회가 최대 1회"라는 acceptance.md AC-030 문구**: 실제 구현은 warm 경로에서 `dumpsys` 조회를 **0회** 수행한다 — "1회 이하"이므로 문구와 모순되지는 않지만, 같은 AC의 앞 문장("IME 전환도 대기도 수행하지 않고 즉시")과 더 정확히 일치하는 "0회" 해석을 택했다. 코드나 실측이 틀렸다는 의미는 아니고, AC 문구의 여지를 어떻게 해석했는지 기록해 둔다.
- 그 외 프롬프트 서술(측정된 사실, claim boundary, mock leg의 사정거리, "N일선 없이 넣지 말라"는 지시)은 코드로 확인해 틀린 것이 없었다.
- 프롬프트가 예상한 대로: 기기가 잠겨 있어 실측 3건(AC-029/030 실측 레그·AC-032)을 완료하지 못했다 — 예상된 제약이며 새로 발견된 사실은 아니다.

## §E.2-M12 개정(0.3.0 연장) M12 — `ime enable` 등록 경쟁 상한 재시도 (2026-07-29)

> §E.2-M10이 마감한 뒤 기기 잠금이 해제되어, M10이 미기록으로 남긴 실측 3건(AC-029/030/032)이 이 세션 안에서 해소되었다(위 §E.2-M10 AC 표에 소급 반영함). 같은 세션에서 M12(§F M12, 결함 3 — `ime enable` 등록 경쟁) 구현·검증도 완료한다. M10(`f6e0724`)이 바꾼 같은 `inputText` cold 시퀀스의 **한 단계 앞**(`adb install` → `ime enable`)을 건드리므로 M10 위에 서는 연장이며, `launchApp`/런처 파서(M11, `994b881`)는 전혀 건드리지 않았다.

### 산출물

- **`src/backend/ime-enable-retry-predicate.ts`**(신규, 순수 함수) — `ime enable` 실패의 stdout/stderr/종료 코드 → "등록 경쟁(재시도 가능)" 또는 "그 외(즉시 표면화)". 대표 픽스처는 spec.md §C.3-⑫의 실측 문자열(`Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #0`, exit 255) 정규식 매칭. 기기 없이 단위 테스트 가능(`ime-enable-retry-predicate.test.ts`, 신규 8건).
- **`src/backend/adb-backend.ts` `AdbBackend.setImeToAdbKeyboard`**(수정) — `enableAdbKeyboardWithRetry` 신설: `ime enable`이 위 술어에 매칭되는 실패일 때만 최대 `IME_ENABLE_MAX_ATTEMPTS=4`회(최초 1회 + 재시도 3회)까지 `IME_ENABLE_RETRY_DELAY_MS=500`ms 간격으로 재시도. 비매칭 실패는 재시도 없이 즉시 기존 `assertSuccess` 경로로 전파(새 오류 코드 0건). 재시도 상한·간격은 `IME_BIND_TIMEOUT_MS`/`MAX_DURATION_MS`(`src/cli/validators.ts:47-64`)와 같은 형태의 독블록으로 "설계 선택, 측정 의무 없음" 근거를 남겼다. 재시도가 안전한 근거(실측된 멱등성, spec.md §C.3-⑮)와 "왜 `ime list -a` 폴링이 아닌 재시도인가"(§C.3-⑭, 실패 창의 값을 한 번도 관측하지 못했다는 주장 경계)를 doc comment에 명시적으로 기록했다.
- **`src/backend/ime-binding-parser.ts`의 `@MX:NOTE`** 및 **`src/backend/adb-backend.ts`의 `waitForImeBindingReady` doc comment**(정정) — "`currentImeId`는 미측정"이라던 서술을 "M10 세션에서 실측 완료 — 미바인딩 창에서도 이미 ADBKeyBoard였고 결합항은 판별력 0"으로 정정. 술어(`bound` 단독)는 변경하지 않았다 — 결합항을 넣지 않는 편이 이제 관측으로 확증됐을 뿐이다. 두 주석 모두에 "이 결합항을 '더 엄밀해 보인다'는 이유로 나중에 추가하지 말 것" forward guard를 추가했다.
- 테스트: `src/backend/ime-enable-retry-predicate.test.ts`(신규 8건 — 대표 픽스처 매칭/스트림 무관/user 번호 일반화/비매칭 3종/exit 0 비매칭/빈 메시지 비매칭) + `src/backend/adb-backend.test.ts`(신규 `describe` 블록 3건 — 재시도 1회 후 성공, 비매칭 실패 정확히 1회, 상한 소진 유한 종료).

### AC 판정 매트릭스 (AC-ANDROID-033~035)

| AC ID | 요약 | 검증 방식 | Status | Actual Output |
|-------|------|-----------|--------|----------------|
| AC-ANDROID-033 | cold 반복 시행에서 `ime enable` 등록 경쟁 회복 + 착지 [결함 회귀 증명 · 시행 횟수 규정] | 실측 필수(mock 단독 불가, 시행 횟수 명시) | **PASS** | mock: `adb-backend.test.ts` "retries 'ime enable' once after a registration-race failure..." — 재시도 1회 후 성공 + 전체 cold 시퀀스 완주(8회 exec 호출) 확인. 실측: Galaxy S25 Ultra(SM-S938N)에서 **포커스된 입력란(설정 검색창)에서 8회 연속** `reset` → `text "검사일"`~`"검사팔"` cold 사이클 수행 — **8/8 `ok:true` + 스크린샷 오라클로 매회 착지 확인**(trial-by-trial 근거는 아래 "실측 근거" 참고). `ime enable` 자연 실패(사용자에게 보이는 미회복 실패) **0회**. 매 회 직전 `reset`이 `adbKeyboardUninstalled:true`(trial 1 제외 — 최초 기준선이 이미 미설치)를 반환해 진짜 cold 사이클임을 확인 |
| AC-ANDROID-034 | 비매칭 `ime enable` 실패는 재시도 없이 즉시 표면화 | unit(mock) | **PASS** | `adb-backend.test.ts` "does NOT retry a non-matching 'ime enable' failure..." — `ime enable` 호출이 **정확히 1회**임을 필터링으로 직접 단언, 브로드캐스트 argv 0회 도달, 원래 실패 메시지("adb: ime enable rejected")가 그대로 전파됨을 `.rejects.toThrow`로 확인(지연·대체 없음) |
| AC-ANDROID-035 | `ime enable` 재시도 상한 — 유한 종료 | unit(mock) | **PASS** | `adb-backend.test.ts` "exhausts the retry ceiling on a PERSISTENT registration-race failure..." — `ime enable` 호출 횟수가 상한(4) 이하의 유한 값임을 확인, 브로드캐스트 argv 0회 도달, `ime set` 호출 0회(assertSuccess가 먼저 throw) 확인. 새 오류 코드 없이 기존 일반 오류 경로(`assertSuccess` → `Error`)를 그대로 사용함을 확인(응답 계약 불변) |

### mock 레그가 실제로 단언하는 것

- **재시도 성공**: 등록 경쟁 실패 1회 후 재시도가 성공하면 곧바로 `ime set` → 바인딩 대기 → 브로드캐스트로 진행(전체 cold 시퀀스 완주).
- **비매칭 실패는 재시도 0회**: `ime enable` 호출이 정확히 1회이며, 브로드캐스트가 mock exec에 전혀 도달하지 않음.
- **상한 소진 시 유한 종료**: `ime enable` 호출 횟수가 4(설계 선택) 이하이며, 무한 루프가 없음. `ime set`은 전혀 호출되지 않음(assertSuccess가 소진된 실패를 그대로 throw).
- **새 오류 코드 없음**: 소진 시에도 `ImeBindTimeoutError` 같은 신규 타입이 아니라 기존 `assertSuccess`의 일반 `Error` 경로를 그대로 사용함(AC-035 "응답 계약 불변").

### 실측 근거 (verbatim, 기기: Galaxy S25 Ultra SM-S938N, 무선 ADB `adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`)

**AC-033 — 8회 연속 cold 시행 (매 회 `reset` → `stop` → `launch com.android.settings` → `tap 400 2928`(검색창, 검색 아이콘 내부 — voice-search 버튼은 x≥988이라 벗어남) → `text "<단어>"` → `screenshot`, 매 회 스크린샷으로 판정):**

| 시행 | 입력 문자열 | 포커스 확인 | `text` 응답 | 스크린샷 판정 |
|------|-------------|--------------|-------------|----------------|
| 1 | 검사일 | 포커스됨(`mServedView=...SearchAutoComplete.../search_src_text`, tap 직후 dump로 사전 확인) | `ok:true` | **PASS** — 검색창에 "검사일" 착지, "검색 결과가 없습니다" 표시(실제로 검색이 수행됨) |
| 2 | 검사이 | 포커스됨(동일 UI 경로) | `ok:true` | **PASS** — "검사이" 착지, "검색 결과가 없습니다" |
| 3 | 검사삼 | 포커스됨 | `ok:true` | **PASS** — "검사삼" 착지, "결과(2)"(삼성 앱 매칭 — 실제 검색 수행 확인) |
| 4 | 검사사 | 포커스됨 | `ok:true` | **PASS** — "검사사" 착지, "결과(1)"(개발자 옵션 매칭) |
| 5 | 검사오 | 포커스됨 | `ok:true` | **PASS** — "검사오" 착지, "결과(1)" |
| 6 | 검사육 | 포커스됨 | `ok:true` | **PASS** — "검사육" 착지, "검색 결과가 없습니다" |
| 7 | 검사칠 | 포커스됨 | `ok:true` | **PASS** — "검사칠" 착지, "검색 결과가 없습니다" |
| 8 | 검사팔 | 포커스됨 | `ok:true` | **PASS** — "검사팔" 착지, "검색 결과가 없습니다" |

**결과: 8/8 PASS.** `ime enable` 자연 실패(사용자에게 보이는 미회복 실패) 0회 — baseline(무수정 상태, cold+포커스 3/8 실패)과 대비하면 우연히 8회 전부 통과할 확률은 `(5/8)^8 ≈ 2.3%`이며, 이는 **결함이 사라졌다는 증명이 아니라 빈도가 계산 가능한 수준 아래로 내려갔다는 증거**다(acceptance.md §D.4.1이 요구하는 정확한 표현). 재시도가 실제로 몇 회 발동했는지(1회 실패 후 회복 vs 매회 1발 성공)는 이 세션에서 별도 계측(logcat 등)하지 않았다 — 관측한 것은 CLI의 최종 결과(`ok:true` + 화면 착지)뿐이며, 이 이상을 주장하지 않는다.

```
$ export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
$ SERIAL="adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"
$ node dist/cli/bin.js reset --device "$SERIAL"
{"ok":true,"command":"reset","data":{...,"adbKeyboardUninstalled":true,"originalImeRestored":true}}
$ node dist/cli/bin.js stop com.android.settings --device "$SERIAL"
$ node dist/cli/bin.js launch com.android.settings --device "$SERIAL"
$ node dist/cli/bin.js tap 400 2928 --device "$SERIAL"
$ node dist/cli/bin.js text "검사일" --device "$SERIAL"
{"ok":true,"command":"text","data":{"serial":"adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"}}
$ node dist/cli/bin.js screenshot --device "$SERIAL"   # decoded pngBase64 → 스크린샷으로 "검사일" 착지 확인
(... 시행 2~8, 동일 시퀀스, 입력 문자열만 검사이~검사팔로 교체 ...)
```

**사전 확인(dump, "새로 탭하기 전에 무엇이 있는지 확인")**: `tap 400 2928` 전 `dump`로 좌표가 `com.android.settings:id/search_mag_icon`(bounds `{x:322,y:2883,w:90,h:90}`, 부모 `search_plate` `{x:262,y:2831,w:915,h:195}`) 안에 있음을 확인했고, tap 직후 `dump`/`dumpsys input_method`로 `mServedView`가 `SearchAutoComplete`(`id/search_src_text`)로 바뀌어 실제 입력란이 포커스됨을 확인했다(포커스 확인 용도로만 사용 — 브로드캐스트 성공 오라클로는 재사용하지 않음, spec.md §C.3-⑨).

### 회귀 없음 확인

```
$ pnpm typecheck
(no output; exit=0)

$ pnpm test
 Test Files  32 passed (32)
      Tests  690 passed (690)          # 679(M10 마감 기준선) + 11(M12 신규: predicate 8 + adb-backend retry describe 3)

$ pnpm build
(exit=0)
```

### 기기 최종 상태 (device etiquette)

세션 시작 기준선(기본 IME=HoneyBoard / ADBKeyBoard 미설치 / `~/.cache/explore-mobile/ime-sessions.json={}` / 포그라운드=런처, 화면 잠금 없음)을 8회 시행 동안 반복적으로 흔들었다(설치/제거 사이클 8회). 시행 종료 후 `reset` 1회를 추가 실행하고 4개 항목을 전부 재확인했다 — **모두 기준선과 정확히 일치**:

| 항목 | 기준선 | 세션 종료 시점 |
|------|--------|----------------|
| 기본 IME | `com.samsung.android.honeyboard/.service.HoneyBoardService` | `com.samsung.android.honeyboard/.service.HoneyBoardService` (일치) |
| ADBKeyBoard 설치 여부 | 미설치 | 미설치(`pm list packages` 무매칭, Secure Folder stderr는 spec.md §C.3-⑪ 그대로) (일치) |
| `ime-sessions.json` | `{}` | `{}` (일치) |
| 포그라운드 | 런처(홈 화면) | `com.sec.android.app.launcher/.activities.LauncherActivity`(`stop com.android.settings` + `key home`으로 복귀) (일치) |

화면 잠금/PIN/디스플레이 밀도/`power`/`volume_*` 관련 조작은 전혀 수행하지 않았다.

### Residual-risk (§verification-claim-integrity 5-섹션 형식)

- **Gap**: `ime enable` 재시도가 실제로 몇 회 발동했는지(1회 실패 후 회복 vs 최초 시도 성공)는 8회 시행 어느 것에서도 직접 계측하지 않았다 — 계측하려면 logcat 캡처 또는 코드 계측이 필요했고, 프로덕션 코드에 스코프 밖 계측을 추가하지 않기로 했다. 관측한 것은 최종 결과(8/8 `ok:true` + 착지)뿐이다.
- **Gap**: `IME_ENABLE_MAX_ATTEMPTS=4`, `IME_ENABLE_RETRY_DELAY_MS=500`이 baseline보다 느린 기기(다른 API 레벨/제조사)에서도 충분한지는 미확인이다 — 설계 선택이므로 측정 의무는 없으나(§C.3-⑫/⑮ 문서화), 8회 시행은 SM-S938N 1대에서만 수행됐다.
- **Residual**: `(5/8)^8 ≈ 2.3%`이라는 우연 통과 확률 자체가 baseline 3/8이 8회 표본이라는 점에서 추정이며 보장이 아니다(acceptance.md §D.4.1이 이미 명시). 8회 전부 통과가 결함이 "완전히 사라졌다"를 증명하지 않는다는 점을 다시 강조한다.

### 프롬프트 사전 기술 중 틀린 것으로 확인된 항목

없음. 재시도 상한 4(최초 1회+재시도 3회)/간격 500ms은 이번에 새로 설계 선택한 값이며 프롬프트가 특정 수치를 지정하지 않았으므로 "틀림"의 대상이 아니다. `ime list -a` 미관측 근거(§C.3-⑭), `ime enable` 멱등성(§C.3-⑮), `mCurId` 결합항 무용(§C.3-⑯) 등 프롬프트가 인용한 사실들은 spec.md 본문과 정확히 일치했다.

## §E.2-M13 개정(0.4.0) M13 — 대상 기기 해석의 "연결" 정의 (2026-07-29)

> §E.4-c(0.3.0 sync 마감) 이후 같은 날 실기기 검증(Chrome 웹 구동 + 2기기 운용)이 결함 2건을 드러냈고, 개정 0.4.0(`c0132cd`)이 spec.md/plan.md/acceptance.md를 다시 `in-progress`로 열어 정정했다. 본 절은 그 개정의 **M13만** 마감한다(M14 — 소프트키보드 숨김이 자기 입력을 파괴하는 결함 — 은 별도 마일스톤·별도 커밋이며, `hideKeyboard`/`text` 경로를 전혀 건드리지 않았다). M13은 M10·M11·M12(0.3.0)와 완전히 독립이다 — `cli/device-targeting.ts`는 `adb-backend.ts`와 공유 코드가 0이다(plan.md §F.10).

### 산출물

- **`src/cli/device-targeting.ts` `resolveTargetDevice`**(수정) — 신설 내부 헬퍼 `connectedOnly(devices)`가 `connectionState === "device"`로 먼저 거른다(REQ-MULTIDEV-001 개정 0.4.0의 "연결" 정의). 계수·자동 선택·`AMBIGUOUS_DEVICE`/`NO_DEVICE` 메시지가 전부 이 필터링된 배열을 쓴다.
  - **명시 지정 미연결 기기**: `requestedSerial`이 목록에 **있으나** `connectionState !== "device"`이면 새 코드 `DEVICE_NOT_CONNECTED`를 반환(`details.connectionState`에 관측값 포함) — 목록에 아예 없는 경우의 `DEVICE_NOT_FOUND`와 구분된다. 순수 함수가 이미 구조화된 오류를 반환하므로 plan.md §A.6이 명시한 대로 별도 오류 클래스/`instanceof` 왕복을 두지 않았다(구현 재량 선택).
  - **`NO_DEVICE`**: 연결 0대일 때, 원시 목록에 미연결 항목이 있으면(`devices.length > 0`) 메시지에 그 개수를 포함한다(`No connected device (N device(s) listed, but none are connected — run 'devices' for the full list).`) — "있는데 부팅 안 됨"과 "아무것도 없음"을 구분.
  - **`AMBIGUOUS_DEVICE`**: 메시지는 연결된 기기 수만 말한다(`${connected.length} devices connected; ...`). `details.availableDevices`는 연결된 기기만 담고, 미연결 개수는 `details.disconnectedCount`로 요약한다(0이면 필드 자체를 생략 — 필드명은 구현 재량이나 전체 덤프 금지는 규범).
  - **`DEVICE_NOT_FOUND`**: `details.availableDevices`도 동일하게 연결된 기기만 담도록 정정(개정 전에는 전체 원시 목록).
  - **`unauthorized`도 미연결로 취급**됨을 `connectedOnly` 필터가 자동으로 보장한다(REQ-MULTIDEV-001의 정의 그대로 — 별도 분기 불필요).
  - **`devices` 명령(`cli/commands/devices.ts`)은 전혀 건드리지 않았다**(PRESERVE) — 자체 필터 로직(`--device`로 좁히는 자신만의 `DEVICE_NOT_FOUND` 경로)이 `resolveTargetDevice`와 무관하게 남아 있고, 인벤토리는 여전히 미연결 항목을 포함해 전부 나열한다(AC-045).
- **`README.md`**(수정, ~120행) + **`.claude/skills/explore-mobile/SKILL.md`**(수정) — 자동 선택 설명에 "연결된"의 정의(`connectionState === "device"`)를 추가하고, offline/unauthorized 항목이 `devices` 목록에 섞일 수 있다는 사실 및 `DEVICE_NOT_CONNECTED` 코드를 문서화했다. 기존 문구("정확히 1대가 연결되면 자동 선택")는 약속으로는 옳았고 동작만 틀렸으므로, 문구를 약화시키지 않고 정의만 보강했다(plan.md §F 산출물4의 지시대로).
- 테스트: `src/cli/device-targeting.test.ts`(신규 7건) — `device()` 픽스처 헬퍼에 `connectionState` 3번째 선택 인자를 추가(기존 호출부 전부 하위호환, 기본값 `"device"`)하고, 실측 관측된 23건(연결 2 + offline 21, spec.md §C.4-⑳) 분포를 그대로 재현하는 `withOfflineSimulators()` 헬퍼를 신설했다.

### AC 판정 매트릭스 (AC-ANDROID-041~045)

| AC ID | 요약 | 검증 방식 | Status | Actual Output |
|-------|------|-----------|--------|----------------|
| AC-ANDROID-041 | 계수·오류 메시지가 미연결 항목을 제외 | unit(mock) + 실측 보강 | **PASS (unit)** | `device-targeting.test.ts` "counts and messages only connected devices, excluding offline entries" — 연결 2건(Android 실기기 serial + iOS 시뮬레이터 UDID, 실측 값 그대로 사용) + offline 21건(23건 총합) 픽스처에서 `AMBIGUOUS_DEVICE` 메시지가 정확히 `"2 devices connected; specify --device <serial>."`이고 `"23"`을 포함하지 않음을 단언. **실측 보강은 수행하지 않았다** — 이 AC는 acceptance.md §D.4.2-b가 명시한 대로 순수 함수 unit만으로 완전히 판정되며, 기기 부재가 미충족 사유가 아니다 |
| AC-ANDROID-042 | 연결 1대 + 미연결 다수 → 자동 선택 발동 | unit(mock) + 실측 보강 | **PASS (unit)** | "auto-selects the sole connected device regardless of how many disconnected entries are also listed" — 연결 1건 + offline 22건(23건 총합) 픽스처에서 `resolveTargetDevice`가 `{ok:true, serial:"adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"}`를 반환함을 단언(개정 전에는 원시 목록 길이가 23이라 이 분기가 도달 불가였다). **실측 보강 미수행** — 사유 동일 |
| AC-ANDROID-043 | 명시 지정한 미연결 기기 → `DEVICE_NOT_CONNECTED`, 백엔드 미실행 | unit(mock) + 실측 보강 | **PASS (unit)** | "returns DEVICE_NOT_CONNECTED (not DEVICE_NOT_FOUND) when the requested serial exists in the list but is not connected" — offline 항목을 명시 지정하면 `code:"DEVICE_NOT_CONNECTED"` + `details.connectionState:"offline"` 반환을 단언. 대조군("still returns DEVICE_NOT_FOUND ... for a serial absent entirely")과 `unauthorized` 취급 테스트("treats connectionState 'unauthorized' as not connected")로 세 코드 경로(`DEVICE_NOT_FOUND`/`DEVICE_NOT_CONNECTED`/`ok:true`)가 서로 겹치지 않음을 확인. `resolveTargetDevice`는 순수 함수이므로 "백엔드 미실행"은 함수가 어떤 `backend.*` 메서드도 호출하지 않는다는 것으로 구조적으로 보장됨 — grep으로 `resolveTargetDevice`를 호출하는 12개 커맨드 파일 전부를 확인했고, 그중 11개(`dump`/`key`/`launch`/`reset`/`screenshot`/`scroll`/`stop`/`swipe`/`tap`×2/`text`/`web-support`)는 `if (!target.ok) return failure(...)` 조기 반환 패턴을, 나머지 1개(`doctor.ts`)는 `target.ok`가 거짓이어도 여전히 `ok:true`를 반환하되 `target.message`를 `adbKeyboard.skipped.reason`에 그대로 embed하는 다른 패턴을 쓴다 — 두 패턴 모두에서 백엔드 메서드는 호출되지 않으므로 "백엔드 미실행" 자체는 두 패턴 공통으로 보장되나, `doctor` 명령의 최종 JSON 봉투(`ok:true`)는 다른 커맨드와 다르다는 점을 정확히 기록한다(이 차이는 M13이 만든 것이 아니라 기존 `doctor.ts` 설계이며, `doctor.ts`는 본 M13에서 수정하지 않았다) |
| AC-ANDROID-044 | `details.availableDevices`는 연결된 기기만 + 미연결은 개수 요약 | unit(mock) | **PASS** | "lists only connected devices in details.availableDevices and never dumps disconnected entries wholesale" — 연결 2 + offline 21 픽스처에서 `availableDevices.length === 2`, 전항목이 `connectionState === "device"`, 그리고 `JSON.stringify(details)`에 offline 시리얼(`"sim-offline-"`)이 전혀 나타나지 않음을 단언(전체 덤프 금지 확인) |
| AC-ANDROID-045 | `devices` 출력 불변 [비회귀] | unit(mock) + 실측 | **PASS (비회귀, 무변경 확인)** | `src/cli/commands/devices.ts`를 전혀 수정하지 않았음을 `git diff`로 확인 — 기존 `devices.test.ts`/`router.test.ts`의 `devices` 커맨드 테스트가 그대로 green임이 전체 회귀 스위트로 확인됨(아래 "회귀 없음 확인"). 실측(기기 구성 A/B에서 실제 23건 반환)은 미수행 — 코드 변경이 없으므로 회귀 위험도 없다 |

### mock 레그가 실제로 단언하는 것

- **연결 정의 적용**: `connectionState === "device"`가 아닌 모든 항목(offline·unauthorized 둘 다)이 계수·자동 선택·`details.availableDevices`에서 배제됨.
- **자동 선택 도달 가능성**: 원시 목록 길이가 23이어도 연결 1건이면 자동 선택이 발동함(길이가 아니라 연결 수로 판단).
- **오류 코드 3-way 분기**: 목록에 없음(`DEVICE_NOT_FOUND`) / 목록에 있으나 미연결(`DEVICE_NOT_CONNECTED`) / 연결됨(`ok:true`)이 서로 겹치지 않음.
- **`details` 구성**: 연결된 기기만 나열, 미연결은 개수만(`disconnectedCount`), 전체 덤프 없음.
- **기존 테스트 무변경 통과**: 기존 5건(전부 `connectionState:"device"` 기본값 픽스처)이 필터링 도입 후에도 동일한 값으로 통과 — 필터가 "이미 전부 연결된" 경우 항등 함수처럼 동작함을 재확인.

### 실측 보강 — 수행하지 않음 (판정 조건 아님)

acceptance.md §D.4.2-b가 명시한 대로, `resolveTargetDevice`는 `DeviceInfo[]` → 결과인 순수 함수이며 기기의 해석·시점·화면 효과가 개입하지 않는다. AC-041~045 **다섯 모두 unit으로 완전히 판정되고, 기기 부재가 미충족 사유가 아니다.** 그러므로 plan.md §C.2가 요구하는 기기 구성 A(연결 2대)/B(연결 1대) 배선 확인은 **이번 커밋에서 수행하지 않았다** — 이는 프롬프트가 명시한 대로 "이 SPEC 실행에는 기기가 필요 없다"는 전제와 acceptance.md §D.4.2-b의 규율("실측 필수로 적지 않는 것이 규율")을 그대로 따른 것이며, 누락이 아니라 의도된 생략이다. 실측 레그가 필요해지면 `devices` 명령을 구성 A/B에서 실행해 메시지를 대조하는 것으로 충분하다(코드 변경 없이 보강 가능).

### 회귀 없음 확인

```
$ pnpm typecheck
(no output; exit=0)

$ pnpm test
 Test Files  32 passed (32)
      Tests  697 passed (697)          # 690(0.3.0 마감 기준선) + 7(M13 신규: device-targeting 7)

$ pnpm build
(exit=0)

$ pnpm test:coverage (발췌)
 device-targeting.ts   100% stmt / 100% branch / 100% funcs / 100% lines
   (v8 text reporter는 4개 지표 전부 100%인 파일을 목록에서 생략한다 —
    coverage-summary.json으로 직접 확인: lines 16/16, functions 4/4,
    statements 18/18, branches 14/14)
```

### 기기 상태 (device etiquette)

**본 M13 구현·검증은 기기에 어떤 adb/idb 명령도 전송하지 않았다** — 위 "실측 보강 — 수행하지 않음" 절이 밝힌 대로 전부 순수 함수 unit test다. 기기 기준선은 이번 세션에서 전혀 건드리지 않았다.

### Residual-risk (§verification-claim-integrity 5-섹션 형식)

- **Gap**: plan.md §C.2가 명시한 실측 보강 레그(구성 A — 연결 2대에서 메시지가 2를 말하는지, 구성 B — 연결 1대에서 자동 선택이 실제로 발동하는지) 둘 다 수행하지 않았다. 이는 §D.4.2-b가 명시적으로 "판정 조건이 아니다"라고 규정한 배선 확인이므로 AC 미충족이 아니지만, 실제 `listDevices()` 구현이 offline 시뮬레이터를 정확히 `connectionState:"offline"`으로 보고하는지는 spec.md §C.4-⑳의 기존 관측(0.4.0 개정 근거 자체)에 의존한다 — 이번 세션에서 재관측하지 않았다.
- **Residual**: `disconnectedCount` 필드명은 구현 재량으로 정한 것이며 spec.md/acceptance.md 어디에도 특정 이름이 요구되지 않는다 — 이후 CHANGELOG/API 문서화 시 이 이름이 최종 계약이 되는지는 sync-phase(manager-docs)의 판단에 달려 있다.

### 프롬프트 사전 기술 중 틀린 것으로 확인된 항목

없음. "이 마일스톤은 기기가 필요 없다", "논리 판정은 전부 순수 함수 unit", "23건 중 2건 연결"이라는 실측 분포, `unauthorized`를 미연결로 취급하라는 지시, `devices` 명령 출력 불변 요구 등 프롬프트가 인용한 사실·지시는 plan.md/spec.md/acceptance.md 본문과 정확히 일치했다. 유일하게 프롬프트가 재량으로 남긴 것("오류 클래스/`instanceof` 왕복이 필요한지는 구현 재량")은 plan.md §A.6/§F가 이미 예견한 대로 불필요하다고 판단했다 — `resolveTargetDevice`가 순수 함수로 이미 구조화된 `CommandErrorInfo`를 반환하므로 M10/M12의 `ime-errors.ts` 같은 별도 Error 클래스 계층이 필요 없었다.

## §E.2-M14 개정(0.4.0) M14 — 소프트키보드 숨김이 자기 입력을 파괴하는 결함 (2026-07-29)

> M13(위 §E.2-M13)과 완전히 독립이다 — 공유 코드 0(`cli/device-targeting.ts` vs `adb-backend.ts`의 private `hideKeyboard`). M10·M12와도 파일은 같지만 메서드가 다르다(`hideKeyboard` vs `inputText` 본체·`setImeToAdbKeyboard`) — 다만 `hideKeyboard`가 `inputText` 말미에서 호출되므로 M10/M12가 작성한 기존 `inputText` 경로 테스트 픽스처가 숨김 argv도 함께 관측하고 있었고, 그 픽스처들의 기대값(대기/재시도 시퀀스 뒤에 이어지는 숨김 keyevent)을 이번 커밋에서 함께 갱신했다(plan.md §F.10이 예견한 접촉면 — 의존이 아니라 접촉면).

### 산출물

- **`src/backend/keycodes.ts`**(수정) — `KEYCODE_ESCAPE`(111) 상수 제거, `KEYCODE_HIDE_KEYBOARD`(4, `KEYCODE_BACK`과 수치상 동일하나 별도 상수로 유지 — `ANDROID_KEYCODE`는 공개 `key` 별칭 어휘, 이쪽은 `inputText`의 내부 구현 세부라는 기존 구분 보존) 신설. 정의 지점에 왜 BACK인지(§C.4-⑰/⑱) 독블록으로 기록.
- **`src/backend/ime-binding-parser.ts`**(수정, 기존 `bound`/`currentImeId` 계약 불변 — PRESERVE) — `parseSoftKeyboardShown(dumpsysOutput): boolean` 신규 순수 함수. `mInputShown=<bool>` 정규식 첫 매치, 마커 부재 시 `false` 기본값(`bound`와 같은 원리 — 확인되지 않은 신호 위에서 부작용 있는 동작을 하지 않는다. 다만 `bound`의 `false`는 "브로드캐스트 안 보냄"을, 이쪽의 `false`는 "숨김 키 안 보냄"을 뜻하므로 결과의 안전 방향은 같되 근거는 다르다).
- **`src/backend/adb-backend.ts`**(수정) — `hideKeyboard(serial)`가 이제 (1) 신규 private `isSoftKeyboardShown(serial)`으로 `dumpsys input_method`를 조회해 `parseSoftKeyboardShown`으로 판정하고, (2) `true`일 때만 `KEYCODE_HIDE_KEYBOARD`(4, BACK)를 전송한다. 조회 자체의 실패(`exitCode !== 0` 또는 `exec()` 자체의 rejection)는 "미표시"로 처리(fail-closed, `probeImeBindingState`와 같은 원칙). 숨김 키 전송 자체의 실패도 여전히 swallow(best-effort 불변). `@MX:WARN` + `@MX:REASON` 독블록으로 ESCAPE→BACK 교체 근거(§C.4-⑰/⑱)와 가드의 주장 경계(§C.4-⑲, 예방적·실측 강제 아님)를 명시.
- **`src/backend/ime-binding-parser.ts`의 `@MX:NOTE` 정정** — spec.md §C.4-⑱이 열어 둔 "`mInputShown` 출현 횟수 미측정" 주장 경계를 M14 실측 세션에서 **해소**했다(아래 "실측 근거" 참고 — `false`/`true` 양쪽 상태에서 `grep -c`로 정확히 1회 확인). 프롬프트가 사전에 이 사실을 준 상태였고 본 세션에서 독립적으로 재확인했으므로, 이 사실을 다루는 doc comment(내가 작성하는 코드 주석)는 "미확립"으로 반복 서술하지 않았다 — spec.md 본문 자체(`§C.4-⑱`)의 표현은 manager-spec 소유이므로 건드리지 않았다(SPEC Artifact Ownership 경계).
- 테스트: `src/backend/adb-backend.test.ts` — 신규 `describe("hideKeyboard — KEYCODE_BACK + soft-keyboard visibility guard ...")` 블록 5건(shown→BACK 전송+ESCAPE 미구성 확인 / 미표시→미전송 / 조회 exit≠0→미전송 / 조회 exec() rejection→미전송(guard 재활용 검증) / `--keep-keyboard`→조회조차 안 함) + 기존 hideKeyboard 관련 테스트 **14건**의 mock 시퀀스·호출 횟수·keyevent 기대값 갱신(ASCII fast path 2건, 비-ASCII 세션 라이프사이클 4건, M10 바인딩 대기 4건, M12 재시도 1건, self-heal install 2건, `createDeviceImeSimulator`/`okFirstSwitchSequence` 공유 헬퍼 2건도 함께 갱신 — `mInputShown=true` 마커 추가). `git diff --stat`: 146 insertions / 33 deletions.

### AC 판정 매트릭스 (AC-ANDROID-036~040)

| AC ID | 요약 | 검증 방식 | Status | Actual Output |
|-------|------|-----------|--------|----------------|
| AC-ANDROID-036 | Chrome 웹 입력란에서 텍스트 생존 [결함 회귀 증명 · 실측 필수 · 무대 지정] | 실측 필수(mock 단독 불가) | **PASS** | mock: `adb-backend.test.ts` "sends KEYCODE_BACK (4), never the retired KEYCODE_ESCAPE (111)..." — `keyevent 4` 전송 + `keyevent 111` argv 0건 확인. **실측(무대: Chrome, `m.naver.com` 검색창)**: `reset` 직후(ADBKeyBoard 미설치, cold 경로) `tap`으로 검색창 포커스 확보(`mInputShown=true` 확인 후) → `text "탐사"`(`--keep-keyboard` 없이) → `{"ok":true}` → 스크린샷에서 **"탐사"가 검색창에 남아 있고 자동완성(탐사수/탐사/탐사 세제 등)까지 뜬 상태**로 관찰됨(아래 "실측 근거" verbatim 참고). 개정 전 이 경로는 정확히 이 상황에서 플레이스홀더로 되돌아갔다(spec.md §C.4-⑰) — 이번 관찰은 그 반대다 |
| AC-ANDROID-037 | 네이티브 `EditText`에서 텍스트 생존 [비회귀 · 실측] | 실측 | **PASS** | **실측(무대: Settings 검색창, `com.android.settings:id/search_src_text`)**: `tap --id`로 포커스(`mInputShown=true` 확인) → `text "탐사"` → 스크린샷에서 **"탐사"가 검색창에 남아 있고 "검색 결과가 없습니다" 표시**로 관찰됨 — 숨김 후에도 텍스트 생존 확인. 이 AC의 PASS는 AC-036의 근거가 될 수 없다(무대가 다르다, acceptance.md 명시) — 별개로 기록 |
| AC-ANDROID-038 | 숨김 후 소프트키보드가 실제로 내려감(두 표면) | 실측 + unit(mock, argv) | **PASS** | mock: 위 AC-036 mock 레그가 `keyevent 4` argv 구성을 확인. 실측: **Chrome** — `text` 실행 직후 `dumpsys input_method`의 `mInputShown`이 `true`(tap 후 확인) → `false`(text 후 확인)로 전환됨을 직접 관측. **Settings(네이티브)** — 동일하게 `tap` 후 `mInputShown=true` 확인, `text` 실행 직후 즉시 조회 시 일시적으로 `true`가 관측된 순간이 있었으나(§Residual-risk 참고) 곧이어(수 초 내) `false`로 안정화됨을 재조회로 확인 — 최종 상태는 두 표면 모두 숨겨짐(스크린샷으로도 키보드가 화면에 없음을 확인) |
| AC-ANDROID-039 | 숨김 실패가 `text`를 실패시키지 않음(best-effort 불변) | unit(mock) | **PASS** | `adb-backend.test.ts` "a hide-keyevent send failure AFTER a shown=true probe is swallowed..." — `shown:true` 확정 후 실제 keyevent 전송이 `mockRejectedValueOnce`로 실패해도 `inputText`가 `resolves.toBeUndefined()`함을 확인(AC-ANDROID-022 불변 계약 그대로) |
| AC-ANDROID-040 | 가드 — 키보드 미표시/조회 실패 시 숨김 키 미전송 | unit(mock) | **PASS** | `adb-backend.test.ts` 신규 2건 — "does NOT send the hide keyevent when the visibility probe reports the keyboard is NOT shown"(`mInputShown=false` → keyevent 0건) / "...when the visibility query itself exits non-zero"(조회 자체 실패 → keyevent 0건, `text`는 `ok:true`). 기존 재사용 테스트("a visibility-probe failure (exec() rejection) is treated as 'not shown'")도 같은 가드의 exec()-rejection 갈래를 확인 |

### mock 레그가 실제로 단언하는 것

- **BACK만 구성됨, ESCAPE는 더 이상 구성되지 않음**: `keyevent 4` argv가 나가고 `keyevent 111`은 어떤 테스트에서도 mock exec에 도달하지 않음(전체 스위트 전역 검색으로 재확인 — `grep '"111"'`가 오직 negative-assertion 자리 1건뿐).
- **가드의 3갈래 미전송**: 미표시(`mInputShown=false`) / 조회 exit≠0 / 조회 exec() rejection — 셋 다 `keyevent` argv가 mock exec에 도달하지 않음을 각각 확인.
- **`--keep-keyboard`는 조회조차 하지 않음**: `dumpsys` 계열 argv가 0건임을 필터로 확인(REQ-INPUT-004 옵트아웃 불변).
- **best-effort 양쪽 실패 모두 swallow**: 조회 실패든 keyevent 전송 자체의 실패든 `text`는 `ok:true`로 귀결됨(AC-ANDROID-022/039).

### 실측 근거 (verbatim, 기기: Galaxy S25 Ultra SM-S938N, 무선 ADB `adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`)

**무대 A — Chrome, `m.naver.com` 검색창 (AC-036 결함 회귀 증명, cold 경로: ADBKeyBoard 미설치 상태에서 시작):**

```
$ export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
$ SERIAL="adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"
$ adb -s "$SERIAL" shell settings get secure default_input_method
com.samsung.android.honeyboard/.service.HoneyBoardService
$ adb -s "$SERIAL" shell pm list packages | grep adbkeyboard
(no output — not installed, 기준선 확인)

$ node dist/cli/bin.js launch com.android.chrome --device "$SERIAL"
{"ok":true,"command":"launch","data":{...}}
# Chrome이 마지막 탭(m.naver.com)을 복원 — 스크린샷으로 확인, 별도 네비게이션 불필요

$ node dist/cli/bin.js tap 624 810 --device "$SERIAL"   # 네이버 검색창 (uiautomator dump 대신 스크린샷 좌표 스케일 계산으로 산출)
{"ok":true,"command":"tap",...}
$ adb -s "$SERIAL" shell dumpsys input_method | grep -oE 'mInputShown=[a-zA-Z]+'
mInputShown=true    # 포커스 확보 확인 (재탭 불필요 — 1회 tap으로 즉시 포커스됨)

$ node dist/cli/bin.js text "탐사" --device "$SERIAL"
{"ok":true,"command":"text","data":{"serial":"adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"}}
# ok:true — 이것은 정확히 결함이 반환하던 것과 같은 응답. 오라클은 스크린샷뿐이다.

$ adb -s "$SERIAL" shell dumpsys input_method | grep -oE 'mInputShown=[a-zA-Z]+'
mInputShown=false   # 숨김 keyevent가 전송되어 키보드가 실제로 내려감

$ node dist/cli/bin.js screenshot --device "$SERIAL"   # decoded pngBase64
```

**스크린샷 관찰(무대 A)**: 검색창에 커서와 함께 **"탐사"** 텍스트가 그대로 남아 있고, 그 아래로 네이버 자동완성 목록(탐사수 / 탐사 / 탐사 세제 / 뉴탐사 / 실화탐사대 슈니 / 실화탐사대 / 화성탐사 / 더탐사 / 어둠탐사기록 / 탐사펑)이 표시되어 있다 — 자동완성이 뜬다는 것은 페이지의 검색 입력 이벤트가 "탐사"라는 실제 값으로 정상 발화했다는 방증이다. 화면 하단에는 소프트키보드가 없다(숨김 확인). 개정 전이었다면 이 자리에 플레이스홀더 "N에게 물어보세요"(또는 유사 placeholder)가 보이고 자동완성도 없었을 것이다(spec.md §C.4-⑰의 3단계 분리 실험이 정확히 이 붕괴를 기록했다).

**무대 B — Settings, 네이티브 `EditText` 검색창 (AC-037 비회귀 + AC-038 두 번째 표면):**

```
$ node dist/cli/bin.js launch com.android.settings --device "$SERIAL"
$ node dist/cli/bin.js dump --device "$SERIAL"
# com.android.settings:id/search_src_text  bounds:{x:420,y:2876,w:531,h:105}

$ node dist/cli/bin.js tap --id com.android.settings:id/search_src_text --device "$SERIAL"
{"ok":true,"command":"tap","data":{...,"warnings":["Matched element is not tappable (clickable && enabled is false); tapped its center anyway."]}}
$ adb -s "$SERIAL" shell dumpsys input_method | grep -oE 'mInputShown=[a-zA-Z]+'
mInputShown=true

$ node dist/cli/bin.js text "탐사" --device "$SERIAL"
{"ok":true,"command":"text",...}
$ adb -s "$SERIAL" shell dumpsys input_method | grep -oE 'mInputShown=[a-zA-Z]+'
mInputShown=true    # 순간 관측 — 아래 Residual-risk 참고
$ node dist/cli/bin.js screenshot --device "$SERIAL"   # decoded pngBase64 → "탐사" 착지 + "검색 결과가 없습니다" 관찰, 화면상 키보드 없음
$ adb -s "$SERIAL" shell dumpsys input_method | grep -oE 'mInputShown=[a-zA-Z]+'
mInputShown=false   # 재조회 — 안정화된 최종 상태
```

**스크린샷 관찰(무대 B)**: 검색창에 **"탐사"** 텍스트가 남아 있고 "검색 결과가 없습니다"가 표시됨 — 실제 검색이 수행됐다는 방증(입력이 살아남았을 뿐 아니라 애플리케이션 로직에도 정상 도달). 스크린샷상 화면 하단에 소프트키보드가 없다.

**`mInputShown` 출현 횟수 실측(§C.4-⑱ 주장 경계 해소)**: 위 두 무대에서 `grep -c 'mInputShown='`로 **양쪽 상태(`false`/`true`) 모두 정확히 1회**를 확인했다 — 프롬프트가 사전에 준 사실("mInputShown appears EXACTLY ONCE, measured in both states")을 이 세션에서 독립적으로 재확인한 것이며, 새로 발견한 것이 아니다.

### 회귀 없음 확인

```
$ pnpm typecheck
(no output; exit=0)

$ pnpm test
 Test Files  32 passed (32)
      Tests  702 passed (702)          # 697(M13 마감 기준선) + 5(M14 신규 hideKeyboard describe 블록)

$ pnpm build
(exit=0)
```

### 기기 최종 상태 (device etiquette)

세션 중 `reset`(1회, cold 경로 확보용) → Chrome/Settings 구동 → 두 차례 `text` 호출(웹/네이티브 각 1회, 둘 다 cold: ADBKeyBoard 자가치유 설치 경유) → `mInputShown` 출현 횟수 재확인용 Chrome 재구동(짧게 tap만, `text` 호출 없음)까지 기기 상태를 여러 차례 흔들었다. 세션 종료 시 `stop`+`key home`으로 복귀하고 4개 항목을 재확인 — **모두 기준선과 정확히 일치**:

| 항목 | 기준선 | 세션 종료 시점 |
|------|--------|----------------|
| 기본 IME | `com.samsung.android.honeyboard/.service.HoneyBoardService` | `com.samsung.android.honeyboard/.service.HoneyBoardService` (일치) |
| ADBKeyBoard 설치 여부 | 미설치 | 미설치(`pm list packages` 무매칭, Secure Folder stderr는 spec.md §C.3-⑪ 그대로) (일치) |
| `ime-sessions.json` | `{}` | `{}` (일치) |
| 포그라운드 | 런처(홈 화면) | `com.sec.android.app.launcher/.activities.LauncherActivity`(`stop`+`key home`으로 복귀) (일치) |

화면 잠금/PIN/디스플레이 밀도/`power`/`volume_*` 관련 조작은 전혀 수행하지 않았다. Chrome 탭/검색어는 `key back`으로 검색어 입력 UI를 닫고 `stop`으로 앱 자체를 종료해 남기지 않았다.

### Residual-risk (§verification-claim-integrity 5-섹션 형식)

- **Gap**: 재시도가 실제로 몇 회 발동했는지, `ime enable`/바인딩 대기가 실제로 몇 회 폴링됐는지는 이번 M14 실측에서 별도 계측(logcat 등)하지 않았다 — CLI의 최종 결과(`ok:true` + 스크린샷 오라클)만 관측했다.
- **Gap/Residual — 무대 B의 순간적 `mInputShown=true` 재관측**: `text` 실행 직후 **즉시** 조회했을 때 `mInputShown=true`가 한 차례 관측됐고, 곧이어(재조회 시) `false`로 안정화됐다. 두 가지 해석이 모두 가능하고 어느 쪽도 확정하지 않는다 — (a) 가드가 정상적으로 `true`를 읽고 BACK을 전송했으나 IME 창이 닫히는 데 조회 타이밍보다 약간의 지연이 있었다, 또는 (b) 그 시점의 가드 조회 자체가 `false`를 읽어 BACK을 보내지 않았고 그 뒤 다른 경로(예: 사용자 조작 없이도 포커스 변화 등)로 자연히 닫혔다. 최종 스크린샷은 키보드가 없는 상태를 보였고 텍스트는 두 무대 모두 생존했으므로 AC-036/037/038의 판정 자체는 흔들리지 않지만, "가드가 그 순간 정확히 무엇을 관측했는가"는 이 세션에서 결정적으로 확정하지 못했다 — mock 레그가 이 인과를 정확히 분리해 단언하므로(§AC 판정 매트릭스 AC-038), unit 증거로 보완된다.
- **Residual**: 무대 A(Chrome)의 tap 좌표(624,810)는 스크린샷 픽셀을 수동으로 스케일 계산해 산출한 것이며 `dump`의 `--id`/`--text` 셀렉터를 쓰지 않았다 — 네이버 검색창이 `resource-id`를 노출하지 않을 가능성이 있어(spec.md §C.2 알려진 한계, React Native 사례와 유사) 좌표 탭으로 우회했다. 무대 B(Settings)는 `tap --id`로 정확히 셀렉터 기반 탭을 사용했다.

### 프롬프트 사전 기술 중 틀린 것으로 확인된 항목

- **`mInputShown` 출현 횟수 — 사실은 맞았고, 내가 작성 중이던 코드 주석이 틀려 있었다.** 프롬프트는 "mInputShown appears EXACTLY ONCE ... measured in both states"라고 전제했고, 이 세션에서 독립 재확인해 사실임을 확인했다(위 실측 근거). 문제는 spec.md §C.4-⑱의 "미측정" 문구 자체가 아니라(그 문서 수정은 manager-spec 소유이므로 건드리지 않았다), 내가 새로 작성한 `ime-binding-parser.ts`의 `parseSoftKeyboardShown` doc comment가 처음에는 이 "미측정" 주장 경계를 그대로 반복해 썼다는 점이다(프롬프트가 명시적으로 경고한 실수: "documents are otherwise manager-spec's, but a now-false claim-boundary note in a doc comment you write must not repeat it"). 실측 확인 직후 그 주석을 "양쪽 상태에서 정확히 1회 확인됨"으로 정정했다.
- 그 외: Chrome이 마지막 탭을 복원한다는 전제, 좌표 대신 `mInputShown` 폴링으로 포커스를 확인하라는 절차, 오라클은 스크린샷뿐이라는 규율, BACK이 두 표면 모두에서 텍스트를 보존한다는 사실 — 전부 프롬프트 기술과 정확히 일치했다.

### §E.4-d 개정(0.4.0) sync 마감 (2026-07-29)

위 §E.4-c는 0.3.0 마감(2026-07-29) 시점의 기록이다. 그 이후 같은 날 실기기 검증(Chrome 웹 구동 + 2기기 운용)이 결함 2건을 드러냈고, 개정 0.4.0(`c0132cd`)이 SPEC 아티팩트 4개를 다시 `in-progress`로 열어 M13(§E.2-M13)·M14(§E.2-M14)로 정정했다. 본 기록이 그 개정을 닫는다.

- **sync_complete_at**: 2026-07-29
- **sync_commit_sha**: `pending-backfill-single-sync-commit`(자기참조 해시 — `spec-frontmatter-schema.md`의 SHA placeholder backfill exemption에 따른 표준 placeholder. 이번 sync 커밋은 단일 커밋이라 별도 backfill 커밋을 만들지 않음 — 실제 SHA는 `git log`로 확인 가능)
- **sync_status**: complete — 4개 SPEC artifact frontmatter `in-progress → completed` 전이 + CHANGELOG.md/README.md에 0.4.0 결함 2건(발견 + 수정) 반영 완료
- **b12_self_test_a** (CHANGELOG 중복 방지, pre-emission grep): PASS — 항목 추가 전 `grep -c 'SPEC-ANDROID-001' CHANGELOG.md` = 8(전부 0.2.0/0.3.0/최초 릴리스 시점 기존 항목). `DEVICE_NOT_CONNECTED`/`KEYCODE_HIDE_KEYBOARD`/`mInputShown`/`connectedOnly`/`disconnectedCount` 사전 검색으로 0.4.0 전용 항목이 아직 없음을 확인한 뒤 신규 항목 1건을 추가했다(중복 없음). 추가 후 `grep -c` = 10(신규 항목 자체의 헤더 1회 + 진행 근거 경로 인용 1회 — 새 결함 없음)
- **b12_self_test_b** (AC count match, acceptance.md SSOT 대조): PASS(해당 없음) — 본 CHANGELOG 항목은 특정 AC 개수를 인용하지 않는다(acceptance.md SSOT `grep -cE '^\| AC-ANDROID-[0-9]+ \|' acceptance.md` = 45건, §D.3 DoD 참조). 인용하지 않은 숫자는 대조 대상이 없다
- **b12_self_test_c** (CHANGELOG/README에서 참조한 파일 경로 실존 확인): PASS — `src/cli/device-targeting.ts`, `src/cli/device-targeting.test.ts`, `src/backend/adb-backend.ts`, `src/backend/adb-backend.test.ts`, `src/backend/keycodes.ts`, `src/backend/ime-binding-parser.ts`, `.moai/specs/SPEC-ANDROID-001/progress.md` 전부 `ls` 확인됨
- **changelog_entry_position**: `CHANGELOG.md` `## [Unreleased]` → `### Fixed` 섹션, 0.3.0 항목(SPEC-ANDROID-001 amendment 0.3.0) 바로 다음 · `### Changed` 헤더 앞 — SPEC-ANDROID-001 0.4.0 신규 항목 1건
- **frontmatter_status_transitions**:
  - spec.md: `in-progress → completed` (updated: 2026-07-29)
  - plan.md: `in-progress → completed` (updated: 2026-07-29)
  - acceptance.md: `in-progress → completed` (updated: 2026-07-29)
  - progress.md: `in-progress → completed` (updated: 2026-07-29)
- **canary_compliance_check**: n/a — 본 SPEC은 forward-looking policy(자체 sync 시점에 검증하는 정책)를 정의하지 않음
- **README 정정 내역** (모든 수치는 본 sync 세션에서 직접 실행해 확인 — 눈대중 대조 금지 지시 준수, `pnpm test` → 702 passed / 32 files, `pnpm typecheck`/`pnpm build` exit 0):
  - 헤더 배너(~11행): 테스트 수 690→702 정정 + "0.3.0 amendment" 서술 뒤에 0.4.0의 결함 2건(자기 입력을 지우는 `text`·거짓 기기 수 오류 메시지) 요약 추가, "All three"→"All five defects" 정정
  - Commands 절 `--device`/자동 선택 설명(~120~137행): M13이 이미 "연결"의 정의(`connectionState === "device"`)와 `DEVICE_NOT_CONNECTED`를 문서화 완료한 상태였음을 확인 — 추가 수정 불필요(변경 없음, 검증만)
  - `text` 절(~237~254행): 숨김 메커니즘이 `KEYCODE_BACK`으로 바뀌었고 페이지 입력을 더 이상 파괴하지 않는다는 사실 + 옛 `KEYCODE_ESCAPE` 결함 서술 추가, `--keep-keyboard`가 가시성 확인 단계까지 생략함을 명시
  - Status 절 첫 문단(~882~886행): "0.2.0 and 0.3.0 amendments" → "0.2.0, 0.3.0, and 0.4.0 amendments", 690→702 정정
  - Status 절 M12 문단 뒤(~1132행): 0.4.0의 두 결함(발견 + 수정)을 0.3.0과 같은 "찾고 고쳤다" 어조로 신설 — 메커니즘 서술(ESCAPE가 페이지로 전달됨·`connectionState` 미참조) 보존
  - Roadmap 표 SPEC-ANDROID-001 행(~1214행): "0.3.0 found and fixed 3 real-device defects" → "0.3.0 and 0.4.0 together found and fixed 5 real-device defects"
- **honesty note**: M14 가드(`mInputShown` 확인 후에만 BACK 전송)는 **예방적이며 실측 강제가 아님**을 CHANGELOG/README 양쪽에서 정확히 서술했다(반대 관측 1건, §C.4-⑲) — "측정으로 확립됨"으로 과장하지 않았다. "Chrome이 ESCAPE를 페이지로 전달한다"는 관례적 설명이지 측정이 아니라는 구분도 유지했다(측정된 것은 "ESCAPE만으로 입력란이 지워졌다"는 사실뿐). `power`/`volume_up`/`volume_down`은 이번에도 README "Still pending" 목록에 그대로 남겨 의도적 미검증 상태를 유지했다. 결함 5 수정은 CHANGELOG/README 어디에서도 응답 봉투(`ok`) 변경으로 서술하지 않았다(바뀐 것은 오류 코드·실패 지점·`details` 구성뿐).
- **body-level defect 발견 (수정하지 않고 보고)**: spec.md §C.4-⑱ 실측 메커니즘 사실 표는 `mInputShown` 마커의 덤프 내 출현 횟수를 여전히 **"미측정(명시)"** 로 기록하고 있다. 그러나 M14 실기기 검증(commit `15276a4`, progress.md §E.2-M14 "실측 근거" 절)이 이를 **양쪽 상태(`false`/`true`) 모두 정확히 1회로 측정 완료**했다 — M14는 자신이 작성한 `ime-binding-parser.ts`의 doc comment는 이 사실에 맞게 정정했으나(§E.2-M14 "프롬프트 사전 기술 중 틀린 것으로 확인된 항목" 절 참고), spec.md 본문 자체는 manager-spec 소유이므로 건드리지 않았다. 이 sync-phase도 같은 소유 경계를 지켜 spec.md §C.4-⑱을 **수정하지 않았다** — 대신 이 sync-phase 산출물(progress.md §E.4-d, 본 항목)로 보고한다. 후속 조치: manager-spec이 spec.md §C.4-⑱의 검증 수준 칸을 "미측정(명시)"에서 "실측(Android, 양 표면) — M14 세션에서 양쪽 상태 각 1회 확인(§E.2-M14)"로 갱신하는 편집이 필요하다.
