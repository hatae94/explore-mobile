---
id: SPEC-INSTALL-001
title: "APK 설치·업데이트 명령 — aapt 기반 패키지 식별과 실패 원인 구분"
version: "0.2.0"
status: completed
created: 2026-08-29
updated: 2026-08-29
author: hatae
priority: P1
phase: "테스트 러너 선행 작업"
module: "src/cli/, src/backend/"
lifecycle: spec-anchored
tags: "install, apk, aapt, package-name, upgrade, signature, downgrade, adb"
tier: M
depends_on: [SPEC-ANDROID-001, SPEC-READY-001]
---

# SPEC-INSTALL-001 — APK 설치·업데이트 명령

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-08-29 | hatae | 최초 작성. 상위 목표(제출받은 앱을 로컬 안드로이드 기기에서 테스트하는 서비스)의 선행 작업으로 분리했다. 사용자 결정 3건이 범위를 확정했다 — ① 앱은 실행 후 **삭제하지 않고 유지**하며 **업데이트 설치를 지원**한다 ② 패키지 이름은 **APK에서 직접 읽는다**(aapt) ③ 테스트 대상은 **테스트 전용 안드로이드 기기**. 2026-08-29 실측 2건이 근거다(§A.2). 러너·웹은 이 SPEC의 범위 밖이다(§B.2). |

---

## §A. 개요 (Context & Goal)

### A.1 배경 — 앱을 기기에 올리는 경로가 없다

이 CLI가 지원하는 명령은 13개다. CLI 자신이 알 수 없는 명령에 대해 그 목록을 그대로 밝힌다(2026-08-29 실측):

```
$ node dist/cli/bin.js --help
{"ok":false,"command":"--help","error":{"code":"UNKNOWN_COMMAND",
 "message":"Unknown command '--help'. Supported: devices, launch, stop,
 screenshot, tap, doubletap, key, swipe, scroll, pinch, text, doctor, reset."}}
```

13개 중 **앱을 기기에 설치하는 명령은 없다.** `src/cli/commands/` 디렉터리에도 `install.ts`는 존재하지 않으며, 소스 전체에서 `install`이라는 낱말이 쓰인 곳은 `doctor`의 `--yes`/`--install` 동의 플래그(adb 자체를 Homebrew로 설치)와 `checkAdbInstalled()` 뿐이다 — 어느 것도 **앱** 설치와 무관하다.

한편 이 CLI의 스킬 문서는 우회를 금지한다(`.claude/skills/explore-mobile/SKILL.md:347`):

> **Never invoke `adb`, `xcrun`, or WebDriverAgent directly.** Everything goes through the CLI. If a task seems to need a raw device command this skill does not cover, **that is a gap in the CLI** — not a reason to shell out.

즉 "설치가 필요하면 adb를 직접 부른다"는 선택지는 설계상 닫혀 있다. 이 SPEC은 그 구멍을 CLI 안에서 메운다.

### A.2 실측 근거 (2026-08-29)

**실측 ①  aapt는 설치되어 있으나 `PATH`에 없고, 버전이 셋이다.**

```
$ which aapt aapt2
aapt not found
aapt2 not found

$ ls ~/Library/Android/sdk/build-tools/
35.0.0  36.0.0  36.1.0
```

`~/Library/Android/sdk/build-tools/{35.0.0,36.0.0,36.1.0}/` 각각에 `aapt`와 `aapt2`가 존재한다. 이는 `adb`가 이미 겪는 상황과 **같은 형태**다 — `SPEC-READY-001` REQ-READY-001이 `PATH` → `$ANDROID_HOME` → `$ANDROID_SDK_ROOT` → macOS 기본 위치 순의 폴백을 도입한 이유가 그것이다(`src/backend/adb-executor.ts:14-23`). 다만 `platform-tools`는 버전 디렉터리가 없고 `build-tools`는 있으므로, **버전 선택이라는 새 하위 문제가 추가된다**(§C.1).

**실측 ②  `aapt2`가 패키지 이름을 단일 행으로 반환한다.**

실제 APK(`build-1782196453010.apk`)를 대상으로:

```
$ ~/Library/Android/sdk/build-tools/36.1.0/aapt2 dump packagename <apk>
com.hatae.moyura

$ ~/Library/Android/sdk/build-tools/36.1.0/aapt dump badging <apk>   # 첫 줄
package: name='com.hatae.moyura' versionCode='1' versionName='1.0.0'
  platformBuildVersionName='16' platformBuildVersionCode='36'
  compileSdkVersion='36' compileSdkVersionCodename='16'
sdkVersion:'24'
```

