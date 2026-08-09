---
id: SPEC-IOS-002
title: "iOS 제어 준비의 자동화 — 진행 기록"
version: "0.3.0"
status: in-progress
created: 2026-08-06
updated: 2026-08-08
author: hatae
---

# 진행 기록 — SPEC-IOS-002

이 파일은 **실행 중에 관측한 값**을 담는다. 설계 결정은 `design.md`에, 판정 기준은 `acceptance.md`에, 조사 대상은 `research.md`에 있다.
여기 적히는 것은 "그때 무엇이 나왔는가"뿐이다.

---

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-07
plan_version: 0.3.0
tier: L
plan_auditor_threshold: 0.85
artifacts: spec.md, plan.md, acceptance.md, design.md, research.md
```

### 계획 감사 이력

| 회차 | 판정 | 종합 | 보고서 | 처리 |
|---|---|---|---|---|
| — | 미실시 | — | — | 최초 작성 직후. 감사 전 |
| 1 | (오케스트레이터 기록) | — | `.moai/reports/plan-audit/` | 21건 중 **BLOCKER+HIGH 8건 + F15**를 0.2.0에서 반영. 나머지 10건(F9~F12 · F14 · F16 · F17 · F19~F21)은 사용자 결정으로 **다음 회차 이월** |
| 2 | 0.78 / 0.85 미달 | 0.78 | `.moai/reports/plan-audit/` | 치명 2건 · 중대 5건을 0.3.0에서 반영. **감사는 통과하지 못했다** — 나머지 지적은 사용자 결정으로 계속 이월 |

**0.2.0에서 닫은 것**

| 항목 | 무엇이 문제였나 | 어디를 고쳤나 |
|---|---|---|
| F2 (BLOCKER) | 낡은 측정 위에 세운 조사 항목 | `progress.md` §E.1.1 재측정 · `research.md` §2.3 후보 제외 |
| F1+F18 | 원칙 ④ 승계 미선언 + REQ-001 실환경 예외 | `acceptance.md` 원칙 블록 · AC-028 신설 |
| F3 | 8단계를 자동화 가능으로 표기 | `spec.md` §A.1 표 · §A.3 |
| F5+F15 | `design.md` §A.1과 §B.1의 자기모순 + 검증 AC 부재 | `design.md` §B.1 · §B.1.1 표 · AC-029 신설 |
| F4 | 부재 검사에 양성 대조 없음 | `acceptance.md` AC-004 · AC-022 · AC-025 |
| F6 | 측정 도구가 곧 측정 대상 | `acceptance.md` AC-011 |
| F7+F13 | REQ-007에 판정 근거도 설계 절도 없음 | `research.md` §6.1 · `spec.md` §E.2 · `design.md` §I · AC-021 |
| F8 | 의존 그래프에 `M1 → M3` 누락 | `plan.md` §C M1·M3 · §D · §F |

**0.3.0에서 닫은 것** — 2회차 감사 델타. 이 회차는 **넓히지 않고 좁히는 쪽**으로 고쳤다. 0.2.0의 수정이 새 결함 두 건(§B.1.1 표와 §B.2의 충돌, 그래프와 산문의 충돌)을 만들었기 때문이다.

| 항목 | 무엇이 문제였나 | 어디를 고쳤나 |
|---|---|---|
| N1 (치명) | 의존 그래프 그림이 자기 산문과 어긋남 — `M1 → M2`를 그려 놓고 아래에서 "M1과 M2는 독립"이라 적었고, `M1 → M3`는 그림에 없었으며, 설명 없는 세로줄이 M7로 내려갔다 | `plan.md` §D — 그림을 **간선 목록으로 교체**(모호한 표현을 없애는 쪽) + `M4 → M5` 글머리 추가 |
| N2 (치명) | 복구 경로가 사용자가 손으로 띄운 러너를 끌 수 있었다 — 재기동 행이 소유권을 묻지 않았다 | `design.md` §B.1.1 2행에 소유권 조건 명시 · `acceptance.md` AC-027을 **모든 종료 경로**로 확장(새 AC 없음, REQ-009 유지) |
| N4 (중대) | 생존×권한 표 4행이 도달 불가 — 2행과 가를 판별자가 없고 조사 대상도 아니었다 | `design.md` §B.1.1 **4행 삭제** + §A.5 정정("research.md 조사 항목"이라는 서술이 사실이 아니었다) |
| N3 (중대) | AC-029의 "네 조합"이 표와 맞지 않음 | `acceptance.md` AC-029 — 생존 2값 × 권한 3값으로 재작성 · `plan.md` M2 동반 수정 |
| N5 (중대) | REQ-005의 0건 마감을 원칙 ⑤ 위반으로만 적음 | `acceptance.md` §E — **원칙 ④와 ⑤ 둘 다** 명시 + ④ 미충족 REQ 2개(005 · 004) 열거 |
| N6 (중대) | REQ-004의 실환경 판정이 표에는 2건인데 실제로는 0건 위험 | `acceptance.md` §D 실환경 표 · §E AC-012 행 — AC-011은 보조 증거이므로 제외 |
| N7 (중대) | AC-025의 대조 실패 설명이 사실과 반대 | `acceptance.md` AC-025 — ①이 아니라 ②가 깨진다로 정정 |
| 건수 정정 | 이월 건수를 12로 적었으나 열거는 10개 | `progress.md` §E.1 감사 이력 표 |

**이 회차로 감사를 통과한 것이 아니다.** 2회차 종합은 0.78로 기준선 0.85에 미달했고, 위 8건 밖의 지적(1회차 이월 10건 + 2회차 경미 지적)은 **부채로 남아 있다.** 0.3.0은 그중 치명·중대만 닫은 상태다.

---

## §E.1.1 착수 시점의 환경

이 값들은 `spec.md` §C.0의 재측정 의무를 이 SPEC 자신에게 먼저 적용한 결과다.

### 1차 측정 (2026-08-06) — 기록으로만 남긴다

```
$ node dist/cli/bin.js devices
```

| 기기 | `connectionState` | `unavailableReason` |
|---|---|---|
| iPhone 15 Pro Max (`00008130-001238880C13803A`) | `unavailable` | 터널을 쓸 수 없다 — 기기 잠금 해제 후 WDA를 다시 띄운다 |
| iPad Pro 12.9" 5세대 (`00008103-000458360A63401E`) | `unavailable` | 터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다 |
| Galaxy S9 `SM_G960N` (`2beb9d2309037ece`) | `device` | (해당 없음 — Android) |

### 2차 측정 (2026-08-07) — 같은 명령, 두 기기가 같은 문구

```
$ node dist/cli/bin.js devices        → exit 0
```

| 기기 | `connectionState` | `unavailableReason` |
|---|---|---|
| iPhone 15 Pro Max (`00008130-001238880C13803A`) | `unavailable` | `disconnected — 터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다` |
| iPad Pro 12.9" 5세대 (`00008103-000458360A63401E`) | `unavailable` | `disconnected — 터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다` |
| Galaxy S9 `SM_G960N` (`2beb9d2309037ece`) | `device` | `null` (해당 없음 — Android) |

### 두 측정을 나란히 놓아 얻은 결론

**이 값은 기기가 무엇인가가 아니라 언제 읽었는가에 따라 달라진다.** 1차에서 두 기기의 문구가 갈렸고, 하루 뒤 2차에서는 같아졌다. 기기 구성은 그대로였다.

같은 성질을 SPEC-READY-001이 이미 기록해 두었다 — `progress.md:152`: *"`tunnelState`에 세 번째 값 `"unavailable"`이 존재한다. 1차 감사는 두 기기 모두 `"disconnected"`로 기록했으나, 같은 날 재실행에서 iPhone 15 Pro Max는 `"unavailable"`이었다(iPad는 `"disconnected"` 유지). **같은 기기의 값이 하루 안에 바뀐다.**"*

따라서 이 문구(그리고 그 뒤의 `tunnelState`)는 **관문 감지 신호의 후보에서 제외한다.** 신호가 되려면 같은 조건에서 같은 값이 나와야 하는데, 조건을 바꾸지 않아도 값이 바뀐다. 1차 측정만 보고 "두 기기의 문구가 다르니 무언가를 구분하는 신호일 수 있다"고 적었던 추론은 2차 측정이 반증했다 — **기기 정체성이 아니라 시점에 종속된 값이다.**

M1의 조사 항목에서도 이 항목은 내렸다(`research.md` §2.3).

```
$ git log -1 --format='%h %s'
d67df5c docs(SPEC-READY-001): 0.6.0 — AC-READY-013 실기기 관측 반영

