import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdbBackend } from "../backend/adb-backend.js";
import type { AdbExecResult, AdbExecutor } from "../backend/adb-executor.js";
import type { ApkAcquirer } from "../backend/apk-downloader.js";
import { AdbDoctor } from "../backend/doctor.js";
import { IdbDoctor } from "../backend/idb-doctor.js";
import { AdbKeyboardInstallFailedError, ImeBindTimeoutError, ImeRestoreFailedError } from "../backend/ime-errors.js";
import { UnsupportedKeyOnIosError } from "../backend/idb-errors.js";
import { LauncherActivityNotFoundError } from "../backend/launch-errors.js";
import { ImeSessionStore } from "../backend/ime-session-store.js";
import { BackendRegistry } from "../backend/registry.js";
import type { ProcessExecutor } from "../backend/process-executor.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import type { EnvServices } from "./env-services.js";
import { runCli } from "./router.js";

/**
 * Wraps a test-constructed `AdbDoctor` (and optionally a mock/real
 * `IdbDoctor`) into the `EnvServices` holder `runCli`'s third parameter
 * now expects (REQ-IOS-DOCTOR-003, SPEC-IOS-001 — generalized from the
 * original bare-`AdbDoctor` parameter). Every pre-existing doctor/reset
 * test in this file is Android-focused, so `ios` defaults to an inert
 * `new IdbDoctor()` that is never exercised unless a test explicitly
 * targets an iOS device.
 */
function envServices(android: AdbDoctor, ios: IdbDoctor = new IdbDoctor()): EnvServices {
  return { android, ios };
}

/** A minimal mock iOS DeviceBackend, used only to populate a BackendRegistry's iOS slot in registry-wrapping regression tests. */
function createMockIosBackend(): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
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
 * directly.
 *
 * SPEC-VISION-001 M2 (REQ-VISION-002): the UI-tree read member and its
 * uiautomator-XML fixture were dropped along with the interface method, so
 * this mock no longer carries a normalizer dependency. `getScreenSize` is
 * the only screen-shaped member left.
 */