`aapt2 dump packagename`은 패키지 이름만 한 줄로 낸다. `aapt dump badging`은 `versionCode`를 함께 준다 — 이 값이 업데이트 설치의 성패를 좌우한다(§C.3).

### A.3 목표

APK 파일 경로 하나를 받아, **패키지 이름을 스스로 알아내고**, 기기에 **설치하거나 이미 설치된 앱 위에 덮어쓰며**, 그 결과의 성패와 **실패 원인을 구분 가능한 형태로** 보고하는 단일 명령을 CLI에 추가한다.

---

## §B. 범위 (Scope)

### B.1 범위 안

- `install <apk-path>` 명령 (신규)
- APK에서 패키지 이름·`versionCode` 추출
- `aapt` 바이너리 경로 해결 + build-tools 버전 선택
- 설치 실패 원인의 코드 분류
- `doctor`의 aapt 진단 항목
- `SKILL.md` 갱신

### B.2 범위 밖 (명시적 제외)

| 제외 대상 | 사유 |
|---|---|
| 테스트 러너 | explore-mobile **밖의 별도 프로젝트**로 결정됨. 이 저장소가 소유하지 않는다 |
| 웹사이트·대기열·인증 | 상위 서비스의 공개 인터넷 단계. 별도 SPEC |
| `uninstall` 명령 | 사용자 결정 — 앱을 **유지**한다. 지울 필요가 없으므로 만들지 않는다 |
| iOS 앱 설치 | 이 SPEC은 Android 단독. iOS는 서명·프로비저닝이 전혀 다른 문제다 |
| APK 서명·리패키징 | 제출된 APK를 있는 그대로 설치한다 |

`uninstall`을 만들지 않는 결정은 되돌릴 수 있다. 다만 **지금 필요하지 않으므로 만들지 않는다** — 쓰이지 않는 기기 파괴 명령을 미리 두지 않는다.

---

## §C. 설계 판단 (Design Decisions)

### C.1 aapt 경로 해결 — adb 패턴 재사용 + 버전 선택

`resolveAdbPath()`가 이미 확립한 4단계 탐색(`PATH` → `$ANDROID_HOME/platform-tools/adb` → `$ANDROID_SDK_ROOT/platform-tools/adb` → `~/Library/Android/sdk/platform-tools/adb`, 존재+실행가능 판정, 프로세스 단위 메모이제이션, 주입 가능한 predicate)을 **구조적으로 그대로 따른다**(`src/backend/adb-executor.ts:91-113`). 새 탐색 방식을 발명하지 않는다.

다만 `build-tools`는 버전 디렉터리를 가지므로 한 단계가 더 필요하다:

> **버전 선택 규칙**: 존재하는 build-tools 디렉터리 중 **버전이 가장 높은 것**을 고른다. 비교는 문자열이 아니라 숫자 성분별로 한다(`36.1.0` > `36.0.0` > `35.0.0`; 문자열 비교는 `9.0.0` > `36.1.0`이라는 오답을 낸다).

`aapt2`를 우선하고 `aapt`를 폴백으로 둔다 — 실측 ②에서 `aapt2 dump packagename`이 파싱할 것 없는 단일 행을 내므로 오독 여지가 가장 적다.

### C.2 설치 성공을 `launch` 실패로 판단할 수 없다 — install이 스스로 보고해야 한다

`launch`의 실제 동작은 두 단계다(`src/backend/adb-backend.ts:754-780`): 기기에게 런처 컴포넌트를 조회한 뒤(`cmd package resolve-activity`) 그 컴포넌트로 시작한다(`am start -n`). 그런데 이 조회에는 두 함정이 기록되어 있다.

**함정 ① 실패해도 종료 코드가 0이다** (`src/backend/launcher-resolve-parser.ts:6-9`):

> 이 파서는 의도적으로 stdout만 본다. 종료 코드는 절대 보지 않는다. 실기기 측정 결과 **실패한 조회도 0으로 끝났다** — 종료 코드만 보는 호출자는 실패를 성공으로 오독한다.

**함정 ② 두 원인이 구분되지 않는다** (`src/backend/launcher-resolve-parser.ts:17-21`):

> `No activity found`는 **패키지에 런처 액티비티가 없을 때와, 패키지가 아예 설치되지 않았을 때 똑같이** 나온다 — 이 출력만으로 두 원인은 구분 불가능하다.

따라서 "설치 후 `launch`가 되면 설치 성공"이라는 판정은 **성립하지 않는다.** 런처 액티비티가 없는 정상 앱(서비스·위젯 전용)도 같은 실패로 보이기 때문이다.

