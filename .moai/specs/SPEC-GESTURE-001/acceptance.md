---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 인수 기준"
version: "0.1.0"
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
| AC-GEST-001 | `swipe` argv 구성이 플랫폼별로 정확 | REQ-GEST-SWIPE-001 | unit(mock) |
| AC-GEST-002 | `--duration` 전달 | REQ-GEST-SWIPE-002 | unit(mock) |
| AC-GEST-003 | 잘못된 좌표 → `INVALID_COORDINATES`, 무동작 | REQ-GEST-SWIPE-003 | unit(mock) |
| AC-GEST-004 | 기존 8개 백엔드 메서드 동작 불변 | REQ-GEST-SWIPE-004 | unit(회귀) |
| AC-GEST-005 | iOS 실기기 스와이프 | REQ-GEST-SWIPE-001 | e2e·manual |
| AC-GEST-006 | Android 실기기 스와이프 | REQ-GEST-SWIPE-001 | e2e·manual |
| AC-GEST-007 | `scroll <dir>` 방향별 좌표 계산 | REQ-GEST-SCROLL-001 | unit |
| AC-GEST-008 | 화면 크기를 `dump` 루트에서 파생 | REQ-GEST-SCROLL-002 | unit(mock) |
| AC-GEST-009 | `--amount` 반영 | REQ-GEST-SCROLL-003 | unit |
| AC-GEST-010 | 화면 크기 불명 → `SCREEN_SIZE_UNKNOWN`, 무동작 | REQ-GEST-SCROLL-004 | unit(mock) |
| AC-GEST-011 | iOS 실기기 스크롤 | REQ-GEST-SCROLL-001 | e2e·manual |
| AC-GEST-012 | 화면 밖 웹 요소를 끌어와 네이티브 탭 | REQ-GEST-WEB-001 | unit(mock) + e2e |
| AC-GEST-013 | 스크롤 발생 사실을 응답에 표기 | REQ-GEST-WEB-002 | unit(mock) + e2e |
| AC-GEST-014 | 끌어와도 안 되면 JS 폴백 유지 | REQ-GEST-WEB-003 | unit(mock) |
| AC-GEST-015 | JSON 봉투 계약 준수 | 전체 | unit + e2e |

---

### AC-GEST-001 — `swipe` argv 구성
- **Given** mock 실행기,
- **When** `swipe 100 800 100 200`을 실행하면,
- **Then** Android 백엔드는 `input swipe 100 800 100 200`을, iOS 백엔드는 `ui swipe 100 800 100 200`을 구성한다.
- **And** 셸을 거치지 않고 argv 배열로 전달된다(기존 실행기 계약).

### AC-GEST-002 — `--duration`
- **Given** mock 실행기,
- **When** `swipe 100 800 100 200 --duration 500`을 실행하면,
- **Then** 지속시간이 각 플랫폼의 인자 형식으로 전달된다.
- **And** 생략 시에는 지속시간 인자를 붙이지 않는다(플랫폼 기본값 사용).

### AC-GEST-003 — 잘못된 좌표
- **Given** 좌표가 4개가 아니거나 음수·비정수인 호출,
- **When** 실행하면,
- **Then** `INVALID_COORDINATES`가 반환되고 **어떤 제스처도 전송되지 않는다**.

### AC-GEST-004 — 기존 동작 불변
- **Given** `swipe`를 추가한 `DeviceBackend`,
- **When** 전체 테스트를 실행하면,
- **Then** 기존 회귀 테스트가 전부 통과한다(438건 기준선).
- **And** 기존 8개 메서드의 시그니처가 바뀌지 않는다.

### AC-GEST-005 — iOS 실기기 스와이프
- **Given** 부팅된 iOS 시뮬레이터에서 스크롤 가능한 화면,
- **When** `swipe`를 실행하면,
- **Then** 화면이 실제로 움직인 것이 **스크린샷 또는 `dump` 변화로 확증**된다.

### AC-GEST-006 — Android 실기기 스와이프
- **Given** 연결된 Android 기기,
- **When** `swipe`를 실행하면,
- **Then** 화면이 실제로 움직인 것이 확증된다.
- **And** 기기가 연결되지 않은 상태로 마감하면 이 AC는 **PARTIAL**로 남기고, adb 문법이 미실측임을 문서에 남긴다(spec.md §C.2).

### AC-GEST-007 — `scroll` 방향 계산
- **Given** 알려진 화면 크기,
- **When** 각 방향으로 `scroll`하면,
- **Then** 시작·끝 좌표가 방향에 맞게 계산된다.
- **And** `scroll down`은 **아래 내용을 보기 위해 손가락을 위로 미는** 좌표를 만든다(끝점 y < 시작점 y).
- **And** 좌표가 화면 밖으로 나가지 않는다.

### AC-GEST-008 — 화면 크기 파생
- **Given** 루트 요소 bounds가 `{0,0,402,874}`인 mock `dump` 결과,
- **When** `scroll`을 실행하면,
- **Then** 그 크기를 기준으로 좌표가 계산된다.
- **And** `DeviceBackend`에 화면 크기 조회 메서드가 **추가되지 않았다**(greppable: 인터페이스 메서드 9개).

### AC-GEST-009 — `--amount`
- **Given** 알려진 화면 크기,
- **When** `--amount 0.25`와 `--amount 0.75`로 각각 스크롤하면,
- **Then** 이동 거리가 비율에 비례해 달라진다.
- **And** 범위를 벗어난 값은 graceful 오류로 거부된다.

### AC-GEST-010 — 화면 크기 불명
- **Given** `dump`가 빈 배열이거나 루트 bounds가 0인 상태,
- **When** `scroll`을 실행하면,
- **Then** `SCREEN_SIZE_UNKNOWN`이 반환되고 **어떤 제스처도 전송되지 않는다**.
- **And** 기본값을 추측해 스와이프하지 않는다.

### AC-GEST-011 — iOS 실기기 스크롤
- **Given** 부팅된 시뮬레이터에서 긴 페이지,
- **When** `scroll down` → `scroll up`을 실행하면,
- **Then** 각각 실제로 스크롤된 것이 확증된다(웹 페이지라면 `scrollY` 변화로).

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
