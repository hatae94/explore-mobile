---
id: SPEC-CLEAN-001
title: "데드코드 제거 — CommonElement 계열 폐기와 미사용 의존성 정리"
version: "0.1.0"
status: completed
created: 2026-08-03
updated: 2026-08-03
author: hatae
priority: P2
phase: "v0.6.0 target"
module: "src/schema, src/cli/commands/scroll-geometry.ts, package.json"
lifecycle: spec-anchored
tags: "cleanup, dead-code, schema, dependency, vision-only"
tier: S
depends_on: [SPEC-VISION-001, SPEC-WEBVIEW-002]
---

# SPEC-CLEAN-001 — 데드코드 제거

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-03 | hatae | 최초 작성. `SPEC-VISION-001`(M1이 화면 크기 출처를 뒤집음, M2가 네이티브 정규화 제거)과 `SPEC-WEBVIEW-002`(웹 DOM 정규화 제거)가 각각 범위 밖으로 남긴 잔재를 한 번에 닫는다. 사용자 결정(2026-08-03): 데드코드는 전부 제거한다. |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 두 SPEC이 각자 범위 규율로 남긴 것

`CommonElement`는 원래 **모든 UI 인식 백엔드가 정규화해 넣던 공통 스키마**였다.
생산자가 셋 있었고 순서대로 사라졌다:

| 생산자 | 제거 시점 |
|---|---|
| Android uiautomator 정규화 | `SPEC-VISION-001` M2 |
| iOS 접근성 정규화 | `SPEC-VISION-001` M2 |
| 웹 DOM 정규화 (`normalize/webdom.ts`) | `SPEC-WEBVIEW-002` |

**이제 생산자가 0이다.** 남은 소비자는 운영 호출이 없는 `deriveScreenSize`와
그 테스트뿐이다.

`deriveScreenSize` 자체도 `SPEC-VISION-001` M1이 뒤집은 결정의 잔재다 — `scroll`은
`backend.getScreenSize`(`scroll.ts:107`)로 화면 크기를 얻는다. `deriveScreenSize`의
유일한 호출처는 `scroll.test.ts:136`의 **픽스처 헬퍼**다.

두 SPEC 모두 이 정리를 **의도적으로 범위 밖에 뒀다**(각자 §C.2 / §A.4). 범위
규율로는 옳았고, 이 SPEC이 그 청구서를 받는다.

### A.2 함께 드러난 잔재

`knip` 검출 + 수동 교차 확인:

- **`fast-xml-parser`** — `src` 사용 0건. uiautomator XML 정규화가 마지막
  소비자였고 M2에서 사라졌다. **이 패키지의 유일한 런타임 의존성**이므로
  제거하면 의존성 0개가 된다
- `schema/device-backend.ts`의 `CommonElement` re-export — 사용처 0
- `nodeWdaHttpClient` · `SwipeThresholdBasis` — **미사용 export**이지 데드코드가
  아니다(§C.1). `export`만 뗀다

### A.3 공개 API 판단

`src/index.ts`가 `CommonElement`/`ElementBounds`를 공개 export한다. 제거는 형식상
파괴적 변경이지만 **이 패키지는 npm에 게시된 적이 없다**(`npm view explore-mobile`
→ 404, 2026-08-03 확인). 실질 소비자가 0이므로 제거한다. CHANGELOG에는 그대로
파괴적 변경으로 기록한다.

### A.4 비목표 (Non-Goals)

- **CLI 출력 계약 타입화** — 별도 SPEC. 이 SPEC은 제거만 한다
- **`Node >= 22` 하한 인하** — 별개 판단(`SPEC-WEBVIEW-002` §A.4 유지)
- **`scroll-geometry.ts` 전체 삭제** — `computeScrollSwipe` 등 살아 있는 export가
  6개다. 죽은 것은 `deriveScreenSize` 하나

### A.5 Out of Scope

#### A.5.1 Out of Scope — 명시적 제외

- **`src/backend/` 동작 코드** — 이 SPEC은 스키마·미사용 심볼만 다룬다
- **비전 경로 명령 11종의 런타임 동작** — 변경 없음
- **`knip`을 CI에 배선하는 일** — 도구 도입은 별도 판단

---

## §B. 요구사항 (GEARS)

### REQ-CLEAN-001 — 생산자 없는 스키마를 제거한다

**Where** `CommonElement` / `ElementBounds`를 채우는 정규화기가 하나도 없을 때,
**the system shall** 해당 스키마 모듈과 그 테스트, 재수출, 공개 export를 제거한다.

### REQ-CLEAN-002 — 운영 호출이 없는 함수를 제거한다

**Where** `deriveScreenSize`의 운영 호출처가 0일 때, **the system shall** 이
함수와 그 전용 테스트를 제거한다. `scroll-geometry.ts`의 나머지 export는 유지한다.

### REQ-CLEAN-003 — 테스트를 남은 계약에 맞춘다

**Where** 테스트가 제거 대상 심볼로 픽스처를 구성하고 있을 때, **the system
shall** 그 테스트가 검증하던 **동작은 보존한 채** 픽스처를 남은 계약
(`backend.getScreenSize`가 돌려주는 `ScreenSize`)으로 재작성한다. 테스트를
삭제해 통과시키지 않는다.

