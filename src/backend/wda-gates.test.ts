/**
 * 관문 감지 검사 (SPEC-IOS-002 REQ-IOS2-006 — AC-IOS2-018 · 019).
 *
 * **판정하는 것**: 관문 셋이 각각 별개 필드로 나오는가(018), 셋 다 "구분 불가"
 * 값을 갖는가(019), 각 관문이 자기 사유와 자기 확인 자리를 갖는가.
 *
 * **판정하지 못하는 것**: 판별 능력. 이 검사에는 **양성 대조가 없다** — 판별
 * 신호가 하나도 없어서 "구분되는 입력을 넣으면 구분해 낸다"를 보일 방법이
 * 없다. 대조를 만들려면 가짜 신호를 지어내야 하고, 그것은 없는 능력을 있는 것처럼
 * 보이게 만드는 일이다. 따라서 아래는 **구조 판정이며 판별 판정이 아니다.**
 * 신호가 발견되면 그때 그 관문에 양성 대조가 함께 생긴다.
 *
 * 이 구분을 적어 두는 이유: 이 저장소에는 대조 대상이 사라진 뒤에도 검사가
 * 통과해 아무것도 지키지 못한 이력이 있다. 없는 대조를 없다고 적는 것이
 * 있는 척하는 것보다 낫다.
 */

import { describe, expect, it } from "vitest";

import { readGates, type GateVerdict, type WdaGatesReport } from "./wda-gates.js";

describe("readGates · 관문 3개 보고 (REQ-IOS2-006)", () => {
  it("AC-IOS2-018 — 관문 3개가 각각 별개 필드다", () => {
    // 하나의 문자열로 뭉치지 않는다(`design.md` §E.3 1행). 키 집합을 고정해
    // 관문이 조용히 사라지거나 합쳐지는 변경을 diff에 드러낸다.
    const keys: Record<keyof WdaGatesReport, true> = {
      developerMode: true,
      certificateTrust: true,
      uiAutomation: true,
    };
    expect(Object.keys(readGates()).sort()).toEqual(Object.keys(keys).sort());
  });

  it("AC-IOS2-019 — 셋 다 '구분 불가'다", () => {
    // 추측 금지의 기계적 표현이다(`acceptance.md` AC-IOS2-019). 판별 신호가
    // 없는 지금 어느 관문도 충족/미충족으로 적히지 않는다.
    const verdicts = Object.values(readGates()).map((gate) => gate.verdict);
    expect(verdicts).toEqual<GateVerdict[]>(["indeterminate", "indeterminate", "indeterminate"]);
  });

  it("관문마다 사유와 확인 자리가 다르다", () => {
    // AC-018이 막으려는 것은 필드를 3개로 쪼개 놓고 **같은 문장 하나**를 세 번
    // 싣는 형태다. 그것은 분리된 필드처럼 보이지만 사용자에게는 뭉친 문자열과
    // 같다 — 어느 관문을 보러 가야 하는지 여전히 알 수 없다.
    const gates = Object.values(readGates());
    expect(new Set(gates.map((gate) => gate.reason)).size).toBe(3);
    expect(new Set(gates.map((gate) => gate.manualCheck)).size).toBe(3);
  });

  it("UI 자동화의 사유가 반증 사실을 담는다", () => {
    // 후보 문구를 다시 판별자로 쓰지 않기 위한 근거를 값 안에 남긴다
    // (`design.md` §E.3 3행 — 규칙의 근거를 기록한다).
    expect(readGates().uiAutomation.reason).toContain("반증");
  });
});
