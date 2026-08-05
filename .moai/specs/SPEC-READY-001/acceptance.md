---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — 인수 기준"
version: "0.5.2"
status: completed
created: 2026-08-04
updated: 2026-08-05
author: hatae
---

# 인수 기준 — SPEC-READY-001

> 형식: Given-When-Then. 각 AC는 관찰 가능(테스트 출력 / 파일 존재 / 명령 출력)해야 한다. 검증 방식은 unit / unit(mock) / unit(실FS) / e2e(호스트) / e2e·manual / doc-review 중 하나 이상을 명시한다.
>
> **원칙 ① (SPEC-IOS-001에서 확립)**: 관측하지 않은 것을 PASS로 기록하지 않는다.
>
> **원칙 ② (SPEC-IMESTATE-001 0.2.0에서 확립)**: "없음"을 확인하는 검사는 **양성 대조를 동반**해야 한다. 패턴이 틀려서 아무것도 매치하지 않는 것과 대상이 깨끗한 것을 구별할 수 없는 검사는 공허하다.
>
> **원칙 ③ (SPEC-IMESTATE-001 0.4.2에서 확립)**: **양성 대조는 검사 자신이 소유한다.** 대조 대상이 저장소의 다른 코드에 의존하면 그 코드가 사라질 때 대조도 함께 죽는다. 실제로 죽어서 AC 하나가 판정 불가가 된 적이 있다.
>
> **원칙 ④ (이 SPEC 고유 — `spec.md` §E.4)**: 이 SPEC의 결함들은 **단위 테스트 582개가 전부 통과하는 상태에서 존재했다.** 따라서 REQ마다 최소 1건은 실제 환경(실기기 · 실파일시스템 · 실환경변수)으로 판정한다. 순수 함수로 뽑히는 부분만 단위로 판정한다.
>
> **원칙 ④의 명시적 예외 — REQ-READY-005 하나뿐**: 이 요구사항은 "문서 서술이 코드와 일치하는가"를 묻는다. 대조 대상이 **문서**이므로 실행할 실제 환경이 없고, `doc-review`가 그 자체로 올바른 판정 방식이다. 예외는 여기 명시된 이것 하나이며, 다른 REQ가 실환경 AC 없이 마감되면 그것은 예외가 아니라 원칙 위반이다.
>
> **1차 감사 D5 기록**: 0.1.0은 이 원칙을 선언해 놓고 REQ-READY-002(AC-004·005 둘 다 unit mock)와 REQ-READY-003(AC-006~009·016 전부 unit)에서 스스로 어겼다. 특히 REQ-003은 근거가 실기기 관측(`spec.md` §C.1-②)이고 `plan.md` M4가 실기기 확인을 **필수**로 요구하는데 그것을 기록할 AC가 없었다 — 계획서가 요구하는 검증이 인수 기준에 존재하지 않는 추적성 구멍이었다. 0.2.0에서 AC-READY-018(REQ-002 실FS·실환경변수)과 AC-READY-019(REQ-003 실기기)를 추가해 닫는다.

## §D. 인수 기준 매트릭스

| AC ID | 요약 | 관련 REQ | 검증 방식 |
|-------|------|----------|-----------|
| AC-READY-001 | PATH에 `adb`가 없어도 Android 명령이 동작한다 | REQ-READY-001 | e2e·manual |
| AC-READY-002 | 탐색 순서가 지켜진다(PATH 우선) | REQ-READY-001 | unit(mock) |
| AC-READY-003 | 네 후보 모두 실패해야 "찾지 못함"이다 | REQ-READY-001 | unit(mock) |
| AC-READY-004 | PATH 밖 설치를 설치됨으로 보고하고 설치를 권하지 않는다 | REQ-READY-002 | unit(mock) |
| AC-READY-005 | 진짜 미설치는 미설치로 보고하고 설치를 권한다 (**AC-004의 양성 대조**) | REQ-READY-002 | unit(mock) |
| AC-READY-006 | 준비 안 된 iOS가 `unavailable` + 사유로 보고된다 | REQ-READY-003 | unit |
| AC-READY-007 | 항목 자체가 없으면 `offline`이다 | REQ-READY-003 | unit |
| AC-READY-008 | `connected`는 여전히 `device`다 (의미 불변) | REQ-READY-003 | unit |
| AC-READY-009 | 모든 상태에서 키 집합이 같다 | REQ-READY-003 | unit |
| AC-READY-010 | 같은 물리 기기의 두 전송이 항목 1개로 합쳐진다 | REQ-READY-004 | unit |
| AC-READY-011 | 대표 전송 선택이 결정적이다 | REQ-READY-004 | unit |
| AC-READY-012 | 식별자를 모르는 전송은 합치지 않는다 | REQ-READY-004 | unit |
| AC-READY-013 | 실기기의 중복 전송이 1개 항목으로 보고되고, 두 시리얼 모두로 지정된다 | REQ-READY-004, REQ-READY-006 | e2e·manual |
| AC-READY-014 | `SKILL.md`의 서술이 코드와 일치한다 | REQ-READY-005 | doc-review |
| AC-READY-015 | 계약 테스트가 새 값·필드를 반영한다 | REQ-READY-005 | unit |
| AC-READY-016 | 기존 3개 상태값의 의미가 바뀌지 않았다 | REQ-READY-003 | unit |
| AC-READY-017 | 부속 전송 시리얼로도 대상 조회가 성공한다 | REQ-READY-006 | unit |
| AC-READY-018 | 실제 파일시스템·환경변수에서 PATH 밖 설치가 구별돼 보고된다 | REQ-READY-002 | unit(실FS) |
| AC-READY-019 | 실기기 iOS가 `unavailable` + 사유로 보고된다 | REQ-READY-003 | e2e·manual |
| AC-READY-020 | 한 시리얼이 둘 이상 항목에 걸리면 대상을 고르지 않는다 | REQ-READY-006 | unit |

