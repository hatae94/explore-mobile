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
  PinchGesture,
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
import { withRunnerRecovery, type WdaRecoveryPort } from "./wda-recovery.js";

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

/**
 * 핀치 봉투에서 `pointerDown` 뒤에 두는 정지 시간 (REQ-GEST2-PINCH-002 ⑤).
 *
 * **자격**: 이 값은 **최초로 확대를 관측한 봉투의 값**이며 **경계값도 최적값도
 * 아니다**(spec.md §C.1-①). 그리고 이 축에 대해서는 그것이 아는 전부다 —
 * **120 ms 외의 `pause` 값은 측정된 적이 없다.** 재측정(M-5)은 `pause`를
 * 120 ms에 **고정한 채** `pointerMove`만 여섯 값으로 바꿨으므로, `pause = 0`이
 * 동작하는지도 동작하지 않는지도 이 저장소는 모른다(spec.md §C.1-⑪ 및 §C.2).
 * 아래 `PINCH_MOVE_DURATION_MS`의 반증 결과를 이 상수에 옮겨 적으면 측정보다
 * 강한 주장이 된다.
 *
 * **출발점이지 문턱이 아니다.** REQ가 이 값을 주는 이유는 관측된 봉투에서
 * 시작하라는 것이지 "이 값 아래면 안 된다"가 아니다 — 경계는 측정되지 않았다.
 *
 * 상수로 두는 근거는 **결정성**이다: 지속시간을 정하지 않으면 같은 `--amount`가
 * 구현마다·플랫폼 기본값마다 다른 봉투를 만들고, 그 차이는 오류 없이 생긴다.
 */
export const PINCH_PAUSE_MS = 120;

/**
 * 핀치 봉투에서 손가락이 끝점까지 이동하는 시간 (REQ-GEST2-PINCH-002 ⑤).
 *
 * **자격**: `PINCH_PAUSE_MS`와 같이 **최초로 확대를 관측한 봉투의 값**이며
 * **경계값도 최적값도 아니다**(spec.md §C.1-①). 이 축은 재측정됐고
 * `700 / 400 / 200 / 100 / 50 / 0 ms` **여섯 값 전부에서 핀치가 동작했다**
 * (`0 ms`는 육안 2회 확인 — spec.md §C.1-⑪). 즉 이 값이 커야 동작한다는 근거는
 * 없다. 스와이프와 다른 이유: 스와이프는 시간에 걸친 이동이 있어야 탭과
 * 구별되지만, 핀치는 **두 손가락 사이 거리 변화 자체가 신호**여서 순간 이동도
 * 인식된다.
 *
 * 지속시간이 확대 **폭**에 미치는 영향은 **미측정**이다(spec.md §C.1-⑫) —
 * 그 관계에 대한 서술을 여기 적지 않는다. 확대 폭이 부족해 보이면 만질 곳은
 * 지속시간이 아니라 간격 산식이다(plan.md §B.2).
 *
 * 상수로 두는 근거는 동작 가능성이 아니라 **결정성**이다.
 */
export const PINCH_MOVE_DURATION_MS = 700;

/**
 * 더블탭의 두 탭 사이 간격 (REQ-GEST2-DTAP-002 — 이름을 REQ가 확정한다).
 *
 * **자격**: 60 ms는 **동작이 확인된 값이지 경계값이 아니다.** 측정은 이 값에서
 * 더블탭이 인식됨을 확인했을 뿐, 인식 창의 상·하한을 이분 탐색하지 않았다
 * (spec.md §C.1-②·⑧). 다른 앱·다른 iOS 버전에서 같으리라는 근거도 없으므로,
 * 이 값을 바꾸려면 같은 방식의 실기기 재확인이 필요하다.
 *
 * **CLI 표면에 노출하지 않는다.** `scroll`의 내부 고정 지속시간과 같은
 * 성격이다 — 더블탭은 "인식되는 두 번의 탭"을 보장할 책임이 있는 편의층이고,
 * 간격을 호출자에게 맡기면 그 보장이 사라진다.
 */
