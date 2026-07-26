/**
 * Device-pasteboard writer (`xcrun simctl pbcopy`), the transport half of
 * iOS non-ASCII text input.
 *
 * Why this exists: `idb ui text` is NOT Unicode-capable. It maps every
 * character through a fixed US-keyboard table (fb-idb 1.1.7
 * `idb/common/hid.py` KEY_MAP — printable ASCII plus newline) and raises
 * `No keycode found for <char>` for anything outside it, so Korean, emoji,
 * and every other non-ASCII string are impossible to type through it. The
 * pasteboard is the one path that carries arbitrary Unicode to the device.
 *
 * `spawnProcess` (process-executor.ts) cannot be reused here because it
 * spawns with `stdio: ["ignore", ...]`, and `simctl pbcopy` reads the text to
 * copy from stdin.
 *
 * @MX:WARN — writing the pasteboard OVERWRITES whatever the device had on it.
 * @MX:REASON — a test run that pastes text silently discards the simulator's
 * previous clipboard contents; that is acceptable for an automation target but
 * would not be for a user's own device, and the same approach must not be
 * copied to a physical-device path without revisiting this trade-off.
 */

import { spawn } from "node:child_process";

/** Writes `text` onto the pasteboard of the device identified by `serial`. */
export type ClipboardWriter = (serial: string, text: string) => Promise<void>;

/**
 * Real `ClipboardWriter` backed by `xcrun simctl pbcopy <serial>`, with the
 * text fed via stdin. No shell is used, so neither `serial` nor `text` is ever
 * subject to shell-metacharacter interpretation.
 */
export const simctlPbcopy: ClipboardWriter = (serial: string, text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const child = spawn("xcrun", ["simctl", "pbcopy", serial], { stdio: ["pipe", "ignore", "pipe"] });

    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err: Error) => {
      reject(new Error(`simctl pbcopy could not be spawned: ${err.message}`));
    });

    child.on("close", (exitCode: number | null) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      const stderrText = Buffer.concat(stderrChunks).toString("utf-8").trim();
      reject(
        new Error(
          stderrText.length > 0
            ? `simctl pbcopy failed (exit ${exitCode ?? -1}): ${stderrText}`
            : `simctl pbcopy failed (exit ${exitCode ?? -1})`,
        ),
      );
    });

    child.stdin.on("error", (err: Error) => {
      reject(new Error(`simctl pbcopy stdin write failed: ${err.message}`));
    });
    child.stdin.end(text, "utf-8");
  });
};
