---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 구현 계획"
version: "0.7.0"
status: completed
created: 2026-07-27
updated: 2026-07-28
author: hatae
amendment_of: SPEC-GESTURE-001
---

# 구현 계획 — SPEC-GESTURE-001

> 마일스톤은 **번복 가능성 내림차순**. 가장 바뀔 확률이 높은 결정(인터페이스 확장)을 앞에 둔다.

## §A. 컨텍스트

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 선행: SPEC-ANDROID-001 / SPEC-IOS-001 / SPEC-WEBVIEW-001(0.2.0) 모두 completed
- 기준선: 테스트 438건(26파일), typecheck·build exit 0, 커버리지 92.95% — **0.6.0/M8 시점 기준선은 622건(29파일)**, **0.7.0/M9 시점 기준선은 639건(29파일)**
- **선행 스파이크 완료**: iOS swipe 계약, `scrollIntoView` 성립, 화면 크기 파생 가능성을 실측(spec.md §C.1)
- **0.6.0 — Android 실기기 연결**: Samsung SM-S938N(Galaxy S25 Ultra), Android 16, 1440×3120, 600dpi, 무선 ADB. `adb` 1.0.41 / 36.0.2가 `~/Library/Android/sdk/platform-tools/adb`에 있으며 **PATH에는 없다**(§C 참조)
- **0.7.0 — 밀도 측정은 끝났고 기기는 복원됐다**: 사용자 승인 하에 디스플레이 밀도를 일시 변경해 Physical/Override 지배 관계를 실측한 뒤(spec.md §C.1-⑳) `wm density reset`으로 복원했다 — `Physical density: 600` 단일 행, Override 행 없음. **M9는 밀도를 다시 바꾸지 않는다**(§C 참조)

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
| `src/cli/router.ts` + `src/cli/commands/` 신규 | M2·M3 | `swipe` / `scroll` 명령 |
| `src/webview/coordinates.ts` | M4 | 모듈 주석 갱신(화면 밖 도달이 더는 SPEC-04가 아님) |
| `src/cli/commands/web-support.ts` | M4·M6·M7 | M4 뷰포트 밖 분기 / M6 `-scrolled` 이동 증거 / **M7 오라클을 `scrollY` → 요소 사각형으로 교체** |
| `src/cli/validators.ts` | M3·M6·M7 | M3 비율 파서 / M6 `--duration` 양의 정수화(`0` 거부) / **M7 상한 + 십진 어휘 제한** |
| `src/cli/commands/scroll-geometry.ts` | M6·M7 | M6 퇴화 판정(`from === to`) / **M7 문턱 술어로 교체** + `MIN_EFFECTIVE_SWIPE_PX` 상수 |
| `src/cli/commands/scroll.ts` | M6·M7 | M6 `AMOUNT_TOO_SMALL` 거부 경로 / M7 문턱 기반 판정 + `minValidRatio` 재정의 |
| `src/cli/commands/scroll-geometry.test.ts` | M7·M8 | M7 홀수 축(393x852, 375x667) 픽스처 + 독립 유도 기댓값 / **M8 문턱 주입형 시그니처 반영** |
| `src/cli/commands/web-support.test.ts` | M7 | 컨테이너 스크롤 픽스처 |
| `src/schema/device-backend.ts` | **M8** | **10번째 메서드**(문턱 공급) + 출처 타입. `@MX:ANCHOR` "9-method" 문구 갱신 |
| `src/backend/adb-backend.ts` | **M8** | `wm density` 조회 → `8dp × density` + 여유로 문턱 파생 |
| `src/backend/idb-backend.ts` | **M8** | 실측 상수 11pt 반환(기기 조회 없음) — 상수의 이전(移轉)이지 재측정이 아니다 |
| `src/backend/registry.ts` | **M8** | 문턱 공급 파사드 위임(`swipe`와 동일한 resolve-then-delegate) |
| `src/cli/commands/scroll-geometry.ts` | M6·M7·**M8** | M6 퇴화 판정 / M7 문턱 술어 + 상수 / **M8 상수 제거 → 문턱을 인자로 받음** |
| `src/cli/commands/scroll.ts` | M6·M7·**M8** | M6 거부 경로 / M7 `minValidRatio` 재정의 / **M8 백엔드에서 문턱 조회 + 응답에 출처 동반** |
| `src/schema/device-backend.test.ts` / `src/backend/registry.test.ts` / `src/cli/router.test.ts` / `src/cli/commands/web-support.test.ts` | **M8** | 테스트 더블 **10번째** 메서드 보강(4파일 7지점) + 트립와이어 9 → 10 |
| `src/backend/adb-backend.test.ts` / `src/backend/idb-backend.test.ts` | **M8** | mock 밀도(420/480/600/640dpi) 파생 + iOS 상수 경로 |
| `src/cli/commands/scroll.test.ts` | **M8** | 문턱 주입 픽스처 + 출처 동반 단언 |
| `src/backend/adb-backend.ts` | **M9** | `parsePhysicalDensity` → **유효 밀도 파서**(Override 우선, 없으면 Physical). 함수명·주석·`@MX` 서술이 "Physical만 읽는다"로 남아 있으므로 함께 갱신 |
| `src/backend/adb-backend.test.ts` | **M9** | `wm density` 출력 픽스처 4형태(override 없음 / 축소 / 확대 / 파싱 불가) |
| `src/cli/commands/web-support.ts` | M4·M6·M7·**M9** | M4 뷰포트 밖 분기 / M6 `-scrolled` 이동 증거 / M7 오라클을 사각형으로 교체 / **M9 오라클의 표본 시점을 스크롤 완료 이후로** |
| `src/cli/commands/web-support.test.ts` | M7·**M9** | M7 컨테이너 스크롤 픽스처 / **M9 비동기 스크롤 vm 샌드박스 stub** |

## §B. 알려진 이슈 / 리스크

