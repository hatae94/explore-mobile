/**
 * Pure physical-device grouping (SPEC-READY-001 §B.4/§B.4.1, M3).
 *
 * No subprocess, no I/O — takes the per-transport `DeviceInfo[]` a backend
 * already built plus a transport-serial -> `ro.serialno` identifier map, and
 * returns the physical-device-merged list. Kept separate from `AdbBackend`
 * so the grouping rule is unit-testable without a real device, mirroring
 * `device-list-parser.ts`'s pure-parser pattern (plan.md §F M3).
 */

import type { DeviceInfo } from "../schema/device-backend.js";

/**
 * Groups `devices` by physical identity using `identifiers` (transport
 * serial -> `ro.serialno`).
 *
 * A transport ABSENT from `identifiers` — because it was never queried
 * (`state !== "device"`, §D cost constraint) or the query itself failed —
 * is left as its own independent item, never merged with anything (§B.4:
 * merging on an unknown identity risks folding two different physical
 * devices into one; leaving it un-merged only lengthens the list).
 *
 * Within each identity group, the REPRESENTATIVE is the
 * lexicographically-first transport serial (§B.4 — deterministic within one
 * listing, not a claim of stability across reconnects). The remaining
 * transport serials in the group become the representative's
 * `alternateSerials`. Sorting the group before picking the representative —
 * rather than keeping the first one seen in input order — is what makes the
 * result independent of `devices`' input order (AC-READY-011).
 */
export function groupDevicesByPhysicalIdentity(
  devices: DeviceInfo[],
  identifiers: ReadonlyMap<string, string>,
): DeviceInfo[] {
  const groups = new Map<string, DeviceInfo[]>();
  const merged: DeviceInfo[] = [];

  for (const device of devices) {
    const identifier = identifiers.get(device.serial);
    if (identifier === undefined) {
      // 묻지 않았거나 물었는데 실패했다 — 독립 항목으로 남긴다(§B.4).
      merged.push({ ...device, alternateSerials: [] });
      continue;
    }
    const existing = groups.get(identifier);
    if (existing) {
      existing.push(device);
    } else {
      groups.set(identifier, [device]);
    }
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0));
    const representative = sorted[0]!;
    const alternateSerials = sorted.slice(1).map((d) => d.serial);
    merged.push({ ...representative, alternateSerials });
  }

  return merged;
}
