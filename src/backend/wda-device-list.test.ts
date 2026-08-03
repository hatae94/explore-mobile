import { describe, expect, it, vi } from "vitest";

import { listIosDevices, parseDevicectlDevices } from "./wda-device-list.js";
import type { ProcessExecutor } from "./process-executor.js";

/**
 * 픽스처는 `xcrun devicectl list devices --json-output`의 **실제 출력**에서
 * 왔다 (M3 실측, 2026-08-03, Xcode 26.0, iPhone16,2 + iPad13,8). 손으로 지어낸
 * 형태가 아니므로, 이 테스트가 고정하는 것은 상상한 스키마가 아니라 관측된
 * 스키마다.
 */
const REAL_DEVICECTL_OUTPUT = {
  info: { outcome: "success" },
  result: {
    devices: [
      {
        identifier: "D2C63314-8AA3-5C85-8EFC-0A4B600CB1A1",
        connectionProperties: { tunnelState: "connected", pairingState: "paired", transportType: "wired" },
        deviceProperties: { osVersionNumber: "26.5.2" },
        hardwareProperties: {
          udid: "00008103-000458360A63401E",
          marketingName: "iPad Pro (12.9-inch) (5th generation)",
          productType: "iPad13,8",
        },
      },
      {
        identifier: "DEDABBFA-9696-54A0-A2EE-A6812D9FDFEB",
        connectionProperties: { tunnelState: "connected", pairingState: "paired", transportType: "wired" },
        deviceProperties: { osVersionNumber: "26.5.2" },
        hardwareProperties: {
          udid: "00008130-001238880C13803A",
          marketingName: "iPhone 15 Pro Max",
          productType: "iPhone16,2",
        },
      },
    ],
  },
};

describe("parseDevicectlDevices", () => {
  it("maps the real devicectl JSON shape to DeviceInfo", () => {
    expect(parseDevicectlDevices(REAL_DEVICECTL_OUTPUT)).toEqual([
      {
        serial: "00008103-000458360A63401E",
        model: "iPad Pro (12.9-inch) (5th generation)",
        osVersion: "26.5.2",
        connectionState: "device",
        isEmulator: false,
        platform: "ios",
      },
      {
        serial: "00008130-001238880C13803A",
        model: "iPhone 15 Pro Max",
        osVersion: "26.5.2",
        connectionState: "device",
        isEmulator: false,
        platform: "ios",
      },
    ]);
  });

  /**
   * 이 테스트가 이 파일에서 가장 중요하다. `identifier`(CoreDevice UUID)와
   * `hardwareProperties.udid`는 **다른 값**이며, `iproxy -u` /
   * `xcodebuild -destination`이 쓰는 것은 후자다. 잘못 고르면 CLI가 부르는
   * 이름과 사용자가 WDA를 띄울 때 쓰는 이름이 어긋난다.
   */
  it("serial로 identifier가 아니라 hardwareProperties.udid를 쓴다", () => {
    const parsed = parseDevicectlDevices(REAL_DEVICECTL_OUTPUT);
    expect(parsed.map((d) => d.serial)).not.toContain("DEDABBFA-9696-54A0-A2EE-A6812D9FDFEB");
    expect(parsed.map((d) => d.serial)).toContain("00008130-001238880C13803A");
  });

  it("connected가 아닌 tunnelState는 offline으로 강등한다 (예: 'connected (no DDI)')", () => {
    const parsed = parseDevicectlDevices({
      result: {
        devices: [
          {
            connectionProperties: { tunnelState: "connected (no DDI)" },
            deviceProperties: { osVersionNumber: "26.5.2" },
            hardwareProperties: { udid: "UDID-A", marketingName: "iPad" },
          },
        ],
      },
    });
    expect(parsed[0]?.connectionState).toBe("offline");
  });

  it("udid가 없는 항목은 버린다 — 조작 대상이 될 수 없다", () => {
    const parsed = parseDevicectlDevices({
      result: { devices: [{ identifier: "X", hardwareProperties: { marketingName: "이름만 있음" } }] },
    });
    expect(parsed).toEqual([]);
  });

  it.each([
    ["null", null],
    ["문자열", "not json"],
    ["result 없음", {}],
    ["devices가 배열이 아님", { result: { devices: "nope" } }],
  ])("형태가 어긋난 입력(%s)은 빈 목록으로 강등한다", (_label, input) => {
    expect(parseDevicectlDevices(input)).toEqual([]);
  });
});

describe("listIosDevices", () => {
  it("devicectl에 --json-output 경로를 넘기고 그 파일을 읽는다", async () => {
    // 실제 파일을 쓰게 두고, 우리가 만든 executor가 그 경로에 JSON을 심는다.
    const exec = vi.fn(async (command: string, args: string[]) => {
      expect(command).toBe("xcrun");
      expect(args.slice(0, 4)).toEqual(["devicectl", "list", "devices", "--quiet"]);
      const outPath = args[args.indexOf("--json-output") + 1]!;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, JSON.stringify(REAL_DEVICECTL_OUTPUT), "utf-8");
      return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
    }) satisfies ProcessExecutor;

    const devices = await listIosDevices(exec);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(devices).toHaveLength(2);
    expect(devices[1]?.serial).toBe("00008130-001238880C13803A");
  });

  it("devicectl이 non-zero로 끝나면 빈 목록으로 강등한다 (Android만으로 계속 동작)", async () => {
    const exec: ProcessExecutor = async () => ({
      stdout: Buffer.alloc(0),
      stderr: Buffer.from("xcrun: error"),
      exitCode: 1,
    });
    await expect(listIosDevices(exec)).resolves.toEqual([]);
  });

  it("executor가 throw해도 빈 목록으로 강등한다", async () => {
    const exec: ProcessExecutor = async () => {
      throw new Error("ENOENT");
    };
    await expect(listIosDevices(exec)).resolves.toEqual([]);
  });
});
