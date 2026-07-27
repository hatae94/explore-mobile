---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 인수 기준"
version: "0.2.0"
status: draft
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 인수 기준 — SPEC-GESTURE-001

> 형식: Given-When-Then. 각 AC는 관찰 가능해야 한다.
>
> **원칙**: 관측하지 않은 것을 PASS로 기록하지 않는다(SPEC-IOS-001에서 확립). Android 기기가 연결되지 않은 상태로 마감하면 Android 항목은 **PARTIAL**로 남긴다 — SPEC-WEBVIEW-001의 AC-WEB-019와 같은 처리다.

## §D. 인수 기준 매트릭스

| AC ID | 요약 | 관련 REQ | 검증 방식 |
|-------|------|----------|-----------|
| AC-GEST-001 | `swipe` argv가 기기 셀렉터 포함해 플랫폼별로 정확 | REQ-GEST-SWIPE-001 | unit(mock) |
| AC-GEST-002 | `--duration` ms → 플랫폼 단위 환산 | REQ-GEST-SWIPE-002 | unit(mock) |
| AC-GEST-003 | 잘못된 좌표 → 오류, 무동작 | REQ-GEST-SWIPE-003 | unit(mock) |
| AC-GEST-004 | 기존 8개 백엔드 메서드 동작 불변 | REQ-GEST-SWIPE-004 | unit(회귀) |
| AC-GEST-005 | iOS 실기기 스와이프 | REQ-GEST-SWIPE-001 | e2e·manual |
| AC-GEST-006 | Android 실기기 스와이프 | REQ-GEST-SWIPE-001 | e2e·manual |
| AC-GEST-007 | `scroll <dir>` 방향별 좌표 계산 | REQ-GEST-SCROLL-001 | unit |
| AC-GEST-008 | 화면 크기를 `dump`에서 결정적으로 파생 | REQ-GEST-SCROLL-002 | unit(mock) + grep |
| AC-GEST-009 | `--amount` 반영 + 범위 밖은 `INVALID_AMOUNT` | REQ-GEST-SCROLL-003 | unit |
| AC-GEST-010 | 화면 크기 불명 → `SCREEN_SIZE_UNKNOWN`, 무동작 | REQ-GEST-SCROLL-004 | unit(mock) |
| AC-GEST-011 | iOS 실기기 스크롤 | REQ-GEST-SCROLL-001 | e2e·manual |
| AC-GEST-012 | 화면 밖 웹 요소를 끌어와 네이티브 탭 | REQ-GEST-WEB-001 | unit(mock) + e2e |
| AC-GEST-013 | 스크롤 발생 사실을 응답에 표기 | REQ-GEST-WEB-002 | unit(mock) + e2e |
| AC-GEST-014 | 끌어와도 안 되면 JS 폴백 유지 | REQ-GEST-WEB-003 | unit(mock) |
| AC-GEST-015 | JSON 봉투 계약 준수 | REQ-ARCH-001 (SPEC-ANDROID-001 계승) | unit + e2e |
| AC-GEST-016 | `scroll` 성공 응답에 방향 + 실제 좌표 표기 | REQ-GEST-SCROLL-005 | unit |

---

### AC-GEST-001 — `swipe` argv 구성

- **Given** mock 실행기,
- **When** `swipe 100 800 100 200`을 실행하면,
- **Then** 각 백엔드가 아래 argv를 **정확히** 구성한다(기기 셀렉터 포함):
  - Android: `["-s", serial, "shell", "input", "swipe", "100", "800", "100", "200"]`
  - iOS: `["ui", "swipe", "--udid", serial, "100", "800", "100", "200"]`
- **And** 셸을 거치지 않고 argv 배열로 전달된다(기존 실행기 계약).

> 셀렉터를 뺀 부분 문자열 검증으로는 부족하다 — 기존 `tap`도 `-s <serial>`/`--udid <serial>`을 넣는다(`adb-backend.ts:218`, `idb-backend.ts:196`). 셀렉터가 빠지면 다중 기기에서 엉뚱한 기기가 움직인다.

