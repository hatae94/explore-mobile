---
id: SPEC-IMESTATE-001
title: "기기별 IME 세션 상태 격리 — 진행 기록"
version: "0.4.0"
status: in-progress
created: 2026-07-29
updated: 2026-07-30
author: hatae
---

# 진행 기록 — SPEC-IMESTATE-001

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: scope-reduced (0.4.0 — 3차 최종 감사 FAIL 0.76 반영 후 범위 축소. 감사 반복 3/3 소진, 4차 없음)
plan_complete_at: 2026-07-30
plan_commit_sha: 44ac220 (0.4.0) / 4e4bd8d (0.3.0 SHA 백필) / c313f0c (0.3.0) / 924cae2 (최초)
tier: M (3 artifacts — spec.md / plan.md / acceptance.md)
REQ: 8   AC: 25 활성 + 3 폐기(011·013·026)   추적성: 100% (미커버 REQ 0)
```

감사 반복 소진 현황: **3회 사용 / 상한 3회 — 소진.** iter1·iter2는 plan-phase에서, iter3은 `/moai run` Phase 1 Plan Audit Gate에서 실행했다(사용자 결정으로 남은 1회를 run 진입 게이트에 아꼈다). **4차는 없다.** 0.4.0 개정은 감사받지 않은 편집이며, 대체 검증과 그 한계는 §E.1.3에 기록했다.

Tier M 근거: 영향 파일 5~6개 — 주 변경 `src/backend/ime-session-store.ts` 1개 + 테스트 3개(`ime-session-store.test.ts` · `adb-backend.test.ts` · `router.test.ts`) + barrel `src/index.ts`. Tier S(<5파일) 경계를 넘고 Tier L(>15파일)에는 크게 못 미친다. 마이그레이션 경로와 배타 생성·툼스톤의 정확성 요건이 인수 기준을 요구하므로 acceptance.md를 포함하는 M이 맞다.

### 착수 경로 (점검 → SPEC)

이 SPEC은 기능 요청이 아니라 **점검의 산물**이다. 로드맵의 "SPEC-04 탐색 루프" 자리표시자를 `interview.md:43`이 이미 점검 성격으로 재정의해 두었고(`spec.md` §A.1), 그 점검을 2026-07-29에 실행한 결과 두 기기 시나리오에 필요한 원시 동작 **10가지가 이미 충족**되어 있었다. 실질 갭 1건(IME 세션 저장소)을 이 SPEC이 닫고, 점검 중 추가로 드러난 1건(`CalibrationStore`)은 §C.4로 이월했다.

## §E.1.1 Plan-phase 감사 기록

### 1차 감사 (plan-auditor, 2026-07-29) — FAIL

```
verdict: FAIL
score: 0.63 / Tier M 기준 0.80
차원: Clarity 0.60 · Completeness 0.65 · Testability 0.50 · Traceability 0.85 (조화평균)
must-pass: 통과 5건 (REQ 번호 일관성 · GEARS 라벨 · frontmatter 12필드 · depends_on 상태 · clarification 마커 0) + N/A 2건 (언어 중립성 · syscall 관련 — 단일 언어 TS 프로젝트이고 syscall 0건이므로 해당 없음). N/A는 자동 통과이나 열거에서 숨기면 감사 기록의 정밀도가 떨어지므로 명시한다.
findings: MUST-FIX 10 · SHOULD-FIX 11 · NICE 7
```

FAIL 원인은 must-pass 실패가 아니라 **Testability 0.50** — REQ 보호의 유일한 기계적 증거였던 검사 2건이 **결함이 있어도 무조건 PASS하는 공허한 검사**였다:

| 공허 검사 | 원인 | 정정 |
|---|---|---|
| AC-008 (손실 변환 미재사용) | BRE 이스케이프 패턴이 실제로 매치되지 않음 (`exit=1`) — 손실 변환을 그대로 복사해 넣어도 통과 | `grep -nF` + **양성 대조** 의무화 |
| AC-018 (호출자 무수정) | 리비전 없는 `git diff`는 작업트리 대비 HEAD 비교 — 마일스톤마다 커밋하므로 검증 시점에는 항상 빈 출력 | 기준 SHA `$BASE`..HEAD **범위 비교** |

### 오케스트레이터 독립 검증 (감사 지적 8건 실측)

감사 결과를 그대로 수용하지 않고 핵심 지적을 직접 실행해 확인했다. **전건 사실로 확인됨.**

| 지적 | 검증 방법 | 결과 |
|---|---|---|
| MF-1 grep 패턴 무매치 | 두 형태 실행 대조 | 내 패턴 `exit=1`, `-F` 형태는 `:57` 매치 |
| MF-3 동일 시리얼 check-then-act | `adb-backend.ts:440-470` 독해 | `getOriginalIme` → `if undefined` → `setOriginalIme` 확인 |
| MF-6 `CalibrationStore` 동일 결함 | `calibration.ts:228-270` 독해 | 같은 캐시 디렉터리 · 단일 공유 파일 · 동일 비원자 RMW · 주석 "mirroring `ImeSessionStore`" |
| MF-7a `router.test.ts` 5지점 | grep | `:1089 :1139 :1183 :1189 :1235` + `:1061` 경로 조립 |
| MF-7b 간접 호출자 | `grep -rln ImeSessionStore src/ \| grep -v test` | `calibration.ts` · `index.ts` · `ime-session-store.ts` · `adb-backend.ts` — `reset.ts`/`doctor.ts` 미포함 |
| MF-8 export 미자백 | `grep src/index.ts` | `:30-34` 5종 (`resolveImeSessionStorePath` · `ImeSessionMap` · `ImeSessionRecord` 미자백이었음) |
| MF-9 `progress.md` 부재 | 기존 SPEC 대조 | 4개 중 3개가 `§E.1` 보유 → 이 파일이 그 정정 |
| 전제 재현 | 주입 IO + 읽기 배리어 | **유실 재현됨** — 최종 디스크에 `SERIAL-A`만, `SERIAL-B`는 `undefined` |

### 감사에 대한 반론 1건 — 표적을 잘못 잡았음 (0.3.0에서 정정)

0.2.0 시점에 오케스트레이터가 감사관의 SF-4를 부분 기각했다: 감사가 *"결정적 재현은 현행 주입 표면만으로 약 15줄에 끝난다"* → *"작성 전에 했어야 한다"*고 판정한 데 대해, "순차 `await`로 짠 15줄 하네스는 재현에 실패했으므로 난이도 평가가 과했다"고 반박했다.

**그 반박은 표적을 잘못 잡았다.** 2차 감사에서 감사관이 정정했다 — 자신의 1차 재현 스크립트는 **이미 읽기 배리어를 사용했고**(가짜 IO의 `read`가 수동 해제 가능한 promise를 반환), *"순차 await로 재현된다"고 주장한 적이 없다.* 즉 "15줄"은 **코드 분량**을 말한 것이고 그 15줄에는 배리어가 포함되어 있었다. 오케스트레이터는 감사관이 하지 않은 주장을 반박한 것이다.

**살아남는 부분**: 순진한 순차 `await` 하네스가 재현에 실패한다는 **관측 자체는 유효하고 가치 있다**(감사관도 "정확하고 가치 있다"고 인정). 다만 그것은 SF-4(난이도 평가)의 반증이 아니라 **SF-1(하네스를 순진하게 짜면 오독한다)의 보강**이었다. 그 관측은 AC-002·021의 하네스 요건 3항 + `plan.md` §B.4 리스크로 승격됐고, 감사관은 이를 자신이 SF-1에서 처방한 것보다 **강한 조치**로 평가했다.

**교훈**: 감사 지적을 반박할 때는 **그 지적이 실제로 주장한 것**을 먼저 확정해야 한다. 여기서는 "15줄"이라는 요약 표현을 "배리어 없이 된다"로 확대 해석했고, 그 확대가 반박의 전부였다. 지적의 요약 문구가 아니라 그 근거를 겨냥해야 한다.

## §E.1.2 2차 감사 기록 (plan-auditor, 2026-07-30) — FAIL

```
verdict: FAIL
score: 0.77 / Tier M 기준 0.80   (1차 0.63 → +0.14, 회귀 없음 → STOP 신호 미발동)
차원: Clarity 0.70 · Completeness 0.82 · Testability 0.72 · Traceability 0.87 (조화평균)
1차 지적 종결: 21건 중 20 CLOSED / 1 CLOSED-BUT-REGRESSED(MF-5 — 툼스톤이 새 모순을 만듦)
신규: MUST-FIX 3 · SHOULD-FIX 4 · NICE 5
반복 소진: 2 / 3
```

**FAIL의 성격이 1차와 다르다.** 1차는 "REQ 보호의 유일한 기계적 증거가 공허했다"였고 그것은 완전히 닫혔다(감사관이 명령을 재실행해 동작 변화를 확인). 2차 FAIL은 **0.2.0이 추가한 표면(REQ-007·008)에 집중**되어 있고, MUST-FIX 3건 전부가 그 신설 표면에서 나왔다 — **범위를 넓히면서 새 구멍을 냈다.**

| 신규 MUST-FIX | 결함 | 0.3.0 조치 |
|---|---|---|
| N-MF-1 | REQ-005의 "레코드가 없었다면 조회 결과를 바꾸지 않는다"가 무조건형 → REQ-008과 정면 충돌. 구 파일 기록만 있는 시리얼의 `clear`가 툼스톤을 만들지 않아도 되는 것으로 읽히고, **그것을 잡는 AC가 하나도 없었다**(AC-023은 툼스톤을 Given으로 미리 만들어 두고 조회만 검증) | REQ-005 단서를 "레코드도 구 파일 기록도 없었다면"으로 한정 + 구 파일 기록만 있는 시리얼의 툼스톤 생성 의무 명시 + **AC-025 신설**(전이 검증) |
| N-MF-2 | 조회 1단계(레코드)가 2단계(툼스톤)보다 앞서므로 이관이 툼스톤 있는 시리얼의 레코드를 만들면 억제가 무력화됨(감사관이 명세대로 시뮬레이션해 재현). **게이트 요구도 이관 단위 규정도 없었다** | §A.3-⑧ 신설 — 이관 단위 **일괄** 확정 + **툼스톤 게이트** + REQ-003·008 반영 + **AC-026 신설** |
| N-MF-3 | REQ-007의 "실패는 오류가 아니라 정상 결과"가 종류 미한정 → `ENOENT`·`EACCES`·`ENOSPC`를 삼키면 기록 없이 정상 종료 → **이 SPEC이 없애려는 결함과 동일한 조용한 실패** | REQ-007을 `EEXIST` 한정으로 개정 + 비-`EEXIST` 미삼킴 명시 + **AC-027 신설** |

**함께 처리한 SHOULD-FIX**: N-SF-1(`clear` 순서 — `plan.md`가 위험한 unlink→create를 명시하고 있었다 → §A.3-⑦로 툼스톤 우선 확정) · N-SF-2(§C.1-⑫ 관측/미관측 분할 → ㉑ 신설) · N-SF-3(§C.2 마일스톤 M4→M3 오기 2건) · N-SF-4(§E 잠금 grep 제거 — 양성 대조 없는 없음-검사여서 `acceptance.md`가 0.2.0에서 스스로 신설한 원칙을 위반). NICE 5건도 반영(HISTORY ⑪·⑫→⑪·⑰, §C.2 서문 "4개"→"5개 전부 중 4개는 새 자백", must-pass N/A 2건 명시, `updated` 날짜 정정).

**감사관이 인정한 것**: 오케스트레이터가 처방과 **다르게** 닫은 3건(MF-3 범위 편입 / SF-1 리스크 승격 / SF-2 구조적 논거 격하)을 *"셋 다 건전하며 내 처방보다 낫다"*고 판정. `plan.md` §B.5의 "경로 분리로 EEXIST 위험 해소" 주장도 라이프사이클 전체 검증 후 *"정확하다"*로 확인.

**감사관 전망**: MUST 3 + N-SF-1 처리 시 Clarity 0.85대 · Testability 0.85대로 조화평균 **0.85+** 예상. 범위 축소나 PASS-with-debt를 볼 상황 아님(점수 상승 중 + 잔여 국소적).

### 0.2.0 반영 범위

| 축 | 반영 |
|---|---|
| 공허 검사 제거 | AC-008 양성 대조 · AC-018 범위 비교 (MF-1·MF-2) |
| 범위 상향 (사용자 승인) | REQ-007 배타 생성(동일 시리얼) · REQ-008 툼스톤(이관 창 좀비) — 잠금 없이 닫음 |
| 미검증 주장 철회 | 0.1.0 §C.2의 "닫으려면 잠금이 필요하다" → 툼스톤이 반증 (MF-5) |
| 사실 정정 | "무방어 자원 하나" → 둘 (MF-6) · "세 항목 모두 동시성 겨냥" → `dump`만 (SF-5) |
| 모순 해소 | REQ-001 위반 후보 명시 기각 (MF-4) · AC-015 이진 판정화 · AC-016 Given 보강 (MF-10) |
| 누락 반영 | `router.test.ts` 영향 · export 4종 자백 · `progress.md` 생성 (MF-7·MF-8·MF-9) |
| 이월 | `CalibrationStore` → §C.4 (피해 등급 차이가 근거, 미공개는 결함이었음) |

재감사 범위: MUST-FIX 10 + SHOULD-FIX 11 델타에 한정 (전면 재감사 불필요 — 감사관 §10 권고).

## §E.1.3 3차(최종) 감사 기록 — `/moai run` Phase 1 Plan Audit Gate (plan-auditor, 2026-07-30) — FAIL + STOP

```
verdict: FAIL + STOP 신호
score: 0.76 / Tier M 기준 0.80   (2차 0.77 → -0.01, **하락** → STOP 신호 발동)
차원: Clarity 0.70 · Completeness 0.80 · Testability 0.70 · Traceability 0.85 (조화평균)
must-pass: 통과 5건 + N/A 2건 (언어 중립성 · syscall) — **방화벽 실패 없음.** FAIL은 총점 + 미해결 MUST-FIX 4건에 의한 것
2차 지적 종결: 7건 중 4 CLOSED / 2 CLOSED-BUT-REGRESSED / 1 NOT FULLY CLOSED
신규: MUST-FIX 4 · SHOULD-FIX 5 · NICE 3
반복 소진: 3 / 3 — 소진
```

**중단 사고 1건**: 감사관은 사전 점검 16회를 마친 뒤 서버측 `API Error: 529 Overloaded`로 반환 없이 중단됐다. 원장 마감 후 같은 에이전트를 컨텍스트째 재개해 완료했다(새로 띄우면 376K 토큰어치 조사를 재수행해야 했다). 중단 시점에 리포트 파일은 생성되지 않았고 작업트리 변경도 없었다 — 깨끗한 중단이었음을 `git status`와 리포트 디렉터리 목록으로 확인했다.

### 오케스트레이터 독립 검증 (핵심 주장 5건 실측) — **전건 사실 확인**

감사 결과를 그대로 수용하지 않고 판정의 근거가 되는 주장을 직접 실행해 확인했다.

| 주장 | 검증 방법 | 결과 |
|---|---|---|
| 점수 하락이 진짜인가 (STOP 신호의 근거) | 조화평균 재계산 | 2차 dims → **0.77125**(기록값 0.77 재현) / 3차 dims → **0.75706**. 같은 잣대 비교이며 **하락 사실** |
| N3-MF-4 기준 SHA를 적을 곳이 없다 | `acceptance.md:193` · `plan.md:91` · 소유권 규칙 대조 | 사실 — 기록 주체 `manager-develop`은 `plan.md` 본문 수정 금지. REQ-006의 유일한 증거가 **실행 불가**였다 |
| N3-MF-2 이관 순서 모순 | `spec.md:169` · `plan.md:51` 대조 | 사실 — SPEC은 "옮긴 뒤 폐기"(rename 나중), `plan.md`의 rename 유력 근거는 rename **먼저**여야 성립 |
| N3-MF-3 AC-027 판정 불가 | `acceptance.md:269` 독해 | 사실 — Then이 "구별되어 처리된다"뿐이고 **관찰 대상 미명시** |
| N-SF-4 미완결 (내 0.3.0 수정이 절반만 들어감) | `grep -n '잠금 미도입' plan.md` | 사실 — `:137`이 "grep으로 하지 않는다"인데 `:177`이 "잠금 미도입 grep 포함" 실행 지시. **같은 파일 40줄 거리에서 정면 모순** |

부수 확인: REQ-002의 "127바이트" 상한도 틀렸다 — `127×2+8(.cleared)=262 > 255`. 실제 안전 상한은 **123바이트**(`123×2+8=254`, `124`는 256으로 초과).

### 3차 신규 지적의 성격 — **패턴 3라운드 연속**

MUST-FIX 4건 중 **2건(N3-MF-1·N3-MF-2)이 0.3.0이 추가한 표면**에서 나왔다. 0.2.0→2차 3건, 0.3.0→3차 2건. **범위를 넓히면 새 구멍이 생긴다**가 3라운드 연속 성립했다. 이것이 범위 축소 결정의 직접 근거다.

그리고 N3-MF-3(AC-027 판정 불가)은 **1차 감사가 잡은 공허 검사의 재발**이다 — 1차는 패턴이 틀려서, 3차는 관찰 대상이 없어서 공허했다. 형태는 다르지만 결과가 같다: 결함이 있어도 통과한다.

### 사용자 결정 → 0.4.0 범위 축소

`AskUserQuestion` 4지선다에서 **"범위 줄이고 진행"**이 선택됐다(대안: 범위 유지·전건 수정 / PASS-with-debt / 중단). PASS-with-debt는 감사관이 기각했고 `spec.md:152`가 자기 문장으로 금지한다 — "닫을 수 있는 한계를 다시 수용하는 것은 같은 실패를 반복하는 일이다".

| 3차 지적 | 0.4.0 처분 |
|---|---|
| N3-MF-1 (새 세션 경로 순서 미규정) | **폐쇄** — §A.3-⑧을 이관 규칙에서 **순서 확정**(레코드 먼저 → 툼스톤 나중)으로 교체 + AC-024에 **중간 조회 검증 ③** 추가. ⑦(`clear`)과 ⑧(`set`)이 같은 규칙의 두 방향 |
| N3-MF-2 (이관 순서 모순) | **원인 제거** — 이관 기능 자체를 범위에서 제외. 모순의 두 항 중 하나가 사라졌다 |
| N3-MF-3 (AC-027 판정 불가) | **폐쇄** — REQ-007에 "**거부한다**" 명시 + AC-027을 거부/정상반환 **이분 판정**으로 재작성(두 구성 동시 검증) |
| N3-MF-4 (기준 SHA 장소 없음) | **폐쇄** — `plan.md` §C → **`progress.md` §E.2**로 이전(아래 §E.2에 자리 마련). `manager-develop`이 소유하는 섹션이라 합법 |
| N3-SF-1 (AC-018 두 점 형태) | **폐쇄 + 강화** — 단일 리비전 형태 + `git log` 이력 검사 추가 + **양성 대조 신설**(0.3.0이 원칙 ②를 부분만 지킨 것을 정정) |
| N3-SF-2 (`plan.md:177` 잔재) | **폐쇄** — M4의 잠금 grep 실행 지시 제거 |
| N3-SF-3 (REQ-004×007 미정의 교차) | **소멸** — 이관 제외로 조회가 쓰기를 유발하는 경로가 없어졌다 |
| N3-SF-4 (127바이트) | **폐쇄** — 123바이트로 정정 + 산식 명시 |
| N3-SF-5 (AC-005 프로브 볼륨) | **폐쇄** — 실제 캐시 디렉터리 볼륨에서 프로브하도록 명시 |
| 감사관 권고 (c)→(a) | **채택** — 범위 축소 후 잔여 결함 수정, 4차 감사 없이 진행 |

내가 추가로 닫은 것 1건 (감사 지적 아님): REQ-007의 실패 처리 규칙을 **툼스톤 생성까지 확장**했다. `clear`의 툼스톤 생성이 조용히 실패하면 호출자는 무효화됐다고 믿지만 레코드가 남아 REQ-005의 조작적 정의가 깨진다 — AC-027이 잡는 것과 같은 부류의 공백이었다.

### 4차 감사의 대체 검증 — **그리고 그 한계**

0.4.0은 감사 없이 들어간 편집이다. 대체로 2종을 실행했다: ① 삭제 대상(§A.3-⑧ 이관 규칙 · AC-011·013·026 · `plan.md` §B.1)을 가리키는 **참조 전수 grep** ② `pnpm test`·`typecheck`·`build`(문서 개정이므로 코드 무영향 확인).

**대체 검증은 감사와 동등하지 않다.** 참조 무결성과 회귀 부재만 보이며, 개정된 요구사항 자체의 정합성은 검증하지 않는다. 축소는 확대와 달라 "새 표면에 새 결함"이 생길 수 없다는 것이 위험 감소의 근거이지만, 그것은 논거이지 관측이 아니다. `spec.md` §C.1-㉒에 미관측으로 기록했다.

### 교훈 (다음 SPEC에 적용)

- **"고쳤다"는 기록과 문서 원문은 다르다.** 3차 감사에서 내 0.3.0 수정 중 1건(N-SF-4)이 절반만 들어가 같은 파일 안에 모순을 남겼다. 수정 후 **그 수정이 지시한 것과 반대되는 문장이 파일에 남아 있지 않은지** grep으로 확인해야 한다.
- **AC를 새로 만들어 결함을 닫을 때, 그 AC 자체가 판정 가능한지 먼저 확인한다.** AC-027은 2차 지적을 닫으려고 만들었는데 판정 불가여서 3차 MUST-FIX가 됐다 — 닫으려는 행위가 새 결함을 만들었다.
- **범위를 넓혀 결함을 닫으면 새 표면에서 새 결함이 나온다** (3라운드 연속 관측). 대안이 있으면 **좁히는 쪽**을 먼저 검토한다. 이번에는 좁히는 쪽이 더 안전했고 잃는 것도 없었다.

## §E.2 Run-phase Evidence

### M1 — 재현 게이트 (완료)

**게이트 판정: 두 결함 모두 재현됨 → M1 게이트 통과, M2 진입 가능.** 아래 하네스로 결함 ①(교차 시리얼 유실)과 결함 ②(동일 시리얼 check-then-act 유실)을 모두 재현했다(`plan.md` §F 참조).

### 기준 SHA (`$BASE`) — AC-018이 사용

`manager-develop`은 M1 착수 **직전에** `git rev-parse HEAD`를 실행해 그 값을 아래에 기록한다. 이 섹션(§E.2 Run-phase Evidence)은 `manager-develop`이 소유하므로 여기 기록하는 것은 소유권 위반이 아니다 — `plan.md` §C에 적으라던 0.3.0 지시는 `manager-develop`의 `plan.md` 본문 수정 금지와 충돌해 실행 불가였다(3차 감사 N3-MF-4).

```
BASE_SHA: b4fdc6a6c684d02e373f415cf3dedc91780c8352
기록 시점: 2026-07-30 (M1 착수 직전, git rev-parse HEAD 실측)
```

AC-018은 이 값으로 세 명령을 실행한다(양성 대조 → 내용 차이 → 커밋 이력). 명령 형태는 `acceptance.md` AC-018 및 `plan.md` §E를 그대로 따른다. M1 시점에는 소스 파일(`ime-session-store.ts`) 자체를 아직 수정하지 않았으므로 양성 대조는 M2 완료 후에야 성립한다 — 아래 §E5 참조.

### 사전 점검 (`plan.md` §C rows 0-9) — 전건 통과

| # | 명령 | 실측 결과 |
|---|------|-----------|
| 0 | `git rev-parse HEAD` | `b4fdc6a6c684d02e373f415cf3dedc91780c8352` |
| 1 | `pnpm test` | `32 files / 702 tests passed`, exit 0 |
| 2 | `pnpm typecheck` | exit 0 |
| 3 | `pnpm build` | exit 0 |
| 4 | `grep -n "NOT atomic" src/backend/ime-session-store.ts` | `22: * @MX:NOTE — read-modify-write is NOT atomic across concurrent writers:` |
| 5 | `grep -n "existingOriginal" src/backend/adb-backend.ts` | `454:`, `455:` |
| 6 | `grep -n "resolveApkCacheDir" src/backend/apk-downloader.ts` | `59, 68, 80` |
| 7 | `grep -rln "ImeSessionStore" src/ \| grep -v test` | `src/index.ts`, `src/webview/calibration.ts`, `src/backend/ime-session-store.ts`, `src/backend/adb-backend.ts` — `reset.ts`/`doctor.ts` 미포함(기대대로) |
| 8 | `grep -n "ImeSession\|resolveImeSessionStorePath" src/index.ts` | `:30-34`, 5개 심볼 |
| 9 | `grep -nF 'replace(/[^A-Za-z0-9_-]/g' src/backend/adb-backend.ts`(양성 대조) | `:57` |
| — | `grep -n "new ImeSessionStore\|imeStorePath = " src/cli/router.test.ts` | `:1061 :1089 :1139 :1183 :1189 :1235` (6줄) |

### E1 — 게이트 판정 (가장 중요)

**결함 ① (교차 시리얼 유실, `ime-session-store.ts:22-27`) — 재현됨.**

하네스: `createInterleavingIO()`(읽기 배리어, `ime-session-store.test.ts` 신설) — 두 `setOriginalIme` 호출(`SERIAL-A` / `SERIAL-B`)의 내부 `readAll()`이 둘 다 끝난 뒤에야 어느 한쪽도 진행하지 못하도록 강제했다.

실측 출력(수정 전 코드, `.fails()` 래핑 이전의 원시 실행 — 아래는 그 원시 assertion 실패):
```
AssertionError: expected undefined to be 'com.example/.KeyboardA'
- Expected: "com.example/.KeyboardA"
+ Received: undefined
```
`SERIAL-A`의 기록이 유실되고 `SERIAL-B`만 생존했다 — `ime-session-store.ts:22-27`의 자체 문서화된 한계(@MX:NOTE)가 실측으로 확인됨.

**결함 ② (동일 시리얼 check-then-act 유실, `adb-backend.ts:454-455` 패턴) — 재현됨.**

하네스: 동일한 `createInterleavingIO()`를 재사용해 `getOriginalIme` → (undefined면) `setOriginalIme`라는 `adb-backend.ts:454-455`의 체크-후-액션 패턴을, 스토어 공개 API에 대해 직접 시뮬레이션했다(양쪽의 존재 확인이 모두 끝난 뒤에야 어느 한쪽의 기록도 시작되지 않도록 강제 — `adb-backend.ts` 자체는 PRESERVE 대상이라 수정하지 않았다).

실측 출력(수정 전, 원시 실행):
```
AssertionError: expected 'ime.second' to be 'ime.first'
Expected: "ime.first"
Received: "ime.second"
```
나중에 쓴 값(`"ime.second"`)이 먼저 존재 확인을 통과한 값(`"ime.first"`)을 덮어썼다 — REQ-IMESTATE-007이 요구하는 배타성이 현재 구현에는 없음을 확인. 실사용 의미(`spec.md` §A.1 결함②): 늦게 진입한 프로세스가 이미 ADBKeyBoard로 바뀐 IME를 "원래 IME"로 기록하고, 이후 `reset`이 기기를 ADBKeyBoard 자체로 "복원"한다.

### E2 — AC 매트릭스 (M1 대상)

| AC ID | 판정 | 검증 명령 | 실측 출력 |
|-------|------|-----------|-----------|
| AC-IMESTATE-002 | PASS(전후 대조 前半 — 수정 전 FAIL 관측 완료) | 위 §E1 결함① 하네스, 원시 실행 | 위 §E1 인용 |
| AC-IMESTATE-021 | PASS(전후 대조 前半 — 수정 전 FAIL 관측 완료) | 위 §E1 결함② 하네스, 원시 실행 | 위 §E1 인용 |

두 AC 모두 "수정 후 PASS로 전환"이라는 後半 관측은 M2 완료 후에야 성립한다(`.fails()`를 일반 `it()`으로 전환하고 재실행해 진짜 PASS를 관측). 이는 정확히 M1 게이트의 범위다 — `plan.md` §F: "M1은 게이트이지 변경 확률로 앞에 있는 것이 아니다".

### E3 — 하네스 준수 증명 (`plan.md` §B.4 / `acceptance.md` AC-002 하네스 요건)

1. **경로별 키 저장소** — `createInterleavingIO()`의 `fakeFiles`는 `Map<string, Buffer>`로 경로 문자열을 키로 삼는다(단일 blob 변수가 아니다). M1 시점의 `ImeSessionStore` 생성자는 여전히 단일 파일 경로를 받으므로 실질적으로는 키가 하나뿐이지만, 구조 자체는 임의 개수의 경로를 지원한다 — M2가 생성자 인자의 의미를 디렉터리로 바꿔도 이 테스트 본문은 수정 없이 재사용된다.
2. **`setOriginalIme` 내부에서 강제된 인터리빙** — `read()`는 두 번째 호출자가 도착(`arrivals >= 2`)해야만 게이트를 해제하며, **첫 번째와 두 번째 호출자 모두** 동일한 게이트를 `await`한 뒤에야 스냅샷을 반환한다 — 어느 쪽도 상대의 쓰기 결과를 우연히 관측할 수 없도록 대칭 설계했다.
3. **경로가 아니라 IO 주입** — 두 테스트 모두 `new ImeSessionStore("virtual/ime-sessions.json", io)` 형태로 가짜 IO를 주입하며, 생성자 인자가 "파일이냐 디렉터리냐"라는 의미에는 의존하지 않는다.

**거짓 음성 실측 (스크래치 하네스, 스위트에 커밋하지 않음)** — 순차 `await` 형태(`await store.setOriginalIme("SERIAL-A", ...); await store.setOriginalIme("SERIAL-B", ...);`, 배리어 없음)로 결함①을 재현 시도한 결과:
```
NAIVE RESULT A/B: com.example/.KeyboardA com.example/.KeyboardB
```
두 기록 모두 생존 — 유실이 재현되지 않았다(거짓 음성). `acceptance.md` AC-IMESTATE-002 하네스 요건 2가 경고한 정확히 그 실패 모드가 실측으로 재확인됐다. 이 확인 실험은 evidence로만 기록하고 실제 테스트 스위트에는 커밋하지 않았다 — 결함을 증명하지 못하는 항상-통과 테스트는 스위트에 노이즈만 더한다(Enforce Simplicity / Scope Discipline).

### E4 — 수정 후 기준선 게이트

```
$ pnpm test      → 32 files / 704 tests (702 passed + 2 expected fail), exit 0
$ pnpm typecheck → exit 0
$ pnpm build     → exit 0
```

### E5 — PRESERVE 증명

```
$ git diff --name-only b4fdc6a6c684d02e373f415cf3dedc91780c8352 -- \
    src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