### B.1 Android 미실측 [해소됨 — 0.6.0, 2026-07-28]

> **상태: 해소.** 아래 서술은 **0.5.0 시점의 상태**이며 그 **전제 자체가 틀렸다**. 기록을 남기는 이유는 재발 방지다 — 이 항목은 "리스크를 정확히 식별하고 대응했는데 결국 못 했다"가 아니라 **"리스크의 근거를 잘못 조사했다"**의 사례다.
>
> **틀린 부분**: `adb`는 **설치돼 있었다**(`~/Library/Android/sdk/platform-tools/adb`). PATH에만 없었고, `command -v adb` 하나의 실패를 "미설치"라는 더 강한 명제로 일반화했다. 그 위에 "⑥은 로컬 수단으로 승격 불가"라는 **더 강한 결론까지** 얹었다 — 실제로는 `export PATH` 한 줄이면 됐다.
>
> **교훈**: 도구 부재는 **단일 명령의 실패로 판정하지 않는다.** `command -v`는 "PATH에서 실행 가능한가"를 묻지 "설치돼 있는가"를 묻지 않는다. §C 사전 점검이 이에 맞춰 갱신됐다.
>
> **결과**: ⑥·④는 실측으로 승격됐고 AC-GEST-006의 승격 조건 (a)+(b)가 충족됐다(spec.md §C.2 정정). **다만 규율은 유지된다** — 실측된 것은 기기 1대(SM-S938N)이며, 다중 최상위(⑨)·다른 밀도·다른 제조사는 여전히 미확인이다.

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

### B.6 `ok:true`인데 효과가 없다 [최고 — 0.4.0 amendment의 존재 이유]

sync-auditor 사후 감사가 **PASS-WITH-DEBT 0.69 / SAFE TO PUSH: No**를 반환하고 결함 4건을 지목했다. 증상은 서로 다르지만 **하나의 실패 계열**이다.

| 결함 | 증상 | 실측 |
|------|------|------|
| F1 | `scroll --amount 0.001` → `from.y=to.y=437`, 거리 0, `ok:true` | `scrollY 3212→3212`, 스크린샷 바이트 동일(§C.1-⑫) |
| F2 | `swipe --duration` 생략 시 간헐 무동작 | 5회 중 3회만 이동. `--duration 500`은 5/5(§C.1-⑩) |
| F3 | `swipe --duration 0` 수용 → `{"ok":true, ..., "durationMs":0}` | REQ가 "음이 아닌 정수"라 **구현은 REQ대로**였다 |
| F4 | `js-click-scrolled`가 일어나지 않은 스크롤을 표기 | `scrollIntoView` → `true`, `scrollY 1485→1485`(§C.1-⑪) |

**왜 이것이 최고 리스크인가.** 이 CLI의 소비자는 AI 에이전트다. 오류는 에이전트가 읽고 대응할 수 있지만, **효과 없는 성공은 탐지할 수단이 없다** — 에이전트는 거짓 전제 위에서 다음 단계로 진행한다. 그래서 `ok:true`-무효과는 오류보다 나쁘다. 본 SPEC이 0.2.0(witness 규칙)·0.3.0(`SCREEN_SIZE_UNKNOWN` 강화)에서 두 번 막으려 했던 것과 정확히 같은 계열이 다른 입구로 재발했다.

**F2의 간헐성이 특히 나쁘다.** 항상 실패하면 첫 시도에 잡힌다. 60% 성공은 재현되지 않는 에이전트 실패를 만든다.

**대응**: F1·F3은 거부로(REQ-GEST-SCROLL-007 / SWIPE-005 강화), F4는 이동 증거 요건으로(REQ-GEST-WEB-002 강화), F2는 문서 고지로(REQ-GEST-SWIPE-006) 막는다. **F2에 숨은 기본값을 넣는 대응은 채택하지 않는다** — `swipe`는 원시 동작이고(D1), 기본값을 넣으면 `scroll`과의 차이가 조용해진다.

**AC 세트 구멍이 근본 원인이다.** 다섯 마일스톤의 검증이 F2를 놓친 이유는 단순하다 — **모든 검증이 `--duration 500`을 썼다.** 생략 경로를 도는 AC가 없었다. AC 위반이 아니라 AC 부재이므로, 지속적인 해결책은 구멍을 메우는 것이다(AC-GEST-018~021).

### B.7 가드가 자기 화면에서만 발동했다 [해소됨 — M7, 2026-07-28]

> **상태: 해소.** 아래 서술은 **0.5.0 개정 시점의 상태**다. M7이 술어를 문턱 기반으로 교체하고 문턱을 실측(11pt)한 뒤, 12개 조합(3화면 × 4방향)이 모두 퇴화 비율을 거부하는 것을 확인했다 — `393x852 left`와 `375x667 down`·`left`가 이전에 1px을 방출하던 자리에서 이제 11px을 요구한다. 기록을 남기는 이유는 **재발 방지**다: 픽스처가 한 화면만 쓰면 그 화면의 성질이 규칙처럼 보인다.


0.4.0의 퇴화 가드는 **개발에 쓴 화면(402x874)에서만 검증됐다.** 그 화면은 두 축이 모두 짝수라 가드가 발동했고, 홀수 축에서는 **한 번도 발동하지 않는다**는 사실이 드러나지 않았다.

| 화면 | `down`(높이 기준) | `left`(폭 기준) |
|------|------------------|-----------------|
| 402 x 874 (짝·짝) | 발동 ✓ | 발동 ✓ |
| 393 x 852 (폭 홀) | 발동 ✓ | **미발동** ❗ |
| 375 x 667 (홀·홀) | **미발동** ❗ | **미발동** ❗ |

원인은 단순하다. `center = dimension/2`가 홀수 축에서 반정수라 `round(center ± ε)`가 **항상 갈라진다.** 1e-12까지 내려도 `from === to`가 성립하지 않는다(§C.1-⑬, 빌드 모듈로 직접 재현).

