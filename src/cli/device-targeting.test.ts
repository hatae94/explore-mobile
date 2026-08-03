import { describe, expect, it } from "vitest";

import type { DeviceBackend, DeviceConnectionState, DeviceInfo, DevicePlatform } from "../schema/device-backend.js";
import { resolveTargetDevice, type BackendOwnerLookup } from "./device-targeting.js";

/**
 * 소유 백엔드 조회 스텁 (SPEC-VISION-001 M5). 이 모듈의 관심사는 "어느
 * 기기를 고르는가"이지 백엔드 구현이 아니므로, 어떤 기기에도 같은 자리
 * 표시자를 돌려준다. 조회가 실패하는 경로(등록되지 않은 플랫폼)는 아래
 * 별도 describe에서 다룬다.
 */
const stubBackend = {} as DeviceBackend;
const lookup: BackendOwnerLookup = { backendFor: () => stubBackend };

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
    const result = resolveTargetDevice([device("A")], undefined, lookup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.serial).toBe("A");
      // M5: 해석 결과가 기기와 소유 백엔드를 함께 싣는다.
      expect(result.device.serial).toBe("A");
      expect(result.backend).toBe(stubBackend);
    }
  });

  it("returns a graceful NO_DEVICE error when 0 devices are connected (acceptance.md §D.1)", () => {
    const result = resolveTargetDevice([], undefined, lookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_DEVICE");
    }
  });

  it("returns a graceful AMBIGUOUS_DEVICE error + device list when >1 devices connected and --device is omitted (REQ-MULTIDEV-002, AC-ANDROID-009)", () => {
    const devices = [device("A"), device("B")];

    const result = resolveTargetDevice(devices, undefined, lookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AMBIGUOUS_DEVICE");
      expect(result.details?.["availableDevices"]).toEqual(devices);
    }
  });

  it("selects the requested serial when --device matches a connected device", () => {
    const devices = [device("A"), device("B")];

    const result = resolveTargetDevice(devices, "B", lookup);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.serial).toBe("B");
  });

  it("returns a graceful DEVICE_NOT_FOUND error + device list when --device does not match any connected device", () => {
    const devices = [device("A")];

    const result = resolveTargetDevice(devices, "does-not-exist", lookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DEVICE_NOT_FOUND");
      expect(result.details?.["availableDevices"]).toEqual(devices);
    }
  });

  it("returns a graceful cross-platform AMBIGUOUS_DEVICE error (platform-tagged device list) when an Android + an iOS device are both connected and --device is omitted (REQ-IOS-ARCH-004)", () => {
    const devices = [device("R58N90ABCDE", "android"), device("00008030-ABCDEF", "ios")];

    const result = resolveTargetDevice(devices, undefined, lookup);

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

    const result = resolveTargetDevice(devices, undefined, lookup);

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

    const result = resolveTargetDevice(devices, undefined, lookup);

    // Pre-0.4.0 this branch was unreachable on any Mac with Xcode, because
    // the raw list length (23) was never 1 — the documented "auto-select
    // when exactly one device is connected" behavior never fired.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.serial).toBe("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp");
  });

  it("returns NO_DEVICE (not a false-count AMBIGUOUS_DEVICE) when 0 devices are connected but disconnected entries exist, and says so in the message", () => {
    const devices = withOfflineSimulators([], 5);

    const result = resolveTargetDevice(devices, undefined, lookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_DEVICE");
      expect(result.message).toMatch(/5/);
    }
  });

  it("returns DEVICE_NOT_CONNECTED (not DEVICE_NOT_FOUND) when the requested serial exists in the list but is not connected (AC-ANDROID-043)", () => {
    const devices = withOfflineSimulators([device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android")], 3);
    const offlineSerial = "sim-offline-1";

    const result = resolveTargetDevice(devices, offlineSerial, lookup);

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

    const result = resolveTargetDevice(devices, "totally-unknown-serial", lookup);

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

    const requested = resolveTargetDevice(devices, unauthorizedSerial, lookup);
    expect(requested.ok).toBe(false);
    if (!requested.ok) {
      expect(requested.code).toBe("DEVICE_NOT_CONNECTED");
      expect(requested.details?.["connectionState"]).toBe("unauthorized");
    }

    // Omitted --device: the unauthorized entry must not count toward
    // ambiguity or be auto-selected — exactly 1 connected device remains.
    const omitted = resolveTargetDevice(devices, undefined, lookup);
    expect(omitted.ok).toBe(true);
    if (omitted.ok) expect(omitted.serial).toBe("connected-1");
  });

  it("lists only connected devices in details.availableDevices and never dumps disconnected entries wholesale (AC-ANDROID-044)", () => {
    const devices = withOfflineSimulators(
      [device("adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp", "android"), device("D0B3A18C-E485-4E7C-A25E-504BF4CA6163", "ios")],
      21,
    );

    const result = resolveTargetDevice(devices, undefined, lookup);

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

// ── SPEC-VISION-001 M5 — 소유 백엔드 확정 (REQ-VISION-005) ──
//
// M5 이전에는 `BackendRegistry`의 `DeviceBackend` facade가 소유 백엔드를
// 다시 찾으면서 두 안전장치를 함께 수행했다. facade가 제거되므로 두 검사도
// 이 단계로 옮겨 왔다 — 옮기지 않았다면 조용히 잘못된 백엔드로 라우팅됐다.
describe("resolveTargetDevice — 소유 백엔드 확정 (M5)", () => {
  it("같은 serial이 둘 이상이면 임의로 고르지 않고 거부한다 (design.md §C.3 충돌 정책)", () => {
    // adb serial과 iOS UDID가 우연히 겹치는 희귀 상황.
    const devices = [device("COLLIDING", "android"), device("COLLIDING", "ios")];

    const result = resolveTargetDevice(devices, "COLLIDING", lookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // facade가 throw하던 것과 같은 코드·문구를 유지한다 — 검출 시점만
      // 앞당겼을 뿐 사용자가 보는 계약은 그대로다.
      expect(result.code).toBe("BACKEND_COMMAND_FAILED");
      expect(result.message).toBe("No backend owns device serial 'COLLIDING'.");
      expect(result.details?.["collidingEntries"]).toBe(2);
    }
  });

  it("소유 백엔드가 등록돼 있지 않으면 거부한다 — 아무 백엔드로나 보내지 않는다", () => {
    const emptyLookup: BackendOwnerLookup = { backendFor: () => undefined };

    const result = resolveTargetDevice([device("A")], undefined, emptyLookup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BACKEND_COMMAND_FAILED");
      expect(result.message).toBe("No backend owns device serial 'A'.");
    }
  });

  it("연결 상태가 아닌 기기는 소유 백엔드를 조회하기 전에 거부된다", () => {
    let looked = 0;
    const countingLookup: BackendOwnerLookup = {
      backendFor: () => {
        looked += 1;
        return stubBackend;
      },
    };
    const devices = [device("A", "android", "offline")];

    const result = resolveTargetDevice(devices, "A", countingLookup);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DEVICE_NOT_CONNECTED");
    expect(looked).toBe(0);
  });
});
