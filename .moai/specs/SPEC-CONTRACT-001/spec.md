---
id: SPEC-CONTRACT-001
title: "명령 결과 모양을 코드로 지킨다 — 출력 페이로드 타입 선언과 키 집합 계약 테스트"
version: "0.1.0"
status: completed
created: 2026-08-03
updated: 2026-08-03
author: hatae
priority: P1
phase: "v0.6.0 target"
module: "src/schema/command-payloads.ts, src/cli/commands"
lifecycle: spec-anchored
tags: "contract, output, schema, type-safety, regression-guard"
tier: M
depends_on: [SPEC-WEBVIEW-002]
---

# SPEC-CONTRACT-001 — 명령 결과 모양을 코드로 지킨다

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-03 | hatae | 최초 작성. `SPEC-WEBVIEW-002`가 `doctor` 출력에서 필드 하나를 제거했는데 **테스트가 하나도 깨지지 않았다**. CHANGELOG에 breaking change로 적는 것은 사후 문서일 뿐 탐지 장치가 아니다. 사용자 결정(2026-08-03): 근본 원인을 고친다. |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 계약이 코드에 존재하지 않는다

`product.md`는 **"하나의 안정적인 JSON 입출력 계약"** 을 제품 정체성으로 선언한다.
그런데 그 계약은 어디에도 **선언돼 있지 않다**:

```ts
export function success<T>(command: string, data: T): CommandSuccess<T>
//                                     ↑ T는 호출부 객체 리터럴에서 추론된다

success("doctor", { adb, daemon, devices, adbKeyboard, wdaEnvironment })
//   필드를 하나 지우면 T가 바뀔 뿐, 컴파일도 테스트도 통과한다
```

**위반할 계약이 없으니 위반을 탐지할 방법도 없다.**

### A.2 실제로 일어난 일

`SPEC-WEBVIEW-002`가 `doctor` 출력에서 `wdaEnvironment.webInspectorProxy`를
제거했다. 그 필드를 단언하는 테스트는 **0건**이었고, 전체 테스트가 그대로
통과했다. 필드가 사라진 사실은 사람이 CHANGELOG에 적었기 때문에만 남았다.

같은 상태가 **명령 11개 전부**에 해당한다. `doctor`가 특별히 취약한 것이 아니라,
계약이 선언되지 않았다는 구조가 같다.

### A.3 이미 프로젝트에 답이 있었다

`schema/device-backend.test.ts`가 쓰는 기법:

```ts
const fieldPresence: Record<keyof SomeType, true> = { a: true, b: true };
// 필드가 빠지면 → 컴파일 에러 (누락)
// 필드가 늘면   → 컴파일 에러 (초과 프로퍼티)
```

**양방향 소진 검사**다. 스키마 타입에는 적용돼 있었으나 **CLI 출력 페이로드에는
적용된 적이 없다.**

### A.4 목표 — 두 겹으로 막는다

| 겹 | 무엇을 잡나 |
|---|---|
| **1. 타입 선언** | 핸들러가 필드를 빠뜨리면 **컴파일 에러** |
| **2. 키 집합 계약 테스트** | 타입 자체를 고치면 **테스트 실패** |

1겹만으로는 부족하다 — 타입과 핸들러를 **함께** 고치면 조용히 통과한다.
그것이 `SPEC-WEBVIEW-002`에서 실제로 일어난 일이다. 2겹이 그 경우를 잡아,
필드 제거를 **의도적이고 눈에 보이는 변경**으로 만든다.

### A.5 비목표 (Non-Goals)

- **오류 페이로드(`error.details`) 타입화** — 명령마다 자유 형식이며 별개 문제다
- **런타임 스키마 검증 라이브러리 도입** — 의존성 0개를 유지한다
- **출력 형태 자체를 바꾸는 일** — 이 SPEC은 **현재 형태를 고정**할 뿐이다
- **`doctor` 5개 반환 갈래를 판별 유니온으로 재설계** — §C.2 참조

### A.6 Out of Scope

#### A.6.1 Out of Scope — 명시적 제외

- **`src/backend/**` 의 동작 코드** — 페이로드를 구성하는 하위 타입은 이미
  선언·수출돼 있다(`AdbInstalledCheck`, `WdaCheck`, `ResetResult` 등). 재사용만 한다
- **`failure()` 경로** — 오류 코드 목록 고정은 별도 판단
- **`devices` 페이로드 신설** — 이미 `DeviceInfo[]`로 선언돼 있어 보호된다(§C.1)

---

## §B. 요구사항 (GEARS)

### REQ-CONTRACT-001 — 명령별 페이로드 타입을 선언한다

**Where** 명령 핸들러가 성공 결과를 돌려줄 때, **the system shall** 그 `data`
페이로드의 형태를 **이름 있는 타입**으로 선언한다. 타입은 한 모듈에 모은다.

### REQ-CONTRACT-002 — 호출부가 타입을 명시한다

**Where** 핸들러가 `success()`를 호출할 때, **the system shall** 타입 인자를
명시한다(`success<TapData>("tap", {...})`). 추론에 맡기지 않는다 — 추론은
호출부가 무엇을 넣든 그대로 받아들인다.

### REQ-CONTRACT-003 — 키 집합을 테스트가 고정한다

**Where** 페이로드 타입이 선언돼 있을 때, **the system shall** 그 타입의 키
집합을 `Record<keyof T, true>` 리터럴로 고정하는 테스트를 둔다. 타입에서 필드를
빼거나 더하면 이 테스트가 **먼저** 깨진다.

### REQ-CONTRACT-004 — `doctor`의 갈래별 실제 출력을 확인한다

