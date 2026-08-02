# SPEC-VISION-001 — research.md

플랫폼 조사 기록. **본 문서의 수치는 두 종류로 엄격히 구분한다**: ①번 표기가 붙은 것은 2026-08-02 이 세션에서 직접 명령을 실행해 관측한 값이고, ②번 표기가 붙은 것은 이전 세션 기록에서 인용한 값(오늘 재측정하지 않음)이다. 이 구분은 장식이 아니라 판단 근거의 등급이다 — ②를 ①처럼 쓰면 관측하지 않은 검증 주장이 된다.

---

## §1. Android 실측 (① 2026-08-02 직접 관측)

측정 환경: SM-S938N / Android 16 / 1440×3120 / density 600(3.75x) / **무선 adb**(`adb-tls-connect`) / macOS 26.3.1 / adb 1.0.41.

### 1.1 raw adb 직접 호출

| 경로 | 관측값 | 실행 명령 |
|---|---|---|
| 화면 캡처 (PNG) | **591~676ms** (첫 회 1053ms) | `adb exec-out screencap -p > f.png` |
| 화면 캡처 (raw, 무압축) | 1045~1548ms | `adb exec-out screencap > f.raw` |
| 기기 내부 캡처만 (전송 없음) | 664~867ms | `adb shell screencap -p /sdcard/t.png` |
| adb 왕복 오버헤드 | 64~170ms | `adb shell true` |
| 좌표 탭 (단발) | **66~107ms** | `adb shell input tap 720 2900` |
| 좌표 탭 (지속 shell 내) | **49ms/회** | `adb shell 'input tap ...; input tap ...'` ×5 |
| 기기 열거 | 24~26ms | `adb devices -l` |

**병목의 위치**: 캡처를 파일로 저장(전송 없음)해도 664~867ms가 나왔다. 즉 ~600ms는 **전송 비용이 아니라 기기 측 PNG 인코딩 비용**이다. raw(18MB 전송)가 더 느린 것이 이를 확증한다. adb 왕복(~100ms)을 빼면 순수 캡처는 ~500ms.

**측정 시 발견한 함정**: 지연 측정용으로 `tap 720 2900`을 3회 실행했는데, 그 좌표를 "하단 여백"으로 가정한 것이 틀렸다 — 실제로는 뉴스 카드였고 Chrome이 YouTube 페이지로 이동해 이후 검증 무대를 오염시켰다. **측정용 탭도 실제 탭이다.** 좌표 아래에 무엇이 있는지 확인하지 않은 채 "안전한 빈 곳"을 가정하면 안 된다.

### 1.2 CLI(`explore-mobile`) 경로 — 같은 동작의 실제 비용

| 명령 | 관측값 | raw 대비 |
|---|---|---|
| `devices` | 986~1044ms | — |
| `tap` | **1916~2327ms** | 약 22배 |
| `screenshot` | 2863~2988ms | 약 5배 |
| `text`(한글) | 2309~2709ms | — |
| (대조) Node 프로세스 기동만 | **36ms** | 무시 가능 |

Node 기동이 36ms이므로 오버헤드는 런타임 기동 비용이 아니다.

### 1.3 오버헤드의 정체 — 코드로 확정한 인과

`src/cli/commands/tap.ts:122`가 `backend.listDevices()`로 한 번 열거하고, `tap.ts:127`의 `backend.tap()`이 `src/backend/registry.ts:147` → `resolveOwningBackend` → `resolveBackend` → `listAllDevices()`에서 **다시 전체 열거**한다. **명령 1회당 기기 열거가 2회 일어난다.**

이 구조는 `registry.ts`의 facade 메서드 전부(`screenshot` 142행, `inputText` 152행, `sendKeyEvent` 157행, `launchApp` 162행, `stopApp` 167행, `swipe` 179행, `getMinEffectiveSwipeThreshold` 192행, `dumpUiHierarchy` 137행)에 동일하게 존재한다.

열거 1회의 성분(① 직접 측정):

| 성분 | 관측값 | 비중 |
|---|---|---|
| **`idb list-targets`** | **735~763ms** | 압도적 지배 |
| `idb --help` (프로세스 기동만) | 105ms | |
| `xcrun simctl list devices --json` | 92~93ms (첫 회 836ms) | |
| `xcrun devicectl list devices` | 51~53ms | |
| `adb devices -l` | 24~26ms | |