**원칙 ④ 충족 현황** (REQ마다 실환경 판정 1건 이상):

| REQ | 실제 환경 AC | 방식 |
|---|---|---|
| REQ-READY-001 | AC-001 | e2e·manual |
| REQ-READY-002 | AC-018 | unit(실FS) — 실제 임시 디렉터리 + 실제 `ANDROID_HOME` 조작 |
| REQ-READY-003 | AC-019 | e2e·manual — 실기기 |
| REQ-READY-004 | AC-013 | e2e·manual — 실기기 |
| REQ-READY-005 | — | 원칙 ④의 명시적 예외(위 참조) |
| REQ-READY-006 | AC-013③ | e2e·manual — 실기기 (단위 판정은 AC-017 · AC-020) |

---

## §E. 인수 기준 상세

### AC-READY-001 — PATH에 `adb`가 없어도 Android 명령이 동작한다
- **Given** `adb`가 시스템에 설치돼 있고 `PATH`에는 없는 환경(오늘의 실제 환경이 정확히 이 상태다 — `spec.md` §C.1-①),
- **When** `PATH`를 보정하지 **않고** `node dist/cli/bin.js devices`를 실행하면,
- **Then** 두 가지가 **모두** 성립한다: ① Android 기기가 목록에 나타난다 ② `doctor`의 `adb.installed`가 `true`다.
- **이 AC가 막는 것**: 이 SPEC의 원인 결함 그 자체. 오늘은 명령마다 `PATH`를 앞에 붙여야만 동작했다.
- **전후 대조 의무**: 착수 전 같은 명령을 실행해 **실패(Android 미검출)를 먼저 관측**하고 기록한다. 수정 전 실패 관측이 없으면 이후의 성공은 무엇을 증명하는지 불명확하다.
- 검증: e2e·manual

### AC-READY-002 — 탐색 순서가 지켜진다
- **Given** `PATH`와 `$ANDROID_HOME/platform-tools` **양쪽에** 실행 가능한 `adb`가 있는 상태(주입된 가짜 파일시스템),
- **When** 경로 해석을 수행하면,
- **Then** `PATH` 쪽이 선택된다.
- 검증: unit(mock)

### AC-READY-003 — 네 후보 모두 실패해야 "찾지 못함"이다
- **Given** 네 후보 경로 중 **정확히 하나만** 실행 가능한 상태를 네 가지로 구성하고, 별도로 **넷 다 없는** 상태를 구성한 뒤,
- **When** 각 구성에서 경로 해석을 수행하면,
- **Then** 앞의 네 구성은 **모두 해석에 성공**하고, 마지막 구성만 "찾지 못함"이다.
- **왜 다섯 구성을 다 보는가**: "넷 다 실패해야 실패"라는 진술은 **한 후보만 확인하는 테스트로는 판정되지 않는다.** 예컨대 `ANDROID_HOME` 분기가 통째로 빠져 있어도 PATH 케이스만 보는 테스트는 통과한다.
- 검증: unit(mock)

