---
id: SPEC-WEBVIEW-001
title: "iOS 시뮬레이터 웹뷰 DOM 인지 · 조작 — 인수 기준"
version: "0.1.0"
status: in-progress
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 인수 기준 — SPEC-WEBVIEW-001

> 형식: Given-When-Then. 각 AC는 관찰 가능(테스트 출력 / 파일 존재 / 필드 검증 / 스크린샷)해야 한다. 검증 방식은 unit(mock) / e2e·manual / doc-review 중 하나 이상을 명시한다.
>
> **원칙(SPEC-IOS-001에서 확립)**: 관측하지 않은 것을 PASS로 기록하지 않는다. e2e 항목은 실제 시뮬레이터 관측 결과가 있을 때만 PASS로 올린다.

## §D. 인수 기준 매트릭스

| AC ID | 요약 | 관련 REQ | 검증 방식 |
|-------|------|----------|-----------|
| AC-WEB-001 | 살아있는 소켓만 골라 프록시 기동 | REQ-WEB-PROXY-001 | unit(mock) + e2e |
| AC-WEB-002 | 자신이 띄운 프록시만 정리 | REQ-WEB-PROXY-002 | unit(mock) |
| AC-WEB-003 | iwdp 미설치 → graceful 오류 + doctor 보고 | REQ-WEB-PROXY-003 | unit(mock) |
| AC-WEB-004 | 열린 페이지 없음 → `NO_WEB_PAGE` | REQ-WEB-PROXY-004 | unit(mock) + e2e |
| AC-WEB-005 | 명령을 Target 래퍼로 감싸 전송 | REQ-WEB-PROTO-001 | unit(mock) |
| AC-WEB-006 | targetId를 이벤트에서 획득(하드코딩 금지) | REQ-WEB-PROTO-002 | unit(mock) + greppable |
| AC-WEB-007 | `wasThrown: true` → 오류 처리 | REQ-WEB-PROTO-003 | unit(mock) |
| AC-WEB-008 | 응답 타임아웃 → 정리 후 오류 | REQ-WEB-PROTO-004 | unit(mock) |
| AC-WEB-009 | 웹 DOM → CommonElement 정규화(순수 함수) | REQ-WEB-NORM-001, REQ-WEB-NORM-003 | unit |
| AC-WEB-010 | 비가시 요소 제외 | REQ-WEB-NORM-002 | unit |
| AC-WEB-011 | 예상 밖 입력 → 빈 배열 degrade | REQ-WEB-NORM-004 | unit |
| AC-WEB-012 | `tap --web` 네이티브 탭 기본 경로 | REQ-WEB-ACT-001 | unit(mock) + e2e |
| AC-WEB-013 | 좌표 변환 불가 → JS click() 폴백 + 경로 표기 | REQ-WEB-ACT-002 | unit(mock) |
| AC-WEB-014 | `text --web` 포커스 후 입력 | REQ-WEB-ACT-003 | unit(mock) + e2e |
| AC-WEB-015 | 선택자 미매칭 → `ELEMENT_NOT_FOUND`, 무동작 | REQ-WEB-ACT-004 | unit(mock) |
| AC-WEB-016 | 웹 좌표 → 기기 좌표 변환 규칙 | REQ-WEB-ACT-005 | unit + e2e |
| AC-WEB-017 | 기존 명령 동작 불변(가법 확장) | REQ-WEB-CLI-001 | unit(회귀) |
| AC-WEB-018 | 모든 웹 명령이 JSON 봉투 계약 준수 | REQ-WEB-CLI-002 | unit(mock) |
| AC-WEB-019 | Android 대상 `--web` → `UNSUPPORTED_ON_PLATFORM` | REQ-WEB-CLI-003 | unit(mock) |
| AC-WEB-020 | 실 시뮬레이터 e2e 시나리오 | 전체 | e2e·manual |

---

### AC-WEB-001 — 살아있는 소켓만 골라 프록시 기동
- **Given** `/private/tmp/com.apple.launchd.*/`에 죽은 소켓 파일이 여러 개 있고 그중 하나만 점유 중인 상태,
- **When** `--web` 명령이 실행되면,
- **Then** 점유 중인 소켓 경로가 선택되어 `-s unix:<경로>`로 프록시가 기동된다.
- **And** 파일 존재만으로 고르지 않는다(스파이크 관측: 죽은 소켓 5개 중 유효 1개 — spec.md §C.1-④).

### AC-WEB-002 — 자신이 띄운 프록시만 정리
- **Given** 이미 떠 있는 프록시가 있는 상태,
- **When** 웹 명령이 실행되고 종료되면,
- **Then** 기존 프록시는 **종료되지 않는다**.
- **And** CLI가 직접 띄운 경우에는 종료된다.

### AC-WEB-003 — iwdp 미설치 → graceful 오류
- **Given** `ios_webkit_debug_proxy`가 PATH에 없는 상태,
- **When** 웹 명령이 실행되면,
- **Then** `IWDP_NOT_INSTALLED` JSON 오류 + 설치 안내가 반환되고 크래시하지 않는다.
- **And** `doctor`가 같은 항목을 점검·보고한다.

### AC-WEB-004 — 열린 페이지 없음
- **Given** 시뮬레이터에 열린 웹 페이지가 없는 상태,
- **When** 웹 명령이 실행되면,
- **Then** `NO_WEB_PAGE` graceful 오류가 반환된다.

