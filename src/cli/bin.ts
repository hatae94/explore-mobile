#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Wires the command router to a cross-platform `BackendRegistry`
 * (SPEC-IOS-001, REQ-IOS-ARCH-001~003) merging `AdbBackend` (Android) and
 * `WdaBackend` (iOS — SPEC-VISION-001 M3 replaced `IdbBackend`), and prints exactly one JSON document to stdout per
 * invocation (REQ-ARCH-001). The registry itself implements `DeviceBackend`
 * (registry-as-backend adapter, design.md §C.4), so `runCli`'s existing
 * `(argv, backend, envServices)` signature needs no change to gain cross-
 * platform `--device <serial>` auto-routing.
 *
 * `doctor`/`reset` receive BOTH environment services via the `EnvServices`
 * holder (REQ-IOS-DOCTOR-003) and dispatch to the one matching the
 * resolved target device's platform internally.
 */

import { AdbBackend } from "../backend/adb-backend.js";
import { AdbDoctor } from "../backend/doctor.js";
import { WdaBackend } from "../backend/wda-backend.js";
import { WdaDoctor } from "../backend/wda-doctor.js";
import { BackendRegistry } from "../backend/registry.js";
import { runCli } from "./router.js";

const doctor = new AdbDoctor();
const wdaDoctor = new WdaDoctor();

const registry = new BackendRegistry([
  {
    platform: "android",
    backend: new AdbBackend(),
    isAvailable: async () => (await doctor.checkAdbInstalled()).installed,
  },
  {
    platform: "ios",
    // 가용성 게이트는 devicectl이지 WDA가 아니다. WDA 미기동으로 게이트를
    // 닫으면 연결된 iOS 기기가 `devices` 목록에서 통째로 사라진다
    // (wda-doctor.ts 상단 @MX:WARN — SPEC-IOS-001에서 겪은 회귀).
    backend: new WdaBackend(),
    isAvailable: async () => (await wdaDoctor.checkDevicectl()).available,
  },
]);

const result = await runCli(process.argv.slice(2), registry, { android: doctor, ios: wdaDoctor });

process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
