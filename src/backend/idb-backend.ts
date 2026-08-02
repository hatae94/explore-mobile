/**
 * `IdbBackend` — the SPEC-IOS-001 concrete `DeviceBackend` (SPEC-ANDROID-001
 * M1 interface) implementation, wrapping `idb` subprocess calls to control
 * iOS Simulators. Implements all 10 methods (REQ-IOS-BACKEND-001; `swipe`
 * added SPEC-GESTURE-001 M1, `getMinEffectiveSwipeThreshold` added M8),
 * proving the interface is thin enough to be backend-swappable exactly as
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
 * must match structurally; both implement the exact same 10-method
 * interface so the backend registry (`registry.ts`) can swap between them
 * transparently.
 */

import type {
  DeviceBackend,
  DeviceInfo,
  ScreenSize,
  SwipeOptions,
  SwipePoint,
  SwipeThreshold,
} from "../schema/device-backend.js";
import { isKeyAlias, type KeyAlias } from "../schema/key-alias.js";
import type { IdbExecResult, IdbExecutor } from "./idb-executor.js";
import { spawnIdb } from "./idb-executor.js";
import { IdbCommandFailedError, UnsupportedKeyOnIosError } from "./idb-errors.js";
import { IOS_HID_KEYCODE } from "./keycodes-ios.js";
import { parseIdbTargets } from "./idb-target-parse.js";
import type { ClipboardWriter } from "./idb-clipboard.js";
import { simctlPbcopy } from "./idb-clipboard.js";

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

/**
 * Measured constant — NOT derived from any per-device query
 * (REQ-GEST-SCROLL-007/008, SPEC-GESTURE-001 M7 measured it, M8 relocates
 * it here as the iOS-specific `SwipeThreshold` source; this is a TRANSFER
 * of the constant, not a re-measurement — its origin is still the M7
 * measurement recorded in spec.md §C.1-⑭). iOS's 11pt was measured
 * directly in the pt coordinate system on ONE simulator
 * (D0B3A18C-E485-4E7C-A25E-504BF4CA6163, iPhone 17 Pro, iOS 26.0) — it is
 * NOT a `dp × density` product, so applying that formula here would
 * invent an unmeasured iOS platform rule (spec.md §D, REQ-GEST-SCROLL-008).
 * `getMinEffectiveSwipeThreshold` below returns this value UNCHANGED and
 * performs NO device query — AC-GEST-026/027 require exactly that.
 *
 * @MX:NOTE: [AUTO] 11이라는 값 자체는 M7의 실측(세로 15/15, 가로 10/10 @ 11pt)에서 나왔다(spec.md §C.1-⑭) -- 이 상수는 그 값의 이전(移轉)이지 재측정이 아니다
 */
const MEASURED_MIN_EFFECTIVE_SWIPE_PX = 11;

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

  /**
   * REQ-GEST-SWIPE-001/002/004 (SPEC-GESTURE-001 M1, additive 9th method):
   * `idb ui swipe --udid <serial> x1 y1 x2 y2 [--duration <seconds>]`.
   *
   * @MX:WARN — `idb`'s `--duration` is SECONDS (float), not milliseconds —
   * confirmed against fb-idb's `hid.py` (`duration: Optional[float]`), and
   * this file already depends on that unit elsewhere (`MODIFIER_HOLD_SECONDS
   * = 2` passed as `--duration 2` for a 2-second modifier hold, above).
   * The CLI's single contract unit is milliseconds (spec.md §C.1-⑦), so
   * `options.durationMs` is converted to seconds HERE, before argv is
   * built. Passing ms straight through (as `AdbBackend.swipe` correctly
   * does for `adb`) would silently turn `--duration 500` into a
   * 500-SECOND swipe on iOS.
   * @MX:REASON — this exact ms/seconds asymmetry is the defect
   * SPEC-GESTURE-001 was written to close (spec.md §C.1-⑦, AC-GEST-002);
   * omitting the conversion has no type error and no runtime error — it
   * just silently sends the wrong duration.
   *
   * The `--duration` token pair is appended AFTER the four coordinate
   * positionals (never interleaved between them, AC-GEST-002) — Python's
   * `argparse` does not reliably accept an optional flag interleaved
   * between positionals.
   */
  async swipe(serial: string, from: SwipePoint, to: SwipePoint, options?: SwipeOptions): Promise<void> {
    const args = ["ui", "swipe", "--udid", serial, String(from.x), String(from.y), String(to.x), String(to.y)];
    if (options?.durationMs !== undefined) {
      args.push("--duration", String(options.durationMs / 1000));
    }
    const result = await this.exec(args);
    assertSuccess(result, "ui swipe");
  }

  /**
   * REQ-GEST-SCROLL-007/008 (SPEC-GESTURE-001 M8, additive 10th method):
   * returns the measured constant UNCHANGED, performing NO device query —
   * `_serial` is accepted only to satisfy the shared `DeviceBackend`
   * signature. AC-GEST-026/027 fail this method the moment it queries idb
   * for anything density-shaped: iOS's 11pt was measured directly in the
   * pt coordinate system on a DIFFERENT device and is never re-derived
   * here (see `MEASURED_MIN_EFFECTIVE_SWIPE_PX`).
   */
  async getMinEffectiveSwipeThreshold(_serial: string): Promise<SwipeThreshold> {
    return { minEffectiveSwipePx: MEASURED_MIN_EFFECTIVE_SWIPE_PX, basis: "measured-constant" };
  }

  /**
   * REQ-VISION-001 (SPEC-VISION-001 M1) — M2에서 화면 크기 출처를 잃었다.
   *
   * M1의 임시 구현은 UI 계층 트리를 받아 그 bounds에서 크기를 파생했다.
   * M2(REQ-VISION-002)가 그 트리 조회 메서드를 인터페이스에서 제거하면서
   * iOS는 **이 시점에 화면 크기를 조회할 경로가 없다**. 추측하지 않고
   * `undefined`를 돌려주며, 호출자는 기존 계약 그대로
   * `SCREEN_SIZE_UNKNOWN`을 받는다(REQ-VISION-001 오류 계약 보존) —
   * 잘못된 좌표로 되돌릴 수 없는 제스처를 보내는 것보다 거부가 낫다.
   *
   * 실기기 영향은 없다: iOS 실기기에서 idb의 UI 계열 명령은 이미 실패한다
   * (research.md §2.1). 잃는 것은 시뮬레이터 경로뿐이며, 시뮬레이터는
   * spec.md §C.5가 이 SPEC의 범위 밖으로 명시 이월했다.
   *
   * @MX:DEBT: iOS getScreenSize가 항상 undefined -- M2~M3 구간에서 iOS scroll은 SCREEN_SIZE_UNKNOWN으로 거부된다
   * @MX:CEILING: iOS 실기기에는 영향 없음(idb UI 명령이 이미 실패). 시뮬레이터 scroll만 상실하며 그 경로는 spec.md §C.5로 이월됨
   * @MX:UPGRADE: M3에서 WDA 백엔드의 getScreenSize(창 크기 조회 또는 캡처 PNG IHDR, design.md §F)로 교체 -- plan.md §B M3 item 3
   */
  async getScreenSize(_serial: string): Promise<ScreenSize | undefined> {
    return undefined;
  }
}
