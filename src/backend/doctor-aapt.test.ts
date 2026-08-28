/**
 * `AdbDoctor.checkAaptInstalled()` — SPEC-INSTALL-001 M4, AC-INSTALL-016.
 *
 * Injects the aapt path predicate + build-tools lister seams (constructor
 * positions 6-7) so resolution is exercised against a fake SDK layout, never
 * this host's disk. The point of the method is AC-INSTALL-016: it reports via
 * the SHARED `resolveAaptPath`, so what `doctor` shows is what `install` uses.
 */

import { join as joinPath } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AaptPathPredicate, BuildToolsLister } from "./aapt-executor.js";
import { AdbDoctor } from "./doctor.js";

const ENV_KEYS = ["PATH", "ANDROID_HOME", "ANDROID_SDK_ROOT"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Builds an AdbDoctor with only the aapt seams set (positions 6-7). */
function doctorWithAaptSeams(predicate: AaptPathPredicate, lister: BuildToolsLister): AdbDoctor {
  return new AdbDoctor(undefined, undefined, undefined, undefined, undefined, predicate, lister);
}

describe("AdbDoctor.checkAaptInstalled", () => {
  it("reports installed with the resolved path + build-tools version (AC-INSTALL-016)", async () => {
    process.env.PATH = "";
    process.env.ANDROID_HOME = "/fake/sdk";
    delete process.env.ANDROID_SDK_ROOT;
    const lister: BuildToolsLister = () => ["35.0.0", "36.1.0"];
    const winner = joinPath("/fake/sdk", "build-tools", "36.1.0", "aapt2");
    const predicate: AaptPathPredicate = (c) => c === winner;

    const result = await doctorWithAaptSeams(predicate, lister).checkAaptInstalled();

    expect(result).toEqual({
      installed: true,
      onPath: false,
      resolvedPath: winner,
      buildToolsVersion: "36.1.0",
      isAapt2: true,
    });
  });

  it("reports not-installed when no candidate matches", async () => {
    process.env.PATH = "/fake/bin";
    process.env.ANDROID_HOME = "/fake/sdk";
    delete process.env.ANDROID_SDK_ROOT;
    const lister: BuildToolsLister = () => ["36.1.0"];

    const result = await doctorWithAaptSeams(() => false, lister).checkAaptInstalled();

    expect(result).toMatchObject({ installed: false, resolvedPath: null, buildToolsVersion: null, isAapt2: null });
  });

  it("AC-INSTALL-015: SDK present but build-tools empty → not installed", async () => {
    process.env.PATH = "";
    process.env.ANDROID_HOME = "/fake/sdk";
    delete process.env.ANDROID_SDK_ROOT;

    const result = await doctorWithAaptSeams(() => false, () => []).checkAaptInstalled();

    expect(result.installed).toBe(false);
  });
});
