import { describe, expect, it } from "vitest";

import type { DeviceInfo } from "../schema/device-backend.js";
import { resolveTargetDevice } from "./device-targeting.js";

function device(serial: string): DeviceInfo {
  return { serial, model: "m", osVersion: "14", connectionState: "device", isEmulator: false };
}

describe("resolveTargetDevice", () => {
  it("selects the sole device automatically when --device is omitted and exactly 1 is connected", () => {
    const result = resolveTargetDevice([device("A")], undefined);

    expect(result).toEqual({ ok: true, serial: "A" });
  });

  it("returns a graceful NO_DEVICE error when 0 devices are connected (acceptance.md §D.1)", () => {
    const result = resolveTargetDevice([], undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_DEVICE");
    }
  });

  it("returns a graceful AMBIGUOUS_DEVICE error + device list when >1 devices connected and --device is omitted (REQ-MULTIDEV-002, AC-ANDROID-009)", () => {
    const devices = [device("A"), device("B")];

    const result = resolveTargetDevice(devices, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AMBIGUOUS_DEVICE");
      expect(result.details?.["availableDevices"]).toEqual(devices);
    }
  });

  it("selects the requested serial when --device matches a connected device", () => {
    const devices = [device("A"), device("B")];

    const result = resolveTargetDevice(devices, "B");

    expect(result).toEqual({ ok: true, serial: "B" });
  });

  it("returns a graceful DEVICE_NOT_FOUND error + device list when --device does not match any connected device", () => {
    const devices = [device("A")];

    const result = resolveTargetDevice(devices, "does-not-exist");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DEVICE_NOT_FOUND");
      expect(result.details?.["availableDevices"]).toEqual(devices);
    }
  });
});
