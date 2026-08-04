---
id: SPEC-IMESTATE-001
title: "기기별 IME 세션 상태 격리 — 진행 기록"
version: "0.4.1"
status: in-progress
created: 2026-07-29
updated: 2026-08-04
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

### 기준 SHA 재설정 — M2 착수 (2026-08-03)

**위 `BASE_SHA`(`b4fdc6a`)는 M1 증거용으로만 유효하며, M2 이후 AC-018에는 사용할 수 없다.** M1 커밋(`181199e`, 2026-07-30) 이후 이 SPEC과 무관한 커밋 **46개**가 들어왔고, 그 과정에서 PRESERVE 대상 3파일이 **전부** 정당하게 수정됐다. 실측:

```
$ git rev-list --count 181199e..HEAD
46

$ git diff --name-only b4fdc6a6c684d02e373f415cf3dedc91780c8352 HEAD -- \
    src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
src/backend/adb-backend.ts
src/cli/commands/doctor.ts
src/cli/commands/reset.ts

$ git diff --name-only 181199e HEAD -- (동일 3파일)
src/backend/adb-backend.ts
src/cli/commands/doctor.ts
src/cli/commands/reset.ts
```

옛 기준선을 그대로 쓰면 **내가 한 글자도 건드리지 않아도 AC-018이 "PRESERVE 3파일 전부 변경됨"을 출력한다** — 거짓 실패다. AC-018이 증명하려는 것은 "이 SPEC의 작업이 호출자를 건드리지 않았다"이므로, 기준선은 **이 SPEC의 다음 작업이 시작되는 지점**이어야 한다.

```
BASE_SHA_M2: 3b8e8008893a8658303d21a326a71cf8fe35963a  (short: 3b8e800)
기록 시점: 2026-08-03 (M2 착수 직전, git rev-parse HEAD 실측)
용도: M2 이후 모든 AC-018 실행의 $BASE
```

기록 시점의 작업트리에는 SPEC 산출물 0.4.1 정정(spec.md · plan.md)이 미커밋 상태로 존재했다. **PRESERVE 대상 3파일과 무관한 문서 변경이므로 AC-018 판정에 영향이 없다.**

**M2 착수 시점 테스트 기준선** (`plan.md` §C row 1 / M4 대조용 — 하드코딩 대신 여기 실측 기록):

```
$ pnpm test       → Test Files 26 passed (26) · Tests 554 passed | 2 expected fail (556), exit 0
$ pnpm typecheck  → exit 0
```

`2 expected fail`은 M1이 심은 재현 테스트 2건(`it.fails`)이며 **M2 완료 시 통과로 전환되어야 한다**. 즉 M2 이후의 기대 기준선은 `556 passed | 0 expected fail`이다 — 이 전환 자체가 AC-002·021의 후반 관측이다.

> 0.4.0까지 `plan.md`가 기준선으로 적고 있던 `32 files / 702 tests`는 SPEC-WEBVIEW-002·SPEC-CLEAN-001의 코드 삭제로 낡았다(0.4.1에서 하드코딩 제거). 위 §E.2 M1 사전 점검 표의 `702 / 32 files`는 **2026-07-30 당시의 실측 기록이므로 덮어쓰지 않는다** — 관측 기록과 미래 지시를 분리한다.

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

### M2 — 기기별 저장소 + 배타 생성 + 툼스톤 (완료, 2026-08-03)

**판정: M2 통과.** M1이 심은 재현 테스트 2건이 `it.fails`에서 **진짜 통과**로 전환됐고(전후 대조 후반부 성립), 검증 3종이 모두 exit 0이며, PRESERVE 3파일은 새 기준선 대비 **변경 0건**이다.

#### 변경 파일 (6)

| 파일 | 성격 |
|---|---|
| `src/backend/ime-session-store.ts` | 주 변경 — 단일 파일 맵 → 기기별 레코드 + 배타 생성 + 툼스톤 |
| `src/backend/ime-session-store.test.ts` | 테스트 확장 + M1 하네스 조정 + 계약 반전 반영 |
| `src/cli/router.test.ts` | arg1 의미 변화(파일→디렉터리) 대응. `imeStorePath` → `imeSessionsDir` |
| `spec.md` · `plan.md` · `progress.md` | 0.4.1 사실 정정 + 기준선 재설정(위 절) |

#### 검증 3종 (실측)

```
$ pnpm test       → Test Files 26 passed (26) · Tests 571 passed (571), exit 0
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

M2 착수 시점 기준선은 `554 passed | 2 expected fail (556)`이었다. **`expected fail`이 0이 된 것이 M2의 게이트 신호**다 — `it.fails`가 스스로 FAILURE를 보고했고 그 신호에 따라 modifier를 제거했다. 순증 15건은 M2가 추가한 테스트다.

#### AC 매트릭스 — 관측한 것만

| AC | 판정 | 근거 |
|---|---|---|
| AC-002 (인터리빙 유실 없음) | **PASS** | 배리어 하네스 실행, 두 시리얼 모두 조회됨. M1의 FAIL → M2의 PASS 전환 관측 완료 |
| AC-021 (동시 부재식 기록에서 먼저 쓴 값 보존) | **PASS** | 같은 하네스, `ime.first` 생존 + **생성 시도 2회** 관측 |
| AC-022 (EEXIST가 오류로 새어 나가지 않음) | **PASS** | `createFailingIO("EEXIST")` → `resolves.toBeUndefined()` |
| AC-027 (비-`EEXIST`가 거부로 전파) | **PASS** | `ENOENT`·`EACCES`·`ENOSPC` 3종 모두 `rejects.toThrow()` |
| AC-001 (시리얼별 파일 분리) | **PASS** | 경로 상이 + 레코드 내용이 전체 맵이 아님을 파일에서 직접 확인 |
| AC-004 (특수문자 시리얼 비충돌) | **PASS** | `192.168.1.5:5555` vs `192_168_1_5_5555` 분리 |
| AC-006 (예약 문자 잔존 없음) | **PASS** | `/` `\` `:` `.` 모두 부재 |
| AC-015 (clear 후 3가지 상태) | **PASS** | 레코드 부재 · 툼스톤 존재 · 조회 `undefined` 3건 모두 단정 |
| AC-016 (기록 없는 clear의 멱등성) | **PASS** | 미추적 시리얼 clear + 2회 연속 clear |
| AC-017 (공개 메서드 3개 시그니처 불변) | **PASS** | 시그니처 grep 일치 + `adb-backend.ts` 무수정 + typecheck exit 0 |
| AC-019 (기존 테스트 전부 통과) | **PASS** | 571/571 |
| AC-018 (호출자 무수정, 기준 SHA 대비 + 양성 대조) | **PASS** | 아래 PRESERVE 절 |
| AC-005 (대소문자 분리 + 볼륨 특성 관측) | **부분** | 전반부(인코더가 대소문자를 붕괴시키지 않음)만 관측. **볼륨 프로브 미구현** |
| AC-008 (손실 변환 미재사용) | **판정 불가** | 아래 별도 절 |
| AC-009·010·012·023·024·025·028 | **미착수** | M3(구 파일 폴백) 범위 |
| AC-003 (두 프로세스 실측) | **미착수** | M5 범위 |
| AC-020 (단일 기기 복원 경로) | **미관측** | 실기기 미확보 |

#### AC-008 판정 불가 — 양성 대조 대상이 소멸했다

AC-008은 "손실 있는 정리 코드(`replace(/[^A-Za-z0-9_-]/g, "_")`)를 재사용하지 않았다"를 **양성 대조 필수**로 검증한다. 실행 결과:

```
[양성 대조] grep -nF 'replace(/[^A-Za-z0-9_-]/g' src/backend/adb-backend.ts
(출력 없음)          ← 대조 대상이 존재하지 않는다

