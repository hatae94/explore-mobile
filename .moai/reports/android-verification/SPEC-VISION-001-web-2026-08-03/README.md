# SPEC-VISION-001 — AC-VISION-031 (`--web` 회귀) 검증 (2026-08-03)

M2가 `dump --web`을 제거한 뒤에도 **살아남은 `--web` CSS 셀렉터 경로가
회귀 없이 동작하는지** 확인한 기록.

## 먼저 정정 — `--web`은 Android 경로가 아니다

`src/cli/commands/web-support.ts:108`이 명시한다:

```ts
if (device === undefined || device.platform !== "ios") {
  ...
  "--web is supported on the iOS simulator only; Android WebView uses a
   different protocol and is a separate SPEC."
```

`--web`은 **iOS 시뮬레이터 전용**이다. Android 실기기나 iOS 실기기와 무관하다.

## 시나리오 조정 — 원래 시나리오를 글자 그대로 재실행할 수 없다

`AC-VISION-031`은 "SPEC-WEBVIEW-001의 검증 시나리오 재실행"을 요구하고,
그 시나리오(`AC-WEB-020`)는 이렇게 적혀 있다:

```
When  `dump --web` → `tap --web "<선택자>"` 순으로 실행하면
Then  DOM 요소가 CommonElement[]로 반환되고, 선택자 탭으로 페이지가 실제로 전환된다
```

**첫 단계 `dump --web`은 이 SPEC의 M2가 제거했다**(사용자 결정, progress.md §G).
따라서 원문 그대로는 실행 불가능하다. `web-support.ts` 헤더가 이 상황의 해석을
이미 정해 두었다 — "`tap --web` / `text --web`의 CSS 셀렉터 경로는 변경 없이
유지된다(REQ-VISION-007, AC-VISION-031)". 즉 AC-031은 **살아남은 경로의 무회귀
확인**으로 읽는다.

| 원래 | 조정 | 이유 |
|---|---|---|
| naver.com 로드 | example.com 로드 | DOM이 고정적이고 링크가 `<a>` 하나뿐이라 셀렉터가 모호하지 않다 |
| `dump --web`으로 요소 조회 | 생략 | 명령이 제거됨 |
| `tap --web`으로 페이지 전환 | 동일 | AC-031의 본체 |
| 스크린샷으로 확증 | 동일 | — |

## 측정 조건

```
트리   : HEAD = b8aa0e8. 소스 코드 변경 없음 — 검증만 수행
대상   : iPhone 17 Pro 시뮬레이터 (D0B3A18C-E485-4E7C-A25E-504BF4CA6163) / iOS 26.0
프록시 : ios_webkit_debug_proxy (/opt/homebrew/bin), Homebrew 설치본
동시   : Android 실기기 1대 + iOS 실기기 2대가 USB 연결된 상태
```

## 결과 1 — `tap --web`: PASS

**증거**: `01-example-com-before.png` `02-after-tap-web-navigated-to-iana.png`

```
$ node dist/cli/bin.js tap --web "a" --device D0B3A18C-...
{"ok":true,"command":"tap","data":{
  "page":{"index":0,"title":"Example Domain","url":"https://example.com/"},
  "selector":{"css":"a","index":0},
  "tappable":true,"method":"native","x":121,"y":326}}
```

탭 전 `example.com` → 탭 후 **`iana.org`**(주소창과 본문 모두 전환). CSS 셀렉터
지정이 실제 요소 좌표로 변환되어 네이티브 탭을 일으켰다(`method:"native"`).

## 결과 2 — `text --web`: PASS

**증거**: `03-text-web-korean-typed.png`

```
$ node dist/cli/bin.js text --web 'input[name=q]' '안녕하세요 🙂' --page 1 --device D0B3A18C-...
{"ok":true,"command":"text","data":{
  "page":{"index":1,"title":"DuckDuckGo Lite: ...","url":"https://lite.duckduckgo.com/lite/"},
  "selector":{"css":"input[name=q]","index":0},"method":"native","x":147,"y":168}}
```

웹 입력란에 한글+이모지가 그대로 들어갔다.

## 결과 3 — 페이지 모호성 처리: 부수 확인

