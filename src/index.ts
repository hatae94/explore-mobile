/**
 * Public library entry point for SPEC-ANDROID-001.
 *
 * Exposes the device-backend interface, the CLI router, the adb backend
 * (incl. the Unicode/IME text path and per-serial state isolation), and the
 * doctor/reset environment-bootstrap service.
 *
 * The UI-recognition schema (`CommonElement`) and its normalizers are gone:
 * SPEC-VISION-001 removed the native ones with the UI-tree read path,
 * SPEC-WEBVIEW-002 removed the web DOM one, and SPEC-CLEAN-001 removed the
 * now-producerless schema itself. Screens are read by screenshot only.
 *
 * License-compliance follow-up: ADBKeyBoard (GPL-2.0) is never bundled
 * inside this MIT package — `doctor` downloads it at runtime from its
 * official GitHub release (see backend/apk-downloader.ts).
 */

export type {
  DeviceBackend,
  DeviceConnectionState,
  DeviceInfo,
  InstallMode,
  InstallOutcome,
} from "./schema/device-backend.js";
// SPEC-INSTALL-001: install command surface — a module consumer (the test
// runner) imports these to type the install result and its failure codes.
export type { InstallPayload } from "./schema/command-payloads.js";
export {
  InstallFailedError,
  InstallSignatureMismatchError,
  InstallUnsupportedOnIosError,
  InstallVersionDowngradeError,
} from "./backend/install-errors.js";
export {
  extractApkMetadata,
  AaptNotFoundError,
  ApkInvalidError,
  ApkNotFoundError,
  type ApkMetadataDeps,
} from "./backend/apk-metadata.js";
export type { ApkMetadata } from "./backend/apk-metadata-parser.js";
export { resolveAaptPath, spawnAapt, type AaptPathResolution } from "./backend/aapt-executor.js";
export type { AaptInstalledCheck } from "./backend/doctor.js";
export { KEY_ALIASES, isKeyAlias, type KeyAlias } from "./schema/key-alias.js";
export { AdbBackend } from "./backend/adb-backend.js";
export type { AdbExecResult, AdbExecutor } from "./backend/adb-executor.js";
export { parseAdbDevicesList } from "./backend/device-list-parser.js";
export { PerSerialState } from "./backend/per-serial-state.js";
export {
  ImeSessionStore,
  resolveImeSessionStorePath,
  type ImeSessionRecord,
  type ImeSessionMap,
  type ImeSessionStoreIO,
} from "./backend/ime-session-store.js";
export { AdbKeyboardInstallFailedError, ImeRestoreFailedError } from "./backend/ime-errors.js";
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
