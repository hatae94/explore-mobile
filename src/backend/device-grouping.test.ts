import { describe, expect, it } from "vitest";

import type { DeviceInfo } from "../schema/device-backend.js";
import { groupDevicesByPhysicalIdentity } from "./device-grouping.js";

function transportEntry(serial: string, overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial,
    model: "SM_S938N",
    osVersion: "16",
    connectionState: "device",
    unavailableReason: null,
    alternateSerials: [],
    isEmulator: false,
    platform: "android",
    ...overrides,
  };
}

describe("groupDevicesByPhysicalIdentity (SPEC-READY-001 §B.4/§B.4.1)", () => {
  // spec.md §C.1-③의 실측 전송 쌍을 그대로 쓴다.
  const IP_TRANSPORT = "192.168.219.106:36807";
  const MDNS_TRANSPORT = "adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp";
  const RO_SERIALNO = "R3CY106LKVX";

  it("AC-READY-010 — 같은 ro.serialno를 가진 두 전송이 항목 1개로 합쳐진다", () => {
    const devices = [transportEntry(IP_TRANSPORT), transportEntry(MDNS_TRANSPORT)];
    const identifiers = new Map([
      [IP_TRANSPORT, RO_SERIALNO],
      [MDNS_TRANSPORT, RO_SERIALNO],
    ]);

    const merged = groupDevicesByPhysicalIdentity(devices, identifiers);

    expect(merged).toHaveLength(1);
    const item = merged[0]!;
    expect([IP_TRANSPORT, MDNS_TRANSPORT]).toContain(item.serial);
    const expectedAlternate = item.serial === IP_TRANSPORT ? MDNS_TRANSPORT : IP_TRANSPORT;
    expect(item.alternateSerials).toEqual([expectedAlternate]);
  });

  it("AC-READY-010 — 사전순으로 앞선 IP 전송이 대표가 된다 (이 쌍에서는 1… < a…)", () => {
    const devices = [transportEntry(IP_TRANSPORT), transportEntry(MDNS_TRANSPORT)];
    const identifiers = new Map([
      [IP_TRANSPORT, RO_SERIALNO],
      [MDNS_TRANSPORT, RO_SERIALNO],
    ]);

    const merged = groupDevicesByPhysicalIdentity(devices, identifiers);

    expect(merged[0]?.serial).toBe(IP_TRANSPORT);
    expect(merged[0]?.alternateSerials).toEqual([MDNS_TRANSPORT]);
  });

  it("AC-READY-011 — 대표 전송 선택은 입력 순서를 뒤집어도 결정적이다", () => {
    const identifiers = new Map([
      [IP_TRANSPORT, RO_SERIALNO],
      [MDNS_TRANSPORT, RO_SERIALNO],
    ]);

    const forward = groupDevicesByPhysicalIdentity(
      [transportEntry(IP_TRANSPORT), transportEntry(MDNS_TRANSPORT)],
      identifiers,
    );
    const reversed = groupDevicesByPhysicalIdentity(
      [transportEntry(MDNS_TRANSPORT), transportEntry(IP_TRANSPORT)],
      identifiers,
    );

    expect(forward[0]?.serial).toBe(reversed[0]?.serial);
    expect(forward[0]?.alternateSerials).toEqual(reversed[0]?.alternateSerials);
  });

  it("AC-READY-012 — ro.serialno 조회에 실패한(식별자 맵에 없는) 전송은 합치지 않는다", () => {
    const FAILED_TRANSPORT = "R58N90ABCDE";
    const devices = [transportEntry(IP_TRANSPORT), transportEntry(FAILED_TRANSPORT)];
    // FAILED_TRANSPORT는 조회 실패(또는 조회 안 함)를 흉내 내어 맵에서 뺀다.
    const identifiers = new Map([[IP_TRANSPORT, RO_SERIALNO]]);

    const merged = groupDevicesByPhysicalIdentity(devices, identifiers);

    expect(merged).toHaveLength(2);
    const ip = merged.find((d) => d.serial === IP_TRANSPORT);
    const failed = merged.find((d) => d.serial === FAILED_TRANSPORT);
    expect(ip?.alternateSerials).toEqual([]);
    expect(failed?.alternateSerials).toEqual([]);
  });

  it("전송이 셋 이상 같은 ro.serialno를 가지면 나머지 전부가 alternateSerials에 실린다", () => {
    const A = "aaaa";
    const B = "bbbb";
    const C = "cccc";
    const identifiers = new Map([
      [A, RO_SERIALNO],
      [B, RO_SERIALNO],
      [C, RO_SERIALNO],
    ]);

    const merged = groupDevicesByPhysicalIdentity(
      [transportEntry(C), transportEntry(A), transportEntry(B)],
      identifiers,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.serial).toBe(A);
    expect(merged[0]?.alternateSerials).toEqual([B, C]);
  });

  it("식별자 맵이 완전히 비어 있으면 어떤 항목도 합쳐지지 않는다", () => {
    const devices = [transportEntry(IP_TRANSPORT), transportEntry(MDNS_TRANSPORT)];

    const merged = groupDevicesByPhysicalIdentity(devices, new Map());

    expect(merged).toHaveLength(2);
    expect(merged.every((d) => d.alternateSerials.length === 0)).toBe(true);
  });

  it("그룹핑은 connectionState를 바꾸지 않는다 — 항목을 합칠 뿐이다", () => {
    const devices = [
      transportEntry(IP_TRANSPORT, { connectionState: "device" }),
      transportEntry(MDNS_TRANSPORT, { connectionState: "device" }),
    ];
    const identifiers = new Map([
      [IP_TRANSPORT, RO_SERIALNO],
      [MDNS_TRANSPORT, RO_SERIALNO],
    ]);

    const merged = groupDevicesByPhysicalIdentity(devices, identifiers);

    expect(merged[0]?.connectionState).toBe("device");
  });
});
