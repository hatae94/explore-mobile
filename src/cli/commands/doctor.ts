/**
 * `doctor` command (REQ-DOCTOR-001~005, M6).
 *
 * Always emits a single JSON report (REQ-DOCTOR-005) — `doctor`'s job is
 * to diagnose and report, not to itself "fail" the CLI invocation merely
 * because the environment has problems. The report's nested fields (not
 * the envelope-level `ok`) carry per-check pass/fail detail; callers
 * should inspect `data.adb.installed`, `data.daemon.healthy`, and
 * `data.adbKeyboard` rather than relying on the top-level `ok` flag.
 *
 * `doctor --clean` delegates to the same reset logic as the standalone
 * `reset` command (REQ-DOCTOR-004) via the shared `performReset` helper.
 */

import { resolveTargetDevice } from "../device-targeting.js";
import { success } from "../envelope.js";
import { performReset } from "./reset.js";
import type { CommandHandler } from "./types.js";

export const doctorCommand: CommandHandler = async (args, backend, doctor) => {
  if (args.clean) {
    return performReset(args, backend, doctor, "doctor");
  }

  const adb = await doctor.checkAdbInstalled();
  if (!adb.installed) {
    const installAttempt = await doctor.installMissingAdb(args.yes);
    return success("doctor", {
      adb,
      daemon: { healthy: false, message: "adb is not installed; daemon health cannot be checked." },
      installAttempt,
      devices: [],
      adbKeyboard: { skipped: true, reason: "adb is not installed." },
    });
  }

  const daemon = await doctor.checkDaemonHealth();
  if (!daemon.healthy) {
    return success("doctor", {
      adb,
      daemon,
      devices: [],
      adbKeyboard: { skipped: true, reason: "adb daemon is not healthy; cannot query or target devices." },
    });
  }

  const devices = await backend.listDevices();
  const target = resolveTargetDevice(devices, args.device);

  if (!target.ok) {
    return success("doctor", {
      adb,
      daemon,
      devices,
      adbKeyboard: { skipped: true, reason: `Cannot install/enable ADBKeyBoard: ${target.message}` },
    });
  }

  const adbKeyboard = await doctor.ensureAdbKeyboard(target.serial);

  return success("doctor", {
    adb,
    daemon,
    devices,
    adbKeyboard: { skipped: false, ...adbKeyboard },
  });
};
