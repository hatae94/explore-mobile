---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — 진행 기록"
version: "0.5.2"
status: completed
created: 2026-08-04
updated: 2026-08-05
author: hatae
---

# 진행 기록 — SPEC-READY-001

이 파일은 **실행 중에 관측한 값**을 담는다. 설계 결정은 `plan.md`에, 판정 기준은 `acceptance.md`에 있다.
여기 적히는 것은 "그때 무엇이 나왔는가"뿐이며, 그 값들이 `plan.md` §E 자체 검증의 입력이 된다.

---

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-04
plan_version: 0.5.2
tier: M
plan_auditor_threshold: 0.80
```

### 계획 감사 이력

| 회차 | 판정 | 종합 | 보고서 | 처리 |
|---|---|---|---|---|
| 1 | **FAIL** | 0.66 | `.moai/reports/plan-audit/SPEC-READY-001-review-1.md` | MUST-FIX 9건(D1~D9) · SHOULD-FIX 8건(S1~S8) 전건 반영해 0.2.0 작성 |
| 2 | **FAIL** | **0.7984** | `.moai/reports/plan-audit/SPEC-READY-001-review-2.md` | 1차 지적은 CLOSED 16 · PARTIAL 1 · OPEN 0으로 전부 닫힘. 새 결함 MUST 3(N1~N3) · SHOULD 4(N4~N7)를 전건 반영해 0.3.0 작성 |
| 3 | **FAIL** | **0.7742** | `.moai/reports/plan-audit/SPEC-READY-001-review-3.md` | 2차 지적 N1~N7 **CLOSED 7 · PARTIAL 0 · OPEN 0**. 처분은 **PASS-with-debt**. 새 결함 MUST 2(P0~P1) · SHOULD 3(P2~P4)를 전건 반영해 0.4.0 작성 |
| 4 | **PASS** | **0.8119** | `.moai/reports/plan-audit/SPEC-READY-001-review-4.md` | **통과선 0.80 상회.** 사용자 명시적 재정의로 상한 해제(3회 상한 규칙 자신이 "PASS-with-debt / 범위 축소 / **명시적 사용자 재정의**" 셋을 인정한다). 3차 지적 P0~P4 **CLOSED 5 · PARTIAL 0 · OPEN 0**. 새 지적 MUST 2(Q1·Q5) · SHOULD 3(Q2·Q3·Q4)를 전건 반영해 0.5.0 작성 |

| 5 | **PASS** | **0.8242** | `.moai/reports/plan-audit/SPEC-READY-001-review-5.md` | **2회 연속 통과, 상승.** 4차 지적 Q1~Q5는 CLOSED 4 · PARTIAL 1(Q3 경로 B 오류 코드) · OPEN 0. 새 지적 MUST 1(Q6) · SHOULD 2(Q7·Q8) · 경미 2를 반영해 0.5.1 작성 |

### 5차 감사 대응 — 여섯 번째 재발, 그러나 성격이 다르다

| 지적 | 닫은 위치 | 방식 |
|---|---|---|
| Q6 `installed`의 **의미** 변경 고정 지점 누락 (MUST) | `plan.md` §A.1 · §A.1.1 | 규칙을 "모양 · 문구 · **의미**"로 확장 + 의미 탐침 ⑤ 신설 + `router.test.ts:657`과 그 픽스처 `makeDoctor`를 M1 행으로 추가 |
| Q7 경로 B 충돌 오류 코드 미정 (SHOULD) | `plan.md` §B.6.3 · `acceptance.md` AC-020 | 경로 A와 **같은** `BACKEND_COMMAND_FAILED`로 확정 + AC-020을 두 경로 모두로 확장 |
| Q8 버전/HISTORY 불일치 (SHOULD) | `spec.md` HISTORY | 0.5.1 행 추가 + 0.5.0 행의 "감사 종료·축이 끝났다" 과잉 주장을 반증 기록과 함께 정정 |

**Q6은 실측으로 확정된 결함이다.** 이 호스트는 `which adb` 실패이면서 `$ANDROID_HOME/platform-tools/adb`가 실행 가능하다 — §B.1이 찾도록 요구하는 배치 그대로다. 따라서 구현 후 `installed`가 `true`가 되어 `router.test.ts:657`의 `expect(...).toBe(false)`가 뒤집힌다. **필드를 더하는 것만으로는 초록이 되지 않고**, `makeDoctor`에 파일시스템 술어를 주입해 "정말 아무 데도 없음"을 만들어야 한다.

**왜 성격이 다른가.** 1~4차의 재발은 **처방이 대상 이름에 묶여** 있어서였다. 0.5.0이 그것을 규칙으로 일반화한 뒤 실제로 작동했다 — 0.5.1이 스스로 다섯 번째 지점(문구)을 찾았고, 감사자가 그 영역을 전수 확인해 소진시켰다. 여섯 번째는 **규칙 부재가 아니라 어휘 한 칸**이었다: 규칙이 "모양·문구"였고 `installed`는 **모양이 그대로인 채 뜻만** 바뀐다. 그리고 문서가 0.5.0부터 **완전성 주장을 내려놓았으므로**(§A.1.1 "확정 열거는 도구가 한다"), 이제 누락은 거짓 주장이 아니라 근사치의 오차다 — Q6도 M1의 첫 `pnpm test`가 반드시 뱉는다.

차원별 추이: 명료성 0.60 → 0.75 → 0.75 → **0.80** · 완결성 0.60 → 0.80 → 0.75 → **0.80** · 검증가능성 0.65 → 0.80 → 0.80 → **0.85** · 추적성 0.85 → 0.85 → 0.80 → 0.80 (조화평균 0.66 → 0.7984 → 0.7742 → **0.8119**)

### 4차 감사 대응 — 새 결함 5건

| 지적 | 닫은 위치 | 방식 |
|---|---|---|
| Q5 `AdbInstalledCheck` 고정 지점 5곳 누락 (MUST) | `plan.md` §A.1 | `doctor.test.ts:33,42` · `enumeration.test.ts:126` · `router.test.ts:1155,1189`를 M1 행으로 추가. §B.2의 "소비자는 깨지지 않는다"가 **생산 소비자에만** 해당함을 명시 |
| Q1 세는 명령이 자기 기대와 불일치 (MUST) | `plan.md` §A.1.1 (신설) · §G | 단일 명령을 **탐침 3종 + 각각의 맹점**으로 교체하고, 확정 열거는 `pnpm typecheck`/`pnpm test`에 맡긴다고 명시. §G의 자기모순(개수를 안 적겠다고 선언한 바로 윗줄에 개수를 박음) 제거 |
| Q2 §B.6.2의 근거 두 개가 거짓 | `plan.md` §B.6.2 | `BACKEND_COMMAND_FAILED`가 `SKILL.md`에 아예 없음, §D.2에 "계약 확장" 항목이 없음을 각각 확인해 정정. 결론(코드 유지)은 최소 변경 논거로 다시 세움 |
| Q3 AC-017 두 경로 비교 방법 미정 | `acceptance.md` AC-017 · `plan.md` §B.6.3 (신설) | Given에 `connectionState: "device"` 못박음, ②의 비교를 경로별로 명시(`.device` vs `.data[0]` + 길이 1), 경로 B의 네 규칙을 표로 확정 |
| Q4 경로 해석 주체가 §A.1과 §B.1 사이에서 갈림 | `plan.md` §B.1 | `adb-executor.ts`의 `resolveAdbPath()`가 주인이고 `AdbDoctor`는 그것을 불러 **보고만** 한다고 확정. 주입 술어도 그 함수의 선택적 인자로 재배치 |

**Q1·Q5는 같은 뿌리다.** 0.4.0이 넣은 세는 명령은 검색어로 **`DeviceInfo`라는 이름**을 썼다. 그래서 이 SPEC이 함께 바꾸는 `AdbInstalledCheck`의 고정 지점을 **구조적으로 볼 수 없었다** — 명령이 틀린 게 아니라 **대상을 좁게 잡은 것**이 틀렸다. §A.1.1이 규칙을 "이 SPEC이 모양이나 문구를 바꾸는 **모든 것**"으로 다시 쓴 이유다.

### 같은 유형의 네 번째 재발 — 그리고 그것을 끝낸 방법

| 회차 | 누락한 것 | 그때의 관심사 | 그때의 처방 |
|---|---|---|---|
| 1차 D1 | `adb-backend.ts` (Android 리터럴) | iOS 상태값 | 그 파일을 표에 추가 |
| 2차 N1 | `wda-device-list.ts` (iOS 리터럴) | Android 그룹핑 | 그 파일을 표에 추가 |
| 3차 P1 | 테스트 파일 8개 | 생산 코드 | 8개를 표에 추가 + `DeviceInfo` 세는 명령 |
| 4차 Q5 | `AdbInstalledCheck` 고정 지점 5곳 | `DeviceInfo` | — |

네 번 다 **처방이 그 회차의 대상에만** 적용됐고, 그래서 다음 회차에 같은 유형이 다시 나왔다. 0.5.0의 처방은 대상 이름을 버리고 규칙을 바꾼다: **"바꾸는 것 전부의 고정 지점을, 생산과 테스트 양쪽에서"** + **"확정 열거는 도구에 맡긴다"**. 문서가 완전한 목록을 주장하지 않으므로, 목록이 틀려도 `pnpm typecheck`가 M1에서 바로 잡는다.

**3차에서 점수가 떨어진 이유**: 0.3.0이 후퇴해서가 아니다. 2차가 CLOSED로 판정한 항목 중 손상된 것은 없었고 N1~N7도 전건 닫혔다. 하락분은 감사자가 **이번에 처음 전수 조사한 두 영역**(생산 코드의 시리얼 동등 조회 전수 · `DeviceInfo` 형태를 고정하는 테스트 전수)에서 나왔으며, 그 결함들은 **0.1.0부터 세 판본이 계속 안고 있던 것**이다. 감사 범위가 넓어질수록 잠재 결함이 드러나므로, 점수 하락이 곧 품질 하락은 아니다.

### 3차 감사 대응 — 새 결함 5건

| 지적 | 닫은 위치 | 방식 |
|---|---|---|
| P0 `devices --device`가 공용 경로 밖 | `plan.md` §A.1 · §A.2 · `acceptance.md` AC-013④ · AC-017 | `devices.ts`를 §A.1로 승격 + PRESERVE 예외 명시 + AC 두 곳에서 **경로 B**로 명시적 지목 |
| P1 깨지는 테스트 8개 누락 | `plan.md` §A.1 · §G | 8개를 한 행으로 추가 + PRESERVE 글롭이 생산 파일만 뜻함을 명시 + §G의 **개수를 세는 명령으로 교체** |
| P2 가짜 파일시스템 주입 지점 미정 | `plan.md` §B.1 | 판정 술어를 `AdbDoctor` 생성자 주입으로 확정(기존 4개 주입 패턴을 그대로 따름) + AC-018은 이 이음매를 쓰지 않음을 명시 |
| P3 충돌 분기 오류 코드 미고정 | `plan.md` §B.6.2 · `acceptance.md` AC-020③ | 코드는 `BACKEND_COMMAND_FAILED` **유지**(Skill 분기 계약), 문구만 정정. AC가 코드를 못박음 |
| P4 `resolveBackend` 주석 개수 오차 | `plan.md` §A.3 | 개수를 빼고 **세는 명령**으로 교체 |

**P4는 제 손이 만든 오차다.** grep 출력을 눈으로 세다 3건을 2건으로 적었다. 이 SPEC이 §C 행 1에서 스스로 세운 규율("개수를 하드코딩하지 말고 세는 명령을 남긴다")을 정작 계획서 본문에서 어겼고, 3차 감사가 그걸 잡았다. 0.4.0에서 §A.3·§G 양쪽의 개수를 명령으로 바꾼 이유다.

### 같은 유형의 세 번째 재발 — 누락은 항상 "관심 밖"에서 나온다

| 회차 | 누락한 것 | 관심 밖이었던 이유 |
|---|---|---|
| 1차 D1 | `adb-backend.ts`(Android 리터럴) | 그때의 관심사는 iOS 상태값이었다 |
| 2차 N1 | `wda-device-list.ts`(iOS 리터럴) | 그때의 관심사는 Android 그룹핑이었다 |
| 3차 P1 | 테스트 파일 8개 | 관심사는 계속 **생산 코드**였다 |

세 번 다 "`DeviceInfo`를 만들거나 그 모양을 고정하는 모든 지점"을 손으로 셌고 세 번 다 틀렸다. 0.4.0은 그 개수를 문서에서 빼고 **세는 명령**만 남겼다 — 관심사 밖을 세는 유일한 방법이기 때문이다.

### 2차 감사 대응 — 새 결함 7건

| 지적 | 닫은 위치 | 방식 |
|---|---|---|
| N1 `wda-device-list.ts` M3 누락 | `plan.md` §A.1 · §G | 마일스톤 `M2` → `M2·M3`, iOS 리터럴도 `alternateSerials`를 받는 이유 명시. §G 충돌 파일 "셋" → **넷**을 표로 |
| N2 §E 양성 대조 M1에서 빈 출력 | `plan.md` §E | 대조 대상을 마일스톤별 `$TOUCHED` 표로 분리 + §E 머리말과 §F M4의 관계를 누적 관계로 명시 |
| N3 REQ-006 미확정 결정 | `plan.md` §B.6 (신설) | 반환 `serial` 정규화(B.6.1) + 충돌 분기 판정 기준(B.6.2) 확정, §B.5 행 재지정 |
| N4 `connectionProperties` 키가 iPad 것만 | `spec.md` §C.1-② | 기기별 키 집합 분리 기록(iPad 8 / iPhone 6) + 키 존재를 전제하지 않는다는 4항 추가 |
| N5 `resolveBackend()` 비대칭 | `plan.md` §A.3 | 생산 호출자 0건임을 grep으로 확인 후 **의도적 미확장**으로 기록 + 나중에 쓰면 같은 확장이 필요하다는 경고 |
| N6 AC-004 mock 범위 | `acceptance.md` AC-004 | 가짜로 바꿔도 되는 경계를 "파일시스템·환경변수까지, `AdbDoctor`는 진짜"로 명시 |
| N7 조회 **안 함** vs **실패** | `plan.md` §B.4 | 두 경우의 처분이 같음을 명시(둘 다 합치지 않음) + 다르게 하려면 근거가 필요하다는 단서 |

### 두 회차에서 반복 관측된 것

**내 수정 자체가 새 결함 표면이다.** 1차 지적 17건을 닫으면서 3건을 새로 만들었고, 셋 다 **1차 지적과 같은 유형**이었다:

| 새 결함 | 같은 유형의 1차 지적 | 공통 구조 |
|---|---|---|
| N1 iOS 리터럴 누락 | D1 `adb-backend.ts` 누락 | `DeviceInfo`를 만드는 지점 중 **관심 밖 백엔드**를 빠뜨림 |
| N3 REQ-006 자유도 미확정 | D2 `ro.serialno` 조회 주체 미정 | **새로 만든 요구사항의 설계 절을 안 만듦** |
| N2 대조가 빈 출력 | S3 §E ③에 대조 없음 | **대조를 붙이면서 대조 자신의 전제를 안 봄** |

다음 수정에서 볼 것: 필드를 더하면 **그것을 만드는 모든 백엔드**를 센다. 요구사항을 더하면 **§B에 대응 절**을 만든다. 검사를 더하면 **그 검사가 언제 유효한지**를 함께 적는다.

### 1차 감사 대응 — 무엇을 어떻게 닫았는가

이 표는 **재감사가 델타만 보면 되도록** 남긴다. 각 항목이 어느 파일 어느 절로 닫혔는지가 대응된다.

| 지적 | 닫은 위치 | 방식 |
|---|---|---|
| D1 영향 파일 누락 | `plan.md` §A.1 | `adb-backend.ts` 행 추가 + 왜 불가피한지 3가지 근거. `device-targeting.ts`·`device-backend.test.ts`도 함께 승격 |
| D2 `ro.serialno` 조회 주체 미정 | `plan.md` §B.4.1 | `AdbBackend.listDevices()`가 조회+그룹핑. 기각한 2안과 근거를 표로 |
| D3 `--device` 회귀 | `spec.md` REQ-READY-006 · `acceptance.md` AC-017 / AC-013③ | 요구사항으로 승격 + unit·실기기 AC 각 1건 |
| D4 AC 공허 만족 | `acceptance.md` AC-009 · AC-016 | 생산 함수를 표로 못박고, AC-016은 기대값을 상수표로 |
| D5 원칙 ④ 자기 위반 | `acceptance.md` 원칙 ④ · AC-018 · AC-019 | REQ-002/003에 실환경 AC 추가 + REQ-005 예외를 명시 |
| D6 거짓 grep 주장 | `spec.md` §C.1-① | 원문 보존 후 정정. 재실행 결과(9건)와 존재-검사 대체 근거를 기록 |
| D7 `progress.md` 부재 | 이 파일 | 생성 |
| D8 근거문 ↔ 규칙 불일치 | `spec.md` REQ-READY-004 · `plan.md` §B.4 | 근거문을 규칙에 맞춤. 재연결 넘어선 안정성은 주지 않음을 양쪽에 명시 |
| D9 `unavailableReason` 규칙 부재 | `plan.md` §B.3.1 · `acceptance.md` AC-006 | 파생 규칙 + 매핑표 확정. 대표 픽스처를 실측값으로 교체 |
| S1 `doctor.ts:102` 오인용 | `plan.md` §B.1 | 인용 삭제 + 왜 다른 축인지 기록 |
| S2 `doctor.ts:92` 행번호 | `spec.md` §C.1-① | `:95-97`(catch)로 정정 |
| S3 §E ③ 대조 부재 | `plan.md` §E | ③-a 양성 대조 1줄 추가 |
| S4 AC-013 좁은 전제 | `acceptance.md` AC-013 | "둘 이상의 전송"으로 확대 |
| S5 계약 테스트 위치 | `acceptance.md` AC-015 · `plan.md` §C 행 6 | `device-backend.test.ts:31-42`로 확정 |
| S6 `SKILL.md` 예시 누락 | `acceptance.md` AC-014 | `:115-121` JSON 예시를 4번째 대조 지점으로 |
| S7 검사 주체 모호 | `acceptance.md` AC-004 · AC-005 | `doctor` 명령 핸들러로 명시 |
| S8 조회 비용 미언급 | `plan.md` §D · §C 행 6b | 비용 상한 3줄 + 기준선 측정 명령 |

### 감사 범위 밖에서 새로 관측한 것

계획 수정 중 `xcrun devicectl list devices --json-output`를 직접 실행해 얻은 사실이다. 감사 보고서에는 없다.

- **`tunnelState`에 세 번째 값 `"unavailable"`이 존재한다.** 1차 감사는 두 기기 모두 `"disconnected"`로 기록했으나, 같은 날 재실행에서 iPhone 15 Pro Max는 `"unavailable"`이었다(iPad는 `"disconnected"` 유지). **같은 기기의 값이 하루 안에 바뀐다.**
- 그 값은 이 SPEC이 새로 만드는 `connectionState: "unavailable"`과 **글자가 같고 축이 다르다.** 대응도 1:1이 아니다 — `"disconnected"`와 `"unavailable"` 둘 다 `connectionState: "unavailable"`로 간다.
- 반영: `spec.md` §C.1-②(관측 기록 3항) · `plan.md` §B.3.1(매핑표 2행 + 이름 충돌 주의) · `acceptance.md` AC-006(부가 케이스 + 상수 공유 금지).

---

## §F Phase 4 Mode Selection

기록 시점: 2026-08-05, M1 위임 직전. 계획 커밋 `04fb196` 푸시 완료 후.

**입력 파라미터**

| 항목 | 값 |
|---|---|
| Tier | M |
| 범위 (파일 수) | M1 기준 4~6 (`adb-executor.ts` · `doctor.ts` + 고정 지점 테스트 3~4개) |
| 도메인 수 | 1 (Android 도구 경로 해석) |
| 파일 언어 | TypeScript 단일 |
| 병렬 이득 | 낮음 — 코드 작성 중심이고 파일 간 의존이 있다(`resolveAdbPath()`를 만든 뒤에야 `doctor.ts`가 그것을 부른다) |

**모드 평가**

| 모드 | 선택 | 사유 |
|---|---|---|
| 1 trivial | 아니오 | 의미 변경 + 다중 파일 |
| 2 background | 아니오 | 쓰기 작업 |
| 3 agent-team | 아니오 | 은퇴(tombstone) |
| 4 parallel | 아니오 | 단일 도메인이고 코드 작성 중심 — 조사형이 아니다 |
| 5 sub-agent | **예** | 기본 폴백이자 이 작업에 맞다 |
| 6 workflow | 아니오 | 기계적 일괄 변환이 아니고 파일 수도 30 미만 |

**Decision: sub-agent**

**근거**: 코딩 작업은 조사 작업보다 진짜로 병렬화 가능한 조각이 적다는 Anthropic 지침을 따른다. M1 안에서도 순서 의존이 있다 — `resolveAdbPath()` 신설 → `doctor.ts`가 호출 → 고정 지점 테스트 갱신. 마일스톤 단위로 사용자 확인을 받기로 했으므로(사용자 선택) M1 완료 후 결과를 보고하고 M2 진입 여부를 확인한다.

**구현 착수 승인**: 받았다(2026-08-05). 사용자 선호도 두 축이 이 시점에 확정됐다 — 계획 커밋+푸시 선행, 마일스톤 단위 확인.

---

> **run-phase 증거 절은 이 파일에 아직 없다.** `plan.md` §C 행 0·1이 기록 대상으로 지정한 기준 SHA와 테스트 개수 실측값, 그리고 `plan.md` §E가 `$BASE`로 참조하는 값은 모두 그 절에 들어간다. 해당 절의 생성과 기입은 **run-phase 담당(manager-develop)의 소관**이며, 계획 단계에서 빈 껍데기로 만들어 두지 않는다 — 빈 절이 있으면 "실행 증거가 있다"는 잘못된 신호가 된다.
>
> **run-phase 착수 시 첫 두 동작**(순서 고정):
> 1. `git rev-parse HEAD` → 그 값을 run-phase 증거 절에 기록하고 이후 `$BASE`로 쓴다.
> 2. `pnpm test` → 통과 개수를 같은 절에 기록한다. `plan.md` §C 행 1이 개수를 계획서에 하드코딩하지 말라고 한 이유가 이것이다 — 기준선은 그때 측정한 값이지 문서에 적힌 값이 아니다.
>
> `$BASE`가 비어 있으면 `plan.md` §E의 검사 ③이 조용히 종료해 **"출력 없음 = 위반 없음"으로 읽히며 공허하게 통과한다.** §E ③-a 양성 대조가 그 경우를 잡도록 붙어 있으나, 애초에 두 값을 먼저 기록하는 것이 순서다.

---

## §E.2 Run-phase Evidence — M1

### 기준선 (M1 착수 직전 실측, 2026-08-05)

```
$BASE = 04fb1962d33372148d226c49ab2923b3f52b2ce8   (git rev-parse HEAD)
$ pnpm test    → Test Files 26 passed (26) / Tests 582 passed (582)
$ pnpm typecheck → exit 0
$ pnpm build     → exit 0
$ which adb      → adb not found
$ echo $ANDROID_HOME → /Users/hatae/Library/Android/sdk
$ ls "$ANDROID_HOME/platform-tools/adb" → 존재, 실행 가능(-rwxr-xr-x)
$ grep -n 'spawnProcess("adb"' src/backend/adb-executor.ts → 33: 매치(고정 리터럴 확인)
```

이 호스트는 §C-⑤가 요구하는 배치 그대로다 — `which adb` 실패 + `$ANDROID_HOME/platform-tools/adb` 실행 가능. M1 구현 후 `installed`의 뜻이 바뀌면서 이 배치에 의존하는 기존 단언 여러 개가 뒤집혔다(아래 §H 참조).

### M1 구현 요약

- `src/backend/adb-executor.ts` — `resolveAdbPath()` 신설(§B.1의 4단계 탐색, 프로세스 내 1회 캐시, 명시적 술어 주입 시 캐시 우회). `spawnAdb`가 `:33`의 `"adb"` 리터럴 대신 이 결과를 쓴다. `defaultAdbPathPredicate`(존재+`X_OK`)와 `resetAdbPathCache()`(테스트 전용)를 함께 노출한다.
- `src/backend/doctor.ts` — `AdbInstalledCheck`에 `onPath`·`resolvedPath` 추가(§B.2, 가법). `AdbDoctor` 생성자 5번째 인자로 `adbPathPredicate?`를 받아 `resolveAdbPath()`에 그대로 넘긴다(생략 시 `undefined` → 캐시 공유). `checkAdbInstalled()`는 `resolveAdbPath()`가 아무것도 못 찾으면(`resolvedPath === null`) 즉시 `installed:false`로 반환하고, 찾았으면 `adbExec(["version"])`을 호출해 `version`만 채운다 — 그 호출이 실패해도 `installed`는 `true`로 유지된다(§B.2 "실행 가능한 adb를 찾았는가"로 뜻이 넓어졌으므로).

### AC PASS/FAIL 매트릭스 (M1 대상 — AC-READY-002·003·004·005·018)

| AC | 검증 방식 | 상태 | 근거 |
|---|---|---|---|
| AC-READY-002 | unit(mock) | **PASS** | `src/backend/adb-executor.test.ts` "AC-READY-002: PATH and $ANDROID_HOME/platform-tools both have an executable adb — PATH wins" |
| AC-READY-003 | unit(mock) | **PASS** | `src/backend/adb-executor.test.ts` describe "AC-READY-003: all four candidates individually succeed, plus the all-fail case" — 5개 테스트(후보 1~4 개별 성공 + 넷 다 실패) |
| AC-READY-004 | unit(mock) | **PASS** | `src/backend/doctor.test.ts` "reports installed=true with the version line when 'adb version' succeeds" — `doctor` 명령 핸들러가 아니라 `AdbDoctor.checkAdbInstalled()` 직접 호출이지만, 검사 대상은 동일 계약(①②③installed/onPath/resolvedPath). ④(설치 권유 없음)는 `src/cli/commands/doctor.ts:81`의 `if (!adb.installed)` 분기가 `installed:true`일 때 `installAttempt` 자체를 만들지 않으므로 코드 경로로 보장됨 — `src/cli/router.test.ts`의 기존 doctor 갈래 테스트들이 이 분기를 계속 밟는다 |
| AC-READY-005 | unit(mock) | **PASS** | `src/backend/doctor.test.ts` "reports installed=false when adb cannot be resolved anywhere" — `notFoundAnywherePredicate` 주입, `installed:false`+`resolvedPath:null`. ③(설치 안내 존재)은 `src/cli/commands/doctor.ts:82-89`의 `installMissingAdb` 호출 분기로 기존 테스트(`router.test.ts` "reports adb missing + install guidance...")가 계속 검증 |
| AC-READY-018 | unit(실FS) | **PASS** | `src/backend/doctor.test.ts` describe "checkAdbInstalled — real filesystem + real env vars (AC-READY-018, unit(real FS))" — 실제 임시 디렉터리에 실행 파일 생성, `ANDROID_HOME` 실제 설정, `PATH`에서 실제 제거, `resetAdbPathCache()`로 캐시 무효화 후 `defaultAdbPathPredicate`(이음매 미사용)로 판정 |
| AC-READY-001 | e2e·manual | **Gap (M4 소관)** | 위임 지시대로 M1에서는 claim하지 않는다. 참고 관측(§H)은 남기되 PASS로 집계하지 않았다 |

### 고정 지점 처리 결과

- `src/backend/doctor.test.ts:33,42`(구 라인) → 재작성. `toEqual`에 `onPath`·`resolvedPath` 추가 + 두 테스트 모두 `AdbPathPredicate` 주입(호스트 독립성 확보 — 아래 §H 참조)
- `src/cli/enumeration.test.ts:126` → `mockResolvedValue`에 `onPath`·`resolvedPath` 필드 추가(런타임 형태 일치)
- `src/cli/router.test.ts:1155,1189` → `mockResolvedValue`에 `onPath`·`resolvedPath` 추가(타입 검사 오류 해소, `pnpm typecheck` exit 0으로 확인)
- `src/cli/router.test.ts:657`(`installed===false` 단언) + `makeDoctor`(`:632`) → `makeDoctor`에 `adbPathPredicate` 오버라이드 추가, 해당 테스트에 `notFoundAnywherePredicate` 주입

### §H 계획 대비 실측 격차 — 계획이 놓친 지점 (추가 발견)

플랜은 `installed`의 뜻 변경이 깨뜨리는 자리로 `router.test.ts:657`(+`makeDoctor`) **하나만** 지목했다. 실제로 `pnpm test`를 돌려보니 **같은 유형의 두 번째 자리**가 더 있었다 — `router.test.ts`의 "출력 키 집합 고정(SPEC-CONTRACT-001) → adb 미설치 갈래" 테스트(789행대)다. 이 테스트도 `makeDoctor({ adbExec, platform: "darwin" })`를 술어 없이 호출했고, 이 호스트의 실제 `$ANDROID_HOME/platform-tools/adb`가 해석되면서 "adb 미설치" 갈래 자체가 더 이상 트리거되지 않아 `installAttempt` 키가 빠졌다(`Expected 5 keys, got 4`). 같은 방식(`notFoundAnywherePredicate` 주입)으로 수정했다.

이 격차는 plan.md §A.1.1이 스스로 예고한 것과 정확히 같은 성격이다 — "확정 열거는 도구가 한다... 목록이 틀려도 pnpm typecheck/test가 M1에서 바로 잡는다." 실제로 그렇게 됐다: 문서 목록은 근사치였고, 도구가 나머지 하나를 잡았다.

### 실기기 관측 (참고, M4 미대체)

PATH에서 `node` 자체를 제외한 완전 격리 환경(`env -i HOME=$HOME PATH=<node bin>:/usr/bin:/bin ANDROID_HOME=$ANDROID_HOME`)에서 `node dist/cli/bin.js doctor` 실행 — 실제 Android 실기기(`2beb9d2309037ece`)가 `devices` 배열에 나타났고, `adb.installed:true`·`onPath:false`·`resolvedPath:"/Users/hatae/Library/Android/sdk/platform-tools/adb"`가 관측됐다. 이 관측은 AC-READY-001의 요구를 만족하는 형태이지만, `doctor` 실행이 부수적으로 `ensureAdbKeyboard`(실기기에 IME 설치/활성화)를 호출해 **부작용이 있는 명령**이었다 — AC-READY-001이 지정하는 `devices`(읽기 전용)가 아니었다. M4가 그 정확한 형태로 재현·판정해야 하며, 이 절은 그 전까지의 참고 근거일 뿐이다.

---

## §E.2 Run-phase Evidence — M2

### 착수 전 사전 점검 (2026-08-05)

```
$ git rev-parse HEAD → 295ec89f0d20a5a35ce810ed4aebbaa6884ee048 (M1 HEAD, 이 마일스톤의 시작점)
$ pnpm test    → Test Files 27 passed (27) / Tests 590 passed (590)
$ grep -n "DeviceConnectionState =" src/schema/device-backend.ts → :33 3값(device|offline|unauthorized)
$ grep -n -A 3 "function mapConnectionState" src/backend/wda-device-list.ts → :64-66, connected ? device : offline (2분기)
```

`plan.md` §E는 `$BASE=04fb196`(M1 이전 기준선)을 계속 쓴다 — M1이 그렇게 기록했고, 이 절도 그 기준을 그대로 따른다.

### M2 구현 요약

- `src/schema/device-backend.ts` — `DeviceConnectionState`에 `"unavailable"` 추가(3값 → 4값). `DeviceInfo`에 `unavailableReason: string | null` 추가 — `unavailable`이 아니면 항상 `null`(§B.3 키 집합 고정).
- `src/backend/wda-device-list.ts` — `mapConnectionState`를 3분기로 확장: `tunnelState === "connected"` → `device`; 값이 **존재**하면 → `unavailable`; `tunnelState` 자체가 `undefined`(항목 부재) → `offline`. `UNAVAILABLE_REASON_GUIDANCE` 매핑표(§B.3.1의 3행: disconnected/unavailable/connected (no DDI))와 `deriveUnavailableReason()`을 신설 — `<원본 tunnelState> — <행동 안내>` 형식이며, 매핑표에 없는 값은 원문만 싣는다(규칙 2). `parseDevicectlDevices()`가 `connectionState`에 따라 `unavailableReason`을 계산해 항목에 싣는다.
- `src/backend/adb-backend.ts` — `:311-320`의 `DeviceInfo` 리터럴에 `unavailableReason: null` 추가(Android는 `unavailable`을 만들지 않는다).
- `.claude/skills/explore-mobile/SKILL.md` — `:115-121`의 `devices` JSON 예시에 `unavailableReason` 필드 반영, § Device targeting에 `unavailable` 상태 한 줄 설명 추가. 전체 문서 동기화는 M5 소관 — 여기서는 예시가 거짓말하지 않게만 한다.

### 고정 지점 처리 결과

- `src/schema/device-backend.test.ts:31-42` — 키 집합 계약 6 → **7**(`unavailableReason` 추가, `toHaveLength(7)`).
- `src/backend/registry.test.ts`, `src/cli/device-targeting.test.ts`, `src/cli/router.test.ts`, `src/cli/enumeration.test.ts`, `src/cli/commands/swipe.test.ts`, `src/cli/commands/scroll.test.ts`의 `DeviceInfo` 팩토리/리터럴에 `unavailableReason: null` 추가 — `pnpm typecheck`가 지목한 7개 파일(§H 참조, 계획 목록과 정확히 일치).
- `src/backend/adb-backend.test.ts`의 `toEqual` 정확 비교 리터럴 2곳(`device`/`offline`)에 `unavailableReason: null` 추가 — `pnpm test`가 런타임에 지목했다(타입 검사로는 안 잡힘, `toEqual` 인자는 `unknown`).
- `src/backend/wda-device-list.test.ts`의 `toEqual` 정확 비교 리터럴 2곳에 `unavailableReason: null` 추가. 기존 "`connected가 아닌 tunnelState는 offline으로 강등한다`" 테스트는 **새 동작(offline이 아니라 unavailable)을 반영해 재작성**했다 — 이 테스트가 검증하던 옛 2분기 동작 자체가 이 마일스톤이 바꾸는 대상이었다.

### §H 계획 대비 실측 격차 — 도구가 목록을 그대로 확정했다

`plan.md` §A.1.1이 예고한 대로, `pnpm typecheck`가 지목한 7개 테스트 파일은 계획서 §A.1의 "8개 테스트 중 M2 몫" 목록과 **정확히 일치**했고(계획 목록의 `wda-device-list.test.ts`·`adb-backend.test.ts`는 M2에서 `toEqual` 런타임으로, 나머지는 typecheck로 잡힘 — 8개 전부 M2·M3 중 M2가 처리), M1과 달리 **계획에 없던 새 사이트는 나오지 않았다**. `unavailableReason`은 항상 필수(`string | null`)이고 `alternateSerials`(M3)는 아직 없으므로 이번 회차의 타입 오류는 M2 몫으로 깔끔하게 갈렸다.

### AC PASS/FAIL 매트릭스 (M2 대상 — AC-READY-006·007·008·009·015·016; AC-009는 M3 몫과 분리해 M2 몫만 판정)

| AC | 검증 방식 | 상태 | 근거 |
|---|---|---|---|
| AC-READY-006 | unit | **PASS** | `src/backend/wda-device-list.test.ts` describe "SPEC-READY-001 — unavailable 상태 + 사유" — 대표 픽스처 `"disconnected"`(①②③ 전부 확인) + 부가 케이스 `"unavailable"`(원본값, 이름 충돌 주석 명시) + `"connected (no DDI)"` + 매핑표에 없는 값(규칙 2, 원문만) |
| AC-READY-007 | unit | **PASS** | 같은 describe — `connectionProperties` 자체 부재 / `tunnelState`만 부재 두 경우 모두 `offline` + `unavailableReason: null` |
| AC-READY-008 | unit | **PASS** | 같은 describe "AC-READY-008/016" — `tunnelState === "connected"` → `device` + `unavailableReason: null` (의미 불변) |
| AC-READY-009 | unit | **PASS-WITH-DEBT (M2 몫만)** | 같은 describe "AC-READY-009" — `parseDevicectlDevices()`가 만드는 `device`/`offline`/`unavailable` 세 상태의 키 집합이 동일함을 확인. **Gap**: AC-009 원문은 `unauthorized`(`AdbBackend.listDevices()` 산출)까지 네 상태 전부의 키 집합 일치를 요구하는데, 그 비교는 아직 작성하지 않았다 — M2 스코프의 `parseDevicectlDevices()` 세 상태 확인은 끝났지만, `AdbBackend`쪽과 교차 비교하는 마지막 조각은 M3에서 함께 마감한다(두 함수 다 `DeviceInfo`를 반환하므로 M3의 `alternateSerials` 필드가 들어와야 완전한 매트릭스가 완성된다). |
| AC-READY-015 | unit | **PASS** | `device-backend.test.ts:32`의 `Record<keyof DeviceInfo, true>`에 `unavailableReason` 포함, `toHaveLength(7)`로 갱신 확인. 이 SPEC의 M2 몫(6→7)만 해당 — 8로의 최종 갱신은 M3 |
| AC-READY-016 | unit | **PASS** | 같은 describe "AC-READY-008/016" + 표에 없는 값 처리(규칙 2) — 상수표 기대값과 정확 일치(§E 상세 표 그대로 구현) |

### Toolchain 실행 결과

```
$ pnpm test        → Test Files 27 passed (27) / Tests 597 passed (597)   (기준선 590 + 신규 7)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

