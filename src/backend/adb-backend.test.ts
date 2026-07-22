import { describe, expect, it, vi } from "vitest";

import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { AdbBackend } from "./adb-backend.js";
import { ImeRestoreFailedError } from "./ime-errors.js";

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
    it("writes, streams via exec-out cat, then removes the device-side temp file, using the SAME path across all three calls (REQ-DUMP-001, REQ-IDEMP-003)", async () => {
      const xml = "<hierarchy><node class=\"a\" /></hierarchy>";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("")) // uiautomator dump
        .mockResolvedValueOnce(ok(xml)) // exec-out cat
        .mockResolvedValueOnce(ok("")); // rm cleanup

      const backend = new AdbBackend(exec);
      const result = await backend.dumpUiHierarchy("R58N90ABCDE");

      const dumpPath = exec.mock.calls[0]?.[0][5] as string;
      expect(dumpPath).toMatch(/^\/sdcard\/window_dump-R58N90ABCDE-[0-9a-f]+\.xml$/);

      expect(exec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "uiautomator",
        "dump",
        dumpPath,
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-s", "R58N90ABCDE", "exec-out", "cat", dumpPath]);
      expect(exec).toHaveBeenNthCalledWith(3, ["-s", "R58N90ABCDE", "shell", "rm", "-f", dumpPath]);
      expect(result).toBe(xml);
    });

    it("namespaces the device-side temp path by serial (REQ-MULTIDEV-004)", async () => {
      const execA = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok("<hierarchy/>"))
        .mockResolvedValueOnce(ok(""));
      const execB = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok("<hierarchy/>"))
        .mockResolvedValueOnce(ok(""));

      await new AdbBackend(execA).dumpUiHierarchy("emulator-5554");
      await new AdbBackend(execB).dumpUiHierarchy("R58N90ABCDE");

      const pathA = execA.mock.calls[0]?.[0][5] as string;
      const pathB = execB.mock.calls[0]?.[0][5] as string;

      expect(pathA).toContain("emulator-5554");
      expect(pathB).toContain("R58N90ABCDE");
      expect(pathA).not.toContain("R58N90ABCDE");
      expect(pathB).not.toContain("emulator-5554");
    });

    it("generates a unique path per call, even for the same serial (concurrent same-serial invocations do not collide)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValue(ok(""));
      const backend = new AdbBackend(exec);

      await backend.dumpUiHierarchy("R58N90ABCDE");
      const firstPath = exec.mock.calls[0]?.[0][5] as string;

      exec.mockClear();
      await backend.dumpUiHierarchy("R58N90ABCDE");
      const secondPath = exec.mock.calls[0]?.[0][5] as string;

      expect(firstPath).not.toBe(secondPath);
    });

    it("sanitizes a serial containing filesystem-unsafe characters before embedding it in the path", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValue(ok(""));
      const backend = new AdbBackend(exec);

      // Serials are normally alnum+dash, but defend against unexpected input anyway (Secured).
      await backend.dumpUiHierarchy("weird/serial:name");

      const dumpPath = exec.mock.calls[0]?.[0][5] as string;
      expect(dumpPath).not.toContain("/serial:"); // no embedded path separator or colon
      expect(dumpPath).toMatch(/^\/sdcard\/window_dump-[A-Za-z0-9_-]+-[0-9a-f]+\.xml$/);
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

  describe("inputText — ASCII fast path (REQ-INPUT-002)", () => {
    it("sends via 'shell input text' with the string shell-single-quoted, touching no IME state", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "hello world");

      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "shell", "input", "text", "'hello world'"]);
    });

    it("escapes an embedded single quote for the device-side shell", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "it's ok!");

      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "shell", "input", "text", "'it'\\''s ok!'"]);
    });

    it("treats a whitespace-only string as ASCII (acceptance.md §D.1 edge case)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "   ");

      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "shell", "input", "text", "'   '"]);
    });

    it("propagates a failed ASCII send as a generic error", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("adb: device offline", 1));

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "hello")).rejects.toThrow(/device offline/);
    });
  });

  describe("inputText — non-ASCII IME lifecycle (REQ-INPUT-003/004, REQ-IDEMP-004)", () => {
    function okImeSequence(originalIme = "com.google.android.inputmethod.latin/.LatinIME") {
      // settings get (original IME) -> ime enable -> ime set (ADBKeyBoard) -> am broadcast -> ime set (restore)
      return vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get secure default_input_method
        .mockResolvedValueOnce(ok("")) // ime enable ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // am broadcast ADB_INPUT_B64
        .mockResolvedValueOnce(ok("")); // ime set <original> (restore)
    }

    it("treats emoji-only input as non-ASCII (acceptance.md §D.1 edge case)", async () => {
      const exec = okImeSequence();
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "😸");

      expect(exec).toHaveBeenCalledTimes(5);
    });

    it("records the original IME, switches to ADBKeyBoard, broadcasts base64 UTF-8, then restores the original IME", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = okImeSequence(originalIme);
      const backend = new AdbBackend(exec);

      const text = "안녕하세요 😸";
      const expectedBase64 = Buffer.from(text, "utf-8").toString("base64");

      await backend.inputText("R58N90ABCDE", text);

      expect(exec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "settings",
        "get",
        "secure",
        "default_input_method",
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "enable",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "set",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(exec).toHaveBeenNthCalledWith(4, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "broadcast",
        "-a",
        "ADB_INPUT_B64",
        "--es",
        "msg",
        expectedBase64,
      ]);
      expect(exec).toHaveBeenNthCalledWith(5, ["-s", "R58N90ABCDE", "shell", "ime", "set", originalIme]);

      // Round-trip sanity: decoding the base64 we sent must reproduce the original text exactly.
      expect(Buffer.from(expectedBase64, "base64").toString("utf-8")).toBe(text);
    });

    it("ALWAYS attempts restore even when the broadcast send throws, and re-throws the original send error", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(fail("adb: broadcast failed", 1)) // am broadcast FAILS
        .mockResolvedValueOnce(ok("")); // ime set <original> (restore) — must still be attempted

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toThrow(/broadcast failed/);

      expect(exec).toHaveBeenCalledTimes(5);
      expect(exec).toHaveBeenNthCalledWith(5, ["-s", "R58N90ABCDE", "shell", "ime", "set", originalIme]);
    });

    it("surfaces a restore FAILURE as ImeRestoreFailedError carrying the original IME id (REQ-ERR-001, AC-ANDROID-015)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // am broadcast succeeds
        .mockResolvedValueOnce(fail("adb: ime set failed", 1)); // restore FAILS

      const backend = new AdbBackend(exec);

      const error = await backend.inputText("R58N90ABCDE", "안녕").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImeRestoreFailedError);
      expect((error as ImeRestoreFailedError).originalImeId).toBe(originalIme);
      expect((error as Error).message).toMatch(/ime set failed/);
    });

    it("reports restore failure even when the original send ALSO failed (both errors surfaced)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(fail("adb: broadcast failed", 1)) // send fails
        .mockResolvedValueOnce(fail("adb: restore failed", 1)); // restore ALSO fails

      const backend = new AdbBackend(exec);

      const error = await backend.inputText("R58N90ABCDE", "안녕").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImeRestoreFailedError);
      expect((error as ImeRestoreFailedError).originalImeId).toBe(originalIme);
      expect((error as Error).message).toMatch(/broadcast failed/);
      expect((error as Error).message).toMatch(/restore failed/);
    });

    it("skips the restore attempt and reports manual recovery when the original IME could not be determined (acceptance.md §D.1 edge case)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("null\n")) // settings get returns literal "null" (unset/unknown)
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(ok("")); // am broadcast succeeds

      const backend = new AdbBackend(exec);

      const error = await backend.inputText("R58N90ABCDE", "안녕").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImeRestoreFailedError);
      expect((error as ImeRestoreFailedError).originalImeId).toBeUndefined();
      // No 5th call: no blind `ime set ""` attempted against the device.
      expect(exec).toHaveBeenCalledTimes(4);
    });
  });

  describe("per-serial IME tracking (M7, REQ-MULTIDEV-003)", () => {
    it("getTrackedOriginalIme returns undefined before any non-ASCII inputText call", () => {
      const backend = new AdbBackend(vi.fn<AdbExecutor>());

      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });

    it("clears the tracked entry after a successful restore", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""));
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "안녕");

      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });

    it("retains the tracked entry when restore fails (for audit / manual recovery)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(fail("restore failed", 1));
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "안녕").catch(() => undefined);

      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);
    });

    it("does not clobber per-serial IME state when two devices are operated on concurrently (REQ-MULTIDEV-003, AC-ANDROID-004)", async () => {
      const originalImeFor: Record<string, string> = {
        A: "com.example/.KeyboardA",
        B: "com.example/.KeyboardB",
      };

      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        const serial = args[1] as string;
        if (args[3] === "settings") {
          return ok(`${originalImeFor[serial]}\n`);
        }
        return ok("");
      });

      const backend = new AdbBackend(exec);

      await Promise.all([backend.inputText("A", "안녕"), backend.inputText("B", "반가워")]);

      // Each serial's restore call ("ime" "set" <original>) must use ITS OWN
      // original IME, never the other serial's.
      const crossContaminated = exec.mock.calls.some(([callArgs]) => {
        const serial = callArgs[1] as string;
        const lastArg = callArgs[callArgs.length - 1] as string;
        return (
          (serial === "A" && lastArg === originalImeFor.B) ||
          (serial === "B" && lastArg === originalImeFor.A)
        );
      });
      expect(crossContaminated).toBe(false);

      const restoreCallExists = (serial: string, expectedIme: string) =>
        exec.mock.calls.some(
          ([callArgs]) =>
            callArgs[1] === serial &&
            callArgs[2] === "shell" &&
            callArgs[3] === "ime" &&
            callArgs[4] === "set" &&
            callArgs[5] === expectedIme,
        );

      expect(restoreCallExists("A", originalImeFor.A!)).toBe(true);
      expect(restoreCallExists("B", originalImeFor.B!)).toBe(true);

      // Both tracked entries are cleared after their own successful restores.
      expect(backend.getTrackedOriginalIme("A")).toBeUndefined();
      expect(backend.getTrackedOriginalIme("B")).toBeUndefined();
    });

    it("does not accumulate state across repeated successful calls for the same serial (REQ-IDEMP-001)", async () => {
      const originalIme = "com.example/.OriginalIme";
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "settings") return ok(`${originalIme}\n`);
        return ok("");
      });
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "안녕");
      await backend.inputText("R58N90ABCDE", "반가워");
      await backend.inputText("R58N90ABCDE", "😸");

      // Tracked state never grew beyond one entry for this serial, and is
      // cleared after each successful cycle.
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });
  });
});
