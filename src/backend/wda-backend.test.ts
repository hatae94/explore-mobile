import { describe, expect, it, vi } from "vitest";

import {
  DOUBLE_TAP_GAP_MS,
  PINCH_MOVE_DURATION_MS,
  PINCH_PAUSE_MS,
  WdaBackend,
  readPngSize,
} from "./wda-backend.js";
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

describe("자동 복구 배선 (SPEC-IOS-002 REQ-IOS2-005 — AC-IOS2-016)", () => {
  /**
   * 첫 `/actions` 요청만 500으로 답하고 그 뒤로는 정상인 WDA.
   * 권한을 잃었다가 재기동으로 돌아온 러너를 흉내낸다.
   */
  function createFlakyWda(): { http: WdaHttpClient; actionCalls: () => number } {
    const counters = { actions: 0 };
    const http: WdaHttpClient = async (url, init) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/status")) {
        return { status: 200, body: JSON.stringify({ value: { ready: true }, sessionId: "SESSION-1" }) };
      }
      if (path.endsWith("/window/size")) {
        return { status: 200, body: JSON.stringify({ value: { width: 430, height: 932 } }) };
      }
      if (path.endsWith("/screenshot")) {
        return { status: 200, body: JSON.stringify({ value: pngWithSize(1290, 2796).toString("base64") }) };
      }
      if (path.endsWith("/actions")) {
        counters.actions += 1;
        if (counters.actions === 1) {
          return { status: 500, body: JSON.stringify({ value: { error: "unknown error" } }) };
        }
        return { status: 200, body: JSON.stringify({ value: null }) };
      }
      return { status: 200, body: JSON.stringify({ value: null }) };
    };
    return { http, actionCalls: () => counters.actions };
  }

  function createRecoveringBackend(owned = true) {
    const fake = createFlakyWda();
    const calls = { relaunch: 0 };
    const backend = new WdaBackend(
      (serial) => new WdaClient(serial, fake.http, {}, noSleep),
      async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 }),
      async () => [],
      {
        isOwnedByCli: async () => owned,
        relaunch: async () => {
          calls.relaunch += 1;
          return true;
        },
      },
    );
    return { backend, calls, actionCalls: fake.actionCalls };
  }

  it("권한 오류로 실패한 탭이 재기동 뒤 재시도돼 성공한다", async () => {
    const { backend, calls, actionCalls } = createRecoveringBackend();

    await backend.tap("UDID-A", 645, 2640);

    expect(calls.relaunch).toBe(1);
    expect(actionCalls()).toBe(2); // 최초 1회 + 재시도 1회
  });

  it("복구했다는 사실이 알림으로 남는다 — 조용히 성공하지 않는다", async () => {
    const { backend } = createRecoveringBackend();

    await backend.tap("UDID-A", 645, 2640);
    const notices = backend.takeRecoveryNotices();

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("UDID-A");
    expect(notices[0]).toContain("재기동");
  });

  it("알림은 한 번 꺼내면 비워진다 — 다음 명령에 새어 나가지 않는다", async () => {
    const { backend } = createRecoveringBackend();

    await backend.tap("UDID-A", 645, 2640);
    expect(backend.takeRecoveryNotices()).toHaveLength(1);
    expect(backend.takeRecoveryNotices()).toHaveLength(0);
  });

  it("복구 경로를 주지 않으면 이 SPEC 이전과 똑같이 실패한다 (양성 대조)", async () => {
    // 위 검사들이 "복구가 일어났다"를 주장하므로, 복구 없이도 같은 결과가
    // 나오는 것은 아님을 함께 낸다. 이것이 없으면 배선이 죽어 있어도
    // 알아채지 못한다(원칙 ②·③).
    const fake = createFlakyWda();
    const backend = new WdaBackend(
      (serial) => new WdaClient(serial, fake.http, {}, noSleep),
      async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: 0 }),
      async () => [],
    );

    await expect(backend.tap("UDID-A", 645, 2640)).rejects.toBeInstanceOf(WdaCommandFailedError);
    expect(fake.actionCalls()).toBe(1);
    expect(backend.takeRecoveryNotices()).toHaveLength(0);
  });

  it("CLI가 띄우지 않은 러너면 재기동하지 않고 원래 오류를 올린다", async () => {
    const { backend, calls, actionCalls } = createRecoveringBackend(false);

    await expect(backend.tap("UDID-A", 645, 2640)).rejects.toBeInstanceOf(WdaCommandFailedError);
    expect(calls.relaunch).toBe(0);
    expect(actionCalls()).toBe(1);
    expect(backend.takeRecoveryNotices()).toHaveLength(0);
  });

  it("한 번의 탭에서 재기동은 한 번뿐이다 — 배율 도출의 스크린샷이 복구를 겹쳐 부르지 않는다", async () => {
    const { backend, calls } = createRecoveringBackend();

    await backend.tap("UDID-A", 645, 2640);

    // `tap`은 내부에서 스크린샷을 찍어 배율을 구한다. 안쪽까지 감싸면
    // 한 번의 탭에서 재기동이 두 번 일어난다(AC-IOS2-014 위반).
    expect(calls.relaunch).toBe(1);
  });
});

