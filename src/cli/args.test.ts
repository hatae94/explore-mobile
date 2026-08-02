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
    expect(result.index).toBeUndefined();
  });

  it("parses --index (SPEC-VISION-001 M2: now WEB-ONLY — which CSS-selector match to act on)", () => {
    const result = parseCommandArgs(["--web", "a", "--index", "2"]);

    expect(result.web).toBe("a");
    expect(result.index).toBe("2");
  });

  // AC-VISION-009 (REQ-VISION-002 후반부): 제거된 셀렉터 플래그는 조용히
  // 무시되지 않는다. `parseArgs`가 던지고 라우터가 INVALID_ARGS로 감싸므로
  // 좌표 탭으로 임의 대체되는 경로 자체가 없다. 이 테스트가 그 계약의
  // 회귀 가드다 — 누군가 args.ts에 플래그를 되돌리면 여기서 먼저 깨진다.
  it.each([["--id", "btn_ok"], ["--text", "OK"]])(
    "throws on the removed native selector flag %s (AC-VISION-009)",
    (flag, value) => {
      expect(() => parseCommandArgs([flag!, value!])).toThrow();
    },
  );

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

  it("parses a bare --web as web mode with no selector (the handler then rejects it as MISSING_SELECTOR)", () => {
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
