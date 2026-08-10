/**
 * 관문 감지 (SPEC-IOS-002 REQ-IOS2-006 — AC-IOS2-018 · 019).
 *
 * iOS 기기를 조작하려면 사람이 기기에서 직접 열어야 하는 관문이 셋이다:
 * 개발자 모드 · 인증서 신뢰 · UI 자동화 승인.
 *
 * **이 모듈은 셋 중 어느 것도 판별하지 못한다. 그것이 조사의 결과다.**
 *
 * `plan.md` §C M6이 착수 전에 정해 두었다 — "M1이 신호를 못 찾았으면 이
 * 마일스톤은 '구분 불가'만 구현하고 끝낸다. 그것도 정직한 결과다." 조사는 그
 * 조건에 해당했다:
 *
 *   - 2026-08-08에 `xcodebuild` exit 65 + `Timed out while enabling automation
 *     mode.`를 **UI 자동화 승인 관문의 신호로 귀속**했다.
 *   - 2026-08-09에 **반증됐다.** 같은 문구가 서로 다른 조건 다섯에서 나왔고, 그중
 *     하나는 성공했던 조합과 산출물·승인이 모두 같은 상태였다. 여섯 번째 관측에서
 *     기기를 깨워 둔 채 시도하니 39초에 성공했다 — 이 문구는 관문 하나가 아니라
 *     **여러 원인이 합류하는 지점**이다(`progress.md` M3+M4 절).
 *   - 나머지 두 관문은 판별 신호가 조사되지 않았다(M1 요건 4 · 6 미착수).
 *
 * @MX:ANCHOR — 세 관문은 각각 별개 필드이며, 판별 신호 없이 값을 채우지 않는다.
 * @MX:REASON — 관문 감지는 사용자를 특정 설정 화면으로 보내는 기능이라 **틀린
 * 감지의 비용이 "감지 안 함"보다 크다**(`design.md` §E.2) — 엉뚱한 화면에서 헤매게
 * 만든다. 문구에서 정책을 역추론했다가 반증된 이력이 바로 위에 있다.
 * @MX:SPEC: SPEC-IOS-002 REQ-IOS2-006
 */

/**
 * 세 값이며 **`indeterminate`가 진짜 값**이다 — 확인하지 못한 관문을 충족으로도
 * 미충족으로도 적지 않는다(`design.md` §E.3 2행). `wda-signing.ts`의
 * `WdaSigningVerdict`가 `unknown`을 두는 것과 같은 이유다.
 *
 * `met` · `unmet`은 지금 어느 경로에서도 생성되지 않는다. 판별 신호가 발견되면
 * 그때 그 관문만 값을 갖는다 — 신호 없이 채우는 것이 이 타입이 막으려는 것이다.
 */
export type GateVerdict = "met" | "unmet" | "indeterminate";

export interface GateStatus {
  verdict: GateVerdict;
  /** 왜 이 값인가. `indeterminate`면 **무엇을 몰라서** 못 가르는지. */
  reason: string;
  /** CLI가 못 가르므로 사람이 직접 볼 자리. 관문마다 다르다. */
  manualCheck: string;
}

/**
 * 관문별로 **분리된 필드**다 — 하나의 문자열로 뭉치지 않는다
 * (`design.md` §E.3 1행 · AC-IOS2-018).
 */
export interface WdaGatesReport {
  developerMode: GateStatus;
  certificateTrust: GateStatus;
  uiAutomation: GateStatus;
}

/**
 * 현재 관문 판정 — 셋 다 `indeterminate`다.
 *
 * 입출력이 없다. 읽을 신호가 없기 때문이며, 없는 조사를 하는 척하지 않으려고
 * 비동기로 만들지도 않았다. 신호가 발견되면 그 관문의 갈래에서만 조사가 생긴다.
 */
export function readGates(): WdaGatesReport {
  return {
    developerMode: {
      verdict: "indeterminate",
      reason: "개발자 모드 미충족 시의 관측 신호가 조사되지 않았습니다.",
      manualCheck: "기기에서 설정 > 개인정보 보호 및 보안 > 개발자 모드를 확인하세요.",
    },
    certificateTrust: {
      verdict: "indeterminate",
      reason: "인증서 미신뢰 시의 관측 신호가 조사되지 않았습니다.",
      manualCheck: "기기에서 설정 > 일반 > VPN 및 기기 관리에서 개발자 앱 신뢰를 확인하세요.",
    },
    uiAutomation: {
      verdict: "indeterminate",
      reason:
        "후보 신호였던 기동 시간 초과 문구가 2026-08-09 관측에서 반증됐습니다 — 여러 원인이 같은 문구를 냅니다.",
      manualCheck: "기기에서 설정 > 개발자 > UI 자동화 사용을 확인하세요.",
    },
  };
}
