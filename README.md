# explore-mobile

Agent-agnostic CLI for driving mobile devices — Android (via `adb`) and
iOS Simulator (via `idb`) — so an AI agent (or any automation script) can
control an emulator, simulator, or real device through a single, stable
**JSON in/out** command surface. The end goal is mobile test automation,
including multi-device interaction testing.

> **Status**: core Android/adb primitives + environment bootstrap, the
> iOS Simulator/idb backend, gesture primitives (`swipe`/`scroll`), and
> the iOS **web content** path are implemented and unit/mock-tested (553
> tests, all green). The **iOS backend has been verified end-to-end
> against a booted simulator** (2026-07-26, iPhone 17 Pro / iOS 26.0):
> launch Safari, dump the element tree, tap by selector, type, send
> keys, screenshot, navigate. The **`--web` path was verified on the
> same simulator** (2026-07-27): read a page's DOM, tap a link by CSS
> selector, and type Korean into a field. **Gesture primitives were
> verified on the same simulator** (2026-07-27): `swipe`/`scroll` moved
> the screen, and `tap --web` reached a below-the-fold link with a real
> touch. Android gesture support is **argv-verified only** — `adb` is
> not installed on the machine this was built on. Android real-device
> verification (for every command) is still pending — see
> [Status](#status) below before relying on this in production. The
> Unicode-IME APK (ADBKeyBoard, GPL-2.0) is never bundled — `doctor`
> downloads it from its official release on first use.

## Why

- Prompts, not scripts, should be able to drive a device: every command
  speaks JSON in, JSON out — no screen-scraping free text.
- No install step for the agent calling it — run via `npx`.
- Android and iOS share one command surface: a common element schema
  and a `DeviceBackend` interface let a `BackendRegistry` auto-route
  `--device <serial>` to the owning platform, with no per-platform flag
  (see [Roadmap](#roadmap)).
- Korean, emoji, and other non-ASCII text input — usually the hard part
  of automating Android input — is handled automatically.

## Requirements

- **Node.js >= 22** — raised from `>= 20`. The iOS web path uses Node's
  built-in `WebSocket` (available from 22.4) rather than adding a
  dependency for it.
- **adb** (Android SDK Platform Tools) on `PATH` — install it yourself,
  or let `doctor` do it (see [`doctor`](#doctor-yesinstall-clean) below)
- **ios-webkit-debug-proxy** — only for the iOS
  [`--web` commands](#web-content-on-the-ios-simulator). Install with
  `brew install ios-webkit-debug-proxy`; `doctor` reports whether it is
  present. Everything else works without it.

## Install & Usage

Once published to the npm registry, run any command with `npx` — no
global install needed:

```bash
npx explore-mobile <command> [args...] [--device <serial>]
```

During local development (before the first npm publish), build and run
from the checkout:

```bash
pnpm install
pnpm build
node dist/cli/bin.js <command> [args...] [--device <serial>]
```

Every invocation prints **exactly one JSON document to stdout** and sets
a matching process exit code (`0` success, `1` error). Never parse free
text — the JSON body is the only contract:

```json
// success
{ "ok": true, "command": "<name>", "data": { ... } }

// error (never free-text, always structured)
{ "ok": false, "command": "<name>", "error": { "code": "...", "message": "...", "details": { ... } } }
```

## Commands

| Command | Purpose |
|---|---|
| [`devices`](#devices) | List connected devices. |
| [`launch <package>`](#launch-package) | Start an app by package name. |
| [`stop <package>`](#stop-package) | Force-stop an app by package name. |
| [`screenshot [--out <path>]`](#screenshot---out-path) | Capture a PNG. |
| [`tap <x> <y>`](#tap-x-y) | Tap a device-pixel coordinate. |
| [`key <alias>`](#key-alias) | Send a key event. |
| [`text "<string>"`](#text-string) | Type text (ASCII or Unicode — see below). |
| [`dump`](#dump) | Dump the current UI hierarchy, normalized. |
| [`swipe <x1> <y1> <x2> <y2> [--duration <ms>]`](#swipe-x1-y1-x2-y2-duration-ms) | Send a raw swipe gesture between two coordinates. |
| [`scroll <up\|down\|left\|right> [--amount <ratio>]`](#scroll-updownleftright-amount-ratio) | Scroll the screen a direction/ratio, without needing its pixel size. |
| [`doctor [--yes\|--install] [--clean]`](#doctor-yesinstall-clean) | Diagnose / bootstrap the environment. |
| [`reset`](#reset) | Restore the device to its pre-`doctor` state. |

`dump`, `tap`, and `text` also accept
[`--web`](#web-content-on-the-ios-simulator) to reach **web page content**
on the iOS Simulator, which the native accessibility tree does not expose.

Every device-facing command accepts `--device <serial>`. Omit it when
exactly one device is connected — it is auto-selected. With 2+ devices
connected and `--device` omitted, the command returns an
`AMBIGUOUS_DEVICE` error listing all connected serials instead of
silently guessing.

### `devices`

```bash
$ npx explore-mobile devices
{"ok":true,"command":"devices","data":[{"serial":"emulator-5554","model":"sdk_gphone64_arm64","osVersion":"14","connectionState":"device","isEmulator":true}]}
```

### `launch <package>`

```bash
$ npx explore-mobile launch com.android.settings
{"ok":true,"command":"launch","data":{"serial":"emulator-5554","package":"com.android.settings"}}
```

### `stop <package>`

```bash
$ npx explore-mobile stop com.android.settings
{"ok":true,"command":"stop","data":{"serial":"emulator-5554","package":"com.android.settings"}}
```

### `screenshot [--out <path>]`

Never leaves a file on the device — the PNG is streamed host-side via
`adb exec-out`. Without `--out`, the PNG is embedded as base64:

```bash
$ npx explore-mobile screenshot
{"ok":true,"command":"screenshot","data":{"serial":"emulator-5554","byteLength":48213,"pngBase64":"iVBORw0KGgo..."}}
```

With `--out <path>`, the PNG is written to that host path instead and the
response is a small pointer:

```bash
$ npx explore-mobile screenshot --out ./shot.png
{"ok":true,"command":"screenshot","data":{"serial":"emulator-5554","savedTo":"./shot.png","byteLength":48213}}
```

### `tap <x> <y>` / `tap --id|--text [--index <n>]`

Coordinates, or an element selector matched against the normalized tree —
`--id` against `CommonElement.id` (Android `resource-id`, iOS
`AXUniqueId`), `--text` against its text (Android `text` or
`content-desc`, iOS `AXLabel`), and `--index <n>` to pick the n-th of
several matches. Selector mode taps the matched element's center, so it
survives layout shifts that break hardcoded coordinates. Coordinates and
a selector together are rejected with `TARGET_CONFLICT` rather than one
silently winning; an unmatched selector returns `ELEMENT_NOT_FOUND`
rather than tapping the wrong place.

```bash
$ npx explore-mobile tap 540 1200
{"ok":true,"command":"tap","data":{"serial":"emulator-5554","x":540,"y":1200}}

$ npx explore-mobile tap --text "로그인"
{"ok":true,"command":"tap","data":{"serial":"emulator-5554","x":540,"y":1180,"selector":{"text":"로그인"}}}
```

A matched element that is not `tappable` is still tapped, with a
`warnings` entry in the response — an automation script may legitimately
want to poke a disabled control to confirm it does *not* respond.

Selector mode is platform-agnostic: the same flags work against an
Android device and an iOS simulator, because each backend normalizes its
own tree before the selector runs.

These selectors match the **native** tree. To tap something inside a web
page, use [`tap --web "<CSS>"`](#web-content-on-the-ios-simulator).

### `key <alias>`

Supported aliases: `back`, `home`, `enter`, `menu`, `app_switch`, `up`,
`down`, `left`, `right`, `del`, `tab`, `power`, `volume_up`,
`volume_down`. An unsupported alias is rejected with a graceful
`UNSUPPORTED_KEY` error, never a silent no-op.

```bash
$ npx explore-mobile key back
{"ok":true,"command":"key","data":{"serial":"emulator-5554","key":"back"}}
```

### `text "<string>" [--id|--text [--index <n>]] [--keep-keyboard]`

```bash
$ npx explore-mobile text "hello world"
{"ok":true,"command":"text","data":{"serial":"emulator-5554"}}

$ npx explore-mobile text "hello" --id com.example:id/search_field
{"ok":true,"command":"text","data":{"serial":"emulator-5554"}}
```

The same selector flags as `tap` may be given to **focus a field before
typing** — the element is tapped first, then the text is sent. If the
selector matches nothing, the text is **not** sent at all: the caller gets
`ELEMENT_NOT_FOUND` instead of the string landing in whatever happened to
be focused already.

After sending, the soft keyboard is dismissed by default so it does not
cover the next element you want to tap. Pass `--keep-keyboard` to opt out.

See [Korean / emoji / Unicode text input](#korean--emoji--unicode-text-input)
below for how non-ASCII strings are handled.

To type into a field inside a web page, use
[`text "<string>" --web "<CSS>"`](#web-content-on-the-ios-simulator).

### `dump`

Dumps the current UI hierarchy and normalizes it to the common element
schema shared across backends (`{ role, text, id, bounds, tappable,
enabled, children }`):

```bash
$ npx explore-mobile dump
{"ok":true,"command":"dump","data":{"serial":"emulator-5554","elements":[{"role":"android.widget.Button","text":"OK","id":"com.example:id/btn_ok","bounds":{"x":0,"y":0,"w":100,"h":50},"tappable":true,"enabled":true,"children":[]}]}}
```

This is the **native** tree. Web page content does not appear in it — use
[`dump --web`](#web-content-on-the-ios-simulator) on the iOS Simulator to
read the page's DOM instead.

### `swipe <x1> <y1> <x2> <y2> [--duration <ms>]`

Sends a raw swipe/drag gesture from one device-pixel coordinate to
another. `--duration` is **milliseconds** — the CLI's one contract unit
regardless of backend; omit it to use the platform default duration (see
the reliability caveat below before relying on the default).

```bash
$ npx explore-mobile swipe 200 700 200 300 --duration 500
{"ok":true,"command":"swipe","data":{"serial":"D0B3A18C-…","from":{"x":200,"y":700},"to":{"x":200,"y":300},"durationMs":500}}
```

Internally, `AdbBackend` passes `--duration` straight through to
`adb shell input swipe` (already milliseconds); `IdbBackend` converts it
to seconds before building `idb ui swipe`'s argv, because `idb`'s own
`--duration` is seconds, not milliseconds. Both conversions are handled
for you — a caller never has to know which platform it is talking to.
**The Android half of this is argv-verified only**: the syntax above
matches `adb`'s documented contract, but `adb` itself is not installed
on the machine this was built on — not even `adb shell input swipe
--help` can be run here, so no `swipe` has ever executed against a real
Android device or emulator. iOS is confirmed end-to-end against a real
simulator (see [Status](#status)).

**Omitting `--duration` is unreliable — measured, not assumed.** On a
static page, repeated trials moved the screen 3 out of 5 times in one
session and 5 out of 5 times in a separate session: the omitted path is
session-variable, neither a dependable default nor a guaranteed no-op.
Pass an explicit `--duration <ms>` value when the caller needs the
gesture to actually happen — `500` is confirmed 5/5 across both
measurement sessions. [`scroll`](#scroll-updownleftright-amount-ratio)
below is unaffected by this: it always sends its own internal, fixed
duration, precisely because a convenience layer has to guarantee real
movement — `swipe` itself stays a raw primitive and deliberately never
injects a hidden default (design decision D1,
`.moai/specs/SPEC-GESTURE-001/spec.md` §A.3).

`--duration` must be a **positive** integer: `0` is rejected — a
zero-duration gesture cannot move anything — the same as an unparseable
or empty value, both returning `INVALID_DURATION`. A value that *looks*
negative (`--duration -100`) is instead caught earlier by the argument
parser as `INVALID_ARGS`. Every rejection sends zero gestures.
Coordinates follow a *separate* rule and keep `0` as valid (e.g.
`swipe 0 0 0 100` is legitimate) — only `--duration`'s own parser treats
`0` as invalid:

```bash
$ npx explore-mobile swipe 200 700 200 300 --duration 0
{"ok":false,"command":"swipe","error":{"code":"INVALID_DURATION","message":"swipe --duration requires a positive integer number of milliseconds.","details":{"received":"0"}}}
```

The four coordinates follow the same non-negative-integer rule as `tap`,
returning `INVALID_COORDINATES` (or `INVALID_ARGS` for a negative
literal).

See [`scroll`](#scroll-updownleftright-amount-ratio) for a direction/ratio
convenience layer built on this same command, and
[`tap --web`](#web-content-on-the-ios-simulator) for reaching an
off-viewport **web** element with a real touch.

### `scroll <up|down|left|right> [--amount <ratio>]`

Scrolls the screen a direction and a ratio of its size, without the
caller needing to know the screen's pixel dimensions — a convenience
layer over [`swipe`](#swipe-x1-y1-x2-y2-duration-ms), not a new backend
capability.

```bash
$ npx explore-mobile scroll down
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-…","direction":"down","from":{"x":201,"y":634},"to":{"x":201,"y":240}}}
```

**`scroll down` means "show the content below" — the finger moves *up*.**
This is the single most silently-invertible thing about this command: get
it backwards and it still returns `ok: true`. The response always carries
both the `direction` and the real `from`/`to` points, precisely so a
caller can check `to.y < from.y` (down) at a glance instead of trusting
the label alone.

Screen size is derived from the existing [`dump`](#dump) result — there
is no separate backend method to query it. The rule is deliberately
strict: the maximum extent of every top-level element's bounds is a
*candidate* size, but it is accepted only when one of those elements'
bounds exactly spans `{0, 0, width, height}` (a "witness"). Without a
witness, `scroll` refuses with `SCREEN_SIZE_UNKNOWN` rather than guess —
a bare max-extent check would happily accept the bounding box of a
handful of unrelated status-bar fragments as "the screen", which is a
real state Safari can be in.

`--amount` scales the swipe distance and must be greater than 0 and at
most 1 (default `0.5` — half a screen). An out-of-range or unparseable
value is `INVALID_AMOUNT`; a value that looks negative
(`--amount -0.5`) is instead caught by the argument parser as
`INVALID_ARGS`. Both send zero gestures.

A ratio *inside* that valid range can still be rejected: on a small
enough screen, a very small ratio rounds to the same start and end pixel
after coordinate rounding, producing a swipe that would move nothing.
That case returns `AMOUNT_TOO_SMALL` — a **different** code from
`INVALID_AMOUNT`, because the ratio itself is not out of contract (a
larger screen would accept the same ratio without complaint; the
rejection depends on this screen's size, which only the geometry step
knows). The response's `details.minValidRatio` reports the smallest
ratio that *would* move this specific screen, so a caller knows what to
retry with instead of guessing:

```bash
$ npx explore-mobile scroll down --amount 0.001
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"scroll --amount is too small to move the screen at this size; no gesture was sent.","details":{"requestedRatio":0.001,"minValidRatio":0.001271294429898262}}}

$ npx explore-mobile scroll down --amount 0.002
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-…","direction":"down","from":{"x":201,"y":438},"to":{"x":201,"y":436}}}
```

No gesture is sent when `AMOUNT_TOO_SMALL` is returned.

`scroll` cannot confirm the screen actually moved — like `swipe`, it
sends the gesture and returns; re-run [`dump`](#dump) to check. It also
always sends its swipe with a fixed, non-configurable internal duration
(500ms), because omitting one was measured to be **unreliable** rather
than a guaranteed no-op — see the reliability disclosure under
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) above. A convenience layer has
to guarantee real movement on the caller's behalf, so `scroll` never
leaves this to chance the way `swipe` itself deliberately does.

Like `swipe`, the Android path here is **argv-verified only** — see the
caveat under [`swipe`](#swipe-x1-y1-x2-y2-duration-ms); this command has
not run against a real Android device or emulator.

### `doctor [--yes|--install] [--clean]`

Diagnoses (and, with consent, bootstraps) the device-control
environment: `adb` install presence, adb daemon health, and the
Korean/Unicode input IME (see next section).

```bash
$ npx explore-mobile doctor
{"ok":true,"command":"doctor","data":{"adb":{"installed":true,"version":"Android Debug Bridge version 1.0.41"},"daemon":{"healthy":true},"devices":[{"serial":"emulator-5554","model":"sdk_gphone64_arm64","osVersion":"14","connectionState":"device","isEmulator":true}],"adbKeyboard":{"skipped":false,"alreadyInstalled":false,"installed":true,"enabled":true}}}
```

- `--yes` / `--install` — explicit consent to auto-install `adb` via
  Homebrew. **macOS only**; auto-install is never silent. Linux/Windows
  always print exact manual-install steps regardless of this flag.
- `--clean` — performs the same restore as [`reset`](#reset).

`doctor` always reports (`ok: true`) with the diagnostic result nested
under `data` — inspect `data.adb.installed`, `data.daemon.healthy`, and
`data.adbKeyboard` rather than the top-level `ok` flag to see whether the
environment itself is healthy.

With an **iOS** target, the report carries `data.idbEnvironment` instead
of `adbKeyboard`, covering `idb`, `idb_companion`, whether a simulator is
booted, and the web path's prerequisite:

```json
"idbEnvironment": {
  "idbInstalled": { "installed": true, "version": null },
  "companion": { "present": true },
  "simulatorBooted": { "booted": true },
  "webInspectorProxy": { "installed": true, "liveSocketCount": 1 }
}
```

> **Caveat**: `doctor` checks `adb` first and returns early when it is
> missing, so on a host with **no `adb` installed** the iOS section is
> never reached — an iOS-only user does not see `idbEnvironment` at all.
> This predates the web path; until it is fixed, put `adb` on `PATH` to
> get the iOS report.

### `reset`

Restores the device to its pre-`doctor` state: disables and uninstalls
the Unicode IME, and resets the active input method.

```bash
$ npx explore-mobile reset
{"ok":true,"command":"reset","data":{"serial":"emulator-5554","imeReset":true,"adbKeyboardDisabled":true,"adbKeyboardUninstalled":true,"warnings":[]}}
```

### Error shape

Errors are always structured JSON, never free text:

```bash
$ npx explore-mobile tap 10 10
{"ok":false,"command":"tap","error":{"code":"AMBIGUOUS_DEVICE","message":"2 devices connected; specify --device <serial>.","details":{"availableDevices":[...]}}}
```

## Web content on the iOS Simulator

`dump` sees the **native** accessibility tree. With a web page open, that
tree contains the browser chrome and nothing from the page — so a selector
can never reach a link inside it, and only blind coordinate taps are left.
`--web` closes that gap by reading the page's DOM directly.

Add `--web` to `dump`, `tap`, or `text`. It targets the **iOS Simulator
only**; against an Android device it is refused with
`UNSUPPORTED_ON_PLATFORM` (Android WebView speaks a different protocol and
is a separate SPEC). Without `--web`, every command behaves exactly as
before.

```bash
# every interactive element on the page, in the common element schema
$ npx explore-mobile dump --web
{"ok":true,"command":"dump","data":{"serial":"D0B3A18C-…","mode":"web","elements":[{"role":"input","text":"검색어를 입력해 주세요.","id":"query","bounds":{"x":62,"y":10,"w":282,"h":52},"tappable":true,"enabled":true,"children":[]}]}}

# narrow it with a CSS selector
$ npx explore-mobile dump --web "a[href*='news']"

# tap an element by CSS selector
$ npx explore-mobile tap --web "a[href*='shopping.naver.com']"
{"ok":true,"command":"tap","data":{"serial":"D0B3A18C-…","selector":{"css":"a[href*='shopping.naver.com']","index":0},"tappable":true,"method":"native","x":183,"y":434}}

# type into a field (Korean included — same input path as the native `text`)
$ npx explore-mobile text "네이버 웹뷰" --web "#query"
{"ok":true,"command":"text","data":{"serial":"D0B3A18C-…","selector":{"css":"#query","index":0},"method":"native","x":203,"y":98}}
```

`--index <n>` picks the n-th match when a selector matches several
elements, exactly like the native selector flags.

### How an element is reached, and why the response says so

A web element is tapped **natively by default** — its position is
converted to a device coordinate and a real touch is sent, so sites that
require genuine touch events behave normally. When the element sits
outside the viewport, that conversion cannot be trusted — so the command
scrolls the element into view (`scrollIntoView`), **re-measures its
position**, and retries the native tap against the fresh coordinate.
Only if it is *still* unconvertible after that does it fall back to an
in-page `click()`.

The response always reports which of four paths ran, so neither the
scroll nor the fallback is ever silent:

| `method` | What happened |
|---|---|
| `native` | Tapped directly — the page never moved. |
| `native-scrolled` | Scrolled into view, re-measured, then tapped natively. |
| `js-click` | JS fallback, no scroll needed. |
| `js-click-scrolled` | Scrolled, still unconvertible, JS fallback. |

The `-scrolled` suffix is set only when the page's scroll position is
**measured to have actually changed** — a `window.scrollY` comparison
taken immediately before and after the `scrollIntoView` call, inside the
same JS expression. `scrollIntoView` running without error only confirms
the target node existed; it says nothing about whether the page moved
(an already-visible element, or one inside a non-scrolling off-canvas
container, leaves `scrollY` unchanged). An earlier version of this
feature set `-scrolled` from that weaker existence signal alone, so a
tap on such an element could be reported as `native-scrolled` or
`js-click-scrolled` even though nothing moved — fixed in the
SPEC-GESTURE-001 0.4.0 amendment after an independent review reproduced
it live; see [CHANGELOG](CHANGELOG.md) for the exact defect.

```bash
$ npx explore-mobile tap --web 'a[href*="Netscape"]' --page 1
{"ok":true,"command":"tap","data":{...,"method":"native-scrolled","x":243,"y":419}}
```

(The target sat at `y ≈ 1247` against a viewport ≈714px tall — well
below the fold. It was scrolled into view, re-measured to `y:419`,
tapped natively, and the browser genuinely navigated to the linked
page.)

The coordinate conversion needs the height of the browser chrome above
the page. That number is **measured on the device at runtime**, not
hardcoded: it is one device's status-bar height, not a property of iOS.
The measurement covers the page with a transparent overlay first, so the
probe tap cannot reach any real element, and the result is cached per
device and re-measured automatically whenever the page geometry changes
(rotation, chrome resize). On a cache hit nothing is injected into the
page and no probe tap is sent.

### Which page? — `--page <n>`

Safari can expose more than one debuggable page, and **one link tap is
enough to create a second**. The proxy does not report which of them is on
screen, so the CLI does not choose for you: with two or more pages it
refuses and lists them, exactly as it refuses to guess between two
connected devices.

```bash
$ npx explore-mobile dump --web
{"ok":false,"command":"dump","error":{"code":"AMBIGUOUS_PAGE","message":"2 debuggable pages are open; specify --page <n>. …","details":{"pages":[{"index":0,"title":"NAVER","url":"https://m.naver.com/"},{"index":1,"title":"여름에만 느낄 수 있는 풍경","url":"https://clip.naver.com/…"}]}}}

$ npx explore-mobile dump --web --page 1
{"ok":true,"command":"dump","data":{"serial":"D0B3A18C-…","mode":"web","page":{"index":1,"title":"여름에만 느낄 수 있는 풍경","url":"https://clip.naver.com/…"},"elements":[…]}}
```

Every successful web command reports the page it acted on under
`data.page` — **including when there is only one**. Leaving that out is
what let an earlier version read the wrong page without anyone noticing.

**Known instability across separate CLI invocations.** Even against a
single open page, consecutive `--web` calls have been observed to
alternate between success, `AMBIGUOUS_PAGE`, and `NO_WEB_PAGE` (rarely
`WEB_INSPECTOR_UNREACHABLE`) — a proxy attach/detach timing issue, not
only page-count ambiguity, and it is unresolved (out of
SPEC-GESTURE-001's scope; it belongs to SPEC-WEBVIEW-001's proxy
lifecycle). Passing `--page <n>` explicitly and leaving a few seconds
between calls was the most reliable mitigation found so far. An agent
driving `--web` in a loop should expect and retry on these errors rather
than treat any single one as fatal.

### Proxy lifecycle

`ios_webkit_debug_proxy` is started and stopped for you. A proxy that is
**already running is reused and left running** — only a proxy this CLI
started is stopped, and that cleanup runs even when the command fails, so
a failure does not leave one behind.

### Errors

| Code | Meaning |
|---|---|
| `IWDP_NOT_INSTALLED` | `ios_webkit_debug_proxy` is not on `PATH`; the message carries the install command. |
| `NO_WEB_PAGE` | No simulator is exposing a Web Inspector socket, or none has a page open. |
| `AMBIGUOUS_PAGE` | Two or more pages are debuggable and no `--page <n>` was given; `details.pages` lists them. Also returned for an out-of-range `--page`. |
| `INVALID_PAGE` | `--page` was not a non-negative integer. |
| `ELEMENT_NOT_FOUND` | The CSS selector matched no visible element. Nothing is tapped and, for `text`, nothing is typed. |
| `TARGET_CONFLICT` | `--web` was combined with coordinates or `--id`/`--text`; one is not silently dropped. |
| `MISSING_SELECTOR` | `tap`/`text` was given `--web` with no CSS selector. |
| `UNSUPPORTED_ON_PLATFORM` | `--web` was aimed at an Android device. |

### Scope

Safari on the **iOS Simulator**, where Web Inspector is on by default.
Not covered: Android WebView, iOS physical devices (USB transport plus
manual Web Inspector activation), and app-embedded webviews that do not
opt into debugging. An off-viewport element **is** reached with a real
touch — see
[How an element is reached](#how-an-element-is-reached-and-why-the-response-says-so)
above.

## Korean / emoji / Unicode text input

`adb shell input text` cannot send Unicode, so `text` picks its path
automatically — callers never choose it themselves:

- **ASCII-only** input uses the platform's native fast path directly.
- **Any non-ASCII** input (Korean, emoji, or mixed) is routed through a
  Unicode IME ([ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard)) via
  a base64 broadcast on Android, and through the device pasteboard on iOS.
- On Android the IME switch is **session-scoped, not per-call**: the first
  non-ASCII `text` call records the device's real original keyboard to disk
  and switches to ADBKeyBoard; subsequent calls reuse that session instead
  of switching back and forth. `reset` (or `doctor --clean`) is what
  restores the original keyboard. The session record survives process
  exit, because each CLI invocation is a separate process — an earlier
  in-memory-only version lost the original keyboard between the `text` call
  and the later `reset`.
- If keyboard restoration fails during `reset`, the error surfaces with
  `error.code: "IME_RESTORE_FAILED"` and `error.details.originalImeId` so
  you can restore it by hand — never a silent failure.

```bash
$ npx explore-mobile text "안녕하세요 😸"
{"ok":true,"command":"text","data":{"serial":"emulator-5554"}}

$ npx explore-mobile reset      # restores the original keyboard
{"ok":true,"command":"reset","data":{"serial":"emulator-5554",...}}
```

**ADBKeyBoard is not bundled with this package — by design.** ADBKeyBoard
is licensed GPL-2.0; this package is MIT, so we do not redistribute it.
Instead it is downloaded from its official GitHub release on first use (a
pinned tag, never `master`), validated, and cached locally. `text`
**self-heals**: when a non-ASCII string is sent and ADBKeyBoard is not
installed, `text` performs that download-and-install itself, so running
`doctor` first is convenient but not required. A network failure, a 404, or
an invalid download all fail gracefully with
`error.code: "APK_DOWNLOAD_FAILED"` and manual-install instructions — and
the device is left in its pre-call state, with no half-applied IME switch.
See [`vendor/adbkeyboard/README.md`](vendor/adbkeyboard/README.md) for the
full license-compliance rationale.

On iOS none of this applies: there is no IME to switch, no APK, and no
session state — see the iOS notes in [Status](#status).

## Multi-device

Every device-facing command accepts `--device <serial>`:

```bash
npx explore-mobile devices
npx explore-mobile --device emulator-5554 tap 100 200   # explicit target
```

Per-device state (the tracked original IME, temporary resources) is
isolated by serial, so driving two devices concurrently doesn't cross
contaminate either device's input-method state.

## Status

Android (SPEC-ANDROID-001, all 8 milestones), the iOS Simulator backend
(SPEC-IOS-001), the iOS web content path (SPEC-WEBVIEW-001), and gesture
primitives (SPEC-GESTURE-001, including its 0.4.0 amendment) are
implemented, with 553 unit/mock tests green.

**iOS: verified against a real simulator** (2026-07-26, iPhone 17 Pro /
iOS 26.0, fb-idb 1.1.7). A full Safari journey — `doctor` → `devices` →
`launch` → `dump` → selector `tap` → `text` → `key enter` →
`screenshot` → in-page navigation — ran end to end. The three idb
behaviors that had been confirmed only against documented examples were
all checked, and **all three turned out to be wrong** and are now fixed:
`list-targets --json` emits JSONL rather than a JSON array, the
emulator discriminator field is `type` (not `target_type`), and
`screenshot` requires a `dest_path` positional. A fourth defect surfaced
in the same run: `idb --version` does not exist in fb-idb 1.1.7, so the
presence probe reported "not installed" and the registry skipped the
entire iOS backend.

Known iOS limitations found during that run:

- `idb ui text` cannot type non-ASCII (its keycode table covers only
  printable ASCII plus newline). Korean and emoji go through the device
  pasteboard instead — handled automatically by `text`.
- The ASCII path follows the simulator's **active keyboard layout**: with
  a Korean layout selected, `text "naver"` silently lands as `ㅜㅁㅍㄷㄱ`.
  idb exposes no way to read or set the input mode.
- `dump` sees native UI only. With a web page loaded, it returns the
  browser chrome alone — web content is not in the accessibility tree.
  This is what
  [`--web`](#web-content-on-the-ios-simulator) (SPEC-WEBVIEW-001) now
  addresses.

**iOS web path: verified against the same simulator** (2026-07-27). On
naver.com: `dump --web` returned 333 visible elements out of 508 matched
(175 were zero-size and dropped); a selector tap navigated to
`shopping.naver.com` and was confirmed by screenshot; an element below
the fold fell back to an in-page click and navigated (SPEC-WEBVIEW-001-era
behavior; SPEC-GESTURE-001 below later reaches it with a real touch
instead); and
`text "네이버 웹뷰" --web "#query"` was confirmed by reading the field's
value back. `IWDP_NOT_INSTALLED` and `NO_WEB_PAGE` were both reproduced
on the real device, and no proxy leaked when a command failed.

The protocol turned out **not** to be the Chrome DevTools Protocol, as
the roadmap had assumed: bare `Runtime.evaluate` / `DOM.getDocument` /
`Page.enable` are all rejected with `'<domain>' domain was not found`.
It is the WebKit Inspector Protocol multiplexed through
`Target.sendMessageToTarget`, and a thrown value is signalled by
`wasThrown` rather than CDP's `exceptionDetails` — a CDP-shaped reader
reports a thrown error as success. This was found by a throwaway spike
before the SPEC was written, not during implementation.

One web-path criterion is **not** device-verified: rejecting `--web`
against an Android device (`UNSUPPORTED_ON_PLATFORM`) is covered by unit
tests only, because no Android device was connected during the run.

**Gesture primitives verified against the same simulator** (2026-07-27,
same session as the SPEC-WEBVIEW-001 e2e run): `swipe` moved the screen,
with `--duration 500` confirmed to run in well under a second rather than
500 seconds — the ms→seconds conversion holds end-to-end; `scroll down`
then `scroll up` moved a feed down and then back to its starting point,
confirming both the derived screen size and the "down means the finger
moves up" direction semantics; and the off-viewport `tap --web` case
above (`method: "native-scrolled"`) is from this same verification run.
Android gesture support is **argv-verified only** — `adb` itself is not
installed on this machine, so neither `adb`'s own swipe syntax nor an
actual device swipe could be checked; `adb shell input swipe`'s
millisecond duration unit (§C.1-⑥ of the SPEC) remains a
documentation-only claim, never locally confirmed.

**A 0.4.0 amendment fixed four `ok:true`-with-no-effect defects**, found
by an independent post-close review after this SPEC's initial (0.3.0)
close: a near-zero `--amount` that rounded to no movement (now
`AMOUNT_TOO_SMALL`, above), a `--duration 0` that was silently accepted
(now `INVALID_DURATION`, above), and a `tap --web` response that could
report `-scrolled` when the page had not actually moved (now gated on a
`scrollY` comparison, above) — see [CHANGELOG](CHANGELOG.md) for the
full account. The fourth defect was a documentation gap rather than a
code defect: `swipe --duration` omission being unreliable, not a settled
default, is now disclosed directly under
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) instead of only here. Final
tally: **19 PASS / 2 PARTIAL / 0 FAIL across 21 acceptance criteria** in
`.moai/specs/SPEC-GESTURE-001/progress.md`. The two PARTIALs are
AC-GEST-006 (Android, above) and AC-GEST-020 (the `--duration` omission
reliability measurement — it is intermittent by nature, so a fixed
pass/fail verdict would misstate it). One further item, AC-GEST-021 (the
`-scrolled` evidence fix), is confirmed by unit tests that reproduce the
exact defect condition, but its real-device reproduction was not
completed in this amendment — recorded as an open gap, not claimed as
verified.

The `--web` proxy session (SPEC-WEBVIEW-001, unrelated to
SPEC-GESTURE-001's own changes) was found to still be unstable across
separate CLI invocations during this verification run — alternating
between success, `AMBIGUOUS_PAGE`, and `NO_WEB_PAGE` even against a
single browser tab. Spacing calls a few seconds apart was the only
reliable mitigation found; a real fix is out of scope here.

Still pending before this is production-ready:

- Real-emulator/real-device verification of every Android command,
  including the `swipe`/`scroll` gestures (screenshot PNG validity,
  tap/text landing, `launch`/`stop` observed effects, multi-device
  isolation with two physically connected devices). `adb` itself is not
  installed on the machine this was built on, so even `adb`'s own
  swipe/scroll syntax could not be checked.
- Verifying the runtime ADBKeyBoard download end-to-end against a real
  device (the download/cache/validate logic is unit/mock-verified; see
  the Unicode caveat above and `vendor/adbkeyboard/README.md`).
- A published npm package (`npx explore-mobile` will work once this
  ships to the registry — today it only runs from a local checkout).

The Android items above are unit/mock-verified against constructed
`adb` command lines and mocked subprocess output, not against live
hardware.

## Roadmap

| SPEC | Title | Status |
|---|---|---|
| SPEC-ANDROID-001 | Android/adb device-control primitives + environment bootstrap | Implemented, e2e pending |
| SPEC-IOS-001 | iOS Simulator backend (`idb`) — common schema + registry extension | Completed, verified on a real simulator |
| SPEC-WEBVIEW-001 | iOS Simulator web content — DOM recognition + interaction (`ios-webkit-debug-proxy`) | Completed, verified on a real simulator |
| SPEC-GESTURE-001 | `swipe`/`scroll` gesture primitives + off-viewport web element reach | Completed — iOS verified on a real simulator, Android argv-only (no `adb` on this machine) |
| SPEC-04 | Prompt-driven exploration loop + multi-device scenario orchestration | Committed |
| SPEC-05 | Codex skill wrapper + broader packaging | Committed |
| — | Android WebView (CDP over `adb forward`) and iOS **physical-device** webviews | Committed — separate transports, separate SPECs |

The common element schema and the device-backend interface were
designed so the iOS backend could plug in without a redesign of the CLI
or normalization layers — see the field-mapping notes in
`.moai/specs/SPEC-ANDROID-001/plan.md` §F.9 (original design) and
`.moai/specs/SPEC-IOS-001/plan.md` (implementation).

## License

[MIT](https://opensource.org/licenses/MIT)
