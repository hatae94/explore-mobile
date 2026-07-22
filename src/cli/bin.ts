#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Wires the command router to a cross-platform `BackendRegistry`
 * (SPEC-IOS-001, REQ-IOS-ARCH-001~003) merging `AdbBackend` (Android) and
 * `IdbBackend` (iOS), and prints exactly one JSON document to stdout per
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
import { IdbBackend } from "../backend/idb-backend.js";
import { IdbDoctor } from "../backend/idb-doctor.js";
import { BackendRegistry } from "../backend/registry.js";
import { runCli } from "./router.js";

const doctor = new AdbDoctor();
const idbDoctor = new IdbDoctor();

const registry = new BackendRegistry([
  {
    platform: "android",
    backend: new AdbBackend(),
    isAvailable: async () => (await doctor.checkAdbInstalled()).installed,
  },
  {
    platform: "ios",
    backend: new IdbBackend(),
    isAvailable: async () => (await idbDoctor.checkIdbInstalled()).installed,
  },
]);

const result = await runCli(process.argv.slice(2), registry, { android: doctor, ios: idbDoctor });

process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
