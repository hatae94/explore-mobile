# SPEC-VISION-001 — plan.md

실행 계획. 마일스톤 순서는 `design.md` §E.1의 의존 제약에서 도출된 것이며 임의 배열이 아니다.

---

## §A. 범위와 보존 목록

### A.1 변경 대상

| 영역 | 내용 |
|---|---|
| `src/schema/device-backend.ts` | `dumpUiHierarchy` 제거, `getScreenSize` 추가, `ScreenSize` 타입 이동 |
| `src/backend/` | idb 전용 파일 8종 제거, `wda-backend.ts`·`wda-client.ts`·`wda-errors.ts` 신설, `adb-backend.ts`에 `getScreenSize` 추가, `registry.ts` facade 제거 |
| `src/cli/commands/` | `dump.ts` 제거, `tap.ts`·`text.ts` 셀렉터 경로 제거, `scroll.ts` 화면 크기 소스 교체, 나머지 핸들러의 백엔드 해석 변경 |
| `src/cli/` | `args.ts` 플래그 제거, `device-targeting.ts` 반환형 확장, `bin.ts` 백엔드 등록 변경, `router.ts`·`validators.ts`·`env-services.ts` idb 분기 제거 |
| `src/normalize/` | `element-query.ts`·`uiautomator.ts`·`idb.ts` 제거 (+ 테스트) |

### A.2 PRESERVE — 건드리지 않는다

- `src/webview/**` 전부 (SPEC-WEBVIEW-001 소유). `webkit-errors.ts`의 idb 문자열 참조가 실제 idb 호출인지 단순 언급인지 M4에서 확인 후 판단하되, 웹뷰 동작은 변경하지 않는다.
- `src/normalize/webdom.ts` — `--web` 경로가 사용 중
- `src/schema/common-element.ts` — `--web`이 사용 중 (design.md §A.2)
- `src/backend/ime-session-store.ts`, `ime-binding-parser.ts`, `ime-enable-retry-predicate.ts`, `ime-errors.ts`, `adbkeyboard*.ts`, `apk-downloader.ts`, `per-serial-state.ts` — SPEC-IMESTATE-001이 `in-progress`로 작업 중인 영역
- `.moai/specs/SPEC-*` 중 이 SPEC 디렉터리 외 전부
- `.moai/state/`, `.moai/logs/`, `.moai/harness/`, `.moai/cache/` — 런타임 관리 파일
- `vendor/`, `dist/` (빌드 산출물은 빌드로만 갱신)

### A.3 병행 SPEC 충돌 회피

SPEC-IMESTATE-001이 `src/backend/`의 IME 세션 영역에서 진행 중이다. 이 SPEC은 같은 디렉터리를 건드리지만 **파일이 겹치지 않는다**(A.2의 IME 파일 목록이 경계). 마일스톤 착수 전 `git status`로 해당 파일들의 미커밋 변경 여부를 확인한다.

---

## §B. 마일스톤

### M1 — 화면 크기 소스 교체 (선행 필수)

**목표**: `scroll`이 dump 없이 화면 크기를 얻는다.

1. `ScreenSize` 타입을 `scroll-geometry.ts`에서 `src/schema/device-backend.ts`로 이동
2. `DeviceBackend`에 `getScreenSize(serial): Promise<ScreenSize>` 추가
3. `AdbBackend.getScreenSize` 구현 — `adb shell wm size` 출력 파싱 (`Physical size: 1440x3120` 형식, ① 관측 확인)
4. `IdbBackend.getScreenSize` 임시 구현 — M3에서 WDA로 교체될 자리. 이 시점에는 기존 dump 경로를 그대로 감싸 동작을 유지한다
5. `scroll.ts:104`를 `dumpUiHierarchy` → `getScreenSize`로 교체, `deriveScreenSize` 호출 제거
6. `SCREEN_SIZE_UNKNOWN` 오류 코드 계약 유지 확인

**끝 상태**: `scroll`이 dump를 호출하지 않는다. `dumpUiHierarchy`는 아직 존재한다(`dump` 명령과 셀렉터가 쓰는 중).

