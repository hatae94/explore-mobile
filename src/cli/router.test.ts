import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdbBackend } from "../backend/adb-backend.js";
import type { AdbExecResult, AdbExecutor } from "../backend/adb-executor.js";
import type { ApkAcquirer } from "../backend/apk-downloader.js";
import { AdbDoctor } from "../backend/doctor.js";
import { AdbKeyboardInstallFailedError, ImeRestoreFailedError } from "../backend/ime-errors.js";
import { ImeSessionStore } from "../backend/ime-session-store.js";
import { BackendRegistry } from "../backend/registry.js";
import type { ProcessExecutor } from "../backend/process-executor.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { normalizeUiAutomatorXml } from "../normalize/uiautomator.js";
import { runCli } from "./router.js";

/** A minimal mock iOS DeviceBackend, used only to populate a BackendRegistry's iOS slot in registry-wrapping regression tests. */
function createMockIosBackend(): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue([]),
    dumpUiHierarchy: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
  };
}

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R58N90ABCDE",
    model: "Pixel_7",
    osVersion: "14",
    connectionState: "device",
    isEmulator: false,
    platform: "android",
    ...overrides,
  };
}

/**
 * A fully-mocked DeviceBackend — the router/commands never touch adb
 * directly. `dumpUiHierarchy` resolves to already-normalized
 * `CommonElement[]` (REQ-IOS-SCHEMA-002/003, SPEC-IOS-001): fixtures below
 * are authored as uiautomator XML for readability, then normalized via
 * `normalizeUiAutomatorXml` at mock-setup time so the mock's return shape
 * matches the real backend contract.
 */
