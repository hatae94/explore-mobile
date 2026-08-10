---
name: explore-mobile
description: >
  Drive Android and iOS physical devices via the explore-mobile CLI —
  device listing, app launch/stop, screenshots, coordinate tap, key events,
  swipe/scroll gestures, text input (including Korean/emoji), and
  environment doctor/reset. The screen is read by SCREENSHOT ONLY: there is
  no UI-tree dump and no element selector, so every interaction is by
  coordinate read off a capture. Every operation goes through the CLI's
  JSON in/out command surface; this skill never invokes adb, xcrun, or
  WebDriverAgent directly.

when_to_use: >
  Use when a task requires inspecting or controlling a connected Android
  or iOS device — listing devices, launching or stopping an app, capturing
  a screenshot to see the screen, tapping a coordinate, swiping or
  scrolling, sending a key event, typing text (ASCII or Unicode/Korean/
  emoji), or checking/bootstrapping the device-control environment. Also
  use when a task says "look at the phone", "tap that button", or "scroll
  down" on a real device.

license: Apache-2.0
compatibility: Designed for Claude Code
---

# explore-mobile — device control skill

Thin wrapper teaching Claude to drive Android and iOS devices through the
`explore-mobile` CLI. This skill **only invokes the CLI** — never `adb`,
`xcrun`, or WebDriverAgent directly. The CLI owns all argv construction,
platform routing, and device-state safety; this skill's job is to know
which command to run and how to read its JSON output.

## The screen is read by screenshot only

This is the single most important thing to know, and it differs from most
device-automation tools.

There is **no `dump` command and no element selector**. You cannot ask for
"the button labelled OK". The loop is always:

1. `screenshot` — capture the screen
2. Look at the image and decide the coordinate
3. `tap <x> <y>` / `swipe` / `scroll` — act on that coordinate
4. `screenshot` again — confirm what actually happened

**Judge by the screenshot, not by `ok:true`.** A command can report success
while nothing visible happened (see Known traps).

**Coordinates are device pixels of the full-size capture.** If you view a
downscaled image, multiply back. Example: a 1440×3120 screen shown at
923×2000 needs coordinates multiplied by 1.56. Forgetting the scale silently
taps the wrong place.

Removed flags (`--id`, `--text`, `--web`, `--page`, `--index`) are **rejected
with `INVALID_ARGS`**, never silently downgraded to a coordinate tap.

## Invocation form

During local development (this package is not published to npm yet):

```bash
node dist/cli/bin.js <command> [args...] [--device <serial>]
```

Once published, the same commands run via `npx explore-mobile <command>`.

Every invocation prints **exactly one JSON document to stdout** and sets a
matching exit code (0 = success, 1 = error). Never parse free text — the
JSON body is the only contract.

## JSON in/out contract

```json
// success
{ "ok": true, "command": "<name>", "data": { } }

// error — always structured, never free text
{ "ok": false, "command": "<name>", "error": { "code": "...", "message": "...", "details": { } } }
```

Branch on `error.code`. Codes you will actually meet:

