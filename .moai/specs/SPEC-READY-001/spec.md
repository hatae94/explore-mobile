---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — Skill이 믿을 수 있는 진입 조건"
version: "0.5.2"
status: draft
created: 2026-08-04
updated: 2026-08-05
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
| 0.5.2 | 2026-08-05 | hatae | **5차 표적 감사 PASS(0.8242, 상승) 반영 — 2회 연속 통과.** Q1~Q5는 CLOSED 4 · PARTIAL 1 · OPEN 0. 4차가 1순위 미조사로 꼽았던 영역(오류 문구를 정확 비교하는 단언)은 0.5.1이 먼저 닫았고 감사자가 전수 확인해 소진시켰다. **다만 아래 0.5.0 행의 "축이 여기서 끝났다"는 주장은 틀렸다** — 여섯 번째 재발(Q6)이 나왔다. 다만 성격이 달랐다: 규칙이 없어서가 아니라 **어휘가 한 칸 좁아서**였다. `installed`는 모양이 그대로인 채 **뜻**만 바뀌는데(§B.1·§B.2), 규칙이 "모양·문구"까지만 덮어 탐침 다섯 중 어느 것도 그것을 볼 수 없었다. 0.5.1은 규칙을 "모양 · 문구 · **의미**"로 넓히고 의미 탐침 ⑤를 추가했다. 실측으로 확정한 결함이다 — 이 호스트는 `which adb` 실패 + `$ANDROID_HOME/platform-tools/adb` 실행 가능이라, 구현 후 `router.test.ts:657`의 `installed === false` 단언이 뒤집힌다. |
| 0.5.0 | 2026-08-05 | hatae | **4차 감사 PASS(0.8119, 통과선 0.80).** ※ 이 행이 적은 "계획 감사 종료"와 "축이 여기서 끝났다"는 **0.5.1에서 반증됐다**(위 행 참조) — 기록으로 남긴다. 3차 지적 P0~P4는 CLOSED 5 · PARTIAL 0 · OPEN 0. 새 지적 5건(MUST 2 · SHOULD 3)도 전건 반영했다. 이 문서에 걸린 것은 없고 전부 `plan.md`·`acceptance.md`에서 닫혔다. **네 회차를 관통한 단 하나의 결함 축이 여기서 끝났다** — 매 회차 "이 SPEC이 바꾸는 것의 고정 지점"을 하나씩 빠뜨렸고(Android 리터럴 → iOS 리터럴 → 테스트 8개 → `AdbInstalledCheck`), 매번 처방이 그 회차의 대상에만 적용됐다. 0.5.0은 대상 이름을 버리고 규칙을 "바꾸는 것 전부, 생산과 테스트 양쪽"으로 다시 쓰고, **확정 열거를 문서가 아니라 `pnpm typecheck`/`pnpm test`에 맡겼다.** 궤적: 0.66 → 0.7984 → 0.7742 → 0.8119. |
| 0.4.0 | 2026-08-05 | hatae | **3차 감사(FAIL 0.7742, 처분 PASS-with-debt) 반영 — 사용자 명시적 재정의로 감사 상한 해제.** 2차 지적 N1~N7은 CLOSED 7 · PARTIAL 0 · OPEN 0이었고, 한 번도 감사받지 않았던 §B.6·AC-017④·AC-020도 전부 통과했다. 새 결함은 MUST 2 · SHOULD 3이며 **전부 0.1.0부터 세 판본이 안고 있던 것**이다(0.3.0이 만든 결함 0건). 이 문서에 걸린 것은 없고, 나머지 넷은 `plan.md`·`acceptance.md`에서 닫았다. 핵심은 P0 — `devices` 명령만 `resolveTargetDevice()`를 거치지 않고 자체 필터를 쓰므로, REQ-READY-006이 닫겠다고 선언한 회귀가 **사용자가 가장 먼저 밟는 경로**(목록에서 시리얼을 얻어 다시 쓰는 경로)에 그대로 남아 있었다. 그리고 그것을 잡을 AC가 하나도 없었다. |
| 0.3.0 | 2026-08-04 | hatae | **2차 델타 재감사(FAIL 0.7984 — 통과선 0.80에 0.002 부족) 반영.** 1차 지적 17건은 전부 닫힌 것으로 확인됐고(CLOSED 16 · PARTIAL 1 · OPEN 0), 떨어진 이유는 **0.2.0 수정이 만든 새 결함 3건**이었다. 셋 다 1차 지적과 **같은 유형의 재발**이라는 점이 중요하다: N1(`wda-device-list.ts`가 M3에서 누락 — 1차 D1과 동일한 영향 파일 누락, 이번엔 iOS 리터럴), N2(§E 양성 대조 두 개가 M1 끝에서 빈 출력 — 대조를 붙이면서 대조 자신의 전제를 안 봤다), N3(§B.5가 REQ-006에 "자유도 없음"이라 적었으나 실제로 두 결정이 열려 있었음 — 1차 D2와 동일한 미확정 결정, 그것을 막으려고 만든 표 안에서 재발). **넓게 고치면 그만큼 새 표면이 생긴다**는 것을 두 회차 연속 관측했다. 이 SPEC 문서에는 §C.1-②의 `connectionProperties` 키 집합이 기기마다 다르다는 사실(iPad 8키 / iPhone 6키)을 정정해 반영했다 — 0.2.0은 iPad 것만 적고 공통 집합처럼 보이게 했다. |
| 0.2.0 | 2026-08-04 | hatae | **1차 계획 감사(FAIL 0.66) 반영.** 세 가지가 바뀌었다. ① **미확정 결정 두 개를 확정했다** — `ro.serialno`를 누가 조회하는가(`plan.md` §B.4)와 `unavailableReason`을 무엇으로 채우는가(`plan.md` §B.3). 감사는 이 둘이 비어 있음을 코드로 확인했고, `plan.md` §B.5의 "미확정은 없다"는 선언이 사실이 아니었음을 지적했다. ② **그룹핑이 만드는 회귀를 요구사항으로 끌어올렸다**(REQ-READY-006) — 합쳐져 사라진 전송 시리얼로 `--device`를 지정하면 오늘 동작하던 호출이 `DEVICE_NOT_FOUND`가 된다는 것을 `device-targeting.ts:139`에서 확인했다. ③ **§C.1-①의 거짓 증거 문장을 정정했다** — "grep으로 검출되지 않았다"는 재실행 결과 9건이 매치되어 사실이 아니었다. 결론(경로 해석 부재)은 존재-검사로 다시 세웠다. |
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

