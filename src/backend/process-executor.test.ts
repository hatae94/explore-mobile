/**
 * `spawnBackground` 검사 (SPEC-IOS-002 REQ-IOS2-003).
 *
 * **이 검사가 생긴 계기**: 2026-08-09 실측에서 WDA 러너가 죽었는데 `stdio:
 * "ignore"` 탓에 **원인을 알 방법이 없었다.** 빌드 실패의 원인을 보존하라는
 * 규칙(AC-IOS2-006)을 기동 실패에는 적용하지 않은 결함이었다. 같은 실수가
 * 다시 들어오면 여기서 잡힌다.
 *
 * 실제 프로세스와 실제 파일로 판정한다 — mock은 출력이 어디로 가는지 보지 못한다.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnBackground } from "./process-executor.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "spawn-bg-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 파일에 내용이 들어올 때까지 짧게 기다린다 — 백그라운드 프로세스는 비동기다. */
async function readWhenWritten(path: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const text = await readFile(path, "utf8");
      if (text.length > 0) return text;
    } catch {
      // 아직 안 만들어졌다
    }
    if (Date.now() > deadline) return "";
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("spawnBackground — 출력을 버리지 않는다", () => {
  it("logPath를 주면 표준 출력이 그 파일에 남는다", async () => {
    const logPath = join(dir, "out.log");

    const pid = await spawnBackground("echo", ["기동-성공-표지"], logPath);
    expect(pid).toBeGreaterThan(0);

    expect(await readWhenWritten(logPath)).toContain("기동-성공-표지");
  });

  it("표준 오류도 같은 파일에 남는다 — 실패 원인이 stderr로 나온다", async () => {
    const logPath = join(dir, "err.log");

    await spawnBackground("sh", ["-c", "echo 실패-원인-표지 1>&2"], logPath);

    expect(await readWhenWritten(logPath)).toContain("실패-원인-표지");
  });

  it("로그 디렉터리가 없으면 만든다 — 첫 기동에서 죽지 않는다", async () => {
    const logPath = join(dir, "아직", "없는", "경로", "out.log");

    await spawnBackground("echo", ["디렉터리-생성"], logPath);

    expect(await readWhenWritten(logPath)).toContain("디렉터리-생성");
  });

  it("이어 붙인다 — 두 번째 기동이 첫 번째 기록을 지우지 않는다", async () => {
    const logPath = join(dir, "append.log");

    await spawnBackground("echo", ["첫번째"], logPath);
    await readWhenWritten(logPath);
    await spawnBackground("echo", ["두번째"], logPath);

    const deadline = Date.now() + 5000;
    let text = "";
    for (;;) {
      text = await readFile(logPath, "utf8");
      if (text.includes("두번째") || Date.now() > deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(text).toContain("첫번째");
    expect(text).toContain("두번째");
  });

  it("logPath를 생략해도 던지지 않는다 — 기존 호출자를 깨지 않는다", async () => {
    await expect(spawnBackground("echo", ["로그-없음"])).resolves.toBeGreaterThan(0);
  });
});