### AC-READY-004 — PATH 밖 설치를 설치됨으로 보고하고 설치를 권하지 않는다
- **Given** `adb`가 `$ANDROID_HOME/platform-tools/adb`에만 있고 `PATH`에는 없는 상태,
- **When** `src/cli/commands/doctor.ts`의 **`doctor` 명령 핸들러**를 실행하면,
- **Then** 네 가지가 **모두** 성립한다: ① `adb.installed === true` ② `adb.onPath === false` ③ `adb.resolvedPath`가 그 절대 경로다 ④ 출력 어디에도 **설치 명령을 권하는 내용이 없다**.
- **검사 대상을 명령 핸들러로 못박는 이유**(1차 감사 S7): `installed`/`onPath`/`resolvedPath`를 만드는 것은 `AdbDoctor.checkAdbInstalled()`(`doctor.ts:89`)이지만, **설치 권유 문구를 내보내는 것은 명령 핸들러**다. `AdbDoctor` 수준에서 테스트하면 ④("권유 없음")는 그 메서드가 애초에 권유를 만들지 않으므로 **자동으로 참**이 되어 아무것도 증명하지 않는다.
- **가짜로 바꿔도 되는 경계**(2차 감사 N6): `doctorCommand`는 `envServices.android`를 주입받아 `checkAdbInstalled()`를 부른다(`src/cli/commands/doctor.ts:41`). 그 객체를 **통째로 가짜로 바꾸면 ①②③은 가짜가 돌려주도록 시킨 값을 그대로 읽는 항진명제가 된다** — 경로 해석 로직이 통째로 빠져 있어도 통과한다. 따라서 가짜로 바꿔도 되는 것은 **파일시스템과 `PATH`·`ANDROID_HOME`까지**이고, `AdbDoctor`(경로 해석의 주체)는 **진짜를 쓴다.** ④는 이 경계와 무관하게 명령 핸들러 층에서만 판정된다.
- 이 경계는 AC-READY-018(실FS)이 같은 요구사항을 진짜 파일시스템으로 한 번 더 덮으므로 이중으로 보호된다 — 이 AC는 분기 논리를, AC-018은 그 논리가 실제 환경에서도 같은 답을 내는지를 본다.
- **④는 없음-검사이므로 AC-READY-005가 양성 대조를 맡는다** — 같은 테스트 파일이 두 구성을 모두 소유하므로 대조가 외부 코드에 의존하지 않는다(원칙 ③).
- 검증: unit(mock)

### AC-READY-005 — 진짜 미설치는 미설치로 보고하고 설치를 권한다 (AC-004의 양성 대조)
- **Given** 네 후보 경로 어디에도 `adb`가 없는 상태,
- **When** AC-READY-004와 **같은 대상** — `src/cli/commands/doctor.ts`의 `doctor` 명령 핸들러 — 를 실행하면,
- **Then** 세 가지가 **모두** 성립한다: ① `adb.installed === false` ② `adb.resolvedPath === null` ③ 출력에 **설치 명령 안내가 존재한다**.
- **대상이 같아야 대조가 성립한다**: ③이 명령 핸들러에서 성립함을 보여야 AC-004④("권유 없음")가 같은 핸들러에서 의미를 갖는다. 두 AC가 서로 다른 층을 검사하면 대조가 아니다.
- **이 AC의 두 번째 역할**: ③이 성립해야 AC-READY-004의 ④("권유 없음")가 의미를 갖는다. ③이 깨지면 안내 문구 생성 자체가 고장 난 것이므로 AC-004는 **무엇이든 통과**하게 된다.
- 검증: unit(mock)

### AC-READY-006 — 준비 안 된 iOS가 `unavailable` + 사유로 보고된다
- **Given** `tunnelState`가 존재하지만 `"connected"`가 아닌 값인 `devicectl` 문서. **대표 픽스처는 `"disconnected"`** — 2026-08-04 원본 JSON에서 실제로 관측된 값이다(`spec.md` §C.1-②). 부가 케이스로 `"unavailable"`(같은 날 실측)과 `"connected (no DDI)"`(`wda-device-list.ts:60-62` 주석의 표 형식 관측값, JSON 경로에서는 미관측)를 함께 구성한다,
- **When** **`parseDevicectlDevices()`**(`src/backend/wda-device-list.ts:78`)로 변환하면,
- **Then** 세 가지가 **모두** 성립한다: ① `connectionState === "unavailable"` ② `unavailableReason`이 **관측된 `tunnelState` 원문을 포함한다** ③ 그 값이 `plan.md` §B.3.1 매핑표에 있으면 해당 행동 안내가 이어 붙어 있고, 표에 없으면 원문만 실려 있다.
- **왜 대표 픽스처를 바꿨는가**(1차 감사 D9): 0.1.0은 `"connected (no DDI)"`를 예로 들었으나 그 값의 출처는 주석이고, 주석 자신이 **표 형식에서 본** 값이라고 적는다 — JSON 경로의 값이 아니다. 그 픽스처만으로 통과하면 **실제로 발생하는 입력이 검사된 적이 없는** 상태가 된다.
- **왜 "원인을 식별할 수 있다"를 버렸는가**: 그것은 사람의 판단이지 기계적 기준이 아니어서 무엇을 만족해야 통과인지 판정할 수 없었다. ②③은 문자열 포함 여부와 매핑표 일치로 판정된다.
- **이름 충돌 주의**: 부가 케이스의 원본 값 `"unavailable"`은 ①이 요구하는 `connectionState`의 `"unavailable"`과 **다른 축**이다. 테스트에서 두 값을 같은 상수로 공유하지 않는다 — 한쪽이 바뀌어도 다른 쪽이 따라 바뀌면 안 된다.
- 검증: unit

