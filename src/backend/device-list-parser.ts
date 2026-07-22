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

    const match = line.match(/^(\S+)\s+(\S+)(.*)$/);
    if (!match) continue;

    const serial = match[1]!;
    const state = match[2]!;
    const rest = match[3] ?? "";

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