`bin.ts:32`의 adb `isAvailable`와 `bin.ts:37`의 idb `isAvailable`가 각각 별도 프로세스를 띄우고, `idb-backend.ts:160`이 `list-targets --json`을 호출한다. 열거 1회 ≈ 1000ms(관측)는 이 성분들의 합으로 설명되며, **그중 idb가 지배적**이다.

관측된 CLI 지연이 이 모델과 일치한다: `tap` ≈ 열거×2 ≈ 2000ms, `screenshot` ≈ 열거×2 + 캡처 600ms ≈ 2600ms(관측 2900ms), `text` ≈ 열거×2 + IME 작업 ≈ 2300ms.

### 1.4 좌표계 — iOS와 다르다

Android 캡처 해상도는 **1440×3120으로 `wm size` 물리 해상도와 동일**하다(배율 1.0). PNG IHDR을 직접 파싱해 확인했다. iOS는 WDA 430×932 ↔ 캡처 1290×2796으로 ÷3이다(②).

별개 축 주의: 대화창에 표시되는 이미지는 923×2000으로 다운스케일되며 여기에 ×1.56을 곱해야 기기 좌표가 된다. 이는 기기 좌표계와 무관한 표시 계층의 축이다.

### 1.5 기능 검증 — 스크린샷 판정 (① end-to-end)

`ok:true` 응답은 오라클이 아니므로 모든 판정을 스크린샷으로 했다.

| 항목 | 결과 |
|---|---|
| 비전 좌표 탭 | 표시 (340,149) × 1.56 = 실제 **(530, 232)** → Chrome Omnibox 편집 모드 정확히 진입 |
| 한글+이모지 입력 | `안녕하세요 반갑습니다 🙂` → 주소창에 정확히 입력, Chrome이 검색어로 인식해 제안 목록 표시 |
| ADBKeyboard | 런타임 다운로드 캐시에서 설치·활성화 성공 (`installed:true, enabled:true`), 화면 하단 `ADB Keyboard {ON}` 확인 |

입력 문자열은 iOS 검증(②)과 동일한 것을 의도적으로 사용했다.

### 1.6 새로 확인된 플랫폼 사실

**Chrome은 `stop` 후 `launch`로 초기화되지 않는다(① 관측).** `am force-stop` 후 재실행해도 마지막 탭(YouTube 영상 페이지)이 그대로 복원됐다. 브라우저는 탭 상태를 디스크에 보존하므로 프로세스 종료가 상태 초기화가 아니다. 기존 기록의 "결정적 시작 상태가 필요하면 `stop` 후 `launch`"는 일반 앱에 대한 처방이며 **브라우저에는 성립하지 않는다.**

---

## §2. iOS 인용값 (② 이전 세션 기록 — 오늘 재측정하지 않음)

오늘 이 세션에서 iOS에 대해 직접 관측한 것은 **WDA `/status` 응답 하나뿐**이다:

```
GET http://127.0.0.1:8100/status → {"ready": true, "state": "success",
  "os": {"name":"iOS","version":"26.5.2"}, "device":"iphone", ...}
```

아래 표의 성능·좌표 수치는 전부 이전 세션의 기록을 인용한 것이며, 오늘의 tree·환경에서 재측정되지 않았다. SPEC의 설계 판단에는 쓰되, 검증된 현재값으로 취급해서는 안 된다.

| 항목 | 인용값(②) | 출처 |
|---|---|---|
| WDA `GET /screenshot` | 111ms | 이전 세션 V6 측정 |
| WDA `/actions` 탭·스와이프 | ~480ms | 동일 |
| `pymobiledevice3 dvt screenshot` | ~930ms | 동일 |
| 좌표계 | WDA 430×932 = 캡처 1290×2796 ÷ 3 | 동일 |
| 한글+이모지 입력 | WDA `/wda/keys`로 성공, IME 우회 장치 불필요 | 동일 |
| 탭 480ms의 정체 | `pointerMove`만 487ms vs 실제 탭 477ms → 터치 주입 비용 0, 전부 `/actions` 고정 오버헤드 | 동일 |

### 2.1 idb의 iOS 실기기 한계 (②)

이전 세션 기록에 따르면 idb는 iOS 실기기에서 목록 조회는 되지만 `ui` 계열 명령이 FBSimulator 프로토콜 미준수로 사실상 동작하지 않았다. 오늘 이 세션에서 idb의 iOS 실기기 UI 명령을 직접 실행해 확인하지는 않았다 — 이 항목은 인용이다.

### 2.2 WDA 운영 제약 (②)

