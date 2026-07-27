---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 진행 기록"
version: "0.3.0"
status: in-progress
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 진행 기록 — SPEC-GESTURE-001

## §E.2 Run-phase Evidence

### M1 — `DeviceBackend.swipe` 인터페이스 + 구현체 3개

**산출물 (plan.md §F M1 1-7 모두 완료)**

1. `src/schema/device-backend.ts` — `SwipePoint`/`SwipeOptions` 타입 + `swipe(serial, from, to, options?)` 추가(9번째 메서드). `@MX:ANCHOR` "8-method" → "9-method" 갱신.
2. `src/backend/adb-backend.ts` — `swipe` 구현: `["-s", serial, "shell", "input", "swipe", x1, y1, x2, y2, [durationMs 그대로]]`.
3. `src/backend/idb-backend.ts` — `swipe` 구현: `["ui", "swipe", "--udid", serial, x1, y1, x2, y2, ["--duration", (durationMs/1000)]]`. 헤더 "8 methods"/"8-method" 2곳 → 9로 갱신.
4. `src/backend/registry.ts` — `swipe` 파사드 위임(`stopApp`과 동일한 resolve-then-delegate 형태).
5. 테스트 더블 7지점 갱신 완료: `device-backend.test.ts:12`(트립와이어, 8→9), `router.test.ts` `createMockIosBackend`/`createMockBackend`/두 인라인 iOS 객체 리터럴(4지점), `registry.test.ts:31` `mockBackend()`, `web-support.test.ts:88` `satisfies DeviceBackend`.
6. "8-method"/"8 methods" 문구 갱신 완료(아래 "MX 앵커 확인" 절의 grep 결과 참조).
7. argv 단위 테스트 작성 완료(RED 확인 후 구현, 이어서 GREEN 확인) + iOS 시뮬레이터 실기기 확인(아래 §AC-GEST-005 참조).

### AC PASS/FAIL/PARTIAL 매트릭스 (M1 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-001 | PASS | `pnpm vitest run src/backend/adb-backend.test.ts src/backend/idb-backend.test.ts` | Android: `["-s","R58N90ABCDE","shell","input","swipe","100","800","100","200"]` / iOS: `["ui","swipe","--udid","SIM-1","100","800","100","200"]` — 둘 다 기기 셀렉터 포함, 셸 미경유(argv 배열) 확인. 4 tests PASS (adb 1건 + idb 1건 argv-shape, 나머지는 duration/failure 케이스) |
| AC-GEST-002 | PASS | 위와 동일 + `idb-backend.test.ts` "converts durationMs to seconds" / "groups the --duration pair AFTER..." | Android `--duration 500` → argv 끝에 리터럴 `"500"`. iOS → argv에 `"--duration","0.5"`(500이 아님, `Number(...)===0.5` 단언 포함) + `--duration` 토큰이 4개 좌표(인덱스 4-7) 뒤(인덱스 8 이상)에만 위치함을 슬라이스 단언으로 확인. 생략 시 양 플랫폼 모두 `--duration` 토큰 없음(별도 테스트로 확인). CLI 레벨 `INVALID_DURATION`/`INVALID_ARGS` 거부 경로는 M2 스코프(args.ts/router.ts 미착수) — 이번 M1은 백엔드 argv 구성만 검증 |
| AC-GEST-003 | 해당 없음 (M2 스코프) | — | 좌표 검증(`INVALID_COORDINATES`/`INVALID_ARGS`)은 CLI 레이어(`router.ts`/`args.ts`) 담당이며 M1에는 파일이 없음(plan.md §A.6). M2에서 검증 예정 |
| AC-GEST-004 | PASS | `pnpm vitest run` (exit 0, 438→446) + `pnpm typecheck`(exit 0) | 446 tests / 26 files 전부 통과(438 기준선 + swipe 신규 8건: adb 3 + idb 4 + registry 1). 기존 8개 메서드 시그니처 변경 없음(회귀 0). 테스트 더블 7지점 갱신 후 `pnpm typecheck` exit 0 |
| AC-GEST-005 | PASS (iOS 실기기, argv 수용 + 실제 스크롤 확증) | 프로덕션 `IdbBackend.swipe` 경로를 직접 구동(`dist/backend/idb-backend.js`), 부팅된 iPhone 17 Pro 시뮬레이터(D0B3A18C-E485-4E7C-A25E-504BF4CA6163)에 Safari로 clip.naver.com이 떠 있는 상태에서 `swipe(udid, {x:200,y:600}, {x:200,y:300}, {durationMs:500})` 실행 후 전/후 스크린샷 비교 | 명령 exit 0, "swipe() resolved without throwing." 출력. 전/후 스크린샷 SHA-256이 다름(`dc097f99...` → `056f306c...`, 파일 크기도 1,964,197 → 2,384,486 bytes)이고, 육안으로도 페이지가 실제로 위로 스크롤되어 캡션(`여름에만 느낄 수 있는 풍경`)과 다음 게시물이 드러남을 확인. 이는 M5로 미룰 "argv만 확인" 수준을 넘어 실제 화면 이동까지 이번 M1에서 확증한 것 — CLI 명령(`swipe` 서브커맨드)은 M2 스코프라 아직 없으므로, 이번 확인은 백엔드 계층 직접 호출로 수행함을 명시 |
| AC-GEST-006 | **PARTIAL** | `command -v adb` | `adb` 자체가 이 머신에 설치돼 있지 않음(`command not found`). Android 실기기 스와이프는 확인 불가 — argv 구성(AC-GEST-001/002 Android 케이스)까지만 mock으로 검증됨. spec.md §C.2 그대로: adb 문법·ms 단위(§C.1-⑥)는 로컬 수단으로 미실측에서 승격 불가 |