### AC-READY-007 — 항목 자체가 없으면 `offline`이다
- **Given** `connectionProperties`나 `tunnelState`가 없는 `devicectl` 문서,
- **When** 변환하면,
- **Then** `connectionState === "offline"`이고 `unavailableReason === null`이다.
- **`unavailable`과 나누는 이유**: "연결 정보가 아예 없다"와 "연결됐는데 준비가 안 됐다"는 사용자가 할 행동이 다르다. 전자는 케이블을 보고, 후자는 WDA·터널을 본다.
- 검증: unit

### AC-READY-008 — `connected`는 여전히 `device`다
- **Given** `tunnelState === "connected"`인 문서,
- **When** 변환하면,
- **Then** `connectionState === "device"`이고 `unavailableReason === null`이다.
- 검증: unit

### AC-READY-009 — 모든 상태에서 키 집합이 같다
- **Given** 네 상태를 각각 만드는 입력. 네 상태의 출처는 **서로 다른 두 생산 함수**이므로 어느 쪽이 만드는지를 상태마다 못박는다:

  | 상태 | 생산 함수 | 위치 |
  |---|---|---|
  | `device` · `offline` · `unavailable` | `parseDevicectlDevices()` | `src/backend/wda-device-list.ts:78` |
  | `unauthorized` | `AdbBackend.listDevices()` | `src/backend/adb-backend.ts:288`(리터럴 `:311-320`) |

- **When** **위 두 함수가 실제로 반환한 항목**의 키 집합을 비교하면,
- **Then** 네 항목의 키 집합이 **완전히 동일**하다(`unavailableReason` · `alternateSerials` 포함).
- **테스트가 `DeviceInfo` 리터럴을 손으로 만들어 비교하는 것은 이 AC를 만족하지 않는다**(1차 감사 D4). 0.1.0은 "각각을 기기 항목으로 변환해"라고만 적어 **어느 변환 함수인지 지정하지 않았다.** 대상이 비어 있으면 구현자는 테스트 안에서 리터럴 4개를 만들어 `Object.keys()`를 비교할 수 있는데, **같은 타입의 리터럴 4개는 키 집합이 같을 수밖에 없으므로 그 검사는 항상 통과하고 아무것도 증명하지 않는다.**
- **막으려는 위험은 실재한다**: 이 저장소는 조건부 키 전개를 관용적으로 쓴다 — `doctor.ts:206` `...(installResult.apkSource ? { apkSource: … } : {})`, `doctor.ts:267` `...(originalImeRestored !== undefined ? { originalImeRestored } : {})`, `device-targeting.ts:190` `...(disconnectedCount > 0 ? { disconnectedCount } : {})`. 위험은 **생산 코드 변환 함수 안**에 있고, 리터럴 비교로는 절대 닿지 않는다.
- **이 AC가 막는 것**: 조건부로 나타나는 키. SPEC-CONTRACT-001의 키 집합 계약을 불안정하게 만들고, 소비자가 `undefined` 분기를 따로 써야 하게 된다.
- 검증: unit

### AC-READY-010 — 같은 물리 기기의 두 전송이 항목 1개로 합쳐진다
- **Given** 전송 시리얼이 다르고 `ro.serialno`가 같은(`R3CY106LKVX`) 두 항목 — `spec.md` §C.1-③의 실측 형태를 그대로 쓴다,
- **When** 목록을 구성하면,
- **Then** 세 가지가 **모두** 성립한다: ① 항목이 **1개**다 ② 대표 `serial`이 두 전송 중 하나다 ③ `alternateSerials`에 나머지 하나가 들어 있다.
- 검증: unit

### AC-READY-011 — 대표 전송 선택이 결정적이다
- **Given** AC-010과 같은 두 항목을, **입력 순서를 뒤집은** 두 가지 배열로 구성하고,
- **When** 각각 목록을 구성하면,
- **Then** 두 결과의 대표 `serial`이 **같다**.
- **이 AC가 막는 것**: 입력 순서에 따라 대표가 흔들리면 기기별 상태가 호출마다 다른 키에 저장된다 — SPEC-IMESTATE-001이 닫은 결함과 증상이 같은 새 경로가 생긴다.
- 검증: unit

