# SPEC-ANDROID-002 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-03
tier: S
artifacts: spec.md, plan.md
```

### 기준 커밋

```
base_commit_sha: 18a2cd6
branch: master
```

### 착수 전 확인된 작업 트리 상태

- 추적 파일 변경 0건, 미push 0건 (2026-08-03 확인)
- 병행 SPEC-VISION-002는 `wda-client.ts`를 건드리며 파일이 겹치지 않는다

---

## §E.2 Run-phase Evidence

### M1 — 상태 토큰 분리 + 폴백

#### 착수 직전 실측이 계획을 반증했다 (spec.md 0.2.0 개정)

plan 0.1.0은 「탭 우선 + 공백 폴백」을 지시했다. 근거는 M6의 `od -c` 관측이었으나
**그 관측은 플래그 없는 `adb devices`였다.** 파서가 실제로 먹는 것은
`adb-backend.ts:292`가 부르는 **`adb devices -l`**이다. 같은 기기에서 두 형식을
나란히 관측했다:

```
$ adb devices | od -c
  1 9 2 . 1 6 8 . 2 1 9 . 1 0 6 : 3 6 8 0 7  \t  d e v i c e          ← 탭

$ adb devices -l | od -c
  1 9 2 . 1 6 8 . 2 1 9 . 1 0 6 : 3 6 8 0 7  ␠␠  d e v i c e  ␠  p r o d u c t : …
  a d b - … - x t n 5 z d  ␠  ( 2 ) . _ a d b - t l s - c o n n e c t . _ t c p
      ␠  d e v i c e  ␠  p r o d u c t : …                            ← 탭 없음
```

**`-l`에는 탭이 없다.** 패딩 폭도 고정이 아니다(21자 serial 뒤 공백 2개, 47자
serial 뒤 공백 1개). 탭 기반 수정은 실제 명령 경로에서 **아무것도 고치지
못했을 것**이다. 계획을 상태 토큰 기반 분리로 교체했다.

#### 수정 전 실기기 상태 (AC-SERIAL-006 baseline)

충돌 기기가 착수 시점에 이미 연결돼 있었다 — plan 0.1.0이 전제한 "유발 불가"는
성립하지 않았다.

```
$ node dist/cli/bin.js devices
  {"serial":"adb-R3CY106LKVX-xtn5zd","connectionState":"offline","osVersion":"", …}
     ↑ " (2)._adb-tls-connect._tcp" 유실        ↑ 실제로는 살아 있는 기기
```

#### RED (2026-08-03)

실기기 `-l` 출력 그대로의 픽스처 2건을 추가했다(탭 없는 `-l` 형식 1건 + 탭 있는
플래그 없는 형식 1건).

```
$ npx vitest run src/backend/device-list-parser.test.ts
  Tests  2 failed | 6 passed (8)

  - serial: "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp"   ← 기대
  + serial: "adb-R3CY106LKVX-xtn5zd"                             ← 실제
  + state:  "(2)._adb-tls-connect._tcp"
```

기존 6건은 손대지 않았고 전부 통과 상태를 유지했다.

#### GREEN

`device-list-parser.ts`의 분리 규칙을 교체했다.

```ts
// 전
const match = line.match(/^(\S+)\s+(\S+)(.*)$/);

// 후 — 알려진 상태 토큰의 위치로 자른다. 못 찾으면 기존 정규식으로 폴백.
const STATE_TOKEN = new RegExp(`\\s(${CONNECTION_STATES.join("|")})(?=\\s|$)`);
```

뒤의 lookahead `(?=\s|$)`가 `-l` 부가 필드의 `device:pa3q`를 걸러낸다 — 콜론이
오면 상태 토큰이 아니다. **이것이 이 수정의 유일한 함정이었다.**

```
$ npx vitest run src/backend/device-list-parser.test.ts
  Tests  8 passed (8)          ← 신규 2 + 기존 6 무수정
