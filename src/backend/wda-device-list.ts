/**
 * iOS 기기 열거 (SPEC-VISION-001 M3, design.md §B.1).
 *
 * **기기 목록의 출처가 제어 경로에서 분리됐다.** 이전 iOS 백엔드는 하나의
 * 도구가 목록 조회와 제어를 겸했지만, WDA는 이미 특정 기기에 붙어 있는
 * 에이전트여서 목록을 주지 못한다. 그래서 열거는 `xcrun devicectl list
 * devices`가 맡는다 (research.md §1.2 ① 관측: 이전 경로 735~763ms →
 * devicectl ~52ms).
 *
 * **시뮬레이터는 제외한다** (design.md §F 잔여 1건, 사용자 결정 2026-08-03).
 * `simctl` 열거(~92ms)를 빼면 그만큼 빨라지고, spec.md §C.5가 시뮬레이터를
 * 이미 이 SPEC의 범위 밖으로 이월했다. 잃는 것은 `devices` 목록에 시뮬레이터가
 * 보이지 않는 것뿐이며, 어차피 WDA 포트는 실기기에만 붙어 있다.
 *
 * @MX:WARN — `--json-output`은 stdout이 아니라 **파일**에 쓴다.
 * @MX:REASON — `devicectl` 도움말이 "JSON output to a user-provided file on
 * disk is the ONLY supported interface for scripts/programs to consume command
 * output"이라고 명시한다(M3 실측으로 확인). 표 형식 stdout을 파싱하는 것은
 * 비지원 경로이며 열 너비가 바뀌면 조용히 깨진다.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeviceInfo } from "../schema/device-backend.js";
import type { ProcessExecutor } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";

/**
 * `devicectl list devices --json-output`의 실제 구조 (M3 실측, 2026-08-03,
 * Xcode 26.0). 관측된 경로만 선언한다.
 */
interface RawDevicectlDocument {
  result?: {
    devices?: unknown;
  };
}

