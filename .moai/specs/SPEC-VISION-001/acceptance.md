# SPEC-VISION-001 — acceptance.md

인수 기준. 각 AC는 **판정 수단**을 명시하며, 그 수단이 실제로 결함을 잡을 수 있는지를 함께 기록한다.

## 판정 수단 등급

| 등급 | 의미 |
|---|---|
| **G**(grep/정적) | 텍스트·타입 검사로 기계 판정. 존재/부재 판정에 유효 |
| **U**(단위 테스트) | mock 기반. **외부 프로세스·HTTP의 실제 동작은 판정 불가** |
| **D**(실기기) | 실제 기기에서 관측. 외부 경계 너머의 유일한 판정 수단 |

**mock 한계 원칙**: 외부 CLI 호출과 HTTP 응답의 실제 동작은 U로 판정할 수 없다. U가 통과해도 D가 실패할 수 있으며, 그 반대는 성립하지 않는다. 아래 표에서 D가 필요한 AC는 U 단독으로 닫을 수 없다.

---

## REQ-VISION-001 — 화면 크기 네이티브 소스

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-001** | `src/cli/commands/scroll.ts`에 `dumpUiHierarchy` 호출이 없다 | **G** `grep -n 'dumpUiHierarchy' src/cli/commands/scroll.ts` → 0건 |
| **AC-VISION-002** | `DeviceBackend`에 `getScreenSize`가 존재하고 `ScreenSize`를 반환한다 | **G** `grep -n 'getScreenSize' src/schema/device-backend.ts` → 1건 이상 |
| **AC-VISION-003** | `AdbBackend.getScreenSize`가 실기기에서 `wm size` 실제 출력을 파싱해 올바른 크기를 반환한다 | **D** 필수. 기대: SM-S938N에서 `{w:1440, h:3120}`. **U 단독 불가** — mock은 `wm size`의 실제 출력 형식(멀티 디스플레이·폴더블 변형 포함)을 알지 못한다 |
| **AC-VISION-004** | 화면 크기 조회 실패 시 `SCREEN_SIZE_UNKNOWN`을 반환한다(기존 계약 유지) | **U** 파싱 실패 입력으로 판정 가능 + **D** 실제 실패 상황 1회 확인 |
| **AC-VISION-005** | `scroll`이 기존과 동일한 좌표를 산출한다(회귀 없음) | **D** 필수. 같은 기기·같은 화면에서 제거 전후 스크롤 결과 스크린샷 비교 |

---

## REQ-VISION-002 — dump·네이티브 셀렉터 제거

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-006** | `dumpUiHierarchy`가 `src` 어디에도 없다 | **G** `grep -rn 'dumpUiHierarchy' src` → 0건 |
| **AC-VISION-007** | `dump` 명령이 라우터에 등록되어 있지 않다 | **G** `grep -n '"dump"' src/cli/router.ts` → 네이티브 dump 등록 0건 |
| **AC-VISION-008** | `--id` / `--index` 플래그가 `args.ts`에 없다 | **G** `grep -n "id:\s*{ type\|index:\s*{ type" src/cli/args.ts` → 0건 |
| **AC-VISION-009** | 제거된 플래그 지정 시 좌표 탭으로 조용히 대체되지 않고 오류로 거부된다 | **U** `tap --id foo` → 알 수 없는 옵션 오류. **좌표 탭이 일어나지 않음**을 함께 확인 |
| **AC-VISION-010** | `normalize/element-query.ts`·`uiautomator.ts`·`idb.ts`가 존재하지 않는다 | **G** `ls src/normalize/` → `webdom.ts`(+테스트)만 남음 |
| **AC-VISION-011** | `src/schema/common-element.ts`는 **존치**한다(`--web`이 사용) | **G** 파일 존재 확인. 이 AC는 **과잉 제거를 막는 음성 대조**다 |

---

## REQ-VISION-003 — iOS WDA 단일 경로

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-012** | iOS 실기기에서 `screenshot`이 WDA를 통해 성공한다 | **D** 필수. **U 불가** — HTTP 응답 mock은 WDA 실제 동작을 증명하지 못한다 |
| **AC-VISION-013** | iOS 실기기에서 좌표 `tap`이 의도한 요소를 명중한다 | **D** 필수. 판정은 **탭 전후 스크린샷 비교**. `ok:true`는 오라클이 아니다 |
| **AC-VISION-014** | iOS 실기기에서 한글+이모지 입력이 성공한다 | **D** 필수. `안녕하세요 반갑습니다 🙂` 입력 후 스크린샷에서 문자열 확인 |
| **AC-VISION-015** | WDA 미기동 상태에서 `WDA_UNREACHABLE` 오류가 반환되며 메시지에 복구 절차가 포함된다 | **D** 필수. WDA를 실제로 내린 뒤 명령 실행. **U는 연결 실패를 흉내낼 뿐 실제 실패 형태를 모른다** |
| **AC-VISION-016** | WDA 실패가 다른 경로로 조용히 대체되지 않는다 | **D** AC-015과 같은 조건에서, 오류 대신 성공 응답이 오지 않음을 확인 |

---