function createMockBackend(devices: DeviceInfo[] = [device()]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    dumpUiHierarchy: vi
      .fn()
      .mockResolvedValue(
        normalizeUiAutomatorXml(
          '<hierarchy><node class="android.widget.Button" resource-id="btn_ok" clickable="true" enabled="true" bounds="[0,0][10,10]" /></hierarchy>',
        ),
      ),
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
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toBe("plain string rejection");
      }
    });
  });

  describe("tap --id/--text element-selector targeting (new capability)", () => {
    it("taps the computed center of the element matched by --id, reusing the dump/normalize tree-fetch path", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "--id", "btn_ok"], backend);

      expect(result).toEqual({
        ok: true,
        command: "tap",
        data: { serial: "R58N90ABCDE", x: 5, y: 5, selector: { id: "btn_ok" } },
      });
      expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 5, 5);
    });

    it("taps the computed center of the element matched by --text", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        normalizeUiAutomatorXml(
          '<hierarchy><node class="android.widget.Button" resource-id="btn_submit" text="Submit" clickable="true" enabled="true" bounds="[100,200][140,240]" /></hierarchy>',
        ),
      );

      const result = await runCli(["tap", "--text", "Submit"], backend);

      expect(result).toEqual({
        ok: true,
        command: "tap",
        data: { serial: "R58N90ABCDE", x: 120, y: 220, selector: { text: "Submit" } },
      });
      expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 120, 220);
    });

    it("selects the Nth match (0-based) via --index when multiple elements share the same id", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        normalizeUiAutomatorXml(
          "<hierarchy>" +
            '<node class="a" resource-id="row" clickable="true" enabled="true" bounds="[0,0][10,10]" />' +
            '<node class="a" resource-id="row" clickable="true" enabled="true" bounds="[0,100][10,110]" />' +
            "</hierarchy>",
        ),
      );

      const result = await runCli(["tap", "--id", "row", "--index", "1"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ serial: "R58N90ABCDE", x: 5, y: 105, selector: { id: "row", index: 1 } });
      }
      expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 5, 105);
    });

    it("still taps a matched but non-tappable element, surfacing a warning instead of refusing", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        normalizeUiAutomatorXml(
          '<hierarchy><node class="a" resource-id="disabled_btn" clickable="false" enabled="false" bounds="[0,0][10,10]" /></hierarchy>',
        ),
      );

      const result = await runCli(["tap", "--id", "disabled_btn"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { warnings?: string[] };
        expect(data.warnings?.[0]).toMatch(/not tappable/i);
      }
      expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 5, 5);
    });

    it("returns a graceful ELEMENT_NOT_FOUND (carrying the selector) and does not tap when no element matches", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "--id", "does_not_exist"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ELEMENT_NOT_FOUND");
        expect(result.error.details?.["selector"]).toEqual({ id: "does_not_exist" });
      }
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("returns a graceful TARGET_CONFLICT (coords XOR selector) without resolving a device or calling the backend", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "10", "20", "--id", "btn_ok"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("TARGET_CONFLICT");
      expect(backend.listDevices).not.toHaveBeenCalled();
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("returns a graceful INVALID_INDEX when --index is not a non-negative integer", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "--id", "btn_ok", "--index", "abc"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_INDEX");
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("degrades a dumpUiHierarchy rejection in selector mode to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: exec-out cat failed"),
      );

      const result = await runCli(["tap", "--id", "btn_ok"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("returns a graceful device-targeting error (not ELEMENT_NOT_FOUND) when the device is ambiguous in selector mode", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["tap", "--id", "btn_ok"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
      expect(backend.dumpUiHierarchy).not.toHaveBeenCalled();
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

    it("degrades a sendKeyEvent rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.sendKeyEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["key", "back"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
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

    it("degrades a launchApp rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.launchApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: package not found"));

      const result = await runCli(["launch", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("degrades a stopApp rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.stopApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["stop", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
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

    it("degrades a dumpUiHierarchy rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: exec-out cat failed"),
      );

      const result = await runCli(["dump"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
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

    it("degrades a screenshot() rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.screenshot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["screenshot"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
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

  describe("text (M5 — REQ-INPUT-002/003/004)", () => {
    it("dispatches to backend.inputText with the resolved serial and returns success", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello"], backend);

      expect(result).toEqual({ ok: true, command: "text", data: { serial: "R58N90ABCDE" } });
      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: true });
    });

    it("rejects a missing text positional gracefully without calling the backend", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MISSING_TEXT");
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("surfaces an ImeRestoreFailedError as a dedicated IME_RESTORE_FAILED envelope carrying originalImeId (REQ-ERR-001, AC-ANDROID-015)", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImeRestoreFailedError("restore failed, please recover manually", "com.example/.OriginalIme"),
      );

      const result = await runCli(["text", "안녕"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IME_RESTORE_FAILED");
        expect(result.error.details?.["originalImeId"]).toBe("com.example/.OriginalIme");
      }
    });

    it("degrades a generic inputText rejection to BACKEND_COMMAND_FAILED", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["text", "hello"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("surfaces an AdbKeyboardInstallFailedError using its own code, reusing doctor's error codes (REQ-INPUT-003 revised self-heal)", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AdbKeyboardInstallFailedError(
          "Failed to download a valid ADBKeyBoard APK from ... . Install manually: ...",
          "APK_DOWNLOAD_FAILED",
        ),
      );

      const result = await runCli(["text", "안녕"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("APK_DOWNLOAD_FAILED");
        expect(result.error.message).toMatch(/download/i);
      }
    });

    it("returns a graceful device-targeting error (not BACKEND_COMMAND_FAILED) when the device is ambiguous", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["text", "hello"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("reports originalImeId as null when the ImeRestoreFailedError carries no known id", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImeRestoreFailedError("original IME unknown; manual recovery required", undefined),
      );

      const result = await runCli(["text", "안녕"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details?.["originalImeId"]).toBeNull();
    });

    it("forwards hideKeyboardAfter: true by default (REQ-INPUT-004 revised, real-device UX)", async () => {
      const backend = createMockBackend();

      await runCli(["text", "hello"], backend);

      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: true });
    });

    it("forwards hideKeyboardAfter: false when --keep-keyboard is given", async () => {
      const backend = createMockBackend();

      await runCli(["text", "hello", "--keep-keyboard"], backend);

      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: false });
    });
  });

  describe("text --id/--text focus-before-type (new capability)", () => {
    it("focus-taps the element matched by --id, then sends the input text (tap happens before typing)", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        normalizeUiAutomatorXml(
          '<hierarchy><node class="android.widget.EditText" resource-id="et_name" clickable="true" enabled="true" bounds="[40,220][1040,320]" /></hierarchy>',
        ),
      );

      const result = await runCli(["text", "hello", "--id", "et_name"], backend);

      expect(result).toEqual({ ok: true, command: "text", data: { serial: "R58N90ABCDE" } });
      expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 540, 270);
      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: true });

      const tapOrder = (backend.tap as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
      const inputOrder = (backend.inputText as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
      expect(tapOrder).toBeLessThan(inputOrder);
    });

    it("focus-taps the element matched by --text (content-desc-derived), then sends the input text", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        normalizeUiAutomatorXml(
          '<hierarchy><node class="android.widget.EditText" resource-id="et_search" content-desc="Search field" clickable="true" enabled="true" bounds="[0,0][100,100]" /></hierarchy>',
        ),
      );

      const result = await runCli(["text", "query", "--text", "Search field"], backend);

      expect(result).toEqual({ ok: true, command: "text", data: { serial: "R58N90ABCDE" } });
      expect(backend.tap).toHaveBeenCalledWith("R58N90ABCDE", 50, 50);
      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "query", { hideKeyboardAfter: true });
    });

    it("returns a graceful ELEMENT_NOT_FOUND and does NOT tap or type when the focus selector matches nothing", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello", "--id", "does_not_exist"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("ELEMENT_NOT_FOUND");
        expect(result.error.details?.["selector"]).toEqual({ id: "does_not_exist" });
      }
      expect(backend.tap).not.toHaveBeenCalled();
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("preserves bare `text` behavior (types into whatever is already focused) when no selector is given", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello"], backend);

      expect(result).toEqual({ ok: true, command: "text", data: { serial: "R58N90ABCDE" } });
      expect(backend.dumpUiHierarchy).not.toHaveBeenCalled();
      expect(backend.tap).not.toHaveBeenCalled();
      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: true });
    });

    it("returns a graceful INVALID_INDEX when --index is not a non-negative integer, without typing", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello", "--id", "et_name", "--index", "abc"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_INDEX");
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("degrades a dumpUiHierarchy rejection during focus mode to a graceful BACKEND_COMMAND_FAILED envelope, without typing", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("adb: exec-out cat failed"),
      );

      const result = await runCli(["text", "hello", "--id", "et_name"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
      expect(backend.inputText).not.toHaveBeenCalled();
    });
  });

  describe("doctor (M6 — REQ-DOCTOR-001~005)", () => {
    async function makeDoctor(overrides: {
      adbExec?: AdbExecutor;
      processExec?: ProcessExecutor;
      acquireApk?: ApkAcquirer;
      platform?: NodeJS.Platform;
    }) {
      return new AdbDoctor(overrides.adbExec, overrides.processExec, overrides.acquireApk, overrides.platform);
    }

    function adbOk(stdout = ""): AdbExecResult {
      return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
    }

    function adbFail(stderr: string): AdbExecResult {
      return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode: 1 };
    }

    it("reports adb missing + install guidance without touching device listing (macOS, no consent)", async () => {
      const backend = createMockBackend();
      const adbExec = vi.fn<AdbExecutor>().mockRejectedValueOnce(new Error("spawn adb ENOENT"));
      const doctor = await makeDoctor({ adbExec, platform: "darwin" });

      const result = await runCli(["doctor"], backend, doctor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          adb: { installed: boolean };
          installAttempt: { attempted: boolean; manualCommand: string };
          adbKeyboard: { skipped: boolean };
        };
        expect(data.adb.installed).toBe(false);
        expect(data.installAttempt.attempted).toBe(false);
        expect(data.installAttempt.manualCommand).toBe("brew install android-platform-tools");
        expect(data.adbKeyboard.skipped).toBe(true);
      }
      expect(backend.listDevices).not.toHaveBeenCalled();
    });

    it("reports daemon-unhealthy without querying devices (REQ-ERR-004, AC-ANDROID-018)", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41")) // version
        .mockResolvedValueOnce(adbFail("cannot bind to 127.0.0.1:5037")); // start-server
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], backend, doctor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { daemon: { healthy: boolean } };
        expect(data.daemon.healthy).toBe(false);
      }
      expect(backend.listDevices).not.toHaveBeenCalled();
    });

    it("installs + enables ADBKeyBoard on the resolved device when adb and daemon are healthy", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41")) // version
        .mockResolvedValueOnce(adbOk("")) // start-server
        .mockResolvedValueOnce(adbOk("package:com.android.adbkeyboard\n")) // pm list packages (already present)
        .mockResolvedValueOnce(adbOk("")); // ime enable
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], backend, doctor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { adbKeyboard: { skipped: boolean; alreadyInstalled: boolean; enabled: boolean } };
        expect(data.adbKeyboard).toEqual({ skipped: false, alreadyInstalled: true, installed: false, enabled: true });
      }
    });

    it("reports APK_DOWNLOAD_FAILED gracefully when the runtime download fails (REQ-ERR-002, AC-ANDROID-016)", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41"))
        .mockResolvedValueOnce(adbOk(""))
        .mockResolvedValueOnce(adbOk("package:com.android.settings\n")); // ADBKeyBoard not present
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockRejectedValue(new Error("Failed to download a valid ADBKeyBoard APK from ... Install manually: ..."));
      const doctor = await makeDoctor({ adbExec, acquireApk });

      const result = await runCli(["doctor"], backend, doctor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { adbKeyboard: { error?: { code: string; message: string } } };
        expect(data.adbKeyboard.error?.code).toBe("APK_DOWNLOAD_FAILED");
        expect(data.adbKeyboard.error?.message).toMatch(/manually/i);
      }
    });

    it("reports adbKeyboard as skipped (not a hard failure) when the target device is ambiguous", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41"))
        .mockResolvedValueOnce(adbOk(""));
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], backend, doctor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { adbKeyboard: { skipped: boolean; reason: string } };
        expect(data.adbKeyboard.skipped).toBe(true);
        expect(data.adbKeyboard.reason).toMatch(/devices connected/);
      }
      // adb/daemon checks still ran (2 calls); no per-device ensureAdbKeyboard call attempted.
      expect(adbExec).toHaveBeenCalledTimes(2);
    });

    it("doctor --clean delegates to the same reset logic under the 'doctor' command name", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("")) // ime disable
        .mockResolvedValueOnce(adbOk("")) // ime reset
        .mockResolvedValueOnce(adbOk("Success")); // uninstall
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor", "--clean"], backend, doctor);

      expect(result.ok).toBe(true);
      expect(result.command).toBe("doctor");
      if (result.ok) {
        const data = result.data as { imeReset: boolean };
        expect(data.imeReset).toBe(true);
      }
    });
  });

  describe("reset (M6 — REQ-DOCTOR-004)", () => {
    it("resolves the target device then reports the reset outcome", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 })
        .mockResolvedValueOnce({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 })
        .mockResolvedValueOnce({ stdout: Buffer.from("Success"), stderr: Buffer.alloc(0), exitCode: 0 });
      const doctor = new AdbDoctor(adbExec);

      const result = await runCli(["reset"], backend, doctor);

      expect(result.ok).toBe(true);
      expect(result.command).toBe("reset");
      if (result.ok) {
        expect(result.data).toEqual({
          serial: "R58N90ABCDE",
          imeReset: true,
          adbKeyboardDisabled: true,
          adbKeyboardUninstalled: true,
          warnings: [],
        });
      }
    });

    it("returns a graceful device-targeting error without touching the doctor service when ambiguous", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);
      const adbExec = vi.fn<AdbExecutor>();
      const doctor = new AdbDoctor(adbExec);

      const result = await runCli(["reset"], backend, doctor);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
      expect(adbExec).not.toHaveBeenCalled();
    });

    describe("session-based IME restore integration (REQ-INPUT-004 disk-persistence fix, real AdbBackend)", () => {
      function devicesListResult(serial: string): AdbExecResult {
        return {
          stdout: Buffer.from(
            `List of devices attached\n${serial}          device product:sdk model:sdk_gphone64_arm64 device:emu64a transport_id:1\n`,
            "utf-8",
          ),
          stderr: Buffer.alloc(0),
          exitCode: 0,
        };
      }

      // The on-disk `ImeSessionStore` must never touch the real
      // `~/.cache/explore-mobile` directory during tests.
      let imeStoreDir: string;
      let imeStorePath: string;

      beforeEach(async () => {
        imeStoreDir = await mkdtemp(join(tmpdir(), "explore-mobile-router-ime-"));
        imeStorePath = join(imeStoreDir, "ime-sessions.json");
      });

      afterEach(async () => {
        await rm(imeStoreDir, { recursive: true, force: true });
      });

      it("restores the per-serial original IME tracked from a prior non-ASCII `text` session, then clears it", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const backend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        const doctor = new AdbDoctor(adbExec);

        // A prior non-ASCII `text` call switches this serial's session IME.
        await backend.inputText(serial, "안녕");
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);

        const result = await runCli(["reset"], backend, doctor);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean };
          expect(data.originalImeRestored).toBe(true);
        }

        const restoreCallExists = adbExec.mock.calls.some(
          ([callArgs]) =>
            callArgs[1] === serial &&
            callArgs[2] === "shell" &&
            callArgs[3] === "ime" &&
            callArgs[4] === "set" &&
            callArgs[5] === originalIme,
        );
        expect(restoreCallExists).toBe(true);

        // The session is cleared once `reset` has restored it.
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBeUndefined();
      });

      it("still restores the per-serial original IME when `backend` is a BackendRegistry wrapping the AdbBackend (SPEC-IOS-001, bin.ts's real construction — regression guard)", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const adbBackend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        const registry = new BackendRegistry([
          { platform: "android", backend: adbBackend, isAvailable: async () => true },
          { platform: "ios", backend: createMockIosBackend(), isAvailable: async () => false },
        ]);
        const doctor = new AdbDoctor(adbExec);

        await adbBackend.inputText(serial, "안녕");
        await expect(adbBackend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);

        const result = await runCli(["reset"], registry, doctor);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean };
          expect(data.originalImeRestored).toBe(true);
        }
        await expect(adbBackend.getTrackedOriginalIme(serial)).resolves.toBeUndefined();
      });

      it("restores the per-serial original IME even when the `text` call and the `reset` call use SEPARATE AdbBackend instances (the reported cross-process bug)", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        // "Process 1" (`text` invocation): a fresh `AdbBackend` +
        // `ImeSessionStore` pair, exactly as `bin.ts` constructs on every
        // CLI invocation.
        const textProcessBackend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        await textProcessBackend.inputText(serial, "안녕");

        // "Process 2" (`reset` invocation): a BRAND-NEW `AdbBackend` +
        // `ImeSessionStore` pair pointed at the SAME on-disk file — no
        // in-memory state is shared with `textProcessBackend`.
        const resetProcessBackend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        const doctor = new AdbDoctor(adbExec);

        const result = await runCli(["reset"], resetProcessBackend, doctor);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean };
          expect(data.originalImeRestored).toBe(true);
        }

        const restoreCallExists = adbExec.mock.calls.some(
          ([callArgs]) =>
            callArgs[1] === serial &&
            callArgs[2] === "shell" &&
            callArgs[3] === "ime" &&
            callArgs[4] === "set" &&
            callArgs[5] === originalIme,
        );
        expect(restoreCallExists).toBe(true);
      });

      it("retains the session-tracked IME when the reset's precise restore fails (audit / manual recovery)", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "ime" && args[4] === "set" && args[5] === originalIme) {
            return { stdout: Buffer.alloc(0), stderr: Buffer.from("adb: ime set rejected", "utf-8"), exitCode: 1 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const backend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        const doctor = new AdbDoctor(adbExec);

        await backend.inputText(serial, "안녕");

        const result = await runCli(["reset"], backend, doctor);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean; warnings: string[] };
          expect(data.originalImeRestored).toBe(false);
          expect(data.warnings.some((w) => w.includes(originalIme))).toBe(true);
        }

        // Retained for audit / manual recovery — the session is NOT cleared.
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);
      });
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

    it("degrades a thrown backend error to a graceful BACKEND_COMMAND_FAILED envelope instead of throwing", async () => {
      const backend = createMockBackend();
      (backend.tap as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
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
