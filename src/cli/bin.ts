#!/usr/bin/env node
/**
 * CLI entry point placeholder.
 *
 * The full command surface (doctor / devices / launch / stop / screenshot /
 * tap / text / key / dump — SPEC-ANDROID-001 plan.md §F milestones M3-M8)
 * is implemented in later run-phase chunks. This build ships only the
 * common element schema, the device-backend interface, and the
 * uiautomator normalizer (M1/M2). This stub exists so the package's `bin`
 * entry resolves, and still emits JSON in/out per REQ-ARCH-001 so the
 * contract holds even before the command surface lands.
 */

const response = {
  status: "not_implemented",
  message:
    "The explore-mobile CLI command surface (doctor/devices/launch/stop/" +
    "screenshot/tap/text/key/dump) is implemented in SPEC-ANDROID-001 " +
    "milestones M3 and later. This build ships the common element schema, " +
    "device-backend interface, and uiautomator normalizer (M1/M2) only.",
};

process.stdout.write(`${JSON.stringify(response)}\n`);
process.exitCode = 1;
