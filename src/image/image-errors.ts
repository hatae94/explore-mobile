/**
 * 이미지 처리 경로가 던지는 오류 타입 (SPEC-IMAGE-001).
 *
 * `wda-errors.ts` / `ime-errors.ts`와 같은 패턴이다 — `code` 프로퍼티가 있어
 * 호출부가 `instanceof`로 판별해 전용 JSON 오류 코드를 노출할 수 있다.
 *
 * 셋으로 나눈 이유는 호출자가 **서로 다르게 대응해야 하기** 때문이다:
 *
 *   - `IMAGE_TRANSFORM_FAILED` — 변환 자체가 실패했다. 재시도해도 같다
 *   - `CAPTURE_GEOMETRY_UNAVAILABLE` — 캡처의 기하 기록을 읽을 수 없다.
 *     다시 캡처해야 한다
 *   - `CAPTURE_STALE` — 기록은 읽었지만 낡았다. 다시 캡처하거나
 *     `--stale-ok`로 명시해야 한다
 *
 * 셋을 하나로 뭉개면 "왜 안 되는지 모르는 상태"가 된다.
 */

/**
 * 이미지 변환 실패 (REQ-IMAGE-008).
 *
 * @MX:WARN — 이 오류가 원본 반환으로 조용히 대체되면 AC-IMAGE-033이 깨진다.
 * @MX:REASON — 변환이 실패했는데 원본을 대신 내보내면, 호출자는 축소된
 * 이미지를 받았다고 믿고 좌표를 계산한다. 실패를 알리지 않는 대체는
 * 실패보다 나쁘다 — 좌표가 조용히 어긋나기 때문이다(spec.md §C.1 계열).
 */
export class ImageTransformError extends Error {
  public readonly code = "IMAGE_TRANSFORM_FAILED";

  /** 실패한 단계 — 원인 추적에 필요하다 (REQ-IMAGE-008). */
  public readonly stage: string;

  constructor(stage: string, detail: string) {
    super(`이미지 변환 실패 (단계: ${stage}) — ${detail}`);
    this.name = "ImageTransformError";
    this.stage = stage;
  }
}

/**
 * 캡처의 기하 기록(사이드카)을 읽을 수 없다 (REQ-IMAGE-005 후반부).
 *
 * @MX:WARN — 이 오류 대신 배율 1.0으로 대체하면 AC-IMAGE-026이 깨진다.
 * @MX:REASON — 기록이 없다는 것은 "배율이 1.0"이라는 뜻이 아니라 "배율을
 * 모른다"는 뜻이다. 모르는 것을 1.0으로 가정하면 축소 캡처의 좌표가 그대로
 * 기기에 전달돼 엉뚱한 곳을 누른다.
 */
export class CaptureGeometryUnavailableError extends Error {
  public readonly code = "CAPTURE_GEOMETRY_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "CaptureGeometryUnavailableError";
  }
}

/**
 * 캡처가 신선도 상한을 넘겼다 (REQ-IMAGE-006).
 *
 * 낡은 캡처의 좌표는 산술적으로는 옳게 변환되지만 화면이 이미 바뀌었을 수
 * 있다 — 변환의 정확성과 좌표의 유효성은 다른 문제다.
 */
export class CaptureStaleError extends Error {
  public readonly code = "CAPTURE_STALE";

  constructor(message: string) {
    super(message);
    this.name = "CaptureStaleError";
  }
}
