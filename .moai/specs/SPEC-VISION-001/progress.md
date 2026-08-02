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

### M2 — dump + 네이티브 셀렉터 제거

**주장**: 읽기 경로가 스크린샷 하나로 좁혀졌다. UI 계층 덤프 메서드가
`DeviceBackend`와 두 백엔드 구현에서 사라졌고, `dump` 명령과
`tap`/`text`의 `--id`/`--text` 셀렉터 모드가 제거됐다. 제거된 플래그는
조용히 좌표 탭으로 대체되지 않고 `INVALID_ARGS`로 거부된다. `--web`
CSS 셀렉터 경로는 변경되지 않았다.

**증거** (실제 실행한 명령과 관측한 출력):

```
$ pnpm typecheck                                   -> exit 0
$ pnpm build                                       -> exit 0
$ pnpm test                                        -> exit 0
   Test Files  29 passed (29)
   Tests  656 passed | 2 expected fail (658)
$ grep -rn 'dumpUiHierarchy' src                   -> 0건        (AC-VISION-006)
$ grep -c 'dumpUiHierarchy' src/cli/commands/scroll.ts -> 0      (AC-VISION-001)
$ grep -n 'getScreenSize' src/schema/device-backend.ts -> 211행  (AC-VISION-002)
$ grep -n '"dump"\|dump:' src/cli/router.ts        -> 0건        (AC-VISION-007)
$ grep -nE "id:\s*\{ type|index:\s*\{ type" src/cli/args.ts
   127:      index: { type: "string" }            <- id는 0건, index는 존치(§G 결정)
$ ls -1 src/normalize/                             -> webdom.ts, webdom.test.ts  (AC-VISION-010)
$ ls -1 src/schema/common-element.ts               -> 존재       (AC-VISION-011)
$ ls -1 src/normalize/webdom.ts                    -> 존재       (AC-VISION-030)
$ git diff --name-only 181199e -- src/webview/     -> 0건        (AC-VISION-029)
$ pnpm test:coverage                               -> exit 0
   All files 95.29% lines (1175/1233)
```

로그 파일: 세션 스크래치패드에 보존
(`m2-tc-final.log` / `m2-test-final.log` / `m2-build2.log` / `m2-cov.log`).

**baseline 귀속**: 착수 직전 같은 트리(HEAD = `ade7071`, M1 커밋)에서
`pnpm test`를 실행해 `713 passed | 2 expected fail (715)`를 관측했다.
M2 이후 `656 passed | 2 expected fail (658)` — **순감 57건**. 감소분의
내역은 다음과 같으며, 회귀로 인한 감소는 없다(실행 실패 0건):

- 삭제된 테스트 파일 3종: `element-query.test.ts`·`uiautomator.test.ts`·`idb.test.ts`
- 삭제된 describe 블록: `adb-backend.test.ts`의 덤프 4건, `idb-backend.test.ts`의 덤프 3건,
  `registry.test.ts`의 라우팅 1건, `router.test.ts`의 셀렉터/dump 4블록,
  `web-support.test.ts`의 `runWebDump` 4건
- 신설된 제거 회귀 가드: `args.test.ts` 2건(`it.each`), `router.test.ts` tap 4건·text 1건·dump 3건,
  `web-support.test.ts` 파스타임 거부 2건

**미검증 (Gaps)**:

1. **AC-VISION-009의 D 부분 없음** — 이 AC는 U 등급이며 U로 닫혔다
   (`args.test.ts` + `router.test.ts`의 `INVALID_ARGS` + `backend.tap`
   미호출 단언). 실기기에서 확인하지 않았다.
2. **AC-VISION-031 (D) 미검증** — `--web` CSS 셀렉터 경로의 실기기 회귀
   확인은 하지 않았다. 이번에 관측한 것은 **mock 기반 단위 테스트 통과와
   `src/webview/` 무변경(git diff 0건)**뿐이다. `web-support.ts`는
   변경했으므로 "webview 디렉터리 무변경"이 `--web` 무회귀를 증명하지
   않는다 — mock 한계 원칙에 따라 U 통과를 D 통과로 대체하지 않는다.
3. **AC-VISION-008 부분 미충족** — `--index` 절. §G 결정 참조.
4. **AC-VISION-037 (커버리지 전후 대조)** — M2 이후 수치(95.29%,
   1175/1233)만 관측했다. **제거 전 수치는 이번 세션에서 측정하지 않았다**
   — 분모 변화를 포함한 전후 대조는 M6의 몫이다(plan.md §B M6 item 7).
5. **iOS 시뮬레이터 scroll 상실을 실제로 확인하지 않았다** — §G의
   "실기기 영향 없음" 판단은 research.md 인용에 근거한다.

**잔여 위험**:

