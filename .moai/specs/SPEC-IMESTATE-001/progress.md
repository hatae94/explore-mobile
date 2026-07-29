---
id: SPEC-IMESTATE-001
title: "기기별 IME 세션 상태 격리 — 진행 기록"
version: "0.2.0"
status: draft
created: 2026-07-29
updated: 2026-07-29
author: hatae
---

# 진행 기록 — SPEC-IMESTATE-001

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready (0.2.0 — 1차 감사 반영 후 재감사 대기)
plan_complete_at: 2026-07-29
plan_commit_sha: pending-backfill-plan
tier: M (3 artifacts — spec.md / plan.md / acceptance.md)
REQ: 8   AC: 24   추적성: 100% (미커버 0)
```

Tier M 근거: 영향 파일 5~6개 — 주 변경 `src/backend/ime-session-store.ts` 1개 + 테스트 3개(`ime-session-store.test.ts` · `adb-backend.test.ts` · `router.test.ts`) + barrel `src/index.ts`. Tier S(<5파일) 경계를 넘고 Tier L(>15파일)에는 크게 못 미친다. 마이그레이션 경로와 배타 생성·툼스톤의 정확성 요건이 인수 기준을 요구하므로 acceptance.md를 포함하는 M이 맞다.

### 착수 경로 (점검 → SPEC)

이 SPEC은 기능 요청이 아니라 **점검의 산물**이다. 로드맵의 "SPEC-04 탐색 루프" 자리표시자를 `interview.md:43`이 이미 점검 성격으로 재정의해 두었고(`spec.md` §A.1), 그 점검을 2026-07-29에 실행한 결과 두 기기 시나리오에 필요한 원시 동작 **10가지가 이미 충족**되어 있었다. 실질 갭 1건(IME 세션 저장소)을 이 SPEC이 닫고, 점검 중 추가로 드러난 1건(`CalibrationStore`)은 §C.4로 이월했다.

## §E.1.1 Plan-phase 감사 기록

### 1차 감사 (plan-auditor, 2026-07-29) — FAIL

```
verdict: FAIL
score: 0.63 / Tier M 기준 0.80
차원: Clarity 0.60 · Completeness 0.65 · Testability 0.50 · Traceability 0.85 (조화평균)
must-pass: 전부 통과 (REQ 번호 일관성 · GEARS 라벨 · frontmatter 12필드 · depends_on 상태 · clarification 마커 0)
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

### 감사에 대한 반론 1건 (SF-4 부분 기각)

감사는 *"결정적 재현은 현행 주입 표면만으로 약 15줄에 끝난다"* → 따라서 *"작성 전에 했어야 한다"*고 판정했다. **실측으로는 15줄로 되지 않는다**: 순차 `await`로 짠 첫 시도는 두 기록이 모두 살아남아 **재현에 실패**했다. `setOriginalIme`이 자기 내부에서 다시 읽으므로 겹쳐야 하는 지점이 메서드 바깥이 아니라 안쪽이고, 읽기 배리어를 넣은 뒤에야 재현됐다.

따라서 SF-4의 난이도 평가는 과했다. 다만 같은 실측이 **SF-1(하네스를 순진하게 짜면 오독한다)을 더 강하게 입증**했으므로, 그 요건을 AC-002·021의 하네스 요건 3항으로 승격하고 `plan.md` §B.4로 리스크를 재배치했다. `spec.md` §C.1의 재현 하네스 관측 단락이 이 사실을 기록한다.

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