**교훈은 픽스처 다양성이다.** 단일 화면 크기로 기하 로직을 검증하면 **그 화면의 성질이 규칙처럼 보인다.** 0.3.0의 witness 규칙도 같은 함정에 인덱스 0 픽스처로 걸릴 뻔했고 그때는 최상위 다중 픽스처로 막았다 — 이번에는 **축 길이의 홀짝**이 숨은 변수였다. M7의 픽스처는 이 축을 반드시 변화시킨다.

**AC-GEST-018의 경계 단언이 동어반복이다.** 현재 기댓값이 `minNonDegenerateRatio()`의 **자기 출력**이라, 홀수 화면에서도 "기댓값과 같다"로 통과한다. 함수가 틀려도 테스트는 초록이다. M7이 대체할 단언은 **독립적으로 유도한 기댓값**(손계산 상수)을 써야 한다.

### B.8 한 대의 기기가 규칙처럼 보였다 [최고 — 0.6.0 amendment의 존재 이유]

Android 실기기가 처음 연결되면서(SM-S938N, Android 16, 600dpi) **출하된 코드에서 결함이 재현됐다.** 전문은 `.moai/reports/android-verification/SPEC-GESTURE-001-android-2026-07-28.md`.

| 결함 | 증상 | 실측 |
|------|------|------|
| G1 | `MIN_EFFECTIVE_SWIPE_PX = 11`이 플랫폼 독립 상수 — Android에서 무효 | 11px 세로 **0/5**, 가로 **0/6**. 이 기기 슬롭은 30px(= `8dp × 3.75`)이라 11px은 약 1/3(spec.md §C.1-⑰) |
| G2 | 따라서 Android `minValidRatio`가 **되먹여도 안 움직이는 값**을 권고한다 | G1의 직접 파생. sync-auditor 2차 감사 N3가 Android에서 그대로 재현 |
| G3 | REQ-GEST-SCROLL-007 근거 문장이 **거짓**("1px은 아무 일도 안 일어난다") | 문턱 미만 드래그가 **탭**이 돼 바텀시트가 열렸다(§C.1-⑱). `tappable=false` 요소에도 먹었다 |
| G4 | §C.2의 "`adb` 미설치"가 **틀린 진술** | 설치돼 있었고 PATH에만 없었다(B.1 참조) |

**왜 이것이 B.7과 다른 계열인가.** B.7의 교훈은 "픽스처 다양성"이었다 — 단일 **화면 크기**로 기하 로직을 검증하면 그 화면의 성질(축 길이의 홀짝)이 규칙처럼 보인다. B.8은 한 겹 위다: 단일 **플랫폼**으로 기기 물리량을 검증하면 **그 플랫폼의 상수가 보편 상수처럼 보인다.** 두 번 다 숨은 변수는 "우리가 가진 것이 전부라고 가정한 것"이었다.

**그리고 SPEC은 이미 옳게 적어 뒀다.** "iOS에서 측정한 문턱은 Android의 근거가 아니다"(0.5.0 REQ-GEST-SCROLL-007 (e))는 정확한 문장이었다. **구현은 그 문장을 지키지 않았다** — 하나의 상수를 두 플랫폼에 썼다. 즉 이번 결함은 SPEC의 공백이 아니라 **산문이 구조를 강제하지 못한 결과**다. 0.6.0의 대응이 "문서에 더 적는다"가 아니라 **"각 백엔드가 자기 값을 소유하게 한다"**(REQ-GEST-SCROLL-008)인 이유가 이것이다 — 값이 흐를 통로 자체를 없애야 산문에 기대지 않는다.

**G3은 양방향이다(둘 다 기록한다).** 가드의 정당화는 **강해지고**(무효과가 아니라 되돌릴 수 없는 오작동을 막는다), 측정의 판정 규칙은 **약해진다**(M7·Android 양쪽 모두 "안 움직임 = 아무 일 없음"으로 읽었고, iOS는 체커보드 페이지 덕에 **우연히** 탭 현상을 피했다). 전자는 REQ 근거 문단으로, 후자는 REQ-GEST-SCROLL-007 (f) 측정 방법론 + AC-GEST-029로 각각 반영한다.

**대응**: G1·G2는 플랫폼별 파생 + 백엔드 공급으로(REQ-GEST-SCROLL-007/008, AC-GEST-026/027/028), G3은 근거 정정 + 측정 조건 신설로(AC-GEST-029), G4는 §C.2 정정 + 사전 점검 갱신으로 막는다.

**측정 대상 기기가 아직 연결돼 있다** — M8은 이 기기에서 왕복(AC-GEST-028)을 확인할 수 있다. 연결이 끊기면 AC-GEST-028은 PARTIAL로 남기고 "아마 될 것"이라고 쓰지 않는다.

### B.9 열린 질문이 닫히자 보수적 우회가 확정 결함이 됐다 [높음 — 0.7.0 amendment의 존재 이유]

0.6.0은 `wm density`의 Physical / Override 구분을 **열린 질문**으로 남기고(spec.md §C.3) 구현이 Physical만 읽게 뒀다. 4차 감사는 그것을 NN7(MEDIUM)으로 지목하면서도 **push를 막지 않았고, 그 판단은 정확했다** — 0.5.0은 **모든** Android 기기에서 과소 거부했고 0.6.0은 그 모집단을 "디스플레이 확대 override가 걸린 기기"로 **줄였다.** 더 나쁜 상태를 붙잡아 두는 것보다 출하가 낫다.

**0.7.0에서 달라진 것은 결론이 아니라 근거의 종류다.** 사용자 승인 하에 밀도를 일시 변경해 측정한 결과 **"Physical이 지배한다"가 반증됐다**(spec.md §C.1-⑳: Physical 600 · Override 480에서 25px이 4/6 이동 — Physical 지배 시 슬롭 30px이라 0/6이어야 했다). NN7은 이제 가설이 아니라 **확정 결함**이다.