[본 검사]  grep -cF 'replace(/[^A-Za-z0-9_-]/g' src/backend/ime-session-store.ts
1                    ← 재사용이 아니라 "재사용 금지" 주석의 인용

[전수]     grep -rn 'A-Za-z0-9_-' src/
src/backend/ime-session-store.test.ts:230  (주석 인용)
src/backend/ime-session-store.ts:140       (주석 인용)
```

**그 변환은 저장소 어디에도 없다** — SPEC 작성(2026-07-29) 이후 제거됐다. 따라서 AC-008은 현재 형태로는 ① 양성 대조가 성립하지 않고 ② 본 검사가 주석 인용에 false positive를 낸다. **통과로 계상하지 않는다.**

부수적으로, 이 검사가 M2 작성 중 **내가 새로 만든 낡은 참조 2건을 잡아냈다** — 새 주석이 `adb-backend.ts:57`을 가리켰는데 그 줄은 현재 `assertSuccess` 본문이다. 두 주석 모두 줄 번호 참조를 제거하고 성질 기술로 교체했다. (교훈 재확인: 수정하면서 새 표면에 새 결함이 생긴다.)

**M4 선행 조건**: AC-008을 실행 가능한 형태로 정정해야 한다 — 대조 대상이 사라졌으므로 "재사용하지 않았다"는 인코더의 성질(단사·소문자 hex)로 검증하고, 주석 인용을 본 검사에서 배제해야 한다. 이는 `acceptance.md` 본문 수정이므로 SPEC 정정 경로로 처리한다.

#### PRESERVE 증명 (AC-018 — 새 기준선 `3b8e800` 대비)

```
$ git diff --name-only 3b8e8008893a8658303d21a326a71cf8fe35963a -- \
    src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
(출력 없음 — 변경 0건)

$ git diff --name-only 3b8e800... -- src/backend/ime-session-store.ts   (양성 대조)
src/backend/ime-session-store.ts    ← 같은 명령이 변화를 감지한다
```

양성 대조가 성립하므로 위의 빈 출력은 "명령이 고장 나서 조용한 것"이 아니라 **실제 무수정**이다.

부수 확인: 잠금 도입 없음(`lockfile|flock|mutex|semaphore` 0건 — §A.3-② 무저촉), 런타임 의존성 추가 없음(`node:fs/promises` · `node:path` + 기존 내부 import만), 구 파일 쓰기 경로 없음(`legacyStorePath()`는 M3 스텁에서 `void`로만 참조).

#### 공허 검사 방지 — 양성 대조 실험

AC-021 테스트는 **결함이 없어도 통과할 수 있는 구조**였다: 두 주체가 실제로 겹치지 않으면(A가 끝난 뒤 B가 A의 값을 보고 쓰기를 건너뛰면) 배타성이 없어도 최종값이 `ime.first`가 된다. 1차 감사가 지적한 "결함이 있어도 무조건 PASS하는 공허한 검사"와 같은 구조다. 두 가지로 막았다:

1. **관문 단정 추가** — 레코드 경로의 배타 생성 **시도 횟수 = 2**를 값 단정보다 **먼저** 확인한다. 시도가 1회로 떨어지면 하네스가 퇴화한 것이므로 테스트가 즉시 실패한다.
2. **양성 대조 실험 (스크래치, 커밋하지 않음)** — 가짜 IO의 `createExclusive`에서 `EEXIST`를 제거(= 배타성 없음)하고 같은 하네스를 실행:
   ```
   POSITIVE CONTROL observed: ime.second
   ```
   결함이 되살아나는 것을 관측했다. 즉 이 테스트는 **결함을 실제로 잡아낸다.** 실험 파일은 실행 후 삭제했고 `git status`로 잔재 없음을 확인했다.

#### 하네스 배리어 지점 이동 (약화 아님 — 지점 정정)

M1의 배리어는 `read`에 걸려 있었다. M1 시점의 `setOriginalIme`은 내부에서 `readAll()`을 했기 때문이다. M2의 `setOriginalIme`은 read-modify-write를 하지 않고 **배타 생성 한 번**으로 끝나므로 `read` 배리어에 애초에 도달하지 않는다 — 그대로 두면 테스트 ①이 게이트가 풀리지 않아 **교착**한다. 배리어를 `read` + `createExclusive` 양쪽에 걸어, "쓰기가 실제로 일어나는 지점에서 인터리빙을 강제한다"는 하네스 요건 2의 의도를 보존했다. 요건 1(경로별 키 저장소)·3(IO 주입)은 M1 그대로다.

#### 계약 반전 기록 (테스트 조정 사유)

`"overwriting an existing entry keeps only the latest value (last write wins)"` 단정을 **first-write-wins로 뒤집었다.** 통과시키려고 약화시킨 것이 아니라 REQ-007이 계약을 반대로 확정했기 때문이며, 뒤집힌 방향을 같은 강도로 단정한다. 근거: 늦게 진입한 프로세스는 이미 ADBKeyBoard로 바뀐 IME를 "원래 IME"로 관측하므로, 그것이 이기면 `reset`이 기기를 ADBKeyBoard 자체로 "복원"한다.

#### M3로 넘긴 것

- `readLegacyFallback()`은 현재 `undefined`를 반환하는 **명시적 스텁**이다(`@MX:TODO` / REQ-003). 3단계 조회의 **순서**는 M2에서 확정했고, 3단계의 **내용**이 M3다.
- `router.test.ts`의 저장 경로를 디렉터리로 정정했다. 정정 전 값(`ime-sessions.json`)을 그대로 두면 M3의 구 파일 폴백 경로(디렉터리의 형제 `ime-sessions.json`)가 그 디렉터리 자신과 충돌한다 — M2에서는 무해했으나 M3에서 함정이 된다.

#### 블로커

없음. 단 **AC-008은 M4 진입 전 SPEC 정정이 필요**하다(위).

#### 잔여 위험

- AC-021의 결정성은 두 await 체인의 길이가 같다는 성질에 의존한다. 조회 경로가 바뀌어 체인 길이가 달라지면 승자가 뒤집힐 수 있다 — 관문 단정(시도 2회)이 그 퇴화를 잡지만, 승자 자체의 결정성은 하네스 구조에 의존한다는 점을 기록해 둔다.
- 배타 생성의 원자성은 **실제 파일시스템의 `wx` 플래그**가 보장한다. M2의 증거는 그 원자성을 흉내낸 가짜 IO 위에서 얻은 것이다. 실제 두 OS 프로세스에서의 관측은 **M5**가 담당한다(§C.1-⑰ 미관측 항목).
- 123바이트 시리얼 상한은 산식으로만 확인했고 실제 경계 시리얼로 실행하지 않았다.

### M3 — 구 파일 읽기 전용 폴백 (완료, 2026-08-04)

**판정: M3 통과.** 3단계 조회의 내용이 채워졌고, 새 테스트 10건이 **변이 실험에서 실제로 결함을 잡아냈다.** 검증 3종 exit 0, PRESERVE 3파일 변경 0건.

#### 변경 파일 (3)

| 파일 | 성격 |
|---|---|
| `src/backend/ime-session-store.ts` | 주 변경 — `readLegacyFallback` 스텁 → 구 파일 맵 파싱 구현, `@MX:TODO` → `@MX:NOTE` |
| `src/backend/ime-session-store.test.ts` | 테스트 10건 추가 (AC 7건 + 견고성 3건) |
| `src/backend/adb-backend.test.ts` | 저장소 **디렉터리** 이름 `ime-sessions.json` → `ime-sessions` (1줄 + 사유 주석) |

#### 검증 3종 (실측)

```
$ pnpm test       → Test Files 26 passed (26) · Tests 581 passed (581), exit 0
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

