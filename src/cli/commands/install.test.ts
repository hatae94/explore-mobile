/**
 * `installCommand` — SPEC-INSTALL-001 M3, AC-INSTALL-002/003/004/005/021.
 *
 * The device seam is a mock `DeviceBackend`; the metadata extraction is
 * mocked at the `apk-metadata` module boundary so the handler's orchestration
 * (order, error mapping) is tested without a real aapt/adb.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import { installCommand } from "./install.js";
import type { DeviceBackend, DeviceInfo, InstallOutcome } from "../../schema/device-backend.js";
import type { ParsedCommandArgs } from "../args.js";
import type { EnvServices } from "../env-services.js";
import { toDeviceSource } from "../device-targeting.js";
import * as apkMetadata from "../../backend/apk-metadata.js";
import {
  InstallSignatureMismatchError,
  InstallVersionDowngradeError,
  InstallUnsupportedOnIosError,
  InstallFailedError,
} from "../../backend/install-errors.js";

const ENV: EnvServices = {} as EnvServices;

function baseArgs(overrides: Partial<ParsedCommandArgs> = {}): ParsedCommandArgs {
  return {
    positionals: ["/some/app.apk"],
    device: undefined,
    out: undefined,
    yes: false,
    clean: false,
    keepKeyboard: false,
    duration: undefined,
    amount: undefined,
    full: false,
    maxEdge: undefined,
    format: undefined,
    quality: undefined,
    from: undefined,
    staleOk: false,
    ...overrides,
  };
}

function androidDevice(serial = "SERIAL1"): DeviceInfo {
  return {
    serial,
    model: "TestPhone",
    osVersion: "12",
    connectionState: "device",
    unavailableReason: null,
    alternateSerials: [],
    isEmulator: false,
    platform: "android",
  };
}

function mockBackend(overrides: Partial<DeviceBackend> = {}): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue([androidDevice()]),
    screenshot: vi.fn(),
    tap: vi.fn(),
    inputText: vi.fn(),
    sendKeyEvent: vi.fn(),
    launchApp: vi.fn(),
    stopApp: vi.fn(),
    swipe: vi.fn(),
    getMinEffectiveSwipeThreshold: vi.fn(),
    getScreenSize: vi.fn(),
    pinch: vi.fn(),
    doubleTap: vi.fn(),
    installApp: vi.fn<(s: string, a: string, p: string) => Promise<InstallOutcome>>().mockResolvedValue({
      mode: "fresh",
    }),
    ...overrides,
  };
}

const META = { packageName: "com.hatae.moyura", versionCode: "1", versionName: "1.0.0" };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apkMetadata, "extractApkMetadata").mockResolvedValue(META);
});

describe("installCommand", () => {
  it("AC-INSTALL-002: success payload carries serial/package/versionCode/versionName/mode", async () => {
    const backend = mockBackend();
    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);

    expect(result).toMatchObject({
      ok: true,
      command: "install",
      data: {
        serial: "SERIAL1",
        package: "com.hatae.moyura",
        versionCode: "1",
        versionName: "1.0.0",
        mode: "fresh",
      },
    });
    expect(backend.installApp).toHaveBeenCalledWith("SERIAL1", "/some/app.apk", "com.hatae.moyura");
  });

  it("AC-INSTALL-004: no APK path → INVALID_ARGS, and NO device work", async () => {
    const backend = mockBackend();
    const result = await installCommand(baseArgs({ positionals: [] }), toDeviceSource(backend), ENV);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(backend.installApp).not.toHaveBeenCalled();
    expect(backend.listDevices).not.toHaveBeenCalled();
  });

  it("maps ApkNotFoundError → APK_NOT_FOUND without touching the device", async () => {
    vi.spyOn(apkMetadata, "extractApkMetadata").mockRejectedValue(new apkMetadata.ApkNotFoundError("/x.apk"));
    const backend = mockBackend();

    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);

    expect(result).toMatchObject({ ok: false, error: { code: "APK_NOT_FOUND" } });
    expect(backend.installApp).not.toHaveBeenCalled();
    expect(backend.listDevices).not.toHaveBeenCalled();
  });

  it("maps AaptNotFoundError → AAPT_NOT_FOUND", async () => {
    vi.spyOn(apkMetadata, "extractApkMetadata").mockRejectedValue(new apkMetadata.AaptNotFoundError(["/a"]));
    const result = await installCommand(baseArgs(), toDeviceSource(mockBackend()), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "AAPT_NOT_FOUND" } });
  });

  it("maps ApkInvalidError → APK_INVALID", async () => {
    vi.spyOn(apkMetadata, "extractApkMetadata").mockRejectedValue(new apkMetadata.ApkInvalidError("/x", "err"));
    const result = await installCommand(baseArgs(), toDeviceSource(mockBackend()), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "APK_INVALID" } });
  });

  it("AC-INSTALL-005: two devices + no --device → AMBIGUOUS_DEVICE", async () => {
    const backend = mockBackend({
      listDevices: vi.fn().mockResolvedValue([androidDevice("A"), androidDevice("B")]),
    });
    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_DEVICE" } });
    expect(backend.installApp).not.toHaveBeenCalled();
  });

  it("maps a signature mismatch → INSTALL_SIGNATURE_MISMATCH", async () => {
    const backend = mockBackend({
      installApp: vi.fn().mockRejectedValue(new InstallSignatureMismatchError("com.x", "raw")),
    });
    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "INSTALL_SIGNATURE_MISMATCH" } });
  });

  it("maps a downgrade → INSTALL_VERSION_DOWNGRADE", async () => {
    const backend = mockBackend({
      installApp: vi.fn().mockRejectedValue(new InstallVersionDowngradeError("com.x", "raw")),
    });
    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "INSTALL_VERSION_DOWNGRADE" } });
  });

  it("maps an unclassified failure → INSTALL_FAILED with raw preserved", async () => {
    const backend = mockBackend({
      installApp: vi.fn().mockRejectedValue(new InstallFailedError("SOME_RAW_OUTPUT")),
    });
    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "INSTALL_FAILED", details: { raw: "SOME_RAW_OUTPUT" } } });
  });

  it("maps iOS rejection → INSTALL_UNSUPPORTED_ON_IOS", async () => {
    const backend = mockBackend({
      installApp: vi.fn().mockRejectedValue(new InstallUnsupportedOnIosError()),
    });
    const result = await installCommand(baseArgs(), toDeviceSource(backend), ENV);
    expect(result).toMatchObject({ ok: false, error: { code: "INSTALL_UNSUPPORTED_ON_IOS" } });
  });
});