/** W3C actions 봉투에 실린 포인터 목록. 봉투 형태를 한 곳에서만 읽는다. */
interface ActionsEnvelope {
  actions: { type: string; id: string; parameters: unknown; actions: Record<string, unknown>[] }[];
}

function actionsRequests(requests: { url: string; method: string; body: unknown }[]): ActionsEnvelope[] {
  return requests.filter((r) => r.url.endsWith("/actions")).map((r) => r.body as ActionsEnvelope);
}

describe("performActions 포인터 N개 일반화 (plan.md §B.4 — 기존 두 경로 회귀 방지)", () => {
  // AC-GEST2-003의 양성 대조: 핀치를 위해 포인터 배열을 늘린 변경이
  // 기존 단일 포인터 경로를 깨지 않았음을 같은 파일에서 함께 확인한다.
  it("tap은 그대로 포인터 1개짜리 봉투를 낸다 (id는 finger1)", async () => {
    const { backend, requests } = createBackend();

    await backend.tap("UDID-A", 645, 2640);

    const [envelope] = actionsRequests(requests);
    expect(envelope!.actions).toHaveLength(1);
    expect(envelope!.actions[0]).toMatchObject({ type: "pointer", id: "finger1" });
    expect(envelope!.actions[0]!.actions.map((a) => a.type)).toEqual([
      "pointerMove",
      "pointerDown",
      "pause",
      "pointerUp",
    ]);
  });

  it("swipe도 그대로 포인터 1개짜리 봉투를 낸다 — 지속시간이 pause와 pointerMove 양쪽에 실린다", async () => {
    const { backend, requests } = createBackend();

    await backend.swipe("UDID-A", { x: 645, y: 2640 }, { x: 645, y: 600 }, { durationMs: 500 });

    const [envelope] = actionsRequests(requests);
    expect(envelope!.actions).toHaveLength(1);
    expect(envelope!.actions[0]!.actions).toEqual([
      { type: "pointerMove", duration: 0, x: 215, y: 880 },
      { type: "pointerDown", button: 0 },
      { type: "pause", duration: 500 },
      { type: "pointerMove", duration: 500, x: 215, y: 200 },
      { type: "pointerUp", button: 0 },
    ]);
  });
});