M3 착수 시점 기준선은 **`26 files / 571 passed`**(착수 직전 실측). 순증 10건이 M3가 추가한 테스트다. 로그: `.moai/state/verify/4ca4f7d8/m3-{baseline-test,test-final,typecheck-final,build-final}.log`.

#### AC 매트릭스 — 관측한 것만

| AC | 판정 | 근거 |
|---|---|---|
| AC-009 (구 파일 전용 기록도 조회됨) | **PASS** | 구 파일만 둔 상태에서 `getOriginalIme` → 값 반환. 변이 실험에서 실패로 전환 확인 |
| AC-010 (레코드가 구 파일보다 우선) | **PASS** | 같은 시리얼에 서로 다른 값 배치 → 레코드 값 반환 |
| AC-012 (신규 설치에서 구 파일 미생성) | **PASS** | 조회·기록·무효화 3종 무오류 + 조회 `undefined` + `stat(구 파일)` reject |
| AC-023 (툼스톤이 폴백을 억제) | **PASS** | `SERIAL-A` 억제 `undefined` + **양성 대조** `SERIAL-B`는 같은 구 파일에서 값 반환 |
| AC-024 (새 세션 순서 — 중간 창 조회) | **PASS** | 주입 IO로 변경 연산마다 조회 삽입. 관문 `probes.length === 2` + `probes[1] === "ime.new"` |
| AC-025 (구 파일 전용 시리얼의 clear가 툼스톤 생성) | **PASS** | clear 전 값 조회(사전 확인) → clear → 툼스톤 존재 + 조회 `undefined` |
| AC-028 (구 파일 불변 — 존재·내용·mtime) | **PASS** | 조회·기록·무효화 3종 후 `Buffer.equals` true + `mtimeMs` 동일 |

#### 공허 검사 방지 — 변이 실험 (mutation test)

새 테스트가 **폴백을 실제로 관측하는지**를 통과 사실만으로는 알 수 없다. 그래서 구현을 M3 이전 상태로 되돌리는 변이를 넣고(`readLegacyFallback`의 값 반환을 `undefined`로 고정) 같은 스위트를 실행했다:

```
$ pnpm vitest run src/backend/ime-session-store.test.ts   (변이 적용 상태)
  × [AC-IMESTATE-009] returns a value that exists ONLY in the legacy file …
  × [AC-IMESTATE-023] a tombstone suppresses the legacy fallback …
  × [AC-IMESTATE-025] clear creates a tombstone even when the record exists ONLY in the legacy file
  × [AC-IMESTATE-028] leaves the legacy file present, byte-identical and mtime-unchanged …
  Tests  4 failed | 35 passed (39)          exit 1
```

**4건이 결함을 잡아냈다.** AC-023이 잡힌 것은 그 테스트에 심어 둔 양성 대조(`SERIAL-B`) 덕분이다 — 억제 단정만 있었다면 폴백이 통째로 고장 나도 통과했을 것이다. AC-010·024는 변이에 걸리지 않는데, 이 둘은 폴백 값이 아니라 **우선순위**와 **연산 순서**를 판정하기 때문이며 의도된 범위다.

변이 되돌림 확인: `grep -rn "TEMP MUTATION" src/` → 0건, 전체 스위트 `581 passed` exit 0 재확인.

#### 구 파일 쓰기 부재 증명 (REQ-003 / plan.md M3)

```
$ grep -n "legacyStorePath()" src/backend/ime-session-store.ts
228:  private legacyStorePath(): string {          ← 정의
277:    const raw = await this.io.read(this.legacyStorePath());   ← 유일한 사용처
```

