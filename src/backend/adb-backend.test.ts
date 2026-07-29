import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { AdbBackend } from "./adb-backend.js";
import { ADBKEYBOARD_IME_ID } from "./adbkeyboard.js";
import type { ApkAcquirer } from "./apk-downloader.js";
import { AdbKeyboardInstallFailedError, ImeBindTimeoutError } from "./ime-errors.js";
import { ImeSessionStore } from "./ime-session-store.js";
import { LauncherActivityNotFoundError } from "./launch-errors.js";
import { normalizeUiAutomatorXml } from "../normalize/uiautomator.js";

function ok(stdout: string, stderr = ""): AdbExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.from(stderr, "utf-8"), exitCode: 0 };
}

function okBinary(bytes: Buffer): AdbExecResult {
  return { stdout: bytes, stderr: Buffer.alloc(0), exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): AdbExecResult {
  return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode };
}

/** `dumpsys input_method` stdout fixture for the IME-binding-readiness poll (REQ-INPUT-004 개정 0.3.0, M10). */
function dumpsysBindingState(bound: boolean): AdbExecResult {
  return ok(`mCurId=${ADBKEYBOARD_IME_ID}\nmBoundToMethod=${bound}\n`);
}

/** A no-op sleep, injected into `AdbBackend`'s constructor so tests exercising the bounded poll never wait out the real inter-poll delay. */
const noRealDelay = async (): Promise<void> => {
  // Intentionally instant — see AdbBackend's `sleep` constructor parameter.
};

/**
 * Simulates a real device's IME state across (possibly several, process-
 * boundary-crossing) `AdbBackend` calls: `settings get` reflects whatever
 * `ime set` last wrote, exactly like a real device would. `pm list
 * packages` always reports ADBKeyBoard as already installed unless
 * `adbKeyboardInstalled: false` is passed, so install-related assertions
 * can opt into the self-heal path explicitly.
 */
function createDeviceImeSimulator(initialIme: string, options?: { adbKeyboardInstalled?: boolean }) {
  let currentIme = initialIme;
  const adbKeyboardInstalled = options?.adbKeyboardInstalled ?? true;
  const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
    if (args[3] === "pm" && args[4] === "list") {
      return ok(adbKeyboardInstalled ? "package:com.android.adbkeyboard\n" : "package:com.android.settings\n");
    }
    if (args[3] === "settings") {
      return ok(`${currentIme}\n`);
    }
    if (args[3] === "ime" && args[4] === "set") {
      currentIme = args[5] as string;
      return ok("");
    }
    if (args[3] === "dumpsys" && args[4] === "input_method") {
      // Idealized instant-bound device (real hardware measured roughly one
      // adb round-trip, spec.md §C.3-⑦) — always reports bound on the
      // first poll, so tests using this simulator exercise exactly one
      // dumpsys call on the cold path.
      return ok(`mCurId=${currentIme}\nmBoundToMethod=true\n`);
    }
    return ok("");
  });
  return { exec, getCurrentIme: () => currentIme };
}

