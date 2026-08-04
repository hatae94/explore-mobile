/**
 * adb subprocess execution primitive (M4), extended in SPEC-READY-001 M1
 * with `adb` path resolution beyond `PATH` (REQ-READY-001).
 *
 * `AdbExecutor` is injectable so the backend and its callers are unit
 * testable without a real device or a real `adb` binary: tests supply a
 * mock executor and assert on the exact argv it was called with.
 *
 * `spawnAdb` is a thin wrapper over the generic `spawnProcess` primitive
 * (process-executor.ts, added in M6 for the `brew` invocation `doctor`
 * needs) — the shell-injection defense (argv array, no shell) lives there
 * now.
 *
 * `resolveAdbPath()` is the sole owner of `adb` binary path resolution
 * (plan.md §B.1): it searches, in order, `PATH`, `$ANDROID_HOME/platform-tools/adb`,
 * `$ANDROID_SDK_ROOT/platform-tools/adb`, and `~/Library/Android/sdk/platform-tools/adb`,
 * and memoizes the result for the lifetime of the process so `spawnAdb`
 * (the execution path) and `AdbDoctor.checkAdbInstalled()` (the reporting
 * path — doctor.ts) always agree on which binary is in play. Passing an
 * explicit `predicate` (the injectable test seam — plan.md §B.1) bypasses
 * the process-wide memoization and always recomputes, so unit tests can
 * exercise distinct filesystem states without cross-test contamination.
 *
 * @MX:WARN — spawns an external `adb` binary. No shell is used, so argv
 * elements are never subject to shell-metacharacter interpretation.
 * @MX:REASON — this is the SPEC's sole point of adb subprocess execution;
 * a regression here (e.g. switching to `exec`/`shell: true`) reopens a
 * shell-injection surface across every command that targets a device.
 */

import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter as pathDelimiter, join as joinPath } from "node:path";

import type { ProcessExecResult } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";

export type AdbExecResult = ProcessExecResult;

/** Executes `adb <args>` and resolves with captured stdout/stderr/exitCode. */
export type AdbExecutor = (args: string[]) => Promise<AdbExecResult>;

/**
 * Judges whether a candidate absolute path is an existing, executable
 * file (REQ-READY-001: "존재 + 실행 가능 여부로 판정"). The sole
 * injectable seam for `resolveAdbPath()` (plan.md §B.1 — AC-READY-002/003/004
 * inject a fake predicate; AC-READY-018 exercises `defaultAdbPathPredicate`
 * against a real temp directory).
 */
export type AdbPathPredicate = (candidatePath: string) => boolean;

/** Result of an `adb` binary path search (REQ-READY-002's `onPath`/`resolvedPath`). */
export interface AdbPathResolution {
  /** Whether the resolved binary was found via `PATH` (candidate 1). */
  onPath: boolean;
  /** Absolute path to the resolved binary, or `null` if none of the four candidates matched. */
  resolvedPath: string | null;
}

/**
 * Real, filesystem-backed `AdbPathPredicate`: exists as a file AND is
 * executable (`X_OK`). Exported so tests exercising AC-READY-018 (real
 * temp directory + real env vars) can pass it explicitly — which, per
 * `resolveAdbPath()` below, also opts out of the process-wide cache.
 */
export function defaultAdbPathPredicate(candidatePath: string): boolean {
  try {
    if (!statSync(candidatePath).isFile()) return false;
    accessSync(candidatePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

interface AdbPathCandidate {
  path: string;
  onPath: boolean;
}

/** The four REQ-READY-001 candidates, PATH-priority first. */
function adbPathCandidates(): AdbPathCandidate[] {
  const candidates: AdbPathCandidate[] = [];

  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(pathDelimiter)) {
    if (dir.length === 0) continue;
    candidates.push({ path: joinPath(dir, "adb"), onPath: true });
  }

  const androidHome = process.env.ANDROID_HOME;
  if (androidHome) candidates.push({ path: joinPath(androidHome, "platform-tools", "adb"), onPath: false });

  const androidSdkRoot = process.env.ANDROID_SDK_ROOT;
  if (androidSdkRoot) candidates.push({ path: joinPath(androidSdkRoot, "platform-tools", "adb"), onPath: false });

  candidates.push({ path: joinPath(homedir(), "Library", "Android", "sdk", "platform-tools", "adb"), onPath: false });

  return candidates;
}

/** Process-wide memoization (plan.md §B.1 — "1회 수행 후 재사용"); only populated by the no-argument (default-predicate) call path. */
let cachedResolution: AdbPathResolution | undefined;

/**
 * Resolves the `adb` binary path per REQ-READY-001's four-candidate
 * search order (PATH first). Called with no argument, the result is
 * memoized for the lifetime of the process so repeated calls (spawnAdb +
 * AdbDoctor reporting) share one filesystem scan. Called with an explicit
 * `predicate`, the search always recomputes fresh — the test seam never
 * touches or reads the process-wide cache.
 */
export function resolveAdbPath(predicate?: AdbPathPredicate): AdbPathResolution {
  if (predicate !== undefined) {
    return computeAdbPathResolution(predicate);
  }
  if (cachedResolution === undefined) {
    cachedResolution = computeAdbPathResolution(defaultAdbPathPredicate);
  }
  return cachedResolution;
}

function computeAdbPathResolution(predicate: AdbPathPredicate): AdbPathResolution {
  for (const candidate of adbPathCandidates()) {
    if (predicate(candidate.path)) {
      return { onPath: candidate.onPath, resolvedPath: candidate.path };
    }
  }
  return { onPath: false, resolvedPath: null };
}

/**
 * Test-only: clears the process-wide memoized resolution so a test can
 * force a fresh filesystem scan after mutating env vars (e.g. AC-READY-018).
 * Production code never calls this.
 */
export function resetAdbPathCache(): void {
  cachedResolution = undefined;
}

/**
 * Real `AdbExecutor` backed by `node:child_process.spawn` (via
 * `spawnProcess`). No shell is used, so args are never subject to
 * shell-metacharacter interpretation. Uses `resolveAdbPath()`'s resolved
 * binary when available (REQ-READY-001); falls back to the literal `"adb"`
 * so an unresolved environment fails exactly as before (ENOENT via PATH).
 */
export const spawnAdb: AdbExecutor = (args: string[]): Promise<AdbExecResult> => {
  const { resolvedPath } = resolveAdbPath();
  return spawnProcess(resolvedPath ?? "adb", args);
};