| 결함 | 증상 | 실측 / 산술 |
|------|------|-------------|
| H1 | 파생이 `Physical density:`만 읽는다 | 확대 override(`Physical 480` + `Override 600`)에서 파생 **26px** vs OS 슬롭 **30px** — 문턱이 슬롭보다 **낮다**(산술 재현 2026-07-28) |
| H2 | 그 구간(26~29px)의 `scroll`은 수용돼 **전송된다** | 산물은 무효과가 아니라 **탭**이다(§C.1-⑱) — 되돌릴 수 없다 |
| H3 | 감사 잠정안 `max(physical, override)`도 틀렸다 | 축소 방향에서 **과다 거부** — Override 480의 유효 문턱은 26px인데 max는 32px을 요구한다 |

**B.7·B.8과 같은 계열이면서 방향이 반대다.** 그 둘은 *"우리가 가진 것이 전부"* 라고 가정해 생겼다. 이번 것은 정반대로 **모르는 것을 정직하게 열린 질문으로 남겼는데, 그 열림이 코드에서는 한쪽을 고른 상태로 존재했다** — 문서의 "미측정"이 구현에서는 "Physical을 읽는다"는 **확정 선택**이었다. **미측정을 기록하는 것과, 미측정 상태에서 안전한 쪽을 고르는 것은 다른 일이다.** 감사가 `max()`를 잠정안으로 제시한 이유가 정확히 이것이었고, 측정이 그 간극을 없앴다.

**교훈은 "열린 질문에도 기본값이 있다"이다.** 열린 질문을 §C.3에 적을 때 **그 질문이 코드에서 어느 값으로 굳어 있는지**와 **틀렸을 때 피해가 어느 방향인지**를 함께 적는다. 0.6.0의 §C.3은 구분을 적었지만 그 둘을 적지 않았다 — 그래서 "정직한 미측정 기록"으로 읽혔고, 실제로는 해로운 방향으로 기울어 있었다.

**이월된 감사 지적 3건을 함께 묶는다.**

| 항목 | 등급 | 상태 |
|------|------|------|
| NN1 — `scroll-behavior: smooth`에서 실제 스크롤을 무동작으로 오판 | MEDIUM | **4라운드 중 3라운드 이월** — `web-support.ts`가 해당 델타에서 손대지 않았다. 표기 누락에 더해 네이티브 탭이 **JS 폴백으로 강등**된다(spec.md §C.1-㉑) |
| NN8 — README가 §C.3이 요구하는 가로 32px 5/6 반대 증거를 빠뜨림 | LOW-MEDIUM | **문서 소관 — M9에서 고치지 않는다.** 의무만 기록(AC-GEST-032) |
| NN4 — 거리 증가 폭을 **문턱**의 홀짝으로 서술(실제 결정 변수는 **화면 축 길이**의 홀짝) | LOW | **문서 소관 — 동일.** 빌드 모듈로 독립 재현 완료(§C.1 REQ-GEST-SCROLL-007 고지 조항) |

**대응**: H1·H2는 유효 밀도 파서로(REQ-GEST-SCROLL-008, AC-GEST-030), NN1은 오라클 표본 시점 이동으로(REQ-GEST-WEB-001/002 0.7.0 주석, AC-GEST-031), NN8·NN4는 **의무 기록 + docs 위임**으로(AC-GEST-032) 막는다. H3은 코드 변경이 아니라 **선택지 폐기**이며 AC-GEST-030이 `max()` 구현을 실패시킨다.

## §C. 사전 점검 (Pre-flight)

```bash
pnpm vitest run                          # 기준선 622 (0.6.0 시점)
pnpm typecheck && pnpm build             # exit 0
xcrun simctl list devices booted         # 시뮬레이터 (iPhone 17 Pro / iOS 26.0)
idb ui swipe --help                      # 계약 재확인 (--duration 단위 주의)
grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts   # 기준선 9 → M8 후 10
```

**adb 탐지 (0.6.0 정정 — `command -v` 단독 판정 금지)**

```bash
# PATH -> 표준 SDK 위치 순으로 확인한다. 둘 다 없을 때만 "부재"로 기록한다.
command -v adb || ls ~/Library/Android/sdk/platform-tools/adb

# PATH에 없고 표준 위치에 있으면 export 후 진행한다 (M8 세션의 실제 상태).
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
adb devices -l                           # 기기 연결 + serial 확인
adb -s <serial> shell wm density         # 밀도 -> 8dp x density 파생 (AC-GEST-026)
```

**밀도 상태 확인 (0.7.0 — M9는 밀도를 바꾸지 않는다)**

```bash
adb -s <serial> shell wm density
# 기대: "Physical density: 600" 한 줄. Override 행이 있으면 이전 측정이 복원되지 않은 것이므로
#       `adb -s <serial> shell wm density reset`으로 먼저 복원한다.
```

> **§C.1-⑳의 측정은 끝났고 기기는 복원됐다.** M9는 유효 밀도 파서를 **픽스처로** 검증한다(AC-GEST-030) — `wm density` 출력은 텍스트이므로 기기 상태를 바꾸지 않고 네 형태를 모두 시험할 수 있다. **밀도를 다시 바꾸지 않는 것이 설계 의도다**: 디스플레이 밀도 변경은 기기 상태를 바꾸는 되돌림 가능하지만 부작용 있는 조작이라 회귀 테스트로 반복할 수 없다.

> **`command -v adb` 하나로 부재를 판정하지 않는다.** 0.5.0까지 이 자리에 있던 `command -v adb || echo "adb absent ..."`는 **PATH 부재를 미설치로 오판**해 §C.2·B.1·AC-GEST-006을 연쇄적으로 틀리게 만들었다(B.1 참조). `command -v`는 "PATH에서 실행 가능한가"를 묻지 "설치돼 있는가"를 묻지 않는다.
>
> **CLI 자체는 PATH의 `adb`를 부른다**(`spawnAdb`가 바이너리명을 `"adb"`로 고정). 따라서 위 `export PATH`는 조사용 편의가 아니라 **M8 실행의 전제 조건**이다 — 빠뜨리면 CLI가 기기를 전혀 보지 못하고, 그 상태를 "기기 없음"으로 오판하면 같은 실수를 반복한다. **M8을 도는 모든 세션이 이 export를 먼저 해야 한다.**

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

