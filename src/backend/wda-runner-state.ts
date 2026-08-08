/**
 * CLI가 띄운 WDA 러너의 기록 (SPEC-IOS-002 REQ-IOS2-009).
 *
 * **왜 파일인가**: CLI는 명령마다 새 프로세스다(`devices` → 끝 → `reset` → 새
 * 프로세스). `PerSerialState`는 프로세스 안에서만 사는 `Map`이므로, 여기에
 * 담으면 다음 `reset`이 그것을 보지 못한다. design.md §B.3이 "상태 파일 없이
 * 완전 무상태 — 기각. 종료 경로가 사라진다"고 적은 것이 이 이야기다.
 *
 * **왜 홈 아래인가**: 산출물과 같은 이유다(design.md §D.2). 이 CLI는 전역
 * 설치돼 아무 폴더에서나 실행되므로, 저장소 안에 두면 저장소 밖에서 못 찾는다.
 *
 * **키는 UDID** (design.md §B.4) — `iproxy -u`가 쓰는 값이다. `devicectl`이
 * 보고하는 `Identifier`와는 **다른 값**이며, 2026-08-08 실측에서 같은 아이패드가
 * `devicectl` 쪽 `D2C63314-…`와 UDID `00008103-…`로 갈렸다. 이 파일이 담는 것은
 * 후자다.
 *
 * @MX:ANCHOR — 쓰기는 반드시 임시 파일 + rename이다.
 * @MX:REASON — 이 저장소는 동시 쓰기로 바이트가 겹쳐 파일이 깨지고 **그 파일의
 * 모든 항목이 함께 사라진** 사고를 기록하고 있다. 한 항목이 덮이는 정도가 아니라
 * 전부가 날아간다. rename은 같은 파일 시스템 안에서 원자적이므로, 읽는 쪽은
 * 항상 온전한 이전 버전 아니면 온전한 새 버전을 본다.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WdaRunnerRecord {
  /** `iproxy -u`가 쓰는 UDID. `devicectl`의 Identifier가 아니다. */
  udid: string;
  /** 생존 판정에 쓰는 포트 (design.md §B.1 — 1차 신호). */
  port: number;
  /** 종료 경로에만 쓴다 (design.md §B.1 — 2차 정보). */
  iproxyPid: number;
  /** 종료 경로에만 쓴다. */
  runnerPid: number;
  startedAt: string;
}

type StateFile = Record<string, WdaRunnerRecord>;

export class WdaRunnerState {
  readonly filePath: string;
  private readonly dir: string;
  /** 같은 프로세스 안의 쓰기를 줄 세운다 — read-modify-write 사이의 겹침 방지. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(home: string = homedir()) {
    this.dir = join(home, ".explore-mobile");
    this.filePath = join(this.dir, "wda-runners.json");
  }

  async get(udid: string): Promise<WdaRunnerRecord | undefined> {
    return (await this.readAll())[udid];
  }

  /** CLI가 이 기기의 러너를 띄웠는가 — 종료 자격의 판정 근거 (AC-IOS2-027). */
  async owns(udid: string): Promise<boolean> {
    return (await this.get(udid)) !== undefined;
  }

  async remember(record: WdaRunnerRecord): Promise<void> {
    await this.mutate((state) => {
      state[record.udid] = record;
    });
  }

  async forget(udid: string): Promise<void> {
    await this.mutate((state) => {
      delete state[udid];
    });
  }

  /**
   * 읽기는 절대 던지지 않는다 — 파일이 없거나 깨져 있으면 빈 상태로 본다.
   * 진단·정리 경로가 파싱 오류로 죽으면 사용자는 정리할 수단을 잃는다.
   */
  private async readAll(): Promise<StateFile> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      return typeof parsed === "object" && parsed !== null ? (parsed as StateFile) : {};
    } catch {
      return {};
    }
  }

  /** read-modify-write를 줄 세우고, 쓰기는 임시 파일 + rename으로 원자화한다. */
  private mutate(change: (state: StateFile) => void): Promise<void> {
    const next = this.queue.then(async () => {
      const state = await this.readAll();
      change(state);
      await mkdir(this.dir, { recursive: true });

      const tempPath = `${this.filePath}.tmp-${process.pid}-${Math.round(performance.now() * 1000)}`;
      await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
    });
    // 한 번의 실패가 이후 쓰기를 영구히 막지 않도록 큐 자체는 항상 이어간다.
    this.queue = next.catch(() => undefined);
    return next;
  }
}
