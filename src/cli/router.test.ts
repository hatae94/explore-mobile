import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { runCli } from "./router.js";

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R58N90ABCDE",
    model: "Pixel_7",
    osVersion: "14",
    connectionState: "device",
    isEmulator: false,
    ...overrides,
  };
}

/** A fully-mocked DeviceBackend — the router/commands never touch adb directly. */
function createMockBackend(devices: DeviceInfo[] = [device()]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    dumpUiHierarchy: vi
      .fn()
      .mockResolvedValue('<hierarchy><node class="android.widget.Button" resource-id="btn_ok" clickable="true" enabled="true" bounds="[0,0][10,10]" /></hierarchy>'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runCli", () => {
  it("emits a JSON.parse-able output for every command (AC-ANDROID-012)", async () => {
    const backend = createMockBackend();
    const invocations: string[][] = [
      ["devices"],
      ["launch", "com.android.settings"],
      ["stop", "com.android.settings"],
      ["tap", "10", "20"],
      ["key", "back"],
      ["dump"],
      ["screenshot"],
      ["text", "hello"],
      ["doctor"],
      ["unknown-command"],
      [],
    ];

    for (const argv of invocations) {
      const result = await runCli(argv, backend);
      expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
      expect(typeof result.ok).toBe("boolean");
      expect(typeof result.command).toBe("string");
    }
  });

  describe("devices", () => {
    it("returns the connected device list wrapped in a success envelope", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["devices"], backend);

      expect(result).toEqual({ ok: true, command: "devices", data: devices });
    });

    it("filters to the requested --device serial when it matches a connected device", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["devices", "--device", "B"], backend);

      expect(result).toEqual({ ok: true, command: "devices", data: [device({ serial: "B" })] });
    });

    it("returns DEVICE_NOT_FOUND when --device does not match any connected device", async () => {
      const backend = createMockBackend([device({ serial: "A" })]);

      const result = await runCli(["devices", "--device", "missing"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("DEVICE_NOT_FOUND");
    });
  });

  describe("multi-device targeting (REQ-MULTIDEV-002, AC-ANDROID-009)", () => {
    it("returns a graceful AMBIGUOUS_DEVICE error + device list when >1 device connected and --device is omitted", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["tap", "10", "20"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
        expect(result.error.details?.["availableDevices"]).toEqual(devices);
      }
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("targets the requested --device serial when multiple devices are connected", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["tap", "10", "20", "--device", "B"], backend);

      expect(result).toEqual({ ok: true, command: "tap", data: { serial: "B", x: 10, y: 20 } });
      expect(backend.tap).toHaveBeenCalledWith("B", 10, 20);
    });

    it("returns a graceful NO_DEVICE error when 0 devices are connected", async () => {
      const backend = createMockBackend([]);

      const result = await runCli(["dump"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NO_DEVICE");
    });
  });

  describe("tap", () => {
    it("rejects non-integer or negative coordinates gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "abc", "10"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_COORDINATES");
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("rejects a missing y coordinate gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "10"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_COORDINATES");
        expect(result.error.details?.["received"]).toEqual({ x: "10", y: null });
      }
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("degrades a non-Error backend rejection to a readable string message (Secured — unknown thrown shape)", async () => {
      const backend = createMockBackend();
      (backend.tap as ReturnType<typeof vi.fn>).mockRejectedValueOnce("plain string rejection");

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ADB_COMMAND_FAILED");
        expect(result.error.message).toBe("plain string rejection");
      }
    });
  });

  describe("key", () => {
    it("invokes the backend for a supported alias", async () => {
      const backend = createMockBackend();

      const result = await runCli(["key", "back"], backend);

      expect(result).toEqual({ ok: true, command: "key", data: { serial: "R58N90ABCDE", key: "back" } });
      expect(backend.sendKeyEvent).toHaveBeenCalledWith("R58N90ABCDE", "back");
    });

    it("rejects an unsupported alias gracefully without calling the backend (REQ-INPUT-005)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["key", "foobar"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_KEY");
      expect(backend.sendKeyEvent).not.toHaveBeenCalled();
    });

    it("rejects a missing alias positional gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["key"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_KEY");
        expect(result.error.details?.["received"]).toBeNull();
      }
    });

    it("degrades a sendKeyEvent rejection to a graceful ADB_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.sendKeyEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["key", "back"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ADB_COMMAND_FAILED");
    });
  });

  describe("launch / stop", () => {
    it("rejects an invalid package name gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["launch", "not a package"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_PACKAGE");
      expect(backend.launchApp).not.toHaveBeenCalled();
    });

    it("rejects a missing package positional gracefully for launch", async () => {
      const backend = createMockBackend();

      const result = await runCli(["launch"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PACKAGE");
        expect(result.error.details?.["received"]).toBeNull();
      }
    });

    it("rejects a missing package positional gracefully for stop", async () => {
      const backend = createMockBackend();

      const result = await runCli(["stop"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_PACKAGE");
    });

    it("launches a valid package (REQ-APP-001, mock-verifiable AC-ANDROID-011)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["launch", "com.android.settings"], backend);

      expect(result).toEqual({
        ok: true,
        command: "launch",
        data: { serial: "R58N90ABCDE", package: "com.android.settings" },
      });
      expect(backend.launchApp).toHaveBeenCalledWith("R58N90ABCDE", "com.android.settings");
    });

    it("force-stops a valid package (REQ-APP-002, mock-verifiable AC-ANDROID-011)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["stop", "com.android.settings"], backend);

      expect(result).toEqual({
        ok: true,
        command: "stop",
        data: { serial: "R58N90ABCDE", package: "com.android.settings" },
      });
      expect(backend.stopApp).toHaveBeenCalledWith("R58N90ABCDE", "com.android.settings");
    });

    it("degrades a launchApp rejection to a graceful ADB_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.launchApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: package not found"));

      const result = await runCli(["launch", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ADB_COMMAND_FAILED");
    });

    it("degrades a stopApp rejection to a graceful ADB_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.stopApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["stop", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ADB_COMMAND_FAILED");
    });
  });

  describe("dump (M2 reuse integration)", () => {
    it("normalizes the backend's raw XML via normalizeUiAutomatorXml and returns CommonElement[] JSON", async () => {
      const backend = createMockBackend();

      const result = await runCli(["dump"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({
          serial: "R58N90ABCDE",
          elements: [
            {
              role: "android.widget.Button",
              text: "",
              id: "btn_ok",
              bounds: { x: 0, y: 0, w: 10, h: 10 },
              tappable: true,
              enabled: true,
              children: [],
            },
          ],
        });
      }
    });

    it("degrades a dumpUiHierarchy rejection to a graceful ADB_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: exec-out cat failed"),
      );

      const result = await runCli(["dump"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ADB_COMMAND_FAILED");
    });
  });

  describe("screenshot", () => {
    it("embeds base64 PNG bytes in the JSON envelope when --out is omitted (REQ-SCREENSHOT-001/002)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["screenshot"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { pngBase64: string; byteLength: number };
        expect(Buffer.from(data.pngBase64, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        expect(data.byteLength).toBe(4);
      }
    });

    it("writes PNG bytes to --out and returns a path pointer instead of embedding base64", async () => {
      const backend = createMockBackend();
      const dir = await mkdtemp(join(tmpdir(), "explore-mobile-screenshot-"));
      const outPath = join(dir, "shot.png");

      try {
        const result = await runCli(["screenshot", "--out", outPath], backend);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual({ serial: "R58N90ABCDE", savedTo: outPath, byteLength: 4 });
        }
        const written = await readFile(outPath);
        expect(written).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("degrades a screenshot() rejection to a graceful ADB_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.screenshot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["screenshot"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ADB_COMMAND_FAILED");
    });

    it("degrades a --out write failure to a graceful WRITE_FAILED envelope", async () => {
      const backend = createMockBackend();
      // A path inside a non-existent parent directory reliably fails ENOENT.
      const badPath = join(tmpdir(), "explore-mobile-does-not-exist-dir", "shot.png");

      const result = await runCli(["screenshot", "--out", badPath], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("WRITE_FAILED");
        expect(result.error.details?.["path"]).toBe(badPath);
      }
    });
  });

  describe("text / doctor / reset (M5/M6 — not yet implemented)", () => {
    it("text reports NOT_IMPLEMENTED without touching the backend", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_IMPLEMENTED");
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("doctor reports NOT_IMPLEMENTED", async () => {
      const backend = createMockBackend();

      const result = await runCli(["doctor"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_IMPLEMENTED");
    });
  });

  describe("routing errors", () => {
    it("returns MISSING_COMMAND when no command is given", async () => {
      const backend = createMockBackend();

      const result = await runCli([], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MISSING_COMMAND");
    });

    it("returns UNKNOWN_COMMAND for an unrecognized command", async () => {
      const backend = createMockBackend();

      const result = await runCli(["frobnicate"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNKNOWN_COMMAND");
    });

    it("degrades a thrown backend error to a graceful ADB_COMMAND_FAILED envelope instead of throwing", async () => {
      const backend = createMockBackend();
      (backend.tap as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ADB_COMMAND_FAILED");
        expect(result.error.message).toMatch(/device offline/);
      }
    });

    it("returns INVALID_ARGS for an unrecognized flag instead of throwing", async () => {
      const backend = createMockBackend();

      const result = await runCli(["devices", "--not-a-real-flag"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
    });

    it("returns INTERNAL_ERROR (defense in depth) when a handler throws outside its own try/catch, including non-Error rejections", async () => {
      const backend = createMockBackend();
      (backend.listDevices as ReturnType<typeof vi.fn>).mockRejectedValueOnce("not an Error instance");

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INTERNAL_ERROR");
        expect(result.error.message).toBe("not an Error instance");
      }
    });
  });
});
