---
id: SPEC-IMAGE-001
title: "캡처 이미지 처리 개선 — 기본 축소·기하 정보 응답·CLI 좌표 변환"
version: "0.1.0"
status: completed
created: 2026-08-10
updated: 2026-08-10
author: hatae
priority: P1
phase: "v0.6.0 target"
module: "src/cli/, src/image/"
lifecycle: spec-anchored
tags: "image, screenshot, downscale, jpeg, coordinates, scale, sips, vision-loop"
tier: M
depends_on: [SPEC-VISION-001]
---

# SPEC-IMAGE-001 — 캡처 이미지 처리 개선

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-10 | hatae | 최초 작성. 2026-08-10 실기기 2대(SM_G960N Android 10, iPad Pro 12.9 iOS 26.5.2) 실측을 근거로 삼는다(§A.1). 사용자 결정 4건이 범위를 확정했다 — ① 축소·포맷 변환 + 기하 정보 응답 + CLI 좌표 변환 3건 채택, `--crop` 제외 ② 축소를 **기본 동작**으로 하고 `--full`로 원본 ③ 좌표 변환은 **CLI가 맡는다**(사이드카 기록) ④ 이미지 처리는 **macOS 내장 `sips`**. 사용자가 "이미지 변환에 따른 좌표 계산에 대해 세부검증이 꼭 필요함"을 명시적으로 요구했고, 이를 §C.1 이중 배율 위험과 acceptance.md REQ-IMAGE-004 블록으로 흡수했다. |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 만든 해상도의 대부분이 모델에 닿지 못한다

이 CLI는 화면을 **스크린샷으로만** 읽는다(`SPEC-VISION-001` REQ-VISION-002가 `dump`와 셀렉터를 전면 제거). 그래서 캡처 한 장의 비용이 비전 루프 한 바퀴의 비용을 그대로 결정한다.

현재 `src/cli/commands/screenshot.ts:18`은 백엔드가 준 PNG 바이트를 **가공 없이** 통과시킨다. `--out`이면 그대로 파일에 쓰고, 없으면 통째 base64로 JSON에 싣는다. 응답 필드는 `serial` / `byteLength` / `savedTo` / `pngBase64` 넷뿐이다(`src/schema/command-payloads.ts:66-73`) — **가로·세로도, 찍은 시각도 없다.**

2026-08-10 실측(연결 기기 2대, `node dist/cli/bin.js screenshot`):

| 기기 | 해상도 | PNG 크기 | 캡처 소요 |
|---|---|---|---|
| SM_G960N (Android 10) | 1080×2220 | 2,300,794 B (2,247 KB) | 2.39 s |
| iPad Pro 12.9 (iOS 26.5.2) | 2732×2048 | 7,892,077 B (7,707 KB) | 0.94 s |

이 비용이 회수되지 않는다는 관측 3건:

**① 원본 해상도는 모델에 도달하지 않는다.** iPad 캡처를 실제로 열었더니 뷰어가 2732×2048 → 2000×1499로 줄이고 "좌표에 1.37을 곱하라"고 통지했다. 7.7 MB를 만들어 옮긴 대가가 판독 단계에서 버려진다.

**② base64 모드는 실사용이 불가능하다.** `--out` 없이 실행하면 JSON 한 문서가 **3,067,792자**다(Android 기준 실측). 대화 문맥에 그대로 들어가는 경로이므로, 이 모드는 계약상 존재하지만 쓰면 문맥이 붕괴한다.

**③ 배율 곱셈이 호출자 몫으로 남아 있다.** `.claude/skills/explore-mobile/SKILL.md:51-54`가 "줄어든 이미지를 보면 곱해서 되돌리라"고 지시한다. 곱셈의 주인이 코드가 아니라 호출자이므로, 좌표 오류가 구조적으로 재발한다.

축소 효과 실측(`sips -Z <W>` + JPEG q75, 같은 두 캡처):

| 대상 | 원본 PNG | 1568px PNG | 1568px JPEG q75 | 1024px JPEG q75 |
|---|---|---|---|---|
| Android | 2,247 KB | 1,414 KB | 85 KB | 40 KB |
| iPad | 7,707 KB | 2,683 KB | 267 KB | 111 KB |