### M6 — `ok:true`-무효과 결함 4건 수정 [0.4.0 amendment · 마감 재개 조건]

> **선행**: M1~M5 완료(0.3.0에서 마감). 이 마일스톤은 sync-auditor 사후 감사 결과로 열린 것이며, B.6이 근거다.

**산출물**

1. **`src/cli/validators.ts` — `--duration` 파서를 양의 정수로 좁힌다(F3, REQ-GEST-SWIPE-005).** `0`은 `INVALID_DURATION`. 기존 "음이 아닌 정수" 판정을 쓰는 자리를 전부 찾아 바꾼다 — 좌표 파서(`parseCoordinate`)는 `0`이 유효하므로 **공유하면 안 된다.**
2. **`src/cli/commands/scroll-geometry.ts` — 퇴화 거리 판정을 노출한다(F1, REQ-GEST-SCROLL-007).** `computeScrollSwipe`가 만든 `from`/`to`가 같은 점인지 호출자가 알 수 있어야 한다. 판정 위치는 반올림 **이후**다 — 반올림 전 거리는 0.79처럼 0이 아니지만 반올림 후 접히는 것이 문제이므로, 반올림 전 값으로 판정하면 이 결함을 못 잡는다.
3. **`src/cli/commands/scroll.ts` — `AMOUNT_TOO_SMALL` 거부 경로(F1).** 응답에 거부된 비율 + 그 화면에서 유효한 최소 비율을 싣는다. **어떤 제스처도 보내지 않는다.**
4. **`src/cli/commands/web-support.ts` — `-scrolled` 표기에 이동 증거를 요구한다(F4, REQ-GEST-WEB-002).** `scrollIntoView` 호출 전후의 `scrollY`(또는 대상 사각형)를 비교해 **변화가 있을 때만** `-scrolled`를 붙인다. `native-scrolled`·`js-click-scrolled` 양쪽에 적용한다. `buildScrollIntoViewExpression`(`:209-217`)이 `true`를 주는 조건은 "노드 존재"뿐이라는 점을 잊지 말 것.

**AC**: AC-GEST-018(F1) / 019(F3) / 020(F2) / 021(F4). AC-GEST-007의 "끝점 y < 시작점 y"는 **성공한 scroll에 한정**되도록 문구가 조정됐다(AC-GEST-018이 퇴화 대역을 따로 맡는다).

**F2는 코드 변경이 아니다.** REQ-GEST-SWIPE-006은 문서 고지 의무이고, README/CHANGELOG 수정은 **이 마일스톤 밖**(별도 docs 위임)이다. M6에서는 AC-GEST-020으로 생략 경로의 동작을 고정하기만 한다.

**이 마일스톤을 끝내기 전에는 push하지 않는다** — sync-auditor가 SAFE TO PUSH: No를 냈고 11개 커밋이 로컬에 남아 있다.

### M7 — 움직임 가능성 술어 + 문턱 측정 [완료 · `9da0241`]

> **선행**: M6 완료(0.4.0에서 마감). 재감사 0.76 / SAFE TO PUSH: No가 근거(B.7).
>
> **결과 요약(2026-07-28).** `MIN_EFFECTIVE_SWIPE_PX = 11pt`(세로·가로 동일)를 실측해 spec.md §C.1-⑭에 기록했다. 이분 탐색이 깨끗한 단일 정수로 수렴해 **비수렴 블로커 경로는 발동하지 않았다.** 12개 조합(3화면 × 4방향)이 모두 퇴화 비율을 거부하고 `minValidRatio`는 11~12pt를 낸다. 아래 산출물 목록은 **완료된 작업의 기록**이다.

**산출물 1 — 문턱 측정(다른 모든 산출물의 선행) ✅ 완료.**

`MIN_EFFECTIVE_SWIPE_PX`를 **측정한다. 고르지 않는다.** 이것은 코드 작업이 아니라 실측 작업이며 **M7의 첫 번째 산출물**이었다.

- 비율에 대한 **이분 탐색**, 후보마다 **반복 시행**(최소 3회, 판정이 갈리면 늘린다).
- 판정: **상단 상태바를 잘라낸 본문 영역 비교**(§C.1-⑩ 확립된 방법). 시계 변화가 전체 스크린샷 비교를 무의미하게 만든다.
- **세로·가로 각각** 측정한다. 다르면 둘 다 기록한다.
- 결과를 **spec.md §C.1-⑭에 검증 수준 `실측`으로 기록**하고 측정 기기·페이지를 명시한다. 이 행이 채워지지 않으면 REQ-GEST-SCROLL-007은 미충족이며 **M7은 닫히지 않는다.**
- 출발점이던 희소 4점(2px → 0/3, 4px → 1/3, ~44px → 3/3, ~437px → 3/3)에서 하한이 4~44px 사이로만 좁혀져 있었다.
- **측정 불가로 끝나면 블로커로 올린다.** 잠정값을 넣고 마감하지 않는다.

**실제 결과**: 세로 9pt 1/15 · 10pt 2/15 · **11pt 15/15** · 12pt 5/5, 가로 10pt 1/15 · **11pt 10/10** · 12pt 5/5. 9~10pt의 소수 이동(1~2/15)은 4~8pt가 전부 0/5였던 것과 대비해 측정 잡음으로 해석했다. **두 축 모두 11pt로 수렴** — 블로커 경로 미발동. 전체 방법·기기·페이지는 spec.md §C.1-⑭에 있다.

