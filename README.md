# explore-mobile

모바일 기기를 **JSON 명령 하나로** 조작하는 에이전트 친화 CLI.
Android는 `adb`, iOS는 실기기 경로를 통해 동작하며, AI 에이전트나 자동화
스크립트가 에뮬레이터·시뮬레이터·실기기를 같은 명령 표면으로 제어한다.
최종 목표는 모바일 테스트 자동화, 특히 여러 기기가 서로 주고받는 상호작용
테스트다.

> **현재 상태**: Android와 iOS 모두 실기기에서 검증됐다. `SPEC-VISION-001`이
> iOS 경로를 **idb → WebDriverAgent(WDA)로 교체 완료**했고 idb 잔재는 전부
> 제거됐다. 남아 있는 제약은 [알려진 제약](#알려진-제약)에 적어 뒀다.
> 실측 근거는 [현재 상태](#현재-상태)를 참고.

---

## 왜 이 도구인가

- **스크립트가 아니라 프롬프트가 기기를 몰 수 있어야 한다.** 모든 명령이
  JSON을 받고 JSON을 뱉는다. 자유 텍스트를 긁어 파싱할 일이 없다.
- **호출하는 쪽에 설치 단계가 없다.** `npx`로 바로 실행한다.
- **Android와 iOS가 같은 명령 표면을 쓴다.** `DeviceBackend` 인터페이스와
  `BackendRegistry`가 `--device <serial>`을 소유 플랫폼으로 자동 라우팅하므로
  플랫폼별 플래그가 없다.
- **한글·이모지 입력이 자동으로 처리된다.** Android 입력 자동화에서 가장
  까다로운 부분인데, 호출자가 경로를 고를 필요가 없다.
- **화면을 읽는 수단은 스크린샷 하나다.** UI 계층 덤프와 네이티브 셀렉터
  경로는 제거됐다 — 이유는 [읽기 경로](#읽기-경로는-스크린샷-하나다) 참고.

## 요구사항

- **Node.js >= 22** — iOS 웹 경로가 Node 내장 `WebSocket`(22.4+)을 쓴다.
  이것 때문에 의존성을 추가하지 않으려고 버전을 올렸다.
- **adb** (Android SDK Platform Tools)가 `PATH`에 있어야 한다. 직접 설치하거나
  [`doctor`](#doctor)에게 맡기면 된다.

  > **주의**: CLI는 바이너리 이름을 `"adb"`로 고정해 `PATH`에서 찾는다.
  > macOS에서 Android Studio로 설치하면 보통
  > `~/Library/Android/sdk/platform-tools/adb`에 있고 **`PATH`에는 없다.**
  > 이 상태에서는 Android 기기가 하나도 보이지 않는다. `doctor`가
  > `adb: {installed: false}`와 복구 안내를 정확히 반환하므로 조용히 실패하지는
  > 않지만, 세션 시작 시 확인하는 편이 빠르다.

- **ios-webkit-debug-proxy** — iOS [`--web` 경로](#ios-웹-콘텐츠---web)에만
  필요하다. `brew install ios-webkit-debug-proxy`로 설치하며, `doctor`가
  설치 여부를 보고한다. 나머지 기능은 이것 없이 동작한다.

## 설치와 실행

npm 레지스트리에 게시된 뒤에는 전역 설치 없이 `npx`로 실행한다.

```bash
npx explore-mobile <명령> [인자...] [--device <serial>]
```

로컬 개발 중(첫 npm 게시 전)에는 체크아웃에서 빌드해 실행한다.

```bash
pnpm install
pnpm build
node dist/cli/bin.js <명령> [인자...] [--device <serial>]
```

## 출력 계약

모든 호출은 **stdout에 정확히 JSON 문서 하나**를 출력하고, 그에 맞는 종료
코드를 설정한다(`0` 성공, `1` 오류). 자유 텍스트는 절대 파싱하지 말 것 —
JSON 본문이 유일한 계약이다.

```json
// 성공
{ "ok": true, "command": "<이름>", "data": { } }

// 오류 — 자유 텍스트가 아니라 항상 구조화된 형태
{ "ok": false, "command": "<이름>", "error": { "code": "...", "message": "...", "details": { } } }
```

주요 오류 코드:

| 코드 | 의미 |
|---|---|
| `AMBIGUOUS_DEVICE` | 연결된 기기가 2대 이상인데 `--device`를 생략했다 |
| `DEVICE_NOT_FOUND` | 그 시리얼이 목록에 아예 없다 |
| `DEVICE_NOT_CONNECTED` | 목록에는 있으나 연결 상태가 아니다 |
| `SCREEN_SIZE_UNKNOWN` | 화면 크기를 알 수 없다. **추측하지 않고 거부한다** |
| `INVALID_ARGS` | 알 수 없는 옵션이거나 인자 형식이 틀렸다 |
| `INVALID_COORDINATES` | 좌표가 화면 범위를 벗어났거나 형식이 틀렸다 |
| `AMOUNT_TOO_SMALL` | 스와이프 거리가 터치 슬롭 이하다(탭으로 새는 것을 막는다) |
| `LAUNCHER_ACTIVITY_NOT_FOUND` | 실행할 액티비티를 찾지 못했다. 인텐트를 보내지 않는다 |
| `IME_RESTORE_FAILED` | 원래 키보드 복원에 실패했다. `details.originalImeId` 포함 |
| `APK_DOWNLOAD_FAILED` | ADBKeyBoard 내려받기 실패. 기기는 호출 전 상태로 남는다 |

## 명령

| 명령 | 하는 일 |
|---|---|
| `devices` | 연결된 기기 목록 |
| `launch <package>` | 패키지 이름으로 앱 실행 |
| `stop <package>` | 패키지 이름으로 앱 강제 종료 |
| `screenshot [--out <path>]` | PNG 캡처 |
| `tap <x> <y>` | 기기 픽셀 좌표를 탭 |
| `key <alias>` | 키 이벤트 전송 |
| `text "<문자열>"` | 텍스트 입력 (ASCII / 유니코드 자동 분기) |
| `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` | 두 좌표 사이 원시 스와이프 |
| `scroll <up\|down\|left\|right> [--amount <비율>]` | 화면 크기를 몰라도 되는 스크롤 |
| `doctor [--yes\|--install] [--clean]` | 환경 진단 및 부트스트랩 |
| `reset` | `doctor` 이전 상태로 기기 복원 |

`tap`과 `text`는 [`--web`](#ios-웹-콘텐츠---web)을 함께 받아 iOS의 **웹 페이지
콘텐츠**에 닿을 수 있다. 네이티브 접근성 트리가 노출하지 않는 영역이다.

### 사용 예

```bash
$ npx explore-mobile devices
{"ok":true,"command":"devices","data":[{"serial":"R3CY106LKVX","model":"SM_S938N",
 "osVersion":"16","connectionState":"device","isEmulator":false,"platform":"android"}]}

$ npx explore-mobile launch com.android.settings
{"ok":true,"command":"launch","data":{"serial":"R3CY106LKVX","package":"com.android.settings"}}

$ npx explore-mobile screenshot --out ./shot.png
{"ok":true,"command":"screenshot","data":{"serial":"R3CY106LKVX","savedTo":"./shot.png","byteLength":198784}}

$ npx explore-mobile tap 226 2566
{"ok":true,"command":"tap","data":{"serial":"R3CY106LKVX","x":226,"y":2566}}

$ npx explore-mobile scroll down
{"ok":true,"command":"scroll","data":{"serial":"R3CY106LKVX","direction":"down",
 "from":{"x":720,"y":2262},"to":{"x":720,"y":858}}}
```

### `doctor`

환경을 진단하고, 필요하면 부트스트랩한다.

- `--yes` 또는 `--install` — Homebrew로 adb 자동 설치를 허용한다. 동의 없이는
  설치하지 않고 수동 명령만 알려준다.
- `--clean` — `reset`과 같다. 원래 키보드를 복원한다.

```bash
$ npx explore-mobile doctor
{"ok":true,"command":"doctor","data":{
  "adb":{"installed":true,"version":"Android Debug Bridge version 1.0.41"},
  "daemon":{"healthy":true},
  "devices":[...],
  "adbKeyboard":{...}}}
```

## 기기 지정 규칙

기기를 다루는 모든 명령은 `--device <serial>`을 받는다. **연결된** 기기가
정확히 1대일 때만 생략할 수 있고, 그때는 자동 선택된다.

연결된 기기가 2대 이상인데 `--device`를 생략하면, 조용히 추측하는 대신
`AMBIGUOUS_DEVICE` 오류가 연결된 시리얼 전부를 나열해 반환한다.

**"연결됨"의 정의**: `devices`가 `connectionState`를 `"device"`로 보고하는
경우만이다. `offline` / `unauthorized` 항목은 `devices` 목록에는 계속 나오지만
자동 선택과 모호성 판정에서는 제외된다. Xcode가 설치된 Mac이라면 부팅되지 않은
iOS 시뮬레이터 수십 개가 목록에 함께 나오는데, 이들도 같은 이유로 계수에서
빠진다. 다만 **목록 자체에서 숨기지는 않는다** — 전체 그림은 `devices` 출력과
대조해 보면 된다.

목록에는 있으나 연결 상태가 아닌 시리얼을 `--device`로 지정하면,
`DEVICE_NOT_CONNECTED`를 반환하며 **기기에 아무 명령도 보내지 않는다**
(`DEVICE_NOT_FOUND`와 구분된다 — 후자는 목록에 아예 없다는 뜻).

기기별 상태(추적 중인 원래 IME, 임시 자원)는 시리얼 단위로 격리되므로, 두 기기를
동시에 몰아도 서로의 입력기 상태를 오염시키지 않는다.

## 한글·이모지·유니코드 입력

`adb shell input text`는 유니코드를 보내지 못한다. 그래서 `text`가 경로를
**스스로 고른다** — 호출자가 지정하지 않는다.

- **ASCII 전용** 입력은 플랫폼 기본 경로를 그대로 쓴다.
- **비 ASCII가 하나라도 있으면**(한글·이모지·혼합) Android에서는 유니코드
  IME([ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard))로 base64 브로드캐스트를
  보내고, iOS에서는 기기 붙여넣기판을 거친다.
- Android의 IME 전환은 **호출 단위가 아니라 세션 단위**다. 첫 비 ASCII `text`
  호출이 기기의 실제 원래 키보드를 디스크에 기록하고 ADBKeyBoard로 전환하며,
  이후 호출은 그 세션을 재사용한다. 원래 키보드를 되돌리는 것은 `reset`
  (또는 `doctor --clean`)이다. CLI 호출마다 프로세스가 새로 뜨므로 세션 기록은
  디스크에 남는다.
- 복원이 실패하면 `IME_RESTORE_FAILED`와 `details.originalImeId`가 함께 나온다.
  손으로 되돌릴 수 있게 하기 위해서다 — 조용한 실패는 없다.

```bash
$ npx explore-mobile text "안녕하세요 반갑습니다 🙂"
{"ok":true,"command":"text","data":{"serial":"R3CY106LKVX"}}

$ npx explore-mobile reset      # 원래 키보드 복원
{"ok":true,"command":"reset","data":{"serial":"R3CY106LKVX",...}}
```

> **알려진 함정**: 편집 가능한 요소에 포커스가 없으면 `text`가 `ok:true`를
> 반환하면서 **입력이 조용히 사라진다.** 비어 있는 입력란은 한 줄 높이만
> 차지하는 경우가 많아, 편집 영역 한가운데를 탭했는데도 입력란 바깥일 수 있다.
> 판정은 반드시 **스크린샷이나 앱 상태**로 하고 `ok:true`를 믿지 말 것.
> 기계적 검출 방법은 아직 확정되지 않았다.

**ADBKeyBoard는 이 패키지에 동봉하지 않는다 — 의도적이다.** ADBKeyBoard는
GPL-2.0이고 이 패키지는 MIT라 재배포하지 않는다. 대신 최초 사용 시 공식 GitHub
릴리스에서(고정된 태그로, `master`가 아니라) 내려받아 검증하고 로컬에 캐시한다.
`text`는 **스스로 복구한다** — 비 ASCII 문자열이 들어왔는데 ADBKeyBoard가 없으면
`text`가 직접 내려받아 설치하므로, `doctor`를 먼저 돌리는 건 편할 뿐 필수는
아니다. 네트워크 실패·404·잘못된 다운로드는 모두 `APK_DOWNLOAD_FAILED`와 수동
설치 안내로 우아하게 실패하며, **기기는 호출 전 상태로 남는다.** 절반만 적용된
IME 전환은 생기지 않는다.

iOS에는 위 내용이 적용되지 않는다 — 전환할 IME도, APK도, 세션 상태도 없다.

## 읽기 경로는 스크린샷 하나다

`SPEC-VISION-001`에 따라 **UI 계층 덤프(`dump`)와 네이티브 셀렉터
(`--id` / `--text`) 경로가 제거됐다.** 화면을 읽는 수단은 스크린샷 하나로
좁혀졌고, 조작은 좌표로 한다.

이유: 덤프는 플랫폼마다 결과가 다르고, 웹 콘텐츠를 보지 못하며(Android Chrome은
네이티브 크롬 요소만 반환), iOS 실기기에서는 아예 동작하지 않았다. 스크린샷은
세 조건 모두에서 동일하게 동작한다.

**제거된 플래그는 조용히 좌표 탭으로 대체되지 않는다.** `tap --id foo` 같은
호출은 `INVALID_ARGS`로 거부된다.

이 선택의 대가도 적어 둔다 — 좌표를 스크린샷에서 눈으로 읽어야 하므로, 표시용
축소 이미지를 쓴다면 **배율을 곱해야 한다.** 예를 들어 1440×3120 화면을
923×2000으로 축소해 보고 있다면 좌표에 1.56을 곱해야 실제 좌표가 된다. 배율을
빠뜨리면 조용히 다른 곳을 탭한다.

## iOS 웹 콘텐츠 (`--web`)

iOS의 네이티브 접근성 트리는 웹 페이지 내부를 노출하지 않는다. `tap`과 `text`에
`--web <CSS 셀렉터>`를 주면 CSS 셀렉터로 페이지 요소에 닿을 수 있다.

```bash
npx explore-mobile tap --web "button.submit"
npx explore-mobile text --web "input#search" "검색어"
```

- `--page <n>` — 열린 페이지가 여럿일 때 대상을 고른다. 생략하고 여럿이면
  `AMBIGUOUS_PAGE`가 나온다.
- `--index <n>` — CSS 셀렉터가 여러 개에 맞을 때 몇 번째를 조작할지 고른다.
- `ios-webkit-debug-proxy`가 필요하다. 없으면 `IWDP_NOT_INSTALLED`.

## 현재 상태

**테스트** (2026-08-03 실측):

```
$ pnpm test
Test Files  32 passed (32)
Tests  690 passed | 2 expected fail (692)

$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

**Android 실기기 검증** (SM-S938N / Android 16 / 1440×3120 / density 600):

| 항목 | 실측값 |
|---|---|
| 화면 크기 소스 | `adb shell wm size` → `Override size:` 우선, 없으면 `Physical size:` |
| 캡처 해상도 | 1440×3120 → **배율 1.0** (캡처 = 화면 크기) |
| 화면 크기 override | `wm size 1080x2340` 활성 시 캡처·좌표 모두 1080×2340을 따른다 (실측 확인) |
| 터치 슬롭 | **30px** (8dp × 3.75). 이보다 짧은 스와이프는 무동작이 아니라 **탭**이다 |
| 비전 루프 | 캡처 → 좌표 판정 → 탭 → 검증 캡처 전 경로 동작 확인 |
| 한글+이모지 입력 | 동작 확인 |

**iOS 실기기 검증** (iPhone16,2 / iOS 26.5.2 / 캡처 1290×2796):

| 항목 | 실측값 |
|---|---|
| 화면 크기 소스 | WDA `GET /window/size` → `430×932` (세션 불필요) |
| 배율 | 캡처 1290×2796 ÷ 창 430×932 = **정확히 3.0** — 상수가 아니라 도출값 |
| 비전 루프 | 캡처 → 좌표 판정 → 탭 → 검증 캡처 전 경로 동작 확인 |
| 한글+이모지 입력 | WDA `/wda/keys`로 우회 없이 전달, 동작 확인 |
| 앱 종료 | terminate 응답이 유실돼도 앱 상태 재조회로 성공/실패를 확정한다 |

검증 기록과 스크린샷: `.moai/reports/android-verification/` 아래
`SPEC-VISION-001-multiapp-2026-08-03/` · `SPEC-VISION-001-m3-wda-2026-08-03/` ·
`SPEC-VISION-001-m6-2026-08-03/` · `SPEC-VISION-001-web-2026-08-03/`

**아직 검증하지 않은 것**:

- `--web` 경로는 **iOS 시뮬레이터에서만** 회귀를 확인했다 (실기기 미확인). 게다가
  CLI가 스스로 띄운 프록시로는 실패하고 수동으로 미리 띄워야 성공한다 —
  [알려진 제약](#알려진-제약) 참고
- Android `wm size` **파싱 실패** 경로 — 실기기에서 유발할 방법을 찾지 못했다
- WDA를 **실제로 중단시킨** 상태의 오류 응답 (틀린 포트로 유도해 근사 확인만 했다)
- 분할화면·팝업뷰·프리폼 윈도우에서의 좌표계
- 폴더블·멀티 디스플레이 변형
- iOS 배율은 3.0인 기기 한 대에서만 확인했다 (iPad 등 다른 배율 미확인)

## 알려진 제약

`SPEC-VISION-001`의 iOS 백엔드 교체는 끝났다. 남아 있는 제약은 다음과 같다.

**iOS 사전 준비**

- WDA를 미리 기동하고 `iproxy 8100:8100 -u <UDID>`가 떠 있어야 한다. 접속 실패는
  흔한 정상 상태이므로 `WDA_UNREACHABLE`로 반환되며 복구 절차가 메시지에
  들어간다. **조용히 다른 경로로 대체되지 않는다.**
- iOS 기기를 2대 이상 붙일 때는 `EXPLORE_MOBILE_WDA_PORTS="<udid>=<port>,…"`로
  기기↔포트를 선언해야 한다. WDA `/status`는 기기 **종류**만 알려주므로 CLI가
  포트 너머 기기의 신원을 스스로 확인할 수 없다. 선언하면 미등록 serial은
  `WDA_PORT_UNMAPPED`로 거부된다. **선언하지 않으면 기본 8100으로 흘려보내며
  검증하지 못한다.**
- **iOS 시뮬레이터는 `devices` 목록에 나오지 않는다.** iOS 열거는
  `xcrun devicectl`만 쓴다(사용자 결정).

**미해결 결함**

- **`--web`은 CLI가 스스로 띄운 프록시로는 실패한다.** `ios_webkit_debug_proxy`를
  수동으로 미리 띄우고(약 4초 대기) 실행하면 성공한다. 프록시 없이 호출하면
  `NO_WEB_PAGE`로 3/3 실패했다. `src/webview/`는 `SPEC-WEBVIEW-001` 소관이라
  이번 범위에서 손대지 않고 재현 조건만 기록했다.

## 로드맵

- 스킬 래퍼(`.claude/skills/explore-mobile/`)를 현재 명령 표면에 맞추기
- 멀티기기 상호작용 테스트
- `--web` 프록시 기동 결함 처리 (`SPEC-WEBVIEW-001` 소관)

## 라이선스

MIT. ADBKeyBoard(GPL-2.0)는 동봉하지 않고 최초 사용 시 공식 릴리스에서
내려받는다. 근거는 [`vendor/adbkeyboard/README.md`](vendor/adbkeyboard/README.md).
