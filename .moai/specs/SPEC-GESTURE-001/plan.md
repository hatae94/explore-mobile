---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 구현 계획"
version: "0.3.0"
status: in-progress
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 구현 계획 — SPEC-GESTURE-001

> 마일스톤은 **번복 가능성 내림차순**. 가장 바뀔 확률이 높은 결정(인터페이스 확장)을 앞에 둔다.

## §A. 컨텍스트

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 선행: SPEC-ANDROID-001 / SPEC-IOS-001 / SPEC-WEBVIEW-001(0.2.0) 모두 completed
- 기준선: 테스트 438건(26파일), typecheck·build exit 0, 커버리지 92.95%
- **선행 스파이크 완료**: iOS swipe 계약, `scrollIntoView` 성립, 화면 크기 파생 가능성을 실측(spec.md §C.1)

### A.5 PRESERVE (수정 금지)

- `src/normalize/uiautomator.ts`, `src/normalize/idb.ts`, `src/normalize/webdom.ts` — 정규화 계약 불변
  - 특히 `webdom.ts:175`(크기 0·음수 사각형 제거)는 REQ-GEST-WEB-001 트리거의 전제 불변식이다. 손대지 않는다.
- `src/webview/inspector-client.ts`, `src/webview/proxy-service.ts`, `src/webview/calibration.ts` — 0.2.0에서 막 개정됨
- `DeviceBackend`의 **기존 8개 메서드** — 시그니처·동작 불변(가법 확장만)

### A.6 수정 대상 (PRESERVE 아님 — 명시)

PRESERVE 목록에 없으면서 실제로 손대는 파일. 여기 없는 파일을 건드리면 범위 이탈이다.

| 파일 | 마일스톤 | 성격 |
|------|----------|------|
| `src/schema/device-backend.ts` | M1 | `swipe` 추가 + `@MX:ANCHOR` "8-method" 문구 갱신 |
| `src/backend/adb-backend.ts` | M1 | `swipe` 구현(ms 통과) + 헤더 "8 methods" 문구 갱신 |
| `src/backend/idb-backend.ts` | M1 | `swipe` 구현(**ms→초 환산**) + 헤더 "8-method" 문구 2곳 갱신 |
| `src/backend/registry.ts` | M1 | `swipe` 파사드 위임 |
| `src/schema/device-backend.test.ts` / `src/backend/registry.test.ts` / `src/cli/router.test.ts` / `src/cli/commands/web-support.test.ts` | M1 | 테스트 더블 9번째 메서드 보강 |
| `src/cli/args.ts` | M2·M3 | `duration`(M2) / `amount`(M3) 옵션 추가 |
| `src/cli/validators.ts` | M3 | 0..1 비율 파서 추가 |
| `src/cli/router.ts` + `src/cli/commands/` 신규 | M2·M3 | `swipe` / `scroll` 명령 |
| `src/webview/coordinates.ts` | M4 | 모듈 주석 갱신(화면 밖 도달이 더는 SPEC-04가 아님) |
| `src/cli/commands/web-support.ts` | M4 | 뷰포트 밖 분기 추가 |

## §B. 알려진 이슈 / 리스크

### B.1 Android 미실측 [최고 리스크]

`adb shell input swipe`는 **문서 근거뿐**이고 기기 확인이 없다. 더 정확히는 이 머신에 **`adb`가 설치조차 돼 있지 않다**(`command -v adb` → `command not found`, spec.md §C.2). 이 프로젝트는 문서 가정이 틀렸던 전례가 있다 — SPEC-IOS-001에서 idb 가정 3건이 전부 틀렸다.

**대응**: Android 구현은 argv 구성까지만 단위 검증하고, AC-GEST-006을 **PARTIAL로 명시 마감**한다. "아마 될 것"이라고 쓰지 않는다.

**승격 조건(둘 다 필요)**: (a) `adb` 설치, (b) 기기 연결. 하나만으로는 승격하지 못한다. 그리고 spec.md §C.1-⑥(adb swipe 문법·ms 단위)은 **로컬 수단으로는 미실측에서 올릴 방법이 아예 없다** — 도구가 없으니 `--help`조차 못 본다. 이 SPEC이 completed로 마감돼도 ⑥은 미실측으로 남는다.