`--page` 없이 실행했을 때 페이지가 2개(iana.org 잔여 탭 + DuckDuckGo)라
`AMBIGUOUS_PAGE`로 거부됐고, `details.pages`에 인덱스·제목·URL이 모두 담겼다.
`--page 1`을 주니 지정한 페이지가 선택됐다. SPEC-WEBVIEW-001의 AC-WEB-021 /
AC-WEB-022가 여전히 동작한다는 뜻이다.

## 발견한 결함 — CLI가 스스로 띄운 프록시로는 실패한다

**재현**: 프록시가 떠 있지 않은 상태에서 `tap --web`을 실행하면 **3회 중 3회**
다음으로 실패한다.

```
{"ok":false,"command":"tap","error":{"code":"NO_WEB_PAGE",
 "message":"The simulator has no debuggable page open. Open a page in Safari on the simulator and retry."}}
```

**반증**: 같은 인자로 프록시를 미리 띄워 두고(4초 대기) 같은 명령을 실행하면
**성공한다**(위 결과 1). 즉 페이지도 소켓도 Web Inspector도 정상이며,
`--web` 경로 자체의 결함이 아니다.

**관측한 것**:

```
소켓            : /private/tmp/com.apple.launchd.*/com.apple.webinspectord_sim.socket  (1개)
9221 (기기 목록) : [{"deviceId":"SIMULATOR","url":"localhost:9222"}]
9222 (페이지)    : [{"title":"Example Domain","url":"https://example.com/", ...}]

프록시 기동 후 경과 시간별 페이지 수 (직접 측정):
  0.2s → 0개
  0.5s → 1개
  1s 이상 → 1개
```

**설명(코드 구조와 일치하나 CLI 자체를 계측하지는 않았다)**:
`src/webview/proxy-service.ts:288-296`의 기동 루프는 프록시를 spawn한 직후
첫 조회를 수행하고, 빈 목록을 받으면 재시도하지 않고 즉시 프록시를 죽이며
`NoWebPageError`를 던진다.

```ts
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  const pages = await probePages(fetchJson, port);
  if (pages !== null) {
    if (pages.length === 0) {
      proc.kill();
      throw new NoWebPageError(...)   // 빈 목록 = 종결
    }
```

`probePages`는 프록시가 **닿지 않을 때만** `null`을 반환하고(그때만 재시도),
**HTTP는 응답하지만 페이지 열거 전**인 상태는 `[]`로 받는다. 위 측정대로 프록시는
포트를 먼저 열고 페이지를 나중에 채우므로, 첫 조회가 그 창에 들어가면 재시도
없이 종결된다. 3/3 실패는 이것이 간헐적 경합이 아니라 **체계적으로 너무 이른
조회**임을 시사한다.

**배제한 원인**: 프록시 로그에 USB 연결된 실기기 관련 오류가 섞여 나오지만
(`Unable to report to inspector 00008103-...` = 하태용의 iPad), 미리 띄운
프록시는 **같은 실기기가 연결된 상태에서 성공**했으므로 실기기 연결은 원인이
아니다.

**손대지 않은 이유**: `src/webview/`는 SPEC-WEBVIEW-001 소유이며 이 SPEC의
plan.md §A.2 PRESERVE 목록에 명시돼 있다. 결함의 존재와 재현 조건만 기록하고
수정하지 않는다.

## AC 판정

| AC | 판정 | 근거 |
|---|---|---|
| AC-VISION-031 | **PASS (조건부)** | `tap --web` · `text --web` 모두 동작하고 페이지 전환이 스크린샷으로 확증됨. 단 프록시를 미리 띄워야 했다 |

## 미검증으로 남는 것

1. **CLI 자체의 프록시 기동 경로** — 위 결함 때문에 사용자가 프록시를 수동으로
   띄우지 않으면 `--web`을 쓸 수 없다. 이 상태로는 "동작한다"고 단정하기 어렵다.
2. **CLI 계측** — 첫 조회 시점을 직접 측정하지 않았다. 설명은 코드 구조와
   외부 측정에 근거한 추론이다.
3. **원래 시나리오의 naver.com** — DOM 안정성을 이유로 example.com으로 대체했다.
4. **AC-WEB-024(낡은 대상 결함)** — 시험하지 않았다.
