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

import { ADBKEYBOARD_BROADCAST_ACTION, ADBKEYBOARD_IME_ID } from "./adbkeyboard.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { isKeyAlias } from "../schema/key-alias.js";
import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { spawnAdb } from "./adb-executor.js";
import { parseAdbDevicesList } from "./device-list-parser.js";
import { ImeRestoreFailedError } from "./ime-errors.js";
import { ANDROID_KEYCODE } from "./keycodes.js";

const UI_DUMP_DEVICE_PATH = "/sdcard/window_dump.xml";
const CONNECTED_STATES = new Set(["device", "offline", "unauthorized"]);

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  constructor(private readonly exec: AdbExecutor = spawnAdb) {}

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
    const dumpResult = await this.exec([
      "-s",
      serial,
      "shell",
      "uiautomator",
      "dump",
      UI_DUMP_DEVICE_PATH,
    ]);
    assertSuccess(dumpResult, "uiautomator dump");

    const catResult = await this.exec(["-s", serial, "exec-out", "cat", UI_DUMP_DEVICE_PATH]);
    assertSuccess(catResult, "exec-out cat window_dump.xml");

    // Best-effort device-side cleanup (REQ-IDEMP-003 — no residual files).
    // A cleanup failure does not fail the dump itself: the caller already
    // has the XML content it needs.
    try {
      await this.exec(["-s", serial, "shell", "rm", "-f", UI_DUMP_DEVICE_PATH]);
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
   * @MX:WARN — switches the device's active IME to ADBKeyBoard for
   * non-ASCII input, then ALWAYS attempts to restore the original IME —
   * including when the send itself throws. A restore failure leaves the
   * device's keyboard stuck on ADBKeyBoard; it is surfaced distinctly via
   * {@link ImeRestoreFailedError} (never silently swallowed) so the caller
   * can report the original IME id for manual recovery.
   * @MX:REASON — REQ-INPUT-004 / REQ-IDEMP-004 require restore-on-error as
   * a hard guarantee, and REQ-ERR-001 requires restore FAILURE to be
   * reported (not silently ignored) — this method is the single place
   * that guarantee is implemented.
   */
  async inputText(serial: string, text: string): Promise<void> {
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
      return;
    }

    // Non-ASCII path (REQ-INPUT-003): ADBKeyBoard base64 broadcast, with a
    // guaranteed-attempted IME restore (REQ-INPUT-004/REQ-IDEMP-004).
    const originalIme = await this.getCurrentIme(serial);

    let sendError: Error | undefined;
    try {
      await this.setImeToAdbKeyboard(serial);
      await this.broadcastBase64Text(serial, text);
    } catch (err) {
      sendError = err instanceof Error ? err : new Error(String(err));
    }

    if (!originalIme) {
      // Edge case (acceptance.md §D.1): the original IME was never
      // recorded (unknown at session start). We cannot safely restore to
      // an unknown value, so we do not attempt a blind `ime set ""` —
      // instead we report immediately that manual recovery is needed.
      const reason = sendError
        ? `text send also failed: ${sendError.message}`
        : "text send succeeded, but the original IME cannot be restored";
      throw new ImeRestoreFailedError(
        `Original IME could not be determined before switching to ADBKeyBoard; manual recovery required (${reason}). ` +
          "Check 'adb shell ime list -s' and run 'adb shell ime set <id>' manually.",
        undefined,
      );
    }

    try {
      await this.restoreIme(serial, originalIme);
    } catch (restoreErr) {
      const restoreMessage = errorMessage(restoreErr);
      const combinedMessage = sendError
        ? `IME restore failed after a failed text send (send error: ${sendError.message}; restore error: ${restoreMessage})`
        : `Failed to restore original IME after text input: ${restoreMessage}`;
      throw new ImeRestoreFailedError(
        `${combinedMessage}. Manually recover with: adb -s ${serial} shell ime set ${originalIme}`,
        originalIme,
      );
    }

    if (sendError) {
      throw sendError;
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

  private async restoreIme(serial: string, imeId: string): Promise<void> {
    const result = await this.exec(["-s", serial, "shell", "ime", "set", imeId]);
    assertSuccess(result, "shell ime set (restore)");
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
