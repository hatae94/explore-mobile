---
id: SPEC-WEBVIEW-001
title: "iOS 시뮬레이터 웹뷰 DOM 인지 · 조작 — 진행 기록"
version: "0.1.0"
status: in-progress
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 진행 기록 — SPEC-WEBVIEW-001

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-07-27
plan_commit_sha: db9aadc
tier: M (3 artifacts — spec.md / plan.md / acceptance.md)
REQ: 20   AC: 20   추적성: 100% (미커버 0)
```

선행 스파이크(버리는 코드)로 프로토콜·소켓·좌표계·조작 가능성을 실측한 뒤 SPEC을 작성함 — spec.md §C.1.

## §E.2 Run-phase Evidence

### M1 — 좌표 변환 규칙 확정 [완료]

plan.md §B.1이 "가장 큰 미지수"로 지목한 상단 크롬 오프셋을 **추정이 아니라 실측**으로 확정했다.

#### 환경

| 항목 | 값 |
|------|-----|
| 기기 | iPhone 17 Pro, iOS 26.0 |
| UDID | `D0B3A18C-E485-4E7C-A25E-504BF4CA6163` |
| 화면 | 402 × 874 pt (`dpr: 3` → 1206 × 2622 px) |
| 웹 뷰포트 | `innerWidth: 402`, `innerHeight: 714` |
| 페이지 | `https://m.naver.com/` |
| 프록시 | `ios_webkit_debug_proxy` 1.9.2, `-F -c null:9221,:9222-9299 -s unix:<소켓>` |
| 일자 | 2026-07-27 |

#### 측정 방법 (무해 — 페이지에 부작용 없음)

1. 페이지 전체를 덮는 투명 `position:fixed` 오버레이를 삽입 → 보정용 탭이 실제 페이지 요소에 닿지 못한다.
2. `document`에 capture 단계 `touchstart` 리스너 부착.
3. 알려진 기기 좌표로 네이티브 탭(`idb ui tap` 경유 = 기존 CLI `tap`).
4. 페이지가 관측한 `pageY`를 읽어 `offset = deviceY - (pageY - scrollY)` 계산.

#### 원시 측정값 (8/8 일치, 분산 0)

| deviceY 송신 | pageY 관측 | scrollY | viewportY | offset |
|---|---|---|---|---|
| 150 | 88 | 0 | 88 | **62** |
| 300 | 238 | 0 | 238 | **62** |
| 500 | 438 | 0 | 438 | **62** |
| 700 | 638 | 0 | 638 | **62** |
| 150 | 1588 | 1500 | 88 | **62** |
| 300 | 1738 | 1500 | 238 | **62** |
| 500 | 1938 | 1500 | 438 | **62** |
| 700 | 2138 | 1500 | 638 | **62** |

x축은 별도 검증: 송신 `x=200` → 관측 `pageX=200`, 송신 `x=250` → `pageX=250`. **1:1 확정** (spec.md §C.1-⑥ 뒷받침).

#### 결론 — 오프셋은 스크롤 불변, 그러나 상수로 박지 않는다

- plan.md §B.1의 우려(사파리 툴바 접힘/펼침으로 오프셋이 변동)는 **관측되지 않았다**. scrollY 0 / 1500 양쪽에서 62로 동일.
- 그럼에도 `62`를 소스에 상수로 넣지 **않았다**. 62는 iPhone 17 Pro의 상태 표시줄 높이이지 iOS의 성질이 아니다 — 다른 기기에서 조용히 틀리는 것은 SPEC-IOS-001에서 겪은 실패 방식 그대로다.
- 채택: 오프셋은 `ViewportMetrics.topOffset`으로 **주입**하고, 위 보정 절차로 **런타임 측정**한다(세션 단위 캐시 가능).

#### 실기기 종단 검증 (계산 → 탭 → 이동)

| 단계 | 관측 |
|---|---|
| 대상 | `a[href="https://m.mail.naver.com/"]` ("메일") |
| 뷰포트 사각형 | `{x: 20, y: 348, w: 65.390625, h: 48}` |
| **배포 함수** `webRectToDevicePoint` 출력 | `{x: 53, y: 434}` |
| 오버레이 보정으로 관측한 착지점 | 뷰포트 `(53, 372)` = 요소 정중앙 `(52.695, 372)` |
| 깨끗한 페이지에서 실제 탭 시 이벤트 | `pointerdown → touchstart → touchend → click` (전부 대상 요소) |
| 결과 URL | `https://nid.naver.com/nidlogin.login?…url=https%3A%2F%2Fm.mail.naver.com%2F` (로그인 필요 링크 → 목적지 정확) |

**네이티브 탭이 웹 콘텐츠에서 `click`까지 정상 생성됨을 확인** — REQ-WEB-ACT-001(네이티브 탭 기본 경로)의 실행 가능성이 실측으로 뒷받침됨.

`null` 반환 경로도 실사례로 확인: 같은 페이지의 "MY" 링크는 `x: 719.28`로 `innerWidth: 402` 밖 → 함수가 `null` 반환 → JS `click()` 폴백 대상(REQ-WEB-ACT-002).

#### 실패한 접근 (재시도 금지)

