/**
 * REQ-INPUT-005 alias -> idb HID keycode mapping (SPEC-IOS-001, M6).
 *
 * `idb ui key <code>` takes a USB HID Usage Table code, NOT an Android
 * KEYCODE — a different value space from `keycodes.ts` (Android). The
 * backend-agnostic alias vocabulary itself (`schema/key-alias.ts`) is
 * unchanged; each backend owns its own code map, exactly as
 * SPEC-ANDROID-001 intended (design.md §G).
 *
 * This is a PARTIAL map (Partial<Record<KeyAlias, number>>) because iOS
 * has no hardware equivalent for several Android-only aliases —
 * `home`/`back`/`menu`/`app_switch`/`power`/`volume_up`/`volume_down` have
 * no HID keyboard usage code, so they are intentionally absent here.
 * `IdbBackend.sendKeyEvent` rejects those with `UNSUPPORTED_KEY_ON_IOS`
 * rather than silently ignoring them (REQ-IOS-BACKEND-007).
 *
 * @MX:NOTE — partial mapping + documented gap. HID usage values below are
 * the standard USB HID Usage Tables assumption (research.md §3.2); idb's
 * exact interpretation is a Run-phase DEFER item (plan.md §B.0) — a
 * mismatch here only requires adjusting these numeric values, isolated
 * behind `IdbBackend` (no command-layer or interface impact).
 */

import type { KeyAlias } from "../schema/key-alias.js";

// @MX:TODO — confirm these HID usage values against a real `idb ui key`
// invocation (run-phase DEFER item, plan.md §B.0 / research.md §3.2). A
// mismatch only requires adjusting the numeric values below.
export const IOS_HID_KEYCODE: Partial<Record<KeyAlias, number>> = {
  enter: 40, // Keyboard Return (Enter)
  del: 42, // Keyboard Delete (Backspace)
  tab: 43, // Keyboard Tab
  right: 79, // Keyboard RightArrow
  left: 80, // Keyboard LeftArrow
  down: 81, // Keyboard DownArrow
  up: 82, // Keyboard UpArrow
  // home / back / menu / app_switch / power / volume_up / volume_down:
  // intentionally absent — no HID keyboard usage code exists for these on
  // iOS. IdbBackend.sendKeyEvent rejects them with UNSUPPORTED_KEY_ON_IOS.
};

/** Type guard: does `alias` have an iOS HID keycode mapping? */
export function hasIosHidKeycode(alias: KeyAlias): alias is keyof typeof IOS_HID_KEYCODE {
  return IOS_HID_KEYCODE[alias] !== undefined;
}
