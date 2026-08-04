import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter as pathDelimiter, join as joinPath } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AdbExecResult, AdbExecutor, AdbPathPredicate } from "./adb-executor.js";
import { resetAdbPathCache } from "./adb-executor.js";
import type { ApkAcquirer } from "./apk-downloader.js";
import { AdbDoctor } from "./doctor.js";
import type { ProcessExecResult, ProcessExecutor } from "./process-executor.js";

/**
 * A fake `AdbPathPredicate` (plan.md §B.1) that reports the first `PATH`
 * directory's `adb` candidate as found, regardless of what is actually on
 * this host's disk — keeps `checkAdbInstalled` tests deterministic and
 * host-independent (see resetAdbPathCache-free rationale: an explicit
 * predicate always bypasses the process-wide cache).
 */
function foundOnPathPredicate(): { predicate: AdbPathPredicate; resolvedPath: string } {
  const dirs = (process.env.PATH ?? "").split(pathDelimiter).filter((d) => d.length > 0);
  if (dirs.length === 0) throw new Error("PATH is empty; cannot construct a deterministic adb-path test fixture");
  const resolvedPath = joinPath(dirs[0]!, "adb");
  return { predicate: (candidate) => candidate === resolvedPath, resolvedPath };
}

/** A fake `AdbPathPredicate` that reports "not found anywhere" — none of the four candidates match. */
const notFoundAnywherePredicate: AdbPathPredicate = () => false;

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
      const { predicate, resolvedPath } = foundOnPathPredicate();
      const doctor = new AdbDoctor(adbExec, undefined, undefined, undefined, predicate);

      const result = await doctor.checkAdbInstalled();

      expect(adbExec).toHaveBeenCalledWith(["version"]);
      expect(result).toEqual({
        installed: true,
        onPath: true,
        resolvedPath,
        version: "Android Debug Bridge version 1.0.41",
      });
    });

    it("reports installed=false when adb cannot be resolved anywhere (REQ-READY-001 four-candidate search exhausted)", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockRejectedValueOnce(new Error("spawn adb ENOENT"));
      const doctor = new AdbDoctor(adbExec, undefined, undefined, undefined, notFoundAnywherePredicate);

      const result = await doctor.checkAdbInstalled();

      expect(adbExec).not.toHaveBeenCalled();
      expect(result).toEqual({ installed: false, onPath: false, resolvedPath: null, version: null });
    });
  });

  describe("checkAdbInstalled — real filesystem + real env vars (AC-READY-018, unit(real FS))", () => {
    it("distinguishes a real PATH-less SDK install from genuinely missing, using no injected predicate (REQ-READY-002)", async () => {
      // A genuine executable file under a genuine temp dir — this test
      // deliberately does NOT use the AdbPathPredicate injection seam
      // (plan.md §B.1: "AC-018은 이 이음매를 쓰지 않는다") so it exercises
      // the real `defaultAdbPathPredicate` (statSync + accessSync X_OK)
      // against real disk state, per spec.md §E.4's requirement that at
      // least one REQ-READY-002 AC judge via real filesystem manipulation
      // rather than an injected mock.
      const tempDir = await mkdtemp(joinPath(tmpdir(), "explore-mobile-adb-ac018-"));
      const platformToolsDir = joinPath(tempDir, "platform-tools");
      const adbPath = joinPath(platformToolsDir, "adb");
      await mkdir(platformToolsDir, { recursive: true });
      await writeFile(adbPath, "#!/bin/sh\necho fake-adb\n");
      await chmod(adbPath, 0o755);

      const savedPath = process.env.PATH;
      const savedAndroidHome = process.env.ANDROID_HOME;
      const savedAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
      // Genuinely remove adb from PATH: point PATH at a directory that
      // does not contain an "adb" file.
      process.env.PATH = tempDir;
      process.env.ANDROID_HOME = tempDir;
      delete process.env.ANDROID_SDK_ROOT;
      resetAdbPathCache();

      try {
        const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("Android Debug Bridge version 1.0.41\n"));
        const doctor = new AdbDoctor(adbExec);

        const result = await doctor.checkAdbInstalled();

        expect(result.installed).toBe(true);
        expect(result.onPath).toBe(false);
        expect(result.resolvedPath).toBe(adbPath);
      } finally {
        resetAdbPathCache();
        if (savedPath === undefined) delete process.env.PATH;
        else process.env.PATH = savedPath;
        if (savedAndroidHome === undefined) delete process.env.ANDROID_HOME;
        else process.env.ANDROID_HOME = savedAndroidHome;
        if (savedAndroidSdkRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
        else process.env.ANDROID_SDK_ROOT = savedAndroidSdkRoot;
        await rm(tempDir, { recursive: true, force: true });
      }
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

  describe("ensureAdbKeyboard — install + enable via runtime download (REQ-DOCTOR-003, REQ-IDEMP-002, GPL-2.0 no-redistribution)", () => {
    function okAcquirer(path = "/fake/cache/ADBKeyBoard.apk"): ApkAcquirer {
      return vi.fn<ApkAcquirer>().mockResolvedValue({ path, fromCache: false, sourceUrl: "https://example.test/apk" });
    }

    it("skips install AND download (idempotent) when 'pm list packages' already shows ADBKeyBoard, still enables the IME", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.adbkeyboard\npackage:com.android.settings\n")) // pm list packages
        .mockResolvedValueOnce(ok("")); // ime enable
      const acquireApk = vi.fn<ApkAcquirer>();
      const doctor = new AdbDoctor(adbExec, undefined, acquireApk);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(adbExec).toHaveBeenCalledTimes(2); // no install call
      expect(acquireApk).not.toHaveBeenCalled(); // no download attempted when already installed
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
      const doctor = new AdbDoctor(adbExec, undefined, vi.fn<ApkAcquirer>());

      const first = await doctor.ensureAdbKeyboard("R58N90ABCDE");
      const second = await doctor.ensureAdbKeyboard("R58N90ABCDE");
      const third = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(first).toEqual(second);
      expect(second).toEqual(third);
      // Each call independently re-queried pm list packages (2 adb calls
      // per invocation x 3 invocations = 6), never skipped via a cache.
      expect(adbExec).toHaveBeenCalledTimes(6);
    });

    it("reports APK_DOWNLOAD_FAILED gracefully when the runtime download fails (REQ-ERR-002, AC-ANDROID-016) — replaces the old bundled-APK error", async () => {
      const adbExec = vi.fn<AdbExecutor>().mockResolvedValueOnce(ok("package:com.android.settings\n"));
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockRejectedValue(new Error("Failed to download a valid ADBKeyBoard APK from ... . Install manually: ..."));
      const doctor = new AdbDoctor(adbExec, undefined, acquireApk);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(adbExec).toHaveBeenCalledTimes(1); // no install attempt, no enable attempt — device state unchanged
      expect(acquireApk).toHaveBeenCalledTimes(1);
      expect(result.installed).toBe(false);
      expect(result.enabled).toBe(false);
      expect(result.error?.code).toBe("APK_DOWNLOAD_FAILED");
      expect(result.error?.message).toMatch(/manually/i);
    });

    it("downloads (or reuses cache), installs, and enables when not already installed", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n")) // pm list packages (not present)
        .mockResolvedValueOnce(ok("Success")) // adb install <downloaded apk path>
        .mockResolvedValueOnce(ok("")); // ime enable
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockResolvedValue({ path: "/home/user/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk", fromCache: false, sourceUrl: "https://github.com/senzhk/ADBKeyBoard/releases/download/v2.4-dev/ADBKeyboard.apk" });
      const doctor = new AdbDoctor(adbExec, undefined, acquireApk);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(acquireApk).toHaveBeenCalledTimes(1);
      expect(adbExec).toHaveBeenCalledTimes(3);
      expect(adbExec.mock.calls[1]?.[0]).toEqual([
        "-s",
        "R58N90ABCDE",
        "install",
        "/home/user/.cache/explore-mobile/ADBKeyBoard-v2.4-dev.apk",
      ]);
      expect(result).toEqual({
        alreadyInstalled: false,
        installed: true,
        enabled: true,
        apkSource: { cached: false, url: "https://github.com/senzhk/ADBKeyBoard/releases/download/v2.4-dev/ADBKeyboard.apk" },
      });
    });

    it("surfaces apkSource.cached=true and no url when the acquirer reused a cached file", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n"))
        .mockResolvedValueOnce(ok("Success"))
        .mockResolvedValueOnce(ok(""));
      const acquireApk = vi.fn<ApkAcquirer>().mockResolvedValue({ path: "/cached/ADBKeyBoard.apk", fromCache: true });
      const doctor = new AdbDoctor(adbExec, undefined, acquireApk);

      const result = await doctor.ensureAdbKeyboard("R58N90ABCDE");

      expect(result.apkSource).toEqual({ cached: true });
    });

    it("reports APK_INSTALL_FAILED gracefully when adb install fails (REQ-ERR-002, AC-ANDROID-016)", async () => {
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(ok("package:com.android.settings\n"))
        .mockResolvedValueOnce(fail("INSTALL_FAILED_OLDER_SDK", 1));
      const doctor = new AdbDoctor(adbExec, undefined, okAcquirer());

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
      const doctor = new AdbDoctor(adbExec, undefined, okAcquirer());

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

    describe("session-based original IME restore (REQ-INPUT-004 revised)", () => {
      it("without a trackedOriginalIme argument, behaves exactly as before (no extra 'ime set' call, no originalImeRestored field)", async () => {
        const adbExec = vi
          .fn<AdbExecutor>()
          .mockResolvedValueOnce(ok(""))
          .mockResolvedValueOnce(ok(""))
          .mockResolvedValueOnce(ok("Success"));
        const doctor = new AdbDoctor(adbExec);

        const result = await doctor.resetDevice("R58N90ABCDE");

        expect(adbExec).toHaveBeenCalledTimes(3);
        expect(result.originalImeRestored).toBeUndefined();
      });

      it("with a trackedOriginalIme, restores it precisely via 'ime set <id>' between 'ime reset' and uninstall", async () => {
        const trackedOriginalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const adbExec = vi
          .fn<AdbExecutor>()
          .mockResolvedValueOnce(ok("")) // ime disable
          .mockResolvedValueOnce(ok("")) // ime reset
          .mockResolvedValueOnce(ok("")) // ime set <trackedOriginalIme>
          .mockResolvedValueOnce(ok("Success")); // uninstall
        const doctor = new AdbDoctor(adbExec);

        const result = await doctor.resetDevice("R58N90ABCDE", trackedOriginalIme);

        expect(adbExec).toHaveBeenCalledTimes(4);
        expect(adbExec).toHaveBeenNthCalledWith(3, [
          "-s",
          "R58N90ABCDE",
          "shell",
          "ime",
          "set",
          trackedOriginalIme,
        ]);
        expect(adbExec).toHaveBeenNthCalledWith(4, ["-s", "R58N90ABCDE", "uninstall", "com.android.adbkeyboard"]);
        expect(result.originalImeRestored).toBe(true);
      });

      it("reports a failure (originalImeRestored=false) + a warning carrying the original IME id when the precise restore fails, but still uninstalls", async () => {
        const trackedOriginalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const adbExec = vi
          .fn<AdbExecutor>()
          .mockResolvedValueOnce(ok(""))
          .mockResolvedValueOnce(ok(""))
          .mockResolvedValueOnce(fail("adb: ime set rejected", 1))
          .mockResolvedValueOnce(ok("Success"));
        const doctor = new AdbDoctor(adbExec);

        const result = await doctor.resetDevice("R58N90ABCDE", trackedOriginalIme);

        expect(result.originalImeRestored).toBe(false);
        expect(result.warnings.some((w) => w.includes(trackedOriginalIme) && w.includes("restore failed"))).toBe(
          true,
        );
        // Uninstall still ran despite the restore failure.
        expect(adbExec).toHaveBeenCalledTimes(4);
        expect(result.adbKeyboardUninstalled).toBe(true);
      });

      it("skips the precise restore call when trackedOriginalIme is an empty string (unknown original — acceptance.md §D.1)", async () => {
        const adbExec = vi
          .fn<AdbExecutor>()
          .mockResolvedValueOnce(ok(""))
          .mockResolvedValueOnce(ok(""))
          .mockResolvedValueOnce(ok("Success"));
        const doctor = new AdbDoctor(adbExec);

        const result = await doctor.resetDevice("R58N90ABCDE", "");

        expect(adbExec).toHaveBeenCalledTimes(3); // no extra 'ime set' call
        expect(result.originalImeRestored).toBeUndefined();
      });
    });
  });
});
