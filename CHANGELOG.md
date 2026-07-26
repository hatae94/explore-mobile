# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Android/adb device-control CLI core (SPEC-ANDROID-001): an
  agent-agnostic, JSON in/out command surface (`devices`, `launch`,
  `stop`, `screenshot`, `tap`, `key`, `text`, `dump`, `doctor`, `reset`)
  built on a 3-layer architecture (CLI command router → normalization
  layer → adb subprocess wrapper) so a future iOS/idb backend can plug
  in without redesigning the CLI or normalization layers.
- Common element schema (`CommonElement` / `ElementBounds`) and
  `DeviceBackend` interface as the invariant contract every recognition
  backend normalizes into — designed to accept idb's iOS accessibility
  field set (`AXLabel`, `AXUniqueId`, `frame`, `type`/`role`) without
  redesign (documented field mapping + `tappable` derivation policy in
  `.moai/specs/SPEC-ANDROID-001/plan.md` §F.9/§F.9.1).
- Pure-function `uiautomator` XML normalizer mapping
  `class`/`resource-id`/`text`|`content-desc`/`bounds`/`clickable`+`enabled`
  to the common element schema, unit-tested against XML fixtures with no
  device required.
- `doctor`/`reset` environment bootstrap: per-OS `adb` install policy
  (macOS Homebrew auto-install gated on explicit `--yes`/`--install`
  consent; Linux/Windows always guide-only, never silent), adb daemon
  health check independent of install-presence, and idempotent
  install-then-enable of the bundled Unicode IME
  ([ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard)) via
  `pm list packages` dedup.
- Korean/emoji/Unicode `text` input: automatic ASCII-fast-path vs
  non-ASCII base64-broadcast (`ADB_INPUT_B64`) routing, with the
  original IME always restored afterward — including on error — and a
  dedicated `IME_RESTORE_FAILED` error code (with the original IME id)
  when restoration itself fails, so a failure is never silent.
- Multi-device support: every command accepts `--device <serial>`;
  omitting it with 2+ devices connected returns a graceful
  `AMBIGUOUS_DEVICE` error (never a silent first-device guess); per-serial
  state isolation (`PerSerialState`) and serial+random-namespaced
  temporary device paths keep concurrent device sessions from
  cross-contaminating each other's IME/state.
- Graceful, structured error handling throughout: offline/unauthorized
  devices, ADBKeyBoard install failure, and daemon-not-running all
  degrade to a JSON error envelope with an actionable message —
  never a crash, a free-text error, or a silent no-op.
- Thin Claude skill wrapper (`.claude/skills/explore-mobile/`)
  documenting the full command surface for agent use; verified (by
  test and by `grep`) to invoke only the CLI's own entry point, never
  the `adb` binary directly.
- 139 unit/mock tests (10 test files) covering the normalization layer,
  CLI command dispatch, adb argv construction, IME lifecycle (success /
  error / restore-failure paths), doctor/reset flows, per-serial
  isolation and concurrency, and the skill-wrapper compliance check.
- iOS Simulator (`idb`) device-control backend (SPEC-IOS-001), extending
  the CLI to a second platform without redesigning the command layer or
  the common normalization schema — fulfilling the interface-swap
  promise made in SPEC-ANDROID-001 (`DeviceBackend`/`CommonElement`
  designed for this):
  - `DeviceInfo.platform` (`"android"` | `"ios"`) — every backend now
    tags which platform owns a device.
  - `DeviceBackend.dumpUiHierarchy` now returns `CommonElement[]`
    directly (previously a raw string); normalization moved **into**
    each backend (`AdbBackend` normalizes uiautomator XML internally,
    `IdbBackend` normalizes idb `describe-all` JSON internally), so
    `dump`/`tap`/`text` stay platform-agnostic with no command-layer
    changes.
  - `BackendRegistry` (`src/backend/registry.ts`): merges device
    listings across all available backends and auto-routes
    `--device <serial>` to the owning backend by platform; an
    unavailable backend (e.g. idb not installed) degrades gracefully to
    0 contributed devices, never an error.
  - `IdbBackend` (`src/backend/idb-backend.ts`): implements the full
    8-method `DeviceBackend` surface via the `idb` CLI (`list-targets`,
    `ui describe-all`, `ui tap`, `ui text`, `ui key`, `launch`,
    `terminate`, screenshot) — command-layer parity with `AdbBackend`.
  - idb accessibility normalizer (`src/normalize/idb.ts`): pure-function
    mapping of idb's `describe-all` fields (`AXLabel`, `type`/`role`,
    `enabled`, `custom_actions`) to `CommonElement`, unit-tested against
    a documented real-device example.
  - iOS environment service (`IdbDoctor`,
    `src/backend/idb-doctor.ts`): idb / `idb_companion` presence checks,
    booted-simulator check, macOS-only install guidance (pip3/Homebrew,
    pinned to the last released `fb-idb==1.1.8`), and a near-no-op
    `reset` (idb's text input is Unicode-native and stateless — nothing
    to restore).
  - `doctor`/`reset` now branch on the resolved device's platform
    (`src/cli/env-services.ts`): an Android target is unchanged
    (existing `AdbDoctor` path, byte-for-byte); an iOS target routes to
    `IdbDoctor`.
  - Error code generalized from `ADB_COMMAND_FAILED` to
    `BACKEND_COMMAND_FAILED` across all 7 device-facing commands
    (dump/tap/text/screenshot/launch/stop/key), since a command failure
    can now originate from either backend.
  - `key` now surfaces `UNSUPPORTED_KEY_ON_IOS` at the CLI level for
    unsupported iOS key aliases (e.g. `home`, `volume_up`) instead of the
    generic `BACKEND_COMMAND_FAILED` — the backend already threw the
    typed error, but the CLI layer was masking it; a CLI-level regression
    test now covers the routed envelope directly.
  - 81 new/updated unit tests (293 total, up from the 212-test
    SPEC-ANDROID-001 baseline this SPEC built on), covering the registry,
    the idb normalizer, `IdbBackend`, `IdbDoctor`, and the doctor/reset
    platform-branching dispatch.