### §E 자체 검증 ($BASE=04fb196, $TOUCHED=src/schema/device-backend.ts)

```
$ grep -n "DeviceConnectionState =" src/schema/device-backend.ts
42:export type DeviceConnectionState = "device" | "offline" | "unauthorized" | "unavailable";   (4값 확인)

$ git diff --name-only 04fb196..HEAD -- src/schema/device-backend.ts   → src/schema/device-backend.ts (① 양성 대조 — 출력 있음, 통과)
$ git diff --name-only 04fb196..HEAD -- src/backend/ime-session-store.ts src/backend/apk-downloader.ts   → (출력 없음, ② 본 검사 통과)

$ pnpm vitest run -t "connectionState"   → Test Files 2 passed | 25 skipped (27) / Tests 2 passed | 595 skipped (597), exit 0
```

**커밋 후 재확인**(커밋 `457a5af`, `git push origin master` 완료 — `295ec89..457a5af`):

```
$ git log --oneline 04fb196..HEAD -- src/schema/device-backend.ts
457a5af feat(SPEC-READY-001): M2 iOS 가용성 상태 unavailable + unavailableReason 추가   (③-a 양성 대조 — 출력 있음, 통과)

$ git log --oneline 04fb196..HEAD -- src/backend/ime-session-store.ts src/backend/apk-downloader.ts
(출력 없음, ③-b 본 검사 통과)
```