$ pnpm test        → 28 files / 611 passed, exit 0
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

---

## §E.1.2 이 SPEC이 착수 전에 이미 아는 한계

**미리 적어 두는 이유**: 마감 시점에 "관측 못 했으니 unit으로 대체한다"는 사후 합리화를 막는다. 아래는 `acceptance.md` §E의 요약이며, 원본은 그쪽이다.

| 항목 | 착수 전 상태 |
|---|---|
| 권한 상실의 의도적 재현 | **방법 모름.** REQ-005가 실환경 판정 0건으로 마감될 수 있다 |
| 서명 만료(7일) | **대기 필요.** 시계 조작으로 흉내내지 않는다 |
| 관문 3개의 감지 신호 | **미조사.** M1이 닫지 못하면 M6은 "구분 불가"만 구현한다 |
| iOS 기기의 현재 가용성 | **2대 모두 불가.** M1의 첫 작업이 손으로 1대를 올리는 것 |

---

## §E.2 Run-phase Evidence

### 착수 조건 — 감사 미통과 상태로 진입했다는 선언

2026-08-08 run-phase 진입. **계획 감사를 통과하지 못한 상태에서 진입했다.**

| 항목 | 값 |
|---|---|
| 최근 감사 판정 | 2회차 종합 **0.78** / 기준선 **0.85** — **미달** |
| 진입 근거 | 사용자 결정 — "부채로 명시하고 진입" |
| 부채로 남는 것 | 1회차 이월 10건(F9~F12 · F14 · F16 · F17 · F19~F21) + 2회차 미반영 경미 지적 |