**전송 선택은 한 번의 목록 조회 안에서 결정적이어야 한다** — 같은 전송 구성을 두 번 읽으면 같은 전송이 대표로 선택된다. 비결정적이면 같은 명령을 두 번 실행했을 때 대상 `serial`이 흔들려, 사용자가 방금 본 목록의 시리얼을 다음 명령에 그대로 쓸 수 없게 된다.

**이 요구사항이 주지 않는 것**: 재연결을 가로지르는 안정성. 대표 전송은 **그때의 전송 시리얼들 사이에서** 정해지므로, 재연결로 전송 구성이 바뀌면 대표도 바뀔 수 있다(2026-08-04 실측: §C.1-③에 기록된 전송 쌍과 같은 날 늦게 관측한 쌍이 서로 다르다 — 물리 기기는 같고 전송 구성만 바뀌었다). 세션을 넘어 살아남는 영속 키 설계는 §D.2에서 범위 밖으로 둔 주제이며, 이 요구사항은 그것을 대신하지 않는다.

### REQ-READY-005 — 계약 문서와 코드가 어긋나지 않는다

**When** 위 요구사항이 출력 모양이나 동작을 바꾸면, `SKILL.md`의 해당 서술과 SPEC-CONTRACT-001의 키 집합 계약 테스트가 **같은 변경에서 함께 갱신된다.**

