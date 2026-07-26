import { describe, expect, it, vi } from "vitest";

import type { IdbExecResult, IdbExecutor } from "./idb-executor.js";
import { IdbDoctor } from "./idb-doctor.js";
import type { ProcessExecResult, ProcessExecutor } from "./process-executor.js";

function idbOk(stdout = ""): IdbExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
}

function idbFail(stderr: string, exitCode = 1): IdbExecResult {
  return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode };
}

/**
 * Real `idb list-targets --json` output shape (fb-idb 1.1.7, confirmed
 * against a booted simulator during SPEC-IOS-001 run-phase verification):
 * JSONL — one JSON object per line, NOT a wrapping JSON array.
 */
function jsonl(...entries: Record<string, unknown>[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}

function processOk(stdout = ""): ProcessExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
}

function processFail(): ProcessExecResult {
  return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 1 };
}

describe("IdbDoctor", () => {
  describe("checkIdbInstalled (REQ-IOS-DOCTOR-001, AC-IOS-019)", () => {
    it("reports installed:true with the version line when 'idb --version' succeeds", async () => {
      const idbExec = vi.fn<IdbExecutor>().mockResolvedValueOnce(idbOk("1.1.8\n"));
      const doctor = new IdbDoctor(idbExec);

      await expect(doctor.checkIdbInstalled()).resolves.toEqual({ installed: true, version: "1.1.8" });
      expect(idbExec).toHaveBeenCalledWith(["--version"]);
    });

    /**
     * fb-idb 1.1.7 (the version pipx actually installs) has NO `--version`
     * flag: it exits 2 with an argparse "unrecognized arguments: --version"
     * error. Treating that as "idb is not installed" made BackendRegistry skip
     * the entire iOS backend, so every iOS device silently vanished from
     * `devices` output. Presence must therefore fall back to a `which idb`
     * probe — the same probe shape `checkCompanion` already uses.
     */
    it("falls back to a 'which idb' presence probe when 'idb --version' is unsupported (fb-idb 1.1.7 exits 2)", async () => {
      const idbExec = vi.fn<IdbExecutor>().mockResolvedValueOnce(idbFail("idb: error: unrecognized arguments: --version", 2));
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processOk("/Users/me/.local/bin/idb\n"));
      const doctor = new IdbDoctor(idbExec, processExec);

      await expect(doctor.checkIdbInstalled()).resolves.toEqual({ installed: true, version: null });
      expect(processExec).toHaveBeenCalledWith("which", ["idb"]);
    });

    it("reports installed:false when 'idb --version' exits non-zero AND 'which idb' finds nothing", async () => {
      const idbExec = vi.fn<IdbExecutor>().mockResolvedValueOnce(idbFail("command not found"));
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processFail());
      const doctor = new IdbDoctor(idbExec, processExec);

      await expect(doctor.checkIdbInstalled()).resolves.toEqual({ installed: false, version: null });
    });

    it("reports installed:false when spawning idb itself throws (binary missing)", async () => {
      const idbExec = vi.fn<IdbExecutor>().mockRejectedValueOnce(new Error("spawn idb ENOENT"));
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processFail());
      const doctor = new IdbDoctor(idbExec, processExec);

      await expect(doctor.checkIdbInstalled()).resolves.toEqual({ installed: false, version: null });
    });
  });

  describe("checkCompanion (REQ-IOS-DOCTOR-001, AC-IOS-019)", () => {
    it("reports present:true when 'which idb_companion' succeeds", async () => {
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processOk("/usr/local/bin/idb_companion\n"));
      const doctor = new IdbDoctor(undefined, processExec);

      await expect(doctor.checkCompanion()).resolves.toEqual({ present: true });
      expect(processExec).toHaveBeenCalledWith("which", ["idb_companion"]);
    });

    it("reports present:false when 'which idb_companion' fails", async () => {
      const processExec = vi.fn<ProcessExecutor>().mockResolvedValueOnce(processFail());
      const doctor = new IdbDoctor(undefined, processExec);

      await expect(doctor.checkCompanion()).resolves.toEqual({ present: false });
    });

    it("reports present:false when the process spawn itself throws", async () => {
      const processExec = vi.fn<ProcessExecutor>().mockRejectedValueOnce(new Error("spawn which ENOENT"));
      const doctor = new IdbDoctor(undefined, processExec);

      await expect(doctor.checkCompanion()).resolves.toEqual({ present: false });
    });
  });

  describe("checkSimulatorBooted (REQ-IOS-DOCTOR-001, AC-IOS-019)", () => {
    it("reports booted:true when any simulator is Booted (no serial given)", async () => {
      const idbExec = vi
        .fn<IdbExecutor>()
        .mockResolvedValueOnce(idbOk(jsonl({ udid: "A", state: "Shutdown" }, { udid: "B", state: "Booted" })));
      const doctor = new IdbDoctor(idbExec);

      await expect(doctor.checkSimulatorBooted()).resolves.toEqual({ booted: true });
    });

    it("reports booted:false with a message when no simulator is booted", async () => {
      const idbExec = vi
        .fn<IdbExecutor>()
        .mockResolvedValueOnce(idbOk(jsonl({ udid: "A", state: "Shutdown" })));
      const doctor = new IdbDoctor(idbExec);

      const result = await doctor.checkSimulatorBooted();
      expect(result.booted).toBe(false);
      expect(result.message).toMatch(/no booted simulator/i);
    });

    it("checks a SPECIFIC serial's booted state when given", async () => {
      const idbExec = vi
        .fn<IdbExecutor>()
        .mockResolvedValueOnce(idbOk(jsonl({ udid: "A", state: "Booted" }, { udid: "B", state: "Shutdown" })));
      const doctor = new IdbDoctor(idbExec);

      await expect(doctor.checkSimulatorBooted("A")).resolves.toEqual({ booted: true });
      const resultB = await new IdbDoctor(
        vi.fn<IdbExecutor>().mockResolvedValueOnce(idbOk(jsonl({ udid: "A", state: "Booted" }, { udid: "B", state: "Shutdown" }))),
      ).checkSimulatorBooted("B");
      expect(resultB.booted).toBe(false);
    });

    it("degrades gracefully (never throws) on malformed JSON output", async () => {
      const idbExec = vi.fn<IdbExecutor>().mockResolvedValueOnce(idbOk("not json{{{"));
      const doctor = new IdbDoctor(idbExec);

      await expect(doctor.checkSimulatorBooted()).resolves.toEqual({
        booted: false,
        message: "Could not parse idb list-targets output.",
      });
    });

    it("degrades gracefully when idb list-targets itself fails", async () => {
      const idbExec = vi.fn<IdbExecutor>().mockResolvedValueOnce(idbFail("idb_companion not running"));
      const doctor = new IdbDoctor(idbExec);

      const result = await doctor.checkSimulatorBooted();
      expect(result.booted).toBe(false);
      expect(result.message).toBe("idb_companion not running");
    });
  });

  describe("installGuidance (REQ-IOS-DOCTOR-002, AC-IOS-020)", () => {
    it("provides pip3 + Homebrew guidance pinned to fb-idb==1.1.8 on macOS", async () => {
      const doctor = new IdbDoctor(undefined, undefined, "darwin");

      const guidance = await doctor.installGuidance();

      expect(guidance.platformSupported).toBe(true);
      expect(guidance.pipCommand).toBe("pip3 install fb-idb==1.1.8");
      expect(guidance.brewCommands).toEqual(["brew tap facebook/fb", "brew install idb-companion"]);
    });

    it("explicitly reports iOS Simulator control as unsupported on non-macOS hosts, with no install commands offered", async () => {
      const doctorLinux = new IdbDoctor(undefined, undefined, "linux");
      const guidanceLinux = await doctorLinux.installGuidance();
      expect(guidanceLinux.platformSupported).toBe(false);
      expect(guidanceLinux.pipCommand).toBeUndefined();
      expect(guidanceLinux.brewCommands).toBeUndefined();
      expect(guidanceLinux.message).toMatch(/macOS/);

      const doctorWin = new IdbDoctor(undefined, undefined, "win32");
      const guidanceWin = await doctorWin.installGuidance();
      expect(guidanceWin.platformSupported).toBe(false);
    });
  });

  describe("resetDevice (REQ-IOS-DOCTOR-004, AC-IOS-022 — near-no-op)", () => {
    it("always reports noOp:true with an explicit 'nothing to reset' message, never touching Android IME/APK semantics", async () => {
      const doctor = new IdbDoctor();

      const result = await doctor.resetDevice("SIM-1");

      expect(result.noOp).toBe(true);
      expect(result.message).toMatch(/stateless/i);
    });
  });
});
