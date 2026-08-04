---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — Skill이 믿을 수 있는 진입 조건"
version: "0.1.0"
status: draft
created: 2026-08-04
updated: 2026-08-04
author: hatae
priority: P1
phase: "v0.5.0 target"
module: "src/backend/"
lifecycle: spec-anchored
tags: "doctor, devices, adb, ios, availability, skill-contract, android"
tier: M
depends_on: [SPEC-CONTRACT-001]
---

# SPEC-READY-001 — 기기·환경 가용성 보고의 정확성

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-04 | hatae | 최초 작성. SPEC-IMESTATE-001 M4의 AC-020 실기기 관측 중 **부수적으로 발견된 3건**을 근거로 한다. 세 건 모두 그날 실측됐고(§C), 추측으로 쓴 요구사항은 없다. 발견 경위가 중요하다 — 이 SPEC은 "안정화를 하자"는 기획에서 나온 것이 아니라 **실기기에 한 번 붙어 본 결과** 나왔다. 호스트 단위 테스트 582개가 전부 통과하는 상태에서 나온 결함들이므로, 같은 계열이 더 있다면 그것도 실기기 경로에서만 보인다. |

---

## §A. 개요 (Context & Goal)

### A.1 이 SPEC이 닫는 결함 — 가용성 오판

`explore-mobile` Skill의 계약은 한 문장이다: **"JSON을 읽고 `error.code`로 분기하라"**(`SKILL.md` § JSON in/out contract). Skill은 화면도 기기도 직접 보지 않고 오직 CLI의 JSON만 본다. 따라서 **그 JSON이 진입 조건을 잘못 말하면 Skill은 어떤 프롬프트로도 회복할 수 없다.**

2026-08-04 실기기 관측에서 그 오판이 3건 나왔고, 셋은 서로 다른 기능이지만 **하나의 결함 유형**이다:

| # | 관측 | 오판의 모양 |
|---|------|------------|
| ① | 설치된 `adb`를 `installed:false`로 보고 | **있는 것을 없다고** 한다 |
| ② | USB 연결된 iOS를 미연결과 같은 `offline`로 보고 | **준비 안 됨과 없음을 같다고** 한다 |
| ③ | 폰 1대를 시리얼 2개로 보고 | **하나를 둘이라고** 한다 |

공통점은 결과가 아니라 **사용자가 하게 되는 행동**이다. ①은 이미 있는 `adb`를 또 설치하게 만들고, ②는 멀쩡히 꽂힌 폰을 다시 꽂게 만들고, ③은 기기별 상태를 엉뚱한 키에 기록하게 만든다. 즉 오판은 조용히 끝나지 않고 **잘못된 복구 행동을 유발한다.**

### A.2 목표

CLI가 진입 조건을 보고할 때 **"쓸 수 있다 / 쓸 수 없다"의 이분법을 넘어, 왜 못 쓰는지와 무엇을 하면 되는지가 JSON에서 구별되게** 한다. Skill이 그 JSON만 보고 다음 행동을 결정할 수 있으면 목표가 달성된 것이다.

### A.3 목표가 아닌 것

기기 제어 기능을 새로 추가하지 않는다. 이 SPEC은 **이미 있는 기능의 진입 보고**만 다룬다.

---

## §B. 요구사항 (REQ)

### REQ-READY-001 — `adb`를 PATH 밖에서도 찾는다

**Where** 시스템에 `adb` 실행 파일이 존재하고 **While** 그것이 `PATH`에 없을 때 **When** CLI가 Android 명령을 수행하면, CLI는 표준 SDK 경로에서 `adb`를 찾아 **정상 동작한다**.

탐색 순서(앞이 우선):
1. `PATH`
2. `$ANDROID_HOME/platform-tools/adb`
3. `$ANDROID_SDK_ROOT/platform-tools/adb`
4. `~/Library/Android/sdk/platform-tools/adb` (macOS 기본 설치 위치)

넷 다 실패하면 그때 "찾지 못함"이다. 근거: §C-①에서 `ANDROID_HOME`이 **설정돼 있는데도** 참조되지 않았다.

### REQ-READY-002 — "없음"과 "PATH 밖"을 구별해 보고한다

**When** `doctor`가 `adb` 상태를 보고하면, **"설치되지 않음"과 "설치됐으나 PATH에 없음"이 서로 다른 값으로 구별된다.** 후자에는 설치 명령(`brew install …`)을 권하지 않고, **찾은 경로와 PATH 추가 방법**을 안내한다.

이 구별이 없으면 사용자는 이미 있는 것을 또 설치하고, 같은 도구가 두 벌 생겨 어느 것이 쓰이는지 알 수 없게 된다. 근거: §C-①.

### REQ-READY-003 — iOS의 "준비 안 됨"을 "미연결"과 구별한다

**Where** iOS 기기가 물리적으로 연결돼 있고 **While** 조작 전제(터널·DDI·WDA 등)가 아직 성립하지 않았을 때 **When** `devices`가 그 기기를 보고하면, `connectionState`가 **미연결과 구별되는 값**을 갖고 **왜 못 쓰는지가 함께 실린다.**

