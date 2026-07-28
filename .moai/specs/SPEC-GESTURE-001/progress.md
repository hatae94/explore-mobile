---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 진행 기록"
version: "0.4.0"
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
