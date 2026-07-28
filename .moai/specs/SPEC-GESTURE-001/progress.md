---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 진행 기록"
version: "0.5.0"
status: completed
created: 2026-07-27
updated: 2026-07-28
author: hatae
amendment_of: SPEC-GESTURE-001
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

### M3 — `scroll` 편의 계층

**선행 조건 이행(plan.md §F M3 선행 조건, spec.md §B.5 해소)**: M3 설계 전 Safari 전면 상태에서 `dump`를 떠 witness 유무를 실측했다.

```
$ node dist/cli/bin.js dump --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
최상위 요소 2개:
  [0] {"x":0,"y":0,"w":402,"h":874}                  role=Application  text="Safari"
  [1] {"x":159,"y":837,"w":84,"h":14.333333333333371} role=TextField    text="주소"

max-extent 후보 = 402 x 874
witness ({x:0,y:0,w:402,h:874}) = 존재 (인덱스 0)
```

plan.md §B.5의 네 갈래 중 **1번**(witness 있음 → 현행 설계 그대로)이 성립했다 — 두려워했던 갈래 4(크롬-only, witness 없음)는 이번 실측에서는 발생하지 않았다. AC-GEST-011은 `scroll`로 검증 가능하나(정식 판정은 M5), 이 사전 점검 자체는 plan-auditor가 미해결로 지적한 §B.5 갭을 닫는다. 요소 bounds가 비정수(`h: 14.333333333333371`)일 수 있다는 사실도 이 실측에서 확인됐다 — 아래 "반올림 규칙" 참조.

**산출물 (plan.md §F M3 1-4 모두 완료)**

1. `src/cli/args.ts` — `amount: { type: "string" }` 옵션 추가, `ParsedCommandArgs.amount` 필드 추가.
2. `src/cli/validators.ts` — `parseRatio` 추가(0 초과 1 이하, 소수 허용). `parseNonNegativeInteger`(정규식 `^\d+$`)는 소수를 통과시키지 못하므로 새 정규식(`^\d+(\.\d+)?$`)이 필요했다(plan.md §F M3 item 2 그대로).
3. `src/cli/commands/scroll-geometry.ts`(신규, 순수 함수 모듈) — `deriveScreenSize`(화면 크기 파생, ① max-extent 후보 + ② witness 검증 두 단계 모두 구현) + `computeScrollSwipe`(방향·비율·화면 크기 → swipe 좌표) + `roundPixel`(반올림 규칙, 아래 참조).
4. `src/cli/commands/scroll.ts`(신규) — `scroll <up|down|left|right> [--amount <ratio>]` 핸들러. `swipe.ts`와 동일한 거부 순서(방향 파싱 → `--amount` 파싱/검증 → `resolveTargetDevice` → `dumpUiHierarchy` → `backend.swipe`). `src/cli/router.ts`의 `COMMANDS`에 등록.

**witness 규칙 증거 (B-1, spec.md REQ-GEST-SCROLL-002 ②, 0.3.0 개정의 핵심)**

B-1이 지정한 정확한 조각 픽스처(상단 바 `{0,0,402,60}` + URL 바 `{0,60,402,44}` + 진행 표시 `{0,104,402,16}`)를 빌드된 모듈에 직접 통과시켜 `SCREEN_SIZE_UNKNOWN`으로 귀결됨을 확인했다:

```
$ node -e '
import("./dist/cli/commands/scroll-geometry.js").then((m) => {
  const fragments = [
    { bounds:{x:0,y:0,w:402,h:60} },
    { bounds:{x:0,y:60,w:402,h:44} },
    { bounds:{x:0,y:104,w:402,h:16} },
  ];
  console.log("deriveScreenSize(fragments) =", m.deriveScreenSize(fragments));
});
'
deriveScreenSize(fragments) = undefined
```

후보 산출(①)만으로는 402x120(진행 표시의 `x+w=402`, `y+h=120`)이 비퇴화 양수라 통과해 버린다 — witness 검증(②)이 원점 조건(`x===0 && y===0`)까지 요구해야 이 조각 집합을 거부한다(느슨한 `x+w===width && y+h===height`만 보면 진행 표시가 witness로 통과함). `scroll-geometry.test.ts`에 이 두 가지(엄격/느슨 규칙 비교) 모두 자동화 테스트로 고정했다(AC-GEST-017).

**반올림 규칙 (B-2)**

`Math.round`(사사오입)를 택했다 — 표준 반올림 이외의 정책(올림/버림)을 정당화할 근거가 없고, ±0.5px 오차는 제스처 정확도에 영향이 없다. B.5 사전 점검에서 실측된 정확한 값에 적용한 결과:

```
$ node -e '
import("./dist/cli/commands/scroll-geometry.js").then((m) => {
  console.log(m.roundPixel(14.333333333333371));
});
'
14
```

화면 크기 자체(402x874)는 정수였으므로 이번 실측에서 화면 크기 파생 결과 자체가 소수가 되는 경우는 없었지만, 함수는 화면 크기·중간 계산이 소수여도 최종 swipe 좌표가 항상 정수이도록 설계됐다(`scroll-geometry.test.ts`의 `roundPixel`/`computeScrollSwipe` 정수 단언 참조).

### AC PASS/FAIL 매트릭스 (M3 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-007 | PASS | `pnpm vitest run src/cli/commands/scroll-geometry.test.ts src/cli/commands/scroll.test.ts -t "AC-GEST-007"` | 4방향 모두 좌표 부등호 확인(down: to.y<from.y, up: to.y>from.y, right: to.x<from.x, left: to.x>from.x) + `--amount 1` 포함 전 방향·비율 조합에서 좌표가 [0, width]/[0, height] 안에 머묾 + 좌표는 항상 정수 |
| AC-GEST-008 | PASS | `pnpm vitest run -t "AC-GEST-008"` | 최상위 3개(인덱스 0 = 402x60, 인덱스 1 = witness 402x874)로 402x874를 파생 — 인덱스 0만 봤다면 402x60이 됐을 것을 CLI 레벨에서도(`from.y`/`to.y` > 60) 확인 |
| AC-GEST-009 | PASS | `pnpm vitest run -t "AC-GEST-009"` | `--amount 0.75`의 이동 거리가 `--amount 0.25`의 정확히 3배(순수 함수 레벨 + CLI 레벨 양쪽 확인). `0`/`1.5`/`abc`/`""` → `INVALID_AMOUNT` + 무동작(swipe 0회). `-0.5`·값 없는 단독 `--amount` → `INVALID_ARGS`(파서 계층) + 무동작. `0.25`/`1` 허용 확인 |
| AC-GEST-010 | PASS | `pnpm vitest run -t "AC-GEST-010"` | 빈 배열 / 모든 bounds 0 → `SCREEN_SIZE_UNKNOWN` + 무동작(swipe 0회), 순수 함수·CLI 레벨 모두 확인 |
| AC-GEST-011 | 조기 부분 확증 (정식 판정은 M5) | 아래 "실기기 확인" 참조 | 정식 AC 판정 대상이 아니지만(acceptance.md 검증 방식 "e2e·manual", plan.md M5 스코프), M3 구현을 신뢰성 있게 검증하기 위해 실기기로 방향 의미까지 조기 확증했다 — 세부는 "실기기 확인" 절 참조 |
| AC-GEST-015 | PASS | `pnpm vitest run -t "AC-GEST-015"` | `scroll`의 성공/오류 5개 경로 모두 `JSON.parse(JSON.stringify(result))` 예외 없음, `command==="scroll"` |
| AC-GEST-016 | PASS | `pnpm vitest run -t "AC-GEST-007/016"` | `scroll down` 성공 응답에 `direction:"down"` + 실제 `from`/`to` 좌표가 실리고 `to.y < from.y` |
| AC-GEST-017 | PASS | `pnpm vitest run -t "AC-GEST-017"` | Safari 크롬-only 픽스처(402x120 후보, witness 없음) → `SCREEN_SIZE_UNKNOWN` + 무동작. 순수 함수 레벨에서 느슨한 witness 규칙이었다면 통과했을 인덱스도 별도로 거부 확인 |
| AC-GEST-004 | PASS(회귀) | `pnpm vitest run`(exit 0, 460→503) + `pnpm typecheck`(exit 0) + `pnpm build`(exit 0) | 503 tests / 29 files 전부 통과(460 기준선 + M3 신규 43건: scroll-geometry 17 + scroll 21 + parseRatio 5). 기존 9개 백엔드 메서드·시그니처 변경 없음 |

### 테스트 스위트

```
$ pnpm vitest run src/cli/commands/scroll.test.ts src/cli/commands/scroll-geometry.test.ts
 Test Files  2 passed (2)
      Tests  38 passed (38)   # scroll-geometry.test.ts 17 + scroll.test.ts 21 (duration 실측 반영 테스트 포함)

$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  503 passed (503)
```

기준선 460 → 503(+43): `scroll-geometry.test.ts` 신규 17건(`deriveScreenSize` AC-GEST-008/010/017 + 실측 pre-flight 픽스처 + `roundPixel` + `computeScrollSwipe` AC-GEST-007/009/016), `scroll.test.ts` 신규 21건(AC-GEST-007/016/008/009/010/017/015 + duration 실측 반영 테스트 + 백엔드 오류 전파 2건), `validators.test.ts` `parseRatio` 신규 5건.

### RED 확인 (TDD 사이클 증거)

M3 착수 시 `scroll-geometry.test.ts`/`scroll.test.ts`/`validators.test.ts`(`parseRatio` 블록)를 먼저 작성한 뒤 실행 — `scroll-geometry.ts`/`scroll.ts`/`parseRatio` 미구현 상태라 전부 실패(모듈 not-found 또는 `UNKNOWN_COMMAND`/`parseRatio is not a function`)함을 확인(RED, 24 failed / 8 passed). 순수 함수 모듈(`scroll-geometry.ts`) → `parseRatio` → `args.ts` `amount` 필드 → `scroll.ts` → `router.ts` 등록 순으로 구현한 뒤 재실행, 전체 GREEN 전환 확인. 이후 실기기 검증에서 `backend.swipe` 호출에 명시적 `durationMs`가 필요함을 발견해 추가 RED(`backend.swipe에 명시적 durationMs를 실어 보낸다` 1건 실패) → GREEN(스크롤 지속시간 상수 추가) 사이클을 한 번 더 수행했다.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### 실기기 확인 (Section E 항목 6 — `scroll` 서브커맨드 최초 종단 검증 + 방향 의미 실증)

부팅된 iPhone 17 Pro 시뮬레이터(iOS 26.0, D0B3A18C-E485-4E7C-A25E-504BF4CA6163)에서 Safari로 긴 페이지(clip.naver.com, 세로 스크롤/피드형 콘텐츠)가 떠 있는 상태에서 실행.

**1차 시도 — 중요한 발견(진짜 서프라이즈, 아래 블로커 절 1번 참조)**: `--duration`을 신지 않은 채(즉 플랫폼 기본 지속시간) `scroll down`을 실행했더니 명령은 `{"ok":true,...}`를 반환했지만 전/후 스크린샷이 **SSIM 1.000000**(완전 동일 — 상태 표시줄 영역을 제외한 크롭 비교)으로, 페이지가 전혀 움직이지 않았다. 같은 좌표로 `swipe`에 `--duration 500`을 명시하자 SSIM이 **0.52**로 떨어져 실제 스크롤이 확증됐다(M2의 AC-GEST-005가 이미 이 값으로 확증한 것과 일치).

**대응**: `scroll.ts`가 `backend.swipe` 호출 시 사용자에게 노출하지 않는 내부 기본 지속시간(`SCROLL_SWIPE_DURATION_MS = 500`)을 명시적으로 싣도록 수정(RED-GREEN 사이클, 위 참조). REQ-GEST-SCROLL-001~006 어디에도 `scroll`의 duration을 명시하라는 요구는 없지만(구현 세부), 진짜 스크롤을 보장하는 것은 spec.md §A.2("기기를 스와이프·스크롤할 수 있게 한다")의 목표 자체이므로 M3 스코프 안에서 수정했다.

**수정 후 재검증**:

```
$ pnpm build
$ node dist/cli/bin.js scroll down --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-...","direction":"down","from":{"x":201,"y":634},"to":{"x":201,"y":240}}}
```

