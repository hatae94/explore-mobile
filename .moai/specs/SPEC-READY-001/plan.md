---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — 구현 계획"
version: "0.1.0"
status: draft
created: 2026-08-04
updated: 2026-08-04
author: hatae
---

# 구현 계획 — SPEC-READY-001

> **이 계획에 미확정 결정은 없다.** SPEC-IMESTATE-001은 §B.1에 "설계 미확정"을 남긴 채 착수했고, 그 지점에서 3차 감사 MUST-FIX 2건이 나와 결국 기능을 범위에서 제외하는 것으로 끝났다. 같은 실수를 반복하지 않기 위해 값 이름·필드 모양·선택 규칙을 §B에서 전부 확정한다.

---

## §A. 영향 파일

### A.1 변경 대상

| 파일 | 성격 | 마일스톤 |
|---|---|---|
| `src/backend/adb-executor.ts` | `adb` 경로 해석 추가 | M1 |
| `src/backend/doctor.ts` | `adb` 보고 모양 확장(`:92` 부근) | M1 |
| `src/schema/device-backend.ts` | `DeviceConnectionState` 확장 + 기기 항목 필드 추가(`:33`, `:126`) | M2·M3 |
| `src/backend/wda-device-list.ts` | `mapConnectionState` 확장(`:64-66`) | M2 |
| `src/backend/registry.ts` | 목록 병합 지점에서 물리 기기 단위 그룹핑(`:73`) | M3 |
| `.claude/skills/explore-mobile/SKILL.md` | 계약 서술 동기화 | M2·M3 |

### A.2 PRESERVE (이 SPEC이 건드리지 않는다)

| 파일 | 이유 |
|---|---|
| `src/backend/ime-session-store.ts` | SPEC-IMESTATE-001 소관. 이 SPEC은 키 **설계**를 바꾸지 않는다(`spec.md` §D.2) |
| `src/cli/commands/*.ts` | 명령 동작이 아니라 보고만 바꾼다 |
| `src/backend/apk-downloader.ts` | 설치 정책 무변경(`spec.md` §D.2) |

### A.3 확인만 하고 수정하지 않는 파일

`src/cli/device-targeting.ts:69` — `listDevices()`의 소비자다. M3의 그룹핑이 auto-select와 `AMBIGUOUS_DEVICE` 판정에 미치는 영향을 **읽어서 확인**하되, 이 SPEC에서 로직을 바꿀 이유가 생기면 그때 범위를 재검토한다(무단 확장 금지).

---

## §B. 확정된 설계 결정

### B.1 `adb` 경로 해석 (M1)

탐색 순서는 `spec.md` REQ-READY-001의 4단계를 그대로 따른다. 추가 확정:

- **해석은 1회 수행하고 결과를 재사용한다** — 명령마다 파일시스템을 훑지 않는다.
- **넷 다 실패했을 때만** "찾지 못함"이다.
- 탐색은 **존재+실행 가능** 여부로 판정한다. 존재하지만 실행되지 않는 경우는 "찾지 못함"과 구별해 사유에 남긴다(`doctor.ts:102` 주석이 이미 이 구별의 필요성을 적고 있다).

### B.2 `doctor`의 `adb` 보고 모양 (M1)

기존 `{installed, version}`에 두 필드를 **가법으로** 추가한다:

| 필드 | 값 | 의미 |
|---|---|---|
| `installed` | boolean | 실행 가능한 `adb`를 찾았는가 (기존 의미 확장: PATH 밖도 true) |
| `onPath` | boolean | 그것이 `PATH`로 찾아졌는가 |
| `resolvedPath` | string \| null | 찾은 절대 경로. 못 찾았으면 null |

**`installed:true` + `onPath:false`일 때 설치를 권하지 않는다.** 대신 `resolvedPath`와 PATH 추가 방법을 안내한다.

