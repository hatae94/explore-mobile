/**
 * Generic subprocess execution primitive (M6) — the same argv-array,
 * no-shell pattern as `adb-executor.ts`, generalized to any binary. Needed
 * for `doctor`'s `brew install android-platform-tools` step, which is not
 * an `adb` invocation.
 *
 * `spawnAdb` (adb-executor.ts) is now a thin wrapper over this primitive,
 * removing the previous duplication between the two spawn implementations.
 *
 * @MX:WARN — spawns an arbitrary external binary by name. Uses
 * `child_process.spawn` with an argv array and no shell, so argv elements
 * are never subject to shell-metacharacter interpretation (same defense
 * as adb-executor.ts).
 * @MX:REASON — a caller passing an untrusted `command` string here would
 * still be safe from shell injection (no shell involved), but could still
 * execute an unintended binary if `command` itself is attacker-controlled;
 * callers (doctor.ts) only ever pass a fixed, hardcoded binary name
 * ("brew"), never user input.
 */

import { spawn } from "node:child_process";

export interface ProcessExecResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}

/** Executes `<command> <args>` and resolves with captured stdout/stderr/exitCode. */
export type ProcessExecutor = (command: string, args: string[]) => Promise<ProcessExecResult>;

/** Real `ProcessExecutor` backed by `node:child_process.spawn`. No shell is used. */
export const spawnProcess: ProcessExecutor = (command: string, args: string[]): Promise<ProcessExecResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => reject(err));
    child.on("close", (exitCode) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        exitCode: exitCode ?? -1,
      });
    });
  });
};
