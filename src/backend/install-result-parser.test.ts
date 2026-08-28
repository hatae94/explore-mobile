/**
 * `classifyInstallOutput()` + `pmListHasExactPackage()` — SPEC-INSTALL-001 M3,
 * AC-INSTALL-024/025.
 *
 * The load-bearing test is AC-INSTALL-025: an exit-0 response carrying a
 * `Failure` token is a FAILURE. A parser that trusted the exit code would
 * pass this input as success — the exact launch-path defect spec.md §C.2
 * warns about.
 */

import { describe, expect, it } from "vitest";

import { classifyInstallOutput, pmListHasExactPackage } from "./install-result-parser.js";

describe("classifyInstallOutput", () => {
  it("recognizes success", () => {
    expect(classifyInstallOutput("Success\n")).toEqual({ ok: true });
  });

  it("AC-INSTALL-025: a Failure token wins even when the exit context was 0 (token, not exit code)", () => {
    // classifyInstallOutput never sees an exit code — that is the point. A
    // 'Success' substring alongside a 'Failure' token must still be a failure.
    const out = "Success partial then\nFailure [INSTALL_FAILED_INTERNAL_ERROR]";
    const result = classifyInstallOutput(out);
    expect(result.ok).toBe(false);
  });

  it("classifies a signature mismatch", () => {
    const out = "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.x signatures do not match]";
    expect(classifyInstallOutput(out)).toMatchObject({ ok: false, kind: "signature" });
  });

  it("classifies a version downgrade", () => {
    const out = "adb: failed to install app.apk: Failure [INSTALL_FAILED_VERSION_DOWNGRADE]";
    expect(classifyInstallOutput(out)).toMatchObject({ ok: false, kind: "downgrade" });
  });

  it("AC-INSTALL-036: does NOT classify insufficient storage — falls through to 'failed', raw preserved", () => {
    const out = "Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]";
    const result = classifyInstallOutput(out);
    expect(result).toMatchObject({ ok: false, kind: "failed" });
    if (!result.ok) expect(result.raw).toContain("INSTALL_FAILED_INSUFFICIENT_STORAGE");
  });

  it("AC-INSTALL-024: an unclassified failure preserves the raw output", () => {
    const out = "Failure [SOME_BRAND_NEW_ERROR_CODE]";
    const result = classifyInstallOutput(out);
    expect(result).toMatchObject({ ok: false, kind: "failed" });
    if (!result.ok) expect(result.raw).toContain("SOME_BRAND_NEW_ERROR_CODE");
  });

  it("an empty / unrecognized output is a failure, not a false success", () => {
    expect(classifyInstallOutput("").ok).toBe(false);
  });
});

describe("pmListHasExactPackage", () => {
  it("matches an exact package line", () => {
    expect(pmListHasExactPackage("package:com.hatae.moyura\n", "com.hatae.moyura")).toBe(true);
  });

  it("does NOT match a substring-only package (pm list filters by substring)", () => {
    // pm list packages com.foo also lists com.foobar — a loose match would
    // misreport a fresh install of com.foo as an upgrade.
    expect(pmListHasExactPackage("package:com.foobar\n", "com.foo")).toBe(false);
  });

  it("finds the target among several listed packages", () => {
    const out = "package:com.android.shell\npackage:com.hatae.moyura\npackage:com.google.x\n";
    expect(pmListHasExactPackage(out, "com.hatae.moyura")).toBe(true);
  });

  it("returns false for empty output", () => {
    expect(pmListHasExactPackage("", "com.hatae.moyura")).toBe(false);
  });
});
