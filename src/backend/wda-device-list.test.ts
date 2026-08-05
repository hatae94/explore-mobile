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
        unavailableReason: null,
        alternateSerials: [],
        isEmulator: false,
        platform: "ios",
      },
      {
        serial: "00008130-001238880C13803A",
        model: "iPhone 15 Pro Max",
        osVersion: "26.5.2",
        connectionState: "device",
        unavailableReason: null,
        alternateSerials: [],
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

  /**
   * SPEC-READY-001 REQ-READY-003 (AC-READY-006/007/008/016) — `tunnelState`가
   * `"connected"`가 아니지만 **존재하면** `offline`이 아니라 `unavailable`로
   * 승격되고, 관측된 원문을 포함한 `unavailableReason`이 함께 실린다. 이전에는
   * `"connected (no DDI)"`를 포함한 이 모든 값이 `offline`(미연결)으로
   * 접혔다 — "준비 안 됨"과 "미연결"을 구별하지 못하는 결함이었다(spec.md
   * §A.1 ②).
   */
  describe("SPEC-READY-001 — unavailable 상태 + 사유 (AC-READY-006/007/008/016)", () => {
    function withTunnelState(tunnelState: unknown) {
      return parseDevicectlDevices({
        result: {
          devices: [
            {
              connectionProperties: { tunnelState },
              deviceProperties: { osVersionNumber: "26.5.2" },
              hardwareProperties: { udid: "UDID-A", marketingName: "iPad" },
            },
          ],
        },
      });
    }

    it("AC-READY-006 — 대표 픽스처 'disconnected'는 unavailable + 매핑표 안내가 실린 사유로 보고된다", () => {
      const parsed = withTunnelState("disconnected");
      expect(parsed[0]?.connectionState).toBe("unavailable");
      expect(parsed[0]?.unavailableReason).toContain("disconnected");
      expect(parsed[0]?.unavailableReason).toBe(
        "disconnected — 터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다",
      );
    });

    /**
     * 이름 충돌 주의(spec.md §C.1-② 3번): 이 원본 `tunnelState` 값
     * `"unavailable"`은 `connectionState`의 값 `"unavailable"`과 글자만
     * 같고 다른 축이다 — 별도 상수로 취급하며 서로 공유하지 않는다.
     */
    it("AC-READY-006 — 부가 케이스 'unavailable'(원본 tunnelState 값)도 unavailable + 매핑표 안내로 보고된다", () => {
      const RAW_TUNNEL_STATE_UNAVAILABLE = "unavailable";
      const parsed = withTunnelState(RAW_TUNNEL_STATE_UNAVAILABLE);
      expect(parsed[0]?.connectionState).toBe("unavailable");
      expect(parsed[0]?.unavailableReason).toContain(RAW_TUNNEL_STATE_UNAVAILABLE);
      expect(parsed[0]?.unavailableReason).toBe(
        "unavailable — 터널을 쓸 수 없다 — 기기 잠금 해제 후 WDA를 다시 띄운다",
      );
    });

    it("AC-READY-006 — 'connected (no DDI)'도 unavailable + 매핑표 안내로 보고된다", () => {
      const parsed = withTunnelState("connected (no DDI)");
      expect(parsed[0]?.connectionState).toBe("unavailable");
      expect(parsed[0]?.unavailableReason).toBe(
        "connected (no DDI) — 개발자 디스크 이미지가 안 올라왔다 — 이미지 마운트가 필요하다",
      );
    });

    it("AC-READY-006 규칙 2 — 매핑표에 없는 값은 원문만 싣고 안내를 지어내지 않는다", () => {
      const parsed = withTunnelState("pairing (some future value)");
      expect(parsed[0]?.connectionState).toBe("unavailable");
      expect(parsed[0]?.unavailableReason).toBe("pairing (some future value)");
    });

    it("AC-READY-007 — connectionProperties 자체가 없으면 offline이고 unavailableReason은 null이다", () => {
      const parsed = parseDevicectlDevices({
        result: {
          devices: [
            {
              deviceProperties: { osVersionNumber: "26.5.2" },
              hardwareProperties: { udid: "UDID-A", marketingName: "iPad" },
            },
          ],
        },
      });
      expect(parsed[0]?.connectionState).toBe("offline");
      expect(parsed[0]?.unavailableReason).toBeNull();
    });

    it("AC-READY-007 — tunnelState가 없으면(connectionProperties는 있음) offline이고 unavailableReason은 null이다", () => {
      const parsed = parseDevicectlDevices({
        result: {
          devices: [
            {
              connectionProperties: {},
              deviceProperties: { osVersionNumber: "26.5.2" },
              hardwareProperties: { udid: "UDID-A", marketingName: "iPad" },
            },
          ],
        },
      });
      expect(parsed[0]?.connectionState).toBe("offline");
      expect(parsed[0]?.unavailableReason).toBeNull();
    });

    it("AC-READY-008/016 — 'connected'는 여전히 device이고 unavailableReason은 null이다 (의미 불변)", () => {
      const parsed = withTunnelState("connected");
      expect(parsed[0]?.connectionState).toBe("device");
      expect(parsed[0]?.unavailableReason).toBeNull();
    });

    it("AC-READY-009 — 네 상태(device/offline/unavailable + AdbBackend의 unauthorized) 모두 같은 키 집합을 갖는다", async () => {
      const device = withTunnelState("connected")[0]!;
      const offline = withTunnelState(undefined)[0]!;
      const unavailable = withTunnelState("disconnected")[0]!;
      expect(Object.keys(device).sort()).toEqual(Object.keys(offline).sort());
      expect(Object.keys(device).sort()).toEqual(Object.keys(unavailable).sort());

      // 네 번째 상태 `unauthorized`는 parseDevicectlDevices()가 아니라
      // AdbBackend.listDevices()가 만든다(plan.md §A.1 표) — 서로 다른 두
      // 생산 함수의 산출물을 실제로 호출해 비교한다(1차 감사 D4: 손으로
      // 만든 리터럴 비교는 이 AC를 만족하지 않는다).
      const exec = vi.fn().mockResolvedValueOnce({
        stdout: Buffer.from("List of devices attached\nR58N90ABCDE             unauthorized\n", "utf-8"),
        stderr: Buffer.alloc(0),
        exitCode: 0,
      });
      const { AdbBackend } = await import("./adb-backend.js");
      const backend = new AdbBackend(exec);
      const [unauthorized] = await backend.listDevices();
      expect(Object.keys(device).sort()).toEqual(Object.keys(unauthorized!).sort());
    });
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
