/**
 * `IdbBackend` — the SPEC-IOS-001 concrete `DeviceBackend` (SPEC-ANDROID-001
 * M1 interface) implementation, wrapping `idb` subprocess calls to control
 * iOS Simulators. Implements all 8 methods (REQ-IOS-BACKEND-001), proving
 * the interface is thin enough to be backend-swappable exactly as
 * SPEC-ANDROID-001 designed it to be (REQ-IOS-ARCH-005).
 *
 * Every idb command's exact argv/output shape below follows design.md §B.
 * The three shapes plan.md §B.0 deferred to Run-phase — `list-targets --json`
 * field names, the `--udid` flag + describe-all/screenshot argument shape, and
 * `ui key`'s HID codes — were confirmed against fb-idb 1.1.7 and a booted
 * iPhone 17 Pro (iOS 26.0) on 2026-07-26, and all three turned out to differ
 * from the assumption: the listing is JSONL rather than a JSON array, the
 * emulator discriminator is `type` rather than `target_type`, and `screenshot`
 * requires a `dest_path` positional. That the fix was confined to this file's
 * argv construction and field parsing — with no change to the `DeviceBackend`
 * interface or the command layer — is the isolation working as designed.
 *
 * @MX:ANCHOR — this is SPEC-IOS-001's iOS implementation of the
 * device-backend interface contract (spec.md §A.4, REQ-ARCH-003,
 * REQ-IOS-ARCH-005). Every CLI command that targets an iOS device depends
 * on this class's method surface staying compatible with `DeviceBackend`.
 * @MX:REASON — `AdbBackend` is the reference implementation this class
 * must match structurally; both implement the exact same 8-method
 * interface so the backend registry (`registry.ts`) can swap between them
 * transparently.
 */

import type { CommonElement } from "../schema/common-element.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { isKeyAlias, type KeyAlias } from "../schema/key-alias.js";
import type { IdbExecResult, IdbExecutor } from "./idb-executor.js";
import { spawnIdb } from "./idb-executor.js";
import { IdbCommandFailedError, UnsupportedKeyOnIosError } from "./idb-errors.js";
import { IOS_HID_KEYCODE } from "./keycodes-ios.js";
import { parseIdbTargets } from "./idb-target-parse.js";
import type { ClipboardWriter } from "./idb-clipboard.js";
import { simctlPbcopy } from "./idb-clipboard.js";
import { normalizeIdbAccessibility } from "../normalize/idb.js";

/**
 * One raw `idb list-targets --json` target entry, CONFIRMED against fb-idb
 * 1.1.7 + a booted iPhone 17 Pro simulator (SPEC-IOS-001 run-phase
 * verification, 2026-07-26). Real keys observed:
 * `{name, udid, state, type, os_version, architecture}` — note `type`, NOT
 * the `target_type` this originally assumed (research.md §3.1).
 */
interface RawIdbTarget {
  udid?: unknown;
  name?: unknown;
  os_version?: unknown;
  state?: unknown;
  type?: unknown;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Maps an idb simulator `state` string to the shared `DeviceConnectionState`
 * enum (Android-originated, but generalizes: "actively usable" -> "device",
 * anything else -> "offline"). A booted simulator is the iOS equivalent of
 * an Android device in the "device" state.
 */
function mapConnectionState(state: unknown): DeviceInfo["connectionState"] {
  return stringField(state).toLowerCase() === "booted" ? "device" : "offline";
}

function toDeviceInfo(raw: RawIdbTarget): DeviceInfo {
  return {
    serial: stringField(raw.udid),
    model: stringField(raw.name),
    osVersion: stringField(raw.os_version),
    connectionState: mapConnectionState(raw.state),
    isEmulator: stringField(raw.type).toLowerCase() === "simulator",
    platform: "ios",
  };
}

/**
 * Every character `idb ui text` can encode: fb-idb 1.1.7's `KEY_MAP`
 * (`idb/common/hid.py`) holds exactly the 95 printable ASCII characters plus
 * newline, and `text_to_events` raises `No keycode found for <char>` for
 * anything else. Verified by reading KEY_MAP out of the installed module.
 */
const IDB_TYPABLE_PATTERN = /^[\x20-\x7E\n]*$/;

/** HID usage codes for the paste chord (Left GUI = Command, and V). */
const HID_LEFT_GUI = 227;
const HID_V = 25;

/**
 * `idb` has no chord/modifier command — `ui key` presses one code at a time —
 * so the paste chord is produced by holding Command with `--duration` in one
 * invocation while a second invocation presses V. Measured on this toolchain,
 * one `idb` invocation costs ~130-190 ms end to end, so V is pressed ~750 ms
 * into a 2 s hold: comfortably clear of both edges.
 */
const MODIFIER_HOLD_SECONDS = 2;
const PASTE_KEY_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Throws IdbCommandFailedError (carrying stderr) when the invocation failed. */
function assertSuccess(result: IdbExecResult, context: string): void {
  if (result.exitCode !== 0) {
    const stderrText = result.stderr.toString("utf-8").trim();
    throw new IdbCommandFailedError(
      stderrText.length > 0
        ? `idb ${context} failed (exit ${result.exitCode}): ${stderrText}`
        : `idb ${context} failed (exit ${result.exitCode})`,
    );
  }
}

export class IdbBackend implements DeviceBackend {
  constructor(
    private readonly exec: IdbExecutor = spawnIdb,
    private readonly writeClipboard: ClipboardWriter = simctlPbcopy,
    /** Injectable so unit tests need not wait out the real inter-keystroke gap. */
    private readonly pasteKeyDelayMs: number = PASTE_KEY_DELAY_MS,
  ) {}

