#!/usr/bin/env node
/**
 * CLI entry point (M3/M4/M5/M6).
 *
 * Wires the command router (M3) to the real `AdbBackend` (M4/M5) and
 * `AdbDoctor` (M6), and prints exactly one JSON document to stdout per
 * invocation (REQ-ARCH-001). The full command surface (doctor / devices /
 * launch / stop / screenshot / tap / text / key / dump / reset) is now
 * live; only multi-device STATE isolation (M7) and the Claude skill
 * wrapper (M8) remain.
 */

import { AdbBackend } from "../backend/adb-backend.js";
import { AdbDoctor } from "../backend/doctor.js";
import { runCli } from "./router.js";

const backend = new AdbBackend();
const doctor = new AdbDoctor();
const result = await runCli(process.argv.slice(2), backend, doctor);

process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
