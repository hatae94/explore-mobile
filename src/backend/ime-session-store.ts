/**
 * Disk-backed store for per-serial IME session state (REQ-INPUT-004
 * disk-persistence fix, real-device finding).
 *
 * Each `node dist/cli/bin.js <cmd>` invocation is a SEPARATE OS process,
 * so the previous purely in-memory per-serial tracking (per-serial-state.ts,
 * as used by `AdbBackend` before this fix) was lost the instant the
 * process exited. A non-ASCII `text` call and the later `reset` call that
 * must restore its pre-switch IME are almost always separate processes —
 * so the original (pre-ADBKeyBoard) IME has to be recorded somewhere that
 * survives process exit. This module is that somewhere.
 *
 * Store location: `<cache-dir>/ime-sessions.json`, sharing the same cache
 * directory the ADBKeyBoard APK download uses (see apk-downloader.ts
 * `resolveApkCacheDir()` — `~/.cache/explore-mobile`, falling back to
 * `os.tmpdir()` when the home directory cannot be resolved). Shape:
 * `{ [serial]: { originalIme } }`. An entry's mere PRESENCE marks "an
 * ADBKeyBoard session is active for this serial", mirroring the semantics
 * the old in-memory `PerSerialState.has()` used to carry — now durable
 * across process boundaries.
 *
 * @MX:NOTE — read-modify-write is NOT atomic across concurrent writers:
 * two `AdbBackend` processes racing to establish sessions for two
 * DIFFERENT serials at the same instant could clobber each other's write
 * (last write wins, dropping the other's entry). This is an accepted,
 * pre-existing limitation (best-effort persistence, not a distributed
 * lock) — the common case, one CLI invocation at a time, is unaffected.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveApkCacheDir } from "./apk-downloader.js";

/** One serial's persisted IME session record. */
export interface ImeSessionRecord {
  /** The device's default IME immediately before we switched it to ADBKeyBoard. Empty string when it could not be determined. */
  originalIme: string;
}

/** The full on-disk shape: serial -> its session record. */
export type ImeSessionMap = Record<string, ImeSessionRecord>;

export interface ImeSessionStoreIO {
  read: (path: string) => Promise<Buffer | null>;
  write: (path: string, data: Buffer) => Promise<void>;
}

const STORE_FILENAME = "ime-sessions.json";

/** `<cache-dir>/ime-sessions.json` — see module doc for the cache-dir resolution rule. */
export function resolveImeSessionStorePath(): string {
  return join(resolveApkCacheDir(), STORE_FILENAME);
}

const defaultIO: ImeSessionStoreIO = {
  async read(path) {
    try {
      return await readFile(path);
    } catch {
      return null;
    }
  },
  async write(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
};

/** True when `value` is a plain JSON object (not an array, not null) — the shape required before trusting it as an {@link ImeSessionMap}. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads/writes the per-serial IME session JSON file, tolerating a missing
 * or malformed file by treating it as empty (never throws on read). Path
 * and I/O are both injectable so tests can point this at a temp directory
 * instead of the real `~/.cache` (see ime-session-store.test.ts and
 * adb-backend.test.ts).
 */
export class ImeSessionStore {
  constructor(
    private readonly storePath: string = resolveImeSessionStorePath(),
    private readonly io: ImeSessionStoreIO = defaultIO,
  ) {}

  private async readAll(): Promise<ImeSessionMap> {
    const raw = await this.io.read(this.storePath);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw.toString("utf-8"));
      return isPlainObject(parsed) ? (parsed as ImeSessionMap) : {};
    } catch {
      // Malformed JSON (partial write, corruption, hand-edited file) —
      // never throw; treat it as if no session had ever been recorded.
      return {};
    }
  }

  private async writeAll(sessions: ImeSessionMap): Promise<void> {
    await this.io.write(this.storePath, Buffer.from(JSON.stringify(sessions, null, 2), "utf-8"));
  }

  /** The original IME recorded for `serial`, or `undefined` when no session is currently tracked. */
  async getOriginalIme(serial: string): Promise<string | undefined> {
    const sessions = await this.readAll();
    return sessions[serial]?.originalIme;
  }

  /** Records `originalIme` for `serial`, creating or overwriting its entry (last write wins). */
  async setOriginalIme(serial: string, originalIme: string): Promise<void> {
    const sessions = await this.readAll();
    sessions[serial] = { originalIme };
    await this.writeAll(sessions);
  }

  /** Removes `serial`'s tracked session, if any. A no-op (no write) when it was already absent. */
  async clearOriginalIme(serial: string): Promise<void> {
    const sessions = await this.readAll();
    if (!(serial in sessions)) return;
    delete sessions[serial];
    await this.writeAll(sessions);
  }
}
