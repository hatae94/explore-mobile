/**
 * Basic device-targeting resolution (REQ-MULTIDEV-001/002, M3 scope; the
 * "connected" definition is REQ-MULTIDEV-001/002 개정 0.4.0 / M13).
 *
 * This resolves WHICH single device a command should target from the
 * currently connected device list plus an optional `--device <serial>`.
 * Full per-device STATE isolation (serial-namespaced temp resources,
 * concurrency safety across simultaneous commands) is M7 scope — this
 * function only answers "which serial do we pass to `adb -s`".
 *
 * **SPEC-VISION-001 M5 (REQ-VISION-005)**: 해석 결과가 serial뿐 아니라
 * **소유 백엔드까지** 포함한다(design.md §D.2). 호출자는 이미 열거해 둔
 * 목록을 넘기고, 여기서 소유자가 함께 확정되므로 백엔드 재조회(=두 번째
 * 열거)가 사라진다.
 *
 * **여기로 옮겨 온 안전장치**: serial 충돌 거부. 이전에는 `BackendRegistry`의
 * `DeviceBackend` facade가 `resolveBackend`에서 `matches.length !== 1`을
 * 확인해 잡았는데, M5가 그 facade를 제거하므로 검사도 함께 이 단계로
 * 옮긴다. 옮기지 않았다면 충돌 시 `find`가 첫 항목을 골라 **조용히 잘못된
 * 백엔드로 라우팅**됐을 것이다.
 *
 * @MX:NOTE — platform-neutral (REQ-MULTIDEV-001 개정 0.4.0): this module
 * serves BOTH backends (Android/adb, iOS/WDA) — do not narrow "connected"
 * handling to the Android path. Every `connectionState !== "device"` entry
 * observed in real usage (spec.md §C.4-⑳) was an offline iOS simulator,
 * which Xcode registers on every macOS host regardless of whether one is
 * actually booted.
 */

import type { DeviceBackend, DeviceInfo } from "../schema/device-backend.js";
import type { CommandErrorInfo } from "./envelope.js";

/**
 * 해석 단계가 소유 백엔드를 함께 확정하기 위해 필요한 최소 조회 능력
 * (`BackendRegistry.backendFor`가 이를 만족한다). 이 모듈이 registry 구현에
 * 직접 의존하지 않도록 인터페이스로만 받는다.
 *
 * 구현은 **동기여야 한다** — 여기서 기기를 다시 열거하면 M5가 없앤 중복이
 * 되살아난다.
 */
export interface BackendOwnerLookup {
  backendFor(device: DeviceInfo): DeviceBackend | undefined;
}

/**
 * 명령 핸들러가 기기를 다루기 위해 필요한 최소 능력 — 한 번 열거하고
 * (`listAllDevices`), 열거된 기기의 소유 백엔드를 찾는다(`backendFor`).
 * `BackendRegistry`가 이 형태를 그대로 만족한다.
 */
export interface DeviceSource extends BackendOwnerLookup {
  listAllDevices(): Promise<DeviceInfo[]>;
}

/**
 * 맨 `DeviceBackend`도 `DeviceSource`로 다룰 수 있게 감싼다.
 *
 * registry 없이 단일 백엔드만 쓰는 경로(테스트 대부분과 `AdbBackend` 직접
 * 사용)가 M5 이후에도 그대로 동작하게 하는 어댑터다. 감싼 소스의 소유
 * 백엔드는 언제나 자기 자신이므로 추가 열거가 발생하지 않는다.
 *
 * 판별은 구조적으로 한다 — `BackendRegistry`를 import하면 registry가
 * 이 모듈을 참조하게 될 때 순환이 생긴다.
 */
export function toDeviceSource(source: DeviceBackend | DeviceSource): DeviceSource {
  if ("listAllDevices" in source && "backendFor" in source) return source;

  const backend = source as DeviceBackend;
  return {
    listAllDevices: () => backend.listDevices(),
    backendFor: () => backend,
  };
}

export type DeviceTargetResolution =
  | { ok: true; serial: string; device: DeviceInfo; backend: DeviceBackend }
  | ({ ok: false } & CommandErrorInfo);

/**
 * A device is "connected" iff `connectionState === "device"`
 * (REQ-MULTIDEV-001 개정 0.4.0 — this is the definition that was missing
 * before 0.4.0, which let un-booted/offline entries be counted as if they
 * were targetable). `offline` and `unauthorized` entries may appear in the
 * raw list but are never connected.
 */
function connectedOnly(devices: DeviceInfo[]): DeviceInfo[] {
  return devices.filter((d) => d.connectionState === "device");
}

/**
 * `requestedSerial`이 `device`의 대표 시리얼이거나 부속 시리얼 중 하나면
 * 참이다 (SPEC-READY-001 REQ-READY-006, §B.6). 그룹핑(REQ-READY-004)이
 * 만드는 회귀를 닫는 지점 — 이 술어 하나로 조회 범위와 충돌 판정이 함께
 * 넓어진다.
 */
export function matchesRequestedSerial(device: DeviceInfo, requestedSerial: string): boolean {
  return device.serial === requestedSerial || device.alternateSerials.includes(requestedSerial);
}

