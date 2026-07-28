/**
 * `scroll <up|down|left|right> [--amount <ratio>]` 명령 테스트
 * (SPEC-GESTURE-001 M3 — REQ-GEST-SCROLL-001~006; AC-GEST-007~010,
 * AC-GEST-015~017).
 *
 * `swipe.test.ts`와 동일한 규약으로 `runCli`를 통해 전체 CLI 디스패치
 * 경로를 mock `DeviceBackend`로 검증한다.
 */

import { describe, expect, it, vi } from "vitest";
import type { CommonElement } from "../../schema/common-element.js";
import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { runCli } from "../router.js";
import { minNonDegenerateRatio } from "./scroll-geometry.js";

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

function element(overrides: Partial<CommonElement> = {}): CommonElement {
  return {
    role: "Other",
    text: "",
    id: "",
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    tappable: false,
    enabled: true,
    children: [],
    ...overrides,
  };
}

/** 알려진 400x800 화면 하나로 이루어진 dump 결과 (witness == 유일한 최상위 요소). */
const KNOWN_SCREEN_400X800: CommonElement[] = [element({ bounds: { x: 0, y: 0, w: 400, h: 800 } })];

/** AC-GEST-008 — 최상위 3개, 인덱스 0은 화면 전체가 아님, 인덱스 1이 witness. */
const MULTI_ROOT_WITH_WITNESS: CommonElement[] = [
  element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }),
  element({ bounds: { x: 0, y: 0, w: 402, h: 874 } }),
  element({ bounds: { x: 0, y: 800, w: 402, h: 74 } }),
];

/** AC-GEST-017 — Safari 크롬-only, witness 없음 (402x120 후보는 비퇴화이지만 틀림). */
const CHROME_ONLY_NO_WITNESS: CommonElement[] = [
  element({ bounds: { x: 0, y: 0, w: 402, h: 60 } }),
  element({ bounds: { x: 0, y: 60, w: 402, h: 44 } }),
  element({ bounds: { x: 0, y: 104, w: 402, h: 16 } }),
];

/** AC-GEST-018 — spec.md §C.1-⑫ 실측 화면 크기(witness == 유일한 최상위 요소). */
const KNOWN_SCREEN_402X874: CommonElement[] = [element({ bounds: { x: 0, y: 0, w: 402, h: 874 } })];

function createMockBackend(
  devices: DeviceInfo[] = [device()],
  elements: CommonElement[] = KNOWN_SCREEN_400X800,
): DeviceBackend {
  return {
    listDevices: vi.fn().mockResolvedValue(devices),
    dumpUiHierarchy: vi.fn().mockResolvedValue(elements),
    screenshot: vi.fn().mockResolvedValue(new Uint8Array()),
    tap: vi.fn().mockResolvedValue(undefined),
    inputText: vi.fn().mockResolvedValue(undefined),
    sendKeyEvent: vi.fn().mockResolvedValue(undefined),
    launchApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    swipe: vi.fn().mockResolvedValue(undefined),
  };
}

