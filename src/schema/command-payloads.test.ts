import { describe, expect, it } from "vitest";

import type {
  AppCommandPayload,
  DoctorPayload,
  KeyPayload,
  ResetPayload,
  ScreenshotPayload,
  ScrollPayload,
  SwipePayload,
  TapPayload,
  TextPayload,
  WdaEnvironmentReport,
} from "./command-payloads.js";

/**
 * 명령 출력 계약의 **2겹째** 보호 (SPEC-CONTRACT-001 REQ-CONTRACT-003).
 *
 * 1겹(핸들러의 `success<T>` 타입 명시)만으로는 부족하다: 타입과 핸들러를 **함께**
 * 고치면 조용히 통과한다. `SPEC-WEBVIEW-002`가 `doctor` 출력에서
 * `wdaEnvironment.webInspectorProxy`를 지웠을 때 실제로 그렇게 통과했고,
 * 전체 테스트가 하나도 깨지지 않았다.
 *
 * 아래 `Record<keyof T, true>` 리터럴이 그 경우를 잡는다 — **양방향 소진 검사**다:
 *   - 타입에서 필드가 빠지면 → 리터럴이 초과 프로퍼티가 되어 컴파일 에러
 *   - 타입에 필드가 늘면     → 리터럴이 그 키를 누락해 컴파일 에러
 *
 * 즉 이 파일을 함께 고치지 않고는 출력 형태를 바꿀 수 없다. 형태 변경이
 * **의도적이고 diff에 보이는** 일이 되는 것이 목적이며, 변경을 금지하는 것이
 * 목적은 아니다.
 *
 * 기법 출처: `device-backend.test.ts`가 백엔드 인터페이스에 쓰던 같은 패턴.
 * 스키마에는 걸려 있었는데 CLI 출력에는 걸린 적이 없었다.
 *
 * `DevicesPayload`는 여기 없다 — `DeviceInfo[]` 그대로이며 `DeviceInfo`의 키
 * 집합은 `device-backend.test.ts`가 이미 고정한다.
 */
describe("command payload contracts (SPEC-CONTRACT-001)", () => {
  it("launch / stop — { serial, package }", () => {
    const keys: Record<keyof AppCommandPayload, true> = { serial: true, package: true };
    expect(Object.keys(keys)).toHaveLength(2);
  });

  it("screenshot — { serial, byteLength, savedTo?, pngBase64? }", () => {
    const keys: Record<keyof ScreenshotPayload, true> = {
      serial: true,
      byteLength: true,
      savedTo: true,
      pngBase64: true,
    };
    expect(Object.keys(keys)).toHaveLength(4);
  });

  it("tap — { serial, x, y }", () => {
    const keys: Record<keyof TapPayload, true> = { serial: true, x: true, y: true };
    expect(Object.keys(keys)).toHaveLength(3);
  });

  it("key — { serial, key }", () => {
    const keys: Record<keyof KeyPayload, true> = { serial: true, key: true };
    expect(Object.keys(keys)).toHaveLength(2);
  });

  it("swipe — { serial, from, to, durationMs? }", () => {
    const keys: Record<keyof SwipePayload, true> = {
      serial: true,
      from: true,
      to: true,
      durationMs: true,
    };
    expect(Object.keys(keys)).toHaveLength(4);
  });

  it("scroll — { serial, direction, from, to }", () => {
    const keys: Record<keyof ScrollPayload, true> = {
      serial: true,
      direction: true,
      from: true,
      to: true,
    };
    expect(Object.keys(keys)).toHaveLength(4);
  });

  it("text — { serial } (입력 문자열은 되돌려주지 않는다)", () => {
    const keys: Record<keyof TextPayload, true> = { serial: true };
    expect(Object.keys(keys)).toHaveLength(1);
  });

  it("reset — serial + Android/iOS 두 결과의 합집합", () => {
    const keys: Record<keyof ResetPayload, true> = {
      serial: true,
      // Android (ResetResult)
      imeReset: true,
      adbKeyboardDisabled: true,
      adbKeyboardUninstalled: true,
      warnings: true,
      originalImeRestored: true,
      // iOS (IosResetResult)
      noOp: true,
      message: true,
    };
    expect(Object.keys(keys)).toHaveLength(8);
  });

  it("doctor — 항상 4개 + 갈래별 선택 2개", () => {
    const keys: Record<keyof DoctorPayload, true> = {
      adb: true,
      daemon: true,
      devices: true,
      adbKeyboard: true,
      installAttempt: true,
      wdaEnvironment: true,
    };
    expect(Object.keys(keys)).toHaveLength(6);
  });

  /**
   * 이 항목이 이 SPEC의 계기다. `wdaEnvironment` 안에 있던 세 번째 필드
   * (`webInspectorProxy`)가 조용히 사라졌고 아무 테스트도 깨지지 않았다.
   * 이제 이 리터럴을 함께 고치지 않으면 그 일이 불가능하다.
   */
  it("doctor.wdaEnvironment — { devicectl, wda, bringUp, signing, gates }", () => {
    // `bringUp`은 SPEC-IOS-002에서 추가됐다 — `--yes`가 있을 때만 실린다.
    // `signing`은 같은 SPEC의 M5에서 추가됐다 — iOS 갈래에서 항상 실린다.
    // `gates`는 같은 SPEC의 M6에서 추가됐다 — iOS 갈래에서 항상 실린다.
    const keys: Record<keyof WdaEnvironmentReport, true> = {
      devicectl: true,
      wda: true,
      bringUp: true,
      signing: true,
      gates: true,
    };
    expect(Object.keys(keys)).toHaveLength(5);
  });
});
