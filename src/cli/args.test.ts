import { describe, expect, it } from "vitest";

import { normalizeWebFlagArgv, parseCommandArgs } from "./args.js";

describe("parseCommandArgs", () => {
  it("parses positionals and --device/--out (M3 baseline)", () => {
    const result = parseCommandArgs(["100", "200", "--device", "R58N90", "--out", "/tmp/shot.png"]);

    expect(result.positionals).toEqual(["100", "200"]);
    expect(result.device).toBe("R58N90");
    expect(result.out).toBe("/tmp/shot.png");
    expect(result.yes).toBe(false);
    expect(result.clean).toBe(false);
    expect(result.keepKeyboard).toBe(false);
    expect(result.id).toBeUndefined();
    expect(result.selectorText).toBeUndefined();
    expect(result.index).toBeUndefined();
  });

  it("parses --id/--text/--index (element-selector targeting, new capability)", () => {
    const result = parseCommandArgs(["--id", "btn_ok", "--text", "OK", "--index", "2"]);

    expect(result.id).toBe("btn_ok");
    expect(result.selectorText).toBe("OK");
    expect(result.index).toBe("2");
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

  it("leaves web undefined when --web is absent (native path unchanged, REQ-WEB-CLI-001)", () => {
    expect(parseCommandArgs(["100", "200"]).web).toBeUndefined();
  });

  it("parses a bare --web as web mode with no selector (dump --web)", () => {
    expect(parseCommandArgs(["--web"]).web).toBe("");
    expect(parseCommandArgs(["--web", "--device", "UDID"]).web).toBe("");
  });

  it("parses --web <CSS> as web mode with a selector", () => {
    expect(parseCommandArgs(["--web", "a[href]"]).web).toBe("a[href]");
    expect(parseCommandArgs(["안녕", "--web", "#query"]).positionals).toEqual(["안녕"]);
    expect(parseCommandArgs(["안녕", "--web", "#query"]).web).toBe("#query");
  });
});

describe("normalizeWebFlagArgv", () => {
  it("leaves argv untouched when --web is absent", () => {
    expect(normalizeWebFlagArgv(["tap", "1", "2"])).toEqual(["tap", "1", "2"]);
  });

  it("supplies an empty value for a trailing bare --web", () => {
    expect(normalizeWebFlagArgv(["--web"])).toEqual(["--web", ""]);
  });

  it("supplies an empty value when --web is followed by another flag", () => {
    expect(normalizeWebFlagArgv(["--web", "--device", "X"])).toEqual(["--web", "", "--device", "X"]);
  });

  it("keeps a selector that follows --web", () => {
    expect(normalizeWebFlagArgv(["--web", "a.link"])).toEqual(["--web", "a.link"]);
  });

  it("does not touch a --web=<value> form", () => {
    expect(normalizeWebFlagArgv(["--web=a.link"])).toEqual(["--web=a.link"]);
  });

  it("does not treat a bare --web value that looks like a negative number as a flag", () => {
    expect(normalizeWebFlagArgv(["--web", "-1"])).toEqual(["--web", "", "-1"]);
  });
});
