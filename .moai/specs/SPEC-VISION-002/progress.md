# SPEC-VISION-002 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-03
tier: S
artifacts: spec.md, plan.md
```

### 기준 커밋

```
base_commit_sha: fdbefb2
branch: master
```

### 착수 전 확인된 작업 트리 상태

- 추적 파일 변경 0건 (SPEC-ANDROID-002 M1 커밋 직후)
- 병행 SPEC-ANDROID-002는 `device-list-parser.ts` 소유 — 파일 겹침 없음

---

## §E.2 Run-phase Evidence

### M1 — 문구를 호출 성격에 맞춘다

#### 착수 시 확인: 정책은 이미 옳았고, 기존 테스트가 그것을 고정하고 있었다

이 SPEC은 M6의 오진을 정정한 상태로 시작했다. 착수 시 기존 테스트를 읽어 정정이
다시 확인됐다 — `wda-client.test.ts`에 **이미 두 테스트가 있었다**:

```
"비멱등 요청은 재시도하지 않는다 (조작 1회만 전송)"   → mutating === 1
"멱등 요청은 재시도한다"                              → attempts === 3
```

정책이 읽기/조작을 구분한다는 사실은 코드뿐 아니라 **테스트로도 고정돼 있었다**.
M6이 "구분하지 않는 일괄 정책"이라 적은 것은 순전히 메시지 문구에서 나온 추론이었다.

#### RED (2026-08-03)

계획대로 **조작 문구 고정 테스트를 먼저** 썼다(AC-WDAERR-003). 이것이 회귀
방지선이므로 순서를 바꾸지 않았다.

```
$ npx vitest run src/backend/wda-client.test.ts
  Tests  2 failed | 23 passed (25)

  × 멱등 읽기 호출의 유실 문구에 조작 경고를 붙이지 않는다 (AC-WDAERR-001)
  × 멱등 읽기 호출의 유실 문구가 재시도를 부정하지 않는다 (AC-WDAERR-002)
  ✓ 조작 호출의 유실 경고는 그대로 유지된다 (AC-WDAERR-003)   ← 방지선 먼저 확보
  ✓ 멱등/비멱등 어느 쪽이든 오류 코드는 WDA_RESPONSE_LOST다 (AC-WDAERR-004)
```

의도한 그대로다 — 방지선 2건은 통과하고 실제 결함 2건만 실패했다.

#### GREEN

`wda-client.ts`의 `WdaResponseLostError` 문장 생성만 분기시켰다. 재시도 정책은
건드리지 않았다.

```ts
const guidance = idempotent
  ? `읽기 호출이라 ${attempts}회 재시도했으나 모두 응답이 없었습니다 — 기기 상태를 바꾸지 않는 호출이므로 다시 불러도 안전합니다. `
  : "조작이 적용됐을 수 있으니 스크린샷으로 확인하세요 — 자동 재시도는 두 번 적용될 위험이 있어 수행하지 않았습니다. ";
```

조작 문구는 **한 글자도 바꾸지 않았다** — M3 실측(응답 유실 4/4인데 효과는
적용됨)이 근거인 정확한 문장이기 때문이다.

`src/cli/commands/types.ts`의 코드 설명 주석도 정정했다(AC-WDAERR-006). 기존
서술 `→ 적용됐을 수 있다, 스크린샷으로 확인하라`는 조작 기준 단정이었다.

```
$ npx vitest run src/backend/wda-client.test.ts
  Tests  25 passed (25)
```

#### AC-WDAERR-007의 판정 명령이 헐거웠다 (spec.md 0.2.0 정정)

초안의 판정 명령을 그대로 돌리자 실패로 나왔다:

```
$ git diff src/backend/wda-client.ts | grep -c 'idempotent ? 3 : 1'
1        ← 기대는 0
```

원인을 확인하니 걸린 것은 **내가 새로 쓴 `@MX:REASON` 주석 한 줄**이었다 —
오진 이력을 설명하며 그 문구를 인용했다. 정책 할당문은 무변경이다:

```
$ git diff -U0 src/backend/wda-client.ts \
    | grep -E '^[-+].*(attempts *= *idempotent|idempotent *= *options)'
  (출력 없음 — 정책 할당문 추가·삭제 0건)

