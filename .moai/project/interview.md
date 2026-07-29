# Project Interview

> `/moai project` Phase 4 (기존 프로젝트 경로) 산출물. 2026-07-29.
> Stage A는 Round 1에서 4개 필수 필드가 모두 채워져 조기 종료했고(`domain` 자동 채움 + `goal`·`constraints`·`scope` 응답),
> Stage B는 조기 종료와 무관하게 필수 실행되었다.

## Stage A Round 1: Ownership, Purpose, and Goal

Question: 이 프로젝트의 현재 위치와 앞으로의 목표를 어떻게 잡을까요?
Answer: 활발히 개발 중인 제품

Domain: `cli-tooling` — 모바일 기기(Android/iOS) 제어 CLI (auto-populated from codebase analysis)

Goal: 에이전트가 모바일 기기를 안정적으로 조작할 수 있게 하는 원시 동작 계층을 계속 넓혀 나간다. 문서는 현재 구현 상태뿐 아니라 로드맵 방향(SPEC-04 탐색 루프, SPEC-05 Codex 래퍼)까지 담는다.

근거: SPEC 4건이 모두 `completed`이고 로드맵에 SPEC-04/05가 남아 있으며, 2026-07-29 하루에만 실기기 결함 5건을 발견·수정했다(SPEC-ANDROID-001 0.3.0·0.4.0).

## Stage A Round 2: Constraints and Non-Goals

Question: 이 프로젝트가 지켜야 할 제약은 무엇입니까?
Answer: 조용한 성공 금지 · 의존성 최소화 · JSON 입출력 계약 고정 (3건 모두 선택)

Constraints:

1. **조용한 성공 금지** — `ok:true`를 반환하면서 기기에서 아무 일도 일어나지 않는 것을 결함으로 취급한다. 2026-07-29 하루에 고친 5건 중 **2건**이 정확히 이 부류였다 — IME 바인딩 경쟁(입력이 유실되고 `ok:true`), 키보드 숨김이 웹 입력을 지움(`ok:true`인데 필드가 비어 있음). 나머지 3건은 **시끄럽게 실패했지만 이유가 틀렸다**: `launch`는 손으로 누르면 열리는 앱을 "해석 불가"라 보고했고, `ime enable`은 사용자가 알 수 없는 이유로 실패했으며, 미연결 기기 계수는 봉투(`ok:false`)는 정직했으나 메시지 본문이 거짓 수를 주장했다. 무음 2건이야말로 **모든 mock 테스트와 이전 검증 라운드를 전부 통과한** 부류이고, 그래서 제약으로 이름이 붙었다. 따르는 규율: **mock은 구성한 argv까지만 검증하고 기기가 그 argv를 어떻게 해석하는지는 검증하지 못한다** — 효과·타이밍·화면 변화는 실측 판정이 필요하다.

   > 정정 이력: 이 항목의 최초 기록은 "5건 중 4건"이었다. 독립 감사(`PROJECT-review-1.md` D3)가 반증했고 직접 세어 확인했다. 출처는 `README.md`의 "four `ok:true` defects" 서술인데, 그것은 **SPEC-GESTURE-001의 0.4.0** 개정을 가리키는 별개 집합이다 — 두 SPEC의 결함 집합을 섞은 오류였다.
2. **의존성 최소화** — 런타임 의존성은 `fast-xml-parser` 하나뿐이다. `commander` 대신 `node:util.parseArgs`(stdlib), WebSocket 라이브러리 대신 Node 내장 `WebSocket`(이 때문에 `engines.node >= 22`), HTTP 클라이언트 대신 전역 `fetch`를 쓴다. ADBKeyBoard APK는 GPL-2.0이라 MIT 패키지에 번들하지 않고 런타임에 고정 태그에서 받는다.
3. **JSON 입출력 계약 고정** — 모든 명령이 stdout에 JSON 문서를 정확히 1개 찍고 자유 텍스트를 절대 내지 않는다. 오류도 구조화된 코드로만 나간다. 이 계약이 깨지면 에이전트 연동이 전부 무너진다.

## Stage A Round 3: Scope, Boundaries, and Documentation Priority

Question: CLI가 어디까지 책임지고 어디부터는 안 할까요?
Answer: CLI는 원시 동작만 (2026-07-27 사용자 결정의 재확인)

Scope:

- **IN** — 기기 제어 원시 동작(tap/swipe/scroll/text/key/dump/screenshot/launch/stop), 플랫폼 차이 흡수(공통 요소 스키마 + `DeviceBackend` + 레지스트리 라우팅), JSON 입출력 계약, 환경 부트스트랩·정리(`doctor`/`reset`).
- **OUT** — 탐색 루프, 재시도 전략, "지금 어떤 화면인지"의 판단, 테스트 시나리오 저장·리포팅. 이들은 **에이전트가 담당**한다.

Documentation priority: 아키텍처와 모듈 경계 (구조가 어떻게 나뉘고 어디에 플랫폼 지식이 모여 있는지)

파급: SPEC-04는 신규 기능 SPEC이 아니라 **"두 기기 상호작용에 필요한 원시 동작이 이미 충분한가"를 점검하는 성격**이 된다.

## Stage B Round 4: Verification, Surfaces, and Sharing

Verification: `pnpm test` (vitest run) · `pnpm typecheck` (tsc --noEmit) · `pnpm build` (tsc -p tsconfig.build.json).
**자동화된 품질 게이트는 없다는 사실을 함께 문서화한다** — CI 워크플로가 테스트를 돌지 않고(`.github/workflows/`에 `label-sync.yml` 하나뿐), `.git_hooks/pre-push`는 `Makefile` 부재로 항상 skip되며, 85% 커버리지 기준은 `acceptance.md`에만 있고 `vitest.config.ts`에 `thresholds` 블록이 없다. 지금까지의 모든 초록불은 수동 실행 결과다.

UI surface: `headless` (CLI — 사용자 대면 UI 없음, JSON in/out) — auto-populated from codebase analysis

External systems: `adb`(Android Platform Tools) · `idb` + `idb_companion`(fb-idb 1.1.7, Python 3.11 필요) · `ios_webkit_debug_proxy`(iOS `--web` 전용) · GitHub Releases(ADBKeyBoard APK 런타임 취득). **데이터베이스 없음.** — auto-populated from codebase analysis

Team sharing: `solo` (단독 유지, 현재 사용자 없음)