> **결론**: `install`은 자신의 성패를 **스스로** 판정하고 보고해야 한다. 후속 명령의 성패로 대신하지 않는다.

이 원칙은 `launch`가 이미 지키는 규범(조회에 실패하면 **시작 인텐트를 아예 보내지 않는다**, `launch.ts:29-34`)과 같은 계열이다 — 불확실하면 손대지 않고, 원인을 단정하지 않는다.

### C.3 업데이트 설치가 1급 경로다

사용자 결정: 테스트 후 앱을 **삭제하지 않고 유지**하며, 같은 앱의 새 버전을 **덮어쓴다**. 제출자가 고쳐서 다시 올리는 흐름(v1 테스트 → 수정 → v2 테스트)이 정상 사용이다.

덮어쓰기는 최초 설치에 없는 실패 양식을 새로 만든다:

| 상황 | 왜 실패하는가 |
|---|---|
| **서명 불일치** | 안드로이드는 다른 서명 키로 만든 APK가 기존 앱을 덮어쓰는 것을 거부한다. 제출자가 키를 바꿔 재빌드하면 반드시 발생한다 |
| **버전 되돌리기** | `versionCode`가 설치된 것보다 낮으면 거부된다. 실측 ②에서 이 값을 **설치 전에** 읽을 수 있음을 확인했다 |
| **저장 공간 부족** | 기존 앱을 남긴 채 새 APK를 올리므로 최초 설치보다 여유가 덜하다 |

이 셋은 서로 다른 대응을 요구하므로(키를 맞춰 재빌드 / 버전 올려 재빌드 / 기기 정리) **하나의 일반 실패로 뭉치면 제출자가 무엇을 고쳐야 할지 알 수 없다.**

### C.4 실패 문구에서 정책을 역추론하지 않는다

`adb install`의 실패 출력 문구(`INSTALL_FAILED_*` 계열)는 **이 SPEC 작성 시점에 실측되지 않았다.** 표준적으로 알려진 문자열이 있으나, §C.2의 함정 ①이 보여주듯 **이 도구 계열에서 종료 코드와 출력의 관계는 직관과 다를 수 있다.**

> **원칙**: 실패 분류의 판정 근거(종료 코드를 보는가, stdout을 보는가, stderr를 보는가, 어떤 문자열인가)는 **M5 실기기 실측으로 확정한다.** 그 전까지 구현은 잠정이며, 실측 결과가 문서와 다르면 **실측이 이긴다.**

이는 `launcher-resolve-parser.ts`가 밟은 것과 같은 경로다 — 그 파서도 "실기기 측정 결과"를 근거로 종료 코드를 버리고 stdout만 보도록 정해졌다.

### C.5 설치 성공의 양성 대조 (positive control)

설치 성공 판정에 기기 조회를 곁들일 경우, "조회 결과가 비었다 = 앱이 없다"로 읽어서는 안 된다 — **빈 출력은 부재의 증거가 아니다.** 조회 명령 자체가 실패했거나 대상 표기가 틀렸을 때도 똑같이 비기 때문이다.

> **원칙**: 부재를 주장하는 판정에는 **반드시 같은 회차에 존재가 확인되는 대조군**을 함께 조회한다. 대조군이 비면 그 회차의 판정은 성공도 실패도 아닌 **무효**로 기록한다.

---

## §D. 요구사항 (Requirements)

### REQ-INSTALL-001 — `install` 명령

`install <apk-path>` 명령이 존재하며, 기존 13개 명령과 **동일한 JSON 입출력 계약**(`{ok, command, data}` / `{ok, command, error:{code,message,details}}`)을 따른다. `--device <serial>` 대상 지정 규칙도 동일하다.

성공 응답은 최소한 다음을 싣는다: `serial`, `package`(APK에서 읽은 이름), `versionCode`, `versionName`, `mode`(`"fresh"` | `"upgrade"`).

### REQ-INSTALL-002 — APK 메타데이터 추출

APK 경로로부터 패키지 이름·`versionCode`·`versionName`을 추출한다. 추출은 **파일에서** 이루어지며 기기 상태에 의존하지 않는다. 추출에 실패하면 **기기에 아무 명령도 보내지 않고** 실패를 반환한다.

### REQ-INSTALL-003 — aapt 경로 해결

