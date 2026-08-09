/**
 * 서명 만료 식별 검사 (SPEC-IOS-002 REQ-IOS2-007 — AC-IOS2-021).
 *
 * **판정하는 것**: 프로파일의 만료일 필드를 읽어 유효/만료/구별 불가로 가르는가,
 * 만료일 때 재빌드 경로가 실리는가, 그 경로가 재승인 재요구를 함께 말하는가.
 *
 * **판정하지 못하는 것**: 실제로 서명이 만료된 기기에서 기동이 어떻게 실패하며
 * 그 실패에 이 판정이 정확히 붙는가. 만료 상태는 의도적으로 만들 수 없고
 * (7일 대기), 시계를 조작해 흉내내면 그것은 다른 상태다(`acceptance.md` §E).
 * 이 검사에서 `now`를 옮기는 것은 **호스트 시계 조작이 아니라 비교 기준을
 * 주입하는 것**이며, 기기의 상태를 흉내내지 않는다.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProcessExecutor } from "./process-executor.js";
import {
  findEmbeddedProfile,
  parseProfileExpiry,
  readSigningStatus,
  rebuildGuidance,
  WDA_SIGNING_EXPIRED,
} from "./wda-signing.js";

/** 2026-08-09 실기기에서 실제로 읽은 응답의 형태 그대로. */
const REAL_PROFILE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CreationDate</key>
	<date>2026-08-04T07:19:34Z</date>
	<key>ExpirationDate</key>
	<date>2026-08-11T07:19:34Z</date>
	<key>Name</key>
	<string>iOS Team Provisioning Profile: com.hatae.WebDriverAgentRunner.xctrunner</string>
