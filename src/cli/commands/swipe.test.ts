/**
 * `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` command (SPEC-GESTURE-001 M2
 * — REQ-GEST-SWIPE-001~003, REQ-GEST-SWIPE-005; AC-GEST-001~003, AC-GEST-015).
 *
 * Exercises the full CLI dispatch path (`runCli`) with a mocked
 * `DeviceBackend`, matching the pattern `router.test.ts` uses for the other
 * commands — `swipe`'s own file mirrors `web-support.test.ts`'s
 * one-command-per-file convention rather than growing `router.test.ts`
 * further.
 */

import { describe, expect, it, vi } from "vitest";
import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { runCli } from "../router.js";

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R58N90ABCDE",
    model: "Pixel_7",
    osVersion: "14",
    connectionState: "device",
    isEmulator: false,
    platform: "android",
    ...overrides,
  };
}

function createMockBackend(devices: DeviceInfo[] = [device()]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
  };
}

describe("swipe", () => {
  describe("AC-GEST-001 — argv reaches the backend correctly", () => {
    it("calls backend.swipe with from/to points and the resolved serial, no duration when omitted", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "100", "800", "100", "200"], backend);

      expect(result).toEqual({
        ok: true,
        command: "swipe",
        data: { serial: "R58N90ABCDE", from: { x: 100, y: 800 }, to: { x: 100, y: 200 } },
      });
      expect(backend.swipe).toHaveBeenCalledWith("R58N90ABCDE", { x: 100, y: 800 }, { x: 100, y: 200 }, undefined);
    });

    it("resolves --device to the matching serial (REQ-MULTIDEV-001) among multiple connected devices", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["swipe", "1", "2", "3", "4", "--device", "B"], backend);

      expect(result.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledWith("B", { x: 1, y: 2 }, { x: 3, y: 4 }, undefined);
    });
  });

  describe("AC-GEST-002 — --duration ms passthrough + rejection", () => {
    it("passes --duration through verbatim as milliseconds in options.durationMs", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "100", "800", "100", "200", "--duration", "500"], backend);

      expect(result).toEqual({
        ok: true,
        command: "swipe",
        data: {
          serial: "R58N90ABCDE",
          from: { x: 100, y: 800 },
          to: { x: 100, y: 200 },
          durationMs: 500,
        },
      });
      expect(backend.swipe).toHaveBeenCalledWith(
        "R58N90ABCDE",
        { x: 100, y: 800 },
        { x: 100, y: 200 },
        { durationMs: 500 },
      );
    });

    it("omits options entirely when --duration is not given (platform default duration)", async () => {
      const backend = createMockBackend();

      await runCli(["swipe", "1", "2", "3", "4"], backend);

      expect(backend.swipe).toHaveBeenCalledWith("R58N90ABCDE", { x: 1, y: 2 }, { x: 3, y: 4 }, undefined);
    });

    it("rejects a non-numeric --duration with INVALID_DURATION and sends zero gestures (REQ-GEST-SWIPE-005)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "1", "2", "3", "4", "--duration", "abc"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_DURATION");
        expect(result.error.details?.["received"]).toBe("abc");
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("rejects an empty-string --duration with INVALID_DURATION and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "1", "2", "3", "4", "--duration", ""], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_DURATION");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("rejects a negative-literal --duration with INVALID_ARGS at the parser layer and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "1", "2", "3", "4", "--duration", "-100"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("rejects a value-less --duration with INVALID_ARGS at the parser layer and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "1", "2", "3", "4", "--duration"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-019 — --duration 0 거부 (SPEC-GESTURE-001 M6/0.4.0 amendment, F3)", () => {
    it("rejects --duration 0 with INVALID_DURATION and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "200", "700", "200", "300", "--duration", "0"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_DURATION");
        expect(result.error.details?.["received"]).toBe("0");
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("does not reject --duration 1 (positive-integer boundary)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "200", "700", "200", "300", "--duration", "1"], backend);

      expect(result.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledWith(
        "R58N90ABCDE",
        { x: 200, y: 700 },
        { x: 200, y: 300 },
        { durationMs: 1 },
      );
    });

    it("coordinate 0 stays valid even when --duration 0 is rejected in the same call (shared-parser trap, AC-GEST-003 vs AC-GEST-019)", async () => {
      const backend = createMockBackend();

      // 좌표 0은 유효하지만 --duration 0은 거부된다 -- 같은 파서를
      // 공유하면 이 두 AC가 동시에 통과할 수 없다(plan.md §F M6 item 1).
      const rejected = await runCli(["swipe", "0", "0", "0", "100", "--duration", "0"], backend);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error.code).toBe("INVALID_DURATION");
      expect(backend.swipe).not.toHaveBeenCalled();

      // 같은 좌표에서 --duration을 생략하면(또는 양수를 주면) 정상 통과한다
      // -- 거부된 것은 좌표 0이 아니라 duration 0이었다는 증거.
      const accepted = await runCli(["swipe", "0", "0", "0", "100"], backend);
      expect(accepted.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledWith("R58N90ABCDE", { x: 0, y: 0 }, { x: 0, y: 100 }, undefined);
    });
  });

  describe("AC-GEST-025 — --duration 상한 (SPEC-GESTURE-001 M7/0.5.0 amendment, C-4)", () => {
    it("rejects --duration 60001 (상한 초과) with INVALID_DURATION and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "200", "700", "200", "300", "--duration", "60001"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_DURATION");
        expect(result.error.details?.["received"]).toBe("60001");
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("does not reject --duration 60000 (상한 경계)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "200", "700", "200", "300", "--duration", "60000"], backend);

      expect(result.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledWith(
        "R58N90ABCDE",
        { x: 200, y: 700 },
        { x: 200, y: 300 },
        { durationMs: 60000 },
      );
    });

    it("rejects --duration 1e24 with INVALID_DURATION, sends zero gestures, and returns promptly (no infinite hang, spec.md §C.1-⑮)", async () => {
      const backend = createMockBackend();
      const start = Date.now();

      const result = await runCli(["swipe", "200", "700", "200", "300", "--duration", "1e24"], backend);

      const elapsedMs = Date.now() - start;
      expect(elapsedMs).toBeLessThan(1000); // finite-time return, not a hang
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_DURATION");
        expect(result.error.details?.["received"]).toBe("1e24");
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-003 — invalid coordinates", () => {
    it("rejects a wrong coordinate count (3 instead of 4) with INVALID_COORDINATES and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "100", "800", "100"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_COORDINATES");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("rejects a non-integer coordinate with INVALID_COORDINATES and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "1.5", "800", "100", "200"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_COORDINATES");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("rejects a negative coordinate literal with INVALID_ARGS at the parser layer (plan.md §F M2 — no argv preprocessing) and sends zero gestures", async () => {
      const backend = createMockBackend();

      const result = await runCli(["swipe", "100", "-50", "100", "200"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-015 — JSON envelope on every path", () => {
    it("emits a JSON.parse-able document on success and on every rejection path", async () => {
      const backend = createMockBackend();
      const invocations: string[][] = [
        ["swipe", "1", "2", "3", "4"],
        ["swipe", "1", "2", "3", "4", "--duration", "500"],
        ["swipe", "1", "2", "3"],
        ["swipe", "1.5", "2", "3", "4"],
        ["swipe", "1", "2", "3", "4", "--duration", "abc"],
        ["swipe", "1", "-2", "3", "4"],
      ];

      for (const argv of invocations) {
        const result = await runCli(argv, backend);
        expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
        expect(typeof result.ok).toBe("boolean");
        expect(result.command).toBe("swipe");
      }
    });
  });

  describe("ordering (B-2/B-3) — --duration is validated before it can ever reach the backend", () => {
    it("never calls backend.swipe when --duration fails to parse (no NaN passthrough to IdbBackend's ms/1000 conversion)", async () => {
      const backend = createMockBackend();

      await runCli(["swipe", "1", "2", "3", "4", "--duration", "abc"], backend);
      await runCli(["swipe", "1", "2", "3", "4", "--duration", ""], backend);

      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("degrades a thrown backend error gracefully", () => {
    it("returns BACKEND_COMMAND_FAILED instead of throwing", async () => {
      const backend = createMockBackend();
      (backend.swipe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("idb: simulator not booted"));

      const result = await runCli(["swipe", "1", "2", "3", "4"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/simulator not booted/);
      }
    });
  });
});