$ grep -n 'const idempotent\|const attempts' src/backend/wda-client.ts
  207:    const idempotent = options?.idempotent ?? false;
  208:    const attempts = idempotent ? 3 : 1;
```

**이 SPEC의 주제와 같은 실수를 AC 자신이 저지르고 있었다** — 문자열 존재를
의미 판정으로 쓴 것이다. spec.md 0.2.0에서 판정 명령을 할당문 변경 검사로
교체했다.

#### AC 판정

| AC | 등급 | 판정 |
|---|---|---|
| AC-WDAERR-001 (멱등 실패에 조작 경고 없음) | U | **PASS** |
| AC-WDAERR-002 (재시도를 부정하지 않음) | U | **PASS** — `${attempts}회 재시도` 명시 |
| AC-WDAERR-003 (조작 문구 보존) | U | **PASS** — 문자열 무변경 |
| AC-WDAERR-004 (코드 불변) | U | **PASS** — 양쪽 모두 `WDA_RESPONSE_LOST` |
| AC-WDAERR-005 (실기기 유실 문구) | **D** | **명시적 미검증** — 아래 Gaps 1 |
| AC-WDAERR-006 (`types.ts` 주석 정정) | G | **PASS** |
| AC-WDAERR-007 (정책 무변경) | G | **PASS** — 정정된 판정 명령으로 확인 |
| AC-WDAERR-008 (게이트) | G/U | **PASS** — 아래 |

```
$ pnpm test        → 32 files / 696 passed | 2 expected fail   (692 → 696, 순증 4)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

#### 미검증 (Gaps)

1. **AC-WDAERR-005는 닫지 못했다.** 응답 유실은 의도적으로 유발하는 절차가 없다.
   이번 세션(약 20분) 동안 iOS 기기에 대고 유실을 만나지 못했다. 기회 관측
   대상으로 남긴다 — `SPEC-VISION-001` M4 Gap 3과 같은 성격이다.
2. **재시도 간격이 충분한지는 여전히 모른다.** M6 실측에서 3회 재시도가 전부
   실패한 뒤 수동 재호출은 즉시 성공했다. 간격(1초 × 3회)이 WDA 회복 시간보다
   짧았을 가능성이 있으나 **계측하지 않았다** — spec.md §C.2가 이 SPEC에서 닫지
   않겠다고 명시한 항목이며, 근거 없이 상수를 바꾸지 않았다.
3. **문구 판정은 "금지 문구 부재 + 취지 존재" 수준이다.** 문자열 완전 일치로
   고정하지 않았으므로, 문장을 크게 다시 써도 테스트는 통과할 수 있다. 의도한
   느슨함이다(plan.md §B 위험 3번).

---

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-03
milestones: M1 (완료)
run_commit_sha: pending-backfill-2026-08-03
gates: pnpm test 32 files / 696 passed | 2 expected fail
       pnpm typecheck exit 0 · pnpm build exit 0
ac: 7/8 PASS · 1 명시적 미검증 (AC-WDAERR-005, D 등급)
```

---

## §E.4 Sync-phase Audit-Ready Signal

(sync-phase 완료 시 작성)

---

## §F Phase 4 Mode Selection

```
tier: S
scope: 3 files (wda-client.ts + .test.ts + types.ts 주석)
domains: 1 (iOS WDA 오류 문구)
concurrency benefit: LOW
Decision: sub-agent
```

Mode 1(trivial)은 조작 문구 보존이라는 회귀 위험이 걸려 있어 제외했다.
Mode 4/6은 도메인 1개·파일 3개로 조건에 못 미친다. 기본값 Mode 5로 진행했다.
