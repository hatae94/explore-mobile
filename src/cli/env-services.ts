/**
 * Per-platform environment-bootstrap service holder (REQ-IOS-DOCTOR-003,
 * SPEC-IOS-001) — replaces the single, Android-only `doctor: AdbDoctor`
 * `CommandHandler` parameter with a small holder carrying BOTH services,
 * so `doctor`/`reset` can resolve the target device's platform and
 * dispatch to the matching one.
 *
 * `AdbDoctor` and `IdbDoctor` intentionally do NOT share a common
 * interface — their method surfaces differ (e.g. `ensureAdbKeyboard` has
 * no iOS analogue; `resetDevice`'s signature differs by one parameter).
 * Forcing an artificial shared interface across two genuinely different
 * environment-bootstrap services would obscure more than it clarifies, so
 * `doctor.ts`/`reset.ts` branch explicitly on the resolved device's
 * `platform` and call the matching concrete service directly.
 *
 * @MX:NOTE — this is a plain data holder, not a class — there is no
 * behavior to encapsulate beyond "hold one of each service".
 */

import type { AdbDoctor } from "../backend/doctor.js";
import type { IdbDoctor } from "../backend/idb-doctor.js";

export interface EnvServices {
  android: AdbDoctor;
  ios: IdbDoctor;
}
