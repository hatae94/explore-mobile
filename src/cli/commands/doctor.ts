/**
 * `doctor` command (REQ-DOCTOR-001~005, REQ-IOS-DOCTOR-003).
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
 *
 * @MX:NOTE — platform branching (REQ-IOS-DOCTOR-003, SPEC-IOS-001): the
 * pre-existing `adb`/`daemon` checks below are eager and unconditional
 * (unchanged from SPEC-ANDROID-001 — they already ran before any device
 * was resolved) and stay that way, since they gate the CLI's ability to
 * even list devices at all. Once a target device IS resolved, this
 * handler branches on `resolvedDevice.platform`: an Android target keeps
 * the exact original `ensureAdbKeyboard` flow; an iOS target instead runs
 * `IdbDoctor`'s checks and reports them under `idbEnvironment`
 * (`adbKeyboard` stays present as `{skipped:true, ...}` for a stable JSON
 * shape rather than being replaced/removed).
 */

import { spawnProcess } from "../../backend/process-executor.js";
import { checkWebInspectorProxy } from "../../webview/proxy-service.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { success } from "../envelope.js";
import { performReset } from "./reset.js";
import type { CommandHandler } from "./types.js";

export const doctorCommand: CommandHandler = async (args, source, envServices) => {
  if (args.clean) {
    return performReset(args, source, envServices, "doctor");
  }

  const adb = await envServices.android.checkAdbInstalled();
  if (!adb.installed) {
    const installAttempt = await envServices.android.installMissingAdb(args.yes);
    return success("doctor", {
      adb,
      daemon: { healthy: false, message: "adb is not installed; daemon health cannot be checked." },
      installAttempt,
      devices: [],
      adbKeyboard: { skipped: true, reason: "adb is not installed." },
    });
  }

  const daemon = await envServices.android.checkDaemonHealth();
  if (!daemon.healthy) {
    return success("doctor", {
      adb,
      daemon,
      devices: [],
      adbKeyboard: { skipped: true, reason: "adb daemon is not healthy; cannot query or target devices." },
    });
  }

  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);

  if (!target.ok) {
    return success("doctor", {
      adb,
      daemon,
      devices,
      adbKeyboard: { skipped: true, reason: `Cannot install/enable ADBKeyBoard: ${target.message}` },
    });
  }

  const resolvedDevice = devices.find((d) => d.serial === target.serial);

  if (resolvedDevice?.platform === "ios") {
    const [idbInstalled, companion, simulatorBooted, webInspectorProxy] = await Promise.all([
      envServices.ios.checkIdbInstalled(),
      envServices.ios.checkCompanion(),
      envServices.ios.checkSimulatorBooted(target.serial),
      // SPEC-WEBVIEW-001 REQ-WEB-PROXY-003: `--web`'s prerequisite is
      // reported here so a user learns it is missing from `doctor` rather
      // than from a failed `tap --web`.
      checkWebInspectorProxy(spawnProcess),
    ]);
    return success("doctor", {
      adb,
      daemon,
      devices,
      adbKeyboard: { skipped: true, reason: "Target device is iOS; see idbEnvironment instead." },
      idbEnvironment: { idbInstalled, companion, simulatorBooted, webInspectorProxy },
    });
  }

  const adbKeyboard = await envServices.android.ensureAdbKeyboard(target.serial);

  return success("doctor", {
    adb,
    daemon,
    devices,
    adbKeyboard: { skipped: false, ...adbKeyboard },
  });
};