- `deriveScreenSize`(`scroll-geometry.ts`)가 생산 경로에서 호출되지 않는
  죽은 코드가 됐다. `scroll.test.ts`가 테스트 헬퍼로 쓰고 있어 테스트는
  통과하지만, 아무도 쓰지 않는 함수가 테스트와 함께 남아 있다. 이 SPEC의
  제거 목록(plan.md §A.1)에 없어 존치했으며 M3 정리 대상으로 표시했다.
- `normalizeWebDom`(비 indexed, `normalize/webdom.ts`)도 `runWebDump`
  제거로 생산 경로에서 호출되지 않는다. 이 파일은 PRESERVE
  (SPEC-WEBVIEW-001 소유, AC-VISION-030)이므로 손대지 않았다.
- `dump --web` 제거는 SPEC 기본값을 뒤집은 사용자 결정이다. 웹 DOM을
  조회할 CLI 진입점이 더 이상 없으므로, 그 기능이 다시 필요해지면 별도
  SPEC이 열려야 한다.
- 기기 열거는 아직 명령당 2회다(M5 범위). M2는 여기에 손대지 않았다.

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
| `dump --web` 존치 여부 | M2 | **결정됨(제거)** | **`dump` 명령을 웹 경로까지 전면 제거한다.** 근거: 사용자 결정(2026-08-03). 조사 결과를 제시한 뒤 선택을 받았다 — 존치안(`dump`를 웹 전용으로 축소, spec.md §C.4의 기본값)과 제거안을 대조했고 사용자가 제거를 택했다. **반대 정보(함께 기록)**: `dump --web`은 웹 DOM을 조회하는 유일한 진입점이었고(`tap --web`/`text --web`은 조작이지 조회가 아니다), spec.md §C.4는 "네이티브 dump만 제거"를 기본값으로 두었으며 REQ-VISION-007(웹뷰 회귀 금지)을 상한으로 지목했다. 즉 이 결정은 SPEC의 기본값을 사용자 권한으로 뒤집은 것이다. **회귀 범위 실측**: `runWebDump` + 자체 테스트 4건 제거. 같은 파일의 page 선택 5건·플랫폼 가드 2건은 `runInWebSession`(생존 경로) 커버리지였으므로 삭제하지 않고 `runWebTap`으로 재지정했다 — 삭제했다면 살아남은 경로의 커버리지가 함께 죽었고 그것이야말로 REQ-VISION-007 위반이었을 것이다. `--web` CSS 셀렉터 조작 경로(AC-VISION-031)는 무변경 |
| `--index` 플래그 제거 여부 (M2에서 새로 발견) | M2 | **결정됨(존치)** | **`--index`는 웹 전용 플래그로 존치한다.** plan.md §B M2 item 4와 AC-VISION-008은 `--index` 제거를 지시하지만, `web-support.ts` `readSelector`가 `tap --web "<CSS>" --index N`에 이 플래그를 쓰고 `web-support.test.ts`가 그 동작을 고정하고 있다(관측: 해당 테스트 2건). 제거하면 SPEC-WEBVIEW-001 기능이 깨진다. spec.md §C.4가 "어느 쪽이든 REQ-VISION-007이 상한"이라 못박았고 §D 제약도 `--web` 동작 유지를 명시하므로, 상한이 plan 항목과 AC 문구를 이긴다. **결과: AC-VISION-008의 `--index` 절은 명시적 미충족**(`--id` 절은 충족). acceptance.md 개정으로 AC에서 `--index`를 빼는 대안이 있으나 SPEC 본문 수정이라 이 마일스톤에서 하지 않았다 |
| iOS `getScreenSize` 화면 크기 출처 (M2에서 새로 발견) | M2 | **결정됨(undefined 강등)** | **`IdbBackend.getScreenSize`가 항상 `undefined`를 반환하도록 강등한다.** M1이 남긴 임시 구현이 UI 계층 덤프에 의존했는데(그 자체가 `@MX:UPGRADE: M3` 표시가 붙은 임시물이었다) M2가 그 메서드를 제거하므로 iOS는 M2~M3 구간에 화면 크기 출처가 없다. 추측 대신 거부를 택했다 — `SCREEN_SIZE_UNKNOWN` 계약이 그대로 유지되므로 잘못된 좌표로 되돌릴 수 없는 제스처를 보내지 않는다(REQ-VISION-001 오류 계약 보존). **실기기 영향 없음**: iOS 실기기에서 idb UI 계열 명령은 이미 실패한다(research.md §2.1, 인용). 잃는 것은 시뮬레이터 scroll뿐이며 spec.md §C.5가 시뮬레이터를 범위 밖으로 명시 이월했다. **미검증**: 이 "실기기 영향 없음" 판단은 research.md의 **인용**에 근거하며 이번 세션에서 실기기로 확인하지 않았다. M3에서 WDA `getScreenSize`가 공백을 닫는다 |
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