**Where** `doctor`가 대상 플랫폼과 환경 상태에 따라 5가지 형태로 답할 때,
**the system shall** 각 갈래의 **실제 런타임 키 집합**을 확인하는 테스트를 둔다.
타입 수준 검사만으로는 "어느 갈래에서 어떤 선택 필드가 실제로 실리는가"를
고정하지 못한다 — 이번에 사라진 필드가 바로 그런 선택 필드였다.

### REQ-CONTRACT-005 — 현재 형태를 바꾸지 않는다

**Where** 페이로드 타입을 도입할 때, **the system shall** 현재 출력되는 필드
집합을 그대로 유지한다. 이 SPEC은 고정 장치를 다는 작업이며, 계약 자체를
바꾸는 작업이 아니다.

---

## §C. 조사에서 드러난 사실

### C.1 `devices`는 이미 보호돼 있다

`devices`는 `DeviceInfo[]`를 그대로 돌려준다. `DeviceInfo`는
`schema/device-backend.ts`에 선언돼 있고 `device-backend.test.ts`가 키 집합을
고정한다. **이미 두 겹이 걸려 있는 유일한 명령**이며, 나머지 10개에 같은 구조를
적용하는 것이 이 SPEC이다.

### C.2 `doctor`는 갈래가 5개다 (2026-08-03 코드 확인)

| 갈래 | 실린 필드 |
|---|---|
| iOS 대상 | `adb` `daemon` `devices` `adbKeyboard` **`wdaEnvironment`** |
| adb 미설치 | `adb` `daemon` **`installAttempt`** `devices` `adbKeyboard` |
| 데몬 비정상 | `adb` `daemon` `devices` `adbKeyboard` |
| 대상 미해결 | `adb` `daemon` `devices` `adbKeyboard` |
| 정상 | `adb` `daemon` `devices` `adbKeyboard` |

**항상 있는 4개 + 선택 2개** 구조다. 판별 유니온으로 재설계하면 더 정밀하지만,
**출력 형태를 바꾸지 않는다**는 REQ-CONTRACT-005와 충돌할 위험이 있고 이 SPEC의
목적(고정)을 넘어선다. 선택 필드로 선언하고, 갈래별 실제 키 집합은
REQ-CONTRACT-004의 런타임 테스트가 고정한다.

### C.3 하위 타입은 전부 이미 선언돼 있다

`AdbInstalledCheck` · `DaemonHealthCheck` · `InstallAttemptResult` ·
`AdbKeyboardResult` · `ResetResult` (`backend/doctor.ts`),
`DevicectlCheck` · `WdaCheck` · `IosResetResult` (`backend/wda-doctor.ts`),
`DeviceInfo` · `SwipePoint` (`schema/device-backend.ts`).

새로 만들 것은 **명령 단위 페이로드 타입 10개**뿐이며 전부 기존 타입의 조합이다.

---

## §D. 인수 기준

**판정 수단**: **G**(리터럴 존재/부재) · **T**(toolchain — 컴파일러) ·
**U**(단위 테스트) · **D**(실기기).

| AC | 기준 | 판정 |
|---|---|---|
| **AC-CONTRACT-001** | 명령 10개의 페이로드 타입이 한 모듈에 선언돼 있다 (`devices`는 기존 `DeviceInfo[]` 사용) | **G** |
| **AC-CONTRACT-002** | 모든 `success()` 호출이 타입 인자를 명시한다 | **G** 타입 인자 없는 `success(` 호출 0건 |
| **AC-CONTRACT-003** | 각 페이로드 타입에 `Record<keyof T, true>` 계약 테스트가 있다 | **U** |
| **AC-CONTRACT-004** | **핸들러에서 필드를 하나 지우면 컴파일이 실패한다** | **T** 실제로 지워 보고 확인한 뒤 되돌린다 |
| **AC-CONTRACT-005** | **타입에서 필드를 하나 지우면 계약 테스트가 실패한다** | **U** 실제로 지워 보고 확인한 뒤 되돌린다 |
| **AC-CONTRACT-006** | `doctor` 5개 갈래의 실제 키 집합을 확인하는 테스트가 있다 | **U** |
| **AC-CONTRACT-007** | 출력 필드 집합이 **변하지 않았다** | **D** 실기기에서 `doctor`·`devices`·`screenshot`·`scroll` 실행, 이 SPEC 착수 전 출력과 키 집합 동일 |
| **AC-CONTRACT-008** | `pnpm test` / `typecheck` / `build` 통과 | **U/G** exit 0 |

**AC-CONTRACT-004·005가 이 SPEC의 핵심이다.** 나머지는 장치를 달았다는 확인이고,
이 둘만이 **장치가 실제로 작동하는가**를 확인한다. 통과했다고 적는 것으로는
부족하고, 일부러 깨뜨려 본 기록이 있어야 한다.

---

## §E. 제약

- **출력 필드를 추가·제거·개명하지 않는다** (REQ-CONTRACT-005)
- **의존성을 추가하지 않는다** — 런타임 검증 라이브러리를 쓰지 않는다
- **`src/backend/**` 를 수정하지 않는다** — 하위 타입은 재사용만
- 페이로드 타입은 기존 타입을 **조합**한다. 필드 형태를 여기서 다시 정의하지 않는다

---

## §F. 성공 기준 요약

명령 결과에서 필드를 지우면 **컴파일이 실패**하고, 타입에서 지우면 **테스트가
실패**한다. 두 경우 모두 일부러 깨뜨려 확인한다. 현재 출력 형태는 그대로다.