### B.2 `scroll` 방향 의미 [중간, 그러나 조용히 틀리기 쉬움]

`scroll down`이 "손가락을 아래로"인지 "내용을 아래로"인지는 사람마다 다르게 읽는다. 반대로 구현하면 **오류 없이 반대로 동작**한다.

**대응**: `scroll down` = "아래 내용을 본다"(손가락은 위로)로 확정하고, 응답에 방향과 실제 좌표를 함께 실어 호출자가 즉시 확인할 수 있게 한다. 테스트에 좌표 부등호를 명시적으로 박는다(AC-GEST-007). 응답 표기 자체는 별도 요구사항(REQ-GEST-SCROLL-005)과 별도 AC(AC-GEST-016)로 못박는다 — 좌표만 검증하면 표기 누락이 통과해 버린다.

### B.3 화면 크기 파생의 Android 쪽 근거 [중간]

루트 노드 bounds가 화면 전체라는 것은 iOS는 실측, **Android는 픽스처 근거뿐**이다(§C.1-④).

**대응**: 크기를 못 믿겠으면 추측하지 않고 `SCREEN_SIZE_UNKNOWN`으로 거부한다(REQ-GEST-SCROLL-004). 잘못된 좌표로 스와이프하는 것보다 거부가 낫다 — 제스처는 되돌릴 수 없다.

### B.4 `tap --web` 회귀 위험 [중간]

0.2.0에서 막 고친 경로를 다시 건드린다. 화면 안 요소의 기존 동작이 바뀌면 안 된다.

**대응**: 화면 **안** 요소는 코드 경로가 바뀌지 않도록 분기를 뒤에 붙인다. 기존 웹 테스트 전건 통과를 게이트로 삼는다.

### B.5 웹 페이지 위에서 iOS `dump`가 화면 크기를 못 준다 [높음 — 대표 사용례를 직격]

Safari가 전면일 때 `idb ui describe-all`은 **브라우저 크롬 6개만** 돌려주고 페이지 내용은 0개다(`src/backend/idb-backend.ts:156-159` @MX:WARN, spec.md §C.1-⑧). REQ-GEST-SCROLL-002는 화면 크기를 바로 그 `dump` 결과에서 파생한다.

그런데 **AC-GEST-011(iOS 실기기 스크롤)은 "긴 웹 페이지"에서 도는 시나리오**다. 크롬 6개 중 화면 전체 크기를 가진 항목이 없으면 `scroll`은 규칙대로 `SCREEN_SIZE_UNKNOWN`을 반환한다 — 즉 **본 SPEC의 대표 사용례가 설계대로 거부될 수 있다.**

**대응**: M3 설계에 들어가기 **전에** §C 사전 점검에서 Safari를 띄운 채 `dump`를 떠 **witness 요소**(bounds가 정확히 `{0,0,W,H}`인 최상위 항목)의 유무를 실측한다. 결과에 따라 네 갈래다.

1. witness가 있다 → 현행 설계 그대로.
2. `dump`가 빈 배열이거나 모든 bounds가 0 → 퇴화 검사(REQ-GEST-SCROLL-002 ①)에서 걸린다. `SCREEN_SIZE_UNKNOWN`.
3. 판정 불가 → 블로커로 올린다. 추측해서 진행하지 않는다.
4. **크기는 나오지만 witness가 없다 → 크롬-only 케이스. 여기서는 이것이 예외가 아니라 예상 결과다.** 조각들의 외접 상자(예: 402x120)는 양수이고 비퇴화라 ①만으로는 통과하므로, **막는 것은 witness 검증(REQ-GEST-SCROLL-002 ②) 하나뿐이다.** 이 갈래에서 `SCREEN_SIZE_UNKNOWN`이 나오는 것은 설계대로다. 웹 페이지 스크롤은 `swipe`(좌표 직접 지정)로 검증하고, **크기를 추측하는 폴백은 넣지 않는다**(REQ-GEST-SCROLL-004 불변, spec.md §D "화면 크기 추측 폴백").

