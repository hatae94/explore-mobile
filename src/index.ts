/**
 * Public library entry point for SPEC-ANDROID-001.
 *
 * Exposes the common element schema (M1), the device-backend interface
 * (M1), the uiautomator normalization pure function (M2), the CLI router
 * (M3), the adb backend implementation incl. the M5 Unicode/IME text path
 * and M7 per-serial state isolation (M4/M5/M7), and the doctor/reset
 * environment-bootstrap service (M6). All 8 milestones are implemented;
 * the M8 Claude skill wrapper lives at `.claude/skills/explore-mobile/`
 * (not part of this library's runtime exports).
 *
 * License-compliance follow-up: ADBKeyBoard (GPL-2.0) is never bundled
 * inside this MIT package — `doctor` downloads it at runtime from its
 * official GitHub release (see backend/apk-downloader.ts).
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
export { PerSerialState } from "./backend/per-serial-state.js";
export { ImeRestoreFailedError } from "./backend/ime-errors.js";
export {
  ADBKEYBOARD_PACKAGE_ID,
  ADBKEYBOARD_IME_ID,
  ADBKEYBOARD_BROADCAST_ACTION,
  ADBKEYBOARD_PINNED_VERSION,
  adbKeyboardReleaseDownloadUrl,
  adbKeyboardRawFallbackUrl,
} from "./backend/adbkeyboard.js";
export {
  createApkAcquirer,
  resolveApkCacheDir,
  resolveApkCachePath,
  type ApkAcquirer,
  type ApkAcquisitionResult,
  type FetchLike,
  type CacheIO,
} from "./backend/apk-downloader.js";
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
