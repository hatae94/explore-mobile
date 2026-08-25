import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdbBackend } from "../backend/adb-backend.js";
import type { AdbExecResult, AdbExecutor, AdbPathPredicate } from "../backend/adb-executor.js";
import type { ApkAcquirer } from "../backend/apk-downloader.js";
import { AdbDoctor } from "../backend/doctor.js";
import { WdaClient, type WdaHttpClient } from "../backend/wda-client.js";
import { WdaDoctor } from "../backend/wda-doctor.js";
import { AdbKeyboardInstallFailedError, ImeBindTimeoutError, ImeRestoreFailedError } from "../backend/ime-errors.js";
import { WdaUnsupportedKeyError } from "../backend/wda-errors.js";
import { LauncherActivityNotFoundError } from "../backend/launch-errors.js";
import { ImeSessionStore } from "../backend/ime-session-store.js";
import { BackendRegistry } from "../backend/registry.js";
import type { ProcessExecutor } from "../backend/process-executor.js";
import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import type { EnvServices } from "./env-services.js";
import { runCli } from "./router.js";

/**
 * SPEC-IMAGE-001 M3: `screenshot`이 이제 `sips` 외부 프로세스를 탄다. 이
 * 파일의 목적은 **라우터 디스패치와 봉투 형태**를 고정하는 것이지 이미지
 * 변환을 판정하는 것이 아니므로, 변환 모듈을 대역으로 세운다. 변환 자체는
 * `src/image/transform.test.ts`가, 배선은 `commands/screenshot.test.ts`가,
 * 실제 축소 결과는 D 등급 AC-IMAGE-001/002가 각각 맡는다.
 *
 * 대역이 바이트를 **그대로 통과**시키므로 아래 바이트 왕복 검사는 이 SPEC
 * 이전과 같은 것을 계속 판정한다 — 바뀐 것은 응답에 기하가 함께 실린다는
 * 점뿐이다.
 */
vi.mock("../image/transform.js", () => ({
  transformImage: vi.fn(async (bytes: Uint8Array) => ({
    bytes,
    width: 763,
    height: 1568,
    sourceWidth: 1080,
    sourceHeight: 2220,
    format: "jpeg",
  })),
  measureImageBytes: vi.fn(async () => ({ width: 1080, height: 2220 })),
}));

/** 위 대역이 내는 기하 — `screenshot` 응답에 항상 실린다(REQ-IMAGE-003). */
const MOCK_GEOMETRY = {
  width: 763,
  height: 1568,
  deviceWidth: 1080,
  deviceHeight: 2220,
  scale: 1080 / 763,
  format: "jpeg",
};

/**
 * Wraps a test-constructed `AdbDoctor` (and optionally a mock/real
 * `WdaDoctor`) into the `EnvServices` holder `runCli`'s third parameter
 * now expects (REQ-IOS-DOCTOR-003, SPEC-IOS-001 — generalized from the
 * original bare-`AdbDoctor` parameter). Every pre-existing doctor/reset
 * test in this file is Android-focused, so `ios` defaults to an inert
 * `new WdaDoctor()` that is never exercised unless a test explicitly
 * targets an iOS device.
 */
function envServices(android: AdbDoctor, ios: WdaDoctor = new WdaDoctor()): EnvServices {
  return { android, ios };
}

/** A minimal mock iOS DeviceBackend, used only to populate a BackendRegistry's iOS slot in registry-wrapping regression tests. */
function createMockIosBackend(): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
    pinch: vi.fn().mockResolvedValue(undefined),
    doubleTap: vi.fn().mockResolvedValue(undefined),
  };
}

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: "R58N90ABCDE",
    model: "Pixel_7",
    osVersion: "14",
    connectionState: "device",
    unavailableReason: null,
    alternateSerials: [],
    isEmulator: false,
    platform: "android",
    ...overrides,
  };
}

/**
 * A fully-mocked DeviceBackend — the router/commands never touch adb
 * directly.
 *
 * SPEC-VISION-001 M2 (REQ-VISION-002): the UI-tree read member and its
 * uiautomator-XML fixture were dropped along with the interface method, so
 * this mock no longer carries a normalizer dependency. `getScreenSize` is
 * the only screen-shaped member left.
 */
