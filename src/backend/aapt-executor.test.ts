/**
 * `resolveAaptPath()` — SPEC-INSTALL-001 M1, AC-INSTALL-012/013/014/015.
 *
 * Every test injects an explicit predicate + build-tools lister (the M1 test
 * seams), which per `resolveAaptPath()`'s contract always bypass the
 * process-wide memoization — each test is a fresh, isolated computation
 * regardless of this real host's SDK.
 */

import { homedir } from "node:os";
import { delimiter as pathDelimiter, join as joinPath } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AaptPathPredicate, BuildToolsLister } from "./aapt-executor.js";
import { resolveAaptPath, searchedAaptPaths } from "./aapt-executor.js";

const ENV_KEYS = ["PATH", "ANDROID_HOME", "ANDROID_SDK_ROOT"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

let savedEnv: Partial<Record<EnvKey, string | undefined>>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const noVersions: BuildToolsLister = () => [];

describe("resolveAaptPath — candidate search order (AC-INSTALL-012)", () => {
  it("candidate 1 — PATH aapt2 wins, marked onPath", () => {
    process.env.PATH = "/fake/bin";
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    const winner = joinPath("/fake/bin", "aapt2");
    const predicate: AaptPathPredicate = (c) => c === winner;

    const result = resolveAaptPath(predicate, noVersions);

    expect(result).toEqual({ onPath: true, resolvedPath: winner, buildToolsVersion: null, isAapt2: true });
  });

  it("candidate 2 — $ANDROID_HOME/build-tools/<highest>/aapt2", () => {
    process.env.PATH = "";
    process.env.ANDROID_HOME = "/fake/android-home";
    delete process.env.ANDROID_SDK_ROOT;
    const lister: BuildToolsLister = (dir) =>
      dir === joinPath("/fake/android-home", "build-tools") ? ["35.0.0", "36.1.0"] : [];
    const winner = joinPath("/fake/android-home", "build-tools", "36.1.0", "aapt2");
    const predicate: AaptPathPredicate = (c) => c === winner;

    const result = resolveAaptPath(predicate, lister);

    expect(result).toEqual({ onPath: false, resolvedPath: winner, buildToolsVersion: "36.1.0", isAapt2: true });
  });

  it("candidate 3 — $ANDROID_SDK_ROOT build-tools", () => {
    process.env.PATH = "";
    delete process.env.ANDROID_HOME;
    process.env.ANDROID_SDK_ROOT = "/fake/sdk-root";
    const lister: BuildToolsLister = (dir) =>
      dir === joinPath("/fake/sdk-root", "build-tools") ? ["36.0.0"] : [];
    const winner = joinPath("/fake/sdk-root", "build-tools", "36.0.0", "aapt2");
    const predicate: AaptPathPredicate = (c) => c === winner;

    const result = resolveAaptPath(predicate, lister);

    expect(result.resolvedPath).toBe(winner);
    expect(result.buildToolsVersion).toBe("36.0.0");
  });

  it("candidate 4 — ~/Library/Android/sdk build-tools (this host's real layout)", () => {
    process.env.PATH = "";
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
    const buildTools = joinPath(homedir(), "Library", "Android", "sdk", "build-tools");
    const lister: BuildToolsLister = (dir) => (dir === buildTools ? ["35.0.0", "36.0.0", "36.1.0"] : []);
    const winner = joinPath(buildTools, "36.1.0", "aapt2");
    const predicate: AaptPathPredicate = (c) => c === winner;

    const result = resolveAaptPath(predicate, lister);

    expect(result.resolvedPath).toBe(winner);
    expect(result.buildToolsVersion).toBe("36.1.0");
  });

  it("prefers aapt2 over aapt at the same location, falls back to aapt when aapt2 is absent", () => {
    process.env.PATH = "";
    process.env.ANDROID_HOME = "/fake/android-home";
    delete process.env.ANDROID_SDK_ROOT;
    const lister: BuildToolsLister = () => ["36.1.0"];
    const aapt2Path = joinPath("/fake/android-home", "build-tools", "36.1.0", "aapt2");
    const aaptPath = joinPath("/fake/android-home", "build-tools", "36.1.0", "aapt");
    // aapt2 missing, only legacy aapt present
    const predicate: AaptPathPredicate = (c) => c === aaptPath;

    const result = resolveAaptPath(predicate, lister);

    expect(result.resolvedPath).toBe(aaptPath);
    expect(result.isAapt2).toBe(false);
    // and confirm aapt2 really was tried first in the candidate order
    expect(searchedAaptPaths(lister).indexOf(aapt2Path)).toBeLessThan(searchedAaptPaths(lister).indexOf(aaptPath));
  });
});

describe("resolveAaptPath — not found (AC-INSTALL-014/015)", () => {
  it("AC-INSTALL-014: no candidate matches → resolvedPath null", () => {
    process.env.PATH = "/fake/bin";
    process.env.ANDROID_HOME = "/fake/android-home";
    delete process.env.ANDROID_SDK_ROOT;
    const lister: BuildToolsLister = () => ["36.1.0"];
    const predicate: AaptPathPredicate = () => false;

    const result = resolveAaptPath(predicate, lister);

    expect(result).toEqual({ onPath: false, resolvedPath: null, buildToolsVersion: null, isAapt2: null });
  });

  it("AC-INSTALL-014: the searched-path list names the locations looked at (for the error message)", () => {
    process.env.PATH = "/fake/bin";
    process.env.ANDROID_HOME = "/fake/android-home";
    delete process.env.ANDROID_SDK_ROOT;
    const lister: BuildToolsLister = () => ["36.1.0"];

    const searched = searchedAaptPaths(lister);

    expect(searched).toContain(joinPath("/fake/bin", "aapt2"));
    expect(searched).toContain(joinPath("/fake/android-home", "build-tools", "36.1.0", "aapt2"));
  });

  it("AC-INSTALL-015: SDK present but build-tools empty → not found", () => {
    process.env.PATH = "";
    process.env.ANDROID_HOME = "/fake/android-home";
    delete process.env.ANDROID_SDK_ROOT;
    const emptyBuildTools: BuildToolsLister = () => []; // SDK exists, build-tools has no versions
    const predicate: AaptPathPredicate = () => false;

    const result = resolveAaptPath(predicate, emptyBuildTools);

    expect(result.resolvedPath).toBeNull();
  });
});