  /**
   * @MX:NOTE — the `list-targets --json` DEFER assumption (research.md §3.1,
   * plan.md §B.0) is now RESOLVED against fb-idb 1.1.7 + a real booted
   * simulator: the output is JSONL (one object per line, NO wrapping array)
   * and the emulator discriminator is `type`, not `target_type`. Document-
   * shape handling lives in `parseIdbTargets` (shared with IdbDoctor); this
   * method only maps fields.
   */
  async listDevices(): Promise<DeviceInfo[]> {
    const result = await this.exec(["list-targets", "--json"]);
    assertSuccess(result, "list-targets --json");

    // Runtime boundary guard (Secured): unparseable idb output degrades to an
    // empty list rather than throwing (REQ-IOS-ARCH-003 spirit — never let one
    // backend's output shape drift crash the whole CLI).
    return parseIdbTargets(result.stdout.toString("utf-8")).map((entry) => toDeviceInfo(entry as RawIdbTarget));
  }

  /**
   * REQ-IOS-BACKEND-003: collects `idb ui describe-all` JSON and returns
   * it already normalized to CommonElement[] via the idb normalizer —
   * mirrors AdbBackend.dumpUiHierarchy's internal-normalization contract
   * (REQ-IOS-SCHEMA-002/003).
   *
   * @MX:NOTE — the `--udid <serial>` flag and this argv were confirmed
   * verbatim against fb-idb 1.1.7 + an iOS 26.0 simulator (2026-07-26):
   * `describe-all` returns a FLAT JSON array (no `children` key anywhere), the
   * enabled field is `enabled` (not `isEnabled`), and `AXTraits` does not
   * exist — which is why the normalizer derives `tappable` from type/role.
   * @MX:WARN — the returned tree covers only NATIVE UI. With a web page loaded
   * in Safari, `describe-all` returns the browser chrome alone (6 elements) and
   * nothing from the page itself, so selector-based targeting cannot reach web
   * content; that is SPEC-03 (webview DOM via CDP/iwdp) territory.
   * @MX:REASON — a caller that assumes `dump` sees everything on screen will
   * silently find no elements on a web page and fall back to blind coordinate
   * taps.
   */
  async dumpUiHierarchy(serial: string): Promise<CommonElement[]> {
    const result = await this.exec(["ui", "describe-all", "--udid", serial, "--json"]);
    assertSuccess(result, "ui describe-all");

    const stdout = result.stdout.toString("utf-8").trim();
    if (stdout.length === 0) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return [];
    }

    return normalizeIdbAccessibility(parsed);
  }

  /**
   * @MX:NOTE — `dest_path` is a REQUIRED positional for `idb screenshot`
   * ("The destination file path to write to or - (dash) to write to stdout",
   * confirmed via `idb screenshot --help`, fb-idb 1.1.7). Omitting it — as the
   * original DEFER assumption did — makes idb exit non-zero on argparse, so
   * `-` is passed to keep the no-disk-residue stdout contract this method
   * shares with AdbBackend's `exec-out screencap`.
   */
  async screenshot(serial: string): Promise<Uint8Array> {
    const result = await this.exec(["screenshot", "--udid", serial, "-"]);
    assertSuccess(result, "screenshot");
    return result.stdout;
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    const result = await this.exec(["ui", "tap", "--udid", serial, String(x), String(y)]);
    assertSuccess(result, "ui tap");
  }

