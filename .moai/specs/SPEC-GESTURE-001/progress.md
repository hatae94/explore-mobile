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

M1 커밋 SHA: `9c98e3a`(HEAD, 이번 M2 작업 시작 시점 기준선).

### M2 — `swipe` CLI 명령

**산출물 (plan.md §F M2 1-3 모두 완료)**

1. `src/cli/args.ts` — `duration: { type: "string" }` 옵션 추가, `ParsedCommandArgs.duration` 필드 추가.
2. `src/cli/commands/swipe.ts`(신규) — `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` 핸들러. `tap.ts`와 동일한 구조(resolve-then-call, 절대 throw 안 함, `failure`/`success` envelope). `src/cli/router.ts`의 `COMMANDS`에 등록.
3. `src/cli/validators.ts` — `parseDurationMs`를 기존 `parseNonNegativeInteger` 시임 위에 추가(REQ-GEST-SWIPE-005). `--duration` 검증은 `IdbBackend`의 ms→초 환산 **앞**(CLI 핸들러 내부)에서 수행 — `backend.swipe` 호출 자체가 검증 통과 후에만 일어난다.

### AC PASS/FAIL 매트릭스 (M2 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-001 | PASS | `pnpm vitest run src/cli/commands/swipe.test.ts -t "AC-GEST-001"` | 2 tests PASS. `swipe 100 800 100 200` → `backend.swipe("R58N90ABCDE", {x:100,y:800}, {x:100,y:200}, undefined)` 정확 호출 확인(응답 `{ok:true,command:"swipe",data:{serial,from,to}}` 정확 일치). `--device B`로 다중 기기 중 정확한 serial 해석도 확인(REQ-MULTIDEV-001) |
| AC-GEST-002 | PASS | `pnpm vitest run src/cli/commands/swipe.test.ts -t "AC-GEST-002"` | 6 tests PASS. `--duration 500` → `backend.swipe(...,{durationMs:500})`로 ms 그대로 전달(플랫폼별 환산은 M1에서 이미 검증된 백엔드 내부 책임). 생략 시 옵션 자체가 `undefined`. `--duration abc`/`""` → `INVALID_DURATION`(`received` 필드에 원본 값 포함) + `backend.swipe` 0회 호출. `--duration -100`/값 없는 단독 `--duration` → `INVALID_ARGS`(파서 계층) + `backend.swipe` 0회 호출 |
| AC-GEST-003 | PASS | `pnpm vitest run src/cli/commands/swipe.test.ts -t "AC-GEST-003"` | 3 tests PASS. 좌표 3개(개수 불일치) / `1.5`(비정수) → `INVALID_COORDINATES` + 0회 호출. `swipe 100 -50 100 200`(음수 리터럴) → `INVALID_ARGS`(파서 계층, 전처리 추가 안 함 — plan.md §F M2 결정 그대로) + 0회 호출 |
| AC-GEST-004 | PASS(회귀) | `pnpm vitest run`(exit 0, 446→460) + `pnpm typecheck`(exit 0) + `pnpm build`(exit 0) | 460 tests / 27 files 전부 통과(446 기준선 + swipe CLI 신규 14건). 기존 8+1개 백엔드 메서드·시그니처 변경 없음 |
| AC-GEST-015 | PASS | `pnpm vitest run src/cli/commands/swipe.test.ts -t "AC-GEST-015"` | 성공 경로 + 5가지 거부 경로(좌표 개수 오류/비정수/`--duration` 문자열 오류/음수 좌표) 전부에서 `JSON.parse(JSON.stringify(result))`가 예외 없이 통과, `command` 필드가 항상 `"swipe"` |

### 테스트 스위트

```
$ pnpm vitest run src/cli/commands/swipe.test.ts --reporter=verbose
 ✓ swipe > AC-GEST-001 (2) ✓ AC-GEST-002 (6) ✓ AC-GEST-003 (3) ✓ AC-GEST-015 (1)
 ✓ swipe > ordering (B-2/B-3) (1) ✓ degrades a thrown backend error gracefully (1)
 Test Files  1 passed (1)
      Tests  14 passed (14)

$ pnpm vitest run
 Test Files  27 passed (27)
      Tests  460 passed (460)
```

