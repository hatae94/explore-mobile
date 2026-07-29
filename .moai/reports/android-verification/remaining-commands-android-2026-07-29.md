# Android 실기기 검증 — 나머지 명령 (2026-07-29)

README "Still pending before this is production-ready" #1·#2 + AC-WEB-019 실측 승격.

- **기기**: Galaxy S25 Ultra (SM-S938N, Android 16, 1440×3120, 무선 ADB `adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`)
- **빌드**: `pnpm build` exit 0, 653 tests green, origin/master `a843b70`
- **CLI 호출**: `node dist/cli/bin.js <cmd> --device <serial>` (PATH에 `~/Library/Android/sdk/platform-tools` 필요)
- **기준선 / 종료 상태**: 기본 IME `com.samsung.android.honeyboard/.service.HoneyBoardService`, ADBKeyBoard 미설치, `ime-sessions.json` = `{}`, 포그라운드 = 런처 — **검증 종료 후 4개 항목 모두 기준선과 일치함을 확인**

---

## 1. PASS — 실기기에서 확인된 것

| 항목 | 판정 | 근거 (관측한 것) |
|------|------|------------------|
| AC-WEB-019 | **PASS** | `tap --web` · `dump --web` 둘 다 `UNSUPPORTED_ON_PLATFORM`, `details`에 serial·platform. 기기로 전송 없음 |
| `screenshot` | **PASS** | `file` 판정 `PNG image data, 1440 x 3120, 8-bit/color RGBA`, 시그니처 `8950 4e47 0d0a 1a0a`, 6,648,582 bytes |
| `dump` | **PASS** | 루트 bounds 정확히 `{0,0,1440,3120}` (witness 규칙 충족). 계산기 화면에서 키패드 32요소를 라벨·bounds와 함께 반환 |
| `tap` | **PASS** | 계산기 `7`(중심 225,1928) 탭 → 입력란 `계산기 입력란 0` → `계산기 입력란 7` |
| `text` (ASCII) | **PASS** | `"89"` → 입력란 `7` → `789`. **기본 IME 불변**(HoneyBoard) — REQ-INPUT-002 빠른 경로가 IME를 건드리지 않음을 확인 |
| `key` | **PASS** | `del` → `789` → `78`. 미지원 별칭 `frobnicate` → `UNSUPPORTED_KEY` + 지원 목록 14개, 기기 전송 없음 |
| `stop` | **PASS** | `mCurrentFocus` 계산기 → 설정, `pidof` 무출력(프로세스 종료) |
| `doctor` | **PASS** | 아래 §2 |
| `reset` | **PASS** | 아래 §3 |
| `text` (한글, warm) | **PASS** | `배터리`·`알림`·`알림알림`·`카메라` 4회 적중, 검색 결과 수로 확증 |

### 미검증 — 의도적 제외

- **`power` · `volume_up` · `volume_down`**: 사용자 화면을 끄거나 볼륨을 바꾸는 부작용이 검증 가치보다 크다고 판단해 실행하지 않았다. 세 별칭은 여전히 mock 검증뿐이다.
- **멀티기기 격리**: 물리 기기 2대가 필요하다. 이번 세션은 Android 1대 + iOS 시뮬레이터/iPad라 대상 조건을 만들지 못했다.

---

## 2. README pending #2 — ADBKeyBoard 런타임 다운로드 end-to-end **PASS**

캐시(`~/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk`, 7월 22일자)를 **옆으로 치워** 진짜 다운로드가 일어나게 한 뒤 `doctor` 실행.

```json
"adbKeyboard": {
  "skipped": false, "alreadyInstalled": false, "installed": true, "enabled": true,
  "apkSource": { "cached": false,
    "url": "https://github.com/senzhk/ADBKeyBoard/raw/v2.4-dev/ADBKeyboard.apk" }
}
```

기기 쪽 확인: `pm list packages` → `package:com.android.adbkeyboard`, `ime list -s` → `com.android.adbkeyboard/.AdbIME`.

