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

### M1·M2가 남긴 Android D등급 AC의 실기기 실측 (2026-08-03)

**주장**: M1이 미룬 AC-VISION-003·004(D 부분)·005와, M2 시점에 측정하지 않은
AC-VISION-028을 실기기에서 닫았다. 코드는 변경하지 않았다 — 검증만 수행했다.

**측정 조건 (baseline 귀속)**:

```
트리      : HEAD = 4ca5260 (M2 커밋). 추적 파일 변경 0건
기기      : R3CY106LKVX / SM-S938N / Android 16 / USB 유선
화면      : 1440x3120, density 600, 디스플레이 1개
대조 기준 : 181199e (pre-M1) — 별도 git worktree에 펼쳐 빌드. master 미변경
무대      : com.android.settings 최상위 (매 측정 전 stop -> launch로 리셋)
```

**증거** (실제 실행한 명령과 관측한 출력):

```
$ adb -s R3CY106LKVX shell wm size
Physical size: 1440x3120                                     (AC-VISION-003)

$ adb -s R3CY106LKVX shell dumpsys display | grep -c DisplayDeviceInfo
1                                                            (멀티 디스플레이 아님)

$ node dist/cli/bin.js scroll down --device R3CY106LKVX
{"ok":true,...,"from":{"x":720,"y":2262},"to":{"x":720,"y":858}}
  좌표 도출: 720 = 1440/2 · 2262 = 1560+702 · 858 = 1560-702 · 702 = (3120*0.45)/2

$ node dist/cli/bin.js screenshot --device R3CY106LKVX --out a1-before.png
$ file a1-before.png
PNG image data, 1440 x 3120                                  (AC-VISION-028: 배율 1.0)

$ node dist/cli/bin.js scroll down --device 00008130-001238880C13803A   (iPhone)
{"ok":false,"error":{"code":"SCREEN_SIZE_UNKNOWN",
 "message":"Could not determine the device's screen size."}}  (AC-VISION-004 D 부분)

제거 전후 좌표 대조 (AC-VISION-005) — 무대 리셋 후 3쌍:
  OLD(181199e)  "from":{"x":720,"y":2262},"to":{"x":720,"y":858}   x3
  NEW(4ca5260)  "from":{"x":720,"y":2262},"to":{"x":720,"y":858}   x3
  스크롤 결과 화면 스크린샷도 동일 (시계·배터리 표시만 상이)

scroll 소요 시간 (같은 기기·같은 무대, node 프로세스 기동 비용 포함):
  OLD 6039 / 6032 / 5967 ms      (평균 6013)
  NEW 3861 / 3856 / 3901 ms      (평균 3873)

$ node dist/cli/bin.js devices   (열거 2회 구조의 현재 baseline, AC-VISION-024용)
829 / 833 / 812 ms
```

**AC 판정**:

| AC | 등급 | 판정 |
|---|---|---|
| AC-VISION-003 | D | **PASS** — `wm size` 실기기 출력이 파서 가정과 일치하고, 좌표가 1440x3120에서 도출됨 |
| AC-VISION-004 (D 부분) | D | **PASS** — 실기기에서 `SCREEN_SIZE_UNKNOWN` 반환. 조용한 대체 없음 |
| AC-VISION-005 | D | **PASS** — 제거 전후 좌표 3쌍 완전 일치 + 결과 화면 동일 |
| AC-VISION-028 | D | **PASS** — 캡처 해상도 = `wm size` → 배율 1.0 |
| AC-VISION-035 | D | 절차 준수 — 모든 조작 전 스크린샷으로 무대 확인 |

**미검증 (Gaps)**:

1. **AC-VISION-004의 Android 파싱 실패는 여전히 U 단독이다.** 위 D 증거는 iOS 경로
   (M2가 `IdbBackend.getScreenSize`를 `undefined`로 강등한 §G 결정)에서 얻었다.
   이는 **설계된 실패**이지 우발적 파싱 실패가 아니다 — 형태는 같지만 원인이 다르다.
2. **AC-VISION-028은 "두 입력값이 일치한다"까지만 관측했다.** 배율을 도출하는 코드는
   아직 없다(AC-VISION-025·026은 M3에서 신설).
3. **멀티 디스플레이·폴더블·화면 크기 override 변형은 관측하지 못했다** — 이 기기는
   디스플레이 1개이고 override가 설정돼 있지 않다.
4. **AC-VISION-031(`--web` 회귀)·AC-VISION-033(비전 루프 e2e)는 수행하지 않았다.**
5. **AC-VISION-024는 baseline만 확보했다** — "이후" 값은 M5(열거 1회화) 완료 후에만
   측정 가능하다.

**잔여 위험**:

- scroll 지연 감소(6013 → 3873ms, 약 2140ms)는 dump 호출 제거의 효과로 보이나,
  측정값에 node 프로세스 기동 비용이 포함되어 있어 **CLI 내부 순수 지연이 아니다.**
  AC-VISION-024가 요구하는 열거 1회화 효과와는 별개 축이므로 혼동하지 않는다.
- 좌표 3쌍 일치는 **같은 기기·같은 화면**에서의 결과다. 화면 크기 파생 방식 자체가
  달라졌으므로(dump 루트 bounds → `wm size`), 루트 요소 bounds가 화면 전체와
  다른 앱(전체화면 오버레이 등)에서는 두 방식이 갈릴 수 있으며 그 경우는
  관측하지 않았다.
- CLI는 `spawnAdb`가 바이너리명을 `"adb"`로 고정하므로 **PATH에 adb가 없으면
  Android 기기를 전혀 보지 못한다.** 이번 실측은 PATH를 보정한 상태에서 수행했다.
  `doctor`는 이 상태를 `adb:{installed:false}` + 복구 안내로 정확히 보고하므로
  조용한 실패는 아니지만, 배포 시 사용자가 겪을 함정으로 남아 있다.

### 다중 앱 실기기 추가 검증 (2026-08-03)

**전체 기록 + 스크린샷 12장**:
`.moai/reports/android-verification/SPEC-VISION-001-multiapp-2026-08-03/`

성격이 다른 5개 무대(시스템 설정 / 네이티브 버튼 격자 / Compose 편집기 /
Unity 몰입형 전체화면 / 탭 UI)에서 검증했다. 금융·메신저·개인정보 앱은
스크린샷이 증거로 남는다는 이유로 전부 제외했다.

**주장과 증거**:

```
[비전 루프 e2e — 계산기]  캡처 -> 스크린샷 좌표 판정 -> 탭 x4 -> 검증 캡처
  tap 226,2566 (1) / 1217,2566 (+) / 554,2566 (2) / 1217,2886 (=)
  오라클 = 화면에 표시된 "3". ok:true가 아니라 화면 내용으로 판정했다.
  표시 배율 x1.56(923x2000 -> 1440x3120)을 곱해 실제 좌표를 산출.

[한글+이모지 — Simple Markdown]  "안녕하세요 반갑습니다 🙂" 입력 성공
  두 번째 오라클: 제목이 Untitled.md -> Untitled.md* (미저장 변경 표시)

[getScreenSize 일관성]  설정 / Star Walk 2 / 시계 모두 동일 좌표
  720,2262 -> 720,858

[launch 회귀]  계산기·시계 모두 정상 실행
  (과거 `am start -p` 암시적 인텐트로 열리지 않던 두 사례)

[전체화면 대조]  Star Walk 2 (Unity, 상태바·내비바 없는 몰입형)
  OLD(181199e) 720,2262 -> 720,858
  NEW(4ca5260) 720,2262 -> 720,858     ← 발산 미재현
```

