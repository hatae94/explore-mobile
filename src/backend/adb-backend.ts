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

import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { isKeyAlias } from "../schema/key-alias.js";
import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { spawnAdb } from "./adb-executor.js";
import { parseAdbDevicesList } from "./device-list-parser.js";
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

  async inputText(_serial: string, _text: string): Promise<void> {
    // Unicode/IME text input is SPEC-ANDROID-001 milestone M5 (ADBKeyBoard
    // base64 broadcast path + IME restore). Not implemented in this chunk.
    throw new Error(
      "inputText is not yet implemented (SPEC-ANDROID-001 milestone M5 — Unicode/IME input path).",
    );
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