### AC-READY-012 — 식별자를 모르는 전송은 합치지 않는다
- **Given** 두 전송 중 한쪽의 `ro.serialno` 조회가 실패한 상태,
- **When** 목록을 구성하면,
- **Then** 두 전송이 **각각 독립 항목**으로 남고 어느 것도 합쳐지지 않는다.
- **왜 합치지 않는 쪽이 안전한가**: 값을 모르면서 합치면 **서로 다른 기기를 하나로 접을 수 있고**, 그 순간 한 기기의 상태가 다른 기기에 적용된다. 나누는 실수는 목록이 길어질 뿐이지만 합치는 실수는 기기를 잘못 조작한다.
- 검증: unit

### AC-READY-013 — 실기기의 중복 전송이 1개 항목으로 보고되고, 두 시리얼 모두로 지정된다
- **Given** **같은 물리 기기가 둘 이상의 전송으로 잡히는** Android 실기기(`adb devices -l`이 같은 `model`로 2행 이상을 보이는 상태). 전송의 종류는 묻지 않는다 — 무선 IP, mDNS, USB 어느 조합이든 성립한다,
- **When** `node dist/cli/bin.js devices`를 실행하고, 이어서 그 기기의 **각 전송 시리얼로** `--device`를 지정해 **`devices`와 `tap`(또는 다른 조작 명령) 양쪽**을 실행하면,
- **Then** 네 가지가 **모두** 성립한다: ① `devices`에서 그 기기가 **1개 항목**으로 나타난다 ② `alternateSerials`에 나머지 전송이 실린다 ③ **대표 시리얼과 부속 시리얼 어느 것으로 지정해도** 같은 기기가 대상이 된다(`DEVICE_NOT_FOUND`가 나오지 않는다) ④ **`devices --device <부속시리얼>`도 그 기기를 돌려준다.**
- **④를 명시적으로 지목하는 이유**(3차 감사 P0): `devices`는 `resolveTargetDevice()`를 **거치지 않는 유일한 device-facing 명령**이고(`src/cli/commands/devices.ts:14`에서 자체 필터), 조작 명령 10개는 모두 그 공용 경로를 쓴다. ③을 "아무 명령이나"로 두면 검증자가 `tap`이나 `screenshot`으로 확인하고 통과시킬 수 있는데, 그 둘은 공용 경로라 통과하고 **`devices`만 여전히 깨진 채 남는다.** 그리고 사용자가 실제로 밟는 순서는 `devices`로 시리얼을 얻어 다시 쓰는 것이므로, 하필 가장 그럴 법한 경로가 검사되지 않는다.
- **③이 REQ-READY-006의 실환경 판정이다** — 그룹핑이 만드는 회귀를 실기기에서 직접 확인한다.
- **왜 Given을 넓혔는가**(1차 감사 S4): 0.1.0은 "**무선 디버깅으로** 연결돼"로 좁게 적었으나 2026-08-04 실제 중복은 **USB + mDNS**였다(`adb devices -l`의 `usb:33-4` 행). `spec.md` REQ-READY-004 본문은 "무선 IP 연결과 mDNS 연결 **등**"으로 넓게 쓰는데 AC만 좁아, REQ-004의 유일한 실기기 AC가 좁은 전제 때문에 "미관측"으로 마감될 위험이 있었다.
- **전후 대조 의무**: 착수 전 같은 명령이 **2개 항목**을 보고하는 것을 먼저 관측해 기록한다. ③은 착수 전에도 성립하므로(오늘은 두 시리얼 모두 실재하는 항목이다) 전후 대조 대상이 아니다 — **착수 후에도 성립해야 하는 불변**이다.
- 실기기 미확보 시 **미관측으로 기록**하고 PASS로 올리지 않는다(원칙 ①).
- 검증: e2e·manual

### AC-READY-014 — `SKILL.md`의 서술이 코드와 일치한다
- **Given** M1~M3 구현 완료 상태,
- **When** `SKILL.md`의 **네 지점**을 해당 코드와 나란히 놓고 읽으면 — ① § Known traps의 `doctor` 정확성 주장 ② § Device targeting의 `connectionState` 설명 ③ § Command reference의 `doctor` 행 ④ **`:115-121`의 `devices` JSON 예시**,
- **Then** 네 지점 모두 **현재 코드 동작과 일치**하며, 특히 현재 문서의 *"`doctor` reports this accurately"* 주장이 **사실이 되었거나 사실에 맞게 고쳐져** 있다.
- **④가 왜 가장 중요한가**(1차 감사 S6): 이 예시는 6개 키(`serial`/`model`/`osVersion`/`connectionState`/`isEmulator`/`platform`)를 **하드코딩해 보여 준다.** Skill 소비자가 실제로 패턴을 맞추는 표면이 여기이므로, 필드 2개가 추가되면 이 예시가 곧바로 낡아 Skill이 없는 키를 기대하거나 있는 키를 무시하게 된다. 0.1.0은 이 지점을 빠뜨렸다.
- **왜 grep이 아닌가**: 문서와 코드의 일치는 문자열 존재가 아니라 의미의 문제다. grep으로 만들면 양성 대조를 붙일 대상이 없어 원칙 ②를 위반한다.
- 대조한 코드 위치와 갱신한 절을 `progress.md`에 기록한다.
- 검증: doc-review

