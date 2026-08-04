---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — 인수 기준"
version: "0.1.0"
status: draft
created: 2026-08-04
updated: 2026-08-04
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
| AC-READY-013 | 실기기의 무선 중복이 1개 항목으로 보고된다 | REQ-READY-004 | e2e·manual |
| AC-READY-014 | `SKILL.md`의 서술이 코드와 일치한다 | REQ-READY-005 | doc-review |
| AC-READY-015 | 계약 테스트가 새 값·필드를 반영한다 | REQ-READY-005 | unit |
| AC-READY-016 | 기존 3개 상태값의 의미가 바뀌지 않았다 | REQ-READY-003 | unit |

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
- **When** `doctor`를 실행하면,
- **Then** 네 가지가 **모두** 성립한다: ① `adb.installed === true` ② `adb.onPath === false` ③ `adb.resolvedPath`가 그 절대 경로다 ④ 출력 어디에도 **설치 명령을 권하는 내용이 없다**.
- **④는 없음-검사이므로 AC-READY-005가 양성 대조를 맡는다** — 같은 테스트 파일이 두 구성을 모두 소유하므로 대조가 외부 코드에 의존하지 않는다(원칙 ③).
- 검증: unit(mock)

### AC-READY-005 — 진짜 미설치는 미설치로 보고하고 설치를 권한다 (AC-004의 양성 대조)
- **Given** 네 후보 경로 어디에도 `adb`가 없는 상태,
- **When** `doctor`를 실행하면,
- **Then** 세 가지가 **모두** 성립한다: ① `adb.installed === false` ② `adb.resolvedPath === null` ③ 출력에 **설치 명령 안내가 존재한다**.
- **이 AC의 두 번째 역할**: ③이 성립해야 AC-READY-004의 ④("권유 없음")가 의미를 갖는다. ③이 깨지면 안내 문구 생성 자체가 고장 난 것이므로 AC-004는 **무엇이든 통과**하게 된다.
- 검증: unit(mock)

### AC-READY-006 — 준비 안 된 iOS가 `unavailable` + 사유로 보고된다
- **Given** `tunnelState`가 존재하지만 `"connected"`가 아닌 값(예: 주석에 관측 기록된 `"connected (no DDI)"`)인 `devicectl` 문서,
- **When** 그 문서를 기기 목록으로 변환하면,
- **Then** 두 가지가 **모두** 성립한다: ① `connectionState === "unavailable"` ② `unavailableReason`이 **비어 있지 않은 문자열**이며 원인을 식별할 수 있다.
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
- **Given** `device` · `offline` · `unauthorized` · `unavailable` 네 상태를 각각 만드는 입력,
- **When** 각각을 기기 항목으로 변환해 **키 집합을 비교하면**,
- **Then** 네 항목의 키 집합이 **완전히 동일**하다(`unavailableReason` · `alternateSerials` 포함).
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

### AC-READY-013 — 실기기의 무선 중복이 1개 항목으로 보고된다
- **Given** 무선 디버깅으로 연결돼 두 전송으로 잡히는 Android 실기기(`adb devices -l`이 2행을 보이는 상태),
- **When** `node dist/cli/bin.js devices`를 실행하면,
- **Then** 그 기기가 **1개 항목**으로 나타나고 `alternateSerials`에 나머지 전송이 실린다.
- **전후 대조 의무**: 착수 전 같은 명령이 **2개 항목**을 보고하는 것을 먼저 관측해 기록한다.
- 실기기 미확보 시 **미관측으로 기록**하고 PASS로 올리지 않는다(원칙 ①).
- 검증: e2e·manual

### AC-READY-014 — `SKILL.md`의 서술이 코드와 일치한다
- **Given** M1~M3 구현 완료 상태,
- **When** `SKILL.md`의 세 지점을 해당 코드와 나란히 놓고 읽으면 — ① § Known traps의 `doctor` 정확성 주장 ② § Device targeting의 `connectionState` 설명 ③ § Command reference의 `doctor` 행,
- **Then** 세 지점 모두 **현재 코드 동작과 일치**하며, 특히 현재 문서의 *"`doctor` reports this accurately"* 주장이 **사실이 되었거나 사실에 맞게 고쳐져** 있다.
- **왜 grep이 아닌가**: 문서와 코드의 일치는 문자열 존재가 아니라 의미의 문제다. grep으로 만들면 양성 대조를 붙일 대상이 없어 원칙 ②를 위반한다.
- 대조한 코드 위치와 갱신한 절을 `progress.md`에 기록한다.
- 검증: doc-review

### AC-READY-015 — 계약 테스트가 새 값·필드를 반영한다
- **Given** SPEC-CONTRACT-001의 키 집합 계약 테스트,
- **When** 전체 테스트를 실행하면,
- **Then** 두 가지가 **모두** 성립한다: ① 계약 테스트가 `unavailable` 상태와 `unavailableReason` · `alternateSerials` 키를 **포함해** 검사한다 ② 전체 스위트가 exit 0이다.
- 검증: unit

### AC-READY-016 — 기존 3개 상태값의 의미가 바뀌지 않았다
- **Given** `unavailable` 도입 이전에도 존재하던 입력들 — `tunnelState: "connected"`(→`device`), 연결 정보 부재(→`offline`), 그리고 Android의 `unauthorized` 케이스,
- **When** 각각을 변환하면,
- **Then** 세 값이 **도입 전과 동일**하게 나온다.
- **이 AC가 막는 것**: 새 값을 넣으면서 기존 분기를 재배치해 조용히 의미를 옮기는 회귀. `unavailable`은 지금까지 `offline`으로 접혔던 **부분집합만** 가져가야 한다.
- 검증: unit