세 가지가 함께 확인됐다:

1. `cached:false` — 캐시가 아니라 실제 네트워크 취득
2. URL이 **고정 태그**(`v2.4-dev`)이지 `master`가 아님 — README 주장과 일치
3. 재다운로드본이 7월 22일 캐시본과 **SHA-256 동일**(`e698adea…dc59`) — 고정 태그 취득이 재현 가능

또한 `doctor`는 `ime enable`만 하고 **기본 IME를 바꾸지 않는다**(실행 후에도 HoneyBoard 유지) — 설계대로다.

---

## 3. `reset` **PASS** — 복원까지 검증

2회 실행, 매번 응답과 기기 상태가 일치했다.

```json
{"imeReset":true,"adbKeyboardDisabled":true,"adbKeyboardUninstalled":true,
 "warnings":[],"originalImeRestored":true}
```

| 항목 | reset 전 | reset 후 | 기준선 |
|------|----------|----------|--------|
| 기본 IME | `com.android.adbkeyboard/.AdbIME` | `com.samsung.android.honeyboard/.service.HoneyBoardService` | 동일 ✓ |
| ADBKeyBoard 패키지 | 1건 | 0건 | 동일 ✓ |
| `ime-sessions.json` | `{"<serial>":{"originalIme":"…honeyboard…"}}` | `{}` | 동일 ✓ |

세션 기록이 원래 IME를 **정확히** 담았다가 복원 후 비워지는 왕복이 확인됐다.

---

## 4. 결함 1 — `launch`가 암시적 인텐트를 써서 앱 상당수를 못 연다

**위치**: `src/backend/adb-backend.ts:460` `launchApp`

**보내는 것**: `am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p <패키지>`

`-p`는 **암시적** 인텐트 해석이라 대상 액티비티가 `android.intent.category.DEFAULT`를 선언해야만 매칭된다. 실제 런처는 명시적 컴포넌트로 띄우므로 이 제약을 받지 않는다.

| 패키지 | `resolve-activity` (LAUNCHER) | DEFAULT 선언 | `-p` 방식 | 명시적 `-n` |
|--------|-------------------------------|--------------|-----------|-------------|
| `com.android.settings` | `/.Settings` | `isDefault=true` | **성공** | — |
| `com.sec.android.app.popupcalculator` | `/.Calculator` | 미선언 (`No activity found`) | **실패** | **성공** |
| `com.sec.android.app.clockpackage` | `/.ClockPackage` | 미선언 | **실패** | — |

실패 시 반환:

```json
{"ok":false,"command":"launch","error":{"code":"BACKEND_COMMAND_FAILED",
 "message":"adb shell am start failed (exit 1): Error: Activity not started, unable to resolve Intent { … pkg=com.sec.android.app.popupcalculator }"}}
```

세 앱 모두 user 0에 설치돼 있고 런처 액티비티가 정상 조회되며 손으로 누르면 열린다. 즉 **앱이 없어서가 아니라 실행 방식이 틀려서** 실패한다. 삼성 기본앱 상당수가 여기 걸린다.

**제안**: `cmd package resolve-activity --brief -a MAIN -c LAUNCHER <pkg>`로 컴포넌트를 구한 뒤 `am start -n <pkg>/<activity>`.

> 초판은 이 줄에 `--user 0`을 달았는데, 바로 위 §[A] 측정이 "`--user` 불필요"였으므로 **같은 절 안에서 제안이 측정과 어긋났다**. 측정을 따라 정정한다. 기기의 현재 유저가 0이 아닌 경우까지 `--user 0`을 박으면 오히려 틀린다.

**mock이 못 잡은 이유**: 단위 테스트는 argv 모양(`am start -a … -p …`)만 검사한다. 그 argv가 실제 기기에서 해석되는지는 mock의 사정거리 밖이다.

---

## 5. 결함 2 — 같은 호출에서 ADBKeyBoard를 설치하면 한글 입력이 조용히 사라진다

