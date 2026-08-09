/**
 * `WdaBackend`가 던지는 오류 타입들 (SPEC-VISION-001 M3). `ime-errors.ts`와
 * 같은 패턴이다 — `code` 프로퍼티가 있어 호출자가 `instanceof`로 판별해
 * 전용 JSON 오류 코드를 노출할 수 있다.
 *
 * WDA는 **사용자가 사전에 기동해 두어야 하는 외부 프로세스**라는 점이
 * 특이하다. 접속 실패는 예외적 사고가 아니라 흔한 정상 상태이므로
 * (design.md §B.3), 실패의 종류를 뭉뚱그리지 않고 셋으로 나눈다:
 *
 *   - `WDA_UNREACHABLE`   — WDA가 아예 응답하지 않는다(미기동/iproxy 없음)
 *   - `WDA_RESPONSE_LOST` — 요청은 전송됐고 WDA는 살아 있지만 응답이 유실됐다
 *   - `WDA_COMMAND_FAILED`— WDA가 응답했고 그 응답이 실패였다
 *
 * 가운데 항목이 이 SPEC에서 새로 생긴 것이다. M3 실측(2026-08-03, iPhone16,2)
 * 에서 상태를 바꾸는 호출이 **효과는 적용된 채 응답만 유실되는** 현상이
 * 반복 관측됐다(`/wda/apps/terminate` 4/4 유실 + 효과 적용 3/3 확인,
 * `/session/:id/actions` 유실 1/5). 이를 성공으로 처리하면 거짓 보고가 되고,
 * 실패로 처리하면 성공한 조작을 실패라 말하게 된다. 그래서 별도 코드로
 * 남긴다 — 조용히 덮지 않는다(REQ-VISION-003).
 */

/** WDA 기본 포트. `iproxy 8100:8100 -u <UDID>`가 잇는 그 포트다. */
export const WDA_DEFAULT_PORT = 8100;

/**
 * 복구 절차 문구 (design.md §B.3 — 메시지에 복구 절차를 포함한다).
 * WDA 미기동은 사용자가 손으로 고쳐야 하는 상태이므로, 오류 메시지가
 * "안 된다"만 말하고 끝나면 사용자는 다음에 뭘 해야 할지 모른다.
 */
export function wdaRecoveryHint(serial: string, port: number): string {
  return [
    `WDA가 ${serial}에 대해 127.0.0.1:${port}에서 응답하지 않습니다. 복구 절차:`,
    `  1) iproxy ${port}:${WDA_DEFAULT_PORT} -u ${serial} &`,
    "  2) xcodebuild test-without-building -xctestrun <WebDriverAgentRunner_*.xctestrun> \\",
    `       -destination "id=${serial}"`,
    `  3) curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}/status  → 200 확인`,
  ].join("\n");
}

/**
 * WDA에 전혀 도달할 수 없을 때 (REQ-VISION-003, AC-VISION-015).
 * `/status` 프로브조차 응답하지 않은 경우에만 던진다 — 한 번의 연결 실패로
 * 곧장 이걸 던지면 `WDA_RESPONSE_LOST`와 구분이 사라진다.
 *
 * @MX:WARN — 이 오류가 다른 경로로 조용히 대체되면 AC-VISION-016이 깨진다.
 * @MX:REASON — WDA 미기동은 흔한 상태여서 폴백을 넣고 싶은 유혹이 크지만,
 * 조용한 폴백은 "왜 안 되는지 모르는 상태"를 만든다(design.md §B.3).
 */
export class WdaUnreachableError extends Error {
  public readonly code = "WDA_UNREACHABLE";

  constructor(message: string) {
    super(message);
    this.name = "WdaUnreachableError";
  }
}

/**
 * 요청은 전송됐으나 응답이 유실됐고, 이후 WDA는 다시 응답하는 상태
 * (M3 실측 현상 — 위 파일 주석 참조).
 *
 * **적용 여부는 불명이다.** 이 오류를 받은 호출자는 스크린샷으로 실제 화면을
 * 확인해야 한다 — 이 SPEC 전체가 스크린샷 판정을 전제로 하므로(REQ-VISION-004)
 * 그 자체가 이상한 요구는 아니다.
 *
 * @MX:WARN — 비멱등 요청(탭/스와이프/입력)을 이 오류에서 자동 재시도하면
 * 조작이 두 번 적용될 수 있다.
 * @MX:REASON — M3 실측에서 응답이 유실된 조작이 실제로는 적용돼 있었다
 * (탭 1건, terminate 3건 확인). 응답 부재는 미적용의 증거가 아니다.
 */
