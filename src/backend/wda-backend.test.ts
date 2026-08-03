import { describe, expect, it, vi } from "vitest";

import { WdaBackend, readPngSize } from "./wda-backend.js";
import { WdaClient, type WdaHttpClient } from "./wda-client.js";
import { WdaCommandFailedError, WdaUnsupportedKeyError } from "./wda-errors.js";
import type { ProcessExecutor } from "./process-executor.js";

/** IHDR에 주어진 크기를 담은 최소 PNG 바이트열을 만든다. */
function pngWithSize(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/**
 * M3 실측값 그대로의 기기 (iPhone16,2): 캡처 1290×2796, 창 430×932 → 배율 3.0.
 */
const REAL_SCREEN = { pxWidth: 1290, pxHeight: 2796, ptWidth: 430, ptHeight: 932 };

interface FakeWdaOptions {
  pxWidth?: number;
  pxHeight?: number;
  ptWidth?: number;
  ptHeight?: number;
  /** `apps/state` 응답값 (1=미실행, 4=포그라운드). */
  appState?: number;
  /** 이 경로들의 요청은 연결이 끊긴 것처럼 던진다 (M3 실측 응답 유실 재현). */
  dropPaths?: string[];
}

/** WDA를 흉내내는 HTTP 실행기. 받은 요청을 전부 기록한다. */
function createFakeWda(options: FakeWdaOptions = {}): {
  http: WdaHttpClient;
  requests: { url: string; method: string; body: unknown }[];
} {
  const {
    pxWidth = REAL_SCREEN.pxWidth,
    pxHeight = REAL_SCREEN.pxHeight,
    ptWidth = REAL_SCREEN.ptWidth,
    ptHeight = REAL_SCREEN.ptHeight,
    appState = 1,
    dropPaths = [],
  } = options;

  const requests: { url: string; method: string; body: unknown }[] = [];

  const http: WdaHttpClient = async (url, init) => {
    const body: unknown = init.body === undefined ? undefined : JSON.parse(init.body);
    const path = new URL(url).pathname;

    if (!path.endsWith("/status")) requests.push({ url: path, method: init.method, body });

    if (dropPaths.some((dropped) => path.endsWith(dropped))) throw new Error("socket hang up");

    if (path.endsWith("/status")) {
      return { status: 200, body: JSON.stringify({ value: { ready: true }, sessionId: "SESSION-1" }) };
    }
    if (path.endsWith("/window/size")) {
      return { status: 200, body: JSON.stringify({ value: { width: ptWidth, height: ptHeight } }) };
    }
    if (path.endsWith("/screenshot")) {
      return { status: 200, body: JSON.stringify({ value: pngWithSize(pxWidth, pxHeight).toString("base64") }) };
    }
    if (path.endsWith("/wda/apps/state")) {
      return { status: 200, body: JSON.stringify({ value: appState }) };
    }
    return { status: 200, body: JSON.stringify({ value: null }) };
  };

  return { http, requests };
}

const noSleep = async (): Promise<void> => undefined;

function createBackend(options: FakeWdaOptions = {}, exec?: ProcessExecutor) {
  const fake = createFakeWda(options);
  const backend = new WdaBackend(
    (serial) => new WdaClient(serial, fake.http, {}, noSleep),
    exec ?? (async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 })),
    async () => [],
  );
  return { backend, requests: fake.requests };
}

describe("readPngSize", () => {
  it("IHDR에서 폭과 높이를 읽는다", () => {
    expect(readPngSize(pngWithSize(1290, 2796))).toEqual({ width: 1290, height: 2796 });
  });

  it.each([
    ["너무 짧은 바이트열", Buffer.alloc(10)],
    ["PNG 시그니처 아님", Buffer.alloc(32)],
  ])("PNG가 아닌 입력(%s)은 undefined", (_label, bytes) => {
    expect(readPngSize(bytes)).toBeUndefined();
  });
});

