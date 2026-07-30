import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ImeSessionStore } from "./ime-session-store.js";
import type { ImeSessionStoreIO } from "./ime-session-store.js";

describe("ImeSessionStore (REQ-INPUT-004 disk-persistence fix)", () => {
  let dir: string;
  let storePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "explore-mobile-ime-store-"));
    storePath = join(dir, "ime-sessions.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined for a serial with no recorded session and no file on disk yet", async () => {
    const store = new ImeSessionStore(storePath);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("persists the original IME across separate ImeSessionStore instances pointed at the same path (simulates a new CLI process)", async () => {
    const processA = new ImeSessionStore(storePath);
    await processA.setOriginalIme("R58N90ABCDE", "com.example/.OriginalIme");

    // A fresh instance, as a brand-new CLI process would construct — no
    // shared in-memory state with `processA`, only the file on disk.
    const processB = new ImeSessionStore(storePath);

    await expect(processB.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.OriginalIme");
  });

  it("overwriting an existing entry keeps only the latest value (last write wins)", async () => {
    const store = new ImeSessionStore(storePath);

    await store.setOriginalIme("R58N90ABCDE", "com.example/.First");
    await store.setOriginalIme("R58N90ABCDE", "com.example/.Second");

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.Second");
  });

  it("namespaces entries by serial — writing one serial never affects another", async () => {
    const store = new ImeSessionStore(storePath);

    await store.setOriginalIme("A", "com.example/.KeyboardA");
    await store.setOriginalIme("B", "com.example/.KeyboardB");

    await expect(store.getOriginalIme("A")).resolves.toBe("com.example/.KeyboardA");
    await expect(store.getOriginalIme("B")).resolves.toBe("com.example/.KeyboardB");
  });

  it("clearOriginalIme removes only the targeted serial's entry", async () => {
    const store = new ImeSessionStore(storePath);
    await store.setOriginalIme("A", "com.example/.KeyboardA");
    await store.setOriginalIme("B", "com.example/.KeyboardB");

    await store.clearOriginalIme("A");

    await expect(store.getOriginalIme("A")).resolves.toBeUndefined();
    await expect(store.getOriginalIme("B")).resolves.toBe("com.example/.KeyboardB");
  });

  it("clearOriginalIme on an already-absent serial is a graceful no-op", async () => {
    const store = new ImeSessionStore(storePath);

    await expect(store.clearOriginalIme("never-tracked")).resolves.toBeUndefined();
    await expect(store.getOriginalIme("never-tracked")).resolves.toBeUndefined();
  });

  it("supports an empty-string original IME (unknown-original edge case) as a distinct present entry", async () => {
    const store = new ImeSessionStore(storePath);

    await store.setOriginalIme("R58N90ABCDE", "");

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("");
  });

  it("treats a missing store file as empty rather than throwing", async () => {
    const store = new ImeSessionStore(join(dir, "does-not-exist", "ime-sessions.json"));

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("treats a malformed (non-JSON) store file as empty rather than throwing", async () => {
    await writeFile(storePath, "{ this is not valid JSON ]]]", "utf-8");
    const store = new ImeSessionStore(storePath);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
    // A subsequent write must still succeed despite the prior corruption.
    await store.setOriginalIme("R58N90ABCDE", "com.example/.Recovered");
    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.Recovered");
  });

  it("treats a valid-JSON-but-wrong-shape store file (array/primitive) as empty rather than throwing", async () => {
    await writeFile(storePath, JSON.stringify(["not", "a", "map"]), "utf-8");
    const store = new ImeSessionStore(storePath);

    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBeUndefined();
  });

  it("creates the parent directory on first write when it does not exist yet", async () => {
    const nestedPath = join(dir, "nested", "sub", "ime-sessions.json");
    const store = new ImeSessionStore(nestedPath);

    await expect(store.setOriginalIme("R58N90ABCDE", "com.example/.Original")).resolves.toBeUndefined();

    const rehydrated = new ImeSessionStore(nestedPath);
    await expect(rehydrated.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.Original");
  });

  it("supports an injected custom I/O implementation instead of real fs (in-memory fake)", async () => {
    const fakeFiles = new Map<string, Buffer>();
    const io: ImeSessionStoreIO = {
      read: async (path) => fakeFiles.get(path) ?? null,
      write: async (path, data) => {
        fakeFiles.set(path, data);
      },
    };
    const store = new ImeSessionStore("virtual/path/ime-sessions.json", io);

    await store.setOriginalIme("R58N90ABCDE", "com.example/.Original");

    expect(fakeFiles.has("virtual/path/ime-sessions.json")).toBe(true);
    await expect(store.getOriginalIme("R58N90ABCDE")).resolves.toBe("com.example/.Original");
  });
});

describe("cross-process interleaving (M1 reproduction gate — SPEC-IMESTATE-001)", () => {
  /**
   * Fake I/O whose `read()` forces two concurrent `ImeSessionStore`
   * operations to complete their internal `readAll()` BEFORE either can
   * begin its `writeAll()` — reproducing the read-modify-write race
   * documented at ime-session-store.ts:22-27 (@MX:NOTE). A sequential-await
   * harness (call A fully, then call B) CANNOT reproduce this: each
   * `setOriginalIme` re-reads internally, so two calls awaited one after
   * another never overlap — verified empirically as a false negative
   * during M1 (both records survive) and recorded in progress.md §E.2; see
   * acceptance.md AC-IMESTATE-002 하네스 요건 2.
   *
   * Every `read()` call is keyed by `path` (a `Map<string, Buffer>`, not a
   * single shared variable), so this fake survives M2's constructor-arg1
   * meaning change (file path -> directory path) without modification —
   * acceptance.md AC-IMESTATE-002 하네스 요건 1, 3.
   *
   * Every reader — including the one that releases the gate — awaits the
   * SAME gate before returning its snapshot, so neither reader's return
   * value can ever reflect a write the OTHER reader triggered; both always
   * observe the pre-write (empty) snapshot.
   */
  function createInterleavingIO(): { io: ImeSessionStoreIO; fakeFiles: Map<string, Buffer> } {
    const fakeFiles = new Map<string, Buffer>();
    let arrivals = 0;
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const io: ImeSessionStoreIO = {
      read: async (path) => {
        arrivals += 1;
        if (arrivals >= 2) releaseGate();
        await gate;
        return fakeFiles.get(path) ?? null;
      },
      write: async (path, data) => {
        fakeFiles.set(path, data);
      },
    };

    return { io, fakeFiles };
  }

  // `.fails()` (vitest 4.1.10, verified present before use — see
  // progress.md §E.2) marks a currently-failing assertion as PASS so the
  // suite stays green pre-fix, while still executing the real assertion on
  // every run: if M2's fix makes it pass for real, `.fails()` flips this to
  // a reported FAILURE, forcing the M2 author to remove the modifier. This
  // is the AC-IMESTATE-002 / AC-IMESTATE-021 전후 대조 의무 (before/after
  // contrast obligation) expressed as an executable, self-enforcing check.
  it.fails(
    "[AC-IMESTATE-002] does not lose a different serial's record when two setOriginalIme calls interleave inside the read-modify-write cycle (defect ①, ime-session-store.ts:22-27)",
    async () => {
      const { io } = createInterleavingIO();
      const store = new ImeSessionStore("virtual/ime-sessions.json", io);

      await Promise.all([
        store.setOriginalIme("SERIAL-A", "com.example/.KeyboardA"),
        store.setOriginalIme("SERIAL-B", "com.example/.KeyboardB"),
      ]);

      await expect(store.getOriginalIme("SERIAL-A")).resolves.toBe("com.example/.KeyboardA");
      await expect(store.getOriginalIme("SERIAL-B")).resolves.toBe("com.example/.KeyboardB");
    },
  );

  it.fails(
    "[AC-IMESTATE-021] the later of two concurrent check-then-act writers for the SAME serial overwrites the earlier one's value (defect ②, mirrors the adb-backend.ts:454-455 check-then-act pattern against the store's public API)",
    async () => {
      const { io } = createInterleavingIO();
      const store = new ImeSessionStore("virtual/ime-sessions.json", io);

      // Mirrors adb-backend.ts:454-455 exactly: read via `getOriginalIme`,
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

      // Post-fix (M2, exclusive create per REQ-IMESTATE-007) expectation:
      // the FIRST writer's value survives — it must never be silently
      // overwritten by a later "absent" reader that raced past the
      // exclusivity check before the first writer's value landed.
      await expect(store.getOriginalIme("SERIAL-X")).resolves.toBe("ime.first");
    },
  );
});