**감사 보고서 파일 부재 (착수 시 확인)**

```
$ find .moai/reports -iname "*IOS-002*"
(출력 없음)
```

`§E.1` 감사 이력 표는 보고서 위치를 `.moai/reports/plan-audit/`로 적지만 **그 디렉터리에 SPEC-IOS-002 파일이 0건**이다.

**git 부재가 아니라 디스크 부재다** — `.gitignore:209`가 `.moai/reports/plan-audit/*.md`를 무시하므로(로컬 산출물 방침) 감사 보고서는 애초에 커밋되지 않는다. 따라서 "git에 없다"는 신호가 아니다. 그러나 위 `find`는 **파일 시스템**을 훑은 것이고, 같은 디렉터리에 다른 SPEC의 보고서 9건(SPEC-READY-001 5건 · PROJECT 3건 · SPEC-IMESTATE-001 1건)은 실재한다. 즉 이 SPEC의 것만 없다.

따라서 `0.78`과 이월 10건은 **`progress.md` 자신의 기록 외에 대조할 원본이 없다.** 이 사실을 착수 시점에 남긴다 — 나중에 "감사 결과대로 했다"고 말할 때 그 근거가 자기 참조임을 알 수 있도록.

`§E.1`이 적은 "2회차 잔여 9건"의 **9라는 숫자는 이 문서 어디에서도 뒷받침되지 않는다** — 원문은 개수 없이 "2회차 경미 지적"이라고만 적는다.

### 착수 시점 기준선 재측정 (2026-08-08)

