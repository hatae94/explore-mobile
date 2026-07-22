/**
 * `AdbBackend` — the M4 concrete `DeviceBackend` (M1 interface)
 * implementation, wrapping adb subprocess calls.
 *
 * @MX:ANCHOR — this is the SPEC's Android implementation of the
 * device-backend interface contract (spec.md §A.4, REQ-ARCH-003). Every
 * CLI command that targets a device (M3) depends on this class's method
 * surface staying compatible with `DeviceBackend`.
 * @MX:REASON — a future iOS/idb backend (SPEC-02) must implement the same
 * `DeviceBackend` interface; this class is the reference implementation
 * proving the interface is thin enough to be backend-swappable.
 */

import { randomBytes } from "node:crypto";

import { ADBKEYBOARD_BROADCAST_ACTION, ADBKEYBOARD_IME_ID } from "./adbkeyboard.js";
import { ensureAdbKeyboardInstalled } from "./adbkeyboard-installer.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { isKeyAlias } from "../schema/key-alias.js";
import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { spawnAdb } from "./adb-executor.js";
import type { ApkAcquirer } from "./apk-downloader.js";
import { createApkAcquirer } from "./apk-downloader.js";
import { parseAdbDevicesList } from "./device-list-parser.js";
import { AdbKeyboardInstallFailedError } from "./ime-errors.js";
import { ANDROID_KEYCODE, KEYCODE_ESCAPE } from "./keycodes.js";
import { PerSerialState } from "./per-serial-state.js";

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

export class AdbBackend implements DeviceBackend {
  /**
   * Per-serial SESSION state (REQ-MULTIDEV-003, REQ-INPUT-004 revised):
   * once a non-ASCII `inputText()` call switches a serial's active IME to
   * ADBKeyBoard, the entry recorded here is the ORIGINAL IME that was
   * active before the switch (empty string when unknown). Its presence
   * (via `PerSerialState.has()`) is also the session flag itself — as
   * long as an entry exists for a serial, ADBKeyBoard is considered the
   * still-active IME for that serial and subsequent non-ASCII calls skip
   * re-switching. The entry is intentionally NOT cleared per-call: on a
   * real device, restoring the IME after every single `text` call causes
   * visible soft-keyboard flicker and defeats the app's keyboard-avoiding
   * layout re-trigger. Restore instead happens ONLY via `reset` (see
   * `getTrackedOriginalIme()` / `clearTrackedOriginalIme()`, consumed by
   * `cli/commands/reset.ts`).
   */
  private readonly originalImeBySerial = new PerSerialState<string>();

  constructor(
    private readonly exec: AdbExecutor = spawnAdb,
    private readonly acquireApk: ApkAcquirer = createApkAcquirer(),
  ) {}

  /**
   * Accessor (REQ-MULTIDEV-003): the original IME tracked for `serial`,
   * i.e. the IME that was active immediately before a non-ASCII
   * `inputText()` call first switched this serial to ADBKeyBoard this
   * session. Returns `undefined` when no such session is active (never
   * switched, or already restored via `clearTrackedOriginalIme()`).
   * Returns `""` when a session IS active but the original IME could not
   * be determined (edge case — acceptance.md §D.1).
   */
  getTrackedOriginalIme(serial: string): string | undefined {
    return this.originalImeBySerial.get(serial);
  }

  /**
   * Clears the session-tracked original IME for `serial` (REQ-INPUT-004
   * revised). Called once `reset`/`doctor --clean` has taken
   * responsibility for restoring the device's IME state — after this
   * call, the next non-ASCII `inputText()` on this serial will switch to
   * ADBKeyBoard again (fresh session).
   */
  clearTrackedOriginalIme(serial: string): void {
    this.originalImeBySerial.delete(serial);
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
      });
    }

    return devices;
  }

  async dumpUiHierarchy(serial: string): Promise<string> {
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

    return catResult.stdout.toString("utf-8");
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
   * SESSION-scoped per serial: the install check and the switch happen
   * only once per serial (tracked via `originalImeBySerial`) and the
   * switch is never restored per-call. Restore happens ONLY via
   * `reset`/`doctor --clean` (see `getTrackedOriginalIme()` /
   * `clearTrackedOriginalIme()`). A best-effort keyboard-hide
   * (KEYCODE_ESCAPE) runs after every send unless
   * `options.hideKeyboardAfter` is `false`.
   * @MX:REASON — REQ-INPUT-004 (revised, real-device UX fix): a per-call
   * IME restore causes visible soft-keyboard flicker and prevents the
   * app's keyboard-avoiding layout from re-triggering on a real device.
   * Session-scoping the switch plus hiding the keyboard after send are
   * the user-approved fix; `reset` remains the single place restore is
   * guaranteed to be attempted, keeping REQ-IDEMP-004's "always
   * eventually restored" guarantee intact at the session boundary
   * instead of the per-call boundary. Separately, REQ-INPUT-003 revised:
   * `reset` uninstalls ADBKeyBoard, so a device that was just reset (or a
   * fresh device) is missing it — `ime enable` on a missing package fails
   * with "Unknown input method" — so `text` self-heals by installing it
   * on demand via the same shared helper `doctor` uses, before attempting
   * the switch.
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
    // SESSION-scoped self-heal install + IME switch (REQ-INPUT-004
    // revised) — only checked/switched when ADBKeyBoard is not already the
    // tracked active IME for this serial.
    if (!this.originalImeBySerial.has(serial)) {
      // Self-heal (REQ-INPUT-003 revised): install ADBKeyBoard first when
      // missing (idempotent fast path when already installed — REQ-IDEMP-002),
      // reusing the identical runtime-download + `adb install` logic
      // `AdbDoctor.ensureAdbKeyboard()` uses. A failure here degrades
      // gracefully (REQ-ERR-002): no IME switch is attempted and the
      // device is left in its pre-call state.
      const installResult = await ensureAdbKeyboardInstalled(serial, this.exec, this.acquireApk);
      if (installResult.error) {
        throw new AdbKeyboardInstallFailedError(installResult.error.message, installResult.error.code);
      }

      const originalIme = await this.getCurrentIme(serial);
      // Switch first; only record the session as active once the switch
      // itself has actually succeeded (a failed switch must not make a
      // later call believe ADBKeyBoard is already active and skip retrying).
      await this.setImeToAdbKeyboard(serial);
      // Tracked per-serial (REQ-MULTIDEV-003) even when the original IME
      // could not be determined (empty string — acceptance.md §D.1 edge
      // case): the empty entry still marks the session active so
      // subsequent calls on this serial correctly skip re-switching. A
      // `.set()` on an existing key overwrites rather than accumulates
      // (REQ-IDEMP-001).
      this.originalImeBySerial.set(serial, originalIme);
    }

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
}