기존 필드를 제거하지 않으므로 `installed`만 보던 소비자는 깨지지 않는다 — 오히려 **오늘 false였던 것이 true가 되어 정상 동작하게 된다.**

### B.3 iOS 가용성 상태값 (M2)

`DeviceConnectionState`에 **`"unavailable"`**을 추가한다: `"device" | "offline" | "unauthorized" | "unavailable"`.

- 의미: **물리적으로는 잡히지만 지금 조작할 수 없다.**
- `tunnelState`가 `"connected"` → `device`(기존 유지). 그 외 값이 **존재하면** → `unavailable`. 항목 자체가 없으면 → `offline`.
- 사유 필드 **`unavailableReason: string | null`**를 기기 항목에 추가한다. `unavailable`이 아닌 상태에서는 `null`.

**왜 `null`을 두고 필드를 항상 싣는가**: SPEC-CONTRACT-001이 키 집합을 계약으로 검사한다. 조건부로 나타나는 키는 그 계약을 불안정하게 만든다. 항상 존재하고 값이 `null`이면 키 집합이 고정된다.

### B.4 물리 기기 단위 식별 (M3)

- **동일성 판정**: `ro.serialno` (실측 근거 `spec.md` §C.1-③).
- **조회 실패 시**: 그 전송은 **합치지 않고 독립 항목으로 남긴다.** 값을 모르면서 합치는 것이 값을 모르는 채 나누는 것보다 위험하다 — 다른 기기를 하나로 접을 수 있다.
- **대표 전송 선택**: 같은 `ro.serialno`를 가진 전송 시리얼을 **사전순 정렬해 첫 번째**를 대표로 삼는다. 이 규칙은 임의적이지만 **결정적**이다 — 요구사항이 요구하는 것은 결정성이지 특정 우선순위가 아니며, 근거 없는 우선순위 규칙(예: "유선 우선")은 만들지 않는다.
- **나머지 전송**: `alternateSerials: string[]`로 항목에 싣는다. 없으면 빈 배열(키 집합 고정 — B.3과 같은 이유).

### B.5 확정하지 않은 것은 없다

위 4개 절이 `spec.md` REQ-READY-001~004의 모든 구현 자유도를 소진한다. REQ-READY-005(문서 동기화)는 설계 결정이 아니라 실행 항목이므로 §F 마일스톤에 배치한다.

---

## §C. 사전 점검 (착수 전 실행)

각 행은 **실행 가능한 명령**이고, 아래 표는 작성 후 전건 실행해 기대와 대조했다(2026-08-04).

**없음-검사를 쓰지 않는다.** 초안의 행 5는 `grep -rn "ANDROID_HOME|platform-tools|resolveAdb" src/`로 "출력 없음"을 기대했으나, 실행해 보니 **6건이 나왔다** — `brew install android-platform-tools` 안내 문구와, 이름만 비슷한 무관한 함수 `resolveAdbBackend`(백엔드 선택용)에 걸렸다. 이 SPEC이 지적하는 결함(무관한 텍스트에 오탐하는 grep)을 계획서가 그대로 재현한 셈이다. **부재를 뒤지는 대신 결함의 직접 증거를 찾는 존재-검사로 교체했다** — 존재-검사는 매치 자체가 증거이므로 양성 대조가 필요 없다.

