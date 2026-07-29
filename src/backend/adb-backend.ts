/**
 * `AdbBackend` — the M4 concrete `DeviceBackend` (M1 interface)
 * implementation, wrapping adb subprocess calls.
 *
 * @MX:ANCHOR — this is the SPEC's Android implementation of the
 * device-backend interface contract (spec.md §A.4, REQ-ARCH-003). Every
 * CLI command that targets a device (M3) depends on this class's method
 * surface staying compatible with `DeviceBackend`.
 * @MX:REASON — SPEC-IOS-001's `IdbBackend` implements the same
 * `DeviceBackend` interface (`src/backend/idb-backend.ts`); this class is
 * the reference implementation proving the interface is thin enough to be
 * backend-swappable (REQ-IOS-ARCH-005). `listDevices` tags `platform:
 * "android"` (REQ-IOS-SCHEMA-001) and `dumpUiHierarchy` now normalizes
 * internally (REQ-IOS-SCHEMA-003) — see the method itself.
 */

import { randomBytes } from "node:crypto";

import { ADBKEYBOARD_BROADCAST_ACTION, ADBKEYBOARD_IME_ID } from "./adbkeyboard.js";
import { ensureAdbKeyboardInstalled } from "./adbkeyboard-installer.js";
import type {
  DeviceBackend,
  DeviceInfo,
  SwipeOptions,
  SwipePoint,
  SwipeThreshold,
} from "../schema/device-backend.js";
import type { CommonElement } from "../schema/common-element.js";
import { isKeyAlias } from "../schema/key-alias.js";
import { normalizeUiAutomatorXml } from "../normalize/uiautomator.js";
import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { spawnAdb } from "./adb-executor.js";
import type { ApkAcquirer } from "./apk-downloader.js";
import { createApkAcquirer } from "./apk-downloader.js";
import { parseAdbDevicesList } from "./device-list-parser.js";
import { ImeSessionStore } from "./ime-session-store.js";
import { AdbKeyboardInstallFailedError } from "./ime-errors.js";
import { ANDROID_KEYCODE, KEYCODE_ESCAPE } from "./keycodes.js";

const CONNECTED_STATES = new Set(["device", "offline", "unauthorized"]);

/**
 * Computes a device-side temp path for `dump`, namespaced by serial
 * (REQ-MULTIDEV-004) plus a random suffix so even concurrent `dump`
 * invocations targeting the SAME serial from separate CLI processes
 * never race on the same device-side file. Different devices have
 * independent filesystems, so serial-namespacing here is primarily for
 * traceability/debugging; the random suffix is what actually prevents a
 * same-serial concurrent collision.
 */
function deviceDumpPath(serial: string): string {
  const safeSerial = serial.replace(/[^A-Za-z0-9_-]/g, "_");
  const suffix = randomBytes(4).toString("hex");
  return `/sdcard/window_dump-${safeSerial}-${suffix}.xml`;
}

/** Throws with a message built from adb's stderr when the invocation failed. */
function assertSuccess(result: AdbExecResult, context: string): void {
  if (result.exitCode !== 0) {
    const stderrText = result.stderr.toString("utf-8").trim();
    throw new Error(
      stderrText.length > 0
        ? `adb ${context} failed (exit ${result.exitCode}): ${stderrText}`
        : `adb ${context} failed (exit ${result.exitCode})`,
    );
  }
}

/** True when `text` requires no IME switch — `adb shell input text` handles ASCII natively (REQ-INPUT-002). */
function isAsciiOnly(text: string): boolean {
  // eslint-disable-next-line no-control-regex -- intentional 0x00-0x7F ASCII range check
  return /^[\x00-\x7F]*$/.test(text);
}

/**
 * Single-quotes `text` for the DEVICE-side shell that `adb shell` invokes.
 *
 * This is distinct from — and in addition to — the host-side shell
 * injection defense in adb-executor.ts (argv array, no host shell): `adb
 * shell <args...>` rejoins all args after "shell" into ONE string sent to
 * the device's own shell for interpretation, so a text argument containing
 * spaces or shell metacharacters must be quoted for THAT remote shell, or
 * it will be split into multiple arguments / partially interpreted once it
 * reaches the device.
 */