축소 자체의 소요는 **0.108 s**(iPad 7.7 MB → 1568px). 캡처 소요(0.94~2.39 s) 대비 무시할 수 있다.

판독 가능성 1건 확인: iPad를 1024px JPEG q75(111 KB, 원본의 1.4%)로 줄인 뒤 실제로 읽었을 때, 메일 위젯의 본문 미리보기 소자("Mac에서 새로 로그인함 terry.ha@…")까지 판독됐다. **다만 이는 홈 화면 1장의 관측이다** — 더 빽빽한 화면에서의 판독 가능성은 미검증이며 §C.2와 acceptance.md에서 닫는다.

### A.2 목표 — 캡처가 작아지고, 곱셈은 코드가 한다

1. `screenshot`이 기본적으로 **축소·재인코딩된** 이미지를 낸다. 원본은 `--full`로 명시할 때만.
2. 응답이 이미지 기하(가로·세로·기기 해상도·배율·찍은 시각)를 싣는다 — 호출자가 외부 도구로 크기를 다시 재지 않는다.
3. `tap` / `swipe` / `scroll`이 캡처를 참조해(`--from <path>`) 좌표를 **CLI 안에서** 기기 좌표로 되돌린다. 호출자는 곱셈을 하지 않는다.

### A.3 비목표 (Non-Goals)

- **영역 잘라 찍기(`--crop`)** — 사용자 결정으로 이번 범위에서 제외. 자르면 좌표 원점이 이동해 변환 규칙이 하나 더 늘고, `sips`의 `--cropOffset`에서 오프셋이 무시되거나 축이 뒤바뀌는 이상 동작을 이미 겪었다. 축소만으로 파일이 96~97% 줄어드는 것이 실측으로 확인된 이상, 자르기의 추가 이득은 위험 대비 작다.
- **화면 변화 감지(diff)·OCR·요소 인식** — 비전 단일 경로 원칙(`SPEC-VISION-001` §A.2)을 바꾸는 일이며 별개 SPEC이다.
- **크로스 플랫폼 이미지 처리** — `sips` 채택으로 macOS 전용을 유지한다(§D.3).
- **재시도·복구 정책 변경** — `wda-client.ts`의 `idempotent ? 3 : 1`은 건드리지 않는다(`SPEC-VISION-002` AC-WDAERR-007의 회귀 방지선).

### A.4 Out of Scope

#### A.4.1 Out of Scope — 명시적 제외

- **`DeviceBackend.screenshot()`의 반환 계약** — 원본 PNG 바이트를 그대로 유지한다. 변경 금지 이유는 §C.1(이중 배율)에 있다.
- **`WdaBackend.ensureGeometry`의 배율 도출** (`src/backend/wda-backend.ts:385-409`) — 이 SPEC은 이 코드를 읽기만 하고 수정하지 않는다.
- **`getScreenSize` / `wm size` 경로** — `SPEC-VISION-001` REQ-VISION-001 소유.
- **`src/webview/`** — `SPEC-WEBVIEW-001` 소유.
- **`doctor` / `reset` / `devices` / `launch` / `stop` / `key` / `text`** — 이미지와 무관하다.

---

## §B. 요구사항 (GEARS)

### REQ-IMAGE-001 — 캡처는 기본적으로 축소·재인코딩된다

**Where** `screenshot`이 실행될 때, **the system shall** 캡처를 긴 변 기준 기본 상한(§D.1의 `DEFAULT_MAX_EDGE`)으로 축소하고 기본 포맷(JPEG)으로 재인코딩한 뒤 내보낸다. 긴 변이 이미 상한 이하이면 축소하지 않는다(확대는 하지 않는다).

### REQ-IMAGE-002 — `--full`이 원본을 낸다

**Where** `screenshot --full`이 주어질 때, **the system shall** 축소·재인코딩을 수행하지 않고 백엔드가 준 PNG 바이트를 그대로 내보낸다. 이때 응답의 배율은 1.0이다.

### REQ-IMAGE-003 — 응답이 이미지 기하를 싣는다

