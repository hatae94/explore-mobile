/**
 * adb subprocess execution primitive (M4).
 *
 * `AdbExecutor` is injectable so the backend and its callers are unit
 * testable without a real device or a real `adb` binary: tests supply a
 * mock executor and assert on the exact argv it was called with.
 *
 * @MX:WARN — spawns an external `adb` binary. Uses `child_process.spawn`
 * with an argv array and no shell (`shell` option omitted/false), which is
 * the load-bearing defense against shell injection: argv elements are
 * passed directly to execve, never concatenated into a shell command
 * string, so shell metacharacters in any argument (package name, text,
 * serial) are inert.
 * @MX:REASON — this is the SPEC's sole point of adb subprocess execution;
 * a regression here (e.g. switching to `exec`/`shell: true`) reopens a
 * shell-injection surface across every command that targets a device.
 */

import { spawn } from "node:child_process";

export interface AdbExecResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}

/** Executes `adb <args>` and resolves with captured stdout/stderr/exitCode. */
export type AdbExecutor = (args: string[]) => Promise<AdbExecResult>;

/**
 * Real `AdbExecutor` backed by `node:child_process.spawn`. No shell is
 * used, so args are never subject to shell-metacharacter interpretation.
 */
export const spawnAdb: AdbExecutor = (args: string[]): Promise<AdbExecResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn("adb", args, { stdio: ["ignore", "pipe", "pipe"] });

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