function shellSingleQuoteForDevice(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * Android's standard touch slop, in dp — a PLATFORM RULE
 * (`ViewConfiguration.getScaledTouchSlop()`), not a value measured per
 * device (REQ-GEST-SCROLL-007/008, SPEC-GESTURE-001 M8, spec.md §C.1-⑰:
 * measured boundary `8dp × 3.75 = 30.0px` matched exactly on a 600dpi
 * device). Multiplied by this device's own density at call time — never
 * stored as a fixed pixel constant, because the same 8dp means a different
 * pixel distance on every density (420dpi -> 21px, 480dpi -> 24px,
 * 600dpi -> 30px, 640dpi -> 32px).
 */
const TOUCH_SLOP_DP = 8;

/**
 * Safety margin ABOVE the measured slop boundary, in device pixels
 * (REQ-GEST-SCROLL-007, spec.md §C.1-⑰). The boundary itself
 * (`distance === slop`) never moves the screen (0/8 measured) and the
 * pixel immediately above it is PROBABILISTIC (6/8 vertical, 5/6
 * horizontal) — using `slop + 1` as the final threshold would revive the
 * exact intermittent `ok:true`-no-effect defect this SPEC exists to
 * prevent. This margin is a DESIGN CHOICE, not a measured value — same
 * character as `MAX_DURATION_MS` in `validators.ts`.
 *
 * @MX:NOTE: [AUTO] 이 여유(2px)는 실측이 아니라 설계 선택이다 -- spec.md §C.1-⑰이 기록한 slop+1(31px)의 확률적 구간(6/8, 5/6)을 피하기 위해 slop+2(600dpi에서 32px, 8/8 실측)를 택했다
 */
const TOUCH_SLOP_MARGIN_PX = 2;

/**
 * Parses `wm density`'s output into the EFFECTIVE density multiplier
 * (`N / 160`, the baseline DPI) — the density that actually governs
 * Android's touch slop (REQ-GEST-SCROLL-008, SPEC-GESTURE-001 M9, spec.md
 * §C.1-⑳). Reads the `Override density:` line when present; falls back to
 * `Physical density:` otherwise. Returns `undefined` when neither line is
 * present or parseable (unparseable output) — an explicit error, never a
 * guessed threshold (spec.md §D "화면 크기 추측 폴백"과 같은 계열).
 *
 * 0.6.0 -> 0.7.0 (spec.md §B.9): this function used to read ONLY the
 * Physical line, leaving the Physical/Override distinction as an open
 * question (§C.3). That default was measured to be the WRONG one — on a
 * device with an active ENLARGING override (Override > Physical), reading
 * Physical alone under-derives the threshold below the OS touch slop
 * governed by the override, so an `AMOUNT_TOO_SMALL`-rejected distance
 * would in fact be interpreted by the device as a TAP (spec.md §C.1-⑱).
 * `max(physical, override)` was considered and rejected — it over-rejects
 * on the shrinking-override direction (spec.md §C.1-⑳, §B.9 H3).
 */
function parseEffectiveDensity(output: string): number | undefined {
  const match = /Override density:\s*(\d+)/.exec(output) ?? /Physical density:\s*(\d+)/.exec(output);
  if (!match) return undefined;
  const dpi = Number(match[1]);
  return Number.isFinite(dpi) && dpi > 0 ? dpi / 160 : undefined;
}

export class AdbBackend implements DeviceBackend {
  /**
   * Per-serial SESSION state (REQ-MULTIDEV-003, REQ-INPUT-004
   * disk-persistence revision): once a non-ASCII `inputText()` call
   * switches a serial's active IME to ADBKeyBoard, the ORIGINAL IME that
   * was active before the switch (empty string when unknown) is persisted
   * here — on disk, not in process memory. This matters because each
   * `node dist/cli/bin.js <cmd>` invocation is a SEPARATE OS process: an
   * in-memory `Map` (the pre-fix design) is lost the instant the `text`
   * process exits, so a LATER `reset` invocation — almost always a
   * different process — could never recover the true original IME and
   * left the device stuck on ADBKeyBoard (confirmed on a real device).
   * See ime-session-store.ts for the on-disk store this class delegates
   * to. The entry is intentionally NOT cleared per-call: on a real
   * device, restoring the IME after every single `text` call causes
   * visible soft-keyboard flicker and defeats the app's keyboard-avoiding
   * layout re-trigger. Restore instead happens ONLY via `reset` (see
   * `getTrackedOriginalIme()` / `clearTrackedOriginalIme()`, consumed by
   * `cli/commands/reset.ts`).
   */
  private readonly imeSessions: ImeSessionStore;

  constructor(
    private readonly exec: AdbExecutor = spawnAdb,
    private readonly acquireApk: ApkAcquirer = createApkAcquirer(),
    imeSessions: ImeSessionStore = new ImeSessionStore(),
  ) {
    this.imeSessions = imeSessions;
  }

  /**
   * Accessor (REQ-MULTIDEV-003): the original IME tracked for `serial`,
   * i.e. the IME that was active immediately before a non-ASCII
   * `inputText()` call first switched this serial to ADBKeyBoard this
   * session — read from the on-disk store, so it survives across CLI
   * process boundaries. Returns `undefined` when no such session is
   * active (never switched, or already restored via
   * `clearTrackedOriginalIme()`). Returns `""` when a session IS active
   * but the original IME could not be determined (edge case —
   * acceptance.md §D.1).
   */
  async getTrackedOriginalIme(serial: string): Promise<string | undefined> {
    return this.imeSessions.getOriginalIme(serial);
  }

  /**
   * Clears the session-tracked original IME for `serial` on disk
   * (REQ-INPUT-004 disk-persistence revision). Called once
   * `reset`/`doctor --clean` has taken responsibility for restoring the
   * device's IME state — after this call, the next non-ASCII
   * `inputText()` on this serial will switch to ADBKeyBoard again (fresh
   * session).
   */
  async clearTrackedOriginalIme(serial: string): Promise<void> {
    await this.imeSessions.clearOriginalIme(serial);
  }

  async listDevices(): Promise<DeviceInfo[]> {
    const listResult = await this.exec(["devices", "-l"]);
    assertSuccess(listResult, "devices -l");

    const entries = parseAdbDevicesList(listResult.stdout.toString("utf-8"));
    const devices: DeviceInfo[] = [];

    for (const entry of entries) {
      let osVersion = "";

      if (entry.state === "device") {
        const propResult = await this.exec([
          "-s",
          entry.serial,
          "shell",
          "getprop",
          "ro.build.version.release",
        ]);
        if (propResult.exitCode === 0) {
          osVersion = propResult.stdout.toString("utf-8").trim();
        }
      }

      devices.push({
        serial: entry.serial,
        model: entry.model,
        osVersion,
        connectionState: CONNECTED_STATES.has(entry.state)
          ? (entry.state as DeviceInfo["connectionState"])
          : "offline",
        isEmulator: entry.isEmulator,
        platform: "android",
      });
    }

    return devices;
  }

  /**
   * @MX:NOTE — REQ-IOS-SCHEMA-003 (SPEC-IOS-001): normalization now
   * happens INSIDE the backend — this method internally calls
   * `normalizeUiAutomatorXml` on the collected XML before returning,
   * rather than handing raw XML back to the caller. Behavior is preserved
   * from SPEC-ANDROID-001 (same dump -> cat -> cleanup sequence); only the
   * final return value changed shape (layer moved, no behavior change).
   */
  async dumpUiHierarchy(serial: string): Promise<CommonElement[]> {
    // Freshly generated per call (REQ-MULTIDEV-004): namespaced by serial
    // and made unique so concurrent same-serial dumps from separate CLI
    // processes never race on the same device-side path.
    const devicePath = deviceDumpPath(serial);

    const dumpResult = await this.exec(["-s", serial, "shell", "uiautomator", "dump", devicePath]);
    assertSuccess(dumpResult, "uiautomator dump");

    const catResult = await this.exec(["-s", serial, "exec-out", "cat", devicePath]);
    assertSuccess(catResult, "exec-out cat window_dump.xml");

    // Best-effort device-side cleanup (REQ-IDEMP-003 — no residual files).
    // A cleanup failure does not fail the dump itself: the caller already
    // has the XML content it needs.
    try {
      await this.exec(["-s", serial, "shell", "rm", "-f", devicePath]);
    } catch {
      // Intentionally swallowed: cleanup is best-effort.
    }

    return normalizeUiAutomatorXml(catResult.stdout.toString("utf-8"));
  }

  async screenshot(serial: string): Promise<Uint8Array> {
    const result = await this.exec(["-s", serial, "exec-out", "screencap", "-p"]);
    assertSuccess(result, "exec-out screencap -p");
    return result.stdout;
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    const result = await this.exec(["-s", serial, "shell", "input", "tap", String(x), String(y)]);
    assertSuccess(result, "shell input tap");
  }

  /**
   * @MX:WARN — self-heals a missing ADBKeyBoard install (below) and
   * switches the device's active IME to ADBKeyBoard for non-ASCII input,
   * SESSION-scoped per serial AND persisted across CLI process boundaries
   * (REQ-INPUT-004 disk-persistence revision): the device's CURRENT
   * default IME (`settings get secure default_input_method`), not
   * process memory, is the source of truth for whether a session is
   * already active — because a `text` call and a later `reset` call are
   * almost always separate OS processes, in-memory tracking alone cannot
   * answer that question correctly. The switch is never restored
   * per-call; restore happens ONLY via `reset`/`doctor --clean` (see
   * `getTrackedOriginalIme()` / `clearTrackedOriginalIme()`). A
   * best-effort keyboard-hide (KEYCODE_ESCAPE) runs after every send
   * unless `options.hideKeyboardAfter` is `false`.
   * @MX:REASON — REQ-INPUT-004 (disk-persistence revision, real-device
   * finding): the prior in-memory-only session tracking recorded the
   * pre-switch IME in a `Map` that was lost when the `text` process
   * exited. A later `reset` (a NEW process, fresh empty memory) could
   * then never recover the true original IME, leaving the device stuck
   * on ADBKeyBoard as its default keyboard — confirmed on a real device.
   * Querying the device's live current IME instead of trusting process
   * memory, plus persisting the pre-switch original to disk
   * (ime-session-store.ts) the FIRST time it is observed, fixes this:
   * later calls (same or different process) see ADBKeyBoard already
   * active and skip re-switching (no flicker), while `reset` can always
   * read the correct original back from disk regardless of which process
   * wrote it. Separately, REQ-INPUT-003 revised: `reset` uninstalls
   * ADBKeyBoard, so a device that was just reset (or a fresh device) is
   * missing it — `ime enable` on a missing package fails with "Unknown
   * input method" — so `text` self-heals by installing it on demand via
   * the same shared helper `doctor` uses, before attempting the switch.
   */
  async inputText(serial: string, text: string, options?: { hideKeyboardAfter?: boolean }): Promise<void> {
    const hideKeyboardAfter = options?.hideKeyboardAfter ?? true;

    if (isAsciiOnly(text)) {
      // Fast path (REQ-INPUT-002): no IME switch needed at all.
      const result = await this.exec([
        "-s",
        serial,
        "shell",
        "input",
        "text",
        shellSingleQuoteForDevice(text),
      ]);
      assertSuccess(result, "shell input text");
      if (hideKeyboardAfter) {
        await this.hideKeyboard(serial);
      }
      return;
    }

    // Non-ASCII path (REQ-INPUT-003): ADBKeyBoard base64 broadcast, with a
    // disk-persisted, cross-process session-scoped self-heal install + IME
    // switch (REQ-INPUT-004 disk-persistence revision). The device's
    // CURRENT default IME — not process memory — decides whether a
    // session is already active, since a `text` call and a later `reset`
    // call are almost always separate CLI processes (see class-level doc
    // comment + ime-session-store.ts).
    const currentIme = await this.getCurrentIme(serial);
    if (currentIme !== ADBKEYBOARD_IME_ID) {
      // Not already switched on-device: `currentIme` IS the true original
      // to restore to later. Self-heal (REQ-INPUT-003 revised): install
      // ADBKeyBoard first when missing (idempotent fast path when already
      // installed — REQ-IDEMP-002), reusing the identical runtime-download
      // + `adb install` logic `AdbDoctor.ensureAdbKeyboard()` uses. A
      // failure here degrades gracefully (REQ-ERR-002): no IME switch is
      // attempted and the device is left in its pre-call state.
      const installResult = await ensureAdbKeyboardInstalled(serial, this.exec, this.acquireApk);
      if (installResult.error) {
        throw new AdbKeyboardInstallFailedError(installResult.error.message, installResult.error.code);
      }

      // Switch first; only persist the original once the switch itself has
      // actually succeeded (a failed switch must not make a later call
      // believe ADBKeyBoard is already active — it also never will, since
      // the NEXT call re-queries the live device IME rather than trusting
      // a persisted flag).
      await this.setImeToAdbKeyboard(serial);

      // Persist the true original to disk (REQ-MULTIDEV-003) ONLY when no
      // entry already exists for this serial — a stale entry from an
      // earlier, still-active session is closer to the TRUE pre-session
      // original than whatever the device happens to report right now,
      // and must never be overwritten (recording ADBKeyBoard itself as
      // "the original" is the exact cross-process bug this fixes). Empty
      // string is a valid, distinct "unknown" original (acceptance.md
      // §D.1 edge case) and is still persisted so the session is tracked.
      const existingOriginal = await this.imeSessions.getOriginalIme(serial);
      if (existingOriginal === undefined) {
        await this.imeSessions.setOriginalIme(serial, currentIme);
      }
    }
    // else: ADBKeyBoard is already the device's active IME — established
    // by this call, an earlier call in this process, OR a call from a
    // DIFFERENT CLI process entirely. Skip the switch (and the self-heal
    // check) entirely: no flicker, and no risk of ever recording
    // ADBKeyBoard as its own "original".

    await this.broadcastBase64Text(serial, text);

    if (hideKeyboardAfter) {
      await this.hideKeyboard(serial);
    }
  }

  /**
   * Best-effort soft-keyboard dismissal after `text` input (real-device
   * UX fix): sends KEYCODE_ESCAPE. Never fails the caller — a failure
   * here is cosmetic, not a functional regression of the text send that
   * already succeeded.
   */
  private async hideKeyboard(serial: string): Promise<void> {
    try {
      await this.exec(["-s", serial, "shell", "input", "keyevent", String(KEYCODE_ESCAPE)]);
    } catch {
      // Intentionally swallowed: keyboard-hide is best-effort.
    }
  }

  /** Reads the device's currently active IME id, or "" if unknown/unset. */
  private async getCurrentIme(serial: string): Promise<string> {
    const result = await this.exec([
      "-s",
      serial,
      "shell",
      "settings",
      "get",
      "secure",
      "default_input_method",
    ]);
    if (result.exitCode !== 0) return "";
    const value = result.stdout.toString("utf-8").trim();
    // Android's `settings get` prints the literal string "null" when unset.
    return value === "null" ? "" : value;
  }

  private async setImeToAdbKeyboard(serial: string): Promise<void> {
    const enableResult = await this.exec(["-s", serial, "shell", "ime", "enable", ADBKEYBOARD_IME_ID]);
    assertSuccess(enableResult, "shell ime enable (ADBKeyBoard)");

    const setResult = await this.exec(["-s", serial, "shell", "ime", "set", ADBKEYBOARD_IME_ID]);
    assertSuccess(setResult, "shell ime set (ADBKeyBoard)");
  }

  private async broadcastBase64Text(serial: string, text: string): Promise<void> {
    const base64Msg = Buffer.from(text, "utf-8").toString("base64");
    const result = await this.exec([
      "-s",
      serial,
      "shell",
      "am",
      "broadcast",
      "-a",
      ADBKEYBOARD_BROADCAST_ACTION,
      "--es",
      "msg",
      base64Msg,
    ]);
    assertSuccess(result, `am broadcast ${ADBKEYBOARD_BROADCAST_ACTION}`);
  }

  async sendKeyEvent(serial: string, keyName: string): Promise<void> {
    // Defense in depth: the CLI layer already validates against the
    // enumerated alias set before calling the backend (REQ-INPUT-005).
    if (!isKeyAlias(keyName)) {
      throw new Error(`Unsupported key alias '${keyName}'.`);
    }
    const keycode = ANDROID_KEYCODE[keyName];
    const result = await this.exec([
      "-s",
      serial,
      "shell",
      "input",
      "keyevent",
      String(keycode),
    ]);
    assertSuccess(result, "shell input keyevent");
  }

  async launchApp(serial: string, packageId: string): Promise<void> {
    const result = await this.exec([
      "-s",
      serial,
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.MAIN",
      "-c",
      "android.intent.category.LAUNCHER",
      "-p",
      packageId,
    ]);
    assertSuccess(result, "shell am start");
  }

  async stopApp(serial: string, packageId: string): Promise<void> {
    const result = await this.exec(["-s", serial, "shell", "am", "force-stop", packageId]);
    assertSuccess(result, "shell am force-stop");
  }

  /**
   * REQ-GEST-SWIPE-001/002/004 (SPEC-GESTURE-001 M1, additive 9th method):
   * `adb shell input swipe x1 y1 x2 y2 [duration]` — the trailing duration
   * argument is already milliseconds (spec.md §C.1-⑥), matching the CLI's
   * ms contract exactly, so it is passed straight through with NO unit
   * conversion (unlike `IdbBackend.swipe`, which must convert to seconds).
   */
  async swipe(serial: string, from: SwipePoint, to: SwipePoint, options?: SwipeOptions): Promise<void> {
    const args = [
      "-s",
      serial,
      "shell",
      "input",
      "swipe",
      String(from.x),
      String(from.y),
      String(to.x),
      String(to.y),
    ];
    if (options?.durationMs !== undefined) {
      args.push(String(options.durationMs));
    }
    const result = await this.exec(args);
    assertSuccess(result, "shell input swipe");
  }

  /**
   * REQ-GEST-SCROLL-007/008 (SPEC-GESTURE-001 M8, additive 10th method):
   * derives THIS device's minimum effective swipe distance at call time —
   * never a stored pixel constant. Queries `wm density`, then computes
   * `floor(TOUCH_SLOP_DP * density) + TOUCH_SLOP_MARGIN_PX` so the returned
   * threshold sits safely above the measured probabilistic boundary
   * (spec.md §C.1-⑰). `density` is the EFFECTIVE density — the `Override
   * density:` line when present, else `Physical density:` (M9, spec.md
   * §C.1-⑳) — since that is the value that actually governs touch slop on
   * a device with an active display-size override. `basis: "device-query"`
   * marks this as derived from a live query of the target device, distinct
   * from `IdbBackend`'s `"measured-constant"` (a value measured on a
   * DIFFERENT device) — see `SwipeThreshold`.
   */
  async getMinEffectiveSwipeThreshold(serial: string): Promise<SwipeThreshold> {
    const result = await this.exec(["-s", serial, "shell", "wm", "density"]);
    assertSuccess(result, "shell wm density");

    const density = parseEffectiveDensity(result.stdout.toString("utf-8"));
    if (density === undefined) {
      throw new Error(`Could not parse 'wm density' output for device '${serial}'.`);
    }

    const minEffectiveSwipePx = Math.floor(TOUCH_SLOP_DP * density) + TOUCH_SLOP_MARGIN_PX;
    const value: SwipeThreshold = { minEffectiveSwipePx, basis: "device-query" };
    return value;
  }
}
