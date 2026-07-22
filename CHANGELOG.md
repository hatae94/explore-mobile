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
- iOS/idb support (SPEC-02), WebView/DOM recognition (SPEC-03), the
  exploration loop (SPEC-04), and the Codex wrapper (SPEC-05) are
  committed roadmap items, not yet implemented.