**새로 발견한 결함 — `text`의 무음 유실**:

포커스된 편집 가능 요소가 없는 상태에서 `text`를 보내면 `{"ok":true}`를
반환하면서 입력이 조용히 사라진다. Simple Markdown에서 재현했다 — 비어 있는
편집기의 EditText는 한 줄 높이만 차지하므로 본문 한가운데 좌표는 입력란
*바깥*이었고, 포커스가 없는 채로 브로드캐스트가 발사됐다.

```
[실패] mBoundToMethod=true / mInputShown=false
       mServedView=DecorView{... 0,0-1440,3120}[MainActivity]   -> 입력 유실
[성공] mInputShown=true
       mServedView=h7{... VFED..... .F...... ...}               -> 입력 착지
```

이는 SPEC-IMESTATE-001이 닫은 `mBoundToMethod=false` 구간과 **다른 창**이다
(바인딩은 끝났으나 서브 뷰가 편집 대상이 아닌 경우). 기계적 검출 방법은
**확정하지 못했다** — 기존 기록에 "`mServedView`는 입력 성공의 오라클이 아니다
(성공해도 `null`로 나온다)"는 반례가 있어, 위 두 필드를 판별식으로 채택하려면
별도 검증이 선행되어야 한다. 이 SPEC의 범위 밖이므로 **결함의 존재만 기록**하고
후속 SPEC 후보로 남긴다.

**미검증 (Gaps)** — 위 실측이 닫지 못한 것:

1. **`text` 무음 유실의 기계적 검출** — 위 서술 참조. 후속 SPEC 후보.
2. **분할화면·팝업뷰·프리폼 윈도우** — 루트 bounds가 실제로 달라지는 조건은
   시험하지 못했다. Star Walk 2의 발산 미재현은 "이 기기의 이 앱에서 루트
   DecorView bounds가 화면 전체와 일치했다"는 뜻이지, 잔여 위험이 해소됐다는
   뜻이 아니다.
3. **AC-VISION-031(`--web`)·AC-VISION-033의 전체 절차** — `--web` 브라우저 무대를
   구성하지 않았다. 계산기에서 확인한 것은 비전 루프의 캡처-판정-탭-검증
   경로이며, AC-VISION-033이 요구하는 전체 시퀀스와 동일하지 않다.

**잔여 위험**:

- 좌표 판정에 스크린샷 표시 배율을 사람이 곱해야 한다. M2가 `--id`/`--text`
  셀렉터를 제거했으므로 배율 계산을 우회할 CLI 경로가 더 이상 없다. 이번
  검증은 5개 좌표 전부 명중했으나, 배율을 빠뜨리면 조용히 다른 곳을 탭한다.

### AC-VISION-031 (`--web` 회귀) 검증 (2026-08-03)

**전체 기록 + 스크린샷 3장**:
`.moai/reports/android-verification/SPEC-VISION-001-web-2026-08-03/`

**정정**: `--web`은 Android 경로가 아니라 **iOS 시뮬레이터 전용**이다
(`web-support.ts:108`이 `platform !== "ios"`를 거부한다). 이 SPEC 문서 어디에도
그 사실이 적혀 있지 않아 Android 항목으로 오해할 소지가 있었다.

**시나리오 조정**: AC-VISION-031이 재실행을 요구하는 SPEC-WEBVIEW-001의
AC-WEB-020은 `dump --web` → `tap --web` 순서인데, **첫 단계를 이 SPEC의 M2가
제거했다**. 따라서 원문 그대로는 실행 불가능하다. `web-support.ts` 헤더가 정한
해석("`tap --web` / `text --web` 경로는 변경 없이 유지된다")에 따라 살아남은
경로의 무회귀 확인으로 수행했다. 무대는 DOM이 고정적인 example.com을 썼다.

**증거**:

```
대상: iPhone 17 Pro 시뮬레이터 (D0B3A18C-...) / iOS 26.0

$ node dist/cli/bin.js tap --web "a" --device D0B3A18C-...
{"ok":true,...,"page":{"index":0,"title":"Example Domain","url":"https://example.com/"},
 "selector":{"css":"a","index":0},"tappable":true,"method":"native","x":121,"y":326}
  -> 화면이 example.com 에서 iana.org 로 실제 전환됨 (스크린샷 확증)

$ node dist/cli/bin.js text --web 'input[name=q]' '안녕하세요 🙂' --page 1 --device D0B3A18C-...
{"ok":true,...,"selector":{"css":"input[name=q]","index":0},"method":"native","x":147,"y":168}
  -> 웹 입력란에 한글+이모지 착지 (스크린샷 확증)

부수: --page 없이 실행 시 페이지 2개 -> AMBIGUOUS_PAGE 거부, --page 1로 지정 성공
      (SPEC-WEBVIEW-001 AC-WEB-021 / AC-WEB-022 동작 확인)
```

**판정**: AC-VISION-031 **PASS (조건부)** — 셀렉터 경로에 M2 회귀는 없다.
다만 아래 결함 때문에 프록시를 수동으로 미리 띄워야 했다.

**새로 발견한 결함 — CLI가 스스로 띄운 프록시로는 `--web`이 실패한다**:

프록시가 없는 상태에서 `tap --web`은 3회 중 3회 `NO_WEB_PAGE`로 실패했다.
같은 인자로 프록시를 미리 띄우고(4초 대기) 실행하면 성공한다 — 페이지·소켓·
Web Inspector는 모두 정상이므로 `--web` 경로 자체의 결함이 아니다.

```
프록시 기동 후 경과별 페이지 수 (직접 측정):  0.2s -> 0개,  0.5s 이후 -> 1개
```

`proxy-service.ts:288-296`의 기동 루프는 spawn 직후 첫 조회에서 빈 목록을 받으면
재시도 없이 프록시를 죽이고 `NoWebPageError`를 던진다. `probePages`는 프록시가
닿지 않을 때만 `null`(재시도 대상)을 반환하고, HTTP는 응답하나 열거 전인 상태는
`[]`(종결)로 받는다. 3/3 실패는 간헐적 경합이 아니라 체계적으로 이른 조회임을
시사한다. **다만 CLI 자체를 계측하지는 않았으므로 이 설명은 코드 구조와 외부
측정에 근거한 추론이다.**

USB 연결된 실기기는 원인이 아니다 — 미리 띄운 프록시가 같은 연결 상태에서
성공했다.

**손대지 않은 이유**: `src/webview/`는 SPEC-WEBVIEW-001 소유이며 plan.md §A.2
PRESERVE 목록에 명시돼 있다. 존재와 재현 조건만 기록한다.

**미검증 (Gaps)**:

