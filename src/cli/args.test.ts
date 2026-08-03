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

  // AC-VISION-009 (REQ-VISION-002 후반부) + AC-WEBRM-008 (REQ-WEBRM-003):
  // 제거된 플래그는 조용히 무시되지 않는다. `parseArgs`가 던지고 라우터가
  // INVALID_ARGS로 감싸므로 좌표 탭으로 임의 대체되는 경로 자체가 없다.
  // 이 테스트가 그 계약의 회귀 가드다 — 누군가 args.ts에 플래그를 되돌리면
  // 여기서 먼저 깨진다.
  it.each([
    ["--id", "btn_ok"], // SPEC-VISION-001 M2
    ["--text", "OK"], //  SPEC-VISION-001 M2
    ["--web", "a[href]"], // SPEC-WEBVIEW-002
    ["--page", "1"], //   SPEC-WEBVIEW-002
    ["--index", "2"], //  SPEC-WEBVIEW-002 — 유일한 소비자가 웹 경로였다
  ])("throws on the removed flag %s (AC-VISION-009 · AC-WEBRM-008)", (flag, value) => {
    expect(() => parseCommandArgs([flag!, value!])).toThrow();
  });

  // 값 없이 준 형태도 마찬가지로 거부돼야 한다 — `--web`은 값이 선택적이던
  // 플래그라 옵션 정의만 지우면 두 형태 모두 미지의 옵션이 된다.
  it("throws on a bare --web with no value (SPEC-WEBVIEW-002)", () => {
    expect(() => parseCommandArgs(["--web"])).toThrow();
    expect(() => parseCommandArgs(["--web=a.link"])).toThrow();
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

  // 웹 플래그가 사라져도 제스처 플래그는 그대로다 — 같은 옵션 표를 공유하므로
  // 삭제가 이웃을 건드리지 않았는지 여기서 확인한다.
  it("still parses the gesture flags that survive (--duration, --amount)", () => {
    expect(parseCommandArgs(["--duration", "500"]).duration).toBe("500");
    expect(parseCommandArgs(["down", "--amount", "0.5"]).amount).toBe("0.5");
  });
});