| Code | Meaning |
|---|---|
| `AMBIGUOUS_DEVICE` | 2+ devices connected and `--device` was omitted |
| `NO_DEVICE` | nothing connected |
| `DEVICE_NOT_FOUND` | that serial is not in the list at all |
| `DEVICE_NOT_CONNECTED` | in the list, but not in a usable state |
| `BACKEND_COMMAND_FAILED` | generic backend command failure — an unclassified subprocess/device error, or a `--device` serial that matches more than one merged device entry |
| `INVALID_ARGS` | unknown flag, or a removed one (`--id`/`--text`/`--web`) |
| `INVALID_COORDINATES` | coordinate off-screen or malformed |
| `INVALID_DIRECTION` / `INVALID_AMOUNT` / `INVALID_DURATION` | bad `scroll`/`swipe` argument |
| `SCREEN_SIZE_UNKNOWN` | screen size could not be determined — **refuses rather than guessing** |
| `AMOUNT_TOO_SMALL` | swipe distance below the touch slop; would land as a tap |
| `LAUNCHER_ACTIVITY_NOT_FOUND` | no launchable activity for that package |
| `IME_RESTORE_FAILED` | original keyboard was not restored — **surface to the user, do not retry blindly** |
| `UNSUPPORTED_KEY_ON_IOS` | that key alias has no iOS equivalent (retry is pointless) |
| `WDA_UNREACHABLE` | iOS: WebDriverAgent is not up — message carries the recovery steps |
| `WDA_RESPONSE_LOST` | iOS: request sent, response lost. The message says whether it was a read (safe to re-call) or a mutation (verify with a screenshot) |
| `WDA_COMMAND_FAILED` | iOS: WebDriverAgent answered and the answer was a failure (non-2xx, or a body that is not JSON) |
| `WDA_PORT_UNMAPPED` | iOS: multiple devices, serial missing from the port map |
| `WDA_BUILD_CONFIG_MISSING` | iOS: the runner build settings are not declared — the message names the missing environment variables. **Not** `WDA_UNREACHABLE`: the fix is to declare a variable, not to start a runner |
| `WDA_BUILD_FAILED` | iOS: `xcodebuild` failed — its own cause line is preserved in the message |

## Device targeting

Every device-facing command accepts `--device <serial>`. Omit it only when
exactly one device is **connected** — it is auto-selected. Otherwise you get
`AMBIGUOUS_DEVICE` listing the candidates; run `devices` first.

A device counts as **connected** only when `connectionState` is `"device"`.
The other three states are all excluded from counting and auto-select, but
mean different things: `"offline"` — no connection information at all;
`"unauthorized"` — Android-only, `adb` sees the device but the host's RSA key
has not (yet) been accepted on it; `"unavailable"` — physically connected but
not currently operable (e.g. an iOS device whose tunnel/DDI/WDA preconditions
are not met), with `unavailableReason` explaining why and what to do about
it. `unavailableReason` is `null` for every state other than `"unavailable"`.

A single Android device reachable over more than one `adb` transport at once
(USB + wireless IP, wireless IP + mDNS, ...) is reported as **one** `devices`
entry — `serial` is the representative transport and `alternateSerials` lists
the rest. `--device <serial>` accepts either the representative or any
alternate serial; either way the device it resolves to is the same, and any
response `serial` field is always the representative. iOS never has more than
one transport per device, so `alternateSerials` is always `[]` there.
`alternateSerials` is always present (empty array when there is nothing to
merge).

```bash
node dist/cli/bin.js devices
```
```json
{"ok":true,"command":"devices","data":[
  {"serial":"192.168.219.106:36807","model":"SM_S938N","osVersion":"16",
   "connectionState":"device","unavailableReason":null,
   "alternateSerials":["adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp"],
   "isEmulator":false,"platform":"android"},
  {"serial":"00008130-001238880C13803A","model":"iPhone 15 Pro Max","osVersion":"26.5.2",
   "connectionState":"unavailable",
   "unavailableReason":"unavailable — 터널을 쓸 수 없다 — 기기 잠금 해제 후 WDA를 다시 띄운다",
   "alternateSerials":[],
   "isEmulator":false,"platform":"ios"}]}
```

The first entry shows a physical Android device reachable over two `adb`
transports merged into one item (`alternateSerials` non-empty). The second
shows an iOS device that is physically connected but not currently operable
(`unavailableReason` carries the observed `tunnelState` plus what to do about
it).

`platform` tells you which backend owns the device. You never choose a
backend — passing `--device <serial>` routes automatically.

## Command reference

