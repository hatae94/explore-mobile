import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decodeSerialFromFilename,
  encodeSerialForFilename,
  ImeSessionStore,
} from "./ime-session-store.js";
import type { ImeSessionStoreIO } from "./ime-session-store.js";

/** `code`를 실은 파일 오류 — 실제 `fs`가 던지는 형태를 가짜 IO에서 흉내낸다. */
function fsError(code: string, path: string): Error & { code: string } {
  return Object.assign(new Error(`${code}: ${path}`), { code });
}

describe("ImeSessionStore (REQ-INPUT-004 disk-persistence fix)", () => {
  let dir: string;
  /**
   * SPEC-IMESTATE-001 M2부터 생성자 인자 1은 **디렉터리**다(이전에는 단일
   * 파일 경로였다 — `spec.md` §C.2 export 표면 변경 1행).
   */
  let storeDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "explore-mobile-ime-store-"));
    storeDir = join(dir, "ime-sessions");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined for a serial with no recorded session and no file on disk yet", async () => {
    const store = new ImeSessionStore(storeDir);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("persists the original IME across separate ImeSessionStore instances pointed at the same path (simulates a new CLI process)", async () => {
    const processA = new ImeSessionStore(storeDir);
    await processA.setOriginalIme("R58N90ABCDE", "com.example/.OriginalIme");

    // A fresh instance, as a brand-new CLI process would construct — no
    // shared in-memory state with `processA`, only the file on disk.
    const processB = new ImeSessionStore(storeDir);

    await expect(processB.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.OriginalIme");
  });

  /**
   * 계약 반전 기록 (SPEC-IMESTATE-001 M2 / REQ-IMESTATE-007).
   *
   * 이 테스트는 M2 이전까지 "overwriting an existing entry keeps only the
   * latest value (last write wins)"를 단정했다. 배타 생성 도입으로 그 계약이
   * **정반대로 확정**됐다 — 먼저 기록한 쪽이 이긴다. 단정을 약화시킨 것이
   * 아니라 명세가 뒤집은 것이며, 뒤집힌 방향을 그대로 강하게 단정한다.
   *
   * 왜 뒤집었나: 늦게 진입한 프로세스는 이미 ADBKeyBoard로 바뀐 IME를 "원래
   * IME"로 관측한다. 그것이 이기면 이후 `reset`이 기기를 ADBKeyBoard 자체로
   * "복원"해 사람이 손으로 되돌려야 한다.
   */
  it("keeps the FIRST recorded value when the same serial is recorded twice (exclusive create — first write wins, reversing the pre-M2 last-write-wins contract; the sequential counterpart of the concurrent AC-IMESTATE-021)", async () => {
    const store = new ImeSessionStore(storeDir);

    await store.setOriginalIme("R58N90ABCDE", "com.example/.First");
    await store.setOriginalIme("R58N90ABCDE", "com.example/.Second");

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.First");
  });

  it("namespaces entries by serial — writing one serial never affects another", async () => {
    const store = new ImeSessionStore(storeDir);

    await store.setOriginalIme("A", "com.example/.KeyboardA");
    await store.setOriginalIme("B", "com.example/.KeyboardB");

    await expect(store.getOriginalIme("A")).resolves.toBe("com.example/.KeyboardA");
    await expect(store.getOriginalIme("B")).resolves.toBe("com.example/.KeyboardB");
  });

  it("[AC-IMESTATE-001] stores each serial in its own file, so two serials never share a read-modify-write target", async () => {
    const store = new ImeSessionStore(storeDir);

    await store.setOriginalIme("A", "com.example/.KeyboardA");
    await store.setOriginalIme("B", "com.example/.KeyboardB");

    const pathA = join(storeDir, `${encodeSerialForFilename("A")}.json`);
    const pathB = join(storeDir, `${encodeSerialForFilename("B")}.json`);
    expect(pathA).not.toBe(pathB);

    // 각 파일은 자기 시리얼의 기록만 담는다 — 전체 맵이 아니다.
    const recordA: unknown = JSON.parse(await readFile(pathA, "utf-8"));
    expect(recordA).toEqual({ originalIme: "com.example/.KeyboardA", serial: "A" });
  });

  it("clearOriginalIme removes only the targeted serial's entry", async () => {
    const store = new ImeSessionStore(storeDir);
    await store.setOriginalIme("A", "com.example/.KeyboardA");
    await store.setOriginalIme("B", "com.example/.KeyboardB");

    await store.clearOriginalIme("A");

    await expect(store.getOriginalIme("A")).resolves.toBeUndefined();
    await expect(store.getOriginalIme("B")).resolves.toBe("com.example/.KeyboardB");
  });

  it("[AC-IMESTATE-015] clearOriginalIme leaves no record file but does leave a tombstone (the operational definition of 'no residue')", async () => {
    const store = new ImeSessionStore(storeDir);
    await store.setOriginalIme("A", "com.example/.KeyboardA");

    await store.clearOriginalIme("A");

    // AC-IMESTATE-015가 요구하는 세 가지를 모두 관측한다.
    const encoded = encodeSerialForFilename("A");
    // ① 레코드 파일이 없다
    await expect(readFile(join(storeDir, `${encoded}.json`))).rejects.toThrow();
    // ② 툼스톤이 있다 (원본 시리얼을 담아 추적 가능하다)
    await expect(readFile(join(storeDir, `${encoded}.cleared`), "utf-8")).resolves.toContain("A");
    // ③ 조회가 undefined를 반환한다
    await expect(store.getOriginalIme("A")).resolves.toBeUndefined();
  });

  it("clearOriginalIme on an already-absent serial is a graceful no-op", async () => {
    const store = new ImeSessionStore(storeDir);

    await expect(store.clearOriginalIme("never-tracked")).resolves.toBeUndefined();
    await expect(store.getOriginalIme("never-tracked")).resolves.toBeUndefined();
  });

  it("clearOriginalIme is idempotent — calling it twice does not throw", async () => {
    const store = new ImeSessionStore(storeDir);
    await store.setOriginalIme("A", "com.example/.KeyboardA");

    await store.clearOriginalIme("A");
    await expect(store.clearOriginalIme("A")).resolves.toBeUndefined();
    await expect(store.getOriginalIme("A")).resolves.toBeUndefined();
  });

  it("a new session after clear replaces the invalidated state (record beats tombstone)", async () => {
    const store = new ImeSessionStore(storeDir);
    await store.setOriginalIme("A", "com.example/.Old");
    await store.clearOriginalIme("A");

    await store.setOriginalIme("A", "com.example/.New");

    await expect(store.getOriginalIme("A")).resolves.toBe("com.example/.New");
  });

  it("supports an empty-string original IME (unknown-original edge case) as a distinct present entry", async () => {
    const store = new ImeSessionStore(storeDir);

    await store.setOriginalIme("R58N90ABCDE", "");

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("");
  });

  it("treats a missing store directory as empty rather than throwing", async () => {
    const store = new ImeSessionStore(join(dir, "does-not-exist", "ime-sessions"));

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("treats a malformed (non-JSON) record file as empty rather than throwing", async () => {
    await mkdir(storeDir, { recursive: true });
    const recordPath = join(storeDir, `${encodeSerialForFilename("R58N90ABCDE")}.json`);
    await writeFile(recordPath, "{ this is not valid JSON ]]]", "utf-8");
    const store = new ImeSessionStore(storeDir);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("treats a valid-JSON-but-wrong-shape record file (array/primitive) as empty rather than throwing", async () => {
    await mkdir(storeDir, { recursive: true });
    const recordPath = join(storeDir, `${encodeSerialForFilename("R58N90ABCDE")}.json`);
    await writeFile(recordPath, JSON.stringify(["not", "a", "record"]), "utf-8");
    const store = new ImeSessionStore(storeDir);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("treats an empty record file as empty rather than throwing", async () => {
    await mkdir(storeDir, { recursive: true });
    const recordPath = join(storeDir, `${encodeSerialForFilename("R58N90ABCDE")}.json`);
    await writeFile(recordPath, "", "utf-8");
    const store = new ImeSessionStore(storeDir);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("creates the parent directory on first write when it does not exist yet", async () => {
    const nestedDir = join(dir, "nested", "sub", "ime-sessions");
    const store = new ImeSessionStore(nestedDir);

    await expect(store.setOriginalIme("R58N90ABCDE", "com.example/.Original")).resolves.toBeUndefined();

    const rehydrated = new ImeSessionStore(nestedDir);
    await expect(rehydrated.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.Original");
  });

  it("supports an injected custom I/O implementation instead of real fs (in-memory fake)", async () => {
    const fakeFiles = new Map<string, Buffer>();
    const io: ImeSessionStoreIO = {
      read: async (path) => fakeFiles.get(path) ?? null,
      write: async (path, data) => {
        fakeFiles.set(path, data);
      },
      createExclusive: async (path, data) => {
        if (fakeFiles.has(path)) throw fsError("EEXIST", path);
        fakeFiles.set(path, data);
      },
      remove: async (path) => {
        if (!fakeFiles.has(path)) throw fsError("ENOENT", path);
        fakeFiles.delete(path);
      },
    };
    const store = new ImeSessionStore("virtual/ime-sessions", io);

    await store.setOriginalIme("R58N90ABCDE", "com.example/.Original");

    expect(fakeFiles.has(join("virtual/ime-sessions", `${encodeSerialForFilename("R58N90ABCDE")}.json`))).toBe(true);
    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.Original");
  });
});

describe("serial → filename encoding (REQ-IMESTATE-002)", () => {
  it("[AC-IMESTATE-004] is injective for serials that the legacy lossy transform collapsed together", () => {
    // 손실 있는 변환 replace(/[^A-Za-z0-9_-]/g, "_")는 이 둘을 같은 값으로
    // 붕괴시킨다(§A.3-④가 재사용을 기각한 이유). hex 인코딩은 분리를 유지한다.
    // 그 변환은 SPEC 작성 후 저장소에서 제거됐으므로 여기서 원본 코드를
    // 참조하지 않고 성질만 검증한다.
    const a = encodeSerialForFilename("192.168.1.5:5555");
    const b = encodeSerialForFilename("192_168_1_5_5555");

    expect(a).not.toBe(b);
  });

  it("emits only lowercase hex, so a case-insensitive filesystem cannot collapse two serials", () => {
    const upper = encodeSerialForFilename("ABC123");
    const lower = encodeSerialForFilename("abc123");

    expect(upper).toBe("414243313233");
    expect(lower).toBe("616263313233");
    expect(upper).not.toBe(lower);
    // 대소문자를 무시해도 여전히 다르다 — 무구분 볼륨에서도 충돌하지 않는다.
    expect(upper.toLowerCase()).not.toBe(lower.toLowerCase());
    expect(/^[0-9a-f]*$/.test(upper + lower)).toBe(true);
  });

  it("[AC-IMESTATE-006] leaves no path separator or reserved character in the filename", () => {
    const encoded = encodeSerialForFilename("../../etc/passwd:0");

    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("\\");
    expect(encoded).not.toContain(":");
    expect(encoded).not.toContain(".");
  });

  it("round-trips back to the original serial (traceability)", () => {
    for (const serial of ["R58N90ABCDE", "192.168.1.5:5555", "한글시리얼", ""]) {
      expect(decodeSerialFromFilename(encodeSerialForFilename(serial))).toBe(serial);
    }
  });
});

describe("write-failure discipline (REQ-IMESTATE-007)", () => {
  /** 지정한 코드로 배타 생성만 실패시키는 가짜 IO. */
  function createFailingIO(code: string): ImeSessionStoreIO {
    const fakeFiles = new Map<string, Buffer>();
    return {
      read: async (path) => fakeFiles.get(path) ?? null,
      write: async (path, data) => {
        fakeFiles.set(path, data);
      },
      createExclusive: async (path) => {
        throw fsError(code, path);
      },
      remove: async (path) => {
        if (!fakeFiles.has(path)) throw fsError("ENOENT", path);
        fakeFiles.delete(path);
      },
    };
  }

  it("[AC-IMESTATE-027] rejects when the exclusive create fails with a non-EEXIST error (ENOENT)", async () => {
    const store = new ImeSessionStore("virtual/ime-sessions", createFailingIO("ENOENT"));

    await expect(store.setOriginalIme("A", "com.example/.Keyboard")).rejects.toThrow(/ENOENT/);
  });

  it("[AC-IMESTATE-027] rejects when the exclusive create fails with EACCES", async () => {
    const store = new ImeSessionStore("virtual/ime-sessions", createFailingIO("EACCES"));

    await expect(store.setOriginalIme("A", "com.example/.Keyboard")).rejects.toThrow(/EACCES/);
  });

  it("[AC-IMESTATE-022] returns normally (does NOT reject) when the exclusive create fails with EEXIST — the loser's failure never leaks out as an error", async () => {
    const store = new ImeSessionStore("virtual/ime-sessions", createFailingIO("EEXIST"));

    await expect(store.setOriginalIme("A", "com.example/.Keyboard")).resolves.toBeUndefined();
  });

  it("rejects when the tombstone create fails with a non-EEXIST error, so a caller is never told an invalidation succeeded that did not", async () => {
    const store = new ImeSessionStore("virtual/ime-sessions", createFailingIO("ENOSPC"));

    await expect(store.clearOriginalIme("A")).rejects.toThrow(/ENOSPC/);
  });
});

describe("state-changing operation order (spec.md §A.3-⑦·⑧)", () => {
  /** 모든 연산을 순서대로 기록하는 가짜 IO. */
  function createRecordingIO(): { io: ImeSessionStoreIO; ops: string[]; files: Map<string, Buffer> } {
    const files = new Map<string, Buffer>();
    const ops: string[] = [];
    const io: ImeSessionStoreIO = {
      read: async (path) => files.get(path) ?? null,
      write: async (path, data) => {
        files.set(path, data);
      },
      createExclusive: async (path, data) => {
        if (files.has(path)) throw fsError("EEXIST", path);
        ops.push(`create ${path.endsWith(".cleared") ? "tombstone" : "record"}`);
        files.set(path, data);
      },
      remove: async (path) => {
        if (!files.has(path)) throw fsError("ENOENT", path);
        ops.push(`remove ${path.endsWith(".cleared") ? "tombstone" : "record"}`);
        files.delete(path);
      },
    };
    return { io, ops, files };
  }

  it("clear creates the tombstone BEFORE removing the record — the reverse order opens a window where a lookup falls through to the legacy file", async () => {
    const { io, ops } = createRecordingIO();
    const store = new ImeSessionStore("virtual/ime-sessions", io);
    await store.setOriginalIme("A", "com.example/.Keyboard");
    ops.length = 0;

    await store.clearOriginalIme("A");

    expect(ops).toEqual(["create tombstone", "remove record"]);
  });

  it("a new session creates the record BEFORE removing the tombstone — the reverse order opens the same window", async () => {
    const { io, ops } = createRecordingIO();
    const store = new ImeSessionStore("virtual/ime-sessions", io);
    await store.setOriginalIme("A", "com.example/.Old");
    await store.clearOriginalIme("A");
    ops.length = 0;

    await store.setOriginalIme("A", "com.example/.New");

    expect(ops).toEqual(["create record", "remove tombstone"]);
  });
});

describe("cross-process interleaving (M1 reproduction gate — SPEC-IMESTATE-001)", () => {
  /**
   * 두 개의 동시 `ImeSessionStore` 연산이 **서로의 쓰기를 관측하기 전에** 각자
   * 상태 판단을 끝내도록 강제하는 가짜 IO. 이 배리어가 없으면 결함이 재현되지
   * 않는다 — 순차 `await` 하네스(A를 끝내고 B를 호출)는 M1에서 **거짓 음성**으로
   * 실측됐다(양쪽 기록이 모두 생존; `progress.md` §E.2 / `acceptance.md`
   * AC-IMESTATE-002 하네스 요건 2).
   *
   * 모든 파일은 `path`를 키로 하는 `Map`에 담긴다(단일 blob 변수가 아니다).
   * 덕분에 M2의 생성자 arg1 의미 변화(파일 경로 → 디렉터리 경로)에도 이
   * 하네스는 본문 수정 없이 재사용된다 — 하네스 요건 1, 3.
   *
   * **M2에서 배리어 지점이 이동했다.** M1 시점의 `setOriginalIme`은 내부에서
   * `readAll()`을 했으므로 배리어를 `read`에 걸면 충분했다. M2의
   * `setOriginalIme`은 read-modify-write를 하지 않고 **배타 생성 한 번**으로
   * 끝나므로, `read`에만 걸린 배리어는 애초에 도달하지 않는다. 그래서 배리어를
   * `read`와 `createExclusive` **양쪽**에 건다 — 인터리빙을 "쓰기가 실제로
   * 일어나는 지점"에서 강제한다는 요건 2의 의도는 그대로다. 이 이동이 없으면
   * 테스트 ①은 게이트가 영영 풀리지 않아 교착한다(약화가 아니라 지점 정정).
   */
  function createInterleavingIO(): {
    io: ImeSessionStoreIO;
    fakeFiles: Map<string, Buffer>;
    /** 경로별 배타 생성 **시도** 횟수(성공·EEXIST 실패 모두 포함). */
    createAttempts: Map<string, number>;
  } {
    const fakeFiles = new Map<string, Buffer>();
    const createAttempts = new Map<string, number>();
    let arrivals = 0;
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    /** 두 번째 도착자가 게이트를 연다. 도착자 전원이 같은 게이트를 기다린다. */
    async function arriveAndWait(): Promise<void> {
      arrivals += 1;
      if (arrivals >= 2) releaseGate();
      await gate;
    }

    const io: ImeSessionStoreIO = {
      read: async (path) => {
        await arriveAndWait();
        return fakeFiles.get(path) ?? null;
      },
      write: async (path, data) => {
        fakeFiles.set(path, data);
      },
      createExclusive: async (path, data) => {
        await arriveAndWait();
        createAttempts.set(path, (createAttempts.get(path) ?? 0) + 1);
        // 실제 `wx` 플래그의 원자성을 흉내낸다: 존재 확인과 생성 사이에
        // 다른 주체가 끼어들 수 없다(await 없이 연속 실행).
        if (fakeFiles.has(path)) throw fsError("EEXIST", path);
        fakeFiles.set(path, data);
      },
      remove: async (path) => {
        if (!fakeFiles.has(path)) throw fsError("ENOENT", path);
        fakeFiles.delete(path);
      },
    };

    return { io, fakeFiles, createAttempts };
  }

  // M1에서 이 두 테스트는 `it.fails()`로 감싸여 있었다 — 수정 전에는 실제로
  // 실패했고, `.fails()`가 그것을 PASS로 계상해 스위트를 초록으로 유지하면서도
  // 매 실행마다 진짜 단정을 수행했다. M2가 결함을 없애 두 단정이 진짜로
  // 통과하게 되자 `.fails()`는 스스로 FAILURE를 보고했고, 그 신호에 따라
  // 여기서 제거했다. 이것이 AC-IMESTATE-002 / AC-IMESTATE-021이 요구한
  // 전후 대조 의무의 후반부 관측이다.
  it("[AC-IMESTATE-002] does not lose a different serial's record when two setOriginalIme calls interleave (defect ① — closed by per-serial file separation)", async () => {
    const { io } = createInterleavingIO();
    const store = new ImeSessionStore("virtual/ime-sessions", io);

    await Promise.all([
      store.setOriginalIme("SERIAL-A", "com.example/.KeyboardA"),
      store.setOriginalIme("SERIAL-B", "com.example/.KeyboardB"),
    ]);

    await expect(store.getOriginalIme("SERIAL-A")).resolves.toBe("com.example/.KeyboardA");
    await expect(store.getOriginalIme("SERIAL-B")).resolves.toBe("com.example/.KeyboardB");
  });

  it("[AC-IMESTATE-021] the FIRST of two concurrent check-then-act writers for the SAME serial wins (defect ② — closed by exclusive create)", async () => {
    const { io, createAttempts } = createInterleavingIO();
    const store = new ImeSessionStore("virtual/ime-sessions", io);

    // Mirrors adb-backend.ts:438-440 exactly: read via `getOriginalIme`,
    // and only when it is `undefined` does the caller write. PRESERVE
    // forbids modifying adb-backend.ts, so the pattern is exercised
    // directly against ImeSessionStore's public API instead of through
    // the full AdbBackend.text() call (which pulls in unrelated adb-exec
    // mocking irrelevant to this race).
    async function checkThenRecordIfAbsent(serial: string, value: string): Promise<void> {
      const existing = await store.getOriginalIme(serial);
      if (existing === undefined) {
        await store.setOriginalIme(serial, value);
      }
    }

    await Promise.all([
      checkThenRecordIfAbsent("SERIAL-X", "ime.first"),
      checkThenRecordIfAbsent("SERIAL-X", "ime.second"),
    ]);

    // 공허 검사 방지 관문 — **이 단정이 먼저다.**
    //
    // 두 주체가 겹치지 않았다면(A가 끝난 뒤 B가 A의 값을 보고 쓰기를 건너뛰면)
    // 최종값은 배타 생성이 없어도 "ime.first"가 된다. 즉 아래 값 단정만으로는
    // **결함이 있어도 통과**할 수 있다. 그래서 "둘 다 실제로 생성을 시도했다"를
    // 먼저 못박는다 — 시도가 2회여야만 값 단정이 배타성의 증거가 된다.
    // (1차 감사가 지적한 "결함이 있어도 무조건 PASS하는 공허한 검사"의 재발
    // 방지. 시도가 1회로 떨어지면 이 테스트는 즉시 실패해 하네스 퇴화를 알린다.)
    const recordPath = join("virtual/ime-sessions", `${encodeSerialForFilename("SERIAL-X")}.json`);
    expect(createAttempts.get(recordPath)).toBe(2);

    // Post-fix (M2, exclusive create per REQ-IMESTATE-007) expectation:
    // the FIRST writer's value survives — it must never be silently
    // overwritten by a later "absent" reader that raced past the
    // exclusivity check before the first writer's value landed.
    await expect(store.getOriginalIme("SERIAL-X")).resolves.toBe("ime.first");
  });
});