1. **CLI 프록시 기동 경로** — 이 상태로는 사용자가 수동으로 프록시를 띄워야
   `--web`을 쓸 수 있다. "동작한다"고 단정하기 어려운 조건부 PASS다.
2. **원래 시나리오의 naver.com** — DOM 안정성을 이유로 example.com으로 대체했다.
3. **AC-WEB-024(낡은 대상 결함)** — 시험하지 않았다.

### M5 — 기기 열거 1회화

**주장**: 명령 1회당 기기 열거가 1회다. `BackendRegistry`가 `DeviceBackend`를
구현하지 않게 되면서, 소유 백엔드를 재조회하던 facade 경로가 사라졌다.
대상 해석 단계가 serial과 소유 백엔드를 함께 확정한다(design.md §D.2).

**계획서 대비 정정 2건** (design.md는 plan-phase 산출물이라 수정하지 않고 여기 기록):

| design.md §D | 실제 |
|---|---|
| "137~195행의 **8개** 위임 메서드" | **10개** — `swipe`·`getMinEffectiveSwipeThreshold`·`getScreenSize` 추가분 미반영 |
| "명령 핸들러(`devices` 제외 **11개**)" | **10개** — M2가 `dump` 명령을 제거해 12→11 명령이 됐다 |

**계획서에 없던 안전장치 이전** (놓쳤다면 회귀였다): 시리얼 충돌 거부.
이전에는 facade의 `resolveBackend`가 `matches.length !== 1`로 잡았는데,
`resolveTargetDevice`는 `.find()`라 첫 항목을 골랐다. facade만 제거하고 검사를
옮기지 않았다면 **충돌 시 조용히 잘못된 백엔드로 라우팅**됐을 것이다.
`.filter()` 기반으로 옮기고 오류 코드·문구는 그대로 유지했다
(`BACKEND_COMMAND_FAILED` + "No backend owns device serial 'X'.") — 검출 시점만
앞당기고 사용자가 보는 계약은 바꾸지 않았다.

**설계 변경 1건** (계획서에 없던 판단): `runCli`의 2번째 인자를
`BackendRegistry`로 좁히지 않고 `DeviceBackend | DeviceSource` 합타입으로 받아
내부에서 정규화(`toDeviceSource`)한다. 근거는 실측이다 — `runCli` 호출 129곳 중
**122곳이 맨 백엔드를 넘긴다**(registry는 7곳). 타입을 좁혔다면 테스트 122곳을
고쳐야 했고 그 자체가 회귀 위험이다. 열거 1회 성질은 두 형태 모두에서 성립하며,
`enumeration.test.ts`가 registry 형태로 이를 센다.

**증거** (실제 실행한 명령과 관측한 출력):

```
$ pnpm typecheck                                    -> exit 0
$ pnpm build                                        -> exit 0
$ pnpm test
   Tests  670 passed | 2 expected fail (672)

$ grep -c 'implements DeviceBackend' src/backend/registry.ts        -> 0   (AC-VISION-021)
$ grep -cE '^  async (screenshot|tap|inputText|...)\(' src/backend/registry.ts -> 0
$ grep -rn 'backend\.listDevices()' src/cli/commands/ | wc -l       -> 0

$ npx vitest run src/cli/enumeration.test.ts
   Tests  15 passed (15)          (AC-VISION-022 · AC-VISION-023)
```

**RED 확인**: 구현 전 같은 테스트가 `expected 2 to be 1`로 실패했다 — 중복 열거가
계측으로 고정된 뒤 구현했다.

**실기기 지연 실측 (AC-VISION-024)**:

```
기기: R3CY106LKVX / SM-S938N. 무대: 계산기, 좌표 (226,2566) = `1` 버튼
대조 기준: b8aa0e8 (pre-M5) — 별도 worktree 빌드 후 제거. master 미변경

tap  (대상 해석 O — 열거가 2회였던 명령)
  OLD 1716 / 1717 / 1728 ms      평균 1720
  NEW  922 /  903 /  922 ms      평균  916      -> 약 804ms 감소 (47%)

devices (대상 해석 X — 원래부터 열거 1회, 대조군)
  OLD 848ms
  NEW 838ms                                      -> 변화 없음
```

**대조군이 인과를 지지한다**: 원래 열거가 1회였던 `devices`는 변하지 않았고
2회였던 `tap`만 절반이 됐다. 감소가 무관한 요인이 아니라 두 번째 열거 제거에서
왔음을 뒷받침한다. 감소폭(≈804ms)이 `devices` 1회 비용(≈840ms)과 같은 크기인
것도 일관된다.

**착지 확인**: 측정에 쓴 탭 6회 후 계산기 표시가 `111,111` — 6회 전부 실제로
착지했다. 실패한 호출을 잰 것이 아니다. 스크린샷:
`.moai/reports/android-verification/SPEC-VISION-001-m5-2026-08-03/`

**AC 판정**:

| AC | 등급 | 판정 |
|---|---|---|
| AC-VISION-021 | G | **PASS** — `implements DeviceBackend` 0건, facade 메서드 0개 |
| AC-VISION-022 | U | **PASS** — `tap` 실행 시 열거 1회 (3가지 조건에서) |
| AC-VISION-023 | U | **PASS** — 기기 대상 명령 10개 전부 + `devices`까지 1회 |
| AC-VISION-024 | D | **PASS** — tap 1720→916ms, 대조군 무변화 |

**미검증 (Gaps)**:

1. **`AC-VISION-023`의 "11개"는 실제로 10개다** — M2의 `dump` 제거 반영. 현재
   명령은 11개이고 그중 `devices`를 뺀 10개가 대상 해석을 한다. 10개 전부 셌다.
2. **`doctor`/`reset`은 환경 서비스를 스텁으로 대체해 셌다** — 실제
   `AdbDoctor`/`IdbDoctor` 경로에서의 열거 횟수는 재지 않았다.
3. **커버리지 전후 대조는 하지 않았다** — AC-VISION-037은 M6의 몫이다.
4. **iOS 백엔드 경로의 열거 1회는 실기기로 확인하지 않았다** — mock으로만 닫혔고,
   iOS 제어 경로 자체가 M3 미완이다.

**잔여 위험**:

- `toDeviceSource`는 구조적 판별(`"listAllDevices" in source`)을 쓴다. 우연히
  같은 이름의 멤버를 가진 객체가 넘어오면 오판할 수 있다. 현재 호출자는
  `BackendRegistry`와 `DeviceBackend` 둘뿐이라 충돌하지 않지만, 세 번째 형태가
  생기면 판별을 다시 봐야 한다.
- M5를 M4보다 먼저 수행했으므로(사용자 결정), M4에서 idb 백엔드를 제거할 때
  registry를 한 번 더 수정하게 된다. design.md §E.1이 예고한 비용이며 정합성
  문제는 아니다.
- 시리얼 충돌 거부는 **단위 테스트로만** 닫혔다. 실제로 adb serial과 idb udid가
  겹치는 기기 쌍을 만들어 보지는 않았다.

### M3 조사 — WDA 엔드포인트 실측 (2026-08-03, 코드 변경 전)