`connectionState`는 현재 `"device" | "offline" | "unauthorized"`(`src/schema/device-backend.ts:33`)이며, `tunnelState`가 정확히 `"connected"`가 아닌 모든 경우가 `offline`으로 접힌다(`src/backend/wda-device-list.ts:65`). 주석이 관측값으로 기록한 `"connected (no DDI)"`도 여기 포함된다 — **연결돼 있으나 준비만 안 된 상태**가 미연결과 같은 값이 된다. 근거: §C-②.

이 요구사항은 **출력 계약을 바꾼다**. SPEC-CONTRACT-001이 세운 키 집합 계약 테스트와 `SKILL.md`의 서술이 함께 갱신되어야 한다(REQ-READY-005).

### REQ-READY-004 — 물리 기기 1대는 항목 1개로 보고한다

**Where** 같은 물리 기기가 둘 이상의 전송(무선 IP 연결과 mDNS 연결 등)으로 동시에 잡힐 때 **When** `devices`가 목록을 보고하면, **그 기기는 하나의 항목으로 보고되고** 나머지 전송은 그 항목에 부속 정보로 실린다.

물리 기기의 동일성 판정에는 **`ro.serialno`를 쓴다.** 근거: §C-③에서 두 전송이 같은 값 `R3CY106LKVX`를 반환함을 실측했다. 전송 시리얼(IP:포트 · mDNS 이름)은 재연결마다 바뀌므로 동일성 판정에 쓸 수 없다.

**전송 선택은 결정적이어야 한다** — 같은 상태에서 두 번 호출하면 같은 전송이 선택된다. 비결정적이면 기기별 상태(예: IME 세션 기록)가 호출마다 다른 키에 저장된다.

### REQ-READY-005 — 계약 문서와 코드가 어긋나지 않는다

**When** 위 요구사항이 출력 모양이나 동작을 바꾸면, `SKILL.md`의 해당 서술과 SPEC-CONTRACT-001의 키 집합 계약 테스트가 **같은 변경에서 함께 갱신된다.**

현재 `SKILL.md` § Known traps는 *"`doctor` reports this accurately rather than failing silently"*라고 적고 있으나 §C-①이 이를 반증한다. **문서가 코드보다 앞서 있거나 뒤처져 있으면 Skill은 문서를 믿고 잘못 행동한다** — Skill에게 문서는 명세가 아니라 실행 근거다.

---

## §C. 관측 근거 (2026-08-04 실측)

이 절은 **관측 기록**이다. 이후 코드가 바뀌어도 원문을 보존한다.

### C.1-① `adb`가 있는데 `installed:false`

```
$ node dist/cli/bin.js doctor
{"adb":{"installed":false,"version":null},
 "daemon":{"healthy":false,"message":"adb is not installed; ..."},
 "installAttempt":{"manualCommand":"brew install android-platform-tools", ...}}

$ ls ~/Library/Android/sdk/platform-tools/adb
/Users/hatae/Library/Android/sdk/platform-tools/adb      ← 존재한다

$ echo $ANDROID_HOME
/Users/hatae/Library/Android/sdk                          ← 설정돼 있다

$ which adb
adb not found                                             ← PATH에만 없다
```

코드 확인: `src/backend/doctor.ts:92`가 `adb` 실행 실패를 곧바로 `installed:false`로 접는다. `src/backend/` 전체에서 `ANDROID_HOME` · `platform-tools` · `adbPath` 해석 코드가 **grep으로 검출되지 않았다** — PATH 외 경로 탐색이 없다.

### C.1-② USB 연결된 iOS가 `offline`

```
$ node dist/cli/bin.js devices
… {"serial":"00008130-…","model":"iPhone 15 Pro Max","connectionState":"offline","platform":"ios"}
   {"serial":"00008103-…","model":"iPad Pro (12.9-inch) (5th generation)","connectionState":"offline","platform":"ios"}
```

사용자 진술: 두 기기 모두 USB 연결 상태. 코드 확인: `src/backend/wda-device-list.ts:65`

```ts
return stringField(tunnelState).toLowerCase() === "connected" ? "device" : "offline";
```

같은 파일 주석이 관측값으로 `"connected"`와 `"connected (no DDI)"`를 기록하고 있으며, 후자는 위 비교에서 `offline`이 된다. **이것은 설계 의도대로의 동작이지 버그가 아니다** — 주석이 "지금 조작 가능한가만 묻는다"고 명시한다. 결함은 판정이 아니라 **출력이 두 상황을 구별하지 못한다**는 점이다.

### C.1-③ 폰 1대가 시리얼 2개 + 안정 식별자 실측

```
$ adb devices -l
192.168.219.106:36807                              device  model:SM_S938N  transport_id:124
adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp   device  model:SM_S938N  transport_id:125

$ adb -s 192.168.219.106:36807 shell getprop ro.serialno                    → R3CY106LKVX
$ adb -s "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp" shell getprop ro.serialno → R3CY106LKVX
```

