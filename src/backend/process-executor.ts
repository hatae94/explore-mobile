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
import { mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";

export interface ProcessExecResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}

/** Executes `<command> <args>` and resolves with captured stdout/stderr/exitCode. */
export type ProcessExecutor = (command: string, args: string[]) => Promise<ProcessExecResult>;

/**
 * 백그라운드로 띄우고 **기다리지 않는다** — 프로세스 식별자만 돌려준다
 * (SPEC-IOS-002 REQ-IOS2-003).
 *
 * `spawnProcess`와 목적이 다르다. 저쪽은 명령이 끝나기를 기다려 출력을 모으고,
 * 이쪽은 계속 살아 있어야 하는 프로세스(`iproxy`, WDA 러너)를 띄운다. 러너는
 * CLI가 끝난 뒤에도 살아 있어야 하므로 `detached` + `unref`가 필요하다 —
 * 그러지 않으면 CLI가 종료될 때 함께 죽어, 다음 명령이 다시 띄워야 한다.
 *
 * @MX:WARN — 여기서 띄운 프로세스는 CLI가 끝나도 남는다.
 * @MX:REASON — 남는 것이 목적이지만, 남는 만큼 정리 경로가 반드시 있어야 한다.
 * 식별자를 `WdaRunnerState`에 적어 두는 것이 그 정리 경로이며, 적지 않고 띄우면
 * 유령 프로세스와 포트 점유가 남는다(design.md §B.3).
 */
export const spawnBackground = async (command: string, args: string[], logPath?: string): Promise<number> => {
  // 출력을 버리면 기동 실패의 원인이 사라진다. 실측에서 러너가 죽었는데
  // `stdio: "ignore"` 탓에 왜 죽었는지 알 방법이 없었다 — 빌드 실패의 원인을
  // 보존하라는 규칙(AC-IOS2-006)과 같은 이유로 기동도 로그를 남긴다.
  let stdio: "ignore" | ["ignore", number, number] = "ignore";
  if (logPath !== undefined) {
    mkdirSync(dirname(logPath), { recursive: true });
    const fd = openSync(logPath, "a");
    stdio = ["ignore", fd, fd];
  }

  const child = spawn(command, args, { detached: true, stdio });
  child.unref();
  if (child.pid === undefined) {
    throw new Error(`${command} 프로세스를 띄우지 못했습니다.`);
  }
  return child.pid;
};

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
