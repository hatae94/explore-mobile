/**
 * Public library entry point for SPEC-ANDROID-001.
 *
 * Exposes the common element schema (M1), the device-backend interface
 * (M1), the uiautomator normalization pure function (M2), the adb backend
 * implementation (M4), and the CLI router (M3). `text`/`doctor`/`reset`
 * commands are wired but report NOT_IMPLEMENTED (M5/M6 scope).
 */

export type { CommonElement, ElementBounds } from "./schema/common-element.js";
export type {
  DeviceBackend,
  DeviceConnectionState,
  DeviceInfo,
} from "./schema/device-backend.js";
export { KEY_ALIASES, isKeyAlias, type KeyAlias } from "./schema/key-alias.js";
export { normalizeUiAutomatorXml } from "./normalize/uiautomator.js";
export { AdbBackend } from "./backend/adb-backend.js";
export type { AdbExecResult, AdbExecutor } from "./backend/adb-executor.js";
export { parseAdbDevicesList } from "./backend/device-list-parser.js";
export {
  success,
  failure,
  type CommandResult,
  type CommandSuccess,
  type CommandError,
} from "./cli/envelope.js";
export { runCli } from "./cli/router.js";
