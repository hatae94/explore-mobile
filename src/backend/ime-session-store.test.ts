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
