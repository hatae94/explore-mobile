/**
 * REQ-INPUT-005 alias -> Android `input keyevent` KEYCODE mapping.
 *
 * This is adb/Android-specific (the numeric codes come from Android's
 * `KeyEvent` KEYCODE list), unlike the alias vocabulary itself
 * (`src/schema/key-alias.ts`), which is a backend-agnostic CLI contract.
 */

import type { KeyAlias } from "../schema/key-alias.js";

export const ANDROID_KEYCODE: Record<KeyAlias, number> = {
  back: 4,
  home: 3,
  enter: 66,
  menu: 82,
  app_switch: 187,
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  del: 67,
  tab: 61,
  power: 26,
  volume_up: 24,
  volume_down: 25,
};

/**
 * KEYCODE_ESCAPE — used to dismiss the soft keyboard after `text` input
 * (real-device UX fix: without this, the on-screen keyboard stays up and
 * the app's keyboard-avoiding layout never re-triggers). Not part of the
 * public `key` alias vocabulary (schema/key-alias.ts) since it is an
 * internal implementation detail of `inputText`, not a user-facing key
 * send.
 */
export const KEYCODE_ESCAPE = 111;
