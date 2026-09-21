---
id: SPEC-GESTURE-002
title: "두 손가락 핀치와 더블탭 — 진행 기록"
version: "0.5.0"
status: in-progress
created: 2026-08-25
updated: 2026-08-29
author: hatae
---

# 진행 기록 — SPEC-GESTURE-002

> **M6까지 관측이 끝났고, 그 관측이 구현 결함 하나를 잡았다(0.5.0).** 이 문서가 담는 것은
> M1·M2(+M2 재작업)·M3·M4·M5·**M6**이다. AC-GEST2-011·012의 PARTIAL은 실기기 관측으로
> 닫혔다(아래 「M6 회차」).
>
> **그래도 `§E.3 Run-phase Audit-Ready Signal`은 아직 쓰지 않는다 — 이번에는 이유가 다르다.**
> M6 변경분이 **커밋되지 않았기 때문**이며(사용자가 이번 세션에서 커밋하지 않기로 했다 —
> 같은 저장소에 다른 세션의 미추적 파일 4개가 있어 범위가 섞일 위험이 있었다),
> 그 신호가 요구하는 `run_commit_sha`를 채울 수 없다. **없는 sha를 지어내지 않는다.**
> 커밋 후 그 자리에서 신호를 단다.
>
> **남은 미충족은 AC-GEST2-015(문서 고지) 하나이며 sync 위임이다** — README.md와
> SKILL.md에 두 명령이 아직 없다. 따라서 `completed` 전이는 sync 뒤다.

## §E.2 Run-phase Evidence

### 범위와 기준선

| 항목 | 값 |
|---|---|
| 이번 회차에 한 것 | **M2 재작업**(SPEC 0.4.0 결함 2 — 문턱 판정 대상 교체) · **M3**(`pinch` CLI 명령) |
| 이전 회차 | M1(`DeviceBackend` 2메서드 가법 확장 + 구현체 2개) · M2(핀치 기하 순수 함수) |
| 착수하지 않은 것 | M4(`doubletap` 명령) · M5(페이로드 계약 배선) · M6(실기기 e2e) |
| 개발 방법론 | TDD — RED(실패 확인) → GREEN(구현) 순서로 진행 |
| 커밋 | **없음** — 사용자가 커밋을 요청하지 않았다. 그래서 `draft → in-progress` 전이도 하지 않았다(그 전이는 M1 커밋에 실린다) |

**기준선(이번 회차 착수 전 직접 실행)**: `npx vitest run` → **42 파일 848건 전건 통과**.
**이번 회차 후**: **43 파일 920건 전건 통과** — 파일 +1, 건수 +72, 감소 0.

### 이번 회차에 수정한 파일

| 파일 | 마일스톤 | 성격 |
|---|---|---|
| `src/cli/commands/pinch-geometry.ts` | M2 재작업 | `pinchTravelPx`를 **실제 좌표 이동량의 작은 쪽**으로 교체 · `@MX:NOTE`(이의) 철거 후 `@MX:ANCHOR` 부여 · `fingerXs` 주석의 잘못된 출처(§C.1-⑪ → ⑮) 정정 |
| `src/cli/commands/pinch-geometry.test.ts` | M2 재작업 | 회귀 픽스처 + 앵커/방향 비의존 + 간격 보존 vs 대칭 절 신설. 28건 → 44건 |
| `src/cli/commands/pinch.ts` | M3 | **신규** — 명령 핸들러 |
| `src/cli/commands/pinch.test.ts` | M3 | **신규** — 56건 |
| `src/cli/router.ts` | M3 | `COMMANDS`에 `pinch` 등록 |
| `src/schema/command-payloads.ts` | M3(**M5 항목 일부 선반영 — 아래 참조**) | `PinchPayload` 선언 |

`src/cli/args.ts`는 **손대지 않았다**(plan.md §F M3 3번). `git diff --stat src/cli/args.ts` → 변경 없음.

### 계획에서 벗어난 것 하나 — `PinchPayload`를 M3에서 선언했다

