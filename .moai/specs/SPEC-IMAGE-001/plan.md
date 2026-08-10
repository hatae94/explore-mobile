# SPEC-IMAGE-001 — plan.md

구현 계획. Tier M · TDD(RED-GREEN-REFACTOR) · 마일스톤 M1~M6.

## §A.1 마일스톤 개요

| M | 제목 | 산출물 | 닫는 AC |
|---|---|---|---|
| M1 | 이미지 변환 모듈 + 상수 | `src/image/transform.ts`, `src/image/constants.ts` (+테스트) | 003, 032~034 |
| M2 | 기하 타입 + 좌표 변환 산술 | `src/image/geometry.ts`, `src/schema/command-payloads.ts` (+테스트) | 008~012 |
| M3 | `screenshot` 배선 (기본 축소 / `--full` / 사이드카) | `src/cli/commands/screenshot.ts`, `src/cli/args.ts` (+테스트) | 001~007, 024~026, 031 |
| M4 | `--from` 배선 (tap / swipe / scroll + 신선도) | `src/cli/commands/{tap,swipe,scroll}.ts` (+테스트) | 019, 023, 027~029, 035 |
| M5 | 실기기 검증 (배율별 명중 + 양성 대조) | `progress.md` §E.2 증거 | 001~002, 004~005, 013~018, 020, 023(D), 024(D), 030 |
| M6 | 문서 동기화 + 회귀 확인 | `.claude/skills/explore-mobile/SKILL.md` | 021~022, 036~038, 039~042 |

M5는 **M3·M4 완료 후에만** 실행한다. M5의 실측이 `DEFAULT_MAX_EDGE` / `DEFAULT_QUALITY` 기본값을 확정하며(spec.md §C.2), 확정값을 M1의 상수에 되돌려 반영한 뒤 M6로 넘어간다.

---

## §A.2 마일스톤 상세

### M1 — 이미지 변환 모듈 + 상수

**새 파일**
- `src/image/constants.ts` — `DEFAULT_MAX_EDGE`, `DEFAULT_FORMAT`, `DEFAULT_QUALITY`, `CAPTURE_STALE_MS` (spec.md §D.1). M5 전까지는 잠정값이며 M5 실측 후 확정한다.
- `src/image/transform.ts` — `sips` 호출 1개 함수. `src/backend/process-executor.ts`를 재사용한다(새 프로세스 실행 경로를 만들지 않는다, spec.md §D.3).

**동작**
- 입력: 원본 PNG 바이트 + 목표 상한/포맷/품질
- 출력: 변환된 바이트 + 실제 출력 해상도
- 긴 변이 상한 이하면 변환을 건너뛴다(확대 금지, AC-IMAGE-003)
- 실패는 던진다 — 원본 반환으로 대체하지 않는다(AC-IMAGE-033)

**RED 먼저**: 변환 실패 mock에서 "원본이 반환되지 않음"을 고정하는 테스트를 **가장 먼저** 쓴다. 이것이 REQ-IMAGE-008의 회귀 방지선이다.

### M2 — 기하 타입 + 좌표 변환 산술

**새 파일**
- `src/image/geometry.ts` — `CaptureGeometry` 타입 + `toDeviceCoordinate(geometry, x, y)` 순수 함수 + 사이드카 읽기/쓰기

**변경 파일**
- `src/schema/command-payloads.ts` — `ScreenshotPayload`에 `width`/`height`/`deviceWidth`/`deviceHeight`/`scale`/`format`/`capturedAt` 추가 (기존 `serial`/`byteLength`/`savedTo`/`pngBase64`는 보존)

**RED 먼저**: AC-IMAGE-010의 배율 표(1.0 / 2.668 / 1.4159 / 경계 좌표)를 테이블 테스트로 먼저 쓴다.

**주의**: `scale = deviceWidth / width`이며 `deviceHeight / height`가 아니다. 두 값이 어긋나면(비균등 축소) 오류로 거부한다 — 조용히 한쪽만 쓰지 않는다.

### M3 — `screenshot` 배선

**변경 파일**
- `src/cli/args.ts` — `full`(boolean), `max-edge`(string), `format`(string), `quality`(string) 옵션 추가. 기존 옵션 8종은 그대로 둔다.
- `src/cli/commands/screenshot.ts` — 백엔드 바이트 수신 후 M1 변환 → M2 기하 산출 → 사이드카 기록 → 응답 조립

**제약 (spec.md §D.2 — 최우선)**
- `src/backend/adb-backend.ts`, `src/backend/wda-backend.ts`를 **읽기만** 한다. 한 줄도 수정하지 않는다.
- `DeviceBackend.screenshot()` 시그니처를 바꾸지 않는다.

### M4 — `--from` 배선

**변경 파일**
- `src/cli/args.ts` — `from`(string), `stale-ok`(boolean) 추가
- `src/cli/commands/tap.ts` / `swipe.ts` / `scroll.ts` — `--from`이 있으면 사이드카를 읽어 좌표를 변환한 뒤 기존 경로로 넘긴다

