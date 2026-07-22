import { describe, expect, it } from "vitest";

import { parseCommandArgs } from "./args.js";

describe("parseCommandArgs", () => {
  it("parses positionals and --device/--out (M3 baseline)", () => {
    const result = parseCommandArgs(["100", "200", "--device", "R58N90", "--out", "/tmp/shot.png"]);

    expect(result.positionals).toEqual(["100", "200"]);
    expect(result.device).toBe("R58N90");
    expect(result.out).toBe("/tmp/shot.png");
    expect(result.yes).toBe(false);
    expect(result.clean).toBe(false);
    expect(result.keepKeyboard).toBe(false);
  });

  it("recognizes --yes as consent (REQ-DOCTOR-002)", () => {
    expect(parseCommandArgs(["--yes"]).yes).toBe(true);
  });

  it("recognizes --install as an alias for --yes consent", () => {
    expect(parseCommandArgs(["--install"]).yes).toBe(true);
  });

  it("recognizes --clean (doctor --clean == reset, REQ-DOCTOR-004)", () => {
    expect(parseCommandArgs(["--clean"]).clean).toBe(true);
  });

  it("recognizes --keep-keyboard (text: opt out of the default post-send keyboard hide, REQ-INPUT-004 revised)", () => {
    expect(parseCommandArgs(["--keep-keyboard"]).keepKeyboard).toBe(true);
  });

  it("throws on an unrecognized flag (router converts this to a graceful INVALID_ARGS error)", () => {
    expect(() => parseCommandArgs(["--not-a-real-flag"])).toThrow();
  });
});
