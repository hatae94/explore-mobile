/**
 * `IdbDoctor` — iOS environment bootstrap service (M5, SPEC-IOS-001),
 * parallel to `AdbDoctor` (M6, SPEC-ANDROID-001): idb client presence,
 * `idb_companion` presence, booted-simulator check, install guidance, and
 * device reset (REQ-IOS-DOCTOR-001~004).
 *
 * Deliberately NOT part of the `DeviceBackend` interface, mirroring
 * `AdbDoctor`'s own design rationale: host-environment bootstrap concerns
 * (is the `idb` binary on PATH, pip/brew install guidance) are inherently
 * tool-specific and have no place in the backend-agnostic device-control
 * interface (device-backend.ts).
 *
 * @MX:WARN — `installGuidance()` only ever returns guidance text; unlike
 * `AdbDoctor.installMissingAdb`, this class never itself invokes `pip3`/
 * `brew install` (REQ-IOS-DOCTOR-002 — guidance-only, no auto-install
 * attempt for an unmaintained third-party tool).
 * @MX:REASON — idb is a third-party, effectively unmaintained tool
 * (research.md §4, last release 2022-08); auto-installing it without
 * explicit user action is a materially different risk profile from
 * `AdbDoctor`'s Homebrew-only, consent-gated `android-platform-tools`
 * install, so this class stays guidance-only rather than mirroring that
 * auto-install path.
 */

import type { IdbExecutor } from "./idb-executor.js";
import { spawnIdb } from "./idb-executor.js";
import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";

export interface IdbInstalledCheck {
  installed: boolean;
  version: string | null;
}

export interface IdbCompanionCheck {
  present: boolean;
}

export interface SimulatorBootedCheck {
  booted: boolean;
  message?: string;
}

export interface IosInstallGuidance {
  /** False on any non-macOS host — iOS Simulator control is macOS+Xcode only (REQ-IOS-DOCTOR-002). */
  platformSupported: boolean;
  /** Present only when platformSupported is true. */
  pipCommand?: string;
  /** Present only when platformSupported is true. */
  brewCommands?: string[];
  message: string;
}

export interface IosResetResult {
  /** Always true (REQ-IOS-DOCTOR-004) — iOS has no IME/APK state to clean. */
  noOp: true;
  message: string;
}

const PINNED_FB_IDB_VERSION = "fb-idb==1.1.8";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One raw `idb list-targets --json` target entry, minimal shape needed for a booted-check. */
interface RawIdbTarget {
  udid?: unknown;
  state?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class IdbDoctor {
  constructor(
    private readonly idbExec: IdbExecutor = spawnIdb,
    private readonly processExec: ProcessExecutor = spawnProcess,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  /** Is the `idb` client binary present and runnable? (REQ-IOS-DOCTOR-001) */
  async checkIdbInstalled(): Promise<IdbInstalledCheck> {
    try {
      const result = await this.idbExec(["--version"]);
      if (result.exitCode !== 0) return { installed: false, version: null };
      const firstLine = result.stdout.toString("utf-8").split(/\r?\n/)[0]?.trim() ?? null;
      return { installed: true, version: firstLine && firstLine.length > 0 ? firstLine : null };
    } catch {
      return { installed: false, version: null };
    }
  }

  /** Is the `idb_companion` daemon binary present on PATH? (REQ-IOS-DOCTOR-001) */
  async checkCompanion(): Promise<IdbCompanionCheck> {
    try {
      const result = await this.processExec("which", ["idb_companion"]);
      return { present: result.exitCode === 0 };
    } catch {
      return { present: false };
    }
  }

  /**
   * Is a simulator currently booted? (REQ-IOS-DOCTOR-001) When `serial` is
   * given, checks that specific udid; otherwise reports whether ANY
   * simulator is booted. Never throws — an unparseable/failed
   * `list-targets` degrades to `{ booted: false, message }` rather than
   * raising (mirrors the graceful pattern shared across this SPEC).
   */
  async checkSimulatorBooted(serial?: string): Promise<SimulatorBootedCheck> {
    let result;
    try {
      result = await this.idbExec(["list-targets", "--json"]);
    } catch (err) {
      return { booted: false, message: errorMessage(err) };
    }

    if (result.exitCode !== 0) {
      const stderrText = result.stderr.toString("utf-8").trim();
      return { booted: false, message: stderrText.length > 0 ? stderrText : "idb list-targets failed" };
    }

    const stdout = result.stdout.toString("utf-8").trim();
    if (stdout.length === 0) return { booted: false, message: "No simulators found." };

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return { booted: false, message: "Could not parse idb list-targets output." };
    }
    if (!Array.isArray(parsed)) return { booted: false, message: "Unexpected idb list-targets output shape." };

    const targets = parsed.filter(isRecord) as RawIdbTarget[];
    const bootedTargets = targets.filter((t) => String(t.state).toLowerCase() === "booted");

    if (serial !== undefined) {
      const booted = bootedTargets.some((t) => t.udid === serial);
      return booted
        ? { booted: true }
        : { booted: false, message: `Simulator '${serial}' is not booted.` };
    }

    return bootedTargets.length > 0
      ? { booted: true }
      : { booted: false, message: "No booted simulator found." };
  }

  /**
   * Install guidance only — never attempts installation itself
   * (REQ-IOS-DOCTOR-002). macOS: pip3 + Homebrew commands, pinned to the
   * verified idb version (research.md §4). Non-macOS: explicit
   * unsupported statement, no commands offered.
   */
  async installGuidance(): Promise<IosInstallGuidance> {
    if (this.platform === "darwin") {
      return {
        platformSupported: true,
        pipCommand: `pip3 install ${PINNED_FB_IDB_VERSION}`,
        brewCommands: ["brew tap facebook/fb", "brew install idb-companion"],
        message: `Install idb (pinned to ${PINNED_FB_IDB_VERSION}, the last released version) and idb-companion via Homebrew.`,
      };
    }

    return {
      platformSupported: false,
      message: "iOS Simulator control requires macOS + Xcode; it is not supported on this host OS.",
    };
  }

  /**
   * iOS `reset` is a near-no-op (REQ-IOS-DOCTOR-004): idb's `ui text` is
   * Unicode-native and stateless — there is no ADBKeyBoard-equivalent IME
   * to uninstall and no session IME to restore, unlike Android's `reset`.
   * `serial` is accepted for interface symmetry with a future
   * per-device reset but is not currently used.
   */
  async resetDevice(_serial: string): Promise<IosResetResult> {
    return {
      noOp: true,
      message: "iOS has no IME/APK state to clean (idb text input is stateless) — nothing to reset.",
    };
  }
}