### AC-GEST-002 — `--duration` 단위 환산

- **Given** mock 실행기,
- **When** `swipe 100 800 100 200 --duration 500`을 실행하면,
- **Then** **Android** argv는 ms를 그대로 실어 `"500"`으로 끝난다 — `[..., "swipe", "100", "800", "100", "200", "500"]`.
- **And** **iOS** argv는 `"--duration"` 토큰을 포함하고, 그 **다음 토큰을 수로 읽으면 `0.5`다**(`500`이 아니다). ms → 초 환산이 `IdbBackend` 안에서 일어난다.
- **And** 생략 시에는 **양 플랫폼 모두** 지속시간 인자를 붙이지 않는다(플랫폼 기본값 사용). iOS argv에 `"--duration"` 토큰이 없어야 한다.

> **이 AC가 이번 개정의 핵심이다.** `idb`의 `--duration`은 **초**이고(spec.md §C.1-⑦: fb-idb `hid.py`의 `duration: Optional[float]`, 그리고 이 저장소가 `MODIFIER_HOLD_SECONDS = 2`를 `--duration 2`로 넘겨 2초 홀드로 쓰고 있다) `adb`는 **ms**다. "지속시간이 각 플랫폼의 인자 형식으로 전달된다" 수준의 서술로는 **그냥 흘려보내는 구현이 통과해 버리고**, 결함은 M5 e2e에서 500초짜리 정지처럼 뒤늦게 드러난다. 환산 후 리터럴 값을 못박는다.

### AC-GEST-003 — 잘못된 좌표

- **Given** mock 실행기,
- **When** 좌표가 **4개가 아니거나 비정수**인 호출(`swipe 100 800 100`, `swipe 1.5 800 100 200`)을 실행하면,
- **Then** `INVALID_COORDINATES`가 반환된다.
- **And** **When** 좌표에 **음수 리터럴**이 섞인 호출(`swipe 100 -50 100 200`)을 실행하면, `INVALID_ARGS`가 반환된다.
- **And** 두 갈래 **모두에서 어떤 제스처도 전송되지 않는다**(mock 실행기 호출 0회).

> 갈래가 둘인 이유: `-50`은 `node:util.parseArgs`가 미인식 옵션으로 소비해 핸들러 진입 **전에** throw하고(`args.ts:79-81`), 라우터가 이를 `INVALID_ARGS`로 바꾼다(`router.ts:81-83`). 전처리를 새로 넣어 `INVALID_COORDINATES`로 재라우팅하지 않기로 했다(plan.md §F M2에 근거 한 줄). **어느 쪽이든 무동작 보장은 동일하다** — 이 AC가 검증하는 것도 그 점이다.

### AC-GEST-004 — 기존 동작 불변

- **Given** `swipe`를 추가한 `DeviceBackend`,
- **When** 전체 테스트를 실행하면,
- **Then** 기존 회귀 테스트가 전부 통과한다(438건 기준선, 감소 없음).
- **And** 기존 8개 메서드의 시그니처가 바뀌지 않는다.
- **And** 테스트 더블 5개 지점(plan.md §F M1-5)이 9번째 메서드를 갖도록 갱신되어 `pnpm typecheck`가 exit 0이다.

### AC-GEST-005 — iOS 실기기 스와이프

- **Given** 부팅된 iOS 시뮬레이터에서 스크롤 가능한 화면,
- **When** `swipe`를 실행하면,
- **Then** 화면이 실제로 움직인 것이 **스크린샷 또는 `dump` 변화로 확증**된다.

### AC-GEST-006 — Android 실기기 스와이프