(출력 없음)

$ git diff --name-only b4fdc6a6c684d02e373f415cf3dedc91780c8352 -- src/backend/ime-session-store.ts
(출력 없음 — M1은 재현 게이트이므로 소스 파일 자체는 아직 수정하지 않았다. AC-018의 양성 대조는 M2가 소스를 수정한 뒤에야 비어있지 않은 출력을 낼 것이다.)

$ git diff --name-only b4fdc6a6c684d02e373f415cf3dedc91780c8352 -- src/backend/ime-session-store.test.ts
src/backend/ime-session-store.test.ts   (테스트 파일만 수정 — 예상대로 감지됨. diff 명령 자체의 감지 능력을 증명하는 대체 양성 대조)
```

PRESERVE 대상 3개 파일(`adb-backend.ts` / `reset.ts` / `doctor.ts`) 무수정 확인. `ime-session-store.ts` 소스 자체도 M1에서는 미수정(테스트 파일만 수정) — AC-018 본연의 양성 대조는 M2에서 재확인이 필요하다.

### E6 — 커밋/푸시 상태

M1 커밋의 SHA/push 결과는 이 파일이 그 커밋에 포함되어 자기 참조가 불가능하므로(커밋은 자신의 해시를 미리 알 수 없다), 커밋 직후 오케스트레이터 응답 본문에 `git log -1` / `git push` / `git rev-list --count --left-right` 실측을 인용한다(별도 backfill 커밋 없이).

### E7 — 블로커

없음. 두 결함 모두 재현에 성공했고 사전 점검 10개 항목 전건이 기대대로 통과했으므로 M1 게이트를 통과한다.

## §F Phase 4 Mode Selection

```
입력: tier=M · 영향 파일 5~6개 · 도메인 1개(src/backend 저장소 계층) ·
      언어 구성 100% TypeScript · 병렬 이득 낮음(코딩 작업, 파일 간 의존 있음)