**설계**: 변환 로직은 세 명령이 공유하는 한 함수에 둔다. 세 곳에 같은 산술을 복사하지 않는다.

**거부 경로가 조작보다 먼저다**: 사이드카 부재·손상·낡음은 **백엔드 호출 전에** 걸러야 한다. AC-IMAGE-025/026/027이 "백엔드 호출 0회"를 함께 판정하는 이유다.

### M5 — 실기기 검증

`.moai/reports/` 아래에 회차별 스크린샷을 보존한다. 각 회차 기록 항목:

- 기기 시리얼, 커밋 SHA, 실행 시각
- 사용한 배율(`--full` / 중간 / 최소)과 사이드카 `scale`
- 이미지에서 읽은 좌표 → 변환된 기기 좌표
- 탭 **전** 스크린샷 / 탭 **후** 스크린샷
- 배너·팝업 관측 여부 (관측되면 그 회차 무효 + 재실행, spec.md §C.4)

**양성 대조(AC-IMAGE-017)를 마지막이 아니라 명중 검증 직후에 실행한다.** 대조가 빗나가지 않으면 그 앞의 명중 판정을 신뢰할 수 없으므로, 늦게 발견할수록 재작업이 커진다.

**M5 산출로 기본값을 확정한다**: AC-IMAGE-016(3종 화면 판독)의 결과가 `DEFAULT_MAX_EDGE`/`DEFAULT_QUALITY`를 정한다. 확정 후 M1 상수를 수정하고 M3·M4 테스트를 재실행한다.

### M6 — 문서 동기화 + 회귀 확인

- `.claude/skills/explore-mobile/SKILL.md`: 축소가 기본임, `--from`으로 좌표를 넘기는 법, `--full`이 언제 필요한지. **낡은 "곱해서 되돌려라" 지시(현 51-54행)를 남겨두지 않는다** — 새 동작과 정면으로 충돌한다.
- AC-IMAGE-021/022/036/037의 회귀 grep 4건 실행
- 품질 게이트 4건 실행

---

## §A.3 파일 영향 범위

| 파일 | 성격 |
|---|---|
| `src/image/constants.ts` | 신규 |
| `src/image/transform.ts` | 신규 |
| `src/image/geometry.ts` | 신규 |
| `src/schema/command-payloads.ts` | 변경 (필드 추가) |
| `src/cli/args.ts` | 변경 (옵션 추가) |
| `src/cli/commands/screenshot.ts` | 변경 |
| `src/cli/commands/tap.ts` | 변경 |
| `src/cli/commands/swipe.ts` | 변경 |
| `src/cli/commands/scroll.ts` | 변경 |
| `.claude/skills/explore-mobile/SKILL.md` | 변경 |
| (+ 위 각각의 `.test.ts`) | 신규/변경 |

대략 10개 파일 + 테스트. Tier M(5~15 파일) 범위에 든다.

---

## §A.4 의존 순서

```
M1 ──┐
     ├──> M3 ──┐
M2 ──┘         ├──> M5 ──> M6
     └──> M4 ──┘
```

M1과 M2는 서로 독립이다. M3은 M1+M2를, M4는 M2를 필요로 한다.

---

## §A.5 PRESERVE 목록 (수정 금지)

- `src/backend/wda-backend.ts` — 전체 (spec.md §C.1 이중 배율)
- `src/backend/adb-backend.ts` — 전체
- `src/backend/wda-client.ts` — 전체 (`SPEC-VISION-002` 재시도 정책)
- `src/schema/device-backend.ts` — `screenshot()` 시그니처
- `src/webview/` — 전체
- `src/normalize/webdom.ts`
- `.moai/state/`, `.moai/logs/`, `.moai/harness/` — 런타임 관리 파일
- 다른 SPEC 디렉터리

---

## §A.6 위험 대응

| 위험 | 대응 | 확인 AC |
|---|---|---|
| 이중 배율 (spec.md §C.1) | 변환을 CLI 계층에 가둔다 | 021, 022 |
| 축소가 판독을 망침 (§C.2) | M5에서 3종 화면 판정 후 기본값 확정 | 016 |
| 반올림 오차 (§C.3) | 오차를 임계 판정이 아니라 관측 기록으로 남긴다 | 012 |
| 배너 오염 (§C.4) | 무효 회차 기록 + 재실행 | M5 절차 |
| 검사가 변환을 안 탐 | 양성 대조를 명중 검증 직후 실행 | 017, 018 |
| 조용한 원본 대체 | 실패 경로 테스트를 M1에서 **가장 먼저** 작성 | 033 |

---

## §A.7 미결정 사항 (M5가 닫는다)

- `DEFAULT_MAX_EDGE` 확정값
- `DEFAULT_QUALITY` 확정값
- `CAPTURE_STALE_MS` 확정값 — 화면 전환 속도 관측이 필요하며, M5에서 근거를 얻지 못하면 잠정값과 그 사실을 함께 기록한다
