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

  // SPEC-ANDROID-002: 무선 mDNS 이름이 충돌하면 adb가 " (2)"를 붙여 serial 안에
  // 공백이 생긴다. 아래 두 픽스처는 2026-08-03 실기기(SM-S938N) `od -c` 관측을
  // 그대로 옮긴 것이다 — `-l`에는 탭이 없고 공백 1개로만 구분된다.
  it("keeps a space-containing serial intact and reads the real state (SPEC-ANDROID-002, `-l` form)", () => {
    const raw = [
      "List of devices attached",
      "192.168.219.106:36807  device product:pa3qksx model:SM_S938N device:pa3q transport_id:124",
      "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp device product:pa3qksx model:SM_S938N device:pa3q transport_id:125",
    ].join("\n");

    const result = parseAdbDevicesList(raw);

    expect(result).toEqual([
      {
        serial: "192.168.219.106:36807",
        state: "device",
        model: "SM_S938N",
        isEmulator: false,
      },
      {
        // 공백을 포함한 채 온전히 보존돼야 한다 — 잘리면 기기가 offline로 오인된다.
        serial: "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp",
        state: "device",
        // 부가 필드의 `device:pa3q`를 상태로 오인하지 않아야 `model:`도 옳게 읽힌다.
        model: "SM_S938N",
        isEmulator: false,
      },
    ]);
  });

  it("parses the tab-separated form (`adb devices`, no -l) with the same rule (SPEC-ANDROID-002)", () => {
    const raw = [
      "List of devices attached",
      "192.168.219.106:36807\tdevice",
      "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp\tdevice",
    ].join("\n");

    const result = parseAdbDevicesList(raw);

    expect(result).toEqual([
      { serial: "192.168.219.106:36807", state: "device", model: "", isEmulator: false },
      {
        serial: "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp",
        state: "device",
        model: "",
        isEmulator: false,
      },
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