구 파일 경로를 만드는 함수의 **호출 지점이 하나뿐이고 그것이 `read`**다. 따라서 `write`·`createExclusive`·`remove`·`rename`·`unlink` 중 어느 것도 구 파일에 닿을 수 없다. 이 검사는 없음-검사가 아니라 **전수 열거**이므로 양성 대조가 필요하지 않다(대조 대상이 소멸해 판정 불가가 된 AC-008과 구조가 다르다).

#### PRESERVE 증명 (기준 SHA `3b8e800` 대비)

```
$ git diff --name-only 3b8e800 -- \
    src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
(출력 없음 — 변경 0건)

$ git diff --name-only 3b8e800 -- src/backend/ime-session-store.ts   (양성 대조)
src/backend/ime-session-store.ts    ← 같은 명령이 변화를 감지한다
```

#### 부수 정리 — `adb-backend.test.ts`의 이름 충돌

`imeStorePath`가 저장소 **디렉터리**를 `ime-sessions.json`으로 이름 붙이고 있었다. M3의 구 파일 경로는 "디렉터리의 형제 `ime-sessions.json`"이므로, 그 이름이면 **폴백이 저장소 디렉터리 자신을 가리킨다.** 현재는 디렉터리 읽기가 실패하고 그 실패를 `null`로 삼키므로 결과는 정상(`undefined`)이지만, `router.test.ts`가 M2에서 같은 이유로 이미 정리한 함정이다. 변수명(`imeStorePath`)은 그대로 두고 값 1줄과 사유 주석만 바꿨다 — 20여 개 호출 지점을 건드리지 않기 위해서다.

#### AC-008 정정 (M4 선행 조건 — 폐쇄, 0.4.2)

M2가 "M4 진입 전 정정 필요"로 남겨 둔 AC-008을 같은 세션에서 닫았다. **판정 방법만 바꿨고 요구사항·설계 결정·다른 AC는 무변경**이다.

- **문제의 구조**: 양성 대조 대상(`adb-backend.ts`의 손실 변환)이 저장소에서 제거돼 대조가 죽었고, 대조가 비면 본 검사의 "매치 없음"이 깨끗함인지 패턴 고장인지 구별되지 않는다 — `acceptance.md:19`의 원칙 ②가 금지한 공허 검사다. **grep 표현식을 고쳐서는 닫히지 않는다**(대조 대상이 존재하지 않으므로).
- **정정**: 대조 대상을 저장소에서 **테스트 안으로** 옮겼다(테스트가 손실 변환을 직접 정의해 소유). 검사 대상도 "금지 문자열의 부재"에서 "**인코더 출력의 성질**"(`/^[0-9a-f]+$/`에만 속하고 `_`가 없다)로 바꿨다. 검증 방식 `greppable` → `unit`.
- **변이 실험 (이 AC 자신이 공허하지 않은가)**: `encodeSerialForFilename`을 손실 변환으로 바꿔치기하고 실행:
  ```
  $ pnpm vitest run src/backend/ime-session-store.test.ts -t "AC-IMESTATE-008"   (변이 적용)
    × [AC-IMESTATE-008] emits an alphabet that a lossy sanitizing transform cannot produce …
      AssertionError: expected false to be true
      Tests  1 failed | 39 skipped (40)
  ```
  **막으려던 결함 그 자체를 잡아냈다.** 되돌린 뒤 `grep -rn "TEMP MUTATION" src/` → 0건, 전체 `582 passed` exit 0 재확인.
- **문서 명령이 실제로 도는지 확인**: `plan.md` §E가 지시하는 명령을 그대로 실행 → `Tests 1 passed | 39 skipped (40)`. 지시와 실행이 일치한다.
- **죽은 grep 잔재 처분 — 관측 기록과 미래 지시를 분리했다**(0.4.1이 세운 원칙): 저장소 전체에서 옛 grep 명령 3곳을 찾았고 **1곳만 고쳤다.**
  - `plan.md:105`(§C 사전 점검 표 행 8) — **미래 지시**다. 대상이 사라진 명령을 그대로 두면 사전 점검이 매번 거짓 실패하므로 새 unit 명령으로 교체했다.
  - `progress.md:250`(M1 사전 점검 표) · `progress.md:382`(M2 판정 불가 절) — **관측 기록**이다. "2026-07-30/08-03에 이 명령을 돌려 무엇을 봤나"의 기록이므로 원문을 보존한다. 덮어쓰면 AC-008이 왜 죽었는지의 증거가 사라진다.

#### 블로커

없음. **AC-008의 M4 선행 조건은 폐쇄됐다**(위). M4는 §E 자체 검증을 그대로 실행할 수 있다.

#### 잔여 위험

- AC-028의 mtime 단정은 "파일을 건드리지 않았다"를 macOS/APFS의 mtime 해상도 위에서 관측한 것이다. 되쓰기가 **같은 밀리초 안에** 일어나면 이론상 통과할 수 있다. 다만 되쓰기 구현은 위 "쓰기 부재 증명"(호출 지점 전수 열거)에서 먼저 걸린다 — 두 증거가 서로를 보완한다.
- 구 파일 폴백은 **호스트 파일 I/O만** 관여하므로 실기기가 필요 없다. 그러나 실제 사용자 캐시에 존재하는 구 파일의 실물 형태(예: 예전 버전이 남긴 필드 구성)로는 실행하지 않았다 — 합성 fixture로만 검증했다.
- `readLegacyFallback`은 맵의 항목 하나만 검사하므로, 구 파일에 손상된 항목이 섞여 있어도 **다른 시리얼의 조회는 영향받지 않는다.** 이 격리는 코드 구조상 성립하지만 손상 항목 혼재 케이스로 직접 실행하지는 않았다(견고성 테스트는 항목 단위 모양 오류만 다룬다).

### M4 — 회귀 확인 (완료, 2026-08-04)

**판정: M4 통과 (단, AC-020은 미관측).** `plan.md` §E 자체 검증을 전건 실행했고 모두 기대대로다. 코드 변경은 없다 — 검증만 수행했다.

#### §E 자체 검증 (실측)

```
$ pnpm test       → Test Files 26 passed (26) · Tests 582 passed (582), exit 0
$ pnpm typecheck  → exit 0
$ pnpm build      → exit 0
```

AC-018 (호출자 무수정, `$BASE` = `3b8e800` — M2에서 재설정한 기준):

