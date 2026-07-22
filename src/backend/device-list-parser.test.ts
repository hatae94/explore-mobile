import { describe, expect, it } from "vitest";

import { parseAdbDevicesList } from "./device-list-parser.js";

describe("parseAdbDevicesList", () => {
  it("parses connected devices with model, distinguishing emulator vs physical by serial prefix (REQ-DEVICES-001/002)", () => {
    const raw = [
      "List of devices attached",
      "emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1",
      "R58N90ABCDE             device usb:1-1 product:o1s model:Pixel_7 device:panther transport_id:2",
      "",
    ].join("\n");

    const result = parseAdbDevicesList(raw);

    expect(result).toEqual([
      { serial: "emulator-5554", state: "device", model: "sdk_gphone64_arm64", isEmulator: true },
      { serial: "R58N90ABCDE", state: "device", model: "Pixel_7", isEmulator: false },
    ]);
  });

  it("parses offline and unauthorized devices without a model (REQ-ERR-003 upstream data)", () => {
    const raw = [
      "List of devices attached",
      "1234567890ABCDEF        offline",
      "ZY3222FGXK              unauthorized usb:1-1 product:beyond1lte model:SM_G973N device:beyond1 transport_id:3",
    ].join("\n");

    const result = parseAdbDevicesList(raw);

    expect(result).toEqual([
      { serial: "1234567890ABCDEF", state: "offline", model: "", isEmulator: false },
      { serial: "ZY3222FGXK", state: "unauthorized", model: "SM_G973N", isEmulator: false },
    ]);
  });

  it("returns an empty array when no devices are connected", () => {
    const raw = "List of devices attached\n\n";

    expect(parseAdbDevicesList(raw)).toEqual([]);
  });

  it("ignores adb server startup banner lines", () => {
    const raw = [
      "* daemon not running; starting now at tcp:5037",
      "* daemon started successfully",
      "List of devices attached",
      "emulator-5556          device product:sdk model:sdk_phone device:generic transport_id:1",
    ].join("\n");

    const result = parseAdbDevicesList(raw);

    expect(result).toEqual([
      { serial: "emulator-5556", state: "device", model: "sdk_phone", isEmulator: true },
    ]);
  });

  it("never throws on empty or malformed input", () => {
    expect(() => parseAdbDevicesList("")).not.toThrow();
    expect(parseAdbDevicesList("")).toEqual([]);
    expect(() => parseAdbDevicesList("garbage\n\t \n")).not.toThrow();
  });

  it("is defensive against non-string input at the runtime boundary (Secured — external process output)", () => {
    // @ts-expect-error intentional runtime-boundary test with invalid types
    expect(parseAdbDevicesList(null)).toEqual([]);
    // @ts-expect-error intentional runtime-boundary test with invalid types
    expect(parseAdbDevicesList(undefined)).toEqual([]);
  });
});