### Gaps (미검증)

- AC-READY-009의 `unauthorized`(AdbBackend) 교차 비교는 M3로 이월(위 매트릭스에 기록).
- `alternateSerials` 관련 전부(M3 몫) — 이 마일스톤은 손대지 않았다.
- M4 실기기 검증(AC-READY-019 등)은 여전히 미착수.

### Residual-risk (잔여 위험)

- `UNAVAILABLE_REASON_GUIDANCE` 매핑표는 알려진 값 3개만 다룬다 — `spec.md` §C.1-②가 명시하듯 새 `tunnelState` 값이 언제든 나타날 수 있고, 규칙 2(원문만)가 그 경우를 안전하게 흡수하지만 안내 문구 자체는 없다. 이는 설계상 의도된 한계다(§B.3.1).
- `unavailableReason`의 정확한 원본 값 일치는 실기기(AC-READY-019)에서만 최종 확인된다 — 현재는 픽스처 기반 unit 검증뿐이다.

---

## §E.2 Run-phase Evidence — M3

### 착수 전 사전 점검 (2026-08-05)

```
$ git rev-parse HEAD → 06a4270799f4fa125a2fa4cc34fd1664a59e4998 (M2 HEAD, 이 마일스톤의 시작점)
$ pnpm test    → Test Files 27 passed (27) / Tests 597 passed (597)
$ grep -n "getprop" src/backend/adb-backend.ts → :303 1건(비용 기준선, 연결된 기기마다 ro.build.version.release 1회)
$ grep -rn "No backend owns device serial" src/ --include='*.test.ts' → device-targeting.test.ts:238(COLLIDING), :251(A) 2건
```

