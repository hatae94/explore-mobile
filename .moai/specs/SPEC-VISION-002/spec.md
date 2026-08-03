---
id: SPEC-VISION-002
title: "WDA_RESPONSE_LOST 안내 문구 정정 — 읽기 호출에서 두 문장이 모두 거짓이다"
version: "0.1.0"
status: draft
created: 2026-08-03
updated: 2026-08-03
author: hatae
priority: P2
phase: "v0.5.1 target"
module: "src/backend/wda-client.ts"
lifecycle: spec-anchored
tags: "ios, wda, error-message, idempotent, retry, defect"
tier: S
depends_on: [SPEC-VISION-001]
---

# SPEC-VISION-002 — `WDA_RESPONSE_LOST` 안내 문구 정정

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-03 | hatae | 최초 작성. `SPEC-VISION-001` M6이 「결함 ③」으로 기록한 항목의 **후속**이되, **진단을 정정한 상태로** 등록한다. M6은 오류 메시지 문구에서 "읽기/조작을 구분하지 않는 일괄 정책"을 역추론했으나, sync-phase 코드 대조에서 **정책은 이미 구분함이 확인**됐다(`SPEC-VISION-001/progress.md` §E.4 「결함 ③ 진단 정정」). 실제 결함은 정책이 아니라 **안내 문구**다. |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 동작은 옳고 안내가 틀렸다

`wda-client.ts`의 재시도 정책은 **이미 읽기와 조작을 구분한다** (코드 확인,
2026-08-03):

```ts
// wda-client.ts:207-208
const idempotent = options?.idempotent ?? false;
const attempts   = idempotent ? 3 : 1;      // 읽기 3회, 조작 1회
```

멱등 플래그를 넘기는 호출부도 실재한다:

```
wda-backend.ts:112   GET /screenshot     { idempotent: true }
wda-backend.ts:321   GET /window/size    { idempotent: true }
wda-client.ts:272    GET /status         { idempotent: true }
wda-doctor.ts:104    GET /status         { idempotent: true }
```

문제는 실패했을 때 나가는 문구다. `WdaResponseLostError`의 메시지가 **조작
기준으로 하드코딩**돼 있어(`wda-client.ts:239-243`), 멱등 여부와 무관하게 같은
문장이 나간다:

> "조작이 적용됐을 수 있으니 스크린샷으로 확인하세요 — 자동 재시도는 두 번
> 적용될 위험이 있어 수행하지 않았습니다."

| 문구 | 읽기 호출(`GET /screenshot`)에서 |
|---|---|
| "조작이 적용됐을 수 있으니…" | **거짓** — 적용될 조작이 없다 |
| "자동 재시도는 … 수행하지 않았습니다" | **거짓** — 이미 3회 재시도했다 |

**왜 문제인가**: 이 CLI는 에이전트가 읽는 것을 전제로 만들어졌다. 오류 메시지는
장식이 아니라 **다음 행동을 정하는 입력**이다. 읽기 실패에 "조작이 적용됐을 수
있다"가 붙으면 호출자는 하지도 않은 조작의 부작용을 확인하러 가고, "재시도하지
않았다"가 붙으면 이미 3회 실패한 경로를 또 시도한다.

`src/cli/commands/types.ts:52`의 코드 설명(`WDA_RESPONSE_LOST → 적용됐을 수 있다,
스크린샷으로 확인하라`)도 같은 전제를 반복한다.

### A.2 목표 — 문구가 실제로 일어난 일을 말한다

`WdaResponseLostError`가 **그 호출이 멱등이었는지, 재시도를 몇 번 했는지**를 알고
그에 맞는 문장을 낸다.

### A.3 비목표 (Non-Goals)

- **재시도 정책 변경** — 현행 `idempotent ? 3 : 1`은 M3 실측(조작 응답 유실 4/4에
  효과는 적용됨)에 근거한 옳은 설계다. 건드리지 않는다
- **재시도 횟수·간격 튜닝** — §C.2의 미확인 질문이며, 계측 없이 바꾸지 않는다
- 새 오류 코드 신설 — `WDA_RESPONSE_LOST` 하나를 유지한다

### A.4 Out of Scope

#### A.4.1 Out of Scope — 명시적 제외

- **`WDA_UNREACHABLE` 문구** — 별개 경로이며 현재 문구는 정확하다
  (`SPEC-VISION-001` AC-VISION-015가 실기기에서 복구 절차 포함을 확인)
- **`WdaCommandFailedError`** — WDA가 정상 전달한 4xx이며 이 결함과 무관하다
- **Android 경로 오류 문구** — `adb` 계열은 다른 실패 모델이다
- **`src/webview/`** — SPEC-WEBVIEW-001 소유

---

## §B. 요구사항 (GEARS)

### REQ-WDAERR-001 — 문구가 멱등 여부를 반영한다