```
[① 양성 대조 — 이 SPEC이 반드시 수정하는 파일이 감지되는가]
$ git diff --name-only 3b8e800 -- src/backend/ime-session-store.ts
src/backend/ime-session-store.ts        ← 감지된다. 아래 빈 출력이 "명령 고장"이 아님을 보증

[② 내용 차이 — PRESERVE 3파일]
$ git diff --name-only 3b8e800 -- \
    src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
(출력 없음)

[③ 커밋 이력 — 원상 복구된 변경까지 잡는다]
$ git log --oneline 3b8e800..HEAD -- \
    src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
(출력 없음)
```

AC-008 (0.4.2 정정 후 첫 정식 판정):

```
$ pnpm vitest run src/backend/ime-session-store.test.ts -t "AC-IMESTATE-008"
  Test Files  1 passed (1) · Tests  1 passed | 39 skipped (40)
```

M2에서 **판정 불가**였던 항목이 M4에서 처음으로 판정됐다. 이것이 정정의 목적이었다.

#### 테스트 조정 여부 — 단정 약화 없음

`plan.md` M4는 "조정이 필요한 테스트가 있으면 조정 사실과 이유를 기록한다. 통과시키기 위해 단정을 약화시키는 것은 금지한다"를 요구한다. M2 커밋(`1bad249`) 대비 **M3·정정이 제거한 줄은 정확히 2개**이며 둘 다 단정이 아니다:

```
$ git diff 1bad249 -- src/backend/ime-session-store.test.ts | grep '^-[^-]'
-import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";   ← stat 추가로 교체

$ git diff 1bad249 -- src/backend/adb-backend.test.ts | grep '^-[^-]'
-    imeStorePath = join(imeStoreDir, "ime-sessions.json");   ← 임시 디렉터리 이름

$ git diff 1bad249 -- src/cli/router.test.ts | grep '^-[^-]'
(제거된 줄 없음)
```

**기존 단정은 한 줄도 건드리지 않았다.** M2가 뒤집은 계약 반전(last-write-wins → first-write-wins)은 M2 절에 이미 기록돼 있으며 M3·M4에서는 추가 조정이 없었다.

`3b8e800` 대비로 세면 `ime-session-store.test.ts`의 제거 줄이 100개로 나오는데, 그것은 **M2의 작업**(단일 파일 → 기기별 배치 전환, `it.fails` 제거)이며 M2 절이 근거를 기록하고 있다. 기준을 `1bad249`로 옮겨야 M3 이후의 조정만 분리된다 — 기준을 잘못 잡으면 남의 작업을 내 조정으로 오인한다.

#### 잠금 미도입 — 코드 리뷰 (grep 아님)

`plan.md` §E는 이 확인을 **grep으로 하지 않는다**고 정했다(양성 대조를 붙일 대상이 없는 없음-검사이므로). 코드 리뷰 판정: `readLegacyFallback`이 추가한 것은 `io.read` 1회 + `JSON.parse` + 모양 검사뿐이며, **대기·타임아웃·재시도·부생 상태를 만드는 구조가 없다.** 보조 확인으로 구현 파일 전수 스캔 결과 `lock|flock|mutex|semaphore|setTimeout|setInterval|sleep|retry|while (` 매치 0건이었고, 같은 패턴이 `adb-backend.ts`·`ime-errors.ts`·`ime-enable-retry-predicate.ts`에서는 매치한다(패턴이 죽지 않았다는 대조). 다만 이 스캔은 보조 근거이며 판정 주체는 코드 리뷰다.

#### AC-020 — 사후 관측 성립 (2026-08-04, 같은 날 실기기 확보)

**아래 "미관측" 절은 관측 시점의 기록이므로 원문을 보존한다.** 그 직후 사용자가 Android 실기기를 무선 연결해 **AC-020을 실제로 관측했고 PASS로 전환**했다. 관측 기록과 이후 사실을 분리한다(0.4.1 원칙).

기기: `SM_S938N` (Android 16), 무선 디버깅, 시리얼 `192.168.219.106:36807`.

**사전 정리 — 기기가 이미 오염된 상태였다.** 관측 시작 시점의 기기 기본 IME가 이미 `com.android.adbkeyboard/.AdbIME`였다. 이전 작업이 복원하지 않고 종료한 것이다. 이 상태에서 그대로 `text`를 실행하면 저장소가 **"원래 IME = ADBKeyBoard"로 기록**하고, 이후 `reset`이 기기를 ADBKeyBoard 자체로 "복원"한다 — `spec.md` §A.3-⑤가 경고한 실패 모드 그대로다. 따라서 구 파일에 기록돼 있던 진짜 원래 IME(삼성 키보드)로 **먼저 되돌려 깨끗한 기준선을 만든 뒤** 관측했다.

**관측 시퀀스 (실측)**

```
[1] 입력 전 IME        → com.samsung.android.honeyboard/.service.HoneyBoardService
[1] 입력 전 저장소      → ~/.cache/explore-mobile/ime-sessions/ 없음 (새 배치 미생성)

[2] text "한글입력테스트" → {"ok":true,"command":"text"}

[3] 입력 직후 IME      → com.android.adbkeyboard/.AdbIME          (전환됨)
[3] 입력 직후 저장소    → ime-sessions/3139322e...3336383037.json  (레코드 생성)
    내용: {"originalIme":"com.samsung.android.honeyboard/.service.HoneyBoardService",
           "serial":"192.168.219.106:36807"}
[3] 화면               → 검색창에 "한글입력테스트" 정확히 반영(스크린샷 확인, 깨짐·누락 없음)

[4] reset             → {"ok":true,"imeReset":true,"originalImeRestored":true,
                          "adbKeyboardDisabled":true,"adbKeyboardUninstalled":true,"warnings":[]}

[5] reset 직후 IME     → com.samsung.android.honeyboard/.service.HoneyBoardService  ← 복원 성립
[5] reset 직후 저장소   → .json 제거 · .cleared 생성 (§A.3-⑦ 순서 계약대로)
    툼스톤 내용: {"serial":"192.168.219.106:36807"}
```

**AC-020 판정: PASS.** Then의 두 조건(입력이 정상 반영 / IME가 입력 전의 것으로 복원)이 모두 관측됐다.

**부수 관측 — 합성 테스트가 줄 수 없던 실사용 증거 4건**