```
$ git log -1 --format='%h %s'
e2eec6a docs(SPEC-IOS-002): 0.3.0 — iOS 준비 자동화 계획 문서 6종 + 계획 감사 2회 반영

$ git rev-list --count --left-right origin/master...HEAD
0	1                          # 로컬이 1커밋 앞섬 — e2eec6a 미푸시. plan.md §A.1의 "0 0" 기대와 다름

$ pnpm test        → 28 files / 611 passed, exit 0
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

### M1 — 조사 (아이패드)

산출물: `.moai/reports/ios-verification/SPEC-IOS-002-m1-2026-08-08.md`

대상 기기가 **아이폰에서 아이패드로 바뀌었다**(사용자 지시 + 관측 뒷받침). `idevice_id -l`이 아이패드 하나만 반환한다 — 아이폰은 USB(usbmuxd) 경유로 잡히지 않는다. `devicectl`은 둘 다 `available (paired)`로 보고하므로, **`devicectl`의 `State`는 `iproxy` 사용 가능성의 신호가 아니다.**

M1 요건 6개 대비: 1 완료 · 2 부분(1/3) · 3 불가(아이폰 USB 미연결) · 4 미착수 · 5 부분 · 6 미착수.

**M1이 낸 주요 자료**

1. **관문 감지 신호 — 귀속 실패** *(2026-08-08에 "관문 1개 확정"으로 적었으나 8/09에 반증됨)*. `xcodebuild`가 exit 65 + `Timed out while enabling automation mode.` (`XCTFuture Code=1000`)를 내는 것은 사실이나, **그 문구가 UI 자동화 승인 관문을 가리키지는 않는다.** 8/09에 같은 문구가 서로 다른 조건 다섯에서 나왔고, 그중 하나는 **성공했던 조합과 산출물·승인이 모두 같은 상태**였다(181초 대기). 산출물 축도 배제됐다 — 두 xctestrun이 경로를 빼면 완전히 동일했다. 즉 이 문구는 **여러 원인이 합류하는 지점**이다. 8/08 기록이 "다른 변수를 고정했다"고 적은 것이 틀렸다 — 성공 시점에 사용자가 기기를 직접 만지고 있었다는 변수를 통제하지 못했다. 상세: M1 기록 §3.4 정정 블록.
2. **`design.md` §A.4 수치 반증** — `/screenshot`을 "111ms, 약 1MB"로 적었으나 실측은 **680ms / 10.2MiB**(3회 일치). 기기 종속으로 보인다(아이폰 기준 → iPad Pro 12.9"). §A.4의 "수용한다" 결론은 살아남지만 **전제가 달라졌으므로 본문 정정이 필요하다.**
3. **AC-IOS2-023 관측** — 러너 미기동 상태에서 아이패드가 `devices`에 남고 `connectionState: "unavailable"` + 사유를 실었다. 실기기 AC 1건 확보.
4. **범위 판단이 필요한 발견** — 기기가 `unavailable`이면 `doctor`가 `wdaEnvironment`를 내지 못한다(`src/cli/commands/doctor.ts:59-62`에서 iOS 갈래 진입 실패). AC-IOS2-018의 도달 가능성에 영향.
5. **`unavailableReason` 문구가 로컬 터널 상태와 무관** — `iproxy`가 8100에서 LISTEN 중인데도 "터널이 연결되지 않았다"가 그대로였다. 이 문구는 이미 시점 종속성 때문에 감지 신호 후보에서 제외돼 있는데(`§E.1.1`), 이번 관측은 **로컬 상태와도 무관하다**는 다른 이유를 추가한다.

### 실기기 AC 판정 현황 (2026-08-08 아이패드 기동 시점)

| AC | 상태 | 근거 |
|---|---|---|
| AC-IOS2-023 | **PASS(관측)** | M1 기록 §2.1 · §3.2 |
| AC-IOS2-012 | **미관측** | 권한 상실 상태를 만들 수 없다(`acceptance.md` §E) |
| AC-IOS2-011 보조 | 미관측 | 오염 통제(방해금지) 하에 재관측 필요 |

### M2 — 설정 자리와 판정 근거 교체 (REQ-IOS2-001 · REQ-IOS2-004)

**바뀐 파일**

| 파일 | 무엇을 |
|---|---|
| `src/backend/wda-build-config.ts` | 신규 — 환경 변수 3개에서 빌드 설정 읽기 |
| `src/backend/wda-build-config.test.ts` | 신규 — AC-001 · 002 · 004 (양성 대조 포함) |
| `src/backend/wda-errors.ts` | `WdaBuildConfigMissingError` 추가. **기존 4종 무변경** |
| `src/backend/wda-doctor.ts` | `WdaCheck.controllable` 추가 + `probeControllable` 신설 |
| `src/backend/wda-doctor.test.ts` | AC-010 · 011 · 029 추가 |
| `src/cli/router.test.ts` | 대역 1곳에 새 필드 반영 (타입 검사가 잡음) |

**설정 자리 — 이름을 여기서 확정한다** (`design.md` §C.4가 "이름은 계획 단계에서 정한다"고 남겨둔 것)

| 항목 | 환경 변수 |
|---|---|
| Apple 개발팀 식별자 | `EXPLORE_MOBILE_IOS_TEAM_ID` |
| 러너 번들 식별자 | `EXPLORE_MOBILE_IOS_BUNDLE_ID` |
| WDA 소스 트리 경로 | `EXPLORE_MOBILE_WDA_SOURCE` |
| 부재 시 오류 코드 | `WDA_BUILD_CONFIG_MISSING` |

접두사 `EXPLORE_MOBILE_`은 기존 `EXPLORE_MOBILE_WDA_PORTS`의 관례를 따랐다.

**판정 근거 교체** — `WdaCheck`에 필드 **하나만** 더했다. 기존 `reachable`(=생존, `/status`)은 의미를 그대로 두고, `controllable`(3값: `ok` / `failed` / `unknown`)을 신설했다. 기존 필드를 재해석하지 않았으므로 기존 소비자의 의미가 바뀌지 않는다.

#### AC 판정 (M2 범위)

| AC | 판정 | 근거 | 종류 |
|---|---|---|---|
| AC-IOS2-001 | **PASS** | `wda-build-config.test.ts` — 코드 · 메시지 · 빠진 것만 지목 · 공백 취급 | unit |
| AC-IOS2-002 | **PASS** | 같은 파일 — `code !== "WDA_UNREACHABLE"` + 메시지에 `iproxy` 부재 | unit |
| AC-IOS2-004 | **PASS** | 같은 파일 — 검사 파일 소유 양성 대조 ①(표본이 4패턴 전부에 걸림) + ②(제품 소스 0매치) + 패턴 목록 비어있지 않음 | unit + 코드 확인 |
| AC-IOS2-010 | **PASS** | `wda-doctor.test.ts` — 판정 경로가 `/screenshot`을 실제 호출 + `/status` 200인데 권한 실패 시 `ok`가 아님 | unit + 코드 확인 |
| AC-IOS2-011 (주) | **PASS** | 같은 파일 — 호출 경로 전부가 GET이고 `{/status, /screenshot}` 안에 있음, `/session`·`/actions` 부재. `WdaClient.request`가 세션을 만들지 않음을 코드로 확인(`wda-client.ts:187-193`) | 코드 확인 |
| AC-IOS2-011 (보조) | **미관측** | 실기기 화면 전후 비교를 오염 통제(방해금지) 하에 뜨지 않았다 | e2e·manual |
| AC-IOS2-012 | **미관측** | 권한 상실 상태를 만들 수 없다 (`acceptance.md` §E에서 선언됨). **REQ-004는 실환경 판정 0건으로 마감될 수 있다** | e2e·manual |
| AC-IOS2-029 | **PASS** | 같은 파일 — §B.1.1 세 상태가 서로 다른 조합(집합 크기 3) + 생존은 boolean · 권한은 3값 문자열. 실기기 `doctor` 출력에서도 두 필드 분리 확인 | unit + 코드 확인 + 실기기 |
| AC-IOS2-028 | **부분 PASS** | 아래 참조 | e2e(호스트) |
| AC-IOS2-003 | **M4로 이월** | 아래 참조 | — |

#### AC-IOS2-028 — 부분 PASS인 이유

실제 프로세스에서 실제 환경 변수를 세우고 지운 두 상태를 판정했다. `process.env` mock이 아니다.

```
$ EXPLORE_MOBILE_IOS_TEAM_ID=ABCDE12345 EXPLORE_MOBILE_IOS_BUNDLE_ID=com.example.wda \
  EXPLORE_MOBILE_WDA_SOURCE=/Users/hatae/WebDriverAgent \
  node -e 'import("./dist/backend/wda-build-config.js").then(m=>console.log(JSON.stringify(m.readWdaBuildConfig())))'
{"teamId":"ABCDE12345","bundleId":"com.example.wda","wdaSourcePath":"/Users/hatae/WebDriverAgent"}

