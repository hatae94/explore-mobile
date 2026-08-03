/**
 * Pure parser for `adb devices -l` output (REQ-DEVICES-001/002).
 *
 * No subprocess, no I/O — takes the raw stdout string `adb devices -l`
 * would produce and returns structured entries. Kept separate from
 * `AdbBackend` so the parsing logic is unit-testable with plain fixture
 * strings, mirroring the M2 normalization pure-function pattern.
 */

export interface AdbDeviceListEntry {
  serial: string;
  /** Raw adb connection state token ("device" | "offline" | "unauthorized" | ...). */
  state: string;
  /** Model string parsed from the `-l` long-format `model:<value>` field, or "" if absent. */
  model: string;
  /** Emulator vs physical device, derived from the `emulator-` serial prefix convention. */
  isEmulator: boolean;
}

const HEADER_LINE = "List of devices attached";

/**
 * adb가 내는 연결 상태 열거값.
 *
 * @MX:NOTE: serial과 state를 가르는 기준은 **구분자 문자가 아니라 이 열거값**이다.
 * `adb devices`는 탭으로 구분하지만 `adb devices -l`(이 파서가 실제로 먹는 입력)은
 * 탭 없이 공백으로만 구분하며 패딩 폭도 고정이 아니다 — 2026-08-03 실기기 `od -c`
 * 관측: 21자 serial 뒤 공백 2개, 47자 serial 뒤 공백 1개. 따라서 "탭으로 끊기"도
 * "공백 2개 이상으로 끊기"도 성립하지 않는다.
 * @MX:REASON: 무선 mDNS 이름이 충돌하면 adb가 " (2)"를 붙여 **serial 안에 공백이
 * 생긴다**. 임의 공백으로 끊으면 serial이 잘리고 그 조각이 상태로 읽혀 살아 있는
 * 기기가 `offline`로 오인된다(SPEC-ANDROID-002).
 * @MX:SPEC: SPEC-ANDROID-002 REQ-SERIAL-001
 */
const CONNECTION_STATES = [
  "device",
  "offline",
  "unauthorized",
  "bootloader",
  "host",
  "recovery",
  "sideload",
  "rescue",
  "connecting",
  "authorizing",
  "unknown",
] as const;

/**
 * 앞에 공백이 오고 뒤가 공백이나 줄끝인 **단독** 상태 토큰만 잡는다.
 * 뒤의 lookahead가 `-l` 부가 필드의 `device:pa3q`를 걸러낸다 — 콜론이 오면
 * 상태 토큰이 아니다.
 */
const STATE_TOKEN = new RegExp(`\\s(${CONNECTION_STATES.join("|")})(?=\\s|$)`);

/**
 * Parses `adb devices -l` stdout into structured entries. Never throws:
 * unrecognized lines (adb server startup banners, blank lines) are
 * skipped rather than causing a parse failure.
 */
export function parseAdbDevicesList(raw: string): AdbDeviceListEntry[] {
  if (typeof raw !== "string") return [];

  const entries: AdbDeviceListEntry[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === HEADER_LINE) continue;
    if (line.startsWith("*")) continue; // e.g. "* daemon started successfully"

    let serial: string;
    let state: string;
    let rest: string;

    const stateMatch = STATE_TOKEN.exec(line);
    if (stateMatch !== null) {
      // 상태 토큰 앞이 전부 serial이다 — 공백을 품고 있어도 온전히 남는다.
      serial = line.slice(0, stateMatch.index).trimEnd();
      state = stateMatch[1]!;
      rest = line.slice(stateMatch.index + stateMatch[0].length);
    } else {
      // 알려진 상태 토큰이 없는 줄(예: 공백을 품은 `no permissions; ...`)은
      // 기존 동작 그대로 둔다. 이 SPEC의 범위 밖이다.
      const match = line.match(/^(\S+)\s+(\S+)(.*)$/);
      if (!match) continue;

      serial = match[1]!;
      state = match[2]!;
      rest = match[3] ?? "";
    }

    if (serial.length === 0) continue;

    const modelMatch = rest.match(/\bmodel:(\S+)/);

    entries.push({
      serial,
      state,
      model: modelMatch ? modelMatch[1]! : "",
      isEmulator: serial.startsWith("emulator-"),
    });
  }

  return entries;
}