> 0.2.0의 이 항목은 "witness 없음 → 퇴화 검사가 잡아준다"고 적었는데 **그 전제가 틀렸다.** max-extent는 크기 0이 아닌 요소가 하나라도 있으면 언제나 양수를 낸다. 0.1.0의 "루트 요소" 규칙은 최소한 아무것도 못 돌려줄 수 있었지만, max-extent는 사실상 항상 무언가를 돌려준다 — 결정성을 얻는 대가로 조용한 오답 가능성이 **커졌다.** witness 요건이 그 대가를 되갚는 부분이다.

이 점검을 M3 뒤로 미루면 M3 설계 전체가 헛돌 수 있다.

## §C. 사전 점검 (Pre-flight)

```bash
pnpm vitest run                          # 기준선 438
pnpm typecheck && pnpm build             # exit 0
xcrun simctl list devices booted         # 시뮬레이터 (iPhone 17 Pro / iOS 26.0)
command -v adb || echo "adb absent → AC-GEST-006 PARTIAL, spec.md §C.1-⑥ 미실측 고정"
idb ui swipe --help                      # 계약 재확인 (--duration 단위 주의)
grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts   # 기준선 8 → M1 후 9
```

`adb`가 없으면 `adb devices`는 그 자체로 오류가 난다. 위 `command -v` 형태는 부재를 **판정 결과**로 기록하고 넘어간다.

**M3 설계 전 필수(B.5)** — 이건 위 목록과 달리 순서가 강제된다.

```bash
# Safari로 긴 페이지를 띄운 뒤:
node dist/bin.js dump --device D0B3A18C-E485-4E7C-A25E-504BF4CA6163
# 확인 사항: 최상위 항목 수 / 그중 화면 전체(≈402x874) 크기를 가진 항목의 존재 여부
# → B.5의 1·2·3 갈래 중 어디인지 여기서 확정한다
```

## §D. 제약

- `DeviceBackend` 기존 8메서드 변경 금지 — `swipe` 추가만
- A.6에 없는 파일 수정 금지
- `--no-verify`, `--amend`, force-push 금지
- Conventional Commits + `🗿 MoAI` 트레일러
- 관측하지 않은 것을 PASS로 쓰지 않는다

## §E. 자체 검증

마일스톤마다: AC PASS/FAIL 매트릭스 + 실제 명령 출력, `vitest`/`typecheck`/`build` 결과, 실기기 확인 가능 항목은 관측 결과.

## §F. 마일스톤 (번복 가능성 내림차순)

### M1 — `DeviceBackend.swipe` 인터페이스 + 구현체 3개 [최고 변경 확률]

인터페이스 형태가 바뀌면 나머지가 전부 따라 바뀐다. 먼저 확정한다.

**산출물**

1. `src/schema/device-backend.ts` — `swipe(serial, from, to, options?)` 추가.
2. `src/backend/adb-backend.ts` — `["-s", serial, "shell", "input", "swipe", ...]`. `--duration`은 **ms 그대로 통과**.
3. `src/backend/idb-backend.ts` — `["ui", "swipe", "--udid", serial, ...]`. `--duration`은 **ms → 초(float) 환산 후** argv에 넣는다(spec.md §C.1-⑦). 이 저장소는 이미 초 의미에 의존한다(`idb-backend.ts:100` `MODIFIER_HOLD_SECONDS = 2`를 `--duration 2`로 전달).
4. **`src/backend/registry.ts` — `swipe` 파사드 위임.** `BackendRegistry implements DeviceBackend`(`registry.ts:40`)이고 `bin.ts`가 `runCli`에 넘기는 것이 이 파사드다. 빠뜨리면 (a) 타입 체크가 깨지고 (b) `swipe`가 프로덕션 경로에서 기기에 도달하지 못한다. 형태는 `stopApp`(`registry.ts:160-162`)과 동일한 resolve-then-delegate.
5. **테스트 더블 보강 — 4개 파일 7개 지점.** 9번째 메서드가 생기면 전부 타입 체크가 깨진다:
   - `src/schema/device-backend.test.ts:12` — `Record<keyof DeviceBackend, true>` + `toHaveLength(8)` → 9. 이건 **의도된 트립와이어**(주석이 "if DeviceBackend grows a 9th"라고 명시)다. 결함이 아니라 설계된 알림이므로 끄지 말고 갱신한다. **(1지점)**
   - `src/cli/router.test.ts:35` `createMockIosBackend()`, `:68` `createMockBackend()`, `:345`·`:424` 객체 리터럴 **(4지점)**
   - `src/backend/registry.test.ts:31` `mockBackend()` **(1지점)**
   - `src/cli/commands/web-support.test.ts:88` `satisfies DeviceBackend` **(1지점)**

   **제외 — 세는 대상이 아니다**: `registry.test.ts:156`·`:164`·`:175`·`:186`·`:204`와 `router.test.ts:365`·`:440`의 `const registry: DeviceBackend = new BackendRegistry(...)`는 객체 리터럴이 아니라 **클래스 인스턴스**다. 산출물 4(`registry.ts`에 `swipe` 추가)가 끝나면 자동으로 컴파일되므로 손댈 것이 없다. 이 7줄을 더해 "12지점"이라고 세면 AC-GEST-004가 틀린 수를 검증하게 된다.
