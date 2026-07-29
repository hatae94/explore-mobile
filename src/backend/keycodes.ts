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
 * KEYCODE_HIDE_KEYBOARD — used to dismiss the soft keyboard after `text`
 * input (REQ-INPUT-004 개정 0.4.0, plan.md §F M14). This REPLACES the
 * former `KEYCODE_ESCAPE` (111): on a Chrome web page input, ESCAPE is
 * delivered to the PAGE and interpreted as the page's own input-cancel
 * action, silently erasing the text `inputText` just typed while the
 * command still returns `{"ok":true}` (spec.md §C.4-⑰). `KEYCODE_BACK`(4)
 * dismisses the soft keyboard on BOTH a Chrome web input AND a native
 * `EditText`, in both cases WITHOUT erasing the text (spec.md §C.4-⑱) —
 * strictly superior to ESCAPE in this spot, since it fixes the web path
 * without regressing the native one. Do NOT revert this to ESCAPE because
 * "BACK is for navigation, ESCAPE sounds more correct" — that exact
 * plausible-sounding reasoning is what produced the original defect
 * (plan.md §F M14 안티패턴 목록).
 *
 * Numerically identical to `ANDROID_KEYCODE.back` (4) above, but kept as a
 * SEPARATE constant deliberately: `ANDROID_KEYCODE` is the public `key`
 * alias vocabulary (schema/key-alias.ts) exposed to users via `key <name>`,
 * while this is an internal implementation detail of `inputText`'s
 * keyboard-hide step, not a user-facing key send — the same public/internal
 * distinction the removed `KEYCODE_ESCAPE` constant already documented.
 */
export const KEYCODE_HIDE_KEYBOARD = 4;
