/**
 * `pickHighestBuildToolsVersion()` — SPEC-INSTALL-001 M1, AC-INSTALL-013.
 *
 * The load-bearing test is the numeric-vs-string one: `["9.0.0", "36.1.0"]`
 * must yield `36.1.0`. A string-comparison implementation returns `9.0.0`
 * (because `'9' > '3'`), so this test is the negative control that fixes the
 * regression the SPEC names (plan.md §A.2 M1 "RED 먼저").
 */

import { describe, expect, it } from "vitest";

import { pickHighestBuildToolsVersion } from "./build-tools-version.js";

describe("pickHighestBuildToolsVersion", () => {
  it("AC-INSTALL-013: picks the numerically-highest version, not the string-highest", () => {
    // String compare would pick "9.0.0" here — the exact bug this AC guards.
    expect(pickHighestBuildToolsVersion(["9.0.0", "35.0.0", "36.0.0", "36.1.0"])).toBe("36.1.0");
  });

  it("matches the 2026-08-29 real host (three build-tools dirs)", () => {
    expect(pickHighestBuildToolsVersion(["35.0.0", "36.0.0", "36.1.0"])).toBe("36.1.0");
  });

  it("distinguishes minor and patch components numerically", () => {
    expect(pickHighestBuildToolsVersion(["36.0.0", "36.1.0", "36.0.9"])).toBe("36.1.0");
    expect(pickHighestBuildToolsVersion(["36.1.0", "36.10.0"])).toBe("36.10.0");
  });

  it("treats a missing trailing component as zero (36.1 == 36.1.0)", () => {
    expect(pickHighestBuildToolsVersion(["36.1", "36.1.0"])).toBe("36.1");
  });

  it("ignores entries that are not pure dotted-numeric", () => {
    expect(pickHighestBuildToolsVersion(["36.1.0", "36.2.0-rc1", "docs", ".DS_Store"])).toBe("36.1.0");
  });

  it("returns null when no entry qualifies", () => {
    expect(pickHighestBuildToolsVersion([])).toBeNull();
    expect(pickHighestBuildToolsVersion(["source.properties", "preview"])).toBeNull();
  });

  it("returns the sole valid entry when only one qualifies", () => {
    expect(pickHighestBuildToolsVersion(["35.0.0"])).toBe("35.0.0");
  });
});
