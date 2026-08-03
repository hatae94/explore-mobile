/**
 * `WdaBackend` — SPEC-VISION-001 M3의 iOS `DeviceBackend` 구현. 프로세스
 * 실행 기반이던 이전 iOS 백엔드를 대신하며, 제어는 WDA HTTP로, 기기 열거와
 * 앱 실행은 `xcrun devicectl`로 나뉜다 (design.md §B.1).
 *
 * 이전 백엔드와 같은 10개 메서드 표면을 구현하므로 `BackendRegistry`는
 * 교체를 알아채지 못한다 — 인터페이스가 얇게 유지된 덕이다(REQ-ARCH-003).
 *
 * ## 좌표계 (REQ-VISION-006, design.md §C)
 *
 * 호출자는 **항상 스크린샷 픽셀**을 넘긴다. WDA는 **포인트**로 받는다.
 * 배율은 상수로 박지 않고 `캡처 해상도 ÷ 창 크기`로 도출한다(AC-VISION-025/026).
 * M3 실측(iPhone16,2)에서 1290÷430 = 2796÷932 = 정확히 3.0이 나와 인용값과
 * 일치했지만, 일치했다는 사실이 하드코딩의 근거가 되지는 않는다 — 기기마다
 * 다르므로 도출 방식을 유지한다.
 *
 * @MX:ANCHOR — SPEC-VISION-001의 iOS 백엔드 구현. 모든 iOS 대상 명령이 이
 * 클래스의 메서드 표면에 의존하며, `AdbBackend`와 구조적으로 대칭이어야
 * `BackendRegistry`가 두 백엔드를 투명하게 오갈 수 있다.
 * @MX:REASON — M3는 iOS 제어 경로를 통째로 갈아끼우는 변경이다. 여기서
 * 인터페이스가 어긋나면 CLI 명령 계층 전체가 함께 깨진다.
 */

import type {
  DeviceBackend,
  DeviceInfo,
  ScreenSize,
  SwipeOptions,
  SwipePoint,
  SwipeThreshold,
} from "../schema/device-backend.js";
import { isKeyAlias, type KeyAlias } from "../schema/key-alias.js";
import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";
import { WdaClient } from "./wda-client.js";
import { WdaCommandFailedError, WdaResponseLostError, WdaUnsupportedKeyError } from "./wda-errors.js";
import { listIosDevices } from "./wda-device-list.js";

/**
 * iOS 최소 유효 스와이프 거리 — SPEC-GESTURE-001 M7이 시뮬레이터에서 **포인트**
 * 단위로 실측한 11pt의 이전(移轉)이다(재측정이 아니다).
 *
 * @MX:WARN — 이 상수는 포인트이고, `DeviceBackend`의 반환 계약은 `swipe`의
 * `SwipePoint`와 같은 좌표계 — 즉 M3부터는 **스크린샷 픽셀**이다.
 * @MX:REASON — 그래서 그대로 돌려주면 배율 3인 기기에서 실제 필요량의 1/3을
 * 보고하게 되고, 문턱 미만 스와이프는 탭으로 해석된다(auto-memory
 * `android-gesture-facts`가 기록한 그 함정). 아래에서 배율을 곱해 돌려준다.
 */
const MEASURED_MIN_EFFECTIVE_SWIPE_POINTS = 11;

/** WDA `pressButton`이 받는 버튼 이름. iOS에 물리 대응이 있는 것만 매핑한다. */
const WDA_PRESS_BUTTON: Partial<Record<KeyAlias, string>> = {
  home: "home",
  volume_up: "volumeUp",
  volume_down: "volumeDown",
};

