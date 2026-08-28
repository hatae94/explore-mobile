/**
 * aapt/aapt2 subprocess execution primitive + path resolution
 * (SPEC-INSTALL-001 M1, REQ-INSTALL-003).
 *
 * This is the `adb-executor.ts` pattern (SPEC-READY-001) applied to
 * `aapt`/`aapt2`, with ONE added sub-problem: `adb` lives at a fixed
 * `platform-tools/adb`, but `aapt`/`aapt2` live under a *versioned*
 * `build-tools/<version>/` directory, so a version must be selected first
 * (`build-tools-version.ts`).
 *
 * Two seams are injectable for unit testing without a real SDK
 * (plan.md §A.2 M1):
 *   - `AaptPathPredicate`  — "does this absolute path exist and is it
 *     executable?" (same role as `AdbPathPredicate`).
 *   - `BuildToolsLister`   — "what version dirs live under this build-tools
 *     directory?" (new — `adb` had no directory to enumerate).
 *
 * `aapt2` is preferred over `aapt`: the 2026-08-29 measurement showed
 * `aapt2 dump packagename` emits a single bare line with nothing to parse
 * (spec.md §A.2 실측 ②), the lowest-ambiguity source of the package name.
 *
 * @MX:WARN — spawns an external `aapt`/`aapt2` binary. No shell is used
 * (via `spawnProcess`), so argv elements are never subject to
 * shell-metacharacter interpretation.
 * @MX:REASON — this is the SPEC's sole point of aapt subprocess execution;
 * a regression to `exec`/`shell: true` reopens a shell-injection surface.
 */

import { readdirSync } from "node:fs";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter as pathDelimiter, join as joinPath } from "node:path";

import type { ProcessExecResult } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";
import { pickHighestBuildToolsVersion } from "./build-tools-version.js";

export type AaptExecResult = ProcessExecResult;

/** Executes `<aapt-binary> <args>` and resolves with captured stdout/stderr/exitCode. */
export type AaptExecutor = (args: string[]) => Promise<AaptExecResult>;

/** Judges whether a candidate absolute path is an existing, executable file. */
export type AaptPathPredicate = (candidatePath: string) => boolean;

/** Lists the entry names directly under a `build-tools` directory (non-recursive). */
export type BuildToolsLister = (buildToolsDir: string) => string[];

/** Result of an `aapt`/`aapt2` binary path search. */
export interface AaptPathResolution {
  /** Whether the resolved binary was found via `PATH`. */
  onPath: boolean;
  /** Absolute path to the resolved binary, or `null` if none matched. */
  resolvedPath: string | null;
  /** The `build-tools` version the binary came from, or `null` (PATH hit / not found). */
  buildToolsVersion: string | null;
  /** Whether the resolved binary is `aapt2` (`true`) or the legacy `aapt` (`false`); `null` if not found. */
  isAapt2: boolean | null;
}

/**
 * Real, filesystem-backed `AaptPathPredicate`: exists as a file AND is
 * executable (`X_OK`). Same contract as `defaultAdbPathPredicate`.
 */