$ env -u EXPLORE_MOBILE_IOS_TEAM_ID -u EXPLORE_MOBILE_IOS_BUNDLE_ID -u EXPLORE_MOBILE_WDA_SOURCE \
  node -e '... try{readWdaBuildConfig()}catch(e){...}'
code=WDA_BUILD_CONFIG_MISSING
iOS 빌드 설정이 선언돼 있지 않습니다 (3개). 다음을 **환경 변수**로 선언하세요:
  export EXPLORE_MOBILE_IOS_TEAM_ID="<Apple 개발팀 식별자>"
  export EXPLORE_MOBILE_IOS_BUNDLE_ID="<러너 번들 식별자>"
  export EXPLORE_MOBILE_WDA_SOURCE="<WebDriverAgent 소스 트리 경로>"
```

**남은 간극**: `acceptance.md` AC-028은 *"CLI를 **실행해** 판정한다"*고 적는다. 위 실행 주체는 CLI가 아니라 `dist`를 부르는 `node` 프로세스다. **빌드 설정을 소비하는 CLI 명령이 아직 없기 때문**이며(그것은 M4 REQ-002의 산출물), M4에서 CLI 표면이 생기면 같은 판정을 CLI로 다시 떠야 완전히 닫힌다.

실환경변수라는 **판정의 성격**(원칙 ④가 이름까지 대어 지목한 것)은 충족했고, **실행 주체**만 미달이다. 그래서 PASS가 아니라 부분 PASS로 적는다.

#### AC-IOS2-003 — M4로 이월한 이유

AC-003은 *"설정 값이 빌드 인자로 그대로 전달된다"*(argv 구성)를 판정한다. `plan.md` §C는 이것을 M2 목록(AC-001~004)에 넣었으나, **M2에는 빌드 명령 구성이 없다** — 빌드는 M4(REQ-002)의 산출물이다. M2에서 argv 함수를 미리 만들면 M4가 쓰지도 않을 형태를 추측하게 되므로, **판정 대상이 생기는 M4로 옮긴다.**

#### 회귀 확인

```
$ pnpm test        → 29 files / 635 passed, exit 0    (착수 시 28 files / 611 → +1 파일 / +24건)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0

