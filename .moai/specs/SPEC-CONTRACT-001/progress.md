# SPEC-CONTRACT-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-03
tier: M
artifacts: spec.md, plan.md
base_commit_sha: c16c67f
tests(before): 25 files / 540 passed | 2 expected fail
```

---

## §E.2 Run-phase Evidence

### M1 — 장치 달기

`src/schema/command-payloads.ts` 신설 — 명령 10개의 페이로드 타입. 전부 기존
타입의 조합이며 필드 형태를 다시 정의하지 않았다(같은 것을 두 곳에 적으면 두
곳이 어긋난다). `devices`는 이미 `DeviceInfo[]`로 보호돼 있어 제외했다.

각 핸들러의 `success()` 호출에 타입 인자를 명시했다. **첫 `typecheck`가 오류
0건**이었다 — 타입을 상상해서 쓴 것이 아니라 착수 전 기록한 실제 출력
(§E.1 기준선)을 보고 썼다는 뜻이다.

`command-payloads.test.ts` 신설 — 타입별 `Record<keyof T, true>` 양방향 소진
검사 10건.

### M2 — 장치가 실제로 작동하는가 (핵심)

**통과했다고 적는 것으로는 부족하다.** 세 번 일부러 깨뜨렸다.

#### 실험 1 — 핸들러에서 필드 삭제 (AC-CONTRACT-004)

```
$ (tap.ts에서 y 제거) && pnpm typecheck
src/cli/commands/tap.ts(52,37): error TS2741: Property 'y' is missing in type
  '{ serial: string; x: number; }' but required in type 'TapPayload'.
```

#### 실험 2 — 타입에서 필드 삭제 (AC-CONTRACT-005)

```
$ (WdaEnvironmentReport에서 wda 제거) && pnpm typecheck
src/cli/commands/doctor.ts(75,36): error TS2353: ... 'wda' does not exist in
  type 'WdaEnvironmentReport'.
src/schema/command-payloads.test.ts(123,79): error TS2353: ... 'wda' does not
  exist in type 'Record<"devicectl", true>'.
```

두 곳에서 동시에 걸렸다 — 핸들러와 계약 테스트 양쪽.

#### 실험 3 — 사고 재현: 타입과 핸들러를 **함께** 수정

`SPEC-WEBVIEW-002`에서 실제로 일어난 일이다. 그때는 아무것도 깨지지 않았다.

```
$ (타입에서 wda 제거 + doctor.ts에서도 함께 제거) && pnpm typecheck
src/schema/command-payloads.test.ts(123,79): error TS2353: ... 'wda' does not
  exist in type 'Record<"devicectl", true>'.        ← 계약 테스트가 잡았다

