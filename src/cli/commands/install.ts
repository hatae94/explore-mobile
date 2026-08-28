/**
 * `install <apk-path>` command (SPEC-INSTALL-001 M3, REQ-INSTALL-001).
 *
 * Orchestrates the M1/M2 pieces: extract APK metadata (file-only, no device
 * contact — `apk-metadata.ts`), resolve the target device, then install.
 * Install SUCCESS is decided by `installApp` itself (AC-INSTALL-021) — this
 * handler never calls `launchApp` / a launcher resolve to infer success,
 * because spec.md §C.2 showed those two failure shapes are indistinguishable.
 */

import {
  AaptNotFoundError,
  ApkInvalidError,
  ApkNotFoundError,
  extractApkMetadata,
} from "../../backend/apk-metadata.js";
import {
  InstallFailedError,
  InstallSignatureMismatchError,
  InstallUnsupportedOnIosError,
  InstallVersionDowngradeError,
} from "../../backend/install-errors.js";
import type { InstallPayload } from "../../schema/command-payloads.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success } from "../envelope.js";
import { backendFailure, type CommandHandler } from "./types.js";

export const installCommand: CommandHandler = async (args, source) => {
  const apkPath = args.positionals[0];
  if (!apkPath) {
    return failure("install", "INVALID_ARGS", "An APK file path is required, e.g. install ./app.apk.", {
      received: apkPath ?? null,
    });
  }

  // Metadata extraction is file-only and happens BEFORE any device contact:
  // a bad path / bad APK / missing aapt fails here without touching a device.
  let meta;
  try {
    meta = await extractApkMetadata(apkPath);
  } catch (err) {
    if (err instanceof ApkNotFoundError) return failure("install", "APK_NOT_FOUND", err.message, { apkPath });
    if (err instanceof AaptNotFoundError)
      return failure("install", "AAPT_NOT_FOUND", err.message, { searchedPaths: err.searchedPaths });
    if (err instanceof ApkInvalidError) return failure("install", "APK_INVALID", err.message, { apkPath });
    throw err; // unexpected → router degrades to INTERNAL_ERROR
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  if (!target.ok) return failure("install", target.code, target.message, target.details);

  try {
    const outcome = await target.backend.installApp(target.serial, apkPath, meta.packageName);
    return success<InstallPayload>("install", {
      serial: target.serial,
      package: meta.packageName,
      versionCode: meta.versionCode,
      versionName: meta.versionName,
      mode: outcome.mode,
    });
  } catch (err) {
    if (err instanceof InstallSignatureMismatchError)
      return failure("install", err.code, err.message, { package: meta.packageName });
    if (err instanceof InstallVersionDowngradeError)
      return failure("install", err.code, err.message, { package: meta.packageName });
    if (err instanceof InstallUnsupportedOnIosError) return failure("install", err.code, err.message);
    if (err instanceof InstallFailedError) return failure("install", err.code, err.message, { raw: err.raw });
    return backendFailure("install", err);
  }
};