$ grep -nE "security find-|showBuildSettings|DEVELOPMENT_TEAM|Library/MobileDevice" src/backend/wda-build-config.ts
매치 없음 (AC-004 본 판정)

$ grep -n 'public readonly code = ' src/backend/wda-errors.ts
50:  WDA_UNREACHABLE      ← 기존 4종 무변경
72:  WDA_RESPONSE_LOST
82:  WDA_COMMAND_FAILED
100: WDA_PORT_UNMAPPED
118: WDA_BUILD_CONFIG_MISSING   ← 신규
132: UNSUPPORTED_KEY_ON_IOS
```

타입 검사가 소비자 하나(`router.test.ts:1217`)를 잡았다 — 새 필드를 안 채운 대역이었다. 테스트는 통과하는데 타입만 깨진 상태였으므로, **테스트만 돌렸으면 놓쳤을 경계**다.

증거 로그: `.moai/state/verify/d48410e1/{4-test-after,5-typecheck-after,6-build-after}.log`

#### 미검증으로 남는 것

- AC-011 보조 증거 · AC-012 — 실기기 관측 미실시 (위 표)
- `probeControllable`이 `"failed"`를 낼 때 그 원인이 권한 상실인지 다른 것인지 **가르지 않는다.** 판별자가 없고 조사 대상도 아니다(`design.md` §A.5 · §B.1.1). 거짓 음성(쓸 수 있는데 못 쓴다고 말함)이 가능하다.
- `/screenshot` 비용이 기기에 따라 10배 이상 차이난다(§M1 기록). `doctor` 호출마다 10MiB를 받아 JSON으로 파싱한다.

### M3+M4 — 빌드 · 기동 · 소유권 (REQ-IOS2-002 · 003 · 009)

`plan.md`는 M3 → M4 순서였으나 **둘을 묶어 진행했다.** M3가 러너를 띄우려면 산출물 경로가 필요한데 그것을 만드는 것이 M4였고, 그 빈칸을 문서로 메우는 대신 빌드를 구현하는 쪽을 택했다. 부수 효과로 **AC-003의 M4 이월이 취소**됐다 — 빌드가 생기면서 argv 판정 대상이 함께 생겼다.

**신규 모듈**: `wda-build.ts` · `wda-runner-state.ts` · `wda-launcher.ts` (+ 각 검사) · `process-executor.ts`의 `spawnBackground`

**설계 결정 둘**

1. **상태를 파일로.** `PerSerialState`는 프로세스 안에서만 사는 `Map`이고 CLI는 명령마다 새 프로세스라, `launch`가 적은 식별자를 `reset`이 볼 수 없다. `~/.explore-mobile/wda-runners.json`에 **임시 파일 + rename**으로 원자적으로 쓴다.
2. **생존과 종료 자격의 축이 다르다.** 생존은 포트(`/status`)로, 종료 자격은 기록으로 판정한다. 포트로 종료를 판정하면 남의 러너를 죽이고(AC-027 위반), 기록으로 생존을 판정하면 손으로 띄운 러너를 못 보고 중복 기동한다(AC-009 위반).

#### AC 판정

| AC | 판정 | 근거 |
|---|---|---|
| AC-IOS2-003 | **PASS** | `wda-build.test.ts` — 설정 3값이 argv에 그대로. **argv 판정이며 동작 판정이 아니다**(원칙 ⑤) |
| AC-IOS2-005 | **PASS (실기기)** | `readWdaBuildConfig` → `xcodebuildArgs` → `buildWdaRunner` 경로로 실제 빌드 성공 |
| AC-IOS2-006 | **PASS** | 실패 시 `xcodebuild` 출력을 요약 없이 보존 + exit 코드 |
| AC-IOS2-007 | **PASS (실기기)** | 산출물이 `~/.explore-mobile/wda/Build/Products/`에, `findXctestrun`이 발견. DerivedData 해시 경로 미사용 |
| AC-IOS2-008 | **PASS (실기기)** | 39초 만에 `ok:true` · `controllable:"ok"` — 프로세스 기동이 아니라 조작 가능 확인까지 마친 뒤 성공 보고 |
| AC-IOS2-009 | **PASS (실기기)** | 살아 있는 러너 앞에서 프로세스 0개 기동, 남의 러너를 우리 것으로 기록도 안 함 |
| AC-IOS2-026 | **PASS (실기기)** | `reset` → iproxy 62689 · 러너 62696 종료, 포트 000, 상태 파일 `{}` |
| AC-IOS2-027 | **PASS (실기기)** | 손으로 띄운 러너에 `reset` → 생존, `noOp:true`, 사유 명시 |

실기기 판정 6건. AC-026과 027을 **같은 기기에서 양방향으로** 확인했으므로, "포트를 쓰는 프로세스를 모두 죽인다"는 구현으로는 통과할 수 없다.

#### 실측이 잡은 결함 하나

`spawnBackground`를 `stdio:"ignore"`로 만들어 **러너가 죽어도 원인을 알 수 없는 상태**를 만들었다. 빌드 실패에는 원인 보존 규칙(AC-006)을 적용해 놓고 기동 실패에는 적용하지 않은 비대칭이었다. `~/.explore-mobile/logs/`에 남기도록 고치고 회귀 검사 5건을 붙였다(실제 프로세스·실제 파일 판정).

#### 관문 감지 — 원점으로 돌아감

`Timed out while enabling automation mode.`를 8/08에 "UI 자동화 승인 관문의 신호"로 귀속했으나 **8/09에 반증**됐다(위 M1 절 참조). 조건 다섯 중 성공은 하나뿐이었고, 그 하나와 산출물·승인이 같은 상태에서도 실패했다.

여섯 번째 관측이 갈랐다 — **기기를 깨워 둔 채 시도하니 39초에 성공**했다. 실패들은 181초를 기다려도 안 됐다. 따라서 이 문구는 관문 하나가 아니라 **여러 원인이 합류하는 지점**이며, 그중 하나가 기기 각성 상태다.

**M6에 넘기는 것**: 이 문구를 관문 판별자로 쓰지 않는다. 세 관문 모두 현재 "구분 불가"(AC-IOS2-019)로 갈 근거가 오히려 강해졌다.

#### 서명 만료 — 대기 없이 재료를 찾음

`acceptance.md` §E는 AC-021을 "7일 대기 필요, 기회 의존"으로 미뤄뒀으나, 만료일이 **구조화된 필드**에서 직접 읽힌다:

```
$ security cms -D -i <app>/embedded.mobileprovision > /tmp/p.plist
$ /usr/libexec/PlistBuddy -c "Print :ExpirationDate" /tmp/p.plist
Tue Aug 11 16:19:34 KST 2026        # 발급 Aug 04 → 정확히 7일
```

`design.md` §I.3의 **2순위**(구조화된 출력의 필드)이며 3순위(자유 문구)의 도구 버전 종속을 피한다. 실패를 분류하는 것이 아니라 만료를 직접 읽으므로 실패 전에 경고할 수 있다.

관측된 것과 아닌 것을 구분해 적는다 — 재빌드 후에도 만료일이 8/11로 **동일**했다. 다만 프로파일이 아직 유효해 갱신할 이유가 없었을 수 있으므로, **"재빌드는 만료를 못 고친다"로 단정하지 않는다.** 관측된 것은 "유효한 프로파일이 있으면 재사용한다"까지다.

부수 관측: `~/Library/MobileDevice/Provisioning Profiles/`는 **비어 있다**(0개). 최신 Xcode가 위치를 옮겼으므로 만료 판정은 그 디렉터리가 아니라 산출물 안의 `embedded.mobileprovision`을 봐야 한다.

### CLI 표면 연결 — `doctor --yes`

`WdaDoctor.bringUpWda(serial, consent)`를 `doctor`의 iOS 갈래에 붙였다. Android의 `installMissingAdb(args.yes)`와 같은 자리·같은 동의 규칙(`design.md` §H)이며, `--yes`가 없으면 부르지 않으므로 이전 동작·이전 비용 그대로다. 결과는 `wdaEnvironment.bringUp`에 실린다.

**준비 자동화가 자기 전제를 요구하던 고리를 끊었다.** 기기가 `unavailable`이면 `resolveTargetDevice`가 실패해 iOS 갈래에 도달하지 못했고(§M1 §2.2에서 보고 누락으로 관측한 것), 그 결과 **기기를 올리는 `--yes` 경로가 기기가 올라와 있어야만 닿을 수 있었다.** 이름이 지목된 기기가 목록에 있고 iOS면 연결 상태와 무관하게 진입하도록 고쳤다. **AC-IOS2-018의 도달 가능성도 함께 열렸다** — M6이 관문 감지를 구현하면 준비 미완 상태에서도 결과를 실을 그릇이 생긴다.

#### 실기기 종단 확인 (2026-08-09)

```
$ doctor --device <iPad> --yes            # 산출물 있음
bringUp: {"attempted":true,"built":false,"launched":true,"ok":true}
wda:     {"reachable":true,"controllable":"ok","build":"WDA 16.1.1 / iOS 26.5.2 / ipad"}