$ npx vitest run src/schema/command-payloads.test.ts
Tests  10 passed (10)                                ← 그런데 테스트는 통과했다
```

**여기서 설계의 구멍이 드러났다.** vitest는 타입을 지우고 실행하므로, 타입 수준
계약은 `pnpm typecheck`를 돌려야만 작동한다. `pnpm test`만 돌리면 걸리지 않는다.

### M1-b — 런타임 보호 추가 (구멍 메우기)

계획의 REQ-CONTRACT-004(=`doctor` 갈래별 실제 키 집합 테스트)가 그 구멍을
메우는 장치였다. `router.test.ts`에 3건을 추가했다 — **실제로 나온 JSON의 키
집합**을 세므로 타입과 무관하게 작동한다.

| 갈래 | 고정한 키 집합 |
|---|---|
| adb 미설치 | `adb` `adbKeyboard` `daemon` `devices` `installAttempt` |
| 데몬 비정상 | `adb` `adbKeyboard` `daemon` `devices` |
| iOS 대상 | 위 4개 + `wdaEnvironment`, 그 안은 `devicectl` `wda` |

iOS 갈래 테스트는 처음에 **5초 타임아웃**으로 실패했다 — 가짜 `WdaDoctor`를
주입하지 않아 실제 WebDriverAgent로 HTTP 요청을 보내려 했다. `wda-doctor.test.ts`가
쓰는 방식대로 HTTP 클라이언트와 프로세스 실행기를 주입해 해결했다.

### 도중에 드러난 별건 — 스킬 준수 테스트가 깨져 있었다

전체 테스트를 돌리자 `skill-wrapper.test.ts`가 실패했다. **이 SPEC과 무관하며,
`c16c67f`(스킬 파일 재작성)에서 내가 깨뜨린 것이다** — 그 커밋 전에 전체
테스트를 돌리지 않고 푸시했다.

별도 커밋 `25f60ea`로 분리해 고쳤다. 판정 두 가지가 낡아 있었다:
`adb`라는 **단어**를 금지해 산문 언급까지 잡던 것, 그리고 문서화 요구 목록에
제거된 `dump`가 남고 `swipe`/`scroll`이 빠져 있던 것. 자세한 내용은 그 커밋에
적었다.

### AC 판정

| AC | 등급 | 판정 |
|---|---|---|
| AC-CONTRACT-001 (페이로드 타입 10개) | G | **PASS** |
| AC-CONTRACT-002 (타입 인자 명시) | G | **PASS** — 타입 인자 없는 `success(` 0건 |
| AC-CONTRACT-003 (키 집합 계약 테스트) | U | **PASS** — 10건 |
| AC-CONTRACT-004 (핸들러 삭제 → 컴파일 실패) | **T** | **PASS** — 실험 1, 오류 메시지 기록 |
| AC-CONTRACT-005 (타입 삭제 → 테스트 실패) | U | **PASS (조건부)** — 실험 2·3. **`pnpm typecheck`에서만 작동**한다. Gaps 1 |
| AC-CONTRACT-006 (`doctor` 갈래별 실제 키 집합) | U | **PASS** — 3건, 런타임 판정 |
| AC-CONTRACT-007 (출력 형태 불변) | **D** | **PASS** — 아래 |
| AC-CONTRACT-008 (게이트) | U/G | **PASS** — 아래 |

#### AC-CONTRACT-007 — 착수 전후 키 집합 대조 (실기기)

```
                     착수 전                                   착수 후
devices              []serial,model,osVersion,connectionState,isEmulator,platform   (동일)
doctor(android)      adb,daemon,devices,adbKeyboard                                 (동일)
doctor(ios)          adb,daemon,devices,adbKeyboard,wdaEnvironment                  (동일)
  wdaEnvironment     devicectl,wda                                                  (동일)
screenshot(--out)    serial,savedTo,byteLength                                      (동일)
scroll               serial,direction,from,to                                       (동일)
key                  serial,key                                                     (동일)
```

**한 글자도 다르지 않다.** 형태를 고정하는 작업이었지 바꾸는 작업이 아니었다.

#### 게이트

```
$ pnpm typecheck   → exit 0
$ pnpm test        → 26 files / 554 passed | 2 expected fail   (540 → 554, 순증 14)
$ pnpm build       → exit 0
```

### 미검증 (Gaps)

1. **타입 수준 계약은 `pnpm test`만으로는 작동하지 않는다.** vitest가 타입을
   지우고 실행하기 때문이며, 실험 3이 이를 실증했다. `pnpm typecheck`를 함께
   돌려야 한다. 런타임 보호(`doctor` 갈래 3건)가 이 구멍을 부분적으로만
   메운다 — `doctor` 외 명령에는 런타임 키 집합 테스트가 없다.
   **세 가지를 한 번에 돌리는 명령(`pnpm check` 같은)이 없다는 점도 그대로다.**
2. **`doctor` 외 명령의 런타임 키 집합은 고정하지 않았다.** 타입 수준만
   걸려 있다. `doctor`를 먼저 한 이유는 갈래가 5개이고 실제 사고가 거기서
   났기 때문이다.
3. **`error.details`는 계약 밖이다.** 명령마다 자유 형식이며 이 SPEC의
   비목표로 명시했다(spec.md §A.5).
4. **기준선을 재면서 `tap 100 100`을 실행했다.** 그 좌표에 무엇이 있는지
   확인하지 않고 눌렀다 — 「측정용 조작도 실제 조작이다」를 내가 어긴 것이다.
   화면 변화는 확인하지 않았다.

---

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-03
milestones: M1 (장치) · M1-b (런타임 보호) · M2 (깨뜨리기 확인)
run_commit_sha: 3c92fa3
gates: pnpm test 26 files / 554 passed | 2 expected fail
       pnpm typecheck exit 0 · pnpm build exit 0
ac: 8/8 PASS (AC-CONTRACT-005는 조건부 — Gaps 1)
```

---

## §E.4 Sync-phase Audit-Ready Signal

```
sync_status: audit-ready
sync_complete_at: 2026-08-03
sync_commit_sha: 3c92fa3
artifacts_updated: CHANGELOG.md, progress.md
```

---

## §F Phase 4 Mode Selection

```
tier: M
scope: 2 신설 + 12 수정
domains: 1 (출력 계약)
concurrency benefit: LOW — 타입 선언 → 호출부 명시 → typecheck → 테스트 순차 의존
Decision: sub-agent
```

특히 **깨뜨리기 실험은 순차일 수밖에 없다** — 하나를 깨고 확인하고 되돌린 뒤
다음을 깬다. 동시에 깨면 어느 장치가 잡았는지 알 수 없다.
