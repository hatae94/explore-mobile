/**
 * Public library entry point for SPEC-ANDROID-001.
 *
 * Exposes the common element schema (M1), the device-backend interface
 * (M1), the uiautomator normalization pure function (M2), and the CLI
 * router + command layer (M3 — depends only on the `DeviceBackend`
 * interface, testable against a mock backend). The concrete adb backend
 * implementation lands in M4 and is exported from this barrel then.
 */

export type { CommonElement, ElementBounds } from "./schema/common-element.js";
export type {
  DeviceBackend,
  DeviceConnectionState,
  DeviceInfo,
} from "./schema/device-backend.js";
export { KEY_ALIASES, isKeyAlias, type KeyAlias } from "./schema/key-alias.js";
export { normalizeUiAutomatorXml } from "./normalize/uiautomator.js";
export {
  success,
  failure,
  type CommandResult,
  type CommandSuccess,
  type CommandError,
} from "./cli/envelope.js";
export { runCli } from "./cli/router.js";
