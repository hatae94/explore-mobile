/**
 * Public library entry point for SPEC-ANDROID-001.
 *
 * Exposes the common element schema (M1), the device-backend interface
 * (M1), the uiautomator normalization pure function (M2), the CLI router
 * (M3), the adb backend implementation incl. the M5 Unicode/IME text path
 * (M4/M5), and the doctor/reset environment-bootstrap service (M6). Full
 * command surface is live except multi-device STATE isolation (M7) and
 * the Claude skill wrapper (M8).
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
export { ImeRestoreFailedError } from "./backend/ime-errors.js";
export {
  ADBKEYBOARD_PACKAGE_ID,
  ADBKEYBOARD_IME_ID,
  ADBKEYBOARD_BROADCAST_ACTION,
  ADBKEYBOARD_PINNED_VERSION,
  resolveBundledApkPath,
} from "./backend/adbkeyboard.js";
export {
  AdbDoctor,
  type AdbInstalledCheck,
  type DaemonHealthCheck,
  type InstallAttemptResult,
  type AdbKeyboardResult,
  type ResetResult,
} from "./backend/doctor.js";
export type { ProcessExecResult, ProcessExecutor } from "./backend/process-executor.js";
export {
  success,
  failure,
  type CommandResult,
  type CommandSuccess,
  type CommandError,
} from "./cli/envelope.js";
export { runCli } from "./cli/router.js";