describe("AdbBackend", () => {
  // A fresh temp dir per test, used ONLY by the non-ASCII IME-session
  // tests below — the on-disk `ImeSessionStore` must never touch the
  // real `~/.cache/explore-mobile` directory during tests. Constructing a
  // NEW `ImeSessionStore(imeStorePath)` (rather than reusing one) inside
  // a test simulates a brand-new CLI process reading the same file.
  let imeStoreDir: string;
  let imeStorePath: string;

  beforeEach(async () => {
    imeStoreDir = await mkdtemp(join(tmpdir(), "explore-mobile-adb-backend-"));
    imeStorePath = join(imeStoreDir, "ime-sessions.json");
  });

  afterEach(async () => {
    await rm(imeStoreDir, { recursive: true, force: true });
  });

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
          platform: "android",
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
          platform: "android",
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
    it("writes, streams via exec-out cat, then removes the device-side temp file, using the SAME path across all three calls, and returns the XML normalized to CommonElement[] (REQ-DUMP-001, REQ-IDEMP-003, REQ-IOS-SCHEMA-002/003)", async () => {
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
      // REQ-IOS-SCHEMA-003: normalization now happens INSIDE the backend —
      // the caller receives CommonElement[], not the raw XML string.
      expect(result).toEqual(normalizeUiAutomatorXml(xml));
      expect(result).toEqual([{ role: "a", text: "", id: "", bounds: { x: 0, y: 0, w: 0, h: 0 }, tappable: false, enabled: false, children: [] }]);
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

  describe("swipe (AC-GEST-001, AC-GEST-002 — SPEC-GESTURE-001 M1)", () => {
    it("calls 'shell input swipe <x1> <y1> <x2> <y2>' targeted with -s <serial>, with no duration argument when options are omitted", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.swipe("R58N90ABCDE", { x: 100, y: 800 }, { x: 100, y: 200 });

      expect(exec).toHaveBeenCalledWith([
        "-s",
        "R58N90ABCDE",
        "shell",
        "input",
        "swipe",
        "100",
        "800",
        "100",
        "200",
      ]);
    });

    it("passes --duration ms straight through as the trailing argument (adb's swipe duration unit is already ms — spec.md §C.1-⑥)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.swipe("R58N90ABCDE", { x: 100, y: 800 }, { x: 100, y: 200 }, { durationMs: 500 });

      expect(exec).toHaveBeenCalledWith([
        "-s",
        "R58N90ABCDE",
        "shell",
        "input",
        "swipe",
        "100",
        "800",
        "100",
        "200",
        "500",
      ]);
    });

    it("throws when the underlying adb swipe invocation exits non-zero", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("device offline"));

      const backend = new AdbBackend(exec);

      await expect(backend.swipe("R58N90ABCDE", { x: 0, y: 0 }, { x: 1, y: 1 })).rejects.toThrow(/device offline/);
    });
  });

  describe("getMinEffectiveSwipeThreshold (AC-GEST-026, AC-GEST-027 — SPEC-GESTURE-001 M8)", () => {
    it.each([
      ["420", 23],
      ["480", 26],
      ["600", 32],
      ["640", 34],
    ])(
      "queries 'shell wm density' and derives floor(8dp x density) + 2px margin -- %s dpi -> %s px",
      async (dpi, expectedPx) => {
        const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(`Physical density: ${dpi}\n`));

        const backend = new AdbBackend(exec);
        const threshold = await backend.getMinEffectiveSwipeThreshold("R3CY106LKVX");

        expect(exec).toHaveBeenCalledWith(["-s", "R3CY106LKVX", "shell", "wm", "density"]);
        expect(threshold).toEqual({ minEffectiveSwipePx: expectedPx, basis: "device-query" });
      },
    );

    it("derives 30px slop + 2px margin = 32px at 600dpi (spec.md §C.1-⑰ measured device) -- never returns the probabilistic slop+1 boundary (31px)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("Physical density: 600\n"));

      const backend = new AdbBackend(exec);
      const threshold = await backend.getMinEffectiveSwipeThreshold("R3CY106LKVX");

      expect(threshold.minEffectiveSwipePx).toBe(32);
      expect(threshold.minEffectiveSwipePx).not.toBe(31);
      expect(threshold.minEffectiveSwipePx).toBeGreaterThan(30);
    });

    it("carries no hardcoded Android pixel constant -- the returned value scales with the mocked density (contrast with IdbBackend's fixed 11)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("Physical density: 160\n")); // baseline mdpi (1.0x)

      const backend = new AdbBackend(exec);
      const threshold = await backend.getMinEffectiveSwipeThreshold("R3CY106LKVX");

      // 8dp * 1.0 + 2px = 10px -- far below the iOS constant (11), proving
      // this is a computed expression, not a shared/duplicated constant.
      expect(threshold.minEffectiveSwipePx).toBe(10);
      expect(threshold.basis).toBe("device-query");
    });

    it("throws when 'wm density' output cannot be parsed (no 'Physical density:' line)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("unexpected output\n"));

      const backend = new AdbBackend(exec);

      await expect(backend.getMinEffectiveSwipeThreshold("R3CY106LKVX")).rejects.toThrow();
    });

    it("throws when the underlying 'wm density' invocation exits non-zero", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("device offline"));

      const backend = new AdbBackend(exec);

      await expect(backend.getMinEffectiveSwipeThreshold("R3CY106LKVX")).rejects.toThrow(/device offline/);
    });
  });

  describe("getMinEffectiveSwipeThreshold — effective (Override) density (AC-GEST-030 — SPEC-GESTURE-001 M9)", () => {
    it("fixture A -- no Override line: reads Physical density alone (600dpi -> 32px, unchanged from M8)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("Physical density: 600\n"));

      const backend = new AdbBackend(exec);
      const threshold = await backend.getMinEffectiveSwipeThreshold("R3CY106LKVX");

      expect(threshold).toEqual({ minEffectiveSwipePx: 32, basis: "device-query" });
    });

    it("fixture B -- shrink override (Physical 600 / Override 480): reads the Override line, not Physical -- floor(8 * 3.0) + 2 = 26px", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("Physical density: 600\nOverride density: 480\n"));

      const backend = new AdbBackend(exec);
      const threshold = await backend.getMinEffectiveSwipeThreshold("R3CY106LKVX");

      // A max(physical, override) implementation would derive
      // floor(8 * 3.75) + 2 = 32 here -- over-rejecting on the shrink
      // direction (spec.md §B.9 H3). This fixture is the one that fails
      // that implementation: the effective (Override) density alone is
      // the only correct basis, giving 26, not 32.
      expect(threshold).toEqual({ minEffectiveSwipePx: 26, basis: "device-query" });
      expect(threshold.minEffectiveSwipePx).not.toBe(32);
    });

    it("fixture C -- enlarge override (Physical 480 / Override 600): reads the Override line -- floor(8 * 3.75) + 2 = 32px, NOT the 26px a Physical-only reader derives (the shipped defect this amendment fixes, spec.md §C.1-⑳/§B.9 H1)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("Physical density: 480\nOverride density: 600\n"));

      const backend = new AdbBackend(exec);
      const threshold = await backend.getMinEffectiveSwipeThreshold("R3CY106LKVX");

      // Reading Physical alone (480dpi -> floor(8*3.0)+2=26) sits BELOW the
      // OS slop under the active Override (floor(8*3.75)=30) -- an
      // AMOUNT_TOO_SMALL threshold that would be silently interpreted as a
      // TAP on the real device (spec.md §C.1-⑱). The fix must derive 32.
      expect(threshold).toEqual({ minEffectiveSwipePx: 32, basis: "device-query" });
      expect(threshold.minEffectiveSwipePx).not.toBe(26);
    });

    it("fixture D -- unparseable output (no Physical or Override line): throws rather than guessing a threshold", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("unexpected output\n"));

      const backend = new AdbBackend(exec);

      await expect(backend.getMinEffectiveSwipeThreshold("R3CY106LKVX")).rejects.toThrow();
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

  describe("launchApp / stopApp (REQ-APP-001 개정 0.3.0 — 명시적 컴포넌트 시작, M11)", () => {
    const RESOLVE_ARGV = [
      "-s",
      "R58N90ABCDE",
      "shell",
      "cmd",
      "package",
      "resolve-activity",
      "--brief",
      "-a",
      "android.intent.action.MAIN",
      "-c",
      "android.intent.category.LAUNCHER",
      "com.android.settings",
    ];

    it("resolves the launcher component then starts it explicitly — no implicit -p argv is ever constructed (AC-ANDROID-025)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(
          ok("priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\ncom.android.settings/.Settings\n"),
        )
        .mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.launchApp("R58N90ABCDE", "com.android.settings");

      expect(exec).toHaveBeenNthCalledWith(1, RESOLVE_ARGV);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "start",
        "-n",
        "com.android.settings/.Settings",
      ]);
      // No `--user` argument anywhere (spec.md §C.3-② — measured unnecessary)
      // and no argv element is the literal implicit-intent flag "-p".
      for (const call of exec.mock.calls) {
        expect(call[0]).not.toContain("--user");
        expect(call[0]).not.toContain("-p");
      }
    });

    it("passes a leading-dot relative activity through to 'am start -n' unmodified (spec.md §C.3-①, real-device fixture)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(
          ok(
            "priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\ncom.sec.android.app.popupcalculator/.Calculator\n",
          ),
        )
        .mockResolvedValueOnce(ok(""));

      const backend = new AdbBackend(exec);
      await backend.launchApp("R58N90ABCDE", "com.sec.android.app.popupcalculator");

      expect(exec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "start",
        "-n",
        "com.sec.android.app.popupcalculator/.Calculator",
      ]);
    });

    it("rejects with LauncherActivityNotFoundError and sends NO start intent when resolve reports 'No activity found' at exit code 0 (spec.md §C.3-②, AC-ANDROID-028)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("No activity found\n"));

      const backend = new AdbBackend(exec);

      await expect(backend.launchApp("R58N90ABCDE", "com.example.doesnotexist")).rejects.toBeInstanceOf(
        LauncherActivityNotFoundError,
      );
      // Only the resolve query was ever sent — no `am start` argv reached exec.
      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(RESOLVE_ARGV.map((a) => (a === "com.android.settings" ? "com.example.doesnotexist" : a)));
    });

    it("does NOT assert a single cause in the rejected error's message (spec.md §C.3-③ — both possibilities)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("No activity found\n"));
      const backend = new AdbBackend(exec);

      await expect(backend.launchApp("R58N90ABCDE", "com.example.doesnotexist")).rejects.toThrow(
        /has no launcher activity.*OR.*not installed|not installed.*OR.*no launcher activity/is,
      );
    });

    it("preserves task-resume semantics: a resume warning at exit code 0 is NOT a failure (spec.md §C.3-④, AC-ANDROID-027)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(
          ok("priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true\ncom.android.settings/.Settings\n"),
        )
        .mockResolvedValueOnce(ok("Warning: Activity not started, its current task has been brought to the front"));

      const backend = new AdbBackend(exec);

      await expect(backend.launchApp("R58N90ABCDE", "com.android.settings")).resolves.toBeUndefined();
    });

    it("still throws a generic failure when the resolve query itself exits non-zero (genuine backend failure, not an unresolved activity)", async () => {
      const exec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("error: no devices/emulators found", 1));

      const backend = new AdbBackend(exec);

      await expect(backend.launchApp("R58N90ABCDE", "com.android.settings")).rejects.not.toBeInstanceOf(
        LauncherActivityNotFoundError,
      );
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

  describe("inputText — non-ASCII disk-persisted IME session lifecycle (REQ-INPUT-003/004 disk-persistence fix, REQ-IDEMP-004)", () => {
    function okFirstSwitchSequence(originalIme = "com.google.android.inputmethod.latin/.LatinIME") {
      // settings get (current/original IME, NOT yet ADBKeyBoard) -> pm
      // list packages (self-heal check, already installed) -> ime enable
      // -> ime set (ADBKeyBoard) -> dumpsys input_method (binding-readiness
      // poll, REQ-INPUT-004 개정 0.3.0, bound on the first poll) -> am
      // broadcast -> keyevent hide
      return vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get secure default_input_method
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok("")) // ime enable ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(dumpsysBindingState(true)) // dumpsys input_method (bound on first poll)
        .mockResolvedValueOnce(ok("")) // am broadcast ADB_INPUT_B64
        .mockResolvedValueOnce(ok("")); // keyevent 111 (keyboard hide)
    }

    it("treats emoji-only input as non-ASCII (acceptance.md §D.1 edge case)", async () => {
      const exec = okFirstSwitchSequence();
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath));

      await backend.inputText("R58N90ABCDE", "😸");

      expect(exec).toHaveBeenCalledTimes(7);
    });

    it("reads the device's CURRENT IME first, records it as the original, switches to ADBKeyBoard, persists to disk, broadcasts base64 UTF-8, then hides the keyboard — WITHOUT restoring the original IME per-call (REQ-INPUT-004 disk-persistence fix)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = okFirstSwitchSequence(originalIme);
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath));

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
      expect(exec).toHaveBeenNthCalledWith(2, ["-s", "R58N90ABCDE", "shell", "pm", "list", "packages"]);
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
      // 5th call is the binding-readiness poll (REQ-INPUT-004 개정 0.3.0) —
      // it must happen AFTER the switch and BEFORE the broadcast.
      expect(exec).toHaveBeenNthCalledWith(5, ["-s", "R58N90ABCDE", "shell", "dumpsys", "input_method"]);
      expect(exec).toHaveBeenNthCalledWith(6, [
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
      // 7th call is the keyboard-hide keyevent — NEVER a restore `ime set`.
      expect(exec).toHaveBeenNthCalledWith(7, ["-s", "R58N90ABCDE", "shell", "input", "keyevent", "111"]);

      // The session stays active on disk: the original IME is persisted,
      // ready to be restored only by `reset` (see reset.ts / doctor.ts tests).
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);

      // Round-trip sanity: decoding the base64 we sent must reproduce the original text exactly.
      expect(Buffer.from(expectedBase64, "base64").toString("utf-8")).toBe(text);
    });

    it("a second non-ASCII call on the SAME serial (same process) skips the IME switch entirely — only the live current-IME check + broadcast + hide run", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const simulator = createDeviceImeSimulator(originalIme);
      const backend = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));

      await backend.inputText("R58N90ABCDE", "안녕");
      expect(simulator.exec).toHaveBeenCalledTimes(7); // settings get, pm list, ime enable, ime set, dumpsys (bind poll), broadcast, hide

      simulator.exec.mockClear();
      await backend.inputText("R58N90ABCDE", "반가워");

      // Second call: the live current-IME check still runs (it is the
      // source of truth), but ADBKeyBoard is already active so the
      // self-heal check and the ime enable/set calls are skipped.
      expect(simulator.exec).toHaveBeenCalledTimes(3);
      expect(simulator.exec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "settings",
        "get",
        "secure",
        "default_input_method",
      ]);
      expect(simulator.exec).toHaveBeenNthCalledWith(2, [
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
      expect(simulator.exec).toHaveBeenNthCalledWith(3, ["-s", "R58N90ABCDE", "shell", "input", "keyevent", "111"]);
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("a second non-ASCII call from a BRAND-NEW AdbBackend instance sharing the same on-disk store also skips the IME switch — the cross-process fix (REQ-INPUT-004 disk-persistence fix)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const simulator = createDeviceImeSimulator(originalIme);

      // "Process 1": establishes the session on the real device state.
      const process1 = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));
      await process1.inputText("R58N90ABCDE", "안녕");
      expect(simulator.getCurrentIme()).toBe(ADBKEYBOARD_IME_ID);

      // "Process 1" exits. A BRAND-NEW AdbBackend + ImeSessionStore
      // instance — zero shared in-memory state — simulates the next CLI
      // invocation, pointed at the SAME on-disk file.
      simulator.exec.mockClear();
      const process2 = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));
      await process2.inputText("R58N90ABCDE", "반가워");

      // No ime enable/set call happened in "process 2" — only the live
      // current-IME check (which correctly saw ADBKeyBoard already
      // active) plus broadcast + hide.
      expect(simulator.exec).toHaveBeenCalledTimes(3);
      const switchCalls = simulator.exec.mock.calls.filter(
        ([callArgs]) => callArgs[3] === "ime" && (callArgs[4] === "enable" || callArgs[4] === "set"),
      );
      expect(switchCalls).toHaveLength(0);

      // The TRUE original — recorded by process 1 — survived, read
      // correctly by process 2's independent ImeSessionStore instance.
      await expect(process2.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("does NOT attempt any restore when the broadcast send fails, and re-throws the original send error (session stays persisted for retry)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(dumpsysBindingState(true)) // dumpsys input_method (bound on first poll)
        .mockResolvedValueOnce(fail("adb: broadcast failed", 1)); // am broadcast FAILS

      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath));

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toThrow(/broadcast failed/);

      // No 7th call: no restore, no keyboard-hide attempted after a failed send.
      expect(exec).toHaveBeenCalledTimes(6);
      // The switch itself succeeded, so the session remains persisted to
      // disk as active — a retry on this serial will skip re-switching.
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("does not persist a session when the IME switch itself fails (safe to retry the switch on the next call)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("com.example/.Original\n")) // settings get
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(fail("adb: ime enable rejected", 1)); // ime enable FAILS

      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath));

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toThrow(/ime enable rejected/);

      expect(exec).toHaveBeenCalledTimes(3);
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
    });

    it("switches IME and sends even when the original IME could not be determined, persisting an empty (unknown) entry instead of throwing (acceptance.md §D.1 edge case)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("null\n")) // settings get returns literal "null" (unset/unknown)
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(dumpsysBindingState(true)) // dumpsys input_method (bound on first poll)
        .mockResolvedValueOnce(ok("")) // am broadcast succeeds
        .mockResolvedValueOnce(ok("")); // keyevent hide

      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath));

      await expect(backend.inputText("R58N90ABCDE", "안녕")).resolves.toBeUndefined();

      expect(exec).toHaveBeenCalledTimes(7);
      // Persisted as an active session with an unknown (empty) original id —
      // `getTrackedOriginalIme` resolves to "" (defined, but empty), not undefined.
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe("");
    });
  });

  describe("inputText — IME binding-readiness wait before broadcast (REQ-INPUT-004 개정 0.3.0, M10, AC-ANDROID-029/030/031)", () => {
    function coldSwitchThenPolls(pollResults: AdbExecResult[], originalIme = "com.google.android.inputmethod.latin/.LatinIME") {
      const mock = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get secure default_input_method
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already installed)
        .mockResolvedValueOnce(ok("")) // ime enable ADBKeyBoard
        .mockResolvedValueOnce(ok("")); // ime set ADBKeyBoard
      for (const pollResult of pollResults) {
        mock.mockResolvedValueOnce(pollResult);
      }
      return mock;
    }

    it("polls dumpsys until bound=true, THEN sends the broadcast — cold path (AC-ANDROID-029 mock leg)", async () => {
      const exec = coldSwitchThenPolls([
        dumpsysBindingState(false), // poll 1: not yet bound
        dumpsysBindingState(false), // poll 2: still not bound
        dumpsysBindingState(true), // poll 3: bound — proceed
        ok(""), // am broadcast
        ok(""), // keyevent hide
      ]);
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath), noRealDelay);

      await backend.inputText("R58N90ABCDE", "알림");

      // 4 switch calls + 3 dumpsys polls + broadcast + hide = 9.
      expect(exec).toHaveBeenCalledTimes(9);
      expect(exec).toHaveBeenNthCalledWith(5, ["-s", "R58N90ABCDE", "shell", "dumpsys", "input_method"]);
      expect(exec).toHaveBeenNthCalledWith(6, ["-s", "R58N90ABCDE", "shell", "dumpsys", "input_method"]);
      expect(exec).toHaveBeenNthCalledWith(7, ["-s", "R58N90ABCDE", "shell", "dumpsys", "input_method"]);
      expect(exec).toHaveBeenNthCalledWith(8, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "am",
        "broadcast",
        "-a",
        "ADB_INPUT_B64",
        "--es",
        "msg",
        Buffer.from("알림", "utf-8").toString("base64"),
      ]);
    });

    it("a dumpsys query failure (non-zero exit) during polling is treated as not-yet-ready and retried within the same bounded wait (acceptance.md §D.1 edge case)", async () => {
      const exec = coldSwitchThenPolls([
        fail("adb: dumpsys unavailable", 1), // poll 1: the readiness query itself fails
        dumpsysBindingState(true), // poll 2: succeeds, bound
        ok(""), // am broadcast
        ok(""), // keyevent hide
      ]);
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath), noRealDelay);

      await expect(backend.inputText("R58N90ABCDE", "알림")).resolves.toBeUndefined();

      expect(exec).toHaveBeenCalledTimes(8);
    });

    it("a dumpsys exec() REJECTION (not just a non-zero exit) during polling is also treated as not-yet-ready and retried", async () => {
      const exec = coldSwitchThenPolls([]); // switch sequence only; dumpsys handled below
      exec
        .mockRejectedValueOnce(new Error("spawn adb ENOENT")) // poll 1: the exec() call itself rejects
        .mockResolvedValueOnce(dumpsysBindingState(true)) // poll 2: succeeds, bound
        .mockResolvedValueOnce(ok("")) // am broadcast
        .mockResolvedValueOnce(ok("")); // keyevent hide
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath), noRealDelay);

      await expect(backend.inputText("R58N90ABCDE", "알림")).resolves.toBeUndefined();

      expect(exec).toHaveBeenCalledTimes(8);
    });

    it("warm path performs NO dumpsys poll at all — ADBKeyBoard already active and bound sends immediately (AC-ANDROID-030)", async () => {
      const simulator = createDeviceImeSimulator(ADBKEYBOARD_IME_ID); // already ADBKeyBoard = warm from the start
      const backend = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath), noRealDelay);

      await backend.inputText("R58N90ABCDE", "카메라");

      const dumpsysCalls = simulator.exec.mock.calls.filter(([callArgs]) => callArgs[3] === "dumpsys");
      expect(dumpsysCalls).toHaveLength(0);
      const imeSwitchCalls = simulator.exec.mock.calls.filter(
        ([callArgs]) => callArgs[3] === "ime" && (callArgs[4] === "enable" || callArgs[4] === "set"),
      );
      expect(imeSwitchCalls).toHaveLength(0);
      // settings get (live current-IME check) + broadcast + hide = 3, no wait.
      expect(simulator.exec).toHaveBeenCalledTimes(3);
    });

    it("throws ImeBindTimeoutError and sends NO broadcast when the binding never reports ready within the bounded wait (AC-ANDROID-031 — the mock-assertable core requirement)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "settings") return ok(`${originalIme}\n`);
        if (args[3] === "pm" && args[4] === "list") return ok("package:com.android.adbkeyboard\n");
        if (args[3] === "ime") return ok(""); // enable / set both succeed
        if (args[3] === "dumpsys") return dumpsysBindingState(false); // NEVER reports bound
        return ok("");
      });
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath), noRealDelay);

      const thrown: unknown = await backend.inputText("R58N90ABCDE", "알림").catch((err: unknown) => err);

      expect(thrown).toBeInstanceOf(ImeBindTimeoutError);
      expect((thrown as ImeBindTimeoutError).serial).toBe("R58N90ABCDE");

      // The mock-assertable core requirement: `am broadcast` argv must
      // NEVER reach the mock exec.
      const broadcastCalls = exec.mock.calls.filter(([callArgs]) => callArgs[3] === "am" && callArgs[4] === "broadcast");
      expect(broadcastCalls).toHaveLength(0);
      // The keyboard-hide keyevent is also never attempted after a timeout.
      const hideCalls = exec.mock.calls.filter(
        ([callArgs]) => callArgs[3] === "input" && callArgs[4] === "keyevent",
      );
      expect(hideCalls).toHaveLength(0);

      // REQ-IDEMP-004 invariant: the original IME is STILL persisted to
      // disk even though the send itself failed — `reset`/`doctor --clean`
      // can still restore it.
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("the bounded wait polls a fixed, finite number of times (design-choice ceiling, not a measured value — MAX_DURATION_MS precedent)", async () => {
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "settings") return ok("com.example/.Original\n");
        if (args[3] === "pm" && args[4] === "list") return ok("package:com.android.adbkeyboard\n");
        if (args[3] === "ime") return ok("");
        if (args[3] === "dumpsys") return dumpsysBindingState(false);
        return ok("");
      });
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath), noRealDelay);

      await expect(backend.inputText("R58N90ABCDE", "알림")).rejects.toBeInstanceOf(ImeBindTimeoutError);

      const dumpsysCalls = exec.mock.calls.filter(([callArgs]) => callArgs[3] === "dumpsys");
      // Bounded and finite: never an infinite/unbounded number of polls.
      expect(dumpsysCalls.length).toBeGreaterThan(0);
      expect(dumpsysCalls.length).toBeLessThanOrEqual(20); // ceil(5000ms / 250ms)
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
        .mockResolvedValueOnce(ok(`${originalIme}\n`)) // settings get secure default_input_method
        .mockResolvedValueOnce(ok("package:com.android.settings\n")) // pm list packages (ADBKeyBoard NOT present)
        .mockResolvedValueOnce(ok("Success")) // adb install <downloaded apk path>
        .mockResolvedValueOnce(ok("")) // ime enable ADBKeyBoard
        .mockResolvedValueOnce(ok("")) // ime set ADBKeyBoard
        .mockResolvedValueOnce(dumpsysBindingState(true)) // dumpsys input_method (bound on first poll)
        .mockResolvedValueOnce(ok("")) // am broadcast ADB_INPUT_B64
        .mockResolvedValueOnce(ok("")); // keyevent 111 (keyboard hide)
      const acquireApk = vi.fn<ApkAcquirer>().mockResolvedValue({
        path: "/home/user/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk",
        fromCache: false,
        sourceUrl: "https://github.com/senzhk/ADBKeyBoard/releases/download/v2.4-dev/ADBKeyboard.apk",
      });

      const backend = new AdbBackend(exec, acquireApk, new ImeSessionStore(imeStorePath));
      await backend.inputText("R58N90ABCDE", "안녕하세요");

      expect(acquireApk).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "settings",
        "get",
        "secure",
        "default_input_method",
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-s", "R58N90ABCDE", "shell", "pm", "list", "packages"]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-s",
        "R58N90ABCDE",
        "install",
        "/home/user/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk",
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
      expect(exec).toHaveBeenNthCalledWith(6, ["-s", "R58N90ABCDE", "shell", "dumpsys", "input_method"]);
      expect(exec).toHaveBeenCalledTimes(8);
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("skips the install step (fast path) when ADBKeyBoard is already present, still switching the IME and sending", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("")) // settings get
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\n")) // pm list packages (already present)
        .mockResolvedValueOnce(ok("")) // ime enable
        .mockResolvedValueOnce(ok("")) // ime set
        .mockResolvedValueOnce(dumpsysBindingState(true)) // dumpsys input_method (bound on first poll)
        .mockResolvedValueOnce(ok("")) // am broadcast
        .mockResolvedValueOnce(ok("")); // keyevent hide
      const acquireApk = vi.fn<ApkAcquirer>();

      const backend = new AdbBackend(exec, acquireApk, new ImeSessionStore(imeStorePath));
      await backend.inputText("R58N90ABCDE", "안녕");

      expect(acquireApk).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledTimes(7);
    });

    it("throws AdbKeyboardInstallFailedError with the APK_DOWNLOAD_FAILED code and attempts no IME switch when the runtime download fails (device left unchanged)", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("com.google.android.inputmethod.latin/.LatinIME\n")) // settings get
        .mockResolvedValueOnce(ok("package:com.android.settings\n")); // pm list — not present
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockRejectedValue(new Error("Failed to download a valid ADBKeyBoard APK from ... . Install manually: ..."));

      const backend = new AdbBackend(exec, acquireApk, new ImeSessionStore(imeStorePath));

      const thrown: unknown = await backend.inputText("R58N90ABCDE", "안녕").catch((err: unknown) => err);

      expect(thrown).toBeInstanceOf(AdbKeyboardInstallFailedError);
      expect((thrown as AdbKeyboardInstallFailedError).code).toBe("APK_DOWNLOAD_FAILED");

      // Only the settings-get + pm-list queries happened — no install /
      // ime enable / ime set / broadcast: the device is left in its
      // pre-call state.
      expect(exec).toHaveBeenCalledTimes(2);
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
    });

    it("throws AdbKeyboardInstallFailedError with the APK_INSTALL_FAILED code when 'adb install' itself fails after a successful download", async () => {
      const exec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("com.google.android.inputmethod.latin/.LatinIME\n")) // settings get
        .mockResolvedValueOnce(ok("package:com.android.settings\n")) // pm list — not present
        .mockResolvedValueOnce(fail("INSTALL_FAILED_OLDER_SDK", 1)); // adb install fails
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockResolvedValue({ path: "/fake/cache/ADBKeyBoard.apk", fromCache: false, sourceUrl: "https://example.test/apk" });

      const backend = new AdbBackend(exec, acquireApk, new ImeSessionStore(imeStorePath));

      await expect(backend.inputText("R58N90ABCDE", "안녕")).rejects.toMatchObject({
        name: "AdbKeyboardInstallFailedError",
        code: "APK_INSTALL_FAILED",
      });

      expect(exec).toHaveBeenCalledTimes(3);
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
    });
  });

  describe("per-serial IME session tracking (M7, REQ-MULTIDEV-003, REQ-INPUT-004 disk-persistence fix)", () => {
    it("getTrackedOriginalIme returns undefined before any non-ASCII inputText call", async () => {
      const backend = new AdbBackend(vi.fn<AdbExecutor>(), undefined, new ImeSessionStore(imeStorePath));

      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
    });

    it("clearTrackedOriginalIme removes the disk record; once the device is genuinely back on its original IME, the next call re-establishes a fresh session", async () => {
      const originalIme = "com.example/.OriginalIme";
      const simulator = createDeviceImeSimulator(originalIme);
      const backend = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));

      await backend.inputText("R58N90ABCDE", "안녕");
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);

      // `clearTrackedOriginalIme` only removes the disk bookkeeping — it
      // is always called AFTER `doctor.resetDevice()` has already
      // restored the device's actual IME (see reset.ts). Simulate that
      // real restore here before clearing, matching production ordering.
      simulator.exec.mockClear();
      await simulator.exec(["-s", "R58N90ABCDE", "shell", "ime", "set", originalIme]);
      await backend.clearTrackedOriginalIme("R58N90ABCDE");
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();

      simulator.exec.mockClear();
      await backend.inputText("R58N90ABCDE", "다시");

      // Fresh session: the full switch sequence (settings get + pm list +
      // ime enable + ime set) runs again since the device is genuinely
      // back on its original IME and the disk record was cleared.
      const imeSetCalls = simulator.exec.mock.calls.filter(
        ([callArgs]) => callArgs[3] === "ime" && callArgs[4] === "set",
      );
      expect(imeSetCalls).toHaveLength(1);
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("clearTrackedOriginalIme only clears the targeted serial, leaving other serials' sessions untouched", async () => {
      const store = new ImeSessionStore(imeStorePath);
      await store.setOriginalIme("A", "com.example/.KeyboardA");
      await store.setOriginalIme("B", "com.example/.KeyboardB");
      const backend = new AdbBackend(vi.fn<AdbExecutor>(), undefined, store);

      await backend.clearTrackedOriginalIme("A");

      await expect(backend.getTrackedOriginalIme("A")).resolves.toBeUndefined();
      await expect(backend.getTrackedOriginalIme("B")).resolves.toBe("com.example/.KeyboardB");
    });

    it("tracks per-serial original IME independently across two devices, without cross-contamination (REQ-MULTIDEV-003, AC-ANDROID-004)", async () => {
      // Sequential (not concurrent): the disk store's read-modify-write is
      // NOT atomic across concurrent writers (see ime-session-store.ts
      // @MX:NOTE) — a genuinely concurrent Promise.all here would exercise
      // that known, accepted race rather than per-serial namespacing.
      const originalImeFor: Record<string, string> = {
        A: "com.example/.KeyboardA",
        B: "com.example/.KeyboardB",
      };
      const exec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args[3] === "pm") return ok("package:com.android.adbkeyboard\n"); // self-heal check: already installed
        if (args[3] === "dumpsys") return dumpsysBindingState(true); // binding-readiness poll: bound on first poll
        const serial = args[1] as string;
        if (args[3] === "settings") {
          return ok(`${originalImeFor[serial]}\n`);
        }
        return ok("");
      });
      const backend = new AdbBackend(exec, undefined, new ImeSessionStore(imeStorePath));

      await backend.inputText("A", "안녕");
      await backend.inputText("B", "반가워");

      // Neither serial's tracked original IME leaked into the other's.
      await expect(backend.getTrackedOriginalIme("A")).resolves.toBe(originalImeFor.A);
      await expect(backend.getTrackedOriginalIme("B")).resolves.toBe(originalImeFor.B);

      // No `ime set` call restoring to either serial's ORIGINAL IME happened
      // at all (session-based). The switch-to-ADBKeyBoard `ime set` calls
      // are expected and excluded from this check.
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
      const simulator = createDeviceImeSimulator(originalIme);
      const backend = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));

      await backend.inputText("R58N90ABCDE", "안녕");
      await backend.inputText("R58N90ABCDE", "반가워");
      await backend.inputText("R58N90ABCDE", "😸");

      // The IME switch (ime enable + ime set) happened only once, on the
      // first call — later calls see ADBKeyBoard already active via the
      // live current-IME check and skip re-switching.
      const imeEnableCalls = simulator.exec.mock.calls.filter(
        ([callArgs]) => callArgs[3] === "ime" && callArgs[4] === "enable",
      );
      expect(imeEnableCalls).toHaveLength(1);

      // Tracked state stays a single, unchanged entry across all 3 calls.
      await expect(backend.getTrackedOriginalIme("R58N90ABCDE")).resolves.toBe(originalIme);
    });

    it("a text call from a brand-new AdbBackend instance never records ADBKeyBoard itself as the original — the reported cross-process bug (REQ-INPUT-004 disk-persistence fix)", async () => {
      const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
      const simulator = createDeviceImeSimulator(originalIme);

      // "Process 1": establishes the session — switches the device to
      // ADBKeyBoard and persists the TRUE original to disk, then exits
      // (nothing further happens with this instance).
      const process1 = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));
      await process1.inputText("R58N90ABCDE", "안녕");
      expect(simulator.getCurrentIme()).toBe(ADBKEYBOARD_IME_ID);

      // "Process 2": a BRAND-NEW AdbBackend + ImeSessionStore instance
      // (zero shared in-memory state), pointed at the SAME on-disk file —
      // simulates the next CLI invocation, e.g. a later `text` or `reset`.
      const process2 = new AdbBackend(simulator.exec, undefined, new ImeSessionStore(imeStorePath));
      await process2.inputText("R58N90ABCDE", "반가워");

      // The device's current IME (ADBKeyBoard) must NEVER be recorded as
      // "the original" — the pre-fix bug. The disk-tracked original must
      // still be the TRUE pre-session IME from process 1.
      const trackedAfter = await process2.getTrackedOriginalIme("R58N90ABCDE");
      expect(trackedAfter).toBe(originalIme);
      expect(trackedAfter).not.toBe(ADBKEYBOARD_IME_ID);
    });
  });
});
