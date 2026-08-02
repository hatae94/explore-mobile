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

### M1 — 화면 크기 소스 교체

**주장**: `scroll`이 UI 계층 덤프 없이 화면 크기를 얻는다. `DeviceBackend`에
`getScreenSize`가 추가됐고, `AdbBackend`가 `wm size`를 파싱한다.
`SCREEN_SIZE_UNKNOWN` 계약은 유지된다.

**증거** (실제 실행한 명령과 관측한 출력):

```
$ pnpm typecheck                                            -> exit 0 (오류 출력 없음)
$ pnpm build                                                -> exit 0
$ pnpm test                                                 -> exit 0
   Test Files  32 passed (32)
   Tests  713 passed | 2 expected fail (715)
$ grep -c 'dumpUiHierarchy' src/cli/commands/scroll.ts      -> 0
$ grep -n 'getScreenSize(serial' src/schema/device-backend.ts
   223:  getScreenSize(serial: string): Promise<ScreenSize | undefined>;
$ grep -n 'SCREEN_SIZE_UNKNOWN' src/cli/commands/scroll.ts  -> 119행 존재
```

로그 파일: `.moai/reports/` 외부 세션 스크래치패드에 보존
(`m1-test-final.log` / `m1-tc-final.log` / `m1-build-final.log`).

**baseline 귀속**: 착수 직전 같은 트리에서 `pnpm test`를 실행해
`702 passed | 2 expected fail (704)`를 관측했다(기준 커밋 `181199e`,
plan 커밋 `4b4ecf9` 적용 상태). M1 이후 `713 passed | 2 expected fail (715)`
— 순증 11건은 이번에 추가한 테스트 수(adb `getScreenSize` 8건 + `scroll`
REQ-VISION-001 2건 + registry 라우팅 1건)와 일치하며, 기존 통과 건수는
줄지 않았다. 기존 테스트 2건은 삭제가 아니라 **새 계약으로 재작성**했다
(dump 호출을 단언하던 자리 → `getScreenSize` 호출 단언).

**미검증 (Gaps)**:

1. **AC-VISION-003 (D)** — 실기기의 `wm size` 실제 출력을 관측하지 않았다.
   착수 시점에 `adb devices -l`이 빈 목록이었다(연결된 기기 없음). 파서는
   mock 픽스처로만 검증됐다 — `acceptance.md`의 mock 한계 원칙에 따라
   **U 통과를 D 통과로 대체 판정하지 않는다.**
2. **AC-VISION-005 (D)** — 제거 전후 scroll 좌표 동일성을 실기기에서
   대조하지 않았다.
3. **AC-VISION-004의 D 부분** — 실제 실패 상황 1회 확인이 남아 있다
   (U 부분은 `adb-backend.test.ts`의 파싱 실패·0x0 픽스처로 닫혔다).
4. iOS 경로는 이 마일스톤에서 **동작이 바뀌지 않았다** — `IdbBackend`는
   기존 덤프 파생을 그대로 감싼 임시 구현이며 M3에서 교체된다. 따라서
   M1이 목표한 "덤프 의존 제거"는 현재 Android 경로에서만 달성됐다.

**잔여 위험**:

- 파서가 `Physical size:`만 읽는다(§G 신설 항목). 화면 크기 override가
  설정된 기기에서 좌표계가 어긋날 가능성이 남아 있으며, 이는 관측되지
  않았다.
- `IdbBackend`가 `cli/commands/scroll-geometry.js`를 import한다 —
  backend 계층이 cli 계층을 참조하는 역방향 의존이다. M3에서 이 메서드와
  함께 사라지도록 `@MX:DEBT` + `@MX:UPGRADE`로 표시했다.
- 기기 열거는 아직 명령당 2회다(M5 범위). M1은 여기에 손대지 않았다.

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
| Android `wm size`의 `Override size:` 처리 | M1 결정 · M6 검증 | **결정됨(미검증)** | **`Physical size:`만 파싱한다.** 근거: plan.md §B M1(item 3 + 위험 항목)이 그 라인을 파싱 대상으로 명시했고, M1 착수 시 사용자가 그 문구를 따르기로 확정했다. **반대 정보(함께 기록)**: 같은 `wm` 계열 형제 파서 `parseEffectiveDensity`(adb-backend.ts)는 `Override density:`를 우선하며, Physical만 읽는 것이 override 활성 기기에서 **틀린 것으로 실측된 이력**이 있다(spec.md §C.1-⑱). 다만 화면 크기 override가 탭 좌표계를 지배하는지는 이 SPEC에서 **관측된 바 없다** — density의 실측을 size로 옮기는 것은 추론이므로 추론으로 코드를 정하지 않았다. 현재 동작은 `adb-backend.test.ts`의 Override 병기 픽스처가 고정하고 있어 향후 변경 시 테스트가 먼저 깨진다. M6 실기기에서 확인한다 |

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