```

#### 실기기 재측정 (AC-SERIAL-006 판정)

```
$ node dist/cli/bin.js devices
  serial="192.168.219.106:36807"
    state=device  model=SM_S938N  os=16
  serial="adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp"
    state=device  model=SM_S938N  os=16          ← offline → device

$ node dist/cli/bin.js screenshot --device "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp" --out …
  {"ok":true,"data":{"savedTo":"…/serial-fix-proof.png","byteLength":366436}}
  $ file … → PNG image data, 1440 x 3120, 8-bit/color RGBA
```

목록에 뜨는 것으로 그치지 않고 **그 serial로 실제 조작이 통했다.** `osVersion`이
빈 문자열에서 `16`으로 채워진 것도 기기에 명령이 실제로 닿았다는 증거다.

#### AC 판정

| AC | 등급 | 판정 |
|---|---|---|
| AC-SERIAL-001 (`-l` 공백 serial 보존) | U | **PASS** |
| AC-SERIAL-002 (기존 6종 무수정 통과) | U | **PASS** |
| AC-SERIAL-003 (탭 형식도 같은 규칙) | U | **PASS** |
| AC-SERIAL-004 (`device:<v>` 오인 방지 + `model:` 추출) | U | **PASS** — 위 픽스처가 `model: "SM_S938N"`을 함께 검증 |
| AC-SERIAL-005 (던지지 않음) | U | **PASS** — 기존 테스트 2건 유지 |
| AC-SERIAL-006 (실기기) | **D** | **PASS** — 전후 대조 + 실제 screenshot 성공 |
| AC-SERIAL-007 (게이트) | G/U | **PASS** — 아래 |

```
$ pnpm test        → 32 files / 692 passed | 2 expected fail   (690 → 692, 순증 2)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

#### 미검증 (Gaps)

1. **`no permissions` 등 공백을 품은 상태 문자열은 여전히 폴백 경로다.** 기존
   동작 그대로이며 이 SPEC의 범위 밖으로 명시했다(spec.md §A.5.1).
2. **상태 열거값에 없는 상태가 나오면 조용히 폴백된다.** 폴백은 기존 동작이라
   오류를 내지 않고 예전처럼 serial을 자른다. 새 adb 상태값이 생기면 이 목록을
   갱신해야 하는데, 그것을 알려 주는 장치는 없다.
3. **serial이 정확히 상태 토큰 하나로만 이루어진 경우는 시험하지 않았다.**
   현실적으로 발생하기 어렵다고 판단했으나 관측하지는 않았다.

---

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-03
milestones: M1 (완료)
run_commit_sha: e5d4b98
gates: pnpm test 32 files / 692 passed | 2 expected fail
       pnpm typecheck exit 0 · pnpm build exit 0
ac: 7/7 PASS (미충족 0건)
```

---

## §E.4 Sync-phase Audit-Ready Signal

```
sync_status: audit-ready
sync_complete_at: 2026-08-03
sync_commit_sha: pending-backfill-2026-08-03
artifacts_updated: CHANGELOG.md, README.md, progress.md (§E.4), spec.md (frontmatter)
ac: 7/7 PASS · 미충족 0건
```

### 문서 동기화

- `CHANGELOG.md` **Fixed**: 이 결함 항목 추가
- `README.md` 「알려진 제약」: 해결된 항목 제거, 로드맵 갱신


---

## §F Phase 4 Mode Selection

```
tier: S
scope: 2 files (device-list-parser.ts + .test.ts)
domains: 1 (Android adb 파싱)
concurrency benefit: LOW (단일 파일 코딩 작업)
Decision: sub-agent
```

Mode 1(trivial)은 정규식 한 줄이 아니라 규칙 교체 + 실기기 판정이 걸려 있어
제외했다. Mode 4(parallel)는 도메인이 하나라 해당 없음. Mode 6(workflow)은
파일 2개로 기계적 대량 변환 조건(≈30파일)에 한참 못 미친다. 기본값인 Mode 5로
진행했다 — Anthropic의 coding-task 병렬화 유보 조항과도 일치한다.
