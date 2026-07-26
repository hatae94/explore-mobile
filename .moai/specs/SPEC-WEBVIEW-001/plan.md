---
id: SPEC-WEBVIEW-001
title: "iOS 시뮬레이터 웹뷰 DOM 인지 · 조작 — 구현 계획"
version: "0.1.0"
status: draft
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 구현 계획 — SPEC-WEBVIEW-001

> 마일스톤은 **결정 번복 가능성 내림차순**으로 배치한다. 가장 바뀔 확률이 높은 결정(좌표 변환·프로토콜 클라이언트)을 앞에 두어 인간 리뷰가 고-변경 결정에 집중하도록 한다.

## §A. 컨텍스트

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 선행 SPEC: SPEC-ANDROID-001(completed), SPEC-IOS-001(completed) — 공통 스키마·CLI 계약·선택자 개념이 이미 존재
- **선행 스파이크 완료**: 프로토콜·소켓·좌표계·조작 가능성을 실측으로 확정(spec.md §C.1). 본 계획은 그 관측 위에 선다.
- PRESERVE 대상(수정 금지): `src/schema/device-backend.ts`(인터페이스 불변), `src/normalize/uiautomator.ts`, `src/normalize/idb.ts`, `src/backend/idb-*.ts`, `src/backend/adb-*.ts`

## §B. 알려진 이슈 / 리스크

### B.1 상단 크롬 오프셋 — 가장 큰 미지수 [최고 리스크]

스파이크에서 `outerHeight(874) - innerHeight(714) = 160pt`가 크롬 총합이고, 스크린샷 대조로 상단 오프셋이 **≈62pt**로 추정됐다. 그러나:

- 사파리 툴바는 **스크롤에 따라 접힘/펼침**이 있어 오프셋이 고정 상수가 아닐 수 있다.
- 추정치를 상수로 박으면 SPEC-IOS-001의 "문서 기반 가정" 실패를 반복한다.

**대응**: M1에서 오프셋을 **매 호출 실측**하는 방법을 우선 검토한다(후보: `visualViewport.offsetTop` 활용, 또는 알려진 요소의 웹 좌표와 네이티브 접근성 좌표를 대조). 실측이 불가하면 상수 + 검증 테스트로 가되, **상수임을 코드에 명시**한다.

### B.2 프로토콜 클라이언트 — 래퍼 계층 [높음]

`Target.sendMessageToTarget` 래핑은 스파이크에서 검증됐지만, 다음은 미검증이다:
- 페이지가 여러 개일 때 `targetId` 선택 규칙
- 페이지 이동(navigation) 중 `targetId` 유효성
- 연결 재사용 vs 명령마다 재연결

**대응**: M2에서 단일 페이지·단일 명령 경로를 먼저 확정하고, 다중 페이지는 "첫 번째 페이지" 규칙으로 시작한다(REQ-WEB-PROXY-004의 `NO_WEB_PAGE`와 짝).

### B.3 프로세스 생명주기 [중간]

CLI가 iwdp를 띄우고 정리해야 한다. 위험: 명령이 비정상 종료하면 프록시가 남는다(이번 세션에서 실제로 겪은 상황 — 배경 프로세스 정리가 필요했다).

**대응**: M4에서 "자신이 띄운 것만 정리" 규칙 + 프로세스 종료 훅. 이미 떠 있는 프록시는 재사용하고 종료하지 않는다(REQ-WEB-PROXY-002).

### B.4 웹뷰 비가시 요소 [낮음, 그러나 결과 품질 직결]

naver.com 링크 4개 중 3개가 `w:0,h:0`이었다. 필터링하지 않으면 선택자가 보이지 않는 요소를 잡아 "탭했는데 아무 일도 안 일어남"이 된다.

**대응**: M3 정규화에서 비가시 요소 제외(REQ-WEB-NORM-002), 픽스처 테스트로 고정.

## §C. 사전 점검 (Pre-flight)

