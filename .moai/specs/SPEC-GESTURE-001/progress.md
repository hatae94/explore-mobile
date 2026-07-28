---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 진행 기록"
version: "0.8.0"
status: in-progress
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
sync_commit_sha: "3d01d4e"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 세 번 쓰인 패턴 그대로). 이 값을 담은 별도 chore backfill 커밋 참조.
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

### M8 — 문턱의 플랫폼별 파생 + Android 실기기 검증 (0.6.0 amendment)

> **선행**: M1-M7은 0.5.0에서 마감·푸시됐다(HEAD `7be7611`). 이 마일스톤은 **Android 실기기 연결**로 열렸으며 plan.md §B.8이 근거다. 검증 대상 기기: Samsung SM-S938N(Galaxy S25 Ultra), Android 16, 1440×3120, 600dpi, 무선 ADB — 세션 시작 시 `export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"` 실행 확인(`adb devices -l` → `device` 상태 확인).

**산출물 (plan.md §F M8 1-6 전부 완료)**

1. **백엔드 문턱 공급(REQ-GEST-SCROLL-008) — `DeviceBackend`에 10번째 메서드 `getMinEffectiveSwipeThreshold(serial)` 가법 추가.** `src/schema/device-backend.ts`에 `SwipeThresholdBasis`(`"device-query" | "measured-constant"`) + `SwipeThreshold { minEffectiveSwipePx, basis }` 타입 신설. `@MX:ANCHOR` "9-method" → "10-method" 갱신(이 파일 1곳 + `idb-backend.ts` 2곳, 아래 "MX 앵커 확인" 참조).
   - `AdbBackend` — `["-s", serial, "shell", "wm", "density"]` 조회 → `Physical density: N` 파싱(정규식) → `density = N/160` → `minEffectiveSwipePx = floor(8dp × density) + 2px`(`TOUCH_SLOP_DP=8`, `TOUCH_SLOP_MARGIN_PX=2`, 둘 다 named export 아닌 module-level const). `basis: "device-query"`. 600dpi(3.75배) → `floor(30.0)+2 = 32`(spec.md §C.1-⑰의 권장값과 정확히 일치). 파싱 실패·`wm density` 실패 시 각각 throw.
   - `IdbBackend` — 실측 상수 `MEASURED_MIN_EFFECTIVE_SWIPE_PX = 11`(spec.md §C.1-⑭에서 이전(移轉), 재측정 아님)을 **기기 조회 없이** 반환. `_serial` 매개변수는 시그니처 일치용으로만 받고 미사용. `basis: "measured-constant"`.
   - `BackendRegistry` — `swipe`와 동일한 resolve-then-delegate 파사드(`registry.ts`).
2. **기하 계층에서 상수 제거(`scroll-geometry.ts`)** — `MIN_EFFECTIVE_SWIPE_PX` 모듈 상수를 삭제하고 `isDegenerateSwipe(coords, thresholdPx)` / `minNonDegenerateRatio(direction, screen, thresholdPx)`가 문턱을 **인자로** 받도록 변경. 순수 함수 성질 유지(기기 없이 mock 문턱으로 테스트 가능).
3. **`scroll.ts` 배선** — `resolveTargetDevice` → `dumpUiHierarchy`(화면 크기) 뒤에 `backend.getMinEffectiveSwipeThreshold(target.serial)` 호출(실패 시 `BACKEND_COMMAND_FAILED`) → `computeScrollSwipe` → `isDegenerateSwipe(..., threshold.minEffectiveSwipePx)` → `AMOUNT_TOO_SMALL` 응답에 `minValidRatio`와 **`minValidRatioBasis`**를 함께 실음. 거부 순서(방향 → `--amount` → 기기 해석 → dump → 문턱 → 기하 판정 → swipe)는 plan.md §F M8 item 3 그대로 유지.
4. **트립와이어·테스트 더블 갱신** — `device-backend.test.ts:12`의 `Record<keyof DeviceBackend, true>` + `toHaveLength` **9 → 10**. 4개 파일 7개 지점(`router.test.ts` 4곳, `registry.test.ts:31`, `web-support.test.ts:87-101`) 갱신 — **아래 "블로커/서프라이즈" 1번 참조: 실제로는 6개 파일 9개 지점**(plan.md/acceptance.md의 "4개 파일 7개 지점"은 M1 시점 기준이며 M2/M3에서 신설된 `swipe.test.ts`/`scroll.test.ts`의 `createMockBackend`도 갱신이 필요했다).
5. **실기기 검증(AC-GEST-028)** — 연결된 SM-S938N에서 네 방향 전부 왕복 확인(아래 "실기기 검증" 절).
6. **픽스처(테스트)** — mock 밀도 420/480/600/640dpi → 23/26/32/34px(`floor(8dp×density)+2`) 파생 고정(`adb-backend.test.ts`), iOS 경로 밀도 조회 없음 단언(`idb-backend.test.ts`), 순수 함수 계층 문턱 인자화 단언(`scroll-geometry.test.ts` AC-GEST-026 블록), CLI 전 구간 배선·출처 전파 단언(`scroll.test.ts` AC-GEST-026/027 블록).

### AC PASS/FAIL 매트릭스 (M8 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-026 | PASS | `pnpm vitest run src/backend/adb-backend.test.ts src/backend/idb-backend.test.ts src/cli/commands/scroll-geometry.test.ts -t "getMinEffectiveSwipeThreshold\|AC-GEST-026"` | mock 밀도 420/480/600/640dpi → 23/26/32/34px(`floor(8dp×density)+2`) 확인(`adb-backend.test.ts` it.each 4건). 판정은 `거리 > 슬롭`(600dpi 슬롭 30, 문턱 32 — 31px 확률 구간을 건너뜀) — `threshold.minEffectiveSwipePx`가 31이 아니라 32임을 별도 단언. `grep -rn "MIN_EFFECTIVE_SWIPE_PX\|touchSlop\|TOUCH_SLOP" src/ \| grep -v "\.test\.ts"` → iOS 상수(`idb-backend.ts`) + Android **밀도 곱셈 표현**(`TOUCH_SLOP_DP`/`TOUCH_SLOP_MARGIN_PX`, 고정 임계 픽셀 상수 아님)만 매치, Android 하드코딩 문턱 없음 확인. iOS 경로 밀도 조회 없음(`idb-backend.test.ts` "returns the measured constant... without invoking idb at all" — `exec` 0회 호출 단언). `scroll-geometry.test.ts` AC-GEST-026 블록: 같은 화면·거리(12px)에서 iOS 문턱(11)은 비퇴화, Android 문턱(32)은 퇴화(한 상수를 두 플랫폼에 쓰던 결함 재발 시 실패하는 회귀 가드) |
| AC-GEST-027 | PASS | `pnpm vitest run`(exit 0, 622→639) + `pnpm typecheck`(exit 0) + `pnpm build`(exit 0) + `src/backend/registry.test.ts -t "getMinEffectiveSwipeThreshold"` | 639 tests / 29 files 전부 통과(622 기준선 + M8 신규 17건, 감소 없음). 기존 9개 메서드 시그니처 변경 없음(회귀 0). 구현체 3개 전부(`AdbBackend`/`IdbBackend`/`BackendRegistry`) 확인. 테스트 더블 갱신 후 typecheck exit 0(아래 "블로커/서프라이즈" 1번 — 실제 6파일 9지점). 반환값 출처 구분(`"device-query"` vs `"measured-constant"`) 확인. `DeviceBackend`에 밀도 접근자(`density`/`dpi`/`scale`) 없음(인터페이스 정의에 그런 필드 없음 — 코드 자체가 증거) |
| AC-GEST-028 | PASS(실기기, 4방향 전부) | 아래 "실기기 검증(AC-GEST-028)" 절 | SM-S938N에서 네 방향(up/down/left/right) 전부: 극소 비율 → `AMOUNT_TOO_SMALL` + `minValidRatio`(세로 0.011039886623620987, 가로 0.02391975373029709, 둘 다 반올림 거리 32px) → 되먹임 3회 전부 실제 이동 확인(스크린샷 해시 변화, 1초 안정화 지연 후) → 한 단계 아래(거리 30px, 이 화면에서 도달 가능한 32px 바로 아래 정수 격자점)는 전부 거부 |
| AC-GEST-029 | PASS(문서 오라클) | `grep -n "상호작용 요소\|잡음 기준선\|사전 확인" .moai/specs/SPEC-GESTURE-001/spec.md` | spec.md §C.1-⑰(REQ-GEST-SCROLL-007 (f))이 이미 세 가지 측정 전 조건(상호작용 요소 없는 페이지, 무제스처 반복 촬영 잡음 기준선, `dump` 사전 확인)을 기록하고 있다 — 0.6.0 amendment 저작 시점에 완료됐고, M8은 재측정 없이(문턱은 이미 실측·공식화됨) 그 조건을 실기기 검증(AC-GEST-028)에서 실제로 준수했음을 재확인했다(아래 "실기기 검증" 절의 사전 점검 참조) |
| AC-GEST-006 | **PASS**(PARTIAL → PASS 승격) | 아래 "AC-GEST-006 승격 판정" 절 | 승격 조건 (a) `adb` 설치 + (b) 기기 연결 둘 다 충족(spec.md §C.2 정정 그대로) — 이번 세션에서 실기기 스와이프·스크롤을 CLI 종단 경로로 재확인(AC-GEST-028의 왕복 검증 자체가 재확인 증거를 겸한다) |
| AC-GEST-008 | PASS(회귀, grep 기댓값 갱신) | `grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` | `10`(기준선 8 + `swipe` 1 + 문턱 공급 1). `device-backend.test.ts`의 `Record<keyof DeviceBackend, true>` 타입 레벨 검사도 10개로 갱신되어 typecheck 통과. D3(화면 크기 조회 메서드 미추가)는 여전히 유효 — 10번째 메서드는 화면 크기가 아니라 문턱을 반환한다(이름·반환 형태로 확인, acceptance.md 0.6.0 주석 그대로) |

### 실기기 검증 (AC-GEST-028 — Section E 항목 5)

**사전 점검 (측정 전 조건, REQ-GEST-SCROLL-007 (f) / AC-GEST-029)**

```
$ export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
$ adb devices -l
adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp device product:pa3qksx model:SM_S938N device:pa3q transport_id:4956
$ adb -s <serial> shell wm density
Physical density: 600
```

로컬 체커보드 전용 페이지(`<scratchpad>/slop/index.html` — `<a>`/`<button>`/`onclick` **0개**, 20000×3000 CSS px, 실시간 `SY=`/`SX=` 스크롤 위치 오버레이 포함)를 `python3 -m http.server 8935` + `adb reverse tcp:8935 tcp:8935` + `am start -a VIEW -d http://localhost:8935/ com.android.chrome`로 진입. `dump` 사전 확인: 좌표 (720,1560) 아래(스와이프 중심 좌표, `scroll` 계산이 실제로 이 근방을 씀 — 화면 1440×3120 기준 세로 중심 1560, 가로 스크롤도 fixedAxis=height/2=1560)에는 `tappable:true` 요소가 전혀 없음(Chrome 툴바의 tappable 요소 6개는 전부 `y:128~338`에 있고, 우리 시작점과 최소 1200px 이상 떨어짐 — 왕복 검증 자체가 기기 상태를 바꿀 위험 없음 확인).