기준선 446 → 460(+14): `swipe.test.ts` 신규 파일 전체(AC-GEST-001 2건, AC-GEST-002 6건, AC-GEST-003 3건, AC-GEST-015 1건, ordering 1건, backend-throw 1건).

### RED 확인 (TDD 사이클 증거)

M2 착수 시 `swipe.test.ts`를 먼저 작성한 뒤, `router.ts`의 `swipe: swipeCommand` 등록 라인을 임시로 주석 처리하고 재실행 — 14건 중 12건이 `UNKNOWN_COMMAND`로 실패함을 확인(RED). 등록을 복원한 뒤 14건 전부 PASS(GREEN)로 전환됨을 확인. (나머지 2건은 "JSON envelope"/"backend.swipe 미호출" 단언이라 커맨드 미등록 상태에서도 우연히 참이 되는 성질의 것 — RED 확인의 유효성에 영향 없음.)

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### `--duration` 검증 순서 증거 (B-2, REQ-GEST-SWIPE-005)

`src/cli/commands/swipe.ts`의 `swipeCommand`는 `args.duration`을 `parseDurationMs`로 파싱해 `undefined`(파싱 실패)면 **`backend.swipe`를 호출하기 전에** `INVALID_DURATION`을 반환하고 함수를 종료한다(코드 순서: 좌표 파싱 → duration 파싱/검증 → `resolveTargetDevice` → `backend.swipe` 호출). `--duration abc`/`""`로 호출한 두 테스트 모두 `backend.swipe`가 0회 호출됨을 명시적으로 단언 — `NaN`이 `IdbBackend`의 `durationMs/1000` 환산에 도달하는 경로 자체가 존재하지 않는다.

### 실기기 확인 (Section E 항목 6 — 최초의 실사용자 대면 CLI 명령)

```
$ pnpm build
$ node dist/cli/bin.js swipe 200 700 200 300 --duration 500 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"swipe","data":{"serial":"D0B3A18C-E485-4E7C-A25E-504BF4CA6163","from":{"x":200,"y":700},"to":{"x":200,"y":300},"durationMs":500}}
   ( time 측정 )  0.66s user 0.20s system 38% cpu 2.261 total
```

부팅된 iPhone 17 Pro 시뮬레이터(iOS 26.0)에서 Safari로 clip.naver.com이 떠 있는 상태(M1 종료 시점과 동일 세션)에서 실행. 전체 wall time 2.261초 — Node 콜드스타트 포함이며, `--duration 500`이 500**초**로 오동작했다면 그 자체로 500초 이상 걸렸을 것이므로 이 결과는 ms 계약이 CLI 레이어에서도 깨지지 않았음을 보여준다(백엔드 내부 환산은 M1에서 이미 unit-test로 확정).

전/후 스크린샷(`/private/tmp/.../scratchpad/{before,after}.png`) SHA-256 비교: `c5dae90d...` → `bbcee3a3...`(다름), 파일 크기도 1,779,982 → 848,582 bytes로 상이. 육안 확인 결과 스크롤 전 게시물("시즈오카에서 만날 수 있는 풍경들")에서 스크롤 후 다른 게시물("10년전 나에게 쓰는 편지")로 실제로 화면이 이동함을 확인 — CLI `swipe` 서브커맨드를 통한 종단 스크롤이 처음으로 확증됨(M1은 백엔드 계층 직접 호출 확인이었음).

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/cli/args.ts
 M src/cli/router.ts
 M src/cli/validators.ts

$ git status --porcelain --untracked-files=all | grep '^??'
?? src/cli/commands/swipe.test.ts
?? src/cli/commands/swipe.ts
(그 외 ?? 항목은 이 SPEC과 무관한 저장소 전역 미추적 파일 — .claude/, .moai/config 등)

