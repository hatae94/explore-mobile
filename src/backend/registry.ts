/**
 * Backend registry (REQ-IOS-ARCH-001~003, SPEC-IOS-001) — merges device
 * listings from every AVAILABLE backend (adb + idb) and routes a
 * `--device <serial>` command to the backend that owns it, so the user
 * never specifies a platform (auto-detection).
 *
 * @MX:ANCHOR — single point of serial->backend routing. Every device
 * command depends on this class resolving the correct backend.
 * @MX:REASON — REQ-IOS-ARCH-002 requires transparent cross-platform
 * routing; a regression here would silently route a command to the wrong
 * backend or fail to degrade gracefully when a tool (adb/idb) is missing.
 */

import type { DeviceBackend, DeviceInfo, DevicePlatform } from "../schema/device-backend.js";

/** One backend registered with the registry, plus its availability check. */
export interface RegisteredBackend {
  platform: DevicePlatform;
  backend: DeviceBackend;
  /** Is the underlying tool (adb/idb) installed and usable right now? */
  isAvailable(): Promise<boolean>;
}

export class BackendRegistry {
  constructor(private readonly backends: RegisteredBackend[]) {}

  /**
   * Lists devices from every AVAILABLE backend, merged into one array.
   * Each backend already tags its own `DeviceInfo.platform`
   * (REQ-IOS-SCHEMA-001), so no additional tagging happens here.
   *
   * Graceful degradation (REQ-IOS-ARCH-003, AC-IOS-009): a backend whose
   * `isAvailable()` resolves false is skipped entirely (0 devices
   * contributed, no error) — this is how "idb not installed" degrades to
   * "Android devices only" with no user-visible failure. A backend that
   * IS available but throws while listing (a transient adb/idb error) is
   * also caught and skipped, rather than failing the whole listing.
   */
  async listAllDevices(): Promise<DeviceInfo[]> {
    const results: DeviceInfo[] = [];

    for (const registered of this.backends) {
      let available: boolean;
      try {
        available = await registered.isAvailable();
      } catch {
        // Defensive: an isAvailable() check itself failing is treated the
        // same as "not available" — never lets one backend's probe error
        // take down the whole listing.
        available = false;
      }
      if (!available) continue;

      try {
        const devices = await registered.backend.listDevices();
        results.push(...devices);
      } catch {
        // Graceful degradation: this backend contributes 0 devices this
        // call, the rest of the registry still resolves normally.
      }
    }

    return results;
  }

  /**
   * Resolves which backend owns `serial`, using the merged device list so
   * the caller never needs to know which platform a serial belongs to.
   *
   * @MX:NOTE — serial-collision policy (design.md §C.3, deferred to this
   * Run-phase decision): if MORE THAN ONE device across the merged list
   * shares the exact same `serial` (an extremely rare adb-serial /
   * idb-udid coincidence), this method refuses to pick one arbitrarily and
   * returns `null` — identical to "not found" — rather than silently
   * routing to whichever backend happened to list first.
   */
  async resolveBackend(serial: string): Promise<{ backend: DeviceBackend; device: DeviceInfo } | null> {
    const devices = await this.listAllDevices();
    const matches = devices.filter((d) => d.serial === serial);

    if (matches.length !== 1) return null;

    const device = matches[0]!;
    const owner = this.backends.find((registered) => registered.platform === device.platform);
    if (!owner) return null;

    return { backend: owner.backend, device };
  }
}