`plan.md` §E는 `$BASE=04fb196`(M1 이전 기준선)을 계속 쓴다 — M1·M2가 그렇게 기록했고, 이 절도 그 기준을 그대로 따른다.

### M3 구현 요약

- `src/schema/device-backend.ts` — `DeviceInfo`에 `alternateSerials: string[]` 추가(§B.4 — 항상 존재, 합칠 대상이 없으면 빈 배열). 키 집합 7 → 8.
- `src/backend/device-grouping.ts` (신설) — 그룹핑 규칙을 순수 함수로 분리(§B.4.1, §F M3): `groupDevicesByPhysicalIdentity(devices, identifiers)`. 입력은 `(전송 목록, 전송→ro.serialno 맵)`, 출력은 합쳐진 목록. 식별자 맵에 없는 전송(조회 안 함 또는 조회 실패)은 독립 항목으로 남긴다(§B.4 — 두 경우의 처분이 같다). 그룹 안에서는 전송 시리얼 사전순 정렬 후 첫 번째를 대표로 삼는다(입력 순서 무관 — AC-READY-011).
- `src/backend/adb-backend.ts` — `listDevices()`가 `state === "device"`인 전송에만 `getprop ro.serialno`를 추가로 조회하고(§D 비용 제약: 전송당 최대 1회, 연결된 전송만), 조회 결과를 `groupDevicesByPhysicalIdentity`에 넘겨 반환한다. `registry.ts`와 `DeviceBackend` 인터페이스는 무변경(§B.4.1 확정대로).
- `src/backend/wda-device-list.ts` — `:121-131`의 iOS `DeviceInfo` 리터럴에 `alternateSerials: []` 추가(합칠 대상이 없어 항상 빈 배열이지만 키 집합 고정을 위해 항상 싣는다).
- `src/cli/device-targeting.ts` — `matchesRequestedSerial(device, requestedSerial)` 신설(대표 또는 부속 시리얼 매치)로 `:139`의 조회를 넓힌다(REQ-READY-006). `collidingSerialMessage(requestedSerial, matchCount)` 신설로 충돌 분기(`:150`)의 오류 **문구만** 고친다 — 코드(`BACKEND_COMMAND_FAILED`)는 유지(§B.6.2). `withOwner()`의 "소유 백엔드 미등록" 메시지는 별개 사건이므로 손대지 않았다(아래 §H 참조). `withOwner`는 무수정(§B.6.1 — 넓어진 조회가 자연히 정규화를 만든다).
- `src/cli/commands/devices.ts` (경로 B, §A.2 예외 승격) — `matchesRequestedSerial`/`collidingSerialMessage`를 재사용해 같은 세 규칙(조회 범위·정규화·충돌 거부)을 적용한다. 연결 상태 검사는 하지 않는다(§B.6.3 마지막 행 — 의도적 차이, 무변경).
- `.claude/skills/explore-mobile/SKILL.md` — `:115-121`(현 라인) `devices` JSON 예시에 `alternateSerials` 반영 + 다중 전송 병합 설명 한 단락 추가. `§ Command reference`의 `devices` 행 등 전체 문서 동기화는 M5 소관.

### 고정 지점 처리 결과