  /**
   * REQ-IOS-BACKEND-006 (AMENDED after real-simulator verification): idb's
   * `ui text` is NOT Unicode-native. It encodes each character through a fixed
   * US-keyboard table and fails outright on anything outside printable ASCII
   * (`No keycode found for 네`), so Korean and emoji cannot be typed with it.
   * ASCII keeps the direct one-call path; everything else goes through the
   * device pasteboard and a Command-V chord. Still far simpler than Android:
   * no ADBKeyBoard APK, no GPL download, no base64 broadcast, no disk-persisted
   * per-serial IME session to restore.
   *
   * `options.hideKeyboardAfter` has no iOS equivalent action, so it is
   * accepted but ignored (an observable no-op, never an error) rather than
   * rejected as an unknown option.
   *
   * @MX:WARN — the ASCII path is at the mercy of the simulator's ACTIVE
   * keyboard layout: with a Korean layout selected, `ui text "naver"` silently
   * lands as `ㅜㅁㅍㄷㄱ` instead of failing.
   * @MX:REASON — observed on a ko_KR simulator during SPEC-IOS-001
   * verification. idb exposes no way to read or set the active input mode
   * (Caps Lock / HID 57 toggles it blindly, with no readable state), so this
   * cannot currently be detected or corrected here; the paste path below is
   * immune because pasting bypasses the keyboard entirely.
   */
  async inputText(serial: string, text: string, _options?: { hideKeyboardAfter?: boolean }): Promise<void> {
    if (IDB_TYPABLE_PATTERN.test(text)) {
      const result = await this.exec(["ui", "text", "--udid", serial, text]);
      assertSuccess(result, "ui text");
      return;
    }
    await this.pasteText(serial, text);
  }

  /**
   * Unicode text input: put the text on the device pasteboard, then paste it
   * with Command-V. Verified against a booted simulator with `"네이버 한글 🎉"`.
   */
  private async pasteText(serial: string, text: string): Promise<void> {
    await this.writeClipboard(serial, text);

    const hold = this.exec([
      "ui",
      "key",
      "--udid",
      serial,
      "--duration",
      String(MODIFIER_HOLD_SECONDS),
      String(HID_LEFT_GUI),
    ]);
    // The hold runs concurrently with the V keystroke below, so attach a no-op
    // handler now to keep a hold failure from surfacing as an unhandled
    // rejection during the delay. The real result is awaited (and rethrown)
    // after the paste key, so no error is swallowed.
    hold.catch(() => undefined);

    await delay(this.pasteKeyDelayMs);
    const paste = await this.exec(["ui", "key", "--udid", serial, String(HID_V)]);
    const holdResult = await hold;

    assertSuccess(paste, "ui key (paste V)");
    assertSuccess(holdResult, "ui key (hold Command)");
  }

  /**
   * REQ-IOS-BACKEND-007: rejects an alias with no iOS HID keycode mapping
   * with `UnsupportedKeyOnIosError` (graceful reject, never a silent
   * no-op) — no idb invocation is attempted for an unsupported alias.
   */
  async sendKeyEvent(serial: string, keyName: string): Promise<void> {
    if (!isKeyAlias(keyName)) {
      throw new Error(`Unsupported key alias '${keyName}'.`);
    }
    const alias = keyName as KeyAlias;
    const hidCode = IOS_HID_KEYCODE[alias];
    if (hidCode === undefined) {
      throw new UnsupportedKeyOnIosError(
        `Key alias '${alias}' has no iOS HID keycode mapping — no hardware-keyboard equivalent exists on iOS.`,
      );
    }

    const result = await this.exec(["ui", "key", "--udid", serial, String(hidCode)]);
    assertSuccess(result, "ui key");
  }

  async launchApp(serial: string, bundleId: string): Promise<void> {
    const result = await this.exec(["launch", "--udid", serial, bundleId]);
    assertSuccess(result, "launch");
  }

  async stopApp(serial: string, bundleId: string): Promise<void> {
    const result = await this.exec(["terminate", "--udid", serial, bundleId]);
    assertSuccess(result, "terminate");
  }
}