- **Given** 연결된 Android 기기,
- **When** `swipe`를 실행하면,
- **Then** 화면이 실제로 움직인 것이 확증된다.
- **And** 승격에는 **`adb` 설치와 기기 연결이 둘 다** 필요하다. 현재 이 머신에는 `adb` 자체가 없다(`command -v adb` → not found). 그 상태로 마감하면 이 AC는 **PARTIAL**로 남기고, adb 문법·단위가 미실측임을 문서에 남긴다(spec.md §C.2).

### AC-GEST-007 — `scroll` 방향 계산

- **Given** 알려진 화면 크기,
- **When** 각 방향으로 `scroll`하면,
- **Then** 시작·끝 좌표가 방향에 맞게 계산된다.
- **And** `scroll down`은 **아래 내용을 보기 위해 손가락을 위로 미는** 좌표를 만든다(끝점 y < 시작점 y).
- **And** 좌표가 화면 밖으로 나가지 않는다.

### AC-GEST-008 — 화면 크기 파생

- **Given** 최상위 항목이 **3개**이고 그중 **인덱스 0이 화면 전체가 아닌** mock `dump` 결과:

  ```
  [ {bounds:{x:0, y:0,   w:402, h:60}},    // 상단 바 — 인덱스 0이지만 화면 전체가 아니다
    {bounds:{x:0, y:0,   w:402, h:874}},   // 화면 전체
    {bounds:{x:0, y:800, w:402, h:74}} ]   // 하단 바
  ```

- **When** `scroll`을 실행하면,
- **Then** 화면 크기가 **402 x 874**로 파생된다 — `width = max(x+w)`, `height = max(y+h)`(REQ-GEST-SCROLL-002).
- **And** 인덱스 0만 보는 구현은 402 x 60을 얻어 **이 AC에서 실패한다**. 단일 루트 픽스처로는 이 실수를 잡을 수 없어 최상위 2개 이상을 요구한다(iOS `describe-all`은 평탄 배열이라 최상위가 여럿이다 — spec.md §C.1-⑧).
- **And** `DeviceBackend`에 화면 크기 조회 메서드가 **추가되지 않았다.** 실행 가능한 확인:

  ```bash
  grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts
  # 기대값: 9  (개정 전 기준선 8 + swipe 1개. 10 이상이면 크기 조회 메서드가 들어간 것)
  ```

- **And** `src/schema/device-backend.test.ts`의 `Record<keyof DeviceBackend, true>` 타입 레벨 검사가 **9개**로 갱신된 채 통과한다(같은 사실의 컴파일 타임 확인).

### AC-GEST-009 — `--amount`

- **Given** 알려진 화면 크기,
- **When** `--amount 0.25`와 `--amount 0.75`로 각각 스크롤하면,
- **Then** 이동 거리가 비율에 비례해 달라진다(0.75 쪽 이동 거리가 0.25 쪽의 3배).
- **And** **When** 다음 입력들을 주면 각각 `INVALID_AMOUNT`가 반환된다: `--amount 0`, `--amount 1.5`, `--amount abc`, `--amount ""`.
- **And** **When** `--amount -0.5`(음수 리터럴)을 주면 `INVALID_ARGS`가 반환된다 — AC-GEST-003의 음수 좌표와 **동일한 이유이며 동일한 처리**다.
- **And** 위 **모든** 갈래에서 **어떤 제스처도 전송되지 않는다**(mock 실행기 호출 0회).
- **And** `--amount 0.25` / `--amount 1` 같은 유효 입력은 거부되지 않는다. 경계는 이 AC가 고정한다: **0 초과 1 이하**(`0`은 이동 없는 제스처라 거부, `1`은 화면 한 장 분량이라 허용).