6. **"8-method" 문구 3곳 갱신 → 9**: `src/schema/device-backend.ts:16`("this exact 8-method surface"), `src/backend/idb-backend.ts:5`("Implements all 8 methods"), `src/backend/idb-backend.ts:25`("the exact same 8-method interface"). `@MX:ANCHOR` 본문이므로 갱신하지 않으면 앵커가 거짓이 된다.
7. argv 구성 단위 테스트. iOS는 시뮬레이터로 즉시 실측(AC-GEST-005), Android는 argv까지만(AC-GEST-006 PARTIAL).

**왜 1번인가**: 9번째 메서드의 시그니처는 되돌리기 비싸다. `from`/`to`를 객체로 받을지 좌표 4개로 받을지, 지속시간 단위를 어느 계층에서 환산할지 같은 결정이 여기서 굳는다.

### M2 — `swipe` CLI 명령 [높음 · 사용자 대면]

**산출물**

1. `src/cli/args.ts` — `duration: { type: "string" }` 옵션 추가. 현재 선언 목록(`args.ts:87-99`)에 `duration`이 **없어서** `--duration`은 지금 그대로면 미인식 플래그로 throw → `INVALID_ARGS`가 된다(`args.ts:79-81` → `router.ts:81-83`).
2. `swipe <x1> <y1> <x2> <y2> [--duration <ms>]` 라우터 배선 + 좌표 검증(`INVALID_COORDINATES`). REQ-GEST-SWIPE-001~003.
3. **`--duration` 검증(REQ-GEST-SWIPE-005) — 음이 아닌 정수가 아니면 `INVALID_DURATION`.** 검증은 M1이 넣은 ms → 초 환산 **앞**에 둔다. 뒤에 두면 `Number("abc")`가 `NaN`이 되어 `NaN/1000 = NaN`이 그대로 argv에 실린다. `--amount`(M3)와 좌표(위 2번)와 **같은 구조**로 짠다 — 세 옵션의 거부 경로가 서로 다르게 생기면 안 된다.

**음수 좌표 처리 — 결정: AC를 좁힌다(전처리 추가 안 함).**

`swipe 100 -50 100 200`의 `-50`은 `node:util.parseArgs`가 **미인식 옵션**으로 먹고 핸들러 진입 전에 throw한다 → `INVALID_ARGS`. 따라서 AC-GEST-003을 이렇게 나눈다.

- 비정수·좌표 개수 불일치 → `INVALID_COORDINATES`
- 음수 **리터럴** → `INVALID_ARGS`

전처리(예: `normalizeWebFlagArgv`(`args.ts:58-71`) 같은 argv 정규화 단계 추가)를 넣지 않는 이유 한 줄: 이미 graceful하고 이미 무동작인 오류를 코드만 바꿔 다른 코드로 재라우팅하는 일이라, 모든 명령이 공유하는 argv 경로를 건드릴 값어치가 없다. **"무동작" 보장은 두 갈래 모두에서 동일하게 유지된다.**