### REQ-CLEAN-004 — 미사용 의존성을 제거한다

**Where** 런타임 의존성이 `src`에서 참조되지 않을 때, **the system shall**
`package.json`과 락파일에서 제거한다.

### REQ-CLEAN-005 — 미사용 export는 삭제가 아니라 비공개화한다

**Where** 심볼이 모듈 밖에서 import되지 않으나 모듈 안에서 사용될 때,
**the system shall** `export`만 제거하고 심볼 자체는 유지한다. 삭제하면
런타임이 깨진다(§C.1).

---

## §C. 조사에서 드러난 사실

### C.1 도구가 "미사용"이라 한 것 중 2건은 살아 있었다

```
$ npx knip
Unused exports (1)        nodeWdaHttpClient   src/backend/wda-client.ts:45
Unused exported types (2) SwipeThresholdBasis src/schema/device-backend.ts:80
                          CommonElement       src/schema/device-backend.ts:240
```

실제 확인:

| 심볼 | knip 판정 | 실제 |
|---|---|---|
| `nodeWdaHttpClient` | 미사용 export | **`wda-client.ts:143`의 기본 파라미터 값** — 지우면 런타임이 깨진다 |
| `SwipeThresholdBasis` | 미사용 export 타입 | **`device-backend.ts:89`에서 사용** |
| `CommonElement`(재수출) | 미사용 export 타입 | 사용처 0 — 제거 대상이 맞다 |

**knip은 "모듈 밖에서 import되지 않음"을 보고할 뿐 "쓰이지 않음"을 보고하지
않는다.** 목록을 그대로 따랐으면 기본 파라미터를 지워 런타임이 깨졌다.
도구 출력은 후보이지 판정이 아니다.

### C.2 게시 여부

```
$ npm view explore-mobile version
npm error 404 Not Found
```

미게시. 공개 export 제거의 실질 영향은 0이다.

---

## §D. 인수 기준 (Tier S — 인라인)

**판정 수단**: **G**(리터럴 존재/부재만) · **T**(toolchain — 컴파일러·knip) ·
**U**(단위 테스트) · **D**(실기기).

> `T` 등급은 이번에 신설했다. "참조가 살아 있는가"는 grep이 답할 수 없는
> 질문이며, 이 SPEC의 판정 대부분이 거기 해당한다. 각 G 기준에는 **음성 대조**
> (매치되면 안 되는 사례)를 함께 적는다.

| AC | 기준 | 판정 |
|---|---|---|
| **AC-CLEAN-001** | `src/schema/common-element.ts`와 그 테스트가 없다 | **G** `ls` |
| **AC-CLEAN-002** | `CommonElement`/`ElementBounds` 참조가 0건이다 | **T** `pnpm typecheck` exit 0이 곧 증명(남은 참조가 있으면 컴파일 실패). 음성 대조: `grep 'CommonElement'`는 주석·이력 서술에도 걸리므로 판정에 쓰지 않는다 |
| **AC-CLEAN-003** | `deriveScreenSize`가 없다 | **G** + **T** |
| **AC-CLEAN-004** | `scroll-geometry.ts`의 나머지 6개 export가 유지된다 | **T** 기존 테스트 통과 |
| **AC-CLEAN-005** | `scroll` 동작 테스트가 **삭제되지 않고** 재작성됐다 | **U** `scroll.test.ts` 테스트 수가 줄지 않는다 |
| **AC-CLEAN-006** | `fast-xml-parser`가 `package.json`·락파일에 없다 | **G** |
| **AC-CLEAN-007** | 런타임 의존성이 0개다 | **G** `dependencies` 부재 또는 빈 객체 |
| **AC-CLEAN-008** | `nodeWdaHttpClient`·`SwipeThresholdBasis`가 **존재하되 export되지 않는다** | **T** typecheck 통과 + knip 재실행 시 미보고 |
| **AC-CLEAN-009** | `knip` 재실행 결과가 깨끗하다 | **T** |
| **AC-CLEAN-010** | `pnpm test` / `typecheck` / `build` 통과 | **U/G** exit 0 |
| **AC-CLEAN-011** | **실기기에서 `scroll`이 동작한다** | **D** 필수. 화면 크기 경로를 건드리는 테스트를 재작성했으므로 실행으로 확인한다 |
| **AC-CLEAN-012** | `src/index.ts` 헤더 주석이 현재 export 집합과 일치한다 | **G** 제거된 정규화기 서술 부재 |

---

## §E. 제약

- **`scroll-geometry.ts`를 통째로 지우지 않는다** — 살아 있는 export 6개
- **테스트를 삭제해 통과시키지 않는다** (REQ-CLEAN-003)
- **`nodeWdaHttpClient` / `SwipeThresholdBasis` 심볼 자체를 지우지 않는다**
- 삭제 후 `typecheck`가 잔재를 짚게 한다 — grep으로 참조를 찾지 않는다

---

## §F. 성공 기준 요약

생산자 없는 스키마와 운영 호출 없는 함수가 사라지고, 런타임 의존성이 0이 된다.
`scroll` 동작 테스트는 보존된 채 남은 계약으로 재작성되며 실기기로 확인한다.
