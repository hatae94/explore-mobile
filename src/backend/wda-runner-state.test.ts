/**
 * `wda-runner-state.ts` 검사 (SPEC-IOS-002 REQ-IOS2-009).
 *
 * **실제 파일 시스템으로 판정한다.** `fs` mock을 쓰지 않는다 — 이 저장소에는
 * 동시 쓰기로 파일이 깨져 그 파일의 **모든 항목이 함께 사라진** 이력이 있고,
 * 그 실패는 mock으로는 구조적으로 관측되지 않는다(mock은 쓰기 호출을 셀 뿐
 * 바이트가 겹치는 것을 보지 못한다).
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WdaRunnerState, type WdaRunnerRecord } from "./wda-runner-state.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "wda-state-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function record(udid: string, port: number): WdaRunnerRecord {
  return { udid, port, iproxyPid: 1000 + port, runnerPid: 2000 + port, startedAt: "2026-08-08T00:00:00.000Z" };
}

describe("WdaRunnerState — 프로세스를 넘어 남는다", () => {
  it("적은 것을 **다른 인스턴스**가 읽는다 — CLI는 명령마다 새 프로세스다", async () => {
    await new WdaRunnerState(home).remember(record("UDID-A", 8100));

    // 새 인스턴스 = 새 프로세스의 대역. in-process Map이면 여기서 깨진다.
    const reread = await new WdaRunnerState(home).get("UDID-A");
    expect(reread).toMatchObject({ udid: "UDID-A", port: 8100, runnerPid: 10100 });
  });

  it("파일이 아직 없으면 빈 상태로 읽는다 — 던지지 않는다", async () => {
    await expect(new WdaRunnerState(home).get("UDID-A")).resolves.toBeUndefined();
  });

  it("깨진 JSON은 빈 상태로 취급한다 — 진단 경로가 파싱 오류로 죽지 않는다", async () => {
    const state = new WdaRunnerState(home);
    await state.remember(record("UDID-A", 8100));
    await writeFile(state.filePath, "{ 이건 JSON이 아니다", "utf8");

    await expect(state.get("UDID-A")).resolves.toBeUndefined();
  });

  it("기기별로 따로 담긴다", async () => {
    const state = new WdaRunnerState(home);
    await state.remember(record("UDID-A", 8100));
    await state.remember(record("UDID-B", 8101));

    expect(await state.get("UDID-A")).toMatchObject({ port: 8100 });
    expect(await state.get("UDID-B")).toMatchObject({ port: 8101 });
  });

  it("forget은 그 기기만 지운다", async () => {
    const state = new WdaRunnerState(home);
    await state.remember(record("UDID-A", 8100));
    await state.remember(record("UDID-B", 8101));

    await state.forget("UDID-A");

    expect(await state.get("UDID-A")).toBeUndefined();
    expect(await state.get("UDID-B")).toMatchObject({ port: 8101 });
  });
});

describe("동시 쓰기 — 겹쳐도 파일이 깨지지 않는다", () => {
  /**
   * 근거: 이 저장소는 동시 쓰기로 **바이트가 겹쳐 파일이 깨지고, 그 파일의
   * 모든 항목이 함께 사라진** 사고를 기록하고 있다. 한 항목이 덮이는 것이
   * 아니라 전부가 사라진다는 점이 중요하다 — 그래서 "마지막 쓰기가 이긴다"는
   * 것만으로는 부족하고, **읽을 수 있는 상태로 남는가**를 판정해야 한다.
   */
  it("20개를 동시에 써도 JSON이 파싱 가능하다", async () => {
    const state = new WdaRunnerState(home);

    await Promise.all(Array.from({ length: 20 }, (_, i) => state.remember(record(`UDID-${i}`, 8100 + i))));

    const raw = await readFile(state.filePath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("동시 쓰기 뒤에도 항목이 0개로 사라지지 않는다", async () => {
    const state = new WdaRunnerState(home);

    await Promise.all(Array.from({ length: 20 }, (_, i) => state.remember(record(`UDID-${i}`, 8100 + i))));

    const parsed = JSON.parse(await readFile(state.filePath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  it("임시 파일을 남기지 않는다", async () => {
    const state = new WdaRunnerState(home);
    await Promise.all(Array.from({ length: 20 }, (_, i) => state.remember(record(`UDID-${i}`, 8100 + i))));

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(join(home, ".explore-mobile"));
    expect(entries.filter((name) => name.includes(".tmp"))).toEqual([]);
  });
});

describe("소유권 — CLI가 띄운 것만 안다 (AC-IOS2-027의 근거)", () => {
  it("기록에 없는 기기는 소유하지 않은 것으로 답한다", async () => {
    const state = new WdaRunnerState(home);
    await state.remember(record("UDID-A", 8100));

    expect(await state.owns("UDID-A")).toBe(true);
    expect(await state.owns("UDID-B")).toBe(false);
  });

  it("빈 상태에서는 아무것도 소유하지 않는다 — 0건 통과 방지", async () => {
    expect(await new WdaRunnerState(home).owns("UDID-A")).toBe(false);
  });
});