`aapt2`(우선) 또는 `aapt`(폴백) 바이너리를 §C.1 규칙으로 해결한다. 어느 후보도 없으면 전용 코드로 실패하며, 메시지는 **찾아본 위치를 밝힌다**. `doctor`가 같은 해결 결과를 보고한다 — 실행 경로와 진단 경로가 서로 다른 바이너리를 가리키는 상태를 만들지 않는다.

### REQ-INSTALL-004 — 설치 및 덮어쓰기

기기에 앱을 설치한다. 같은 패키지가 이미 설치되어 있으면 **데이터를 유지한 채 덮어쓴다**. 응답의 `mode`가 둘 중 무엇이었는지 밝힌다.

### REQ-INSTALL-005 — 실패 원인 구분

실패를 다음 코드로 구분한다. 원인을 단정할 수 없는 경우에만 일반 코드를 쓰며, 그 메시지는 §C.2의 `launch`처럼 **가능한 원인을 함께 제시하고 하나로 단정하지 않는다**.

| 코드 | 의미 |
|---|---|
| `APK_NOT_FOUND` | 경로에 읽을 수 있는 파일이 없다 |
| `APK_INVALID` | 파일은 있으나 APK로 해석되지 않는다 |
| `AAPT_NOT_FOUND` | aapt2/aapt 후보를 하나도 찾지 못했다 |
| `INSTALL_SIGNATURE_MISMATCH` | 기존 설치본과 서명 키가 다르다 |
| `INSTALL_VERSION_DOWNGRADE` | `versionCode`가 설치된 것보다 낮다 |
| `INSTALL_INSUFFICIENT_STORAGE` | 기기 저장 공간이 부족하다. **판정 수단 없음 — acceptance.md AC-INSTALL-036 참조.** 실측에서 해당 문구가 관측되기 전까지 발행되지 않으며, 그때까지 `INSTALL_FAILED`로 분류된다 |
| `INSTALL_FAILED` | 위로 분류되지 않은 설치 실패. 원인 문구를 **보존**한다 |

기존 기기 대상 코드(`NO_DEVICE`, `AMBIGUOUS_DEVICE`, `DEVICE_NOT_FOUND`, `DEVICE_NOT_CONNECTED`, `INVALID_ARGS`)는 다른 명령과 동일하게 적용된다.

### REQ-INSTALL-006 — 문서 동기화

`SKILL.md`의 명령 표·에러 코드 표에 이 명령과 신규 코드를 반영한다. 스킬이 밝히는 실행 형식(`node dist/cli/bin.js …`, `SKILL.md:104`)이 러너 환경에서도 유효하도록 기술한다.

---

## §E. 미검증 항목 (Open / Unverified)

이 SPEC이 **아직 관측하지 않은** 것들. 구현 중 실측으로 닫는다.

| # | 항목 | 결과 (2026-08-29 실측) |
|---|---|---|
| 1 | 덮어쓰기 설치가 실제로 데이터를 유지하며 성공하는가 | **부분 확인** — upgrade 경로 성공(AC-019). 앱-상태 왕복은 미검증(progress.md AC-020, 대상 앱 UI 미상). 러너 단계로 이월 |
| 2 | 설치 실패 시 종료 코드·stdout·stderr 중 무엇이 신뢰 가능한가 (§C.4) | **확정** — 실패는 exit=1이나, 분류는 stdout+stderr의 `Failure` 토큰으로 판정(exit 비의존). AC-022 실측에서 앞선 잡음 뒤 토큰을 정확히 집음 |
| 3 | 서명 불일치·다운그레이드·공간부족의 실제 출력 문구 | **확정(2/3)** — 서명: `INSTALL_FAILED_UPDATE_INCOMPATIBLE ... signatures do not match`, 다운그레이드: `INSTALL_FAILED_VERSION_DOWNGRADE`. 공간부족은 미관측(AC-036 미판정 유지) |
| 4 | 설치 성공 확인 조회의 양성 대조를 어떻게 세울 것인가 (§C.5) | **확정** — 같은 회차에 `com.android.settings`(확실히 존재)를 대조군으로 조회, 비지 않음 확인 |
| 5 | build-tools 버전이 하나도 없는 환경의 동작 | **확정** — M1/M4 단위 테스트로 `AAPT_NOT_FOUND` 판정(AC-015) |

**기기 제약 (2026-08-29 실측)**: 현재 연결된 Android 기기 `R3CM50FXC3L`은 `connectionState: "unauthorized"`다 — adb가 기기를 보고 있으나 호스트 RSA 키가 기기에서 수락되지 않았다. **M5 실기기 검증은 이 상태가 해소되기 전에는 실행할 수 없다.** 해소는 기기 화면에서 사람이 수행해야 한다.
