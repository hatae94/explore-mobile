/**
 * `wda-build.ts` 검사 (SPEC-IOS-002 REQ-IOS2-002).
 * 대응 AC: AC-IOS2-003 (argv 구성) · AC-IOS2-006 (실패 원인 보존) · AC-IOS2-007 (결정적 위치).
 */

import { describe, expect, it, vi } from "vitest";
import type { ProcessExecutor } from "./process-executor.js";
import { buildWdaRunner, wdaArtifactRoot, xcodebuildArgs } from "./wda-build.js";
import type { WdaBuildConfig } from "./wda-build-config.js";
import { WdaBuildFailedError } from "./wda-errors.js";

const CONFIG: WdaBuildConfig = {
  teamId: "ABCDE12345",
  bundleId: "com.example.wda",
  wdaSourcePath: "/Users/tester/WebDriverAgent",
};
const UDID = "00008103-000458360A63401E";

function execOk(stdout = "** TEST BUILD SUCCEEDED **"): ProcessExecutor {
  return async () => ({ stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), exitCode: 0 });
}

describe("AC-IOS2-007 — 산출물이 결정적 위치에 남는다", () => {
  it("산출물 뿌리가 홈 아래 전용 디렉터리다 — 저장소 안이 아니다", () => {
    const root = wdaArtifactRoot("/Users/tester");
    expect(root.startsWith("/Users/tester/")).toBe(true);
    expect(root).not.toContain(".moai");
    expect(root).not.toContain("DerivedData");
  });

  it("같은 입력이면 같은 경로다 — 해시가 섞이지 않는다", () => {
    expect(wdaArtifactRoot("/Users/tester")).toBe(wdaArtifactRoot("/Users/tester"));
  });
});

describe("AC-IOS2-003 — 설정 값이 빌드 인자로 그대로 전달된다", () => {
  const args = xcodebuildArgs(CONFIG, UDID, "/Users/tester/.explore-mobile/wda");

  it("개발팀 식별자가 argv에 그대로 실린다", () => {
    expect(args).toContain(`DEVELOPMENT_TEAM=${CONFIG.teamId}`);
  });

  it("번들 식별자가 argv에 그대로 실린다", () => {
    expect(args.some((arg) => arg.includes(CONFIG.bundleId))).toBe(true);
  });

  it("소스 경로가 -project 인자에 실린다", () => {
    const projectIndex = args.indexOf("-project");
    expect(projectIndex).toBeGreaterThanOrEqual(0);
    expect(args[projectIndex + 1]).toContain(CONFIG.wdaSourcePath);
  });

  it("대상 기기 UDID가 -destination에 실린다", () => {
    const destIndex = args.indexOf("-destination");
    expect(destIndex).toBeGreaterThanOrEqual(0);
    expect(args[destIndex + 1]).toContain(UDID);
  });

  it("산출물 위치가 -derivedDataPath로 고정된다", () => {
    const ddIndex = args.indexOf("-derivedDataPath");
    expect(ddIndex).toBeGreaterThanOrEqual(0);
    expect(args[ddIndex + 1]).toBe("/Users/tester/.explore-mobile/wda");
  });

  /**
   * 한계 명시(원칙 ⑤): 이것은 argv 구성 판정이다. 이 argv가 실제로 빌드를
   * 성공시키는지는 AC-IOS2-005(실기기)가 판정한다. mock은 argv 너머를 못 본다.
   */
  it("빌드는 test-without-building이 아니라 build-for-testing이다", () => {
    expect(args[0]).toBe("build-for-testing");
  });
});

describe("AC-IOS2-006 — 빌드 실패 시 xcodebuild의 원인 줄이 결과에 남는다", () => {
  const REAL_FAILURE = [
    "error: No profiles for 'com.example.wda' were found: Xcode couldn't find any",
    "iOS App Development provisioning profiles matching 'com.example.wda'.",
    "** BUILD FAILED **",
  ].join("\n");

  const execFail: ProcessExecutor = async () => ({
    stdout: Buffer.alloc(0),
    stderr: Buffer.from(REAL_FAILURE),
    exitCode: 65,
  });

  it("실패하면 전용 오류로 던진다", async () => {
    await expect(buildWdaRunner(CONFIG, UDID, { exec: execFail, home: "/Users/tester" })).rejects.toThrow(
      WdaBuildFailedError,
    );
  });

  it("원인 줄이 요약으로 대체되지 않고 그대로 남는다", async () => {
    try {
      await buildWdaRunner(CONFIG, UDID, { exec: execFail, home: "/Users/tester" });
      expect.unreachable("빌드가 실패했는데 던지지 않았다");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("No profiles for");
      expect(message).toContain("provisioning profiles");
    }
  });

  it("종료 코드가 결과에 남는다", async () => {
    try {
      await buildWdaRunner(CONFIG, UDID, { exec: execFail, home: "/Users/tester" });
      expect.unreachable("빌드가 실패했는데 던지지 않았다");
    } catch (err) {
      expect((err as Error).message).toContain("65");
    }
  });

  it("실패 오류 코드가 설정 부재 코드와 다르다", async () => {
    try {
      await buildWdaRunner(CONFIG, UDID, { exec: execFail, home: "/Users/tester" });
      expect.unreachable("빌드가 실패했는데 던지지 않았다");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("WDA_BUILD_FAILED");
      expect((err as { code?: string }).code).not.toBe("WDA_BUILD_CONFIG_MISSING");
    }
  });
});

describe("buildWdaRunner — 동의 없이 빌드하지 않는다 (design.md §H)", () => {
  it("빌드 명령이 xcodebuild 하나뿐이다 — 설치·다운로드를 곁들이지 않는다", async () => {
    const exec = vi.fn(execOk());
    // 산출물 탐색은 실패해도 좋다. 여기서 세는 것은 **무엇을 실행했는가**다.
    await buildWdaRunner(CONFIG, UDID, { exec, home: "/Users/tester" }).catch(() => undefined);

    const commands = exec.mock.calls.map((call) => call[0]);
    expect(commands).toEqual(["xcodebuild"]);
  });
});
