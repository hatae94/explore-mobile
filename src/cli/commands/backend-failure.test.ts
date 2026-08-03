import { describe, expect, it } from "vitest";

import { IdbCommandFailedError } from "../../backend/idb-errors.js";
import {
  WdaCommandFailedError,
  WdaPortUnmappedError,
  WdaResponseLostError,
  WdaUnreachableError,
} from "../../backend/wda-errors.js";
import { backendFailure } from "./types.js";

/**
 * D7 오류 코드 우선순위(spec.md §C.3)와 그 예외를 함께 고정한다.
 *
 * 기본은 `BACKEND_COMMAND_FAILED`로 가린다. 예외는 **호출자가 서로 다르게
 * 대응해야 하는** WDA 실패 셋뿐이며, 이는 `key.ts`가
 * `UNSUPPORTED_KEY_ON_IOS`에 이미 적용한 관례의 확장이다.
 */
describe("backendFailure", () => {
  it.each([
    [WdaUnreachableError, "WDA_UNREACHABLE"],
    [WdaResponseLostError, "WDA_RESPONSE_LOST"],
    [WdaPortUnmappedError, "WDA_PORT_UNMAPPED"],
  ])("%s는 자기 코드를 그대로 노출한다 (%s)", (ErrorClass, expectedCode) => {
    const result = backendFailure("tap", new ErrorClass("사유"));
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(expectedCode);
    expect(result.error.message).toBe("사유");
  });

  it.each([
    ["WdaCommandFailedError", new WdaCommandFailedError("WDA가 400을 돌려줌")],
    ["IdbCommandFailedError", new IdbCommandFailedError("idb 실패")],
    ["평범한 Error", new Error("무언가 실패")],
    ["Error가 아닌 값", "문자열 예외"],
  ])("그 밖의 실패(%s)는 BACKEND_COMMAND_FAILED로 가린다", (_label, err) => {
    const result = backendFailure("tap", err);
    expect(result.error.code).toBe("BACKEND_COMMAND_FAILED");
  });

  it("명령 이름을 봉투에 그대로 싣는다", () => {
    expect(backendFailure("screenshot", new WdaUnreachableError("x")).command).toBe("screenshot");
  });
});