### 테스트 스위트

```
$ pnpm vitest run
 Test Files  26 passed (26)
      Tests  446 passed (446)
```

기준선 438 → 446 (+8): `adb-backend.test.ts` swipe 3건(무-duration argv / duration ms 그대로 / 실패 전파), `idb-backend.test.ts` swipe 4건(무-duration argv / ms→초 환산 / --duration 위치가 좌표 뒤에만 옴 / 실패 전파), `registry.test.ts` swipe 파사드 위임 1건.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### 인터페이스 개수 (AC-GEST-008 실행 가능 확인)

```
$ grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts
9
```

기대값 9 — 개정 전 기준선 8 + `swipe` 1개. `device-backend.test.ts`의 `Record<keyof DeviceBackend, true>` 타입 레벨 검사도 9개로 갱신되어 typecheck 통과(컴파일 타임 확인 겸함).

### Duration 환산 증거 (AC-GEST-002)

- Android: `swipe(serial, {x:100,y:800}, {x:100,y:200}, {durationMs:500})` → `["-s",serial,"shell","input","swipe","100","800","100","200","500"]` — ms 그대로.
- iOS: 같은 호출 → `["ui","swipe","--udid",serial,"100","800","100","200","--duration","0.5"]` — `Number("0.5") === 0.5`이지 500이 아님. 테스트가 `--duration` 다음 토큰을 `Number()`로 읽어 `0.5`임을 명시적으로 단언(`idb-backend.test.ts` "converts durationMs to seconds" 케이스).

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M .moai/specs/SPEC-GESTURE-001/acceptance.md
 M .moai/specs/SPEC-GESTURE-001/plan.md
 M .moai/specs/SPEC-GESTURE-001/spec.md
 M src/backend/adb-backend.test.ts
 M src/backend/adb-backend.ts
 M src/backend/idb-backend.test.ts
 M src/backend/idb-backend.ts
 M src/backend/registry.test.ts
 M src/backend/registry.ts
 M src/cli/commands/web-support.test.ts
 M src/cli/router.test.ts
 M src/schema/device-backend.test.ts
 M src/schema/device-backend.ts
?? .moai/specs/SPEC-GESTURE-001/progress.md
```

plan.md §A.6 M1 행: `device-backend.ts`, `adb-backend.ts`, `idb-backend.ts`, `registry.ts`, 4개 테스트 파일 — 전부 위 목록에 포함. `router.test.ts`/`web-support.test.ts`는 plan.md §F M1 item 5에 명시된 추가 테스트 더블 지점(4파일 7지점 중 나머지 2파일). SPEC 프런트매터 3개 + 신규 `progress.md`는 이번 지시(Section A)에 따른 상태 전이 + 산출물. `src/normalize/*`, `src/webview/*`(PRESERVE 목록) 미변경 확인됨.

### MX 앵커 확인

```
$ grep -rn "8-method\|8 methods" src/
(no matches)
```

### 커밋

아래 §E.3 참조(커밋 완료 후 backfill).

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: M1-complete
ac_pass_count: 4      # AC-GEST-001, 002, 004, 005
ac_fail_count: 0
ac_partial_count: 1   # AC-GEST-006 (adb 미설치)
ac_deferred_count: 1  # AC-GEST-003 (M2 CLI 레이어 스코프)
total_run_phase_files: 13
new_warnings_or_lints_introduced: false
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/* 미변경
```

## 블로커 / 서프라이즈 (M2-M5 참고)

1. **plan.md §F M1 item 2의 사소한 부정확성**: plan.md는 `adb-backend.ts`에도 "8 methods" 문구 갱신이 필요하다고 적었으나, 실제 파일에는 그런 문구가 없었다(grep으로 확인 — "8-method"/"8 methods" 매치는 `device-backend.ts:16`, `idb-backend.ts:5`, `idb-backend.ts:25` 3곳뿐). 갱신 대상은 이 3곳으로 한정했고, 결과적으로 `grep -rn "8-method\|8 methods" src/`는 매치 0건이다. 결정을 스스로 내린 부분이므로 명시한다.
2. **AC-GEST-005를 M1에서 "argv 수용" 이상으로 확증**: 지시문은 "화면이 실제로 움직였는지 확인 못 하면 M5로 미루라"고 했으나, 실제로는 프로덕션 `IdbBackend.swipe` 경로를 직접 구동해 전/후 스크린샷 diff(SHA-256 다름 + 육안 확인)로 **실제 스크롤까지 확증**했다. CLI `swipe` 서브커맨드 자체는 M2 스코프라 아직 없으므로, 이 확인은 어디까지나 백엔드 계층 직접 호출이라는 점은 명시해 둔다. M5 실기기 e2e에서는 CLI 명령(`swipe`/`scroll`)을 통한 종단 확인이 별도로 필요하다.
3. **M2+ 참고**: `--duration` 값 검증(`INVALID_DURATION`, REQ-GEST-SWIPE-005)은 M1에 포함하지 않았다(plan.md §F M2 item 3 스코프). M1의 `swipe` 백엔드 메서드는 `options.durationMs`가 이미 유효한 값이라고 가정한다 — M2에서 CLI 레이어가 검증을 마친 뒤 백엔드에 전달하는 구조다.