export function defaultAaptPathPredicate(candidatePath: string): boolean {
  try {
    if (!statSync(candidatePath).isFile()) return false;
    accessSync(candidatePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Real, filesystem-backed `BuildToolsLister`: the directory entry names, or
 * an empty list when the directory is absent/unreadable (SDK present but no
 * `build-tools` — AC-INSTALL-015).
 */
export function defaultBuildToolsLister(buildToolsDir: string): string[] {
  try {
    return readdirSync(buildToolsDir);
  } catch {
    return [];
  }
}

interface AaptPathCandidate {
  path: string;
  onPath: boolean;
  buildToolsVersion: string | null;
  isAapt2: boolean;
}

/** aapt2 is preferred over aapt at every location (spec.md §A.2 실측 ②). */
const BINARY_PREFERENCE: ReadonlyArray<{ name: string; isAapt2: boolean }> = [
  { name: "aapt2", isAapt2: true },
  { name: "aapt", isAapt2: false },
];

/** SDK roots to search for `build-tools`, in priority order after PATH. */
function sdkRoots(): string[] {
  const roots: string[] = [];
  if (process.env.ANDROID_HOME) roots.push(process.env.ANDROID_HOME);
  if (process.env.ANDROID_SDK_ROOT) roots.push(process.env.ANDROID_SDK_ROOT);
  roots.push(joinPath(homedir(), "Library", "Android", "sdk"));
  return roots;
}

/**
 * Candidate binaries in resolution order: every PATH directory first
 * (aapt2 before aapt), then each SDK root's highest `build-tools` version
 * (aapt2 before aapt).
 */
function aaptPathCandidates(lister: BuildToolsLister): AaptPathCandidate[] {
  const candidates: AaptPathCandidate[] = [];

  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(pathDelimiter)) {
    if (dir.length === 0) continue;
    for (const bin of BINARY_PREFERENCE) {
      candidates.push({ path: joinPath(dir, bin.name), onPath: true, buildToolsVersion: null, isAapt2: bin.isAapt2 });
    }
  }

  for (const root of sdkRoots()) {
    const buildToolsDir = joinPath(root, "build-tools");
    const version = pickHighestBuildToolsVersion(lister(buildToolsDir));
    if (version === null) continue;
    for (const bin of BINARY_PREFERENCE) {
      candidates.push({
        path: joinPath(buildToolsDir, version, bin.name),
        onPath: false,
        buildToolsVersion: version,
        isAapt2: bin.isAapt2,
      });
    }
  }

  return candidates;
}

/** Process-wide memoization; only populated by the no-argument (default seams) call path. */
let cachedResolution: AaptPathResolution | undefined;

/**
 * Resolves the `aapt`/`aapt2` binary. Called with no arguments, the result
 * is memoized for the process lifetime so the execution path (`spawnAapt`)
 * and the reporting path (`doctor`) agree on which binary is in play. Called
 * with explicit seams, it always recomputes fresh and never touches the cache.
 */
export function resolveAaptPath(predicate?: AaptPathPredicate, lister?: BuildToolsLister): AaptPathResolution {
  if (predicate !== undefined || lister !== undefined) {
    return computeAaptPathResolution(predicate ?? defaultAaptPathPredicate, lister ?? defaultBuildToolsLister);
  }
  if (cachedResolution === undefined) {
    cachedResolution = computeAaptPathResolution(defaultAaptPathPredicate, defaultBuildToolsLister);
  }
  return cachedResolution;
}

function computeAaptPathResolution(predicate: AaptPathPredicate, lister: BuildToolsLister): AaptPathResolution {
  for (const candidate of aaptPathCandidates(lister)) {
    if (predicate(candidate.path)) {
      return {
        onPath: candidate.onPath,
        resolvedPath: candidate.path,
        buildToolsVersion: candidate.buildToolsVersion,
        isAapt2: candidate.isAapt2,
      };
    }
  }
  return { onPath: false, resolvedPath: null, buildToolsVersion: null, isAapt2: null };
}

/**
 * Test-only: clears the process-wide memoized resolution so a test can force
 * a fresh scan. Production code never calls this.
 */
export function resetAaptPathCache(): void {
  cachedResolution = undefined;
}

/**
 * The list of every candidate path `resolveAaptPath` searched, for the
 * `AAPT_NOT_FOUND` error message's "찾아본 위치를 나열한다" requirement
 * (REQ-INSTALL-003 / AC-INSTALL-014). Uses the same seams so the reported
 * locations match what was actually searched.
 */
export function searchedAaptPaths(lister: BuildToolsLister = defaultBuildToolsLister): string[] {
  return aaptPathCandidates(lister).map((c) => c.path);
}

/**
 * Real `AaptExecutor` backed by `spawnProcess`. No shell is used. Throws when
 * no aapt binary resolves — callers surface this as `AAPT_NOT_FOUND` rather
 * than letting an ENOENT leak (REQ-INSTALL-003).
 */
export const spawnAapt: AaptExecutor = (args: string[]): Promise<AaptExecResult> => {
  const { resolvedPath } = resolveAaptPath();
  if (resolvedPath === null) {
    throw new Error("aapt/aapt2 binary not found in PATH or any Android SDK build-tools directory.");
  }
  return spawnProcess(resolvedPath, args);
};