/** PNG 시그니처 + IHDR 청크에서 폭/높이를 읽는다. 디코딩은 하지 않는다. */
export function readPngSize(bytes: Uint8Array): ScreenSize | undefined {
  // 8바이트 시그니처 + 4바이트 길이 + "IHDR" + 폭(4) + 높이(4) = 최소 24바이트
  if (bytes.length < 24) return undefined;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return undefined;
  }
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== "IHDR") return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/** 한 기기의 배율과 화면 크기 — 한 번 도출해 재사용한다. */
interface DeviceGeometry {
  /** 스크린샷 픽셀 기준 화면 크기. */
  screen: ScreenSize;
  /** WDA 포인트 기준 창 크기. */
  window: ScreenSize;
  /** 스크린샷 픽셀 ÷ WDA 포인트. */
  scale: number;
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export class WdaBackend implements DeviceBackend {
  /**
   * 기기별 배율 캐시. 배율을 매 탭마다 도출하면 탭 1회마다 스크린샷(수 MB)이
   * 한 장씩 추가돼 이 SPEC이 줄이려던 지연을 도로 만든다. 화면 크기와 창
   * 크기는 회전해도 함께 바뀌므로 비율은 유지된다.
   */
  private readonly geometry = new Map<string, DeviceGeometry>();

  constructor(
    private readonly makeClient: (serial: string) => WdaClient = (serial) => new WdaClient(serial),
    private readonly exec: ProcessExecutor = spawnProcess,
    private readonly listDevicesImpl: (exec: ProcessExecutor) => Promise<DeviceInfo[]> = listIosDevices,
  ) {}

  /** `xcrun devicectl list devices` (design.md §B.1). 시뮬레이터는 제외한다. */
  async listDevices(): Promise<DeviceInfo[]> {
    return this.listDevicesImpl(this.exec);
  }

  /**
   * `GET /screenshot` — 세션이 필요 없다(M3 실측). WDA는 base64 문자열로
   * 돌려주므로 바이트로 환원한다.
   */
  async screenshot(serial: string): Promise<Uint8Array> {
    const value = await this.makeClient(serial).request("GET", "/screenshot", undefined, { idempotent: true });
    if (typeof value !== "string" || value.length === 0) {
      throw new WdaCommandFailedError("WDA /screenshot 응답에 base64 이미지가 없습니다.");
    }
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  /**
   * W3C actions 탭 (design.md §B.2 경로, M3 실측으로 명중 확인).
   * 입력 좌표는 스크린샷 픽셀이며 여기서 포인트로 환산한다.
   */
  async tap(serial: string, x: number, y: number): Promise<void> {
    const client = this.makeClient(serial);
    const point = await this.toWdaPoint(client, serial, { x, y });
    await this.performActions(client, [
      { type: "pointerMove", duration: 0, x: point.x, y: point.y },
      { type: "pointerDown", button: 0 },
      { type: "pause", duration: 80 },
      { type: "pointerUp", button: 0 },
    ]);
  }

  /**
   * W3C actions 스와이프. `options.durationMs`는 CLI의 단일 계약 단위인
   * 밀리초이며, W3C `pause`도 밀리초이므로 단위 환산이 필요 없다.
   */
  async swipe(serial: string, from: SwipePoint, to: SwipePoint, options?: SwipeOptions): Promise<void> {
    const client = this.makeClient(serial);
    const start = await this.toWdaPoint(client, serial, from);
    const end = await this.toWdaPoint(client, serial, to);
    const holdMs = options?.durationMs ?? 300;

    await this.performActions(client, [
      { type: "pointerMove", duration: 0, x: start.x, y: start.y },
      { type: "pointerDown", button: 0 },
      { type: "pause", duration: holdMs },
      { type: "pointerMove", duration: holdMs, x: end.x, y: end.y },
      { type: "pointerUp", button: 0 },
    ]);
  }

  /**
   * `POST /session/:id/wda/keys` — 한글·이모지가 **그대로** 들어간다
   * (M3 실측: `안녕하세요 반갑습니다 🙂` 입력 후 스크린샷 확인, HTTP 200).
   *
   * 이전 iOS 백엔드가 요구하던 우회가 통째로 사라진다: 클립보드 쓰기도,
   * Command-V 코드도, ASCII/비ASCII 분기도 없다. 그 백엔드의 `inputText`는
   * 절반이 그 우회였다.
   *
   * `options.hideKeyboardAfter`는 iOS에 대응 동작이 없어 받아들이되 무시한다
   * (관측 가능한 no-op — 이전 백엔드와 같은 처리).
   */
  async inputText(serial: string, text: string, _options?: { hideKeyboardAfter?: boolean }): Promise<void> {
    const client = this.makeClient(serial);
    const sessionId = await client.sessionId();
    await client.request("POST", `/session/${sessionId}/wda/keys`, { value: [text] });
  }

  /**
   * 키 이벤트. iOS에 대응 동작이 있는 것만 보내고 나머지는 명시적으로 거부한다
   * (조용한 no-op 금지 — SPEC-IOS-001이 정한 계약을 그대로 승계한다).
   *
   * @MX:TODO — `pressButton`(home/volume) 및 `enter` 경로는 M3에서 실기기로
   * 판정하지 않았다. M6 비전 루프 검증에서 확인한다.
   */
  async sendKeyEvent(serial: string, keyName: string): Promise<void> {
    if (!isKeyAlias(keyName)) {
      throw new Error(`Unsupported key alias '${keyName}'.`);
    }
    const alias = keyName as KeyAlias;
    const client = this.makeClient(serial);
    const sessionId = await client.sessionId();

    const button = WDA_PRESS_BUTTON[alias];
    if (button !== undefined) {
      await client.request("POST", `/session/${sessionId}/wda/pressButton`, { name: button });
      return;
    }
    if (alias === "enter") {
      await client.request("POST", `/session/${sessionId}/wda/keys`, { value: ["\n"] });
      return;
    }

    throw new WdaUnsupportedKeyError(
      `키 별칭 '${alias}'에 대응하는 iOS 동작이 없습니다 — WDA는 home/volume 버튼과 문자 입력만 보낼 수 있습니다.`,
    );
  }

  /**
   * `xcrun devicectl device process launch` (M3 실측으로 동작 확인 — outcome
   * `success`, pid 반환). WDA가 아니라 devicectl인 이유: WDA의 앱 실행은
   * 세션을 그 앱에 다시 묶어 세션 수명을 흔든다.
   */
  async launchApp(serial: string, bundleId: string): Promise<void> {
    const result = await this.exec("xcrun", [
      "devicectl",
      "device",
      "process",
      "launch",
      "--quiet",
      "--device",
      serial,
      bundleId,
    ]);
    if (result.exitCode !== 0) {
      const stderrText = result.stderr.toString("utf-8").trim();
      throw new WdaCommandFailedError(
        `devicectl process launch 실패 (exit ${result.exitCode})${stderrText.length > 0 ? `: ${stderrText}` : ""}`,
      );
    }
  }

  /**
   * `POST /session/:id/wda/apps/terminate` + **상태 재확인**.
   *
   * `devicectl`에는 앱 종료 명령이 없다 — 서브커맨드는 launch/resume/
   * sendMemoryWarning/signal/suspend뿐이고 `signal`은 PID를 요구한다(M3 실측).
   * 그래서 종료는 WDA가 맡는다.
   *
   * @MX:WARN — 이 엔드포인트는 응답을 돌려주지 않는다(M3 실측 4/4 유실).
   * @MX:REASON — 그러나 효과는 적용됐다(state 4→1, 3/3 확인). 응답 유실을
   * 실패로 보고하면 성공한 종료를 실패라 말하게 되므로, 유실 시에는 앱 상태를
   * 다시 물어 확정한다. 이것은 조용한 폴백이 아니다 — 상태를 확인할 수 없으면
   * 오류를 그대로 올린다(REQ-VISION-003).
   */
  async stopApp(serial: string, bundleId: string): Promise<void> {
    const client = this.makeClient(serial);
    const sessionId = await client.sessionId();

    try {
      await client.request("POST", `/session/${sessionId}/wda/apps/terminate`, { bundleId });
      return;
    } catch (err) {
      if (!(err instanceof WdaResponseLostError)) throw err;

      // 응답만 유실됐고 WDA는 살아 있다 — 실제로 종료됐는지 물어본다.
      const state = await client.request("POST", `/session/${sessionId}/wda/apps/state`, { bundleId }, {
        idempotent: true,
      });
      if (state === APP_STATE_NOT_RUNNING) return;

      throw new WdaCommandFailedError(
        `${bundleId} 종료를 확인하지 못했습니다 — 응답이 유실됐고 재확인 결과 앱 상태가 ${String(state)}입니다 ` +
          "(1=미실행, 2=백그라운드 정지, 3=백그라운드 실행, 4=포그라운드).",
      );
    }
  }

  /**
   * SPEC-GESTURE-001 M8의 실측 상수를 이 백엔드의 좌표계로 옮겨 돌려준다.
   * 값 자체는 재측정하지 않았으므로 `basis`는 그대로 `"measured-constant"`다 —
   * 이 기기에 물어본 값이 아니라는 사실이 호출자에게 계속 보여야 한다.
   */
  async getMinEffectiveSwipeThreshold(serial: string): Promise<SwipeThreshold> {
    const { scale } = await this.ensureGeometry(this.makeClient(serial), serial);
    return {
      minEffectiveSwipePx: Math.ceil(MEASURED_MIN_EFFECTIVE_SWIPE_POINTS * scale),
      basis: "measured-constant",
    };
  }

  /**
   * 스크린샷 픽셀 기준 화면 크기 (REQ-VISION-001).
   *
   * M2에서 이전 iOS 백엔드의 `getScreenSize`가 `undefined`로 강등돼 iOS는 화면 크기
   * 출처가 없었다. M3가 그 공백을 닫는다 — `@MX:UPGRADE: M3` 표시의 이행이다.
   *
   * 조회 자체가 실패하면(WDA 미기동 등) 던진다. 답은 왔는데 읽을 수 없을 때만
   * `undefined`를 돌려주며, 호출자는 기존 계약대로 `SCREEN_SIZE_UNKNOWN`을
   * 받는다 — "도구가 답하지 못했다"와 "답을 읽을 수 없다"는 다른 사실이다.
   */
  async getScreenSize(serial: string): Promise<ScreenSize | undefined> {
    try {
      return (await this.ensureGeometry(this.makeClient(serial), serial)).screen;
    } catch (err) {
      if (err instanceof WdaCommandFailedError) return undefined;
      throw err;
    }
  }

  /** W3C actions 봉투는 한 곳에서만 만든다 — 탭과 스와이프가 같은 형태를 쓴다. */
  private async performActions(client: WdaClient, actions: unknown[]): Promise<void> {
    const sessionId = await client.sessionId();
    await client.request("POST", `/session/${sessionId}/actions`, {
      actions: [
        {
          type: "pointer",
          id: "finger1",
          parameters: { pointerType: "touch" },
          actions,
        },
      ],
    });
  }

  /** 스크린샷 픽셀 → WDA 포인트 (design.md §C.2 — 환산은 백엔드 안에서). */
  private async toWdaPoint(client: WdaClient, serial: string, point: SwipePoint): Promise<SwipePoint> {
    const { scale } = await this.ensureGeometry(client, serial);
    return { x: Math.round(point.x / scale), y: Math.round(point.y / scale) };
  }

  /**
   * 배율을 도출한다: `캡처 해상도 ÷ 창 크기`. 두 값 모두 관측 가능하다
   * (design.md §C.1). 상수는 어디에도 없다 — AC-VISION-025가 그것을 센다.
   */
  private async ensureGeometry(client: WdaClient, serial: string): Promise<DeviceGeometry> {
    const cached = this.geometry.get(serial);
    if (cached !== undefined) return cached;

    const windowValue = await client.request("GET", "/window/size", undefined, { idempotent: true });
    const windowWidth = asPositiveNumber((windowValue as { width?: unknown } | null)?.width);
    const windowHeight = asPositiveNumber((windowValue as { height?: unknown } | null)?.height);
    if (windowWidth === undefined || windowHeight === undefined) {
      throw new WdaCommandFailedError(`WDA /window/size 응답을 읽을 수 없습니다: ${JSON.stringify(windowValue)}`);
    }

    const screen = readPngSize(await this.screenshot(serial));
    if (screen === undefined) {
      throw new WdaCommandFailedError("스크린샷 PNG 헤더에서 해상도를 읽지 못해 배율을 도출할 수 없습니다.");
    }

    const geometry: DeviceGeometry = {
      screen,
      window: { width: windowWidth, height: windowHeight },
      scale: screen.width / windowWidth,
    };
    this.geometry.set(serial, geometry);
    return geometry;
  }
}

/** WDA `apps/state`의 값: 1=미실행, 2=백그라운드 정지, 3=백그라운드 실행, 4=포그라운드. */
const APP_STATE_NOT_RUNNING = 1;
