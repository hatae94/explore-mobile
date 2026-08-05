import { describe, expect, it, vi } from "vitest";

import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { BackendRegistry, type RegisteredBackend } from "./registry.js";

function androidDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "emulator-5554",
    model: "sdk_gphone64_arm64",
    osVersion: "14",
    connectionState: "device",
    unavailableReason: null,
    alternateSerials: [],
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
    unavailableReason: null,
    alternateSerials: [],
    isEmulator: true,
    platform: "ios",
    ...overrides,
  };
}

/** A minimal mock DeviceBackend — only listDevices is exercised by the registry itself. */
function mockBackend(devices: DeviceInfo[]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
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
      const ios = registeredBackend("ios", [iosDevice()], false); // iOS toolchain unavailable
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
          listDevices: vi.fn().mockRejectedValue(new Error("device tunnel not running")),
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

  describe("backendFor — 열거 없이 소유 백엔드를 돌려준다 (SPEC-VISION-001 M5)", () => {
    // M5 이전에는 `DeviceBackend` facade가 per-serial 메서드마다 소유
    // 백엔드를 다시 찾았고, 그 재조회가 명령당 두 번째 기기 열거를 만들었다.
    // facade는 제거됐고, 같은 라우팅 보장이 아래 동기 조회로 옮겨 왔다.
    it("기기의 platform에 맞는 백엔드를 돌려준다", () => {
      const android = registeredBackend("android", [androidDevice()]);
      const ios = registeredBackend("ios", [iosDevice()]);
      const registry = new BackendRegistry([android, ios]);

      expect(registry.backendFor(androidDevice())).toBe(android.backend);
      expect(registry.backendFor(iosDevice())).toBe(ios.backend);
    });

    it("조회 자체가 기기를 열거하지 않는다 — 이것이 M5가 없앤 중복의 발생원이었다", () => {
      const android = registeredBackend("android", [androidDevice()]);
      const registry = new BackendRegistry([android]);

      registry.backendFor(androidDevice());

      expect(android.backend.listDevices).not.toHaveBeenCalled();
      expect(android.isAvailable).not.toHaveBeenCalled();
    });

    it("해당 platform의 백엔드가 등록돼 있지 않으면 undefined — 임의 대체를 하지 않는다", () => {
      const android = registeredBackend("android", [androidDevice()]);
      const registry = new BackendRegistry([android]);

      expect(registry.backendFor(iosDevice())).toBeUndefined();
    });
  });
});
