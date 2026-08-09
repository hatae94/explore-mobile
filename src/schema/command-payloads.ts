/**
 * CLI 명령별 성공 페이로드 계약 (SPEC-CONTRACT-001).
 *
 * `product.md`는 "하나의 안정적인 JSON 입출력 계약"을 제품 정체성으로 선언한다.
 * 그런데 그 계약은 **어디에도 선언돼 있지 않았다** — `success<T>(command, data)`의
 * `T`가 호출부 객체 리터럴에서 추론되므로, 필드를 하나 지워도 컴파일과 테스트가
 * 그대로 통과했다. `SPEC-WEBVIEW-002`가 `doctor` 출력에서
 * `wdaEnvironment.webInspectorProxy`를 제거했을 때 실제로 그렇게 통과했고,
 * 필드가 사라진 사실은 사람이 CHANGELOG에 적었기 때문에만 남았다.
 *
 * 이 모듈이 그 계약을 **코드로** 만든다. 보호는 두 겹이다:
 *
 *   1. **핸들러가 필드를 빠뜨리면 컴파일 에러** — 각 `success()` 호출이 아래
 *      타입을 명시하므로 추론이 개입하지 않는다.
 *   2. **타입 자체를 고치면 테스트 실패** — `command-payloads.test.ts`가
 *      `Record<keyof T, true>` 양방향 소진 검사로 키 집합을 고정한다.
 *
 * 1겹만으로는 부족하다: 타입과 핸들러를 **함께** 고치면 조용히 통과한다.
 * 그것이 `SPEC-WEBVIEW-002`에서 일어난 일이며, 2겹은 그 경우를 잡아 필드 제거를
 * 의도적이고 눈에 보이는 변경으로 만든다.
 *
 * @MX:ANCHOR — 에이전트가 읽는 출력 계약. 이 파일의 타입 하나를 바꾸면 그
 * 명령의 JSON 출력 형태가 바뀌고, 그 출력을 파싱하는 모든 호출자에게 파급된다.
 * @MX:REASON — 이 CLI의 유일한 계약은 stdout의 JSON 본문이다(README 「출력 계약」).
 * 자유 텍스트 파싱을 금지한 대가로 JSON 형태가 계약이 되었으므로, 형태 변경은
 * 공개 API 변경과 같은 무게를 갖는다.
 * @MX:SPEC: SPEC-CONTRACT-001 REQ-CONTRACT-001
 *
 * **여기서 필드 형태를 다시 정의하지 않는다.** 전부 기존 타입의 조합이다 —
 * 같은 것을 두 곳에 적으면 두 곳이 어긋난다.
 */

import type {
  AdbInstalledCheck,
  AdbKeyboardResult,
  DaemonHealthCheck,
  InstallAttemptResult,
  ResetResult,
} from "../backend/doctor.js";
import type { DevicectlCheck, IosBringUpAttempt, IosResetResult, WdaCheck } from "../backend/wda-doctor.js";
import type { DeviceInfo, SwipePoint } from "./device-backend.js";

/**
 * `devices`의 페이로드는 `DeviceInfo[]` 그대로다 — 별도 타입을 만들지 않는다.
 * `DeviceInfo`는 이미 선언돼 있고 `device-backend.test.ts`가 키 집합을 고정하므로,
 * 이 명령만은 이 SPEC 이전부터 두 겹이 걸려 있었다.
 */
export type DevicesPayload = DeviceInfo[];

/** `launch <package>` / `stop <package>` — 두 명령이 같은 형태를 쓴다. */
export interface AppCommandPayload {
  serial: string;
  package: string;
}

/**
 * `screenshot` — `--out` 유무로 두 갈래다.
 *
 * `savedTo`는 `--out`을 준 경우에만, `pngBase64`는 주지 않은 경우에만 실린다.
 * 둘은 상호 배타적이지만 판별 유니온으로 만들지 않았다 — 그러면 호출자가
 * 판별자를 검사해야 하고, 이 SPEC은 **현재 형태를 고정할 뿐** 계약을 바꾸지
 * 않는다(REQ-CONTRACT-005). 어느 갈래에 무엇이 실리는지는 런타임 테스트가 고정한다.
 */