**위험**: `wm size`가 멀티 디스플레이·폴더블에서 여러 줄을 반환할 수 있다. 파싱은 `Physical size:` 라인을 대상으로 하고, 예상 밖 형식이면 `SCREEN_SIZE_UNKNOWN`으로 떨어뜨린다(추측 금지).

### M2 — dump + 네이티브 셀렉터 제거

**목표**: 읽기 경로가 스크린샷 하나만 남는다.

1. `dump` 명령 제거 — `src/cli/commands/dump.ts`, `router.ts` 등록, `bin.ts` 도움말 문자열
2. `tap.ts` — `tapBySelector`(34~87행) 제거, `TARGET_CONFLICT` 분기 정리, 좌표 경로만 남김
3. `text.ts` — 셀렉터 경로(57·63·97행) 제거
4. `args.ts` — `--id` / `--text` / `--index` 플래그 제거. **제거된 플래그는 알 수 없는 옵션으로 거부된다**(REQ-VISION-002 후반부)
5. `DeviceBackend.dumpUiHierarchy` 인터페이스 메서드 제거 + 각 백엔드 구현 제거
6. `src/normalize/element-query.ts`, `uiautomator.ts`, `idb.ts` 제거 (+ 테스트)
7. `web-support.ts:389` `hasNativeSelector` 충돌 검사 정리
8. **`dump --web` 존치 여부 확정** (spec.md §C.4) — `--web` 회귀 검증과 함께 결정하고 결정 내용을 progress.md에 기록

**끝 상태**: `grep -rn 'dumpUiHierarchy' src`가 0건. `--web` 경로는 동작한다.

**위험**: `CommonElement`를 과잉 제거하면 `--web`이 깨진다(design.md §A.2). 제거 대상은 네이티브 정규화기 둘뿐이다.

### M3 — iOS 백엔드 WDA 교체

**목표**: iOS 제어가 WDA HTTP로 동작한다.

1. `wda-client.ts` — HTTP 호출 래퍼. base URL `http://127.0.0.1:8100`
2. `wda-errors.ts` — HTTP 상태 + WDA `value` 응답 → 오류 코드 매핑. `WDA_UNREACHABLE` 포함
3. `wda-backend.ts` — `DeviceBackend` 구현
   - `screenshot`: `GET /screenshot`
   - `tap` / `swipe`: `POST /session/:id/actions` (W3C actions)
   - `inputText`: `POST /session/:id/wda/keys`
   - `getScreenSize`: 창 크기 조회 또는 캡처 PNG IHDR (design.md §F)
   - `launchApp` / `stopApp`: `xcrun devicectl device process launch` (② 실증 경로)
   - `listDevices`: `xcrun devicectl list devices` (① 51~53ms)
4. 세션 ID를 `/status`에서 획득 (design.md §B.2). 재획득 절차 확정
5. **iOS 배율 실측** — 캡처 해상도와 창 크기를 실제로 읽어 배율을 도출하고 인용값 ÷3과 대조
6. **시뮬레이터 목록 존치 여부 확정** (design.md §F)
7. `doctor`에 WDA 점검 추가 (idb 점검을 대체)

**끝 상태**: iOS 실기기에서 캡처·탭·입력이 WDA로 동작한다. idb 파일은 아직 남아 있다.

**위험**: WDA 미기동 상태가 흔하다. 실패 경로가 조용하지 않은지 반드시 확인한다(REQ-VISION-003).

### M4 — idb 잔재 전면 제거

**목표**: idb 호출 경로가 하나도 남지 않는다.