```bash
pnpm vitest run          # 기준선: 303 통과
pnpm typecheck           # 기준선: exit 0
pnpm build               # 기준선: exit 0
which ios_webkit_debug_proxy   # v1.9.2 설치됨
xcrun simctl list devices booted   # 시뮬레이터 부팅 확인
lsof -U | grep webinspectord_sim   # 살아있는 소켓 확인
```

## §D. 제약

- 기존 `DeviceBackend` 인터페이스 **변경 금지** — 웹 경로는 별도 서비스
- 기존 명령의 기존 동작 **변경 금지** — `--web` 플래그는 가법
- `--no-verify`, `--amend`, force-push 금지
- Conventional Commits + `🗿 MoAI` 트레일러

## §E. 자체 검증 (Self-Verification)

각 마일스톤 완료 시 보고:
- AC PASS/FAIL 매트릭스 + 실제 명령 출력
- `pnpm vitest run` / `typecheck` / `build` 결과
- 실기기(시뮬레이터) 확인이 가능한 항목은 **실제 관측 결과**(SPEC-IOS-001에서 확립한 원칙 — 관측하지 않은 것을 PASS로 쓰지 않는다)

## §F. 마일스톤 (번복 가능성 내림차순)

### M1 — 좌표 변환 규칙 확정 [최고 변경 확률 · 실측 선행]

웹 CSS 픽셀 → 기기 포인트 변환을 **먼저 실측으로 확정**한다. 상단 오프셋을 매 호출 구할 수 있는지 검증하고, 불가하면 상수 + 근거 주석. 산출물: 변환 함수 + 단위 테스트 + 실측 기록.

**왜 1번인가**: 이 규칙이 바뀌면 M5(조작)의 설계가 통째로 바뀐다. SPEC-IOS-001에서 가정을 늦게 검증해 결함 4건이 나온 패턴을 피한다.

### M2 — WebKit Inspector 클라이언트 [높음 · 프로토콜 계층]

`Target` 래퍼 프로토콜 클라이언트. `targetCreated`에서 targetId 획득, 명령 감싸기, 응답 언래핑, `wasThrown` 오류 처리, 타임아웃. 산출물: 클라이언트 + mock 소켓 단위 테스트. REQ-WEB-PROTO-001~004.

### M3 — DOM 정규화 순수 함수 [높음 · 핵심 테스트 단위]

수집된 웹 요소 → `CommonElement[]`. 비가시 요소 제외. 기기 없이 픽스처만으로 테스트 가능해야 한다. 산출물: `normalize/webdom.ts` + 픽스처 테스트. REQ-WEB-NORM-001~004.

### M4 — iwdp 프로세스 생명주기 [중간 · 부작용 단계]

살아있는 소켓 탐색(점유 판별), 프록시 기동/정리, 이미 떠 있는 경우 재사용, 미설치 graceful 오류. 산출물: 프로세스 서비스 + 테스트 + `doctor` 항목 추가. REQ-WEB-PROXY-001~004.

### M5 — CLI 플래그 통합 [중간 · 사용자 대면]

`dump --web` / `tap --web` / `text --web` 배선. 네이티브 탭 기본 + JS click() 폴백(경로 표기). Android 대상 시 `UNSUPPORTED_ON_PLATFORM`. 산출물: 3개 명령 확장 + 라우터 테스트. REQ-WEB-ACT-001~005, REQ-WEB-CLI-001~003.

### M6 — 실 시뮬레이터 e2e 검증 [필수 · 마감 조건]

SPEC-IOS-001과 동일한 원칙으로, 실제 시뮬레이터에서 시나리오를 돌리고 관측 결과를 기록한다: naver.com 로드 → `dump --web`으로 요소 확인 → `tap --web`으로 섹션 이동 → 스크린샷 확증.

**이 마일스톤 없이는 `completed` 마감하지 않는다.**

## §G. 마일스톤 의존 관계

```
M1 (좌표 변환) ──┐
                 ├──> M5 (CLI 통합) ──> M6 (e2e 검증)
M2 (프로토콜) ───┤
M3 (정규화) ─────┤
M4 (프로세스) ───┘
```

M1~M4는 서로 독립이라 순서를 바꿔도 되지만, **M1을 먼저 하는 이유는 §F M1의 "왜 1번인가"** 참조.