### AC-READY-015 — 계약 테스트가 새 값·필드를 반영한다
- **Given** 키 집합 계약 테스트 — **`src/schema/device-backend.test.ts:31-42`**. 이것이 SSOT다: `Record<keyof DeviceInfo, true>`로 키를 나열하고 `expect(Object.keys(fieldPresence)).toHaveLength(6)`으로 개수를 고정한다. `command-payloads.ts:44-47`이 *"`DeviceInfo`는 이미 선언돼 있고 `device-backend.test.ts`가 키 집합을 고정하므로"*라고 명시적으로 이 파일에 위임한다,
- **When** 전체 테스트를 실행하면,
- **Then** 세 가지가 **모두** 성립한다: ① 그 테스트의 키 나열에 `unavailableReason` · `alternateSerials`가 **포함돼** 있다 ② `toHaveLength`의 기대값이 **6에서 8로** 갱신돼 있다 ③ 전체 스위트가 exit 0이다.
- **②를 따로 요구하는 이유**: 필드 2개 추가는 이 테스트를 **타입과 길이 양쪽에서** 깨뜨린다. 타입만 고치고 길이를 그대로 두면 컴파일은 통과하고 런타임 단언이 실패하므로, 둘 다 명시해야 "고쳤다"가 판정된다.
- **왜 파일명을 못박는가**(1차 감사 S5): 0.1.0은 "SPEC-CONTRACT-001의 키 집합 계약 테스트"라고만 적었고, `plan.md` §C 행 6은 `grep -rln "connectionState" src/ | grep test`로 목록을 찾아보라고 미뤘다 — 그 결과는 9개 파일이라 갱신 대상이 특정되지 않았다.
- 검증: unit

### AC-READY-016 — 기존 3개 상태값의 의미가 바뀌지 않았다
- **Given** `unavailable` 도입 이전에도 존재하던 입력들과, 각각의 **기대값을 상수로 명시한** 표. 생산 함수도 AC-READY-009와 같은 방식으로 못박는다:

  | 입력 | 생산 함수 | 기대 `connectionState` | 기대 `unavailableReason` |
  |---|---|---|---|
  | `tunnelState: "connected"` | `parseDevicectlDevices()` | `"device"` | `null` |
  | `connectionProperties` 부재 | `parseDevicectlDevices()` | `"offline"` | `null` |
  | `adb devices -l`의 `unauthorized` 항목 | `AdbBackend.listDevices()` | `"unauthorized"` | `null` |

- **When** 위 두 생산 함수로 각각을 변환하면,
- **Then** 표의 기대값과 **정확히 일치**한다.
- **왜 기대값을 상수로 적는가**(1차 감사 D4): 0.1.0은 "**도입 전과 동일**하게 나온다"고만 적었고, 그 "도입 전" 기준값을 어떻게 확보하는지가 없었다. 구현 후에 값을 읽어 기대값으로 삼으면 무엇을 하든 통과한다 — 회귀를 잡을 수 없다. 표에 박힌 상수는 구현이 무엇을 하든 바뀌지 않는다.
- **이 AC가 막는 것**: 새 값을 넣으면서 기존 분기를 재배치해 조용히 의미를 옮기는 회귀. `unavailable`은 지금까지 `offline`으로 접혔던 **부분집합만** 가져가야 한다.
- 검증: unit