**주장**: `design.md §F`가 M3로 이월한 미확정 3건을 실기기 WDA로 닫았다.
이 단계는 **조사만** 수행했다 — `wda-client.ts` 등 구현 파일은 아직 없다.

**측정 조건**:

```
기기 : 하태용의 iPhone / iPhone 15 Pro Max (iPhone16,2) / iOS 26.5.2 / USB
WDA  : xcodebuild test-without-building (어제 DerivedData 재사용, 재빌드 없음)
       번들 com.hatae.WebDriverAgentRunner.xctrunner, 8월 2일 21:18 빌드
경로 : iproxy 8100:8100 -u 00008130-001238880C13803A
```

**WDA 재기동 절차 (재현용)**:

```bash
# 1) iproxy가 없으면 먼저 띄운다
iproxy 8100:8100 -u 00008130-001238880C13803A &

# 2) 어제 빌드 산출물을 재사용해 WDA를 올린다 (재빌드 불필요)
xcodebuild test-without-building \
  -xctestrun ~/Library/Developer/Xcode/DerivedData/WebDriverAgent-cxqdatdnwyclcwczomwgvseyritt/Build/Products/WebDriverAgentRunner_iphoneos26.0-arm64.xctestrun \
  -destination "id=00008130-001238880C13803A"
# 이 프로세스가 살아 있는 동안만 WDA가 뜬다. 종료하면 함께 내려간다.

# 3) 확인 — 8초 내 200이 나온다
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8100/status
```

DerivedData가 지워졌거나 무료 계정 7일 만료(2026-08-02 빌드 기준)에 걸리면
`-xctestrun` 재사용이 불가능하다. 그때는 전체 빌드 + 수동 관문 3개를 다시
통과해야 한다 — 절차는 auto-memory `ios-physical-vision-control-verified` 참조.

**기동 절차 관측**: 재빌드가 필요 없었고, **기기 암호 입력도 요구되지 않았다**
(어제 승인이 남아 있었다). `/status`가 8초 만에 200을 반환했다. 기록된
"수동 관문 3개"는 최초 1회 비용이며 재기동에는 걸리지 않는다는 뜻이다 — 단
무료 계정 7일 만료 후에는 다시 걸린다.

**§F 확정 3건**:

```
① WDA 창 크기 엔드포인트  -> 존재하며 세션 없이 동작한다
   $ curl http://127.0.0.1:8100/window/size
   {"value":{"width":430,"height":932}}
   PNG IHDR 폴백은 불필요하다.

② iOS 배율 실측  -> 정확히 3.0
   캡처 1290x2796 (GET /screenshot, 세션 불필요)
   창    430x932
   1290/430 = 3.0,  2796/932 = 3.0     인용값 ÷3과 일치

③ 세션 ID 재획득  -> `/status`만으로는 얻을 수 없다
   세션 없음:  {"sessionId": null}          <- design.md §B.2 전제 반증
   POST /session (앱 미지정) -> sessionId 발급
   생성 후 /status -> 그 sessionId 보고
```

**design.md의 전제 2개가 반증됐다**:

1. §B.2는 *"`/status` 응답이 현재 세션 ID를 포함하므로 세션을 새로 만들지 않고
   `/status`에서 얻는다"*를 채택했다. 근거였던 관측(`"sessionId": "4390BCEE-..."`)은
   **이미 세션이 있던 상태**의 값이었다. 콜드 스타트에서는 `null`이다.
2. §B.2가 `POST /session`을 기각한 근거는 *"세션 생성은 앱 활성화를 수반해 화면
   상태를 바꿀 수 있고"*였다. **중립 화면(설정)에서 재보니 앱도 화면도 바뀌지
   않았다** — 캡처 바이트 길이가 118787로 정확히 동일했고(해시만 상이 = 상태바
   시계), WDA 로그도 새 앱을 띄우는 대신 이미 떠 있던 앱을 찾았다
   (`Find the Application 'com.iwilab.KakaoTalk'`).

   따라서 M3 구현은 **세션이 없으면 `POST /session`으로 만들고, 이후
   `/status`로 재확인**하는 형태가 된다. 기각됐던 대안이 실측으로 복권됐다.

**부수 확인**:

```
$ xcrun devicectl device process launch --device <UDID> com.apple.Preferences
  Launched application with com.apple.Preferences bundle identifier.   (M3 launchApp 경로)

$ POST /session/<SID>/actions  (W3C pointerMove+Down+pause+Up, WDA 포인트 42,81)
  HTTP 200 -> 설정 '서체' 화면에서 뒤로가기 버튼 명중, '일반'으로 이동
  좌표 환산 검증: 스크린샷 픽셀 ÷ 3 = WDA 포인트
```

증거: `.moai/reports/android-verification/SPEC-VISION-001-m3-wda-2026-08-03/`

**반증된 내 가설 (기록으로 남긴다)**: `/status`가 간헐적으로 빈 응답을 반환하는
현상을 관측하고 "`xcrun devicectl` 실행이 iproxy 경유 접속을 끊는다"고 가정했으나,
devicectl 실행 직전·직후 13회 연속 200으로 **반증됐다**. 실패는 WDA 기동 직후와
세션 DELETE + `/wda/homescreen` 400 직후에 몰렸으나 **원인은 미확정이다.**

**미검증 (Gaps)**:

1. **개인정보 화면 캡처는 폐기했다** — 최초 캡처가 카카오톡 대화 목록이어서
   저장소에 넣지 않고 스크래치패드에서 삭제했다. 이후 측정은 전부 설정 앱에서
   다시 수행했다. 저장소에는 들어간 적이 없다.
2. **`inputText` 경로(`/session/:id/wda/keys`)는 시험하지 않았다** — 한글·이모지
   입력(AC-VISION-014)은 미검증이다.
3. **`/status` 간헐 실패의 원인** — 재현 조건을 좁히지 못했다. 구현 시 재시도
   여부를 판단하려면 추가 조사가 필요하다.
4. **`/wda/homescreen`은 400을 반환했다** — 세션이 필요한지, 경로가 다른지
   확인하지 않았다.
5. **시뮬레이터 목록 존치**(§F 잔여 1건)는 결정하지 않았다.

---

### M3 — iOS 백엔드 WDA 교체 (2026-08-03)

**주장**: iOS 제어 경로가 idb에서 WDA HTTP + `devicectl`로 교체됐고, 캡처·탭·
한글 입력·앱 종료가 **CLI를 통해** 실기기에서 동작한다.

**측정 조건**: 조사 단계(위 §E.2 "M3 조사")와 동일한 기기·WDA 인스턴스.
CLI는 `pnpm build` 산출물(`node dist/cli/bin.js`)을 직접 실행했다 —
mock이 아니라 실제 argv 경로다.

#### 코드 변경 전 실측 4건 (설계 근거)

| 관측 | 결과 | 표본 |
|---|---|---|
| `POST /session/:id/wda/apps/terminate` | 응답 항상 유실(`HTTP 000`), **효과는 적용**(state 4→1) | 유실 4/4, 효과 확인 3/3 |
| `POST /session/:id/actions` (탭) | 대개 200, 간헐 유실 — **유실돼도 효과 적용** | 유실 1/5 (별도 1건 추가 관측) |
| `POST /session/:id/wda/keys` 한글+이모지 | **HTTP 200, 그대로 입력됨** — 우회 불필요 | 1/1 |
| `POST /session` 본문 형식 | `{"capabilities":{"alwaysMatch":{},"firstMatch":[{}]}}` → 200 | 1/1 |

