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
 * @MX:NOTE — partial mapping + documented gap. HID usage values below follow
 * the standard USB HID Usage Tables (research.md §3.2) and were confirmed
 * against a real simulator on 2026-07-26: every alias below was accepted by
 * `idb ui key`, and `enter` was confirmed functionally (it submitted a URL and
 * navigated the page). The remaining aliases were accepted without an
 * observable side effect to assert on, so acceptance — not behavior — is what
 * was verified for them.
 */

import type { KeyAlias } from "../schema/key-alias.js";

// Confirmed against fb-idb 1.1.7 + iOS 26.0 simulator (2026-07-26).
// Not listed here but useful to know: HID 57 (Caps Lock) toggles the Korean/
// English input mode, and HID 125 (Paste) is silently ignored by iOS.
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