| # | 시도 | 결과 |
|---|---|---|
| 1 | `window.screenY`로 오프셋 산출 | **0** 반환 — iOS 사파리에서 무의미 |
| 2 | `visualViewport.offsetTop` / `pageTop`으로 산출 | `offsetTop`은 항상 **0** — 크롬 오프셋과 무관 |
| 3 | JS `window.scrollTo()`로 툴바 접기 유도 | `innerHeight` 714 불변 — 크롬 상태는 **실제 제스처**(`idb ui swipe`)로만 변함 |
| 4 | 오버레이 **요소에** `touchstart` 리스너 부착 | 발화하지 않음. `document` capture 리스너는 정상 발화(`target`은 오버레이로 찍힘) |
| 5 | `Touch.clientY` 사용 | 스크롤 상태에서 페이지 기준값 보고(deviceY 500 / scrollY 1200 → `clientY` 1638.5). **`pageY - scrollY`를 쓸 것** |

프로브 위생 주의: 요소 `id`가 전역 변수를 가린다(`id="__mxcal"` → `window.__mxcal`이 DOM 요소로 잡혀 저장값을 덮음). 또한 같은 id의 오버레이를 중복 삽입하면 `getElementById` 제거가 하나만 지워 잔재가 페이지를 가린다.

#### 산출물

| 파일 | 내용 |
|---|---|
| `src/webview/coordinates.ts` | `webRectToDevicePoint` (순수 변환) + `deriveTopOffset` (보정 산식) |
| `src/webview/coordinates.test.ts` | 13건 — 실측 8점을 픽스처로 고정 + 경계/거부 조건 |

#### 검증 (실제 명령 출력)

```
pnpm vitest run   → exit 0 — Test Files 21 passed (21), Tests 316 passed (316)   [기준선 303 → +13]
pnpm typecheck    → exit 0
pnpm build        → exit 0
```

로그: `.moai/state/verify/webview-m0/`

#### 관련 AC

| AC | 상태 | 근거 |
|---|---|---|
| AC-WEB-016 (좌표 변환 규칙) | **PASS** | 위 8점 실측 + 13건 단위 테스트 + 종단 검증 |
| AC-WEB-013 (좌표 변환 불가 → 폴백) | 부분 — 변환 함수의 `null` 경로만 확보 | 폴백 실행 경로는 M5 |
| AC-WEB-012 (네이티브 탭 기본 경로) | 부분 — 좌표 산출·탭 도달성 확인 | CLI 배선은 M5 |

#### 잔여 위험

- 측정 초기 1회(기기 `y=500`, `scrollY=1200`)에서 `pageY` 1638.5가 관측되어 오프셋이 61.5로 나온 적이 있다. 체계적 8점 측정에서는 재현되지 않았고 전부 정수 62였다. 0.5 편차의 출처(탭 좌표 처리 또는 터치 좌표 소수부)는 미확인 — 반올림 정책상 영향은 1pt 미만이나 기록해 둔다.
- 툴바가 **완전히 펼쳐진** 상태(스크롤 최상단에서 주소창 확장)는 이번 관측 구간에서 별도 상태로 분리 확인되지 않았다. iOS 26 사파리는 하단 플로팅 바가 기본이라 상단 크롬은 상태 표시줄뿐이며, 그것이 오프셋 불변의 물리적 근거로 보이나 **가설**이다. 런타임 측정 방식이므로 가설이 틀려도 조용히 틀리지는 않는다.
- 다른 기기(iPad, 노치 없는 기기)에서의 오프셋은 미측정. 상수를 박지 않았으므로 설계상 대응되나 실측 확인은 필요.

## §F Phase 4 Mode Selection

```
Decision: trivial (orchestrator-direct execution, no Agent() spawn)
```

| 입력 | 값 |
|---|---|
| tier | M |
| scope (예상 파일 수) | 8–12 |
| domain 수 | 2 (webview 서비스 계층, CLI 계층) |
| 파일 언어 구성 | TypeScript 100% |
| concurrency benefit | LOW — coding-heavy (Anthropic coding-task parallelism caveat) |

| 모드 | 선택 | 사유 |
|---|---|---|
| 1 trivial (직접 실행) | **선택** | 사용자 상시 제약("Do not call the AgentTool unless the user requested it")에 의한 명시적 오버라이드 |
| 2 background | 미선택 | 쓰기 작업 포함 |
| 3 agent-team | 미선택 | RETIRED |
| 4 parallel | 미선택 | coding-heavy — parallelism caveat |
| 5 sub-agent | 미선택 | 결정 트리 단독 적용 시 이 모드였음. 사용자 제약이 우선 |
| 6 workflow | 미선택 | 기계적 대량 변환 아님, 파일 수 « 30 |

**판단 근거**: 결정 트리만 따르면 Mode 5(sub-agent)가 맞다. 그러나 사용자의 상시 제약이 에이전트 스폰을 금지하므로 오케스트레이터가 직접 실행한다. 이 오버라이드는 트리의 산출을 바꾼 것이므로 사후 감사를 위해 여기에 명시적으로 기록한다.

**Implementation Kickoff Approval**: 2026-07-27 획득. 승인 시 함께 확정된 사항 — (a) WebSocket은 Node 내장 사용 + `engines`를 `>=22`로 상향, (b) 진행 방식은 M1 완료 후 1차 확인 → M2~M5 연속 진행 → M6 후 최종 보고.
