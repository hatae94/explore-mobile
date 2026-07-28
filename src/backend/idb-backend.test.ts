import { describe, expect, it, vi } from "vitest";

import type { DeviceBackend } from "../schema/device-backend.js";
import type { ClipboardWriter } from "./idb-clipboard.js";
import type { IdbExecResult, IdbExecutor } from "./idb-executor.js";
import { IdbBackend } from "./idb-backend.js";
import { IdbCommandFailedError, UnsupportedKeyOnIosError } from "./idb-errors.js";

function ok(stdout: string, stderr = ""): IdbExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.from(stderr, "utf-8"), exitCode: 0 };
}

function okBinary(bytes: Buffer): IdbExecResult {
  return { stdout: bytes, stderr: Buffer.alloc(0), exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): IdbExecResult {
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

describe("IdbBackend", () => {
  it("implements the DeviceBackend interface (AC-IOS-011, AC-IOS-026 — type-level, compiles iff true)", () => {
    const backend: DeviceBackend = new IdbBackend(vi.fn<IdbExecutor>());
    expect(backend).toBeInstanceOf(IdbBackend);
  });

  describe("listDevices (AC-IOS-012)", () => {
    it("calls 'idb list-targets --json' and maps udid/name/os_version/state/type to DeviceInfo with platform:ios", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(
        ok(
          jsonl({
            udid: "00008030-0011ABCDEF",
            name: "iPhone 15",
            os_version: "17.5",
            state: "Booted",
            type: "simulator",
          }),
        ),
      );

      const backend = new IdbBackend(exec);
      const devices = await backend.listDevices();

      expect(exec).toHaveBeenCalledWith(["list-targets", "--json"]);
      expect(devices).toEqual([
        {
          serial: "00008030-0011ABCDEF",
          model: "iPhone 15",
          osVersion: "17.5",
          connectionState: "device",
          isEmulator: true,
          platform: "ios",
        },
      ]);
    });

    it("maps a non-Booted state to connectionState 'offline'", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(
        ok(jsonl({ udid: "X", name: "iPad", os_version: "17.0", state: "Shutdown", type: "simulator" })),
      );

      const backend = new IdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices[0]?.connectionState).toBe("offline");
    });

    it("marks a physical device (type: device) as isEmulator: false", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(
        ok(jsonl({ udid: "PHYS-1", name: "iPhone", os_version: "17.5", state: "Booted", type: "device" })),
      );

      const backend = new IdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices[0]?.isEmulator).toBe(false);
    });

    it("parses MULTI-LINE JSONL output (one target per line, no wrapping array)", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(
        ok(
          jsonl(
            { udid: "SIM-A", name: "iPad (A16)", os_version: "iOS 18.6", state: "Shutdown", type: "simulator" },
            { udid: "SIM-B", name: "iPhone 17 Pro", os_version: "iOS 26.0", state: "Booted", type: "simulator" },
          ),
        ),
      );

      const backend = new IdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices).toHaveLength(2);
      expect(devices[1]).toEqual({
        serial: "SIM-B",
        model: "iPhone 17 Pro",
        osVersion: "iOS 26.0",
        connectionState: "device",
        isEmulator: true,
        platform: "ios",
      });
    });

    it("still tolerates a legacy wrapping JSON-array output shape", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(
        ok(JSON.stringify([{ udid: "LEGACY-1", name: "iPhone", os_version: "17.5", state: "Booted", type: "simulator" }])),
      );

      const backend = new IdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices[0]?.serial).toBe("LEGACY-1");
      expect(devices[0]?.isEmulator).toBe(true);
    });

    it("skips unparseable lines but keeps the valid ones (Secured — partial output drift)", async () => {
      const exec = vi
        .fn<IdbExecutor>()
        .mockResolvedValueOnce(
          ok(`not json{{{\n${JSON.stringify({ udid: "SIM-OK", name: "iPhone", os_version: "26.0", state: "Booted", type: "simulator" })}`),
        );

      const backend = new IdbBackend(exec);
      const devices = await backend.listDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0]?.serial).toBe("SIM-OK");
    });

    it("returns an empty array for empty stdout, without throwing", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));
      const backend = new IdbBackend(exec);

      await expect(backend.listDevices()).resolves.toEqual([]);
    });

    it("returns an empty array for malformed (non-JSON) stdout, without throwing (Secured — external tool output)", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok("not json{{{"));
      const backend = new IdbBackend(exec);

      await expect(backend.listDevices()).resolves.toEqual([]);
    });

    it("throws IdbCommandFailedError when the idb invocation exits non-zero", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(fail("idb_companion not running"));
      const backend = new IdbBackend(exec);

      await expect(backend.listDevices()).rejects.toBeInstanceOf(IdbCommandFailedError);
    });
  });

  describe("dumpUiHierarchy (AC-IOS-013)", () => {
    it("calls 'idb ui describe-all --udid <serial> --json' and returns CommonElement[] via the idb normalizer", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(
        ok(
          JSON.stringify([
            {
              AXUniqueId: "Wallet",
              AXLabel: "Wallet",
              frame: { x: 199, y: 116, width: 64, height: 87.5 },
              type: "Button",
              role: "AXButton",
              custom_actions: [],
              enabled: true,
            },
          ]),
        ),
      );

      const backend = new IdbBackend(exec);
      const elements = await backend.dumpUiHierarchy("SIM-1");

      expect(exec).toHaveBeenCalledWith(["ui", "describe-all", "--udid", "SIM-1", "--json"]);
      expect(elements).toEqual([
        {
          role: "Button",
          text: "Wallet",
          id: "Wallet",
          bounds: { x: 199, y: 116, w: 64, h: 87.5 },
          tappable: true,
          enabled: true,
          children: [],
        },
      ]);
    });

    it("returns an empty array for empty/malformed stdout, without throwing", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));
      const backend = new IdbBackend(exec);

      await expect(backend.dumpUiHierarchy("SIM-1")).resolves.toEqual([]);
    });

    it("propagates a failed idb invocation as IdbCommandFailedError", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(fail("Simulator not booted"));
      const backend = new IdbBackend(exec);

      await expect(backend.dumpUiHierarchy("SIM-1")).rejects.toThrow(/Simulator not booted/);
    });
  });

  describe("screenshot (AC-IOS-014)", () => {
    it("calls 'idb screenshot --udid <serial> -' (dest_path is a REQUIRED positional; '-' = stdout) and returns raw PNG bytes", async () => {
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(okBinary(pngBytes));

      const backend = new IdbBackend(exec);
      const result = await backend.screenshot("SIM-1");

      expect(exec).toHaveBeenCalledWith(["screenshot", "--udid", "SIM-1", "-"]);
      expect(Buffer.from(result)).toEqual(pngBytes);
    });
  });

  describe("tap (AC-IOS-015)", () => {
    it("calls 'idb ui tap --udid <serial> <x> <y>'", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.tap("SIM-1", 100, 200);

      expect(exec).toHaveBeenCalledWith(["ui", "tap", "--udid", "SIM-1", "100", "200"]);
    });
  });

  describe("swipe (AC-GEST-001, AC-GEST-002 — SPEC-GESTURE-001 M1)", () => {
    it("calls 'idb ui swipe --udid <serial> <x1> <y1> <x2> <y2>' with no --duration token when options are omitted", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.swipe("SIM-1", { x: 100, y: 800 }, { x: 100, y: 200 });

      expect(exec).toHaveBeenCalledWith(["ui", "swipe", "--udid", "SIM-1", "100", "800", "100", "200"]);
    });

    it("converts durationMs to seconds (float) BEFORE building argv — idb's --duration is seconds, not ms (spec.md §C.1-⑦)", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.swipe("SIM-1", { x: 100, y: 800 }, { x: 100, y: 200 }, { durationMs: 500 });

      const calledArgs = exec.mock.calls[0]?.[0] as string[];
      expect(calledArgs).toEqual(["ui", "swipe", "--udid", "SIM-1", "100", "800", "100", "200", "--duration", "0.5"]);
      // The literal read-out that matters most (AC-GEST-002): the token
      // immediately after "--duration" parses to 0.5, never 500.
      const durationIndex = calledArgs.indexOf("--duration");
      expect(Number(calledArgs[durationIndex + 1])).toBe(0.5);
    });

    it("groups the --duration pair AFTER the four coordinate positionals, never interleaved between them (AC-GEST-002 — argparse positional-optional ordering hazard)", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.swipe("SIM-1", { x: 100, y: 800 }, { x: 100, y: 200 }, { durationMs: 500 });

      const calledArgs = exec.mock.calls[0]?.[0] as string[];
      // The four coordinate positionals occupy indices 4-7 (right after
      // "ui","swipe","--udid",serial); --duration must start at index 8 or
      // later — never inside the 4-7 coordinate block.
      expect(calledArgs.slice(4, 8)).toEqual(["100", "800", "100", "200"]);
      const durationIndex = calledArgs.indexOf("--duration");
      expect(durationIndex).toBeGreaterThanOrEqual(8);
    });

    it("throws IdbCommandFailedError when the underlying idb swipe invocation exits non-zero", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(fail("Invalid udid"));

      const backend = new IdbBackend(exec);

      await expect(backend.swipe("SIM-1", { x: 0, y: 0 }, { x: 1, y: 1 })).rejects.toThrow(IdbCommandFailedError);
    });
  });

  describe("getMinEffectiveSwipeThreshold (AC-GEST-026, AC-GEST-027 — SPEC-GESTURE-001 M8)", () => {
    it("returns the measured constant (11pt, spec.md §C.1-⑭) without invoking idb at all -- no density accessor exists on this platform", async () => {
      const exec = vi.fn<IdbExecutor>();

      const backend = new IdbBackend(exec);
      const threshold = await backend.getMinEffectiveSwipeThreshold("SIM-1");

      expect(threshold).toEqual({ minEffectiveSwipePx: 11, basis: "measured-constant" });
      expect(exec).not.toHaveBeenCalled();
    });

    it("returns the SAME constant regardless of which serial is queried -- the value is not derived from this device", async () => {
      const exec = vi.fn<IdbExecutor>();
      const backend = new IdbBackend(exec);

      const a = await backend.getMinEffectiveSwipeThreshold("SIM-1");
      const b = await backend.getMinEffectiveSwipeThreshold("SIM-2-A-DIFFERENT-DEVICE");

      expect(a).toEqual(b);
      expect(exec).not.toHaveBeenCalled();
    });
  });

  describe("inputText (AC-IOS-016 — ASCII via ui text, non-ASCII via clipboard paste)", () => {
    it("calls 'idb ui text --udid <serial> <text>' directly for ASCII, with no self-heal / IME / broadcast steps", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.inputText("SIM-1", "hello world");

      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(["ui", "text", "--udid", "SIM-1", "hello world"]);
    });

    /**
     * `idb ui text` is NOT Unicode-capable: it maps each character through a
     * fixed US-keyboard table (fb-idb 1.1.7 `idb/common/hid.py` KEY_MAP —
     * printable ASCII plus newline) and raises `No keycode found for 네` for
     * anything else. Non-ASCII therefore routes through the device pasteboard
     * instead: simctl pbcopy, then Cmd (HID 227) held down while V (HID 25) is
     * pressed. Verified against a booted simulator.
     */
    it("routes non-ASCII text through the clipboard: pbcopy, then V pressed while Cmd is held", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValue(ok(""));
      const writeClipboard = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);

      const backend = new IdbBackend(exec, writeClipboard, 0);
      await backend.inputText("SIM-1", "네이버 한글 🎉");

      expect(writeClipboard).toHaveBeenCalledWith("SIM-1", "네이버 한글 🎉");
      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, ["ui", "key", "--udid", "SIM-1", "--duration", "2", "227"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["ui", "key", "--udid", "SIM-1", "25"]);
      // Never attempts `ui text` with a character idb cannot encode.
      expect(exec).not.toHaveBeenCalledWith(expect.arrayContaining(["text"]));
    });

    it("keeps the ASCII fast path for every character idb's KEY_MAP covers (printable ASCII + newline)", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValue(ok(""));
      const writeClipboard = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
      const backend = new IdbBackend(exec, writeClipboard, 0);

      await backend.inputText("SIM-1", "a~Z0!@#$%^&*()_+-=[]{}|;':\",./<>?\n");

      expect(writeClipboard).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec.mock.calls[0]?.[0]?.[1]).toBe("text");
    });

    it("surfaces a clipboard-write failure as an error rather than silently typing nothing", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValue(ok(""));
      const writeClipboard = vi.fn<ClipboardWriter>().mockRejectedValue(new Error("simctl pbcopy failed (exit 1)"));

      const backend = new IdbBackend(exec, writeClipboard, 0);

      await expect(backend.inputText("SIM-1", "한글")).rejects.toThrow(/pbcopy/);
      expect(exec).not.toHaveBeenCalled();
    });

    it("surfaces a failed paste keystroke as IdbCommandFailedError", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok("")).mockResolvedValueOnce(fail("HID event failed"));
      const writeClipboard = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);

      const backend = new IdbBackend(exec, writeClipboard, 0);

      await expect(backend.inputText("SIM-1", "한글")).rejects.toBeInstanceOf(IdbCommandFailedError);
    });

    it("accepts options.hideKeyboardAfter as a harmless no-op — it changes nothing about the single idb call issued", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValue(ok(""));
      const backend = new IdbBackend(exec);

      await backend.inputText("SIM-1", "hello", { hideKeyboardAfter: true });
      await expect(backend.inputText("SIM-1", "hello", { hideKeyboardAfter: false })).resolves.toBeUndefined();

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, ["ui", "text", "--udid", "SIM-1", "hello"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["ui", "text", "--udid", "SIM-1", "hello"]);
    });
  });

  describe("sendKeyEvent (AC-IOS-017)", () => {
    it("maps a supported alias (enter) to its iOS HID keycode and sends 'idb ui key --udid <serial> <code>'", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.sendKeyEvent("SIM-1", "enter");

      expect(exec).toHaveBeenCalledWith(["ui", "key", "--udid", "SIM-1", "40"]);
    });

    it("rejects an alias with no iOS HID mapping (home) with UnsupportedKeyOnIosError, without calling idb", async () => {
      const exec = vi.fn<IdbExecutor>();
      const backend = new IdbBackend(exec);

      const thrown: unknown = await backend.sendKeyEvent("SIM-1", "home").catch((err: unknown) => err);

      expect(thrown).toBeInstanceOf(UnsupportedKeyOnIosError);
      expect((thrown as UnsupportedKeyOnIosError).code).toBe("UNSUPPORTED_KEY_ON_IOS");
      expect(exec).not.toHaveBeenCalled();
    });

    it("rejects volume_up/volume_down/back/menu/app_switch/power the same way (no HID hardware-keyboard equivalent)", async () => {
      const exec = vi.fn<IdbExecutor>();
      const backend = new IdbBackend(exec);

      for (const alias of ["volume_up", "volume_down", "back", "menu", "app_switch", "power"] as const) {
        await expect(backend.sendKeyEvent("SIM-1", alias)).rejects.toBeInstanceOf(UnsupportedKeyOnIosError);
      }
      expect(exec).not.toHaveBeenCalled();
    });

    it("rejects an unrecognized alias without calling idb (defense in depth, mirrors AdbBackend)", async () => {
      const exec = vi.fn<IdbExecutor>();
      const backend = new IdbBackend(exec);

      await expect(backend.sendKeyEvent("SIM-1", "not-a-real-alias")).rejects.toThrow();
      expect(exec).not.toHaveBeenCalled();
    });
  });

  describe("launchApp / stopApp (AC-IOS-018)", () => {
    it("launches a bundle id via 'idb launch --udid <serial> <bundleId>'", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.launchApp("SIM-1", "com.apple.Preferences");

      expect(exec).toHaveBeenCalledWith(["launch", "--udid", "SIM-1", "com.apple.Preferences"]);
    });

    it("terminates a bundle id via 'idb terminate --udid <serial> <bundleId>'", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(ok(""));

      const backend = new IdbBackend(exec);
      await backend.stopApp("SIM-1", "com.apple.Preferences");

      expect(exec).toHaveBeenCalledWith(["terminate", "--udid", "SIM-1", "com.apple.Preferences"]);
    });
  });

  describe("failure propagation (AC-IOS-027, REQ-IOS-ERR-002)", () => {
    it("throws IdbCommandFailedError carrying stderr when the underlying idb invocation exits non-zero", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValue(fail("idb: no booted simulator found", 1));

      const backend = new IdbBackend(exec);

      await expect(backend.tap("missing-sim", 1, 1)).rejects.toThrow(/no booted simulator found/);
      const thrown: unknown = await backend.tap("missing-sim", 1, 1).catch((e: unknown) => e);
      expect(thrown).toBeInstanceOf(IdbCommandFailedError);
    });

    it("throws a generic exit-code message when stderr is empty", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(fail("", 1));

      const backend = new IdbBackend(exec);

      await expect(backend.tap("missing-sim", 1, 1)).rejects.toThrow(/failed \(exit 1\)\)?$/);
    });

    it("attempts only ONE idb call per method — no partial side effects on failure", async () => {
      const exec = vi.fn<IdbExecutor>().mockResolvedValueOnce(fail("boom"));
      const backend = new IdbBackend(exec);

      await expect(backend.launchApp("SIM-1", "com.example.app")).rejects.toThrow();
      expect(exec).toHaveBeenCalledTimes(1);
    });
  });
});
