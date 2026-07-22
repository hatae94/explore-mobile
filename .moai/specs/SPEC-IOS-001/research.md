---
id: SPEC-IOS-001
title: "iOS 시뮬레이터(idb) 백엔드 — 리서치(idb JSON 스키마·명령·버전)"
version: "0.1.0"
status: draft
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
---

# 리서치 — SPEC-IOS-001

> idb는 미유지보수 도구이므로 필드명/시그니처를 **문서로 검증**했다(WebFetch, 2026-07-22). 확인 불가 항목은 **가정으로 명시**하고 Run 단계 실 픽스처 확정 대상으로 표기한다. 미검증 필드를 확정처럼 제시하지 않는다.

## §1. 검증 방법 · 출처

- `http://fbidb.io/docs/accessibility/` — 접근성 필드 + describe-all 실 JSON 예시(2026-07-22 WebFetch 확인).
- `http://fbidb.io/docs/commands/` — 명령 시그니처(2026-07-22 WebFetch 확인).
- `https://github.com/facebook/idb` — 릴리스/설치/버전(2026-07-22 WebFetch 확인).
- 본 세션에 iOS 시뮬레이터 없음 → JSON 스키마는 **문서 기반 검증**, 실 픽스처 캡처는 Run 단계(§6).

## §2. idb `ui describe-all` JSON 스키마 (검증됨)

### 2.1 실 예시 요소(문서 verbatim, 1건)

```json
{"AXFrame":"{{199, 116}, {64, 87.5}}","AXUniqueId":"Wallet","frame":{"y":116,"x":199,"width":64,"height":87.5},"role_description":"button","AXLabel":"Wallet","content_required":false,"type":"Button","title":null,"help":null,"custom_actions":["Edit mode","Today"],"AXValue":"","enabled":true,"role":"AXButton","subrole":null}
```

### 2.2 전체 필드 목록(검증됨)

| 필드 | 타입/형식 | 공통 스키마 매핑 |
|------|-----------|------------------|
| `AXFrame` | 문자열 `"{{x, y}, {w, h}}"` | 사용 안 함(구조화된 `frame` 사용) |
| `frame` | 객체 `{y, x, width, height}`(수치, float 가능 예 `87.5`) | `bounds{x,y,w:width,h:height}` |
| `AXUniqueId` | 문자열(예 `"Wallet"`) | `id` |
| `AXLabel` | 문자열(예 `"Wallet"`) | `text`(1차) |
| `AXValue` | 문자열(입력 필드 현재 값, 예 `""`) | `text` 보조(입력값) — design.md §F.2 |
| `type` | 문자열(예 `"Button"`, `"TextField"`) | `role`(1차) |
| `role` | 문자열(AX 접두, 예 `"AXButton"`) | `role`(보조) |
| `subrole` | 문자열 또는 null | `role` 보조/파생 참고 |
| `role_description` | 문자열(예 `"button"`) | 참고 |
| `enabled` | 불리언 | `enabled` |
| `custom_actions` | 문자열 배열(예 `["Edit mode","Today"]`) | `tappable` 파생 신호 |
| `content_required` | 불리언 | (미사용) |
| `title` | 문자열 또는 null | (미사용/참고) |
| `help` | 문자열 또는 null | (미사용/참고) |

### 2.3 핵심 검증 결과(SPEC-01 §F.9.1 대비 **정정**)

- **`enabled`가 필드명이다 — `isEnabled`가 아니다.** SPEC-01 §F.9.1의 `isEnabled` 가정은 오류. → 정정.
- **`AXTraits` 필드는 존재하지 않는다.** 페이지 어디에도 `AXTraits`/`traits`가 나타나지 않음(WebFetch 명시 확인). SPEC-01 §F.9.1의 AXTraits 기반 tappable 파생은 폐기 → `type`/`role`/`subrole`/`custom_actions` 기반으로 재정의(design.md §F.3).
- **describe-all은 평면(flat) 배열이다.** 예시 요소에 `children` 키 없음. Android uiautomator(중첩 트리)와 다름 → 공통 스키마 `children`은 iOS에서 `[]`. (문서: "Returns JSON formatted list of screen elements".)
- **`frame`은 수치 객체 `{x,y,width,height}`**(float 가능). `AXFrame`은 문자열 표현이므로 미사용.
- **`type` vs `role`**: `type`은 사람 친화 타입(`"Button"`), `role`은 AX 접두 역할(`"AXButton"`). 공통 `role`은 `type` 1차/`role` 보조(SPEC-01 지정과 일치, 본 검증으로 확인).
- `pid`/`window`/`AXTraits` 없음(확인).

## §3. idb 명령 시그니처 (검증됨 + 일부 가정)

| 명령 | 문서 시그니처 | DeviceBackend | 비고 |
|------|---------------|---------------|------|
| `list-targets` | `idb list-targets` (연결 타겟 + companion 상태). `--json` 지원. | `listDevices` | 필드명(udid/name/os_version/state/target_type) **가정** — §3.1 |
| `ui describe-all` | `idb ui describe-all` (스크린 요소 JSON, 기본 JSON 출력) | `dumpUiHierarchy` | `--json` 지원(기본 JSON) |
| `ui describe-point` | `idb ui describe-point X Y` | (보조/선택) | 본 SPEC 범위 밖(포인트 질의) |
| `ui tap` | `idb ui tap X Y` (`--duration` 지원) | `tap` | |
| `ui text` | `idb ui text "some text"` | `inputText` | Unicode-native |
| `ui key` | `idb ui key 4` (키코드, `--duration`) | `sendKeyEvent` | HID 코드 **가정** — §3.2 |
| `ui key-sequence` | `idb ui key-sequence 4 5 6` | (보조) | 다중 키 |
| `screenshot` | (문서 미상세) | `screenshot` | PNG **가정** — §3.3 |
| `launch` | `idb launch com.apple.Maps` (`-f/--foreground-if-running`, `-w/--wait-for`, `IDB_` env) | `launchApp` | |
| `terminate` | `idb terminate com.apple.Maps` | `stopApp` | 번들ID로 종료 |