export interface ScreenshotPayload {
  serial: string;
  byteLength: number;
  /** `--out <path>`를 준 경우에만. 저장된 호스트 경로. */
  savedTo?: string;
  /** `--out`을 주지 않은 경우에만. PNG 원본을 base64로 인코딩한 문자열. */
  pngBase64?: string;
}

/** `tap <x> <y>` — 실제로 보낸 좌표를 되돌려준다. */
export interface TapPayload {
  serial: string;
  x: number;
  y: number;
}

/** `key <alias>` — 보낸 별칭을 되돌려준다. */
export interface KeyPayload {
  serial: string;
  key: string;
}

/**
 * `swipe <x1> <y1> <x2> <y2> [--duration <ms>]`.
 *
 * `durationMs`는 `--duration`을 준 경우에만 실린다 — 생략 시 플랫폼 기본값이
 * 쓰이는데, 그 값을 CLI가 알지 못하므로 아는 척하지 않는다.
 */
export interface SwipePayload {
  serial: string;
  from: SwipePoint;
  to: SwipePoint;
  durationMs?: number;
}

/**
 * `scroll <up|down|left|right> [--amount <ratio>]`.
 *
 * `from`/`to`는 CLI가 화면 크기와 비율에서 **계산한** 좌표다. 호출자가 이 값을
 * 보고 실제로 어디를 쓸었는지 알 수 있어야 하므로 응답에 싣는다.
 */
export interface ScrollPayload {
  serial: string;
  direction: string;
  from: SwipePoint;
  to: SwipePoint;
}

/**
 * `text "<string>"`.
 *
 * 입력 문자열은 되돌려주지 않는다 — 성공 여부만 알리며, 실제로 입력됐는지는
 * 스크린샷으로 판정해야 한다(`text`는 포커스된 편집 요소가 없으면 `ok:true`인
 * 채로 입력이 사라진다 — README 「알려진 함정」).
 */
export interface TextPayload {
  serial: string;
}

/**
 * `reset` / `doctor --clean` — 플랫폼별 결과가 다르다.
 *
 * Android는 IME/APK 정리 결과를, iOS는 정리할 상태가 없다는 사실을 돌려준다.
 * 두 결과 타입의 필드는 겹치지 않으므로 각각 선택 필드로 합친다.
 */
export type ResetPayload = { serial: string } & Partial<ResetResult> & Partial<IosResetResult>;

/** `doctor`의 iOS 전용 환경 보고. */
export interface WdaEnvironmentReport {
  devicectl: DevicectlCheck;
  wda: WdaCheck;
  /**
   * 준비 자동화 시도 (SPEC-IOS-002). `--yes`가 있을 때만 실린다 — 없으면
   * 시도하지 않으므로 이 키 자체가 없다. Android의 `installAttempt`와 같은 성격.
   */
  bringUp?: IosBringUpAttempt;
}

/** `doctor`의 ADBKeyBoard 항목 — 건너뛴 경우와 실제 수행한 경우. */
export type DoctorAdbKeyboardReport =
  | { skipped: true; reason: string }
  | ({ skipped: false } & AdbKeyboardResult);

/**
 * `doctor [--yes|--install] [--clean]` — 반환 지점이 5곳이다.
 *
 * | 갈래 | 실린 선택 필드 |
 * |---|---|
 * | iOS 대상        | `wdaEnvironment` |
 * | adb 미설치      | `installAttempt` |
 * | 데몬 비정상     | (없음) |
 * | 대상 미해결     | (없음) |
 * | 정상            | (없음) |
 *
 * `adb`/`daemon`/`devices`/`adbKeyboard` 넷은 **어느 갈래에서도 항상** 실린다.
 * 나머지 둘은 갈래에 따라 실리므로 선택 필드다 — 어느 갈래에 무엇이 실리는지는
 * 타입이 아니라 런타임 테스트가 고정한다(REQ-CONTRACT-004). 이번에 조용히
 * 사라졌던 필드가 바로 이런 선택 필드였다.
 */
export interface DoctorPayload {
  adb: AdbInstalledCheck;
  daemon: DaemonHealthCheck;
  devices: DeviceInfo[];
  adbKeyboard: DoctorAdbKeyboardReport;
  /** adb 미설치 갈래에서만. 자동 설치 시도 결과. */
  installAttempt?: InstallAttemptResult;
  /** iOS 대상 갈래에서만. */
  wdaEnvironment?: WdaEnvironmentReport;
}
