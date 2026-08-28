/**
 * `parseApkBadging()` — SPEC-INSTALL-001 M2, REQ-INSTALL-002.
 *
 * The real 2026-08-29 first line is used verbatim as the primary fixture so
 * the parser is pinned to observed output, not an imagined shape.
 */

import { describe, expect, it } from "vitest";

import { parseApkBadging } from "./apk-metadata-parser.js";

// Verbatim first line of `aapt2 dump badging build-1782196453010.apk` (2026-08-29).
const REAL_BADGING =
  "package: name='com.hatae.moyura' versionCode='1' versionName='1.0.0' " +
  "platformBuildVersionName='16' platformBuildVersionCode='36' " +
  "compileSdkVersion='36' compileSdkVersionCodename='16'\n" +
  "minSdkVersion:'24'\ntargetSdkVersion:'36'";

describe("parseApkBadging", () => {
  it("extracts all three fields from the real observed badging line", () => {
    expect(parseApkBadging(REAL_BADGING)).toEqual({
      packageName: "com.hatae.moyura",
      versionCode: "1",
      versionName: "1.0.0",
    });
  });

  it("keys on the package: line, not on line position — tolerates leading warnings", () => {
    const withWarning = "W: some aapt warning line\n" + REAL_BADGING;
    expect(parseApkBadging(withWarning)?.packageName).toBe("com.hatae.moyura");
  });

  it("returns null for invalid input (aapt error output, no package: line)", () => {
    // Verbatim 2026-08-29 invalid-input output.
    const invalid = "/tmp/notapk.txt: error: failed opening zip: Invalid file.";
    expect(parseApkBadging(invalid)).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(parseApkBadging("")).toBeNull();
  });

  it("returns null when the package: line has an empty name", () => {
    expect(parseApkBadging("package: name='' versionCode='1'")).toBeNull();
  });

  it("tolerates a missing versionCode/versionName (defaults to empty string)", () => {
    expect(parseApkBadging("package: name='com.x.y'")).toEqual({
      packageName: "com.x.y",
      versionCode: "",
      versionName: "",
    });
  });

  it("does not confuse the platformBuildVersionName for the app versionName", () => {
    // platformBuildVersionName='16' must NOT be picked as versionName.
    const parsed = parseApkBadging(REAL_BADGING);
    expect(parsed?.versionName).toBe("1.0.0");
    expect(parsed?.versionName).not.toBe("16");
  });
});
