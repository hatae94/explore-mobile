/**
 * Supported `key <alias>` values (REQ-INPUT-005). This is a backend-agnostic
 * CLI contract type: the alias vocabulary is part of the command surface,
 * while the numeric Android KEYCODE each alias maps to is an adb-specific
 * concern (see `src/backend/keycodes.ts`).
 */
export const KEY_ALIASES = [
  "back",
  "home",
  "enter",
  "menu",
  "app_switch",
  "up",
  "down",
  "left",
  "right",
  "del",
  "tab",
  "power",
  "volume_up",
  "volume_down",
] as const;

export type KeyAlias = (typeof KEY_ALIASES)[number];

/** Type guard: is `value` one of the enumerated REQ-INPUT-005 key aliases? */
export function isKeyAlias(value: string): value is KeyAlias {
  return (KEY_ALIASES as readonly string[]).includes(value);
}
