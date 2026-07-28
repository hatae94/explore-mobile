/**
 * Backend registry (REQ-IOS-ARCH-001~003, SPEC-IOS-001) — merges device
 * listings from every AVAILABLE backend (adb + idb) and routes a
 * `--device <serial>` command to the backend that owns it, so the user
 * never specifies a platform (auto-detection).
 *
 * `BackendRegistry` ALSO implements `DeviceBackend` itself (a facade — the
 * registry-as-backend adapter, design.md §C.4's "하위호환" bridging
 * option): every per-serial method resolves the owning backend via
 * `resolveBackend` and delegates the call to it. This is what lets
 * `bin.ts` construct one `BackendRegistry` and pass it anywhere a single
 * `DeviceBackend` was previously expected (`runCli(argv, registry, doctor)`)
 * — `cli/router.ts` and the command handlers (which already only see the
 * `DeviceBackend` interface, and `device-targeting.ts`'s
 * `resolveTargetDevice`, which already operates generically over
 * `DeviceInfo[]`) need NO signature changes to gain cross-platform
 * routing, since by the time a command handler calls e.g.
 * `backend.tap(target.serial, x, y)`, `target.serial` was already
 * validated against the registry's own merged `listDevices()` output via
 * `resolveTargetDevice`.
 *
 * @MX:ANCHOR — single point of serial->backend routing. Every device
 * command depends on this class resolving the correct backend.
 * @MX:REASON — REQ-IOS-ARCH-002 requires transparent cross-platform
 * routing; a regression here would silently route a command to the wrong
 * backend or fail to degrade gracefully when a tool (adb/idb) is missing.
 */

import type { CommonElement } from "../schema/common-element.js";
import type {
  DeviceBackend,
  DeviceInfo,
  DevicePlatform,
  SwipeOptions,
  SwipePoint,
  SwipeThreshold,
} from "../schema/device-backend.js";

/** One backend registered with the registry, plus its availability check. */
export interface RegisteredBackend {
  platform: DevicePlatform;
  backend: DeviceBackend;
  /** Is the underlying tool (adb/idb) installed and usable right now? */
  isAvailable(): Promise<boolean>;
}

export class BackendRegistry implements DeviceBackend {
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

  /**
   * Resolves the owning backend for `serial` or throws — used by the
   * `DeviceBackend` facade methods below, where the caller (a command
   * handler) has already validated `serial` via `resolveTargetDevice`
   * against this registry's own `listDevices()` output, so this should
   * always succeed in practice. Throwing here (rather than silently
   * picking a fallback) surfaces a `BACKEND_COMMAND_FAILED` envelope if it
   * somehow does not, instead of misrouting to the wrong platform.
   */
  private async resolveOwningBackend(serial: string): Promise<DeviceBackend> {
    const resolved = await this.resolveBackend(serial);
    if (!resolved) {
      throw new Error(`No backend owns device serial '${serial}'.`);
    }
    return resolved.backend;
  }

  // ---- DeviceBackend facade (registry-as-backend adapter) ----

  /** Facade for `DeviceBackend.listDevices` — identical to `listAllDevices()`. */
  async listDevices(): Promise<DeviceInfo[]> {
    return this.listAllDevices();
  }

  async dumpUiHierarchy(serial: string): Promise<CommonElement[]> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.dumpUiHierarchy(serial);
  }

  async screenshot(serial: string): Promise<Uint8Array> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.screenshot(serial);
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.tap(serial, x, y);
  }

  async inputText(serial: string, text: string, options?: { hideKeyboardAfter?: boolean }): Promise<void> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.inputText(serial, text, options);
  }

  async sendKeyEvent(serial: string, keyName: string): Promise<void> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.sendKeyEvent(serial, keyName);
  }

  async launchApp(serial: string, packageId: string): Promise<void> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.launchApp(serial, packageId);
  }

  async stopApp(serial: string, packageId: string): Promise<void> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.stopApp(serial, packageId);
  }

  /**
   * Facade for `DeviceBackend.swipe` (SPEC-GESTURE-001 M1, additive 9th
   * method) — resolve-then-delegate, identical shape to `stopApp` above.
   * Without this facade, `swipe` would type-check-break `bin.ts` (which
   * passes this registry to `runCli`) AND never reach a real device in
   * production, since `bin.ts` only ever holds a `BackendRegistry`.
   */
  async swipe(serial: string, from: SwipePoint, to: SwipePoint, options?: SwipeOptions): Promise<void> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.swipe(serial, from, to, options);
  }

  /**
   * Facade for `DeviceBackend.getMinEffectiveSwipeThreshold`
   * (SPEC-GESTURE-001 M8, additive 10th method) — resolve-then-delegate,
   * identical shape to `swipe`/`stopApp` above. Without this facade, the
   * threshold would type-check-break `bin.ts` (which passes this registry
   * to `runCli`) AND never reach a real device in production, since
   * `bin.ts` only ever holds a `BackendRegistry`.
   */
  async getMinEffectiveSwipeThreshold(serial: string): Promise<SwipeThreshold> {
    const backend = await this.resolveOwningBackend(serial);
    return backend.getMinEffectiveSwipeThreshold(serial);
  }
}
