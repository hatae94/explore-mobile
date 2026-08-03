---
id: SPEC-WEBVIEW-002
title: "--web 경로 전면 제거 — 읽기 수단을 스크린샷 하나로 확정한다"
version: "0.1.0"
status: completed
created: 2026-08-03
updated: 2026-08-03
author: hatae
priority: P1
phase: "v0.6.0 target"
module: "src/webview, src/cli/commands/web-support.ts, src/normalize/webdom.ts"
lifecycle: spec-anchored
tags: "webview, removal, supersedes, vision-only, simulator, scope"
tier: M
depends_on: [SPEC-VISION-001]
supersedes: SPEC-WEBVIEW-001
---

# SPEC-WEBVIEW-002 — `--web` 경로 전면 제거

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-03 | hatae | 최초 작성. `SPEC-WEBVIEW-001`을 supersede한다. 착수 계기는 `--web` 프록시 기동 결함 후속 SPEC을 열려던 중, **그 기능이 이미 도달 불가**임이 실측된 것이다(§A.1). 사용자 결정(2026-08-03): 비전 온리로 진행하므로 제품에 필요하지 않다. |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 기능이 이미 도달 불가다

`--web`은 **시뮬레이터 소켓만** 찾는다. `proxy-service.ts:33`:

```ts
const SOCKET_MARKER = "com.apple.webinspectord_sim.socket";   // _sim
```

그런데 `SPEC-VISION-001` M3의 §G 결정이 iOS 열거에서 `simctl`을 제외했다
(`devicectl`만 사용). 결과: **시뮬레이터를 지목할 방법이 없다.** 2026-08-03 실측 —
같은 시뮬레이터가 부팅돼 있는 상태에서:

```
$ xcrun simctl list devices booted
  iPhone 17 Pro (D0B3A18C-E485-4E7C-A25E-504BF4CA6163) (Booted)

$ node dist/cli/bin.js screenshot --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
  {"ok":false,"error":{"code":"DEVICE_NOT_FOUND", …}}
```

실기기가 `--web`을 부르면 `proxy-service.ts:275-277`이 *"Boot a simulator"* 라고
답한다 — 실기기 웹뷰는 전송계층(usbmux)이 달라 구현된 적이 없다.

**즉 이 기능은 어떤 기기로도 실행할 수 없는 상태다.**

### A.2 결정의 성격 — 판단 없이 사라진 지원을 명시적으로 닫는다

`SPEC-VISION-001` §C.5는 **"시뮬레이터 지원 여부는 이 SPEC이 결정하지 않으며,
필요해지면 별도 SPEC이 연다"**고 적었다. 그런데 M3 §G가 `simctl` 제거를 결정하며
근거로 §C.5를 인용했다 — **유보를 배제로 읽은 것**이다. 시뮬레이터 지원이
결정 없이 사실상 사라졌다.

이 SPEC이 그 결정을 **명시적으로** 내린다: 비전 온리로 진행하므로 시뮬레이터
전용 DOM 셀렉터 경로는 제품에 필요하지 않다(사용자 결정 2026-08-03).

### A.3 제거가 해소하는 것

- **`AC-VISION-008`의 `--index` 절 미충족이 풀린다.** `--index`는 `web-support.ts`
  때문에만 남았고(`args.ts:28-31`이 그렇게 적고 있다), 실제 소비자도 그 파일
  하나다. 웹이 가면 `--index`·`--page`도 간다.
- **README의 자기모순이 사라진다.** 「읽기 경로는 스크린샷 하나다」와
  「iOS 웹 콘텐츠(`--web`)」가 나란히 있다 — `--web`은 두 번째 읽기 경로다.
- **미해결 결함이 0이 된다.** `--web` 프록시 기동 결함과 `AC-VISION-031`
  조건부 PASS가 함께 소멸한다.

### A.4 비목표 (Non-Goals)

- **`Node >= 22` 하한 인하** — `WebSocket`(Node 22.4+) 사용처가 `inspector-client.ts`
  하나뿐이라 인하 여지가 생기지만, 소비자 대상 변경이므로 **별개 판단**이다
- **`CommonElement` 스키마 제거** — §C.2 참조. 기존 데드코드이며 이 SPEC이 만든
  것이 아니다
- **iOS 실기기 웹뷰 구현** — 전송계층이 다르며(usbmux) 필요해지면 별도 SPEC
- **`scroll-geometry.ts` 정리** — §C.2 참조

### A.5 Out of Scope

#### A.5.1 Out of Scope — 명시적 제외

- **`src/backend/` 전체** — 웹 경로와 무관하다
- **비전 경로 명령 9종** (`devices`/`launch`/`stop`/`screenshot`/좌표 `tap`/`key`/
  `swipe`/`scroll`/`text`) — 접점이 가드 한 줄뿐이라 동작이 바뀌지 않는다
- **`src/index.ts`의 `CommonElement`/`ElementBounds` export** — 공개 API 유지

---

## §B. 요구사항 (GEARS)

