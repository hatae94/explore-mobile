import { describe, expect, it, vi } from "vitest";

import type { AdbExecResult, AdbExecutor } from "./adb-executor.js";
import { AdbDoctor } from "./doctor.js";
import type { ProcessExecResult, ProcessExecutor } from "./process-executor.js";

function ok(stdout: string, stderr = ""): AdbExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.from(stderr, "utf-8"), exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): AdbExecResult {
  return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode };
}

function processOk(stdout = ""): ProcessExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
}

function processFail(stderr: string, exitCode = 1): ProcessExecResult {
  return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode };
}

describe("AdbDoctor", () => {
  describe("checkAdbInstalled", () => {
    it("reports installed=true with the version line when 'adb version' succeeds (REQ-DOCTOR-001)", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("Android Debug Bridge version 1.0.41\n"));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.checkAdbInstalled();

      expect(adbExec).toHaveBeenCalledWith(["version"]);
      expect(result).toEqual({ installed: true, version: "Android Debug Bridge version 1.0.41" });
    });

    it("reports installed=false when the adb binary itself is absent (spawn ENOENT)", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockRejectedValueOnce(new Error("spawn adb ENOENT"));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.checkAdbInstalled();

      expect(result).toEqual({ installed: false, version: null });
    });
  });

  describe("checkDaemonHealth", () => {
    it("reports healthy=true when 'adb start-server' succeeds (REQ-ERR-004, AC-ANDROID-018)", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok(""));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.checkDaemonHealth();

      expect(adbExec).toHaveBeenCalledWith(["start-server"]);
      expect(result).toEqual({ healthy: true });
    });

    it("reports healthy=false with a message when the daemon fails to start", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("cannot bind to 127.0.0.1:5037", 1));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.checkDaemonHealth();

      expect(result.healthy).toBe(false);
      expect(result.message).toMatch(/cannot bind/);
    });

    it("reports healthy=false when the adb invocation itself rejects", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockRejectedValueOnce(new Error("spawn adb EACCES"));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.checkDaemonHealth();

      expect(result.healthy).toBe(false);
      expect(result.message).toMatch(/EACCES/);
    });
  });

  describe("installMissingAdb — per-OS install policy (REQ-DOCTOR-002, AC-ANDROID-019)", () => {
    it("macOS + consent=false: reports missing without attempting install, includes the manual brew command", async () => {
      const processExec = vi.fn<ProcessExecutor>();
      const doctor = new AdbDoctor(undefined, processExec, undefined, "darwin");

      const result = await doctor.installMissingAdb(false);

      expect(processExec).not.toHaveBeenCalled();
      expect(result.attempted).toBe(false);
      expect(result.succeeded).toBeNull();
      expect(result.manualCommand).toBe("brew install android-platform-tools");
    });

    it("macOS + consent=true: attempts 'brew install android-platform-tools' (never silent)", async () => {
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processOk("==> Installing android-platform-tools"));
      const doctor = new AdbDoctor(undefined, processExec, undefined, "darwin");

      const result = await doctor.installMissingAdb(true);

      expect(processExec).toHaveBeenCalledWith("brew", ["install", "android-platform-tools"]);
      expect(result.attempted).toBe(true);
      expect(result.succeeded).toBe(true);
    });

    it("macOS + consent=true: reports failure when brew itself fails", async () => {
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processFail("Error: no formula found", 1));
      const doctor = new AdbDoctor(undefined, processExec, undefined, "darwin");

      const result = await doctor.installMissingAdb(true);

      expect(result.attempted).toBe(true);
      expect(result.succeeded).toBe(false);
      expect(result.message).toMatch(/no formula found/);
    });

    it("macOS + consent=true: reports failure when the brew binary itself is absent (spawn ENOENT)", async () => {
      const processExec = vi.fn<ProcessExecutor>().mockRejectedValueOnce(new Error("spawn brew ENOENT"));
      const doctor = new AdbDoctor(undefined, processExec, undefined, "darwin");

      const result = await doctor.installMissingAdb(true);

      expect(result.attempted).toBe(true);
      expect(result.succeeded).toBe(false);
      expect(result.message).toMatch(/ENOENT/);
    });

    it("Linux: NEVER auto-installs, even with consent=true (guide-only)", async () => {
      const processExec = vi.fn<ProcessExecutor>();
      const doctor = new AdbDoctor(undefined, processExec, undefined, "linux");

      const result = await doctor.installMissingAdb(true);

      expect(processExec).not.toHaveBeenCalled();
      expect(result.attempted).toBe(false);
      expect(result.succeeded).toBeNull();
      expect(result.manualCommand.length).toBeGreaterThan(0);
    });

    it("Windows: NEVER auto-installs, even with consent=true (guide-only)", async () => {
      const processExec = vi.fn<ProcessExecutor>();
      const doctor = new AdbDoctor(undefined, processExec, undefined, "win32");

      const result = await doctor.installMissingAdb(true);

      expect(processExec).not.toHaveBeenCalled();
      expect(result.attempted).toBe(false);
      expect(result.manualCommand.length).toBeGreaterThan(0);
    });
  });

  describe("ensureAdbKeyboard — install + enable from bundled APK (REQ-DOCTOR-003, REQ-IDEMP-002)", () => {
    it("skips install (idempotent) when 'pm list packages' already shows ADBKeyBoard, still enables the IME", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\npackage:com.android.settings\n")) // pm list packages
        .mockResolvedValueOnce(ok("")); // ime enable
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(adbExec).toHaveBeenCalledTimes(2); // no install call
      expect(adbExec).toHaveBeenNthCalledWith(1, ["-s", "R58N90ABCDE", "shell", "pm", "list", "packages"]);
      expect(adbExec).toHaveBeenNthCalledWith(2, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "enable",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(result).toEqual({ alreadyInstalled: true, installed: false, enabled: true });
    });

    it("stays idempotent across repeated calls (M7, REQ-IDEMP-001) — AdbDoctor holds no cached/accumulating state, each call re-derives from the device", async () => {
      // A fresh `pm list packages` query on every call, never a memoized
      // result: AdbDoctor has no instance-level mutable state to go stale
      // or accumulate across repeated invocations.
      const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
        if (args.includes("list")) return ok("package:com.android.adbkeyboard\n");
        return ok(""); // ime enable
      });
      const doctor = new AdbDoctor(adbExec);

      const first = await doctor.ensureAdbKeyboard("R58N90ABCDE");
      const second = await doctor.ensureAdbKeyboard("R58N90ABCDE");
      const third = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(first).toEqual(second);
      expect(second).toEqual(third);
      // Each call independently re-queried pm list packages (2 adb calls
      // per invocation x 3 invocations = 6), never skipped via a cache.
      expect(adbExec).toHaveBeenCalledTimes(6);
    });

    it("reports APK_NOT_BUNDLED gracefully when not installed and the bundled APK file is absent (REQ-ERR-002, AC-ANDROID-016)", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("package:com.android.settings\n"));
      const fileExists = vi.fn().mockResolvedValue(false);
      const doctor = new AdbDoctor(adbExec, undefined, fileExists);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(adbExec).toHaveBeenCalledTimes(1); // no install attempt, no enable attempt — device state unchanged
      expect(result.installed).toBe(false);
      expect(result.enabled).toBe(false);
      expect(result.error?.code).toBe("APK_NOT_BUNDLED");
    });

    it("installs from the bundled APK when present and not already installed, then enables", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n")) // pm list packages (not present)
        .mockResolvedValueOnce(ok("Success")) // adb install <apk>
        .mockResolvedValueOnce(ok("")); // ime enable
      const fileExists = vi.fn().mockResolvedValue(true);
      const doctor = new AdbDoctor(adbExec, undefined, fileExists);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(adbExec).toHaveBeenCalledTimes(3);
      expect(adbExec.mock.calls[1]?.[0]).toEqual(["-s", "R58N90ABCDE", "install", expect.stringContaining("ADBKeyBoard")]);
      expect(result).toEqual({ alreadyInstalled: false, installed: true, enabled: true });
    });

    it("reports APK_INSTALL_FAILED gracefully when adb install fails (REQ-ERR-002, AC-ANDROID-016)", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n"))
        .mockResolvedValueOnce(fail("INSTALL_FAILED_OLDER_SDK", 1));
      const fileExists = vi.fn().mockResolvedValue(true);
      const doctor = new AdbDoctor(adbExec, undefined, fileExists);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(adbExec).toHaveBeenCalledTimes(2); // no enable attempt after a failed install
      expect(result.installed).toBe(false);
      expect(result.error?.code).toBe("APK_INSTALL_FAILED");
      expect(result.error?.message).toMatch(/INSTALL_FAILED_OLDER_SDK/);
    });

    it("reports IME_ENABLE_FAILED gracefully when 'ime enable' fails after a successful install", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n"))
        .mockResolvedValueOnce(ok("Success"))
        .mockResolvedValueOnce(fail("ime enable rejected", 1));
      const fileExists = vi.fn().mockResolvedValue(true);
      const doctor = new AdbDoctor(adbExec, undefined, fileExists);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(result.enabled).toBe(false);
      expect(result.error?.code).toBe("IME_ENABLE_FAILED");
    });

    it("reports PM_LIST_FAILED gracefully when 'pm list packages' itself fails", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(fail("device offline", 1));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(result.error?.code).toBe("PM_LIST_FAILED");
    });
  });

  describe("resetDevice — restore original state (REQ-DOCTOR-004)", () => {
    it("disables ADBKeyBoard, resets IME to system default, and uninstalls the package", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("")) // ime disable
        .mockResolvedValueOnce(ok("")) // ime reset
        .mockResolvedValueOnce(ok("Success")); // uninstall
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.resetDevice("R58N90ABCDE");

      expect(adbExec).toHaveBeenNthCalledWith(1, [
        "-s",
        "R58N90ABCDE",
        "shell",
        "ime",
        "disable",
        "com.android.adbkeyboard/.AdbIME",
      ]);
      expect(adbExec).toHaveBeenNthCalledWith(2, ["-s", "R58N90ABCDE", "shell", "ime", "reset"]);
      expect(adbExec).toHaveBeenNthCalledWith(3, ["-s", "R58N90ABCDE", "uninstall", "com.android.adbkeyboard"]);
      expect(result).toEqual({
        imeReset: true,
        adbKeyboardDisabled: true,
        adbKeyboardUninstalled: true,
        warnings: [],
      });
    });

    it("collects warnings but does not throw when uninstall fails (e.g. was never installed)", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(fail("DELETE_FAILED_INTERNAL_ERROR", 1));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.resetDevice("R58N90ABCDE");

      expect(result.adbKeyboardUninstalled).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/DELETE_FAILED_INTERNAL_ERROR/);
    });

    it("collects a warning (but keeps going) when 'ime disable' fails", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(fail("ime disable rejected", 1))
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(ok("Success"));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.resetDevice("R58N90ABCDE");

      expect(result.adbKeyboardDisabled).toBe(false);
      expect(result.warnings.some((w) => w.includes("ime disable failed"))).toBe(true);
      // Remaining steps still ran despite the first failure:
      expect(adbExec).toHaveBeenCalledTimes(3);
    });

    it("collects a warning (but keeps going) when 'ime reset' fails", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok(""))
        .mockResolvedValueOnce(fail("ime reset rejected", 1))
        .mockResolvedValueOnce(ok("Success"));
      const doctor = new AdbDoctor(adbExec);

      const result = await doctor.resetDevice("R58N90ABCDE");

      expect(result.imeReset).toBe(false);
      expect(result.warnings.some((w) => w.includes("ime reset failed"))).toBe(true);
    });
  });
});
