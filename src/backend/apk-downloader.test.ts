import { describe, expect, it, vi } from "vitest";

import { adbKeyboardRawFallbackUrl, adbKeyboardReleaseDownloadUrl } from "./adbkeyboard.js";
import { createApkAcquirer, resolveApkCachePath } from "./apk-downloader.js";
import type { CacheIO, FetchLike } from "./apk-downloader.js";

const VALID_APK_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03]); // "PK\x03\x04..."
const INVALID_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03]); // not "PK"-prefixed

function fakeResponse(ok: boolean, bytes: Uint8Array): Awaited<ReturnType<FetchLike>> {
  return {
    ok,
    status: ok ? 200 : 404,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },
  };
}

function noCache(): CacheIO {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
  };
}

describe("adbkeyboard URL builders (pinned ref, not master)", () => {
  it("uses the pinned ref, never 'master', in both URLs", () => {
    expect(adbKeyboardReleaseDownloadUrl()).not.toContain("/master/");
    expect(adbKeyboardRawFallbackUrl()).not.toContain("/master/");
    expect(adbKeyboardReleaseDownloadUrl()).toMatch(/\/releases\/download\/v[\w.-]+\//);
    expect(adbKeyboardRawFallbackUrl()).toMatch(/\/raw\/v[\w.-]+\//);
  });

  it("points at the official senzhk/ADBKeyBoard repository", () => {
    expect(adbKeyboardReleaseDownloadUrl()).toContain("github.com/senzhk/ADBKeyBoard");
    expect(adbKeyboardRawFallbackUrl()).toContain("github.com/senzhk/ADBKeyBoard");
  });
});

describe("createApkAcquirer (M8-followup — runtime download, no bundled APK)", () => {
  it("downloads from the primary release URL and caches the validated result", async () => {
    const cache = noCache();
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValueOnce(fakeResponse(true, VALID_APK_BYTES));
    const acquire = createApkAcquirer(fetchImpl, cache);

    const result = await acquire();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(adbKeyboardReleaseDownloadUrl());
    expect(result.fromCache).toBe(false);
    expect(result.sourceUrl).toBe(adbKeyboardReleaseDownloadUrl());
    expect(result.path).toBe(resolveApkCachePath());
    expect(cache.write).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledWith(resolveApkCachePath(), Buffer.from(VALID_APK_BYTES));
  });

  it("falls back to the raw pinned-ref URL when the primary release URL fails (network error / 404)", async () => {
    const cache = noCache();
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(fakeResponse(false, new Uint8Array())) // primary: 404
      .mockResolvedValueOnce(fakeResponse(true, VALID_APK_BYTES)); // fallback: succeeds
    const acquire = createApkAcquirer(fetchImpl, cache);

    const result = await acquire();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, adbKeyboardReleaseDownloadUrl());
    expect(fetchImpl).toHaveBeenNthCalledWith(2, adbKeyboardRawFallbackUrl());
    expect(result.fromCache).toBe(false);
    expect(result.sourceUrl).toBe(adbKeyboardRawFallbackUrl());
  });

  it("throws a graceful error with manual-install guidance when BOTH URLs fail (network error)", async () => {
    const cache = noCache();
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error("network unreachable"));
    const acquire = createApkAcquirer(fetchImpl, cache);

    await expect(acquire()).rejects.toThrow(/manual|adb install/i);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it("throws a graceful error when both URLs 404", async () => {
    const cache = noCache();
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(fakeResponse(false, new Uint8Array()));
    const acquire = createApkAcquirer(fetchImpl, cache);

    await expect(acquire()).rejects.toThrow();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it("rejects a downloaded file that is not valid APK/ZIP (magic bytes check) and does not cache it", async () => {
    const cache = noCache();
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValueOnce(fakeResponse(true, INVALID_BYTES));
    const acquire = createApkAcquirer(fetchImpl, cache);

    await expect(acquire()).rejects.toThrow();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it("rejects an empty (zero-byte) download", async () => {
    const cache = noCache();
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(fakeResponse(true, new Uint8Array()));
    const acquire = createApkAcquirer(fetchImpl, cache);

    await expect(acquire()).rejects.toThrow();
  });

  it("reuses a valid cached file WITHOUT any network request (idempotent, REQ-IDEMP-002 spirit)", async () => {
    const cache: CacheIO = {
      read: vi.fn().mockResolvedValue(Buffer.from(VALID_APK_BYTES)),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const fetchImpl = vi.fn<FetchLike>();
    const acquire = createApkAcquirer(fetchImpl, cache);

    const result = await acquire();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.path).toBe(resolveApkCachePath());
    expect(result.sourceUrl).toBeUndefined();
  });

  it("does not trust a corrupted cached file — re-downloads when the cached bytes fail validation", async () => {
    const cache: CacheIO = {
      read: vi.fn().mockResolvedValue(Buffer.from(INVALID_BYTES)), // corrupted cache entry
      write: vi.fn().mockResolvedValue(undefined),
    };
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValueOnce(fakeResponse(true, VALID_APK_BYTES));
    const acquire = createApkAcquirer(fetchImpl, cache);

    const result = await acquire();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(cache.write).toHaveBeenCalledTimes(1);
  });
});