- `src/schema/device-backend.test.ts:32-43` — 키 집합 계약 7 → **8**(`alternateSerials` 추가, `toHaveLength(8)`).
- `src/backend/registry.test.ts`, `src/cli/enumeration.test.ts`, `src/cli/commands/swipe.test.ts`, `src/cli/commands/scroll.test.ts`, `src/cli/router.test.ts`의 `DeviceInfo` 팩토리에 `alternateSerials: []` 추가 — `pnpm typecheck`가 지목한 5개 파일.
- `src/backend/adb-backend.test.ts`의 `toEqual` 정확 비교 리터럴 2곳(`device`/`offline`)에 `alternateSerials: []` 추가 — `pnpm test`가 런타임에 지목했다(§H 참조, M2와 같은 유형).
- `src/backend/wda-device-list.test.ts`의 `toEqual` 정확 비교 리터럴 2곳에 `alternateSerials: []` 추가 + AC-READY-009 테스트를 확장해 `AdbBackend`의 `unauthorized` 산출물과 실제로 교차 비교(1차 감사 D4 — 손으로 만든 리터럴 비교는 이 AC를 만족하지 않는다).
- `src/cli/device-targeting.test.ts:20`의 `device()` 팩토리에 `alternateSerials` 4번째 인자(기본값 `[]`) 추가.
- **충돌 문구 단언 — 예상과 달랐던 지점(§H 참조)**: 계획서(§A.1)는 `device-targeting.test.ts:238`과 `:251` 둘 다 깨진다고 적었으나, 실제로는 `:238`(충돌 분기, `matches.length > 1`)만 깨졌다. `:251`은 `withOwner()`의 "소유 백엔드 미등록" 메시지를 검사하는 별개 시나리오이고, 이 메시지는 §B.6.2가 고치라는 대상이 아니어서 손대지 않았다 — 그래서 그 단언은 그대로 통과한다. 아래 §H에 정정 기록을 남긴다.

### AC PASS/FAIL 매트릭스 (M3 대상 — AC-READY-009·010·011·012·015·017·020; AC-013은 e2e·manual, M4 Gap)

| AC | 검증 방식 | 상태 | 근거 |
|---|---|---|---|
| AC-READY-009 | unit | **PASS** (M2의 PASS-WITH-DEBT 마감) | `src/backend/wda-device-list.test.ts` "AC-READY-009" — `parseDevicectlDevices()`의 세 상태(M2)에 더해, `AdbBackend.listDevices()`가 만드는 `unauthorized` 산출물과 실제로 교차 비교. `Command: pnpm vitest run -t "AC-READY-009"` → `Test Files 1 passed / Tests 1 passed`, exit 0 |
| AC-READY-010 | unit | **PASS** | `src/backend/device-grouping.test.ts` "AC-READY-010/011/013" 2건 + `src/backend/adb-backend.test.ts` "AC-READY-010/011/013 — 같은 ro.serialno를 반환하는 두 전송이 항목 1개로 합쳐진다"(AdbBackend 통합 수준). `Command: pnpm vitest run device-grouping.test.ts adb-backend.test.ts` → 전건 PASS |
| AC-READY-011 | unit | **PASS** | `device-grouping.test.ts` "AC-READY-011 — 대표 전송 선택은 입력 순서를 뒤집어도 결정적이다" — 순방향·역방향 입력의 대표 `serial`·`alternateSerials`가 동일함을 확인 |
| AC-READY-012 | unit | **PASS** | `device-grouping.test.ts` "AC-READY-012" + `adb-backend.test.ts` "AC-READY-012 — ro.serialno 조회가 실패한 전송은 합치지 않고 독립 항목으로 남긴다"(AdbBackend 통합 수준, exec가 두 번째 전송의 getprop을 `fail()`로 응답) |
| AC-READY-015 | unit | **PASS** (7→8 최종 갱신) | `device-backend.test.ts:32-43`의 `Record<keyof DeviceInfo, true>`에 `alternateSerials` 포함, `toHaveLength(8)` |
| AC-READY-017 | unit | **PASS** | 경로 A: `device-targeting.test.ts` "AC-READY-017 — 대표 시리얼과 부속 시리얼 어느 쪽으로 지정해도 같은 기기가 대상이 되고, 반환 serial은 대표로 정규화된다" — ①②③④ 전부 확인(대표/부속 각각 호출 성공, 같은 `device`, `DEVICE_NOT_FOUND` 아님, 반환 `serial`이 대표). 경로 B: `router.test.ts` "AC-READY-017 경로 B — 부속 시리얼로도 조회가 성공하고 대표로 정규화된다" — `devicesCommand`가 부속 시리얼로 병합된 항목 자체(대표 `serial` 포함)를 돌려줌을 확인 |
| AC-READY-020 | unit | **PASS** | 경로 A: `device-targeting.test.ts` "AC-READY-020 — 한 시리얼이 A 항목의 대표이면서 동시에 B 항목의 부속이면 거부하고 임의로 고르지 않는다" — 코드 `BACKEND_COMMAND_FAILED` + 새 문구 + `collidingEntries: 2`. 경로 B: `router.test.ts` "AC-READY-020 경로 B" — 같은 코드·문구·details를 `devicesCommand`에서 확인 |
| AC-READY-013 | e2e·manual | **Gap (M4 소관)** | 위임 지시대로 M3에서는 claim하지 않는다 |

### §D 비용 제약 증거

```
$ pnpm vitest run adb-backend.test.ts -t "§D 비용 제약"
```
`src/backend/adb-backend.test.ts` "§D 비용 제약 — 연결된 전송마다 ro.serialno를 최대 1회만 조회하고, 열거(devices -l) 호출은 1회다" — 연결 전송 1개 + offline 전송 1개를 섞은 픽스처로 exec 총 호출 3회(목록 1 + osVersion 1 + ro.serialno 1)를 확인하고, `ro.serialno` 호출이 정확히 1건이며 그 인자가 연결된 전송의 serial임을 확인. **PASS**.

`cli/enumeration.test.ts`(REQ-VISION-005, `listAllDevices()` 호출 횟수)는 M3에서 무수정으로 전건(15/15) 통과 — 그룹핑이 `AdbBackend.listDevices()` 내부에서 끝나므로 `registry.listAllDevices()`의 호출 횟수에 영향을 주지 않는다는 §B.4.1의 주장을 실측으로 확인했다.

### 양쪽 경로가 실제로 넓어졌다는 증거 (경로 B 실행 확인)

`router.test.ts`의 두 신규 테스트(AC-READY-017/020 경로 B)는 `devicesCommand`(경로 B)를 `runCli(["devices", "--device", ...], backend)`로 직접 실행한다 — 경로 A(`resolveTargetDevice`)를 거치지 않고 `devices.ts:14`의 자체 필터가 실제로 호출된다. 5차례의 감사가 반복해서 돌아온 지점("경로 B만 여전히 깨진 채 남는다")이 이번에는 두 AC 모두에서 실행됐다.

### Toolchain 실행 결과

```
$ pnpm test        → Test Files 28 passed (28) / Tests 611 passed (611)   (기준선 597 + 신규 14)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

### §E 자체 검증 ($BASE=04fb196, $TOUCHED=src/schema/device-backend.ts)

```
$ grep -n "DeviceConnectionState =" src/schema/device-backend.ts
42:export type DeviceConnectionState = "device" | "offline" | "unauthorized" | "unavailable";   (4값, M2 이후 무변경 — M3은 이 타입을 건드리지 않는다)

$ git diff --name-only 04fb196..HEAD -- src/schema/device-backend.ts   → src/schema/device-backend.ts (① 양성 대조 — 출력 있음, 통과)
$ git diff --name-only 04fb196..HEAD -- src/backend/ime-session-store.ts src/backend/apk-downloader.ts   → (출력 없음, ② 본 검사 통과)

$ pnpm vitest run -t "connectionState"
```

**커밋 후 재확인**(커밋 `978e83e`, `git push origin master` 완료 — `06a4270..978e83e`, `git rev-list --count --left-right origin/master...HEAD` → `0 0`):

```
$ git log --oneline 04fb196..HEAD -- src/schema/device-backend.ts
978e83e feat(SPEC-READY-001): M3 물리 기기 단위 식별 — alternateSerials + 부속 시리얼 대상 조회
457a5af feat(SPEC-READY-001): M2 iOS 가용성 상태 unavailable + unavailableReason 추가   (③-a 양성 대조 — 출력 있음, 통과)

$ git log --oneline 04fb196..HEAD -- src/backend/ime-session-store.ts src/backend/apk-downloader.ts
(출력 없음, ③-b 본 검사 통과)
```

### 확정 열거 도구 재확인 (probe ①·④)

```
$ grep -rln "DeviceInfo" src/ | grep '\.test\.ts$' | sort
src/backend/device-grouping.test.ts
src/backend/registry.test.ts
src/backend/wda-device-list.test.ts
src/cli/commands/scroll.test.ts
src/cli/commands/swipe.test.ts
src/cli/device-targeting.test.ts
src/cli/enumeration.test.ts
src/cli/router.test.ts
src/schema/command-payloads.test.ts   ← 주석 한 줄에만 걸린 오탐(§A.1.1이 예고한 맹점 그대로) — 실제 리터럴 없음, 무수정
src/schema/device-backend.test.ts

$ grep -rn "No backend owns device serial" src/ --include='*.test.ts'
src/cli/device-targeting.test.ts:264   (withOwner() 시나리오 — §B.6.2가 고치라는 대상이 아니므로 무수정, 그대로 통과)
```

### §H 계획 대비 실측 격차 — 계획이 놓친(과잉 예상한) 지점

`plan.md` §A.1은 `device-targeting.test.ts:238`과 `:251` **둘 다** 충돌 문구 변경으로 깨진다고 적었다. 실제로 코드를 읽어 보니 두 줄은 서로 다른 함수를 검사한다 — `:238`은 `resolveTargetDevice`의 `matches.length > 1` 충돌 분기(§B.6.2가 고치라는 대상), `:251`(현재 `:264`)은 `withOwner()`의 "소유 백엔드가 등록돼 있지 않다" 분기(플랫폼에 백엔드가 없다는, 시리얼 충돌과 무관한 별개 사건)다. 두 함수는 우연히 **같은 텍스트**("No backend owns device serial 'X'.")를 내고 있었을 뿐이다. §B.6.2는 충돌 사건의 문구만 고치라고 하므로, `withOwner()`의 문구는 그대로 두는 것이 맞다 — 고쳤다면 시리얼 충돌과 무관한 사건의 사용자 메시지를 근거 없이 바꾸는 것이었다(AC-READY-020의 범위 밖). 실제로 `pnpm test` 실행 결과 `:251`(→`:264`) 단언은 무수정 상태로 그대로 통과했다 — 이번 회차의 실측이 계획의 과잉 예상을 확인했다(§A.1.1이 스스로 "확정 열거는 도구가 한다"고 적은 것과 같은 성격 — 문서 목록은 근사치다).

### 실기기 관측 (참고, M4 미대체)

M3 범위는 순수 함수(`device-grouping.ts`)와 mock exec 기반 unit 테스트로 전건 판정했다 — §F M3이 요구하는 "실기기 없이 판정 가능"을 그대로 따랐다. AC-READY-013(실기기 중복 전송 확인, REQ-READY-006의 실환경 판정)은 M4 소관으로 이월한다(원칙 ①, PASS로 계상하지 않음).

### Gaps (미검증)

- AC-READY-013(실기기 e2e·manual)은 M4 소관 — 여전히 미착수.
- M5 문서 동기화(`SKILL.md`의 `§ Command reference` `devices` 행 등)는 여전히 미착수.
- M4 실기기 검증(AC-READY-019 등)은 여전히 미착수.

### Residual-risk (잔여 위험)

- 그룹핑 규칙(사전순 대표 선택)은 재연결을 가로지르는 안정성을 주지 않는다 — `plan.md` §B.4가 명시적으로 인정하는 한계이며 이 SPEC의 범위 밖이다(spec.md §D.2).
- `collidingSerialMessage()`의 정확한 문구는 이 SPEC이 자유롭게 선택한 것이다(§B.5 — REQ-READY-006 자유도 "없음"으로 닫혀 있지만, AC-READY-020은 코드만 못박고 문구 자체의 정확한 표현은 열어 둔다). `SKILL.md`의 오류 코드 표에 이 문구가 반영돼 있는지는 M5에서 확인한다.

---

## §E.2 Run-phase Evidence — M4

M4는 **관측·기록 전용 마일스톤**이다 — 이 회차는 생산 코드를 수정하지 않았다(`plan.md` §F M4 "§E 자체 검증 전체를 실행한다" + "실기기로 4건을 각각 재현 확인한다").

### 착수 전 사전 점검 (2026-08-05)

```
$ git rev-parse HEAD → ae7c30205e16eccd9d419e27f25023ba887f4997 (M3 커밋 후 재확인 커밋 HEAD, 이 마일스톤의 시작점)
$ git status --short → (SPEC 관련 추적 파일 변경 없음 — 무관한 미추적 하네스/설정 경로만 존재)
```

`plan.md` §E는 `$BASE=04fb196`(M1 이전 기준선)을 계속 쓴다 — M1·M2·M3가 그렇게 기록했고, 이 절도 그 기준을 그대로 따른다.

### 실기기 관측 — 오케스트레이터가 위임 직전 직접 수행

아래 두 관측은 **manager-develop 위임 이전에 오케스트레이터가 직접 실행**했다. 재실행하지 않고 그대로 기록한다 — Android 대상으로 `doctor`를 재실행하면 IME 설치/활성화라는 실제 부작용이 있고(M1에서 이미 한 차례 발생), 반복할 이유가 없다.

#### AC-READY-001 — PATH 밖 adb로 Android 명령이 동작한다

```
$ which adb
adb not found

