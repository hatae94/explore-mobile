/**
 * `AdbDoctor` — environment bootstrap for the `doctor`/`reset` commands
 * (M6): adb presence/daemon health, per-OS install policy, ADBKeyBoard
 * install+enable via a runtime download (license-compliance follow-up —
 * see apk-downloader.ts), and device reset.
 *
 * This is deliberately NOT part of the `DeviceBackend` (M1) interface:
 * `DeviceBackend` models "control an already-connected device" in a way
 * that must generalize to a future iOS backend, whereas `doctor`'s
 * host-level concerns (is the `adb` binary on PATH, `brew install`, an
 * on-demand APK download) are inherently Android/adb-tooling specific
 * and have no iOS analogue. Keeping it as a separate service avoids
 * forcing an artificial abstraction onto the iOS-facing interface.
 *
 * @MX:WARN — `installMissingAdb` can invoke `brew install` (macOS only,
 * and ONLY with explicit consent — REQ-DOCTOR-002). `ensureAdbKeyboard`
 * downloads a third-party APK (see apk-downloader.ts) and installs it;
 * `resetDevice` uninstalls it and changes IME state on the target device.
 * @MX:REASON — these are the SPEC's only host-environment-mutating,
 * network-fetching, and package-install/uninstall code paths; every
 * mutation here requires either explicit user consent (adb auto-install)
 * or is itself the user-requested action (`doctor`/`reset`).
 */

import { ADBKEYBOARD_IME_ID, ADBKEYBOARD_PACKAGE_ID } from "./adbkeyboard.js";
import { ensureAdbKeyboardInstalled } from "./adbkeyboard-installer.js";
import type { AdbExecutor } from "./adb-executor.js";
import { spawnAdb } from "./adb-executor.js";
import type { ApkAcquirer } from "./apk-downloader.js";
import { createApkAcquirer } from "./apk-downloader.js";
import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";

export interface AdbInstalledCheck {
  installed: boolean;
  version: string | null;
}

export interface DaemonHealthCheck {
  healthy: boolean;
  message?: string;
}

export interface InstallAttemptResult {
  attempted: boolean;
  succeeded: boolean | null;
  manualCommand: string;
  message: string;
}

export interface AdbKeyboardResult {
  alreadyInstalled: boolean;
  installed: boolean;
  enabled: boolean;
  /** Present when a fresh install occurred this call (installed=true): where the APK came from. */
  apkSource?: { cached: boolean; url?: string };
  error?: { code: string; message: string };
}

