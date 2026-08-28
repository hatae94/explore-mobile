/**
 * APK metadata extraction (SPEC-INSTALL-001 M2, REQ-INSTALL-002).
 *
 * Orchestrates: file-exists check → aapt resolution → `aapt2 dump badging`
 * → pure parse (`apk-metadata-parser.ts`). Every failure before the parse is
 * a DISTINCT error TYPE so the CLI layer (M3) can `instanceof`-check it and
 * map to `APK_NOT_FOUND` / `AAPT_NOT_FOUND` / `APK_INVALID` — the same
 * distinct-type pattern as `launch-errors.ts`.
 *
 * @MX:ANCHOR — this function NEVER contacts the device. It takes no device
 * executor and touches no adb path; extraction is a pure file operation
 * (REQ-INSTALL-002 / AC-INSTALL-008/009). A regression that added a device
 * call here would let a bad APK reach the device before validation.
 * @MX:REASON — the SPEC requires "추출은 파일에서 이루어지며 기기 상태에
 * 의존하지 않는다"; keeping the device executor out of this signature is the
 * structural guarantee of that requirement.
 */

import { statSync } from "node:fs";

import type { AaptExecResult, AaptExecutor, AaptPathResolution } from "./aapt-executor.js";
import { resolveAaptPath, searchedAaptPaths, spawnAapt } from "./aapt-executor.js";
import type { ApkMetadata } from "./apk-metadata-parser.js";
import { parseApkBadging } from "./apk-metadata-parser.js";

/** Thrown when the APK path does not resolve to a readable file. NO device contact occurred. */
export class ApkNotFoundError extends Error {
  constructor(public readonly apkPath: string) {
    super(`APK file not found or not readable: '${apkPath}'.`);
    this.name = "ApkNotFoundError";
  }
}

/** Thrown when no aapt/aapt2 binary could be resolved. Message names the searched locations. */
export class AaptNotFoundError extends Error {
  constructor(public readonly searchedPaths: readonly string[]) {
    super(
      "Neither aapt2 nor aapt could be found. Searched:\n" +
        searchedPaths.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "AaptNotFoundError";
  }
}

/** Thrown when aapt ran but produced no usable `package:` line (input is not a valid APK). */
export class ApkInvalidError extends Error {
  constructor(
    public readonly apkPath: string,
    public readonly aaptOutput: string,
  ) {
    super(`Not a valid APK (aapt could not read package metadata): '${apkPath}'.`);
    this.name = "ApkInvalidError";
  }
}

/** Injectable seams so extraction is unit-testable without a real aapt binary or a real file. */
export interface ApkMetadataDeps {
  /** Whether the path is an existing, readable file. Default: real `statSync`. */
  fileExists?: (path: string) => boolean;
  /** Resolves the aapt binary. Default: real `resolveAaptPath`. */
  resolveAapt?: () => AaptPathResolution;
  /** The searched-path list for the not-found message. Default: real `searchedAaptPaths`. */
  listSearchedPaths?: () => string[];
  /** Runs aapt with args. Default: real `spawnAapt`. */
  runAapt?: AaptExecutor;
}

function defaultFileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Extracts `{ packageName, versionCode, versionName }` from an APK.
 *
 * Order is load-bearing: the file-exists check and the aapt-resolution check
 * both run BEFORE any subprocess, and no device is ever contacted (the device
 * executor is not a parameter here). A missing file or missing aapt fails
 * fast with its own error type and never reaches the device.
 *
 * @throws {ApkNotFoundError}  path is not a readable file
 * @throws {AaptNotFoundError} no aapt/aapt2 binary resolved
 * @throws {ApkInvalidError}   aapt ran but the input is not a valid APK
 */
export async function extractApkMetadata(apkPath: string, deps: ApkMetadataDeps = {}): Promise<ApkMetadata> {
  const fileExists = deps.fileExists ?? defaultFileExists;
  const resolveAapt = deps.resolveAapt ?? resolveAaptPath;
  const listSearchedPaths = deps.listSearchedPaths ?? searchedAaptPaths;
  const runAapt = deps.runAapt ?? spawnAapt;

  if (!fileExists(apkPath)) {
    throw new ApkNotFoundError(apkPath);
  }

  if (resolveAapt().resolvedPath === null) {
    throw new AaptNotFoundError(listSearchedPaths());
  }

  const result: AaptExecResult = await runAapt(["dump", "badging", apkPath]);
  const combined = `${result.stdout.toString("utf-8")}\n${result.stderr.toString("utf-8")}`;

  const metadata = parseApkBadging(combined);
  if (metadata === null) {
    throw new ApkInvalidError(apkPath, combined.trim());
  }
  return metadata;
}
