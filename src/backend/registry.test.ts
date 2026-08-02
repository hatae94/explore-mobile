import { describe, expect, it, vi } from "vitest";

import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { BackendRegistry, type RegisteredBackend } from "./registry.js";

function androidDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "emulator-5554",
    model: "sdk_gphone64_arm64",
    osVersion: "14",
    connectionState: "device",
    isEmulator: true,
    platform: "android",
    ...overrides,
  };
}

function iosDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "00008030-0011ABCDEF",
    model: "iPhone 15 Simulator",
    osVersion: "17.5",
    connectionState: "device",
    isEmulator: true,
    platform: "ios",
    ...overrides,
  };
}

/** A minimal mock DeviceBackend — only listDevices is exercised by the registry itself. */
function mockBackend(devices: DeviceInfo[]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    dumpUiHierarchy: vi.fn().mockResolvedValue([]),
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

function registeredBackend(platform: "android" | "ios", devices: DeviceInfo[], available = true): RegisteredBackend {
  return {
    platform,
    backend: mockBackend(devices),
    isAvailable: vi.fn().mockResolvedValue(available),
  };
}

describe("BackendRegistry", () => {
  describe("listAllDevices (AC-IOS-007)", () => {
    it("merges devices from every available backend, each already tagged with its own platform", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry = new BackendRegistry([android, ios]);

      const devices = await registry.listAllDevices();

      expect(devices).toEqual([androidDevice(), iosDevice()]);
      expect(devices.map((d) => d.platform)).toEqual(["android", "ios"]);
    });

    it("graceful degradation: an unavailable backend contributes 0 devices and no error (AC-IOS-009)", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()], false); // idb not installed
      const registry = new BackendRegistry([android, ios]);

      const devices = await registry.listAllDevices();

      expect(devices).toEqual([androidDevice()]);
      expect(ios.backend.listDevices).not.toHaveBeenCalled();
    });

    it("graceful degradation is symmetric: adb unavailable leaves only iOS devices listed", async () => {
      const android = registeredBackend("android", [androidDevice()], false);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry = new BackendRegistry([android, ios]);

      const devices = await registry.listAllDevices();

      expect(devices).toEqual([iosDevice()]);
    });

    it("degrades a backend that throws while listing to 0 devices from that backend, without failing the whole call", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const brokenIos: RegisteredBackend = {
        platform: "ios",
        backend: {
          ...mockBackend([]),
          listDevices: vi.fn().mockRejectedValue(new Error("idb_companion not running")),
        },
        isAvailable: vi.fn().mockResolvedValue(true),
      };
      const registry = new BackendRegistry([android, brokenIos]);

      const devices = await registry.listAllDevices();

      expect(devices).toEqual([androidDevice()]);
    });

    it("returns an empty list with no error when no backend is available", async () => {
      const android = registeredBackend("android", [androidDevice()], false);
      const ios = registeredBackend("ios", [iosDevice()], false);
      const registry = new BackendRegistry([android, ios]);

      await expect(registry.listAllDevices()).resolves.toEqual([]);
    });
  });

  describe("resolveBackend (AC-IOS-008)", () => {
    it("routes a serial to its owning backend without the caller specifying a platform", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry = new BackendRegistry([android, ios]);

      const resolved = await registry.resolveBackend(iosDevice().serial);

      expect(resolved).not.toBeNull();
      expect(resolved?.backend).toBe(ios.backend);
      expect(resolved?.device.platform).toBe("ios");
    });

    it("routes an Android serial to the Android backend (symmetric)", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry = new BackendRegistry([android, ios]);

      const resolved = await registry.resolveBackend(androidDevice().serial);

      expect(resolved?.backend).toBe(android.backend);
      expect(resolved?.device.platform).toBe("android");
    });

    it("returns null when no device matches the given serial", async () => {
      const registry = new BackendRegistry([registeredBackend("android", [androidDevice()])]);

      await expect(registry.resolveBackend("does-not-exist")).resolves.toBeNull();
    });

    it("refuses to arbitrarily pick a backend on a serial collision across platforms — returns null (design.md §C.3)", async () => {
      const collidingSerial = "COLLIDE-0001";
      const android = registeredBackend("android", [androidDevice({ serial: collidingSerial })]);
      const ios = registeredBackend("ios", [iosDevice({ serial: collidingSerial })]);
      const registry = new BackendRegistry([android, ios]);

      await expect(registry.resolveBackend(collidingSerial)).resolves.toBeNull();
    });
  });

  describe("DeviceBackend facade (registry-as-backend adapter, design.md §C.4)", () => {
    it("listDevices() delegates to listAllDevices()", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);

      await expect(registry.listDevices()).resolves.toEqual([androidDevice(), iosDevice()]);
    });

    it("dumpUiHierarchy(serial) routes to the owning backend", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);

      await registry.dumpUiHierarchy(iosDevice().serial);

      expect(ios.backend.dumpUiHierarchy).toHaveBeenCalledWith(iosDevice().serial);
      expect(android.backend.dumpUiHierarchy).not.toHaveBeenCalled();
    });

    it("tap(serial, x, y) routes to the owning backend with the exact arguments", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);

      await registry.tap(androidDevice().serial, 10, 20);

      expect(android.backend.tap).toHaveBeenCalledWith(androidDevice().serial, 10, 20);
      expect(ios.backend.tap).not.toHaveBeenCalled();
    });

    it("screenshot/inputText/sendKeyEvent/launchApp/stopApp all route to the owning backend", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);
      const serial = iosDevice().serial;

      await registry.screenshot(serial);
      await registry.inputText(serial, "hello", { hideKeyboardAfter: true });
      await registry.sendKeyEvent(serial, "enter");
      await registry.launchApp(serial, "com.apple.Preferences");
      await registry.stopApp(serial, "com.apple.Preferences");

      expect(ios.backend.screenshot).toHaveBeenCalledWith(serial);
      expect(ios.backend.inputText).toHaveBeenCalledWith(serial, "hello", { hideKeyboardAfter: true });
      expect(ios.backend.sendKeyEvent).toHaveBeenCalledWith(serial, "enter");
      expect(ios.backend.launchApp).toHaveBeenCalledWith(serial, "com.apple.Preferences");
      expect(ios.backend.stopApp).toHaveBeenCalledWith(serial, "com.apple.Preferences");
    });

    it("throws (surfacing as BACKEND_COMMAND_FAILED at the CLI layer) when no backend owns the serial", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android]);

      await expect(registry.tap("does-not-exist", 1, 1)).rejects.toThrow(/No backend owns/);
    });

    it("swipe(serial, from, to, options) routes to the owning backend with the exact arguments (SPEC-GESTURE-001 M1, resolve-then-delegate like stopApp)", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);

      await registry.swipe(iosDevice().serial, { x: 100, y: 800 }, { x: 100, y: 200 }, { durationMs: 500 });

      expect(ios.backend.swipe).toHaveBeenCalledWith(
        iosDevice().serial,
        { x: 100, y: 800 },
        { x: 100, y: 200 },
        { durationMs: 500 },
      );
      expect(android.backend.swipe).not.toHaveBeenCalled();
    });

    it("getMinEffectiveSwipeThreshold(serial) routes to the owning backend (SPEC-GESTURE-001 M8, resolve-then-delegate like swipe/stopApp)", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);

      const threshold = await registry.getMinEffectiveSwipeThreshold(iosDevice().serial);

      expect(ios.backend.getMinEffectiveSwipeThreshold).toHaveBeenCalledWith(iosDevice().serial);
      expect(android.backend.getMinEffectiveSwipeThreshold).not.toHaveBeenCalled();
      expect(threshold).toEqual({ minEffectiveSwipePx: 11, basis: "measured-constant" });
    });

    it("getScreenSize(serial) routes to the owning backend (SPEC-VISION-001 M1, resolve-then-delegate like getMinEffectiveSwipeThreshold/swipe)", async () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry: DeviceBackend = new BackendRegistry([android, ios]);

      const size = await registry.getScreenSize(iosDevice().serial);

      expect(ios.backend.getScreenSize).toHaveBeenCalledWith(iosDevice().serial);
      expect(android.backend.getScreenSize).not.toHaveBeenCalled();
      expect(size).toEqual({ width: 1080, height: 1920 });
    });
  });
});
