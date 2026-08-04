/**
 * `resolveAdbPath()` — REQ-READY-001 four-candidate `adb` binary search
 * (SPEC-READY-001 M1, AC-READY-002/003). Every test injects an explicit
 * `AdbPathPredicate` (plan.md §B.1's test seam), which per
 * `resolveAdbPath()`'s contract always bypasses the process-wide
 * memoization — each test gets a fresh, isolated computation regardless of
 * what earlier tests (or this real host's real filesystem) resolved.
 */

import { homedir } from "node:os";
import { delimiter as pathDelimiter, join as joinPath } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AdbPathPredicate } from "./adb-executor.js";
import { resolveAdbPath } from "./adb-executor.js";

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

describe("resolveAdbPath", () => {
  it("AC-READY-002: PATH and $ANDROID_HOME/platform-tools both have an executable adb — PATH wins", () => {
    process.env.PATH = "/fake/on-path/bin";
    process.env.ANDROID_HOME = "/fake/android-home";
    delete process.env.ANDROID_SDK_ROOT;

    const pathCandidate = joinPath("/fake/on-path/bin", "adb");
    const androidHomeCandidate = joinPath("/fake/android-home", "platform-tools", "adb");
    const predicate: AdbPathPredicate = (candidate) => candidate === pathCandidate || candidate === androidHomeCandidate;

    const result = resolveAdbPath(predicate);

    expect(result).toEqual({ onPath: true, resolvedPath: pathCandidate });
  });

  describe("AC-READY-003: all four candidates individually succeed, plus the all-fail case", () => {
    it("candidate 1 — PATH only", () => {
      process.env.PATH = "/fake/on-path/bin";
      delete process.env.ANDROID_HOME;
      delete process.env.ANDROID_SDK_ROOT;
      const pathCandidate = joinPath("/fake/on-path/bin", "adb");
      const predicate: AdbPathPredicate = (candidate) => candidate === pathCandidate;

      const result = resolveAdbPath(predicate);

      expect(result).toEqual({ onPath: true, resolvedPath: pathCandidate });
    });

    it("candidate 2 — $ANDROID_HOME/platform-tools/adb only", () => {
      process.env.PATH = "";
      process.env.ANDROID_HOME = "/fake/android-home";
      delete process.env.ANDROID_SDK_ROOT;
      const androidHomeCandidate = joinPath("/fake/android-home", "platform-tools", "adb");
      const predicate: AdbPathPredicate = (candidate) => candidate === androidHomeCandidate;

      const result = resolveAdbPath(predicate);

      expect(result).toEqual({ onPath: false, resolvedPath: androidHomeCandidate });
    });

    it("candidate 3 — $ANDROID_SDK_ROOT/platform-tools/adb only", () => {
      process.env.PATH = "";
      delete process.env.ANDROID_HOME;
      process.env.ANDROID_SDK_ROOT = "/fake/android-sdk-root";
      const sdkRootCandidate = joinPath("/fake/android-sdk-root", "platform-tools", "adb");
      const predicate: AdbPathPredicate = (candidate) => candidate === sdkRootCandidate;

      const result = resolveAdbPath(predicate);

      expect(result).toEqual({ onPath: false, resolvedPath: sdkRootCandidate });
    });

    it("candidate 4 — ~/Library/Android/sdk/platform-tools/adb only", () => {
      process.env.PATH = "";
      delete process.env.ANDROID_HOME;
      delete process.env.ANDROID_SDK_ROOT;
      const homedirCandidate = joinPath(homedir(), "Library", "Android", "sdk", "platform-tools", "adb");
      const predicate: AdbPathPredicate = (candidate) => candidate === homedirCandidate;

      const result = resolveAdbPath(predicate);

      expect(result).toEqual({ onPath: false, resolvedPath: homedirCandidate });
    });

    it("all four candidates fail — reports not-found (resolvedPath: null)", () => {
      process.env.PATH = "/fake/on-path/bin";
      process.env.ANDROID_HOME = "/fake/android-home";
      process.env.ANDROID_SDK_ROOT = "/fake/android-sdk-root";
      const predicate: AdbPathPredicate = () => false;

      const result = resolveAdbPath(predicate);

      expect(result).toEqual({ onPath: false, resolvedPath: null });
    });
  });

  it("PATH search tries every directory in PATH order before falling through to ANDROID_HOME", () => {
    process.env.PATH = ["/fake/empty-1", "/fake/empty-2", "/fake/has-adb"].join(pathDelimiter);
    process.env.ANDROID_HOME = "/fake/android-home";
    const winningCandidate = joinPath("/fake/has-adb", "adb");
    const predicate: AdbPathPredicate = (candidate) => candidate === winningCandidate;

    const result = resolveAdbPath(predicate);

    expect(result).toEqual({ onPath: true, resolvedPath: winningCandidate });
  });
});