/**
 * 한 시리얼이 둘 이상 기기 항목에 걸릴 때의 오류 문구 (§B.6.2). 경로 A
 * (`resolveTargetDevice`)와 경로 B(`devicesCommand`)가 이 문구를 공유한다
 * — 같은 사건("요청 시리얼이 한 기기로 특정되지 않는다")에 경로마다 다른
 * 문구를 내면 안 된다는 §B.6.3의 원칙 그대로다.
 *
 * 코드(`BACKEND_COMMAND_FAILED`)는 이전 그대로 유지한다 — 이 사건은 오늘도
 * 이 코드로 거부되던 것과 같은 사건이며(요청 시리얼이 한 기기로 특정되지
 * 않는다), 그룹핑으로 적용 범위가 넓어졌다고 해서 다른 사건이 된 것은
 * 아니다. 문구만 고친다: 이전 문구("No backend owns…")는 백엔드 소유권을
 * 말했는데, 부속 시리얼 충돌은 소유권과 무관한 사건이다.
 */
export function collidingSerialMessage(requestedSerial: string, matchCount: number): string {
  return `Serial '${requestedSerial}' matches ${matchCount} device entries (it is the representative or an alternate serial of more than one device). Run 'devices' to see the current grouping and specify an unambiguous serial.`;
}

/**
 * 확정된 기기의 소유 백엔드를 붙인다. 소유자를 알 수 없으면 실패로
 * 승격한다 — 아무 백엔드로나 보내지 않는다.
 *
 * 오류 코드는 M5 이전과 동일한 `BACKEND_COMMAND_FAILED`를 유지한다. 이전
 * 구조에서는 facade가 같은 문구로 throw했고 핸들러가 이 코드로 감쌌으므로,
 * 검출 시점만 앞당기고 사용자가 보는 계약은 바꾸지 않는다.
 */
function withOwner(device: DeviceInfo, lookup: BackendOwnerLookup): DeviceTargetResolution {
  const backend = lookup.backendFor(device);
  if (!backend) {
    return {
      ok: false,
      code: "BACKEND_COMMAND_FAILED",
      message: `No backend owns device serial '${device.serial}'.`,
      details: { serial: device.serial, platform: device.platform },
    };
  }
  return { ok: true, serial: device.serial, device, backend };
}

/**
 * Resolves the target device for a device-targeting command.
 *
 * - `--device <serial>` given, absent from the list entirely:
 *   `DEVICE_NOT_FOUND` (acceptance.md §D.1 edge case).
 * - `--device <serial>` given, matching MORE THAN ONE entry (serial
 *   collision, design.md §C.3): `BACKEND_COMMAND_FAILED` — 소유자를 임의로
 *   고르지 않는다. M5 이전 facade의 거부와 같은 코드·문구다.
 * - `--device <serial>` given, present in the list but not connected:
 *   `DEVICE_NOT_CONNECTED` — distinct from both `DEVICE_NOT_FOUND` (absent)
 *   and a late backend failure; no backend command runs for this serial
 *   (REQ-MULTIDEV-001 개정 0.4.0, AC-ANDROID-043).
 * - `--device` omitted, 0 devices connected: `NO_DEVICE` (acceptance.md
 *   §D.1); the message notes disconnected entries when the raw list is
 *   non-empty ("exists but not booted" vs "nothing at all" call for
 *   different user action).
 * - `--device` omitted, exactly 1 device connected: that device is
 *   selected, regardless of how many disconnected entries are also listed
 *   (AC-ANDROID-042 — this is the documented auto-select behavior becoming
 *   reachable again, not a new capability).
 * - `--device` omitted, >1 devices connected: `AMBIGUOUS_DEVICE`, never
 *   silently picking the first (REQ-MULTIDEV-002, AC-ANDROID-009/041).
 */
export function resolveTargetDevice(
  devices: DeviceInfo[],
  requestedSerial: string | undefined,
  lookup: BackendOwnerLookup,
): DeviceTargetResolution {
  if (requestedSerial !== undefined) {
    const matches = devices.filter((d) => matchesRequestedSerial(d, requestedSerial));

    if (matches.length === 0) {
      return {
        ok: false,
        code: "DEVICE_NOT_FOUND",
        message: `No connected device with serial '${requestedSerial}'.`,
        details: { requestedSerial, availableDevices: connectedOnly(devices) },
      };
    }

    if (matches.length > 1) {
      return {
        ok: false,
        code: "BACKEND_COMMAND_FAILED",
        message: collidingSerialMessage(requestedSerial, matches.length),
        details: { requestedSerial, collidingEntries: matches.length },
      };
    }

    const found = matches[0]!;
    if (found.connectionState !== "device") {
      return {
        ok: false,
        code: "DEVICE_NOT_CONNECTED",
        message: `Device '${requestedSerial}' exists but is not connected (connectionState: '${found.connectionState}'). Reconnect or boot it, then retry.`,
        details: { requestedSerial, connectionState: found.connectionState },
      };
    }

    return withOwner(found, lookup);
  }

  const connected = connectedOnly(devices);

  if (connected.length === 0) {
    const message =
      devices.length > 0
        ? `No connected device (${devices.length} device(s) listed, but none are connected — run 'devices' for the full list).`
        : "No device connected.";
    return { ok: false, code: "NO_DEVICE", message };
  }

  if (connected.length > 1) {
    const disconnectedCount = devices.length - connected.length;
    return {
      ok: false,
      code: "AMBIGUOUS_DEVICE",
      message: `${connected.length} devices connected; specify --device <serial>.`,
      details: {
        availableDevices: connected,
        ...(disconnectedCount > 0 ? { disconnectedCount } : {}),
      },
    };
  }

  return withOwner(connected[0]!, lookup);
}
