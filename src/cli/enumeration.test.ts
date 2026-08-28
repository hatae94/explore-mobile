/**
 * 기기 열거 1회 보장 (SPEC-VISION-001 M5, REQ-VISION-005).
 *
 * 명령 1회당 백엔드의 `listDevices()`가 **정확히 1회** 호출되는지 센다.
 * M5 이전 구조는 2회 호출한다 — 핸들러가 대상 해석을 위해 1회, 그 뒤
 * `BackendRegistry`의 `DeviceBackend` facade가 소유 백엔드를 다시 찾느라
 * 1회(design.md §D.1).
 *
 * **이 테스트가 mock으로 유효한 이유**: `acceptance.md`의 mock 한계 원칙은
 * "외부 CLI·HTTP의 실제 동작"에 걸린다. 여기서 세는 것은 **내부 제어 흐름**
 * (한 프로세스 안의 메서드 호출 횟수)이므로 그 한계에 걸리지 않는다 —
 * AC-VISION-022가 U 등급을 유효하다고 명시한 드문 항목이다.
 *
 * 실기기 지연 감소(AC-VISION-024)는 별개 축이며 D 등급으로만 닫힌다.
 */

import { describe, expect, it, vi } from "vitest";

import { BackendRegistry, type RegisteredBackend } from "../backend/registry.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import { runCli } from "./router.js";

function androidDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R3CY106LKVX",
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

/** 열거 횟수를 세기 위해 `listDevices`만 스파이로 두는 최소 백엔드. */
function countingBackend(devices: DeviceInfo[]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({
      minEffectiveSwipePx: 11,
      basis: "measured-constant",
    }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1440, height: 3120 }),
    pinch: vi.fn().mockResolvedValue(undefined),
    doubleTap: vi.fn().mockResolvedValue(undefined),
    installApp: vi.fn().mockResolvedValue({ mode: "fresh" }),
  };
}

function registered(platform: "android" | "ios", backend: DeviceBackend): RegisteredBackend {
  return { platform, backend, isAvailable: vi.fn().mockResolvedValue(true) };
}

/** 열거 스파이가 몇 번 불렸는지 센다. */
function enumerationCount(backend: DeviceBackend): number {
  return vi.mocked(backend.listDevices).mock.calls.length;
}

describe("기기 열거 1회 보장 (REQ-VISION-005)", () => {
  describe("AC-VISION-022 — tap 실행 시 listDevices가 정확히 1회", () => {
    it("연결 기기가 1대이고 --device를 생략해도 열거는 1회다", async () => {
      const android = countingBackend([androidDevice()]);
      const registry = new BackendRegistry([registered("android", android)]);

      const result = await runCli(["tap", "100", "200"], registry);

      expect(result.ok).toBe(true);
      expect(enumerationCount(android)).toBe(1);
    });

    it("--device로 시리얼을 명시해도 열거는 1회다", async () => {
      const android = countingBackend([androidDevice()]);
      const registry = new BackendRegistry([registered("android", android)]);

      const result = await runCli(["tap", "100", "200", "--device", "R3CY106LKVX"], registry);

      expect(result.ok).toBe(true);
      expect(enumerationCount(android)).toBe(1);
    });

    it("백엔드가 둘 등록돼 있어도 각 백엔드는 1회씩만 열거된다", async () => {
      const android = countingBackend([androidDevice()]);
      const ios = countingBackend([]);
      const registry = new BackendRegistry([registered("android", android), registered("ios", ios)]);

      const result = await runCli(["tap", "100", "200"], registry);

      expect(result.ok).toBe(true);
      expect(enumerationCount(android)).toBe(1);
      expect(enumerationCount(ios)).toBe(1);
    });
  });

  describe("AC-VISION-023 — 기기를 대상으로 하는 모든 명령에서 열거가 1회", () => {
    /**
     * `devices`를 뺀 모든 명령(= 대상 해석을 수행하는 전부). 인자는 각
     * 명령이 대상 해석 단계까지 도달하기에 충분한 최소값이다.
     *
     * `swipe`는 터치 슬롭(mock 11px)보다 큰 거리를 줘야 `AMOUNT_TOO_SMALL`로
     * 조기 거부되지 않는다.
     */
    const deviceFacingCommands: Array<[name: string, argv: string[]]> = [
      ["launch", ["launch", "com.example.app"]],
      ["stop", ["stop", "com.example.app"]],
      ["screenshot", ["screenshot"]],
      ["tap", ["tap", "100", "200"]],
      ["key", ["key", "home"]],
      ["swipe", ["swipe", "100", "800", "100", "200"]],
      ["scroll", ["scroll", "down"]],
      ["text", ["text", "hello"]],
      ["reset", ["reset"]],
      ["doctor", ["doctor"]],
    ];

    /**
     * `doctor`/`reset`만 쓰는 환경 서비스 스텁. 실제 adb를 건드리지 않으면서
     * 두 명령이 대상 해석 단계를 지나가게 한다.
     */
    function stubEnvServices() {
      return {
        android: {
          checkAdbInstalled: vi.fn().mockResolvedValue({ installed: true, onPath: true, resolvedPath: "/fake/path/adb", version: "test" }),
          checkAaptInstalled: vi.fn().mockResolvedValue({ installed: true, onPath: false, resolvedPath: "/fake/build-tools/36.1.0/aapt2", buildToolsVersion: "36.1.0", isAapt2: true }),
          checkDaemonHealth: vi.fn().mockResolvedValue({ healthy: true }),
          ensureAdbKeyboard: vi.fn().mockResolvedValue({ skipped: true, reason: "stub" }),
          resetDevice: vi.fn().mockResolvedValue({ originalImeRestored: true }),
        },
        ios: {
          resetDevice: vi.fn().mockResolvedValue({}),
        },
      } as unknown as Parameters<typeof runCli>[2];
    }

    it.each(deviceFacingCommands)("%s 실행 시 열거가 정확히 1회다", async (_name, argv) => {
      const android = countingBackend([androidDevice()]);
      const registry = new BackendRegistry([registered("android", android)]);

      await runCli(argv, registry, stubEnvServices());

      expect(enumerationCount(android)).toBe(1);
    });

    it("`devices`는 대상 해석을 하지 않지만 열거는 역시 1회다", async () => {
      const android = countingBackend([androidDevice()]);
      const registry = new BackendRegistry([registered("android", android)]);

      const result = await runCli(["devices"], registry);

      expect(result.ok).toBe(true);
      expect(enumerationCount(android)).toBe(1);
    });
  });

  describe("대상 해석이 실패하면 백엔드 조작이 일어나지 않는다", () => {
    it("연결 기기가 없으면 NO_DEVICE이고 tap은 호출되지 않는다", async () => {
      const android = countingBackend([]);
      const registry = new BackendRegistry([registered("android", android)]);

      const result = await runCli(["tap", "100", "200"], registry);

      expect(result.ok).toBe(false);
      expect(enumerationCount(android)).toBe(1);
      expect(android.tap).not.toHaveBeenCalled();
    });
  });
});