두 전송이 **같은 `ro.serialno`를 반환한다**(REQ-READY-004의 근거). 또한 8월 2일 기록된 세션 키 `adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`는 8월 4일의 두 시리얼 **어느 쪽과도 일치하지 않았다**(mDNS 이름에 중복 표식 ` (2)`가 붙었다).

### C.1-④ 이 결함들이 단위 테스트를 통과한 상태에서 나왔다

관측 시점의 호스트 테스트는 **582개 전건 통과**, 커버리지 구문 93.8% / 라인 96.06%였다. 세 결함 모두 그 상태에서 존재했다 — **실기기에 붙어야만 보이는 표면**이라는 뜻이다. 이 사실은 §F 마일스톤에서 검증 방법 선택의 근거가 된다.

---

## §D. 범위

### D.1 In Scope

- `adb` 실행 파일 경로 해석과 그 결과의 `doctor` 보고
- iOS `connectionState` 값 집합 확장과 사유 전달
- 물리 기기 단위 식별과 전송 선택의 결정성
- 위 변경에 따른 `SKILL.md` · 계약 테스트 동기화

### D.2 Out of Scope

- **`adb` 자동 설치 정책 변경** — 동의 없는 설치 금지 규칙은 그대로다. 이 SPEC은 "설치 권유를 언제 하지 **않을지**"만 바꾼다.
- **WDA·iproxy 자동 기동** — iOS를 쓸 수 있게 *만드는* 것은 이 SPEC의 일이 아니다. **왜 못 쓰는지 정확히 말하는 것**까지가 범위다.
- **무선 시리얼을 영속 키로 쓰는 문제 자체** — 기기별 상태를 세션 너머로 보존하는 키 설계는 SPEC-IMESTATE-001의 후속 주제다. 이 SPEC은 **한 번의 목록 조회 안에서** 동일 기기를 합칠 뿐이다.
- **iOS 시뮬레이터** — `devicectl`이 실기기만 열거한다는 기존 결정을 유지한다.
- **새 기기 제어 기능** — §A.3.

---

## §E. 설계 결정

### E.1 왜 `ro.serialno`인가 (`android_id` 기각)

두 값 모두 §C-③에서 두 전송에 걸쳐 동일했다(`android_id = 3d72f95eec8510fc`). 그럼에도 `ro.serialno`를 택한다: `android_id`는 **초기화·사용자 프로필에 따라 바뀌는 값**이고 기기 하드웨어의 이름이 아니다. 목적이 "같은 물리 기기인가"이므로 하드웨어 식별자가 의미상 맞다. 부수 확인으로, mDNS 이름 `adb-R3CY106LKVX-xtn5zd`가 `ro.serialno`를 포함하고 있어 값의 성격이 교차 확인된다.

### E.2 왜 상태값을 추가하는가 (별도 필드 기각)

`offline`을 두고 사유 필드만 덧붙이는 대안이 있었고, 계약을 깨지 않는다는 장점이 있다. **기각한다**: 기존 호출자는 `connectionState`만 보고 분기하므로, 사유 필드를 덧붙여도 `offline` 검사에 걸려 **여전히 미연결과 같게 취급된다.** 구별을 원한다면 구별되는 값이어야 한다. 계약 변경 비용은 REQ-READY-005가 흡수한다.

### E.3 왜 합치고(dedup) 감추지 않는가

중복 전송을 그냥 숨기면 사용자가 "왜 내 폰이 하나만 보이지"를 물을 수 없다. 하나의 항목으로 **합치되 나머지 전송을 부속 정보로 실어**, 목록은 물리 기기 단위로 읽히면서 진단 정보는 보존되게 한다.

### E.4 이 SPEC이 검증 방법에 두는 제약

§C-④가 보인 대로 **이 결함들은 단위 테스트가 전부 통과하는 상태에서 존재했다.** 따라서 이 SPEC의 인수 기준은 단위 테스트만으로 닫지 않는다 — 최소 1건은 **실기기 또는 실제 파일시스템·환경변수 조작**으로 판정한다(`acceptance.md` 참조). 순수 함수로 뽑을 수 있는 부분(파싱·매핑·그룹핑)은 단위로 판정하되, **"실제 환경에서 그렇게 보이는가"는 실측으로 판정**한다.

---

## §F. 참조

- `.claude/skills/explore-mobile/SKILL.md` — 이 SPEC이 지키려는 계약의 소비자
- `SPEC-CONTRACT-001` — 출력 키 집합 계약 테스트(이 SPEC이 갱신 대상으로 삼는다)
- `SPEC-IMESTATE-001` `progress.md` §E.2 M4 절 — 3건이 발견된 관측 기록의 원본
- `src/schema/device-backend.ts:33` · `src/backend/wda-device-list.ts:65` · `src/backend/doctor.ts:92` · `src/backend/adb-executor.ts`