### AC-WEB-005 — Target 래퍼 전송
- **Given** mock WebSocket,
- **When** 클라이언트가 `Runtime.evaluate`를 보내면,
- **Then** 실제 전송 페이로드는 `Target.sendMessageToTarget`이고, 내부 `message`가 원 명령의 JSON 문자열이다.
- **And** 감싸지 않은 원 명령은 전송되지 않는다(스파이크 관측: 미래핑 시 `domain was not found` — spec.md §C.1-②).

### AC-WEB-006 — targetId 이벤트 획득
- **Given** mock 서버가 `Target.targetCreated`로 임의의 targetId를 보내는 상태,
- **When** 클라이언트가 연결하면,
- **Then** 이후 모든 명령이 **그 값**을 사용한다.
- **And** 소스에 targetId 리터럴 하드코딩이 없다(greppable: `page-` 리터럴 부재).

### AC-WEB-007 — wasThrown 오류 처리
- **Given** mock 응답이 `{"result":{"wasThrown":true,...}}`인 상태,
- **When** 평가 결과를 해석하면,
- **Then** 오류로 취급되어 호출자에게 전파된다(성공으로 오인 금지).

### AC-WEB-008 — 타임아웃
- **Given** mock 서버가 응답하지 않는 상태,
- **When** 명령을 보내면,
- **Then** 지정 시간 내에 타임아웃 오류가 반환되고 연결이 정리된다(무한 대기 없음).

### AC-WEB-009 — 웹 DOM 정규화(순수 함수)
- **Given** 저장된 웹 요소 픽스처(기기·프록시 없음),
- **When** 정규화 함수를 호출하면,
- **Then** `role`/`text`/`id`/`bounds`/`tappable`/`enabled`/`children` 전 필드가 spec.md §F 매핑대로 채워진다.
- **And** 같은 입력에 항상 같은 출력(순수 함수).

### AC-WEB-010 — 비가시 요소 제외
- **Given** `w:0,h:0`인 요소가 섞인 픽스처,
- **When** 정규화하면,
- **Then** 비가시 요소가 결과에서 제외된다(스파이크 관측: naver.com 링크 4개 중 3개가 0 크기 — spec.md §C.1-⑤).

### AC-WEB-011 — degrade
- **Given** 배열이 아니거나 필드가 빠진 입력,
- **When** 정규화하면,
- **Then** 예외 없이 빈 배열 또는 방어적으로 매핑된 결과를 반환한다.

### AC-WEB-012 — `tap --web` 네이티브 탭
- **Given** 뷰포트 안에 있는 요소를 가리키는 CSS 선택자,
- **When** `tap --web "<CSS>"`를 실행하면,
- **Then** 요소 중심의 기기 좌표가 계산되어 **네이티브 탭**이 전송된다.
- **And** 응답에 사용한 경로(`native`)와 좌표가 표기된다.

### AC-WEB-013 — JS click() 폴백
- **Given** 뷰포트 밖 등 좌표 변환이 불가능한 요소,
- **When** `tap --web`을 실행하면,
- **Then** JS `click()`으로 폴백하고 응답에 경로(`js-click`)가 표기된다(조용한 전환 금지).

### AC-WEB-014 — `text --web` 포커스 후 입력
- **Given** 입력 가능한 요소를 가리키는 선택자,
- **When** `text "<문자열>" --web "<CSS>"`를 실행하면,
- **Then** 해당 요소가 포커스된 뒤 문자열이 입력된다.

### AC-WEB-015 — 선택자 미매칭
- **Given** 아무 요소에도 매칭되지 않는 선택자,
- **When** `tap --web` / `text --web`을 실행하면,
- **Then** `ELEMENT_NOT_FOUND`가 반환되고 **탭도 입력도 발생하지 않는다**.

### AC-WEB-016 — 좌표 변환 규칙
- **Given** 웹 `getBoundingClientRect()` 값과 알려진 뷰포트 지표,
- **When** 기기 좌표로 변환하면,
- **Then** x는 1:1로, y는 상단 크롬 오프셋이 보정되어 계산된다(스파이크 관측: `dpr:3`이지만 `innerWidth:402` = 기기 포인트 402 — spec.md §C.1-⑥).
- **And** 오프셋이 상수로 고정된 경우, 그 근거가 코드 주석에 명시된다.

### AC-WEB-017 — 기존 동작 불변
- **Given** `--web` 없이 실행하는 기존 명령들,
- **When** 전체 테스트를 실행하면,
- **Then** 기존 회귀 테스트가 전부 통과한다(가법 확장 증명).

### AC-WEB-018 — JSON 봉투 계약
- **Given** 웹 명령의 성공/오류 모든 경로,
- **When** 실행하면,
- **Then** 단일 JSON 문서가 방출되고 `JSON.parse`로 파싱된다(자유 텍스트 없음).

### AC-WEB-019 — Android 대상 거부
- **Given** Android 기기를 대상으로 `--web`을 준 상태,
- **When** 실행하면,
- **Then** `UNSUPPORTED_ON_PLATFORM` graceful 오류가 반환된다.

### AC-WEB-020 — 실 시뮬레이터 e2e 시나리오
- **Given** 부팅된 iOS 시뮬레이터에서 사파리로 naver.com이 로드된 상태,
- **When** `dump --web` → `tap --web "<선택자>"` 순으로 실행하면,
- **Then** DOM 요소가 `CommonElement[]`로 반환되고, 선택자 탭으로 **페이지가 실제로 전환된다**.
- **And** 전환 결과가 스크린샷으로 확증된다.
- **And** 이 AC가 PASS가 되기 전에는 SPEC을 `completed`로 마감하지 않는다.