**산출물 2 — 술어 교체(`scroll-geometry.ts`).** `from === to` → 스크롤 축 거리가 `MIN_EFFECTIVE_SWIPE_PX` 미만. 상수는 **기기 픽셀** 단위로 두고 화면별 비율은 여기서 파생한다.

**산출물 3 — `minValidRatio` 재정의(`scroll.ts`).** "끝점이 달라지는 최소 비율" → "**문턱을 넘는** 최소 비율". 호출자가 받은 값을 그대로 다시 넣으면 성공해야 한다 — 이것이 이 값의 존재 이유다.

**산출물 4 — `--duration` 상한(`validators.ts`).** 60,000 ms 초과 거부(`INVALID_DURATION`). 판정은 파싱된 수치에, 허용 어휘는 십진 숫자로. `1e24` 무한 정지를 막는다(§C.1-⑮).

**산출물 5 — `-scrolled` 오라클 교체(`web-support.ts`).** `window.scrollY` → **대상 요소의 사각형** 비교. 컨테이너 스크롤·가로 스크롤을 한 술어로 덮는다(§C.1-⑯). REQ 변경은 없다 — 이미 허용된 오라클 중 일반형을 고르는 것이다.

**산출물 6 — 픽스처 다양화(테스트).** 이것이 없으면 같은 실수가 반복된다.

- `scroll-geometry.test.ts`: **홀수 축 화면**(393x852, 375x667)을 추가한다.
- AC-GEST-018의 경계 단언을 **독립 유도 기댓값**으로 교체한다 — `minNonDegenerateRatio()`의 자기 출력을 기댓값으로 쓰는 현재 형태는 동어반복이라 함수가 틀려도 통과한다(B.7).
- `web-support.test.ts`: `overflow:auto` 컨테이너 스크롤 케이스를 추가한다.

**AC**: AC-GEST-022(홀수 축·움직임 술어) / 023(컨테이너 스크롤) / 024(측정된 문턱 + `minValidRatio` 왕복) / 025(`--duration` 상한).

**Android는 측정하지 않는다** — `adb`가 없다. iOS 문턱을 Android 근거로 쓰지 않으며, Android 항목은 기존 PARTIAL 규율을 따른다.

**이 마일스톤을 끝내기 전에는 push하지 않는다** — 재감사가 SAFE TO PUSH: No를 유지했고 17개 커밋이 로컬에 남아 있다.

### M8 — 문턱의 플랫폼별 파생 + Android 실기기 검증 [0.6.0 amendment]

> **선행**: M1~M7 완료(0.5.0에서 마감·푸시, HEAD `7be7611`). 이 마일스톤은 **Android 실기기 연결**로 열렸으며 B.8이 근거다.
>
> **이 마일스톤은 연결된 실기기에서 검증한다** — Samsung SM-S938N(Galaxy S25 Ultra), Android 16, 1440×3120, 600dpi, 무선 ADB. M7이 iOS 시뮬레이터에서 문턱을 실측한 것과 같은 위상의 작업을 Android에서 한다.
>
> **PATH 전제**: `adb`는 `~/Library/Android/sdk/platform-tools/adb`에 있고 **PATH에는 없다.** §C의 `export PATH=...`를 **모든 세션에서 먼저** 실행한다 — 빠뜨리면 CLI가 기기를 전혀 보지 못한다.

**산출물 1 — 백엔드 문턱 공급(다른 모든 산출물의 선행).** REQ-GEST-SCROLL-008. `DeviceBackend`에 10번째 메서드를 **가법 추가**하고 구현체 **세 개 전부**에 배선한다.

- `AdbBackend` — `-s <serial> shell wm density`로 밀도를 조회해 `8dp × density`에 여유를 더해 파생한다. **권장 `floor(8dp × density) + 2px`**(본 기기 32px); 다른 값을 택하면 여기에 근거를 남긴다.
- `IdbBackend` — 실측 상수 **11pt**를 반환한다. **기기를 조회하지 않는다.** 이것은 상수의 이전(移轉)이지 재측정이 아니다 — 값의 출처는 §C.1-⑭ 그대로다.
- **`BackendRegistry` — 파사드 위임.** M1의 `swipe`가 겪은 함정과 같다: 빠뜨리면 (a) 타입 체크가 깨지고 (b) 문턱이 **프로덕션 경로에서 기기에 도달하지 못한다**. `stopApp`/`swipe`와 동일한 resolve-then-delegate.
- **반환값에 출처(basis)를 실는다** — "런타임 기기 조회에서 파생" / "다른 기기에서 측정된 상수"가 구별돼야 한다. 구체적 타입·필드명은 이 마일스톤의 설계 재량이다(spec.md §D "구현 세부(HOW)").
- **인터페이스에 밀도를 노출하지 않는다.** 밀도 접근자를 추가하면 iOS가 밀도를 지어내야 한다 — AC-GEST-027이 이를 거부한다.

**산출물 2 — 기하 계층에서 상수 제거(`scroll-geometry.ts`).** `MIN_EFFECTIVE_SWIPE_PX` 모듈 상수를 없애고, `isDegenerateSwipe`/`minNonDegenerateRatio`가 **문턱을 인자로 받도록** 바꾼다. 순수 함수 성질은 유지한다 — 기기 없이 mock 문턱으로 테스트 가능해야 한다.

**산출물 3 — `scroll.ts` 배선.** `resolveTargetDevice` 뒤에 백엔드에서 문턱을 조회하고, `AMOUNT_TOO_SMALL` 응답에 `minValidRatio`와 **함께 출처**를 싣는다. 거부 순서는 그대로 유지한다(방향 → `--amount` → 기기 해석 → `dump` → 문턱 → 기하 판정 → `swipe`).

