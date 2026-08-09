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
 * `WdaDoctor`'s checks and reports them under `wdaEnvironment`
 * (`adbKeyboard` stays present as `{skipped:true, ...}` for a stable JSON
 * shape rather than being replaced/removed).
 *
 * SPEC-VISION-001 M3 (AC-VISION-020): iOS 점검 항목이 devicectl 가용성과
 * WDA 도달성으로 교체됐다. iOS 대상 JSON 출력의 환경 보고 키가
 * `wdaEnvironment`이며, 이전 iOS 도구 체인을 점검하던 키는 사라졌다
 * (design.md §B.3).
 */

import type { DoctorPayload } from "../../schema/command-payloads.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { success } from "../envelope.js";
import { performReset } from "./reset.js";
import type { CommandHandler } from "./types.js";

export const doctorCommand: CommandHandler = async (args, source, envServices) => {
  if (args.clean) {
    return performReset(args, source, envServices, "doctor");
  }

  const adb = await envServices.android.checkAdbInstalled();
  const daemon = adb.installed
    ? await envServices.android.checkDaemonHealth()
    : { healthy: false, message: "adb is not installed; daemon health cannot be checked." };

  // SPEC-VISION-001 M3: 기기 해석을 Android 조기 반환보다 **앞으로** 옮긴다.
  // 이전에는 adb 미설치/데몬 불량이면 여기 도달하기 전에 반환해, iOS 대상
  // `doctor`가 iOS 점검을 한 번도 실행하지 못했다(AC-VISION-020 미충족).
  // adb가 PATH에 없는 것은 iOS 전용 사용자에게 정상 상태이며, 그런 사용자가
  // iOS 진단을 영영 받지 못하는 것은 이 명령의 목적에 어긋난다.
  //
  // AC-ANDROID-018("데몬 불량 시 기기 조회 없이 보고")의 취지는 유지된다:
  // 그 AC가 막으려던 것은 **죽은 adb를 통한 조회**이고, `BackendRegistry`가
  // `isAvailable()` false인 백엔드를 건너뛰므로 `AdbBackend.listDevices`는
  // 여전히 호출되지 않는다. 달라진 것은 iOS 열거가 adb와 무관해졌다는
  // 사실뿐이다(M3에서 열거 출처가 `devicectl`로 분리됐다).
  const devices = await source.listAllDevices();
  const target = resolveTargetDevice(devices, args.device, source);
  const resolvedDevice = target.ok ? devices.find((d) => d.serial === target.serial) : undefined;

  // SPEC-IOS-002: 기기가 `unavailable`이면 `resolveTargetDevice`가 실패해
  // iOS 갈래에 도달하지 못했다. 그 결과 **iOS 진단이 가장 필요한 상태에서
  // iOS 진단이 나오지 않았고**, `--yes` 준비 자동화도 함께 막혔다 — 기기를
  // 올리는 명령인데 기기가 올라와 있어야만 닿을 수 있었다.
  //
  // 이름이 지목된 기기가 목록에 있고 iOS라면, 연결 상태와 무관하게 이 갈래로
  // 들어간다. 목록에 있다는 것은 `devicectl`이 그 기기를 본다는 뜻이므로
  // 진단할 대상이 실재한다.
  //
  // @MX:ANCHOR — 이 갈래의 진입 조건에 `target.ok`를 다시 넣지 않는다.
  // @MX:REASON — 넣으면 준비 자동화가 자기 전제를 요구하는 고리로 되돌아간다.
  const namedDevice = args.device === undefined ? undefined : devices.find((d) => d.serial === args.device);
  const iosDevice = resolvedDevice?.platform === "ios" ? resolvedDevice : namedDevice?.platform === "ios" ? namedDevice : undefined;

  if (iosDevice !== undefined) {
    const resolvedDevice = iosDevice;
    // SPEC-WEBVIEW-002: `webInspectorProxy` 검사가 사라졌다. `--web` 경로가
    // 제거되면서 보고할 전제조건 자체가 없어졌다 — 출력 계약 변경이므로
    // CHANGELOG에 breaking change로 기록돼 있다.
    const devicectl = await envServices.ios.checkDevicectl();

    // SPEC-IOS-002 REQ-IOS2-002 · 003: `--yes`가 있을 때만 준비를 시도한다.
    // Android의 `installMissingAdb(args.yes)`와 같은 자리·같은 동의 규칙이다
    // (design.md §H) — 이 경로는 사용자 폰에 러너를 설치하므로 더 약한 동의를
    // 받을 이유가 없다. `--yes`가 없으면 부르지 않으므로 이전 동작·이전 비용
    // 그대로다(판정 호출 `/screenshot`은 기기에 따라 10MiB를 받는다).
    const bringUp = args.yes ? await envServices.ios.bringUpWda(resolvedDevice.serial, true) : undefined;

    const wda = await envServices.ios.checkWda(resolvedDevice.serial);
    return success<DoctorPayload>("doctor", {
      adb,
      daemon,
      devices,
      adbKeyboard: { skipped: true, reason: "Target device is iOS; see wdaEnvironment instead." },
      wdaEnvironment: { devicectl, wda, ...(bringUp === undefined ? {} : { bringUp }) },
    });
  }

  // --- 여기서부터 Android 경로 — 조기 반환의 형태와 순서는 이전과 같다 ---

  if (!adb.installed) {
    const installAttempt = await envServices.android.installMissingAdb(args.yes);
    return success<DoctorPayload>("doctor", {
      adb,
      daemon,
      installAttempt,
      devices,
      adbKeyboard: { skipped: true, reason: "adb is not installed." },
    });
  }

  if (!daemon.healthy) {
    return success<DoctorPayload>("doctor", {
      adb,
      daemon,
      devices,
      adbKeyboard: { skipped: true, reason: "adb daemon is not healthy; cannot query or target devices." },
    });
  }

  if (!target.ok) {
    return success<DoctorPayload>("doctor", {
      adb,
      daemon,
      devices,
      adbKeyboard: { skipped: true, reason: `Cannot install/enable ADBKeyBoard: ${target.message}` },
    });
  }

  const adbKeyboard = await envServices.android.ensureAdbKeyboard(target.serial);

  return success<DoctorPayload>("doctor", {
    adb,
    daemon,
    devices,
    adbKeyboard: { skipped: false, ...adbKeyboard },
  });
};