</dict>
</plist>`;

const REAL_EXPIRY_ISO = "2026-08-11T07:19:34.000Z";

function execReturning(stdout: string, exitCode = 0, stderr = ""): ProcessExecutor {
  return async () => ({
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
    exitCode,
  });
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wda-signing-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** 산출물 트리를 실제 구조 그대로 만든다. */
async function createArtifactTree(appName = "WebDriverAgentRunner-Runner.app"): Promise<string> {
  const appDir = join(root, "Build", "Products", "Debug-iphoneos", appName);
  await mkdir(appDir, { recursive: true });
  const profile = join(appDir, "embedded.mobileprovision");
  await writeFile(profile, "binary-cms-blob");
  return profile;
}

describe("parseProfileExpiry — 구조화된 필드에서 날짜를 읽는다", () => {
  it("실제 프로파일 XML에서 ExpirationDate를 읽는다", () => {
    expect(parseProfileExpiry(REAL_PROFILE_XML)?.toISOString()).toBe(REAL_EXPIRY_ISO);
  });

  it("CreationDate를 만료일로 착각하지 않는다", () => {
    // 두 날짜가 같은 문서에 있고 CreationDate가 먼저 나온다 — 순서로 읽으면 틀린다.
    expect(parseProfileExpiry(REAL_PROFILE_XML)?.toISOString()).not.toBe("2026-08-04T07:19:34.000Z");
  });

  it("필드가 없으면 undefined — 추정하지 않는다", () => {
    expect(parseProfileExpiry("<plist><dict><key>Name</key><string>x</string></dict></plist>")).toBeUndefined();
  });

  it("날짜로 읽히지 않는 값이면 undefined", () => {
    expect(parseProfileExpiry("<key>ExpirationDate</key>\n<date>언젠가</date>")).toBeUndefined();
  });
});

describe("findEmbeddedProfile — 산출물 안에서 찾는다", () => {
  it("앱 번들 안의 프로파일을 찾는다", async () => {
    const expected = await createArtifactTree();
    expect(await findEmbeddedProfile(root)).toBe(expected);
  });

  it("산출물이 없으면 undefined", async () => {
    expect(await findEmbeddedProfile(root)).toBeUndefined();
  });

  it("프로파일이 없는 앱 번들은 건너뛴다", async () => {
    await mkdir(join(root, "Build", "Products", "Debug-iphoneos", "Empty.app"), { recursive: true });
    expect(await findEmbeddedProfile(root)).toBeUndefined();
  });
});

describe("AC-IOS2-021 — 서명 만료가 일반 기동 실패와 구별된다", () => {
  it("만료 시각이 지났으면 expired로 지목한다", async () => {
    await createArtifactTree();

    const status = await readSigningStatus({
      artifactRoot: root,
      exec: execReturning(REAL_PROFILE_XML),
      now: new Date("2026-08-12T00:00:00Z"),
    });

    expect(status.verdict).toBe("expired");
    expect(status.expiresAt).toBe(REAL_EXPIRY_ISO);
  });

  it("만료 전이면 valid — 만료라고 말하지 않는다", async () => {
    await createArtifactTree();

    const status = await readSigningStatus({
      artifactRoot: root,
      exec: execReturning(REAL_PROFILE_XML),
      now: new Date("2026-08-10T00:00:00Z"),
    });

    expect(status.verdict).toBe("valid");
    expect(status.expiresAt).toBe(REAL_EXPIRY_ISO);
  });

  it("만료 보고에 재빌드 경로가 실린다", async () => {
    await createArtifactTree();

    const status = await readSigningStatus({
      artifactRoot: root,
      exec: execReturning(REAL_PROFILE_XML),
      now: new Date("2026-08-12T00:00:00Z"),
    });

    expect(status.message).toContain("doctor");
    expect(status.message).toContain("--yes");
  });

  it("재빌드 경로가 UI 자동화 재승인 재요구를 함께 말한다", () => {
    // 재빌드만 안내하면 사용자는 자동으로 끝나는 줄 알고 기다리다가
    // 기기 화면에 뜬 승인 창을 놓친다(REQ-IOS2-007).
    const guidance = rebuildGuidance().join("\n");

    expect(guidance).toContain("UI 자동화");
    expect(guidance).toContain("재빌드만");
  });

  it("오류 코드가 기존 4종과 겹치지 않는다", () => {
    expect(WDA_SIGNING_EXPIRED).toBe("WDA_SIGNING_EXPIRED");
    expect(["WDA_UNREACHABLE", "WDA_RESPONSE_LOST", "WDA_COMMAND_FAILED", "WDA_PORT_UNMAPPED"]).not.toContain(
      WDA_SIGNING_EXPIRED,
    );
  });
});

describe("구별 불가는 구별 불가로 보고한다 (design.md §I.3 마지막 행)", () => {
  it("산출물이 없으면 unknown — 유효로도 만료로도 적지 않는다", async () => {
    const status = await readSigningStatus({ artifactRoot: root, exec: execReturning(REAL_PROFILE_XML) });

    expect(status.verdict).toBe("unknown");
    expect(status.expiresAt).toBeUndefined();
  });

  it("해독 명령이 실패하면 unknown이고 원인이 남는다", async () => {
    await createArtifactTree();

    const status = await readSigningStatus({
      artifactRoot: root,
      exec: execReturning("", 1, "SecPolicyCreateBasicX509 실패"),
    });

    expect(status.verdict).toBe("unknown");
    expect(status.message).toContain("SecPolicyCreateBasicX509 실패");
  });

  it("해독 명령이 던져도 unknown으로 답한다 — 진단은 실패하지 않는다", async () => {
    await createArtifactTree();

    const status = await readSigningStatus({
      artifactRoot: root,
      exec: async () => {
        throw new Error("security: command not found");
      },
    });

    expect(status.verdict).toBe("unknown");
    expect(status.message).toContain("command not found");
  });

  it("만료일 필드가 없으면 unknown", async () => {
    await createArtifactTree();

    const status = await readSigningStatus({
      artifactRoot: root,
      exec: execReturning("<plist><dict><key>Name</key><string>x</string></dict></plist>"),
    });

    expect(status.verdict).toBe("unknown");
    expect(status.message).toContain("ExpirationDate");
  });
});
