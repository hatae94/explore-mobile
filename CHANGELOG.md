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
  non-ASCII base64-broadcast (`ADB_INPUT_B64`) routing, and a dedicated
  `IME_RESTORE_FAILED` error code (with the original IME id) when
  restoration itself fails, so a failure is never silent. (The IME
  lifecycle was later revised from per-call restore to a session-scoped
  model — see the real-device hardening entry below.)
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
- Android real-device hardening (SPEC-ANDROID-001 amendment 0.2.0). Five
  capabilities that emerged from driving an actual device, reconciled into
  the SPEC by amendment and now documented here:
  - **Element-selector targeting**: `tap --id|--text [--index <n>]` taps a
    matched element's center instead of a hardcoded coordinate, and
    `text ... --id|--text` focuses a field before typing. An unmatched
    selector returns `ELEMENT_NOT_FOUND` rather than acting on the wrong
    element — and for `text`, the string is not sent at all. Coordinates
    plus a selector is `TARGET_CONFLICT`, never a silent winner. Both are
    platform-agnostic, so they work unchanged on iOS.
  - **Session-scoped IME with disk persistence**: the non-ASCII path now
    records the device's real original keyboard to
    `<cache-dir>/ime-sessions.json` and restores it at `reset` /
    `doctor --clean`, rather than switching back on every call. Each CLI
    invocation is a separate OS process, so the earlier in-memory-only
    tracking lost the original keyboard between the `text` call and the
    later `reset`.
  - **`text` self-heal**: a non-ASCII send with ADBKeyBoard missing now
    performs the runtime download and install itself (reusing
    `doctor`'s installer), so `doctor` is no longer a prerequisite. An
    install failure leaves the device in its pre-call state with no
    half-applied IME switch.
  - **Soft-keyboard dismissal**: `text` hides the keyboard after sending by
    default so it does not cover the next tap target; `--keep-keyboard`
    opts out.
  - **ADBKeyBoard runtime download instead of bundling**: the APK is
    GPL-2.0 and this package is MIT, so it is fetched from a pinned
    official release, validated, and cached — never redistributed.
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
- Web content recognition and interaction on the iOS Simulator
  (SPEC-WEBVIEW-001), closing the gap SPEC-IOS-001 measured: the native
  accessibility tree contains the browser chrome and nothing from the
  page, so a loaded web page could only be driven by blind coordinate
  taps. `dump`, `tap`, and `text` now accept `--web`; without it every
  command behaves exactly as before.
  - **`dump --web [<CSS>]`** returns the page's interactive elements in
    the same `CommonElement` schema the native path uses, so a caller
    handles native and web results identically. Elements with no visible
    geometry are dropped — on one naver.com screen that removed 175 of
    508 matches, which would otherwise be selector targets that cannot be
    tapped.
  - **`tap --web "<CSS>"`** converts the element's position to a device
    coordinate and sends a **real touch**, so sites that require genuine
    touch events behave normally. When the element is outside the
    viewport that conversion cannot be trusted, and the command falls
    back to an in-page `click()`. The response reports which path ran
    (`"method": "native" | "js-click"`) — a fallback is never silent.
  - **`text "<string>" --web "<CSS>"`** activates the field first (a real
    tap, which also raises the soft keyboard where a programmatic
    `focus()` would not) and then types through the existing input path,
    so Korean works on the web path for free.
  - **Runtime viewport calibration.** The coordinate conversion needs the
    chrome height above the page. It is measured on the device rather
    than hardcoded — the 62pt observed here is one device's status bar,
    not a property of iOS. The measurement covers the page with a
    transparent overlay so the probe tap cannot reach a real element, and
    the result is cached per device (`<cache-dir>/web-calibration.json`)
    and re-measured automatically when the page geometry changes. On a
    cache hit nothing is injected into the page and no probe tap is sent.
  - **Proxy lifecycle.** `ios_webkit_debug_proxy` is started and stopped
    for the caller. An already-running proxy is reused and left running;
    only a proxy this CLI started is killed, and that cleanup runs in a
    `finally` so a failed command cannot leak one. The live inspector
    socket is chosen by whether a process holds it open, not by the file
    existing — five socket files were present on the test host and one
    was live.
  - **WebKit Inspector client** (`src/webview/inspector-client.ts`). Not
    CDP: every command is wrapped in `Target.sendMessageToTarget` and its
    reply unwrapped from `Target.dispatchMessageFromTarget`. The
    `targetId` is read from the announcement event rather than assumed —
    it changes between sessions (`page-1` in one, `page-12` in the next),
    so a hardcoded value addresses a target that no longer exists. A
    thrown page value is detected via `wasThrown`, which is what WebKit
    sends instead of CDP's `exceptionDetails`.
  - **`doctor`** now reports `idbEnvironment.webInspectorProxy`
    (installed + live socket count, with the install command when
    missing), so a missing prerequisite surfaces from `doctor` rather
    than from a failed `tap --web`.
  - New graceful error codes: `IWDP_NOT_INSTALLED`, `NO_WEB_PAGE`,
    `UNSUPPORTED_ON_PLATFORM` (`--web` aimed at Android), plus
    `MISSING_SELECTOR` and `TARGET_CONFLICT` (combining `--web` with
    coordinates or `--id`/`--text` is refused rather than silently
    dropping one).
  - 123 new tests (426 total, up from the 303-test baseline), coverage
    92.99% statements.

### Fixed

- **`--web` silently acted on the wrong page after any navigation that
  opened a second debuggable target** (SPEC-WEBVIEW-001 amendment 0.2.0).
  The first release picked the first page the proxy listed. One link tap
  was enough to make that a stale page the user could no longer see:
  with `clip.naver.com` on screen, `dump --web` returned 338 elements
  from the previous `m.naver.com` document, with no error and no warning.
  Found while spiking SPEC-04, and reproduced through the shipped CLI
  before anything was changed.
  - The rule is gone rather than replaced by a better guess. The proxy
    does not report which target is frontmost, so any heuristic can be
    silently wrong. With two or more pages the CLI now returns
    `AMBIGUOUS_PAGE` listing every candidate, and `--page <n>` selects
    one — the same contract `AMBIGUOUS_DEVICE` already uses for multiple
    connected devices.
  - Every successful web command now reports the page it acted on under
    `data.page`, including when only one page exists. The absence of that
    field is why the defect went unnoticed.
  - New codes: `AMBIGUOUS_PAGE` (also covers an out-of-range `--page`)
    and `INVALID_PAGE`.
  - 12 new tests (438 total). Verified on the simulator in the exact
    two-target state that produced the defect: the ambiguous case is now
    refused with both candidates listed, and `--page 1` reads the page
    that is actually on screen (61 elements, zero from the stale one).
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

- **Minimum Node.js raised from `>= 20` to `>= 22`** (`engines.node`).
  The web path's transport is Node's built-in `WebSocket`, available from
  22.4, which keeps the runtime dependency count at one rather than
  adding a WebSocket library. Node 20 and 21 users will now see an
  engines warning on install; only the `--web` commands actually need
  the newer runtime, but the package declares the floor honestly rather
  than failing at call time.
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
  selector targeting cannot reach web content. The latter is what
  SPEC-WEBVIEW-001 (`--web`) now addresses — see the web-content entry
  under **Added**.
- A post-sync quality audit also caught a real CLI-level gap in `key`
  (AC-IOS-017) and a stale grep-literal wording in two AC descriptions
  (AC-IOS-003/AC-IOS-024); both are fixed and reflected above.
- Android real-device verification remains outstanding — the Android
  implementation is still unit/mock-verified only.
- iOS web-path verification is **done** (2026-07-27, same simulator):
  `dump --web` returned 333 visible elements of 508 matched; a selector
  tap navigated to `shopping.naver.com`, confirmed by screenshot; an
  element below the fold fell back to an in-page click and navigated; and
  `text "네이버 웹뷰" --web "#query"` was confirmed by reading the field's
  value back rather than trusting the command's own success report.
  `IWDP_NOT_INSTALLED` and `NO_WEB_PAGE` were both reproduced against the
  real device.
- One web-path acceptance criterion is **not** device-verified: refusing
  `--web` against an Android device (`UNSUPPORTED_ON_PLATFORM`) is
  covered by unit tests only, because no Android device was connected
  during the run. Recorded as PARTIAL in
  `.moai/specs/SPEC-WEBVIEW-001/progress.md` (0.2.0: 23 PASS / 1 PARTIAL
  / 0 FAIL, 24 criteria) rather than claimed as verified.
- The multi-page defect fixed in 0.2.0 had been recorded at first close
  as an unverified assumption ("multiple pages: first one wins, not
  checked") rather than treated as work. Writing an assumption down did
  not make it safe — it shipped and was wrong. Assumptions that govern
  which page or device a command acts on are now verified before close,
  not annotated.
- The roadmap had assumed the iOS webview protocol was the Chrome
  DevTools Protocol. It is not: bare `Runtime.evaluate` /
  `DOM.getDocument` / `Page.enable` are rejected with
  `'<domain>' domain was not found`. A throwaway spike established the
  real shape (WebKit Inspector Protocol multiplexed through
  `Target.sendMessageToTarget`) before the SPEC was written, so the SPEC
  was not built on the wrong premise.
- `doctor` returns early when `adb` is absent, so on a host with no `adb`
  installed the iOS section — including the new
  `webInspectorProxy` check — is never reached. This predates the web
  path and is not fixed here; it is recorded in the SPEC's residual-risk
  notes.
- The exploration loop (SPEC-04) and the Codex wrapper (SPEC-05) remain
  committed roadmap items, not yet implemented. Android WebView (CDP over
  `adb forward`) and iOS physical-device webviews are deliberately out of
  SPEC-WEBVIEW-001's scope — different transports, separate SPECs.