function createMockBackend(devices: DeviceInfo[] = [device()]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    screenshot: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
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

      // SPEC-VISION-001 M2: this used to target `dump`. That command is gone,
      // and an UNKNOWN_COMMAND would short-circuit before device resolution —
      // masking the NO_DEVICE contract this test exists to check. `screenshot`
      // is a surviving device-targeted command with the same resolution path.
      const result = await runCli(["screenshot"], backend);

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

  // SPEC-VISION-001 M2 (REQ-VISION-002): tap의 셀렉터 모드와 그 iOS 라우팅
  // 회귀 테스트가 함께 제거됐다. 남는 계약은 "제거된 플래그는 조용히
  // 좌표 탭으로 대체되지 않는다"이며, 아래가 그 가드다(AC-VISION-009).
  describe("tap: 제거된 셀렉터 플래그 (AC-VISION-009)", () => {
    it.each([
      [["tap", "--id", "btn_ok"]],
      [["tap", "--text", "OK"]],
      [["tap", "--id", "btn_ok", "--index", "1"]],
      [["tap", "100", "200", "--id", "btn_ok"]],
    ])("%j는 INVALID_ARGS로 거부되고 backend.tap은 호출되지 않는다", async (argv) => {
      const backend = createMockBackend();

      const result = await runCli(argv as string[], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.tap).not.toHaveBeenCalled();
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

    it("surfaces UNSUPPORTED_KEY_ON_IOS at the CLI level (not BACKEND_COMMAND_FAILED) for a valid alias with no iOS HID mapping on an iOS-registry-routed target (AC-IOS-017, D7 typed-error precedence)", async () => {
      const iosDeviceInfo = device({ serial: "00008030-IOS", platform: "ios" });
      const idbBackend: DeviceBackend = {
        listDevices: vi.fn().mockResolvedValue([iosDeviceInfo]),
        screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
        tap: vi.fn().mockResolvedValue(undefined),
        inputText: vi.fn().mockResolvedValue(undefined),
        sendKeyEvent: vi
          .fn()
          .mockRejectedValue(
            new UnsupportedKeyOnIosError(
              "Key alias 'home' has no iOS HID keycode mapping — no hardware-keyboard equivalent exists on iOS.",
            ),
          ),
        launchApp: vi.fn().mockResolvedValue(undefined),
        stopApp: vi.fn().mockResolvedValue(undefined),
        swipe: vi.fn().mockResolvedValue(undefined),
        getMinEffectiveSwipeThreshold: vi
          .fn()
          .mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
        getScreenSize: vi.fn().mockResolvedValue({ width: 1179, height: 2556 }),
      };
      // M5(REQ-VISION-005): registry는 더 이상 `DeviceBackend`를 구현하지
      // 않는다 — `runCli`가 `DeviceSource`로 받아 그대로 라우팅한다.
      const registry = new BackendRegistry([
        { platform: "ios", backend: idbBackend, isAvailable: async () => true },
      ]);

      const result = await runCli(["key", "home"], registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_KEY_ON_IOS");
        expect(result.error.code).not.toBe("BACKEND_COMMAND_FAILED");
      }
      expect(idbBackend.sendKeyEvent).toHaveBeenCalledWith(iosDeviceInfo.serial, "home");
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

    it("surfaces a LauncherActivityNotFoundError using its own dedicated envelope code, distinct from BACKEND_COMMAND_FAILED (REQ-APP-001 개정 0.3.0, AC-ANDROID-028)", async () => {
      const backend = createMockBackend();
      (backend.launchApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new LauncherActivityNotFoundError("com.example.doesnotexist"),
      );

      const result = await runCli(["launch", "com.example.doesnotexist"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("LAUNCHER_ACTIVITY_NOT_FOUND");
        expect(result.error.code).not.toBe("BACKEND_COMMAND_FAILED");
        // The message must not assert a single cause — both possibilities
        // are presented (spec.md §C.3-③).
        expect(result.error.message).toMatch(/no launcher activity/i);
        expect(result.error.message).toMatch(/not installed/i);
      }
    });

    it("degrades a stopApp rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.stopApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["stop", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });
  });

  // SPEC-VISION-001 M2 (REQ-VISION-002): `dump` 명령이 제거됐다. 사용자
  // 결정으로 `dump --web`까지 함께 제거됐다(progress.md §G). 아래는
  // AC-VISION-007의 행동 쪽 증인 -- 라우터 등록 부재를 grep이 아니라
  // 디스패치 결과로 확인한다.
  describe("dump: 명령 제거 (AC-VISION-007)", () => {
    it.each([[["dump"]], [["dump", "--web"]], [["dump", "--web", "a"]]])(
      "%j는 UNKNOWN_COMMAND로 거부된다 -- 네이티브도 웹도 남아 있지 않다",
      async (argv) => {
        const backend = createMockBackend();

        const result = await runCli(argv as string[], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("UNKNOWN_COMMAND");
      },
    );
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

    it("surfaces an ImeBindTimeoutError as a dedicated IME_BIND_TIMEOUT envelope, ok:false (REQ-INPUT-004 개정 0.3.0, AC-ANDROID-031)", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImeBindTimeoutError("R58N90ABCDE", 5000),
      );

      const result = await runCli(["text", "알림"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IME_BIND_TIMEOUT");
        expect(result.error.details?.["serial"]).toBe("R58N90ABCDE");
      }
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

  // SPEC-VISION-001 M2 (REQ-VISION-002): text의 focus-before-type 셀렉터
  // 경로가 제거됐다. 포커스는 이제 호출자가 스크린샷 좌표로 `tap`을 먼저
  // 보내 만든다(spec.md §C.2). 아래는 제거 회귀 가드다.
  describe("text: 제거된 셀렉터 플래그 (AC-VISION-009)", () => {
    it("text --id는 INVALID_ARGS로 거부되고, 입력도 탭도 일어나지 않는다 -- 조용한 대체 없음", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello", "--id", "et_name"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.inputText).not.toHaveBeenCalled();
      expect(backend.tap).not.toHaveBeenCalled();
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

      const result = await runCli(["doctor"], backend, envServices(doctor));

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

      const result = await runCli(["doctor"], backend, envServices(doctor));

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

      const result = await runCli(["doctor"], backend, envServices(doctor));

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

      const result = await runCli(["doctor"], backend, envServices(doctor));

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

      const result = await runCli(["doctor"], backend, envServices(doctor));

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

      const result = await runCli(["doctor", "--clean"], backend, envServices(doctor));

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

      const result = await runCli(["reset"], backend, envServices(doctor));

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

      const result = await runCli(["reset"], backend, envServices(doctor));

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
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so these pre-existing integration tests are
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const backend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        const doctor = new AdbDoctor(adbExec);

        // A prior non-ASCII `text` call switches this serial's session IME.
        await backend.inputText(serial, "안녕");
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);

        const result = await runCli(["reset"], backend, envServices(doctor));

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
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so these pre-existing integration tests are
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
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

        const result = await runCli(["reset"], registry, envServices(doctor));

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
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so these pre-existing integration tests are
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
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

        const result = await runCli(["reset"], resetProcessBackend, envServices(doctor));

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
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so this pre-existing integration test is
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const backend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeStorePath));
        const doctor = new AdbDoctor(adbExec);

        await backend.inputText(serial, "안녕");

        const result = await runCli(["reset"], backend, envServices(doctor));

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

  describe("doctor/reset platform-branching dispatch (REQ-IOS-DOCTOR-003, AC-IOS-021)", () => {
    it("routes 'doctor' to IdbDoctor's checks (not AdbDoctor.ensureAdbKeyboard) when the resolved target device is platform:ios", async () => {
      const iosDeviceInfo = device({ serial: "00008030-IOS", platform: "ios" });
      const backend = createMockBackend([iosDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const idbDoctor = new IdbDoctor(vi.fn());

      // adb/daemon checks are eager + unconditional (unchanged from
      // SPEC-ANDROID-001) — mock them healthy so the handler reaches the
      // platform-branch decision point.
      vi.spyOn(adbDoctor, "checkAdbInstalled").mockResolvedValue({ installed: true, version: "1.0.41" });
      vi.spyOn(adbDoctor, "checkDaemonHealth").mockResolvedValue({ healthy: true });
      const ensureAdbKeyboardSpy = vi.spyOn(adbDoctor, "ensureAdbKeyboard");

      const checkIdbInstalledSpy = vi
        .spyOn(idbDoctor, "checkIdbInstalled")
        .mockResolvedValue({ installed: true, version: "1.1.8" });
      const checkCompanionSpy = vi.spyOn(idbDoctor, "checkCompanion").mockResolvedValue({ present: true });
      const checkSimulatorBootedSpy = vi
        .spyOn(idbDoctor, "checkSimulatorBooted")
        .mockResolvedValue({ booted: true });

      const result = await runCli(
        ["doctor", "--device", iosDeviceInfo.serial],
        backend,
        envServices(adbDoctor, idbDoctor),
      );

      expect(result.ok).toBe(true);
      expect(checkIdbInstalledSpy).toHaveBeenCalledTimes(1);
      expect(checkCompanionSpy).toHaveBeenCalledTimes(1);
      expect(checkSimulatorBootedSpy).toHaveBeenCalledWith(iosDeviceInfo.serial);
      expect(ensureAdbKeyboardSpy).not.toHaveBeenCalled();
      if (result.ok) {
        const data = result.data as { idbEnvironment?: unknown; adbKeyboard: { skipped: boolean } };
        expect(data.idbEnvironment).toBeDefined();
        expect(data.adbKeyboard.skipped).toBe(true);
      }
    });

    it("routes 'doctor' to AdbDoctor.ensureAdbKeyboard (not IdbDoctor) when the resolved target device is platform:android", async () => {
      const androidDeviceInfo = device({ serial: "R58N90ABCDE", platform: "android" });
      const backend = createMockBackend([androidDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const idbDoctor = new IdbDoctor(vi.fn());

      vi.spyOn(adbDoctor, "checkAdbInstalled").mockResolvedValue({ installed: true, version: "1.0.41" });
      vi.spyOn(adbDoctor, "checkDaemonHealth").mockResolvedValue({ healthy: true });
      const ensureAdbKeyboardSpy = vi
        .spyOn(adbDoctor, "ensureAdbKeyboard")
        .mockResolvedValue({ alreadyInstalled: true, installed: false, enabled: true });
      const checkIdbInstalledSpy = vi.spyOn(idbDoctor, "checkIdbInstalled");

      const result = await runCli(["doctor"], backend, envServices(adbDoctor, idbDoctor));

      expect(result.ok).toBe(true);
      expect(ensureAdbKeyboardSpy).toHaveBeenCalledWith(androidDeviceInfo.serial);
      expect(checkIdbInstalledSpy).not.toHaveBeenCalled();
      if (result.ok) {
        const data = result.data as { adbKeyboard: { skipped: boolean } };
        expect(data.adbKeyboard.skipped).toBe(false);
      }
    });

    it("routes 'reset' to IdbDoctor.resetDevice (near-no-op) for an iOS-platform target, without touching AdbDoctor.resetDevice", async () => {
      const iosDeviceInfo = device({ serial: "00008030-IOS", platform: "ios" });
      const backend = createMockBackend([iosDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const idbDoctor = new IdbDoctor(vi.fn());

      const adbResetSpy = vi.spyOn(adbDoctor, "resetDevice");
      const idbResetSpy = vi.spyOn(idbDoctor, "resetDevice").mockResolvedValue({
        noOp: true,
        message: "iOS has no IME/APK state to clean (idb text input is stateless) — nothing to reset.",
      });

      const result = await runCli(["reset"], backend, envServices(adbDoctor, idbDoctor));

      expect(result.ok).toBe(true);
      expect(idbResetSpy).toHaveBeenCalledWith(iosDeviceInfo.serial);
      expect(adbResetSpy).not.toHaveBeenCalled();
      if (result.ok) {
        const data = result.data as { noOp?: boolean };
        expect(data.noOp).toBe(true);
      }
    });

    it("routes 'reset' to AdbDoctor.resetDevice for an android-platform target (unchanged path), without touching IdbDoctor.resetDevice", async () => {
      const androidDeviceInfo = device({ serial: "R58N90ABCDE", platform: "android" });
      const backend = createMockBackend([androidDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const idbDoctor = new IdbDoctor(vi.fn());

      const adbResetSpy = vi.spyOn(adbDoctor, "resetDevice").mockResolvedValue({
        imeReset: true,
        adbKeyboardDisabled: true,
        adbKeyboardUninstalled: true,
        warnings: [],
      });
      const idbResetSpy = vi.spyOn(idbDoctor, "resetDevice");

      const result = await runCli(["reset"], backend, envServices(adbDoctor, idbDoctor));

      expect(result.ok).toBe(true);
      expect(adbResetSpy).toHaveBeenCalledWith(androidDeviceInfo.serial, undefined);
      expect(idbResetSpy).not.toHaveBeenCalled();
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
