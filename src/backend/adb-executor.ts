/**
 * adb subprocess execution primitive (M4).
 *
 * `AdbExecutor` is injectable so the backend and its callers are unit
 * testable without a real device or a real `adb` binary: tests supply a
 * mock executor and assert on the exact argv it was called with.
 *
 * `spawnAdb` is a thin wrapper over the generic `spawnProcess` primitive
 * (process-executor.ts, added in M6 for the `brew` invocation `doctor`
 * needs) — the shell-injection defense (argv array, no shell) lives there
 * now; this module only fixes the binary name to "adb".
 *
 * @MX:WARN — spawns an external `adb` binary. No shell is used, so argv
 * elements are never subject to shell-metacharacter interpretation.
 * @MX:REASON — this is the SPEC's sole point of adb subprocess execution;
 * a regression here (e.g. switching to `exec`/`shell: true`) reopens a
 * shell-injection surface across every command that targets a device.
 */

import type { ProcessExecResult } from "./process-executor.js";
import { spawnProcess } from "./process-executor.js";

export type AdbExecResult = ProcessExecResult;

/** Executes `adb <args>` and resolves with captured stdout/stderr/exitCode. */
export type AdbExecutor = (args: string[]) => Promise<AdbExecResult>;

/**
 * Real `AdbExecutor` backed by `node:child_process.spawn` (via
 * `spawnProcess`). No shell is used, so args are never subject to
 * shell-metacharacter interpretation.
 */
export const spawnAdb: AdbExecutor = (args: string[]): Promise<AdbExecResult> => spawnProcess("adb", args);
