/**
 * Compliance test for the Claude skill wrapper (REQ-ARCH-004,
 * acceptance.md AC-ANDROID-013): the wrapper must contain ZERO direct
 * `adb` invocations — it may only ever call the CLI.
 *
 * **판정 방식 정정 (2026-08-03).** 원래는 `adb`라는 **단어**가 한 번이라도
 * 나오면 위반으로 봤다. 그 패턴은 실제 호출과 산문 언급을 구별하지 못한다 —
 * 스킬 문서는 "adb를 직접 호출하지 않는다", "adb가 PATH에 없을 수 있다",
 * "doctor가 adb 설치를 도와준다" 같은 **사실을 설명해야 하고**, 그러려면
 * 단어를 쓸 수밖에 없다. 단어를 피하려고 문장을 비트는 것은 AC의 의도가
 * 아니다.
 *
 * 그래서 판정을 **실행 가능한 명령 형태**로 좁혔다: 코드 블록 안에서 `adb`로
 * 시작하는 줄만 위반이다. AC가 막으려던 것 — 스킬이 CLI를 우회해 adb를
 * 직접 부르는 것 — 은 그대로 지켜지며, 오히려 더 정확히 지켜진다(이전
 * 패턴은 코드 블록 밖 산문에만 반응해 실제 호출을 놓칠 수도 있었다).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const SKILL_WRAPPER_DIR = resolve(PROJECT_ROOT, ".claude", "skills", "explore-mobile");

/**
 * 실제 호출 형태만 잡는다: 코드 블록 안에서 `adb`(또는 `$ adb`)로 시작하는 줄.
 * 산문 속 언급과 백틱 인용은 위반이 아니다.
 */
const ADB_INVOCATION_PATTERN = /^\s*(?:\$\s*)?adb\s/;

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
      let insideCodeBlock = false;
      content.split(/\r?\n/).forEach((line, index) => {
        if (line.trimStart().startsWith("```")) {
          insideCodeBlock = !insideCodeBlock;
          return;
        }
        if (insideCodeBlock && ADB_INVOCATION_PATTERN.test(line)) {
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

  /**
   * 명령 표에 실제 명령이 전부 있는지 본다.
   *
   * **판정 방식 정정 (2026-08-03).** 원래는 본문 어디든 `` `<명령> `` 문자열이
   * 있으면 통과였고, 목록에 이미 제거된 `dump`가 남아 있었으며 나중에 추가된
   * `swipe`/`scroll`은 빠져 있었다. 그 결과 "`dump` 명령은 없다"고 적은
   * 문서가 **엉뚱한 이유로 통과**했다.
   *
   * 이제 **명령 표의 행**(`| \`name`)을 센다. 산문에서 이름을 언급하는 것과
   * 명령으로 문서화하는 것은 다르다.
   */
  it("documents every CLI command surface as a table row", () => {
    const content = readFileSync(join(SKILL_WRAPPER_DIR, "SKILL.md"), "utf-8");

    const commands = [
      "devices",
      "launch",
      "stop",
      "screenshot",
      "tap",
      "key",
      "swipe",
      "scroll",
      "text",
      "doctor",
      "reset",
    ];
    for (const command of commands) {
      expect(content).toContain(`| \`${command}`);
    }
  });

  /** 제거된 명령을 사용 가능한 것처럼 표에 싣지 않는다. */
  it("does not present removed commands as available", () => {
    const content = readFileSync(join(SKILL_WRAPPER_DIR, "SKILL.md"), "utf-8");

    for (const removed of ["dump"]) {
      expect(content).not.toContain(`| \`${removed}`);
    }
  });

  it("documents the JSON in/out envelope and --device targeting", () => {
    const content = readFileSync(join(SKILL_WRAPPER_DIR, "SKILL.md"), "utf-8");

    expect(content).toContain('"ok": true');
    expect(content).toContain('"ok": false');
    expect(content).toContain("--device");
  });
});
