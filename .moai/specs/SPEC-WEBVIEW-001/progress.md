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

### M2 — WebKit Inspector 클라이언트 [완료]

`Target` 래퍼 프로토콜 클라이언트. 전송은 Node **내장 `WebSocket`** — 의존성 0개 추가, 대신 `engines.node`를 `>=22`로 상향(내장 WebSocket은 22.4+). 사용자 승인 사항.

산출물: `src/webview/inspector-client.ts`, `src/webview/webkit-errors.ts`, 테스트 19건(모의 소켓).

**실 프로토콜 검증** (모의가 아니라 실제 프록시·시뮬레이터):

| 항목 | 관측 |
|---|---|
| targetId | `page-12` — **이벤트에서 획득**. 스파이크 때는 `page-1`이었음 → 하드코딩 금지(REQ-WEB-PROTO-002)가 실측으로 정당화됨 |
| 문자열 평가 | `document.title` → `"NAVER"` |
| 구조체 평가 | `({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})` → `{"w":402,"h":714,"dpr":3}` |
| `wasThrown` | `definitelyNotDefined()` → `WEB_EVAL_THREW` + `ReferenceError…` (성공으로 오인 안 함) |

### M3 — DOM 정규화 순수 함수 [완료]

산출물: `src/normalize/webdom.ts`(수집 표현식 + 정규화), 테스트 26건(픽스처만, 기기 불필요).

**경계 검증** — 페이지 안에서 도는 수집 코드와 밖에서 도는 정규화기가 맞는지는 모의로 증명 불가하므로 실제 페이지로 확인:

```
선택자 매칭   508
수집된 항목   508          ← 수집 코드가 내보내는 모양이 정규화기가 읽는 모양과 일치
비가시 제외 후 333 (175개 제외)
tappable      331
role 분포     {"a":265,"input":2,"button":66}
```

폴백 체인도 실제로 동작: `input#query`는 `textContent`가 비어 `placeholder`("검색어를 입력해 주세요.")로, `MM_SEARCH_BACK`은 `aria-label`("이전 페이지")로 채워짐.

`normalizeWebDomIndexed`를 추가로 노출한다. 비가시 요소를 걸러내면 순번이 어긋나는데, JS 폴백은 페이지를 **같은 선택자로 다시 질의**하므로 필터 이전의 원본 인덱스가 필요하다. 이걸 안 맞추면 숨은 요소가 있는 페이지에서만 조용히 다른 요소를 누른다.

### M4 — iwdp 프로세스 생명주기 [완료]

산출물: `src/webview/proxy-service.ts`, 테스트 17건.

**실측 검증**:

| 시나리오 | 관측 |
|---|---|
| 이미 떠 있는 프록시 | `startedByUs: false`, `dispose()` 후에도 **PID 93915 그대로 생존** (REQ-WEB-PROXY-002) |
| 프록시 없음 | `startedByUs: true`, `dispose()` 후 **누수 없음** |
| 명령 실패 시(NO_WEB_PAGE) | `finally` 정리로 **누수 없음** — plan.md §B.3이 지목한 위험 차단 확인 |
| 소켓 선택 | 디스크에 5개, 점유 중 1개 → 점유 기준 선택(REQ-WEB-PROXY-001) |
| `doctor` | `webInspectorProxy: {installed: true, liveSocketCount: 1}` (AC-WEB-003 후단) |

### M5 — CLI `--web` 플래그 [완료]

산출물: `src/cli/commands/web-support.ts`, `src/webview/calibration.ts`, `src/cli/args.ts` 확장, `dump`/`tap`/`text`/`doctor` 배선. 테스트 47건.

- `--web`은 **값이 선택적**이라 `parseArgs`로 직접 표현이 안 됨(`dump --web`은 값 없음, `tap --web "<CSS>"`는 값 있음) → `normalizeWebFlagArgv`로 argv를 먼저 정규화.
- 좌표 보정은 **캐시 + 자동 감지**(사용자 결정): 기기별로 디스크 캐시(`<cache-dir>/web-calibration.json`, `ime-sessions.json`과 같은 디렉터리), 매 호출 `screen`/`inner` 기하를 대조해 회전·크롬 변화 시 자동 재측정. 캐시 적중 시에는 페이지에 아무것도 주입하지 않고 탭도 보내지 않음.
- 요소 조회를 **보정보다 먼저** 수행. 보정은 (무해하지만) 탭을 보내므로, AC-WEB-015의 "미매칭 시 아무 동작 없음"을 지키려면 순서가 이래야 함.
- `--web`과 좌표/`--id`/`--text` 동시 사용은 `TARGET_CONFLICT`로 거부 — 한쪽을 조용히 무시하지 않음.

### M6 — 실 시뮬레이터 e2e [완료 · 마감 조건 충족]

환경: iPhone 17 Pro / iOS 26.0, UDID `D0B3A18C-…`, 2026-07-27. 보정 캐시는 삭제하고 시작(콜드 스타트 포함).

