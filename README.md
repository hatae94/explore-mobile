# explore-mobile

Agent-agnostic CLI for driving mobile devices — Android (via `adb`) and
iOS Simulator (via `idb`) — so an AI agent (or any automation script) can
control an emulator, simulator, or real device through a single, stable
**JSON in/out** command surface. The end goal is mobile test automation,
including multi-device interaction testing.

> **Status**: core Android/adb primitives + environment bootstrap, the
> iOS Simulator/idb backend, and the iOS **web content** path are
> implemented and unit/mock-tested (426 tests, all green). The **iOS
> backend has been verified end-to-end against a booted simulator**
> (2026-07-26, iPhone 17 Pro / iOS 26.0): launch Safari, dump the element
> tree, tap by selector, type, send keys, screenshot, navigate. The
> **`--web` path was verified on the same simulator** (2026-07-27): read
> a page's DOM, tap a link by CSS selector, and type Korean into a field.
> Android real-device verification is still pending — see
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
outside the viewport, that conversion cannot be trusted, and the command
falls back to an in-page `click()`.

The response always reports which path ran, so a fallback is never
silent:

```bash
$ npx explore-mobile tap --web "a" --index 50     # element below the fold
{"ok":true,"command":"tap","data":{...,"method":"js-click"}}
```

The coordinate conversion needs the height of the browser chrome above
the page. That number is **measured on the device at runtime**, not
hardcoded: it is one device's status-bar height, not a property of iOS.
The measurement covers the page with a transparent overlay first, so the
probe tap cannot reach any real element, and the result is cached per
device and re-measured automatically whenever the page geometry changes
(rotation, chrome resize). On a cache hit nothing is injected into the
page and no probe tap is sent.

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
| `ELEMENT_NOT_FOUND` | The CSS selector matched no visible element. Nothing is tapped and, for `text`, nothing is typed. |
| `TARGET_CONFLICT` | `--web` was combined with coordinates or `--id`/`--text`; one is not silently dropped. |
| `MISSING_SELECTOR` | `tap`/`text` was given `--web` with no CSS selector. |
| `UNSUPPORTED_ON_PLATFORM` | `--web` was aimed at an Android device. |

### Scope

Safari on the **iOS Simulator**, where Web Inspector is on by default.
Not covered: Android WebView, iOS physical devices (USB transport plus
manual Web Inspector activation), app-embedded webviews that do not opt
into debugging, and scrolling an off-screen element into view — the
fallback clicks it in place instead.

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
(SPEC-IOS-001), and the iOS web content path (SPEC-WEBVIEW-001) are
implemented, with 426 unit/mock tests green.

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
the fold fell back to an in-page click and navigated; and
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

Still pending before this is production-ready:

- Real-emulator/real-device verification of every Android command
  (screenshot PNG validity, tap/text landing, `launch`/`stop` observed
  effects, multi-device isolation with two physically connected
  devices).
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