응답 유실의 **원인은 여전히 미확정**이다(§E.2 조사 단계의 Gap 3 그대로).
확정된 것은 "유실돼도 효과는 적용된다"는 관측뿐이며, 설계는 그 관측 위에
세웠다 — 유실을 성공으로 처리하지 않고 `WDA_RESPONSE_LOST`로 남긴 뒤,
검증 수단이 있는 `stopApp`만 `apps/state`로 확정 판정한다.

#### 계획서 정정 2건

1. **`plan.md` §B M3 item 3의 `stopApp` 경로가 틀렸다.** `xcrun devicectl
   device process launch`로 적혀 있으나 `launch`는 실행이지 종료가 아니다.
   `devicectl`의 서브커맨드는 `launch / resume / sendMemoryWarning / signal /
   suspend`뿐이고 `signal`은 `--pid`를 요구한다(실측). 종료는 WDA
   `apps/terminate`가 맡는다.
2. **`devicectl` 기기 식별자가 둘이다.** 최상위 `identifier`(CoreDevice UUID,
   `DEDABBFA-…`)와 `hardwareProperties.udid`(`00008130-…`)가 다른 값이며,
   `iproxy -u` / `xcodebuild -destination`이 쓰는 것은 후자다. `serial`로는
   udid를 쓴다. `--json-output`은 stdout이 아니라 **파일**에 쓰며, 도움말이
   그것을 스크립트의 유일한 지원 경로로 명시한다.

#### CLI end-to-end 실측 (판정은 스크린샷)

```
$ node dist/cli/bin.js devices
  → iPhone 15 Pro Max(00008130-…) + iPad Pro(00008103-…), serial = udid

$ node dist/cli/bin.js screenshot --device <UDID> --out …
  → ok, PNG 1290×2796, 4601784 bytes

$ node dist/cli/bin.js tap 645 2640 --device <UDID>     # 스크린샷 픽셀 좌표
  → 설정 앱 검색 필드 명중 (배율 3.0 환산). 판정: 탭 후 캡처에 키보드 등장

$ node dist/cli/bin.js text "안녕하세요 반갑습니다 🙂" --device <UDID>
  → 검색창에 그대로 입력됨. 판정: 캡처의 문자열 확인

$ node dist/cli/bin.js stop com.apple.Preferences --device <UDID>
  → ok:true. 응답 유실 → apps/state 재확인 경로가 실제로 발동했고,
     이후 상태 조회가 1(미실행)을 반환해 종료를 확정
```

증거: `.moai/reports/android-verification/SPEC-VISION-001-m3-wda-2026-08-03/`
04(검색 필드 포커스) · 05(한글+이모지 입력) · 06(CLI 경유 동일 결과)

#### 실패 경로 실측 (REQ-VISION-003 — 조용한 대체 금지)

```
$ EXPLORE_MOBILE_WDA_PORT=8199 … tap …   → code: WDA_UNREACHABLE
    메시지에 iproxy/xcodebuild 복구 절차 포함. 탭은 일어나지 않았다.
$ EXPLORE_MOBILE_WDA_PORTS="<다른 UDID>=8100" … tap …  → code: WDA_PORT_UNMAPPED
```