export interface ResetResult {
  imeReset: boolean;
  adbKeyboardDisabled: boolean;
  adbKeyboardUninstalled: boolean;
  warnings: string[];
  /**
   * Present only when a per-serial session-tracked original IME (from a
   * session-based `text` switch — REQ-INPUT-004 revised) was supplied to
   * `resetDevice()`: true when restoring it precisely (`ime set <id>`)
   * succeeded, false when it failed (see `warnings` for the original IME
   * id and failure detail). Omitted when no such tracked state existed
   * for this serial.
   */
  originalImeRestored?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AdbDoctor {
  constructor(
    private readonly adbExec: AdbExecutor = spawnAdb,
    private readonly processExec: ProcessExecutor = spawnProcess,
    private readonly acquireApk: ApkAcquirer = createApkAcquirer(),
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  /** Is the `adb` client binary present and runnable? (REQ-DOCTOR-001) */
  async checkAdbInstalled(): Promise<AdbInstalledCheck> {
    try {
      const result = await this.adbExec(["version"]);
      if (result.exitCode !== 0) return { installed: false, version: null };
      const firstLine = result.stdout.toString("utf-8").split(/\r?\n/)[0]?.trim() ?? null;
      return { installed: true, version: firstLine };
    } catch {
      return { installed: false, version: null };
    }
  }

  /**
   * Is the adb server daemon healthy? (REQ-ERR-004, AC-ANDROID-018) —
   * distinct from "is adb installed": a present binary can still have a
   * daemon that fails to start (port conflict, permissions, ...).
   * `adb start-server` is idempotent: a no-op success if already running.
   */
  async checkDaemonHealth(): Promise<DaemonHealthCheck> {
    try {
      const result = await this.adbExec(["start-server"]);
      if (result.exitCode !== 0) {
        const message = result.stderr.toString("utf-8").trim();
        return { healthy: false, message: message.length > 0 ? message : "adb start-server failed" };
      }
      return { healthy: true };
    } catch (err) {
      return { healthy: false, message: errorMessage(err) };
    }
  }

  /**
   * Per-OS adb install policy (REQ-DOCTOR-002, AC-ANDROID-019). macOS
   * auto-installs via Homebrew ONLY with explicit `consent` (never
   * silent); Linux/Windows ALWAYS guide-only, regardless of consent.
   */
  async installMissingAdb(consent: boolean): Promise<InstallAttemptResult> {
    if (this.platform === "darwin") {
      const manualCommand = "brew install android-platform-tools";
      if (!consent) {
        return {
          attempted: false,
          succeeded: null,
          manualCommand,
          message:
            "adb not found. Re-run doctor with --yes (or --install) to auto-install via Homebrew, " +
            `or run manually: ${manualCommand}`,
        };
      }
      try {
        const result = await this.processExec("brew", ["install", "android-platform-tools"]);
        if (result.exitCode !== 0) {
          const stderrText = result.stderr.toString("utf-8").trim();
          return {
            attempted: true,
            succeeded: false,
            manualCommand,
            message: `Homebrew install failed: ${stderrText.length > 0 ? stderrText : "unknown brew error"}`,
          };
        }
        return { attempted: true, succeeded: true, manualCommand, message: "Installed android-platform-tools via Homebrew." };
      } catch (err) {
        return { attempted: true, succeeded: false, manualCommand, message: `Homebrew install failed: ${errorMessage(err)}` };
      }
    }

    const manualCommand =
      this.platform === "win32"
        ? "Download platform-tools from https://developer.android.com/tools/releases/platform-tools and add it to PATH."
        : "Install adb via your distro's package manager, e.g.: sudo apt-get install android-tools-adb android-tools-fastboot";

    return {
      attempted: false,
      succeeded: null,
      manualCommand,
      message: "adb not found. Automatic install is not available on this OS — follow the manual installation steps.",
    };
  }

  /**
   * Installs (if not already present — REQ-IDEMP-002, via the shared
   * `ensureAdbKeyboardInstalled()` helper also used by `AdbBackend.inputText()`'s
   * self-heal path) and enables the ADBKeyBoard IME (REQ-DOCTOR-003),
   * downloading it at runtime from its official GitHub release (see
   * apk-downloader.ts — GPL-2.0, never bundled/redistributed by this MIT
   * package). Download failure (network error / 404 / invalid file) or
   * install failure degrades gracefully without further changing device
   * state (REQ-ERR-002, AC-ANDROID-016).
   */
  async ensureAdbKeyboard(serial: string): Promise<AdbKeyboardResult> {
    const installResult = await ensureAdbKeyboardInstalled(serial, this.adbExec, this.acquireApk);
    if (installResult.error) {
      return {
        alreadyInstalled: installResult.alreadyInstalled,
        installed: installResult.installed,
        enabled: false,
        error: installResult.error,
      };
    }

    const enableResult = await this.adbExec(["-s", serial, "shell", "ime", "enable", ADBKEYBOARD_IME_ID]);
    if (enableResult.exitCode !== 0) {
      const stderrText = enableResult.stderr.toString("utf-8").trim();
      return {
        alreadyInstalled: installResult.alreadyInstalled,
        installed: installResult.installed,
        enabled: false,
        error: {
          code: "IME_ENABLE_FAILED",
          message: `ime enable failed: ${stderrText.length > 0 ? stderrText : "unknown error"}`,
        },
      };
    }

    return {
      alreadyInstalled: installResult.alreadyInstalled,
      installed: installResult.installed,
      enabled: true,
      ...(installResult.apkSource ? { apkSource: installResult.apkSource } : {}),
    };
  }

  /**
   * Restores the device to a pre-`doctor` state (REQ-DOCTOR-004): disables
   * the ADBKeyBoard IME, resets the active IME to the system default via
   * `adb shell ime reset`, optionally restores a per-serial SESSION-
   * tracked original IME precisely (`trackedOriginalIme` — REQ-INPUT-004
   * revised: `AdbBackend.getTrackedOriginalIme()`, the exact IME active
   * before a session-based `text` switch, which may differ from the
   * system default), and uninstalls the ADBKeyBoard package. Each step is
   * independent; a failure in one is recorded as a warning rather than
   * aborting the remaining cleanup steps.
   */
  async resetDevice(serial: string, trackedOriginalIme?: string): Promise<ResetResult> {
    const warnings: string[] = [];

    const disableResult = await this.adbExec(["-s", serial, "shell", "ime", "disable", ADBKEYBOARD_IME_ID]);
    const adbKeyboardDisabled = disableResult.exitCode === 0;
    if (!adbKeyboardDisabled) {
      warnings.push(`ime disable failed: ${disableResult.stderr.toString("utf-8").trim() || "unknown error"}`);
    }

    const imeResetResult = await this.adbExec(["-s", serial, "shell", "ime", "reset"]);
    const imeReset = imeResetResult.exitCode === 0;
    if (!imeReset) {
      warnings.push(`ime reset failed: ${imeResetResult.stderr.toString("utf-8").trim() || "unknown error"}`);
    }

    // Precise session restore (REQ-INPUT-004 revised): only attempted when
    // a non-empty tracked original IME id was supplied — an empty string
    // means the original was never determined (acceptance.md §D.1 edge
    // case), so the `ime reset` system-default fallback above already
    // applies and there is nothing more precise to restore to.
    let originalImeRestored: boolean | undefined;
    if (trackedOriginalIme) {
      const restoreResult = await this.adbExec(["-s", serial, "shell", "ime", "set", trackedOriginalIme]);
      originalImeRestored = restoreResult.exitCode === 0;
      if (!originalImeRestored) {
        const stderrText = restoreResult.stderr.toString("utf-8").trim();
        warnings.push(
          `original IME restore failed (id: ${trackedOriginalIme}): ${stderrText || "unknown error"}. ` +
            `Manually recover with: adb -s ${serial} shell ime set ${trackedOriginalIme}`,
        );
      }
    }

    const uninstallResult = await this.adbExec(["-s", serial, "uninstall", ADBKEYBOARD_PACKAGE_ID]);
    const adbKeyboardUninstalled = uninstallResult.exitCode === 0;
    if (!adbKeyboardUninstalled) {
      warnings.push(
        `uninstall failed (may not have been installed): ${uninstallResult.stderr.toString("utf-8").trim() || "unknown error"}`,
      );
    }

    return {
      imeReset,
      adbKeyboardDisabled,
      adbKeyboardUninstalled,
      warnings,
      ...(originalImeRestored !== undefined ? { originalImeRestored } : {}),
    };
  }
}