**잡음 기준선**: 오라클은 상태바+주소창을 완전히 제외한 본문 크롭이다 — `sips -c 2400 1440`(중앙 크롭, 상하 각 360px 제외)로 시계·배터리·주소창 아이콘을 전부 배제(아래 "블로커/서프라이즈" 2번 — `--cropOffset`이 예상대로 동작하지 않아 중앙 대칭 크롭으로 대체). 무제스처 4회 연속 촬영 해시가 전부 동일함을 먼저 확인:

```
$ (4회 반복: adb exec-out screencap -p | sips -c 2400 1440 | shasum -a 256)
a65fb6309b479897ca3114b1ba1eb69fa01ec2e89b2ef2bfb1147cd22c9354fe  (x4, 전부 동일)
```

**왕복 검증(네 방향 전부, `scroll` CLI 명령으로 종단 실행)**:

```
$ node dist/cli/bin.js scroll down --amount 0.0001 --device <serial>
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"...",
  "details":{"requestedRatio":0.0001,"minValidRatio":0.011039886623620987,"minValidRatioBasis":"device-query"}}}
```

| 방향 | minValidRatio | 반올림 거리 | 되먹임 3회 이동 | 한 단계 아래(거리 30px) |
|------|---------------|--------------|-----------------|--------------------------|
| down | 0.011039886623620987 | 32px | 3/3 (해시 전부 변화, 1초 안정화 지연 후) | `AMOUNT_TOO_SMALL` 재확인 |
| up   | 0.011039886623620987 | 32px | 3/3 | `AMOUNT_TOO_SMALL` 재확인 |
| left | 0.02391975373029709  | 32px | 3/3 | `AMOUNT_TOO_SMALL` 재확인 |
| right| 0.02391975373029709  | 32px | 3/3 | `AMOUNT_TOO_SMALL` 재확인 |

되먹임 응답 예(down, trial 1): `{"ok":true,"command":"scroll","data":{"serial":"...","direction":"down","from":{"x":720,"y":1576},"to":{"x":720,"y":1544}}}` — 거리 32px, 왕복마다 반대 방향으로 즉시 복원(드리프트 방지, §C.3 "Android는 관성 스크롤(fling)이 있어 정확히 복귀하지 않는다"를 감안해 매 시행 직후 복원). "한 단계 아래" 값은 이 화면·마진(5%) 조합에서 반올림으로 도달 가능한 격자점이 …28px→30px→32px(31px 자체는 도달 불가 — 짝수 중심 반올림 특성, M7의 홀짝 축 교훈과 같은 계열)이라 30px를 썼다 — 30px는 spec.md §C.1-⑰의 원측정에서도 세로 0/8·가로 0/6이었다.

`getMinEffectiveSwipeThreshold` 반환값 자체(basis 구분, Section E 항목 3): Android 응답은 `"minValidRatioBasis":"device-query"`, 아래 iOS 회귀 확인 응답은 `"minValidRatioBasis":"measured-constant"` — 같은 필드명, 다른 값. 두 값이 서로의 경로로 흐르지 않음(iOS를 건드리지 않고 Android만 실행했는데도 Android 응답에 Android 자신의 출처만 실림).

### AC-GEST-006 승격 판정 (Section E 항목 5)

**PARTIAL → PASS.** 승격 조건 (a) `adb` 설치 + (b) 기기 연결이 spec.md §C.2 정정 그대로 충족돼 있고, 이번 세션에서 원시 `swipe`(argv 구성, M1 기준선)뿐 아니라 **`scroll` 종단 경로**(위 왕복 검증)로 실기기 화면이 실제로 움직이는 것을 재확인했다 — M1 이후 첫 재확인이자 가장 포괄적인 확증(네 방향 × 왕복 3회 = 12회 실측 이동). PARTIAL로 마감할 이유(문서 근거뿐, 기기 미확인)가 더 이상 없다.

### iOS 회귀 확인 (Section E 항목 4)

```
$ node dist/cli/bin.js scroll down --amount 0.0001 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"...",
  "details":{"requestedRatio":0.0001,"minValidRatio":0.013984236866235733,"minValidRatioBasis":"measured-constant"}}}
```

`minValidRatio=0.013984236866235733`는 M7(0.5.0)의 AC-GEST-024 왕복 검증이 기록한 값과 **정확히 동일** — M8의 백엔드 재구조화(문턱을 모듈 상수에서 백엔드 공급으로 전환)가 iOS 쪽 수치에 어떤 영향도 주지 않았다는 직접 증거다. `basis:"measured-constant"`(밀도 조회 없음) 확인. 이어서 `scroll down`(기본 비율) → `scroll up`으로 실제 화면 이동 + 복원도 재확인(Wikipedia "Netscape" 문서, 스크린샷 해시 전/후 다름 → up 이후 원상태 무관하게 위up 자체 성공 확인 — 정식 판정은 이미 M2~M7에서 여러 번 확증된 사실의 회귀 없음 재확인일 뿐, 신규 AC 판정 대상 아님).

### 테스트 스위트

```
$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  639 passed (639)
```

기준선(0.5.0 sync, M7 종료) 622 → 639(+17): `adb-backend.test.ts` `getMinEffectiveSwipeThreshold` 신규 8건(밀도 4종 파생 it.each 4 + 32px 경계 확인 1 + 하드코딩 상수 부재 확인 1 + 파싱 실패 1 + wm density 실패 1), `idb-backend.test.ts` 신규 2건(측정 상수 무조회 확인 + serial 무관 동일값 확인), `registry.test.ts` 신규 1건(resolve-then-delegate), `scroll-geometry.test.ts` AC-GEST-026 블록 신규 3건(기존 "MIN_EFFECTIVE_SWIPE_PX는 실측값 11이다" 1건은 상수 이전으로 제거, 순증 +2 아님 — 그 자리에 3건이 새로 들어와 net +2, 나머지 파일들의 회귀 유지 목적 재작성분은 기존 개수 유지), `scroll.test.ts` AC-GEST-026/027 블록 신규 4건(배선 순서 확인 + basis 전파 확인 + 왕복 배선 가드 + BACKEND_COMMAND_FAILED). 신규 파일 없음(기존 6개 파일만 확장) — `total_run_phase_files`는 M7까지의 20에서 불변.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/backend/adb-backend.test.ts
 M src/backend/adb-backend.ts
 M src/backend/idb-backend.test.ts
 M src/backend/idb-backend.ts
 M src/backend/registry.test.ts
 M src/backend/registry.ts
 M src/cli/commands/scroll-geometry.test.ts
 M src/cli/commands/scroll-geometry.ts
 M src/cli/commands/scroll.test.ts
 M src/cli/commands/scroll.ts
 M src/cli/commands/swipe.test.ts
 M src/cli/commands/web-support.test.ts
 M src/cli/router.test.ts
 M src/cli/validators.ts
 M src/schema/device-backend.test.ts
 M src/schema/device-backend.ts