- 수동 관문 3개: Developer Mode 활성화 + 재시동, 개발자 인증서 신뢰, UI Automation 최초 기동 시 기기 암호 입력. 전부 기기에서 사람이 직접 해야 하며 CLI로 우회 불가.
- 무료 개인팀 인증서는 7일 후 만료 → 재빌드·재설치·재신뢰 필요.
- WDA는 `127.0.0.1:8100`을 기대하며 `iproxy 8100:8100 -u <UDID>` 경유가 필요하다. WiFi 직접 접속은 실패했다.

---

## §3. 플랫폼 비대칭 — 이 SPEC의 출발점

| 항목 | iOS (WDA) ② | Android (raw adb) ① | 방향 |
|---|---|---|---|
| 캡처 | 111ms | ~600ms | Android가 약 5.4배 느림 |
| 탭 | ~480ms | ~90ms (지속 세션 49ms) | Android가 약 5~10배 빠름 |
| 좌표계 | ÷3 | ÷1 | 상이 |
| 한글 입력 | IME 우회 불필요 | ADBKeyboard 필수 | 상이 |
| 액션 루프(캡처+탭+캡처) | ~702ms | ~1290ms | Android가 약 1.8배 느림 |

두 플랫폼의 병목이 **정반대 지점**에 있다. iOS는 탭이, Android는 캡처가 느리다. 통합 설계는 "한쪽을 다른 쪽에 맞춘다"가 아니라 **양쪽의 고유 하한을 각각 인정하고 공통 표면만 맞춘다**는 형태여야 한다.

단, 위 비교표의 실질 의미는 CLI 오버헤드에 가려져 있다: 현재 CLI 경로에서 Android tap은 2000ms이므로, raw 90ms와 WDA 480ms의 차이는 사용자에게 보이지도 않는다. **플랫폼 하한보다 CLI 구조가 지배적이다.**

---

## §4. 제거 대상 인벤토리 (① 직접 grep)

`src` 전체 16,677 라인.

### 4.1 idb 참조 — 40개 파일

전용 파일(파일 자체가 idb 구현):
`src/backend/idb-backend.ts`, `idb-clipboard.ts`, `idb-doctor.ts`, `idb-errors.ts`, `idb-executor.ts`, `idb-target-parse.ts`, `keycodes-ios.ts`, `src/normalize/idb.ts` + 각 테스트

참조 파일(idb를 언급·배선):
`src/backend/registry.ts`, `doctor.ts`, `adb-backend.ts`, `src/cli/bin.ts`, `args.ts`, `router.ts`, `validators.ts`, `device-targeting.ts`, `env-services.ts`, `src/cli/commands/{doctor,dump,key,reset,swipe,types}.ts`, `src/schema/{common-element,device-backend}.ts`, `src/webview/{coordinates.test,webkit-errors}.ts`, `src/normalize/{uiautomator,webdom}.ts`

### 4.2 dump / 네이티브 셀렉터 참조 — 23개 파일

핵심: `src/cli/commands/dump.ts`, `src/normalize/element-query.ts`, `uiautomator.ts`, `idb.ts`
셀렉터 소비: `src/cli/commands/tap.ts`(34~87행 `tapBySelector`), `text.ts`(57·63·97행)
**간접 의존**: `src/cli/commands/scroll.ts`(104행), `scroll-geometry.ts`(55행 `deriveScreenSize`)

### 4.3 연쇄 영향 — dump 제거가 깨뜨리는 것

**`scroll`이 dump에 필수 의존한다.** `scroll.ts:104`가 `backend.dumpUiHierarchy(target.serial)`를 호출하고, 그 결과 `CommonElement[]`의 bounds 최대값에서 화면 크기를 파생한다(`scroll-geometry.ts:55` `deriveScreenSize`, 69~71행에서 루트 요소를 witness로 검증). dump를 제거하면 scroll이 화면 크기를 얻을 경로를 잃는다.

대안은 더 싸다: Android `wm size`는 ① 관측 25ms 수준의 `adb devices -l`과 같은 급의 단순 shell 호출이고, iOS는 WDA `/window/size` 또는 캡처 PNG의 IHDR에서 직접 얻을 수 있다. **dump 호출 한 번보다 저렴하므로 이 교체는 퇴행이 아니라 개선이다.** 다만 순서 제약이 생긴다 — 화면 크기 소스를 먼저 교체해야 dump를 안전하게 지울 수 있다.

