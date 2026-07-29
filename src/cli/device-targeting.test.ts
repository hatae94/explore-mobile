import { describe, expect, it } from "vitest";

import type { DeviceConnectionState, DeviceInfo, DevicePlatform } from "../schema/device-backend.js";
import { resolveTargetDevice } from "./device-targeting.js";

function device(
  serial: string,
  platform: DevicePlatform = "android",
  connectionState: DeviceConnectionState = "device",
): DeviceInfo {
  return { serial, model: "m", osVersion: "14", connectionState, isEmulator: false, platform };
}

/**
 * Fixture mirroring the real distribution observed on a macOS host with
 * Xcode installed (spec.md §C.4-⑳): every un-booted iOS simulator Xcode
 * registers shows up as an `offline` entry alongside the genuinely
 * connected devices. `offlineCount` offline iOS simulators are appended to
 * `connected`.
 */
function withOfflineSimulators(connected: DeviceInfo[], offlineCount: number): DeviceInfo[] {
  const offline = Array.from({ length: offlineCount }, (_, i) => device(`sim-offline-${i}`, "ios", "offline"));
  return [...connected, ...offline];
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

  it("returns a graceful cross-platform AMBIGUOUS_DEVICE error (platform-tagged device list) when an Android + an iOS device are both connected and --device is omitted (REQ-IOS-ARCH-004)", () => {
    const devices = [device("R58N90ABCDE", "android"), device("00008030-ABCDEF", "ios")];

    const result = resolveTargetDevice(devices, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AMBIGUOUS_DEVICE");
      const listed = result.details?.["availableDevices"] as DeviceInfo[];
      expect(listed.map((d) => d.platform)).toEqual(["android", "ios"]);
    }
  });

  // ── 개정 0.4.0 — M13: "연결(connected)"의 정의 (REQ-MULTIDEV-001/002) ──
  //
  // connectionState !== "device" (offline/unauthorized) entries can appear
  // in the raw list — every un-booted iOS simulator Xcode registers is one
  // of these — but they are never targetable. AC-ANDROID-041~045.

  it("counts and messages only connected devices, excluding offline entries (AC-ANDROID-041 — real 23-entry shape: 2 connected + 21 offline)", () => {
    const devices = withOfflineSimulators(
      [device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android"), device("D0B3A18C-E485-4E7C-A25E-504BF4CA6163", "ios")],
      21,
    );
    expect(devices).toHaveLength(23);

    const result = resolveTargetDevice(devices, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AMBIGUOUS_DEVICE");
      // Pre-0.4.0 this asserted "23 devices connected" — a false claim,
      // since only 2 of the 23 listed entries were actually connected.
      expect(result.message).toBe("2 devices connected; specify --device <serial>.");
      expect(result.message).not.toMatch(/23/);
    }
  });

  it("auto-selects the sole connected device regardless of how many disconnected entries are also listed (AC-ANDROID-042 — documented-auto-select reachability recovery)", () => {
    const devices = withOfflineSimulators([device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android")], 22);
    expect(devices).toHaveLength(23);

    const result = resolveTargetDevice(devices, undefined);

    // Pre-0.4.0 this branch was unreachable on any Mac with Xcode, because
    // the raw list length (23) was never 1 — the documented "auto-select
    // when exactly one device is connected" behavior never fired.
    expect(result).toEqual({ ok: true, serial: "adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp" });
  });

  it("returns NO_DEVICE (not a false-count AMBIGUOUS_DEVICE) when 0 devices are connected but disconnected entries exist, and says so in the message", () => {
    const devices = withOfflineSimulators([], 5);

    const result = resolveTargetDevice(devices, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_DEVICE");
      expect(result.message).toMatch(/5/);
    }
  });

  it("returns DEVICE_NOT_CONNECTED (not DEVICE_NOT_FOUND) when the requested serial exists in the list but is not connected (AC-ANDROID-043)", () => {
    const devices = withOfflineSimulators([device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android")], 3);
    const offlineSerial = "sim-offline-1";

    const result = resolveTargetDevice(devices, offlineSerial);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DEVICE_NOT_CONNECTED");
      expect(result.code).not.toBe("DEVICE_NOT_FOUND");
      expect(result.message).toMatch(/offline/);
      expect(result.details?.["connectionState"]).toBe("offline");
      expect(result.details?.["requestedSerial"]).toBe(offlineSerial);
    }
  });

  it("still returns DEVICE_NOT_FOUND (not DEVICE_NOT_CONNECTED) for a serial absent from the list entirely, even amid disconnected entries (control — AC-ANDROID-043 non-regression)", () => {
    const devices = withOfflineSimulators([device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android")], 3);

    const result = resolveTargetDevice(devices, "totally-unknown-serial");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DEVICE_NOT_FOUND");
    }
  });

  it("treats connectionState 'unauthorized' as not connected, same as 'offline' (REQ-MULTIDEV-001 definition)", () => {
    const unauthorizedSerial = "unauthorized-device-1";
    const devices = [
      device("connected-1", "android"),
      device(unauthorizedSerial, "android", "unauthorized"),
    ];

    const requested = resolveTargetDevice(devices, unauthorizedSerial);
    expect(requested.ok).toBe(false);
    if (!requested.ok) {
      expect(requested.code).toBe("DEVICE_NOT_CONNECTED");
      expect(requested.details?.["connectionState"]).toBe("unauthorized");
    }

    // Omitted --device: the unauthorized entry must not count toward
    // ambiguity or be auto-selected — exactly 1 connected device remains.
    const omitted = resolveTargetDevice(devices, undefined);
    expect(omitted).toEqual({ ok: true, serial: "connected-1" });
  });

  it("lists only connected devices in details.availableDevices and never dumps disconnected entries wholesale (AC-ANDROID-044)", () => {
    const devices = withOfflineSimulators(
      [device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android"), device("D0B3A18C-E485-4E7C-A25E-504BF4CA6163", "ios")],
      21,
    );

    const result = resolveTargetDevice(devices, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const listed = result.details?.["availableDevices"] as DeviceInfo[];
      expect(listed).toHaveLength(2);
      expect(listed.every((d) => d.connectionState === "device")).toBe(true);
      // The 21 disconnected entries are summarized by count only, never
      // dumped as full DeviceInfo objects into the error details.
      expect(JSON.stringify(result.details)).not.toContain("sim-offline-");
    }
  });
});