1. **M2의 기기별 배치가 실기기에서 성립했다.** 파일명 `3139322e3136382e3231392e3130363a3336383037`를 역변환하면 정확히 `192.168.219.106:36807`이다(AC-002 추적성이 실물로 확인됨).
2. **실제 시리얼에 `.`과 `:`가 둘 다 들어 있다.** 기각된 손실 변환 `replace(/[^A-Za-z0-9_-]/g, "_")`이 정확히 붕괴시키는 문자다 — §A.3-④의 기각 근거가 가정이 아니라 **이 사용자의 실제 기기 시리얼 형식**임이 확인됐다. AC-004·008이 지키는 것이 실재한다.
3. **AC-028이 실사용에서 성립했다.** 조회(폴백 유발) · 기록 · 무효화를 모두 거친 뒤 구 파일은 `138 bytes / mtime 8월 2 22:10`로 **크기·mtime 모두 불변**이었다. 합성 테스트와 같은 결론을 실물에서 재확인했다.
4. **M3의 폴백이 실제로 실행됐다.** `[1]` 시점에 레코드도 툼스톤도 없었으므로 조회가 3단계로 내려가 구 파일을 읽었고, 키가 없어 `undefined`를 반환했다(아래 시리얼 불안정 참조). M3 이전이었다면 같은 경로가 스텁이었다.

**신규 발견 — 무선 Android에서 시리얼은 재연결을 넘기지 못한다 (SPEC 미기록 노출면)**

구 파일에 남아 있던 기록의 키와 현재 연결 시리얼이 다르다:

```
구 파일의 키 : adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp
현재 연결    : adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp   ← " (2)" 중복 표식
             : 192.168.219.106:36807                              ← IP:포트도 재연결마다 변함
판정         : 두 연결 시리얼 모두 "기록 없음"
```

또한 **같은 폰 1대가 시리얼 2개**(IP 연결 + mDNS 연결)로 동시에 잡힌다. 저장소는 REQ-002에 따라 시리얼을 키로 쓰는데, 무선 Android에서는 그 키가 ① 재연결 시 mDNS 이름에 중복 표식이 붙고 ② IP:포트가 바뀌며 ③ 한 기기가 두 키를 갖는다. 즉 **키가 기기를 안정적으로 식별하지 못한다.**

이것은 M3의 결함이 아니다 — 폴백은 정상 동작했고 키가 없어 `undefined`를 반환했을 뿐이다. 그러나 이 SPEC이 닫으려는 결함(복원 기록 유실)과 **사용자에게 보이는 증상이 같다**: 이번 관측 직전 기기가 ADBKeyBoard에 묶여 있었던 것이 바로 그 증상이다. 시리얼 안정성은 이 SPEC의 범위가 아니므로 **관측 사실만 기록하고 후속 판단에 넘긴다**.

**환경 발견**: `adb`가 `~/Library/Android/sdk/platform-tools/adb`에 설치돼 있으나 PATH에 없어 `doctor`가 `{"adb":{"installed":false}}`로 판정했다. `ANDROID_HOME`이 설정돼 있어도 CLI가 그것을 참조하지 않는다. 관측은 명령마다 PATH를 앞에 붙여 수행했다.

**관측 중 발생한 오조작 1건 (기록)**: 5분 전 스크린샷의 대화상자 버튼 좌표를 그대로 탭했는데 그 사이 대화상자가 사라져 있어 **홈 화면의 앱 아이콘을 눌러 Play Console이 실행됐다.** 홈 키로 즉시 복구했고 이후에는 좌표 탭 대신 `launch` 명령을 쓰고, 탭이 필요한 곳은 **직전에 찍은 화면**을 기준으로 삼았다. 화면 상태는 시간이 지나면 변한다 — 낡은 스크린샷의 좌표는 좌표가 아니다.

**기기 정리 상태**: 검색 화면을 닫고 홈으로 복귀했으며, `reset`이 ADBKeyBoard를 제거했음을 `pm list packages`로 확인했다(설치 목록에 없음). 기본 IME는 삼성 키보드다.

#### AC-020 — 미관측 (Android 실기기 미확보) — 관측 시점 기록, 원문 보존

```
$ node dist/cli/bin.js devices
{"ok":true,"data":[
  {"serial":"00008103-…","model":"iPad Pro (12.9-inch) (5th generation)","connectionState":"offline","platform":"ios"},
  {"serial":"00008130-…","model":"iPhone 15 Pro Max","connectionState":"offline","platform":"ios"}]}
```

연결된 기기는 iOS 2대뿐이고 둘 다 `offline`이다. 이 SPEC의 IME 세션 저장소는 **Android 전용**(ADBKeyBoard 전환/복원)이므로 단일 기기 복원 경로를 실행할 수 없다. `plan.md` M4의 단서("실기기 확보 시")에 따라 **미관측으로 기록하고 PASS로 계상하지 않는다**(`acceptance.md` 원칙: 관측하지 않은 것을 PASS로 기록하지 않는다).

#### AC 매트릭스 갱신

| AC | 판정 | 근거 |
|---|---|---|
| AC-018 (호출자 무수정) | **PASS** | 양성 대조 성립 + ②③ 빈 출력 |
| AC-019 (기존 테스트 전부 통과) | **PASS** | 582/582, 단정 약화 0건 |
| AC-008 (인코더가 손실 변환일 수 없음) | **PASS** | 0.4.2 정정 후 unit 1 passed. M2의 판정 불가 해소 |
| AC-005 (대소문자 분리 + 볼륨 프로브) | **부분** | M2와 동일 — 전반부만 관측, 볼륨 프로브 미구현 |
| AC-020 (단일 기기 복원 경로) | **PASS** | 실기기 `SM_S938N` 관측 — 입력 반영 + `originalImeRestored:true` + IME 복원 확인(위 사후 관측 절). 최초 기록은 미관측이었고 같은 날 실기기 확보로 전환 |
| AC-003 (두 프로세스 실측) | **미착수** | M5 범위 |

#### 블로커

없음. M5(두 프로세스 실측) 진입 가능.

#### 잔여 위험