**산출물 4 — 트립와이어·테스트 더블 갱신.** M1이 8 → 9로 겪은 것을 9 → 10으로 한 번 더 한다. `device-backend.test.ts:12`의 `Record<keyof DeviceBackend, true>` + `toHaveLength` **9 → 10**, `router.test.ts`(4지점), `registry.test.ts:31`, `web-support.test.ts:88`. `@MX:ANCHOR` "9-method" 문구도 갱신한다 — **갱신하지 않으면 앵커가 거짓이 된다**(M1의 "8-method" 교훈).

**산출물 5 — 실기기 검증(AC-GEST-028).** 연결된 SM-S938N에서 왕복을 확인한다: 문턱 미만 비율 → `AMOUNT_TOO_SMALL` → 응답의 `minValidRatio`를 **되먹여 3/3 이동**, 한 단계 아래는 거부. **네 방향 전부.**

- **오라클**: 상태바(상단 250px) 제외 본문 스크린샷 해시. **무제스처 반복 촬영으로 잡음 기준선을 먼저 확인**한다 — 설정 화면은 3회가 전부 달라 부적합했다(§C.1-⑰).
- **⚠️ 상호작용 요소가 없는 화면에서 시행한다.** 문턱 미만 스와이프는 **탭이 된다**(§C.1-⑱) — 그러지 않으면 검증 자체가 기기 상태를 바꾼다. 1차 측정이 이것 때문에 폐기됐다.
- **AC-GEST-006 판정도 여기서 내린다** — 승격 조건 (a)+(b)가 충족됐으므로 PARTIAL → PASS 판정을 progress.md에 기록한다. **acceptance.md가 판정을 미리 적어 두지 않는다.**

**산출물 6 — 픽스처(테스트).** mock 밀도 **420 / 480 / 600 / 640dpi** → 슬롭 **21 / 24 / 30 / 32px** 파생을 고정한다(AC-GEST-026). B.7·B.8의 교훈이 같은 방향을 가리킨다 — **한 값만 쓰면 그 값의 성질이 규칙처럼 보인다.** iOS 경로는 밀도 조회가 **일어나지 않음**을 단언한다.

**AC**: AC-GEST-026(플랫폼별 파생) / 027(10번째 메서드 + 출처) / 028(Android 왕복) / 029(측정 방법론). 더해 AC-GEST-008의 grep 기댓값이 9 → 10으로 갱신됐다.

**회귀 기준선**: **622건**(0.6.0 시점). 감소 없이 통과해야 한다(AC-GEST-027).

**Android 1대에서만 측정됐다** — 다른 밀도·제조사는 미확인이며, 파생 규칙(`8dp` AOSP 기본값)의 이식성에 기대는 것이지 전수 검증이 아니다. "모든 Android에서 확인됐다"고 쓰지 않는다.

### M9 — 유효 밀도 + 비동기 스크롤 표본 시점 [0.7.0 amendment]

> **선행**: M1~M8 완료(0.6.0에서 마감·푸시, HEAD `467e7df`). 이 마일스톤은 **감사 결과가 아니라 새 측정**으로 열렸다 — M8이 §C.3에 미측정으로 남긴 Physical/Override 구분이 실측되면서(spec.md §C.1-⑳) 0.6.0의 보수적 우회가 **확정 결함**이 됐다(B.9). 더해 네 번의 감사가 이월한 SHOULD-FIX 상위 3건을 묶는다.
>
> **PATH 전제**: M8과 동일 — `export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"`를 모든 세션에서 먼저 실행한다.
>
> **⚠️ 밀도는 이미 복원됐다. 다시 바꾸지 않는다.** §C의 밀도 상태 확인만 하고, 파생 검증은 픽스처로 한다(AC-GEST-030).

**산출물 1 — 유효 밀도 파서(`adb-backend.ts`) [최고 변경 확률 · 확정 결함].**

파생이 읽는 값을 바꾸는 것이므로 **파생 데이터 자체가 바뀐다** — 되돌리기 가장 비싸고, 잘못 고르면 피해가 되돌릴 수 없는 방향이다(B.9 H2).

- `parsePhysicalDensity` → **유효 밀도**를 읽는다: `Override density:` 행이 있으면 그 값, 없으면 `Physical density:`. 밀도는 `dpi / 160`, 문턱 산식(`floor(8 × 밀도) + 2`)은 **그대로다** — 바뀌는 것은 곱해지는 밀도뿐이다.
- **함수명이 이제 사실과 다르다.** `parsePhysicalDensity`라는 이름과 그 doc-comment("reads only the Physical line"), 그리고 §C.3을 인용해 "열린 질문"이라 적은 주석까지 **함께 고친다** — 갱신하지 않으면 M1의 "8-method", M8의 "9-method"와 같은 **거짓 앵커**가 된다. 이 SPEC이 두 번 겪은 실수다.
- **파싱 실패 시 명시적 오류는 그대로**(추측한 문턱 금지). `basis` 값도 그대로(`"런타임 기기 조회에서 파생"`) — 읽는 줄이 바뀐 것이지 출처의 종류가 바뀐 것이 아니다.
- **`max(physical, override)`를 쓰지 않는다** — 축소 방향에서 과다 거부한다(B.9 H3). AC-GEST-030의 픽스처 B가 이 구현을 실패시킨다.

**산출물 2 — 오라클 표본 시점(`web-support.ts`) [높음 · 사용자 대면 동작].**

폴백 강등을 되돌리는 변경이므로 **`tap --web`의 관측 가능한 동작이 바뀐다**(NN1).

- 판정·재측정 표본을 **끌어오기 완료 이후**로 옮긴다. **채택: `scrollIntoView({block:"center", behavior:"instant"})`** — 페이지 CSS의 `scroll-behavior`를 무시하고 동기 스크롤을 강제한다.
- **CSS를 무시하는 것은 의도된 것이다.** CLI의 목적은 애니메이션 재현이 아니라 **좌표를 신뢰할 수 있게 만드는 것**이며, 스크롤은 대상 요소에 닿기 위한 수단이지 관찰 대상이 아니다(spec.md §A.2).
- **기각 — 애니메이션 완료 대기.** 완료 시점을 알 표준 신호가 없어 폴링·타임아웃을 도입해야 하고, 그것은 `--duration` 상한이 막았던 **무한 대기 계열**을 웹 경로에 새로 여는 일이다(§C.1-⑮). 한 인자로 끝나는 변경 대신 대기 루프를 넣을 근거가 없다.
- REQ 변경은 없다 — 규범 문장 둘은 이미 충분하고, 빠져 있던 것은 **사실**이었다(spec.md REQ-GEST-WEB-002 0.7.0 주석).

