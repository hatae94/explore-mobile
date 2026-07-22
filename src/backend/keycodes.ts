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
