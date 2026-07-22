# explore-mobile

Agent-agnostic CLI for driving mobile devices — Android today (via `adb`),
iOS next (via `idb`, committed roadmap item) — so an AI agent (or any
automation script) can control an emulator, simulator, or real device
through a single, stable **JSON in/out** command surface. The end goal is
mobile test automation, including multi-device interaction testing.

> **Status**: core Android/adb primitives + environment bootstrap are
> implemented and unit/mock-tested (150 tests, all green). Real-device /
> real-host end-to-end verification is **not yet done** — see
> [Status](#status) below before relying on this in production. The
> Unicode-IME APK (ADBKeyBoard, GPL-2.0) is never bundled — `doctor`
> downloads it from its official release on first use.

## Why

- Prompts, not scripts, should be able to drive a device: every command
  speaks JSON in, JSON out — no screen-scraping free text.
- No install step for the agent calling it — run via `npx`.
- Android and iOS share one command surface. The Android backend is
  built first; the interface underneath it is designed so an iOS/idb
  backend can be added later without a redesign (see
  [Roadmap](#roadmap)).
- Korean, emoji, and other non-ASCII text input — usually the hard part
  of automating Android input — is handled automatically.

## Requirements

- **Node.js >= 20 LTS**
- **adb** (Android SDK Platform Tools) on `PATH` — install it yourself,
  or let `doctor` do it (see [`doctor`](#doctor-yesinstall-clean) below)

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

### `tap <x> <y>`

```bash
$ npx explore-mobile tap 540 1200
{"ok":true,"command":"tap","data":{"serial":"emulator-5554","x":540,"y":1200}}
```

### `key <alias>`

Supported aliases: `back`, `home`, `enter`, `menu`, `app_switch`, `up`,
`down`, `left`, `right`, `del`, `tab`, `power`, `volume_up`,
`volume_down`. An unsupported alias is rejected with a graceful
`UNSUPPORTED_KEY` error, never a silent no-op.

```bash
$ npx explore-mobile key back
{"ok":true,"command":"key","data":{"serial":"emulator-5554","key":"back"}}
```

### `text "<string>"`

```bash
$ npx explore-mobile text "hello world"
{"ok":true,"command":"text","data":{"serial":"emulator-5554"}}
```

See [Korean / emoji / Unicode text input](#korean--emoji--unicode-text-input)
below for how non-ASCII strings are handled.

### `dump`

Dumps the current UI hierarchy and normalizes it to the common element
schema shared across backends (`{ role, text, id, bounds, tappable,
enabled, children }`):

```bash
$ npx explore-mobile dump
{"ok":true,"command":"dump","data":{"serial":"emulator-5554","elements":[{"role":"android.widget.Button","text":"OK","id":"com.example:id/btn_ok","bounds":{"x":0,"y":0,"w":100,"h":50},"tappable":true,"enabled":true,"children":[]}]}}
```

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

## Korean / emoji / Unicode text input

`adb shell input text` cannot send Unicode, so `text` picks its path
automatically — callers never choose it themselves:

- **ASCII-only** input uses the platform's native fast path directly.
- **Any non-ASCII** input (Korean, emoji, or mixed) is routed through a
  Unicode IME ([ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard)) via
  a base64 broadcast. The device's original keyboard is always switched
  back afterward — even if the send itself fails.
- If keyboard restoration itself fails, `text` returns
  `error.code: "IME_RESTORE_FAILED"` with `error.details.originalImeId`
  so you can manually restore it — never a silent failure.

```bash
$ npx explore-mobile text "안녕하세요 😸"
{"ok":true,"command":"text","data":{"serial":"emulator-5554"}}
```

**ADBKeyBoard is not bundled with this package — by design.** ADBKeyBoard
is licensed GPL-2.0; this package is MIT, so we do not redistribute it.
Instead, `doctor` downloads ADBKeyBoard from its official GitHub release
on first use (a pinned tag, never `master`), validates the download, and
caches it locally. Run `npx explore-mobile doctor` before your first
non-ASCII `text` call. A network failure, a 404, or an invalid download
all fail gracefully with `error.code: "APK_DOWNLOAD_FAILED"` and
manual-install instructions — never a crash or a silent failure. See
[`vendor/adbkeyboard/README.md`](vendor/adbkeyboard/README.md) for the
full license-compliance rationale.

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

This is a from-scratch implementation (SPEC-ANDROID-001) with all 8
planned milestones done and 150 unit/mock tests green, but it has **not
yet been exercised against a real device or a real host environment**.
Concretely, still pending before this is production-ready:

- Real-emulator/real-device verification of every command (screenshot
  PNG validity, tap/text landing, `launch`/`stop` observed effects,
  multi-device isolation with two physically connected devices).
- Verifying the runtime ADBKeyBoard download end-to-end against a real
  device (the download/cache/validate logic is unit/mock-verified; see
  the Unicode caveat above and `vendor/adbkeyboard/README.md`).
- A published npm package (`npx explore-mobile` will work once this
  ships to the registry — today it only runs from a local checkout).

Everything above is unit/mock-verified against constructed `adb`
command lines and mocked subprocess output, not against live hardware.

## Roadmap

| SPEC | Title | Status |
|---|---|---|
| SPEC-ANDROID-001 | Android/adb device-control primitives + environment bootstrap (this package) | Implemented, e2e pending |
| SPEC-02 | iOS backend (`idb`) | Committed |
| SPEC-03 | WebView/DOM recognition (Chrome DevTools Protocol / `ios-webkit-debug-proxy`) | Committed |
| SPEC-04 | Prompt-driven exploration loop + multi-device scenario orchestration | Committed |
| SPEC-05 | Codex skill wrapper + broader packaging | Committed |

The common element schema and the device-backend interface used by the
CLI are designed so the iOS backend can plug in without a redesign — see
the design notes in `.moai/specs/SPEC-ANDROID-001/plan.md` §F.9 for the
iOS field-mapping table.

## License

[MIT](https://opensource.org/licenses/MIT)
