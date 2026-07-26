import { describe, expect, it } from "vitest";

import { simctlPbcopy } from "./idb-clipboard.js";

/**
 * `simctlPbcopy` spawns a real `xcrun simctl pbcopy` subprocess, so these
 * tests exercise only what is assertable without a booted simulator: the
 * failure path (an unknown udid must reject, never resolve silently) and the
 * fact that Unicode text is accepted as input at all. The success path is
 * covered by the real-simulator verification run, not by a unit test.
 */
describe("simctlPbcopy", () => {
  it("rejects (never silently resolves) when the target device does not exist", async () => {
    await expect(simctlPbcopy("NOT-A-REAL-UDID", "한글")).rejects.toThrow();
  }, 30_000);

  it("reports the failing command in the error message so the caller can diagnose it", async () => {
    const thrown: unknown = await simctlPbcopy("NOT-A-REAL-UDID", "x").catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/simctl pbcopy/);
  }, 30_000);
});