### REQ-WEBRM-001 — 웹 전용 모듈을 삭제한다

**Where** 웹 경로만 사용하는 모듈이 존재할 때, **the system shall** 이를
저장소에서 제거한다: `src/webview/` 전체, `src/normalize/webdom.ts`,
`src/cli/commands/web-support.ts`(각 테스트 포함).

### REQ-WEBRM-002 — 플래그를 제거한다

**Where** CLI 인자를 파싱할 때, **the system shall** `--web` / `--page` /
`--index`를 더 이상 받지 않는다. 세 플래그의 소비자는 `web-support.ts`
하나였다.

### REQ-WEBRM-003 — 제거된 플래그는 조용히 대체되지 않는다

**Where** 호출자가 `tap --web "<CSS>"` 같은 제거된 형태를 보낼 때,
**the system shall** `INVALID_ARGS`로 거부한다. 좌표 탭으로 조용히 강등하지
않는다 — `SPEC-VISION-001` REQ-VISION-002가 `--id`/`--text` 제거에 적용한
원칙과 같다.

### REQ-WEBRM-004 — 비전 경로에 회귀를 만들지 않는다

**Where** 웹 경로를 제거할 때, **the system shall** 비전 경로 명령 9종의 동작을
바꾸지 않는다. `tap`/`text`의 접점은 함수 진입부 가드 한 줄이다.

### REQ-WEBRM-005 — `doctor` 계약 변경을 기록한다

**Where** `doctor`가 환경을 보고할 때, **the system shall**
`wdaEnvironment.webInspectorProxy` 필드를 더 이상 내보내지 않으며, 이 **출력
계약 변경**을 CHANGELOG에 breaking change로 명시한다.

### REQ-WEBRM-006 — 낡아지는 주석을 함께 고친다

**Where** 소스 주석이 `--web`을 존재 근거로 인용하고 있을 때, **the system
shall** 그 주석을 정정한다. 대상: `schema/common-element.ts`(「남은 소비자는
웹 경로」), `schema/device-backend.ts`(re-export 유지 근거).

---

## §C. 조사에서 드러난 사실

### C.1 접점은 4곳이며 전부 가장자리다 (2026-08-03 코드 확인)

| 위치 | 모양 |
|---|---|
| `tap.ts:25` | `if (args.web !== undefined) return runWebTap(...)` — 진입부 가드 |
| `text.ts:27` | 동일 |
| `doctor.ts:64,77` | `Promise.all` 3개 검사 중 1개 |
| `args.ts` | 플래그 정의 |

웹 모듈 7개는 **서로와 `web-support.ts`에서만** import된다. `swipe`/`scroll`/
`screenshot` 등 비전 경로는 한 곳도 참조하지 않는다. `src/index.ts` 공개
export에 웹 관련 0건.

### C.2 `CommonElement`는 고아가 되지 않는다 (제거 대상 아님)

`common-element.ts:6` 주석은 **"남은 소비자는 웹 경로"**라고 적고 있으나
관측 결과 다르다 — `scroll-geometry.ts`의 `deriveScreenSize(elements:
CommonElement[])`가 여전히 이 타입을 쓴다.

다만 `deriveScreenSize`의 **운영 호출처는 0건**이다(호출: `scroll.test.ts:136`
한 곳, 테스트 픽스처 헬퍼). 운영 경로는 `backend.getScreenSize`
(`scroll.ts:107`)로 바뀌었다 — `SPEC-VISION-001` M1이 뒤집은 결정이다.

**즉 이것은 M1이 남긴 기존 데드코드이며 이 SPEC이 만든 것이 아니다.** 범위
규율에 따라 건드리지 않고 기록만 한다(§A.4). 주석만 사실에 맞게 고친다
(REQ-WEBRM-006).

### C.3 사라지는 오류 코드 6종

`WEB_INSPECTOR_UNREACHABLE` · `WEB_EVAL_THREW` · `WEB_INSPECTOR_TIMEOUT` ·
`IWDP_NOT_INSTALLED` · `NO_WEB_PAGE` · `AMBIGUOUS_PAGE`

`AMBIGUOUS_DEVICE`(기기 모호)는 **남는다** — 이름이 비슷하지만 다른 코드다.

---

## §D. 제약

- **비전 경로 파일을 수정하지 않는다** — `src/backend/`, `scroll.ts`, `swipe.ts`,
  `screenshot.ts`, `key.ts`, `devices.ts`, `launch.ts`, `stop.ts`
- **`src/index.ts`의 공개 export를 바꾸지 않는다**
- **`scroll-geometry.ts` / `CommonElement`를 삭제하지 않는다** (§C.2)
- 삭제 후 `pnpm test` / `typecheck` / `build`가 전부 통과해야 한다

---

## §E. 성공 기준 요약

웹 전용 모듈·플래그·오류 코드가 사라지고, 비전 경로 명령 9종의 동작과 공개
API가 그대로다. `doctor` 출력 필드 1개 소멸은 breaking change로 문서화된다.