describe("WdaBackend 좌표계 (REQ-VISION-006, AC-VISION-025/026)", () => {
  it("배율을 캡처 해상도 ÷ 창 크기로 도출해 탭 좌표를 환산한다", async () => {
    const { backend, requests } = createBackend();

    // 호출자는 스크린샷 픽셀을 넘긴다 — 검색 필드 중심 (645, 2640).
    await backend.tap("UDID-A", 645, 2640);

    const actions = requests.find((r) => r.url.endsWith("/actions"));
    const move = (actions?.body as { actions: { actions: { x?: number; y?: number }[] }[] }).actions[0]!.actions[0]!;
    // 배율 3.0 → WDA 포인트 (215, 880). M3 실측에서 이 좌표가 명중했다.
    expect(move).toMatchObject({ x: 215, y: 880 });
  });

  it("배율이 3이 아닌 기기에서도 같은 규칙으로 환산한다 (상수가 아님)", async () => {
    const { backend, requests } = createBackend({ pxWidth: 828, pxHeight: 1792, ptWidth: 414, ptHeight: 896 });

    await backend.tap("UDID-A", 400, 800); // 배율 2.0

    const actions = requests.find((r) => r.url.endsWith("/actions"));
    const move = (actions?.body as { actions: { actions: { x?: number; y?: number }[] }[] }).actions[0]!.actions[0]!;
    expect(move).toMatchObject({ x: 200, y: 400 });
  });

  it("getScreenSize는 스크린샷 픽셀 기준 크기를 돌려준다", async () => {
    const { backend } = createBackend();
    await expect(backend.getScreenSize("UDID-A")).resolves.toEqual({ width: 1290, height: 2796 });
  });

  it("배율을 기기당 한 번만 도출한다 (탭마다 스크린샷을 찍지 않는다)", async () => {
    const { backend, requests } = createBackend();

    await backend.tap("UDID-A", 300, 300);
    await backend.tap("UDID-A", 600, 600);
    await backend.tap("UDID-A", 900, 900);

    expect(requests.filter((r) => r.url.endsWith("/screenshot"))).toHaveLength(1);
  });

  it("실측 스와이프 문턱을 이 백엔드의 좌표계(픽셀)로 올려 돌려준다", async () => {
    const { backend } = createBackend();

    // 11pt는 시뮬레이터에서 포인트로 실측된 값 — 배율 3에서는 33px이다.
    // 그대로 11을 돌려주면 실제 필요량의 1/3을 보고해 스와이프가 탭이 된다.
    await expect(backend.getMinEffectiveSwipeThreshold("UDID-A")).resolves.toEqual({
      minEffectiveSwipePx: 33,
      basis: "measured-constant",
    });
  });
});

describe("WdaBackend.inputText", () => {
  it("한글·이모지를 우회 없이 /wda/keys로 보낸다", async () => {
    const { backend, requests } = createBackend();

    await backend.inputText("UDID-A", "안녕하세요 반갑습니다 🙂");

    const keys = requests.find((r) => r.url.endsWith("/wda/keys"));
    expect(keys?.body).toEqual({ value: ["안녕하세요 반갑습니다 🙂"] });
    // 이전 iOS 백엔드가 필요로 했던 클립보드 경로가 없다는 것을 음성 대조로 고정한다.
    expect(requests.some((r) => r.url.includes("pasteboard"))).toBe(false);
  });
});

describe("WdaBackend.stopApp (M3 실측 — 응답 유실 + 효과 적용)", () => {
  it("응답이 유실돼도 앱 상태가 미실행이면 성공으로 확정한다", async () => {
    const { backend, requests } = createBackend({ dropPaths: ["/wda/apps/terminate"], appState: 1 });

    await expect(backend.stopApp("UDID-A", "com.apple.Preferences")).resolves.toBeUndefined();
    // 성공을 추정하지 않고 실제로 다시 물어봤는지 확인한다.
    expect(requests.some((r) => r.url.endsWith("/wda/apps/state"))).toBe(true);
  });

  it("응답이 유실됐는데 앱이 여전히 실행 중이면 실패로 올린다 (조용히 성공 처리하지 않는다)", async () => {
    const { backend } = createBackend({ dropPaths: ["/wda/apps/terminate"], appState: 4 });

    await expect(backend.stopApp("UDID-A", "com.apple.Preferences")).rejects.toBeInstanceOf(WdaCommandFailedError);
  });
});

describe("WdaBackend.launchApp / sendKeyEvent", () => {
  it("launchApp은 devicectl process launch를 부른다", async () => {
    const exec = vi.fn<ProcessExecutor>(async () => ({
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    }));
    const { backend } = createBackend({}, exec);

    await backend.launchApp("UDID-A", "com.apple.Preferences");

    expect(exec).toHaveBeenCalledWith("xcrun", [
      "devicectl",
      "device",
      "process",
      "launch",
      "--quiet",
      "--device",
      "UDID-A",
      "com.apple.Preferences",
    ]);
  });

  it("launchApp이 non-zero면 stderr를 실은 오류를 올린다", async () => {
    const exec: ProcessExecutor = async () => ({
      stdout: Buffer.alloc(0),
      stderr: Buffer.from("no such bundle"),
      exitCode: 1,
    });
    const { backend } = createBackend({}, exec);

    await expect(backend.launchApp("UDID-A", "com.nope")).rejects.toThrow(/no such bundle/);
  });

  it("iOS에 대응 동작이 없는 키는 조용한 no-op이 아니라 명시적 거부다", async () => {
    const { backend } = createBackend();
    await expect(backend.sendKeyEvent("UDID-A", "app_switch")).rejects.toBeInstanceOf(WdaUnsupportedKeyError);
  });

  it("home은 pressButton으로 보낸다", async () => {
    const { backend, requests } = createBackend();
    await backend.sendKeyEvent("UDID-A", "home");
    expect(requests.find((r) => r.url.endsWith("/wda/pressButton"))?.body).toEqual({ name: "home" });
  });
});
