---
id: SPEC-ANDROID-002
title: "adb serial 공백 파싱 — mDNS 이름 충돌 기기가 offline로 오인되는 결함"
version: "0.2.0"
status: completed
created: 2026-08-03
updated: 2026-08-03
author: hatae
priority: P1
phase: "v0.5.1 target"
module: "src/backend/device-list-parser.ts"
lifecycle: spec-anchored
tags: "android, adb, device-list, parser, mdns, wireless, defect"
tier: S
---

# SPEC-ANDROID-002 — adb serial 공백 파싱

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-03 | hatae | 최초 작성. `SPEC-VISION-001` M6 실기기 검증이 드러낸 **기존** 결함(progress.md §E.2 「결함 ①」)을 후속 SPEC으로 등록한다. 근거는 2026-08-03 실기기 `od -c` 관측 + 2026-08-03 정규식 직접 재현. 코드는 `6e091be feat(SPEC-ANDROID-001): M4` 소유이며 SPEC-VISION-001은 이 파일을 건드린 적이 없다. |
| 0.2.0 | 2026-08-03 | hatae | **착수 직전 실측으로 0.1.0의 해결 방안이 반증됐다.** 0.1.0은 "탭이 실제 구분자"라는 M6 관측에 기대 「탭 우선 + 공백 폴백」을 지시했으나, M6 증거는 플래그 없는 `adb devices`였다. **CLI가 실제로 부르는 `adb devices -l`에는 탭이 없다**(실측, §A.2). 탭 기반 수정은 실제 명령 경로에서 아무것도 고치지 못한다. REQ-SERIAL-001/002를 **상태 토큰 기반 분리**로 교체한다. 아울러 mDNS 충돌 기기가 현재 연결돼 있어 **AC-SERIAL-006을 실측으로 닫을 수 있다**(0.1.0은 유발 불가를 전제했다). |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — serial 안의 공백이 상태 필드로 오인된다

무선 TLS로 붙은 Android 기기의 serial은 mDNS 이름이다. 같은 이름이 이미 등록돼
있으면 adb가 뒤에 ` (2)`를 붙이는데, **그 순간 serial 안에 공백이 생긴다.**

adb는 serial과 상태를 **탭**으로 구분한다. 실기기 `od -c` 관측(2026-08-03):

```
a d b - R 3 C Y 1 0 6 L K V X - x t n 5 z d  ␠  ( 2 ) . _ a d b - t l s
- c o n n e c t . _ t c p  \t  d e v i c e \n
                             ↑ serial 내부 공백      ↑ 진짜 구분자(탭)
```

그러나 `device-list-parser.ts:38`은 **임의 공백**으로 끊는다:

```ts
const match = line.match(/^(\S+)\s+(\S+)(.*)$/);
```

직접 재현(2026-08-03, node 실행):

```
현재 정규식:  serial = "adb-R3CY106LKVX-xtn5zd"
              state  = "(2)._adb-tls-connect._tcp"   → state === "device" ? false
탭 기준:      serial = "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp"
              state  = "device"                      → true
```

`state`가 `"device"`가 아니므로 `connectionState: "offline"`이 되고, **그 기기를
대상으로 한 모든 명령이 `DEVICE_NOT_CONNECTED`로 거부된다.**

`device-list-parser.test.ts`에 공백 포함 serial 픽스처는 **0건**이다 — mock이 볼 수
없던 영역이며, 실기기 검증이 있어야만 드러나는 종류의 결함이었다.

**현재 회피책**: `adb connect <IP>:<PORT>`로 직결하면 serial에 공백이 생기지
않는다. 다만 사용자가 이 사실을 알아야만 쓸 수 있는 회피책이다.

### A.2 탭은 해답이 아니다 (0.1.0 반증, 2026-08-03 실측)

M6의 `od -c` 증거는 **플래그 없는 `adb devices`**였다. 그러나 `adb-backend.ts:292`가
파서에 먹이는 것은 **`adb devices -l`의 출력**이다. 두 형식을 같은 기기에서
나란히 관측했다:

```
$ adb devices | od -c
  1 9 2 . 1 6 8 . 2 1 9 . 1 0 6 : 3 6 8 0 7  \t  d e v i c e        ← 탭

$ adb devices -l | od -c
  1 9 2 . 1 6 8 . 2 1 9 . 1 0 6 : 3 6 8 0 7  ␠␠  d e v i c e  ␠  p r o d u c t : …
  a d b - … - x t n 5 z d  ␠  ( 2 ) . _ a d b - t l s - c o n n e c t . _ t c p
      ␠  d e v i c e  ␠  p r o d u c t : …                          ← 탭 없음
```

**`-l`에는 탭이 없다.** 패딩 폭도 고정이 아니다 — 짧은 serial 뒤에는 공백 2개,
47자 serial 뒤에는 공백 1개다. 따라서 "탭으로 끊는다"도, "공백 2개 이상으로
끊는다"도 실제 명령 경로에서 성립하지 않는다.

**성립하는 규칙**: state는 **알려진 열거값**이고, 그 뒤는 전부 `key:value`
토큰이다. 줄에서 첫 번째 **상태 토큰**을 찾으면 그 앞이 serial, 그 뒤가 부가
필드다. `-l`의 `device:pa3q`는 뒤에 콜론이 붙어 상태 토큰과 구분된다.

### A.3 목표 — 상태 토큰으로 끊는다

`parseAdbDevicesList`가 상태 토큰의 위치를 찾아 serial과 state를 분리한다.
serial에 공백이 있어도 온전히 보존되고 state가 정확히 읽힌다. 한 규칙이
`adb devices`(탭)와 `adb devices -l`(공백) 두 형식 모두를 덮는다.

### A.4 비목표 (Non-Goals)

