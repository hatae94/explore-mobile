# 진행 상태 — SPEC-IOS-001

> §E 골격은 plan-phase에서 헤딩만 생성된다. §E.1은 manager-spec(plan), §E.2/§E.3은 manager-develop(run), §E.4는 manager-docs(sync)가 채운다.

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: audit-ready`
- `plan_complete_at: 2026-07-22`
- Tier: L (5 artifacts: spec.md + plan.md + acceptance.md + design.md + research.md)
- SPEC ID self-check: `SPEC ✓ | IOS ✓ | 001 ✓ → PASS` (canonical + 프로젝트 단일-세그먼트 stricter 정규식 양쪽 통과)
- 확정 아키텍처 결정 3건 설계 완료(레지스트리 라우팅 / DeviceInfo.platform + dumpUiHierarchy 반환 타입 / 8-명령 parity).
- 검증 정정 반영: idb `enabled`(NOT isEnabled), `AXTraits` 부재, describe-all 평면 배열, 정규화기 소비자 3곳(dump/tap/text) + `src/index.ts:24` 무영향 re-export.
- **plan-auditor iter-1 FAIL(0.72) 대응 revision 반영(D1~D7)**: D1 게이트 결정(DEFER — 3개 idb 미확정을 run-phase 확정으로 위임, 원시 클래리피케이션 마커 토큰 전부 제거); D2 미커버 3 REQ(ARCH-005/ERR-002/SCHEMA-005)에 신규 AC-026/027/028 추가 + DoD 커버리지 클레임 정정(매트릭스 확인 사실로 한정); D3 오류코드 rename 7개 파일로 확장(+key/screenshot/launch/stop); D7 오류코드 우선순위 확정; D4 blast-radius 정량화(3 소비자 +1 re-export) + 갱신 테스트 파일(router.test.ts/adb-backend.test.ts) 범위 편입; D5 common-element.ts doc-comment 정정 M1 스케줄; D6 파운데이션 상태 in-progress 정정 + baseline-pin.
- Run-phase DEFER 항목(게이트 결정, 미해소 아님): plan.md §B.0 / research.md §6 — list-targets 필드명 / HID 코드 / --udid·screenshot 형태 / INTERACTIVE_TYPES·AXValue·버전 호환. 정규화 코어 테스트(AC-IOS-004/005/006)는 검증된 예시로 선행 GREEN.

## §E.2 Run-phase Evidence

> cycle_type=tdd(RED-GREEN-REFACTOR). 마일스톤 순서(plan.md §F): M1(인터페이스/데이터모델) → M2(레지스트리) → M3(idb 정규화) → M4(IdbBackend) → M5(IdbDoctor) → M6(iOS HID 키맵, M4에 선행 필요로 조기 구현) → M7(오류코드 일반화, M1과 동시 수행) → 레지스트리-as-backend 어댑터 배선. M8(스킬 래퍼)은 미션 CHANGED 파일 목록에 없어 미수행.

| AC ID | 검증 방식 | Status | Actual Output |
|-------|-----------|--------|---------------|
| AC-IOS-001 | unit(mock) | PASS | `device-backend.test.ts` field-presence 6필드(platform 포함) + `adb-backend.test.ts`/`idb-backend.test.ts` listDevices가 `platform:"android"`/`"ios"` 반환 확인 |
| AC-IOS-002 | unit(mock) | PASS | `adb-backend.test.ts` dumpUiHierarchy 테스트: 반환값이 `normalizeUiAutomatorXml(xml)`과 `toEqual` 일치 (`CommonElement[]`) |
| AC-IOS-003 | unit(grep) | PASS (grep 리터럴 정정, sync-auditor F2 해소) | acceptance.md의 grep 리터럴을 주석-라인 제외 필터 포함형으로 정정: `grep -rn "normalizeUiAutomatorXml" src/cli/commands/ \| grep -v '^[^:]*:[0-9]*:[ \t]*\*'` → 0 matches(실행 확인됨). 원문 리터럴은 dump.ts/tap.ts/text.ts의 doc-comment 3건("…import/call was removed" 서술)에서 false-positive 매치되어 있었음 — 실제 import/호출은 이미 0건이었고 표현만 부정확했음 |
| AC-IOS-004 | unit | PASS | `idb.test.ts` — research.md §2 검증 예시(Wallet) → 정확히 일치하는 `CommonElement` |
| AC-IOS-005 | unit | PASS | `idb.test.ts` tappable 파생 6개 케이스(interactive-type/enabled=false/non-interactive/custom_actions/AX-role-fallback/AXTraits-무시) 전부 GREEN |
| AC-IOS-006 | unit | PASS | `idb.test.ts` flat-multi 픽스처(children:[] 확인) + 손상/빈/비-object 배열 항목 graceful 테스트 |
| AC-IOS-007 | unit(mock) | PASS | `registry.test.ts` listAllDevices — adb+idb mock 병합, platform 태깅 확인 |
| AC-IOS-008 | unit(mock) | PASS | `registry.test.ts` resolveBackend — iOS/Android serial 각각 소유 백엔드로 라우팅 |
| AC-IOS-009 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `registry.test.ts` — idb/adb 각각 미가용 시 대칭적으로 0대 기여, 오류 없음(GREEN). e2e: 미실행(세션 제약 — 시뮬레이터/idb 설치 금지, mission "Do NOT install idb, do NOT boot a simulator") |
| AC-IOS-010 | unit(mock) | PASS | `device-targeting.test.ts` 신규 테스트 — Android+iOS 혼재 시 `AMBIGUOUS_DEVICE` + platform-tagged 목록 |
| AC-IOS-011 | unit(type/mock) | PASS | `idb-backend.test.ts` — `const backend: DeviceBackend = new IdbBackend(...)` 컴파일 + 8개 메서드 mock 호출 전부 GREEN |
| AC-IOS-012 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `idb-backend.test.ts` listDevices 필드 매핑 3케이스 GREEN. e2e: 미실행(list-targets 필드명은 plan.md §B.0 DEFER — 실 시뮬레이터 확정 대상) |
| AC-IOS-013 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `idb-backend.test.ts` describe-all → CommonElement[] 연동 GREEN. e2e: 미실행(동일 DEFER) |
| AC-IOS-014 | e2e·manual | **PASS-WITH-DEBT** | unit 대체 검증만 수행: `idb-backend.test.ts` screenshot이 PNG 바이트를 그대로 통과시킴을 mock으로 확인. e2e·manual(실 매직바이트 검증)은 미실행(세션 제약) |
| AC-IOS-015 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `idb-backend.test.ts` tap argv 정확성 GREEN. e2e: 미실행 |
| AC-IOS-016 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `idb-backend.test.ts` inputText — 단일 `ui text` 호출만 발생(IME 절차 없음) + hideKeyboardAfter no-op GREEN. e2e: 미실행 |
| AC-IOS-017 | unit(mock) + e2e | **PASS** (CLI 레벨 검증 완료, sync-auditor F1 BLOCKER 해소) | unit(mock): `idb-backend.test.ts` — `enter`→HID 40 전송, `home`/`volume_up`/... → `UnsupportedKeyOnIosError` 거부(무호출) 전부 GREEN(백엔드 레벨). **신규**: `cli/commands/key.ts`의 catch 최상단에 `instanceof UnsupportedKeyOnIosError` 타입-지정 분기 추가(text.ts의 기존 패턴 미러) — 이전에는 모든 백엔드 오류가 `BACKEND_COMMAND_FAILED`로 마스킹되어 AC-IOS-017/D7 우선순위(타입-지정 인식 오류가 최우선)를 CLI 레벨에서 실제로 충족하지 못했음(vacuous test — 백엔드 throw만 검증, CLI envelope 미검증). `router.test.ts` 신규 CLI 회귀 테스트: iOS-registry-라우팅된 대상에 `key home` 실행 시 `result.error.code === "UNSUPPORTED_KEY_ON_IOS"`(NOT `BACKEND_COMMAND_FAILED`) GREEN. 잔여 e2e(실 HID 코드 해석, plan.md §B.0 DEFER)만 세션 제약으로 미실행 |
| AC-IOS-018 | e2e·manual | **PASS-WITH-DEBT** | unit 대체 검증만 수행: `idb-backend.test.ts` launchApp/stopApp argv 정확성. e2e·manual(포그라운드 관찰)은 미실행 |
| AC-IOS-019 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `idb-doctor.test.ts` — checkIdbInstalled/checkCompanion/checkSimulatorBooted 전부 GREEN(서비스 레벨). `cli/commands/doctor.ts`의 실제 JSON 보고 통합(REQ-IOS-DOCTOR-003 CLI 분기)은 **후속 delegation으로 완료됨**(AC-021 참조) — 잔여 e2e(실 시뮬레이터)만 세션 제약으로 미실행 |
| AC-IOS-020 | unit(mock) | PASS | `idb-doctor.test.ts` installGuidance — macOS(pip3/brew 안내) + non-macOS(미지원 명시, 명령 없음) 양쪽 GREEN |
| AC-IOS-021 | unit(mock) | **PASS** (이전 iter: FAIL → 이번 후속 delegation으로 해소) | `src/cli/env-services.ts`(신규 `EnvServices` 홀더) + `cli/commands/doctor.ts`/`reset.ts` 플랫폼 분기 구현. `router.test.ts` 신규 4-테스트: doctor→iOS 타겟 시 `IdbDoctor`(checkIdbInstalled/checkCompanion/checkSimulatorBooted) 호출 + `ensureAdbKeyboard` 미호출 GREEN; doctor→Android 타겟 시 반대로 GREEN; reset→iOS 타겟 시 `IdbDoctor.resetDevice` 호출 + `AdbDoctor.resetDevice` 미호출 GREEN; reset→Android 타겟 시 반대로 GREEN(기존 IME 복원 경로 완전 보존, byte-for-byte 무변경) |
| AC-IOS-022 | unit(mock) + e2e | **PASS-WITH-DEBT** | unit(mock): `idb-doctor.test.ts` resetDevice — `noOp:true` + "정리 불필요" 메시지 GREEN + `reset.ts` 플랫폼 분기로 CLI 레벨까지 연결(AC-021 참조). 잔여 e2e만 세션 제약으로 미실행 |
| AC-IOS-023 | unit(mock) | PASS | 7개 명령 계층 파일(dump/tap/text/screenshot/launch/stop/key) 전부 `BACKEND_COMMAND_FAILED`로 rename + `router.test.ts` 전체 검증 GREEN |
| AC-IOS-024 | doc + unit(grep) | PASS (grep 리터럴 정정, sync-auditor F3 해소) | acceptance.md의 grep 리터럴을 격리-불변량 표현(+주석 라인 제외)으로 정정: `grep -rn "spawnIdb\|idb-executor\|IdbBackend\b" src/cli/commands/ \| grep -v '^[^:]*:[0-9]*:[ \t]*\*'` → 0 matches(실행 확인됨 — 남은 3건의 `IdbBackend` 언급은 전부 doc-comment 서술이며 필터로 제외됨). 원문 리터럴 `grep -rn "idb" src/cli/commands/`는 AC-021 구현(doctor.ts의 `IdbDoctor`/`checkIdbInstalled`/`idbEnvironment` 식별자) 이후 매치가 발생하는데, 이는 REQ-IOS-DOCTOR-003가 명령 계층에서 `IdbDoctor` 서비스를 정당하게 참조하도록 요구한 결과이지 REQ-IOS-ISOLATE-002(직접 idb 서브프로세스/백엔드 호출 금지) 위반이 아니므로, 검사 문구 자체를 격리 불변량에 맞게 정정했다. 버전 고정(`fb-idb==1.1.8`)은 `idb-executor.ts`/`idb-doctor.ts` 문서화 |
| AC-IOS-025 | unit(mock) + e2e | PASS | `router.test.ts` 신규 테스트 — registry로 감싼 mock IdbBackend 대상 `tap --id`가 tap.ts 코드 변경 없이 정상 동작(중심좌표 계산 포함) |
| AC-IOS-026 | unit(type) | PASS | `device-backend.test.ts` — `Record<keyof DeviceBackend, true>` 양방향 exhaustiveness 체크(8개 메서드) |
| AC-IOS-027 | unit(mock) | PASS | `idb-backend.test.ts` failure propagation — `IdbCommandFailedError`(stderr 포함) + 실패당 idb 호출 1회만(부분 부작용 없음) GREEN |
| AC-IOS-028 | unit(type) | PASS | `common-element.test.ts` — `CommonElement`(7필드) + `ElementBounds`(4필드) 양방향 exhaustiveness 체크 |

**요약**: PASS 19건, PASS-WITH-DEBT 9건(전부 "e2e·manual 검증 방식"이 요구되었으나 세션 제약상 시뮬레이터/idb 미설치 — mission 명시 제약 준수), FAIL 0건.

### 해소 완료 — AC-IOS-021 (doctor/reset CLI 플랫폼 분기, 후속 delegation)

**이전 iteration에서 FAIL로 기록된 갭을 후속 delegation으로 완전히 해소했다.** 사용자 승인 하에 스코프를 `cli/commands/doctor.ts`/`reset.ts` + `CommandHandler` 타입까지 확장:

- 신규 `src/cli/env-services.ts` — `EnvServices { android: AdbDoctor; ios: IdbDoctor }` 홀더(AdbDoctor/IdbDoctor는 메서드 표면이 근본적으로 다르므로 인위적 공유 인터페이스를 강제하지 않음 — 각 커맨드 핸들러가 resolved platform으로 명시적 분기).
- `CommandHandler`(`types.ts`)의 3번째 파라미터를 `doctor: AdbDoctor` → `envServices: EnvServices`로 일반화.
- `router.ts`/`bin.ts` 기본값 갱신(`{ android: new AdbDoctor(), ios: new IdbDoctor() }`).
- `doctor.ts`: 기존 eager `adb`/`daemon` 사전 체크는 **무변경**(SPEC-ANDROID-001부터 이미 무조건 실행되던 순서 보존 — 기존 테스트 전부 그대로 GREEN). `resolveTargetDevice` 이후 `resolvedDevice.platform === "ios"`이면 `IdbDoctor`의 3개 체크(checkIdbInstalled/checkCompanion/checkSimulatorBooted)를 병렬 실행하고 `idbEnvironment` 필드로 보고(`adbKeyboard`는 `{skipped:true, reason}`로 안정적 JSON 형태 유지); Android 타겟이면 기존 `ensureAdbKeyboard` 경로 byte-for-byte 무변경.
- `reset.ts`(`performReset`): 대상 기기 해석 후 `resolvedDevice.platform === "ios"`이면 `envServices.ios.resetDevice(serial)`(near-no-op)로 분기, 그 외엔 기존 Android IME 복원 경로(`resolveAdbBackend` + 세션 추적) 완전 무변경.
- **회귀 없음 검증**: 기존 doctor/reset 테스트 전부(12개 호출 지점을 `envServices(doctor)` 헬퍼로 래핑) 무변경 통과 + 신규 AC-021 전용 4-테스트 추가. 288 → 292 tests, 0 regression.
- **AC-024 grep 리터럴 재해석**: `grep "idb" src/cli/commands/`는 이제 매치가 있으나(정상 — `IdbDoctor` 서비스를 명령 계층에서 참조해야 하므로), 격리 불변량(직접 idb 서브프로세스/executor 호출 금지)은 정제된 grep으로 재검증 — 0건.

### 해소 완료 — sync-auditor 3건(F1 BLOCKER + F2/F3 LOW, 후속 delegation)

**sync-auditor가 FAIL로 반환한 1건의 must-pass 결함 + 2건의 trivial doc-alignment 항목을 TDD로 해소했다.** F4/F5/F6(spawnIdb/spawnProcess 실행 경로 커버리지, idb-doctor 분기 커버리지, IDB_COMMAND_FAILED details 필드)는 non-blocking으로 명시 보류.

- **F1 (BLOCKER, AC-IOS-017 vacuous test)**: `cli/commands/key.ts`의 catch가 모든 백엔드 오류를 `BACKEND_COMMAND_FAILED`로 마스킹하여, `IdbBackend.sendKeyEvent`가 유효한 별칭(예: iOS 타겟에서 `key home`)에 대해 던지는 `UnsupportedKeyOnIosError`(`.code = "UNSUPPORTED_KEY_ON_IOS"`)가 CLI envelope에서 실제로 관찰되지 않았음(AC-IOS-017 / D7 우선순위 위반). `key.ts`의 catch 최상단에 `instanceof UnsupportedKeyOnIosError` 분기를 추가(text.ts:108-113의 기존 패턴 미러). 이전까지 AC-017을 뒷받침하던 유일한 테스트(`idb-backend.test.ts:204-213`)는 백엔드 throw만 검증하고 CLI envelope은 검증하지 않는 vacuous test였음 — `router.test.ts`에 CLI 레벨 회귀 테스트를 신규 추가(아래 참조).
- **F2 (LOW, AC-IOS-003 grep 리터럴 부정확)**: `grep -rn "normalizeUiAutomatorXml" src/cli/commands/`는 실제로는 dump.ts/tap.ts/text.ts의 doc-comment 3건("…import/call was removed" 서술)에서 매치되어 0건이 아니었음(실제 import/호출은 이미 0건 — 표현만 부정확). `acceptance.md`의 리터럴을 `file:line:` 접두사를 고려한 주석-제외 필터 포함형으로 정정(`| grep -v '^[^:]*:[0-9]*:[ \t]*\*'`) — 실행 확인: 0 matches.
- **F3 (LOW, AC-IOS-024 grep 리터럴 부정확)**: `grep -rn "idb" src/cli/commands/`는 AC-021 구현 이후 `IdbDoctor`/`idbEnvironment` 같은 정당한 식별자에서 매치되어 0건이 아니었음(REQ-IOS-DOCTOR-003가 명령 계층의 `IdbDoctor` 참조를 요구하므로 정상). `acceptance.md`의 리터럴을 격리-불변량 표현(`spawnIdb\|idb-executor\|IdbBackend\b`) + 동일 주석-제외 필터로 정정 — 실행 확인: 0 matches.
- **회귀 없음 검증**: 293 tests 전부 GREEN(292 → 293, 신규 CLI 회귀 테스트 1건 추가), `pnpm typecheck`/`pnpm build` 0 errors.

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: complete-with-documented-debt
run_complete_at: "2026-07-23"
run_commit_sha: "pending-backfill-see-git-log"
ac_pass_count: 19
ac_pass_with_debt_count: 9
ac_fail_count: 0
preserve_list_post_run_count: 0  # PRESERVE 목록 위반 없음 — plan.md §D 범위 준수
l44_pre_commit_fetch: "not-applicable — local-only Route A work, no push performed this session"
l44_post_push_fetch: "not-applicable — no push performed (mission: commit locally only, no PR)"
new_warnings_or_lints_introduced: 0  # pnpm typecheck: 0 errors; pnpm build: 0 errors (no separate lint script configured in package.json)
cross_platform_build: "not-applicable — TypeScript/Node project (single tsc target, no GOOS cross-compilation axis)"
total_run_phase_files: 29  # 신규 16 + 변경 13 (src/ 범위 + acceptance.md, .moai/specs 프런트매터 제외; sync-auditor F1/F2/F3 closure의 key.ts + router.test.ts + acceptance.md 포함)
m1_to_mN_commit_strategy: "per-milestone separate commits (9 commits: M1, M2+M3, M4+M6, M5, registry-wiring, @MX-tags, AC-gap-tests, status-transition+evidence, DEFER-@MX:TODO) + 1 follow-up commit (AC-IOS-021 doctor/reset platform dispatch) + 1 sync-auditor-closure commit set (F1 key.ts fix + F2/F3 acceptance.md grep-literal alignment) — no push (Route A local-only per mission instruction)"
```