- ~~AC-020이 미관측이므로 실제 기기에서의 단일 기기 복원 경로가 한 번도 실행되지 않았을 수 있다~~ — **해소됨**(같은 날 실기기 관측). `adb` 명령 조립부터 IME 전환·복원까지의 전 경로가 실기기에서 1회 성립했다.
- **남은 위험은 시리얼 안정성으로 옮겨갔다.** 무선 Android에서 시리얼이 재연결을 넘기지 못하므로(위 신규 발견), 세션 기록이 있어도 다음 연결에서 조회 키가 달라져 복원 대상을 못 찾을 수 있다. 이번 관측은 **한 연결 안에서** `text`→`reset`을 마쳤으므로 이 문제를 건드리지 않았다. 연결이 끊겼다 다시 붙는 사이에 `text`와 `reset`이 나뉘면 복원은 실패한다 — 이 SPEC의 범위 밖이지만 사용자에게 보이는 증상은 이 SPEC이 없애려는 것과 같다.
- 관측은 **1회 · 1기기 · 유선 아님**이다. 유선 연결(시리얼이 안정적인 경우)과 2대 동시 시나리오는 여전히 미관측이다.
- AC-005의 볼륨 무구분성 프로브가 여전히 미구현이다 — 대소문자 무구분 볼륨에서의 실제 충돌 부재는 인코더의 성질(소문자 hex 단일 계열)로만 논증했고 실행으로 확인하지 않았다.

### M5 — 두 프로세스 실측 (완료, 2026-08-04)

**판정: M5 통과. AC-003 PASS — 전후 대조가 성립해 "유실 부재 확인"을 넘어 "결함 해소 증명"까지 주장한다.** 코드 변경은 없다 — 실측만 수행했다.

#### 하네스 (재현 절차)

빌드 산출물 `dist/backend/ime-session-store.js`를 직접 임포트하는 워커 2개를 **별개 OS 프로세스**로 띄우고, 두 프로세스가 모듈 로드를 끝낸 뒤 **같은 시각에 출발**하도록 배리어를 건다(`while (Date.now() < startAt) {}`). CLI `text`를 거치지 않으므로 실기기·adb가 개입하지 않는다(`acceptance.md` AC-003 판정 하네스).

워커 본문(두 프로세스가 동일, 환경변수만 다름):

```js
const { ImeSessionStore } = await import(process.env.DIST_URL);
const startAt = Number(process.env.START_AT);
while (Date.now() < startAt) { /* 배리어 — 같은 순간에 출발 */ }
await new ImeSessionStore(process.env.STORE_ARG).setOriginalIme(
  process.env.SERIAL, process.env.VALUE,
);
```

한 회차: 새 임시 디렉터리 → `START_AT = Date.now() + 250` → 워커 2개를 `node --input-type=module -e` 로 동시 spawn(`SERIAL-A`/`ime.alpha`, `SERIAL-B`/`ime.beta`) → 양쪽 `wait` → 세 번째 프로세스가 두 시리얼을 조회. `ime.alpha|ime.beta` 이면 `BOTH_SURVIVED`, 그 외는 `LOST`. 20회 반복.

**생성자 인자의 의미가 버전 간에 다르므로 하네스가 모드를 받는다** — 수정 전은 파일(`<tmp>/ime-sessions.json`), 수정 후는 디렉터리(`<tmp>/ime-sessions`). 두 경우 모두 "두 프로세스가 같은 저장소를 공유한다"는 시나리오 동등성은 유지된다.

수정 전 산출물은 작업트리를 건드리지 않고 만들었다: `git worktree add --detach <tmp> 3b8e800` → `node_modules` 심링크 → `tsc -p <tmp>/tsconfig.build.json`(exit 0) → 실측 후 `git worktree remove --force`. 제거 후 `git status --porcelain | grep -v '^??' | wc -l` → `0`.

#### 실측 — 수정 전 (`3b8e800`, 양성 대조)

```
mode=file rounds=20 both_survived=0 lost=20 worker_nonzero_exit=0
```

20회 전부 유실. 이 결과가 **하네스의 양성 대조**를 겸한다 — 수정 후의 "유실 0"이 패턴 고장이 아니라 실제 부재임을 보증한다(`acceptance.md:19` 원칙 ②). 유실은 두 양상으로 갈렸다:

```
round 4:  LOST  (ime.alpha|MISSING)   ← 8회: 한쪽만 생존 (전형적 lost update)
round 2:  LOST  (MISSING|MISSING)     ← 12회: 양쪽 모두 소실
```

**`MISSING|MISSING`의 정체 — 신규 관측.** 실측 후 저장소 파일을 그대로 열어 확인했다(5회 재현 중 3회):

```
$ wc -c < <tmp>/ime-sessions.json
54
$ cat <tmp>/ime-sessions.json
{
  "SERIAL-B": {
    "originalIme": "ime.beta"
  }
}}
```

두 프로세스의 쓰기가 **바이트 수준에서 겹쳤다**. `"ime.beta"`(53바이트)가 `"ime.alpha"`(54바이트)보다 1바이트 짧아, 나중 쓰기가 채우지 못한 마지막 1바이트에 앞선 쓰기의 `}`가 남아 파일이 `}}`로 끝난다. 유효하지 않은 JSON이 되고, 읽기 견고성 규약(REQ-004: 깨진 JSON → `undefined`)에 따라 **두 기록이 모두** `undefined`가 된다.

즉 수정 전 결함은 SPEC이 기술한 덮어쓰기(`spec.md` §A.1 결함 ①)보다 한 단계 더 나쁜 양상을 포함한다 — **한쪽 유실이 아니라 저장소 파일 자체의 손상**이며, 그 기기뿐 아니라 **그 파일에 기록된 모든 기기의 세션이 동시에 소실**된다. 이 양상은 SPEC 어느 문서에도 기술되어 있지 않았다(M1의 mock 하네스는 주입 IO가 경로별 키 저장소라 바이트 겹침이 일어날 수 없어 구조적으로 관측 불가였다). 수정 후 배치에서는 기기별로 파일이 분리되고 생성이 배타적이므로 이 양상 자체가 성립하지 않는다.

#### 실측 — 수정 후 (현재 `HEAD`)

```
mode=dir rounds=20 both_survived=20 lost=0 worker_nonzero_exit=0
```

20회 전부 양쪽 생존. 워커 비정상 종료 0건 — 배타 생성의 `EEXIST` 처리가 정상 결과로 흡수되고 다른 실패는 나오지 않았다.

#### 정직성 조건 처리 (`acceptance.md` AC-003)

