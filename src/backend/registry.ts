/**
 * Backend registry (REQ-IOS-ARCH-001~003, SPEC-IOS-001) — merges device
 * listings from every AVAILABLE backend (Android + iOS) and routes a
 * `--device <serial>` command to the backend that owns it, so the user
 * never specifies a platform (auto-detection).
 *
 * **SPEC-VISION-001 M5 (REQ-VISION-005)**: `BackendRegistry`는 더 이상
 * `DeviceBackend`를 구현하지 않는다. 이전 구조는 per-serial 메서드마다
 * 소유 백엔드를 다시 찾았고(`resolveOwningBackend` → `listAllDevices`),
 * 그 재조회가 명령 1회당 두 번째 기기 열거를 만들어 냈다(design.md §D.1).
 * 이제 대상 해석 단계(`cli/device-targeting.ts`)가 serial과 소유 백엔드를
 * 함께 확정하고, 명령 핸들러는 그 백엔드를 직접 호출한다 — 열거는 1회다.
 *
 * 남는 공개 표면은 셋이다:
 *   - `listAllDevices()` — 병합 목록 (열거의 유일한 발생 지점)
 *   - `backendFor(device)` — 이미 열거된 `DeviceInfo` → 소유 백엔드 (동기,
 *     추가 열거 없음)
 *   - `resolveBackend(serial)` — serial 단독으로 소유 백엔드를 찾는 비동기
 *     경로. 열거를 수반하므로 이미 목록을 들고 있다면 `backendFor`를 쓴다.
 *
 * @MX:ANCHOR — single point of serial->backend routing. Every device
 * command depends on this class resolving the correct backend.
 * @MX:REASON — REQ-IOS-ARCH-002 requires transparent cross-platform
 * routing; a regression here would silently route a command to the wrong
 * backend or fail to degrade gracefully when a platform tool is missing.
 */

import type { DeviceBackend, DeviceInfo, DevicePlatform } from "../schema/device-backend.js";

/** One backend registered with the registry, plus its availability check. */
export interface RegisteredBackend {
  platform: DevicePlatform;
  backend: DeviceBackend;
  /** Is the underlying platform tool (adb, xcrun devicectl) installed and usable right now? */
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
   * contributed, no error) — this is how "the iOS toolchain is absent" degrades to
   * "Android devices only" with no user-visible failure. A backend that
   * IS available but throws while listing (a transient platform-tool error) is
   * also caught and skipped, rather than failing the whole listing.
   *
   * **M5**: 이 메서드가 한 명령 안에서 기기가 열거되는 **유일한** 지점이다.
   * 여기를 여러 번 부르는 경로가 생기면 REQ-VISION-005가 깨진다 —
   * `cli/enumeration.test.ts`가 호출 횟수를 센다.
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
   * 이미 열거된 `DeviceInfo`의 소유 백엔드를 돌려준다 — **동기이며 기기를
   * 다시 열거하지 않는다**(SPEC-VISION-001 M5). 대상 해석 단계가 목록을
   * 이미 들고 있으므로, 거기서 이 조회를 쓰면 열거가 1회로 유지된다.
   *
   * 해당 플랫폼의 백엔드가 등록돼 있지 않으면 `undefined`. 호출자는 이를
   * 조용히 넘기지 말고 오류로 승격해야 한다 — 소유자를 모르는 채 아무
   * 백엔드로나 보내면 잘못된 기기를 조작하게 된다.
   */
  backendFor(device: DeviceInfo): DeviceBackend | undefined {
    return this.backends.find((registered) => registered.platform === device.platform)?.backend;
  }

  /**
   * Resolves which backend owns `serial`, using the merged device list so
   * the caller never needs to know which platform a serial belongs to.
   *
   * 목록을 이미 들고 있다면 `backendFor`를 써라 — 이 메서드는 열거를
   * 수반한다(M5에서 명령 경로는 전부 `backendFor`로 옮겼고, 이 메서드는
   * serial만 아는 호출자를 위해 남는다).
   *
   * @MX:NOTE — serial-collision policy (design.md §C.3, deferred to this
   * Run-phase decision): if MORE THAN ONE device across the merged list
   * shares the exact same `serial` (an extremely rare adb-serial /
   * iOS-UDID coincidence), this method refuses to pick one arbitrarily and
   * returns `null` — identical to "not found" — rather than silently
   * routing to whichever backend happened to list first.
   */
  async resolveBackend(serial: string): Promise<{ backend: DeviceBackend; device: DeviceInfo } | null> {
    const devices = await this.listAllDevices();
    const matches = devices.filter((d) => d.serial === serial);

    if (matches.length !== 1) return null;

    const device = matches[0]!;
    const backend = this.backendFor(device);
    if (!backend) return null;

    return { backend, device };
  }
}