export const DOUBLE_TAP_GAP_MS = 60;

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

  /**
   * 이번 프로세스에서 자동 복구가 일어났다는 사실 (AC-IOS2-016).
   * 조용히 성공하면 사용자는 러너가 불안정하다는 것을 영원히 모른다(design.md §F.4).
   */
  private readonly recoveryNotices: string[] = [];

  constructor(
    private readonly makeClient: (serial: string) => WdaClient = (serial) => new WdaClient(serial),
    private readonly exec: ProcessExecutor = spawnProcess,
    private readonly listDevicesImpl: (exec: ProcessExecutor) => Promise<DeviceInfo[]> = listIosDevices,
    /**
     * 자동 복구 경로 (SPEC-IOS-002 REQ-IOS2-005). **기본은 없음**이다 —
     * 주지 않으면 이 백엔드는 이 SPEC 이전과 똑같이 동작한다. 러너 생명주기는
     * `WdaDoctor`가 소유하므로 백엔드가 직접 들지 않고 주입받는다.
     */
    private readonly recovery?: WdaRecoveryPort,
  ) {}

  /**
   * 이번 명령에서 남은 자동 복구 알림을 꺼낸다 — **꺼내면 비워진다**.
   * 라우터가 명령 종료 시 한 번 불러 결과 봉투에 싣는다(AC-IOS2-016).
   */
  takeRecoveryNotices(): string[] {
    return this.recoveryNotices.splice(0);
  }

  /**
   * 조작을 자동 복구 경로에 태운다. 복구 포트가 없으면 그대로 실행한다 —
   * 이 분기가 "기본은 이전과 동일"을 보장하는 자리다.
   *
   * @MX:ANCHOR — 여기서 감싸는 것은 **공개 메서드 하나**이며, 그 안에서 다시
   * 감싸지 않는다.
   * @MX:REASON — `tap`은 내부적으로 스크린샷을 찍어 배율을 구한다. 안쪽까지
   * 감싸면 한 번의 탭에서 재기동이 두 번 일어나 AC-IOS2-014("정확히 1회")가
   * 깨진다. 내부 경로는 감싸지 않은 `captureScreenshot`을 부른다.
   */
  private async withRecovery<T>(serial: string, operation: () => Promise<T>): Promise<T> {
    if (this.recovery === undefined) return operation();

    const outcome = await withRunnerRecovery(serial, operation, this.recovery);
    if (outcome.recovered) {
      this.recoveryNotices.push(
        `${serial}: 러너가 조작에 실패해 1회 재기동한 뒤 명령을 재시도했습니다 — 러너가 불안정할 수 있습니다.`,
      );
    }
    return outcome.value;
  }

  /** `xcrun devicectl list devices` (design.md §B.1). 시뮬레이터는 제외한다. */
  async listDevices(): Promise<DeviceInfo[]> {
    return this.listDevicesImpl(this.exec);
  }

  /**
   * `GET /screenshot` — 세션이 필요 없다(M3 실측). WDA는 base64 문자열로
   * 돌려주므로 바이트로 환원한다.
   */
  async screenshot(serial: string): Promise<Uint8Array> {
    return this.withRecovery(serial, () => this.captureScreenshot(serial));
  }

  /** 복구로 감싸지 않은 캡처 — 이미 감싸인 경로(배율 도출) 안에서 쓴다. */
  private async captureScreenshot(serial: string): Promise<Uint8Array> {
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
    return this.withRecovery(serial, () => this.tapRaw(serial, x, y));
  }

  private async tapRaw(serial: string, x: number, y: number): Promise<void> {
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
    return this.withRecovery(serial, () => this.swipeRaw(serial, from, to, options));
  }

  private async swipeRaw(serial: string, from: SwipePoint, to: SwipePoint, options?: SwipeOptions): Promise<void> {
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
    return this.withRecovery(serial, () => this.inputTextRaw(serial, text));
  }

  private async inputTextRaw(serial: string, text: string): Promise<void> {
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
    // 별칭 거부는 기기에 닿기도 전의 판정이다 — 복구 경로에 태우지 않는다.
    if (!isKeyAlias(keyName)) {
      throw new Error(`Unsupported key alias '${keyName}'.`);
    }
    return this.withRecovery(serial, () => this.sendKeyEventRaw(serial, keyName as KeyAlias));
  }

  private async sendKeyEventRaw(serial: string, alias: KeyAlias): Promise<void> {
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
    return this.withRecovery(serial, () => this.stopAppRaw(serial, bundleId));
  }

  private async stopAppRaw(serial: string, bundleId: string): Promise<void> {
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

  /**
   * W3C actions 봉투는 한 곳에서만 만든다 — 탭·스와이프·핀치·더블탭이 같은
   * 형태를 쓴다.
   *
   * **SPEC-GESTURE-002 M1 — 포인터 N개로 가법 일반화했다.** 손가락마다 하나의
   * 동작 배열을 받는 가변 인자이며, 기존 단일 포인터 호출
   * (`performActions(client, [ ... ])`)은 **한 글자도 바뀌지 않고** 그대로
   * 컴파일되고 그대로 `finger1` 하나짜리 봉투를 낸다(plan.md §B.4). 이것이
   * 가법이어야 하는 이유는 `tap`·`swipe` 두 경로가 이미 실기기에서 확증됐기
   * 때문이다 — 봉투 형태를 바꾸면 그 둘이 조용히 깨진다.
   *
   * 포인터 id는 손가락마다 달라야 한다. 같은 id를 두 번 실으면 WDA는 그것을
   * 손가락 **하나**로 해석하고, 그러면 두 포인터를 보낸 요청이 오류 없이
   * 핀치가 아닌 무언가가 된다(AC-GEST2-003).
   */
  private async performActions(client: WdaClient, ...fingers: unknown[][]): Promise<void> {
    const sessionId = await client.sessionId();
    await client.request("POST", `/session/${sessionId}/actions`, {
      actions: fingers.map((actions, index) => ({
        type: "pointer",
        id: `finger${index + 1}`,
        parameters: { pointerType: "touch" },
        actions,
      })),
    });
  }

  /**
   * 두 손가락 핀치 (REQ-GEST2-PINCH-001). 포인터 2개를 **한 봉투**에 싣는다 —
   * 손가락을 각각 별도 요청으로 보내면 그것은 핀치가 아니라 스와이프 두 번이다.
   *
   * 받는 것은 **이미 계산된 좌표**다(spec.md §A.3 E5). 방향·비율·화면 크기는
   * 이 계층에 들어오지 않으며, 기하는 `cli/commands/pinch-geometry.ts`의 순수
   * 함수가 기기 없이 판정한다.
   */
  async pinch(serial: string, fingers: [PinchGesture, PinchGesture]): Promise<void> {
    return this.withRecovery(serial, () => this.pinchRaw(serial, fingers));
  }

  private async pinchRaw(serial: string, fingers: [PinchGesture, PinchGesture]): Promise<void> {
    const client = this.makeClient(serial);
    const pointers: unknown[][] = [];

    for (const finger of fingers) {
      const start = await this.toWdaPoint(client, serial, finger.from);
      const end = await this.toWdaPoint(client, serial, finger.to);
      pointers.push([
        { type: "pointerMove", duration: 0, x: start.x, y: start.y },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: PINCH_PAUSE_MS },
        { type: "pointerMove", duration: PINCH_MOVE_DURATION_MS, x: end.x, y: end.y },
        { type: "pointerUp", button: 0 },
      ]);
    }

    await this.performActions(client, ...pointers);
  }

  /**
   * 더블탭 (REQ-GEST2-DTAP-001). down/up → pause → down/up을 **한 요청**에
   * 기술하고 기기가 직접 실행한다 — 그래서 호스트 왕복 지연이 끼어들지 않는다.
   *
   * `tap`을 두 번 부르는 것으로 대체되지 않는다: 실측된 왕복 간격은 2,531 ms로
   * 인식 창(약 250~300 ms)의 약 10배였고, 그때 일어난 일은 무반응이 아니라
   * **단일 탭 두 번**이었다(spec.md §C.1-③).
   */
  async doubleTap(serial: string, x: number, y: number): Promise<void> {
    return this.withRecovery(serial, () => this.doubleTapRaw(serial, x, y));
  }

  private async doubleTapRaw(serial: string, x: number, y: number): Promise<void> {
    const client = this.makeClient(serial);
    const point = await this.toWdaPoint(client, serial, { x, y });
    await this.performActions(client, [
      { type: "pointerMove", duration: 0, x: point.x, y: point.y },
      { type: "pointerDown", button: 0 },
      { type: "pointerUp", button: 0 },
      { type: "pause", duration: DOUBLE_TAP_GAP_MS },
      { type: "pointerDown", button: 0 },
      { type: "pointerUp", button: 0 },
    ]);
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

    // 감싸지 않은 캡처를 쓴다 — 이 함수는 이미 복구로 감싸인 명령 안에서 불린다
    // (위 `withRecovery`의 @MX:ANCHOR: 중첩 감싸기 금지).
    const screen = readPngSize(await this.captureScreenshot(serial));
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
