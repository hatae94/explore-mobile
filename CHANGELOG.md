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
- Gesture primitives — `swipe` and `scroll` (SPEC-GESTURE-001) — closing
  the gap the SPEC-WEBVIEW-001 e2e run exposed: verifying that release
  meant calling `idb ui swipe` directly, bypassing this CLI entirely,
  because no command could move the screen. `DeviceBackend` gains a 9th
  method, `swipe(serial, from, to, options?)`, implemented by all three
  concrete backends (`AdbBackend`, `IdbBackend`, and the `BackendRegistry`
  facade) — additive only, the existing 8 methods are unchanged in shape
  or behavior.
  - **`swipe <x1> <y1> <x2> <y2> [--duration <ms>]`** sends a raw
    coordinate-to-coordinate gesture on both platforms. The CLI's single
    contract unit for `--duration` is **milliseconds** regardless of
    backend: `AdbBackend` passes it straight through to
    `adb shell input swipe` (already ms), while `IdbBackend` converts it
    to seconds *before* building argv, because `idb`'s own `--duration`
    is seconds (confirmed against fb-idb's `hid.py`). Skipping that
    conversion has no type error and no runtime error — it just silently
    turns `--duration 500` into a 500-**second** swipe on iOS, which is
    exactly the asymmetry this SPEC exists to close. `--duration` must
    be a **positive** integer — `0` is rejected as `INVALID_DURATION`
    (a zero-duration gesture cannot move anything; see the 0.4.0
    amendment below), same as an unparseable or empty value; a
    negative-looking literal (`--duration -100`) is instead caught
    earlier by the argument parser as `INVALID_ARGS` — every branch
    sends zero gestures. `--duration` is also bounded above at
    **60,000 ms (60s)** since the 0.5.0 amendment below — a design
    ceiling, not a measurement, that exists solely to rule out an
    unbounded hang (`--duration 1e24` was measured to hang the command
    indefinitely before this bound existed). Coordinates keep a
    separate, unaffected rule: `0` remains a valid coordinate.
    Omitting `--duration` entirely is
    accepted (the platform default is used) but was measured to be
    **unreliable** on a real device — 3/5 and 5/5 movement across two
    separate sessions — so this is now disclosed directly in the
    `swipe` command's own README section (REQ-GEST-SWIPE-006), not only
    in a limitations note.
  - **`scroll <up|down|left|right> [--amount <ratio>]`** is a convenience
    layer over the same `swipe` — no new backend method. Screen size is
    derived from the existing `dump` result via a two-step rule: the max
    extent of every top-level element's bounds is only *accepted* as the
    screen size when one of those elements' bounds exactly span
    `{0,0,width,height}` (a "witness"); without a witness the command
    refuses with `SCREEN_SIZE_UNKNOWN` rather than guess — guarding
    against a Safari-chrome-only state where the bounding box of
    unrelated status-bar fragments is a plausible-looking but wrong
    screen size. `scroll down` moves the finger **up** to reveal content
    below; the success response always carries the direction plus the
    real `from`/`to` coordinates so a caller can verify the semantics
    without re-dumping the screen. An out-of-range or unparseable
    `--amount` (0 excluded, 1 included) is `INVALID_AMOUNT`; a
    negative-looking literal is `INVALID_ARGS`, same as `--duration`. A
    ratio *inside* that valid range can still be rejected as
    `AMOUNT_TOO_SMALL` (see the 0.4.0, 0.5.0, and 0.6.0 amendments
    below) — a **different** code from `INVALID_AMOUNT`, because it
    depends on this specific screen's size rather than the contract
    range: the platform's touch-slop floor rejects any ratio whose
    resulting distance falls under it, and only the geometry step — not
    a static validator — can tell. Since the 0.6.0 amendment below, this
    floor is asked of the connected device's own backend rather than a
    single shared constant — iOS returns a measured 11pt constant (one
    iPhone 17 Pro simulator, iOS 26.0 — not established for real
    hardware or other iOS models), while Android derives
    `floor(8dp × density) + 2px` from a live `wm density` query (verified
    on one Samsung SM-S938N, 600 dpi — not established for other
    densities or manufacturers), reading whichever density line actually
    governs the device's own touch behavior — the `Override density:`
    line when the device reports one, falling back to
    `Physical density:` otherwise (see the 0.7.0 amendment below for why
    this distinction matters). The response's `details.minValidRatio`
    reports the smallest ratio that would clear the floor on this
    specific screen, and the new `details.minValidRatioBasis` field
    (`"device-query"` | `"measured-constant"`) names which of the two
    kinds of evidence produced it. No gesture is sent in either
    rejection case.
  - **`tap --web` now reaches below-the-fold elements with a real
    touch.** An off-viewport web element previously fell back straight
    to the JS `click()` path. It is now scrolled into view, re-measured,
    and tapped natively; JS `click()` still runs only if the element is
    *still* unconvertible after that. The response's `method` field
    grows from two values to four — `native`, `native-scrolled`,
    `js-click`, `js-click-scrolled`. The `-scrolled` suffix is set only
    when the target element is **measured to have actually moved** —
    its own `getBoundingClientRect()` compared immediately before and
    after the `scrollIntoView` call, inside the same JS expression —
    not merely because `scrollIntoView` ran without error, which only
    confirms the target node existed (see the 0.4.0 and 0.5.0
    amendments below for the two rounds of defects this closes).
- Android `swipe`/`scroll` are now confirmed against a real device
  (SPEC-GESTURE-001 amendment 0.6.0, below) — a Samsung SM-S938N,
  Android 16, 600 dpi. `adb`'s swipe syntax and its millisecond duration
  argument both moved the screen as documented, and `scroll` moved the
  screen in all four directions using a threshold now derived per
  platform instead of a shared constant (see the `scroll` entry above
  and the 0.6.0 amendment below). This is one device at one density —
  it is not a claim about every Android device, manufacturer, or OS
  version; real-device verification of the remaining Android commands
  (`tap`/`text`/`key`/`stop`/`doctor`/`reset`) is still outstanding.

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
- **Four `ok:true`-with-no-observable-effect defects, found by an
  independent post-close review** (SPEC-GESTURE-001 amendment 0.4.0).
  The SPEC closed once (0.3.0); a subsequent sync-auditor pass
  reproduced four cases where
  the CLI reported success while nothing observably changed on the
  device — worse than an error for an AI-agent caller, which has no way
  to detect a no-op success and proceeds on a false premise. The SPEC
  was amended in place and the code fixed; the **Added** entries above
  already describe the corrected, final behavior:
  - `scroll --amount` values inside the valid `(0, 1]` range could still
    round to a zero-pixel swipe on some screens (e.g. `0.001` on a
    402×874 screen) and reported `ok:true` with `scrollY` unchanged. Now
    rejected with `AMOUNT_TOO_SMALL` (details above).
  - `swipe --duration 0` was accepted and reported
    `{"ok":true, ..., "durationMs":0}`, though a zero-duration gesture
    cannot move anything. `--duration` is now required to be a
    **positive** integer (`0` is `INVALID_DURATION`) — the original
    requirement text itself said "non-negative integer", so this was a
    requirement defect, not only an implementation one.
  - `tap --web`'s `-scrolled` suffix was set whenever `scrollIntoView`
    ran without error, which only confirms the target node existed — not
    that the page moved. An off-viewport element inside an
    already-scrolled or non-scrolling container could report
    `js-click-scrolled` while `window.scrollY` never changed. Now gated
    on an explicit before/after movement comparison (details above; the
    oracle itself was refined again in the 0.5.0 amendment below).
  - `swipe --duration` omitted entirely is intermittently a no-op on a
    real device (measured 3/5 and 5/5 movement across two separate
    sessions — session-variable, not a fixed rate). This one is not a
    code defect: `swipe` is a raw primitive that deliberately never
    injects a hidden default duration (design decision D1), so the fix
    is a documentation obligation — the unreliability is now disclosed
    directly in the [`swipe`](README.md#swipe-x1-y1-x2-y2-duration-ms)
    command reference, not only in a separate limitations section.
- **Three more `ok:true`-with-no-observable-effect defects, found by a
  second independent review of the 0.4.0 fixes above** (SPEC-GESTURE-001
  amendment 0.5.0). The 0.4.0 fixes closed four defects but left three
  more open in the same failure family — the guard rested on a
  coordinate-equality accident rather than a measured value:
  - The 0.4.0 degenerate-swipe guard tested `from === to` (the rounded
    start and end pixel are literally the same point). That predicate
    can only fire when a screen dimension is **even**: the geometric
    centre of an odd-length axis is a half-integer, so rounding the two
    endpoints apart never lands them back on the same pixel — the guard
    silently never triggered on an odd axis and let through exactly the
    1px swipes 0.4.0 had just declared it refuses (`402x874` triggers
    the guard on both axes; `393x852` triggers only on its even axis;
    `375x667`, both axes odd, never triggers at all). The predicate is
    now "distance below a measured floor" rather than "coordinates
    equal" (details above).
  - `minValidRatio` inherited the same defect: it reported the smallest
    ratio whose *endpoints differ* (2px on an even axis, 1px on an odd
    one), not the smallest ratio that actually moves the screen — a
    value that itself measured **0 out of 3** for moving anything.
    `minValidRatio` now reports the smallest ratio clearing the measured
    floor, so re-submitting the value it returns actually succeeds.
  - The 0.4.0 `-scrolled` fix compared `window.scrollY` before and after
    `scrollIntoView`, which missed an element scrolling inside an
    `overflow:auto` **container**: the container visibly moved but
    `window.scrollY` never changed, so the response wrongly reported
    `native` (no movement) — a regression against the pre-0.4.0 build,
    introduced while fixing the original over-reporting defect. The
    oracle now compares the target element's own
    `getBoundingClientRect()` (details above).
  - Separately, an adjacent defect surfaced during the 0.5.0 audit:
    `--duration` had no upper bound, so `--duration 1e24` hung the
    command indefinitely (a forced kill was required). A 60,000 ms
    (60s) ceiling — a design choice, not a measurement — now rejects it
    as `INVALID_DURATION` (details above).
- **A platform-independent movement threshold shipped as a defect,
  found the first time a real Android device was connected**
  (SPEC-GESTURE-001 amendment 0.6.0). `MIN_EFFECTIVE_SWIPE_PX` — the
  11pt floor the 0.5.0 amendment above measured and shipped — was a
  single constant used by both platforms. On a real Samsung SM-S938N
  (Android 16, 600 dpi), 11px never once moved the screen (0 out of 5
  vertical trials, 0 out of 6 horizontal): the device's actual touch
  slop was roughly three times larger. This means every `AMOUNT_TOO_SMALL`
  response `scroll` had ever sent on Android recommended a
  `minValidRatio` that, fed back, would not have moved the screen
  either — the same "error code returns a value that reproduces the
  defect it exists to prevent" failure shape the 0.5.0 amendment closed
  for iOS, reappearing on the platform it had never been checked
  against.
  - `DeviceBackend` gains a 10th method,
    `getMinEffectiveSwipeThreshold(serial)`, implemented additively by
    all three concrete backends (`AdbBackend`, `IdbBackend`, and the
    `BackendRegistry` facade) — the existing 9 methods are unchanged.
    `AdbBackend` queries `wm density` on the connected device at call
    time and derives `floor(8dp × density) + 2px` (8dp is Android's own
    documented touch-slop constant); `IdbBackend` returns the measured
    11pt constant unchanged, with no device query at all. The interface
    deliberately asks for the *threshold*, not the device's density —
    exposing density would force the iOS backend to fabricate a
    `dp × density` rule for a value that was never measured that way.
  - The response now carries `details.minValidRatioBasis`
    (`"device-query"` | `"measured-constant"`) alongside
    `minValidRatio`, so a caller can tell whether the number came from
    the device it is actually driving or from a constant measured on a
    different device entirely — seeded by the exact shape of this
    defect: a wrong number and a right number looked identical until
    now.
  - This also promotes **AC-GEST-006 (Android real-device swipe) from
    PARTIAL to PASS**: the two conditions this project had withheld
    promotion on — `adb` installed, and a device connected — are both
    now satisfied, and a real device confirmed `swipe` and `scroll`
    moving the screen (see the `adb`-not-installed correction below).
  - Separately, this amendment corrects a claim this SPEC's own
    reasoning had made about *why* the guard above is needed: a
    sub-threshold swipe was assumed to most likely do nothing. **It does
    not** — Android interprets a drag shorter than the touch slop as a
    **tap**, activating whatever sits under the starting point.
    Repeated short swipes on a device's Settings screen were observed
    to open a pairing bottom sheet, including on an element the
    normalized element tree itself reported as `tappable: false`. This
    makes the `AMOUNT_TOO_SMALL` rejection *more* necessary, not less —
    it prevents an unintended tap, an irreversible side effect, not
    merely a wasted call — while it also means every threshold
    measurement (this SPEC's and any future one) must distinguish "the
    screen didn't move" from "a tap fired," a distinction the original
    11pt measurement did not need to make only because its test page
    happened to have nothing tappable at the swipe's start point.
  - A separate, unrelated claim is also corrected here: earlier releases
    of this file and the README stated `adb` was "not installed" on the
    machine this SPEC was built on. That was an overgeneralization —
    `adb` **was** installed, just not on `PATH` (`command -v adb` tests
    reachability, not presence). The CLI itself calls the `adb` binary
    by name and therefore cannot see it either way in that
    configuration, so the practical guidance (`adb` must be on `PATH`
    for this CLI to find it) is unchanged, but the "not installed"
    wording itself was inaccurate and is corrected everywhere it
    appeared.
- **Android's derived touch-slop floor read the wrong `wm density` line
  once a device's Display size was changed — the third time this SPEC
  has found and closed a defect in the same "reports success with no
  effect, or with an unintended effect" family** (SPEC-GESTURE-001
  amendment 0.7.0). The first two times were an independent post-close
  audit (0.4.0/0.5.0 above) and a real Android device (0.6.0 above);
  this time it was a follow-up measurement of a question the SPEC had
  knowingly left open. The 0.6.0 amendment above derived Android's floor
  from `wm density`'s `Physical density:` line. `wm density` also
  reports a second `Override density:` line whenever a device's Display
  size setting has been changed, and it is that value — not
  `Physical density:` — that actually governs the OS's own touch-slop
  behavior. Reading only `Physical` derives a floor that can sit
  *below* the real slop when the display is set to an enlarged size,
  and a `scroll` inside that gap is not a no-op: it is accepted, sent,
  and Android interprets it as a **tap** on whatever sits under the
  starting point (see the tap warning under the `swipe` entry above).
  With the user's consent, the same device's Display size was
  temporarily changed and measured, then restored: `Physical 600` alone
  still derives 32px (unchanged); `Physical 600` with a shrunk
  `Override 480` moved the screen at 25px 4 out of 6 times, which would
  have been impossible if a Physical-only 30px slop actually governed.
  The derivation now reads whichever line actually governs, falling
  back to `Physical density:` when no `Override` line is present. This
  closes the SPEC's own open question, but only partway: the measurement
  pins the shrunk-display slop down to a range (`[22, 25)` px, from
  three tried distances) rather than to a single pixel, and it did not
  measure the *enlarged*-display direction at all — the direction that
  actually matters, since that is the direction that can push the
  derived floor below the real slop. The enlarged-display floor this
  CLI ships today is derived from Android's own documented touch-slop
  rule, not from a direct measurement of an enlarged-display device.
- **`tap --web`'s scroll-into-view oracle sampled the page before an
  animated scroll had actually finished**, silently degrading a native
  touch into the JS `click()` fallback and failing to report `-scrolled`
  for a scroll that genuinely happened (SPEC-GESTURE-001 amendment
  0.7.0, found by an independent review). On a page or container
  declaring CSS `scroll-behavior: smooth`, `scrollIntoView` returns
  before its scroll animation completes; the element-rect comparison
  the 0.5.0 amendment introduced re-measured the rect immediately,
  reading the pre-scroll position even though the container
  demonstrably scrolled moments later (measured: `containerScrollTop`
  unchanged immediately after the call, then changed roughly 11 seconds
  afterward). The call now forces
  `scrollIntoView({block: "center", behavior: "instant"})`, ignoring the
  page's own `scroll-behavior` deliberately — the point of this scroll
  is a trustworthy coordinate, not animation fidelity — so the
  rectangle sampled right after the call always reflects the true
  post-scroll position.
- **A 0.8.0 amendment clears carried-over review debt — it adds no new
  capability or requirement.** A fifth independent review found zero
  must-fix defects and, for the first time across five rounds, agreed
  with every acceptance-criteria claim; its only remaining note was that
  several one-to-three-line carried findings kept surviving open
  documentation passes instead of being swept. This amendment closes
  that list in one pass rather than deferring it again:
  - On a screen where **no ratio at all clears the movement floor** —
    even a full-screen `--amount 1` — the `AMOUNT_TOO_SMALL` response no
    longer includes `minValidRatio`/`minValidRatioBasis`, rather than
    recommending a value that would itself be rejected if retried.
    Callers must handle both fields being absent. The rejection itself
    and the no-gesture-sent guarantee are unchanged.
  - `scrollIntoView({block: "center", behavior: "instant"})` (introduced
    by the 0.7.0 amendment above) is now wrapped in a `try`/`catch`: a
    WebKit build that predates the `"instant"` enum value (Safari <
    17.4) throws rather than ignoring it, which could otherwise fail the
    whole command. The fallback re-issues the call with no `behavior`
    argument, which is an improvement over failing outright, not an
    equivalent to the primary call — see the README for why a
    smooth-scrolling page can still reopen the async-sampling defect the
    0.7.0 amendment closed, on this narrower fallback path only. This
    codebase's SPEC deliberately declares no minimum WebKit/iOS version,
    so this fallback is the mitigation rather than a version check.
  - An acceptance criterion's own test-double count (`.moai/specs/SPEC-GESTURE-001/acceptance.md`,
    AC-GEST-027) had drifted from its own implementation — it read "4
    files / 7 sites" after later milestones had grown the actual count
    to 6 files / 9 sites, and this was flagged by an independent review
    but survived one documentation pass uncorrected. Now corrected to
    the count the implementation actually has.
  - The Android post-scroll settle delay (see the `scroll` entry above)
    had been recorded only in the SPEC's run log, not in the SPEC body
    itself; it is now recorded there too.
  - The `minValidRatioBasis: "device-query"` wording (README, see the
    0.6.0 amendment above) described Android's derived floor as a value
    *read from* the connected device. It is not — it is a fixed platform
    rule (`floor(8dp × density) + 2px`) with one free parameter (the
    device's density) supplied by a query at call time. The response
    field, its two values, and their meaning are all unchanged; only the
    prose describing the `"device-query"` value is corrected.
- **Two `ok:true`-with-no-observable-effect defects found finishing the
  Android real-device round, plus a third exposed while fixing the
  second** (SPEC-ANDROID-001 amendment 0.3.0). The 2026-07-29 pass that
  verified every remaining Android command against a real Samsung
  SM-S938N (Android 16) found both defects; neither was reachable by the
  unit/mock suite, which can only assert the shape of the `adb` command
  line, not how the device resolves or times it:
  - **`launch <package>` failed for apps whose launcher activity does
    not declare `android.intent.category.DEFAULT`.** `launchApp` sent
    `am start -a MAIN -c LAUNCHER -p <package>`, and `-p` is *implicit*
    intent resolution, which only matches an activity declaring
    `DEFAULT`. Measured: `com.android.settings` (`isDefault=true`)
    opened; Samsung's Calculator and Clock (neither declares it) both
    failed with `BACKEND_COMMAND_FAILED`, even though both are
    installed, resolve a launcher activity fine, and open when tapped by
    hand. `launchApp` now resolves the package's launcher component
    first (judged by stdout — `No activity found` on failure, exit code
    0 either way, so exit-code-based judging would have misread success)
    and starts that component *explicitly* (`am start -n <component>`),
    the same way the real launcher does. A resolve failure now returns a
    dedicated `LAUNCHER_ACTIVITY_NOT_FOUND` code, distinct from the
    generic `BACKEND_COMMAND_FAILED`, with no start intent sent; because
    "no launcher activity" and "package not installed" produce
    byte-identical resolve output, the message states both possibilities
    rather than guessing which one occurred. Task-resume semantics are
    unchanged — launching an already-foreground app still brings its
    existing task forward (a warning line, exit 0, `ok:true`) instead of
    starting a new instance.
  - **Non-ASCII `text` silently sent nothing when ADBKeyBoard had to be
    installed in the same call.** `ime set` returns as soon as the
    setting is *recorded*, not once the IME service is actually bound,
    and a base64 broadcast fired into that window was dropped —
    the command still returned `ok:true` with nothing landing in the
    focused field. This hit the first Korean/emoji input after `doctor`
    and every self-heal install after a `reset` (which uninstalls
    ADBKeyBoard), so it was not a rare state. `text` now polls
    `dumpsys input_method` for `mBoundToMethod=true` before
    broadcasting, with a bounded 5-second wait (a design ceiling, not a
    measurement); on timeout it now sends nothing and returns
    `ok:false` with a new `IME_BIND_TIMEOUT` code — **a deliberate
    response-contract change**: a call that previously returned
    `ok:true` on this path now returns `ok:false`, chosen because the
    old behavior was already broken and a loud failure is preferable to
    a silent one. The already-tracked original-IME disk persistence for
    `reset`/`doctor --clean` is unaffected either way, including on the
    timeout path. The warm path (IME already ADBKeyBoard and bound) is
    unchanged — it still sends immediately with no wait.
  - **A third, quieter defect surfaced one step earlier while verifying
    the fix above**: right after a fresh ADBKeyBoard install, `ime
    enable` could itself fail with `Unknown input method
    com.android.adbkeyboard/.AdbIME cannot be enabled for user #0`,
    because the input-method service had not yet registered the
    just-installed IME — a transient registration race, not a
    missing-package error (the package had, in fact, just finished
    installing, confirmed by `pm list packages` going 0 → 1). Unlike the
    two defects above, this failure was never silent — it already
    returned `ok:false` with a clear message — so the fix is a narrower,
    bounded retry (up to 4 attempts, 500ms apart) scoped to that exact
    failure shape only; any other `ime enable` failure (permissions, API
    level, device state) still surfaces immediately with zero retries,
    so a real failure is never masked behind a retry loop, and no new
    error code was introduced. Measured baseline before the fix: 3
    failures in 8 consecutive cold attempts with a focused input field
    (0 failures in 11 attempts without focus); after the fix, 8
    consecutive cold-with-focus attempts all landed their text with zero
    natural `ime enable` failures — evidence the frequency dropped
    below a calculable level, not proof the race is gone.
  - 690 tests now pass (up from 653), including mock coverage for the
    two new pure-function parsers (launcher-resolve output, IME-binding
    readiness) and the retry predicate, plus the explicit-launch,
    bind-wait, and bounded-retry code paths. All three defects above
    were reachable only on real hardware; see
    `.moai/specs/SPEC-ANDROID-001/progress.md` for the verbatim device
    evidence and `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md`
    for the original defect report.
- **A defect that erased its own input, and an error message that named a
  false device count** (SPEC-ANDROID-001 amendment 0.4.0). Closing out the
  0.3.0 amendment the same day, changing the venue rather than repeating
  it — a Chrome web page instead of the Settings app, and two connected
  devices (an Android phone plus a booted iOS simulator) instead of one —
  surfaced two more real-device defects:
  - **`text` erased the very string it had just typed, on a Chrome web
    page input.** After sending, `text` dismisses the soft keyboard by
    sending `KEYCODE_ESCAPE` (111); on a native `EditText` this only hides
    the keyboard, which is why every prior real-device check (all against
    the Settings app) had passed. On a Chrome page, ESCAPE is delivered to
    the page itself, where it is the browser's own input-cancel key — a
    three-step isolation confirmed ESCAPE alone was responsible: text
    landed and stayed after typing, then vanished back to the placeholder
    the moment a bare `keyevent 111` was sent with nothing else happening.
    `hideKeyboard` now sends `KEYCODE_BACK` (4) instead, which dismisses
    the keyboard on both a web input and a native `EditText` while
    preserving the typed text on both surfaces. Because an unconsumed BACK
    could plausibly be read as real navigation when no keyboard is up, the
    keycode is now sent only after confirming `dumpsys input_method`
    reports `mInputShown=true` — a precautionary guard, not one forced by
    measurement: the one real-device trial with the keyboard already
    hidden did not observe navigation, but a single trial doesn't
    establish that it never would either. Best-effort semantics are
    unchanged either way — a failed visibility probe or a failed hide
    keycode still leaves `text` at `ok:true`, and `--keep-keyboard` still
    skips the probe entirely.
  - **An unconnected device counted as connected, so error messages named
    a false device count and a documented auto-select path could never
    fire.** `resolveTargetDevice` never read `connectionState`, so
    counting, auto-selection, and error messages all used the raw device
    list length. On a Mac with Xcode installed, that list includes every
    registered-but-not-booted iOS simulator — on the machine this was
    found on, 23 entries total, only 2 actually connected. The
    `AMBIGUOUS_DEVICE` message read `23 devices connected`, which was
    false — the envelope's `ok:false` was honest, but the message's own
    claim wasn't. Auto-select ("omit `--device` when exactly one device is
    connected") was likewise unreachable on any such machine, since the
    raw list length is never 1. A device now counts as connected only when
    its `connectionState` is `"device"`; counting, auto-select, and error
    `details.availableDevices` all use that filtered set, and disconnected
    entries are summarized only by count (`disconnectedCount`), never
    dumped in full. Naming a serial that exists in the list but isn't
    connected now returns a dedicated `DEVICE_NOT_CONNECTED` — distinct
    from `DEVICE_NOT_FOUND` (absent from the list entirely) — before any
    backend command runs; naming a serial genuinely absent from the list
    still returns `DEVICE_NOT_FOUND` unchanged. `devices` itself is
    untouched and still lists every entry, connected or not — the fix
    narrows only the targeting layer, not the inventory command.
  - 702 tests now pass (up from 690), including new pure-function coverage
    for the device-targeting filter (`src/cli/device-targeting.test.ts`)
    and the keyboard-hide/visibility-guard paths
    (`src/backend/adb-backend.test.ts`). Unlike the 0.3.0 defects above,
    the device-targeting fix is judged entirely by unit tests —
    `resolveTargetDevice` is a pure function over `DeviceInfo[]`, so no
    device interpretation, timing, or screen effect is involved; only the
    keyboard-erasure fix needed real-hardware confirmation (Galaxy S25
    Ultra SM-S938N, against both a Chrome web input on `m.naver.com` and a
    native Settings search field). See
    `.moai/specs/SPEC-ANDROID-001/progress.md` for the verbatim device
    evidence.

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
  implementation is still unit/mock-verified only. (Later updated by
  SPEC-GESTURE-001's 0.6.0 amendment: `devices`/`screenshot`/`dump`/
  `launch`/`swipe`/`scroll` are since confirmed on a real device;
  `tap`/`text`/`key`/`stop`/`doctor`/`reset` remain unit/mock-verified
  only — see the SPEC-GESTURE-001 entries above.)
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
- `scroll` cannot confirm the screen actually moved — like `swipe`, it
  sends the gesture and returns; the caller re-`dump`s to check
  (SPEC-GESTURE-001 §C.3, a deliberate design decision — judgment stays
  with the caller, not the CLI). A duration-less swipe was found during
  development to be a **silent no-op** on a real simulator — `scroll`
  reported success but the page never moved until an explicit ~500ms
  duration was used — so `scroll` always sends a fixed internal
  duration on the caller's behalf; it is not configurable and is not
  part of the command's documented contract.
- The `--web` proxy session (SPEC-WEBVIEW-001) remains unstable across
  separate CLI invocations, independent of SPEC-GESTURE-001's own
  changes: repeated `dump --web`/`tap --web` calls in quick succession
  were found to alternate between success, `AMBIGUOUS_PAGE`,
  `NO_WEB_PAGE`, and (once) `WEB_INSPECTOR_UNREACHABLE`, even against a
  single browser tab, and this has cost real verification time across
  more than one independent session. Passing `--page <n>` explicitly and
  spacing calls roughly five seconds apart was the most reliable
  mitigation found; when a call still wedges, killing the proxy directly
  (`pkill -f ios_webkit_debug_proxy`) and retrying was the recovery used
  during the 0.8.0 amendment's own verification. The root cause (proxy
  attach/detach timing, not only page-count ambiguity) is out of
  SPEC-GESTURE-001's scope and is recorded here, and now also in the
  README's `--web` reference itself, so it is not rediscovered as new.
- Recorded as **33 PASS / 1 PARTIAL / 0 FAIL across 34 acceptance
  criteria** in `.moai/specs/SPEC-GESTURE-001/progress.md` (34 = the
  original 17, plus 4 added by the 0.4.0 amendment (AC-GEST-018 through
  021), plus 4 added by the 0.5.0 amendment (AC-GEST-022 through 025),
  plus 4 added by the 0.6.0 amendment (AC-GEST-026 through 029), plus 3
  added by the 0.7.0 amendment (AC-GEST-030 through 032), plus 2 added
  by the 0.8.0 amendment (AC-GEST-033 and 034)).
  AC-GEST-006 (Android real-device swipe) is now **PASS**, promoted by
  the 0.6.0 amendment above — a real Android device connected and `adb`
  turned out to be installed (see above), so the condition this project
  had withheld promotion on is satisfied. The one remaining PARTIAL is
  AC-GEST-020 (the `--duration` omission reliability measurement, which
  is intermittent by nature and so is recorded as a measured rate rather
  than a pass/fail verdict). AC-GEST-021 (the `-scrolled` evidence fix
  from the 0.4.0 amendment) is confirmed by unit tests reproducing the
  exact defect condition, but its real-device reproduction was never
  completed — recorded as an open gap rather than claimed as verified.
  AC-GEST-032 (the last of the 0.7.0 amendment's three) checks whether
  this file's and the README's own wording overstates what was
  measured — the corrections made in this same documentation pass are
  what satisfy it. AC-GEST-033 (the Android measurement-timing
  discipline) and AC-GEST-034 (`minValidRatio` never recommending a
  value it would itself reject) are both satisfied by the 0.8.0
  amendment's own changes above.