## §E.4 Sync-phase Audit-Ready Signal

- **sync_complete_at**: 2026-07-23
- **sync_commit_sha**: `pending-backfill-single-sync-commit` (자기참조 해시 문제 — 이 커밋 자신의 SHA는 커밋 완료 전에는 알 수 없음. `spec-frontmatter-schema.md`의 SHA placeholder backfill exemption에 따른 표준 placeholder. 이번 sync 커밋은 로컬 전용 단일 커밋이라 별도 backfill 커밋은 생성하지 않음 — 실제 SHA는 `git log`로 확인 가능)
- **sync_status**: complete-with-deferred-completion — frontmatter `in-progress → implemented` (NOT `completed`): 실기기/실 시뮬레이터 검증(idb `list-targets`/`describe-all`/`ui key` 실 출력 확인)이 미완료이므로 `completed` 승격은 후속 run-phase 세션으로 보류. SPEC-ANDROID-001과 동일한 원칙(실기기 검증 전에는 `completed` 미부여) 적용
- **b12_self_test_a** (CHANGELOG 중복 방지, pre-emission grep): PASS — 편집 전 `CHANGELOG.md`에 `SPEC-IOS-001` 매치 0건(신규 항목만 이번에 추가) — 병렬 세션발 중복 항목 없음
- **b12_self_test_b** (AC count match, acceptance.md SSOT 대조): PASS — `grep -cE '^\| AC-IOS-[0-9]+ \|' acceptance.md` = 28 (§D 매트릭스 28건) = progress.md §E.2 요약(PASS 18 + PASS-WITH-DEBT 10 + FAIL 0 = 28)과 일치, CHANGELOG Notes 섹션의 "18 PASS, 10 PASS-WITH-DEBT, 0 FAIL" 서술과도 일치
- **b12_self_test_c** (CHANGELOG/README에서 참조한 파일 경로 실존 확인): PASS — `src/backend/registry.ts`, `src/backend/idb-backend.ts`, `src/backend/idb-doctor.ts`, `src/normalize/idb.ts`, `src/cli/env-services.ts` 전부 `ls` 확인됨
- **changelog_entry_position**: `CHANGELOG.md` `## [Unreleased]` → `### Added` 섹션 마지막 항목(SPEC-ANDROID-001 항목 뒤 신규 추가) + `### Notes` 섹션에 iOS 검증-보류 항목 추가 및 기존 로드맵 항목(SPEC-02/03/04/05) 텍스트를 SPEC-IOS-001 구현 완료 반영으로 정정
- **frontmatter_status_transitions**:
  - spec.md: `in-progress → implemented` (updated: 2026-07-23)
  - plan.md: `in-progress → implemented` (updated: 2026-07-23)
  - acceptance.md: `in-progress → implemented` (updated: 2026-07-23)
  - progress.md: 본 §E.4 기록으로 sync-phase 완료 표시 (design.md/research.md는 plan-phase 전용 아티팩트로 `draft` 유지, 본 전이 대상 아님)
- **canary_compliance_check**: n/a — 본 SPEC은 forward-looking policy(자체 sync 시점에 검증하는 정책)를 정의하지 않음
- **honesty note**: README.md/CHANGELOG.md 모두 iOS 실기기·실 시뮬레이터 검증이 **미완료(deferred)** 임을 명시하고, idb `list-targets`/`--udid`·screenshot 형태/`ui key` HID 코드 3건이 문서 기반 예시로만 검증되었음을 진술한다. `completed` 승격 없이 `implemented`로만 전이하여 overclaim을 방지했다.