| # | 항목 | 명령 | 기대 |
|---|---|---|---|
| 0 | **기준 SHA 기록** | `git rev-parse HEAD` | 값을 `progress.md` §E.2에 기록하고 `$BASE`로 사용. **`plan.md`에 적지 않는다** — `manager-develop`은 이 파일 본문을 수정할 수 없다 |
| 1 | 기준선 테스트 | `pnpm test` | exit 0. **개수를 여기 하드코딩하지 않는다** — 실측값을 `progress.md` §E.2에 기록하고 대조한다 |
| 2 | 기준선 타입·빌드 | `pnpm typecheck` · `pnpm build` | 양쪽 exit 0 |
| 3 | 상태 열거형 현재값 | `grep -n "DeviceConnectionState =" src/schema/device-backend.ts` | `"device" \| "offline" \| "unauthorized"` 3값 |
| 4 | iOS 매핑 현재 동작 | `grep -n -A 3 "function mapConnectionState" src/backend/wda-device-list.ts` | `=== "connected" ? "device" : "offline"` |
| 5 | `adb` 경로 해석 부재의 **직접 증거** | `grep -n 'spawnProcess("adb"' src/backend/adb-executor.ts` | `:33` 매치 — 바이너리 이름이 **리터럴로 고정**돼 있다. 같은 파일 11행 주석도 *"this module only fixes the binary name to `adb`"*라고 적고 있다. M1 완료 후 이 줄은 바뀌어 있어야 하므로 전후 대조 지점이기도 하다 |
| 6 | 계약 테스트 위치 | `grep -rln "connectionState" src/ \| grep test` | 갱신 대상 테스트 파일 목록 |
| 7 | 실기기 연결 여부 | `node dist/cli/bin.js devices` | Android 1대 이상이 `device` 상태여야 M4 실측 가능. 없으면 M4는 **미관측으로 기록** |

---

## §D. 제약

- **동의 없는 설치 금지** — `doctor`의 자동 설치 정책은 무변경(`spec.md` §D.2). 이 SPEC은 권유 조건만 좁힌다.
- **`--no-verify` 금지**, `--amend` 금지, main 강제 푸시 금지.
- **PRESERVE 목록(§A.2) 무수정.**
- **기존 상태값의 의미를 바꾸지 않는다** — `device` · `offline` · `unauthorized`의 뜻은 그대로다. `unavailable`은 지금까지 `offline`으로 접혔던 부분집합만 가져간다.
- **런타임 관리 파일 무수정** — `.moai/state/*`, `.moai/cache/*`. 커밋 시 디렉터리 통째 `git add` 금지(2026-08-04 실측: 하위 `.moai/state/`가 루트 `.gitignore`를 빠져나가 추적된 사고가 있었다).

---

## §E. 자체 검증 (Self-Verification)

각 마일스톤 종료 시 실행하고 **출력을 근거로** 보고한다. "통과했을 것"은 보고가 아니다.

```bash
pnpm test          # exit 0 (개수는 progress.md §E.2 기준선과 대조)
pnpm typecheck     # exit 0
pnpm build         # exit 0
```

이 SPEC 고유의 검증:

```bash
# 호출자 무수정 (PRESERVE — $BASE는 progress.md §E.2 기록값)
# ① 양성 대조 — 이 SPEC이 반드시 수정하는 파일이 감지되는가 (기대: 출력 있음)
git diff --name-only "$BASE" -- src/schema/device-backend.ts
# ② 본 검사 (기대: 출력 없음)
git diff --name-only "$BASE" -- \
  src/backend/ime-session-store.ts src/backend/apk-downloader.ts
# ③ 커밋 이력 — 원상 복구된 변경까지 잡는다 (기대: 출력 없음)
git log --oneline "$BASE"..HEAD -- \
  src/backend/ime-session-store.ts src/backend/apk-downloader.ts

# 상태 열거형이 실제로 확장됐는가 (기대: unavailable 포함 4값)
grep -n "DeviceConnectionState =" src/schema/device-backend.ts

# 키 집합 고정 확인 — 조건부 키가 생기지 않았는가
pnpm vitest run -t "connectionState"
```

**문서 동기화는 grep으로 확인하지 않는다.** `SKILL.md`의 서술이 코드와 맞는지는 문자열 존재가 아니라 **의미 일치**의 문제이므로, M5에서 해당 절을 코드와 나란히 놓고 **읽어서 확인**한다. 없음-검사로 만들면 양성 대조를 붙일 대상이 없어 공허해진다(`acceptance.md` 원칙 ②).

---

## §F. 마일스톤

