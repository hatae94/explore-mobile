/**
 * ADBKeyBoard runtime download + local cache (license-compliance
 * follow-up to M6/M8).
 *
 * ADBKeyBoard is GPL-2.0 licensed; this package (explore-mobile) is MIT.
 * We do NOT bundle or redistribute the compiled APK inside this npm
 * package — `doctor` downloads it on demand, directly from the upstream
 * project's official GitHub release (a PINNED ref, never `master`, for
 * reproducibility), validates it, and caches it locally so repeated
 * `doctor` runs do not re-download (idempotent).
 *
 * @MX:WARN — downloads and executes third-party binary content (an APK)
 * from a network source at runtime.
 * @MX:REASON — this is the SPEC's only runtime-network-fetch code path;
 * every download is from a pinned ref, validated for ZIP/APK magic bytes
 * before being passed to `adb install`, and gracefully rejected (never
 * silently accepted, never a fabricated/corrupted binary) on any failure.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { ADBKEYBOARD_PINNED_VERSION, adbKeyboardRawFallbackUrl, adbKeyboardReleaseDownloadUrl } from "./adbkeyboard.js";

export interface ApkAcquisitionResult {
  /** Absolute local path to a validated APK file, ready for `adb install`. */
  path: string;
  /** True when reused from a valid local cache entry (no network request made). */
  fromCache: boolean;
  /** The URL that succeeded, when freshly downloaded (undefined when fromCache). */
  sourceUrl?: string;
}

/** Acquires a validated ADBKeyBoard APK, from cache or by downloading it. Throws with manual-install guidance on failure. */
export type ApkAcquirer = () => Promise<ApkAcquisitionResult>;

/** Minimal structural subset of the standard `fetch` response, for testability. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface CacheIO {
  read: (path: string) => Promise<Buffer | null>;
  write: (path: string, data: Buffer) => Promise<void>;
}

const CACHE_DIR_NAME = "explore-mobile";
const CACHED_APK_FILENAME = `ADBKeyBoard-${ADBKEYBOARD_PINNED_VERSION}.apk`;

/** ZIP/APK local-file-header magic bytes ("PK") — the validation contract: non-empty + this 2-byte prefix. */
function isValidApkBytes(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** `~/.cache/explore-mobile/`, falling back to the OS temp dir if the home directory cannot be resolved. */
export function resolveApkCacheDir(): string {
  try {
    return join(homedir(), ".cache", CACHE_DIR_NAME);
  } catch {
    return join(tmpdir(), CACHE_DIR_NAME);
  }
}

export function resolveApkCachePath(): string {
  return join(resolveApkCacheDir(), CACHED_APK_FILENAME);
}

const defaultCacheIO: CacheIO = {
  async read(path) {
    try {
      return await readFile(path);
    } catch {
      return null;
    }
  },
  async write(path, data) {
    await mkdir(resolveApkCacheDir(), { recursive: true });
    await writeFile(path, data);
  },
};

async function tryDownload(url: string, fetchImpl: FetchLike): Promise<Uint8Array | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Creates an {@link ApkAcquirer}. Defaults to the real `fetch` (Node 20+
 * built-in) and a local filesystem cache; tests inject a mock
 * `fetchImpl`/`cacheIO` to exercise download success/failure, the
 * primary→fallback URL sequence, cache reuse, and invalid-APK rejection
 * without any real network or filesystem access.
 */
export function createApkAcquirer(
  fetchImpl: FetchLike = fetch,
  cacheIO: CacheIO = defaultCacheIO,
): ApkAcquirer {
  return async () => {
    const cachePath = resolveApkCachePath();

    // Idempotency: reuse a valid cached file without re-downloading. A
    // corrupted/invalid cache entry is NOT trusted — falls through to a
    // fresh download instead.
    const cached = await cacheIO.read(cachePath);
    if (cached && isValidApkBytes(cached)) {
      return { path: cachePath, fromCache: true };
    }

    const primaryUrl = adbKeyboardReleaseDownloadUrl();
    const fallbackUrl = adbKeyboardRawFallbackUrl();

    let bytes = await tryDownload(primaryUrl, fetchImpl);
    let sourceUrl = primaryUrl;

    if (!bytes) {
      bytes = await tryDownload(fallbackUrl, fetchImpl);
      sourceUrl = fallbackUrl;
    }

    if (!bytes || !isValidApkBytes(bytes)) {
      throw new Error(
        `Failed to download a valid ADBKeyBoard APK from ${primaryUrl} or fallback ${fallbackUrl}. ` +
          "Install manually: download the APK from https://github.com/senzhk/ADBKeyBoard/releases " +
          "and run 'adb install <path-to-apk>'.",
      );
    }

    await cacheIO.write(cachePath, Buffer.from(bytes));

    return { path: cachePath, fromCache: false, sourceUrl };
  };
}