| Command | Purpose |
|---|---|
| `devices` | List devices: serial, model, OS version, connection state, emulator flag, platform |
| `launch <package>` | Start an app by package/bundle id |
| `stop <package>` | Force-stop an app |
| `screenshot [--out <path>]` | Capture a PNG. With `--out` it saves to that host path (`data.savedTo`); without it the PNG comes back base64-encoded in `data.pngBase64` |
| `tap <x> <y>` | Tap a device-pixel coordinate |
| `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` | Raw swipe between two coordinates |
| `scroll <up\|down\|left\|right> [--amount <ratio>]` | Scroll without knowing the screen size. `--amount` is a fraction above 0 and at most 1 |
| `key <alias>` | Send a key event (aliases below) |
| `text "<string>"` | Type into the focused field. `--keep-keyboard` skips the default post-send keyboard dismissal |
| `doctor [--yes\|--install] [--clean]` | Diagnose the environment — reports whether `adb` was found (`installed`), whether it was found on `PATH` (`onPath`) or via an SDK-relative fallback, and the resolved absolute path (`resolvedPath`), plus daemon health and connected devices. `--yes`/`--install` consents to auto-installing `adb` via Homebrew (macOS only) **and, on an iOS target, to building/starting WebDriverAgent** (see iOS prerequisites). Without `--yes` the iOS path only diagnoses — it starts nothing. `--clean` does the same restore as `reset` |
| `reset` | Undo what the CLI itself put in place. Android: original keyboard back, ADBKeyBoard removed. iOS: the port forward and WebDriverAgent runner **that this CLI started** are stopped (`data.noOp` is `true` when there was nothing of ours to stop). A runner you started by hand is never touched |

**Key aliases (14)**: `back` `home` `enter` `menu` `app_switch` `up` `down`
`left` `right` `del` `tab` `power` `volume_up` `volume_down`

### Examples

```bash
node dist/cli/bin.js screenshot --out ./shot.png
node dist/cli/bin.js tap 543 2956
node dist/cli/bin.js scroll down
node dist/cli/bin.js text "안녕하세요 🙂"
```

## Platform differences

Android and iOS share one command surface, but three things differ.

**Key events.** iOS supports only `home`, `volume_up`, `volume_down`, and
`enter`. Every other alias returns `UNSUPPORTED_KEY_ON_IOS` — retrying will
not help; use a coordinate tap instead (for example, tap the app's own back
arrow rather than sending `back`).

**Text input.** On Android, non-ASCII text switches the keyboard to a bundled
Unicode IME and switches back afterward. On iOS there is no keyboard switch —
text goes straight through. See the Unicode note below.

**`doctor` output shape.** Android targets report `adb`, `daemon`, `devices`,
`adbKeyboard`. iOS targets additionally report `wdaEnvironment`, and
`adbKeyboard` comes back marked skipped. `wdaEnvironment` carries four keys —
`devicectl` (is the backend usable at all), `wda` (is the runner alive, and is
it operable — two separate fields, see below), `signing` (when the runner's
signature expires), `gates` (the three device-side gates) — plus `bringUp`
only when `--yes` was passed.

`wda` answers two questions separately and never merges them: `reachable`
(does `GET /status` answer — two values) and `controllable` (did a call that
needs authorization succeed — `"ok"` / `"failed"` / `"unknown"`, where
`"unknown"` means the runner did not answer so there was no way to ask). A
runner that is alive but has lost authorization is a real, observed state
(`reachable: true` + `controllable: "failed"`); reading only one field would
hide it.

## iOS prerequisites

iOS control runs over WebDriverAgent (an HTTP agent running on the phone).
Before any iOS command:

1. WebDriverAgent must be running on the device
2. `iproxy 8100:8100 -u <UDID>` must be forwarding the port

If either is missing, commands fail with `WDA_UNREACHABLE`, and the error
message carries the recovery steps. This is a normal, expected state — do not
treat it as a crash, and do not fall back to some other path.

**`doctor --yes` can put both in place for you.** It builds the runner if there
is no build artifact yet, starts the port forward and the runner, and reports
success only after confirming the runner is actually operable. It needs three
environment variables, and it **never guesses them** — if any is missing it
fails with `WDA_BUILD_CONFIG_MISSING` naming exactly what is absent:

| Variable | What it is |
|---|---|
| `EXPLORE_MOBILE_IOS_TEAM_ID` | Apple development team identifier |
| `EXPLORE_MOBILE_IOS_BUNDLE_ID` | bundle id to give the runner |
| `EXPLORE_MOBILE_WDA_SOURCE` | path to the WebDriverAgent source tree |

