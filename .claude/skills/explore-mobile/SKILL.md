---
name: explore-mobile
description: >
  Drive Android devices (ADB-backed) via the explore-mobile CLI — device
  listing, app launch/stop, screenshots, tap/key/text input (including
  Korean/emoji), UI hierarchy dump, and environment doctor/reset. Every
  operation goes through the CLI's JSON in/out command surface; this
  skill never invokes the underlying platform tool directly.

when_to_use: >
  Use when a task requires inspecting or controlling a connected Android
  emulator or physical device — listing devices, launching or stopping an
  app, taking a screenshot, tapping a coordinate, sending a key event,
  typing text (ASCII or Unicode/Korean/emoji), dumping the current UI
  element tree, or checking/bootstrapping the device-control environment.

license: Apache-2.0
compatibility: Designed for Claude Code
---

# explore-mobile — Android device control skill

Thin wrapper teaching Claude to drive Android devices through the
`explore-mobile` CLI (SPEC-ANDROID-001). This skill **only invokes the
CLI** — it contains no direct platform-tool invocation anywhere. All
device control, argv construction, and shell-safety concerns live in the
CLI's own device-control layer; this skill's job is to know which CLI
command to run and how to read its JSON output.

## Invocation form

During local development (before this package is published to npm):

```bash
node dist/cli/bin.js <command> [args...] [--device <serial>]
```

Once published to the npm registry, the same commands run via `npx`
without a local install:

```bash
npx explore-mobile <command> [args...] [--device <serial>]
```

Every invocation prints **exactly one JSON document to stdout** and sets
a matching process exit code (0 = success, 1 = error). Never parse
free-text output — the JSON body is the only contract.

## JSON in/out contract

**Success:**
```json
{ "ok": true, "command": "<name>", "data": { ... } }
```

**Error** (never free-text, always structured):
```json
{ "ok": false, "command": "<name>", "error": { "code": "...", "message": "...", "details": { ... } } }
```

Read `error.code` to branch programmatically (e.g. `AMBIGUOUS_DEVICE`,
`NO_DEVICE`, `DEVICE_NOT_FOUND`, `DEVICE_NOT_CONNECTED`,
`IME_RESTORE_FAILED`, `APK_NOT_BUNDLED`, `ADB_COMMAND_FAILED`,
`NOT_IMPLEMENTED`).

## Device targeting

Every device-facing command accepts `--device <serial>`. Omit it when
exactly one device is **connected** — it is auto-selected. When 2+
connected devices exist and `--device` is omitted, the command returns a
graceful `AMBIGUOUS_DEVICE` error with the connected device list in
`error.details`; run `devices` first to discover serials.

A device counts as **connected** only when its `connectionState` is
`"device"` — `offline`/`unauthorized` entries reported by `devices` are
excluded from counting, auto-select, and error messages (though
`devices` itself still lists them; on a macOS host with Xcode this can
include many un-booted iOS simulator entries alongside the devices you
actually care about). Passing `--device <serial>` for an entry that
exists but is not connected returns `DEVICE_NOT_CONNECTED` (distinct
from `DEVICE_NOT_FOUND`, which means the serial isn't in the list at
all) — the backend never receives a command for it.

```bash
node dist/cli/bin.js devices
# {"ok":true,"command":"devices","data":[{"serial":"emulator-5554","model":"sdk_gphone64_arm64","osVersion":"14","connectionState":"device","isEmulator":true}, ...]}
```

## Command reference

| Command | Purpose | Example |
|---|---|---|
| `devices` | List connected devices (serial, model, OS version, connection state, emulator vs physical). | `node dist/cli/bin.js devices` |
| `launch <package>` | Start an app by package name. | `node dist/cli/bin.js launch com.android.settings` |
| `stop <package>` | Force-stop an app by package name. | `node dist/cli/bin.js stop com.android.settings` |
| `screenshot [--out <path>]` | Capture a PNG. With `--out`, saves to that host path (`data.savedTo`); without it, embeds the PNG as `data.pngBase64`. | `node dist/cli/bin.js screenshot --out ./shot.png` |
| `tap <x> <y>` | Tap a device-pixel coordinate. | `node dist/cli/bin.js tap 540 1200` |
| `key <alias>` | Send a key event. Aliases: `back`, `home`, `enter`, `menu`, `app_switch`, `up`, `down`, `left`, `right`, `del`, `tab`, `power`, `volume_up`, `volume_down`. | `node dist/cli/bin.js key back` |
| `text "<string>"` | Type text into the focused field — see Unicode note below. | `node dist/cli/bin.js text "hello world"` |
| `dump` | Dump the current UI hierarchy, normalized to the common element schema (`{role, text, id, bounds, tappable, enabled, children}`). | `node dist/cli/bin.js dump` |
| `doctor [--yes\|--install] [--clean]` | Diagnose the device-control environment: platform-tool install presence, connection-daemon health, ADBKeyBoard IME install+enable. `--yes`/`--install` grants consent to auto-install the platform tool via Homebrew (macOS only — Linux/Windows are always guide-only). `--clean` performs the same restore as `reset`. | `node dist/cli/bin.js doctor` |
| `reset` | Restore the device to its pre-`doctor` state (disable ADBKeyBoard, reset IME, uninstall ADBKeyBoard). | `node dist/cli/bin.js reset` |

## Unicode / Korean / emoji text note

`text` handles encoding automatically — callers never need to choose a
path themselves:

- **ASCII-only** input (e.g. `"hello world"`) uses the platform tool's
  native fast path directly.
- **Any non-ASCII** input (Korean, emoji, or mixed) is routed through a
  bundled Unicode IME (ADBKeyBoard) automatically. The device's original
  keyboard is switched back afterward — always, even if the send itself
  fails.
- If keyboard restoration itself fails, `text` returns
  `error.code: "IME_RESTORE_FAILED"` with `error.details.originalImeId`
  (the keyboard id to manually restore via `doctor` or a follow-up
  `text` call) — never a silent failure. This is a real device-state
  risk; do not retry blindly if this code appears, surface it to the
  user.
- If `doctor` has not yet run (or the bundled ADBKeyBoard APK is not
  present in this build), a non-ASCII `text` call fails with a normal
  `ADB_COMMAND_FAILED` / `APK_NOT_BUNDLED`-adjacent error — run `doctor`
  first when non-ASCII input is needed.

## Constraints

- This skill **never** invokes the platform's device-bridge tool
  directly — every operation goes through the CLI above. If a task
  seems to require a raw device command this skill doesn't cover, that
  is a gap in the CLI (SPEC-ANDROID-001), not a reason to shell out to
  the platform tool from here.
- `doctor`'s auto-install step requires explicit consent
  (`--yes`/`--install`) and only ever runs on macOS via Homebrew — never
  invoke it without the user's awareness that it installs software.
- Multiple devices connected: always pass `--device <serial>` explicitly
  once `devices` has been run to discover serials, rather than relying on
  auto-selection.
