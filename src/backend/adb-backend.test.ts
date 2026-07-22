import { describe, expect, it, vi } from "vitest";

import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { AdbBackend } from "./adb-backend.js";
import type { ApkAcquirer } from "./apk-downloader.js";
import { AdbKeyboardInstallFailedError } from "./ime-errors.js";

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
    it("sends via 'shell input text' with the string shell-single-quoted, touching no IME state, then hides the keyboard by default (REQ-INPUT-004 revised)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("")).mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "hello world");

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, ["-s", "R58N90ABCDE", "shell", "input", "text", "'hello world'"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-s", "R58N90ABCDE", "shell", "input", "keyevent", "111"]);
    });

    it("escapes an embedded single quote for the device-side shell", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("")).mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "it's ok!");

      expect(exec).toHaveBeenNthCalledWith(1, ["-s", "R58N90ABCDE", "shell", "input", "text", "'it'\\''s ok!'"]);
    });

    it("treats a whitespace-only string as ASCII (acceptance.md §D.1 edge case)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("")).mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "   ");

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, ["-s", "R58N90ABCDE", "shell", "input", "text", "'   '"]);
    });

    it("propagates a failed ASCII send as a generic error, without attempting the keyboard-hide", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("adb: device offline", 1));

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "hello")).rejects.toThrow(/device offline/);
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it("--keep-keyboard (hideKeyboardAfter: false) skips the post-send keyboard-hide keyevent", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.inputText("R58N90ABCDE", "hello", { hideKeyboardAfter: false });

      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(["-s", "R58N90ABCDE", "shell", "input", "text", "'hello'"]);
    });

    it("a keyboard-hide failure is swallowed and never fails the text command (best-effort)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(""))
        .mockRejectedValueOnce(new Error("spawn adb ENOENT"));

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "hello")).resolves.toBeUndefined();
      expect(exec).toHaveBeenCalledTimes(2);
    });
  });

  describe("inputText — non-ASCII SESSION-based IME lifecycle (REQ-INPUT-003/004 revised, REQ-IDEMP-004)", () => {
    function okFirstSwitchSequence(originalIme = "com.google.android.inputmethod.latin/.LatinIME") {
      // pm list packages (self-heal check, already installed) -> settings
      // get (original IME) -> ime enable -> ime set (ADBKeyBoard) -> am
      // broadcast -> keyevent hide
      return vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get secure default_input_method
        .mockResolvedValueOnce(ok("")) // ime enable ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // am broadcast ADB_INPUT_B64
        .mockResolvedValueOnce(ok("")); // keyevent 111 (keyboard hide)
    }

    it("treats emoji-only input as non-ASCII (acceptance.md §D.1 edge case)", async () => {
      const exec = okFirstSwitchSequence();
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "😸");

      expect(exec).toHaveBeenCalledTimes(6);
    });

    it("records the original IME, switches to ADBKeyBoard, broadcasts base64 UTF-8, then hides the keyboard — WITHOUT restoring the original IME per-call (REQ-INPUT-004 revised)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = okFirstSwitchSequence(originalIme);
      const backend = new AdbBackend(exec);

      const text = "안녕하세요 😸";
      const expectedBase64 = Buffer.from(text, "utf-8").toString("base64");

      await backend.inputText("R58N90ABCDE", text);

      expect(exec).toHaveBeenNthCalledWith(1, ["-s", "R58N90ABCDE", "shell", "pm", "list", "packages"]);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "settings",
        "get",
        "secure",
        "default_input_method",
      ]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "enable",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(exec).toHaveBeenNthCalledWith(4, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "set",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(exec).toHaveBeenNthCalledWith(5, [
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
      // 6th call is the keyboard-hide keyevent — NEVER a restore `ime set`.
      expect(exec).toHaveBeenNthCalledWith(6, ["-s", "R58N90ABCDE", "shell", "input", "keyevent", "111"]);

      // The session stays active: the original IME is still tracked, ready
      // to be restored only by `reset` (see reset.ts / doctor.ts tests).
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);

      // Round-trip sanity: decoding the base64 we sent must reproduce the original text exactly.
      expect(Buffer.from(expectedBase64, "base64").toString("utf-8")).toBe(text);
    });

    it("a second non-ASCII call on the SAME serial skips the IME switch entirely (session-based, REQ-INPUT-004 revised)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "pm") return ok("package:com.android.adbkeyboard\n");
        if (args[3] === "settings") return ok(`${originalIme}\n`);
        return ok("");
      });
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "안녕");
      expect(exec).toHaveBeenCalledTimes(6); // pm list, settings get, ime enable, ime set, broadcast, hide

      exec.mockClear();
      await backend.inputText("R58N90ABCDE", "반가워");

      // Second call: only the broadcast + keyboard-hide — no settings get /
      // ime enable / ime set (ADBKeyBoard is already the active session IME).
      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "broadcast",
        "-a",
        "ADB_INPUT_B64",
        "--es",
        "msg",
        Buffer.from("반가워", "utf-8").toString("base64"),
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-s", "R58N90ABCDE", "shell", "input", "keyevent", "111"]);
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);
    });

    it("does NOT attempt any restore when the broadcast send fails, and re-throws the original send error (session stays active for retry)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(fail("adb: broadcast failed", 1)); // am broadcast FAILS

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toThrow(/broadcast failed/);

      // No 6th call: no restore, no keyboard-hide attempted after a failed send.
      expect(exec).toHaveBeenCalledTimes(5);
      // The switch itself succeeded, so the session remains tracked as
      // active — a retry on this serial will skip re-switching.
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);
    });

    it("does not mark the session active when the IME switch itself fails (safe to retry the switch on the next call)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok("com.example/.Original\n")) // settings get
        .mockResolvedValueOnce(fail("adb: ime enable rejected", 1)); // ime enable FAILS

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toThrow(/ime enable rejected/);

      expect(exec).toHaveBeenCalledTimes(3);
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });

    it("switches IME and sends even when the original IME could not be determined, tracking an empty (unknown) entry instead of throwing (acceptance.md §D.1 edge case)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok("null\n")) // settings get returns literal "null" (unset/unknown)
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // am broadcast succeeds
        .mockResolvedValueOnce(ok("")); // keyevent hide

      const backend = new AdbBackend(exec);

      await expect(backend.inputText("R58N90ABCDE", "안녕")).resolves.toBeUndefined();

      expect(exec).toHaveBeenCalledTimes(6);
      // Tracked as an active session with an unknown (empty) original id —
      // `getTrackedOriginalIme` returns "" (defined, but empty), not undefined.
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe("");
    });
  });

  describe("inputText — ADBKeyBoard self-heal install (REQ-INPUT-003 revised)", () => {
    // `reset` uninstalls ADBKeyBoard as part of restoring the device to its
    // pre-`doctor` state (doctor.test.ts / real-device finding); a
    // subsequent non-ASCII `text` call must re-install it on demand rather
    // than fail with "Unknown input method ... cannot be enabled".

    it("auto-installs ADBKeyBoard via the shared install helper when 'pm list packages' shows it missing, then proceeds with the IME switch + broadcast", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n")) // pm list packages (ADBKeyBoard NOT present)
        .mockResolvedValueOnce(ok("Success")) // adb install <downloaded apk path>
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get secure default_input_method
        .mockResolvedValueOnce(ok("")) // ime enable ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // am broadcast ADB_INPUT_B64
        .mockResolvedValueOnce(ok("")); // keyevent 111 (keyboard hide)
      const acquireApk = vi.fn<ApkAcquirer>().mockResolvedValue({
        path: "/home/user/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk",
        fromCache: false,
        sourceUrl: "https://github.com/senzhk/ADBKeyBoard/releases/download/v2.4-dev/ADBKeyboard.apk",
      });

      const backend = new AdbBackend(exec, acquireApk);
      await backend.inputText("R58N90ABCDE", "안녕하세요");

      expect(acquireApk).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenNthCalledWith(1, ["-s", "R58N90ABCDE", "shell", "pm", "list", "packages"]);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "install",
        "/home/user/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk",
      ]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "settings",
        "get",
        "secure",
        "default_input_method",
      ]);
      expect(exec).toHaveBeenNthCalledWith(4, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "enable",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(exec).toHaveBeenNthCalledWith(5, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "set",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(exec).toHaveBeenCalledTimes(7);
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);
    });

    it("skips the install step (fast path) when ADBKeyBoard is already present, still switching the IME and sending", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already present)
        .mockResolvedValueOnce(ok("")) // settings get
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set
        .mockResolvedValueOnce(ok("")) // am broadcast
        .mockResolvedValueOnce(ok("")); // keyevent hide
      const acquireApk = vi.fn<ApkAcquirer>();

      const backend = new AdbBackend(exec, acquireApk);
      await backend.inputText("R58N90ABCDE", "안녕");

      expect(acquireApk).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledTimes(6);
    });

    it("throws AdbKeyboardInstallFailedError with the APK_DOWNLOAD_FAILED code and attempts no IME switch when the runtime download fails (device left unchanged)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("package:com.android.settings\n")); // pm list — not present
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockRejectedValue(new Error("Failed to download a valid ADBKeyBoard APK from ... . Install manually: ..."));

      const backend = new AdbBackend(exec, acquireApk);

      const thrown: unknown = await backend.inputText("R58N90ABCDE", "안녕").catch((err: unknown) => err);

      expect(thrown).toBeInstanceOf(AdbKeyboardInstallFailedError);
      expect((thrown as AdbKeyboardInstallFailedError).code).toBe("APK_DOWNLOAD_FAILED");

      // Only the pm-list query happened — no settings get / ime enable /
      // ime set / broadcast: the device is left in its pre-call state.
      expect(exec).toHaveBeenCalledTimes(1);
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });

    it("throws AdbKeyboardInstallFailedError with the APK_INSTALL_FAILED code when 'adb install' itself fails after a successful download", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n")) // pm list — not present
        .mockResolvedValueOnce(fail("INSTALL_FAILED_OLDER_SDK", 1)); // adb install fails
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockResolvedValue({ path: "/fake/cache/ADBKeyBoard.apk", fromCache: false, sourceUrl: "https://example.test/apk" });

      const backend = new AdbBackend(exec, acquireApk);

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toMatchObject({
        name: "AdbKeyboardInstallFailedError",
        code: "APK_INSTALL_FAILED",
      });

      expect(exec).toHaveBeenCalledTimes(2);
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });
  });

  describe("per-serial IME session tracking (M7, REQ-MULTIDEV-003, REQ-INPUT-004 revised)", () => {
    it("getTrackedOriginalIme returns undefined before any non-ASCII inputText call", () => {
      const backend = new AdbBackend(vi.fn<AdbExecutor>());

      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();
    });

    it("clearTrackedOriginalIme clears an active session so the next non-ASCII call switches again", async () => {
      const originalIme = "com.example/.OriginalIme";
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "pm") return ok("package:com.android.adbkeyboard\n"); // self-heal check: already installed
        if (args[3] === "settings") return ok(`${originalIme}\n`);
        return ok("");
      });
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "안녕");
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);

      backend.clearTrackedOriginalIme("R58N90ABCDE");
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBeUndefined();

      exec.mockClear();
      await backend.inputText("R58N90ABCDE", "다시");

      // Fresh session: the switch sequence (settings get + ime enable + ime
      // set) runs again since the prior session was cleared.
      const settingsGetCalls = exec.mock.calls.filter(([callArgs]) => callArgs[3] === "settings");
      expect(settingsGetCalls).toHaveLength(1);
    });

    it("clearTrackedOriginalIme only clears the targeted serial, leaving other serials' sessions untouched", async () => {
      const originalImeFor: Record<string, string> = {
        A: "com.example/.KeyboardA",
        B: "com.example/.KeyboardB",
      };
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "pm") return ok("package:com.android.adbkeyboard\n"); // self-heal check: already installed
        const serial = args[1] as string;
        if (args[3] === "settings") return ok(`${originalImeFor[serial]}\n`);
        return ok("");
      });
      const backend = new AdbBackend(exec);

      await Promise.all([backend.inputText("A", "안녕"), backend.inputText("B", "반가워")]);

      backend.clearTrackedOriginalIme("A");

      expect(backend.getTrackedOriginalIme("A")).toBeUndefined();
      expect(backend.getTrackedOriginalIme("B")).toBe(originalImeFor.B);
    });

    it("tracks per-serial original IME independently when two devices are operated on concurrently, without cross-contamination (REQ-MULTIDEV-003, AC-ANDROID-004)", async () => {
      const originalImeFor: Record<string, string> = {
        A: "com.example/.KeyboardA",
        B: "com.example/.KeyboardB",
      };

      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "pm") return ok("package:com.android.adbkeyboard\n"); // self-heal check: already installed
        const serial = args[1] as string;
        if (args[3] === "settings") {
          return ok(`${originalImeFor[serial]}\n`);
        }
        return ok("");
      });

      const backend = new AdbBackend(exec);

      await Promise.all([backend.inputText("A", "안녕"), backend.inputText("B", "반가워")]);

      // Neither serial's tracked original IME leaked into the other's.
      expect(backend.getTrackedOriginalIme("A")).toBe(originalImeFor.A);
      expect(backend.getTrackedOriginalIme("B")).toBe(originalImeFor.B);

      // No `ime set` call restoring to either serial's ORIGINAL IME happened
      // at all (session-based — REQ-INPUT-004 revised). The switch-to-
      // ADBKeyBoard `ime set` calls are expected and excluded from this check.
      const anyRestoreCall = exec.mock.calls.some(
        ([callArgs]) =>
          callArgs[3] === "ime" &&
          callArgs[4] === "set" &&
          (callArgs[5] === originalImeFor.A || callArgs[5] === originalImeFor.B),
      );
      expect(anyRestoreCall).toBe(false);
    });

    it("does not re-switch or accumulate state across repeated non-ASCII calls for the same serial (REQ-IDEMP-001, session-based)", async () => {
      const originalIme = "com.example/.OriginalIme";
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "pm") return ok("package:com.android.adbkeyboard\n"); // self-heal check: already installed
        if (args[3] === "settings") return ok(`${originalIme}\n`);
        return ok("");
      });
      const backend = new AdbBackend(exec);

      await backend.inputText("R58N90ABCDE", "안녕");
      await backend.inputText("R58N90ABCDE", "반가워");
      await backend.inputText("R58N90ABCDE", "😸");

      // The IME switch (settings get + ime enable + ime set) happened only
      // once, on the first call.
      const settingsGetCalls = exec.mock.calls.filter(([callArgs]) => callArgs[3] === "settings");
      expect(settingsGetCalls).toHaveLength(1);

      // Tracked state stays a single, unchanged entry across all 3 calls.
      expect(backend.getTrackedOriginalIme("R58N90ABCDE")).toBe(originalIme);
    });
  });
});
