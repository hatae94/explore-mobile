# SPEC-VISION-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-02
tier: L
artifacts: spec.md, plan.md, acceptance.md, design.md, research.md
```

### 기준 커밋

```
base_commit_sha: 181199e2541da961c3679f6e224573ce742dcd2d
branch: master
```

이 SHA가 `acceptance.md` AC-VISION-029(`git diff --name-only <기준SHA>..HEAD -- src/webview/`)의 `<기준SHA>`다.

### 착수 전 확인된 작업 트리 상태

- `src/backend/ime-*.ts`, `adbkeyboard*.ts`, `per-serial-state.ts` — 미커밋 변경 없음 (2026-08-02 확인). SPEC-IMESTATE-001(`in-progress`)과의 파일 충돌 위험이 현재 없다.
- `plan.md` §A.3의 병행 SPEC 회피 절차는 각 마일스톤 착수 시점에 재확인한다.

---

## §E.2 Run-phase Evidence

(run-phase 진입 시 manager-develop이 작성)

---

## §E.3 Run-phase Audit-Ready Signal

(run-phase 완료 시 작성)

---

## §E.4 Sync-phase Audit-Ready Signal

(sync-phase 완료 시 작성)

---

## §F Phase 4 Mode Selection

(run-phase 첫 `Agent()` 스폰 전 오케스트레이터가 작성)

---

## §G 결정 기록 (마일스톤에서 확정할 항목)

`design.md` §F가 미확정으로 남긴 항목들. 각 항목은 해당 마일스톤에서 확정하고 **결정과 근거를 여기에 기록**한다.

| 항목 | 확정 시점 | 상태 | 결정 · 근거 |
|---|---|---|---|
| WDA 창 크기 엔드포인트 존재·형식 | M3 | 미확정 | |
| WDA 세션 ID 재획득 절차 | M3 | 미확정 | |
| 시뮬레이터 목록(`simctl`) 존치 여부 | M3 | 미확정 | |
| `dump --web` 존치 여부 | M2 | 미확정 | (AC-VISION-032가 이 칸의 기록을 요구한다) |
| iOS 배율 실측값 | M3 | 미확정 | 인용값 ÷3과 대조 예정 |
| `webkit-errors.ts` idb 참조 처리 | M4 | 미확정 | 실제 호출 / 문자열 언급 여부에 따라 |

---

## §H 미검증 항목 인계 (plan-phase 시점)

`research.md` §6이 열거한 Gap 중 plan-phase에서 닫히지 않은 것들. run-phase가 상속한다.

1. iOS 성능 수치는 전부 이전 세션 인용(②)이다. 오늘 확인한 것은 WDA `/status` ready 응답뿐이다.
2. WDA `/window/size` 엔드포인트를 실행해 본 적이 없다.
3. idb 제거 후 성능은 산술 추정이며 실측이 아니다.
4. iOS에서 `idb describe-all`을 오늘 실행하지 않았다 — 실기기 UI 명령 실패는 인용이다.
5. Android `wm size`를 `scroll` 경로에 실제로 연결해 보지 않았다(명령 자체는 관측했다).
6. 무선 adb에서만 측정했다. USB 연결의 지연 특성은 다를 수 있다.

이 목록은 `acceptance.md`의 D 등급 AC들이 닫는다. **U 통과로 대체 판정하지 않는다.**