AC-003은 "수정 전 동일 시나리오에서 유실이 관측되지 않았다면 유실 부재 확인까지만 주장한다"고 단서를 단다. **이번에는 수정 전 유실이 20/20으로 관측됐으므로 그 단서에 걸리지 않는다** — 전후 대조가 성립하고, AC-003은 결함 해소 증명으로 PASS한다.

#### `spec.md` §C.1-⑰ 갱신 — 절반만 관측으로 전환

⑰은 두 문장이고 둘의 운명이 다르다. 뭉뚱그리면 미관측을 관측으로 부당 승격시키게 되므로 나눠 적는다.

| ⑰의 구성 | 이번 관측 후 상태 |
|---|---|
| "별개 OS 프로세스 2개에서 **자연 발생하는 유실**은 관측하지 않았다" | **관측으로 전환.** 코드 내부를 조작하지 않았다 — 주입 IO도, read 배리어도 없다. 실제 파일시스템 위에서 실제 OS 스케줄링이 만든 겹침이다. ⑪(주입 IO의 강제 인터리빙)과 성격이 다르다 |
| "**실사용 발생 빈도**는 미측정" | **여전히 미측정.** 하네스는 두 프로세스의 **출발 시각을 250ms 배리어로 정렬**해 충돌 확률을 의도적으로 끌어올렸다. 실사용에서 두 `text` 호출이 이렇게 정렬되지는 않으므로 `20/20`은 실사용 빈도가 아니다 |

배리어가 조작하는 것은 **출발 시각뿐**이고, 출발 후 두 프로세스가 어떻게 겹치는지는 OS가 결정한다 — 그래서 전자가 관측으로 넘어간다. 하지만 그 정렬이 확률을 높인 것도 사실이므로 후자는 넘어가지 않는다.

#### 실기기 2대 병렬 — 미관측 (기기 미확보)

`plan.md` M5 3번째 항목(Android 2대로 `text` 한글 병렬 → `reset` 양쪽 복원)은 **기기 미확보로 미관측 기록 후 마감**한다(`plan.md` M5 단서 · `spec.md` §C.3).

```
$ adb devices
List of devices attached
192.168.219.106:36807                              device
adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp   device
```

목록은 2줄이지만 **같은 기기 1대**다. 각 시리얼에 하드웨어 식별자를 물어 확인했다:

```
$ adb -s 192.168.219.106:36807 shell getprop ro.serialno            → R3CY106LKVX
$ adb -s "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp" ...     → R3CY106LKVX
$ (두 시리얼 모두) shell getprop ro.product.model                    → SM-S938N
```

무선 Android 한 대가 시리얼 2개로 잡히는 현상은 M4에서 이미 관측된 것과 같다. **`adb devices`의 줄 수를 대수로 세면 여기서 틀린다** — 2대로 오인하고 병렬 시나리오를 "실행했다"고 기록할 뻔한 지점이다.

#### AC 매트릭스 갱신

| AC | 판정 | 근거 |
|---|---|---|
| AC-003 (두 프로세스 실측) | **PASS** | 수정 전 20/20 유실 → 수정 후 20/20 생존. 전후 대조 성립, 정직성 조건 단서에 걸리지 않음 |
| AC-020 (단일 기기 복원 경로) | **PASS** | M4에서 실기기 관측 완료 (변동 없음) |
| AC-005 (대소문자 분리 + 볼륨 프로브) | **부분** | M2·M4와 동일 — 볼륨 프로브 미구현 |
| Android 2대 병렬 (`plan.md` M5 3번째 항목, AC 없음) | **미관측** | 기기 1대만 확보. 위 실측으로 대수 확인 |

#### 블로커

없음. run-phase 마감.

#### 잔여 위험

- **실사용 빈도는 여전히 미측정**이다(위 ⑰ 표 후반부). 배리어 없이 자연 발생하는 충돌의 확률은 관측하지 않았고, 이 SPEC은 그것을 요구하지도 않는다 — 확률과 무관하게 구조적으로 불가능하게 만드는 것이 REQ-001·007의 접근이다.
- **파일 손상 양상은 구 파일에 대해 아직 열려 있다.** 수정 후 신규 기록은 기기별 파일로 가지만, 구 단일 파일(`ime-sessions.json`)은 읽기 전용 폴백 대상으로 영구히 남는다(REQ-003). 이 SPEC의 코드는 구 파일에 **쓰지 않으므로** 새로 손상시키지 않는다(AC-028이 판정). 다만 이 SPEC 이전 버전이 이미 손상시켜 둔 구 파일이 있다면 그 내용은 읽기 실패로 `undefined`가 되고, 해당 기기는 폴백 복원 대상에서 조용히 빠진다 — 관측된 바 없고, 관측할 방법도 이 SPEC 범위에 없다.
- 무선 Android 시리얼 불안정성(M4 잔여 위험)은 그대로다. 2대 병렬 시나리오가 미관측이므로, 서로 다른 두 기기가 동시에 `text`를 수행하는 실경로는 여전히 호스트 측 실측으로만 뒷받침된다.
- 20회는 통계적 신뢰구간을 주장할 표본이 아니다. 수정 전 20/20 · 수정 후 20/20이라는 **완전 분리**가 근거이지, 회차 수 자체가 근거가 아니다.

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-04
milestones: M1 (재현 게이트) · M2 (기기별 저장소) · M3 (구 파일 폴백) · M4 (회귀 확인) · M5 (두 프로세스 실측) — 전건 완료
base_sha: 3b8e800 (M2에서 재설정 — AC-018이 사용)
tests: 582 passed (26 files), typecheck exit 0, build exit 0
```

AC 최종 현황: 활성 25건 중 **PASS 24건 · 부분 1건**(AC-005 — 볼륨 무구분성 프로브 미구현, 인코더 성질로만 논증). 폐기 3건(AC-011·013·026)은 0.4.0 범위 축소 시 처분됐다.

미관측으로 남기고 마감하는 항목 2건 — 둘 다 관측하지 못했음을 기록하며, PASS로 계상하지 않는다:

1. **Android 2대 병렬** (`plan.md` M5) — 기기 미확보. `adb devices` 2줄이 같은 기기임을 하드웨어 시리얼로 확인.
2. **AC-005 볼륨 무구분성 프로브** — 실제 캐시 디렉터리 볼륨의 대소문자 무구분 여부를 실행으로 확인하지 않았다(`spec.md` §C.1-⑲ 유지).

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