두 코드가 top-level에 노출되도록 `backendFailure`(`cli/commands/types.ts`)를
추가했다. `key.ts`가 `UNSUPPORTED_KEY_ON_IOS`에 이미 적용한 관례("타입이
식별된 백엔드 오류는 일반 코드 뒤에 가리지 않는다")의 확장이며, 그 밖의
실패는 종전대로 `BACKEND_COMMAND_FAILED`로 가린다(D7 우선순위 유지).

#### 다기기 안전장치 (사용자 결정 2026-08-03)

`/status`는 기기 **종류**(`"device": "iphone"`)만 알려주므로 CLI는 포트 너머
기기의 신원을 검증할 수 없다. 그래서 `EXPLORE_MOBILE_WDA_PORTS`로 serial→포트
매핑을 선언하게 하고, 매핑이 선언된 상태에서 미등록 serial이 오면 기본 포트로
흘리지 않고 거부한다. **잔여 위험**: 매핑을 선언하지 않은 채 iOS 기기를 2대
이상 붙이면 검증 없이 기본 포트를 쓴다(`wda-client.ts`의 `@MX:DEBT`).

#### 검증 (2026-08-03)

```
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
$ pnpm test        → 34 files, 725 passed | 2 expected fail
$ grep -rn '/ 3\|\* 3\b\|SCALE = 3' src/backend/wda-*.ts   → 0건 (AC-VISION-025)
```

테스트 중 **결함 1건을 테스트가 잡았다**: `unwrapEnvelope`가 던지는
`WdaCommandFailedError`가 네트워크 오류용 `catch`에 걸려, WDA가 정상 전달한
4xx가 `WDA_UNREACHABLE`로 둔갑했다. 재던지기로 수정.

#### `doctor` 순서 변경 — 교차 SPEC 계약 변경 (사용자 결정 2026-08-03)

**문제**: `doctor`가 맨 앞에서 adb 설치 여부로 조기 반환해, adb가 PATH에 없는
이 호스트에서는 iOS 분기에 한 번도 도달하지 못했다 — AC-VISION-020 미충족.
adb 부재는 iOS 전용 사용자에게 정상 상태이므로, 그 사용자가 iOS 진단을 영영
받지 못하는 것은 이 명령의 목적에 어긋난다.

**결정**: 기기 해석을 Android 조기 반환보다 앞으로 옮긴다. 조기 반환의 형태와
순서 자체는 그대로 두고, 위치만 iOS 분기 뒤로 내렸다.

**이것은 SPEC-ANDROID-001의 AC-ANDROID-018 판정 방식을 바꾼다.** 원래 그 AC는
`backend.listDevices`가 호출되지 않는 것으로 판정했다. 이제 열거는 일어난다.
**AC가 막으려던 것 — 죽은 adb를 통한 조회 — 은 유지된다**: `BackendRegistry`가
`isAvailable()` false인 백엔드를 건너뛰므로 `AdbBackend.listDevices`는 여전히
호출되지 않으며, `router.test.ts`에 그것을 registry 경로에서 판정하는 테스트를
새로 추가했다. 기존 테스트 2건은 남은 계약(데몬 불량이 보고서에 실린다)만
세도록 좁혔다.

**반대 정보(함께 기록)**: 이 판단은 "AC 문구"가 아니라 "AC의 취지"를 근거로
다른 SPEC의 테스트를 고친 것이다. 문구 그대로 읽으면 위반이다. 대안(코드
무변경 + adb를 PATH에 노출)은 다른 SPEC을 건드리지 않지만, adb 없는 환경의
iOS 사용자 문제를 남긴다. 사용자가 순서 변경을 택했다.

**판정**: 변경 후 실기기에서 확인했다.

```
$ node dist/cli/bin.js doctor --device 00008130-001238880C13803A
  wdaEnvironment 존재: True   ← AC-VISION-020
  idbEnvironment 부재: True   ← AC-VISION-020
  wda: {reachable: true, port: 8100, portMapDeclared: false,
        build: "WDA 16.1.1 / iOS 26.5.2 / iphone"}
```

`portMapDeclared: false`가 보고서에 그대로 드러난다 — 포트 매핑 미선언 상태를
사용자가 눈으로 확인할 수 있게 한 설계 의도대로다.

#### 미검증 (Gaps)

1. **Android 대상 `doctor`는 이 세션에서 실기기로 재검증하지 못했다.** 순서를
   바꾼 코드의 Android 경로는 단위 테스트(737 passed)로만 확인했고, 이 호스트에
   Android 기기도 PATH 상의 adb도 없어 실행 판정을 하지 못했다. M6에서 확인한다.
2. **`sendKeyEvent`의 `pressButton`(home/volume)·`enter` 경로는 실기기로
   판정하지 않았다.** 단위 테스트는 argv/본문 형태만 고정한다.
3. **`swipe`는 실기기로 판정하지 않았다.** 문턱값 33px(11pt × 배율 3)이 실제로
   화면을 움직이는지는 M6에서 확인한다.
4. **응답 유실의 원인**은 여전히 미확정이며, 표본도 작다(탭 유실 1/5).
5. **`WDA_RESPONSE_LOST` 자체를 실기기 탭에서 재현해 보지는 않았다** — 이번
   CLI 탭은 전부 200이었다. 유실 시 동작은 단위 테스트로만 고정돼 있다.

---

### M4 — idb 잔재 전면 제거 (2026-08-03)

**주장**: `src` 어디에도 idb 참조가 없다. 전용 파일 10개가 사라졌고, 남아 있던
유일한 코드 의존(`UnsupportedKeyOnIosError`)은 WDA 쪽으로 이관됐다. idb가
설치된 환경에서 CLI를 돌려도 idb 프로세스가 생성되지 않는다.

**착수 전 조사 (계획서를 따르기 전에 사용처부터 확인)**: 44개 파일이 grep에
걸렸으나 실제 코드 의존은 **셋뿐**이었다.

| 대상 | 실제 사용처 | 처리 |
|---|---|---|
| `UnsupportedKeyOnIosError` | `key.ts`(생산), `router.test.ts`, `backend-failure.test.ts` | `WdaUnsupportedKeyError`로 이관 — `code`는 `UNSUPPORTED_KEY_ON_IOS` 그대로 |
| `keycodes-ios.ts` | `idb-backend.ts` 하나뿐 | 삭제 (plan.md의 "WDA 키 매핑으로 대체됐다면" 조건 충족 — WdaBackend는 HID 코드를 쓰지 않는다) |
| idb-* 6개 | 서로만 참조하는 닫힌 덩어리 | 삭제 |

나머지 41개 파일은 전부 주석/문서 언급이었다. `src/index.ts` 공개 표면에는
idb가 없어 외부 API 파괴는 없다.

**§G 미확정 1건 해소**: `webkit-errors.ts`의 idb 참조는 **실제 호출이 아니라
문자열 언급**이었다(오류 클래스 패턴의 출처를 적은 3행 주석).

#### 삭제 (10개 파일, 1,442 LOC)

```
idb-backend.ts / .test.ts · idb-clipboard.ts / .test.ts · idb-doctor.ts / .test.ts
idb-errors.ts · idb-executor.ts · idb-target-parse.ts · keycodes-ios.ts
```

#### 오류 코드 승격 대상 확장

`UnsupportedKeyOnIosError`가 사라지면서 `key.ts`에 흩어져 있던 "타입이 식별된
백엔드 오류는 자기 코드를 노출한다" 판단을 `backendFailure`(`cli/commands/types.ts`)
한곳으로 모았다. 승격 대상은 넷이다 — `WDA_UNREACHABLE` / `WDA_RESPONSE_LOST` /
`WDA_PORT_UNMAPPED` / `UNSUPPORTED_KEY_ON_IOS`. 그 밖의 실패는 종전대로
`BACKEND_COMMAND_FAILED`로 가린다(D7 우선순위 유지). `code`를 가졌다고 전부
승격되지는 않는다는 것을 `backend-failure.test.ts`가 음성 대조로 고정한다.

#### 주석 정리에서 드러난 낡은 서술 3건

주석 속 idb 언급을 지우다가, **단순 이름 교체로 끝나지 않는 곳**이 나왔다.
셋 다 지금 코드와 어긋나 있었다.

1. `device-backend.ts` `SwipeOptions` — "iOS 백엔드가 ms를 초로 환산한다"고
   적혀 있었으나 WDA는 W3C `pause`(밀리초)를 쓰므로 환산이 없다. 계약("호출자는
   항상 ms를 넘긴다")은 유지하되 서술을 사실에 맞췄다.
2. `device-backend.ts` `getMinEffectiveSwipeThreshold` — "iOS는 기기 조회를
   전혀 하지 않는다"고 적혀 있었으나 `WdaBackend`는 **배율**을 얻으려 기기에
   묻는다. `basis`가 `"measured-constant"`로 남는 이유(값의 출처를 말하는
   필드이지 호출 여부를 말하는 필드가 아니다)를 함께 적었다.
3. `common-element.ts` — 이미 M2에서 삭제된 네이티브 정규화기 두 개의 매핑을
   상세히 설명하고 있었다. 지금 이 스키마의 유일한 생산자는
   `normalize/webdom.ts`이며, 파일이 존치되는 이유는 AC-VISION-011(과잉 제거
   방지)이다. `@MX:ANCHOR`의 근거도 fan_in이 아니라 "남은 소비자가 다른
   SPEC 소유"라는 사실로 다시 적었다.

#### `src/webview/` 예외 발동 (사용자 결정 2026-08-03)

AC-VISION-017(grep 0건)을 채우려면 `src/webview/` 안의 2개 파일 주석을
건드려야 했다. AC-VISION-029는 이 디렉터리 무변경을 요구하며 예외 조항에
`webkit-errors.ts`만 명시했으나, `coordinates.test.ts`에도 언급이 있었다.
**둘 다 수정했다** — 사용자 결정이며, 명시 범위를 넘어섰다는 사실을 여기 적는다.

- `webkit-errors.ts:3` — 오류 클래스 패턴 출처 언급 (주석)
- `coordinates.test.ts:7` — 좌표 검증 절차 설명 중 "native `idb` tap" (주석)

둘 다 주석만 바뀌어 동작 변화는 없다. **AC-VISION-029의 `git diff --name-only`는
이제 빈 결과가 아니다** — 이 2개 파일이 잡힌다.

#### 검증 (2026-08-03)

```
$ grep -rl 'idb\|Idb\|IDB' src --include='*.ts'   → 빈 결과      (AC-VISION-017)
$ ls src/backend/idb-*.ts                          → no matches   (AC-VISION-018)
$ pnpm typecheck                                   → exit 0
$ pnpm build                                       → exit 0
$ pnpm test                                        → 32 files, 688 passed | 2 expected fail
```

**baseline 귀속**: 착수 직전 같은 트리(HEAD `287dd4b`)에서 `pnpm test`를 실행해
`737 passed | 2 expected fail`을 관측했다. M4 이후 `688 passed` — **순감 49건**.
내역: 삭제된 3개 테스트 파일의 `it()` 50개 − 신규 1개(`backend-failure.test.ts`의
`WdaUnsupportedKeyError` 행) = 49. **회귀로 인한 감소는 없다.**

작업 중 테스트가 **제가 만든 결함 1건을 잡았다**: `swipe.test.ts`에서 던지는
오류 문구만 바꾸고 단언 정규식을 그대로 둬 불일치가 났다. 수정 후 같은 유형이
더 없는지 반대 방향으로도 grep해 확인했다.

#### AC-VISION-019 실기기 판정 (idb 프로세스 미생성)

idb는 이 호스트에 **설치돼 있다**(`/Users/hatae/.local/bin/idb`,
`/opt/homebrew/bin/idb_companion`) — 이 AC가 의미를 갖는 조건이다.

```
절차: 50ms 간격 pgrep 감시자를 띄운 뒤 CLI 5개 명령 실행
      (devices · doctor · screenshot · launch · stop)
관측: 감시 중 나타난 idb 관련 PID = {33853, 68043}
      둘 다 baseline에 이미 존재한 idb_companion 데몬(이 세션 이전부터 상주)
판정: baseline에 없던 새 PID 0건  →  PASS
```

#### AC-VISION-019 재관측 — WDA 재기동 후 (2026-08-03, 같은 세션)

1차 관측 때 `screenshot`이 WDA HTTP 500
`"Not authorized for performing UI testing actions"`로 실패했다. 기기는 잠겨
있지 않았고(`/wda/locked` → false) `activeAppInfo`도 nil 예외로 500이었다 —
8월 2일부터 떠 있던 WDA 러너가 UI 테스팅 권한을 잃은 **환경 상태**였다.
`/status`는 곧 000으로 떨어졌다.

`progress.md` §E.2의 재기동 절차대로 러너를 내리고 다시 띄웠다(재빌드 불필요,
기존 `iproxy` 재사용). **6초 만에 200**이 나왔고 `sessionId: null`이었다 —
§G가 기록한 콜드 스타트 그대로다. 그 상태에서 재관측했다.

```
명령 8개 전부 ok:true
  devices · doctor · screenshot · launch · tap · text · screenshot · stop
판정: tap이 검색 필드에 명중했고 "재기동 확인 🙂"이 그대로 입력됐다
      (ok:true가 아니라 스크린샷으로 판정)
관측: idb 관련 PID = {33853, 68043} — 둘 다 baseline의 기존 데몬
      baseline에 없던 새 PID 0건  →  AC-VISION-019 PASS (재확인)
```

**1차 관측 기록 정정**: 1차 때 `doctor`도 실패로 보였으나 그것은 WDA 문제가
아니라 **관측 스크립트의 결함**이었다 — zsh는 따옴표 없는 변수를 단어 분리하지
않으므로 `node bin.js $c`가 `"doctor --device <UDID>"` 전체를 한 인자로 넘겨
`UNKNOWN_COMMAND`가 났다. 실제로 WDA 권한 오류로 실패한 것은 `screenshot`
하나뿐이다. 테스트 하네스의 결함을 대상 코드의 결함으로 보고할 뻔했다.

#### 미검증 (Gaps)

1. **Android 경로는 이 세션에서 실행 판정하지 못했다** — 호스트에 Android 기기도
   PATH 상의 adb도 없다. M4가 건드린 Android 파일은 주석뿐이지만, 실행 확인은
   M6의 몫이다.
2. **AC-VISION-029가 이제 빈 결과가 아니다** — 위 `src/webview/` 예외 참조.
3. **WDA 권한 상실의 재현 조건은 모른다** — 러너가 약 14시간 떠 있다가 권한을
   잃었다는 사실만 관측했다. 시간 경과·특정 조작·기기 상태 중 무엇이 원인인지
   좁히지 못했다. M6에서 장시간 세션을 돌린다면 다시 만날 수 있다.

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
| WDA 창 크기 엔드포인트 존재·형식 | M3 | **결정됨(존재·세션 불필요)** | **`GET /window/size`를 쓴다.** 실측(2026-08-03, iPhone16,2/iOS 26.5.2): 세션 없이 `{"value":{"width":430,"height":932}}`를 반환한다. design.md §F가 폴백으로 지목한 PNG IHDR 파싱은 **불필요**하다 — 창 크기를 직접 주는 엔드포인트가 존재하므로 캡처를 떠서 헤더를 파싱할 이유가 없다. 다만 `/screenshot` 역시 세션 없이 동작하므로 폴백 경로 자체는 언제든 되살릴 수 있다 |
| WDA 세션 ID 재획득 절차 | M3 | **결정됨(POST /session으로 생성)** | **세션이 없으면 `POST /session`(앱 미지정)으로 만들고, 이후 `/status`로 재확인한다.** design.md §B.2의 채택안(“`/status`에서 얻는다”)은 **콜드 스타트에서 성립하지 않는다** — 세션이 없으면 `{"sessionId": null}`이다. §B.2가 기각한 대안이 실측으로 복권됐다. 기각 근거였던 “세션 생성이 앱 활성화를 수반해 화면을 바꾼다”도 반증됐다: 중립 화면(설정)에서 생성 전후 캡처가 118787바이트로 **길이 동일**(해시만 상이 = 상태바 시계)했고, WDA 로그가 새 앱을 띄우는 대신 이미 떠 있던 앱을 찾았다(`Find the Application`). **잔여 위험**: 세션 만료·무효화 시의 재획득은 시험하지 않았다 |
| iOS 배율 실측 | M3 | **결정됨(3.0, 도출값)** | **캡처 해상도 ÷ 창 크기로 도출하며 상수로 박지 않는다**(design.md §C.1 그대로). 실측: 캡처 1290×2796, 창 430×932 → 1290/430 = 2796/932 = **정확히 3.0**. 인용값 ÷3과 일치했으나, 일치했다는 사실이 하드코딩의 근거가 되지는 않는다 — 기기마다 다르므로 도출 방식을 유지한다(AC-VISION-025) |
| 시뮬레이터 목록(`simctl`) 존치 여부 | M3 | **결정됨(제외)** | **iOS 열거는 `xcrun devicectl`만 쓰고 `simctl` 시뮬레이터 열거는 하지 않는다.** 근거: 사용자 결정(2026-08-03). 조사 결과를 제시한 뒤 선택을 받았다. 열거 ~92ms를 절약하고(research.md §1.2 ①), spec.md §C.5가 시뮬레이터를 이미 범위 밖으로 이월했다. **반대 정보(함께 기록)**: 시뮬레이터가 `devices` 목록에서 통째로 사라지므로, 시뮬레이터로 작업하려는 사용자는 이 CLI로 그 기기를 볼 수 없다. 되돌리는 비용은 낮다 — `wda-device-list.ts`에 `simctl` 경로를 더하고 병합하면 된다 |
| `dump --web` 존치 여부 | M2 | **결정됨(제거)** | **`dump` 명령을 웹 경로까지 전면 제거한다.** 근거: 사용자 결정(2026-08-03). 조사 결과를 제시한 뒤 선택을 받았다 — 존치안(`dump`를 웹 전용으로 축소, spec.md §C.4의 기본값)과 제거안을 대조했고 사용자가 제거를 택했다. **반대 정보(함께 기록)**: `dump --web`은 웹 DOM을 조회하는 유일한 진입점이었고(`tap --web`/`text --web`은 조작이지 조회가 아니다), spec.md §C.4는 "네이티브 dump만 제거"를 기본값으로 두었으며 REQ-VISION-007(웹뷰 회귀 금지)을 상한으로 지목했다. 즉 이 결정은 SPEC의 기본값을 사용자 권한으로 뒤집은 것이다. **회귀 범위 실측**: `runWebDump` + 자체 테스트 4건 제거. 같은 파일의 page 선택 5건·플랫폼 가드 2건은 `runInWebSession`(생존 경로) 커버리지였으므로 삭제하지 않고 `runWebTap`으로 재지정했다 — 삭제했다면 살아남은 경로의 커버리지가 함께 죽었고 그것이야말로 REQ-VISION-007 위반이었을 것이다. `--web` CSS 셀렉터 조작 경로(AC-VISION-031)는 무변경 |
| `--index` 플래그 제거 여부 (M2에서 새로 발견) | M2 | **결정됨(존치)** | **`--index`는 웹 전용 플래그로 존치한다.** plan.md §B M2 item 4와 AC-VISION-008은 `--index` 제거를 지시하지만, `web-support.ts` `readSelector`가 `tap --web "<CSS>" --index N`에 이 플래그를 쓰고 `web-support.test.ts`가 그 동작을 고정하고 있다(관측: 해당 테스트 2건). 제거하면 SPEC-WEBVIEW-001 기능이 깨진다. spec.md §C.4가 "어느 쪽이든 REQ-VISION-007이 상한"이라 못박았고 §D 제약도 `--web` 동작 유지를 명시하므로, 상한이 plan 항목과 AC 문구를 이긴다. **결과: AC-VISION-008의 `--index` 절은 명시적 미충족**(`--id` 절은 충족). acceptance.md 개정으로 AC에서 `--index`를 빼는 대안이 있으나 SPEC 본문 수정이라 이 마일스톤에서 하지 않았다 |
| iOS `getScreenSize` 화면 크기 출처 (M2에서 새로 발견) | M2 | **결정됨(undefined 강등)** | **`IdbBackend.getScreenSize`가 항상 `undefined`를 반환하도록 강등한다.** M1이 남긴 임시 구현이 UI 계층 덤프에 의존했는데(그 자체가 `@MX:UPGRADE: M3` 표시가 붙은 임시물이었다) M2가 그 메서드를 제거하므로 iOS는 M2~M3 구간에 화면 크기 출처가 없다. 추측 대신 거부를 택했다 — `SCREEN_SIZE_UNKNOWN` 계약이 그대로 유지되므로 잘못된 좌표로 되돌릴 수 없는 제스처를 보내지 않는다(REQ-VISION-001 오류 계약 보존). **실기기 영향 없음**: iOS 실기기에서 idb UI 계열 명령은 이미 실패한다(research.md §2.1, 인용). 잃는 것은 시뮬레이터 scroll뿐이며 spec.md §C.5가 시뮬레이터를 범위 밖으로 명시 이월했다. **미검증**: 이 "실기기 영향 없음" 판단은 research.md의 **인용**에 근거하며 이번 세션에서 실기기로 확인하지 않았다. M3에서 WDA `getScreenSize`가 공백을 닫는다 |
| iOS 배율 실측값 | M3 | **결정됨(3.0, 인용값과 일치)** | 캡처 1290×2796 ÷ 창 430×932 = **3.0**. 인용값 ÷3과 일치했다. 다만 코드는 여전히 도출한다 — 일치가 하드코딩의 근거가 되지는 않는다(AC-VISION-025 grep 0건으로 확인). 위 `iOS 배율 실측` 행과 같은 관측이며, 이 행은 그 값의 기록이다 |
| iOS `stopApp` 경로 (M3에서 새로 발견) | M3 | **결정됨(WDA terminate + 상태 재확인)** | **`POST /session/:id/wda/apps/terminate`로 종료하고, 응답이 유실되면 `apps/state`로 재확인해 확정한다.** `plan.md` §B M3 item 3이 지목한 `devicectl device process launch`는 종료 명령이 아니며, `devicectl`에는 종료 서브커맨드 자체가 없다(`launch/resume/sendMemoryWarning/signal/suspend`, `signal`은 `--pid` 요구 — 실측). **반대 정보(함께 기록)**: 이 엔드포인트는 응답을 돌려주지 않는다(4/4 유실). 재확인 없이 그대로 쓰면 성공한 종료가 실패로 보고된다. 재확인 경로는 실기기 `stop` 명령에서 발동해 `ok:true`를 냈고 이후 상태 조회가 1(미실행)을 반환했다. **잔여 위험**: 재확인 시점과 실제 종료 시점 사이에 다른 주체가 앱을 다시 띄우면 오판할 수 있다 |
| iOS 다기기 WDA 포트 귀속 (M3에서 새로 발견) | M3 | **결정됨(serial→포트 매핑)** | **`EXPLORE_MOBILE_WDA_PORTS="<udid>=<port>,…"`로 선언하고, 선언된 상태에서 미등록 serial이 오면 거부한다(`WDA_PORT_UNMAPPED`).** 근거: 사용자 결정(2026-08-03). WDA 포트는 `iproxy -u`가 묶어 준 기기 1대에만 연결되는데 `/status`는 기기 **종류**만 알려주므로(실측: `"device": "iphone"`) CLI가 스스로 신원을 검증할 수 없다. **잔여 위험**: 매핑 미선언 시 기본 8100으로 흘려보내며 검증하지 못한다(`wda-client.ts` `@MX:DEBT`). 실측 당시 iPhone·iPad 2대가 동시 연결된 상태였다 |
| `webkit-errors.ts` idb 참조 처리 | M4 | **결정됨(문자열 언급 — 주석 수정)** | **실제 호출이 아니라 문자열 언급이었다** — 오류 클래스에 `code` 프로퍼티를 두는 패턴의 출처를 적은 3행 주석이다. 해당 언급만 지웠다(`ime-errors.ts` 패턴으로 서술 유지). **반대 정보(함께 기록)**: `src/webview/`는 AC-VISION-029가 무변경을 요구하는 PRESERVE 영역이다. AC-029의 예외 조항이 이 파일을 명시하므로 수정 자체는 조항 안에 있으나, 같은 디렉터리의 `coordinates.test.ts`(조항 미명시)도 함께 수정했다 — 사용자 결정(2026-08-03)이며 그 결과 AC-029의 `git diff`는 더 이상 빈 결과가 아니다. 둘 다 주석만 바뀌어 동작 변화는 없다 |
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