export class WdaResponseLostError extends Error {
  public readonly code = "WDA_RESPONSE_LOST";

  constructor(message: string) {
    super(message);
    this.name = "WdaResponseLostError";
  }
}

/** WDA가 응답했고 그 응답이 실패(4xx/5xx 또는 오류 value)인 경우. */
export class WdaCommandFailedError extends Error {
  public readonly code = "WDA_COMMAND_FAILED";

  /**
   * WDA가 돌려준 HTTP 상태. 응답 본문을 JSON으로 읽지 못한 경우는 `undefined`다.
   *
   * @MX:ANCHOR — 자동 복구(REQ-IOS2-005)의 트리거 판정은 이 **필드**로 한다.
   * @MX:REASON — 상태 숫자는 지금까지 메시지 문구 안에만 있었고, 문구에서
   * 되읽으면 판정이 문구 형식에 종속된다. 이 저장소에는 오류 문구에서 정책을
   * 역추론했다가 반증당한 이력이 있다(`wda-client.ts`의 @MX:REASON). 문구는
   * 사람이 읽는 것이고, 분기는 필드가 정한다.
   */
  public readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "WdaCommandFailedError";
    this.status = status;
  }
}

/**
 * serial→포트 매핑이 선언돼 있는데 요청된 serial이 그 안에 없을 때.
 *
 * WDA 포트 하나는 `iproxy -u <UDID>`가 묶어 준 **기기 한 대**에만 연결된다.
 * 그런데 `/status` 응답은 기기 종류(`"device": "iphone"`)만 알려줄 뿐 어느
 * 기기인지 알려주지 않는다(M3 실측). 즉 CLI는 포트 너머의 기기가 요청된
 * 기기인지 스스로 확인할 방법이 없다. 매핑이 선언된 이상 미등록 serial을
 * 기본 포트로 흘려보내면 **다른 기기를 조작**할 수 있으므로 거부한다.
 */
export class WdaPortUnmappedError extends Error {
  public readonly code = "WDA_PORT_UNMAPPED";

  constructor(message: string) {
    super(message);
    this.name = "WdaPortUnmappedError";
  }
}

/**
 * 빌드에 필요한 사용자별 설정이 선언돼 있지 않을 때 (SPEC-IOS-002 REQ-IOS2-001,
 * AC-IOS2-001 · 002).
 *
 * @MX:WARN — 이 실패를 `WdaUnreachableError`로 대체하면 AC-IOS2-002가 깨진다.
 * @MX:REASON — 두 실패의 복구 절차가 정반대다. 설정 부재는 "환경 변수를
 * 선언하라"이고 도달 불가는 "러너를 띄우라"다. 코드를 재사용하면 사용자가
 * 이미 떠 있는 러너를 다시 띄우며 원인을 못 찾는다(design.md §C.4).
 */
export class WdaBuildConfigMissingError extends Error {
  public readonly code = "WDA_BUILD_CONFIG_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "WdaBuildConfigMissingError";
  }
}

/**
 * `xcodebuild`가 러너 빌드에 실패했을 때 (SPEC-IOS-002 REQ-IOS2-002, AC-IOS2-006).
 *
 * @MX:WARN — `xcodebuild`의 출력을 요약하거나 일반 문구로 갈아끼우지 않는다.
 * @MX:REASON — 빌드 실패의 원인은 서명·프로비저닝·SDK 등 제각각이고, 그 원인
 * 줄이 사용자가 다음에 무엇을 할지 정하는 유일한 재료다. "빌드에 실패했습니다"로
 * 뭉개면 사용자는 Xcode를 직접 열어 같은 빌드를 다시 돌려야 한다.
 */
export class WdaBuildFailedError extends Error {
  public readonly code = "WDA_BUILD_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "WdaBuildFailedError";
  }
}

/**
 * iOS에 대응 동작이 없는 키 별칭 — 조용한 no-op이 아니라 명시적 거부다.
 * `code`는 `UNSUPPORTED_KEY_ON_IOS`이며, 이 값은 SPEC-IOS-001이 정한 계약을
 * 그대로 승계한다(호출자와 테스트가 이 문자열에 의존한다).
 */
export class WdaUnsupportedKeyError extends Error {
  public readonly code = "UNSUPPORTED_KEY_ON_IOS";

  constructor(message: string) {
    super(message);
    this.name = "WdaUnsupportedKeyError";
  }
}