### M3 — `scroll` 편의 계층 [중간]

> **선행 조건**: §C의 B.5 사전 점검(Safari 전면 `dump`)을 **먼저** 끝낸다.

**산출물**

1. `src/cli/args.ts` — `amount: { type: "string" }` 옵션 추가.
2. **`src/cli/validators.ts` — 비율 파서 추가(0 초과 1 이하).** 기존 `parseCoordinate`/`parseIndex`는 둘 다 `parseNonNegativeInteger`(정규식 `^\d+$`, `validators.ts:17-31`)를 감싸므로 **소수를 통과시킬 수 없다.** `--amount 0.25`를 받으려면 새 파서가 필요하다. 범위 밖·비수치는 `INVALID_AMOUNT`(REQ-GEST-SCROLL-006). M2의 `--duration` 검증과 같은 구조로 짠다.
3. 방향·비율 → 좌표 변환 **순수 함수** + 화면 크기 파생. **두 단계 모두 구현한다**: ① max-extent 후보 산출, ② witness 검증(bounds가 정확히 `{0,0,W,H}`인 최상위 항목 존재). ②를 빠뜨리면 조각들의 외접 상자가 화면 크기로 통과한다(B.5 갈래 4). 기기 없이 테스트 가능해야 한다. 크기 불명 시 거부.
4. 성공 응답에 방향 + 실제 시작·끝 좌표 표기(REQ-GEST-SCROLL-005).

순수 함수로 떼는 이유: 방향 의미(B.2)가 조용히 틀리기 쉬운 부분이라 픽스처로 못박아야 한다. 화면 크기 파생도 같은 함수 경계 안에 두어 두 픽스처로 두 실수를 각각 잡는다 — **최상위 여러 개 + witness 있음**으로 인덱스 0 가정을 배제하고(AC-GEST-008), **조각들만 있고 witness 없음**으로 witness 누락을 배제한다(AC-GEST-017).

### M4 — `tap --web` 화면 밖 요소 보강 [중간 · 회귀 주의]

**산출물**

1. `src/cli/commands/web-support.ts` — 뷰포트 밖일 때 `scrollIntoView` → 재측정 → 네이티브 탭, 실패 시 기존 JS 폴백. 스크롤 발생을 `method`에 구분 표기. REQ-GEST-WEB-001~003.
2. **`src/webview/coordinates.ts` 모듈 주석 갱신** — `:84`가 "scrolling them into view is SPEC-04 territory, out of scope here"라고 적고 있다. REQ-GEST-WEB-001이 그 유예를 뒤집으므로, 갱신하지 않으면 이 파일만 배포된 동작과 반대되는 주석을 계속 달고 있게 된다. 함수 동작(`webRectToDevicePoint`가 뷰포트 밖에 `null` 반환)은 그대로 두고 주석만 고친다 — 스크롤 판단은 호출자 쪽이다.

기존 웹 테스트 전건 통과가 전제(B.4).

### M5 — 실기기 e2e [필수 · 마감 조건]

iOS 시뮬레이터에서: `swipe`로 화면 이동 확증 → `scroll down`/`up` 왕복 → 화면 밖 웹 요소를 `tap --web`으로 눌러 페이지 전환 확증. `--duration 500`이 **0.5초로 동작**하는지(500초가 아니라) 여기서 눈으로 확인한다. Android는 기기가 있으면 스와이프 확인, 없으면 PARTIAL 기록.

**이 마일스톤 없이는 `completed` 마감하지 않는다.**

## §G. 마일스톤 의존 관계

```
M1 (인터페이스+백엔드+레지스트리) ──┬──> M2 (swipe 명령) ──┐
                                    │                      │
                                    └──> M3 (scroll) ──────┼──> M5 (e2e)
                                                           │
                          M4 (웹 보강, M1과 독립) ─────────┘
```

M2와 M3는 둘 다 M1의 `swipe`를 호출하므로 M1 뒤다. M4는 웹 경로 단독이라 M1과 독립이지만, e2e는 함께 돈다.