**Where** `WdaResponseLostError`를 던질 때, **the system shall** 그 호출이
멱등이었는지에 따라 다른 문장을 낸다. 멱등 호출에서는 "조작이 적용됐을 수
있다"는 경고를 내지 않는다.

### REQ-WDAERR-002 — 실제 재시도 횟수를 말한다

**Where** 재시도가 수행된 뒤 실패했을 때, **the system shall** "재시도를 수행하지
않았다"고 말하지 않는다. 수행한 횟수를 밝히거나, 최소한 수행하지 않았다는 거짓
진술을 하지 않는다.

### REQ-WDAERR-003 — 조작 호출의 기존 문구를 보존한다

**Where** 비멱등(조작) 호출이 실패했을 때, **the system shall** 현행 문구를 그대로
낸다. M3 실측이 확인한 "응답은 유실됐으나 효과는 적용됨" 상황에서 이 경고는
정확하며, 이를 약화시키는 것은 회귀다.

### REQ-WDAERR-004 — 오류 코드는 바뀌지 않는다

**Where** 응답 유실이 발생할 때, **the system shall** 기존과 동일하게
`code: "WDA_RESPONSE_LOST"`를 노출한다. 호출자의 분기 로직에 회귀를 만들지 않는다.

---

## §C. 인수 기준 (Tier S — 인라인)

**판정 수단 등급**: **G**(grep/정적) · **U**(단위 테스트) · **D**(실기기).

이 SPEC은 **문구 생성 로직**이 대상이므로 U가 유효한 판정 수단이다 — 외부
프로세스의 실제 동작이 아니라 우리 코드의 분기가 판정 대상이기 때문이다.
다만 AC-WDAERR-005는 실제 유실 상황의 문구를 보는 것이므로 D다.

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WDAERR-001** | 멱등 호출 실패 시 메시지에 "조작이 적용" 취지의 문구가 **없다** | **U** 멱등 true로 유실 상황 주입 |
| **AC-WDAERR-002** | 멱등 호출 실패 시 메시지가 "재시도를 수행하지 않았다"고 **말하지 않는다** | **U** 같은 주입 |
| **AC-WDAERR-003** | 비멱등 호출 실패 시 **기존 문구가 그대로** 나온다 | **U** 현행 문구를 고정하는 픽스처 |
| **AC-WDAERR-004** | 두 경우 모두 `code === "WDA_RESPONSE_LOST"` | **U** |
| **AC-WDAERR-005** | 실기기에서 실제 응답 유실을 만나면 그 문구가 상황과 일치한다 | **D**. **유발 불가 시 명시적 미검증으로 닫는다** — M6에서 유실은 재현됐으나 의도적 유발 절차는 없다 |
| **AC-WDAERR-006** | `src/cli/commands/types.ts`의 코드 설명 주석이 정정된 문구와 일치한다 | **G** grep |
| **AC-WDAERR-007** | 재시도 정책(`idempotent ? 3 : 1`)이 **변경되지 않았다** | **G** `git diff`에 해당 라인 변경 0건 |
| **AC-WDAERR-008** | `pnpm test` / `typecheck` / `build` 전부 통과 | **G/U** exit 0 |

**AC-WDAERR-007은 회귀 방지 장치다.** 이 SPEC의 가장 큰 위험은 "문구를 고치다가
정책까지 건드리는 것"이다 — M6의 원래 진단이 정책 변경을 지시했기 때문에 그
방향으로 끌려가기 쉽다.

### C.2 미확인 질문 (이 SPEC에서 닫지 않는다)

M6 실측에서 **3회 재시도가 전부 실패한 뒤 수동 재호출은 즉시 성공**했다. 재시도
간격(`PROBE_INTERVAL_MS = 1000` × 3회)이 WDA 회복 시간보다 짧았을 가능성이
있으나, **계측하지 않았으므로 추론이다.** 근거 없이 상수를 바꾸는 것은
`SPEC-VISION-001`이 `Override size:`에서 피했던 것과 같은 실수다 — 관측 없이
추론으로 코드를 정하지 않는다. 계측이 필요하면 별도 SPEC으로 연다.

---

## §D. 제약

- **`wda-client.ts:207-208`의 재시도 분기를 수정하지 않는다** (AC-WDAERR-007).
- 기존 오류 클래스 계층(`wda-errors.ts`)의 공개 형태를 바꾸지 않는다 —
  `code` 프로퍼티가 `types.ts`의 `backendFailure` 경로에 물려 있다.
- 조작 호출 문구를 고정하는 테스트를 **먼저** 쓴다 — 그것이 REQ-WDAERR-003의
  회귀 방지선이다.
- TDD: 멱등 실패 픽스처로 RED 확인 후 수정.

---

## §E. 성공 기준 요약

읽기 호출이 응답 유실로 실패했을 때, 메시지가 **실제로 일어난 일**(적용될 조작이
없었고, 재시도는 수행됐다)을 말한다. 조작 호출 문구와 재시도 정책은 그대로다.