```

| 모드 | 선택 | 근거 |
|---|---|---|
| 1 trivial | 미선택 | 단일 라인 수정이 아니다 — 저장 배치 교체 + 배타 생성 + 툼스톤 |
| 2 background | 미선택 | 쓰기 작업이므로 읽기 전용 비동기 조건에 해당하지 않는다 |
| 3 agent-team | 미선택 | RETIRED (Phase 0.95 tombstone) |
| 4 parallel | 미선택 | 도메인 1개 · 파일 6개로 임계(도메인 ≥3 / 파일 ≥10) 미달. 또한 코딩 중심 작업이므로 병렬 팬아웃이 부적합하다 |
| **5 sub-agent** | **선택** | 기본 폴백이며 이 작업 성격에 정확히 부합 — 마일스톤 간 의존이 직렬(M1 게이트 → M2 → M3 → M4 → M5)이고 같은 파일을 연속 수정한다 |
| 6 workflow | 미선택 | ~30파일 이상의 기계적 일괄 변환이 아니다. 신규 코드 작성이므로 제외 |

```
Decision: sub-agent
```

정당화: 이 SPEC은 단일 파일(`src/backend/ime-session-store.ts`)의 내부 교체가 주 변경이고, 마일스톤이 직렬 의존이다. M1은 게이트여서 통과 전에는 M2 이후가 무효이므로 병렬화할 대상이 원리적으로 없다. Anthropic의 코딩 작업 병렬화 주의(코딩은 연구보다 진짜 병렬 가능한 작업이 적다)가 그대로 적용되며, 마일스톤마다 사람이 결과를 확인할 수 있는 순차 진행이 이 SPEC의 감사 이력(3라운드 FAIL)에 비추어도 적절하다.

경계 사례 없음 — 도메인 1개 · 파일 6개는 임계 근처가 아니다.

구현 착수 승인: 사용자가 `AskUserQuestion`으로 **"M1 재현 게이트부터 착수"**를 선택했다(2026-07-30). 그 후 Phase 1 게이트가 FAIL(0.76)했고, 재차 `AskUserQuestion`으로 **"범위 줄이고 진행"**이 선택돼 0.4.0 개정 후 M1 진입이 승인됐다. Mode 5는 자율 결정이며 승인 게이트를 대체하지 않는다.