**Three things stay on the device and stay yours to do**: developer mode,
trusting the certificate, and approving UI automation. `doctor` reports these
under `wdaEnvironment.gates` as three separate fields, and today each one
reads `"indeterminate"` — no signal was found that distinguishes them, so the
CLI says so rather than guessing which one you are missing. Each field carries
its own `manualCheck` telling you where on the device to look.

**A free signature expires after 7 days.** `wdaEnvironment.signing` reports
the expiry ahead of time. Once expired, a start attempt is reported as an
expiry rather than a generic failure. Rebuilding is not the whole fix —
reinstalling the runner makes the device ask for UI-automation approval again.

**Two or more iOS devices**: declare the mapping in the environment,
`EXPLORE_MOBILE_WDA_PORTS="<udid>=<port>,<udid>=<port>"`. Once declared, an
unlisted serial is refused with `WDA_PORT_UNMAPPED` rather than being sent to
the default port — otherwise you would be driving a different phone than you
asked for.

**iOS simulators are not supported.** Device enumeration uses
`xcrun devicectl`, which lists physical devices only.

## Unicode / Korean / emoji text

`text` picks the path itself — callers never choose.

- **ASCII-only** input uses the platform's native fast path.
- **Any non-ASCII** (Korean, emoji, or mixed) on Android goes through a
  bundled Unicode IME (ADBKeyBoard); on iOS it goes through the device
  pasteboard.
- On Android the IME switch is **per session, not per call**. The first
  non-ASCII `text` call records the device's real original keyboard and
  switches; later calls reuse that session. `reset` (or `doctor --clean`)
  is what switches back.
- If restoring the keyboard fails, `text` returns `IME_RESTORE_FAILED` with
  `error.details.originalImeId`. This leaves real device state changed —
  surface it to the user rather than retrying.
- ADBKeyBoard is not bundled in the package (license reasons). It is
  downloaded from its official release on first use; `text` does this itself,
  so running `doctor` first is convenient but not required. Download failures
  return `APK_DOWNLOAD_FAILED` and leave the device untouched.

## Known traps

- **`text` can report success while the input vanishes.** If no editable
  field has focus, `text` returns `ok:true` and nothing is typed. Empty
  fields are often only one line tall, so tapping the middle of an edit area
  can still miss. Confirm with a screenshot or app state.
- **A swipe shorter than the touch slop lands as a tap**, not as nothing.
  `AMOUNT_TOO_SMALL` guards `scroll`, but a hand-built `swipe` can still do
  this.
- **Taking a screenshot is safe; anything else is a real interaction.** A tap
  meant "just to measure something" still changes the device. Look at the
  capture before acting on a coordinate.
- **The screen can change between the capture and the tap.** A notification
  banner arriving in that gap will take the tap instead. If a result looks
  wrong, re-capture before concluding anything.
- **`adb` is often not on `PATH`** even when Android Studio installed it
  (commonly at `~/Library/Android/sdk/platform-tools/adb` on macOS). Android
  commands still work in that case — path resolution falls back through
  `$ANDROID_HOME`, `$ANDROID_SDK_ROOT`, and the default macOS SDK location —
  and `doctor` reports the resolution accurately: `adb.installed` is `true`,
  `adb.onPath` is `false`, and `adb.resolvedPath` gives the absolute path it
  found, instead of the old silent `installed:false`.

## Constraints

- **Never invoke `adb`, `xcrun`, or WebDriverAgent directly.** Everything
  goes through the CLI. If a task seems to need a raw device command this
  skill does not cover, that is a gap in the CLI — not a reason to shell out.
- **`doctor`'s auto-install needs explicit consent** (`--yes`/`--install`)
  and only ever runs on macOS via Homebrew. Never pass it without the user
  knowing it installs software.
- **With more than one device connected, always pass `--device`** rather
  than relying on auto-selection.
- **Do not retry a failed mutating call blindly.** Re-capture and check what
  actually happened first.