describe("WdaBackend.pinch (AC-GEST2-003 — REQ-GEST2-PINCH-001, REQ-GEST2-PINCH-002 ⑤)", () => {
  /** 배율 3.0 기기 기준. 스크린샷 픽셀 → WDA 포인트는 ÷3이다. */
  const FINGERS = [
    { from: { x: 405, y: 1110 }, to: { x: 270, y: 1110 } },
    { from: { x: 675, y: 1110 }, to: { x: 810, y: 1110 } },
  ] as const;

  it("두 손가락을 한 요청에 싣는다 — 요청이 2회면 그것은 핀치가 아니라 스와이프 두 번이다", async () => {
    const { backend, requests } = createBackend();

    await backend.pinch("UDID-A", [FINGERS[0], FINGERS[1]]);

    expect(actionsRequests(requests)).toHaveLength(1);
    expect(actionsRequests(requests)[0]!.actions).toHaveLength(2);
  });

  it("두 포인터의 id가 서로 다르다 — 같은 id를 두 번 실으면 손가락 하나로 해석된다", async () => {
    const { backend, requests } = createBackend();

    await backend.pinch("UDID-A", [FINGERS[0], FINGERS[1]]);

    const ids = actionsRequests(requests)[0]!.actions.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("두 포인터 모두 pointerMove → pointerDown → pause → pointerMove → pointerUp 순서다", async () => {
    const { backend, requests } = createBackend();

    await backend.pinch("UDID-A", [FINGERS[0], FINGERS[1]]);

    for (const pointer of actionsRequests(requests)[0]!.actions) {
      expect(pointer.actions.map((a) => a.type)).toEqual([
        "pointerMove",
        "pointerDown",
        "pause",
        "pointerMove",
        "pointerUp",
      ]);
    }
  });

  it("좌표는 toWdaPoint를 거친 포인트다 — 스크린샷 픽셀을 그대로 실으면 배율 3 기기에서 1/3 지점을 집는다", async () => {
    const { backend, requests } = createBackend();

    await backend.pinch("UDID-A", [FINGERS[0], FINGERS[1]]);

    const [first, second] = actionsRequests(requests)[0]!.actions;
    // 405/3=135, 270/3=90, 675/3=225, 810/3=270, 1110/3=370.
    expect(first!.actions[0]).toMatchObject({ x: 135, y: 370 });
    expect(first!.actions[3]).toMatchObject({ x: 90, y: 370 });
    expect(second!.actions[0]).toMatchObject({ x: 225, y: 370 });
    expect(second!.actions[3]).toMatchObject({ x: 270, y: 370 });
  });

  it("봉투의 두 지속시간이 이름 붙은 상수에서 명시적으로 온다 — 필드가 없으면 플랫폼 기본값에 맡긴 것이다", async () => {
    const { backend, requests } = createBackend();

    await backend.pinch("UDID-A", [FINGERS[0], FINGERS[1]]);

    // 구조 검사다: 특정 지속시간이 확대를 일으킨다고 주장하지 않으며,
    // `duration`이 **존재하고 이름 붙은 상수에서 오는가**만 본다
    // (spec.md §C.1-⑪이 700/400/200/100/50/0 ms 전부에서 동작을 관측했다).
    for (const pointer of actionsRequests(requests)[0]!.actions) {
      expect(pointer.actions[2]).toEqual({ type: "pause", duration: PINCH_PAUSE_MS });
      expect(pointer.actions[3]).toMatchObject({ type: "pointerMove", duration: PINCH_MOVE_DURATION_MS });
    }
  });
});

describe("WdaBackend.doubleTap (AC-GEST2-004 — REQ-GEST2-DTAP-001/002)", () => {
  it("한 요청에 두 탭을 싣는다 — 요청이 2회면 그것은 tap을 두 번 부른 것과 같다", async () => {
    const { backend, requests } = createBackend();

    await backend.doubleTap("UDID-A", 645, 2640);

    expect(actionsRequests(requests)).toHaveLength(1);
  });

  it("down/up 쌍이 2회이고 그 사이에 DOUBLE_TAP_GAP_MS 간격이 있다", async () => {
    const { backend, requests } = createBackend();

    await backend.doubleTap("UDID-A", 645, 2640);

    const [pointer] = actionsRequests(requests)[0]!.actions;
    expect(pointer!.actions.map((a) => a.type)).toEqual([
      "pointerMove",
      "pointerDown",
      "pointerUp",
      "pause",
      "pointerDown",
      "pointerUp",
    ]);
    expect(pointer!.actions[3]).toEqual({ type: "pause", duration: DOUBLE_TAP_GAP_MS });
  });

  it("좌표는 toWdaPoint를 거친 포인트다", async () => {
    const { backend, requests } = createBackend();

    await backend.doubleTap("UDID-A", 645, 2640);

    const [pointer] = actionsRequests(requests)[0]!.actions;
    expect(pointer!.actions[0]).toMatchObject({ x: 215, y: 880 });
  });
});