**Where** `screenshot`이 성공할 때, **the system shall** 응답 `data`에 다음을 포함한다: 출력 이미지의 `width`/`height`, 기기 원본 캡처의 `deviceWidth`/`deviceHeight`, `scale`(= `deviceWidth / width`), `format`, `capturedAt`(ISO-8601). 이 값들은 실제 출력 이미지에서 관측된 값이어야 하며 요청 인자에서 역산해서는 안 된다.

### REQ-IMAGE-004 — 좌표 변환은 CLI가 맡는다

**Where** `tap` / `swipe` / `scroll`에 `--from <capture-path>`가 주어질 때, **the system shall** 그 캡처의 기록된 기하로 입력 좌표를 기기 좌표로 변환한 뒤 백엔드에 전달한다. **While** `--from`이 주어지지 않을 때, 좌표는 지금과 동일하게 기기 좌표로 해석한다(기존 계약 무변경).

### REQ-IMAGE-005 — 캡처 기하는 캡처와 함께 기록된다

**Where** `screenshot --out <path>`가 성공할 때, **the system shall** 그 캡처의 기하를 사이드카 파일(`<path>.geometry.json`)로 함께 기록한다. **Where** `--from`이 참조하는 캡처의 사이드카가 없거나 읽을 수 없을 때, **the system shall** 좌표를 임의 해석하지 않고 오류로 거부한다.

### REQ-IMAGE-006 — 낡은 캡처는 거부된다

**Where** `--from`이 참조하는 캡처의 `capturedAt`이 현재로부터 신선도 상한(§D.1의 `CAPTURE_STALE_MS`)을 넘겼을 때, **the system shall** 조작을 수행하지 않고 오류로 거부하며, 오류 메시지에 캡처 시각과 경과 시간을 밝힌다. **Where** 호출자가 `--stale-ok`를 명시할 때는 거부하지 않는다.

### REQ-IMAGE-007 — base64 모드도 같은 축소를 받는다

**Where** `--out` 없이 `screenshot`이 실행될 때, **the system shall** REQ-IMAGE-001과 동일하게 축소·재인코딩한 바이트를 base64로 싣는다. 이 모드에는 사이드카가 없으므로 기하는 응답 본문(REQ-IMAGE-003)이 유일한 기록이다.

### REQ-IMAGE-008 — 변환 실패는 조용히 대체되지 않는다

**Where** 이미지 변환이 실패할 때(도구 부재, 비정상 종료, 출력 파일 부재 등), **the system shall** 구조화된 오류를 반환하며, 원본 이미지를 대신 내보내는 조용한 대체를 하지 않는다. 오류 메시지는 실패한 단계와 원인 줄을 보존한다.

### REQ-IMAGE-009 — 기존 좌표 계약에 회귀를 만들지 않는다

**Where** `--from` 없이 `tap`/`swipe`/`scroll`이 호출될 때, **the system shall** `SPEC-VISION-001` 이후의 기기-좌표 계약과 동일하게 동작한다. 제거된 플래그(`--id`/`--text`/`--web`/`--page`/`--index`)의 `INVALID_ARGS` 거부도 그대로 유지한다.

---

## §C. 위험과 미확인 질문

### C.1 이중 배율 — 이 SPEC의 최대 위험

iOS는 배율을 **상수로 두지 않고 도출한다**: `scale = 캡처 해상도 ÷ 창 크기` (`src/backend/wda-backend.ts:406`). 그 도출에 쓰는 캡처는 감싸지 않은 내부 경로 `captureScreenshot`이다(`wda-backend.ts:398`, `@MX:ANCHOR` 중첩 감싸기 금지 주석이 붙은 자리).

따라서 축소를 **백엔드의 `screenshot()` 안**에 넣으면, 도출된 배율과 새로 생긴 축소 배율이 **곱해져** 좌표가 조용히 어긋난다. `SPEC-VISION-001` AC-VISION-025가 "배율 상수 하드코딩 0건"으로 지켜온 설계가 바로 이 지점이다.

**결론(제약으로 승격, §D.2)**: 축소는 **CLI 명령 계층에서만** 한다. `DeviceBackend.screenshot()`의 반환 계약은 원본 PNG 그대로다.