### 3.1 list-targets --json 필드명 (게이트 결정: **DEFER** — run-phase 확정)
- 가정: `udid`, `name`, `os_version`, `state`, `target_type`(simulator/device). 문서가 필드명을 완전 명시하지 않음 → **Run-phase 실 `idb list-targets --json` 픽스처로 확정**(사용자 게이트 결정으로 위임됨 — open question 아님). 필드명이 달라도 `IdbBackend.listDevices` 파싱만 조정(격리, 인터페이스 무영향).

### 3.2 ui key HID 코드 (게이트 결정: **DEFER** — run-phase 확정)
- 가정: `idb ui key 4` 예시는 HID usage 체계(USB HID Usage Tables)로 추정. 표준값 가정 Return≈40, Backspace≈42, 방향키≈79-82, Tab≈43. idb 정확한 해석은 **Run-phase 실 동작으로 확정**(위임됨).
- `home`/`back`/`menu`/`app_switch`/`power`/`volume_*`는 HID 키보드 usage에 대응이 없음 → 미대응 별칭(graceful `UNSUPPORTED_KEY_ON_IOS` 거부 — 이는 확정, 위임 아님).

### 3.3 대상 지정 플래그 · screenshot (게이트 결정: **DEFER** — run-phase 확정)
- 가정: 대상 지정 `--udid <udid>`(idb 관례), `screenshot`은 PNG를 stdout 스트림. `describe-all`/`screenshot`의 정확한 인자·출력 형태는 **Run-phase 실 CLI로 확정**(위임됨).
- 격리 효과: 플래그/인자 형태가 달라도 IdbBackend argv 구성만 조정하면 됨(명령 계층 무영향).

## §4. idb 버전 · 설치 (검증됨)

- **최종 릴리스**: `fb-idb` **v1.1.8, 2022-08-11**. 이후 릴리스 없음 → **효과적으로 미유지보수**(README에 archived 표식은 없으나 3년+ 무릴리스).
- **pip**: `pip3 install fb-idb`(문서는 `pip3.6` 표기 — Python 3.6 대상). **버전 고정**: `fb-idb==1.1.8`. 최신 Python 호환성은 Run 단계 확인 필요.
- **brew(companion)**: `brew tap facebook/fb` → `brew install idb-companion`. (brew 포뮬라는 하이픈 `idb-companion`, 실행 바이너리는 언더스코어 `idb_companion` — 구분 주의.)
- **플랫폼**: iOS 시뮬레이터는 macOS + Xcode 전용. companion은 macOS 데몬.

## §5. SPEC-01 §F.9/§F.9.1 대비 변경 요약(정정 산출물)

| 항목 | SPEC-01 가정 | 본 리서치 검증 결과 |
|------|--------------|---------------------|
| enabled 필드명 | `isEnabled` | **`enabled`** (정정) |
| tappable 근거 | `AXTraits` + `isEnabled` | **AXTraits 부재** → `type`/`role`/`subrole`/`custom_actions` + `enabled`(정정) |
| 계층 구조 | (명시 없음) | describe-all **평면 배열** → `children:[]`(신규 사실) |
| role 소스 | `type` 1차/`role` alias | 확인(일치) |
| bounds 소스 | `frame` | 확인(`{x,y,width,height}` 수치, float) |
| id 소스 | `AXUniqueId` | 확인 |
| text 소스 | `AXLabel` | 확인(+ 입력값은 `AXValue` — 신규 뉘앙스) |

## §6. Run-phase 확정 대상 (게이트 결정: **DEFER** — 사용자 위임, open question 아님)

> 아래는 사용자의 **명시적 게이트 결정으로 run-phase 실기기 픽스처 확정에 위임**된 항목이다. 각 항목은 §3의 best-guess 가정을 가지며 run-phase에서 실 CLI/시뮬레이터로 확정된다. **정규화 코어 단위 테스트(AC-IOS-004/005/006)는 이 위임에 영향받지 않는다** — §2의 검증된 `describe-all` 실 예시를 골든 픽스처로 사용하기 때문.

1. `idb list-targets --json` 정확한 필드명(§3.1) — 가정 있음, run-phase 확정.
2. `idb ui key` HID 코드 실제 해석(§3.2) — 가정 있음, run-phase 확정.
3. `--udid` 플래그 + `describe-all`/`screenshot` 인자·출력 형태(§3.3) — 가정 있음, run-phase 확정.
4. `INTERACTIVE_TYPES` 집합 최종 목록(design.md §F.3) — `{Button, Cell, TextField, Switch, Link}` 시작 가정, run-phase 보정(tappable 파생 테스트는 검증 예시로 선행 GREEN).
5. `AXValue` 보조 사용 여부(design.md §F.2) — `text ← AXLabel` 기본 가정, run-phase 결정.
6. `fb-idb==1.1.8` 최신 Python 호환성 + `idb-companion` 현행 설치 가능성 — 설치 가능 가정, run-phase 확정.
7. 실 시뮬레이터 `describe-all`/`list-targets` JSON 픽스처 캡처(단위 테스트 골든 파일 확정).

## §7. 교차 참조

- 필드 매핑 표(정정판): `plan.md §F.9/§F.9.1`
- 파생 규칙 상세: `design.md §F`
- 요구사항: `spec.md §B.3`
- 토대 정규화 패턴: `src/normalize/uiautomator.ts`(순수 함수 계승 대상)
