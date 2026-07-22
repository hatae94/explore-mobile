/**
 * Compliance test for the M8 Claude skill wrapper (REQ-ARCH-004,
 * acceptance.md AC-ANDROID-013): the wrapper must contain ZERO direct
 * `adb` invocations — it may only ever call the CLI. This mirrors the
 * exact grep pattern acceptance.md specifies, so the check is
 * mechanically identical to what a human running the documented command
 * would see.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const SKILL_WRAPPER_DIR = resolve(PROJECT_ROOT, ".claude", "skills", "explore-mobile");

/** acceptance.md AC-ANDROID-013's exact grep pattern: a standalone "adb" word. */
const DIRECT_ADB_PATTERN = /(^|[^A-Za-z])adb([^A-Za-z]|$)/;

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Claude skill wrapper (M8, REQ-ARCH-004)", () => {
  it("contains zero direct 'adb' invocations (AC-ANDROID-013, mechanically greppable)", () => {
    const files = collectFiles(SKILL_WRAPPER_DIR);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      content.split(/\r?\n/).forEach((line, index) => {
        if (DIRECT_ADB_PATTERN.test(line)) {
          violations.push(`${file}:${index + 1}: ${line}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("references the CLI entrypoint (node dist/cli/bin.js and npx explore-mobile), never a raw device command", () => {
    const content = readFileSync(join(SKILL_WRAPPER_DIR, "SKILL.md"), "utf-8");

    expect(content).toMatch(/node dist\/cli\/bin\.js/);
    expect(content).toMatch(/npx explore-mobile/);
  });

  it("documents every CLI command surface", () => {
    const content = readFileSync(join(SKILL_WRAPPER_DIR, "SKILL.md"), "utf-8");

    const commands = [
      "devices",
      "launch",
      "stop",
      "screenshot",
      "tap",
      "key",
      "text",
      "dump",
      "doctor",
      "reset",
    ];
    for (const command of commands) {
      expect(content).toContain(`\`${command}`);
    }
  });

  it("documents the JSON in/out envelope and --device targeting", () => {
    const content = readFileSync(join(SKILL_WRAPPER_DIR, "SKILL.md"), "utf-8");

    expect(content).toContain('"ok": true');
    expect(content).toContain('"ok": false');
    expect(content).toContain("--device");
  });
});
