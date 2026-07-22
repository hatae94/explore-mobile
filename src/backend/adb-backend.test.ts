import { describe, expect, it, vi } from "vitest";

import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { AdbBackend } from "./adb-backend.js";

function ok(stdout: string, stderr = ""): AdbExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.from(stderr, "utf-8"), exitCode: 0 };
}

function okBinary(bytes: Buffer): AdbExecResult {
  return { stdout: bytes, stderr: Buffer.alloc(0), exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): AdbExecResult {
  return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode };
}

describe("AdbBackend", () => {
  describe("listDevices", () => {
    it("calls 'adb devices -l' then 'getprop ro.build.version.release' per connected device (REQ-DEVICES-001)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(
          ok(
            "List of devices attached\n" +
              "emulator-5554          device product:sdk model:sdk_gphone64_arm64 device:emu64a transport_id:1\n",
          ),
        )
        .mockResolvedValueOnce(ok("14\n"));

      const backend = new AdbBackend(exec);
      const devices = await backend.listDevices();

      expect(exec).toHaveBeenNthCalledWith(1, ["devices", "-l"]);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "emulator-5554",
        "shell",
        "getprop",
        "ro.build.version.release",
      ]);
      expect(devices).toEqual([
        {
          serial: "emulator-5554",
          model: "sdk_gphone64_arm64",
          osVersion: "14",
          connectionState: "device",
          isEmulator: true,
        },
      ]);
    });

    it("does not query getprop for offline/unauthorized devices", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(
        ok("List of devices attached\n" + "R58N90ABCDE             offline\n"),
      );

      const backend = new AdbBackend(exec);
      const devices = await backend.listDevices();

      expect(exec).toHaveBeenCalledTimes(1);
      expect(devices).toEqual([
        {
          serial: "R58N90ABCDE",
          model: "",
          osVersion: "",
          connectionState: "offline",
          isEmulator: false,
        },
      ]);
    });

    it("leaves osVersion empty when the getprop call itself fails", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(
          ok("List of devices attached\n" + "R58N90ABCDE             device model:Pixel_7\n"),
        )
        .mockResolvedValueOnce(fail("adb: getprop failed", 1));

      const backend = new AdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices[0]?.osVersion).toBe("");
    });

    it("falls back connectionState to 'offline' for an unrecognized raw adb state token", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("List of devices attached\n" + "R58N90ABCDE             no-permissions\n"));

      const backend = new AdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices[0]?.connectionState).toBe("offline");
    });
  });

  describe("dumpUiHierarchy", () => {
    it("writes, streams via exec-out cat, then removes the device-side temp file (REQ-DUMP-001, REQ-IDEMP-003)", async () => {
      const xml = "<hierarchy><node class=\"a\" /></hierarchy>";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("")) // uiautomator dump
        .mockResolvedValueOnce(ok(xml)) // exec-out cat
        .mockResolvedValueOnce(ok("")); // rm cleanup

      const backend = new AdbBackend(exec);
      const result = await backend.dumpUiHierarchy("R58N90ABCDE");

      expect(exec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "uiautomator",
        "dump",
        "/sdcard/window_dump.xml",
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "exec-out",
        "cat",
        "/sdcard/window_dump.xml",
      ]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "rm",
        "-f",
        "/sdcard/window_dump.xml",
      ]);
      expect(result).toBe(xml);
    });
  });

  describe("screenshot", () => {
    it("streams PNG bytes via 'exec-out screencap -p' with no device file (REQ-SCREENSHOT-001/002)", async () => {
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(okBinary(pngBytes));

      const backend = new AdbBackend(exec);
      const result = await backend.screenshot("R58N90ABCDE");

      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "exec-out", "screencap", "-p"]);
      expect(Buffer.from(result)).toEqual(pngBytes);
    });
  });

  describe("tap", () => {
    it("calls 'shell input tap <x> <y>' targeted with -s <serial> (REQ-INPUT-001)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.tap("R58N90ABCDE", 100, 200);

      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "shell", "input", "tap", "100", "200"]);
    });
  });

  describe("sendKeyEvent", () => {
    it("maps a supported alias to its Android KEYCODE (REQ-INPUT-005)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.sendKeyEvent("R58N90ABCDE", "back");

      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "shell", "input", "keyevent", "4"]);
    });

    it("rejects an unsupported alias without calling adb (REQ-INPUT-005 graceful reject)", async () => {
      const exec = vi.fn<AdbExecutor>();
      const backend = new AdbBackend(exec);

      await expect(backend.sendKeyEvent("R58N90ABCDE", "foobar")).rejects.toThrow();
      expect(exec).not.toHaveBeenCalled();
    });
  });

  describe("launchApp / stopApp", () => {
    it("launches a package via 'am start' with MAIN/LAUNCHER intent (REQ-APP-001)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.launchApp("R58N90ABCDE", "com.android.settings");

      expect(exec).toHaveBeenCalledWith([
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        "android.intent.category.LAUNCHER",
        "-p",
        "com.android.settings",
      ]);
    });

    it("force-stops a package via 'am force-stop' (REQ-APP-002)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.stopApp("R58N90ABCDE", "com.android.settings");

      expect(exec).toHaveBeenCalledWith([
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "force-stop",
        "com.android.settings",
      ]);
    });
  });

  describe("failure propagation", () => {
    it("throws when the underlying adb invocation exits non-zero", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("error: no devices/emulators found", 1));

      const backend = new AdbBackend(exec);

      await expect(backend.tap("missing-serial", 1, 1)).rejects.toThrow(/no devices\/emulators found/);
    });

    it("throws a generic exit-code message when stderr is empty", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("", 1));

      const backend = new AdbBackend(exec);

      await expect(backend.tap("missing-serial", 1, 1)).rejects.toThrow(/failed \(exit 1\)$/);
    });
  });

  describe("inputText (M5 — not yet implemented)", () => {
    it("rejects clearly, deferring to a future milestone", async () => {
      const exec = vi.fn<AdbExecutor>();
      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "hello")).rejects.toThrow(/M5/);
    });
  });
});