$ reset --device <iPad>
{"noOp":false,"message":"CLI가 띄운 러너를 정리했습니다 (포트 8100)."}   # 8100 → 000

$ env -u <설정 3종> doctor --device <iPad> --yes    # 산출물 치운 상태
bringUp: {"attempted":true,"built":false,"ok":false,"code":"WDA_BUILD_CONFIG_MISSING", ...}

$ <설정 3종 선언> doctor --device <iPad> --yes      # 산출물 치운 상태
bringUp: {"attempted":true,"built":true,"launched":true,"ok":true}
```

#### AC 판정 갱신

| AC | 이전 | 지금 | 근거 |
|---|---|---|---|
| AC-IOS2-028 | 부분 PASS | **PASS (실기기·CLI)** | 세운 상태 → CLI가 읽어 `built:true` / 지운 상태 → CLI가 `WDA_BUILD_CONFIG_MISSING`. **실행 주체가 CLI 프로세스**이므로 `dist` 직접 호출 우회가 사라졌다 |
| AC-IOS2-002 | PASS (unit) | PASS (unit + **CLI**) | CLI 경로에서도 코드가 `WDA_UNREACHABLE`이 아님을 확인 |
| AC-IOS2-005 | PASS (실기기) | PASS (실기기 **via CLI**) | `doctor --yes`가 빌드까지 수행 |
| AC-IOS2-026 | PASS (실기기) | PASS (실기기, 2회) | `reset` CLI 명령으로 재확인 |

#### 남은 것

- AC-011 보조 증거 · AC-012 — 여전히 미관측 (`acceptance.md` §E)
- M5 · M6 · M7 미착수

---

## §F Phase 4 Mode Selection

**Decision: sub-agent**

| 입력 | 값 |
|---|---|
| tier | L |
| scope (파일 수) | M2 범위 7파일 — 임계 10 미만 |
| domain 수 | 2 (backend TypeScript · SPEC 문서) — 임계 3 미만 |
| 파일 언어 구성 | TypeScript 중심 + markdown |
| 병렬 이득 | **낮음** — 코딩 중심 작업 |

| 모드 | 선택 | 사유 |
|---|---|---|
| trivial | 미선택 | 의미 변경이 있는 다파일 작업 |
| background | 미선택 | 읽기 전용이 아니다 |
| agent-team | 미선택 | 은퇴한 모드 |
| parallel | 미선택 | 코딩 중심 — 병렬 이득이 낮다 |
| **sub-agent** | **선택** | 기본 대체값. 도메인 2 · 파일 7로 두 임계 모두 미달 |
| workflow | 미선택 | 기계적 대량 변환(약 30파일)이 아니다 |

**정당화**: M2는 판정 로직 교체와 새 설정 읽기 경로로, 파일 간 의존이 있는 코딩 작업이다. 도메인 수(2)와 파일 수(7) 모두 병렬 전환 임계에 미달하며, 코딩 작업은 조사 작업보다 실제로 병렬화 가능한 조각이 적다. 순차 진행이 맞다.

**경계 사례 없음** — 두 임계 모두 여유 있게 미달.

---

## §G 참고 — 이 SPEC의 출처

SPEC-READY-001 `spec.md` §D.2가 명시적으로 미뤄둔 항목:

> **WDA·iproxy 자동 기동** — iOS를 쓸 수 있게 *만드는* 것은 이 SPEC의 일이 아니다. **왜 못 쓰는지 정확히 말하는 것**까지가 범위다.

이 SPEC은 그 미뤄둔 항목을 집는다. 즉 새 발상이 아니라 **예고된 후속**이다.