function createMockBackend(devices: DeviceInfo[] = [device()]): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    screenshot: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
    getMinEffectiveSwipeThreshold: vi.fn().mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
    getScreenSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
    pinch: vi.fn().mockResolvedValue(undefined),
    doubleTap: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runCli", () => {
  it("emits a JSON.parse-able output for every command (AC-ANDROID-012)", async () => {
    const backend = createMockBackend();
    const invocations: string[][] = [
      ["devices"],
      ["launch", "com.android.settings"],
      ["stop", "com.android.settings"],
      ["tap", "10", "20"],
      ["key", "back"],
      ["dump"],
      ["screenshot"],
      ["text", "hello"],
      ["doctor"],
      ["unknown-command"],
      [],
    ];

    for (const argv of invocations) {
      const result = await runCli(argv, backend);
      expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
      expect(typeof result.ok).toBe("boolean");
      expect(typeof result.command).toBe("string");
    }
  });

  describe("devices", () => {
    it("returns the connected device list wrapped in a success envelope", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["devices"], backend);

      expect(result).toEqual({ ok: true, command: "devices", data: devices });
    });

    it("filters to the requested --device serial when it matches a connected device", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["devices", "--device", "B"], backend);

      expect(result).toEqual({ ok: true, command: "devices", data: [device({ serial: "B" })] });
    });

    it("returns DEVICE_NOT_FOUND when --device does not match any connected device", async () => {
      const backend = createMockBackend([device({ serial: "A" })]);

      const result = await runCli(["devices", "--device", "missing"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("DEVICE_NOT_FOUND");
    });

    // SPEC-READY-001 §B.6.3 — `devices`는 `resolveTargetDevice()`(경로 A)를
    // 거치지 않는 유일한 device-facing 명령이라 자체 필터를 갖는다
    // (3차 감사 P0). REQ-READY-006이 넓히는 조회 범위·정규화·충돌 거부를
    // 이 경로에서도 검사한다.
    it("AC-READY-017 경로 B — 부속 시리얼로도 조회가 성공하고 대표로 정규화된다", async () => {
      const merged = device({ serial: "REPRESENTATIVE", alternateSerials: ["ALTERNATE-1"] });
      const backend = createMockBackend([merged]);

      const result = await runCli(["devices", "--device", "ALTERNATE-1"], backend);

      expect(result).toEqual({ ok: true, command: "devices", data: [merged] });
    });

    it("AC-READY-020 경로 B — 한 시리얼이 둘 이상 항목에 걸리면 대상을 고르지 않고 거부한다", async () => {
      const deviceA = device({ serial: "S", alternateSerials: [] });
      const deviceB = device({ serial: "OTHER", alternateSerials: ["S"] });
      const backend = createMockBackend([deviceA, deviceB]);

      const result = await runCli(["devices", "--device", "S"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toContain("matches 2 device entries");
        expect(result.error.details?.["collidingEntries"]).toBe(2);
      }
    });
  });

  describe("multi-device targeting (REQ-MULTIDEV-002, AC-ANDROID-009)", () => {
    it("returns a graceful AMBIGUOUS_DEVICE error + device list when >1 device connected and --device is omitted", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["tap", "10", "20"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
        expect(result.error.details?.["availableDevices"]).toEqual(devices);
      }
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("targets the requested --device serial when multiple devices are connected", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["tap", "10", "20", "--device", "B"], backend);

      expect(result).toEqual({ ok: true, command: "tap", data: { serial: "B", x: 10, y: 20 } });
      expect(backend.tap).toHaveBeenCalledWith("B", 10, 20);
    });

    it("returns a graceful NO_DEVICE error when 0 devices are connected", async () => {
      const backend = createMockBackend([]);

      // SPEC-VISION-001 M2: this used to target `dump`. That command is gone,
      // and an UNKNOWN_COMMAND would short-circuit before device resolution —
      // masking the NO_DEVICE contract this test exists to check. `screenshot`
      // is a surviving device-targeted command with the same resolution path.
      const result = await runCli(["screenshot"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NO_DEVICE");
    });
  });

  describe("tap", () => {
    it("rejects non-integer or negative coordinates gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "abc", "10"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_COORDINATES");
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("rejects a missing y coordinate gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["tap", "10"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_COORDINATES");
        expect(result.error.details?.["received"]).toEqual({ x: "10", y: null });
      }
      expect(backend.tap).not.toHaveBeenCalled();
    });

    it("degrades a non-Error backend rejection to a readable string message (Secured — unknown thrown shape)", async () => {
      const backend = createMockBackend();
      (backend.tap as ReturnType<typeof vi.fn>).mockRejectedValueOnce("plain string rejection");

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toBe("plain string rejection");
      }
    });
  });

  // SPEC-VISION-001 M2 (REQ-VISION-002): tap의 셀렉터 모드와 그 iOS 라우팅
  // 회귀 테스트가 함께 제거됐다. 남는 계약은 "제거된 플래그는 조용히
  // 좌표 탭으로 대체되지 않는다"이며, 아래가 그 가드다(AC-VISION-009).
  describe("tap: 제거된 셀렉터 플래그 (AC-VISION-009)", () => {
    it.each([
      [["tap", "--id", "btn_ok"]],
      [["tap", "--text", "OK"]],
      [["tap", "--id", "btn_ok", "--index", "1"]],
      [["tap", "100", "200", "--id", "btn_ok"]],
    ])("%j는 INVALID_ARGS로 거부되고 backend.tap은 호출되지 않는다", async (argv) => {
      const backend = createMockBackend();

      const result = await runCli(argv as string[], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.tap).not.toHaveBeenCalled();
    });
  });

  describe("key", () => {
    it("invokes the backend for a supported alias", async () => {
      const backend = createMockBackend();

      const result = await runCli(["key", "back"], backend);

      expect(result).toEqual({ ok: true, command: "key", data: { serial: "R58N90ABCDE", key: "back" } });
      expect(backend.sendKeyEvent).toHaveBeenCalledWith("R58N90ABCDE", "back");
    });

    it("rejects an unsupported alias gracefully without calling the backend (REQ-INPUT-005)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["key", "foobar"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_KEY");
      expect(backend.sendKeyEvent).not.toHaveBeenCalled();
    });

    it("rejects a missing alias positional gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["key"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_KEY");
        expect(result.error.details?.["received"]).toBeNull();
      }
    });

    it("degrades a sendKeyEvent rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.sendKeyEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["key", "back"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("surfaces UNSUPPORTED_KEY_ON_IOS at the CLI level (not BACKEND_COMMAND_FAILED) for a valid alias with no iOS HID mapping on an iOS-registry-routed target (AC-IOS-017, D7 typed-error precedence)", async () => {
      const iosDeviceInfo = device({ serial: "00008030-IOS", platform: "ios" });
      const iosBackend: DeviceBackend = {
        listDevices: vi.fn().mockResolvedValue([iosDeviceInfo]),
        screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
        tap: vi.fn().mockResolvedValue(undefined),
        inputText: vi.fn().mockResolvedValue(undefined),
        sendKeyEvent: vi
          .fn()
          .mockRejectedValue(
            new WdaUnsupportedKeyError(
              "키 별칭 'home'에 대응하는 iOS 동작이 없습니다.",
            ),
          ),
        launchApp: vi.fn().mockResolvedValue(undefined),
        stopApp: vi.fn().mockResolvedValue(undefined),
        swipe: vi.fn().mockResolvedValue(undefined),
        getMinEffectiveSwipeThreshold: vi
          .fn()
          .mockResolvedValue({ minEffectiveSwipePx: 11, basis: "measured-constant" }),
        getScreenSize: vi.fn().mockResolvedValue({ width: 1179, height: 2556 }),
        pinch: vi.fn().mockResolvedValue(undefined),
        doubleTap: vi.fn().mockResolvedValue(undefined),
      };
      // M5(REQ-VISION-005): registry는 더 이상 `DeviceBackend`를 구현하지
      // 않는다 — `runCli`가 `DeviceSource`로 받아 그대로 라우팅한다.
      const registry = new BackendRegistry([
        { platform: "ios", backend: iosBackend, isAvailable: async () => true },
      ]);

      const result = await runCli(["key", "home"], registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_KEY_ON_IOS");
        expect(result.error.code).not.toBe("BACKEND_COMMAND_FAILED");
      }
      expect(iosBackend.sendKeyEvent).toHaveBeenCalledWith(iosDeviceInfo.serial, "home");
    });
  });

  describe("launch / stop", () => {
    it("rejects an invalid package name gracefully", async () => {
      const backend = createMockBackend();

      const result = await runCli(["launch", "not a package"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_PACKAGE");
      expect(backend.launchApp).not.toHaveBeenCalled();
    });

    it("rejects a missing package positional gracefully for launch", async () => {
      const backend = createMockBackend();

      const result = await runCli(["launch"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PACKAGE");
        expect(result.error.details?.["received"]).toBeNull();
      }
    });

    it("rejects a missing package positional gracefully for stop", async () => {
      const backend = createMockBackend();

      const result = await runCli(["stop"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_PACKAGE");
    });

    it("launches a valid package (REQ-APP-001, mock-verifiable AC-ANDROID-011)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["launch", "com.android.settings"], backend);

      expect(result).toEqual({
        ok: true,
        command: "launch",
        data: { serial: "R58N90ABCDE", package: "com.android.settings" },
      });
      expect(backend.launchApp).toHaveBeenCalledWith("R58N90ABCDE", "com.android.settings");
    });

    it("force-stops a valid package (REQ-APP-002, mock-verifiable AC-ANDROID-011)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["stop", "com.android.settings"], backend);

      expect(result).toEqual({
        ok: true,
        command: "stop",
        data: { serial: "R58N90ABCDE", package: "com.android.settings" },
      });
      expect(backend.stopApp).toHaveBeenCalledWith("R58N90ABCDE", "com.android.settings");
    });

    it("degrades a launchApp rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.launchApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: package not found"));

      const result = await runCli(["launch", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("surfaces a LauncherActivityNotFoundError using its own dedicated envelope code, distinct from BACKEND_COMMAND_FAILED (REQ-APP-001 개정 0.3.0, AC-ANDROID-028)", async () => {
      const backend = createMockBackend();
      (backend.launchApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new LauncherActivityNotFoundError("com.example.doesnotexist"),
      );

      const result = await runCli(["launch", "com.example.doesnotexist"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("LAUNCHER_ACTIVITY_NOT_FOUND");
        expect(result.error.code).not.toBe("BACKEND_COMMAND_FAILED");
        // The message must not assert a single cause — both possibilities
        // are presented (spec.md §C.3-③).
        expect(result.error.message).toMatch(/no launcher activity/i);
        expect(result.error.message).toMatch(/not installed/i);
      }
    });

    it("degrades a stopApp rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.stopApp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["stop", "com.android.settings"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });
  });

  // SPEC-VISION-001 M2 (REQ-VISION-002): `dump` 명령이 제거됐다. 사용자
  // 결정으로 `dump --web`까지 함께 제거됐다(progress.md §G). 아래는
  // AC-VISION-007의 행동 쪽 증인 -- 라우터 등록 부재를 grep이 아니라
  // 디스패치 결과로 확인한다.
  describe("dump: 명령 제거 (AC-VISION-007)", () => {
    it.each([[["dump"]], [["dump", "--web"]], [["dump", "--web", "a"]]])(
      "%j는 UNKNOWN_COMMAND로 거부된다 -- 네이티브도 웹도 남아 있지 않다",
      async (argv) => {
        const backend = createMockBackend();

        const result = await runCli(argv as string[], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("UNKNOWN_COMMAND");
      },
    );
  });
  describe("screenshot", () => {
    it("embeds base64 PNG bytes in the JSON envelope when --out is omitted (REQ-SCREENSHOT-001/002)", async () => {
      const backend = createMockBackend();

      const result = await runCli(["screenshot"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { pngBase64: string; byteLength: number };
        expect(Buffer.from(data.pngBase64, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        expect(data.byteLength).toBe(4);
      }
    });

    it("writes PNG bytes to --out and returns a path pointer instead of embedding base64", async () => {
      const backend = createMockBackend();
      const dir = await mkdtemp(join(tmpdir(), "explore-mobile-screenshot-"));
      const outPath = join(dir, "shot.png");

      try {
        const result = await runCli(["screenshot", "--out", outPath], backend);

        expect(result.ok).toBe(true);
        if (result.ok) {
          // SPEC-IMAGE-001 REQ-IMAGE-003: 기하 7필드가 함께 실린다.
          // `capturedAt`은 호출 시각이므로 형태만 확인하고 나머지를 고정한다.
          const data = result.data as Record<string, unknown>;
          expect(typeof data["capturedAt"]).toBe("string");
          const { capturedAt: _capturedAt, ...rest } = data;
          expect(rest).toEqual({
            serial: "R58N90ABCDE",
            savedTo: outPath,
            byteLength: 4,
            ...MOCK_GEOMETRY,
          });
        }
        const written = await readFile(outPath);
        expect(written).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("degrades a screenshot() rejection to a graceful BACKEND_COMMAND_FAILED envelope", async () => {
      const backend = createMockBackend();
      (backend.screenshot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["screenshot"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("degrades a --out write failure to a graceful WRITE_FAILED envelope", async () => {
      const backend = createMockBackend();
      // A path inside a non-existent parent directory reliably fails ENOENT.
      const badPath = join(tmpdir(), "explore-mobile-does-not-exist-dir", "shot.png");

      const result = await runCli(["screenshot", "--out", badPath], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("WRITE_FAILED");
        expect(result.error.details?.["path"]).toBe(badPath);
      }
    });
  });

  describe("text (M5 — REQ-INPUT-002/003/004)", () => {
    it("dispatches to backend.inputText with the resolved serial and returns success", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello"], backend);

      expect(result).toEqual({ ok: true, command: "text", data: { serial: "R58N90ABCDE" } });
      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: true });
    });

    it("rejects a missing text positional gracefully without calling the backend", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MISSING_TEXT");
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("surfaces an ImeRestoreFailedError as a dedicated IME_RESTORE_FAILED envelope carrying originalImeId (REQ-ERR-001, AC-ANDROID-015)", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImeRestoreFailedError("restore failed, please recover manually", "com.example/.OriginalIme"),
      );

      const result = await runCli(["text", "안녕"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IME_RESTORE_FAILED");
        expect(result.error.details?.["originalImeId"]).toBe("com.example/.OriginalIme");
      }
    });

    it("degrades a generic inputText rejection to BACKEND_COMMAND_FAILED", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["text", "hello"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
    });

    it("surfaces an AdbKeyboardInstallFailedError using its own code, reusing doctor's error codes (REQ-INPUT-003 revised self-heal)", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AdbKeyboardInstallFailedError(
          "Failed to download a valid ADBKeyBoard APK from ... . Install manually: ...",
          "APK_DOWNLOAD_FAILED",
        ),
      );

      const result = await runCli(["text", "안녕"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("APK_DOWNLOAD_FAILED");
        expect(result.error.message).toMatch(/download/i);
      }
    });

    it("returns a graceful device-targeting error (not BACKEND_COMMAND_FAILED) when the device is ambiguous", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);

      const result = await runCli(["text", "hello"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
      expect(backend.inputText).not.toHaveBeenCalled();
    });

    it("surfaces an ImeBindTimeoutError as a dedicated IME_BIND_TIMEOUT envelope, ok:false (REQ-INPUT-004 개정 0.3.0, AC-ANDROID-031)", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImeBindTimeoutError("R58N90ABCDE", 5000),
      );

      const result = await runCli(["text", "알림"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IME_BIND_TIMEOUT");
        expect(result.error.details?.["serial"]).toBe("R58N90ABCDE");
      }
    });

    it("reports originalImeId as null when the ImeRestoreFailedError carries no known id", async () => {
      const backend = createMockBackend();
      (backend.inputText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImeRestoreFailedError("original IME unknown; manual recovery required", undefined),
      );

      const result = await runCli(["text", "안녕"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details?.["originalImeId"]).toBeNull();
    });

    it("forwards hideKeyboardAfter: true by default (REQ-INPUT-004 revised, real-device UX)", async () => {
      const backend = createMockBackend();

      await runCli(["text", "hello"], backend);

      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: true });
    });

    it("forwards hideKeyboardAfter: false when --keep-keyboard is given", async () => {
      const backend = createMockBackend();

      await runCli(["text", "hello", "--keep-keyboard"], backend);

      expect(backend.inputText).toHaveBeenCalledWith("R58N90ABCDE", "hello", { hideKeyboardAfter: false });
    });
  });

  // SPEC-VISION-001 M2 (REQ-VISION-002): text의 focus-before-type 셀렉터
  // 경로가 제거됐다. 포커스는 이제 호출자가 스크린샷 좌표로 `tap`을 먼저
  // 보내 만든다(spec.md §C.2). 아래는 제거 회귀 가드다.
  describe("text: 제거된 셀렉터 플래그 (AC-VISION-009)", () => {
    it("text --id는 INVALID_ARGS로 거부되고, 입력도 탭도 일어나지 않는다 -- 조용한 대체 없음", async () => {
      const backend = createMockBackend();

      const result = await runCli(["text", "hello", "--id", "et_name"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.inputText).not.toHaveBeenCalled();
      expect(backend.tap).not.toHaveBeenCalled();
    });
  });
  describe("doctor (M6 — REQ-DOCTOR-001~005)", () => {
    /** A fake `AdbPathPredicate` (plan.md §B.1) that reports "not found anywhere" — none of the four candidates match. */
    const notFoundAnywherePredicate: AdbPathPredicate = () => false;

    async function makeDoctor(overrides: {
      adbExec?: AdbExecutor;
      processExec?: ProcessExecutor;
      acquireApk?: ApkAcquirer;
      platform?: NodeJS.Platform;
      adbPathPredicate?: AdbPathPredicate;
    }) {
      return new AdbDoctor(
        overrides.adbExec,
        overrides.processExec,
        overrides.acquireApk,
        overrides.platform,
        overrides.adbPathPredicate,
      );
    }

    function adbOk(stdout = ""): AdbExecResult {
      return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
    }

    function adbFail(stderr: string): AdbExecResult {
      return { stdout: Buffer.alloc(0), stderr: Buffer.from(stderr, "utf-8"), exitCode: 1 };
    }

    it("reports adb missing + install guidance without touching device listing (macOS, no consent)", async () => {
      const backend = createMockBackend();
      const adbExec = vi.fn<AdbExecutor>().mockRejectedValueOnce(new Error("spawn adb ENOENT"));
      // REQ-READY-001/002 (SPEC-READY-001 M1): `installed` now reflects
      // resolveAdbPath()'s four-candidate search, not merely whether
      // `adbExec` succeeds — inject "not found anywhere" so this genuinely
      // exercises the missing-adb path regardless of what this host's real
      // filesystem happens to contain (plan.md §A.1 router.test.ts:657/632).
      const doctor = await makeDoctor({ adbExec, platform: "darwin", adbPathPredicate: notFoundAnywherePredicate });

      const result = await runCli(["doctor"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          adb: { installed: boolean };
          installAttempt: { attempted: boolean; manualCommand: string };
          adbKeyboard: { skipped: boolean };
        };
        expect(data.adb.installed).toBe(false);
        expect(data.installAttempt.attempted).toBe(false);
        expect(data.installAttempt.manualCommand).toBe("brew install android-platform-tools");
        expect(data.adbKeyboard.skipped).toBe(true);
      }
    });

    /**
     * REQ-ERR-004 / AC-ANDROID-018 — **SPEC-VISION-001 M3에서 판정 방식이
     * 바뀌었다**. 원래 이 테스트는 `backend.listDevices`가 호출되지 않는 것을
     * 셌다. M3가 iOS 열거를 `devicectl`로 분리하면서, adb 데몬이 죽었어도
     * iOS 기기는 열거할 수 있게 됐고, `doctor`는 iOS 대상 진단을 위해 기기
     * 해석을 먼저 하도록 순서를 바꿨다.
     *
     * AC가 막으려던 것 — **죽은 adb를 통한 조회** — 은 그대로 지켜진다.
     * 아래 형제 테스트가 registry 경로에서 그것을 판정한다. 이 테스트는
     * 남은 계약(데몬 불량이 보고서에 그대로 실린다)만 센다.
     */
    it("reports daemon-unhealthy in the report body (REQ-ERR-004, AC-ANDROID-018)", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41")) // version
        .mockResolvedValueOnce(adbFail("cannot bind to 127.0.0.1:5037")); // start-server
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { daemon: { healthy: boolean }; adbKeyboard: { skipped: boolean } };
        expect(data.daemon.healthy).toBe(false);
        expect(data.adbKeyboard.skipped).toBe(true);
      }
    });

    /**
     * AC-ANDROID-018의 취지 보존 판정: adb가 쓸 수 없는 상태면 registry가
     * 그 백엔드를 건너뛰므로 `AdbBackend.listDevices`는 **호출되지 않는다**.
     * 열거 자체는 일어나지만 죽은 adb를 통하지 않는다는 것이 요점이다.
     */
    it("adb가 비가용이면 registry가 Android 백엔드를 건너뛴다 (AC-ANDROID-018 취지 보존)", async () => {
      const androidBackend = createMockBackend([]);
      const iosBackend = createMockIosBackend();
      const registry = new BackendRegistry([
        { platform: "android", backend: androidBackend, isAvailable: async () => false },
        { platform: "ios", backend: iosBackend, isAvailable: async () => true },
      ]);
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41"))
        .mockResolvedValueOnce(adbFail("cannot bind to 127.0.0.1:5037"));
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], registry, envServices(doctor));

      expect(result.ok).toBe(true);
      expect(androidBackend.listDevices).not.toHaveBeenCalled();
      expect(iosBackend.listDevices).toHaveBeenCalled();
    });

    it("installs + enables ADBKeyBoard on the resolved device when adb and daemon are healthy", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41")) // version
        .mockResolvedValueOnce(adbOk("")) // start-server
        .mockResolvedValueOnce(adbOk("package:com.android.adbkeyboard\n")) // pm list packages (already present)
        .mockResolvedValueOnce(adbOk("")); // ime enable
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { adbKeyboard: { skipped: boolean; alreadyInstalled: boolean; enabled: boolean } };
        expect(data.adbKeyboard).toEqual({ skipped: false, alreadyInstalled: true, installed: false, enabled: true });
      }
    });

    it("reports APK_DOWNLOAD_FAILED gracefully when the runtime download fails (REQ-ERR-002, AC-ANDROID-016)", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41"))
        .mockResolvedValueOnce(adbOk(""))
        .mockResolvedValueOnce(adbOk("package:com.android.settings\n")); // ADBKeyBoard not present
      const acquireApk = vi
        .fn<ApkAcquirer>()
        .mockRejectedValue(new Error("Failed to download a valid ADBKeyBoard APK from ... Install manually: ..."));
      const doctor = await makeDoctor({ adbExec, acquireApk });

      const result = await runCli(["doctor"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { adbKeyboard: { error?: { code: string; message: string } } };
        expect(data.adbKeyboard.error?.code).toBe("APK_DOWNLOAD_FAILED");
        expect(data.adbKeyboard.error?.message).toMatch(/manually/i);
      }
    });

    it("reports adbKeyboard as skipped (not a hard failure) when the target device is ambiguous", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41"))
        .mockResolvedValueOnce(adbOk(""));
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { adbKeyboard: { skipped: boolean; reason: string } };
        expect(data.adbKeyboard.skipped).toBe(true);
        expect(data.adbKeyboard.reason).toMatch(/devices connected/);
      }
      // adb/daemon checks still ran (2 calls); no per-device ensureAdbKeyboard call attempted.
      expect(adbExec).toHaveBeenCalledTimes(2);
    });

    it("doctor --clean delegates to the same reset logic under the 'doctor' command name", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce(adbOk("")) // ime disable
        .mockResolvedValueOnce(adbOk("")) // ime reset
        .mockResolvedValueOnce(adbOk("Success")); // uninstall
      const doctor = await makeDoctor({ adbExec });

      const result = await runCli(["doctor", "--clean"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      expect(result.command).toBe("doctor");
      if (result.ok) {
        const data = result.data as { imeReset: boolean };
        expect(data.imeReset).toBe(true);
      }
    });

    /**
     * 출력 계약의 **런타임** 보호 (SPEC-CONTRACT-001 REQ-CONTRACT-004).
     *
     * `command-payloads.test.ts`의 타입 수준 계약은 `pnpm typecheck`를 돌려야만
     * 작동한다 — vitest는 타입을 지우고 실행하므로 `pnpm test`만으로는 걸리지
     * 않는다. 아래 테스트가 그 구멍을 메운다: **실제로 나온 JSON의 키 집합**을
     * 세므로 타입과 무관하게 걸린다.
     *
     * 그리고 타입만으로는 애초에 고정할 수 없는 것이 있다 — `doctor`는 갈래에
     * 따라 선택 필드를 싣는데, "어느 갈래에서 무엇이 실리는가"는 타입이 아니라
     * 실행이 정한다. `SPEC-WEBVIEW-002`에서 조용히 사라진 필드가 바로 그런
     * 선택 필드였다.
     */
    describe("출력 키 집합 고정 (SPEC-CONTRACT-001)", () => {
      it("adb 미설치 갈래 — installAttempt가 실리고 wdaEnvironment는 없다", async () => {
        const backend = createMockBackend();
        const adbExec = vi.fn<AdbExecutor>().mockRejectedValueOnce(new Error("spawn adb ENOENT"));
        // REQ-READY-001/002 (SPEC-READY-001 M1): force "not found anywhere"
        // so this genuinely exercises the missing-adb branch regardless of
        // this host's real filesystem (same fixation as the :653 test above).
        const doctor = await makeDoctor({ adbExec, platform: "darwin", adbPathPredicate: notFoundAnywherePredicate });

        const result = await runCli(["doctor"], backend, envServices(doctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Object.keys(result.data as object).sort()).toEqual(
            ["adb", "adbKeyboard", "daemon", "devices", "installAttempt"].sort(),
          );
        }
      });

      it("데몬 비정상 갈래 — 항상 실리는 4개만", async () => {
        const backend = createMockBackend();
        const adbExec = vi
          .fn<AdbExecutor>()
          .mockResolvedValueOnce(adbOk("Android Debug Bridge version 1.0.41"))
          .mockResolvedValueOnce(adbFail("cannot bind to 127.0.0.1:5037"));
        const doctor = await makeDoctor({ adbExec });

        const result = await runCli(["doctor"], backend, envServices(doctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Object.keys(result.data as object).sort()).toEqual(
            ["adb", "adbKeyboard", "daemon", "devices"].sort(),
          );
        }
      });

      /**
       * 이 테스트가 이 SPEC의 계기다. iOS 갈래의 `wdaEnvironment` 안에 있던
       * 세 번째 필드가 사라졌을 때 아무것도 깨지지 않았다. 이제 깨진다.
       */
      it("iOS 갈래 — wdaEnvironment가 실리고 그 안은 { devicectl, wda, signing, gates }다", async () => {
        const androidBackend = createMockBackend([]);
        const iosBackend = createMockIosBackend();
        (iosBackend.listDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
          device({ serial: "00008130-IOS", platform: "ios" }),
        ]);
        const registry = new BackendRegistry([
          { platform: "android", backend: androidBackend, isAvailable: async () => false },
          { platform: "ios", backend: iosBackend, isAvailable: async () => true },
        ]);
        const adbExec = vi.fn<AdbExecutor>().mockRejectedValue(new Error("spawn adb ENOENT"));
        const doctor = await makeDoctor({ adbExec, platform: "darwin" });

        // WdaDoctor에 가짜 HTTP/프로세스 실행기를 주입한다 — 주입하지 않으면
        // 실제 WebDriverAgent에 요청을 보내려다 테스트가 멈춘다.
        const http: WdaHttpClient = async () => ({ status: 200, body: JSON.stringify({ value: { ready: true } }) });
        const wdaDoctor = new WdaDoctor(
          vi.fn<ProcessExecutor>().mockResolvedValue({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 }),
          "darwin",
          {},
          (serial) => new WdaClient(serial, http, {}, async () => undefined),
        );

        const result = await runCli(
          ["doctor", "--device", "00008130-IOS"],
          registry,
          envServices(doctor, wdaDoctor),
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { wdaEnvironment: object };
          expect(Object.keys(data).sort()).toEqual(
            ["adb", "adbKeyboard", "daemon", "devices", "wdaEnvironment"].sort(),
          );
          // `signing`은 SPEC-IOS-002 M5에서 추가됐다 — `--yes` 없이도 늘 실린다.
          // 만료는 기동이 깨진 뒤가 아니라 깨지기 전에 알려야 값이 있다(REQ-IOS2-007).
          // `gates`는 같은 SPEC M6에서 추가됐다 — 관문 셋을 각각 싣는다(REQ-IOS2-006).
          expect(Object.keys(data.wdaEnvironment).sort()).toEqual(
            ["devicectl", "gates", "signing", "wda"].sort(),
          );
        }
      });

      /**
       * SPEC-IOS-002: 기기가 `unavailable`이면 `resolveTargetDevice`가 실패해
       * iOS 갈래에 도달하지 못했다. **iOS 진단이 가장 필요한 상태에서 iOS
       * 진단이 나오지 않았고**, `--yes` 준비 자동화도 함께 막혔다 — 기기를
       * 올리는 명령인데 기기가 올라와 있어야만 닿을 수 있는 고리였다.
       *
       * 이 검사가 그 고리를 막는다.
       */
      it("iOS 갈래 — 기기가 unavailable이어도 wdaEnvironment가 실린다", async () => {
        const androidBackend = createMockBackend([]);
        const iosBackend = createMockIosBackend();
        (iosBackend.listDevices as ReturnType<typeof vi.fn>).mockResolvedValue([
          device({
            serial: "00008130-IOS",
            platform: "ios",
            connectionState: "unavailable",
            unavailableReason: "disconnected — 터널이 연결되지 않았다",
          }),
        ]);
        const registry = new BackendRegistry([
          { platform: "android", backend: androidBackend, isAvailable: async () => false },
          { platform: "ios", backend: iosBackend, isAvailable: async () => true },
        ]);
        const adbExec = vi.fn<AdbExecutor>().mockRejectedValue(new Error("spawn adb ENOENT"));
        const doctor = await makeDoctor({ adbExec, platform: "darwin" });

        // 러너가 죽어 있는 상태 — 이것이 `unavailable`의 실제 모습이다.
        const http: WdaHttpClient = async () => {
          throw new Error("ECONNREFUSED");
        };
        const wdaDoctor = new WdaDoctor(
          vi.fn<ProcessExecutor>().mockResolvedValue({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 }),
          "darwin",
          {},
          (serial) => new WdaClient(serial, http, {}, async () => undefined),
        );

        const result = await runCli(["doctor", "--device", "00008130-IOS"], registry, envServices(doctor, wdaDoctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { wdaEnvironment?: { wda: { reachable: boolean; controllable: string } } };
          expect(data.wdaEnvironment).toBeDefined();
          // design.md §B.1.1 3번 — 생존=무응답 / 권한=물을 수 없음
          expect(data.wdaEnvironment?.wda.reachable).toBe(false);
          expect(data.wdaEnvironment?.wda.controllable).toBe("unknown");
        }
      });
    });
  });

  describe("reset (M6 — REQ-DOCTOR-004)", () => {
    it("resolves the target device then reports the reset outcome", async () => {
      const backend = createMockBackend();
      const adbExec = vi
        .fn<AdbExecutor>()
        .mockResolvedValueOnce({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 })
        .mockResolvedValueOnce({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 })
        .mockResolvedValueOnce({ stdout: Buffer.from("Success"), stderr: Buffer.alloc(0), exitCode: 0 });
      const doctor = new AdbDoctor(adbExec);

      const result = await runCli(["reset"], backend, envServices(doctor));

      expect(result.ok).toBe(true);
      expect(result.command).toBe("reset");
      if (result.ok) {
        expect(result.data).toEqual({
          serial: "R58N90ABCDE",
          imeReset: true,
          adbKeyboardDisabled: true,
          adbKeyboardUninstalled: true,
          warnings: [],
        });
      }
    });

    it("returns a graceful device-targeting error without touching the doctor service when ambiguous", async () => {
      const devices = [device({ serial: "A" }), device({ serial: "B" })];
      const backend = createMockBackend(devices);
      const adbExec = vi.fn<AdbExecutor>();
      const doctor = new AdbDoctor(adbExec);

      const result = await runCli(["reset"], backend, envServices(doctor));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("AMBIGUOUS_DEVICE");
      expect(adbExec).not.toHaveBeenCalled();
    });

    describe("session-based IME restore integration (REQ-INPUT-004 disk-persistence fix, real AdbBackend)", () => {
      function devicesListResult(serial: string): AdbExecResult {
        return {
          stdout: Buffer.from(
            `List of devices attached\n${serial}          device product:sdk model:sdk_gphone64_arm64 device:emu64a transport_id:1\n`,
            "utf-8",
          ),
          stderr: Buffer.alloc(0),
          exitCode: 0,
        };
      }

      // The on-disk `ImeSessionStore` must never touch the real
      // `~/.cache/explore-mobile` directory during tests.
      let imeStoreDir: string;
      let imeSessionsDir: string;

      beforeEach(async () => {
        imeStoreDir = await mkdtemp(join(tmpdir(), "explore-mobile-router-ime-"));
        // SPEC-IMESTATE-001 M2부터 생성자 인자 1은 **디렉터리**다. 값을
        // `ime-sessions.json`으로 두면 M3의 구 파일 폴백 경로(디렉터리의
        // 형제 `ime-sessions.json`)가 이 디렉터리 자신과 충돌한다.
        imeSessionsDir = join(imeStoreDir, "ime-sessions");
      });

      afterEach(async () => {
        await rm(imeStoreDir, { recursive: true, force: true });
      });

      it("restores the per-serial original IME tracked from a prior non-ASCII `text` session, then clears it", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so these pre-existing integration tests are
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const backend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeSessionsDir));
        const doctor = new AdbDoctor(adbExec);

        // A prior non-ASCII `text` call switches this serial's session IME.
        await backend.inputText(serial, "안녕");
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);

        const result = await runCli(["reset"], backend, envServices(doctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean };
          expect(data.originalImeRestored).toBe(true);
        }

        const restoreCallExists = adbExec.mock.calls.some(
          ([callArgs]) =>
            callArgs[1] === serial &&
            callArgs[2] === "shell" &&
            callArgs[3] === "ime" &&
            callArgs[4] === "set" &&
            callArgs[5] === originalIme,
        );
        expect(restoreCallExists).toBe(true);

        // The session is cleared once `reset` has restored it.
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBeUndefined();
      });

      it("still restores the per-serial original IME when `backend` is a BackendRegistry wrapping the AdbBackend (SPEC-IOS-001, bin.ts's real construction — regression guard)", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so these pre-existing integration tests are
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const adbBackend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeSessionsDir));
        const registry = new BackendRegistry([
          { platform: "android", backend: adbBackend, isAvailable: async () => true },
          { platform: "ios", backend: createMockIosBackend(), isAvailable: async () => false },
        ]);
        const doctor = new AdbDoctor(adbExec);

        await adbBackend.inputText(serial, "안녕");
        await expect(adbBackend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);

        const result = await runCli(["reset"], registry, envServices(doctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean };
          expect(data.originalImeRestored).toBe(true);
        }
        await expect(adbBackend.getTrackedOriginalIme(serial)).resolves.toBeUndefined();
      });

      it("restores the per-serial original IME even when the `text` call and the `reset` call use SEPARATE AdbBackend instances (the reported cross-process bug)", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so these pre-existing integration tests are
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        // "Process 1" (`text` invocation): a fresh `AdbBackend` +
        // `ImeSessionStore` pair, exactly as `bin.ts` constructs on every
        // CLI invocation.
        const textProcessBackend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeSessionsDir));
        await textProcessBackend.inputText(serial, "안녕");

        // "Process 2" (`reset` invocation): a BRAND-NEW `AdbBackend` +
        // `ImeSessionStore` pair pointed at the SAME on-disk file — no
        // in-memory state is shared with `textProcessBackend`.
        const resetProcessBackend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeSessionsDir));
        const doctor = new AdbDoctor(adbExec);

        const result = await runCli(["reset"], resetProcessBackend, envServices(doctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean };
          expect(data.originalImeRestored).toBe(true);
        }

        const restoreCallExists = adbExec.mock.calls.some(
          ([callArgs]) =>
            callArgs[1] === serial &&
            callArgs[2] === "shell" &&
            callArgs[3] === "ime" &&
            callArgs[4] === "set" &&
            callArgs[5] === originalIme,
        );
        expect(restoreCallExists).toBe(true);
      });

      it("retains the session-tracked IME when the reset's precise restore fails (audit / manual recovery)", async () => {
        const originalIme = "com.google.android.inputmethod.latin/.LatinIME";
        const serial = "R58N90ABCDE";

        const adbExec = vi.fn<AdbExecutor>().mockImplementation(async (args: string[]) => {
          if (args[0] === "devices") return devicesListResult(serial);
          if (args[0] === "-s" && args[2] === "shell" && args[3] === "getprop") {
            return { stdout: Buffer.from("14\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "settings") {
            return { stdout: Buffer.from(`${originalIme}\n`, "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          if (args[3] === "ime" && args[4] === "set" && args[5] === originalIme) {
            return { stdout: Buffer.alloc(0), stderr: Buffer.from("adb: ime set rejected", "utf-8"), exitCode: 1 };
          }
          if (args[3] === "dumpsys") {
            // Binding-readiness poll (REQ-INPUT-004 개정 0.3.0) — bound on
            // the first poll so this pre-existing integration test is
            // unaffected in shape, only in call count.
            return { stdout: Buffer.from("mBoundToMethod=true\n", "utf-8"), stderr: Buffer.alloc(0), exitCode: 0 };
          }
          return { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 };
        });

        const backend = new AdbBackend(adbExec, undefined, new ImeSessionStore(imeSessionsDir));
        const doctor = new AdbDoctor(adbExec);

        await backend.inputText(serial, "안녕");

        const result = await runCli(["reset"], backend, envServices(doctor));

        expect(result.ok).toBe(true);
        if (result.ok) {
          const data = result.data as { originalImeRestored?: boolean; warnings: string[] };
          expect(data.originalImeRestored).toBe(false);
          expect(data.warnings.some((w) => w.includes(originalIme))).toBe(true);
        }

        // Retained for audit / manual recovery — the session is NOT cleared.
        await expect(backend.getTrackedOriginalIme(serial)).resolves.toBe(originalIme);
      });
    });
  });

  describe("doctor/reset platform-branching dispatch (REQ-IOS-DOCTOR-003, AC-IOS-021)", () => {
    it("routes 'doctor' to WdaDoctor's checks (not AdbDoctor.ensureAdbKeyboard) when the resolved target device is platform:ios", async () => {
      const iosDeviceInfo = device({ serial: "00008030-IOS", platform: "ios" });
      const backend = createMockBackend([iosDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const wdaDoctor = new WdaDoctor(vi.fn());

      // adb/daemon checks are eager + unconditional (unchanged from
      // SPEC-ANDROID-001) — mock them healthy so the handler reaches the
      // platform-branch decision point.
      vi.spyOn(adbDoctor, "checkAdbInstalled").mockResolvedValue({
        installed: true,
        onPath: true,
        resolvedPath: "/fake/path/adb",
        version: "1.0.41",
      });
      vi.spyOn(adbDoctor, "checkDaemonHealth").mockResolvedValue({ healthy: true });
      const ensureAdbKeyboardSpy = vi.spyOn(adbDoctor, "ensureAdbKeyboard");

      // SPEC-VISION-001 M3 (AC-VISION-020): iOS 점검 항목이 devicectl/WDA로
      // 교체됐다. 이 테스트가 세는 것은 "iOS 대상일 때 WDA 점검이 불리는가"다.
      const checkDevicectlSpy = vi.spyOn(wdaDoctor, "checkDevicectl").mockResolvedValue({ available: true });
      const checkWdaSpy = vi
        .spyOn(wdaDoctor, "checkWda")
        .mockResolvedValue({ reachable: true, controllable: "ok", port: 8100, portMapDeclared: false });

      const result = await runCli(
        ["doctor", "--device", iosDeviceInfo.serial],
        backend,
        envServices(adbDoctor, wdaDoctor),
      );

      expect(result.ok).toBe(true);
      expect(checkDevicectlSpy).toHaveBeenCalledTimes(1);
      expect(checkWdaSpy).toHaveBeenCalledWith(iosDeviceInfo.serial);
      expect(ensureAdbKeyboardSpy).not.toHaveBeenCalled();
      if (result.ok) {
        const data = result.data as { wdaEnvironment?: unknown; adbKeyboard: { skipped: boolean } };
        expect(data.wdaEnvironment).toBeDefined();
        expect(data.adbKeyboard.skipped).toBe(true);
      }
    });

    it("routes 'doctor' to AdbDoctor.ensureAdbKeyboard (not WdaDoctor) when the resolved target device is platform:android", async () => {
      const androidDeviceInfo = device({ serial: "R58N90ABCDE", platform: "android" });
      const backend = createMockBackend([androidDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const wdaDoctor = new WdaDoctor(vi.fn());

      vi.spyOn(adbDoctor, "checkAdbInstalled").mockResolvedValue({
        installed: true,
        onPath: true,
        resolvedPath: "/fake/path/adb",
        version: "1.0.41",
      });
      vi.spyOn(adbDoctor, "checkDaemonHealth").mockResolvedValue({ healthy: true });
      const ensureAdbKeyboardSpy = vi
        .spyOn(adbDoctor, "ensureAdbKeyboard")
        .mockResolvedValue({ alreadyInstalled: true, installed: false, enabled: true });
      const checkWdaSpy = vi.spyOn(wdaDoctor, "checkWda");

      const result = await runCli(["doctor"], backend, envServices(adbDoctor, wdaDoctor));

      expect(result.ok).toBe(true);
      expect(ensureAdbKeyboardSpy).toHaveBeenCalledWith(androidDeviceInfo.serial);
      expect(checkWdaSpy).not.toHaveBeenCalled();
      if (result.ok) {
        const data = result.data as { adbKeyboard: { skipped: boolean } };
        expect(data.adbKeyboard.skipped).toBe(false);
      }
    });

    it("routes 'reset' to WdaDoctor.resetDevice (near-no-op) for an iOS-platform target, without touching AdbDoctor.resetDevice", async () => {
      const iosDeviceInfo = device({ serial: "00008030-IOS", platform: "ios" });
      const backend = createMockBackend([iosDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const wdaDoctor = new WdaDoctor(vi.fn());

      const adbResetSpy = vi.spyOn(adbDoctor, "resetDevice");
      const wdaResetSpy = vi.spyOn(wdaDoctor, "resetDevice").mockResolvedValue({
        noOp: true,
        message: "iOS에는 정리할 IME/APK 상태가 없습니다(WDA 문자 입력은 무상태) — 되돌릴 것이 없습니다.",
      });

      const result = await runCli(["reset"], backend, envServices(adbDoctor, wdaDoctor));

      expect(result.ok).toBe(true);
      expect(wdaResetSpy).toHaveBeenCalledWith(iosDeviceInfo.serial);
      expect(adbResetSpy).not.toHaveBeenCalled();
      if (result.ok) {
        const data = result.data as { noOp?: boolean };
        expect(data.noOp).toBe(true);
      }
    });

    it("routes 'reset' to AdbDoctor.resetDevice for an android-platform target (unchanged path), without touching WdaDoctor.resetDevice", async () => {
      const androidDeviceInfo = device({ serial: "R58N90ABCDE", platform: "android" });
      const backend = createMockBackend([androidDeviceInfo]);
      const adbDoctor = new AdbDoctor(vi.fn<AdbExecutor>());
      const wdaDoctor = new WdaDoctor(vi.fn());

      const adbResetSpy = vi.spyOn(adbDoctor, "resetDevice").mockResolvedValue({
        imeReset: true,
        adbKeyboardDisabled: true,
        adbKeyboardUninstalled: true,
        warnings: [],
      });
      const wdaResetSpy = vi.spyOn(wdaDoctor, "resetDevice");

      const result = await runCli(["reset"], backend, envServices(adbDoctor, wdaDoctor));

      expect(result.ok).toBe(true);
      expect(adbResetSpy).toHaveBeenCalledWith(androidDeviceInfo.serial, undefined);
      expect(wdaResetSpy).not.toHaveBeenCalled();
    });
  });

  describe("routing errors", () => {
    it("returns MISSING_COMMAND when no command is given", async () => {
      const backend = createMockBackend();

      const result = await runCli([], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MISSING_COMMAND");
    });

    it("returns UNKNOWN_COMMAND for an unrecognized command", async () => {
      const backend = createMockBackend();

      const result = await runCli(["frobnicate"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNKNOWN_COMMAND");
    });

    it("degrades a thrown backend error to a graceful BACKEND_COMMAND_FAILED envelope instead of throwing", async () => {
      const backend = createMockBackend();
      (backend.tap as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adb: device offline"));

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/device offline/);
      }
    });

    it("returns INVALID_ARGS for an unrecognized flag instead of throwing", async () => {
      const backend = createMockBackend();

      const result = await runCli(["devices", "--not-a-real-flag"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
    });

    it("returns INTERNAL_ERROR (defense in depth) when a handler throws outside its own try/catch, including non-Error rejections", async () => {
      const backend = createMockBackend();
      (backend.listDevices as ReturnType<typeof vi.fn>).mockRejectedValueOnce("not an Error instance");

      const result = await runCli(["tap", "1", "1"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INTERNAL_ERROR");
        expect(result.error.message).toBe("not an Error instance");
      }
    });
  });
});

describe("자동 복구 알림이 결과 봉투에 실린다 (SPEC-IOS-002 AC-IOS2-016)", () => {
  /** 알림을 남기는 능력이 있는 iOS 백엔드 흉내. */
  function iosBackendWithNotices(notices: string[]): DeviceBackend {
    const backend = createMockIosBackend();
    return Object.assign(backend, {
      listDevices: vi.fn().mockResolvedValue([iosDevice]),
      takeRecoveryNotices: () => notices.splice(0),
    });
  }

  const iosDevice = device({ serial: "IOS-UDID-1", platform: "ios", model: "iPad Pro" });

  function registryWith(backend: DeviceBackend): BackendRegistry {
    return new BackendRegistry([{ platform: "ios", backend, isAvailable: async () => true }]);
  }

  it("복구가 일어난 명령의 성공 봉투에 notices가 실린다", async () => {
    const registry = registryWith(iosBackendWithNotices(["IOS-UDID-1: 러너를 1회 재기동했습니다."]));

    const result = await runCli(["tap", "10", "20", "--device", "IOS-UDID-1"], registry);

    expect(result.ok).toBe(true);
    expect(result.notices).toEqual(["IOS-UDID-1: 러너를 1회 재기동했습니다."]);
  });

  it("알림이 없으면 notices 필드 자체가 붙지 않는다 — 기존 JSON 계약 무회귀", async () => {
    const registry = registryWith(iosBackendWithNotices([]));

    const result = await runCli(["tap", "10", "20", "--device", "IOS-UDID-1"], registry);

    expect(result.ok).toBe(true);
    expect("notices" in result).toBe(false);
  });

  it("알림을 남기는 능력이 없는 백엔드도 그대로 통과한다", async () => {
    const backend = createMockIosBackend();
    (backend as { listDevices: unknown }).listDevices = vi.fn().mockResolvedValue([iosDevice]);

    const result = await runCli(["tap", "10", "20", "--device", "IOS-UDID-1"], registryWith(backend));

    expect(result.ok).toBe(true);
    expect("notices" in result).toBe(false);
  });

  it("실패한 명령에도 알림이 실린다 — 재기동하고도 실패한 경우가 가장 알려야 할 상황이다", async () => {
    const backend = iosBackendWithNotices(["IOS-UDID-1: 러너를 1회 재기동했습니다."]);
    (backend as { tap: unknown }).tap = vi.fn().mockRejectedValue(new WdaUnsupportedKeyError("조작 실패"));

    const result = await runCli(["tap", "10", "20", "--device", "IOS-UDID-1"], registryWith(backend));

    expect(result.ok).toBe(false);
    expect(result.notices).toEqual(["IOS-UDID-1: 러너를 1회 재기동했습니다."]);
  });
});