```

plan.md §A.6 M8 행: `device-backend.ts`/`adb-backend.ts`/`idb-backend.ts`/`registry.ts`/`scroll-geometry.ts`/`scroll.ts` + 그 테스트 파일 + 4개 테스트 더블 파일(`device-backend.test.ts`/`router.test.ts`/`registry.test.ts`/`web-support.test.ts`) — 전부 위 목록에 포함. `swipe.test.ts`는 plan.md §A.6에 M8 행이 없으나, M1의 `createMockBackend`가 이 파일에도 있고 10번째 메서드 없이는 typecheck가 깨져(아래 "블로커/서프라이즈" 1번) 스스로 판단해 추가했다 — `swipe.ts` 프로덕션 코드는 미변경. `validators.ts`도 plan.md §A.6 M8 행에 없으나, M7이 이 파일에 남긴 "`MIN_EFFECTIVE_SWIPE_PX`(`scroll-geometry.ts`)" 상호참조 주석이 그 상수를 삭제한 M8 이후 거짓 앵커가 되므로 정정했다(코드 0줄, 주석 1곳만 변경 — 아래 "블로커/서프라이즈" 1번 참조). `src/normalize/*`, `src/webview/*`(PRESERVE 목록) 미변경 확인. SPEC 본문 3종(spec.md/plan.md/acceptance.md) 미변경, frontmatter도 미변경(`status: in-progress` 그대로).

### MX 태그 확인

```
$ grep -n "9-method\|9 methods" src/schema/device-backend.ts src/backend/idb-backend.ts
(no matches — 전부 "10-method"/"10 methods"로 갱신됨)
```

`device-backend.ts` `@MX:ANCHOR`(1개, 파일당 한도 3 이내) "9-method" → "10-method" 갱신. `idb-backend.ts` 파일 docstring + `@MX:REASON` 2곳 동일 갱신. 새 상수(`TOUCH_SLOP_DP`/`TOUCH_SLOP_MARGIN_PX` in `adb-backend.ts`, `MEASURED_MIN_EFFECTIVE_SWIPE_PX` in `idb-backend.ts`)에 각각 `@MX:NOTE`(측정값·설계 선택 출처) 추가 — 파일당 ANCHOR/WARN/NOTE 누적 한도(3/5/10) 이내 확인(`adb-backend.ts`: ANCHOR 1·WARN 1·NOTE 2, `idb-backend.ts`: ANCHOR 1·WARN 3·NOTE 4, `registry.ts`: ANCHOR 1·NOTE 1, `scroll-geometry.ts`: ANCHOR 2, `device-backend.ts`: ANCHOR 1, `scroll.ts`: NOTE 1). 새 `getMinEffectiveSwipeThreshold` 인터페이스 메서드 자체는 M1의 `swipe`와 동일하게 클래스 레벨 `@MX:ANCHOR`가 이미 계약을 포괄하므로 별도 메서드 전용 ANCHOR를 추가하지 않았다(기존 관례 그대로).

## 블로커 / 서프라이즈 (M8 종료 시점 — 0.6.0 amendment 최종)

1. **[가장 중요] plan.md/acceptance.md의 "4개 파일 7개 지점"은 M1 시점 기준이며 실제로는 6개 파일 9개 지점이 필요했다.** M1이 `swipe`를 9번째 메서드로 추가할 때 전수 조사한 "4개 파일 7개 지점"(`device-backend.test.ts`/`router.test.ts`/`registry.test.ts`/`web-support.test.ts`)은 그 시점에 `DeviceBackend`를 리터럴로 구현하는 mock이 존재하는 파일 전부였다. 그러나 M2(`swipe.test.ts`)와 M3(`scroll.test.ts`)이 각각 자기 파일에 독립적인 `createMockBackend(): DeviceBackend` 리터럴을 만들었고, M8 시점에는 이 두 파일도 10번째 메서드 없이는 `pnpm typecheck`가 깨진다(`error TS2741: Property 'getMinEffectiveSwipeThreshold' is missing...`, 실제 컴파일러 출력으로 확인). plan.md §A.6/acceptance.md AC-GEST-027이 나열한 목록을 그대로 따랐다면 typecheck가 실패했을 것이다 — `pnpm typecheck` 실행으로 이 사실을 스스로 발견하고 6개 파일 9개 지점 전부를 갱신했다. **acceptance.md의 AC-GEST-027 문구("4개 파일 7개 지점")는 이제 정확하지 않다** — 다음 세션(또는 sync)이 acceptance.md 문구 정정 여부를 판단할 것을 권한다(본 세션은 body 콘텐츠 수정 권한이 없다).
2. **`sips --cropOffset`이 이 세션에서 기대대로 동작하지 않았다 — 대체 방법으로 우회했다.** spec.md §C.1-⑭이 iOS 측정에 쓴 것과 동일한 패턴(`sips --cropOffset <Y> 0 -c <H> <W>`)을 Android 스크린샷(1440×3120)에 적용했더니, 첫 인자가 0이 아닐 때(`--cropOffset 250 0`) **크롭이 전혀 적용되지 않고 원본 크기 그대로 반환**됐다(`pixelHeight` 그대로 3120). 인자 순서를 바꾼 조합(`--cropOffset 0 250`)은 크롭 크기는 적용됐지만 축이 뒤바뀐 듯 보이는 결과를 냈다. 대신 **오프셋 없는 중앙 대칭 크롭**(`sips -c <reducedH> <W>`, 상하 대칭으로 줄어든 만큼 제외)으로 상태바·주소창을 안전하게 배제했다 — 이 방법은 (a) 상태바(시계·배터리)가 완전히 제거되고 (b) 남는 주소창 조각은 시행마다 내용이 바뀌지 않는 정적 텍스트라 잡음원이 되지 않음을 무제스처 4회 반복 촬영으로 직접 확인했다. **이 발견이 M7의 iOS 측정(§C.1-⑭)에도 영향을 줬는지는 확인하지 못했다** — 같은 `--cropOffset` 패턴을 썼지만 iOS 스크린샷 크기·`sips` 버전·좌표계가 다를 수 있어, 여기서 관측한 버그가 그쪽에도 적용됐다고 단정하지 않는다(관측하지 않은 것을 근거로 쓰지 않는다는 원칙, verification-claim-integrity.md). M7의 측정 자체는 이미 깨끗한 단일 정수(11pt)로 수렴했고 재감사 대상이 아니었으므로, 이 관측은 **다음 세션이 재확인하고 싶을 때를 위한 기록**으로만 남긴다. 프로젝트 메모리에 별도 기록(`android-gesture-facts.md`에 이미 있던 프로젝트 사실과 구분되는 새 도구 사실 — 후속 세션이 memory로 저장할 후보).
3. **최초 스크린샷 캡처가 명령 반환 직후 이뤄지면 실제 이동이 관측되지 않을 수 있다 — 안정화 지연 필요.** 지연 없이 `scroll` 명령 직후 곧바로 스크린샷을 찍은 1차 시행(down 방향)에서 `ok:true`였음에도 전/후 해시가 동일했다. 동일한 좌표·비율로 1초 지연 후 재시행하자 명확한 변화가 확인됐다 — Android 컴포지터/스크롤 애니메이션이 명령 반환 시점에 아직 화면에 반영되지 않았을 가능성이 높다(idb/시뮬레이터에서는 이런 지연이 필요하지 않았다 — SPEC의 기존 실측 어디에도 이 문제가 기록돼 있지 않다). 왕복 검증 전체에 1초 안정화 지연을 일괄 적용해 재현성을 확보했다. **이것은 REQ-GEST-SCROLL-007 (f)의 세 조건(상호작용 요소 없음/잡음 기준선/dump 사전확인)과는 다른 차원의 방법론 세부사항**이며, 이 SPEC의 §C.1/§C.3에 아직 기록되지 않았다 — 다음 세션(또는 재감사)이 Android 측정 방법론에 "명령 반환과 화면 반영 사이에 지연이 있을 수 있다"는 사실을 추가할지 판단할 것을 권한다(본 세션은 body 콘텐츠 수정 권한이 없다).
4. **범위 이탈 없음.** `src/normalize/*`, `src/webview/*`(PRESERVE) 미변경. README.md/CHANGELOG.md 미변경(docs 위임). SPEC 본문 3종(spec.md/plan.md/acceptance.md) 미변경, frontmatter도 미변경(`status: in-progress` 그대로) — 재마감(`in-progress → implemented → completed`)은 manager-docs 소관. `.claude/`, `.moai/config` 등 이 SPEC과 무관한 미추적 파일 미포함(scope check 명령으로 확인).
5. **환경 정리 완료.** `adb reverse --remove tcp:8935` 실행 후 `adb reverse --list` 빈 출력 확인. 로컬 `python3 -m http.server 8935` 종료 확인(`ps aux | grep http.server` 무출력). `xcrun simctl list devices booted` → iPhone 17 Pro(D0B3A18C-...) 하나만 남음. Android 기기 자체(Chrome에 체커보드 페이지가 남아있는 상태)는 실기기이므로 "정리" 대상이 아니다 — 세션 종료 시 앱을 강제 종료하지 않았다(지시문이 명시적으로 요구하지 않음).
6. **sync-auditor 재확인 우선순위(다음 세션에게)**: (a) acceptance.md AC-GEST-027의 "4개 파일 7개 지점" 문구 정정 여부(위 1번), (b) `sips --cropOffset` 이슈가 M7 iOS 측정에도 영향을 줬는지 재확인 필요성(위 2번, 낮은 우선순위 — M7은 이미 깨끗이 수렴했다), (c) Android 스크롤 안정화 지연을 spec.md 방법론에 기록할지(위 3번), (d) README/CHANGELOG의 10번째 메서드·플랫폼별 문턱 고지 의무(별도 docs 위임 — 이 M8에서 다루지 않음) 순으로 확인할 것을 권한다.

## §E.3 Run-phase Audit-Ready Signal (M8 최종 — 0.6.0 amendment)

```yaml
run_status: M8-complete
run_complete_at: "2026-07-28"
run_commit_sha: "519f8d8"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 여러 번 쓰인 패턴 그대로). 이 값을 담은 별도 backfill 커밋 참조.
ac_pass_count: 6      # M8 자체 판정: AC-GEST-026, 027, 028, 029, 006(승격), 008(회귀)
ac_fail_count: 0
ac_partial_count: 0
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/{inspector-client,proxy-service,calibration}.ts 미변경
l44_pre_commit_fetch: "git fetch origin master && git rev-list --count --left-right origin/master...HEAD -> '0 1' (origin 뒤처짐 없음, HEAD가 1커밋 앞섬 -- 이 SPEC의 미푸시 0.6.0 amendment 커밋 자신)"
l44_post_push_fetch: not_applicable   # 이 SPEC은 push하지 않는다(지시문 Section F "Do not push")
new_warnings_or_lints_introduced: false
cross_platform_build: { windows: not_applicable, note: "TypeScript/Node 프로젝트, GOOS 교차빌드 대상 아님" }
total_run_phase_files: 20   # M8은 기존 6개 파일(4개 계획분 + swipe.test.ts + validators.ts 주석)만 확장 -- 신규 파일 없음, M7까지의 20에서 불변
m1_to_mN_commit_strategy: "M8은 단일 커밋(fix)으로 마감 -- 백엔드 문턱 공급(산출물 1)이 기하 계층 상수 제거(산출물 2)·scroll.ts 배선(산출물 3)의 선행 조건이라 분리가 인위적이다(M6/M7과 동일 판단)"
```

## §E.4 Sync-phase Audit-Ready Signal (0.6.0 amendment)

> 0.5.0 마감 시점의 §E.4(위, "sync_commit_sha: 3d01d4e")는 그대로 보존한다 — 이 절은 M8(0.6.0 amendment) 코드 수정 이후의 README/CHANGELOG 정정 + 재마감 sync를 담는 **별도의 새 sync 레코드**다.

```yaml
sync_status: audit-ready
sync_complete_at: "2026-07-28"
sync_commit_sha: "ad06692"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 여러 번 쓰인 패턴 그대로). 이 값을 담은 별도 chore backfill 커밋 참조.
b12_self_test_a: "grep -c 'SPEC-GESTURE-001' CHANGELOG.md (편집 전, HEAD 519f8d8/3bf8874 시점) -> 7 -- 기존 [Unreleased] 블록(Added/Fixed/Notes)을 제자리에서 수정 + Fixed에 0.6.0 서브블록 1개 신규 추가(편집 후 11). 새 최상위 [Unreleased] 항목을 추가한 것이 아니라 기존 블록 내부를 갱신했으므로 중복 방출 아님"
b12_self_test_b: "grep -cE '^### AC-GEST-[0-9]+' acceptance.md -> 29 -- CHANGELOG Notes/README Status의 '29 acceptance criteria' 표기와 일치"
b12_self_test_c: "CHANGELOG/README가 인용한 모든 파일 경로를 커밋 전 Read/ls로 실재 확인: src/schema/device-backend.ts, src/backend/{adb-backend,idb-backend,registry}.ts, src/cli/commands/{swipe,scroll,scroll-geometry,web-support}.ts, src/cli/{args,validators,router}.ts, src/webview/coordinates.ts, vendor/adbkeyboard/README.md. 인용한 모든 수치는 빌드된 dist/cli/bin.js를 연결된 Android 실기기(adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp)와 부팅된 iPhone 17 Pro 시뮬레이터(D0B3A18C-E485-4E7C-A25E-504BF4CA6163) 양쪽에 대해 직접 재실행해 확인(scroll down --amount 0.001, minValidRatio/minValidRatioBasis 두 플랫폼 모두 재확인) + node -e로 computeScrollSwipe를 직접 호출해 Android 32px·iOS 12px 반올림 거리를 재계산 확인"
changelog_entry_position: "[Unreleased] -> Added(scroll 불릿의 문턱 서술을 플랫폼별 파생 + minValidRatioBasis로 재작성, 'argv-verified only' 불릿을 Android 실기기 검증 완료 서술로 교체) + Fixed(0.6.0 amendment 신규 서브블록 1개, G1-G4 전부 포함) + Notes(AC 집계 23/2/25 -> 28/1/29 갱신, adb-미설치 정정을 SPEC-ANDROID-001 절 각주로 추가)"
frontmatter_status_transitions:
  spec_md: "in-progress -> completed"
  plan_md: "in-progress -> completed"
  acceptance_md: "in-progress -> completed"
  progress_md: "in-progress -> completed"
  updated_date: "2026-07-28 -> 2026-07-28 (당일 amendment 재마감, 4개 아티팩트 전부 -- M8이 이미 같은 날짜로 갱신해둔 상태)"
canary_compliance_check: not_applicable   # 본 SPEC은 자기 자신의 sync를 테스트하는 전향적 정책을 정의하지 않음
```

### 문서 반영 (0.6.0 amendment)

| 문서 | 반영 내용 |
|------|-----------|
| `README.md` | 상단 Status 블록(622→639 테스트, "Android argv-verified only" 문구 → 실기기 검증 완료 서술로 교체) · `swipe` 절(Android 실기기 확인 + 탭-무동작 아님 경고 신설, B-3) · `scroll` 절(문턱 단일 상수 서술 전면 재작성 — 백엔드 조회 방식 + `minValidRatioBasis` 필드 + 두 플랫폼 예시 응답, B-2) · Status 절(Android 실기기 검증 문단 3개 신설 — 기기 정보·문턱 결함·탭 정정, AC-GEST-006 승격, 최종 집계 28/1/29 갱신) · "Still pending" 목록에서 swipe/scroll 제외하고 나머지 Android 명령으로 좁힘 · Roadmap 표 SPEC-GESTURE-001 행 갱신 |
| `CHANGELOG.md` | `[Unreleased]` 기존 SPEC-GESTURE-001 블록을 **제자리에서** 수정 — Added의 `scroll` 불릿에 플랫폼별 파생 + `minValidRatioBasis` 반영, 'argv-verified only' 불릿을 실기기 검증 완료 서술로 교체, `### Fixed`에 0.6.0 amendment 요약 신규 서브블록(G1-G4: 출하된 상수 결함·10번째 메서드+출처 필드·AC-GEST-006 승격·탭-정정·adb PATH 정정), `### Notes`의 AC 집계 갱신 + SPEC-ANDROID-001 절의 "Android 미검증" 각주에 갱신 상태 추가 |

### 잔여 관찰 (다음 세션 참고)

- 이 sync는 문서 정정 + 재마감만 담당한다(지시문 Section D) — `src/`는 건드리지 않았다. `pnpm vitest run`/`pnpm typecheck`/`pnpm build`는 이 sync 커밋 직전 재확인했다(아래 최종 검증).
- M8 블로커 1번(acceptance.md AC-GEST-027의 "4개 파일 7개 지점" 문구가 실제로는 "6개 파일 9개 지점")과 3번(Android 스크롤 안정화 1초 지연 미기록)은 이 sync 범위 밖이다 — body 콘텐츠 정정은 manager-spec 소관이며, 이 sync는 frontmatter 전이 + README/CHANGELOG만 위임받았다. 다음 세션의 재확인 우선순위로 그대로 남긴다.
- push는 지시문 Section C-4("Do NOT push. I hold that decision.")에 따라 수행하지 않는다.

### 최종 검증 (실제 명령 출력)

```
$ pnpm vitest run   → exit 0 — Test Files 29 passed, Tests 639 passed
$ pnpm typecheck    → exit 0
$ pnpm build        → exit 0
$ grep -c "SPEC-GESTURE-001" CHANGELOG.md   → 11
$ grep -cE '^### AC-GEST-[0-9]+' .moai/specs/SPEC-GESTURE-001/acceptance.md   → 29
$ grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts   → 10
```

### 커밋

이 sync 커밋은 `README.md` + `CHANGELOG.md` + SPEC 아티팩트 4종(frontmatter만, `progress.md`는 본문도 포함 — 이 §E.4 자체)을 담는다. `src/`는 건드리지 않는다(지시문 Section D). 커밋 직전 `git fetch origin master && git rev-list --count --left-right origin/master...HEAD`로 원격 분기 여부를 확인한다. push는 지시문 Section C-4("Do NOT push. I hold that decision.")에 따라 수행하지 않는다.

sync 커밋 SHA: `ad06692`(`docs(SPEC-GESTURE-001): correct 0.6.0 amendment docs + 3-phase close`). 이 값은 별도의 후속 backfill 커밋(이 문단이 속한 커밋 자체)에 기록한다 — 0.3.0/0.4.0/0.5.0 sync에서 이미 세 번 쓰인 패턴 그대로.

### M9 — 유효 밀도 + 비동기 스크롤 표본 시점 (0.7.0 amendment)

> **선행**: M1-M8은 0.6.0에서 마감·푸시됐다(HEAD `467e7df`). 이 마일스톤은 **새 기기도 새 감사도 아니고, M8이 spec.md §C.3에 "미측정"으로 남긴 Physical/Override 구분을 사용자 승인 하에 실측한 것**으로 열렸다(spec.md §C.1-⑳, plan.md §F M9 서문). 밀도는 이미 복원돼 있었다(`Physical density: 600`, Override 행 없음) — 이 마일스톤은 밀도를 다시 바꾸지 않고 픽스처로만 검증한다(AC-GEST-030).

**산출물 (plan.md §F M9 1-5 전부 완료, RED-GREEN 사이클로 진행)**

1. **유효 밀도 파서(`adb-backend.ts`) — `parsePhysicalDensity` → `parseEffectiveDensity`.** `Override density:` 행이 있으면 그 값, 없으면 `Physical density:` 값을 읽는다(정규식 우선순위: `Override density:\s*(\d+)` 매치 실패 시 `Physical density:\s*(\d+)`로 폴백). 문턱 산식(`floor(8dp × density) + 2px`)과 파싱 실패 시 명시적 throw는 불변 — 바뀌는 것은 곱해지는 밀도가 어느 줄에서 오는지뿐이다. `basis` 값도 `"device-query"` 그대로(읽는 줄이 바뀐 것이지 출처의 종류가 바뀐 게 아니다). 함수명·doc-comment("reads only the Physical line", §C.3을 "열린 질문"이라 적은 문구 포함)를 함께 갱신 — M1의 "8-method", M8의 "9-method"와 같은 거짓 앵커 재발을 막는다. `max(physical, override)`는 채택하지 않는다(축소 방향 과다 거부, 아래 RED/GREEN 절 참조).
2. **오라클 표본 시점(`web-support.ts`) — `buildScrollIntoViewExpression`이 `el.scrollIntoView({block:"center"})` → `el.scrollIntoView({block:"center", behavior:"instant"})`로 변경.** 페이지 CSS `scroll-behavior: smooth`를 무시하고 동기 스크롤을 강제해, 직후 재측정하는 사각형이 항상 스크롤 완료 이후 값이 되게 한다. REQ 변경 없음(규범 문장은 이미 충분했다 — spec.md REQ-GEST-WEB-001/002 0.7.0 주석). 애니메이션 완료 대기(폴링/타임아웃)는 기각 — 완료 신호 표준이 없어 `--duration` 상한이 막은 무한 대기 계열을 웹 경로에 새로 여는 일이다.
3. **픽스처(테스트).** `adb-backend.test.ts`: `wm density` 출력 4형태(override 없음 / 축소 / 확대 / 파싱 불가) → 32/26/32/error 고정, `max(physical,override)`가 실패하는 지점(fixture B)을 명시적으로 단언. `web-support.test.ts`: `node:vm` 샌드박스 stub이 "동기 스크롤을 요구하는 호출만 사각형을 호출 시점에 바꾸고, 그렇지 않으면 커밋을 미룬다"는 플랫폼 계약을 흉내낸다 — 어떤 인자 형태를 넘겼는지는 단언하지 않는다(AC-GEST-031).
4. **문서 의무 기록 — 코드 변경 아님, 이 마일스톤에서 다루지 않는다.** NN8(README 가로 32px 5/6 반대 증거 누락)·NN4(거리 증가 폭 홀짝 서술 오류)는 README 소관이다. AC-GEST-032는 **이 마일스톤 종료 시점에 미충족**으로 남긴다(아래 AC 매트릭스 참조) — 집행은 후속 docs 패스.
5. **회귀** — 아래 "테스트 스위트"/"iOS 회귀 확인"/"Android 회귀 확인" 절 참조.

### AC PASS/FAIL 매트릭스 (M9 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-030 | PASS | `pnpm vitest run src/backend/adb-backend.test.ts -t "AC-GEST-030"` | 4 tests PASS. Fixture A(override 없음, Physical 600) → 32px. Fixture B(축소, Physical 600/Override 480) → **26px**(`max(physical,override)`였다면 32px을 냈을 자리 — 별도 단언 `not.toBe(32)`로 그 구현의 실패를 명시). Fixture C(확대, Physical 480/Override 600) → **32px**(Physical-only였다면 26px을 냈을 자리 — 별도 단언 `not.toBe(26)`, 이것이 이번에 고친 출하된 결함). Fixture D(파싱 불가) → throw. RED 확인: `git stash push -- src/backend/adb-backend.ts` 후 재실행 시 fixture B/C 2건 실패(각각 기대 26 vs 실제 32, 기대 32 vs 실제 26 — 정확히 예측한 방향으로 실패) 확인 후 stash pop으로 복원 |
| AC-GEST-031 | PASS | `pnpm vitest run src/cli/commands/web-support.test.ts -t "post-completion sampling"` | RED 확인(수정 전 코드로 실행): `AssertionError: expected {found:true, moved:false} ... { found: true, moved: true }` — vm 스텁이 재현한 "동기 스크롤이 아니면 커밋을 미룬다" 계약 하에서 구 코드가 무동작으로 오판. 수정 후: PASS — `behavior:"instant"` 요청 시 스텁이 즉시 커밋해 `moved:true` 정확히 판정. 스텁은 인자 형태를 단언하지 않는다(계약 만족 여부만 판정) |
| AC-GEST-032 | **미충족** (문서 소관 — 이 마일스톤에서 다루지 않는다) | — | NN8·NN4는 README 정정이 필요하며 이는 후속 docs 패스의 책임이다. 관측하지 않은 것을 PASS로 쓰지 않는다는 이 SPEC의 원칙에 따라, 이 시점의 AC-GEST-032 상태를 정직하게 미충족으로 기록한다 |

### RED-GREEN 사이클 증거 (D1 — `parseEffectiveDensity`)

```
$ git stash push -- src/backend/adb-backend.ts   # 수정 전 원본으로 되돌림
$ pnpm vitest run src/backend/adb-backend.test.ts -t "AC-GEST-030"
 FAIL  ... fixture B ...: expected 32 to deeply equal 26   (Physical만 읽어 3.75배 → 32, Override 480을 무시)
 FAIL  ... fixture C ...: expected 26 to deeply equal 32   (Physical만 읽어 3.0배 → 26, Override 600을 무시 — 이것이 출하된 결함)
 Test Files  1 failed | Tests  2 failed | 2 passed | 50 skipped (54)
$ git stash pop   # 수정 복원
$ pnpm vitest run src/backend/adb-backend.test.ts -t "getMinEffectiveSwipeThreshold"
 Test Files  1 passed (1)
      Tests  12 passed | 42 skipped (54)
```

### RED-GREEN 사이클 증거 (D2 — `buildScrollIntoViewExpression`)

```
$ pnpm vitest run src/cli/commands/web-support.test.ts -t "post-completion sampling"   # 수정 전
AssertionError: expected { found: true, moved: false } to deeply equal { found: true, moved: true }
 Tests  1 failed | 41 skipped (42)
# behavior:"instant" 적용 후
$ pnpm vitest run src/cli/commands/web-support.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  42 passed (42)
```

### Android 실기기 회귀 확인 (D-5, Section E 항목 2)

밀도는 이 마일스톤 내내 변경하지 않았다 — `wm density`는 처음부터 끝까지 `Physical density: 600` 단일 행(Override 행 없음)이었다. 파생 규칙이 M9에서 바뀌었어도 이 기기에는 Override 행이 없으므로 fixture A와 동일 경로를 타 결과가 불변이어야 한다:

```
$ export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
$ adb -s adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp shell wm density
Physical density: 600
$ node -e 'import("./dist/backend/adb-backend.js").then(async m => {
    const b = new m.AdbBackend();
    console.log(JSON.stringify(await b.getMinEffectiveSwipeThreshold(process.argv[1])));
  })' adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp
{"minEffectiveSwipePx":32,"basis":"device-query"}
```

**32px, `"device-query"`** — M8 시점과 바이트 동일. 거부 경로(무동작, 안전) 재확인:

```
$ node dist/cli/bin.js scroll down --amount 0.0001 --device adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"scroll --amount is too small to move the screen at this size; no gesture was sent.","details":{"requestedRatio":0.0001,"minValidRatio":0.011039886623620987,"minValidRatioBasis":"device-query"}}}
```

거부이므로 기기에 어떤 제스처도 전송되지 않았다(exit 1, `ok:false`). 디스플레이 밀도는 이 마일스톤에서 한 번도 바꾸지 않았다(D-3 준수).

### iOS 회귀 확인 (D-5, Section E 항목 3)

`src/backend/idb-backend.ts`는 이 마일스톤에서 **한 줄도 수정하지 않았다**(`git diff --name-only HEAD`로 확인, 아래 Scope Check 참조) — `getMinEffectiveSwipeThreshold(_serial)`는 여전히 기기를 조회하지 않고 실측 상수(`MEASURED_MIN_EFFECTIVE_SWIPE_PX = 11`)를 그대로 반환한다. `minValidRatio`가 402x874에서 바이트 동일한지 직접 재계산으로 확인:

```
$ node -e 'import("./dist/cli/commands/scroll-geometry.js").then(m => {
    console.log(JSON.stringify(m.minNonDegenerateRatio("down", {width:402,height:874}, 11)));
  })'
0.013984236866235733
```

M8/0.6.0 시점 기록값과 정확히 일치(12px 반올림 거리). iOS 경로는 이번 변경(Android 파싱 + 웹 오라클)의 영향을 받지 않는다.

### 스크린-밖 스크롤 오라클 라이브 재현 (D-4/F-4, Section E 항목 4)

부팅된 iPhone 17 Pro 시뮬레이터(D0B3A18C-E485-4E7C-A25E-504BF4CA6163)에서, `scroll-behavior: smooth`가 걸린 `overflow:auto` 컨테이너를 가진 실제 페이지에 대해 두 갈래로 확증했다.

**잡음 기준선**: 정적 픽스처 페이지(요소 좌표는 코드로 계산되는 `getBoundingClientRect()` 값이라 스크린샷 노이즈의 영향을 받지 않는다 — 이 재현은 스크린샷 비교가 아니라 DOM 사각형 비교이므로 별도 잡음 기준선 확인이 불필요하다).

**갈래 1 — 격리된 fixed-position 컨테이너(윈도우 스크롤 혼입 없음, 감사 자신의 재현 스크립트 `smooth.js`와 동일 구조).** `#smoothFixed` 컨테이너(`position:fixed`, 뷰포트 안에 완전히 위치, `scroll-behavior:smooth`) 안의 `#auditS` 링크에 대해, 수정 전 표현식(`{block:"center"}`)과 수정 후 표현식(`{block:"center", behavior:"instant"}`)을 같은 페이지·같은 컨테이너 형태로 각각 평가:

```
=== PRE-FIX (shipped, 0.6.0) oracle ===
{"containerScrollTop":"0 -> 0 (immediately after scrollIntoView)","windowScrollY":"3865 -> 3865",
 "rectTop":"1202 -> 1202","shippedOracle":{"found":true,"moved":false}}
=== FIXED (M9, behavior:'instant') oracle ===
{"containerScrollTop":"0 -> 958 (immediately after scrollIntoView)",
 "rectTop":"1342 -> 384","fixedOracle":{"found":true,"moved":true}}
```

수정 전 수치(`containerScrollTop 0 -> 0`, `rectTop 1202 -> 1202`, `{found:true,moved:false}`)는 spec.md §C.1-㉑이 기록한 sync-auditor 재현 수치와 **정확히 일치**한다 — 같은 결함을 독립적으로 재현했다. 수정 후에는 `behavior:"instant"`가 호출 시점에 컨테이너 스크롤을 강제 커밋시켜 `moved:true`를 즉시 정확하게 판정한다.

**갈래 2 — 프로덕션 픽스처(`site/audit.html`의 `#smoothwrap`/`#auditC`, `tap --web`과 동일 코드 경로)에서 실제 프로덕션 `buildScrollIntoViewExpression`(수정 후) 실행:**

```
BEFORE: {"rectTop":5323,"containerScrollTop":0}
FIXED OUTCOME (found/moved decided at call time): {"found":true,"moved":true}
AFTER (re-measured separately): {"rectTop":340,"containerScrollTop":1118}
```

이 갈래는 창(window) 레벨 스크롤도 함께 필요한 실제 페이지 배치라 `containerScrollTop`이 컨테이너 내부 스크롤만을 분리해서 보여주지만(0 -> 1118), 갈래 1이 창 스크롤 혼입 없이 컨테이너 단독의 비동기 커밋 문제를 순수하게 격리해 재현한다. 두 갈래 모두 실행 도구는 `WebRunDeps`가 사용하는 것과 동일한 `openWebProxy`/`connectWebInspector`(스크래치패드의 임시 스크립트로 직접 호출, 소스 파일은 건드리지 않음)이며, 프로덕션에서 export된 `buildScrollIntoViewExpression` 함수 자체를 그대로 가져와 실행했다(갈래 2). 이는 `web-support.test.ts`의 `node:vm` 스텁 단위 테스트(AC-GEST-031)로는 검증할 수 없는 것 — 실제 WebKit이 `scroll-behavior: smooth`를 정말로 비동기로 처리하고 `behavior:"instant"`가 정말로 그것을 우회하는지 — 를 확증한다.

### 테스트 스위트

```
$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  644 passed (644)
```

기준선 639 → 644(+5): `adb-backend.test.ts` 신규 4건(AC-GEST-030 fixture A/B/C/D), `web-support.test.ts` 신규 1건(AC-GEST-031 post-completion sampling). 신규 파일 없음(기존 2개 파일만 확장) — `total_run_phase_files`는 M8까지의 20에서 불변.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/backend/adb-backend.test.ts
 M src/backend/adb-backend.ts
 M src/cli/commands/web-support.test.ts
 M src/cli/commands/web-support.ts
```

plan.md §A.6 M9 행: `src/backend/adb-backend.ts`(+`.test.ts`), `src/cli/commands/web-support.ts`(+`.test.ts`) — 전부 위 목록에 포함, 그 외 파일 없음. `src/backend/idb-backend.ts`(iOS 경로, PRESERVE 아니지만 M9 대상 아님)는 미변경 확인. `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE 목록) 미변경. SPEC 본문 3종(spec.md/plan.md/acceptance.md) 미변경, frontmatter도 미변경(`status: in-progress` 그대로 — 이 SPEC은 이미 M1에서 `draft → in-progress` 전이를 마쳤고 M9는 그 상태를 유지만 한다). README.md/CHANGELOG.md 미변경(지시문 Section E — docs 패스가 후속으로 처리).

### MX 태그 확인

이번 두 산출물(유효 밀도 파서, 오라클 표본 시점)은 모두 기존 함수의 **동작을 바꾸는 리팩터**이지 새 exported 함수나 fan_in >= 3인 신규 진입점이 아니다 — `@MX:ANCHOR`/`@MX:WARN` 신설 기준(REQ-GEST-SCROLL-008 문턱 공급 자체는 M8에서 이미 앵커됨)에 해당하지 않는다. `parseEffectiveDensity`(private 함수, 유일한 호출자는 `getMinEffectiveSwipeThreshold`)와 `buildScrollIntoViewExpression`(exported, 이미 `activateElement` 안에서 사용 중이던 함수— fan_in 불변)에 새 태그를 추가하지 않았다. 기존 파일당 누적 한도(ANCHOR 3/WARN 5/NOTE 10/TODO 5) 확인:

```
$ grep -c "@MX:ANCHOR\|@MX:WARN\|@MX:NOTE" src/backend/adb-backend.ts src/cli/commands/web-support.ts
src/backend/adb-backend.ts:4      # ANCHOR 1 · WARN 1 · NOTE 2 (M8 시점 그대로, 이번 변경으로 늘지 않음)
src/cli/commands/web-support.ts:1 # NOTE 1 (M8 이전부터 존재, 이번 변경으로 늘지 않음)
```

`swipe.ts`는 이 마일스톤에서 건드리지 않았다(지시문 Section E — audit NN6은 여전히 미해결이며 별도 스코프).

## 블로커 / 서프라이즈 (M9 종료 시점)

1. **iOS 시뮬레이터 WebKit 원격 디버깅 프록시(`ios_webkit_debug_proxy`)가 이 세션에서 간헐적으로 페이지를 찾지 못했다(`NO_WEB_PAGE`).** 물리적으로 연결된 다른 Apple 기기(iPad, USB)에 대한 연결 시도가 실패하며 지연을 만드는 것으로 보이는 로그(`Unable to connect to ...iPad ... Please verify ... Web Inspector = ON`)가 관측됐다 — Safari 자체는 정상 동작 중이었고(`스크린샷으로 확인`) 페이지도 실제로 로드돼 있었다(수동으로 직접 `ios_webkit_debug_proxy`를 실행하면 페이지 목록이 즉시 나옴). CLI의 재시도 예산(기본 20회 × 250ms) 안에 이 지연이 해소되지 않는 경우가 있었다 — 여러 차례 재시도(및 Safari 강제종료·재실행) 끝에 성공하는 창을 확보해 D-4/F-4의 라이브 재현을 완료했다. **이 문제는 이번 M9 코드 변경과 무관한 환경 요인**이다(같은 증상이 `dump --web` 등 기존 명령에서도 발생) — 프로젝트 메모리에 별도 기록 후보(다음 세션이 이 기기에서 웹 경로 작업을 할 때 참고).
2. **acceptance.md AC-GEST-030 문구의 "and that a `max(physical, override)` implementation fails fixture B" 요건은 별도 구현체 작성이 아니라 fixture B의 기댓값 단언(26px, `not.toBe(32)`)으로 충족했다** — `max(physical,override)`를 실제로 구현해 별도 실패 케이스를 만드는 대신, 그 구현이 냈을 값(32)과 다름을 명시적으로 단언하는 형태를 택했다. `max()` 구현 자체를 작성하면 프로덕션 코드에 죽은 분기를 남기게 되어 이 쪽이 더 낫다고 판단했다.
3. **범위 이탈 없음.** `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE), `src/backend/idb-backend.ts`(iOS 경로, M9 비대상), `src/cli/commands/swipe.ts`(M9 비대상, @MX 미해결 audit NN6는 그대로 남김), README.md/CHANGELOG.md(docs 패스 위임) 전부 미변경 확인. SPEC 본문 3종·frontmatter 미변경.
4. **환경 정리 완료.** 라이브 재현에 쓴 로컬 `python3 -m http.server 8937`(스크래치패드의 `site/audit.html` 서빙)을 종료 확인(`lsof -i :8937` 무출력). `adb reverse --list` 빈 출력(Android 쪽은 이번 M9에서 `adb reverse` 매핑을 전혀 사용하지 않았다 — D-1의 체커보드 슬롭 픽스처는 이번 세션에서 열지 않았다). `wm density`는 `Physical density: 600` 단일 행, Override 행 없음(변경 없음, D-3 준수). `xcrun simctl list devices booted` → iPhone 17 Pro(D0B3A18C-...) 하나만 남음.
5. **sync-auditor 재확인 우선순위(다음 세션에게)**: (a) AC-GEST-032 — README의 NN8(가로 32px 5/6 반대 증거 누락)·NN4(거리 증가 폭 홀짝 서술을 문턱이 아니라 화면 축 길이로 정정) 반영, (b) M8 블로커에서 이월된 acceptance.md AC-GEST-027 "4개 파일 7개 지점" 문구 정정 여부, (c) Android 스크롤 안정화 지연(M8 블로커 3번) 방법론 기록 여부 — 이 세 항목 모두 body 콘텐츠 수정 권한이 없는 이 세션 밖의 일이다.

## §E.3 Run-phase Audit-Ready Signal (M9 최종 — 0.7.0 amendment)

```yaml
run_status: M9-complete
run_complete_at: "2026-07-28"
run_commit_sha: "e23940f"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 여러 번 쓰인 패턴 그대로). 이 값을 담은 별도 backfill 커밋 참조.
ac_pass_count: 2      # M9 자체 판정: AC-GEST-030, AC-GEST-031
ac_fail_count: 0
ac_partial_count: 0
ac_deferred_count: 1  # AC-GEST-032 -- 문서 소관, docs 패스에서 집행(미충족으로 정직하게 기록)
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/{inspector-client,proxy-service,calibration}.ts 미변경
l44_pre_commit_fetch: "git fetch origin master && git rev-list --count --left-right origin/master...HEAD -> 확인 예정(커밋 직전 재실행)"
l44_post_push_fetch: not_applicable   # 이 SPEC은 push하지 않는다(지시문 Section E "Do not push")
new_warnings_or_lints_introduced: false
cross_platform_build: { windows: not_applicable, note: "TypeScript/Node 프로젝트, GOOS 교차빌드 대상 아님" }
total_run_phase_files: 20   # M9는 기존 2개 파일(+테스트)만 확장 -- 신규 파일 없음, M8까지의 20에서 불변
m1_to_mN_commit_strategy: "M9는 단일 커밋(fix)으로 마감 -- 유효 밀도 파서(산출물 1)와 오라클 표본 시점(산출물 2)은 plan.md §G가 명시한 대로 서로 독립이지만 같은 amendment의 두 결함을 함께 닫으므로 분리가 인위적이다(M6/M7/M8과 동일 판단)"
```

## §E.4 Sync-phase Audit-Ready Signal (0.7.0 amendment)

> 0.6.0 마감 시점의 §E.4(위, "sync_commit_sha: ad06692")는 그대로 보존한다 — 이 절은 M9(0.7.0 amendment) 코드 수정 이후의 README/CHANGELOG 정정 + 재마감 sync를 담는 **별도의 새 sync 레코드**다.

```yaml
sync_status: audit-ready
sync_complete_at: "2026-07-28"
sync_commit_sha: "392c9b2"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 이 파일에서 이미 다섯 번 쓰인 패턴 그대로). 이 값을 담은 별도 chore backfill 커밋 참조.
b12_self_test_a: "grep -c 'SPEC-GESTURE-001' CHANGELOG.md (편집 전, HEAD c89cf78 시점) -> 11 -- 기존 [Unreleased] 블록(Added/Fixed/Notes)을 제자리에서 수정 + Fixed에 0.7.0 서브블록 2개 신규 추가(편집 후 13). 새 최상위 [Unreleased] 항목을 추가한 것이 아니라 기존 블록 내부를 갱신했으므로 중복 방출 아님"
b12_self_test_b: "grep -cE '^### AC-GEST-[0-9]+' acceptance.md -> 32 -- CHANGELOG Notes/README Status의 '32 acceptance criteria' 표기와 일치(29 + 0.7.0 신규 3건)"
b12_self_test_c: "CHANGELOG/README가 인용한 모든 파일 경로를 커밋 전 ls로 실재 확인: src/backend/adb-backend.ts, src/cli/commands/{web-support,scroll-geometry}.ts. 인용한 모든 수치는 이 sync 세션에서 직접 재실행해 확인 -- pnpm vitest run(29 files/644 tests, exit 0) + pnpm typecheck(exit 0) + pnpm build(exit 0) + 연결된 Android 실기기(adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp)에서 `wm density`(Physical density: 600, Override 없음 -- 변경/복원 아님, 애초에 그대로) 재확인 + `scroll down --amount 0.0001` 거부 경로로 minValidRatio 0.011039886623620987/basis device-query 재확인(기기에 어떤 제스처도 전송되지 않음, exit 1) + 부팅된 iPhone 17 Pro 시뮬레이터(D0B3A18C-E485-4E7C-A25E-504BF4CA6163)에서 같은 거부 경로로 minValidRatio 0.013984236866235733/basis measured-constant 재확인. spec.md §C.1-⑳/⑰의 22/25/26/30/31/32px 수치, §C.1-㉑의 11초 지연 수치는 M9 run-phase 실측 기록(위 §E.2)을 그대로 인용하고 별도 재측정하지 않음(디스플레이 밀도 재변경 금지, 지시문 Section D) -- 인용원인 progress.md 자체가 이미 이 세션의 검증 대상이므로 이중 재측정은 불필요"
changelog_entry_position: "[Unreleased] -> Added(scroll 불릿에 유효 밀도 읽기 서술 추가, 0.7.0 참조) + Fixed(0.7.0 amendment 신규 서브블록 2개 -- 밀도 Override 결함 + 비동기 스크롤 오라클 결함) + Notes(AC 집계 28/1/29 -> 31/1/32 갱신, AC-GEST-032가 이 문서 정정 자체로 충족됨을 명시)"
frontmatter_status_transitions:
  spec_md: "in-progress -> completed"
  plan_md: "in-progress -> completed"
  acceptance_md: "in-progress -> completed"
  progress_md: "in-progress -> completed"
  updated_date: "2026-07-28 -> 2026-07-28 (당일 amendment 재마감, 4개 아티팩트 전부 -- M9가 이미 같은 날짜로 갱신해둔 상태)"
canary_compliance_check: not_applicable   # 본 SPEC은 자기 자신의 sync를 테스트하는 전향적 정책을 정의하지 않음
```

### AC-GEST-032 판정 (docs 패스에서 확정)

M9(run-phase)는 AC-GEST-032를 "미충족"으로 정직하게 남겼다(§E.3 위 참조, `ac_deferred_count: 1`) — README·CHANGELOG 정정은 docs 패스 소관이었기 때문이다. 이 sync가 그 docs 패스다. 아래 두 요건을 이번 편집으로 충족했으므로 **PASS로 승격**한다.

| 요건(acceptance.md AC-GEST-032) | 충족 증거 |
|---|---|
| "왕복 성공(3/3, 네 방향)을 적는 자리에 측정의 가로 32px 5/6도 적혀 있다" | README.md `scroll` 절 — "though the underlying boundary measurement itself found the horizontal axis less settled... vertically, 32px measured a clean 8 out of 8, but horizontally it measured only 5 out of 6" 신규 삽입(NN8) |
| "거리 증가 폭의 서술이 화면 축 길이의 홀짝으로 범위가 좁혀져 있다(문턱의 홀짝이 아니다)" | README.md `scroll` 절의 centre-symmetric 단락을 "screen axis' own length" 기준으로 전면 재작성(NN4) — `393×852`의 홀수 폭·`375×667`의 두 홀수 축이 iOS 11px 문턱에 정확히 얹힌다는 사실을 명시 |

두 요건 모두 이 sync 커밋 자체가 충족시키므로, PASS 판정의 근거는 "이 문서 자신"이다 — 관측 대상과 관측 행위가 같은 커밋에 있다는 점은 이례적이지만, acceptance.md 원문이 "docs 패스에서 집행"이라고 명시적으로 예정해 둔 경로이므로 순서상 이상이 없다(M8이 AC-GEST-006을 자신의 run-phase 안에서 판정한 것과 같은 성격 — SPEC 문서가 자기 검증 결과를 미리 적어 두지 않는다는 규율은 유지된다, 이 판정은 사후에 §E.4에 기록될 뿐 acceptance.md 본문에 미리 적히지 않는다).

### 문서 반영 (0.7.0 amendment)

| 문서 | 반영 내용 |
|------|-----------|
| `README.md` | 상단 Status 블록(639→644 테스트, 0.7.0 amendment 언급 추가) · `scroll` 절(NN4 — centre-symmetric 단락을 화면 축 길이 홀짝 기준으로 재작성, `"device-query"` 불릿에 유효 밀도 설명 추가, NN8 — 가로 32px 5/6 반대 증거 삽입, Override 밀도 발견·수정·측정 한계를 다루는 신규 단락 2개 삽입) · `tap --web` 절(비동기 스크롤 오라클 결함 + `behavior:"instant"` 수정을 다루는 신규 단락 삽입) · Status 절(0.7.0 amendment 서술 단락 신규 삽입, 최종 집계 28/1/29 → 31/1/32 갱신, "0.4.0/0.5.0/0.6.0" 열거에 0.7.0 추가) |
| `CHANGELOG.md` | `[Unreleased]` 기존 SPEC-GESTURE-001 블록을 **제자리에서** 수정 — Added의 `scroll` 불릿에 유효 밀도 읽기 서술 추가, `### Fixed`에 0.7.0 amendment 신규 서브블록 2개(밀도 Override 결함 — 3번째 같은 계열 결함이라는 서술 포함 · 비동기 스크롤 오라클 결함), `### Notes`의 AC 집계 갱신 + AC-GEST-032가 이 sync 자체로 충족됨을 명시 |

### 잔여 관찰 (다음 세션 참고)

- 이 sync는 문서 정정 + 재마감만 담당한다(지시문 Section D) — `src/`는 건드리지 않았다. `pnpm vitest run`/`pnpm typecheck`/`pnpm build`는 이 sync 커밋 직전 재확인했다(아래 최종 검증).
- M8/M9 블로커에서 이월된 두 항목은 이 sync 범위 밖이다 — body 콘텐츠 정정은 manager-spec 소관이며, 이 sync는 frontmatter 전이 + README/CHANGELOG + progress.md §E.4만 위임받았다: (a) acceptance.md AC-GEST-027 "4개 파일 7개 지점" 문구가 실제로는 "6개 파일 9개 지점"인 불일치, (b) Android 스크롤 안정화 1초 지연이 spec.md/plan.md 본문에 미기록. 다음 세션의 재확인 우선순위로 그대로 남긴다.
- push는 지시문 Section C-4("Do NOT push. I hold that decision.")에 따라 수행하지 않는다.

### 최종 검증 (실제 명령 출력)

```
$ pnpm vitest run   → exit 0 — Test Files 29 passed, Tests 644 passed
$ pnpm typecheck    → exit 0
$ pnpm build        → exit 0
$ grep -c "SPEC-GESTURE-001" CHANGELOG.md   → 13
$ grep -cE '^### AC-GEST-[0-9]+' .moai/specs/SPEC-GESTURE-001/acceptance.md   → 32
$ export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
$ adb -s adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp shell wm density
Physical density: 600
$ node dist/cli/bin.js scroll down --amount 0.0001 --device adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"...","details":{"requestedRatio":0.0001,"minValidRatio":0.011039886623620987,"minValidRatioBasis":"device-query"}}}
$ node dist/cli/bin.js scroll down --amount 0.0001 --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"...","details":{"requestedRatio":0.0001,"minValidRatio":0.013984236866235733,"minValidRatioBasis":"measured-constant"}}}
```

두 거부 경로 모두 `ok:false`/exit 1 — 기기에 어떤 제스처도 전송되지 않았다. Android 디스플레이 밀도는 이 sync 세션 내내 변경하지 않았다(지시문 Section D "Do not change the device's display density" 준수 — 애초에 `Physical density: 600` 단일 행이었고 그대로다).

### 커밋

이 sync 커밋은 `README.md` + `CHANGELOG.md` + SPEC 아티팩트 4종(frontmatter만, `progress.md`는 본문도 포함 — 이 §E.4 자체)을 담는다. `src/`는 건드리지 않는다(지시문 Section D). 커밋 직전 `git fetch origin master && git rev-list --count --left-right origin/master...HEAD`로 원격 분기 여부를 확인한다. push는 지시문 Section C-4("Do NOT push. I hold that decision.")에 따라 수행하지 않는다.

sync 커밋 SHA: `392c9b2`(`docs(SPEC-GESTURE-001): correct 0.7.0 amendment docs + 3-phase close`). 이 값은 별도의 후속 backfill 커밋(이 문단이 속한 커밋 자체)에 기록한다 — 0.3.0/0.4.0/0.5.0/0.6.0 sync에서 이미 네 번 쓰인 패턴 그대로(다섯 번째).

### M10 — 이월된 감사 부채 일괄 정리 (0.8.0 amendment)

> **선행**: M1-M9는 0.7.0에서 마감·푸시됐다(직전 completed `392c9b2`). 이 마일스톤은 **새 능력이 아니라 부채 정리**로 열렸다 — 5차 감사가 MUST-FIX 0건·PASS-WITH-DEBT 0.89/SAFE TO PUSH: Yes를 내면서 지목한 이월 패턴(1~3줄 편집 5건이 docs 패스가 열려 있어도 쓸리지 않음)을 닫는다. 신규 REQ 없음, 신규 AC 2건(AC-GEST-033/034)뿐 — plan.md §F M10 서문.

**산출물 (plan.md §F M10 산출물 1-4 전부 완료, RED-GREEN 사이클로 진행)**

1. **권고 부재 경로(`scroll-geometry.ts`/`scroll.ts`) — NN5 규범 절반, AC-GEST-034.** `minNonDegenerateRatio`가 이제 `number | undefined`를 반환한다 — 이분 탐색 전에 `ratio=1` 자체가 퇴화인지 먼저 확인하고, 퇴화면(문턱을 넘는 비율이 아예 없는 화면) `undefined`를 반환한다. `scroll.ts`는 `undefined`일 때 `minValidRatio`/`minValidRatioBasis` 필드 자체를 응답에서 생략한다(조건부 스프레드). 거부(`AMOUNT_TOO_SMALL`) 자체와 무제스처 보장은 불변.
2. **`behavior:"instant"` 방어적 폴백(`web-support.ts`) — NF3, 채택.** `buildScrollIntoViewExpression`의 `el.scrollIntoView({block:"center", behavior:"instant"})` 호출을 `try`/`catch`로 감싸, WebKit이 `ScrollBehavior` 열거값을 검증해 던지면(구버전 WebKit) `el.scrollIntoView({block:"center"})`(인자 없음)로 폴백한다. 폴백 경로가 smooth 페이지에서 M9가 닫은 비동기 표본 결함을 좁은 범위로 재현한다는 점을 주석에 명시(동등이 아니라 개선이라는 서술).
3. **문턱 캐싱(`adb-backend.ts`) — NN10, 채택(선택 항목).** `getMinEffectiveSwipeThreshold`에 직렬(serial)별 in-memory 캐시(`thresholdCache`) + TTL(`THRESHOLD_CACHE_TTL_MS = 5_000`) 무효화를 추가했다. 유효 밀도가 세션 중 바뀔 수 있다는 사실(§C.1-⑳)이 무효화를 규범으로 만든다 — TTL 만료 후 재조회하도록 해 확대 방향에서 캐시가 슬롭보다 낮은 문턱을 영구히 공급하는 것을 막는다. 생성자에 테스트용 `now: () => number` 주입점 추가(기본값 `Date.now`).
4. **사실 오류·주석 정리 — NN5 주석 절반 + NN6, 동작 변화 없음.** `scroll-geometry.ts`의 `minNonDegenerateRatio` 주석에서 "그런 화면은 이미 REQ-GEST-SCROLL-004가 거부한다"는 거짓 전제를 정정(실행 가능한 반례: `deriveScreenSize([{0,0,12,12}])`는 `{12,12}`를 정상 반환한다). `swipe.ts`에 `@MX:NOTE` 1개 신설(`--duration` 검증이 반드시 백엔드 호출보다 앞서야 하는 순서 불변식) — 종전 0개였다.
5. **회귀** — 아래 "테스트 스위트"/"회귀 확인" 절 참조.

### AC PASS/FAIL 매트릭스 (M10 스코프)

| AC ID | 상태 | 검증 명령 | 실제 결과 |
|-------|------|-----------|-----------|
| AC-GEST-033 | PASS (문서 오라클 — 이미 충족돼 있었다) | spec.md §C.1-㉒ + acceptance.md AC-GEST-033 대조 | M8 산출물 5(AC-GEST-028 왕복 검증)이 이미 "1초 지연 후" 촬영 방법론을 기록해 뒀다(progress.md M8 §E.2, spec.md §C.1-㉒/REQ-GEST-SCROLL-007 0.8.0 주석). 재측정하지 않았다 — 지시문 Section C-1이 명시한 대로 기존 기록을 대조 확인만 했다. "1초"를 규칙으로 서술하지 않는다는 조건도 spec.md 서술이 준수 |
| AC-GEST-034 | PASS | `pnpm vitest run src/cli/commands/scroll-geometry.test.ts src/cli/commands/scroll.test.ts -t "AC-GEST-034"` | scroll-geometry.test.ts 4건 + scroll.test.ts 3건 전부 PASS. 12x12 화면(문턱 32px)에서 `deriveScreenSize`가 정상 파생(반례 확인) + `ratio=1`조차 네 방향 전부 퇴화 확인 + `minNonDegenerateRatio`가 네 방향 전부 `undefined` 반환 + CLI 전 구간(`scroll` 명령)에서 `AMOUNT_TOO_SMALL`은 그대로 나가되 `minValidRatio`/`minValidRatioBasis` 필드가 응답에서 생략됨(`Object.hasOwn` 확인) + 무제스처 보장(`backend.swipe` 미호출) + 일반 화면(402x874)에서는 필드가 여전히 실림(회귀 아님) 확인 |
| AC-GEST-027 | 대상 아님(0.8.0에서 이미 정정됨) | — | 지시문·plan.md §F M10 AC 절이 명시한 대로, 이 AC는 0.8.0 amendment에서 이미 정정을 마쳐 M10의 대상이 아니다 |

**B-1(NF3)·B-2(NN10)·B-4(NN6)는 신규 REQ/AC가 없는 순수 구현 판단 항목**이라 위 매트릭스에 없다 — 검증은 아래 RED-GREEN 사이클 + 회귀 확인으로 갈음한다(plan.md §F M10 "다만 무효화 의무는 규범" 및 "채택 여부는 구현 판단" 서술 참조).

### RED-GREEN 사이클 증거 (B-3 — AC-GEST-034, `minNonDegenerateRatio`)

```
$ pnpm vitest run src/cli/commands/scroll-geometry.test.ts   # 수정 전 (undefined 처분 신설 전)
 FAIL  ... minNonDegenerateRatio는 이런 화면·문턱 조합에서 undefined를 반환한다 ...
 AssertionError: expected 1 to be undefined   -- 자기거부 값(1)을 그대로 반환하고 있었음을 실측 확인
 Tests  1 failed | 73 passed (74)
$ pnpm vitest run src/cli/commands/scroll.test.ts   # scroll.ts 수정 전
 FAIL  ... 문턱을 넘는 비율이 없는 화면(12x12, 문턱 32px) ...
 AssertionError: expected true to be false   -- minValidRatio 필드가 undefined 값으로나마 여전히 실려 있었음(hasOwn true)
 Tests  2 failed | 66 passed (68)
# 수정 후
$ pnpm vitest run src/cli/commands/scroll-geometry.test.ts src/cli/commands/scroll.test.ts
 Test Files  2 passed (2)
      Tests  142 passed (142)
```

### RED-GREEN 사이클 증거 (B-1 — NF3, `buildScrollIntoViewExpression` 방어적 폴백)

```
$ # try/catch를 일시 제거한 사본으로 재실행 (수정 전 재현)
$ pnpm vitest run src/cli/commands/web-support.test.ts
 FAIL  ... falls back to a no-argument call and still finds+credits movement when behavior:"instant" throws ...
 TypeError: Failed to execute 'scrollIntoView' on 'Element': The provided value 'instant' is not a valid enum value of type ScrollBehavior.
 FAIL  ... on a smooth-scrolling page/container, the fallback reads moved:false ...
 (same TypeError, uncaught)
 Tests  2 failed | 42 passed (44)
# try/catch 복원 후
$ pnpm vitest run src/cli/commands/web-support.test.ts
 Test Files  1 passed (1)
      Tests  44 passed (44)
```

**B-1 evidence — 열거값 throw 주장의 출처.** `behavior:'bogus-value'`가 시뮬레이터에서 TypeError를 던진다는 사실은 **5차 감사의 확인을 인용**했다 — 이번 세션에서 직접 재검증하지 않았다. 이유: 지시문 C-4가 경고한 대로 이 환경의 웹 프록시가 간헐적(`NO_WEB_PAGE`, 5초 간격 필요, 이전 감사도 4회 시도)이고, `try`/`catch`로 감싸는 수정은 **어느 예외 형태든** 동일하게 닫으므로 재검증 없이도 방어적 가치가 있다. 코드를 직접 읽어 확인한 사실: `webview/inspector-client.ts`가 `wasThrown === true`를 **reject**로 처리하므로(:199-202), 폴백이 없었다면 이 throw는 "조용히 `{found:false,moved:false}`로 저하"가 아니라 `runInWebSession`의 catch를 거쳐 `WEB_SESSION_FAILED`로 명령 전체가 실패했을 가능성이 높다 — 지시문이 서술한 정확한 증상(js-click과 구분 불가능한 조용한 저하)과는 다른 실패 모양이다. 두 가지 실패 모양(전체 실패 vs 조용한 저하) 중 이 환경에서 실제로 어느 쪽이 발생하는지는 라이브 재검증 없이 확정할 수 없으나, **이 수정(페이지 스크립트 안에서 예외를 잡는 것)은 둘 중 어느 쪽이 발생하더라도 절벽 자체를 닫는다** — 위치를 transport 경계가 아니라 페이지 스크립트 안으로 정한 이유다.

### RED-GREEN 사이클 증거 (B-2 — NN10, `AdbBackend` 문턱 캐싱)

```
$ pnpm vitest run src/backend/adb-backend.test.ts   # 캐싱 구현 전
 FAIL  ... a second call for the same serial within the TTL window does not re-query 'wm density' ...
 AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 FAIL  ... caches independently per serial ...
 AssertionError: expected "vi.fn()" to be called 2 times, but got 4 times
 FAIL  ... within the TTL window, a stale-but-not-yet-expired cache entry is still served ...
 AssertionError: expected 26px but got 32px cached-vs-fresh mismatch (캐시가 없어 매번 최신 mock을 반영해버림)
 Tests  3 failed | 55 passed (58)
# 캐싱 + TTL 구현 후
$ pnpm vitest run src/backend/adb-backend.test.ts
 Test Files  1 passed (1)
      Tests  58 passed (58)
```

캐시가 **실제로 사용됨**(두 번째 `getMinEffectiveSwipeThreshold` 호출이 `exec`를 재호출하지 않음, 직렬별 독립) + **실제로 무효화됨**(TTL 경과 후 재조회해 갱신된 값 반환, 확대 방향 시나리오 포함)을 각각 별도 테스트로 확인.

### 회귀 확인

**iOS `minValidRatio` 불변** — 402x874, down, 문턱 11 재계산:

```
$ node --input-type=module -e 'import("./dist/cli/commands/scroll-geometry.js").then(m => console.log(m.minNonDegenerateRatio("down", {width:402,height:874}, 11)))'
0.013984236866235733
```

M7/M8/M9 시점 기록값과 바이트 동일.

**연결된 Android 실기기 문턱 불변(32px)** — `wm density` 재조회 없이 캐시 배선까지 포함해 확인:

```
$ export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
$ adb -s adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp shell wm density
Physical density: 600
$ node --input-type=module -e 'import("./dist/backend/adb-backend.js").then(async m => {
    const b = new m.AdbBackend();
    console.log(JSON.stringify(await b.getMinEffectiveSwipeThreshold("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp")));
    console.log(JSON.stringify(await b.getMinEffectiveSwipeThreshold("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp")));
  })'
{"minEffectiveSwipePx":32,"basis":"device-query"}
{"minEffectiveSwipePx":32,"basis":"device-query"}
```

**Android `minValidRatio` 불변(실기기 화면 1440x3120)**:

```
$ node --input-type=module -e 'import("./dist/cli/commands/scroll-geometry.js").then(m => {
    console.log(m.minNonDegenerateRatio("down", {width:1440,height:3120}, 32));
    console.log(m.minNonDegenerateRatio("left", {width:1440,height:3120}, 32));
  })'
0.011039886623620987
0.02391975373029709
```

M8/M9 progress.md 기록값(세로 `0.011039886623620987`, 가로 `0.02391975373029709`)과 바이트 동일.

**`DeviceBackend` 인터페이스 멤버 수 불변(10)**:

```
$ grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts
10
```

### 테스트 스위트

```
$ pnpm vitest run
 Test Files  29 passed (29)
      Tests  657 passed (657)
```

기준선 644 → 657(+13): `scroll-geometry.test.ts` 신규 4건(AC-GEST-034 — deriveScreenSize 반례, ratio=1 퇴화 확인, undefined 확인 네 방향, 왕복 회귀 아님 확인) · `scroll.test.ts` 신규 3건(AC-GEST-034 — 12x12/32px 필드 생략, 네 방향 동일, 일반 화면 회귀 아님) · `web-support.test.ts` 신규 2건(NF3 — 폴백 성공 경로, 폴백의 smooth-페이지 비대칭 트레이드오프) · `adb-backend.test.ts` 신규 4건(NN10 — 재조회 안 함, 직렬별 독립, TTL 경과 후 갱신, TTL 이내 유지). 신규 파일 없음(기존 4개 테스트 파일만 확장) — `total_run_phase_files`는 M9까지의 20에서 불변.

### Typecheck + Build

```
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

### Scope Check

```
$ git status --porcelain --untracked-files=no
 M src/backend/adb-backend.test.ts
 M src/backend/adb-backend.ts
 M src/cli/commands/scroll-geometry.test.ts
 M src/cli/commands/scroll-geometry.ts
 M src/cli/commands/scroll.test.ts
 M src/cli/commands/scroll.ts
 M src/cli/commands/swipe.ts
 M src/cli/commands/web-support.test.ts
 M src/cli/commands/web-support.ts
```

plan.md §A.6 M10 행(9개 파일: `adb-backend.ts`/`.test.ts`, `scroll-geometry.ts`/`.test.ts`, `scroll.ts`/`.test.ts`, `web-support.ts`/`.test.ts`, `swipe.ts`) — 전부 위 목록에 포함, 그 외 파일 없음. `src/backend/idb-backend.ts`(iOS 경로, M10 비대상) 미변경. `src/normalize/*`, `src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE) 미변경. SPEC 본문 3종(spec.md/plan.md/acceptance.md) 미변경, frontmatter도 미변경(`status: in-progress` 그대로). README.md/CHANGELOG.md 미변경(지시문 Section D — 별도 docs 패스가 NN3·`--web` 프록시 고지·NN9 후속을 처리).

### MX 태그 확인

```
$ grep -c "@MX:ANCHOR\|@MX:WARN\|@MX:NOTE" src/backend/adb-backend.ts src/cli/commands/web-support.ts src/cli/commands/scroll-geometry.ts src/cli/commands/scroll.ts src/cli/commands/swipe.ts
src/backend/adb-backend.ts:5        # ANCHOR 1 · WARN 1 · NOTE 3 (신규 NOTE 1개 -- THRESHOLD_CACHE_TTL_MS 설계 선택 근거)
src/cli/commands/web-support.ts:1   # NOTE 1 (M8 이전부터 존재, 이번 변경으로 늘지 않음 -- NF3 서술은 기존 함수 docblock의 산문으로만 추가)
src/cli/commands/scroll-geometry.ts:2   # ANCHOR 2 (M7/M8부터 존재, 이번 변경으로 늘지 않음 -- AC-GEST-034/NN5 서술은 기존 ANCHOR 함수 docblock의 산문으로만 추가)
src/cli/commands/scroll.ts:1         # NOTE 1 (M3부터 존재, 이번 변경으로 늘지 않음)
src/cli/commands/swipe.ts:1          # NOTE 1 (신규 -- 종전 0개, NN6이 지목한 "0개 태그" 상태 해소)
```

파일당 누적 한도(ANCHOR 3/WARN 5/NOTE 10/TODO 5) 전부 준수. `swipe.ts`의 신규 NOTE는 "종류·위치는 구현 판단"(plan.md §F M10 산출물 4) 재량으로, 이미 태그를 보유한 형제 단일-명령 파일(`doctor.ts`/`dump.ts`/`reset.ts`/`tap.ts`/`text.ts` 각 1개)과 같은 밀도로 맞췄다 — 전면적(blanket) 태깅이 아니라 파일 전체에서 가장 비자명한 불변식(`--duration` 검증 순서) 하나만 태그했다.

## 블로커 / 서프라이즈 (M10 종료 시점)

1. **NF3의 열거값 throw 주장은 라이브 재검증하지 않았다 — 이 세션의 유일한 미관측 항목.** 지시문이 명시적으로 허용한 대로(auditor 인용 vs 자체 재검증 양자택일) 5차 감사의 확인을 인용했다. 코드를 읽어 확인한 사실 하나는 감사의 서술과 정확히 일치하지 않을 수 있다는 것이다 — `webview/inspector-client.ts`는 `wasThrown`을 reject로 처리하므로, 미수정 상태에서 이 throw는 (지시문이 서술한) "조용한 js-click 저하"가 아니라 (내가 코드에서 읽은) "명령 전체의 `WEB_SESSION_FAILED` 실패"로 나타났을 가능성이 있다. **다음 감사가 살펴봐야 할 항목 1순위**: 실제 iOS 시뮬레이터에서 구버전 WebKit을 흉내낼 방법(예: `behavior:'bogus-value'`를 직접 평가)으로 어느 실패 모양이 맞는지 확정하는 것. 어느 쪽이든 이번 수정(페이지 스크립트 내부에서 예외를 잡음)은 두 실패 모양 모두를 닫으므로 수정 자체의 정당성에는 영향이 없다.
2. **B-2(NN10)의 캐시는 in-memory이며 프로세스 경계를 넘지 않는다 — 의도된 설계다.** 이 CLI는 `node dist/cli/bin.js <cmd>` 호출마다 별도 OS 프로세스이므로(`ime-session-store.ts`의 선례가 이미 문서화한 사실), 실사용에서 `scroll`을 반복 호출하는 일반적인 경로는 각 호출이 새 프로세스이고 캐시가 매번 비어 있어 체감 이득이 없다. 이 캐시가 실제로 amortize하는 것은 **같은 프로세스 안에서 같은 백엔드 인스턴스를 재사용하는 호출자**(테스트, 또는 향후 배치/REPL 형태의 실행 경로)뿐이다. plan.md §F M10이 명시적으로 "캐시 유무·자료구조·키·무효화 계기는 전적으로 구현 판단"이라 위임했으므로 SPEC 위반은 아니지만, 이 설계가 실사용 CLI에서 체감 latency를 줄이지 못한다는 것은 다음 세션이 알아야 할 사실이다. TTL 무효화를 `reset.ts`(세션 재설정)에 배선하는 것은 plan.md §A.6 M10 파일 스코프 밖(`reset.ts`는 M10 대상이 아니다)이라 이번 세션에서 하지 않았다.
3. **AC-GEST-033은 재측정이 아니라 기존 기록 대조였다** — 지시문 C-1이 정확히 지적한 대로, M8의 AC-GEST-028 왕복 검증이 이미 1초 지연 방법론을 실측·기록해 뒀다. 이번 세션은 그 기록이 acceptance.md의 세 조건(지연 존재/기록됨/"1초"를 규칙으로 서술하지 않음/iOS로 확장하지 않음)을 충족하는지 대조만 했다 — 새 실기기 시행 없음.
4. **네 항목(B-1~B-4) 중 하나도 "사실은 문제가 아니었다"로 판명되지 않았다** — NF3(방어적 폴백 채택, 트레이드오프 명시) · NN10(캐싱 채택, TTL 무효화) · NN5(자기거부 권고 수정 + 주석 정정, 둘 다 실제 결함/사실 오류였음) · NN6(0개 태그, 실제로 비어 있었음) 넷 모두 지시문이 서술한 그대로의 조치가 필요했다.
5. **범위 이탈 없음.** `src/backend/idb-backend.ts`(iOS 경로, M10 비대상), `src/normalize/*`·`src/webview/{inspector-client,proxy-service,calibration}.ts`(PRESERVE), README.md/CHANGELOG.md(docs 패스 위임) 전부 미변경 확인. SPEC 본문 3종·frontmatter 미변경.
6. **환경 정리 확인.** `adb reverse --list` 빈 출력(이 세션은 `adb reverse` 매핑을 전혀 사용하지 않았다 — C-2의 슬롭 픽스처를 열지 않았다, 모든 검증이 unit 레벨이거나 read-only `wm density`/`getMinEffectiveSwipeThreshold` 호출뿐이었다). `wm density`는 `Physical density: 600` 단일 행, Override 없음(변경 없음). `xcrun simctl list devices booted` → iPhone 17 Pro(D0B3A18C-...) 하나만. 포트 8935/8937 리스너 없음(`lsof` 무출력) — 이 세션은 웹 프록시나 로컬 서버를 전혀 띄우지 않았다.

## §E.3 Run-phase Audit-Ready Signal (M10 최종 — 0.8.0 amendment)

```yaml
run_status: M10-complete
run_complete_at: "2026-07-28"
run_commit_sha: "022e282"   # backfill 완료(자기참조 해시 문제 -- spec-frontmatter-schema.md § SHA placeholder backfill exemption(D3), 0.3.0~0.7.0에서 이미 여러 번 쓰인 패턴 그대로). 이 값을 담은 별도 backfill 커밋 참조.
ac_pass_count: 2      # M10 자체 판정: AC-GEST-033(문서 오라클, 기존 기록 대조), AC-GEST-034
ac_fail_count: 0
ac_partial_count: 0
ac_deferred_count: 0   # AC-GEST-027은 0.8.0에서 이미 정정되어 M10 대상이 아님(대상 제외이지 미충족이 아니다)
preserve_list_post_run_count: 0   # src/normalize/*, src/webview/{inspector-client,proxy-service,calibration}.ts, src/backend/idb-backend.ts 미변경
l44_pre_commit_fetch: "git fetch origin master && git rev-list --count --left-right origin/master...HEAD -> 확인 예정(커밋 직전 재실행)"
l44_post_push_fetch: not_applicable   # 이 SPEC은 push하지 않는다(지시문 Section D "Do not push")
new_warnings_or_lints_introduced: false
cross_platform_build: { windows: not_applicable, note: "TypeScript/Node 프로젝트, GOOS 교차빌드 대상 아님" }
total_run_phase_files: 20   # M10은 기존 9개 파일(plan.md §A.6 M10 행)만 확장 -- 신규 파일 없음, M9까지의 20에서 불변
m1_to_mN_commit_strategy: "M10은 단일 커밋(fix)으로 마감 -- B-1/B-2/B-3/B-4 네 산출물은 plan.md §G가 명시한 대로 서로 완전히 독립(부채 목록이지 선행 관계 아님)이지만, 같은 5차 감사가 지목한 이월 패턴을 한 번에 닫는 단일 amendment이므로 분리가 인위적이다(M6/M7/M8/M9와 동일 판단)"
```
