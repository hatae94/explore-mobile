/**
 * idb subprocess execution primitive (M4, SPEC-IOS-001) — mirrors
 * `adb-executor.ts` exactly: a thin wrapper over the generic
 * `spawnProcess` primitive (process-executor.ts), fixing the binary name
 * to "idb". `IdbExecutor` is injectable so `IdbBackend` and its callers
 * are unit testable without a real simulator or a real `idb` binary: tests
 * supply a mock executor and assert on the exact argv it was called with.
 *
 * @MX:WARN — spawns an external `idb` binary (a Python CLI, per
 * research.md §4 — pinned to `fb-idb==1.1.8`, effectively unmaintained
 * since 2022-08). No shell is used, so argv elements are never subject to
 * shell-metacharacter interpretation (same defense as adb-executor.ts).
 * @MX:REASON — this is SPEC-IOS-001's sole point of idb subprocess
 * execution (REQ-IOS-ISOLATE-002); a regression here (e.g. switching to
 * `exec`/`shell: true`) reopens a shell-injection surface, and every idb
 * call must route through here so idb's unmaintained-tool risk stays
 * isolated behind this one wrapper (REQ-IOS-ISOLATE-001).
 */

import type { ProcessExecResult } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";

export type IdbExecResult = ProcessExecResult;

/** Executes `idb <args>` and resolves with captured stdout/stderr/exitCode. */
export type IdbExecutor = (args: string[]) => Promise<IdbExecResult>;

/**
 * Real `IdbExecutor` backed by `node:child_process.spawn` (via
 * `spawnProcess`). No shell is used, so args are never subject to
 * shell-metacharacter interpretation.
 */
export const spawnIdb: IdbExecutor = (args: string[]): Promise<IdbExecResult> => spawnProcess("idb", args);
