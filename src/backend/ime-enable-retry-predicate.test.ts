import { describe, expect, it } from "vitest";

import { isImeEnableRegistrationRaceFailure } from "./ime-enable-retry-predicate.js";

function result(exitCode: number, stderr: string, stdout = ""): { exitCode: number; stdout: Buffer; stderr: Buffer } {
  return { exitCode, stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.from(stderr, "utf-8") };
}

describe("isImeEnableRegistrationRaceFailure (REQ-INPUT-003 개정 0.3.0 M12 산출물 1)", () => {
  it("matches the exact real-device registration-race fixture (spec.md §C.3-⑫)", () => {
    const r = result(
      255,
      "Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #0",
    );

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(true);
  });

  it("matches when the message is carried on stdout instead of stderr (stream placement is not part of the measured contract)", () => {
    const r = result(255, "", "Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #0");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(true);
  });

  it("matches for a different user id than #0 (the pattern generalizes over the user number)", () => {
    const r = result(255, "Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #10");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(true);
  });

  it("does NOT match a permission-denied failure (AC-ANDROID-034 non-matching example)", () => {
    const r = result(1, "SecurityException: Permission Denial: not allowed to enable input methods");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(false);
  });

  it("does NOT match an incompatible-API-level failure (AC-ANDROID-034 non-matching example)", () => {
    const r = result(1, "Error: unknown command 'enable'");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(false);
  });

  it("does NOT match a device-offline-shaped failure (AC-ANDROID-034 non-matching example)", () => {
    const r = result(1, "error: device offline");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(false);
  });

  it("does NOT match a successful result (exit 0), even if the text happened to be present", () => {
    const r = result(0, "Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #0");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(false);
  });

  it("does NOT match an empty failure with no message at all", () => {
    const r = result(255, "");

    expect(isImeEnableRegistrationRaceFailure(r)).toBe(false);
  });
});
