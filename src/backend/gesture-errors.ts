/**
 * `AdbBackend`가 두 손가락 제스처(`pinch`)와 `doubleTap`을 거부할 때 던지는
 * 타입 있는 오류 (SPEC-GESTURE-002 M1, REQ-GEST2-COMMON-002).
 *
 * `ime-errors.ts`·`launch-errors.ts`와 같은 이유로 **신규 모듈**이다 —
 * 제스처 거부는 IME 생명주기와도 앱 실행 경로와도 무관하고, `wda-errors.ts`는
 * iOS 전용이라 Android 거부가 들어갈 자리가 아니다(plan.md §A.6 선례).
 *
 * **왜 타입이 있어야 하는가**: 두 메서드를 "그냥 아무것도 안 하는" 구현으로
 * 채우면 타입 체크는 통과하고 `ok:true`가 반환된다. 그 조용한 no-op이야말로
 * 이 SPEC이 막으려는 결함이다(plan.md §B.6). `code`가 있으면 `backendFailure`가
 * 그 코드를 일반 `BACKEND_COMMAND_FAILED` 뒤에 가리지 않고 그대로 노출하고,
 * 테스트가 `rejects.toThrow`로 판정할 수 있다.
 */

/**
 * Android에서 막힌 제스처 — 조용한 no-op이 아니라 명시적 거부다.
 * `code`는 `UNSUPPORTED_GESTURE_ON_ANDROID`이며 `WdaUnsupportedKeyError`의
 * `UNSUPPORTED_KEY_ON_IOS`와 구조적으로 대칭이다(spec.md §A.3 E3).
 *
 * **생성자는 사유를 받는다.** 핀치와 더블탭은 막힌 원인이 다르므로
 * (핀치: OS 보안 정책 — SELinux가 `/dev/input/event*` 쓰기를 거부,
 * spec.md §C.1-⑥ / 더블탭: `input` 명령의 기동 비용 약 400 ms가 인식 창을
 * 넘음, §C.1-⑦) 메시지를 하나로 뭉개지 않는다 — "지원하지 않습니다" 한
 * 문장이면 호출자는 기다리면 되는지, 다른 기기를 쓰면 되는지, 영영 안 되는지를
 * 구분할 수 없다.
 *
 * @MX:WARN — 이 오류가 던져졌다는 것은 기기에 **아무것도 전송되지 않았다**는
 * 뜻이다. 호출자는 다른 경로로 되돌아가 제스처를 흉내 내려 해서는 안 된다.
 * @MX:REASON — spec.md §D가 "Android에서 되게 만드는 우회"를 범위 밖에 두는
 * 이유가 그것이다: `input tap`을 더 빨리 부르는 식의 우회는 기기 속도에
 * 좌우돼 어떤 기기에서는 되고 어떤 기기에서는 조용히 안 되는 결과를 만든다.
 */
export class UnsupportedGestureOnAndroidError extends Error {
  public readonly code = "UNSUPPORTED_GESTURE_ON_ANDROID";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedGestureOnAndroidError";
  }
}