| # | 명령 | 관측 결과 |
|---|------|-----------|
| 1 | `dump --web` (프록시 꺼진 상태) | CLI가 **프록시를 스스로 기동**, 요소 333개 반환 |
| 2 | `dump --web "a[href*='news']"` | 선택자 매칭 118개 |
| 3 | `tap --web "a[href*='shopping.naver.com']"` | `method: "native"`, `(183,434)` → **`shopping.naver.com/ns/home`으로 실제 이동, 스크린샷 확증** |
| 4 | `tap --web "a" --index 50` (화면 밖 요소) | `method: "js-click"` → **`m.brand.naver.com/avedakorea/…`로 실제 이동** |
| 5 | `tap --web "#MM_SEARCH_FAKE"` | `method: "native"`, `(186,188)` → 검색 오버레이 열림, `input#query` 노출 |
| 6 | `text "네이버 웹뷰" --web "#query"` | `method: "native"`, `(203,98)` → 필드 값 읽기: **`{"value":"네이버 웹뷰","focused":"query"}`** (한글 입력 + 포커스 확인) |
| 7 | 실패 경로 | `ELEMENT_NOT_FOUND` / `TARGET_CONFLICT` / `MISSING_SELECTOR` / `IWDP_NOT_INSTALLED`(PATH 심 285개 링크로 재현) / `NO_WEB_PAGE`(사파리 종료로 재현) 전부 정상 JSON |

스크린샷: `m6-before.png`, `m6-after.png`(쇼핑 이동 확증), `m6-fallback.png`, `m6-text.png`.

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-07-27
tests: 426 passed / 26 files   (기준선 303 → +123)
typecheck: exit 0
build: exit 0
coverage: 전체 92.99% stmts / 88.6% branch (목표 85% 상회), src/webview 86.4% stmts
```

### AC 매트릭스 (20건)

| AC | 상태 | 근거 |
|----|------|------|
| AC-WEB-001 살아있는 소켓 선택 | **PASS** | 단위 2건 + e2e(디스크 5 / 점유 1) |
| AC-WEB-002 자기 프록시만 정리 | **PASS** | 단위 2건 + e2e(PID 동일 생존 / 자체 기동분 정리) |
| AC-WEB-003 iwdp 미설치 graceful + doctor | **PASS** | 단위 4건 + e2e(PATH 심) + doctor 실측 |
| AC-WEB-004 열린 페이지 없음 | **PASS** | 단위 3건 + e2e(사파리 종료) |
| AC-WEB-005 Target 래퍼 전송 | **PASS** | 단위 + 실 프로토콜 |
| AC-WEB-006 targetId 이벤트 획득 | **PASS** | 단위 + 실측(`page-1`→`page-12` 변동) + grep 0건 |
| AC-WEB-007 wasThrown 오류 처리 | **PASS** | 단위 + 실 프로토콜 |
| AC-WEB-008 타임아웃 + 정리 | **PASS** | 단위(가짜 타이머) |
| AC-WEB-009 정규화 순수 함수 | **PASS** | 단위 26건(픽스처만) |
| AC-WEB-010 비가시 제외 | **PASS** | 단위 + 실측(508→333) |
| AC-WEB-011 degrade | **PASS** | 단위 |
| AC-WEB-012 네이티브 탭 기본 경로 | **PASS** | 단위 + e2e(페이지 이동 + 스크린샷) |
| AC-WEB-013 JS click 폴백 + 경로 표기 | **PASS** | 단위 + e2e(`js-click` 표기 + 실제 이동) |
| AC-WEB-014 text 포커스 후 입력 | **PASS** | 단위 + e2e(필드 값 읽기 확인) |
| AC-WEB-015 미매칭 → 무동작 | **PASS** | 단위 + e2e |
| AC-WEB-016 좌표 변환 규칙 | **PASS** | M1 실측 8/8 + 단위 13건 + 종단 검증 |
| AC-WEB-017 기존 동작 불변 | **PASS** | 기존 274건 전부 통과 |
| AC-WEB-018 JSON 봉투 계약 | **PASS** | 단위 + e2e 전 출력 파싱됨 |
| AC-WEB-019 Android → UNSUPPORTED_ON_PLATFORM | **PARTIAL** | 단위 2건 PASS. **실기기 e2e 미실시 — Android 기기 미연결** |
| AC-WEB-020 실 시뮬레이터 e2e | **PASS** | M6 표 7행 |

**19 PASS / 1 PARTIAL / 0 FAIL.**

### 잔여 위험 · 알려진 한계

- **AC-WEB-019는 단위 테스트만**이다. Android 기기가 연결되면 실측으로 승격해야 한다(SPEC-ANDROID-001의 실기기 e2e 미기록 항목과 같은 성격).
- **`doctor`의 iOS 구간은 adb가 PATH에 없으면 도달하지 않는다.** `doctor`는 adb 미설치 시 조기 반환하므로(SPEC-IOS-001에서 확립된 기존 동작, `doctor.ts` @MX:NOTE에 명시) iOS 전용 사용자는 `webInspectorProxy` 보고를 못 본다. 본 SPEC 범위 밖이나 실사용 갭이다.
- **`src/webview` 커버리지 86.4%의 미커버는 실 I/O 어댑터**(`nativeWebSocketFactory`, `spawnProxyProcess`, `nativeFetchJson`, `defaultWebDeps`)다. 단위 테스트 대신 M6 e2e로 검증했다 — 가짜 테스트로 숫자를 채우지 않았다.
- 다중 페이지일 때 "첫 번째 페이지" 규칙(plan.md §B.2)은 그대로다. 탭이 여러 개인 상황은 미검증.
- 관측 중 `src/backend/idb-doctor.ts`의 모듈 주석이 여전히 "idb `ui text`는 Unicode-native"라고 기술한다. SPEC-IOS-001에서 거짓으로 확인·개정된 전제다. 본 SPEC 범위 밖이라 수정하지 않았다.

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