- Non-ASCII text input on iOS via the device pasteboard
  (`src/backend/idb-clipboard.ts`). `idb ui text` encodes each character
  through a fixed US-keyboard table (fb-idb 1.1.7 `idb/common/hid.py`
  `KEY_MAP` — the 95 printable ASCII characters plus newline) and raises
  `No keycode found for <char>` on anything else, so Korean and emoji were
  impossible to type. `IdbBackend.inputText` now keeps the single
  `ui text` call for ASCII and routes everything else through
  `simctl pbcopy` followed by a Command-V chord (HID 227 held with
  `--duration` while a second invocation presses HID 25, since idb has no
  chord command). Verified on a booted simulator with `"네이버 한글 🎉"`
  and `"안녕하세요"`.

### Fixed

- Four `idb` integration defects that made every iOS command fail with an
  empty device list, all found by the first real-simulator run
  (2026-07-26, iPhone 17 Pro / iOS 26.0, fb-idb 1.1.7):
  - `idb --version` does not exist in fb-idb 1.1.7 (argparse exits 2), so
    `IdbDoctor.checkIdbInstalled` reported `installed: false` and
    `BackendRegistry` skipped the entire iOS backend. Presence now falls
    back to a `which idb` probe, reporting `version: null` honestly.
  - `list-targets --json` emits JSONL (one object per line), not a JSON
    array. Both call sites parsed it as an array and silently degraded to
    an empty list. Extracted a shared `parseIdbTargets`
    (`src/backend/idb-target-parse.ts`) accepting both shapes and skipping
    unparseable lines rather than discarding the valid ones.
  - The emulator discriminator field is `type`, not `target_type`, so
    `isEmulator` was always `false`.
  - `idb screenshot` requires a `dest_path` positional; `-` is now passed
    to keep the no-disk-residue stdout contract.

### Changed

- `REQ-IOS-BACKEND-006` / `AC-IOS-016` amended: the original
  "`idb ui text` is Unicode-native" premise was disproved by reading
  fb-idb's own keycode table and is replaced by the ASCII / pasteboard
  split described above.

### Notes

- Real-device / real-host end-to-end verification (screenshot PNG
  validity, tap/text landing, `launch`/`stop` observed effects, actual
  Homebrew/APK installs) is **not yet done** — the implementation is
  unit/mock-verified only at this stage. See the SPEC's acceptance
  matrix (`.moai/specs/SPEC-ANDROID-001/progress.md`) for the current
  PASS/PARTIAL breakdown.
- The pinned ADBKeyBoard APK is **not yet bundled**; `doctor` detects
  this and returns a graceful `APK_NOT_BUNDLED` error instead of
  fabricating a binary. See `vendor/adbkeyboard/README.md` for the
  acquisition checklist.
- iOS Simulator verification is **done** (2026-07-26): a full Safari
  journey ran end to end against a booted iPhone 17 Pro (iOS 26.0) with
  `idb_companion` 1.1.8 and the `idb` client on Python 3.11 — fb-idb 1.1.7
  crashes on Python 3.12+ because it calls `asyncio.get_event_loop()`
  without a running loop. All three deferred idb behaviors were checked
  and all three were wrong; see **Fixed** above. The `@MX:TODO` markers at
  those sites are cleared. One `@MX:TODO` remains in
  `src/normalize/idb.ts`: the `Cell` / `Switch` / `Link` interactive types
  are still unobserved, because neither the home screen nor Safari chrome
  contains them.
- Known iOS limitations found during that run: the ASCII text path follows
  the simulator's active keyboard layout (a Korean layout turns
  `text "naver"` into `ㅜㅁㅍㄷㄱ` with no error, and idb offers no way to
  read or set the input mode); and `dump` sees native UI only — with a web
  page loaded, `idb ui describe-all` returns the browser chrome alone, so
  selector targeting cannot reach web content. The latter confirms
  SPEC-03 (WebView/DOM via CDP/`ios-webkit-debug-proxy`) is required
  rather than optional.
- A post-sync quality audit also caught a real CLI-level gap in `key`
  (AC-IOS-017) and a stale grep-literal wording in two AC descriptions
  (AC-IOS-003/AC-IOS-024); both are fixed and reflected above.
- Android real-device verification remains outstanding — the Android
  implementation is still unit/mock-verified only.
- WebView/DOM recognition (SPEC-03), the exploration loop (SPEC-04), and
  the Codex wrapper (SPEC-05) remain committed roadmap items, not yet
  implemented.
