/**
 * `AdbBackend.installApp` — SPEC-INSTALL-001 M3, AC-INSTALL-019/024/025.
 *
 * The adb executor is mocked so mode-detection and failure-classification are
 * tested without a device. The load-bearing test is AC-INSTALL-025: an
 * install response with exitCode 0 but a `Failure` token is a failure.
 */

import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

import { AdbBackend } from "./adb-backend.js";
import type { AdbExecResult } from "./adb-executor.js";
import {
  InstallFailedError,
  InstallSignatureMismatchError,
  InstallVersionDowngradeError,
} from "./install-errors.js";

function res(stdout: string, exitCode = 0, stderr = ""): AdbExecResult {
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}

/**
 * Builds an AdbBackend whose exec answers the pm-list query then the install
 * query in order. `installed` decides what `pm list packages` returns.
 */
function backendFor(installed: boolean, installResult: AdbExecResult) {
  const exec = vi
    .fn()
    .mockResolvedValueOnce(res(installed ? "package:com.hatae.moyura\n" : "")) // pm list
    .mockResolvedValueOnce(installResult); // install
  const backend = new AdbBackend(exec);
  return { backend, exec };
}

describe("AdbBackend.installApp", () => {
  it("fresh install: package absent pre-install → mode 'fresh'", async () => {
    const { backend, exec } = backendFor(false, res("Success\n"));
    const outcome = await backend.installApp("S", "/app.apk", "com.hatae.moyura");
    expect(outcome).toEqual({ mode: "fresh" });
    // pm list read happened BEFORE install (order-sensitive: mode = pre-state).
    expect(exec.mock.calls[0]).toEqual([["-s", "S", "shell", "pm", "list", "packages", "com.hatae.moyura"]]);
    expect(exec.mock.calls[1]).toEqual([["-s", "S", "install", "-r", "/app.apk"]]);
  });

  it("AC-INSTALL-019: package present pre-install → mode 'upgrade'", async () => {
    const { backend } = backendFor(true, res("Success\n"));
    const outcome = await backend.installApp("S", "/app.apk", "com.hatae.moyura");
    expect(outcome).toEqual({ mode: "upgrade" });
  });

  it("AC-INSTALL-025: exitCode 0 but a Failure token → throws (never a false success)", async () => {
    const { backend } = backendFor(false, res("Failure [INSTALL_FAILED_INTERNAL_ERROR]", 0));
    await expect(backend.installApp("S", "/app.apk", "com.x")).rejects.toBeInstanceOf(InstallFailedError);
  });

  it("classifies a signature mismatch", async () => {
    const { backend } = backendFor(
      true,
      res("", 1, "adb: failed to install: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]"),
    );
    await expect(backend.installApp("S", "/app.apk", "com.x")).rejects.toBeInstanceOf(
      InstallSignatureMismatchError,
    );
  });

  it("classifies a downgrade", async () => {
    const { backend } = backendFor(true, res("", 1, "Failure [INSTALL_FAILED_VERSION_DOWNGRADE]"));
    await expect(backend.installApp("S", "/app.apk", "com.x")).rejects.toBeInstanceOf(
      InstallVersionDowngradeError,
    );
  });

  it("AC-INSTALL-024: an unclassified failure preserves the raw output", async () => {
    const { backend } = backendFor(false, res("", 1, "Failure [BRAND_NEW_ERROR]"));
    const err = await backend.installApp("S", "/app.apk", "com.x").catch((e) => e);
    expect(err).toBeInstanceOf(InstallFailedError);
    expect((err as InstallFailedError).raw).toContain("BRAND_NEW_ERROR");
  });

  it("an unreadable pm-list (non-zero) is treated as not-installed → fresh, install still authoritative", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce(res("error", 1)) // pm list fails
      .mockResolvedValueOnce(res("Success\n"));
    const backend = new AdbBackend(exec);
    const outcome = await backend.installApp("S", "/app.apk", "com.x");
    expect(outcome).toEqual({ mode: "fresh" });
  });
});