### AC-READY-017 — 부속 전송 시리얼로도 대상 조회가 성공한다
- **Given** AC-READY-010이 만든 합쳐진 항목 하나 — 대표 `serial` 하나와 `alternateSerials` 하나를 갖고, **`connectionState`가 `"device"`인** 상태. 이 조건을 못박는 이유는 경로 A가 연결 상태를 따로 검사하기 때문이다(`device-targeting.ts:160-167` — `"device"`가 아니면 `DEVICE_NOT_CONNECTED`로 빠진다). 픽스처가 이를 만족하지 않으면 조회가 옳아도 ①이 실패해 **무엇이 틀렸는지 알 수 없는 검사**가 된다(4차 감사 Q3),
- **When** **두 조회 경로 각각**을 ① 대표 시리얼 ② 부속 시리얼로 호출하면 — 경로 A는 `resolveTargetDevice()`(`src/cli/device-targeting.ts:133`, 조작 명령 10개가 쓰는 공용 경로), 경로 B는 **`devicesCommand`**(`src/cli/commands/devices.ts:7`, 자체 필터를 가진 유일한 명령),
- **Then** 네 가지가 **경로 A·B 양쪽에서 모두** 성립한다: ① 두 호출 모두 성공한다 ② 두 호출이 **같은 기기 항목**을 돌려준다 ③ 어느 쪽도 `DEVICE_NOT_FOUND`를 돌려주지 않는다 ④ **반환 항목의 `serial`이 대표 시리얼이다** — 부속 시리얼로 지정해도 요청한 값이 아니라 대표 값이 돌아온다(`plan.md` §B.6의 정규화 결정).
- **②를 경로별로 어떻게 비교하는가**(4차 감사 Q3): 두 경로의 **반환 모양이 다르다.** 경로 A는 `{ok, serial, device, backend}`를, 경로 B는 `{ok, command, data: DeviceInfo[]}`를 돌려준다. 따라서 "같은 항목"은 각 경로에서 **`DeviceInfo`를 꺼낸 뒤** 비교한다 — 경로 A는 `.device`, 경로 B는 `.data[0]`(그리고 `.data.length === 1`도 함께 확인한다). 꺼내는 방법을 적지 않으면 구현자마다 다르게 비교하고, 경로 B에서 배열 길이를 안 보면 **여러 항목이 돌아와도 통과**한다.
- **④를 따로 요구하는 이유**: ②만으로는 "같은 항목"까지만 보장되고 **반환 `serial`이 무엇인가**는 열려 있다. 그 값이 이후 모든 `adb -s`에 들어가고 기기별 상태의 키가 되므로, 정규화가 실제로 일어나는지를 직접 봐야 한다.
- **경로 B를 따로 두는 이유**(3차 감사 P0): 경로 A만 검사하면 `devices.ts:14`의 자체 필터는 한 번도 실행되지 않는다. 두 경로는 **다른 코드**이며 한쪽을 고쳐도 다른 쪽은 그대로다.
- **이 AC가 막는 것**: REQ-READY-004의 그룹핑이 만드는 회귀. 그룹핑 이후 부속 전송 시리얼은 **어떤 항목의 `serial`도 아니게 되므로**, `device-targeting.ts:139`의 `devices.filter((d) => d.serial === requestedSerial)`를 그대로 두면 오늘 동작하는 `--device` 호출이 `DEVICE_NOT_FOUND`(`:141-148`)로 떨어진다.
- **전후 대조 의무**: ③은 **착수 전에도 참**이다(오늘은 두 시리얼 모두 실재하는 항목이므로). 따라서 이 AC는 "고쳐졌는가"가 아니라 "**깨지지 않았는가**"를 묻는다 — 그룹핑 커밋 직후 이 테스트가 빨개지는지 반드시 확인하고, 빨개지지 않으면 그룹핑이 실제로 동작하지 않는 것이므로 AC-READY-010부터 다시 본다.
- 검증: unit

### AC-READY-018 — 실제 파일시스템·환경변수에서 PATH 밖 설치가 구별돼 보고된다
- **Given** **주입된 가짜가 아닌 실제 조작** — 임시 디렉터리에 `platform-tools/adb` 실행 파일을 실제로 만들고(실행 권한 부여), `ANDROID_HOME`을 그 디렉터리로 실제로 설정하고, `PATH`에서 `adb`를 실제로 제거한 상태,
- **When** 경로 해석과 `doctor` 보고를 수행하면,
- **Then** 세 가지가 **모두** 성립한다: ① `adb.installed === true` ② `adb.onPath === false` ③ `adb.resolvedPath`가 그 임시 디렉터리의 절대 경로다.
- **왜 mock으로는 부족한가**(원칙 ④): REQ-READY-002의 원인 결함은 **582개 단위 테스트가 전부 통과하는 상태에서 존재했다**(`spec.md` §C.1-④). 주입된 가짜 파일시스템은 "우리가 상상한 파일시스템"을 검사할 뿐이고, 실제 결함은 실행 권한·심볼릭 링크·`PATH` 파싱처럼 가짜가 재현하지 않는 표면에 있었다. AC-004·005(mock)와 이 AC(실FS)는 **서로를 대체하지 않는다** — 앞의 둘은 분기 논리를, 이 하나는 그 논리가 실제 환경에서도 같은 답을 내는지를 본다.
- 실행 후 임시 디렉터리와 환경변수는 원상 복구한다.
- 검증: unit(실FS)