interface RawDevicectlDevice {
  identifier?: unknown;
  hardwareProperties?: {
    udid?: unknown;
    marketingName?: unknown;
    productType?: unknown;
  };
  deviceProperties?: {
    osVersionNumber?: unknown;
  };
  connectionProperties?: {
    tunnelState?: unknown;
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * `tunnelState`를 공유 `DeviceConnectionState`로 3분기 매핑한다
 * (SPEC-READY-001 §B.3). `"connected"`면 `device`, 항목 자체가 없으면
 * (기기가 열거는 됐지만 연결 정보가 아예 없음) `offline`, 그 외 값이
 * **존재하면** `unavailable` — 물리적으로는 잡히지만 지금 조작할 수 없는
 * 상태다(터널 미연결, DDI 미마운트 등). "지금 조작 가능한가"만 보던 이전
 * 2분기는 "준비 안 됨"과 "미연결"을 구별하지 못했다.
 */
function mapConnectionState(tunnelState: unknown): DeviceInfo["connectionState"] {
  if (tunnelState === undefined) return "offline";
  return stringField(tunnelState).toLowerCase() === "connected" ? "device" : "unavailable";
}

/**
 * `unavailableReason`의 행동 안내 부분 — 관측된 `tunnelState` 값(소문자
 * 비교) → 안내 문구(SPEC-READY-001 §B.3.1 매핑표). 표에 없는 값은 안내를
 * 지어내지 않는다.
 *
 * **이름 충돌 주의**: 이 표의 키 `"unavailable"`은 원본 `tunnelState`
 * 값이며, 이 SPEC이 새로 정의하는 `connectionState`의 값
 * `"unavailable"`과 글자만 같고 다른 축이다.
 */
const UNAVAILABLE_REASON_GUIDANCE: Readonly<Record<string, string>> = {
  disconnected: "터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다",
  unavailable: "터널을 쓸 수 없다 — 기기 잠금 해제 후 WDA를 다시 띄운다",
  "connected (no ddi)": "개발자 디스크 이미지가 안 올라왔다 — 이미지 마운트가 필요하다",
};

/**
 * `unavailableReason` 문자열을 만든다 — `<관측된 tunnelState 원문> —
 * <행동 안내>` (매핑표에 있을 때) 또는 원문만(없을 때). 앞부분은 항상
 * 원본 값 그대로를 포함해 진단 정보를 잃지 않는다.
 */
function deriveUnavailableReason(rawTunnelState: string): string {
  const guidance = UNAVAILABLE_REASON_GUIDANCE[rawTunnelState.toLowerCase()];
  return guidance === undefined ? rawTunnelState : `${rawTunnelState} — ${guidance}`;
}

/**
 * `devicectl` JSON 문서를 `DeviceInfo[]`로 변환한다 — 순수 함수이므로
 * 실기기 없이 판정 가능하다.
 *
 * `serial`은 `hardwareProperties.udid`다. 최상위 `identifier`는 **다른 값**
 * (CoreDevice UUID)이며, `iproxy -u` / `xcodebuild -destination`이 쓰는 것은
 * udid 쪽이다(M3 실측: identifier `DEDABBFA-…` vs udid `00008130-…`).
 * identifier를 serial로 쓰면 CLI가 부르는 이름과 사용자가 WDA를 띄울 때 쓰는
 * 이름이 어긋난다.
 */
export function parseDevicectlDevices(raw: unknown): DeviceInfo[] {
  if (typeof raw !== "object" || raw === null) return [];
  const devices = (raw as RawDevicectlDocument).result?.devices;
  if (!Array.isArray(devices)) return [];

  const parsed: DeviceInfo[] = [];
  for (const entry of devices) {
    if (typeof entry !== "object" || entry === null) continue;
    const device = entry as RawDevicectlDevice;
    const serial = stringField(device.hardwareProperties?.udid);
    if (serial.length === 0) continue; // udid 없는 항목은 조작 대상이 될 수 없다

    const rawTunnelState = stringField(device.connectionProperties?.tunnelState);
    const connectionState = mapConnectionState(device.connectionProperties?.tunnelState);

    parsed.push({
      serial,
      model: stringField(device.hardwareProperties?.marketingName),
      osVersion: stringField(device.deviceProperties?.osVersionNumber),
      connectionState,
      unavailableReason: connectionState === "unavailable" ? deriveUnavailableReason(rawTunnelState) : null,
      // devicectl은 기기를 UDID 하나로만 열거한다 — 합칠 다른 전송이 없으므로
      // 항상 빈 배열이다. 필드 자체는 키 집합 고정을 위해 항상 실린다
      // (SPEC-READY-001 §B.4.1).
      alternateSerials: [],
      // devicectl은 실기기만 열거한다 — 시뮬레이터는 simctl 소관이고
      // 이 SPEC에서 제외하기로 결정했다.
      isEmulator: false,
      platform: "ios",
    });
  }
  return parsed;
}

/**
 * `xcrun devicectl list devices`를 실행하고 결과를 파싱한다.
 *
 * 파싱 불가/실행 실패는 **빈 목록**으로 강등한다 — 이전 iOS 백엔드의
 * `listDevices`가 지키던 것과 같은 계약이다(REQ-IOS-ARCH-003 정신: 한
 * 백엔드의 출력 형태 변화가 CLI 전체를 죽이지 않는다). `BackendRegistry`는
 * 이 경우 Android 기기만으로 정상 동작한다.
 */
export async function listIosDevices(exec: ProcessExecutor = spawnProcess): Promise<DeviceInfo[]> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "explore-mobile-devicectl-"));
    const outPath = join(dir, "devices.json");

    const result = await exec("xcrun", ["devicectl", "list", "devices", "--quiet", "--json-output", outPath]);
    if (result.exitCode !== 0) return [];

    return parseDevicectlDevices(JSON.parse(await readFile(outPath, "utf-8")));
  } catch {
    return [];
  } finally {
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