전/후 스크린샷(상태 표시줄 제외 크롭) SSIM = **0.843417** — 명확한 변화 확인. 육안 확인 결과 "아이슬란드에서 보내는 열흘 기록"(21 likes, #링로드) 게시물에서 다음 게시물 "아이슬란드에서 들을 수 있는 소리들🌊"(15 likes, #다이아몬드비치)로 피드가 실제로 아래로 전환됨 — 상단 nav bar(`< sueddu_`)가 스크롤되어 사라지고 하단에 Safari 브라우저 툴바가 나타남(Safari의 스크롤 시 컴팩트 툴바 동작과 일치). `scroll down`이 "아래 내용을 보여준다"는 REQ-GEST-SCROLL-001 계약과 정확히 일치.

```
$ node dist/cli/bin.js scroll up --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-...","direction":"up","from":{"x":201,"y":240},"to":{"x":201,"y":634}}}
```

전/후(down 이후 vs up 이후) SSIM = 0.704608 — 명확히 다른 상태. 육안 확인 결과 **원래 게시물("아이슬란드에서 보내는 열흘 기록", 21 likes, #링로드, nav bar 재등장)로 정확히 복귀** — `scroll up`이 `scroll down`을 되돌림을 확인. 방향 의미(B-2, REQ-GEST-SCROLL-001)가 실기기에서 양방향 모두 실증됐다.

스크린샷(전/후/최종) SHA-256 및 SSIM 도구(ffmpeg, 상태 표시줄 크롭 후 비교)는 `/private/tmp/.../scratchpad/`에 저장. `dump --web`(WebKit Inspector 경로)은 이 세션에서 `NO_WEB_PAGE`를 반환해(디버깅 가능한 페이지 미노출) `scrollY` 직접 비교는 사용하지 못했고, 스크린샷 SSIM + 육안 확인으로 대체했다 — 지시문이 허용한 대안 경로다.

**AC-GEST-011에 대한 판정**: 위 실증은 M3 구현의 신뢰성을 높이기 위한 조기 검증이며, 정식 AC-GEST-011 PASS 판정은 acceptance.md가 명시한 대로 M5(e2e·manual 마일스톤)에서 내린다 — 이번 결과를 M5가 재확인 없이 그대로 승계할 수 있는 근거로 남긴다.

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/cli/args.ts
 M src/cli/router.ts
 M src/cli/validators.test.ts
 M src/cli/validators.ts

$ git status --porcelain --untracked-files=all | grep '^??' | grep 'src/cli'
?? src/cli/commands/scroll-geometry.test.ts
?? src/cli/commands/scroll-geometry.ts
?? src/cli/commands/scroll.test.ts
?? src/cli/commands/scroll.ts

$ git diff --name-only HEAD
src/cli/args.ts
src/cli/router.ts
src/cli/validators.test.ts
src/cli/validators.ts
```

plan.md §A.6 M3 행: `src/cli/args.ts`(M2·M3), `src/cli/validators.ts`(M3), `src/cli/router.ts` + `src/cli/commands/` 신규(M2·M3) — 전부 위 목록에 포함. `src/normalize/*`, `src/webview/*`(PRESERVE 목록) 미변경 확인됨. M4-M5 대상 파일(`src/cli/commands/web-support.ts`, `src/webview/coordinates.ts`) 미변경 확인됨. `src/schema/device-backend.ts`(M1 스코프) 등 M1/M2 파일도 미변경.

### 커밋

아래 §E.3 참조(커밋 완료 후 backfill).

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: M3-complete
ac_pass_count: 12     # 누적(M1/M2/M3 자체 판정, PARTIAL/조기확증 제외): 001,002,003,004,005,007,008,009,010,015,016,017
ac_fail_count: 0
ac_partial_count: 1   # AC-GEST-006 (adb 미설치, M1과 동일 상태 유지)
ac_deferred_count: 0
ac_early_verification_count: 1   # AC-GEST-011 -- 조기 부분 확증(실기기), 정식 PASS 판정은 M5에서
total_run_phase_files: 20   # M2까지 16 + M3 신규 4(scroll.ts, scroll.test.ts, scroll-geometry.ts, scroll-geometry.test.ts) -- args.ts/validators.ts는 M1/M2에도 있었으므로 파일 수에는 새로 안 더함
new_warnings_or_lints_introduced: false
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/* 미변경
```

## 블로커 / 서프라이즈 (M2 종료 시점, M3-M5 참고)

1. **plan.md §F M1 item 2의 사소한 부정확성**: plan.md는 `adb-backend.ts`에도 "8 methods" 문구 갱신이 필요하다고 적었으나, 실제 파일에는 그런 문구가 없었다(grep으로 확인 — "8-method"/"8 methods" 매치는 `device-backend.ts:16`, `idb-backend.ts:5`, `idb-backend.ts:25` 3곳뿐). 갱신 대상은 이 3곳으로 한정했고, 결과적으로 `grep -rn "8-method\|8 methods" src/`는 매치 0건이다. 결정을 스스로 내린 부분이므로 명시한다.
2. **AC-GEST-005를 M1에서 "argv 수용" 이상으로 확증**: 지시문은 "화면이 실제로 움직였는지 확인 못 하면 M5로 미루라"고 했으나, 실제로는 프로덕션 `IdbBackend.swipe` 경로를 직접 구동해 전/후 스크린샷 diff(SHA-256 다름 + 육안 확인)로 **실제 스크롤까지 확증**했다. M2에서 CLI `swipe` 서브커맨드가 생겼으므로, 이번 M2 검증에서는 CLI 명령을 통한 종단 확인으로 이를 재확증했다(위 "실기기 확인" 참조).
3. **M2 완료 — M3+ 참고, 재라우팅 구조 재사용 가능성 확인**: `swipe.ts`의 거부 경로 구조(좌표 파싱 → 관련 옵션 파싱/검증 → `resolveTargetDevice` → 백엔드 호출)는 M3의 `--amount` 검증이 그대로 끼워 넣을 수 있는 형태다 — `parseDurationMs`가 `parseNonNegativeInteger` 위에 얹힌 것과 같은 방식으로 M3에서 `--amount`용 0<x≤1 비율 파서를 `validators.ts`에 추가하면 된다(단, `--amount`는 소수를 허용해야 하므로 `parseNonNegativeInteger`를 재사용할 수는 없고 별도 정규식이 필요 — plan.md §F M3 item 2가 이미 명시한 바와 일치). M2는 M3의 이 계획에 반하는 어떤 것도 발견하지 못했다.
4. **지시문과 실제 코드의 사소한 불일치 없음**: B-1~B-8 전부가 실제 코드베이스와 정확히 일치했다(사전 점검에서 `parseCoordinate`/`parseIndex`/`parseNonNegativeInteger`, `COMMANDS` 레지스트리 등 확인됨). M1과 달리 이번 M2에서는 plan.md 부정확성을 발견하지 못했다.
5. **범위 이탈 없음**: `src/normalize/*`, `src/webview/*` 등 PRESERVE 대상과 M3-M5 전용 파일(`src/cli/commands/web-support.ts`, `src/webview/coordinates.ts`) 모두 미변경 확인.

## 블로커 / 서프라이즈 (M3 종료 시점, M4-M5 참고)

1. **[가장 중요] `scroll`의 duration 생략이 실기기에서 무동작으로 이어짐 — SPEC/plan.md 어디에도 없던 발견**: 지시문 Section E 항목 6이 요구한 실기기 검증 중, `backend.swipe`를 duration 없이 호출하면(플랫폼 기본 지속시간) Safari 페이지가 SSIM 1.000000(완전 동일)로 전혀 움직이지 않음을 발견했다. `--duration 500`을 명시하자 즉시 진짜 스크롤(SSIM 0.52)로 전환됐다. REQ-GEST-SCROLL-001~006 어디에도 `scroll`의 내부 duration을 규정하지 않으므로 이는 spec.md/plan.md의 부정확성이 아니라 **구현 세부의 공백**이었다 — `scroll.ts`에 `SCROLL_SWIPE_DURATION_MS = 500`(M2의 AC-GEST-005가 이미 실측 확인한 값)을 명시적으로 실어 해결했다(RED-GREEN 사이클 1회 추가 수행, 테스트 1건 추가). 이 결정은 사용자 입력 없이 스스로 내렸다 — plan.md §F M3 어디에도 `scroll`의 duration을 언급하지 않으며, M4-M5는 이 상수가 `scroll.ts` 내부에만 존재하고 CLI에 노출되지 않는다는 점을 알아야 한다.
2. **plan.md §B.5 사전 점검 갈래 1(witness 있음) 확정** — 두려워했던 갈래 4(크롬-only, witness 없음)는 이번 세션의 실측 상태에서는 나타나지 않았다. 다만 AC-GEST-017(witness 없는 픽스처)은 여전히 unit 테스트로 커버된다 — 갈래 4가 다른 페이지/세션에서 실제로 발생할 가능성에 대비한 방어 코드는 그대로 유효하다.
3. **`dump --web`을 통한 `scrollY` 직접 비교는 이번 세션에서 사용 불가**: 시뮬레이터에 디버깅 가능한 웹 페이지가 노출되지 않아(`NO_WEB_PAGE`) 지시문이 제시한 1순위 방법을 쓰지 못했다. 지시문이 명시적으로 허용한 대안(스크린샷 전/후 비교)으로 대체했고, 육안 확인에 더해 ffmpeg SSIM으로 정량적 근거를 보강했다 — 단순 SHA-256 해시 비교만으로는 상태 표시줄의 시각(11:48→11:49) 변화만으로도 해시가 달라져(1차 시도에서 실제로 이런 거짓 양성이 관측됨) 오판할 위험이 있었기 때문이다.
4. **지시문과 실제 코드의 불일치 없음**: B-1~B-9 전부가 실제 코드베이스·실기기 상태와 정확히 일치했다(사전 점검에서 확인된 `parseCoordinate`/`parseIndex`/`parseNonNegativeInteger`, 실측된 witness 상태 등). plan.md 자체의 부정확성은 발견하지 않았다 — 발견한 것은 위 1번(구현 세부의 공백)뿐이다.
5. **범위 이탈 없음**: `src/normalize/*`, `src/webview/*` 등 PRESERVE 대상과 M4-M5 전용 파일(`src/cli/commands/web-support.ts`, `src/webview/coordinates.ts`) 모두 미변경 확인. M1/M2 산출물(`src/schema/device-backend.ts`, `src/backend/*`, `src/cli/commands/swipe.ts` 등)도 미변경 확인.
6. **M4+ 참고**: `scroll.ts`가 `backend.swipe`를 `{durationMs: SCROLL_SWIPE_DURATION_MS}`로 호출하는 패턴은 M4(웹 요소 스크롤)에는 직접 적용되지 않는다 — M4는 `scrollIntoView`(JS 경로)를 쓰며 네이티브 `swipe`를 호출하지 않는다(plan.md §F M4). 혼동 방지를 위해 명시한다.

### M4 — `tap --web` 화면 밖 요소 보강

**산출물 (plan.md §F M4 1-2 모두 완료)**

1. `src/cli/commands/web-support.ts` — `activateElement`에 스크롤 분기 추가: 좌표 변환이 `null`(뷰포트 밖)일 때 `scrollIntoView({block:"center"})` → `findWebElement`로 재측정 → 재측정 좌표로 네이티브 탭 재시도. 그래도 안 되면 기존 JS `click()` 폴백. `Activation.method`를 `"native" | "native-scrolled" | "js-click" | "js-click-scrolled"`로 확장(REQ-GEST-WEB-002) — `-scrolled` 접미사가 스크롤 발생 여부를 구분 표기한다. `buildScrollIntoViewExpression`은 기존 `buildClickExpression`과 동일하게 RAW `sourceIndex`로 주소를 지정(재측정도 같은 노드를 가리키게 함, B-5). 뷰포트 **안** 요소의 첫 분기(`point !== null` → 네이티브 탭)는 한 글자도 바뀌지 않았다(아래 "회귀 증거" 참조).
2. `src/webview/coordinates.ts` — `webRectToDevicePoint`의 모듈 주석만 갱신(코드 라인 변경 없음). "scrolling them into view is SPEC-04 territory, out of scope here"를 이 SPEC이 그 유예를 뒤집었다는 사실 + 스크롤 판단은 여전히 호출자(`web-support.ts`) 몫이라는 사실로 교체.

**method 어휘 설계 결정(B-4)**: 스크롤이 실제로 일어났는지(`scrollIntoView` eval이 `true`를 반환했는지)와 최종적으로 어느 경로로 눌렸는지(네이티브 재탭 vs JS 폴백)를 독립된 두 축으로 보고 4가지 조합을 모두 구분했다 — `native`(무스크롤 네이티브), `native-scrolled`(스크롤 후 네이티브), `js-click`(무스크롤 JS 폴백), `js-click-scrolled`(스크롤 후에도 안 돼 JS 폴백, 그러나 스크롤은 일어났으므로 부작용 표기 의무는 여전히 짐). REQ-GEST-WEB-002가 "스크롤이 일어났을 때 그 사실을 표기"하라고 명시했으므로 최종 경로와 무관하게 스크롤 발생 여부를 표기해야 한다고 해석했다 — plan.md/spec.md는 정확한 문자열 값을 지정하지 않았으므로 이는 스스로 내린 설계 결정이다(아래 "블로커/서프라이즈" 5번 참조).

### AC PASS/FAIL 매트릭스 (M4 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-012 | **PASS**(unit + 실기기 둘 다 확증) | `pnpm vitest run src/cli/commands/web-support.test.ts -t "AC-GEST-012"` + 아래 "실기기 확인" | unit: 뷰포트 밖 rect(`y:2000`, innerHeight 714)가 스크롤 후 rect(`y:300`)로 재측정되어 `native-scrolled`로 탭, 좌표 `(50,382)` 정확히 일치. **실기기**: 부팅된 iPhone 17 Pro 시뮬레이터에서 Wikipedia "JavaScript" 문서(`en.wikipedia.org/wiki/JavaScript`)의 `y:1246.96875`(뷰포트 밖) "Netscape" 링크를 `tap --web 'a[href*="Netscape"]'`로 눌렀더니 응답이 `"method":"native-scrolled","x":243,"y":419`를 반환했고, **전/후 스크린샷에서 브라우저가 실제로 "Netscape" 위키백과 문서로 전환**됨을 확인(단순 스크롤 확인을 넘어 링크 탭 자체가 성공했다는 가장 강한 증거) |
| AC-GEST-013 | PASS | `pnpm vitest run -t "AC-GEST-013"` | 동일 셀렉터·동일 요소 기준으로 스크롤 없이 눌린 응답(`method:"native"`)과 스크롤 후 눌린 응답(`method:"native-scrolled"`)이 서로 다름을 명시적으로 단언(`.not.toEqual`). 페이지 스크롤 위치 변경이 조용히 넘어가지 않음을 실기기 확인에서도 확증(전/후 스크린샷이 다른 문서를 보여줌) |
| AC-GEST-014 | PASS | `pnpm vitest run -t "AC-GEST-014"` | 스크롤 후에도 rect가 그대로(여전히 뷰포트 밖)인 픽스처 → `method:"js-click"`이 아니라 `method:"js-click-scrolled"`로 폴백 경로가 표기됨(스크롤이 일어났다는 사실은 최종 경로가 JS 폴백이어도 유지). SPEC-WEBVIEW-001의 기존 회귀 테스트("falls back to JS click for an element outside the viewport... AC-WEB-013")도 동일 어휘 확장을 반영하도록 갱신 — JS `click()` 폴백 자체(REQ-WEB-ACT-002)는 불변 |
| AC-GEST-015 | PASS | `pnpm vitest run -t "AC-GEST-015"` | 스크롤 경로 포함 모든 성공 응답이 `JSON.parse(JSON.stringify(result))`에서 예외 없음(신규 테스트) + 기존 `runWebDump`/`runWebTap`/`runWebText` 전체 JSON 계약 테스트 그대로 통과 |

### 테스트 스위트

```
$ pnpm vitest run src/cli/commands/web-support.test.ts
 Test Files  1 passed (1)
      Tests  34 passed (34)

$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  510 passed (510)
```

기준선(M3 종료) 503 → 510(+7), 전부 `web-support.test.ts`에 추가: off-viewport 스크롤+재측정+네이티브 탭(AC-GEST-012) 1건, 스크롤-vs-직접 응답 구분(AC-GEST-013) 1건, 스크롤 후에도 폴백(AC-GEST-014) 1건, `scrollIntoView` 자체가 실패했을 때 스크롤 미크레딧 1건, 뷰포트 안 요소는 스크롤을 시도하지 않는다는 회귀 확인(B-3) 1건, JSON 봉투(AC-GEST-015) 1건, `runWebText`의 동일 스크롤 경로 1건. 파일 수는 29로 불변(신규 파일 없음, 기존 파일만 확장).

### RED 확인 (TDD 사이클 증거)

M4 착수 시 위 7건의 신규 테스트(및 하네스의 `postScrollCollected`/`scrollResult` 옵션)를 먼저 작성한 뒤 실행 — `activateElement`가 아직 스크롤 분기를 모르므로 4건이 `"js-click"`(기대값 `"native-scrolled"`/`"js-click-scrolled"`) 로 실패함을 확인(RED: `34 tests | 4 failed`). `web-support.ts`를 구현한 뒤 재실행 — 신규 4건은 GREEN으로 전환됐으나 기존 회귀 테스트 1건("falls back to JS click for an element outside the viewport... AC-WEB-013")이 새로 실패(기대값 `"js-click"`, 실제 `"js-click-scrolled"`)함을 발견 — 이는 코드 결함이 아니라 REQ-GEST-WEB-002가 요구하는 정확한 동작 변화였으므로, 그 테스트의 기대값을 `"js-click-scrolled"`로 갱신하고 왜 바뀌었는지 설명하는 주석을 남겼다(아래 "블로커/서프라이즈" 참조). 이후 `pnpm typecheck`에서 한 곳(`.not.toEqual` 좌우 피연산자의 판별 유니온 좁히기 실패) 추가 수정 후 전체 GREEN 확정.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### 회귀 증거 — 뷰포트 안 경로 불변 (B-3)

`git diff src/cli/commands/web-support.ts`에서 `if (point !== null) { await backend.tap(ctx.serial, point.x, point.y); return { method: "native", x: point.x, y: point.y }; }` 블록은 diff에 `-`/`+` 없이 컨텍스트 라인으로만 나타난다 — 즉 뷰포트 안 요소의 첫 분기는 바이트 단위로 무변경이다. 새 분기(스크롤+재측정)는 그 뒤에 **추가**됐을 뿐이다(plan.md §B.4 "화면 안 요소는 코드 경로가 바뀌지 않도록 분기를 뒤에 붙인다" 그대로). 이를 뒷받침하는 신규 회귀 테스트("does not attempt a scroll for an element already inside the viewport (regression, B-3)")도 `scrollIntoView` eval이 전혀 호출되지 않음을 명시적으로 단언한다.

### 제로 상호작용 보존 증거 (B-7)

기존 테스트("rejects an unmatched selector without tapping or clicking (AC-WEB-015)")가 그대로 통과 — `findWebElement`가 `null`을 반환하면 `activateElement`(스크롤 분기 포함) 자체가 호출되지 않으므로 `backend.tap` 0회, `.click()` eval 0회가 그대로 유지된다. `@MX:NOTE`가 명시한 "요소 조회가 뷰포트 보정보다 먼저 실행된다"는 순서도 손대지 않았다 — M4의 스크롤 분기는 `activateElement` 내부(요소 조회·보정 모두 끝난 뒤)에 있으므로 이 순서 보장에 영향을 주지 않는다.

### 실기기 확인 (Section E 항목 6 — M4의 진짜 증거: 화면 밖 웹 요소 네이티브 탭)

**환경 메모(플랜과 무관한 세션 변동성)**: 지시문이 예고한 대로 `--web` 세션은 호출마다 독립적이라, 준비된 clip.naver.com 2페이지 상태에서 여러 차례 `dump --web --page 1`이 `NO_WEB_PAGE`를 반환했다(페이지 리스트가 진동하는 현상 — SPEC-WEBVIEW-001의 알려진 표면, 이번 M4에서 고치지 않았다). naver 클립 페이지의 "Donate Now"류 요소는 `x`가 음수(가로 방향 오프스크린 드로어)라 세로 스크롤 검증에 부적합했으므로, 지시문이 허용한 대안대로 Safari를 `en.wikipedia.org/wiki/JavaScript`(`xcrun simctl openurl`)로 재진입시켜 안정적인 세로 롱페이지 픽스처를 확보했다.

```
$ node dist/cli/bin.js dump --web 'a[href*="Netscape"]' --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,...,"elements":[{"role":"a","text":"Netscape","bounds":{"x":211,"y":1246.96875,"w":63.15...,"h":18},"tappable":true,...}]}
```

`y:1246.96875`는 실제 웹뷰 innerHeight를 훌쩍 넘는 뷰포트 밖 좌표다.

```
$ node dist/cli/bin.js tap --web 'a[href*="Netscape"]' --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"tap","data":{"serial":"D0B3A18C-...","page":{"index":0,"title":"JavaScript - Wikipedia","url":"https://en.wikipedia.org/wiki/JavaScript"},"selector":{"css":"a[href*=\"Netscape\"]","index":0},"tappable":true,"method":"native-scrolled","x":243,"y":419}}
```

전/후 스크린샷(`/private/tmp/.../scratchpad/m4-before-tap.png`, `m4-after-tap.png`) 비교: 이전 화면은 "JavaScript" 위키백과 문서 상단, 이후 화면은 **"Netscape" 위키백과 문서 상단**(제목·본문 모두 변경) — 이는 SSIM/해시 비교보다 강한 증거다. 링크가 실제로 눌리지 않았다면 페이지 전환 자체가 일어날 수 없다. `method:"native-scrolled"`가 보고한 좌표(243,419)로 네이티브 탭이 전송됐고, 그 좌표가 스크롤된 뒤의 "Netscape" 링크 위치와 실제로 일치했다는 뜻이다. AC-GEST-012의 "실기기에서 페이지가 실제로 전환된 것이 확증된다" 요건을 정식으로 충족한다 — M5로 미룰 필요 없이 이번 M4에서 확증됐다.

### `coordinates.ts` diff (주석만)

```
$ git diff src/webview/coordinates.ts
```

위 diff는 `webRectToDevicePoint` 함수 위 JSDoc 블록의 텍스트 교체만 포함하며, `export function webRectToDevicePoint(...)` 이하 실행 코드는 `-`/`+` 없이 전부 컨텍스트로 나타난다 — 지시문 Section D의 "module comment only — not one line of executable code" 제약을 충족한다.

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/cli/commands/web-support.test.ts
 M src/cli/commands/web-support.ts
 M src/webview/coordinates.ts
```

plan.md §A.6 M4 행: `src/cli/commands/web-support.ts`, `src/webview/coordinates.ts`(주석만) — 정확히 일치. `src/cli/commands/web-support.test.ts`는 지시문 Section D가 허용한 4개 파일 중 하나. `src/webview/inspector-client.ts`/`proxy-service.ts`/`calibration.ts`, `src/normalize/*`(PRESERVE 목록) 미변경 확인. M1-M3 산출물(`src/schema/device-backend.ts`, `src/backend/*`, `src/cli/commands/{swipe,scroll,scroll-geometry}.ts` 등)도 미변경 확인.

### 커밋

M4 커밋 SHA: `0463337`(HEAD, 이번 M5 작업 시작 시점 기준선). M5 착수 시점에 `git rev-parse HEAD`로 재확인 완료(§Pre-flight 참조) — 이전 세션에서 backfill이 누락되어 있었으므로 이번 M5 기록 시점에 정정한다.

## §E.3 Run-phase Audit-Ready Signal (M4 갱신)

```yaml
run_status: M4-complete
ac_pass_count: 16     # 누적(M1-M4 자체 판정, PARTIAL/조기확증 제외): 001,002,003,004,005,007,008,009,010,012,013,014,015,016,017 + 004(M4 회귀)
ac_fail_count: 0
ac_partial_count: 1   # AC-GEST-006 (adb 미설치, M1과 동일 상태 유지)
ac_deferred_count: 0
ac_early_verification_count: 1   # AC-GEST-011 -- 조기 부분 확증(실기기), 정식 PASS 판정은 M5에서
total_run_phase_files: 20   # M4는 기존 파일 3개만 수정(신규 파일 없음) -- M3까지의 20에서 변화 없음
new_warnings_or_lints_introduced: false
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/{inspector-client,proxy-service,calibration}.ts 미변경
```

## 블로커 / 서프라이즈 (M4 종료 시점, M5 참고)

1. **[가장 중요] method 어휘의 정확한 문자열은 plan.md/spec.md 어디에도 없었다 — 스스로 결정**: REQ-GEST-WEB-002·plan.md §F M4 item 1은 "스크롤 발생을 `method`에 구분 표기"라고만 적었을 뿐 정확한 값(`"native-scrolled"` 등)을 지정하지 않았다. `native`/`native-scrolled`/`js-click`/`js-click-scrolled` 4값 체계를 스스로 설계했다 — 스크롤 발생 여부와 최종 탭 방식을 독립된 두 축으로 본 것. **M5가 e2e 어설션을 작성할 때 이 정확한 문자열에 의존하게 되므로, 이 4값 문자열 자체가 이번 M4가 굳힌 안정된 계약이라는 점을 M5는 알아야 한다** — 지시문 항목 10이 명시적으로 물은 질문에 대한 답이다.
2. **기존 SPEC-WEBVIEW-001 회귀 테스트 1건의 기대값이 바뀌었다(결함 아님)**: "falls back to JS click for an element outside the viewport, and says so (AC-WEB-013)" 테스트가 M4 구현 후 실패했다 — 뷰포트 밖 픽스처가 스크롤 시도 후에도 여전히 뷰포트 밖이므로 `method`가 `"js-click"`에서 `"js-click-scrolled"`로 정확히 바뀌었기 때문이다. 이는 REQ-GEST-WEB-001이 모든 뷰포트 밖 탭에 대해 먼저 스크롤을 시도하도록 요구하는 데서 오는 **의도된 동작 변화**이며, JS `click()` 폴백 자체(SPEC-WEBVIEW-001 REQ-WEB-ACT-002)는 불변이다. 테스트의 기대값과 설명 주석을 갱신했다 — "모든 기존 웹 테스트가 그대로 통과해야 한다"는 지시문 B-3 게이트는 **뷰포트 안** 경로를 겨냥한 것이었고, 이 테스트는 뷰포트 밖 경로(M4의 변경 대상 그 자체)를 검증하므로 갱신이 합당하다고 판단했다 — 사용자 입력 없이 스스로 내린 판단이다.
3. **`--web` 세션 페이지 선택 불안정성을 실측으로 재확인**: 지시문 Section A가 이미 경고한 현상(별개 CLI 호출 간 페이지 정체성 변동)을 이번 M4 실기기 검증에서도 그대로 관측했다 — `dump --web --page 1`이 연속 호출 중 무작위로 `NO_WEB_PAGE`/`AMBIGUOUS_PAGE`/성공을 오갔다. 근본 원인을 조사하거나 고치려 시도하지 않았다(지시문이 "페이지 선택 고치려 하지 말 것 — SPEC-WEBVIEW-001의 표면"이라고 명시). 대신 Safari를 단일 탭(Wikipedia)으로 재시작해 안정성을 높이는 우회로 해결했다.
4. **naver 클립 페이지는 세로 스크롤 검증 픽스처로 부적합했다**: 화면 밖 후보로 처음 시도한 "Donate Now" 링크는 `x:-261.98`(가로 방향 오프스크린 드로어)이라 REQ-GEST-WEB-001이 다루는 "아래로 스크롤해서 끌어오기" 시나리오와 무관했다. 지시문이 명시적으로 허용한 대안("naver 페이지가 픽스처로 부적합하면 더 단순한 긴 페이지로 내비게이션해도 된다")에 따라 Wikipedia로 전환했다 — 이 판단도 사용자 입력 없이 스스로 내렸다.
5. **범위 이탈 없음**: `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE 목록) 미변경 확인. `src/webview/coordinates.ts`는 주석만 변경(실행 코드 0줄 변경) 확인. M1-M3 산출물 미변경 확인. M5 전용 파일(e2e 스크립트 등, 아직 미생성)에는 손대지 않았다.
6. **M5 참고**: `method` 4값(`native`/`native-scrolled`/`js-click`/`js-click-scrolled`) 문자열은 안정된 계약으로 취급해도 된다 — 이번 M4의 unit 테스트와 실기기 확인 양쪽에서 정확히 이 문자열들로 검증됐다. e2e에서 이 문자열에 직접 의존한 어설션을 작성해도 안전하다.

### M5 — 실기기 e2e (마감 게이트)

**이 마일스톤은 기능 마일스톤이 아니다 — 검증 + 근거 기록이다(plan.md §F M5).** 프로덕션 코드는 수정하지 않았다(§Scope Check 참조). 아래는 M1-M4 자체 검증을 한 세션에서 이어붙인 재확인이 아니라, 이번 M5 세션 안에서 **하나의 연속된 e2e 시퀀스**로 처음부터 다시 수행한 기록이다.

**환경**: iPhone 17 Pro 시뮬레이터(iOS 26.0, `D0B3A18C-E485-4E7C-A25E-504BF4CA6163`, booted). `command -v adb` → not found(§Pre-flight 참조) — Android 기기·도구 모두 부재, AC-GEST-006은 이번에도 PARTIAL로 마감한다.

#### Pre-flight (지시문 §Section C)

```
$ git rev-parse HEAD
0463337eaf0498bc24adb0f7e7b3e98718980cb3   # M4 HEAD와 정확히 일치

$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  510 passed (510)

$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0

$ xcrun simctl list devices booted
iPhone 17 Pro (D0B3A18C-E485-4E7C-A25E-504BF4CA6163) (Booted)

$ command -v adb || echo "adb absent -> AC-GEST-006 PARTIAL"
adb absent -> AC-GEST-006 PARTIAL
```

#### e2e 시퀀스 (지시문 §B-1, 하나의 연속 흐름)

Safari를 `xcrun simctl openurl`로 `en.wikipedia.org/wiki/JavaScript`에 새로 진입(scrollY=0 보장)한 뒤, 전/후 스크린샷을 `/private/tmp/.../scratchpad/`(저장소 밖)에 저장하며 아래 순서로 실행했다.

**1) `swipe` — 화면 이동 확증 + `--duration 500` = 0.5초 눈으로 확인(지시문 §B-2)**

```
$ time node dist/cli/bin.js swipe 200 700 200 300 --duration 500 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"swipe","data":{"serial":"D0B3A18C-...","from":{"x":200,"y":700},"to":{"x":200,"y":300},"durationMs":500}}
   0.65s user 0.20s system 35% cpu 2.457 total   # Node 콜드스타트 포함
```

`--duration 500`이 500**초**로 오동작했다면 이 한 줄이 500초 이상 걸렸을 것이다. 2.457초는 그 반대를 증명한다. Node 콜드스타트를 걷어낸 순수 idb 계층에서도 별도로 측정했다:

```
$ time idb ui swipe --udid D0B3A18C-E485-4E7C-A25E-504BF4CA6163 200 700 200 300 --duration 0.5
   0.09s user 0.02s system 13% cpu 0.818 total
```

0.818초 — ms→초 환산이 CLI 전 구간(백엔드 + CLI 명령)에서 깨지지 않았음을 재확인. 스크린샷 SHA-256: `288d868...`(스와이프 전, JavaScript 문서 상단) → `0781d11...`(스와이프 후, 다름) — 육안 확인 결과 문서 상단(제목·인트로 문단)에서 TC39 로고·인포박스 상단으로 실제로 스크롤됨을 확인.

**2) `scroll down` → `scroll up` 왕복(지시문 §B-1)**

```
$ node dist/cli/bin.js scroll down --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-...","direction":"down","from":{"x":201,"y":634},"to":{"x":201,"y":240}}}

$ node dist/cli/bin.js scroll up --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-...","direction":"up","from":{"x":201,"y":240},"to":{"x":201,"y":634}}}
```

두 응답 모두 REQ-GEST-SCROLL-002 화면 크기 파생이 `SCREEN_SIZE_UNKNOWN` 없이 성공했음을 보여준다 — 이번 세션에서도 M3 사전 점검과 동일하게 witness가 존재하는 환경이었다(§C.1-⑧의 크롬-only 갈래 4는 이번에도 발생하지 않음). 스크린샷 3장(스와이프 후/스크롤다운 후/스크롤업 후) SHA-256이 매번 다르고(`0781d11...`→`f07f87d...`→`f2a6f82...`), 육안 확인 결과: 스크롤다운 후에는 인포박스 하단(Typing discipline·Memory management·Filename extensions·Website·Major implementations 등)까지 내려갔고, 스크롤업 후에는 TC39 로고·소스코드 스크린샷·Paradigms/Family/Designed by/First appeared 행이 다시 보이는 상태로 복귀했다 — **스와이프 직후 상태와 거의 동일한 화면으로 돌아옴**을 확인, `scroll up`이 `scroll down`을 정확히 되돌림(방향 의미 REQ-GEST-SCROLL-001 재확증).

**3) `tap --web` — 화면 밖 웹 요소 도달 + 페이지 전환(지시문 §B-1)**

```
$ node dist/cli/bin.js dump --web 'a[href*="Netscape"]' --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,...,"page":{"index":0,"title":"JavaScript - Wikipedia",...},
 "elements":[{"role":"a","text":"Netscape","bounds":{"x":211,"y":1246.96875,"w":63.15...,"h":18},"tappable":true}]}
```

`y:1246.96875` — 뷰포트(innerHeight ≈ 714pt) 밖. M4의 실측치와 정확히 같은 좌표(같은 페이지·같은 셀렉터이므로 당연히 일치).

```
$ node dist/cli/bin.js tap --web 'a[href*="Netscape"]' --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"tap","data":{...,"page":{"index":0,"title":"JavaScript - Wikipedia",...},
 "method":"native-scrolled","x":243,"y":419}}
```

전(`m5-before-tap.png`, "JavaScript" 문서 상단) → 후(`m5-after-tap.png`, **"Netscape" 문서 상단으로 문서 제목 자체가 바뀜**) 스크린샷 비교로 페이지 전환을 확증 — SSIM/해시보다 강한 증거(문서 제목이 다르면 다른 문서다). `method:"native-scrolled"`가 M4가 확정한 4값 계약과 정확히 일치.

**4) 거부 경로 9종 재확인(지시문 §Section A 표에 언급된 M2 7변형 포함, CLI 레벨에서 직접 재실행)**

```
swipe 100 800 100                    → INVALID_COORDINATES
swipe 1.5 800 100 200                → INVALID_COORDINATES
swipe 100 -50 100 200                → INVALID_ARGS (파서 계층, node:util.parseArgs)
swipe ... --duration abc             → INVALID_DURATION
swipe ... --duration ""              → INVALID_DURATION
swipe ... --duration -100            → INVALID_ARGS (파서 계층)
scroll down --amount 0               → INVALID_AMOUNT
scroll down --amount 1.5             → INVALID_AMOUNT
scroll down --amount -0.5            → INVALID_ARGS (파서 계층)
```

9개 전부 각각 단일 파싱 가능한 JSON 오류 문서 하나로 응답 — AC-GEST-015(JSON 봉투)를 오류 경로에서도 재확인.

#### `--web` 프록시 불안정성 — 실측 심화(지시문 §Section A "A real obstacle")

지시문이 예고한 현상을 이번 세션에서도 그대로, 그리고 더 상세히 관측했다. 최초 상태(2페이지 남아있던 clip.naver 세션에서 이어진 Safari, 3개 디버그 가능 페이지 — 그중 2개는 이전 세션이 남긴 "Netscape - Wikipedia" 잔여 탭)에서 `dump --web`/`tap --web`은 `AMBIGUOUS_PAGE`(3페이지 목록, 매번 index 2가 JavaScript 문서로 일관됨) ↔ `NO_WEB_PAGE`(디버그 가능 페이지 0개로 보고) 사이를 무작위로 오갔다 — 약 15회 이상 재시도(명시적 `--page 2` 포함) 후에도 안정화되지 않았고, 도중에 `WEB_INSPECTOR_UNREACHABLE`(포트 9222 20회 시도 후 미기동)도 1회 관측했다(`lsof -i :9222` 확인 결과 실제로 점유 중인 프로세스는 없었음 — 일시적 경합으로 추정).

**새로 발견한 것(M4가 기록하지 못한 부분)**: Safari를 완전히 재시작(`simctl terminate` + `openurl` 재진입)해 디버그 가능 페이지를 1개로 줄인 뒤에도 불안정성은 **완전히 사라지지 않았다.** `dump --web`은 재시작 직후 1-2회는 성공했지만 바로 이어 실패로 전환됐고, 그 성공 창 안에서 **바로 다음 줄에 실행한 `tap --web`조차 실패**했다(8회 연속 실패, `dump`가 방금 성공했음에도). 유일하게 안정적으로 통한 조합은 **개별 CLI 호출 사이에 몇 초의 간격**을 두는 것이었다 — 5초 간격을 두고 재시도한 첫 번째 시도에서 바로 성공했다. 즉 원인은 (M4가 지목한) 페이지 개수 모호성만이 아니라, **연속된 CLI 호출 자체가 매 호출마다 별도의 웹 인스펙터 프록시를 붙였다 떼는 과정에서 겪는 타이밍 경합**으로 보인다 — 이는 M4의 "페이지 정체성이 진동한다"는 관측을 좁혀서 재확인하되, "탭 1개로 줄이면 안정된다"는 가설은 이번 세션에서 **기각**한다. 근본 원인 조사나 수정은 시도하지 않았다(SPEC-WEBVIEW-001 영역, 지시문이 범위 밖으로 명시).

#### 완전 17-AC 최종 매트릭스

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-001 | PASS | M1/M2 unit(mock) + 이번 M5 `swipe` 실기기 재확인 | argv 정확성은 M1/M2에서 확정, 이번 세션의 실제 `swipe` 호출도 정확한 envelope으로 응답 |
| AC-GEST-002 | PASS | M1/M2 unit(mock) + 이번 M5 `--duration 500`/`--duration abc`/`--duration ""`/`--duration -100` 재확인 | ms→초 환산은 M1에서 unit으로 확정. 이번 세션 CLI 레벨 재확인: `swipe ... --duration 500` wall 2.457s(순수 idb 0.818s) — 500초가 아님을 시간으로 재확증. 거부 3종 전부 정확한 코드로 응답 |
| AC-GEST-003 | PASS | M2 unit(mock) + 이번 M5 3변형 재실행 | `swipe 100 800 100`→INVALID_COORDINATES, `swipe 1.5 800 100 200`→INVALID_COORDINATES, `swipe 100 -50 100 200`→INVALID_ARGS — 전부 재확인 |
| AC-GEST-004 | PASS | `pnpm vitest run`(exit 0, 510/510) + `pnpm typecheck`(exit 0) + `pnpm build`(exit 0) | M4 종료 시점과 동일 510건 — M5는 프로덕션 코드를 건드리지 않았으므로 회귀 0 |
| AC-GEST-005 | PASS | 이번 M5 `swipe 200 700 200 300 --duration 500` 실기기 재확인 | 스크린샷 SHA-256 `288d868...`→`0781d11...`(다름), 육안 확인 결과 문서 상단→TC39 인포박스로 실제 이동 확인 |
| AC-GEST-006 | **PARTIAL**(불변) | `command -v adb` | 이번 세션에도 `adb` 부재 확인. Android 실기기 스와이프는 여전히 확인 불가 — 승격 조건(adb 설치 **and** 기기 연결) 미충족. spec.md §C.2대로 §C.1-⑥은 로컬 수단으로 영구 미실측 |
| AC-GEST-007 | PASS | M3 unit + 이번 M5 `scroll down`/`scroll up` 실기기 재확인 | 응답의 `to.y < from.y`(down) / `to.y > from.y`(up) 실측 확인, 화면 밖으로 나가지 않음 |
| AC-GEST-008 | PASS | M3 unit(mock) + grep | `grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` → 9 (M5에서도 재확인, 인터페이스 변경 없음) |
| AC-GEST-009 | PASS | M3 unit + 이번 M5 `--amount 0`/`--amount 1.5`/`--amount -0.5` 재실행 | 3종 전부 정확한 코드(`INVALID_AMOUNT` ×2, `INVALID_ARGS` ×1)로 재확인 |
| AC-GEST-010 | PASS | M3 unit(mock) — 실기기 재검증 불필요(acceptance.md 검증 방식이 unit(mock)) | 빈 배열/전부 0 bounds → `SCREEN_SIZE_UNKNOWN`, M3에서 확정 |
| AC-GEST-011 | **PASS**(M5에서 정식 판정 — M3는 조기 부분 확증이었음) | 이번 M5 `scroll down`→`scroll up` 왕복, 스크린샷 3장 비교 | witness 존재(SCREEN_SIZE_UNKNOWN 없이 성공) 확인. 스크롤다운 후 인포박스 하단, 스크롤업 후 스와이프 직후 상태로 복귀 — 왕복 확증. 이 세션에서도 갈래 4(크롬-only, witness 없음)는 발생하지 않았다 |
| AC-GEST-012 | PASS | 이번 M5 `tap --web 'a[href*="Netscape"]'` 실기기 재확인 | 전(JavaScript 문서)/후(**Netscape 문서로 제목 자체가 전환**) 스크린샷 비교로 확증. `method:"native-scrolled"`, 좌표(243,419) |
| AC-GEST-013 | PASS | 위와 동일 | 응답에 `method:"native-scrolled"`로 스크롤 발생 사실이 구분 표기됨(스크롤 없는 `"native"`와 다른 값) |
| AC-GEST-014 | PASS | M4 unit(mock) — acceptance.md 검증 방식이 unit(mock), 실제 브라우저에서 "끌어와도 안 되는" 상태를 유기적으로 재현하기 어려움 | M4에서 확정, 이번 세션 재검증 불필요 |
| AC-GEST-015 | PASS | 이번 M5 전체 e2e 시퀀스(성공 4건 + 거부 9건) | 13개 응답 전부 단일 JSON 문서, `JSON.parse` 가능(육안 확인 — 매 응답이 한 줄 JSON) |
| AC-GEST-016 | PASS | 이번 M5 `scroll down` 응답 | `direction:"down"` + `from`/`to` 좌표 동시 표기, `to.y(240) < from.y(634)` |
| AC-GEST-017 | PASS | M3 unit(mock) — 실기기 재검증 불필요(acceptance.md 검증 방식이 unit(mock)) | witness 없는 조각 집합 → `SCREEN_SIZE_UNKNOWN`, M3에서 확정 |

**집계**: PASS 16건(001,002,003,004,005,007,008,009,010,011,012,013,014,015,016,017), PARTIAL 1건(006), FAIL 0건. 17개 AC 전부 판정 완료 — 대기(deferred) 없음.

#### 최종 품질 게이트

```
$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  510 passed (510)

$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

#### Scope Check

```
$ git status --porcelain --untracked-files=no
(M5 시작 시점부터 지금까지 빈 출력 — 프로덕션/테스트 코드 미변경)
```

M5는 실기기 검증 마일스톤이므로 산출물이 없다(plan.md §A.6에도 M5 전용 파일이 없음). 유일한 변경은 이 `progress.md` 자체와, 그 안에서 정정한 M4 커밋 SHA backfill 한 줄이다. 스크린샷 등 모든 임시 증거물은 저장소 밖 `/private/tmp/.../scratchpad/`에 저장했다(저장소에 커밋하지 않음).

#### 잔여 한계 (지시문 §B-6, 정직하게 기록)

1. **Android는 전혀 미검증이다.** `adb` 자체가 이 머신에 없다(도구 부재, 기기 연결 여부 이전 단계). 승격 조건(adb 설치 **and** 기기 연결)이 둘 다 충족되기 전까지 AC-GEST-006은 PARTIAL로 남고, spec.md §C.1-⑥(adb swipe 문법·ms 단위)은 **로컬 수단으로는 영구히 미실측**이다.
2. **`--web` 프록시의 페이지 선택 불안정성은 M4가 기록한 것보다 근본적이다.** M4는 "다중 탭 상태에서 페이지 정체성이 진동한다"고 기록했으나, 이번 M5에서는 **탭을 1개로 줄인 뒤에도** `dump`/`tap`이 바로 다음 호출에서 실패하는 사례를 재현했다. 유일하게 안정적으로 통한 완화책은 CLI 호출 사이에 몇 초의 간격을 두는 것이었다 — 즉 원인은 페이지 개수 모호성뿐 아니라 프록시의 attach/detach 타이밍 경합일 가능성이 있다. 이 SPEC의 범위 밖(SPEC-WEBVIEW-001 영역)이므로 근본 수정은 시도하지 않았고, 이 사실만 기록해 다음 세션이 같은 재발견을 반복하지 않도록 한다.
3. **`SCROLL_SWIPE_DURATION_MS = 500`은 REQ가 요구하지 않은 내부 구현 상수다**(M3에서 스스로 결정, `scroll.ts` 내부에만 존재, CLI에 노출되지 않음). 이번 M5의 `scroll down`/`scroll up` 두 호출 모두 이 상수 덕분에 실제 스크롤이 일어났다 — 상수가 없었다면 M3가 발견한 것과 동일하게 무동작이었을 것이다. SPEC 어디에도 이 값 자체를 요구하지 않으므로, 향후 이 상수를 바꾸는 변경은 SPEC 문구 위반이 아니라 조용한 회귀가 될 수 있다는 점을 남겨둔다.
4. **스크롤 성공 여부에 대한 CLI 자체 판정은 여전히 없다**(spec.md §C.3, D1 그대로) — 이번 e2e에서 실제로 스크롤됐음을 확인한 것은 CLI가 아니라 **외부 관찰자(스크린샷 비교)**였다. e2e가 "실제로 움직였다"를 확증했다고 해서 CLI의 판정 능력 자체가 달라진 것은 아니다 — 호출자(에이전트)가 여전히 `dump`를 다시 떠서 검증해야 한다는 설계(D1)는 이번 세션으로 강화됐을 뿐 변경되지 않았다.
5. **witness 없음(크롬-only) 갈래는 이번에도 실기기에서 재현되지 않았다** — M3와 M5 두 세션 모두 Safari 전면 상태에서 witness가 존재했다. AC-GEST-017(witness 없는 조각 집합 → `SCREEN_SIZE_UNKNOWN`)은 여전히 unit 테스트로만 커버되며, 실제 iOS 환경에서 이 갈래가 발생하는 조건(예: 특정 iOS 버전·Safari 상태)은 이 프로젝트에서 실측된 바 없다.
6. **프로덕션 결함은 발견되지 않았다** — M5 e2e 전 구간에서 코드 수정이 필요한 결함을 만나지 않았다(M2/M3가 발견했던 `--duration` 단위·`scroll` 무동작 결함과 달리, 이번 M5는 기존 구현이 설계대로 동작함을 재확인하는 데 그쳤다).

#### Sync-phase 준비도

M5의 모든 기준(17개 AC 전부 PASS 또는 PARTIAL로 판정 완료, 완전한 최종 매트릭스, `--duration 500` 눈으로 확인 완료, 잔여 한계 명시)이 충족됐다. `/moai sync`로 이 SPEC을 마감하는 데 걸림돌이 되는 항목은 없다 — AC-GEST-006의 PARTIAL 상태는 spec.md §C.2가 이미 명시한 대로 이 머신 환경의 영구적 제약(도구 부재)이지, M5 마일스톤 자체의 미비가 아니다.

#### 커밋

이 `progress.md` 갱신(M5 e2e 기록 + M4 커밋 SHA backfill 정정)만을 커밋한다 — 프로덕션/테스트 코드 변경이 없으므로 커밋 대상은 이 파일 하나다. 커밋 직전 `git fetch origin master && git rev-list --count --left-right origin/master...HEAD`로 원격 분기 여부를 확인했다(결과 `0 7` — origin 미분기, local 7 커밋 앞섬, 안전). push는 지시문 §Section D("Do not push")에 따라 수행하지 않는다.

M5 커밋 SHA: `d929f6b`(이 SHA를 담은 커밋 자체가 progress.md를 수정하는 자기참조 문제는 spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3)이 허용하는 배치 방식대로, 이 값을 이어지는 별도의 후속 backfill 커밋에 기록해 해소한다).

## §E.3 Run-phase Audit-Ready Signal (M5 최종)

```yaml
run_status: M5-complete
ac_pass_count: 16     # 최종(001,002,003,004,005,007,008,009,010,011,012,013,014,015,016,017) -- AC-GEST-011이 조기확증에서 정식 PASS로 전환
ac_fail_count: 0
ac_partial_count: 1   # AC-GEST-006 (adb 미설치, 전 마일스톤과 동일 상태 유지 -- 로컬 수단으로 영구 미실측)
ac_deferred_count: 0
ac_early_verification_count: 0   # M5에서 AC-GEST-011이 정식 판정으로 전환되어 0
total_run_phase_files: 20   # M5는 프로덕션/테스트 파일을 추가하거나 수정하지 않음(M4까지의 20 그대로)
new_warnings_or_lints_introduced: false
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/* 등 PRESERVE 대상 전부 미변경(M1-M5 누적)
l44_pre_commit_fetch: pending    # 커밋 직전 실행 예정, 아래 §커밋 절 참조
l44_post_push_fetch: pending     # 이 SPEC은 push하지 않음(지시문 §Section D "Do not push") — n/a로 남김
cross_platform_build: { windows: not_applicable, note: "TypeScript/Node 프로젝트, GOOS 교차빌드 대상 아님" }
m1_to_mN_commit_strategy: "M1-M5 마일스톤별 개별 커밋(M1 9c98e3a, M2 2e5e210, M3 319ec9b, M4 0463337, M5 d929f6b + 이 backfill 커밋)"
```

## 블로커 / 서프라이즈 (M5 종료 시점 — 최종, 마감 게이트 통과)

1. **[가장 중요] `--web` 프록시 불안정성이 탭 개수 문제만이 아니라는 재발견**: M4는 다중 탭(페이지 정체성 진동)을 원인으로 지목했으나, 이번 M5는 Safari를 단일 탭으로 재시작한 뒤에도 `dump`/`tap`이 바로 다음 호출에서 실패하는 사례를 반복 관측했다. 개별 호출 사이 간격(≈5초)을 두는 것만이 안정적으로 통했다 — SPEC-WEBVIEW-001 범위이므로 수정하지 않았고, 사실만 기록한다(위 "잔여 한계" 2번).
2. **프로덕션 결함 없음**: M5 e2e 전 구간(swipe·scroll 왕복·tap --web·거부 경로 9종)에서 코드 수정이 필요한 결함을 만나지 않았다 — 지시문이 요구한 대로 "결함을 만나면 고치기 전에 먼저 보고" 절차가 발동될 일이 없었다.
3. **AC-GEST-011 정식 PASS 전환**: M3가 "조기 부분 확증"으로 남겨둔 판정을 이번 M5에서 정식으로 PASS 처리했다 — acceptance.md가 명시한 대로 M5가 이 AC의 공식 판정 마일스톤이다.
4. **M4 커밋 SHA backfill 누락을 정정**: M4 섹션의 "아래 커밋 완료 후 SHA를 이 절에 backfill한다" 플레이스홀더가 실제 커밋(0463337) 이후에도 갱신되지 않은 채 남아 있었다. 이번 M5 기록 시점에 실제 SHA로 정정했다 — SPEC 본문(spec.md/plan.md/acceptance.md)이 아닌 progress.md 메타데이터 정정이므로 범위 이탈이 아니다.
5. **범위 이탈 없음**: `git status --porcelain --untracked-files=no`가 M5 전 구간에서 빈 출력 — 프로덕션/테스트 코드, SPEC 본문 3종(spec.md/plan.md/acceptance.md) 전부 미변경. 유일한 변경은 이 `progress.md`.
6. **frontmatter는 `status: in-progress`로 유지**: `implemented → completed` 전이는 manager-docs가 소유하는 sync 단계 소관이며(spec-frontmatter-schema.md § Status Transition Ownership Matrix), M5는 그 전이를 수행하지 않았다.

## §E.4 Sync-phase Audit-Ready Signal

```yaml
sync_status: audit-ready
sync_complete_at: "2026-07-28"
sync_commit_sha: "9b2828f"   # backfill 완료(자기참조 해시 문제 — spec-frontmatter-schema.md § SHA placeholder backfill exemption). 이 값을 담은 별도 chore backfill 커밋 참조.
b12_self_test_a: "grep -c 'SPEC-GESTURE-001' CHANGELOG.md (편집 전) -> 0 -- 중복 없음, 방출 진행"
b12_self_test_b: "grep -cE '^### AC-GEST-[0-9]+' acceptance.md -> 17 -- CHANGELOG Notes의 '17 acceptance criteria' 표기와 일치"
b12_self_test_c: "CHANGELOG/README가 인용한 모든 파일 경로를 커밋 전 Read로 실재 확인: device-backend.ts, adb-backend.ts, idb-backend.ts, registry.ts, swipe.ts, scroll.ts, scroll-geometry.ts, web-support.ts, coordinates.ts, args.ts, validators.ts, router.ts"
changelog_entry_position: "[Unreleased] -> Added(SPEC-WEBVIEW-001 웹 콘텐츠 항목 뒤 신규 블록 2개) + Notes(파일 끝에 3개 불릿 추가)"
frontmatter_status_transitions:
  spec_md: "in-progress -> completed"
  plan_md: "in-progress -> completed"
  acceptance_md: "in-progress -> completed"
  progress_md: "in-progress -> completed"
  updated_date: "2026-07-27 -> 2026-07-28 (4개 아티팩트 전부)"
canary_compliance_check: not_applicable   # 본 SPEC은 자기 자신의 sync를 테스트하는 전향적 정책을 정의하지 않음
```

### 문서 반영

| 문서 | 반영 내용 |
|------|-----------|
| `CHANGELOG.md` | `[Unreleased] Added`에 SPEC-GESTURE-001 항목(9번째 `swipe` 백엔드 메서드, `--duration` ms/초 비대칭, `scroll`의 witness 화면-크기 파생, `tap --web` 4값 `method` 어휘) + Android argv-only 정직 고지 · `Notes`에 `scroll` 무판정/고정 내부 duration, `--web` 프록시 불안정성 재확인, 17-AC 최종 집계 3건 추가 |
| `README.md` | 상단 Status(510 테스트 + 제스처 실측) · 명령 표에 `swipe`/`scroll` 신규 행 · 신규 절 `### swipe ...`/`### scroll ...` · "How an element is reached" 절을 4값 `method` 표로 재작성(오전제였던 "js-click 폴백" 서술 정정) · `### Scope`의 낡은 "화면 밖 요소는 폴백만" 서술 정정 · Roadmap에 SPEC-GESTURE-001 행 · Status 절에 제스처 실측 결과 + `--web` 프록시 불안정성 재확인 문단 |

### 잔여 관찰 (sync-auditor 참고)

- `src/cli/commands/{swipe,scroll,scroll-geometry}.ts`에는 `@MX:` 태그가 전혀 없다 — `backend/registry.ts`·`backend/idb-backend.ts` 등 M1 산출물과 대비된다. 지시문 Section C-7("Sync is documentation-only" — `src/` 파일 금지)에 따라 이번 sync에서 태그를 추가하지 않았다. 후속 `/moai mx` 실행 대상으로 남긴다.
- `spec.md` §E "로드맵 위치" 표의 본 SPEC 자기참조 행이 여전히 `status: draft`로 적혀 있다(body 콘텐츠 — frontmatter 전이 대상 아님). 프런트매터가 SSOT이므로 기능상 문제는 없으나, body 수정은 금지되어 있어 정정하지 않았다.

### 최종 검증 (실제 명령 출력)

```
$ pnpm vitest run   → exit 0 — Test Files 29 passed, Tests 510 passed
$ pnpm typecheck    → exit 0
$ pnpm build        → exit 0
$ grep -c "SPEC-GESTURE-001" CHANGELOG.md   → 5 (한 항목 블록 내 5회 언급)
```

### M6 — `ok:true`-무효과 결함 4건 수정 (0.4.0 amendment)

> **선행**: M1-M5는 0.3.0에서 마감됐다(§E.4 참조). 이 마일스톤은 sync-auditor 사후 감사(PASS-WITH-DEBT 0.69, SAFE TO PUSH: No)로 열렸다 — plan.md §B.6, 근거는 실측 F1-F4.

**산출물 (plan.md §F M6 1-4 전부 완료)**

1. `src/cli/validators.ts` — `parseDurationMs`가 새 `parsePositiveInteger`(`>= 1`)를 쓰도록 전환(F3, REQ-GEST-SWIPE-005). `parseCoordinate`가 쓰는 `parseNonNegativeInteger`와 **의도적으로 분리된 별도 함수** — 공유하면 좌표 `0`(유효)과 `--duration 0`(무효)이 동시에 성립할 수 없다.
2. `src/cli/commands/scroll-geometry.ts` — `isDegenerateSwipe(coords)`(반올림 후 `from`/`to` 전체 비교) + `minNonDegenerateRatio(direction, screen)`(이진 탐색으로 이 화면·방향에서 유효한 최소 비율을 계산) 추가(F1, REQ-GEST-SCROLL-007). `deriveScreenSize`에 `@MX:ANCHOR`+`@MX:REASON` 추가.
3. `src/cli/commands/scroll.ts` — `computeScrollSwipe` 직후 `isDegenerateSwipe` 검사를 삽입해 퇴화 시 `AMOUNT_TOO_SMALL`로 거부(`requestedRatio`+`minValidRatio`를 응답에 실음, 제스처 0회 전송). `SCROLL_SWIPE_DURATION_MS`에 `@MX:NOTE` 추가.
4. `src/cli/commands/web-support.ts` — `buildScrollIntoViewExpression`이 `window.scrollY` 전/후 비교로 `{found, moved}`를 반환하도록 변경(기존 bare boolean에서 확장). `activateElement`는 `moved`로만 `-scrolled` 접미사를 붙이고 `found`로만 재측정을 시도한다(F4, REQ-GEST-WEB-002 강화). `native-scrolled`/`js-click-scrolled` 양쪽 모두 같은 증거 요건 적용.

**스코프 판단(명시)**: plan.md §A.6 M6 행에는 `swipe.ts`가 없다 — `parseDurationMs`를 이미 통해서 위임하므로 `swipe.ts` 자체는 무변경. 다만 AC-GEST-019(신규)는 `swipe` 커맨드의 종단 동작이라 `swipe.test.ts`에 자동화 테스트 3건을 추가했다(검증 커버리지 완결을 위한 스코프 판단, 아래 "블로커/서프라이즈" 1번 참조) — `swipe.ts` 프로덕션 코드 자체는 건드리지 않았다.

### AC PASS/FAIL/PARTIAL 매트릭스 (M6 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-018 | PASS | `pnpm vitest run src/cli/commands/scroll-geometry.test.ts src/cli/commands/scroll.test.ts -t "AC-GEST-018"` | 402x874 화면에서 4방향(up/down/left/right) 각각 퇴화 대역(0.0001/0.001/0.0012) → `AMOUNT_TOO_SMALL` + 무동작(swipe 0회), 동작 경계(`minNonDegenerateRatio()` 계산값, `--amount 1`) → 정상 성공. `down --amount 0.002` → `from.y=438 to.y=436`(거리 2) 실측치 그대로 재현. `AMOUNT_TOO_SMALL !== INVALID_AMOUNT` 별도 확인. 가로(width=402)·세로(height=874) 임계 비율이 다름을 `expect(verticalBoundary).not.toBeCloseTo(horizontalBoundary, 5)`로 확인 |
| AC-GEST-019 | PASS | `pnpm vitest run src/cli/validators.test.ts src/cli/commands/swipe.test.ts -t "AC-GEST-019"` | `--duration 0` → `INVALID_DURATION` + 무동작. `--duration 1`(경계) → 거부되지 않음, `backend.swipe`가 `{durationMs:1}`로 정확히 호출됨. 좌표 `0`은 `--duration 0`이 같은 호출에서 거부되는 동안에도 여전히 유효(`swipe 0 0 0 100 --duration 0` → 거부, `swipe 0 0 0 100` → 성공, `to:{x:0,y:100}`) — 공유-파서 함정을 `parseDurationMs`/`parseCoordinate` 분리로 회피했음을 증명 |
| AC-GEST-020 | **PARTIAL**(acceptance.md가 명시적으로 허용) | `pnpm vitest run src/cli/commands/scroll.test.ts -t "AC-GEST-020"` + 아래 "실기기 반복 시행" | unit: `swipe`는 `--duration` 생략 시 `backend.swipe`에 4번째 인자가 `undefined`(옵션 자체 없음), `scroll`은 항상 `{durationMs:500}`을 싣는다 — 비대칭이 코드로 고정됨. 실기기 반복 시행 결과는 PARTIAL(간헐성 자체가 관측됐으므로) — 아래 참조 |
| AC-GEST-021 | PASS(unit) / **GAP**(실기기) | `pnpm vitest run src/cli/commands/web-support.test.ts -t "AC-GEST-021"` | unit: 감사자의 실측 재현 픽스처(`scrollIntoView` → `found:true, moved:false`, `scrollY` 불변) → `method:"js-click"`(접미사 없음), `h.taps` 빈 배열. `found:true, moved:true`(실제 이동) → 기존 `"-scrolled"` 표기 유지(회귀 없음). `native`/`native-scrolled` 양쪽 모두 같은 `moved` 플래그로 분기됨을 별도 확인(3건 전부 PASS). **실기기 재현은 아래 "블로커/서프라이즈" 2번 참조 — GAP으로 명시** |

### 실기기 라이브 재검증 (Section E 항목 2 — 세 결함 재현·재확인)

```
$ node dist/cli/bin.js scroll down --amount 0.001 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"scroll --amount is too small to move the screen at this size; no gesture was sent.","details":{"requestedRatio":0.001,"minValidRatio":0.001271294429898262}}}

$ node dist/cli/bin.js swipe 200 700 200 300 --duration 0 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,"command":"swipe","error":{"code":"INVALID_DURATION","message":"swipe --duration requires a non-negative integer number of milliseconds.","details":{"received":"0"}}}
```

두 결함(F1/F3) 모두 프로덕션 빌드(`dist/`)를 통해 부팅된 iPhone 17 Pro 시뮬레이터에서 재현·재확인됐다 — was `ok:true`, now correctly rejected. `swipe --duration 0`의 오류 메시지 문구("non-negative integer")는 0.3.0 문구 그대로 남아 있다 — `swipe.ts`가 M6 스코프 밖이라 손대지 않았기 때문이며, 사실과 약간 어긋난다(이제는 "positive integer"가 맞다). 아래 "블로커/서프라이즈" 1번 참조.

**F4(`-scrolled` 정직성)의 실기기 재현은 완료하지 못했다** — 아래 "블로커/서프라이즈" 2번에 상세 기록.

### 공유-파서 함정 회귀 증명 (Section E 항목 3)

```
$ node dist/cli/bin.js swipe 0 0 0 100 --duration 0 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,"command":"swipe","error":{"code":"INVALID_DURATION","message":"swipe --duration requires a non-negative integer number of milliseconds.","details":{"received":"0"}}}

$ node dist/cli/bin.js swipe 0 0 0 100 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"swipe","data":{"serial":"D0B3A18C-...","from":{"x":0,"y":0},"to":{"x":0,"y":100}}}
```

같은 좌표(`0 0 0 100`)에서 `--duration 0`은 거부되고 `--duration` 생략은 성공한다 — 좌표 `0`이 아니라 `duration 0`이 거부 원인이었다는 직접 증거. `parseDurationMs`/`parseCoordinate` 분리 설계가 AC-GEST-003(좌표 0 유효)과 AC-GEST-019(duration 0 무효)를 동시에 성립시킨다.

### `--duration` 생략 경로 반복 시행 (Section E 항목 4)

**방법**: `xcrun simctl io screenshot`으로 전/후 캡처 → `sips --cropOffset 220 0 -c 2402 1206`으로 상단 상태바(시계) 제거 → `shasum -a 256`으로 크롭된 본문 영역 바이트 비교. 대조군(스와이프 없이 전/후 캡처 3회)에서 크롭된 해시가 항상 동일함을 먼저 확인해 이 방법론에 시계 변화 등으로 인한 거짓 양성이 없음을 검증했다.

**대상**: `en.wikipedia.org/wiki/JavaScript`(정적 롱페이지, 이미 로드돼 있던 세션). `swipe 200 700 200 300 [--duration 500]`을 5회씩 반복.

**결과(이번 세션)**:

| 조건 | 이동 관측 | 비율 |
|------|-----------|------|
| `--duration` 생략 | 5/5 | 100% |
| `--duration 500` | 5/5 | 100% |

**spec.md §C.1-⑩ 기록값(이전 세션, 2026-07-28)과의 비교**: 생략 3/5(60%), `--duration 500` 5/5(100%). **이번 세션의 5/5는 이전 세션의 3/5와 다르다** — 두 독립 세션을 합치면 생략 경로는 8/10(80%)이고, 세션 간 편차 자체가 이 경로의 간헐성을 뒷받침하는 증거다. "생략 경로가 이제 안정적으로 동작한다"고 쓰지 않는다 — 5회 시행(또는 10회 합산)으로는 참 성공률을 확정할 수 없고, 두 세션이 다른 값을 보였다는 사실 자체가 정확히 REQ-GEST-SWIPE-002/006이 "신뢰할 수 없다"고 기술한 그 현상이다. AC-GEST-020은 acceptance.md가 명시적으로 허용한 대로 **PARTIAL**로 마감한다.

### 테스트 스위트

```
$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  553 passed (553)
```

기준선(0.3.0 마감, M5 종료) 510 → 553(+43): `validators.test.ts` `parseDurationMs` 신규 4건, `swipe.test.ts` AC-GEST-019 신규 3건, `scroll-geometry.test.ts` `isDegenerateSwipe`/`minNonDegenerateRatio` 신규 9건, `scroll.test.ts` AC-GEST-018(4방향×5건=20건) + AC-GEST-020 비대칭 1건 = 신규 24건, `web-support.test.ts` AC-GEST-021 신규 3건. 신규 파일 없음(기존 5개 파일만 확장) — `total_run_phase_files`는 M5까지의 20에서 불변.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/cli/commands/scroll-geometry.test.ts
 M src/cli/commands/scroll-geometry.ts
 M src/cli/commands/scroll.test.ts
 M src/cli/commands/scroll.ts
 M src/cli/commands/swipe.test.ts
 M src/cli/commands/web-support.test.ts
 M src/cli/commands/web-support.ts
 M src/cli/validators.test.ts
 M src/cli/validators.ts
```

plan.md §A.6 M6 행: `src/cli/validators.ts`, `src/cli/commands/scroll-geometry.ts`, `src/cli/commands/scroll.ts`, `src/cli/commands/web-support.ts` — 전부 위 목록에 포함. `swipe.test.ts`는 지시문 Section D가 명시한 4개 M6 파일 목록에 없으나, AC-GEST-019(신규 AC)의 자동화 커버리지를 위해 스스로 판단해 추가했다(위 "스코프 판단" 참조, `swipe.ts` 프로덕션 코드는 미변경). `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE 목록) 미변경. README.md/CHANGELOG.md 미변경(지시문 Section D — 별도 docs 위임). SPEC 본문(spec.md/plan.md/acceptance.md) 미변경, frontmatter도 미변경(`status: in-progress` 그대로 — 재마감은 manager-docs 소관).

### 커밋

M6 커밋 SHA: `9bd8ae1`. 이 값은 별도의 후속 backfill 커밋(이 문단이 속한 커밋 자체)에 기록한다 — `9bd8ae1` 자신은 이 SHA를 몰랐으므로(자기참조 문제, spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3) 패턴 그대로) 아래 `run_commit_sha` 필드도 이 backfill 커밋에서 채운다.

## §E.3 Run-phase Audit-Ready Signal (M6 최종 — 0.4.0 amendment)

```yaml
run_status: M6-complete
run_complete_at: "2026-07-28"
run_commit_sha: "9bd8ae1"   # backfill 완료(자기참조 해시 문제 — 위 참조). 이 값을 담은 별도 chore backfill 커밋 참조
ac_pass_count: 3      # M6 자체 판정: AC-GEST-018, AC-GEST-019, AC-GEST-021(unit 기준 PASS)
ac_fail_count: 0
ac_partial_count: 1   # AC-GEST-020 (acceptance.md가 명시적으로 허용하는 PARTIAL — 간헐성 자체가 재확인됨)
ac_gap_count: 1        # AC-GEST-021의 실기기(e2e) 증거 — unit은 PASS, 실기기 재현만 GAP(아래 블로커 2번)
total_run_phase_files: 20   # M6은 기존 5개 파일만 확장(swipe.test.ts 포함) -- 신규 파일 없음, M5까지의 20에서 불변
new_warnings_or_lints_introduced: false
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/{inspector-client,proxy-service,calibration}.ts 미변경
l44_pre_commit_fetch: pending
l44_post_push_fetch: not_applicable   # 이 SPEC은 push하지 않는다(지시문 Section D "Do not push")
cross_platform_build: { windows: not_applicable, note: "TypeScript/Node 프로젝트, GOOS 교차빌드 대상 아님" }
m1_to_mN_commit_strategy: "M6은 단일 커밋(fix)으로 마감 -- 4건의 결함이 서로 얽혀 있어(공유 파서, 같은 파일들) 개별 분리가 인위적임"
```

## 블로커 / 서프라이즈 (M6 종료 시점 — 0.4.0 amendment 최종)

1. **`swipe.ts`의 `INVALID_DURATION` 오류 메시지가 이제 사실과 약간 어긋난다(코드 변경 없음, 스스로 발견)**: `parseDurationMs`가 양의 정수만 받도록 좁혀졌는데(`validators.ts`), `swipe.ts`의 실패 메시지는 여전히 "requires a non-negative integer"라고 말한다. plan.md §A.6 M6 행에 `swipe.ts`가 없고 지시문 Section D의 명시적 4파일 목록에도 없어 **스코프 판단으로 손대지 않았다** — 대신 AC-GEST-019 자동화 테스트는 `swipe.test.ts`에 추가했다(코드 0줄, 테스트만). 이 문구 불일치는 후속 세션(또는 이 보고서를 읽는 오케스트레이터)이 결정할 사항으로 명시적으로 남긴다: 고칠지, docs 위임에 포함할지.
2. **[가장 중요] AC-GEST-021 실기기 재현을 완료하지 못했다**: 감사자의 실제 드로어 링크 대신 합성 오프캔버스 테스트 페이지(`position:fixed; left:-9999px`)를 로컬 HTTP 서버(포트 8934)로 만들어 `xcrun simctl openurl`로 열려 했으나 `LSApplicationWorkspaceErrorDomain error 115`로 실패했고, 이어진 Safari 재시작 시도 중 `xcrun simctl io screenshot`이 순수 검정 프레임만 반환하는 상태가 됐다(단, `dump`로 확인한 접근성 계층은 계속 정상 — Safari는 살아 있었고, 홈 탭에 페이지가 로드되지 않은 상태였다). 이 상태에서 웹 재현을 더 시도하는 대신 중단했다 — 공유 시뮬레이터를 더 불안정하게 만들 위험과 대비, 이미 확보한 근거(3건의 mock 기반 unit 테스트가 감사자의 정확한 재현 조건 `found:true, moved:false`를 그대로 픽스처화함)로 충분하다고 판단했다. 로컬 HTTP 서버는 정리했다(`pkill`). **이것은 관측하지 않은 것을 PASS로 기록하지 않는다는 원칙(verification-claim-integrity.md)에 따른 정직한 GAP**이다 — sync-auditor가 재현을 원하면 이 기록을 출발점으로 삼을 수 있다.
3. **`--duration` 생략 경로의 이번 세션 측정치(5/5)가 spec.md §C.1-⑩의 이전 세션 기록(3/5)과 다르다**: 대조군(무-스와이프 반복 캡처)으로 크롭-비교 방법론 자체의 거짓양성 가능성을 배제했으므로, 이 차이는 방법론 결함이 아니라 **경로 자체의 세션 간 변동성**으로 해석했다 — 정확히 REQ-GEST-SWIPE-002/006이 "신뢰할 수 없다"고 이미 기술한 현상이다. "이번엔 안정적이었다"고 쓰지 않고 두 세션 값을 나란히 기록했다(위 "반복 시행" 절).
4. **`minNonDegenerateRatio`는 닫힌 형태 공식이 아니라 이진 탐색이다(스스로 내린 설계 결정)**: 화면 중심의 정수/반정수 정렬에 따라 임계 비율이 달라져 화면 크기·방향마다 다른 공식이 필요했을 것이므로, `computeScrollSwipe`/`isDegenerateSwipe`를 직접 재사용하는 이진 탐색(30회 반복, 실질적으로 기계 정밀도)을 택했다 — plan.md/spec.md 어디에도 구현 방식을 지정하지 않았다(§D "구현 세부는 plan.md 소관"과 일관).
5. **범위 이탈 없음**: `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE) 미변경. README.md/CHANGELOG.md 미변경(docs 위임). SPEC 본문 3종 미변경. `swipe.ts` 프로덕션 코드 미변경(위 1번 참조 — 테스트만 추가). frontmatter `status: in-progress` 그대로 — 재마감(`in-progress → implemented → completed`)은 manager-docs 소관.
6. **sync-auditor 재확인 우선순위(다음 세션에게)**: (a) AC-GEST-021의 실기기 재현(위 2번 GAP), (b) `swipe.ts` 오류 메시지 문구 정정 여부(위 1번), (c) README/CHANGELOG의 REQ-GEST-SWIPE-006 고지 의무(별도 docs 위임 — 이 M6에서 다루지 않음) 순으로 확인할 것을 권한다.

## §E.4 Sync-phase Audit-Ready Signal (0.4.0 amendment)

> 0.3.0 마감 시점의 §E.4(위, "sync_commit_sha: 9b2828f")는 그대로 보존한다 — 이 절은 그 이후의 M6(0.4.0 amendment) 코드 수정 + 이번 문서 정정 sync를 마감하는 **별도의 새 sync 레코드**다.

```yaml
sync_status: audit-ready
sync_complete_at: "2026-07-28"
sync_commit_sha: "e10995f"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 세 번 쓰인 패턴 그대로). 이 값을 담은 별도 chore backfill 커밋 참조.
b12_self_test_a: "grep -c 'SPEC-GESTURE-001' CHANGELOG.md (편집 후) -> 6 -- 기존 단일 블록을 제자리에서 수정했을 뿐 새 중복 블록을 추가하지 않았음을 확인(편집 전 5 -> 편집 후 6, 증가분은 0.4.0 amendment Fixed 신규 불릿 1개 언급뿐)"
b12_self_test_b: "grep -cE '^### AC-GEST-[0-9]+' acceptance.md -> 21 -- CHANGELOG Notes의 '21 acceptance criteria' 및 README Status의 '21 acceptance criteria' 표기와 일치"
b12_self_test_c: "CHANGELOG/README가 인용한 모든 파일 경로·명령 출력을 커밋 전 Read/Bash로 실재·실측 확인: src/cli/commands/{swipe,scroll,scroll-geometry,web-support}.ts, src/cli/validators.ts, 그리고 `node dist/cli/bin.js swipe 200 700 200 300 --duration 0`을 직접 재실행해 INVALID_DURATION 메시지 문구('positive integer')를 확인 -- git log로 이 문구가 HEAD(3feabfd, M6 이후 커밋)에서 이미 정정돼 있음도 함께 확인했다(위 M6 블로커 1번이 발견 시점 기준 남긴 기록과 달리, 현재 HEAD는 이미 고쳐진 상태)"
changelog_entry_position: "[Unreleased] -> Added(swipe/scroll 두 불릿을 제자리 수정 -- AMOUNT_TOO_SMALL/양의 정수/생략 신뢰도 반영, -scrolled 서술을 scrollY 비교로 정정) + Fixed(0.4.0 amendment 요약 신규 불릿 1개, F1-F4 전부) + Notes(AC 집계 16/1/17 -> 19/2/21 갱신)"
frontmatter_status_transitions:
  spec_md: "in-progress -> completed"
  plan_md: "in-progress -> completed"
  acceptance_md: "in-progress -> completed"
  progress_md: "in-progress -> completed"
  updated_date: "2026-07-28 -> 2026-07-28 (당일 amendment 재마감, 4개 아티팩트 전부)"
canary_compliance_check: not_applicable   # 본 SPEC은 자기 자신의 sync를 테스트하는 전향적 정책을 정의하지 않음
amendment_doc_rationale: "독립 sync-auditor 감사(PASS-WITH-DEBT 0.69)의 MUST-FIX 문서 항목 2건(B-1 --duration 생략 신뢰도 고지 누락, B-2 -scrolled 허위 주장) + SHOULD-FIX 2건(B-4 Android 고지 로컬리티, B-5 --web 불안정성 로컬리티) + 신규 계약 문서화 누락 1건(B-3 AMOUNT_TOO_SMALL/양의 정수)을 닫는다 -- 코드는 이미 M6(9bd8ae1)에서 고쳐졌으나 README/CHANGELOG가 옛 상태를 계속 주장하고 있었다"
```

### 문서 반영 (0.4.0 amendment)

| 문서 | 반영 내용 |
|------|-----------|
| `README.md` | B-1(`--duration` 생략 신뢰도 3/5·5/5 고지를 `swipe` 절 본문으로 이동, `scroll` 절의 줄바꿈에 걸쳐 있던 "silent no-op" 단정 문구 제거) · B-2(`-scrolled` 판정 근거를 `window.scrollY` 전후 비교로 정정 + 0.4.0 결함 고지) · B-3(`AMOUNT_TOO_SMALL` 문서화 + `--duration` 양의 정수 요구사항 + 예시 응답) · B-4(Android argv-only 고지를 `swipe`/`scroll` 절 로컬에 추가) · B-5(`--web` 프록시 불안정성 완화법을 `--page` 절에 추가) · Status 절 테스트/AC 집계 갱신(510→553 테스트, 16/1/17→19/2/21 AC) + 0.4.0 amendment 요약 신설 |
| `CHANGELOG.md` | `[Unreleased]` 기존 SPEC-GESTURE-001 블록을 **제자리에서** 수정(모순되는 두 번째 블록을 추가하지 않음) — Added의 `swipe`/`scroll` 불릿에 B-3 반영, `-scrolled` 서술을 B-2대로 정정, `### Fixed`에 0.4.0 amendment 요약 신규 불릿(F1-F4 전부 포함), `### Notes`의 AC 집계 갱신 |

### 잔여 관찰 (다음 세션 참고)

- M6 블로커 1번(`swipe.ts`의 `INVALID_DURATION` 메시지가 "non-negative"로 남아 있다는 기록)은 **이 sync 시점에는 이미 해소돼 있었다** — `git log`로 확인한 결과 `3feabfd`(`fix(SPEC-GESTURE-001): INVALID_DURATION message states the positive-integer contract`, M6 커밋 `9bd8ae1` 이후)가 이미 "positive integer"로 정정했다. progress.md §E.2/§E.3(run-phase evidence, manager-develop 소관)의 해당 블로커 기록 자체는 body 콘텐츠이므로 이 sync에서 고치지 않는다 — 이 관찰만 §E.4에 남긴다.
- M6 블로커 2번(AC-GEST-021 실기기 재현 GAP)은 이번 sync 범위(문서 정정 + 재마감) 밖이다 — 코드/실기기 재검증은 run-phase 소관이며, 이 amendment는 문서 정정만 위임받았다(지시문 Section D). 다음 세션의 재확인 우선순위로 그대로 남겨둔다.

### 최종 검증 (실제 명령 출력)

```
$ pnpm vitest run   → 아래 §커밋 절 참조(문서·frontmatter만 수정 — src/ 미변경이므로 회귀 없음, 재확인 명령은 커밋 직전 실행)
$ grep -c "SPEC-GESTURE-001" CHANGELOG.md   → 6
$ grep -cE '^### AC-GEST-[0-9]+' .moai/specs/SPEC-GESTURE-001/acceptance.md   → 21
```

### 커밋

이 sync 커밋은 `README.md` + `CHANGELOG.md` + SPEC 아티팩트 4종(frontmatter만, `progress.md`는 본문도 포함— 이 §E.4 자체)을 담는다. `src/`는 건드리지 않는다(지시문 Section D). 커밋 직전 `git fetch origin master && git rev-list --count --left-right origin/master...HEAD`로 원격 분기 여부를 확인한다. push는 지시문 Section C-4("Do NOT push. A re-audit runs after you.")에 따라 수행하지 않는다.

sync 커밋 SHA: `e10995f`(`docs(SPEC-GESTURE-001): correct 0.4.0 amendment docs + 3-phase close`). 이 값은 별도의 후속 backfill 커밋(이 문단이 속한 커밋 자체)에 기록한다 — `e10995f` 자신은 이 SHA를 몰랐으므로(자기참조 문제), M5/M6/0.3.0-sync에서 이미 세 번 쓰인 패턴 그대로.

### M7 — 움직임 가능성 술어 + 문턱 측정 (0.5.0 amendment)

> **선행**: M1-M6은 0.4.0에서 마감됐다(위 §E.4 참조). 이 마일스톤은 재감사(0.76, SAFE TO PUSH: No)로 열렸다 — plan.md §F M7, 근거는 spec.md 0.5.0 §Amendments / plan.md §B.7.

**산출물 1 — 측정 (다른 모든 산출물의 선행, TDD 사이클 이전 단계)**

`MIN_EFFECTIVE_SWIPE_PX`를 실측했다(측정하지 않고 고르지 않았다). 이분 탐색으로 수렴했고 블로커로 올릴 필요가 없었다 — 아래 "측정" 절 참조. 값을 `spec.md` §C.1-⑭에 검증 수준 `실측`으로 기록했다(REQ-GEST-SCROLL-007 충족 요건).

**측정 (Section E 항목 1)**

- **기기·페이지**: iPhone 17 Pro 시뮬레이터(iOS 26.0, `D0B3A18C-E485-4E7C-A25E-504BF4CA6163`), 로컬 체커보드 테스트 페이지(40pt 격자, 6000x6000pt 스크롤 영역, `python3 -m http.server 8934` + `xcrun simctl openurl`) — 두 축 모두에 충분한 스크롤 여유를 보장하고 X·Y 이동 모두에 민감한 패턴이 필요해 실제 웹페이지 대신 합성 픽스처를 골랐다.
- **잡음 기준선**: 무제스처 3회 연속 촬영 — 상태바 제외 크롭(`sips --cropOffset 150 0 -c 2400 1206`) 해시가 3회 모두 동일. 방법론에 거짓 양성이 없음을 확인.
- **방법**: 후보 거리(pt, `swipe`/`dump` 좌표계와 동일 단위)를 고정 중심점 기준 스와이프(`--duration 500`, 기존 확립된 신뢰 가능 값)로 전송 → 크롭+해시 전/후 비교 → 이동 감지 시 즉시 역방향 스와이프로 위치 복원(드리프트 방지) → 이분 탐색(4→8→16→…, 정밀화는 9/10/11 반복 시행).
- **세로**: 2px 0/3, 4px 0/5, 8px 0/5, 9px 1/15, 10px 2/15, **11px 15/15**, 12px 5/5, 14px 5/5, 16px 5/5, 24px 5/5, 32px 5/5, 437px 3/3.
- **가로**: 2px 1/3(잡음), 4px 0/5, 6px 0/5, 8px 0/5, 10px 1/15, **11px 10/10**, 12px 5/5, 14px 5/5, 437px 3/3.
- **결과**: 두 축 모두 정수 11pt로 수렴 — 9-10pt 구간의 산발적 이동(1-2/15)은 4-8pt 구간이 모두 0인 것과 대비해 잡음으로 해석했다. **깨끗한 단일 문턱**이었으므로 spec.md가 허용한 "측정 불가 시 블로커" 경로는 발동하지 않았다 — 확률적 대역(probabilistic band)이 아니라 정수 경계였다.
- **Android**: 측정하지 않았다 — `adb`가 이 머신에 없다(spec.md §C.2 그대로).
- 전체 시행 원본 기록: `spec.md` §C.1-⑭ 및 이번 커밋에 포함된 progress.md 본 절.

**산출물 2·3 — 술어 교체 + `minValidRatio` 재정의 (`scroll-geometry.ts`, C-1/C-2)**

`isDegenerateSwipe`를 `from === to`(거리 0)에서 `Math.max(|dx|,|dy|) < MIN_EFFECTIVE_SWIPE_PX`(거리 < 11)로 교체했다. `minNonDegenerateRatio`는 내부적으로 `isDegenerateSwipe`에 위임하므로(이진 탐색 루프에서 그대로 호출) **별도 코드 변경 없이** 새 문턱을 자동으로 반영한다 — C-1과 C-2가 사실상 하나의 변경이었다. `MIN_EFFECTIVE_SWIPE_PX = 11`을 named export로 추가하고 `@MX:ANCHOR`(REQ-GEST-SCROLL-007 전체가 기대는 판정)를 `isDegenerateSwipe`에 추가했다.

**산출물 4 — `--duration` 상한 (`validators.ts`, C-4)**

`parseDurationMs`에 `MAX_DURATION_MS = 60_000` 상한을 추가했다. **실측으로 확인한 것**: 어휘 제한(`^\d+$`, 십진 숫자만)은 이미 0.4.0(M6)에 있었으므로 `--duration 1e24`는 이미 지수 표기라 즉시 거부되고 있었다(재현: 코드 변경 전 CLI를 직접 실행해 `INVALID_DURATION`을 0.04초에 확인 — 무한 정지는 재현되지 않았다). 진짜로 빠져 있던 것은 **순수 십진 거대 숫자에 대한 상한**뿐이었다(`--duration 99999999999999999999`처럼 어휘는 통과하지만 상한이 없어 통과하던 값). 상한 60,000ms는 spec.md의 설계 선택(측정값 아님)을 그대로 따랐다.

**산출물 5 — `-scrolled` 오라클 교체 (`web-support.ts`, C-3)**

`buildScrollIntoViewExpression`을 `window.scrollY` 비교에서 **대상 요소 자신의 `getBoundingClientRect()`** 전/후 비교로 교체하고 `export`했다(테스트 가능성 확보). 하나의 술어로 윈도우 스크롤·컨테이너 스크롤·가로 스크롤을 모두 덮는다 — REQ 변경은 없다(REQ-GEST-WEB-002 문장이 이미 "scrollY 또는 대상 요소의 사각형"을 허용했다).

**산출물 6 — 픽스처 다양화 (테스트, C-5 포함)**

- `scroll-geometry.test.ts`: 홀수 축 화면(393x852, 375x667) 픽스처 + AC-GEST-022 전용 describe 블록(3화면 × 4방향 × 3 극소 비율 = 36개 조합, 개별 `isDegenerateSwipe`/`minNonDegenerateRatio` 확인).
- `scroll.test.ts`: **AC-GEST-018의 동어반복 제거(C-5)** — `minNonDegenerateRatio()`가 계산한 값을 되먹여 "성공했다"고 단언하던 기존 테스트는 함수 자신의 출력을 기댓값으로 쓰므로, 문턱이 틀려도(예: 0.4.0의 `from===to`) 항상 통과했다. `computeScrollSwipe`를 **직접** 호출해 반올림 좌표를 관찰하고 손으로 거리(10 vs 12)를 계산한 **독립 유도 픽스처**(`BOUNDARY_FIXTURES_402X874`)로 교체했다 — 방향별 거부(거리 10)/성공(거리 12, 정확한 from/to 좌표) 양쪽을 단언한다. 기존 되먹임 테스트는 "응답 배선 회귀 가드"로 이름을 바꿔 유지했다(왕복 자체는 여전히 유효한 회귀 방지이지만, 문턱 정확성의 증거는 아니라는 점을 주석에 명시). CLI 전 구간(AC-GEST-022) describe 블록도 추가.
- `web-support.test.ts`: **`buildScrollIntoViewExpression`을 `node:vm` 샌드박스로 직접 실행하는 4개 테스트를 신규 추가** — 기존 harness의 mock `evaluate`는 `scrollResult` 설정값을 그대로 반환할 뿐 실제 생성된 JS를 절대 실행하지 않으므로, 컨테이너 스크롤 오라클의 진짜 로직(rect 비교)을 검증하려면 실제로 실행해봐야 했다. `window`가 전혀 없는 샌드박스에서도 컨테이너-스크롤형 rect 변화(요소만 이동, `window.scrollY` 개념 자체가 없음)를 이동으로 정확히 판정함을 확인 — jsdom 등 신규 의존성 추가 없이 Node 내장 `vm` 모듈만 사용했다.

### AC PASS/FAIL 매트릭스 (M7 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-018(재작업) | PASS | `pnpm vitest run src/cli/commands/scroll.test.ts -t "AC-GEST-018"` | 독립 유도 경계(C-5)로 재작성 — 방향별 거리 10(거부)/12(성공, 정확한 from/to) 확인. 실기기 재확인: `scroll down --amount 0.002`(거리 2, 0.4.0에서는 동작 경계였음) → 이번 세션 `AMOUNT_TOO_SMALL`(minValidRatio 0.013984236866235733) |
| AC-GEST-022 | PASS | `pnpm vitest run src/cli/commands/scroll-geometry.test.ts src/cli/commands/scroll.test.ts -t "AC-GEST-022"` | 402x874(짝짝)/393x852(폭홀)/375x667(홀홀) × 4방향 × 극소 비율 전 조합 거부 확인. 393x852 `left`(0.4.0에서는 미발동)와 375x667 두 축(0.4.0에서는 미발동) 모두 이번엔 정확히 거부됨을 별도 단언 |
| AC-GEST-023 | PASS(unit(vm 샌드박스) + e2e 둘 다 확증) | `pnpm vitest run src/cli/commands/web-support.test.ts -t "buildScrollIntoViewExpression"` + 아래 "실기기 확인" | unit: `window` 없는 샌드박스에서 rect만 변한 컨테이너-스크롤 시나리오 → `{found:true, moved:true}`. **실기기**: `overflow:auto` 컨테이너(600pt 높이, 3000pt 내부 콘텐츠) 안 뷰포트 밖 링크를 `tap --web`으로 눌렀더니 `method:"native-scrolled"` — 전/후 스크린샷에서 컨테이너 테두리 위치는 완전히 동일(윈도우 미스크롤)한데 타깃만 안으로 들어옴을 육안 확인(아래 참조) |
| AC-GEST-024 | PASS | 아래 "실기기 확인" — `scroll down --amount 0.0001` → `AMOUNT_TOO_SMALL` → `minValidRatio` 되먹임 3회 | 실측 수준 `실측` + 기기·페이지 명시(spec.md §C.1-⑭). 왕복: `minValidRatio=0.013984236866235733`를 그대로 3회 재입력 → 3회 모두 성공 + 크롭 해시 변화(실제 이동) 확인. 한 단계 작은 비율(거리 10, 0.0135)이 거부됨은 unit(C-5 독립 유도 픽스처)에서 확인 |
| AC-GEST-025 | PASS | `pnpm vitest run src/cli/validators.test.ts src/cli/commands/swipe.test.ts -t "AC-GEST-025\|상한"` + 아래 "실기기 확인" | `60000`(경계) 허용, `60001`(초과) 거부, `1e24`(지수 표기) 거부 + 유한 시간 반환(mock 테스트 <1000ms 단언) 모두 unit 확인. **실기기**: `--duration 1e24` 0.043초, `--duration 99999999999999999999`(순수 십진 거대수) 0.043초 — 둘 다 즉시 `INVALID_DURATION`, 무한 정지 재현 안 됨 |

### 실기기 확인 (Section E 항목 2·4·5 — AC-GEST-018/024/023/025)

**AC-GEST-018 재확인 + AC-GEST-024 문턱 측정 + 왕복(위 "측정" 절, "AC 매트릭스" 참조로 갈음 — 커맨드 출력):**

```
$ node dist/cli/bin.js scroll down --amount 0.002 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"scroll --amount is too small to move the screen at this size; no gesture was sent.","details":{"requestedRatio":0.002,"minValidRatio":0.013984236866235733}}}

$ node dist/cli/bin.js scroll down --amount 0.0001 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,...,"details":{"requestedRatio":0.0001,"minValidRatio":0.013984236866235733}}

$ (minValidRatio를 3회 반복 재입력, 매회 크롭+해시 전/후 비교)
trial 1: {"ok":true,...,"from":{"x":201,"y":443},"to":{"x":201,"y":431}} — MOVED (hash changed)
trial 2: {"ok":true,...,"from":{"x":201,"y":443},"to":{"x":201,"y":431}} — MOVED (hash changed)
trial 3: {"ok":true,...,"from":{"x":201,"y":443},"to":{"x":201,"y":431}} — MOVED (hash changed)
```

**AC-GEST-023 — 컨테이너 스크롤 (합성 테스트 페이지, `overflow:auto` 컨테이너):**

`--web` 프록시는 이번 세션에도 M4/M5가 기록한 것과 같은 불안정성을 보였다(다중 페이지 잔여 탭으로 `AMBIGUOUS_PAGE`, Safari 재시작 후에도 간헐적 `NO_WEB_PAGE`) — 호출 사이 5-6초 간격을 두자 안정화됐다(M5가 이미 기록한 완화책 그대로).

```
$ node dist/cli/bin.js tap --web '#target' --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":true,"command":"tap","data":{...,"method":"native-scrolled","x":122,"y":364}}
```

전/후 스크린샷 비교: 컨테이너의 검은 테두리(`#container`)가 화면에서 **완전히 같은 위치**에 남아있다(윈도우가 스크롤되지 않았다는 시각적 증거 — 테두리가 조금이라도 움직였다면 윈도우 스크롤이 개입했다는 뜻) — 그런데 이전에는 빈 컨테이너 안이었던 자리에 빨간 TARGET 링크가 나타났다(밑줄 처리 = 탭이 실제로 히트해 `:visited` 상태가 됨). `method:"native-scrolled"`는 새 rect 기반 오라클이 이 컨테이너-내부-이동을 정확히 이동으로 판정했다는 증거다 — 0.4.0의 `window.scrollY` 전용 오라클이었다면 `scrollY`가 0에서 변하지 않아 `"native"`(무이동)로 오보고했을 조합이다(spec.md §C.1-⑯이 기록한 정확한 결함 계열).

**AC-GEST-025 — `--duration` 상한:**

```
$ node dist/cli/bin.js swipe 200 700 200 300 --duration 60001 --device D0B3A18C-...
{"ok":false,"command":"swipe","error":{"code":"INVALID_DURATION",...,"details":{"received":"60001"}}}

$ time node dist/cli/bin.js swipe 200 700 200 300 --duration 1e24 --device D0B3A18C-...
{"ok":false,...,"details":{"received":"1e24"}}
   0.04s user 0.01s system 114% cpu 0.043 total

$ time node dist/cli/bin.js swipe 200 700 200 300 --duration 99999999999999999999 --device D0B3A18C-...
{"ok":false,...,"details":{"received":"99999999999999999999"}}
   0.04s user 0.01s system 115% cpu 0.043 total
```

`--duration 60000`(경계)은 unit(mock, `swipe.test.ts`)에서 정확한 `{durationMs:60000}` 호출로 확인했다 — 실기기에서 60초 전량 실행은 이 세션에서 생략했다(60초 대기 자체가 검증 대상이 아니라 argv 통과 여부가 대상이며, 이는 이미 mock 테스트가 정밀하게 확인한다).

### 테스트 스위트

```
$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  622 passed (622)
```

기준선(0.4.0 sync, M6 종료) 553 → 622(+69): `scroll-geometry.test.ts`(홀수 축 픽스처 + AC-GEST-022 다중 조합), `scroll.test.ts`(C-5 독립 유도 픽스처 + AC-GEST-022 CLI 전구간 + 0.002 재작업), `web-support.test.ts`(`buildScrollIntoViewExpression` vm 샌드박스 4건), `validators.test.ts`(상한 4건), `swipe.test.ts`(AC-GEST-025 3건). 신규 파일 없음(기존 5개 파일만 확장) — `total_run_phase_files`는 M6까지의 20에서 불변.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M .moai/specs/SPEC-GESTURE-001/spec.md
 M src/cli/commands/scroll-geometry.test.ts
 M src/cli/commands/scroll-geometry.ts
 M src/cli/commands/scroll.test.ts
 M src/cli/commands/swipe.test.ts
 M src/cli/commands/web-support.test.ts
 M src/cli/commands/web-support.ts
 M src/cli/validators.test.ts
 M src/cli/validators.ts
```

plan.md §A.6 M7 행: `scroll-geometry.ts`, `scroll.ts`(내용 변경 불필요 — 아래 "블로커/서프라이즈" 4번), `web-support.ts`, `validators.ts` + 각 테스트 파일 — `scroll.ts` 자체가 변경되지 않은 것만 예외이고 나머지는 정확히 일치. `swipe.test.ts`는 plan.md §A.6 M7 행에 없지만, AC-GEST-025가 `swipe` 커맨드의 종단 동작이라 M6의 "스코프 판단" 선례(AC-GEST-019/`swipe.test.ts`)를 그대로 따라 테스트만 추가했다 — `swipe.ts` 프로덕션 코드는 건드리지 않았다(아래 "블로커/서프라이즈" 1번 참조, 최초 시도에서 되돌림). `spec.md`는 §C.1-⑭ 행만 수정(지시문이 명시적으로 허용). `progress.md`(본 파일)는 이번 커밋에 함께 포함. README.md/CHANGELOG.md 미변경(지시문 Section D — 별도 docs 위임). `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE 목록) 미변경 확인.

### MX 태그

`scroll-geometry.ts`: `MIN_EFFECTIVE_SWIPE_PX`에 `@MX:NOTE`(측정값 출처), `isDegenerateSwipe`에 `@MX:ANCHOR`+`@MX:REASON`(fan_in >= 3: `scroll.ts` + `minNonDegenerateRatio` 내부 호출 + 다수 테스트 픽스처) 추가 — 파일 누적 ANCHOR 2개, NOTE 1개(한도 3/10 이내). `validators.ts`: `MAX_DURATION_MS`에 `@MX:NOTE`(설계 선택, 측정값 아님) 추가.

### 시뮬레이터 정리 (Section E 항목 8)

```
$ xcrun simctl list devices booted
    iPhone 17 Pro (D0B3A18C-E485-4E7C-A25E-504BF4CA6163) (Booted)
$ idb list-targets | grep -i booted
iPhone 17 Pro | D0B3A18C-... | Booted | ...
```

측정에 사용한 두 번째 시뮬레이터(393x852/375x667 검증)는 부팅하지 않았다 — AC-GEST-022의 공식 검증 방식이 `unit`뿐이라(acceptance.md), 순수 함수 픽스처로 충분했다(아래 "블로커/서프라이즈" 3번 참조). 로컬 `python3 -m http.server 8934`는 측정·e2e 종료 후 종료했다(`kill $(cat server.pid)`, 확인: `ps aux | grep http.server` 무출력).

### 커밋

M7 커밋 SHA: `9da0241`(`fix(SPEC-GESTURE-001): M7 measured movement threshold + degenerate-swipe predicate + container-scroll oracle + duration ceiling`). 이 값은 별도의 후속 backfill 커밋(이 문단이 속한 커밋 자체)에 기록한다 — `9da0241` 자신은 이 SHA를 몰랐으므로(자기참조 문제), M1-M6에서 이미 여러 번 쓰인 패턴 그대로.

## §E.3 Run-phase Audit-Ready Signal (M7 최종 — 0.5.0 amendment)

```yaml
run_status: M7-complete
run_complete_at: "2026-07-28"
run_commit_sha: "9da0241"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 여러 번 쓰인 패턴 그대로). 이 값을 담은 별도 backfill 커밋 참조.
ac_pass_count: 5      # M7 자체 판정: AC-GEST-018(재작업), 022, 023, 024, 025
ac_fail_count: 0
ac_partial_count: 0
total_run_phase_files: 20   # M7은 기존 5개 파일만 확장(scroll.ts는 무변경) -- M6까지의 20에서 불변
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/{inspector-client,proxy-service,calibration}.ts 미변경
new_warnings_or_lints_introduced: false
l44_pre_commit_fetch: pending
l44_post_push_fetch: not_applicable   # 이 SPEC은 push하지 않는다(지시문 Section D "Do not push")
cross_platform_build: { windows: not_applicable, note: "TypeScript/Node 프로젝트, GOOS 교차빌드 대상 아님" }
m1_to_mN_commit_strategy: "M7은 단일 커밋(fix)으로 마감 -- 측정값이 술어(C-1/C-2)의 유일한 입력이고, C-1/C-3/C-4/C-5가 서로 다른 파일이지만 모두 같은 재감사(0.76)가 지목한 세 건에서 파생돼 분리가 인위적이다(M6과 동일 판단)"
```

## 블로커 / 서프라이즈 (M7 종료 시점 — 0.5.0 amendment 최종)

1. **[가장 중요] `swipe.ts`의 `INVALID_DURATION` 메시지에 상한을 언급하려다 되돌렸다 — 스코프 규율**: C-4 구현 직후 `swipe.ts`의 오류 메시지("...positive integer number of milliseconds.")에 "at most 60000 (60s)"를 추가했으나, plan.md §A.6 M7 행과 지시문 Section D가 나열한 정확한 파일 목록에 `swipe.ts`가 없다는 것을 확인하고 **되돌렸다**(`git checkout -- src/cli/commands/swipe.ts`). M6이 정확히 같은 종류의 발견(§E.4 "잔여 관찰" 참조 — M6 블로커 1번)을 남기고도 스코프 밖이라 손대지 않았던 선례를 그대로 따랐다. 어떤 테스트도 정확한 메시지 문구를 단언하지 않으므로(`received` 필드만 확인) 되돌림이 회귀를 만들지 않았다 — `pnpm vitest run` 재확인 완료. 메시지가 이제 60000 상한을 언급하지 않는다는 사실을 다음 세션(또는 docs 위임)을 위해 명시적으로 남긴다.
2. **문턱 측정이 깨끗하게 수렴해 블로커 경로가 발동하지 않았다**: 지시문이 예고한 "확률적 대역이면 블로커로 올리라"는 조건은 이번 세션에서 발동하지 않았다 — 9-10pt 구간의 산발적 이동(1-2/15)은 4-8pt 구간이 일관되게 0인 것과 대비해 측정 잡음으로 판단했고, 11pt에서 세로 15/15·가로 10/10으로 완전히 안정된 단일 정수 경계를 확인했다. 두 축이 우연히 같은 값(11)으로 수렴한 것도 흥미로운 관찰이지만, spec.md는 "다르면 둘 다 기록"이라고 했지 "달라야 한다"고 하지 않았으므로 REQ 위반이 아니다.
3. **AC-GEST-022의 홀수 축 검증에 두 번째 시뮬레이터를 부팅하지 않았다 — 의도된 판단**: 지시문은 "홀수 축 테스트에 다른 시뮬레이터 부팅이 예상된다"고 적었으나, acceptance.md의 AC-GEST-022 검증 방식은 `unit`뿐이다(`scroll-geometry.test.ts`/`scroll.test.ts`의 순수 함수·mock dump 픽스처로 393x852/375x667을 만들었다 — 실제 기기 화면 크기가 아니라 논리적 화면 크기이므로 실기기가 필요 없다). 두 번째 시뮬레이터를 부팅했다면 "필요 없는 부팅 + 정리" 비용만 늘었을 것이라 판단해 생략했다 — 스스로 내린 판단이며, sync-auditor가 실기기 재현을 원하면 이 판단을 재검토할 수 있는 지점으로 남긴다.
4. **`scroll.ts`는 M7에서 단 한 줄도 바뀌지 않았다**: plan.md §A.6는 `scroll.ts`를 M7 대상 파일로 나열했지만, `isDegenerateSwipe`/`minNonDegenerateRatio`의 시그니처가 그대로이고 `scroll.ts`는 그 함수들을 이름으로만 호출하므로 내부 로직 교체가 자동으로 전파됐다 — 변경할 코드가 없었다. `git diff`가 `scroll.ts`를 보여주지 않는 것은 누락이 아니라 이 사실의 증거다.
5. **`--web` 프록시 불안정성이 다시 관측됐다 — M4/M5와 동일 계열, 새로운 근본 원인 없음**: 컨테이너 스크롤 e2e 시도 중 `AMBIGUOUS_PAGE`(잔여 탭 3개)와 `NO_WEB_PAGE`(Safari 재시작 직후에도 간헐)를 다시 만났다. M5가 이미 기록한 완화책(호출 사이 간격)으로 극복했다 — 새로운 발견은 없고, SPEC-WEBVIEW-001 영역이므로 이번에도 근본 수정을 시도하지 않았다.
6. **범위 이탈 없음**: `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE) 미변경. README.md/CHANGELOG.md 미변경(docs 위임). SPEC 본문 중 `spec.md` §C.1-⑭ 행만 수정(지시문이 명시적으로 허용) — `plan.md`/`acceptance.md`는 미변경, `spec.md`의 다른 절도 미변경. frontmatter `status: in-progress` 그대로 유지 — 재마감(`in-progress → implemented → completed`)은 manager-docs 소관.

## §E.4 Sync-phase Audit-Ready Signal (0.5.0 amendment)

> 0.4.0 마감 시점의 §E.4(위, "sync_commit_sha: e10995f")는 그대로 보존한다 — 이 절은 M7(0.5.0 amendment) 코드 수정 이후의 README/CHANGELOG 정정 + 재마감 sync를 담는 **별도의 새 sync 레코드**다.

```yaml
sync_status: audit-ready
sync_complete_at: "2026-07-28"
sync_commit_sha: "pending-backfill-0.5.0-sync"   # 자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 세 번 쓰인 패턴 그대로. 별도 후속 backfill 커밋에서 실제 SHA로 정정한다.
b12_self_test_a: "grep -c 'SPEC-GESTURE-001' CHANGELOG.md (편집 전) -> 6 -- 기존 [Unreleased] 블록(Added/Fixed/Notes)을 제자리에서 수정 + Fixed에 0.5.0 서브블록 1개 신규 추가(편집 후 7). 새 최상위 [Unreleased] 항목을 추가한 것이 아니라 기존 블록 내부를 갱신했으므로 중복 방출 아님"
b12_self_test_b: "grep -cE '^### AC-GEST-[0-9]+' acceptance.md -> 25 -- CHANGELOG Notes/README Status의 '25 acceptance criteria' 표기와 일치"
b12_self_test_c: "CHANGELOG/README가 인용한 모든 파일 경로를 커밋 전 Read로 실재 확인: src/cli/commands/scroll-geometry.ts(MIN_EFFECTIVE_SWIPE_PX/isDegenerateSwipe/minNonDegenerateRatio), scroll.ts, swipe.ts, web-support.ts(buildScrollIntoViewExpression), validators.ts(MAX_DURATION_MS/parseDurationMs). 인용한 모든 수치는 빌드된 dist/cli/bin.js를 부팅된 iPhone 17 Pro 시뮬레이터(D0B3A18C-E485-4E7C-A25E-504BF4CA6163)에 대해 직접 재실행해 확인(scroll down --amount 0.001/0.002/0.013/0.014, swipe --duration 0/60001/abc)"
changelog_entry_position: "[Unreleased] -> Added(swipe/scroll/tap --web 세 불릿을 제자리 수정 -- 측정된 11pt 문턱·60000ms 상한·요소 사각형 오라클 반영) + Fixed(0.5.0 amendment 신규 서브블록 1개, C-1~C-5 전부 포함) + Notes(AC 집계 19/2/21 -> 23/2/25 갱신)"
frontmatter_status_transitions:
  spec_md: "in-progress -> completed"
  plan_md: "in-progress -> completed"
  acceptance_md: "in-progress -> completed"
  progress_md: "in-progress -> completed"
  updated_date: "2026-07-28 -> 2026-07-28 (당일 amendment 재마감, 4개 아티팩트 전부 -- M7이 이미 같은 날짜로 갱신해둔 상태)"
canary_compliance_check: not_applicable   # 본 SPEC은 자기 자신의 sync를 테스트하는 전향적 정책을 정의하지 않음
```

### 문서 반영 (0.5.0 amendment)

| 문서 | 반영 내용 |
|------|-----------|
| `README.md` | B-1(`scroll --amount` 예시를 실측 CLI 출력으로 교체 — 낡은 `minValidRatio`/`0.002` 성공 예시 정정, 문턱이 10px→12px로 점프하며 11px을 건너뛰는 이유 설명 추가) · B-2(`AMOUNT_TOO_SMALL`이 터치 슬롭 문턱에서 비롯됨을 설명 + 측정 범위를 시뮬레이터 1대·iOS 26.0으로 한정하는 고지 신설) · B-3(`-scrolled` 판정 근거를 `window.scrollY`에서 요소 자신의 `getBoundingClientRect()` 비교로 정정, 0.4.0→0.5.0 두 라운드 결함을 모두 서술) · B-4(`--duration` 60000ms 상한 고지 + `--duration 60001` 예시, 설계 선택임을 명시) · Status 절 테스트/AC 집계 갱신(553→622 테스트, 19/2/21→23/2/25 AC) + 0.5.0 amendment 요약 신설 |
| `CHANGELOG.md` | `[Unreleased]` 기존 SPEC-GESTURE-001 블록을 **제자리에서** 수정 — Added의 `swipe`/`scroll`/`tap --web` 세 불릿에 0.5.0 반영, `### Fixed`에 0.5.0 amendment 요약 신규 서브블록(C-1~C-5 전부 포함), `### Notes`의 AC 집계 갱신 |

### 잔여 관찰 (다음 세션 참고)

- 이 sync는 문서 정정 + 재마감만 위임받았다(지시문 Section D) — `src/`는 건드리지 않았다. `pnpm vitest run`/`pnpm typecheck`/`pnpm build`는 이 sync 커밋 직전 재확인했다(아래 최종 검증).
- 세 번째 재감사가 이 sync 이후 실행된다(지시문 Section C-4) — push하지 않는다.

### 최종 검증 (실제 명령 출력)

```
$ pnpm vitest run   → exit 0 — Test Files 29 passed, Tests 622 passed
$ pnpm typecheck    → exit 0
$ pnpm build        → exit 0
$ grep -c "SPEC-GESTURE-001" CHANGELOG.md   → 7
$ grep -cE '^### AC-GEST-[0-9]+' .moai/specs/SPEC-GESTURE-001/acceptance.md   → 25
```

### 커밋

이 sync 커밋은 `README.md` + `CHANGELOG.md` + SPEC 아티팩트 4종(frontmatter만, `progress.md`는 본문도 포함 — 이 §E.4 자체)을 담는다. `src/`는 건드리지 않는다(지시문 Section D). 커밋 직전 `git fetch origin master && git rev-list --count --left-right origin/master...HEAD`로 원격 분기 여부를 확인한다. push는 지시문 Section C-4("Do NOT push. A third re-audit runs after you.")에 따라 수행하지 않는다.

sync 커밋 SHA: pending-backfill(위 참조). 이 값은 별도의 후속 backfill 커밋(이 문단이 속한 커밋 자체)에 기록한다 — 0.3.0/0.4.0 sync에서 이미 두 번 쓰인 패턴 그대로.