1. 전용 파일 제거: `idb-backend.ts`, `idb-clipboard.ts`, `idb-doctor.ts`, `idb-errors.ts`, `idb-executor.ts`, `idb-target-parse.ts`, `keycodes-ios.ts`(WDA 키 매핑으로 대체됐다면) + 각 테스트
2. 참조 정리: `registry.ts`, `doctor.ts`, `adb-backend.ts`, `bin.ts`, `args.ts`, `router.ts`, `validators.ts`, `device-targeting.ts`, `env-services.ts`, `commands/{doctor,key,reset,swipe,types}.ts`, `schema/{common-element,device-backend}.ts`
3. `webkit-errors.ts`의 idb 참조 — 실제 호출인지 문자열 언급인지 확인 후 처리 (A.2 PRESERVE 경계 준수)
4. 테스트 파일의 idb 참조 제거

**끝 상태**: `grep -rl 'idb\|Idb\|IDB' src --include='*.ts'`가 빈 결과.

### M5 — 기기 열거 1회화

**목표**: 명령 1회당 열거 1회.

1. `resolveTargetDevice`가 `{ serial, backend }`를 반환하도록 변경 (design.md §D.2)
2. 모든 명령 핸들러(11개)를 새 반환형으로 이행 — 컴파일러가 누락을 잡는다
3. `BackendRegistry`의 `DeviceBackend` facade 구현(8개 위임 메서드) 제거. `listAllDevices()`·`resolveBackend()`는 유지
4. `bin.ts`의 `runCli(argv, registry, doctor)` 배선 변경
5. **열거 횟수를 mock으로 검증** — 명령별로 `listDevices` 호출이 정확히 1회

**끝 상태**: 열거 2회 구조가 사라진다.

### M6 — 실기기 검증

**목표**: 두 플랫폼에서 비전 루프가 실제로 돈다.

1. **Android 실기기** — 캡처 → 좌표 판정 → 탭 → 검증 캡처 → 한글 입력 → 검증 캡처. 판정은 스크린샷
2. **iOS 실기기** — 동일 루프. WDA 사전 기동 + `iproxy` 필요
3. **성능 실측** — 제거 전후를 같은 tree·같은 기기에서 측정. `research.md` §7의 재현 명령 사용
4. 측정용 조작의 좌표도 사전 스크린샷으로 확인 (spec.md §C.6)
5. 브라우저 무대를 쓸 경우 결정적 시작 절차를 별도로 마련 (spec.md §C.7)
6. `--web` 회귀 확인
7. 커버리지 제거 전후 대조 기록 (design.md §E.3)

**끝 상태**: `acceptance.md`의 모든 AC가 PASS 또는 명시적 미충족 기록.

---

## §C. 기준 SHA

기준 커밋 SHA는 `progress.md` §E.2에 기록한다(plan.md 본문은 run-phase에서 수정 불가하므로).

---

## §D. 검증 명령

```bash
# 제거 완료 판정
grep -rl 'idb\|Idb\|IDB' src --include='*.ts'          # 빈 결과여야 함
grep -rn 'dumpUiHierarchy' src                          # 0건이어야 함
grep -rn "selectorText\|'--id'\|'--index'" src/cli/args.ts   # 0건이어야 함

# 빌드·타입·테스트
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage

# 열거 1회 (M5) — mock 기반 단위 테스트
pnpm test -- --run enumeration

# 실기기 (M6) — research.md §7 참조
```

---

## §E. 위험과 완화

| 위험 | 완화 |
|---|---|
| M2에서 `--web`을 깨뜨림 | `CommonElement`·`webdom.ts` PRESERVE, M2 끝에 `--web` 회귀 확인 |
| M3에서 WDA 엔드포인트가 예상과 다름 | 창 크기는 PNG IHDR 폴백 보유. 세션 ID는 `/status` 실측으로 확정 |
| M5의 타입 변경이 광범위 | TypeScript strict가 누락을 컴파일 에러로 노출 |
| 시뮬레이터 경로 상실 | spec.md §C.5에서 명시적 이월. 이번 SPEC은 실기기만 요구 |
| 커버리지 수치의 착시 | 제거 전후를 같은 명령으로 측정해 분모 변화를 함께 기록 |
| 병행 SPEC과의 파일 충돌 | A.2 PRESERVE에 IME 파일 명시, 착수 전 `git status` 확인 |