### AC-READY-019 — 실기기 iOS가 `unavailable` + 사유로 보고된다
- **Given** USB로 물리적으로 연결돼 있으나 조작 전제(터널·DDI·WDA)가 성립하지 않은 iOS 실기기,
- **When** `node dist/cli/bin.js devices`를 실행하면,
- **Then** 세 가지가 **모두** 성립한다: ① 그 기기의 `connectionState`가 `"unavailable"`이다(`"offline"`이 아니다) ② `unavailableReason`이 **그 시점 원본 `tunnelState` 값을 포함한다** ③ `xcrun devicectl list devices --json-output`를 같은 시점에 실행해 얻은 원본 값과 ②의 포함된 값이 **일치한다**.
- **③이 이 AC의 핵심이다**: 원본을 나란히 읽지 않으면 ②는 "무언가 문자열이 있다"만 확인하는 것이고, 사유가 **엉뚱한 기기의 값**이거나 **하드코딩된 상수**여도 통과한다.
- **전후 대조 의무**: 착수 전 같은 명령이 그 기기를 `"offline"`으로 보고하는 것을 먼저 관측해 기록한다(`spec.md` §C.1-②가 그 관측이다).
- **`plan.md` M4가 필수로 요구하는 검증이 이것이다** — 0.1.0에서는 계획서가 요구하는데 대응 AC가 없어 추적성 구멍이었다(1차 감사 D5).
- 실기기 미확보 시 **미관측으로 기록**하고 PASS로 올리지 않는다(원칙 ①).
- 검증: e2e·manual

### AC-READY-020 — 한 시리얼이 둘 이상 항목에 걸리면 대상을 고르지 않는다
- **Given** 어떤 시리얼 `S`가 A 항목의 **대표**이면서 동시에 B 항목의 **부속**인 목록. **올바른 그룹핑에서는 이 상태가 아예 생기지 않는다** — 넓어진 조회는 그것을 *만드는* 것이 아니라 *관측 가능하게* 만들 뿐이다. 그래도 검사하는 이유는 아래 참조,
- **When** `resolveTargetDevice()`를 `S`로 호출하면,
- **When** 같은 목록으로 **`devicesCommand`(경로 B)**도 `S`로 호출하면 — 경로 B는 자체 필터를 쓰므로 별도 코드다(`plan.md` §B.6.3),
- **Then** 세 가지가 **두 경로 모두에서** 성립한다: ① 대상을 고르지 않고 **거부**한다 ② A도 B도 임의로 선택되지 않는다 ③ 오류 코드가 **양쪽 다 `BACKEND_COMMAND_FAILED`**다 — 기존 충돌 분기의 코드를 유지한다(`plan.md` §B.6.2: 코드는 Skill이 분기하는 계약이므로 유지, 문구만 부속 시리얼 충돌을 설명하도록 고친다).
- **③을 못박는 이유**(3차 감사 P3): 오류 코드를 명시하지 않으면 구현자가 조용히 새 코드를 만들 수 있고, 그것은 `SKILL.md` § JSON in/out contract가 약속한 분기 계약을 말없이 바꾸는 일이다. **문구**는 고쳐야 하지만(현재 문구는 백엔드 소유권을 말하는데 이 사건은 소유권과 무관하다) **코드는 그대로여야 한다** — 이 AC가 그 둘을 구별한다.
- **선행 조건이 생산 환경에서 도달 불가인데 왜 검사하는가**: `resolveTargetDevice()`는 목록을 **인자로 받는 순수 함수**이므로 단위 테스트가 그 상태를 직접 구성할 수 있다. 그리고 이 검사가 지키는 것은 "그런 일이 일어난다"가 아니라 **"일어난다면 조용히 아무거나 고르지 않는다"**다 — 그룹핑이 깨졌을 때가 정확히 그 순간이다.
- **왜 거부가 옳은가**: 그런 상태는 그룹핑이 잘못됐거나 두 물리 기기가 같은 이름을 주장한다는 뜻이고, 어느 쪽이든 **아무거나 고르면 엉뚱한 기기를 조작한다.** `device-targeting.ts:150`의 기존 충돌 분기가 지키던 성질을 넓어진 조회에서도 유지하는 것이다(`plan.md` §B.6.2).
- **이 AC가 없으면 무엇이 열리는가**: 조회를 넓히는 구현은 자연스럽게 `find`(첫 매치)로 쓰기 쉽고, 그러면 충돌이 **조용히 첫 항목 선택**으로 끝난다. AC-READY-012가 "값을 모르면 합치지 않는다"로 막는 것과 같은 계열의 위험을 조회 쪽에서 막는다.
- 검증: unit