## REQ-VISION-004 — idb 전면 제거

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-017** | `src` 전체에 idb 참조가 없다 | **G** `grep -rl 'idb\|Idb\|IDB' src --include='*.ts'` → 빈 결과 |
| **AC-VISION-018** | idb 전용 파일이 존재하지 않는다 | **G** `ls src/backend/idb-*.ts 2>/dev/null` → 없음 |
| **AC-VISION-019** | idb가 설치된 환경에서도 idb 프로세스가 생성되지 않는다 | **D** 필수. 명령 실행 중 프로세스 관측. **G/U 불가** — 코드에 문자열이 없어도 간접 호출 가능성은 실행으로만 배제된다 |
| **AC-VISION-020** | `doctor`가 idb 대신 WDA 상태를 점검한다 | **D** `doctor` 실행 결과에 WDA 항목 존재, idb 항목 부재 |

---

## REQ-VISION-005 — 열거 1회

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-021** | `BackendRegistry`가 `DeviceBackend` facade를 구현하지 않는다 | **G** `grep -n 'implements DeviceBackend' src/backend/registry.ts` → 0건 |
| **AC-VISION-022** | `tap` 실행 시 `listDevices`가 정확히 1회 호출된다 | **U** 유효 — mock 호출 횟수 계수는 내부 제어 흐름 판정이므로 mock의 한계에 걸리지 않는다 |
| **AC-VISION-023** | 모든 기기 대상 명령(11개)에서 열거가 1회다 | **U** 명령별 반복 판정 |
| **AC-VISION-024** | 실기기에서 명령 지연이 제거 전 대비 유의하게 감소한다 | **D** 필수. 제거 전 baseline은 `research.md` §1.2(① 관측: tap 1916~2327ms). **수치는 실측으로 보고하며 `research.md` §6-3의 산술 추정을 실측으로 제시하지 않는다** |

---

## REQ-VISION-006 — 좌표계 계약

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-025** | 배율이 상수로 하드코딩되어 있지 않다 | **G** `grep -rn '/ 3\|\* 3\b\|SCALE = 3' src/backend/wda-*.ts` → 하드코딩 배율 0건 |
| **AC-VISION-026** | 배율이 스크린샷 해상도와 창 크기에서 도출된다 | **U** 두 입력을 주고 도출값 검증 |
| **AC-VISION-027** | iOS 실기기에서 도출된 배율이 실제 탭 명중으로 확인된다 | **D** 필수. 인용값 ÷3과 대조하되, **인용값이 일치하지 않아도 실측이 우선**이며 그 사실을 기록한다 |
| **AC-VISION-028** | Android 배율이 1.0으로 도출된다 | **D** 캡처 해상도 = `wm size`. ① 관측 기준 1440×3120 |

---

## REQ-VISION-007 — 웹뷰 회귀 금지

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-029** | `src/webview/` 전체가 변경되지 않았다 | **G** `git diff --name-only <기준SHA>..HEAD -- src/webview/` → 빈 결과(단, `webkit-errors.ts`의 idb 참조 처리는 M4 결정에 따라 예외 가능하며 그 경우 progress.md에 근거 기록) |
| **AC-VISION-030** | `normalize/webdom.ts`가 존치한다 | **G** 파일 존재 |
| **AC-VISION-031** | `--web` CSS 셀렉터 경로가 동작한다 | **D** 필수. SPEC-WEBVIEW-001의 검증 시나리오 재실행 |
| **AC-VISION-032** | `dump --web` 존치 여부 결정이 기록되어 있다 | **G** `progress.md`에 결정과 근거 존재 |

---

## REQ-VISION-008 — 실기기 검증

| AC | 기준 | 판정 |
|---|---|---|
| **AC-VISION-033** | Android 실기기에서 비전 루프가 end-to-end로 통과한다 | **D** 캡처 → 좌표 판정 → 탭 → 검증 캡처 → 한글 입력 → 검증 캡처. 각 단계 스크린샷 보존 |
| **AC-VISION-034** | iOS 실기기에서 비전 루프가 end-to-end로 통과한다 | **D** 동일 절차 |
| **AC-VISION-035** | 검증에 사용한 모든 조작 좌표가 사전 스크린샷으로 확인됐다 | **D** 절차 준수 기록. spec.md §C.6의 함정 재발 방지 |
| **AC-VISION-036** | 제거 전후 성능이 같은 tree·같은 기기에서 측정됐다 | **D** 측정 조건(기기 시리얼, 연결 방식, 커밋 SHA)이 기록되어 있다 |
| **AC-VISION-037** | 커버리지가 제거 전후 같은 명령으로 측정되어 기록됐다 | **G/U** `pnpm test:coverage` 출력 2회분. 분모 변화가 함께 기록되어 있다 |

---

## 품질 게이트

| 항목 | 기준 | 판정 |
|---|---|---|
| **AC-VISION-038** | `pnpm typecheck` 통과 | **G** exit 0 |
| **AC-VISION-039** | `pnpm build` 통과 | **G** exit 0 |
| **AC-VISION-040** | `pnpm test` 전부 통과 | **U** exit 0 |

---

## 미충족 허용 조건

다음의 경우 AC를 **명시적 미충족**으로 기록하고 닫을 수 있다. 조용히 통과시키는 것은 허용되지 않는다.

- **D 등급 AC**에서 해당 기기를 사용할 수 없는 경우 — 사유(기기 부재, WDA 인증서 만료 등)와 함께 `progress.md`에 미검증으로 기록한다. **U 통과로 대체 판정하지 않는다.**
- iOS 관련 D 등급 AC는 WDA 7일 만료(② 인용)에 걸릴 수 있다. 만료로 검증 불가 시 그 사실 자체를 기록한다.

미충족 AC가 하나라도 남으면 이 SPEC은 `completed`가 아니라 미충족 목록을 명시한 상태로 닫힌다.