**산출물 3 — 픽스처(테스트) [중간].**

- `adb-backend.test.ts`: `wm density` 출력 **4형태**(override 없음 / 축소 / 확대 / 파싱 불가) → 32 / 26 / 32 / 오류. **확대 형태에서 현재 구현이 26px을 내는 것을 RED로 먼저 확인한다** — 그것이 출하된 결함이다.
- `web-support.test.ts`: vm 샌드박스 stub이 **플랫폼 계약을 흉내낸다** — 동기 스크롤을 요구하는 호출만 사각형을 호출 시점에 바꾸고, 그렇지 않으면 뒤 tick으로 미룬다. 현재 표현식이 `moved:false`를 내는 것을 RED로 확인한 뒤 고친다. **stub은 특정 인자를 단언하지 않는다**(AC-GEST-031) — 계약을 만족하는 구현이면 통과한다.
- 두 파일 모두 **B.7·B.8·B.9가 가리키는 같은 방향**이다: 한 형태만 시험하면 그 형태의 성질이 규칙처럼 보인다.

**산출물 4 — 문서 의무 기록(코드 아님) [최저].**

NN8·NN4는 README 소관이므로 **M9에서 고치지 않는다.** AC-GEST-032가 의무를 들고 있고 집행은 docs 패스다 — 따라서 **AC-GEST-032는 M9 종료 시점에 미충족**이며, 그것을 progress.md에 그대로 적는다("관측하지 않은 것을 PASS로 쓰지 않는다").

**산출물 5 — 회귀.**

- **639건 기준선** 감소 없이 통과, `pnpm typecheck` / `pnpm build` exit 0.
- **iOS 경로 불변 확인** — `minValidRatio`가 0.6.0과 바이트 동일(`0.013984236866235733`)이어야 한다. 이번 변경은 Android 파싱과 웹 오라클만 건드린다.
- **override 없는 기기의 값 불변 확인** — 실측 기기(SM-S938N)는 32px 그대로다(AC-GEST-030 픽스처 A).

**AC**: AC-GEST-030(유효 밀도) / 031(표본 시점) / 032(문서 의무 — **미충족으로 남는다**).

**실기기는 회귀 확인에만 쓴다.** 파생은 픽스처로 검증되므로 기기 없이도 AC-GEST-030은 판정 가능하다. 기기가 있으면 AC-GEST-028의 왕복을 한 번 더 확인하고, 없으면 그 재확인만 PARTIAL로 남긴다 — **"아마 될 것"이라고 쓰지 않는다.**

**확대 방향은 여전히 미측정이다**(spec.md §C.3). M9가 고치는 것은 **어느 줄을 읽는가**이고, 확대 방향의 수치가 맞다는 근거는 AOSP 규칙이지 측정이 아니다. "확대 override 기기에서 확인됐다"고 쓰지 않는다.

## §G. 마일스톤 의존 관계

```
M1 (인터페이스+백엔드+레지스트리) ──┬──> M2 (swipe 명령) ──┐
                                    │                      │
                                    └──> M3 (scroll) ──────┼──> M5 (e2e) ──> M6 (결함 4건)
                                                           │
                          M4 (웹 보강, M1과 독립) ─────────┘

M6 ──> M7 (문턱 측정 → 술어 교체 → 픽스처 다양화)
       └ 측정이 선행 산출물. 측정 없이는 나머지 산출물이 값을 갖지 못한다.

M7 ──> M8 (백엔드 문턱 공급 → 기하 계층 상수 제거 → 실기기 왕복)
       └ 백엔드 공급이 선행 산출물. 문턱을 공급받을 통로가 없으면 나머지가 서지 못한다.

M8 ──> M9 ┬─ 유효 밀도 파서 (Android 파생)
          └─ 오라클 표본 시점 (웹 경로)
       └ 두 산출물은 서로 독립이다 — 선행 관계가 아니라 번복 가능성 내림차순으로 나열했다.
```

M2와 M3는 둘 다 M1의 `swipe`를 호출하므로 M1 뒤다. M4는 웹 경로 단독이라 M1과 독립이지만, e2e는 함께 돈다. **M6는 M5 마감 후 사후 감사에서 열린 마일스톤**이므로 M2·M3·M4의 산출물을 모두 건드린다.

**M8은 M7 마감·푸시 후 Android 실기기 연결로 열렸다** — 순서상 마지막이며, M1(인터페이스)·M3(기하)·M7(문턱)의 산출물을 모두 건드린다. M6·M7이 **사후 감사**로 열린 것과 달리 M8은 **새 관측 수단**(실기기)이 생겨 열렸다는 점이 다르다 — 즉 이전 마일스톤들이 틀렸다기보다, 확인할 수 없던 것을 확인할 수 있게 됐고 그 결과 하나가 결함이었다.

**M9는 M8이 스스로 열어둔 질문이 닫히면서 열렸다** — 새 기기도 새 감사도 아니고, **M8이 §C.3에 "미측정"으로 적어둔 항목을 측정한 것**이 계기다. 세 갈래를 구분해 적는다: M6·M7은 **감사**가, M8은 **새 기기**가, M9는 **자기 문서가 남긴 열린 질문**이 열었다. 마지막 것이 가장 반복 가능한 형태다 — 열린 질문을 적어두면 언젠가 닫을 수 있고, 닫히면 그때 무엇이 결함이었는지 드러난다.