이 위험은 문서로 막을 수 없다 — acceptance.md의 REQ-IMAGE-004 블록이 **양성 대조**(일부러 틀린 배율을 주면 탭이 빗나가는지)까지 포함해 실기기로 판정한다.

### C.2 JPEG 화질 하한이 미확정이다

1024px q75에서 iPad 홈 화면의 작은 글씨가 판독됐다는 관측은 **1장**이다. 밀도가 높은 화면(설정 목록, 채팅 타임라인, 표)에서도 성립하는지는 미검증이다. 기본값을 정하기 전에 acceptance.md AC-IMAGE-013이 최소 3종 화면에서 판정한다.

### C.3 반올림 오차

축소 배율의 역수를 곱하면 정수 좌표로 되돌릴 때 오차가 생긴다. 배율 2.668에서 ±1 px 입력 오차는 기기 좌표에서 ±3 px가 된다. 작은 타겟(체크박스, 아이콘 배지)에서 문제가 될 수 있으므로 acceptance.md AC-IMAGE-010이 경계를 잰다.

### C.4 검증 도구가 검증 대상을 오염시킨다

과거 실기기 검증 중 알림 배너가 탭을 가로챈 사례가 있다. 좌표 검증 AC는 탭 전후 스크린샷을 모두 보존하고, 배너가 관측되면 그 회차를 무효로 하고 재실행한다.

### C.5 미확인 질문 (이 SPEC에서 닫지 않는다)

- **Android 캡처가 2.39 s인 원인** — 이 기기(SM_G960N, Android 10)만의 값인지, `adb exec-out screencap` 일반의 값인지 계측하지 않았다. 근거 없이 캡처 경로를 바꾸지 않는다.
- **base64 모드의 존치 여부** — 3 MB JSON은 실사용 불가지만, 계약 제거는 별개 판단이다. 이 SPEC은 축소만 적용하고 존치한다.

---

## §D. 제약

### D.1 상수는 한 곳에 이름을 갖는다

`DEFAULT_MAX_EDGE`(긴 변 상한), `DEFAULT_FORMAT`, `DEFAULT_QUALITY`, `CAPTURE_STALE_MS`를 이름 있는 상수로 한 모듈에 둔다. 숫자를 코드 여러 곳에 흩뿌리지 않는다. 기본값은 §C.2 판정 뒤 확정한다.

### D.2 축소는 CLI 계층에서만 한다 (§C.1)

- `DeviceBackend.screenshot()`의 반환 계약(원본 PNG `Uint8Array`)을 바꾸지 않는다.
- `src/backend/wda-backend.ts`의 `ensureGeometry` / `captureScreenshot`을 수정하지 않는다.
- `src/backend/adb-backend.ts`의 `screenshot`을 수정하지 않는다.

### D.3 이미지 처리는 macOS 내장 `sips`

새 런타임 의존성을 추가하지 않는다(현재 `package.json`의 `dependencies`는 비어 있다). `sips`는 이 프로젝트가 이미 전제하는 macOS 환경의 기본 도구다. `--cropOffset`은 쓰지 않는다(§A.3).

호출은 기존 `src/backend/process-executor.ts` 경로를 재사용한다 — 새 프로세스 실행 방식을 만들지 않는다.

### D.4 TDD

`quality.yaml`의 `development_mode: tdd`를 따른다. 실패하는 테스트를 먼저 쓰고 확인한 뒤 구현한다.

### D.5 mock 한계

외부 프로세스(`sips`)의 실제 동작과 실기기 탭 명중은 단위 테스트로 판정할 수 없다. acceptance.md의 판정 수단 등급(G/U/D)을 따르며, D 등급 AC를 U 통과로 대체 판정하지 않는다.

---

## §E. 성공 기준 요약

`screenshot`을 그냥 실행하면 작은 이미지가 나오고, 응답만 봐도 그 이미지가 기기 화면의 어느 배율인지 알 수 있으며, `tap --from <그 캡처>`에 이미지에서 읽은 좌표를 그대로 넘기면 의도한 곳을 누른다 — 호출자는 어떤 곱셈도 하지 않는다. `--full`은 예전과 똑같이 동작하고, `--from` 없는 좌표 호출도 예전과 똑같이 동작한다.
