import { describe, expect, it } from "vitest";

import { parseInputMethodBindingState } from "./ime-binding-parser.js";

describe("parseInputMethodBindingState (REQ-INPUT-004 개정 0.3.0, M10 산출물 1)", () => {
  it("parses bound=true with a real-device-observed mCurId (spec.md §C.3-⑥)", () => {
    const dump =
      "Input Method Manager Service (dumpsys)\n" +
      "  mCurMethodId=com.android.adbkeyboard/.AdbIME\n" +
      "  mCurId=com.android.adbkeyboard/.AdbIME\n" +
      "  mBoundToMethod=true\n" +
      "  mCurToken=android.os.BinderProxy@1\n";

    const result = parseInputMethodBindingState(dump);

    expect(result).toEqual({ bound: true, currentImeId: "com.android.adbkeyboard/.AdbIME" });
  });

  it("parses bound=false immediately after 'ime set' in a cold cycle (spec.md §C.3-⑦)", () => {
    const dump = "  mCurId=com.android.adbkeyboard/.AdbIME\n  mBoundToMethod=false\n";

    const result = parseInputMethodBindingState(dump);

    expect(result.bound).toBe(false);
  });

  it("defaults bound=false when the mBoundToMethod marker is absent (unconfirmed readiness is never treated as ready)", () => {
    const result = parseInputMethodBindingState("some unexpected dumpsys output with no relevant markers\n");

    expect(result).toEqual({ bound: false, currentImeId: undefined });
  });

  it("defaults bound=false and currentImeId=undefined for empty stdout", () => {
    expect(parseInputMethodBindingState("")).toEqual({ bound: false, currentImeId: undefined });
  });

  it("extracts mCurId even when it precedes mBoundToMethod in the dump", () => {
    const dump = "mCurId=com.samsung.android.honeyboard/.service.HoneyBoardService\nmBoundToMethod=true\n";

    const result = parseInputMethodBindingState(dump);

    expect(result).toEqual({
      bound: true,
      currentImeId: "com.samsung.android.honeyboard/.service.HoneyBoardService",
    });
  });

  it("finds the markers amid a large, noisy real-device-shaped dump", () => {
    const dump = [
      "INPUT METHOD MANAGER (dumpsys input_method)",
      "  mCurMethodId=com.android.adbkeyboard/.AdbIME",
      "  mCurSeq=12",
      "  mCurClient=ClientState{...}",
      "  mCurFocusedWindow=Window{...}",
      "  mCurId=com.android.adbkeyboard/.AdbIME",
      "  mCurToken=android.os.BinderProxy@abc123",
      "  mBoundToMethod=true",
      "  mServedView=null",
      "  mLastSentUser=0",
    ].join("\n");

    const result = parseInputMethodBindingState(dump);

    expect(result.bound).toBe(true);
    expect(result.currentImeId).toBe("com.android.adbkeyboard/.AdbIME");
  });

  it("only ever matches the FIRST occurrence — real-device dumps expose mBoundToMethod exactly once (spec.md §C.3-⑥), so no last-wins ambiguity is needed", () => {
    // Defensive fixture: even if a future Android version repeated the
    // marker, this parser's un-flagged regex takes the first match — a
    // documented, deliberate choice rather than an accidental one.
    const dump = "mBoundToMethod=false\nmBoundToMethod=true\n";

    const result = parseInputMethodBindingState(dump);

    expect(result.bound).toBe(false);
  });
});