**`text --id/--text`도 같은 경로를 쓴다.** `text.ts:63`이 `dumpUiHierarchy`를 호출한다. `tap`의 셀렉터만 제거하면 `text`에 동작하지 않는 셀렉터가 남는다.

**`--web` CSS 셀렉터는 별개 축이다.** `src/cli/commands/web-support.ts`는 WebKit Inspector가 반환한 DOM(`normalizeWebDom`)을 쓰며 `CommonElement` dump를 사용하지 않는다. 이 파일이 `args.id`/`args.selectorText`를 참조하는 곳은 389행의 `hasNativeSelector` — 네이티브 셀렉터와 CSS 셀렉터가 동시 지정됐을 때의 충돌 검사뿐이다. 네이티브 셀렉터 제거 시 이 충돌 검사가 무의미해지므로 정리 대상이지만, **`--web` 기능 자체는 유지된다.**

---

## §5. 기존 SPEC과의 관계 (① 직접 확인)

| SPEC | 상태 | 관계 |
|---|---|---|
| SPEC-ANDROID-001 | completed (0.4.0, M) | 기반. adb 백엔드는 유지·존속 |
| SPEC-IOS-001 | completed (0.1.0, L) | **이 SPEC이 대체한다** — idb 기반 iOS 백엔드를 WDA로 교체 |
| SPEC-GESTURE-001 | completed (0.9.0, M) | `depends_on: [ANDROID-001, IOS-001, WEBVIEW-001]`. scroll/swipe가 이 SPEC의 화면 크기 변경에 영향받음 |
| SPEC-WEBVIEW-001 | completed (0.2.0, M) | WebKit Inspector 경로. `--web`은 유지되므로 존속 |
| SPEC-IMESTATE-001 | **in-progress** (0.4.0, M) | Android IME 세션 격리. dump·idb와 무관하므로 충돌 없음. 단 미완결 SPEC이 병행 중임을 기록해 둔다 |

---

## §6. 미검증 항목 (Gap — 이 SPEC이 스스로 닫아야 할 것)

1. **iOS 성능 수치를 오늘 재측정하지 않았다.** §2 전체가 인용(②)이다. WDA `/status`의 ready 응답만 확인했다.
2. **WDA `/window/size` 엔드포인트를 확인하지 않았다.** §4.3에서 iOS 화면 크기 대안으로 제시했으나 실행해 본 적이 없다. 캡처 PNG의 IHDR 파싱은 확실한 폴백이다.
3. **idb 제거 후 성능은 산술 추정이며 실측이 아니다.** 열거 1회를 125ms로 가정하면 tap ≈ 340ms가 되지만, 이는 관측값이 아니라 §1.3 모델에서 도출한 값이다.
4. **iOS에서 dump(`idb describe-all`)를 오늘 실행하지 않았다.** §2.1의 실기기 UI 명령 실패는 인용이다.
5. **Android `wm size`를 scroll 경로에 실제로 연결해 보지 않았다.** 명령 자체는 ① 관측(1440×3120 즉시 반환)했으나, `deriveScreenSize` 대체 구현은 아직 없다.
6. **무선 adb만 측정했다.** USB 연결에서의 캡처·탭 지연은 다를 수 있다(왕복 오버헤드가 64~170ms로 이중 분포를 보인 점이 무선 특성일 가능성).

---

## §7. 재현 명령 (측정을 다시 하려면)

```bash
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
S="adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"
ms(){ python3 -c 'import time;print(int(time.time()*1000))'; }

# 캡처 지연
for i in 1 2 3 4 5; do s=$(ms); adb exec-out screencap -p > /tmp/a$i.png; e=$(ms); echo "$((e-s))ms"; done

# 탭 지연 (좌표는 반드시 사전에 스크린샷으로 확인할 것 — §1.1 함정 참조)
for i in 1 2 3; do s=$(ms); adb shell input tap <SAFE_X> <SAFE_Y>; e=$(ms); echo "$((e-s))ms"; done

# 열거 성분 분해
for i in 1 2 3; do s=$(ms); idb list-targets >/dev/null 2>&1; e=$(ms); echo "idb: $((e-s))ms"; done
for i in 1 2 3; do s=$(ms); adb devices -l >/dev/null; e=$(ms); echo "adb: $((e-s))ms"; done

# CLI 경로
for i in 1 2 3; do s=$(ms); node dist/cli/bin.js tap <X> <Y> --device "$S" >/dev/null; e=$(ms); echo "cli tap: $((e-s))ms"; done

# iOS WDA 상태
curl -s http://127.0.0.1:8100/status
```