현재 `SKILL.md` § Known traps는 *"`doctor` reports this accurately rather than failing silently"*라고 적고 있으나 §C-①이 이를 반증한다. **문서가 코드보다 앞서 있거나 뒤처져 있으면 Skill은 문서를 믿고 잘못 행동한다** — Skill에게 문서는 명세가 아니라 실행 근거다.

### REQ-READY-006 — 합친 뒤에도 기존 시리얼 지정이 계속 동작한다

**Where** REQ-READY-004의 그룹핑으로 어떤 전송 시리얼이 대표가 아니게 되었을 때 **When** 사용자가 그 시리얼로 `--device`를 지정하면, CLI는 **그 시리얼이 속한 물리 기기를 대상으로 삼는다** — 대표 시리얼로 지정한 것과 같은 결과다.

이 요구사항이 없으면 REQ-READY-004는 **새 결함을 만든다**. 근거: `src/cli/device-targeting.ts:139`가 대상을 `devices.filter((d) => d.serial === requestedSerial)`로만 찾는다. 그룹핑 이후 비대표 전송 시리얼은 부속 정보 배열 안으로 들어가 **어떤 항목의 `serial`도 아니게 되므로**, 오늘 정상 동작하는 `--device 192.168.219.106:36807` 같은 호출이 `DEVICE_NOT_FOUND`(`device-targeting.ts:141-148`)로 떨어진다.

이것은 사용자가 보는 동작의 **회귀**이며, 이 SPEC이 닫으려는 결함(§A.1 — 오판이 잘못된 복구 행동을 유발한다)과 같은 계열이다. 사용자는 "분명 방금 이 시리얼로 됐는데"를 겪고 케이블·연결을 의심하게 된다.

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

코드 확인 (2026-08-04 재실행 — 1차 감사 D6·S2 정정 반영):

**① 실제 결함 경로는 `doctor.ts:95-97`의 `catch`다.** 초안은 `doctor.ts:92`를 지목했으나 그 줄은 `if (result.exitCode !== 0)` — **종료 코드** 분기다. `adb`가 PATH에 아예 없으면 프로세스가 실행되지 못해 `process-executor.ts:43`의 `child.on("error", (err) => reject(err))`가 발동하고, 그 reject는 `doctor.ts:95-97`의 `catch`가 받아 `{installed:false, version:null}`로 접는다. 오늘의 관측(`installed:false`)이 실제로 통과한 줄은 `:95-97`이다.

**② 초안의 부재 주장은 사실이 아니었다.** 초안은 "`src/backend/` 전체에서 `ANDROID_HOME` · `platform-tools` · `adbPath` 해석 코드가 grep으로 검출되지 않았다"고 적었다. 같은 grep을 재실행하면 **9건이 매치된다**:

```
$ grep -rnE "ANDROID_HOME|platform-tools|adbPath" src/backend/ | wc -l
9
$ grep -rnE "ANDROID_HOME|platform-tools|adbPath" src/backend/ | sed 's/:.*//' | sort | uniq -c
   4 src/backend/doctor.test.ts
   4 src/backend/doctor.ts
   1 src/backend/process-executor.ts
```

매치는 전부 **설치 안내 문자열과 그 테스트**이지 경로 해석 코드가 아니다. 즉 결론(PATH 외 경로 탐색이 없다)은 살아 있으나, **초안이 근거로 든 문장은 거짓이었다.** 이 SPEC이 지적하는 결함 유형(무관한 텍스트에 오탐하는 grep, `plan.md` §C)을 근거문 자체가 재현한 셈이므로 원문을 남기고 정정한다.

**③ 부재의 근거는 존재-검사로 다시 세운다.** 없음을 뒤지는 대신 결함의 직접 증거를 찾는다 — 매치 자체가 증거이므로 양성 대조가 필요 없다(`acceptance.md` 원칙 ②):

```
$ grep -n 'spawnProcess("adb"' src/backend/adb-executor.ts
33:export const spawnAdb: AdbExecutor = (args: string[]): Promise<AdbExecResult> => spawnProcess("adb", args);
```

