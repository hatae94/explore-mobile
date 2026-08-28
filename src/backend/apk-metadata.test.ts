/**
 * `extractApkMetadata()` — SPEC-INSTALL-001 M2, AC-INSTALL-008/010.
 *
 * All seams are injected. The load-bearing negative controls:
 *  - AC-INSTALL-008: a missing file fails BEFORE any aapt run.
 *  - AC-INSTALL-010: the result follows aapt OUTPUT, never the filename — a
 *    filename-parsing implementation would fail this test.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

import type { AaptExecResult, AaptPathResolution } from "./aapt-executor.js";
import {
  AaptNotFoundError,
  ApkInvalidError,
  ApkNotFoundError,
  extractApkMetadata,
} from "./apk-metadata.js";

const RESOLVED: AaptPathResolution = {
  onPath: false,
  resolvedPath: "/fake/build-tools/36.1.0/aapt2",
  buildToolsVersion: "36.1.0",
  isAapt2: true,
};

const NOT_RESOLVED: AaptPathResolution = {
  onPath: false,
  resolvedPath: null,
  buildToolsVersion: null,
  isAapt2: null,
};

function aaptResult(stdout: string): AaptExecResult {
  return { stdout: Buffer.from(stdout, "utf-8"), stderr: Buffer.from(""), exitCode: 0 };
}

const REAL_BADGING =
  "package: name='com.hatae.moyura' versionCode='1' versionName='1.0.0' compileSdkVersion='36'\n";

describe("extractApkMetadata", () => {
  it("extracts metadata from a valid APK via injected aapt output", async () => {
    const runAapt = vi.fn().mockResolvedValue(aaptResult(REAL_BADGING));

    const meta = await extractApkMetadata("/some/app.apk", {
      fileExists: () => true,
      resolveAapt: () => RESOLVED,
      runAapt,
    });

    expect(meta).toEqual({ packageName: "com.hatae.moyura", versionCode: "1", versionName: "1.0.0" });
    expect(runAapt).toHaveBeenCalledWith(["dump", "badging", "/some/app.apk"]);
  });

  it("AC-INSTALL-008: a missing file throws ApkNotFoundError and NEVER runs aapt", async () => {
    const runAapt = vi.fn();

    await expect(
      extractApkMetadata("/no/such.apk", { fileExists: () => false, resolveAapt: () => RESOLVED, runAapt }),
    ).rejects.toBeInstanceOf(ApkNotFoundError);

    // The load-bearing assertion: aapt (and therefore any downstream device work) was never reached.
    expect(runAapt).not.toHaveBeenCalled();
  });

  it("AC-INSTALL-010: result follows aapt OUTPUT, not the filename (negative control)", async () => {
    // Filename says 'moyura' but aapt reports a different package — the output must win.
    const runAapt = vi.fn().mockResolvedValue(aaptResult("package: name='com.other.pkg' versionCode='7'"));

    const meta = await extractApkMetadata("/downloads/moyura.apk", {
      fileExists: () => true,
      resolveAapt: () => RESOLVED,
      runAapt,
    });

    expect(meta.packageName).toBe("com.other.pkg");
    expect(meta.packageName).not.toContain("moyura");
  });

  it("throws AaptNotFoundError (with searched paths) when no aapt resolves — and does not run aapt", async () => {
    const runAapt = vi.fn();

    const error = await extractApkMetadata("/some/app.apk", {
      fileExists: () => true,
      resolveAapt: () => NOT_RESOLVED,
      listSearchedPaths: () => ["/a/aapt2", "/b/aapt"],
      runAapt,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AaptNotFoundError);
    expect((error as AaptNotFoundError).message).toContain("/a/aapt2");
    expect(runAapt).not.toHaveBeenCalled();
  });

  it("throws ApkInvalidError when aapt runs but emits no package line", async () => {
    const runAapt = vi
      .fn()
      .mockResolvedValue(aaptResult("/x.txt: error: failed opening zip: Invalid file."));

    await expect(
      extractApkMetadata("/x.txt", { fileExists: () => true, resolveAapt: () => RESOLVED, runAapt }),
    ).rejects.toBeInstanceOf(ApkInvalidError);
  });
});
