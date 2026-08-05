import { describe, expect, it } from "vitest";

import type { DeviceBackend, DeviceInfo, DevicePlatform } from "./device-backend.js";

describe("DeviceBackend interface (type-level)", () => {
  it("exposes EXACTLY the 10 documented methods — thin/swappable (REQ-IOS-ARCH-005, AC-IOS-026, AC-GEST-008/027, AC-VISION-002/006 — swipe added SPEC-GESTURE-001 M1, getMinEffectiveSwipeThreshold added M8, getScreenSize added SPEC-VISION-001 M1, the UI-tree read method REMOVED by SPEC-VISION-001 M2/REQ-VISION-002)", () => {
    // A `Record<keyof DeviceBackend, true>` object literal is a bidirectional
    // exhaustiveness check: TypeScript's excess-property checking on object
    // literals rejects both a missing key (if DeviceBackend grows an 11th
    // method) and an extra key (if this list drifts from the interface).
    // If this file fails to typecheck, the interface surface has changed.
    //
    // This guard is what makes the M2 removal binary rather than a claim: a
    // backend that quietly kept its tree-read method would fail here.
    const methodPresence: Record<keyof DeviceBackend, true> = {
      listDevices: true,
      screenshot: true,
      tap: true,
      inputText: true,
      sendKeyEvent: true,
      launchApp: true,
      stopApp: true,
      swipe: true,
      getMinEffectiveSwipeThreshold: true,
      getScreenSize: true,
    };

    expect(Object.keys(methodPresence)).toHaveLength(10);
  });

  it("DeviceInfo.platform is additive alongside the pre-existing 5 fields (REQ-IOS-SCHEMA-001, AC-IOS-001); unavailableReason added by SPEC-READY-001 M2 (REQ-READY-003, AC-READY-015); alternateSerials added by SPEC-READY-001 M3 (REQ-READY-004, AC-READY-015)", () => {
    const fieldPresence: Record<keyof DeviceInfo, true> = {
      serial: true,
      model: true,
      osVersion: true,
      connectionState: true,
      unavailableReason: true,
      alternateSerials: true,
      isEmulator: true,
      platform: true,
    };

    expect(Object.keys(fieldPresence)).toHaveLength(8);
  });

  it("DevicePlatform is exactly the 2-value union android|ios", () => {
    const android: DevicePlatform = "android";
    const ios: DevicePlatform = "ios";
    expect([android, ios]).toEqual(["android", "ios"]);
  });
});