> 두 갈래로 나뉘는 근거는 실측이다. `node:util.parseArgs`는 `--amount -0.5`에서 `ERR_PARSE_ARGS_INVALID_OPTION_VALUE`를 던지고(`-`로 시작하는 토큰을 옵션 값으로 받지 않는다), 나머지 4개는 정상적으로 문자열 값으로 통과시킨다 — 2026-07-27 확인. 즉 음수는 파서 계층에서, 나머지는 검증 계층에서 걸린다.
>
> 그리고 기존 `parseCoordinate`/`parseIndex`는 정규식 `^\d+$`라 소수를 통과시키지 못한다(`validators.ts:17-31`). 새 비율 파서 없이는 `--amount 0.25`가 유효 입력조차 되지 못한다.

### AC-GEST-010 — 화면 크기 불명

- **Given** `dump`가 빈 배열이거나 파생된 크기가 0 이하인 상태,
- **When** `scroll`을 실행하면,
- **Then** `SCREEN_SIZE_UNKNOWN`이 반환되고 **어떤 제스처도 전송되지 않는다**.
- **And** 기본값을 추측해 스와이프하지 않는다.

### AC-GEST-011 — iOS 실기기 스크롤

- **Given** 부팅된 시뮬레이터에서 긴 페이지,
- **When** `scroll down` → `scroll up`을 실행하면,
- **Then** 각각 실제로 스크롤된 것이 확증된다(웹 페이지라면 `scrollY` 변화로).
- **And** Safari 전면 상태에서 `dump`가 화면 전체 크기를 주지 못하면(plan.md §B.5), `SCREEN_SIZE_UNKNOWN` 반환이 **설계대로의 정상 동작**이다. 그 경우 이 AC는 `swipe`(좌표 직접 지정)로 스크롤을 확증하고, `scroll` 경로는 네이티브 화면에서 확증한다. **크기를 추측하는 폴백을 넣어 통과시키지 않는다.**

### AC-GEST-012 — 화면 밖 웹 요소 도달

- **Given** 뷰포트 밖에 있는 웹 요소를 가리키는 CSS 선택자,
- **When** `tap --web "<CSS>"`를 실행하면,
- **Then** 요소가 뷰포트 안으로 들어온 뒤 **네이티브 탭**으로 눌린다.
- **And** 실기기에서 페이지가 실제로 전환된 것이 확증된다.

### AC-GEST-013 — 스크롤 사실 표기

- **Given** AC-GEST-012의 상황,
- **When** 명령이 성공하면,
- **Then** 응답이 **스크롤이 일어났음을 구분 가능하게** 표기한다 — 스크롤 없이 눌린 경우와 같은 값이 아니다.
- **And** 페이지 스크롤 위치 변경은 부작용이므로 조용히 넘어가지 않는다.

### AC-GEST-014 — 폴백 유지

- **Given** 끌어온 뒤에도 좌표 변환이 불가능한 요소,
- **When** `tap --web`을 실행하면,
- **Then** 기존 JS `click()` 폴백이 쓰이고 그 경로가 응답에 표기된다(SPEC-WEBVIEW-001 REQ-WEB-ACT-002 불변).

### AC-GEST-015 — JSON 봉투

- **Given** 신규 명령의 성공/오류 모든 경로,
- **When** 실행하면,
- **Then** 단일 JSON 문서가 방출되고 `JSON.parse`로 파싱된다.
- **And** 이 계약은 SPEC-ANDROID-001의 `REQ-ARCH-001`을 계승한 것이며, 본 SPEC은 새 계약을 만들지 않는다.

### AC-GEST-016 — `scroll` 응답의 방향·좌표 표기

- **Given** 알려진 화면 크기,
- **When** `scroll down`이 성공하면,
- **Then** 성공 응답에 **방향**(`"down"`)과 **실제 시작·끝 좌표**가 함께 실린다.
- **And** 표기된 끝점 y가 시작점 y보다 작다 — 즉 응답만 보고도 방향 의미가 맞는지 즉시 판정된다(plan.md §B.2).
- **And** 좌표만 맞고 방향 표기가 없는 응답은 **실패**다. AC-GEST-007은 좌표만 보므로, 표기 누락을 잡는 것은 이 AC뿐이다.