plan.md §A.3은 `command-payloads.ts`를 **M5**에 배정했다. 그런데 `pinch.ts`가
`success<PinchPayload>(...)`를 쓰려면 그 타입이 **먼저** 있어야 한다 — 타입 없이
쓰면 객체 리터럴 추론에 맡기는 것이고, 그것이 정확히 `SPEC-CONTRACT-001`이
막으려고 존재하는 형태다(AC-GEST2-013: "핸들러의 `success()` 호출이 그 타입을
**명시**한다"). 반대로 plan.md의 M5 파일 목록에는 `pinch.ts`가 없으므로, M5가
나중에 `pinch.ts`로 돌아와 타입을 붙이는 경로도 계획에 없다.

**한 것**: `PinchPayload` 타입 선언 1개.
**하지 않은 것**: `command-payloads.test.ts`의 키 집합 양방향 소진 검사(M5 산출물 2),
`DoubleTapPayload`(M4/M5), `types.ts`의 `backendFailure` 통과 목록 배선(M5 산출물 3),
`backend-failure.test.ts` 매핑 표(M5 산출물 4). **AC-GEST2-013은 아직 닫히지 않았다** —
소진 검사가 없으므로 타입을 고치면 조용히 통과한다(두 겹 중 한 겹만 서 있다).

### AC 매트릭스 — 이번 회차 사정거리 안

| AC | 상태 | 검증 명령 | 실제 출력 |
|---|---|---|---|
| AC-GEST2-001 (기하 계산) | **PASS** — 단, 아래 「재판정」 참조 | `npx vitest run src/cli/commands/pinch-geometry.test.ts` | `44 passed (44)` |
| AC-GEST2-002 (응답의 방향·좌표) | **PASS** | `npx vitest run src/cli/commands/pinch.test.ts` | `56 passed (56)` — 방향·두 손가락 좌표 동시 적재, 응답 좌표 = 백엔드 전달 좌표 |
| AC-GEST2-005 (화면 밖 거부) | **PASS** | 같은 명령 | 무제스처 + `maxValidRatio` 왕복 성공 + 없을 때 필드 생략 + 양성 대조 1회 호출 |
| AC-GEST2-006 (문턱 이하 거부) | **PASS** | 같은 명령 | 회귀 픽스처(1080·0.01·문턱 2) 거부 · 문턱 1 양성 대조 성공 · `basis` 왕복 · 초과 비교 |
| AC-GEST2-007 (잘못된 입력) | **부분 PASS** | 같은 명령 | 방향·좌표·비율·파서 계층 전부 무제스처 거부. **`--amount 1` 절은 만족될 수 없다 — 아래 「SPEC에 되돌린 물음」 1번** |
| AC-GEST2-009 (`--from` 변환·신선도) | **부분 PASS** | 같은 명령 + `grep -rl "resolveCoordinateMapper" src/cli/commands/ \| grep -v "\.test\.ts" \| grep -v "from-capture.ts"` | 4개 파일(tap/scroll/pinch/swipe). **기대값 5는 `doubletap`(M4)까지 있어야 나온다** |
| AC-GEST2-013 (JSON 봉투) | **부분 PASS** | 같은 명령 | 성공·오류 7경로 전부 `JSON.parse` 가능, `command:"pinch"`. **키 집합 소진 검사는 M5** |
| AC-GEST2-014 (화면 크기 불명) | **PASS** | 같은 명령 | `undefined` → `SCREEN_SIZE_UNKNOWN` 무제스처 / 던지면 `BACKEND_COMMAND_FAILED` |
| AC-GEST2-010 (회귀 없음) | **PASS** | `npx vitest run` · `npx tsc --noEmit` · `npm run build` | `43 passed (43)` / `920 passed (920)` · `exit=0` · `exit=0`. 트립와이어 `12` 유지 |
| AC-GEST2-016 (의존성·계층) | **PASS** | 본 검사 + 양성 대조 | `dependencies` **0** / 대조 `devDependencies` **1** · 백엔드 우회 **0건** / 대조 `src/backend/adb-executor.ts:150` **1건** |
| AC-GEST2-003 · 004 | **PASS 유지** | `grep -rnE '^(export )?const [A-Z][A-Z0-9_]*_MS = [0-9]+;' src/backend/ ... \| wc -l` | `9` — 이번 회차가 봉투 계층을 건드리지 않았다 |
| AC-GEST2-008 (Android 거부) | **부분 PASS(변동 없음)** | — | mock 절은 통과. `backendFailure` 통과 목록 배선은 M5, 실기기 절은 M6 |

### 재판정 — AC-GEST2-001의 이전 PASS는 과장이었다

**이전 회차는 이 AC를 무조건부 PASS로 적었다. 그 표기는 정확하지 않았다.**

0.3.0까지 AC-GEST2-001은 *"`x`는 앵커를 중심으로 대칭이다"*라고 적혀 있었고, 그
문장은 홀수 간격에서 **만족될 수 없다**(spec.md §C.1-⑮: 6000표본 중 3005건 비대칭).
그런데 이전 회차의 테스트를 다시 읽어 보니 **그 문장을 단언하는 테스트가 하나도
없었다** — 있는 것은 손으로 유도한 좌표 등식(`toEqual`)뿐이었다.

그래서 정확한 재판정은 이렇다:

- 이전 테스트가 **실제로 검증한 것**: ①②③의 간격·배치 산식(손으로 유도한 상수와의
  일치). 이 부분은 지금도 통과하며, 재작업이 필요 없었다.
- 이전 테스트가 **검증하지 않은 것**: AC의 대칭 절. 만족 불가능한 문장을 테스트가
  건드리지 않고 지나갔고, 보고는 그 사실을 구분하지 않은 채 절 전체를 PASS로 적었다.
- **결론**: 이전 PASS는 *"AC의 모든 절이 검증됐다"*는 뜻으로 읽히지만 실제로는
  *"검증된 절만 통과했다"*였다. **테스트가 AC의 문장이 아니라 구현의 거동에 맞춰
  쓰였다**는 acceptance.md 0.4.0의 지적은 옳다.

**이번 회차에 닫았다.** `describe("간격 보존 vs 앵커 대칭")` 3건이 AC 문장 자체를
검사한다: (a) 짝·홀 간격 5벌에서 실제 좌표 간격이 산식의 간격과 정확히 같고,
(b) 짝수 간격에서 앵커 대칭이 성립하고, (c) **홀수 간격에서는 한쪽이 정확히 1px
더 멀되 간격은 보존된다.** 홀수 간격 픽스처는 (c)와 위 (a)의 3·4번째 행이 진다.
이제 두 문서가 같은 것을 말하며, 이번 PASS는 절 단위로 검증된 것이다.

### M2 재작업 — RED가 실제로 먼저 실패했다

`pinchTravelPx`를 고치기 **전에** 회귀 픽스처를 넣고 실행해 7건이 실패하는 것을
확인했다(전문은 run 보고 본문). 핵심 두 줄:

```
× AC-GEST2-006 회귀 방지 — 간격에서 유도한 산식(3)을 판정 대상으로 쓰는 구현은 여기서 갈린다
AssertionError: expected 3 to be 2
```

**정당하게 바뀐 픽스처 하나**: `pinchTravelPx` 표의 `["홀·홀 r=0.25", ODD_BOTH, ...]`
기대값이 **68 → 67**이다. 그 입력은 `wideGap 270`(짝)·`narrowGap 135`(홀)로 두
간격의 홀짝이 엇갈리는 경우이며, 왼쪽 손가락은 68px·오른쪽은 67px 움직인다.
산식은 `round(135/2) = 68`을 냈고 새 판정 대상은 작은 쪽 **67**이다. 이전 회차의
손 유도 좌표 픽스처(앵커 900: `833→765` / `968→1035`)가 같은 값을 이미 증언하고
있었다 — 바뀐 것은 **어느 값을 판정에 쓰는가**이지 좌표가 아니다.

**재작업 범위가 좁다는 근거를 실행으로 재확인했다**: 앵커 비의존(화면 3벌 × 비율
6종 × 앵커 8벌 전건 일치)과 단조 비감소(화면 3벌 × 비율 1000점 위반 0건)를
테스트로 못박았으므로, `pinchValidRatioRange`의 이진 탐색과 함수 시그니처는
손대지 않았다.

### 이 SPEC이 여러 번 고쳐 막으려던 함정 — 지켰는지

- **지속시간이 짧으면 확대되지 않는다고 단언하는 테스트를 쓰지 않았다.** 이번 회차는
  봉투 계층을 아예 건드리지 않았고, `pinch.ts`는 지속시간을 알지도 못한다.
- **캡처 파일 크기를 오라클로 쓰는 테스트를 하나도 두지 않았다**(원칙 4).
- **부재를 주장하는 모든 검사에 양성 대조를 세웠다**(원칙 3): 화면 밖 거부 0회 옆에
  범위 안 비율 1회, 문턱 거부 0회 옆에 문턱 1 성공 1회, `--amount 1` 전건 거부 옆에
  같은 앵커들의 `--amount 0.3` 전건 성공, `dependencies` 0건 옆에 `devDependencies` 1건,
  백엔드 우회 0건 옆에 `adb-executor.ts:150`.
- **`ok:true`를 효과의 증거로 쓰지 않았다.** 아래 「미검증」 참조.
- **되돌려준 값이 다시 거부되지 않는다**: `maxValidRatio`·`minValidRatio` 둘 다 왕복
  검증을 걸었고, 구간이 비면 필드를 생략한다(없는 값을 지어내지 않는다).

### 미검증 / 잔여 위험

- **mock은 확대가 일어났는지 볼 수 없다**(plan.md §B.7). 위 PASS는 전부 **봉투와
  좌표 형태**의 판정이며, 화면이 실제로 확대·축소되는지는 M6 실기기 관측의 몫이다.
- **간격 산식(`narrowGap = wideGap / 2`)은 여전히 미검증이다**(spec.md §C.1-⑨).
  0.4.0의 재작업이 고친 것은 **판정 대상**이지 산식이 만드는 좌표가 아니다.
- **핀치 문턱은 한 손가락 스와이프에서 빌려 온 값이다**(spec.md §C.1-⑩).
  `isPinchTravelTooSmall`은 "문턱 이하는 거부"만 판정하고 그 역을 주장하지 않는다.
- **기본 비율 0.5는 설계 선택이다.** 어떤 비율이 어느 정도로 확대되는지는 측정된 적이
  없다(§C.1-⑫). 실기기에서 확대 폭이 부족하면 만질 곳은 plan.md §B.2가 정한다.
- **AC-GEST2-013의 두 겹 중 한 겹이 비어 있다**(위 「계획에서 벗어난 것」).
- **`pinchTravelPx`의 앵커 비의존은 정수 앵커에서만 증명했다.** 좌표는
  `parseCoordinate`(`^\d+$`)와 `toDeviceCoordinate`(반올림)를 거쳐 항상 정수이므로
  현재 경로에서는 충분하지만, 비정수 앵커가 들어오는 경로가 생기면 재확인이 필요하다.

### SPEC에 되돌린 물음 (구현자가 고치지 않고 보고한 것)

구현 중 `spec.md` / `plan.md` / `acceptance.md`를 수정하지 않았다(manager-spec 소관).
아래는 보고만 하며, 처분은 SPEC 소유자의 판단이다.

1. **AC-GEST2-007의 "`--amount 1`(경계 상한)은 거부되지 않는다"는 `pinch`에서 만족될
   수 없다.** REQ-GEST2-PINCH-002 ①이 `wideGap = round(amount × screen.width)`이므로
   `--amount 1`의 간격은 **화면 폭과 정확히 같고**, 유효 좌표 범위(`0 .. width−1`)의
   폭은 `width−1`이다. 즉 **어떤 화면·어떤 앵커에서도** 들어가지 않는다.

   실행 오라클(화면 8벌 × 그 화면의 모든 앵커, 4823 조합):

   ```
   === "--amount 1" in-bounds 가능성 (본 검사) ===
   checked=4823  화면 안에 들어간 (화면,앵커) 조합 = 0
   === 양성 대조 (같은 검사기, ratio 0.3) ===
   화면 안에 들어간 조합 = 3375  -> 검사기는 살아 있다 (0이면 검사가 틀린 것)
   ```

   그 절은 `scroll`(가장자리 여백을 두고 계산하므로 `--amount 1`이 정상 동작한다)에서
   온 것으로 보인다. **구현은 SPEC대로 두었다** — `--amount 1`은 `INVALID_AMOUNT`가
   아니라 `PINCH_OUT_OF_BOUNDS`로 거부되며, `maxValidRatio`가 되먹을 값을 준다.
   그 사실을 픽스처 2건(전건 거부 + 양성 대조)으로 못박아 두었으므로, SPEC이 어느
   쪽으로 처분하든 테스트가 증언한다. 참고로 `largestInBoundsRatio`의
   `if (!outOfBounds(1)) return 1;` 분기는 이 사실 때문에 **어떤 화면에서도 도달하지
   않는다**(죽은 분기이지 결함은 아니다).

2. **`PinchPayload`를 M3에서 선언했다** — 위 「계획에서 벗어난 것」 참조. plan.md
   §A.3의 M5 배정과 AC-GEST2-013의 "핸들러가 타입을 명시한다"가 서로 맞물리지
   않는다(M5 파일 목록에 `pinch.ts`가 없어 되돌아올 경로도 없다).

3. **AC-GEST2-009의 `--from` 오라클 기대값(5개 파일)은 M4까지 가야 나온다.** M3만
   끝난 지금은 4개다. 기대값이 마일스톤별로 갈리는 것을 AC가 말하지 않는다 —
   `plan.md §B.1`이 쓰는 "세는 명령" 방식과 같은 문제 계열이다.

4. **`REQ-GEST2-PINCH-003`은 거부 응답에 "유효한 최대 비율"을 실으라 하고,
   `REQ-GEST2-PINCH-004`는 "유효 최소 비율"을 실으라 한다. 구현은 두 값을 한
   함수(`pinchValidRatioRange`)에서 얻는데, 그 함수는 구간이 비면 `undefined`를
   내므로 `PINCH_OUT_OF_BOUNDS` 응답의 `maxValidRatio`가 "화면에는 들어가지만
   문턱을 못 넘는" 비율 때문에 사라질 수 있다.** 즉 화면 밖 거부인데 문턱 때문에
   권고가 빠진다. 이것은 의도된 것이라고 본다(자기 자신이 거부할 값을 권하지
   않는다는 규율의 귀결) — 되돌려받은 값이 이번에는 `AMOUNT_TOO_SMALL`로 거부되면
   그것이야말로 SPEC-GESTURE-001이 세 번 지운 형태이기 때문이다. 다만 **AC-GEST2-005는
   "그런 비율이 존재하지 않으면"의 예로 앵커가 가장자리에 붙은 경우만 들고 있어**,
   문턱 때문에 비는 경우를 읽는 사람이 예상하기 어렵다. 문구 보강을 제안한다.

   **이것은 코드를 읽고 유추한 것이 아니라 실행으로 확인했다**(빌드된 CLI에 mock
   백엔드를 물려 직접 호출):

   ```
   본 검사 (앵커 5, 문턱 11):
   {"code":"PINCH_OUT_OF_BOUNDS","message":"...","details":{"requestedRatio":1}}
   양성 대조 (앵커 5, 문턱 1):
   {"code":"PINCH_OUT_OF_BOUNDS","message":"...","details":{"requestedRatio":1,"maxValidRatio":0.010648148134350777}}
   ```

   대조가 필드를 내므로 본 검사의 부재는 "필드를 만들 줄 모른다"가 아니라
   "이 문턱에서는 권할 값이 없다"이다. 두 갈래 다 픽스처로 못박았다.

---

## §E.2 (이어서) — M4·M5 회차

### 범위와 기준선

| 항목 | 값 |
|---|---|
| 이번 회차에 한 것 | **M4**(`doubletap` CLI 명령) · **M5**(페이로드 계약 + 오류 코드 노출 배선) |
| 이전 회차 | M1 · M2(+재작업) · M3 |
| 착수하지 않은 것 | **M6(실기기 e2e)** — iPhone 사용 불가, 지시에 따라 시도하지 않음 |
| 개발 방법론 | TDD — RED(실패 확인) → GREEN(구현) 순서로 진행 |
| 커밋 | **없음** — 사용자가 커밋을 요청하지 않았다. `draft → in-progress` 전이도 하지 않았다(그 전이는 M1 커밋에 실린다) |

**기준선(이번 회차 착수 전 직접 실행)**:

```
$ npx vitest run
 Test Files  43 passed (43)
      Tests  920 passed (920)
$ npx tsc --noEmit   → exit=0
```

**이번 회차 후**: **44 파일 943건 전건 통과** — 파일 +1, 건수 +23, **감소 0**.
증가분의 내역: `doubletap.test.ts` 신규 20건 + `command-payloads.test.ts` +2건
(`PinchPayload` · `DoubleTapPayload` 소진 검사) + `backend-failure.test.ts` +1건
(`it.each` 표에 `UnsupportedGestureOnAndroidError` 1행). 20+2+1 = 23.

### 이번 회차에 수정한 파일

| 파일 | 마일스톤 | 성격 |
|---|---|---|
| `src/cli/commands/doubletap.ts` | M4 | **신규** — 명령 핸들러. `tap.ts`의 형태 그대로 |
| `src/cli/commands/doubletap.test.ts` | M4 | **신규** — 20건 |
| `src/cli/router.ts` | M4 | `COMMANDS`에 `doubletap` 등록 |
| `src/schema/command-payloads.ts` | M5 | `DoubleTapPayload` 선언 |
| `src/schema/command-payloads.test.ts` | M5 | `PinchPayload`·`DoubleTapPayload` 키 집합 양방향 소진 검사 |
| `src/cli/commands/types.ts` | M5 | `backendFailure` 통과 목록에 `UnsupportedGestureOnAndroidError` 추가 (넷 → 다섯) |
| `src/cli/commands/backend-failure.test.ts` | M5 | 매핑 표에 1행 |

`src/cli/args.ts`는 **손대지 않았다**(plan.md §F M4 — `--from`/`--stale-ok`는 이미 선언돼 있다).

### RED이 실제로 먼저 실패했다

**M4 RED** — `doubletap.test.ts`를 넣고 구현 전에 실행:

```
 Test Files  1 failed (1)
      Tests  19 failed | 1 passed (20)
```

살아남은 1건은 ``명령 이름은 한 단어 `doubletap`이다 — `double-tap`은 알려진 명령이
아니다``로, 구현 전후 모두 참인 단언이다(그 이름은 영영 없어야 한다).

**엉뚱한 이유로 통과한 RED 1건을 잡아 고쳤다.** 첫 실행에서는 2건이 통과했고,
둘째는 「문턱도 조회하지 않는다」였다 — 명령이 존재하지 않아 아무것도 호출되지
않는 상태에서 `getMinEffectiveSwipeThreshold` **0회**가 그대로 통과한 것이다.
이전 회차가 `ok:false`만 단언해 `UNKNOWN_COMMAND`로 통과한 것과 **같은 계열**이며,
0을 부재의 증거로 쓰기 전에 명령이 실제로 실행됐음을 세우라는 acceptance.md 원칙 3의
사례다. `expect(result.ok).toBe(true)` + `doubleTap` **1회**를 앞에 세워 RED를
19실패/1통과로 만든 뒤 진행했다.

**M4 GREEN 후**: `18 passed | 2 failed` — 남은 2건이 정확히 M5의 배선(오류 코드 노출)이었다.

**M5 RED** — `backendFailure`:

```
 AssertionError: expected 'BACKEND_COMMAND_FAILED' to be 'UNSUPPORTED_GESTURE_ON_ANDROID'
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

### M5의 소진 검사는 vitest가 아니라 tsc가 판정한다 (이번 회차에 확인한 사실)

`command-payloads.test.ts`에 두 소진 검사를 넣고 **`DoubleTapPayload`가 아직 없는
상태로** vitest를 돌렸더니 **12건 전건 통과**했다. 이유는 단순하다 — `import type`과
`Record<keyof T, true>`는 **타입 표기**이므로 vitest(esbuild)가 지워 버리고, 런타임에
남는 것은 `Object.keys({...}).toHaveLength(3)`뿐이다. 그 단언은 타입이 어떻게 바뀌든
절대 실패하지 않는다.

**실제 오라클은 `npx tsc --noEmit`이다.** 같은 상태에서:

```
src/schema/command-payloads.test.ts(6,3): error TS2305:
  Module '"./command-payloads.js"' has no exported member 'DoubleTapPayload'.
```

**양성 대조를 양방향으로 세웠다**(원칙 3 — 0을 믿기 전에 검사기가 살아 있음을 확인).
GREEN 이후 일부러 두 방향으로 깨뜨려 보고 되돌렸다:

```
(1) 타입에 필드를 늘렸을 때 — 리터럴이 누락되어 컴파일 에러여야 한다
src/schema/command-payloads.test.ts(122,11): error TS2741:
  Property 'probeField' is missing in type '{ serial: true; x: true; y: true; }'
  but required in type 'Record<keyof DoubleTapPayload, true>'.
src/cli/commands/doubletap.ts(70,49): error TS2741:
  Property 'probeField' is missing in type '{ serial: string; x: number; y: number; }'
  but required in type 'DoubleTapPayload'.

(2) 리터럴에서 키를 지웠을 때 — 컴파일 에러여야 한다
src/schema/command-payloads.test.ts(106,11): error TS2741:
  Property 'direction' is missing in type '{ serial: true; fingers: true; }'
  but required in type 'Record<keyof PinchPayload, true>'.

복원 후: npx tsc --noEmit → exit=0
```

(1)이 **두 지점**을 잡은 것이 중요하다 — 소진 검사(2겹)뿐 아니라 핸들러의
`success<DoubleTapPayload>` 명시(1겹)도 함께 물었다. AC-GEST2-013이 요구하는 두 겹이
둘 다 실제로 서 있다는 증거다.

### AC 매트릭스 — 이번 회차 사정거리 안

| AC | 상태 | 검증 명령 | 실제 출력 |
|---|---|---|---|
| AC-GEST2-007 (잘못된 입력) | **PASS**(`doubletap` 갈래) | `npx vitest run src/cli/commands/doubletap.test.ts` | 좌표 4갈래 → `INVALID_COORDINATES` 무제스처 · 음수 리터럴 → `INVALID_ARGS` · 양성 대조 1회 |
| AC-GEST2-008 (Android 거부) | **부분 PASS — mock 절 전부 닫힘, 실기기 절만 PARTIAL** | 위 명령 + `npx vitest run src/cli/commands/backend-failure.test.ts` | `UNSUPPORTED_GESTURE_ON_ANDROID`가 `doubletap`·`pinch` 양쪽에서 그대로 노출 · 양성 대조(타입 없는 실패는 여전히 `BACKEND_COMMAND_FAILED`) |
| AC-GEST2-009 (`--from` 변환·신선도) | **PASS** | `grep -rl "resolveCoordinateMapper" src/cli/commands/ \| grep -v "\.test\.ts" \| grep -v "from-capture.ts"` | **구현 전 4개 → 구현 후 5개**(tap/scroll/pinch/**doubletap**/swipe). AC 기대값과 일치 |
| AC-GEST2-013 (JSON 봉투 + 키 집합) | **PASS** | `npx tsc --noEmit` (+ 위 양성 대조) | `exit=0`. 두 타입 모두 소진 검사가 서 있고, 양방향으로 깨져 봄 |
| AC-GEST2-014 (화면 크기 불명) | **PASS**(`doubletap` 갈래) | `npx vitest run src/cli/commands/doubletap.test.ts` | 화면 크기 불명 mock에서도 성공 · `getScreenSize` **0회** · `getMinEffectiveSwipeThreshold` **0회**(각각 양성 대조 동반) |
| AC-GEST2-010 (회귀 없음) | **PASS** | `npx vitest run` · `npx tsc --noEmit` | `44 passed (44)` / `943 passed (943)` · `exit=0`. 트립와이어 `12` 유지 |
| AC-GEST2-003 · 004 | **PASS 유지** | `grep -rnE '^(export )?const [A-Z][A-Z0-9_]*_MS = [0-9]+;' src/backend/ ... \| wc -l` · `grep -c "DOUBLE_TAP_GAP_MS" src/backend/wda-backend.ts` | `9` · `2` — 이번 회차가 봉투 계층을 건드리지 않았다 |
| AC-GEST2-016 (의존성·계층) | **PASS** | 본 검사 + 양성 대조 | `dependencies` **0** / 대조 `devDependencies` **1** |
| AC-GEST2-011 · 012 | **PARTIAL(미착수)** | — | 실기기 없음. **이 PARTIAL이 `implemented → completed` 전이를 막는다** |
| AC-GEST2-015 (문서 고지) | **미충족(sync 위임)** | `grep -rn "pinch\|doubletap" README.md .claude/skills/explore-mobile/SKILL.md` | **0건** — 두 명령 다 아직 문서에 없다. 아래 「SPEC에 되돌린 물음」 5번 참조 |

### 이 SPEC이 여러 번 고쳐 막으려던 함정 — 지켰는지

- **간격이 짧으면 인식되지 않는다고 단언하는 테스트를 쓰지 않았다.** `doubletap.ts`는
  간격을 알지도 못한다 — 간격은 봉투 계층의 `DOUBLE_TAP_GAP_MS` 하나이며, CLI에는
  `--duration` 계열 플래그를 만들지 않았다. `doubletap.test.ts` 상단에 그 이유를
  적어 두었다(`pointerMove`에서는 반증됐고 `pause`에서는 측정된 적이 없다).
- **캡처 파일 크기를 오라클로 쓰는 테스트를 하나도 두지 않았다**(원칙 4).
- **부재를 주장하는 모든 검사에 양성 대조를 세웠다**(원칙 3): `getScreenSize` 0회 옆에
  성공 + `doubleTap` 1회, 거부 갈래의 0회 옆에 유효 입력 1회, `UNSUPPORTED_GESTURE_ON_ANDROID`
  옆에 "타입 없는 실패는 여전히 가려진다", tsc의 `exit=0` 옆에 양방향 깨뜨리기 2건.
- **`ok:false`만 단언하지 않고 코드까지 단언했다** — 이전 회차가 `UNKNOWN_COMMAND`로
  통과한 계열을 막는다. 위 「RED」의 자기 교정도 같은 규율이다.
- **`ok:true`를 효과의 증거로 쓰지 않았다.** mock은 백엔드에 무엇이 전달됐는지까지만 본다.

### 미검증 / 잔여 위험

- **더블탭으로 인식되는지는 mock이 볼 수 없다**(plan.md §B.7). 위 PASS는 전부
  **좌표와 봉투 형태**의 판정이며, 실제 인식 여부는 M6(AC-GEST2-012)의 몫이다.
  특히 `tap` 2회와의 대조(REQ-GEST2-DTAP-003이 문서에 적을 주장의 근거)는
  이 회차에서 관측되지 않았다.
- **간격 60 ms는 동작이 확인된 값이지 경계값이 아니다**(spec.md §C.1-⑧). 인식 창의
  상·하한은 이분 탐색되지 않았고, 이번 회차도 그것을 재지 않았다.
- **`UNSUPPORTED_GESTURE_ON_ANDROID`가 실기기에서 실제로 `AdbBackend`로 라우팅되는지는
  확인하지 못했다**(AC-GEST2-008 e2e 절). mock은 "그 오류가 던져지면 코드가 그대로
  닿는다"까지만 증명한다.
- **간격 산식(`narrowGap = wideGap / 2`)은 여전히 미검증이다**(spec.md §C.1-⑨).

### SPEC에 되돌린 물음 (구현자가 고치지 않고 보고한 것)

이전 회차의 1·4번은 그대로 열려 있다(이번 지시가 "나중 SPEC 패스로 미룬다"였다).
2·3번은 이번 회차에 닫혔다 — `DoubleTapPayload`와 소진 검사가 M5에서 섰고,
`--from` 오라클이 5를 낸다. 아래는 **이번 회차에 새로 발견한 것**이다.

5. **AC-GEST2-013의 "소진 검사가 통과한다"를 vitest 통과로 읽으면 틀린다.** 위
   「M5의 소진 검사는…」 절에 실행 출력을 남겼다 — 타입이 **존재하지 않는 상태에서도**
   vitest는 12건 전건 통과를 낸다. AC가 오라클로 `npx tsc --noEmit`을 **명시**하지
   않으면, 다음 사람이 초록 테스트를 보고 계약이 서 있다고 읽을 수 있다.
   `Object.keys(keys).toHaveLength(N)` 런타임 단언은 타입 변경에 대해 **아무것도
   판정하지 않는다**(리터럴을 직접 고치지 않는 한). 문구 보강을 제안한다.

6. **문서 표 검사 목록이 손으로 유지되며 두 신규 명령을 빠뜨린다.**
   `src/skill-wrapper.test.ts`의 `commands` 배열이 SKILL.md의 명령 표 행을 검사하는데,
   그 목록은 11개이고 라우터에 등록된 명령은 13개다(세는 명령으로 확인):

   ```
   $ sed -n '/^const COMMANDS/,/^};/p' src/cli/router.ts | grep -cE '^  [a-z]+:'
   13
   $ sed -n '/const commands = \[/,/\];/p' src/skill-wrapper.test.ts | grep -cE '^      "'
   11
   ```

   빠진 둘이 `pinch`·`doubletap`이다. **그 테스트의 주석이 스스로 이 결함을 기록하고
   있다** — "나중에 추가된 `swipe`/`scroll`은 빠져 있었다. 그 결과 … 문서가 **엉뚱한
   이유로 통과**했다". 같은 형태가 재발했다. AC-GEST2-015는 sync 위임이지만 **SKILL.md
   본문만 고치는 것으로는 이 게이트가 열리지 않는다** — 목록도 함께 늘려야 하며,
   어느 AC도 그 목록을 가리키지 않는다. **이번 회차에 고치지 않았다**: 지금 목록에
   두 이름을 넣으면 SKILL.md에 표 행이 없어 테스트가 빨개지고, 그 문서 작성은
   sync의 소관이기 때문이다(run 단계에서 문서를 고치지 않는다 — plan.md §A.3).

7. **`enumeration.test.ts`의 "기기를 대상으로 하는 모든 명령" 목록도 두 명령을
   빠뜨린다 — 다만 이것은 결함이 아니라 미적용 커버리지다.** `deviceFacingCommands`는
   10개이고 `devices`를 뺀 대상 명령은 12개다. **유추하지 않고 실행으로 확인했다**:
   두 항목을 임시로 넣고 돌리니 `17 passed (17)`로 전건 통과했고, 그 뒤 되돌렸다.
   즉 `pinch`·`doubletap`은 AC-VISION-023(열거 정확히 1회)을 **이미 만족한다** —
   빠진 것은 그 사실을 붙잡아 두는 회귀 그물이다. SPEC-VISION-001의 AC이므로
   이 SPEC의 범위 밖이라 판단해 손대지 않았고, 보고만 한다.

---

## §E.2 (이어서) — M6 회차 (실기기 e2e)

### 범위와 기준선

| 항목 | 값 |
|---|---|
| 이번 회차에 한 것 | **M6 1·2·3**(핀치 확대·축소, 더블탭 + `tap` 2회 대조) · 그 과정에서 발견한 **봉투 결함 1건 수정** · M6 5(spec.md §C.1 기록) |
| 이전 회차 | M1~M5 (커밋 `7db5194`) · M6 4번(Android 거부 관측)은 직전 세션 |
| 기기 | iPhone 15 Pro Max / iOS 26.6 (`00008130-001238880C13803A`) |
| 커밋 | **없음** — 사용자가 이번 세션에서 커밋하지 않기로 했다(같은 저장소에 다른 세션의 미추적 파일 4개) |

**기기 전제 확인(직접 실행)**: `doctor --yes --device <UDID>` → `wda.reachable:true` · `controllable:"ok"` · `bringUp.launched:true` · 서명 유효(2026-09-01까지). 재확인한 `devices`에서 `connectionState:"device"`. **응답과 조작 권한을 따로 확인했다.**

**테스트 기준선**: 착수 전 **44파일 943건**, 완료 시 **46파일 971건**. **이 증가분의 대부분은 내 것이 아니다** — 내가 추가한 것은 유지 시간 단언 **1건**이고, 나머지는 같은 저장소에서 **동시 작업 중인 다른 세션**이 만든 파일(`aapt-executor.*`, `build-tools-version.*`)에서 왔다. 감소 0.

### 이번 회차에 수정한 파일

| 파일 | 성격 |
|---|---|
| `src/backend/wda-backend.ts` | `DOUBLE_TAP_HOLD_MS` 신설(REQ-GEST2-DTAP-005) + `doubleTapRaw` 봉투의 각 탭 안에 `pause` 2곳 추가 |
| `src/backend/wda-backend.test.ts` | 봉투 순서 단언 갱신(6항목 → 8항목) · 간격 pause 인덱스 3 → 4 · **유지 시간 단언 1건 신설** |

SPEC 문서 4종(spec/plan/acceptance/progress)도 같은 회차에 갱신했다 — 상수를 늘린 회차에 오라클 기대값을 함께 고쳐, 이 SPEC 계열이 반복해 지워 온 "문서가 코드보다 낡은" 모양을 만들지 않는다.

### 관측 — 판정은 화면으로 했다

**핀치(AC-GEST2-011)** — 네이버 지도, `--amount` 기본값. `pinch out 300 750` → 확대 전 캡처에 **없던 상호 10건**(현대미니수퍼·서울명일동우체국·신한은행·명성교회·제뉴어리케이크·르캉투스·CU·GS25·메가MGC커피·동은아파트)이 읽히고, 두 지점(샛마을공원↔명일동현대아파트) 거리 **127px → 219px**. `pinch in` → 그 10건이 전부 사라지고 거리 **219px → 131px**. **`out`을 보고 `in`을 추론하지 않고 따로 관측했다**(plan.md §F M6 2번). 캡처 바이트 크기는 오라클로 쓰지 않았다.

**더블탭(AC-GEST2-012)** — 수정 후 네이버 지도에서 축척 바 **10 m → 5 m**(2회 재현, 신규 상호 명일OK공인중개사사무소·너비집·주원빌딩·청자다방·오현테크), Apple 지도에서 두 지점(야마타이↔월드글로리아센터) 거리 **109px → 247px**.

**대조(`tap` 2회)** — 같은 좌표·같은 축척에서 네이버 지도는 지명 세트와 거리(112px) 불변, Apple 지도는 화면 완전 동일. 두 경우 모두 같은 좌표의 `doubletap`은 확대했으므로 대조가 성립한다.

### 내가 세운 가설이 반증됐다 — 기록해 둔다

수정 전 네이버 지도에서 **7회 연속 실패**하는 동안(좌표 5곳 · 축척 2종 · UI 표시/숨김 · 상세패널 열림), 나는 *"네이버 지도가 더블탭 확대를 지원하지 않는 것으로 보인다"*고 추정하고 AC-GEST2-012를 "Apple 지도 관측으로 PASS"라고 적으려 했다. **그 추정은 관측이 아니라 소거법이었다** — 앱 내부를 본 적이 없고, 그 화면이 손으로 더블탭될 때 어떻게 되는지 확인한 적도 없었다.

**사용자가 "내가 직접 해보면 동작한다"고 반증했고, 그 한 문장이 조사를 봉투 쪽으로 돌렸다.**

되짚어 보면 실패 구간의 신호 하나가 이미 답을 가리키고 있었다: 같은 좌표에서 `tap` 2회는 UI 오버레이를 **짝수 번** 토글했고(두 탭이 각각 인식됨) `doubletap`은 **홀수 번** 토글했다(한 번만 소비됨). 두 번째 탭이 개별 탭으로 앱에 도달하지 않았다는 뜻이며, 이것은 **앱의 더블탭 지원 여부와 무관한 전달 계층의 사실**이었다. 나는 그 신호를 기록해 두고도 앱 가설을 먼저 세웠다.

### 통제 실험 — 한 축만 바꿨다

| 간격 | 유지 시간 | Apple 지도 | 네이버 지도 |
|---|---|---|---|
| 60 ms | 0 ms | 확대 | **실패 7회** |
| 120 ms | 0 ms | — | **실패 2회** |
| 60 ms | **60 ms** | 확대(회귀 없음) | **확대 2회** |

간격을 원래 값 60 ms로 **되돌린 채** 유지 시간만 넣었다. 두 축을 같이 바꿨다면 "둘을 같이 바꾸니 됐다"에 머물렀을 것이고 그것은 실측이 되지 못한다.

### AC 매트릭스 — 이번 회차 사정거리 안

| AC | 상태 | 검증 명령 | 실제 출력 |
|---|---|---|---|
| AC-GEST2-011 (실기기 핀치) | **PASS** — PARTIAL 해소 | 실기기 관측 (네이버 지도) | `out` 신규 상호 10건 · 거리 127→219px / `in` 그 10건 소멸 · 거리 219→131px |
| AC-GEST2-012 (실기기 더블탭 + 대조) | **PASS** — PARTIAL 해소 | 실기기 관측 (네이버 지도 · Apple 지도) | 더블탭: 축척 10m→5m(2회) · Apple 109→247px / `tap` 2회: 지명·거리 불변 |
| AC-GEST2-003 · 004 | **PASS(오라클 기대값 갱신)** | `grep -rnE '^(export )?const [A-Z][A-Z0-9_]*_MS = [0-9]+;' src/backend/ ... \| wc -l` | **10** — 0.4.0까지 기대값은 9였고 상수 신설로 10이 됐다. acceptance.md의 그 줄도 같은 회차에 고쳤다 |
| AC-GEST2-004 (유지 시간 절, 0.5.0 신설) | **PASS** | `grep -rnE '^(export )?const DOUBLE_TAP_HOLD_MS = [0-9]+;' ...` · `grep -c "DOUBLE_TAP_HOLD_MS" src/backend/wda-backend.ts` · 두 상수 개수 | 선언 **1** · 사용 **3** · 두 상수 **2** (전부 실행 확인) |
| AC-GEST2-010 (회귀 없음) | **PASS** | `npx vitest run` · `npx tsc --noEmit` · `npm run build` | `exit=0` / `971 passed` · `exit=0` · `exit=0`. **Apple 지도 더블탭이 수정 후에도 동작함을 실기기로 확인**(mock이 못 보는 회귀) |
| AC-GEST2-008 (Android 거부) | **PASS 유지** | 직전 세션 관측 | 이번 회차에 재확인하지 않았다 — Android 기기가 `unauthorized` 상태였고, 이 회차의 변경은 iOS 봉투에만 닿는다 |
| AC-GEST2-015 (문서 고지) | **미충족(sync 위임)** | — | README.md · SKILL.md에 두 명령이 아직 없다. **`completed` 전이는 sync 뒤다** |

### 미검증 / 잔여 위험

1. **인식되는 유지 시간의 하한.** 실측은 "0 ms는 네이버 지도에서 인식되지 않는다"와 "60 ms는 인식된다"까지다. 그 사이는 이분 탐색하지 않았다(spec.md §C.1-⑧).
2. **네이버 지도가 0 ms 터치를 무시하는 기전.** 앱 내부를 관측하지 않았다. 두 앱의 제스처 인식기가 다르다는 것까지가 관측이 말할 수 있는 전부다.
3. **확인한 앱은 둘뿐이다.** Apple 지도와 네이버 지도. 다른 앱에서 60 ms 유지가 충분하다는 근거는 없다.
4. **`tap` 2회 뒤 지도가 26~30px 평행이동하는 현상**(spec.md §C.1-⑲). 확대가 아니므로 판정에 영향은 없으나 원인을 규명하지 않았다.
5. **핀치는 한 앱(네이버 지도)에서만 관측했다.** 더블탭이 앱에 따라 갈렸다는 사실이 나온 이상, 핀치도 앱 의존성이 있을 수 있다 — 확인하지 않았다.
6. **동시 작업 중인 다른 세션.** `aapt-executor.*` · `build-tools-version.*`가 미추적 상태로 있고 테스트 수가 회차 중에도 계속 늘었다(943 → 959 → 971). 이 회차의 `971 passed`는 **내 변경만의 수가 아니다.**

### 이 SPEC이 여러 번 고쳐 막으려던 함정 — 지켰는지

- **`ok:true`를 판정 근거로 쓰지 않았다.** 모든 판정은 캡처를 눈으로 보고 했고, 지명·축척 바·두 지점 거리로 적었다.
- **캡처 바이트 크기를 오라클로 쓰지 않았다**(§C.1-⑬). 실제로 이번 회차에도 서로 다른 화면이 비슷한 바이트로 나오는 것을 여러 번 봤다.
- **한 방향을 보고 반대 방향을 추론하지 않았다.** `out`/`in`을 따로 관측했다.
- **미검증을 PASS로 적지 않았다.** 위 「가설이 반증됐다」 절이 그 직전까지 갔던 기록이다.
- **없는 sha를 지어내지 않았다.** 커밋하지 않았으므로 `§E.3` 신호를 달지 않는다.
- **문서를 코드보다 낡게 두지 않았다.** 상수를 늘린 그 회차에 AC-GEST2-003의 오라클 기대값(9 → 10)을 함께 고쳤다.

### 절차상 실수 하나 — 기록해 둔다

기기 조작을 셸 `for` 루프로 묶어 3개 좌표를 시도했는데, **zsh는 변수를 단어로 쪼개지 않아** `set -- $c`가 좌표 3개를 한 인자로 넘겼고 **세 시도가 모두 실행되지 않았다.** 루프는 `done`을 3번 출력했으므로 겉으로는 성공처럼 보였다. 파일명이 같은 이름으로 3번 덮어써진 것을 보고 알아챘다. 기기에 잘못된 조작이 가지는 않았다(`INVALID_ARGS`로 거부). **"도구가 출력을 냈다"가 "일이 일어났다"의 증거가 아니다** — 좌표를 직접 써서 다시 실행했다.