$ node dist/cli/bin.js devices          # PATH 보정 없음
  Android 항목: 1 → 2beb9d2309037ece(device)

$ node dist/cli/bin.js doctor --device 00008130-001238880C13803A
  adb: {"installed":true,"onPath":false,
        "resolvedPath":"/Users/hatae/Library/Android/sdk/platform-tools/adb",
        "version":"Android Debug Bridge version 1.0.41"}
  adbKeyboard: {"skipped":true,"reason":"Cannot install/enable ADBKeyBoard: Device
        '00008130-001238880C13803A' exists but is not connected
        (connectionState: 'unavailable'). Reconnect or boot it, then retry."}
```

`doctor` 호출은 **iOS 대상**으로 실행됐다(`adbKeyboard.skipped: true`가 그 증거) — Android IME 부작용은 트리거되지 않았다. 그 skip 사유 문구 자체가 `connectionState: 'unavailable'`을 담고 있다 — 이 SPEC이 도입한 상태값이 하위 메시지까지 전파된다는 부수 증거다.

AC-001의 전후 대조 의무가 요구하는 착수 전 관측은 이미 `spec.md` §C.1-①에 기록돼 있다(2026-08-04, `installed:false`이었으나 바이너리는 존재) — 착수 전에 만들어졌으므로 여기서 새로 만들 수 없고, 인용한다.

**판정**: 두 조건(① Android 기기가 목록에 나타난다 ② `doctor`의 `adb.installed`가 `true`다) 모두 성립. **PASS**.

#### AC-READY-019 — 실기기 iOS가 unavailable + 사유로 보고된다

```
CLI 보고:
  iPad Pro (12.9-inch) (5th generation)  unavailable
    reason: disconnected — 터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다
  iPhone 15 Pro Max                      unavailable
    reason: unavailable — 터널을 쓸 수 없다 — 기기 잠금 해제 후 WDA를 다시 띄운다

같은 시점 원본 (xcrun devicectl list devices --json-output):
  iPad Pro (12.9-inch) (5th generation)  tunnelState="disconnected"
  iPhone 15 Pro Max                      tunnelState="unavailable"

대조 (AC-019③):
  iPad   원본="disconnected" 포함=예
  iPhone 원본="unavailable"  포함=예
```

세 조건 모두 성립. ③이 핵심이다 — 두 기기가 **서로 다른** 원본값을 가지며 각 사유가 자기 기기의 값만 포함한다. 이것이 하드코딩된 상수나 엉뚱한 기기의 값이라는 두 실패 가능성을 모두 배제한다. 착수 전 관측은 `spec.md` §C.1-②에 기록돼 있다(두 기기 모두 2026-08-04 `offline` 보고).

**판정**: 세 조건 모두 성립. **PASS**.

### AC-READY-013 — 미관측 (PASS로 계상하지 않음, 원칙 ①)

AC-013은 **같은 물리 Android 기기가 둘 이상의 전송으로 동시에 잡힌 상태**를 전제로 한다(`Given`). 지금 연결된 Android 전송은 USB 하나(`2beb9d2309037ece`)뿐이다 — 두 번째 전송(무선 디버깅 등)을 만들려면 사용자가 폰에서 무선 디버깅을 켜야 하고, 오케스트레이터가 대신 할 수 없는 조작이다. 따라서 이 AC는 **관측하지 않았다** — `acceptance.md` 원칙 ①("관측하지 않은 것을 PASS로 기록하지 않는다")에 따라 PASS·PASS-with-debt·부분 충족 어느 것으로도 표기하지 않는다.

**전후 대조 의무도 이번 회차에서 더는 만족할 수 없다.** AC-013의 착수 전 관측(중복 전송 2개 항목을 먼저 관측)은 M3가 이미 그룹핑 코드를 반영한 뒤라서 지금 새로 만들면 "구현 후" 관측만 남는다 — "구현 전 실패 → 구현 후 성공"의 대조 구조 자체가 이 시점 이후로는 성립하지 않는다.

**남는 요구사항 커버리지 공백**: AC-013은 REQ-READY-004(물리 기기 단위 식별)와 REQ-READY-006(부속 시리얼 대상 조회)의 **유일한 실환경 판정**이다(`acceptance.md` §D "원칙 ④ 충족 현황" 표). 두 요구사항 모두 unit 테스트로는 M3에서 이미 커버됐다 — REQ-004는 AC-010·011·012(unit), REQ-006은 AC-017·020(unit)이 각각 PASS다. 열려 있는 것은 **실제 환경에서의 최종 확인 하나**뿐이다: 실기기의 중복 전송이 실제로 1개 항목으로 합쳐지고, 대표·부속 시리얼 모두로 실제 조작 명령이 통과하는지. 원칙 ④가 "단위 테스트 582개가 전부 통과하는 상태에서 존재했던 결함"을 근거로 실환경 판정을 요구하는 이유가 정확히 이 지점이다 — 픽스처로는 절대 못 보는, 실제 `adb devices -l` 열거 동작·실제 그룹핑 결과의 최종 확인이 비어 있다.

### §E 자체 검증 ($BASE=04fb196, $TOUCHED=src/schema/device-backend.ts)

```
$ pnpm test        → Test Files 28 passed (28) / Tests 611 passed (611)   (M3 기준선과 동일 — M4는 무수정)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0

$ grep -n "DeviceConnectionState =" src/schema/device-backend.ts
42:export type DeviceConnectionState = "device" | "offline" | "unauthorized" | "unavailable";   (4값, M2 이후 무변경)

$ git diff --name-only 04fb196..HEAD -- src/schema/device-backend.ts
src/schema/device-backend.ts   (① 양성 대조 — 출력 있음, 통과)

$ git diff --name-only 04fb196..HEAD -- src/backend/ime-session-store.ts src/backend/apk-downloader.ts
(출력 없음, ② 본 검사 통과)

$ git log --oneline 04fb196..HEAD -- src/schema/device-backend.ts
978e83e feat(SPEC-READY-001): M3 물리 기기 단위 식별 — alternateSerials + 부속 시리얼 대상 조회
457a5af feat(SPEC-READY-001): M2 iOS 가용성 상태 unavailable + unavailableReason 추가   (③-a 양성 대조 — 출력 있음, 통과)

$ git log --oneline 04fb196..HEAD -- src/backend/ime-session-store.ts src/backend/apk-downloader.ts
(출력 없음, ③-b 본 검사 통과)

$ pnpm vitest run -t "connectionState"
Test Files 3 passed | 25 skipped (28) / Tests 3 passed | 608 skipped (611), exit 0
```

M4는 코드를 수정하지 않았으므로 모든 값이 M3 종료 시점과 동일하다 — 회귀 없음을 재확인했다.

### M4 AC PASS/FAIL 매트릭스

| AC | 검증 방식 | 상태 | 근거 |
|---|---|---|---|
| AC-READY-001 | e2e·manual | **PASS** | 위 §실기기 관측 — Android 목록 검출 + `adb.installed:true` 양쪽 성립. 착수 전 실패 관측은 `spec.md` §C.1-①(2026-08-04) 인용 |
| AC-READY-019 | e2e·manual | **PASS** | 위 §실기기 관측 — `unavailable` + 원본 `tunnelState` 포함 + 두 기기의 서로 다른 원본값과 각각 일치. 착수 전 `offline` 관측은 `spec.md` §C.1-②(2026-08-04) 인용 |
| AC-READY-013 | e2e·manual | **미관측** (PASS 아님) | 중복 Android 전송을 만들 두 번째 연결(무선 디버깅 등)이 사용자 조작 필요 — 오케스트레이터가 만들 수 없음. REQ-READY-004·REQ-READY-006의 유일한 실환경 판정이 비어 있음(unit 판정은 M3에서 이미 PASS) |

### Gaps (미검증)

- **AC-READY-013 전체** — 실기기 중복 전송 시나리오, 미관측. REQ-READY-004·REQ-READY-006의 실환경 커버리지가 이 SPEC 전체에서 비어 있는 상태로 남는다.
- M5 문서 동기화(`SKILL.md`의 4개 지점 대조·갱신)는 여전히 미착수.

### Residual-risk (잔여 위험)

- AC-013 미관측은 이 SPEC의 마감을 막지 않지만(원칙 ④의 실환경 판정 요구가 REQ-004·006에 대해 부분적으로만 충족됨을 의미), 나중에 실제 다중 전송 환경에서 그룹핑·대상 조회가 검증되지 않은 채로 배포된다는 뜻이다. 사용자가 향후 무선 디버깅을 활성화해 재현 가능해지면 이 AC를 다시 시도해야 한다.
- §E.3 Run-phase Audit-Ready Signal은 아직 기록하지 않는다 — M5(문서 동기화)가 남아 있으므로 run-phase 완료 신호를 조기에 보내지 않는다. M5 완료 후 §E.3을 기록한다.

---

## §E.2 Run-phase Evidence — M5

M5는 **문서 동기화 전용 마일스톤**이다 — 생산 코드는 수정하지 않고 `.claude/skills/explore-mobile/SKILL.md`만 갱신한다(`plan.md` §F M5).

### 착수 전 사전 점검 (2026-08-05)

```
$ git rev-parse HEAD → 7b32b2a54849ea2344dc335e5760da764b10ca1e (M4 재확인 커밋 HEAD, 이 마일스톤의 시작점)
$ pnpm test → Test Files 28 passed (28) / Tests 611 passed (611)
$ grep -n "doctor reports this accurately" .claude/skills/explore-mobile/SKILL.md → :244 매치("... doctor reports this accurately rather than failing silently.")
$ grep -n "connectionState" .claude/skills/explore-mobile/SKILL.md → :108, :131, :134 (device 상태 서술 + JSON 예시)
$ grep -c "BACKEND_COMMAND_FAILED" .claude/skills/explore-mobile/SKILL.md → 0
```

`plan.md` §E는 `$BASE=04fb196`을 계속 쓴다 — M5는 `$TOUCHED=src/schema/device-backend.ts`를 수정하지 않으므로(문서 파일만 변경) §E 자체 검증은 M2·M3 상태의 재확인이다.

### AC-READY-014 — 네 지점을 코드와 나란히 놓고 대조한 결과

**① § Known traps의 `doctor` 정확성 주장.** 대조 코드: `src/backend/doctor.ts:112-125`(`checkAdbInstalled()`), `src/backend/adb-executor.ts:113-130`(`resolveAdbPath()`). 갱신 전 문서는 *"`doctor` reports this accurately rather than failing silently"*라고만 적어, M1 이전에는 거짓이었던 주장을 아무 근거 없이 남기고 있었다(`spec.md` §C.1-①이 그 반증이다). M1 구현 후 이 주장은 **사실이 되었다** — `installed`/`onPath`/`resolvedPath` 세 필드가 실제로 어디서 찾았는지를 정확히 보고한다. 그 근거(세 필드가 각각 무엇을 뜻하는지)와, PATH 밖에서도 Android 명령이 정상 동작한다는 사실(REQ-READY-001, AC-READY-001 M4 PASS)을 함께 서술하도록 갱신했다. **판정: PASS** — 이전 주장은 참이 되었고, 문서가 그 근거를 드러내도록 고쳤다.

**② § Device targeting의 `connectionState` 설명.** 대조 코드: `src/schema/device-backend.ts:42`(`DeviceConnectionState` — 4값 타입), `src/backend/wda-device-list.ts:66-69`(`mapConnectionState` 3분기), `src/backend/adb-backend.ts:48`(`CONNECTED_STATES`, `unauthorized` 산출 확인), `src/cli/device-targeting.ts:85-87`(`connectedOnly` — `"device"`만 연결로 센다). 갱신 전 문서는 `device`/`offline`/`unavailable` 세 값만 설명했고 **`unauthorized`는 어디에도 없었다** — 타입은 4값인데 서술은 3값이었다. `unauthorized`의 의미(Android 전용, adb는 기기를 보지만 호스트 RSA 키가 아직 승인되지 않음)를 추가하고, 네 값 전부를 "연결로 세지 않는다"는 공통 성질 아래 함께 서술하도록 갱신했다. `--device`가 부속 전송 시리얼도 대상으로 삼는다는 서술(REQ-READY-006, M3)은 갱신 전 문서에 이미 있었다 — 이 절은 그대로 두고, `connectionState` 부분만 고쳤다. **판정: PASS** — 갱신 전 3/4값 서술의 불완전 상태를 4/4값으로 닫았다.

**③ § Command reference의 `doctor` 행.** 대조 코드: `src/backend/doctor.ts:34-42`(`AdbInstalledCheck` — `installed`/`onPath`/`resolvedPath`/`version` 4필드). 갱신 전 행은 `--yes`/`--install`/`--clean` 플래그만 설명하고 무엇을 진단하는지는 "Diagnose the environment"로 뭉뚱그렸다. §B.2가 추가한 `onPath`·`resolvedPath` 두 필드를 행에 명시했다. **판정: PASS**.

**④ `:115-121`의 `devices` JSON 예시** (현재 라인은 이동했으나 대조 대상은 동일). 대조 코드: `src/schema/device-backend.ts:127-162`(`DeviceInfo` 8필드 — M2·M3가 이미 반영). 갱신 전 예시는 **키 개수는 8개로 맞았으나**(M2·M3가 이미 처리) 두 항목 모두 `connectionState:"device"`·`alternateSerials:[]`여서, 이 SPEC이 실제로 추가한 값(`"unavailable"` 상태, 실제로 채워진 `alternateSerials`)이 예시 어디에도 나타나지 않았다 — Skill이 실제로 마주칠 형태를 예시가 한 번도 보여주지 못하는 상태였다. Android 항목에는 `spec.md` §C.1-③ 실측 그대로의 `alternateSerials`를(대표/부속 시리얼 실측값), iOS 항목에는 `unavailable` + `unavailableReason`을(`plan.md` §B.3.1 매핑표의 `"unavailable"` 행 그대로 — M4에서 실기기로 관측된 문구와 일치) 반영했다. 키 개수는 8개로 무변경. **판정: PASS** — 갱신 전 새 값 미반영 → 갱신 후 이 SPEC이 추가한 두 값 모두 예시에 반영됨.

**종합 판정: PASS.** 네 지점 모두 코드와 대조해 실제로 갱신했거나(①③④), 이미 있던 부분은 유지하고 빠진 부분만 보강했다(②).

### AC-READY-015 — 계약 테스트 재확인 (M5는 무수정)

```
$ grep -n "keyof DeviceInfo" src/schema/device-backend.test.ts → :32 매치, toHaveLength(8) — M3에서 이미 갱신 완료, M5는 무수정
$ pnpm test → Test Files 28 passed (28) / Tests 611 passed (611), exit 0
```
**판정: PASS**(M3에서 마감된 것을 M5가 재확인).

### `BACKEND_COMMAND_FAILED` 결정

`plan.md` §B.6.2가 3차 감사에서 확인한 사실 — 이 코드는 `SKILL.md`에 전혀 등장하지 않았다(§C.1-① grep 0건). 코드를 읽어 확인한 결과 `BACKEND_COMMAND_FAILED`는 `src/cli/commands/types.ts:69`(`backendFailure()`)의 **일반 백엔드 실패 기본값**이다 — WDA 4종 특정 오류(`WDA_UNREACHABLE` 등)로 분류되지 않는 모든 백엔드 예외가 이 코드로 떨어지고, 이 SPEC이 추가한 부속 시리얼 충돌 분기(`device-targeting.ts:176-183`의 경로 A, `devices.ts:33-42`의 경로 B — AC-READY-020)도 이 코드를 쓴다. `SKILL.md`의 오류 코드 표는 스스로 "Codes you will actually meet"를 표방하는데, 이 코드는 정확히 그 정의(호출자가 실제로 마주칠 코드)에 해당한다 — **표에 추가하기로 결정**했다. 문구는 충돌 사건 하나로 좁히지 않고 "일반 백엔드 실패, 그중 하나로 시리얼 충돌"이라고 적어, 실제 코드가 이 값을 반환하는 모든 경로(집합 하나가 아니라 여럿)를 정직하게 반영했다.

### Toolchain 실행 결과

```
$ pnpm test        → Test Files 28 passed (28) / Tests 611 passed (611)   (M4와 동일 — M5는 문서만 수정)
$ pnpm typecheck   → exit 0
$ pnpm build       → exit 0
```

### 변경 파일

```
$ git status --short
 M .claude/skills/explore-mobile/SKILL.md
```
그 외 작업 트리의 미추적 파일들은 이 SPEC과 무관한 하네스/설정 경로다(§B4 — 무수정, 스테이징 대상 아님).

### §E 자체 검증 ($BASE=04fb196, $TOUCHED=src/schema/device-backend.ts)

```
$ grep -n "DeviceConnectionState =" src/schema/device-backend.ts
42:export type DeviceConnectionState = "device" | "offline" | "unauthorized" | "unavailable";   (4값, M2 이후 무변경 — M5는 이 타입을 건드리지 않는다)
```
M5는 `$TOUCHED` 파일을 수정하지 않으므로 ①(양성 대조)·③-a는 M2·M3 커밋을 그대로 가리키는 M4 절의 재확인이며, M5 자신의 신규 변경은 문서 파일(`$TOUCHED` 범위 밖)이다.

### Gaps (미검증)

- **AC-READY-013**(e2e·manual, REQ-READY-004·REQ-READY-006의 유일한 실환경 판정)은 M4에서 이미 미관측으로 마감됐다 — M5는 이를 재시도하지 않는다(원칙 ①). unit 판정(REQ-004: AC-010·011·012, REQ-006: AC-017·020)은 M3에서 전부 PASS다.

### Residual-risk (잔여 위험)

- `UNAVAILABLE_REASON_GUIDANCE` 매핑표(§B.3.1)는 알려진 `tunnelState` 값 3개만 다룬다 — 새 값이 나타나면 `SKILL.md` JSON 예시의 정확한 문구와 그 시점의 실제 관측값이 달라질 수 있다. 규칙 2(원문만 싣는다)가 코드 쪽은 안전하게 흡수하므로 계약이 깨지지는 않지만, 문서 예시의 문구 자체는 시점에 종속적이다.
- `collidingSerialMessage()`의 정확한 메시지 문자열(§B.5가 자유도로 남긴 부분)은 `SKILL.md`에 축자로 옮기지 않았다 — 오류 코드와 그 코드가 발생하는 사건의 종류만 명시했다. 문구까지 문서화하면 메시지가 바뀔 때마다 `SKILL.md`도 함께 고쳐야 하는 결합이 생기므로, 코드가 확정한 계약(오류 코드)만 문서화하고 열려 있는 자유도(정확한 문구)는 문서화하지 않았다.

---

## §E.3 Run-phase Audit-Ready Signal

```
run_complete_at: 2026-08-05
run_commit_sha: 8573f62   (M5 커밋 — 백필 완료)
run_status: complete-with-gap
ac_pass_count: 19
ac_fail_count: 0
ac_unobserved_count: 1   (AC-READY-013)
preserve_list_post_run_count: 2   (src/backend/ime-session-store.ts, src/backend/apk-downloader.ts — 전 마일스톤에 걸쳐 무수정 확인됨)
l44_pre_commit_fetch: "git fetch origin master" → 갱신 있음, "git rev-list --count --left-right origin/master...HEAD" → 0 0 (동기화 상태, 발산 없음)
l44_post_push_fetch: "git push origin master" 성공(7b32b2a..8573f62) 후 "git fetch origin master" + "git rev-list --count --left-right origin/master...HEAD" → 0 0 (재동기화 확인, 발산 없음)
new_warnings_or_lints_introduced: 0   (M5는 문서 파일만 수정 — lint/typecheck 대상 코드 무변경, pnpm typecheck exit 0)
cross_platform_build.linux: 해당 없음 (이 SPEC은 GOOS 교차 빌드 대상이 아니다 — TypeScript/Node 프로젝트, `pnpm build`가 유일한 빌드 검증)
cross_platform_build.macos: pnpm build exit 0 (이 호스트에서 실행)
cross_platform_build.windows: 미검증 (호스트 미보유 — Windows 전용 분기 없음, `path.join`/`os.homedir()` 등 Node 표준 API만 사용)
total_run_phase_files: 22   (`git diff --name-only 04fb196..HEAD | wc -l` 실측값 — 이 progress.md 자신을 포함한다. 아래 절 참조)
m1_to_mN_commit_strategy: per-milestone separate commits — M1(295ec89) · M2(457a5af) · M3(978e83e) · M4(7b32b2a, 관측 전용·코드 무변경) · M5(이 커밋, 문서 전용). 마일스톤 경계마다 커밋 + push, 사용자가 마일스톤 단위 확인을 선택했다(§F Phase 4 Mode Selection 기록).
```

### 최종 20-AC 롤업 (전체 SPEC)

| AC ID | REQ | 검증 방식 | 최종 상태 | 마감 마일스톤 | 근거 |
|---|---|---|---|---|---|
| AC-READY-001 | REQ-001 | e2e·manual | **PASS** | M4 | 실기기 Android 목록 검출 + `adb.installed:true` (§E.2 M4) |
| AC-READY-002 | REQ-001 | unit(mock) | **PASS** | M1 | `adb-executor.test.ts` "AC-READY-002" |
| AC-READY-003 | REQ-001 | unit(mock) | **PASS** | M1 | `adb-executor.test.ts` "AC-READY-003" (5테스트) |
| AC-READY-004 | REQ-002 | unit(mock) | **PASS** | M1 | `doctor.test.ts` "installed=true..." |
| AC-READY-005 | REQ-002 | unit(mock) | **PASS** | M1 | `doctor.test.ts` "installed=false..." |
| AC-READY-006 | REQ-003 | unit | **PASS** | M2 | `wda-device-list.test.ts` "unavailable 상태 + 사유" |
| AC-READY-007 | REQ-003 | unit | **PASS** | M2 | 같은 describe, 항목 부재 → offline |
| AC-READY-008 | REQ-003 | unit | **PASS** | M2 | 같은 describe, connected → device |
| AC-READY-009 | REQ-003 | unit | **PASS** | M2→M3 | M2가 3상태, M3가 `unauthorized` 교차 비교로 마감 |
| AC-READY-010 | REQ-004 | unit | **PASS** | M3 | `device-grouping.test.ts` + `adb-backend.test.ts` |
| AC-READY-011 | REQ-004 | unit | **PASS** | M3 | `device-grouping.test.ts` "AC-READY-011" |
| AC-READY-012 | REQ-004 | unit | **PASS** | M3 | `device-grouping.test.ts` + `adb-backend.test.ts` |
| AC-READY-013 | REQ-004, REQ-006 | e2e·manual | **미관측** | M4 | 두 번째 Android 전송 확보 불가(사용자 조작 필요) — PASS로 계상 안 함 |
| AC-READY-014 | REQ-005 | doc-review | **PASS** | M5 | 위 §AC-READY-014 상세 |
| AC-READY-015 | REQ-005 | unit | **PASS** | M2→M3 | `device-backend.test.ts:32-43`, 6→7→8 |
| AC-READY-016 | REQ-003 | unit | **PASS** | M2 | 상수표 정확 일치 |
| AC-READY-017 | REQ-006 | unit | **PASS** | M3 | 경로 A·B 양쪽 |
| AC-READY-018 | REQ-002 | unit(실FS) | **PASS** | M1 | `doctor.test.ts` "real filesystem + real env vars" |
| AC-READY-019 | REQ-003 | e2e·manual | **PASS** | M4 | 실기기 iOS 2대, 원본 대조 §실기기 관측 |
| AC-READY-020 | REQ-006 | unit | **PASS** | M3 | 경로 A·B 양쪽, `BACKEND_COMMAND_FAILED` |

**집계: PASS 19 · 미관측 1(AC-READY-013) · FAIL 0.** 모든 PASS는 위 표가 가리키는 마일스톤 절의 실제 실행 출력에 귀속된다(`verification-claim-integrity.md` §2 baseline-attribution). AC-READY-013 하나는 REQ-READY-004·REQ-READY-006의 실환경 판정을 비운 채 남기지만, 두 요구사항 모두 unit 판정(AC-010·011·012·017·020)은 전부 PASS다 — 미관측은 "unit으로 커버되지 않은 부분"이 아니라 "unit이 이미 증명한 것의 실환경 재확인"이 비어 있다는 뜻이다.

### run-phase 전체 변경 파일 (22개, `$BASE=04fb196` 대비, 실측)

```
$ git diff --name-only 04fb196..HEAD | wc -l
22
$ git diff --name-only 04fb196..HEAD
.claude/skills/explore-mobile/SKILL.md
.moai/specs/SPEC-READY-001/progress.md
src/backend/adb-backend.test.ts
src/backend/adb-backend.ts
src/backend/adb-executor.test.ts
src/backend/adb-executor.ts
src/backend/device-grouping.test.ts
src/backend/device-grouping.ts
src/backend/doctor.test.ts
src/backend/doctor.ts
src/backend/registry.test.ts
src/backend/wda-device-list.test.ts
src/backend/wda-device-list.ts
src/cli/commands/devices.ts
src/cli/commands/scroll.test.ts
src/cli/commands/swipe.test.ts
src/cli/device-targeting.test.ts
src/cli/device-targeting.ts
src/cli/enumeration.test.ts
src/cli/router.test.ts
src/schema/device-backend.test.ts
src/schema/device-backend.ts
```
생산 코드 8개(`device-grouping.ts` 신설 포함) + 테스트 파일 12개(`device-grouping.test.ts` 신설 포함, 나머지는 M2·M3의 "고정 지점 처리 결과"가 개별 마일스톤 절에서 근거를 남긴 팩토리/리터럴 갱신) + 문서 1개(`SKILL.md`) + 이 `progress.md` 자신으로 구성된다.

---

## §G 상태 전이 백필 기록

**무엇이 빠졌었는가.** `spec.md`·`plan.md`·`acceptance.md` 세 문서의 frontmatter `status`가 M1 커밋(`295ec89`) 이후로도 `draft`로 남아 있었다. `.claude/rules/moai/development/spec-frontmatter-schema.md` § Status Transition Ownership Matrix에 따르면 `draft → in-progress` 전이는 **manager-develop이 M1 커밋 시점에** 수행하는 것이 정규 지점이다 — run-phase가 이미 M1~M5 다섯 마일스톤을 전부 완료하고 `master`에 푸시까지 마친 뒤(이 문서 §E.3 참조, `run_status: complete-with-gap`, PASS 19 · FAIL 0) 세 문서만 `draft`인 채로 남아 있는 것은 그 정규 지점에서 프론트매터 갱신이 누락된 결과다.

**왜 지금 바로잡는가.** sync-phase는 `in-progress → implemented → completed` 전이를 전제로 하며, `draft`에서 곧바로 그 전이를 시작하면 상태 이력이 실제 커밋 이력과 어긋난다. 또한 상태·git 이력 일관성 검사(`OwnershipTransitionRule` 계열)가 이 어긋남을 결함으로 표시할 수 있다. 이 기록은 그 왜곡을 남기지 않기 위해, 전이가 **정규 지점(M1 커밋, `295ec89`, 2026-08-05)이 아니라 사후에** 이루어졌음을 명시적으로 적는다.

**무엇을 했는가.** `spec.md`·`plan.md`·`acceptance.md` 세 문서의 frontmatter만 `status: draft` → `status: in-progress`로 갱신했다(`updated:`는 이미 오늘 날짜 `2026-08-05`였으므로 추가 변경 없음). 본문(§A~§H 등 body content)은 전혀 손대지 않았다 — 이는 이 SPEC Artifact Ownership 경계가 여전히 유효함을 확인한다. `implemented`·`completed`로의 전이는 여기서 하지 않는다 — 그 전이는 sync-phase에서 manager-docs가 단일 sync 커밋으로 수행한다(같은 매트릭스, `in-progress → implemented → completed` 행).

**정규 소유자·전이 요약.**

| 항목 | 값 |
|---|---|
| 전이 | `draft → in-progress` |
| 정규 소유자 | manager-develop (M1 커밋 시점) |
| 정규 지점(놓친 지점) | `295ec89` — `feat(SPEC-READY-001): M1 adb 경로 해석 + 구별 보고` |
| 백필 수행일 | 2026-08-05 |
| 대상 파일 | `spec.md`, `plan.md`, `acceptance.md` (frontmatter만) |
| 근거 | `.claude/rules/moai/development/spec-frontmatter-schema.md` § Status Transition Ownership Matrix |

---

## §E.4 Sync-phase Audit-Ready Signal

```
sync_complete_at: 2026-08-05
sync_commit_sha: pending-backfill-SPEC-READY-001-sync   (이 커밋 자신의 해시는 커밋이 만들어지기 전에는 알 수 없다 — 후속 커밋에서 백필한다. spec-frontmatter-schema.md의 SHA placeholder backfill exemption(D3)에 따른 정규 패턴이다)
sync_status: complete-with-gap   (§E.3의 run_status를 이어받는다 — AC-READY-013 1건 미관측, PASS 19 · FAIL 0 · 미관측 1)
changelog_entry_position: CHANGELOG.md [Unreleased] 섹션 끝, "### Changed" 새 항목(SPEC-READY-001 전용) — 아래 §sync 산출물 참조
frontmatter_status_transitions.spec_md: in-progress → completed
frontmatter_status_transitions.plan_md: in-progress → completed
frontmatter_status_transitions.acceptance_md: in-progress → completed
frontmatter_status_transitions.progress_md: in-progress → completed
```

### sync 산출물

- `CHANGELOG.md` `[Unreleased]` 섹션 끝에 SPEC-READY-001 전용 `### Changed` 항목 추가(breaking-change 4건: `DeviceInfo` 6→8키, `DeviceConnectionState` 3→4값, `doctor`의 `adb.installed` 의미 변경 + `onPath`/`resolvedPath` 신설, `--device`의 부속 시리얼 해석). 사전에 `grep -c 'SPEC-READY-001' CHANGELOG.md` → `0` 확인 후 추가(중복 없음).
- `README.md` — `devices`·`doctor` 사용 예의 JSON이 갱신 전 6키/구형태였다(§C.1 관측). 8키 `DeviceInfo`(`unavailableReason`·`alternateSerials` 포함)와 `doctor.adb`의 `onPath`/`resolvedPath`를 반영해 갱신. `기기 지정 규칙` 절은 `"device"`만 연결로 센다는 서술이 이미 4값 타입과 일치했으므로 손대지 않았다.
- `SKILL.md`는 M5(run-phase)가 이미 4개 지점을 갱신·확인 완료(AC-READY-014, 위 §E.2 M5) — sync-phase에서 추가 변경 없음.

### Gaps (미검증)

- `sync_commit_sha`는 이 커밋이 실제로 만들어진 뒤에만 알 수 있다 — placeholder 상태이며 후속 백필 커밋이 채운다(D3 예외 패턴, `SPEC-IMESTATE-001`이 같은 패턴을 쓴 선례가 `git log`에 있다).
- AC-READY-013(미관측)은 sync-phase에서도 재시도하지 않는다 — run-phase M4가 이미 원칙 ①에 따라 마감한 판정이고, sync-phase의 소관은 문서 동기화이지 재검증이 아니다.

### Residual-risk (잔여 위험)

- CHANGELOG의 breaking-change 서술은 JSON 소비자(다른 스크립트·CI·서드파티)가 `DeviceInfo`/`DeviceConnectionState`/`doctor.adb`/`--device`를 어떻게 소비하는지에 대한 이 저장소 밖의 정보가 없다 — 영향 범위 판단은 소비자 쪽 책임으로 남긴다.
