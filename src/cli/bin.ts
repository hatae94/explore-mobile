#!/usr/bin/env node
/**
 * CLI entry point (M3/M4/M5).
 *
 * Wires the command router (M3) to the real `AdbBackend` (M4/M5) and
 * prints exactly one JSON document to stdout per invocation
 * (REQ-ARCH-001). `doctor`/`reset` are wired but report NOT_IMPLEMENTED —
 * those land in milestone M6 of SPEC-ANDROID-001.
 */

import { AdbBackend } from "../backend/adb-backend.js";
import { runCli } from "./router.js";

const backend = new AdbBackend();
const result = await runCli(process.argv.slice(2), backend);

process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