describe("scroll", () => {
  describe("AC-GEST-007/016 — 방향 계산 + 응답 표기", () => {
    it("scroll down: 성공 응답에 direction과 실제 좌표가 실리고, 끝점 y < 시작점 y다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          direction: string;
          from: { x: number; y: number };
          to: { x: number; y: number };
        };
        expect(data.direction).toBe("down");
        expect(data.to.y).toBeLessThan(data.from.y);
      }
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });

    it("backend.swipe에 명시적 durationMs를 실어 보낸다 (실기기 실측 — duration 생략 시 플랫폼 기본값이 너무 빨라 스크롤로 인식되지 않음)", async () => {
      // 실측(2026-07-27, 시뮬레이터 D0B3A18C-...): --duration을 생략한 swipe는
      // idb 플랫폼 기본 지속시간으로 전송되는데, 이 값이 너무 빨라 Safari가
      // 스크롤로 인식하지 못했다(전/후 스크린샷 SSIM 1.000000 — 완전 동일).
      // --duration 500을 명시하자 같은 좌표에서 실제로 스크롤됨을 확인했다
      // (SSIM 0.52). `scroll`은 이 진짜 동작을 보장할 책임이 있으므로
      // (spec.md §A.2), 사용자에게 노출하지 않는 내부 기본 지속시간을
      // 명시적으로 싣는다.
      const backend = createMockBackend();

      await runCli(["scroll", "down"], backend);

      const call = (backend.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown,
        unknown,
        { durationMs?: number } | undefined,
      ];
      expect(call[3]).toBeDefined();
      expect(call[3]?.durationMs).toBeGreaterThan(0);
    });

    it("scroll up: 응답 좌표의 끝점 y가 시작점 y보다 크다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "up"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { to: { y: number }; from: { y: number } };
        expect(data.to.y).toBeGreaterThan(data.from.y);
      }
    });

    it("scroll에 미지원 방향을 주면 무동작으로 거부한다", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "diagonal"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_DIRECTION");
      expect(backend.swipe).not.toHaveBeenCalled();
      expect(backend.listDevices).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-008 — 화면 크기를 인덱스 0이 아니라 전체에서 파생한다", () => {
    it("최상위 3개 중 인덱스 1이 witness인 dump 결과로 402x874를 사용한다", async () => {
      const backend = createMockBackend([device()], MULTI_ROOT_WITH_WITNESS);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { from: { y: number }; to: { y: number } };
        // 인덱스 0(402x60)만 봤다면 y좌표가 [0,60] 안에 갇힌다 — 60을 넘는
        // 좌표는 실제 402x874 파생이 쓰였다는 증거다.
        expect(data.from.y).toBeGreaterThan(60);
        expect(data.to.y).toBeGreaterThan(60);
      }
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST-009 — --amount", () => {
    it("--amount 0.75의 이동 거리가 --amount 0.25의 정확히 3배다", async () => {
      const backendQuarter = createMockBackend();
      const backendThreeQuarters = createMockBackend();

      await runCli(["scroll", "down", "--amount", "0.25"], backendQuarter);
      await runCli(["scroll", "down", "--amount", "0.75"], backendThreeQuarters);

      const quarterCall = (backendQuarter.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { y: number },
        { y: number },
      ];
      const threeQuartersCall = (backendThreeQuarters.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { y: number },
        { y: number },
      ];

      const quarterDistance = Math.abs(quarterCall[1].y - quarterCall[2].y);
      const threeQuartersDistance = Math.abs(threeQuartersCall[1].y - threeQuartersCall[2].y);

      expect(threeQuartersDistance).toBe(quarterDistance * 3);
    });

    it("--amount 1은 허용된다 (경계값, 거부되지 않는다)", async () => {
      const backend = createMockBackend();
      const result = await runCli(["scroll", "down", "--amount", "1"], backend);
      expect(result.ok).toBe(true);
    });

    it("--amount 0.25는 허용된다 (경계값, 거부되지 않는다)", async () => {
      const backend = createMockBackend();
      const result = await runCli(["scroll", "down", "--amount", "0.25"], backend);
      expect(result.ok).toBe(true);
    });

    for (const invalidAmount of ["0", "1.5", "abc", ""]) {
      it(`--amount ${JSON.stringify(invalidAmount)} -> INVALID_AMOUNT, 무동작`, async () => {
        const backend = createMockBackend();

        const result = await runCli(["scroll", "down", "--amount", invalidAmount], backend);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_AMOUNT");
          expect(result.error.details?.["received"]).toBe(invalidAmount);
        }
        expect(backend.swipe).not.toHaveBeenCalled();
      });
    }

    it("--amount -0.5 (음수 리터럴) -> INVALID_ARGS(파서 계층), 무동작", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "down", "--amount", "-0.5"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("값 없는 단독 --amount -> INVALID_ARGS(파서 계층), 무동작", async () => {
      const backend = createMockBackend();

      const result = await runCli(["scroll", "down", "--amount"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("--amount 생략 시 기본 비율을 쓰고 무동작으로 거부하지 않는다", async () => {
      const backend = createMockBackend();
      const result = await runCli(["scroll", "down"], backend);
      expect(result.ok).toBe(true);
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC-GEST-010 — 화면 크기 불명 (퇴화 케이스)", () => {
    it("dump가 빈 배열이면 SCREEN_SIZE_UNKNOWN, 무동작", async () => {
      const backend = createMockBackend([device()], []);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("모든 bounds가 0이면 SCREEN_SIZE_UNKNOWN, 무동작", async () => {
      const backend = createMockBackend([device()], [element({ bounds: { x: 0, y: 0, w: 0, h: 0 } })]);

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-017 — witness 없는 조각 집합 (비퇴화이지만 틀린 크기)", () => {
    it("Safari 크롬-only dump 결과 -> SCREEN_SIZE_UNKNOWN, 무동작 (핵심 회귀 방지 테스트)", async () => {
      const backend = createMockBackend([device()], CHROME_ONLY_NO_WITNESS);

      const result = await runCli(["scroll", "down", "--amount", "0.8"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SCREEN_SIZE_UNKNOWN");
      expect(backend.swipe).not.toHaveBeenCalled();
    });
  });

  describe("AC-GEST-018 — 퇴화 --amount 거부 + 동작 경계 (SPEC-GESTURE-001 M6/0.4.0 amendment, F1)", () => {
    it("down: --amount 0.001 -> AMOUNT_TOO_SMALL, 무동작 (실측 재현, spec.md §C.1-⑫)", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "0.001"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
        expect(result.error.details?.["requestedRatio"]).toBe(0.001);
        expect(typeof result.error.details?.["minValidRatio"]).toBe("number");
        expect((result.error.details?.["minValidRatio"] as number)).toBeGreaterThan(0.001);
      }
      expect(backend.swipe).not.toHaveBeenCalled();
    });

    it("down: --amount 0.002 -> 정상 성공, from.y=438 to.y=436 (거리 2, 동작 경계)", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

      const result = await runCli(["scroll", "down", "--amount", "0.002"], backend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { from: { y: number }; to: { y: number } };
        expect(data.from.y).toBe(438);
        expect(data.to.y).toBe(436);
      }
      expect(backend.swipe).toHaveBeenCalledTimes(1);
    });

    it("AMOUNT_TOO_SMALL은 INVALID_AMOUNT와 다른 코드다 -- 0.001은 계약 범위(0 초과 1 이하) 안에 있다", async () => {
      const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
      const result = await runCli(["scroll", "down", "--amount", "0.001"], backend);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).not.toBe("INVALID_AMOUNT");
    });

    for (const direction of ["up", "down", "left", "right"] as const) {
      describe(`방향=${direction}`, () => {
        for (const ratio of [0.0001, 0.001, 0.0012]) {
          it(`--amount ${ratio} -> AMOUNT_TOO_SMALL, 무동작`, async () => {
            const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

            const result = await runCli(["scroll", direction, "--amount", String(ratio)], backend);

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.code).toBe("AMOUNT_TOO_SMALL");
            expect(backend.swipe).not.toHaveBeenCalled();
          });
        }

        it("minNonDegenerateRatio()가 계산한 경계 비율은 정상 성공한다 (가로·세로 임계값이 다르므로 방향별로 확인)", async () => {
          const boundaryRatio = minNonDegenerateRatio(direction, { width: 402, height: 874 });
          const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);

          const result = await runCli(["scroll", direction, "--amount", String(boundaryRatio)], backend);

          expect(result.ok).toBe(true);
          expect(backend.swipe).toHaveBeenCalledTimes(1);
        });

        it("--amount 1은 정상 성공한다 (동작 경계)", async () => {
          const backend = createMockBackend([device()], KNOWN_SCREEN_402X874);
          const result = await runCli(["scroll", direction, "--amount", "1"], backend);
          expect(result.ok).toBe(true);
        });
      });
    }
  });

  describe("AC-GEST-020 — swipe/scroll의 --duration argv 비대칭 (SPEC-GESTURE-001 M6, F2 문서 고지의 코드 쪽 anchor)", () => {
    it("swipe는 --duration 생략 시 backend.swipe에 durationMs 옵션을 전혀 싣지 않지만, scroll은 항상 내부 고정값(500ms)을 싣는다", async () => {
      const swipeBackend = createMockBackend();
      const scrollBackend = createMockBackend();

      await runCli(["swipe", "200", "700", "200", "300"], swipeBackend);
      await runCli(["scroll", "down"], scrollBackend);

      // swipe: --duration 생략 -> 옵션 인자 자체가 undefined (REQ-GEST-SWIPE-002,
      // D1 -- CLI가 숨은 기본값을 주입하지 않는다).
      expect(swipeBackend.swipe).toHaveBeenCalledWith(
        "R58N90ABCDE",
        { x: 200, y: 700 },
        { x: 200, y: 300 },
        undefined,
      );

      // scroll: 항상 SCROLL_SWIPE_DURATION_MS(500)를 명시적으로 싣는다 --
      // 편의 계층은 실제 이동을 보장할 책임이 있다(spec.md §A.2,
      // scroll.ts의 SCROLL_SWIPE_DURATION_MS 주석). 이 비대칭은 의도된
      // 것이며 REQ-GEST-SWIPE-006이 문서로 고지한다.
      const scrollCall = (scrollBackend.swipe as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown,
        unknown,
        { durationMs?: number } | undefined,
      ];
      expect(scrollCall[3]).toEqual({ durationMs: 500 });
    });
  });

  describe("AC-GEST-015 — JSON 봉투", () => {
    it("성공/오류 모든 경로에서 JSON.parse 가능한 단일 문서를 방출한다", async () => {
      const backend = createMockBackend();
      const invocations: string[][] = [
        ["scroll", "down"],
        ["scroll", "up", "--amount", "0.5"],
        ["scroll", "sideways"],
        ["scroll", "down", "--amount", "abc"],
        ["scroll", "down", "--amount", "-0.5"],
      ];

      for (const argv of invocations) {
        const result = await runCli(argv, backend);
        expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
        expect(typeof result.ok).toBe("boolean");
        expect(result.command).toBe("scroll");
      }
    });
  });

  describe("degrades a thrown backend error gracefully", () => {
    it("dumpUiHierarchy가 던지면 BACKEND_COMMAND_FAILED를 반환한다", async () => {
      const backend = createMockBackend();
      (backend.dumpUiHierarchy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("idb: simulator not booted"),
      );

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/simulator not booted/);
      }
    });

    it("swipe가 던지면 BACKEND_COMMAND_FAILED를 반환한다", async () => {
      const backend = createMockBackend();
      (backend.swipe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("idb: connection lost"));

      const result = await runCli(["scroll", "down"], backend);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
        expect(result.error.message).toMatch(/connection lost/);
      }
    });
  });
});
