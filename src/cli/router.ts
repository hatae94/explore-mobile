/**
 * CLI command router (M3) — dispatches argv to a command handler and
 * always resolves to a {@link CommandResult}, never throws and never lets
 * a non-JSON error escape (REQ-ARCH-001).
 *
 * @MX:NOTE — this is the sole place `bin.ts` calls into; command handlers
 * are pure of subprocess concerns and only see the `DeviceBackend`
 * interface, preserving the CLI -> normalize/backend-interface -> adb
 * wrapper layering (spec.md §A.4).
 */

import { AdbDoctor } from "../backend/doctor.js";
import { takeNoticesFrom } from "../backend/registry.js";
import { WdaDoctor } from "../backend/wda-doctor.js";
import type { DeviceBackend } from "../schema/device-backend.js";
import { toDeviceSource, type DeviceSource } from "./device-targeting.js";
import { parseCommandArgs } from "./args.js";
import { devicesCommand } from "./commands/devices.js";
import { doctorCommand } from "./commands/doctor.js";
import { doubleTapCommand } from "./commands/doubletap.js";
import { installCommand } from "./commands/install.js";
import { keyCommand } from "./commands/key.js";
import { launchCommand } from "./commands/launch.js";
import { pinchCommand } from "./commands/pinch.js";
import { resetCommand } from "./commands/reset.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { scrollCommand } from "./commands/scroll.js";
import { stopCommand } from "./commands/stop.js";
import { swipeCommand } from "./commands/swipe.js";
import { tapCommand } from "./commands/tap.js";
import { textCommand } from "./commands/text.js";
import type { CommandHandler } from "./commands/types.js";
import type { EnvServices } from "./env-services.js";
import { failure } from "./envelope.js";
import type { CommandResult } from "./envelope.js";

const COMMANDS: Record<string, CommandHandler> = {
  devices: devicesCommand,
  launch: launchCommand,
  install: installCommand,
  stop: stopCommand,
  screenshot: screenshotCommand,
  tap: tapCommand,
  doubletap: doubleTapCommand,
  key: keyCommand,
  swipe: swipeCommand,
  scroll: scrollCommand,
  pinch: pinchCommand,
  text: textCommand,
  doctor: doctorCommand,
  reset: resetCommand,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs one CLI invocation. `argv` is everything after the program name
 * (e.g. `process.argv.slice(2)`) — the first element is the command word.
 * Always resolves (never rejects): parse errors, unknown commands, and
 * handler-thrown exceptions all degrade to a graceful {@link CommandError}.
 *
 * `envServices` defaults to real `AdbDoctor()`/`WdaDoctor()` instances when
 * not provided, so every pre-existing call site (`runCli(argv, backend)`,
 * used throughout the test suite) keeps working unchanged — only
 * `doctor`/`reset` command handlers ever touch this parameter
 * (REQ-IOS-DOCTOR-003, SPEC-IOS-001 — generalized from the original
 * Android-only `doctor: AdbDoctor` parameter).
 */
export async function runCli(
  argv: string[],
  backend: DeviceBackend | DeviceSource,
  envServices: EnvServices = { android: new AdbDoctor(), ios: new WdaDoctor() },
): Promise<CommandResult> {
  const [commandName, ...rest] = argv;
  const supported = Object.keys(COMMANDS).join(", ");

  if (!commandName) {
    return failure("(none)", "MISSING_COMMAND", `A command is required. Supported: ${supported}.`);
  }

  const handler = COMMANDS[commandName];
  if (!handler) {
    return failure(commandName, "UNKNOWN_COMMAND", `Unknown command '${commandName}'. Supported: ${supported}.`);
  }

  let args;
  try {
    args = parseCommandArgs(rest);
  } catch (err) {
    return failure(commandName, "INVALID_ARGS", errorMessage(err));
  }

  try {
    // M5(REQ-VISION-005): 맨 `DeviceBackend`든 `BackendRegistry`든 핸들러는
    // 하나의 `DeviceSource`만 본다 — 열거 지점이 한 곳으로 모인다.
    const result = await handler(args, toDeviceSource(backend), envServices);
    return withRecoveryNotices(result, backend);
  } catch (err) {
    // Defense in depth: a handler bug still degrades to graceful JSON,
    // never an uncaught exception / non-JSON stack trace.
    return withRecoveryNotices(failure(commandName, "INTERNAL_ERROR", errorMessage(err)), backend);
  }
}

/**
 * 명령이 끝난 뒤, 시스템이 스스로 한 조치를 결과 봉투에 싣는다
 * (SPEC-IOS-002 AC-IOS2-016 — 자동 복구가 첫 소비자다).
 *
 * 실패 봉투에도 붙인다 — 재기동까지 하고도 실패한 경우가 사용자에게 가장
 * 필요한 정보이며, 그 경우를 빼면 "복구가 성공했을 때만 보이는" 절름발이가 된다.
 *
 * @MX:NOTE — 알림이 없으면 봉투를 **건드리지 않는다**. 새 필드가 조건 없이
 * 붙으면 모든 명령의 JSON이 바뀌어 REQ-IOS2-008(기존 계약 무회귀)에 걸린다.
 */
function withRecoveryNotices(result: CommandResult, source: DeviceBackend | DeviceSource): CommandResult {
  const notices = takeNoticesFrom(source);
  return notices.length === 0 ? result : { ...result, notices };
}