배치 원칙: **번복 가능성 내림차순.** 계약을 바꾸는 결정이 가장 되돌리기 비싸므로 앞에 둔다. 단 M1은 예외로 맨 앞인데, 번복 가능성 때문이 아니라 **M4 실측의 전제**이기 때문이다 — `adb`를 못 찾으면 Android 실측 자체가 불가능하다.

### M1 — `adb` 경로 해석 + 구별 보고 [전제]

- §B.1의 4단계 탐색을 구현한다. 해석은 1회 수행 후 재사용.
- §B.2의 `doctor` 보고 모양(`onPath` · `resolvedPath`)을 추가한다.
- `installed:true` + `onPath:false`에서 **설치를 권하지 않는지** 확인한다.
- 판정: PATH에서 `adb`를 제거한 환경에서 Android 명령이 **정상 동작**해야 한다(`acceptance.md` AC-READY-001·002).

### M2 — iOS 가용성 상태 + 계약 반영 [계약 변경 · 번복 비용 최대]

- §B.3의 `unavailable` 값과 `unavailableReason` 필드를 추가한다.
- `mapConnectionState`를 3분기로 확장한다(`connected` / 그 외 값 존재 / 값 부재).
- SPEC-CONTRACT-001의 키 집합 계약 테스트를 **같은 변경에서** 갱신한다.
- **기존 3값의 의미가 바뀌지 않았음**을 테스트로 못박는다(§D 제약).

### M3 — 물리 기기 단위 식별

- §B.4대로 `ro.serialno` 그룹핑 · 사전순 대표 선택 · `alternateSerials`를 구현한다.
- `ro.serialno` 조회 실패 시 **합치지 않는** 경로를 테스트로 고정한다.
- 그룹핑을 **순수 함수로 분리**해 실기기 없이 판정 가능하게 한다(입력: 전송 목록 + 식별자 맵).

### M4 — 실기기 회귀 확인 [필수 · `spec.md` §E.4 이행]

- §E 자체 검증 전체를 실행한다.
- **실기기로 3건을 각각 재현 확인**한다: PATH 밖 `adb`로 명령 동작 · iOS가 `unavailable`로 사유와 함께 보고 · 무선 중복 기기가 1개 항목으로 보고.
- 실기기 미확보 시 **미관측으로 기록하고 PASS로 계상하지 않는다.** 단 이 SPEC은 §C-④의 근거로 실측을 요구하므로, 미관측 상태로 마감하면 그 사실을 마감 보고에 명시한다.

### M5 — 문서 동기화 [마감 조건]

- `SKILL.md`의 다음 서술을 코드와 대조해 갱신한다: § Known traps의 `doctor` 정확성 주장, § Device targeting의 `connectionState` 설명, § Command reference의 `doctor` 행.
- **읽어서 확인**한다(§E 참조). 갱신한 절과 대조한 코드 위치를 `progress.md`에 남긴다.

---

## §G. 마일스톤 의존 관계

```
M1 (adb 경로 해석)                    ← M4 Android 실측의 전제
 ├─> M2 (iOS 상태값 + 계약)           ← 계약 변경, 번복 비용 최대
 └─> M3 (물리 기기 식별)              ← M1의 adb 접근이 있어야 ro.serialno 조회 가능
      └─> M4 (실기기 회귀 확인)
           └─> M5 (문서 동기화 · 마감)
```

- M2와 M3는 서로 독립이다 — 다른 파일·다른 백엔드를 건드린다. 순서를 바꿔도 되지만 **동시에 진행하지 않는다**(같은 `device-backend.ts`에 필드를 추가하므로 충돌 지점이 하나 있다).
- M5가 마지막인 이유: 문서는 코드가 확정된 뒤에 맞춘다. 반대로 하면 문서가 다시 코드와 어긋난다 — 이 SPEC이 닫으려는 결함(REQ-READY-005)을 스스로 재현하게 된다.