$ git diff --name-only HEAD
src/cli/args.ts
src/cli/router.ts
src/cli/validators.ts
```

plan.md §A.6 M2 행: `src/cli/args.ts`(M2·M3), `src/cli/router.ts` + `src/cli/commands/` 신규(M2·M3) — 전부 위 목록에 포함. `src/cli/validators.ts`는 plan.md §D 제약("A.6에 없는 파일 수정 금지")과 지시문 Section D("`src/cli/validators.ts` if the shared rejection seam needs it")에 따라 `parseDurationMs` 추가로 사용 — B-3에서 명시된 "세 옵션이 같은 구조를 공유해야 한다"는 요구를 이 파일에서 충족시키기 위함. `src/normalize/*`, `src/webview/*`(PRESERVE 목록) 미변경 확인됨. M3-M5 대상 파일(`src/cli/commands/web-support.ts`, `src/webview/coordinates.ts` 등) 미변경 확인됨.

### 커밋

아래 §E.3 참조(커밋 완료 후 backfill).

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: M2-complete
ac_pass_count: 8      # AC-GEST-001, 002, 003, 004, 005 (M1), 015 (M2 신규 커버) -- 누적: 001,002,003,004,005,015 + M1 유지분
ac_fail_count: 0
ac_partial_count: 1   # AC-GEST-006 (adb 미설치, M1과 동일 상태 유지)
ac_deferred_count: 0  # AC-GEST-003이 M2에서 이관되어 deferred 목록에서 제거됨
total_run_phase_files: 16   # M1의 13 + M2 신규/수정 3(args.ts, validators.ts는 M1에도 있었으므로 실질 순증분은 swipe.ts, swipe.test.ts, router.ts 수정)
new_warnings_or_lints_introduced: false
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/* 미변경
```

## 블로커 / 서프라이즈 (M2 종료 시점, M3-M5 참고)

1. **plan.md §F M1 item 2의 사소한 부정확성**: plan.md는 `adb-backend.ts`에도 "8 methods" 문구 갱신이 필요하다고 적었으나, 실제 파일에는 그런 문구가 없었다(grep으로 확인 — "8-method"/"8 methods" 매치는 `device-backend.ts:16`, `idb-backend.ts:5`, `idb-backend.ts:25` 3곳뿐). 갱신 대상은 이 3곳으로 한정했고, 결과적으로 `grep -rn "8-method\|8 methods" src/`는 매치 0건이다. 결정을 스스로 내린 부분이므로 명시한다.
2. **AC-GEST-005를 M1에서 "argv 수용" 이상으로 확증**: 지시문은 "화면이 실제로 움직였는지 확인 못 하면 M5로 미루라"고 했으나, 실제로는 프로덕션 `IdbBackend.swipe` 경로를 직접 구동해 전/후 스크린샷 diff(SHA-256 다름 + 육안 확인)로 **실제 스크롤까지 확증**했다. M2에서 CLI `swipe` 서브커맨드가 생겼으므로, 이번 M2 검증에서는 CLI 명령을 통한 종단 확인으로 이를 재확증했다(위 "실기기 확인" 참조).
3. **M2 완료 — M3+ 참고, 재라우팅 구조 재사용 가능성 확인**: `swipe.ts`의 거부 경로 구조(좌표 파싱 → 관련 옵션 파싱/검증 → `resolveTargetDevice` → 백엔드 호출)는 M3의 `--amount` 검증이 그대로 끼워 넣을 수 있는 형태다 — `parseDurationMs`가 `parseNonNegativeInteger` 위에 얹힌 것과 같은 방식으로 M3에서 `--amount`용 0<x≤1 비율 파서를 `validators.ts`에 추가하면 된다(단, `--amount`는 소수를 허용해야 하므로 `parseNonNegativeInteger`를 재사용할 수는 없고 별도 정규식이 필요 — plan.md §F M3 item 2가 이미 명시한 바와 일치). M2는 M3의 이 계획에 반하는 어떤 것도 발견하지 못했다.
4. **지시문과 실제 코드의 사소한 불일치 없음**: B-1~B-8 전부가 실제 코드베이스와 정확히 일치했다(사전 점검에서 `parseCoordinate`/`parseIndex`/`parseNonNegativeInteger`, `COMMANDS` 레지스트리 등 확인됨). M1과 달리 이번 M2에서는 plan.md 부정확성을 발견하지 못했다.
5. **범위 이탈 없음**: `src/normalize/*`, `src/webview/*` 등 PRESERVE 대상과 M3-M5 전용 파일(`src/cli/commands/web-support.ts`, `src/webview/coordinates.ts`) 모두 미변경 확인.