**증상**: 비ASCII `text`가 `{"ok":true}`를 반환하는데 **입력란에 아무것도 들어가지 않는다.**

**분리 실험** (모두 검색창 포커스 확보 상태, 판정은 스크린샷):

| # | 사전 조건 | 같은 호출에서 일어난 일 | 결과 |
|---|-----------|------------------------|------|
| 1 | `doctor`가 직전에 ADBKeyBoard 설치 | (설치 없음) 전환 + 전송 | **실패** — 플레이스홀더 그대로 |
| 2 | 설치됨, IME=HoneyBoard | IME 전환 + 전송 | **성공** — `알림`, 결과 99건 |
| 3 | 설치됨, IME=AdbIME | 전송만 | **성공** — `알림알림`, 결과 1건 |
| 4 | **미설치**(reset 직후) | **설치** + 전환 + 전송 | **실패** — 플레이스홀더 그대로 |
| 5 | 설치됨, IME=AdbIME | 전송만 | **성공** — `카메라`, 결과 13건 |

가르는 변수는 **같은 호출 안에서의 설치**다. IME *전환*은 원인이 아니다 — #2가 전환을 포함하고도 성공했다.

**기록해 둘 정정**: 처음 세운 가설은 "IME 전환이 입력 연결을 끊는다"였고 **틀렸다**(#2가 반증). 또 `dumpsys input_method`의 `mServedView`를 오라클로 쓰려 했으나 성공한 경우에도 `null`로 나와 **유효한 판정 근거가 아니었다**. 실제 오라클은 스크린샷뿐이었다.

**추가 관측**: 실패(#1·#4) 직후 포그라운드가 SearchActivity에서 설정 최상위로 되돌아가 있었다. 설치/IME 등록이 포그라운드 액티비티를 흔드는 것으로 보인다.

**추정 원인(미검증)**: `adb install` 직후 Android가 새 IME 서비스를 등록하기까지 시간이 필요한데, 현재 구현은 설치→`ime set`→브로드캐스트를 대기 없이 연달아 보낸다. 이는 **가설이며 실측으로 확정하지 않았다** — 확정하려면 설치와 전송 사이 대기를 넣어 실패가 사라지는지 봐야 한다.

**영향 경로 둘 다 해당**: `doctor`로 설치한 직후의 첫 입력, 그리고 `text`가 스스로 설치하는 self-heal 경로(`adb-backend.ts:348`). `reset`이 ADBKeyBoard를 제거하므로 **reset 후 첫 한글 입력은 반드시 이 경로를 탄다** — 드문 조건이 아니다.

**결함 부류**: `ok:true`인데 관측 가능한 효과가 없음 — SPEC-GESTURE-001이 여섯 라운드에 걸쳐 싸운 것과 동일한 부류.

---

## 6. 환경 메모 — 삼성 Secure Folder

이 기기는 Secure Folder(유저 150)가 실행 중이라 `pm list packages`가 stderr에 `SecurityException: Shell does not have permission to access user 150`을 출력한다. 그러나 **종료코드는 0이고 stdout은 user 0의 686개 패키지를 정상 반환**한다.

`ensureAdbKeyboardInstalled`(`adbkeyboard-installer.ts:47-60`)은 `exitCode`와 `stdout`만 보므로 영향받지 않는다. stderr 비어있음으로 판정하는 구현이었다면 여기서 오탐이 났을 자리다 — 현재 구현이 옳다는 실기기 확증.

---

## 7. README 갱신 대상

- pending #1(나머지 Android 명령 실기기 검증): `tap`/`text`/`key`/`stop`/`doctor`/`reset` **완료**. `launch`는 결함 발견으로 미완. `power`/`volume_*` 및 멀티기기 격리는 의도적 미검증.
- pending #2(ADBKeyBoard 런타임 다운로드 end-to-end): **완료**.
- pending #3(npm 배포): 변동 없음.
