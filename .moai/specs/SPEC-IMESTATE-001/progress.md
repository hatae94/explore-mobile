---
id: SPEC-IMESTATE-001
title: "기기별 IME 세션 상태 격리 — 진행 기록"
version: "0.3.0"
status: draft
created: 2026-07-29
updated: 2026-07-30
author: hatae
---

# 진행 기록 — SPEC-IMESTATE-001

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready (0.3.0 — 2차 감사 반영 완료. 최종 감사는 /moai run Phase 1 Plan Audit Gate)
plan_complete_at: 2026-07-30
plan_commit_sha: c313f0c (0.3.0) / 924cae2 (0.1.0~0.2.0 최초 커밋)
tier: M (3 artifacts — spec.md / plan.md / acceptance.md)
REQ: 8   AC: 27   추적성: 100% (미커버 0)
```

감사 반복 소진 현황: **2회 사용 / 상한 3회.** 사용자 결정으로 iter3은 별도 실행하지 않고 `/moai run` 진입 시 자동 실행되는 Phase 1 Plan Audit Gate에 남겨 둔다 — 남은 1회를 run 진입 게이트에 아끼는 선택이다.

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

## §E.2 Run-phase Evidence

(미착수 — M1 재현 게이트부터 시작한다. `plan.md` §F 참조.)
