import { describe, expect, it } from "vitest";

import type { DeviceBackend, DeviceInfo, DevicePlatform } from "./device-backend.js";

describe("DeviceBackend interface (type-level)", () => {
  it("exposes EXACTLY the 11 documented methods — thin/swappable (REQ-IOS-ARCH-005, AC-IOS-026, AC-GEST-008/027, AC-VISION-002 — swipe added SPEC-GESTURE-001 M1, getMinEffectiveSwipeThreshold added M8, getScreenSize added SPEC-VISION-001 M1)", () => {
    // A `Record<keyof DeviceBackend, true>` object literal is a bidirectional
    // exhaustiveness check: TypeScript's excess-property checking on object
    // literals rejects both a missing key (if DeviceBackend grows a 12th
    // method) and an extra key (if this list drifts from the interface).
    // If this file fails to typecheck, the interface surface has changed.
    const methodPresence: Record<keyof DeviceBackend, true> = {
      listDevices: true,
      dumpUiHierarchy: true,
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

    expect(Object.keys(methodPresence)).toHaveLength(11);
  });

  it("DeviceInfo.platform is additive alongside the pre-existing 5 fields (REQ-IOS-SCHEMA-001, AC-IOS-001)", () => {
    const fieldPresence: Record<keyof DeviceInfo, true> = {
      serial: true,
      model: true,
      osVersion: true,
      connectionState: true,
      isEmulator: true,
      platform: true,
    };

    expect(Object.keys(fieldPresence)).toHaveLength(6);
  });

  it("DevicePlatform is exactly the 2-value union android|ios", () => {
    const android: DevicePlatform = "android";
    const ios: DevicePlatform = "ios";
    expect([android, ios]).toEqual(["android", "ios"]);
  });
});