- mDNS 이름 충돌 자체를 없애는 것 — adb 서버 동작이며 이 CLI의 소관이 아니다
- `adb connect` 회피책의 자동화 — 별개 판단이다
- `-l` 롱포맷 필드(`model:` 등) 파싱 규칙 변경 — 현행 유지

### A.5 Out of Scope

#### A.5.1 Out of Scope — 명시적 제외

- **iOS 기기 열거 경로** (`wda-device-list.ts`) — udid는 공백을 포함하지 않으며
  파서를 공유하지 않는다
- **`adb devices` 이외의 adb 출력 파서** — `parseEffectiveDensity`,
  `parseScreenSize`, `ime-binding-parser` 등은 이 결함과 무관하다
- **연결 상태 판정 로직** (`adb-backend.ts`의 `connectionState` 매핑) — 입력이
  옳게 들어오면 그대로 동작한다

---

## §B. 요구사항 (GEARS)

### REQ-SERIAL-001 — 상태 토큰으로 분리한다

**Where** `adb devices` / `adb devices -l` 출력 한 줄을 파싱할 때,
**the system shall** 줄에서 첫 번째 **알려진 상태 토큰**(단독 토큰으로 등장하는
`device` / `offline` / `unauthorized` / `bootloader` / `host` / `recovery` /
`sideload` / `rescue` / `connecting` / `authorizing` / `unknown`)을 찾아,
**그 앞 전체를 serial로, 그 토큰을 state로** 삼는다. serial 안의 공백은
serial의 일부로 보존된다.

`-l` 부가 필드의 `device:pa3q`는 뒤에 콜론이 오므로 단독 토큰이 아니며 상태
토큰으로 오인되지 않는다.

### REQ-SERIAL-002 — 상태 토큰이 없으면 기존 동작을 유지한다

**Where** 줄에 알려진 상태 토큰이 없을 때, **the system shall** 기존의 공백 기준
정규식으로 폴백한다. adb는 `no permissions`처럼 공백을 품은 상태 문자열도 낼 수
있고 그 처리는 이 SPEC의 범위 밖이므로, 현행 동작을 그대로 남긴다.

### REQ-SERIAL-003 — 파서는 여전히 던지지 않는다

**Where** 입력이 비었거나 형식을 벗어났을 때, **the system shall** 예외를 던지지
않고 해당 줄을 건너뛴다. 현행 계약(파일 헤더 주석 「Never throws」)을 유지한다.

---

## §C. 인수 기준 (Tier S — 인라인)

**판정 수단 등급**: **G**(grep/정적) · **U**(단위 테스트) · **D**(실기기).
**mock 한계 원칙**: 외부 프로세스 출력의 실제 형태는 U로 확정할 수 없다.
아래 D 항목은 U 통과로 대체 판정하지 않는다.

| AC | 기준 | 판정 |
|---|---|---|
| **AC-SERIAL-001** | 공백 포함 serial 픽스처(`-l` 형식, 탭 없음)에서 `serial`이 온전히 보존되고 `state === "device"`다 | **U** 실기기 `od -c` 관측 그대로의 픽스처 사용 |
| **AC-SERIAL-002** | 공백 없는 기존 픽스처 6종이 전부 그대로 통과한다 (회귀 없음) | **U** 기존 테스트 무수정 통과 |
| **AC-SERIAL-003** | 탭 구분 형식(`adb devices`, 플래그 없음)도 동일하게 파싱된다 | **U** 두 형식을 한 규칙이 덮는지 확인 |
| **AC-SERIAL-004** | `-l` 부가 필드의 `device:<value>`가 상태 토큰으로 오인되지 않고, `model:` 추출이 공백 포함 serial에서도 동작한다 | **U** 오인 방지 대조 |
| **AC-SERIAL-005** | 빈 문자열·비문자열·형식 이탈 입력에서 던지지 않는다 | **U** 기존 테스트 유지 |
| **AC-SERIAL-006** | **실기기에서 mDNS 이름 충돌 기기가 `devices`에 온전한 serial + `device` 상태로 나온다** | **D** 필수. **U 불가** — adb의 실제 출력 형태가 판정 대상이다 |
| **AC-SERIAL-007** | `pnpm test` / `pnpm typecheck` / `pnpm build` 전부 통과 | **G/U** exit 0 |

**AC-SERIAL-006은 유발 가능하다 (0.2.0 정정)**: 0.1.0은 mDNS 충돌 유발 절차가 없어
미검증으로 닫을 가능성을 열어 뒀으나, **착수 시점에 충돌 기기가 이미 연결돼
있다**. 수정 전 CLI 실측:

```
{"serial":"adb-R3CY106LKVX-xtn5zd","connectionState":"offline","osVersion":""}
   ↑ " (2)._adb-tls-connect._tcp" 유실     ↑ 실제로는 살아 있는 기기
```

수정 후 같은 명령으로 재측정해 닫는다.

---

## §D. 제약

- **`src/backend/device-list-parser.ts` 외 파일을 수정하지 않는다.** 테스트 파일
  (`device-list-parser.test.ts`) 추가는 예외.
- **기존 픽스처를 고치지 않는다.** 새 픽스처만 추가한다 — 기존 픽스처 수정은
  회귀를 감추는 가장 흔한 경로다.
- 파일 헤더의 「Never throws」 계약을 유지한다.
- TDD: 공백 포함 픽스처로 **RED를 먼저 확인**한 뒤 정규식을 고친다.

---

## §E. 성공 기준 요약

`adb devices` 출력에서 serial에 공백이 있어도 기기가 `device`로 인식되고, 기존
6종 픽스처에 회귀가 없다. 실기기 확인(AC-SERIAL-006)은 재현 조건을 만들 수
있으면 닫고, 만들지 못하면 미검증으로 명시한다.