바이너리 이름이 **리터럴로 고정**돼 있다. 같은 파일 11행 주석도 *"this module only fixes the binary name to `adb`"*라고 적는다 — 경로를 해석하는 지점이 애초에 없다.

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

**원본 JSON의 `tunnelState` 실측값** (2026-08-04, `xcrun devicectl list devices --json-output`를 직접 실행해 관측). 위 CLI 출력만으로는 어떤 원본 값이 `offline`으로 접혔는지 알 수 없어, 계약을 설계하려면 원본이 필요하다:

```
iPad Pro (12.9-inch) (5th generation)   tunnelState = "disconnected"   키 8개
  authenticationType, isMobileDeviceOnly, lastConnectionDate, pairingState,
  potentialHostnames, transportType, tunnelState, tunnelTransportProtocol

iPhone 15 Pro Max                       tunnelState = "unavailable"    키 6개
  authenticationType, isMobileDeviceOnly, lastConnectionDate, pairingState,
  potentialHostnames, tunnelState
```

**키 집합이 기기마다 다르다** — iPhone에는 `transportType`과 `tunnelTransportProtocol`이 **없다.** 0.2.0은 8키 목록 하나만 적어 마치 공통 집합인 것처럼 보이게 했으나, 그것은 iPad의 키 집합이었다(2차 감사 N4 — 재실행해 확인). 지금 설계가 그 두 키에 의존하지 않으므로 결정에는 영향이 없지만, §C는 **불변 관측 기록**이므로 사실대로 고친다.

이 관측에서 네 가지가 따라 나온다:

1. **`tunnelState`는 최소 4개 값을 갖는다** — `"connected"`, `"disconnected"`, `"unavailable"`(위 실측), 그리고 `wda-device-list.ts:60-62` 주석이 **표 형식에서** 기록한 `"connected (no DDI)"`. 주석의 값은 JSON 경로에서 관측된 적이 없으므로, 인수 기준의 대표 픽스처는 JSON에서 실제로 나온 값이어야 한다.
2. **같은 물리 기기의 값이 하루 안에 바뀐다** — 1차 감사는 같은 날 두 기기 모두 `"disconnected"`로 기록했고, 이후 재실행에서 iPhone은 `"unavailable"`이 되었다. 값 집합을 고정된 것으로 가정하면 안 된다.
3. **이름 충돌 주의** — 원본 `tunnelState`의 값 `"unavailable"`과 이 SPEC이 새로 추가하는 `connectionState`의 값 `"unavailable"`은 **글자가 같지만 다른 축의 값이다.** 전자는 애플 도구가 보고하는 터널 상태이고, 후자는 우리 CLI의 연결 상태다. 두 값이 1:1로 대응하지도 않는다 — `"disconnected"`도 `"unavailable"`도 모두 `connectionState: "unavailable"`로 간다. 문서·테스트·사유 문구에서 어느 쪽을 말하는지 항상 밝힌다.
4. **`connectionProperties`의 키 존재를 전제하지 않는다** — 위에서 보듯 키 집합이 기기마다 다르다. `tunnelState`조차 없는 기기가 나올 수 있고, 그 경우는 `plan.md` §B.3의 3분기 중 "항목 부재 → `offline`"이 받는다. 새 필드를 읽으려 할 때는 부재를 먼저 다룬다.

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
- 합쳐진 기기의 부속 전송 시리얼로도 `--device` 지정이 동작하도록 대상 조회 확장(REQ-READY-006 — 그룹핑이 만드는 회귀를 닫는다)
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
- `src/schema/device-backend.ts:33`(상태 열거형) · `src/backend/wda-device-list.ts:65`(iOS 매핑) · `src/backend/doctor.ts:95-97`(§C.1-① 실제 결함 경로) · `src/backend/adb-executor.ts:33`(경로 해석 부재의 존재-검사 근거) · `src/backend/adb-backend.ts:311-320`(`DeviceInfo` 리터럴 생성 지점) · `src/cli/device-targeting.ts:139`(REQ-READY-006이 닫는 회귀 지점)
