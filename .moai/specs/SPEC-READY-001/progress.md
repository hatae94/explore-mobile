---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — 진행 기록"
version: "0.5.2"
status: draft
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

run-phase 진입 시 오케스트레이터가 기록한다. 계획 단계에서는 비어 있다.

---

> **run-phase 증거 절은 이 파일에 아직 없다.** `plan.md` §C 행 0·1이 기록 대상으로 지정한 기준 SHA와 테스트 개수 실측값, 그리고 `plan.md` §E가 `$BASE`로 참조하는 값은 모두 그 절에 들어간다. 해당 절의 생성과 기입은 **run-phase 담당(manager-develop)의 소관**이며, 계획 단계에서 빈 껍데기로 만들어 두지 않는다 — 빈 절이 있으면 "실행 증거가 있다"는 잘못된 신호가 된다.
>
> **run-phase 착수 시 첫 두 동작**(순서 고정):
> 1. `git rev-parse HEAD` → 그 값을 run-phase 증거 절에 기록하고 이후 `$BASE`로 쓴다.
> 2. `pnpm test` → 통과 개수를 같은 절에 기록한다. `plan.md` §C 행 1이 개수를 계획서에 하드코딩하지 말라고 한 이유가 이것이다 — 기준선은 그때 측정한 값이지 문서에 적힌 값이 아니다.
>
> `$BASE`가 비어 있으면 `plan.md` §E의 검사 ③이 조용히 종료해 **"출력 없음 = 위반 없음"으로 읽히며 공허하게 통과한다.** §E ③-a 양성 대조가 그 경우를 잡도록 붙어 있으나, 애초에 두 값을 먼저 기록하는 것이 순서다.
