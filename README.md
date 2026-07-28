# explore-mobile

Agent-agnostic CLI for driving mobile devices — Android (via `adb`) and
iOS Simulator (via `idb`) — so an AI agent (or any automation script) can
control an emulator, simulator, or real device through a single, stable
**JSON in/out** command surface. The end goal is mobile test automation,
including multi-device interaction testing.

> **Status**: core Android/adb primitives + environment bootstrap, the
> iOS Simulator/idb backend, gesture primitives (`swipe`/`scroll`), and
> the iOS **web content** path are implemented and unit/mock-tested (644
> tests, all green). The **iOS backend has been verified end-to-end
> against a booted simulator** (2026-07-26, iPhone 17 Pro / iOS 26.0):
> launch Safari, dump the element tree, tap by selector, type, send
> keys, screenshot, navigate. The **`--web` path was verified on the
> same simulator** (2026-07-27): read a page's DOM, tap a link by CSS
> selector, and type Korean into a field. **Gesture primitives were
> verified on the same simulator** (2026-07-27): `swipe`/`scroll` moved
> the screen, and `tap --web` reached a below-the-fold link with a real
> touch. **`swipe`/`scroll` were also verified against a real Android
> device** (2026-07-28, Samsung SM-S938N, Android 16, 600 dpi) — the
> gesture-movement threshold below which the OS treats a swipe as a tap
> is now derived per platform instead of a single constant, and (as of a
> follow-up 0.7.0 measurement) reads whichever `wm density` line
> actually governs the device's touch behavior rather than always its
> physical one; see [Status](#status) below for exactly what "verified"
> covers here (one device, one density) before relying on this in
> production. Real-device
> verification of every other Android command (`tap`/`text`/`key`/
> `stop`/`doctor`/`reset`) is still pending. The Unicode-IME APK
> (ADBKeyBoard, GPL-2.0) is never bundled — `doctor` downloads it from
> its official release on first use.

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
**Both platforms are confirmed against real hardware**: the syntax above
was verified against a real Android device (2026-07-28, Samsung
SM-S938N, Android 16) — a raw `adb shell input swipe` call and the
CLI's own `swipe` command both moved the screen, with the millisecond
duration argument accepted exactly as documented — and iOS is confirmed
end-to-end against a real simulator (see [Status](#status)). This is
one Android device at one density; it is not a claim about every
Android device, manufacturer, or OS version.

**A swipe shorter than the platform's movement threshold is not a
no-op — it can be a tap.** Below that distance, Android does not just
ignore the gesture; it interprets it as a tap and activates whatever
sits under the starting point. This is exactly what
[`scroll`](#scroll-updownleftright-amount-ratio)'s `AMOUNT_TOO_SMALL`
rejection exists to prevent — see there for the measured threshold and
why this makes the rejection more important, not less.

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
parser as `INVALID_ARGS`. `--duration` also has an **upper bound of
60,000 ms (60s)**. Unlike the touch-slop floor `scroll` measures (see
below), this ceiling is a **design choice, not a measurement**: beyond
a minute a gesture stops being a swipe and becomes a long-press-drag,
which is already out of scope for this command, and the ceiling's only
job is to rule out an unbounded hang — before it existed,
`--duration 1e24` was measured to hang the command indefinitely,
requiring a forced kill. Every rejection — zero, too large, unparseable,
or empty — sends zero gestures. Coordinates follow a *separate* rule and
keep `0` as valid (e.g. `swipe 0 0 0 100` is legitimate) — only
`--duration`'s own parser treats `0` as invalid:

```bash
$ npx explore-mobile swipe 200 700 200 300 --duration 0
{"ok":false,"command":"swipe","error":{"code":"INVALID_DURATION","message":"swipe --duration requires a positive integer number of milliseconds, at most 60000.","details":{"received":"0"}}}

$ npx explore-mobile swipe 200 700 200 300 --duration 60001
{"ok":false,"command":"swipe","error":{"code":"INVALID_DURATION","message":"swipe --duration requires a positive integer number of milliseconds, at most 60000.","details":{"received":"60001"}}}
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

A ratio *inside* that valid range can still be rejected: the platform
has a **touch slop** — a minimum drag distance below which the OS
treats a gesture as a tap rather than a scroll, not something this CLI
invents. Below that many device pixels nothing happens (or, on Android,
something *else* happens — see the tap warning under
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) above), even though the
coordinates genuinely differ. `scroll` asks the connected device's own
backend for this floor and rejects any ratio whose resulting distance
falls under it, before sending anything. That case returns
`AMOUNT_TOO_SMALL` — a **different** code from `INVALID_AMOUNT`,
because the ratio itself is not out of contract (a larger screen would
accept the same ratio without complaint; the rejection depends on this
screen's size converting the ratio to fewer pixels than the floor,
which only the geometry step knows). The response's
`details.minValidRatio` reports the smallest ratio that *would* clear
the floor on this specific screen, so a caller knows what to retry with
instead of guessing. The distance is centre-symmetric, so it always
grows in steps of two device pixels around the screen's own centre —
and the parity of those steps (odd or even) tracks the **screen axis'
own length**, not the floor's. An even-length axis (e.g. 402×874) can
only produce even distances; an odd-length axis (e.g. 393×852's own
width, or 375×667 on both axes) can only produce odd ones. Whether the
accepted distance lands exactly on the floor is therefore a question of
whether that parity happens to match the floor's own parity, not of
which platform is involved: against iOS's 11px floor (itself odd), an
even axis jumps straight from a rejected 10px distance to an accepted
12px one — never landing on 11 itself — but an odd axis lands on it
exactly, since 11 is itself one of that axis' achievable odd distances
(confirmed by direct recomputation against the built module: on
393×852's odd width and on 375×667's two odd axes, achievable distances
step 1, 3, 5, …, 11, 13, … and the accepted one is 11px exactly; see
[`spec.md` REQ-GEST-SCROLL-007](.moai/specs/SPEC-GESTURE-001/spec.md)).
The same rule holds for Android's derived floor in reverse — even on
this device (32px), it lands exactly on an even axis and would instead
clear it one pixel later on an odd one — though only even Android
screen axes have actually been checked so far.

**The floor is not one value shared by every device — it is asked of
the connected device's own backend, and the answer says how it was
obtained.** iOS and Android arrive at this number in fundamentally
different ways, and a bare number cannot tell a caller which kind it
got. That distinction is not theoretical: an Android real-device check
found exactly this failure shipped once (see [Status](#status) for the
full account) — a single platform-independent constant, measured on
iOS, that never once moved the connected Android device's screen. The
response's `details.minValidRatioBasis` now names the source directly:

- `"device-query"` — Android. Queried from *this* device at call time:
  `wm density` reports the screen density, and the floor is
  `floor(8dp × density) + 2px` (8dp is Android's own documented
  touch-slop constant; the +2px margin sits above the raw slop boundary,
  since the pixel or two right at that boundary was measured to be
  probabilistic, not a clean cutoff — a design choice, not a further
  measurement). The density used is whichever line `wm density` reports
  as actually governing the device's own touch behavior — the
  `Override density:` line when the device has one (set by a user
  changing the Display size setting), falling back to
  `Physical density:` otherwise (see below for why this distinction
  matters).
- `"measured-constant"` — iOS. A fixed 11pt, measured once on one
  simulator (see the provenance note below) and returned unchanged, with
  no query against whichever device is actually connected.

```bash
$ npx explore-mobile scroll down --amount 0.001 --device <ios-simulator>
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"scroll --amount is too small to move the screen at this size; no gesture was sent.","details":{"requestedRatio":0.001,"minValidRatio":0.013984236866235733,"minValidRatioBasis":"measured-constant"}}}

$ npx explore-mobile scroll down --amount 0.001 --device <android-device>
{"ok":false,"command":"scroll","error":{"code":"AMOUNT_TOO_SMALL","message":"scroll --amount is too small to move the screen at this size; no gesture was sent.","details":{"requestedRatio":0.001,"minValidRatio":0.011039886623620987,"minValidRatioBasis":"device-query"}}}

$ npx explore-mobile scroll down --amount 0.014 --device <ios-simulator>
{"ok":true,"command":"scroll","data":{"serial":"D0B3A18C-…","direction":"down","from":{"x":201,"y":443},"to":{"x":201,"y":431}}}
```

No gesture is sent when `AMOUNT_TOO_SMALL` is returned.

**Neither floor is a chosen value — both are measured, or derived from
a measured platform rule.** iOS's 11pt came from one iPhone 17 Pro
simulator running iOS 26.0 — binary search across repeated trials,
judged by comparing before/after screenshots with the status bar
cropped out (see
[`spec.md` §C.1-⑭](.moai/specs/SPEC-GESTURE-001/spec.md) for the full
trial record). It is **not** established for real iOS hardware or other
iOS device models. Android's derivation rule (`8dp × density`) was
confirmed on one real device — a Samsung SM-S938N at 600 dpi, where the
measured touch-slop boundary (30px) matched `8dp × 3.75` exactly and
the resulting floor (32px) moved the screen 3 out of 3 times on every
retry, in all four directions (2026-07-28; see
[`spec.md` §C.1-⑰](.moai/specs/SPEC-GESTURE-001/spec.md)) — though the
underlying boundary measurement itself found the horizontal axis less
settled than that round-trip alone suggests: vertically, 32px measured
a clean 8 out of 8, but horizontally it measured only 5 out of 6, so the
floor is **not** established as fully reliable on that axis, and the
residual band is recorded as unresolved rather than papered over (see
[`spec.md` §C.3](.moai/specs/SPEC-GESTURE-001/spec.md)). `8dp` is
Android's own documented default, so the rule is expected to generalize
across densities, but only this one device's density, at one
manufacturer, has actually been measured — a device that ships a
different slop default is unconfirmed. **Neither platform's value is
evidence for the other's**: the iOS constant (11pt) never once moved
this Android device (0 out of 5 vertical trials, 0 out of 6 horizontal)
— exactly the failure this basis-tagged design exists to prevent.

**Android's floor reads the *effective* density — not always the
physical one.** A follow-up measurement (2026-07-28, with the user's
consent, on the same device, its Display size setting temporarily
changed and then restored) found that `wm density` reports a second
`Override density:` line whenever that setting has been changed, and it
is that value — not `Physical density:` — that actually governs the
device's own touch-slop behavior. The distinction is not academic:
reading only `Physical density:` derives a floor that can sit *below*
the real slop when the display is set to an enlarged size, and a
`scroll` inside that gap is not a no-op — it is accepted, sent, and
Android interprets it as a **tap** on whatever sits under the starting
point (see the tap warning under
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) above). The measurement:
`Physical 600` alone still derives 32px, unchanged; `Physical 600` with
a shrunk `Override 480` moved the screen at 25px 4 out of 6 times,
which would have been impossible if a Physical-only 30px slop actually
governed. The derivation now reads whichever line actually governs,
falling back to `Physical density:` when no `Override` line is present.
This closes a question the 0.6.0 amendment above had left explicitly
open, but only partway: it pins the shrunk-display slop down to a
range — `[22, 25)` px, from three tried distances — not to a single
pixel the way the 30px/31px physical-density boundary above was pinned
down, and it did not measure the *enlarged*-display direction at all —
the direction that actually matters, since that is the direction that
can push the derived floor below the real slop. The one direction that
was tried predicts the same floor under either "Override governs" or
"the smaller of the two governs", so it rules out only "Physical
governs"; the enlarged-display floor this CLI ships today is derived
from Android's own documented touch-slop rule, not from a direct
measurement of an enlarged-display device.

`scroll` cannot confirm the screen actually moved — like `swipe`, it
sends the gesture and returns; re-run [`dump`](#dump) to check. It also
always sends its swipe with a fixed, non-configurable internal duration
(500ms), because omitting one was measured to be **unreliable** rather
than a guaranteed no-op — see the reliability disclosure under
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) above. A convenience layer has
to guarantee real movement on the caller's behalf, so `scroll` never
leaves this to chance the way `swipe` itself deliberately does.

Like `swipe`, this command is confirmed against both a real iOS
simulator and a real Android device — see
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) above and
[Status](#status) below for exactly what was verified.

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

The `-scrolled` suffix is set only when the target element is
**measured to have actually moved** — its own `getBoundingClientRect()`
compared immediately before and after the `scrollIntoView` call, inside
the same JS expression. `scrollIntoView` running without error only
confirms the target node existed; it says nothing about whether
anything moved (an already-visible element, or one inside a
non-scrolling off-canvas container, leaves its rect unchanged). An
earlier version of this feature set `-scrolled` from that weaker
existence signal alone, so a tap on such an element could be reported
as `native-scrolled` or `js-click-scrolled` even though nothing moved —
fixed in the SPEC-GESTURE-001 0.4.0 amendment after an independent
review reproduced it live.

That 0.4.0 fix itself compared `window.scrollY`, which has its own
blind spot: an element scrolling inside an `overflow:auto`
**container** moves on screen without the window itself ever scrolling,
so `scrollY` stays unchanged and the response wrongly reported no
movement (`native` instead of `native-scrolled`) — a regression the
0.4.0 fix introduced while closing the first gap. A 0.5.0 amendment
replaced the `scrollY` comparison with the element's own bounding-rect
comparison shown above, which covers window scroll, container scroll,
and horizontal scroll with a single predicate; see
[CHANGELOG](CHANGELOG.md) for the exact defects in both rounds.

A third defect sat one step earlier than either round above: **the
sample was taken before the scroll had actually finished.** On a page
(or container) declaring CSS `scroll-behavior: smooth`,
`scrollIntoView` completes asynchronously — the call returns
immediately, but the animation itself finishes moments later.
Re-measuring the element's rect *immediately* after the call therefore
reads the pre-scroll position even while a real scroll is under way:
measured, `moved` read `false` (`containerScrollTop` unchanged)
immediately after the call, with the scroll only completing roughly 11
seconds afterward. Two things followed from that stale sample: a scroll
that genuinely happened went unreported (no `-scrolled` suffix), and —
worse — the same stale rectangle was reused to convert the tap
coordinate, silently degrading a native touch into the JS `click()`
fallback. A 0.7.0 amendment fixes this by calling
`scrollIntoView({block: "center", behavior: "instant"})`, forcing a
synchronous scroll regardless of the page's own CSS, so the rectangle
sampled right after the call always reflects the true post-scroll
position. This deliberately ignores the page's own animation — the
point of this scroll is a trustworthy coordinate, not visual fidelity —
and waiting for the animation to finish instead was rejected because
there is no standard completion signal to poll for, which would reopen
the same unbounded-wait hazard the `--duration` ceiling above already
closed.

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
primitives (SPEC-GESTURE-001, including its 0.4.0, 0.5.0, 0.6.0, and
0.7.0 amendments) are implemented, with 644 unit/mock tests green.

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

**Gesture primitives verified against a real Android device** (2026-07-28,
Samsung SM-S938N / Galaxy S25 Ultra, Android 16, 1440×3120, 600 dpi,
wireless ADB). An earlier release note here claimed `adb` itself was not
installed on the development machine; that was wrong — `adb` was
installed, just not on `PATH` (`command -v adb` tests reachability, not
presence). Once found and put on `PATH`, both `adb shell input swipe`'s
syntax and its millisecond duration argument (§C.1-⑥ of the SPEC) were
confirmed against the real device, and `scroll` moved the screen in all
four directions, with the response's `minValidRatio` fed back
successfully 3 out of 3 times per direction. This also promotes
AC-GEST-006 (Android real-device swipe) from PARTIAL to PASS.

That same session found the gesture-movement threshold shipping as a
single platform-independent constant (11pt, measured on iOS) was a real,
shipped defect on Android: it never once moved the connected device's
screen (0 out of 5 vertical trials, 0 out of 6 horizontal) — this
device's actual touch slop was roughly three times larger. The
threshold is now derived per platform through a new backend method
instead of a shared constant (`floor(8dp × density) + 2px` on Android,
queried live via `wm density`; the same measured 11pt constant on iOS,
never re-queried) — see
[`scroll`](#scroll-updownleftright-amount-ratio) above for the full
mechanism and the `minValidRatioBasis` field this introduced.

The same session also corrected a claim this SPEC's own reasoning had
made: a swipe shorter than the movement threshold was assumed to most
likely do nothing. It does not — Android interprets it as a tap and
activates whatever sits under the starting point (observed: repeated
short swipes on a Settings row opened a device-pairing bottom sheet).
This makes the `AMOUNT_TOO_SMALL` rejection *more* necessary, not less:
it exists to prevent an unintended tap, not merely a wasted call.

All of the above is verified on this one device at this one density;
other Android densities, manufacturers, and OS versions remain
unmeasured, though the derivation rule (`8dp` is Android's own
documented default) is expected to generalize. Real-device verification
of every other Android command — `tap`/`text`/`key`/`stop`/`doctor`/
`reset` — is still outstanding; this session specifically confirmed
`devices`, `screenshot`, `dump`, `launch`, `swipe`, and `scroll`.

**A 0.4.0 amendment fixed four `ok:true`-with-no-effect defects**, found
by an independent post-close review after this SPEC's initial (0.3.0)
close: a near-zero `--amount` that rounded to no movement (now
`AMOUNT_TOO_SMALL`, above), a `--duration 0` that was silently accepted
(now `INVALID_DURATION`, above), and a `tap --web` response that could
report `-scrolled` when the page had not actually moved (now gated on a
movement comparison, refined further below). The fourth defect was a
documentation gap rather than a code defect: `swipe --duration` omission
being unreliable, not a settled default, is now disclosed directly under
[`swipe`](#swipe-x1-y1-x2-y2-duration-ms) instead of only here.

**A second independent review found the 0.4.0 fixes themselves
incomplete**, and a 0.5.0 amendment closed three more defects in the
same failure family: the 0.4.0 degenerate-swipe guard tested
`from === to`, a predicate that can only fire when a screen dimension
is **even** — an odd-length axis has a half-integer centre, so rounding
always splits the two endpoints apart and the guard never triggered,
letting through exactly the 1px swipes 0.4.0 had just declared refused.
`minValidRatio` inherited the same defect, reporting the smallest ratio
whose endpoints merely *differ* rather than one that actually moves the
screen. And the 0.4.0 `-scrolled` fix's own `window.scrollY` comparison
missed a `overflow:auto` **container** scrolling into view, wrongly
reporting no movement. All three are closed by the measured touch-slop
floor and the element-rect comparison described above — see
[CHANGELOG](CHANGELOG.md) for the full account of both rounds.

**A 0.7.0 amendment closed two more issues — the third time this SPEC
has found and closed a defect in the same "reports success with no
effect, or with an unintended effect" family.** The first two times were
an independent post-close audit (0.4.0/0.5.0 above) and a real Android
device (0.6.0 above); this time it was a follow-up measurement of a
question the SPEC had knowingly left open. One issue was found by
further independent review: the element-rect comparison the 0.5.0
amendment introduced was still sampled *before* an animated scroll had
actually finished on a page declaring CSS `scroll-behavior: smooth` —
see [`tap --web`](#how-an-element-is-reached-and-why-the-response-says-so)
above for the fix and the measured timing that motivated it. The other
was found by measurement, not review: the SPEC's own text had recorded,
honestly and explicitly, that it did not yet know whether Android's
touch-slop floor should be derived from `wm density`'s `Physical` or
`Override` density line when a device reports both — see
[`scroll`](#scroll-updownleftright-amount-ratio) above for what a
follow-up measurement found, what changed, and exactly how far that
measurement does (and does not) reach. Both fixes made the guard this
SPEC is built around stricter rather than looser.

Final tally across all four amendments: **31 PASS / 1 PARTIAL / 0 FAIL
across 32 acceptance criteria** in
`.moai/specs/SPEC-GESTURE-001/progress.md`. AC-GEST-006 (Android
real-device swipe) is now PASS, promoted by the 0.6.0 amendment above.
The one remaining PARTIAL is AC-GEST-020 (the `--duration` omission
reliability measurement — it is intermittent by nature, so a fixed
pass/fail verdict would misstate it). One further item, AC-GEST-021
(the `-scrolled` evidence fix from the 0.4.0 amendment), is confirmed
by unit tests that reproduce the exact defect condition, but its
real-device reproduction was never completed — recorded as an open gap,
not claimed as verified.

The `--web` proxy session (SPEC-WEBVIEW-001, unrelated to
SPEC-GESTURE-001's own changes) was found to still be unstable across
separate CLI invocations during this verification run — alternating
between success, `AMBIGUOUS_PAGE`, and `NO_WEB_PAGE` even against a
single browser tab. Spacing calls a few seconds apart was the only
reliable mitigation found; a real fix is out of scope here.

Still pending before this is production-ready:

- Real-device verification of the remaining Android commands —
  `tap`/`text`/`key`/`stop`/`doctor`/`reset` (screenshot PNG validity,
  tap/text landing, `launch`/`stop` observed effects, multi-device
  isolation with two physically connected devices). `swipe`/`scroll`
  are now verified against a real device (see above); `adb` itself
  turned out to be installed on the build machine, just not on `PATH`,
  so it is no longer the blocker it was previously recorded as.
- Verifying the runtime ADBKeyBoard download end-to-end against a real
  device (the download/cache/validate logic is unit/mock-verified; see
  the Unicode caveat above and `vendor/adbkeyboard/README.md`).
- A published npm package (`npx explore-mobile` will work once this
  ships to the registry — today it only runs from a local checkout).

The remaining Android items above (`tap`/`text`/`key`/`stop`/`doctor`/
`reset`) are unit/mock-verified against constructed `adb` command lines
and mocked subprocess output, not against live hardware; `swipe` and
`scroll` are the exception — see above.

## Roadmap

| SPEC | Title | Status |
|---|---|---|
| SPEC-ANDROID-001 | Android/adb device-control primitives + environment bootstrap | Implemented, e2e pending |
| SPEC-IOS-001 | iOS Simulator backend (`idb`) — common schema + registry extension | Completed, verified on a real simulator |
| SPEC-WEBVIEW-001 | iOS Simulator web content — DOM recognition + interaction (`ios-webkit-debug-proxy`) | Completed, verified on a real simulator |
| SPEC-GESTURE-001 | `swipe`/`scroll` gesture primitives + off-viewport web element reach | Completed — verified on a real iOS simulator and a real Android device (one device/density each) |
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
