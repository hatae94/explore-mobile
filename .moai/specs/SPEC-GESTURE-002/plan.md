---
id: SPEC-GESTURE-002
title: "두 손가락 핀치와 더블탭 — 구현 계획"
version: "0.4.0"
status: in-progress
created: 2026-08-25
updated: 2026-08-25
author: hatae
---

# 구현 계획 — SPEC-GESTURE-002

> 마일스톤은 **번복 가능성 내림차순**. 가장 바뀔 확률이 높은 결정(인터페이스 형태 → 기하 산식 → 사용자 대면 명령)을 앞에 두고, 기계적인 배선과 마감 검증을 뒤에 둔다.

## §A. 컨텍스트

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 선행: SPEC-GESTURE-001 · SPEC-VISION-001 · SPEC-IMAGE-001 모두 `completed`
- **기준선(2026-08-25 실측)**: `pnpm vitest run` → **41 파일 805건 전건 통과**, 소요 624 ms
- 개발 방법론: **TDD**(`.moai/config/sections/quality.yaml` `development_mode: "tdd"`) — RED → GREEN → REFACTOR
- 런타임 의존성: **없음**. `package.json`에 `dependencies` 키 자체가 없다(2026-08-25 확인). 이 SPEC은 그 상태를 유지한다
- 사전 측정 완료: `.moai/reports/gesture-002-measurement-protocol.md` — Android 제외는 측정 결과이며 재검토 대상이 아니다(spec.md §C.1)

### A.1 이번 SPEC이 기대는 기존 기계장치

새로 만들지 않고 그대로 쓰는 것들. 여기 있는 것을 복제하면 그것이 곧 범위 이탈이다.

| 기존 자산 | 위치 | 이번에 쓰는 방식 |
|---|---|---|
| `resolveCoordinateMapper` (`--from` 해석 + 신선도) | `src/cli/commands/from-capture.ts` | `pinch`·`doubletap`이 **그대로 호출**한다. 명령별 재해석 금지(그 파일의 `@MX:ANCHOR`) |
| `toDeviceCoordinate` (이미지→기기 좌표) | `src/image/geometry.ts` | 앵커·탭 좌표 변환. **거리 변환 함수를 새로 만들지 않는다**(spec.md §A.5 기각 사유) |
| `getScreenSize` | `DeviceBackend` | 핀치 간격 산출의 화면 크기 출처. 새 출처 금지 |
| `getMinEffectiveSwipeThreshold` | `DeviceBackend` | 핀치 최소 이동 판정. **두 번째 문턱 출처 금지**(REQ-GEST2-PINCH-004) |
| `parseRatio` / `parseCoordinate` | `src/cli/validators.ts` | `--amount` / 좌표 검증. 새 파서 금지 |
| `--amount` / `--from` / `--stale-ok` 옵션 선언 | `src/cli/args.ts` | **이미 선언돼 있다.** 이 SPEC은 `args.ts`에 옵션을 추가하지 않는다 |
| `backendFailure` 타입 있는 오류 통과 | `src/cli/commands/types.ts` | 새 오류 클래스를 통과 목록에 더한다 |
| `performActions` (W3C actions 봉투 단일 생성 지점) | `src/backend/wda-backend.ts:361` | 포인터 배열을 N개로 일반화 |

### A.2 PRESERVE (수정 금지)

- `src/image/geometry.ts` — SPEC-IMAGE-001에서 막 확정된 변환 계약. **`toDeviceCoordinate`의 산술·클램프 규칙 불변**
- `src/cli/commands/from-capture.ts` — `--from` 해석의 단일 지점. 시그니처 불변(호출자만 늘어난다)
- `src/cli/commands/scroll.ts` / `scroll-geometry.ts` — SPEC-GESTURE-001의 거부 경로. **핀치 때문에 손대지 않는다**
- `DeviceBackend`의 **기존 10개 메서드** — 시그니처·동작 불변(가법 확장만)
- `src/backend/wda-recovery.ts` · `withRecovery` 중첩 금지 규칙(`wda-backend.ts`의 `@MX:ANCHOR`) — 신규 메서드도 **공개 메서드 한 겹만** 감싼다
- 기존 11개 CLI 명령의 argv·응답 형태

### A.3 수정 대상 (PRESERVE 아님 — 명시)

여기 없는 파일을 건드리면 범위 이탈이다.

| 파일 | 마일스톤 | 성격 |
|------|----------|------|
| `src/schema/device-backend.ts` | M1 | `pinch`·`doubleTap` 2개 추가 + `PinchGesture` 타입 + `@MX:ANCHOR` "10-method" 문구 갱신 |
| `src/backend/gesture-errors.ts` | M1 | **신규** — `UNSUPPORTED_GESTURE_ON_ANDROID` 오류 클래스. `launch-errors.ts`의 선례(성격이 다르면 신규 모듈)를 따른다 |
| `src/backend/wda-backend.ts` | M1 | `performActions` 포인터 N개 일반화 + `pinch`/`doubleTap` 구현 + 간격 상수 |
| `src/backend/adb-backend.ts` | M1 | `pinch`/`doubleTap` — 사유가 다른 두 메시지로 명시적 거부 |
| `src/schema/device-backend.test.ts` | M1 | 트립와이어 10 → 12 + 문구 갱신 |
| 테스트 더블 보강(아래 §B.1의 세는 명령으로 확정) | M1 | 신규 2메서드를 갖도록 객체 리터럴 갱신 |
| `src/cli/commands/pinch-geometry.ts` | M2 | **신규** — 방향·비율·앵커·화면 → 손가락 2개 좌표. 순수 함수 |
| `src/cli/commands/pinch.ts` | M3 | **신규** — 명령 핸들러 |
| `src/cli/commands/doubletap.ts` | M4 | **신규** — 명령 핸들러 |
| `src/cli/router.ts` | M3·M4 | `COMMANDS`에 2개 등록 |
| `src/schema/command-payloads.ts` | M5 | `PinchPayload` · `DoubleTapPayload` |
| `src/schema/command-payloads.test.ts` | M5 | 키 집합 양방향 소진 검사 2건 |
| `src/cli/commands/types.ts` | M5 | `backendFailure` 통과 목록에 신규 오류 추가 |
| `src/cli/commands/backend-failure.test.ts` | M5 | 매핑 표에 신규 오류 1행 |
| 신규 테스트 파일 | M1~M4 | `pinch-geometry.test.ts` · `pinch.test.ts` · `doubletap.test.ts` + 기존 `wda-backend.test.ts` / `adb-backend.test.ts` / `router.test.ts` 보강 |
| `README.md` · `.claude/skills/explore-mobile/SKILL.md` | **sync 위임** | 두 명령 사용법 + REQ-GEST2-DTAP-003 고지. **run 단계에서 고치지 않는다** |

## §B. 알려진 이슈 / 리스크

### B.1 테스트 더블이 12번째 메서드에서 일제히 깨진다 [높음 · 기계적이지만 광범위]

`DeviceBackend`에 메서드가 늘면 `satisfies DeviceBackend` / `Record<keyof DeviceBackend, true>` 객체 리터럴이 전부 타입 체크에 걸린다. SPEC-GESTURE-001 M1·M8이 각각 이 비용을 치렀다.

**대응**: 손으로 센 목록을 SPEC에 적지 않는다 — 그 목록은 다른 작업이 줄을 밀면 조용히 낡는다(SPEC-GESTURE-001 0.9.0 NF4가 지운 것이 정확히 그 형태다). 대신 **세는 명령**을 남긴다:

```bash
# 갱신이 필요한 테스트 더블 위치 (파일별 개수)
grep -rc "getMinEffectiveSwipeThreshold: " src --include="*.test.ts" | grep -v ":0"
# 2026-08-25 기준: 8개 파일 10개 지점.
#   이 중 src/schema/device-backend.test.ts 1건은 더블이 아니라 트립와이어다.
```

`src/backend/registry.test.ts`의 `new BackendRegistry(...)` 인스턴스와 `adb-backend.test.ts`/`wda-backend.test.ts`의 실제 구현 시험은 **이 수에 포함되지 않는다** — 클래스가 메서드를 얻으면 자동으로 컴파일된다.

### B.2 핀치 간격 산식이 실기기에서 뒤집힐 수 있다 [최고 — 이 SPEC의 유일한 미검증 축]

spec.md §C.1-⑨: 측정은 **기구**(포인터 2개가 한 요청에 실리면 확대가 일어난다)를 확인했을 뿐 **손가락 좌표를 기록하지 않았다.** 따라서 `narrowGap = round(wideGap / 2)`는 설계 선택이며 실기기 확인 전에는 미검증이다.

**대응**: M6에서 실기기로 확인한다. 확대가 관측되지 않으면 **먼저 이 수치를 의심한다** — REQ가 아니라 상수의 문제일 수 있다. 조정 순서를 미리 정해 둔다:

1. `narrowGap` 비율을 낮춘다(간격 변화가 커진다) → 재확인
2. `--amount` 기본값을 올린다(전체 간격이 커진다) → 재확인
3. 그래도 안 되면 **블로커로 올린다.** "아마 될 것"이라고 적지 않으며, 잠정값을 넣고 마감하지 않는다

**0.2.0 — 조정 사다리에서 지속시간을 뺐다.** 0.1.0의 3단계는 "`pause` 길이를 조정한다(120 ms를 출발점으로)"였고, 0.2.0이 그 단계를 뺐다. **0.3.0 — 뺀 이유를 두 축으로 나눠 다시 적는다.** 0.2.0은 근거를 한 문장으로 적어 두 축을 뭉갰다.

- **`pointerMove` 축**: 여기를 만지는 것은 **거의 확실히 헛수고다.** `700 / 400 / 200 / 100 / 50 / 0 ms`로 바꿔도 핀치는 여섯 값 전부에서 동작했다(spec.md §C.1-⑪). 이 축은 **동작 여부를 가르지 않는 것으로 실측됐다.**
- **`pause` 축**: **헛수고인지 아닌지 모른다** — 그 여섯 값은 전부 `pointerMove`의 값이고 `pause`는 120 ms에 고정돼 있었다. 그런데도 사다리에서 빼는 이유는 "쓸모없음이 밝혀져서"가 아니라 **도움이 된다는 근거도 없고, 측정된 미검증 축(간격 산식)이 따로 있어서**다. 순서의 문제이지 판정의 문제가 아니다.

- 남은 미검증 축은 **간격 산식(②의 `/2`)** 하나이며, 조정은 거기에 집중한다.
- **다만 `pause`는 0으로 재측정되지 않았다** — ⑪은 `pause(120 ms)`를 **고정한 채** `pointerMove`만 바꿨다. 두 축을 같은 것으로 취급하지 않는다. 1·2가 다 실패하고 봉투를 의심할 근거가 생기면 그때 `pause`를 **재측정 대상으로** 올리되, 사다리의 기본 경로에는 두지 않는다.

**조정된 값은 그 근거와 함께 spec.md §C.1에 실측으로 기록한다** — 그러지 않으면 다음 사람이 같은 탐색을 처음부터 반복한다.

### B.3 빌려 온 문턱이 핀치를 과다 거부하거나 과소 거부할 수 있다 [중간 · 방향이 비대칭]

REQ-GEST2-PINCH-004는 스와이프에서 측정된 문턱을 핀치에 쓴다. 두 방향의 위험이 다르다.

- **과다 거부**(핀치의 실제 문턱이 더 낮은데 스와이프 문턱으로 막는 경우): 정당한 핀치가 `AMOUNT_TOO_SMALL`로 거부된다. **해롭지 않다** — 호출자는 `minValidRatio`를 되먹여 성공할 수 있다.
- **과소 거부**(핀치의 실제 문턱이 더 높은 경우): 문턱을 넘었는데 화면이 움직이지 않는다 → **`ok:true`-무효과**, 이 프로젝트가 여섯 번 막아 온 계열이다.

**0.4.0 — 이 비대칭이 경계 한 픽셀의 처분을 정했다.** 선행 SPEC의 술어는 `< 문턱`(같으면 통과)인데 이 SPEC은 `<= 문턱`(같으면 거부)이다. 어긋남을 유지하기로 한 이유가 여기 있다 — 과다 거부는 위 표의 첫 줄대로 **되먹으면 복구되고**, 과소 거부는 둘째 줄대로 복구되지 않는다. 더해 공급 문턱값은 하필 **핀치의 축인 가로에서 5/6**이었다(SPEC-GESTURE-001 §C.1-⑰: 32px 세로 8/8 · 가로 5/6). **그 1px은 측정이 아니라 설계 선택으로 표시한다**(spec.md REQ-GEST2-PINCH-004 · §C.2).

**대응**: 이 SPEC은 후자를 **막지 못한다** — 측정이 없기 때문이다. 대신 **주장하지 않는다**: AC-GEST2-006은 "문턱 이하는 거부된다"만 검증하고 "문턱 초과는 인식된다"를 검증하지 않는다. 그 격차는 spec.md §C.2에 미해결로 기록돼 있고, 실측은 계측 APK SPEC이 Android를 열 때 양 플랫폼에서 함께 한다.

### B.4 `performActions` 일반화가 기존 `tap`·`swipe`를 건드린다 [중간 · 회귀 주의]

포인터 배열을 N개로 늘리는 변경은 `tap`(`:178`)과 `swipe`(`:200`)가 공유하는 함수에 들어간다. 형태를 잘못 바꾸면 **이미 실기기에서 확증된 두 경로가 조용히 깨진다.**

**대응**: 시그니처 확장은 **가법**으로 한다 — 기존 단일 포인터 호출 형태가 그대로 컴파일·동작해야 한다. 기존 `wda-backend.test.ts`의 `tap`/`swipe` 봉투 단언 전건 통과를 게이트로 삼는다. 봉투 형태를 바꾸는 리팩터가 필요해지면 그 자체를 별도 커밋으로 분리해 회귀 지점을 좁힌다.

### B.5 `withRecovery` 중첩 금지 [중간 · 조용히 깨진다]

`wda-backend.ts`의 `@MX:ANCHOR`가 "공개 메서드 하나만 감싼다"를 못박는다 — `tap`이 내부에서 스크린샷을 찍어 배율을 구하므로, 안쪽까지 감싸면 한 번의 조작에서 재기동이 두 번 일어나 SPEC-IOS-002의 AC-IOS2-014("정확히 1회")가 깨진다.

**대응**: `pinch`/`doubleTap`도 **공개 메서드에서 한 번만** `withRecovery`로 감싸고, 내부는 감싸지 않은 `captureScreenshot`/`ensureGeometry`를 쓴다. 기존 `tap`/`swipe`와 완전히 같은 형태를 따른다.

### B.6 Android 거부가 조용한 no-op으로 퇴화할 위험 [높음 — 이 SPEC의 정직성 축]

`AdbBackend`가 두 메서드를 "그냥 아무것도 안 하는" 구현으로 채우면 타입 체크는 통과하고 `ok:true`가 반환된다. 그것은 이 SPEC이 막으려는 바로 그 결함이다.

**대응**: 던지는 오류에 **타입**을 준다(`gesture-errors.ts`). 타입이 있으면 `backendFailure`가 코드를 그대로 노출하고, 테스트가 `rejects.toThrow`로 판정할 수 있다. AC-GEST2-008이 두 메서드 각각에 대해 **제스처 미전송 + 전용 코드**를 함께 검증한다.

### B.7 mock으로는 확대가 일어났는지 볼 수 없다 [최고 — 판정 규율]

이 저장소의 기록: **`ok:true`는 관측 가능한 효과의 증거가 아니다.** mock 실행기는 argv/봉투까지만 본다. 핀치·더블탭의 **효과**는 mock 사정거리 밖이다.

**대응**: 효과를 주장하는 AC(AC-GEST2-011 · 012)는 **실기기 관측**을 명시적으로 요구하며, 판정 무대(어느 앱·어느 화면에서 봤는가)를 함께 기록한다. 실기기 없이 마감하면 그 AC는 **PARTIAL**로 남기고 "아마 될 것"이라고 쓰지 않는다.

### B.8 검증 캡처가 식별정보를 흘린다 [중간 · 보안]

실기기 확인에 캡처를 쓰는데 `.moai/reports/`는 gitignore 대상이 아니다. 지도·연락처·메일 화면은 개인정보를 포함할 수 있다.

**대응**: 판정 근거는 **관측 서술**(무엇이 읽히게 됐는가)로 남기고 캡처 원본을 저장소에 넣지 않는다. 넣어야 한다면 먼저 `git check-ignore`로 확인한다. 확대 대상 화면은 개인정보가 없는 것을 고른다(측정에 쓰인 Apple 지도의 상업지 화면이 그 예다).

**0.2.0 정정 — 판정 근거에서 "바이트 크기"를 뺐다.** 0.1.0은 "바이트 크기·관측 서술"을 둘 다 허용했다. 그런데 **JPEG 캡처 바이트 크기는 화면 변화의 척도가 아니다**: 완전히 다른 축척의 두 이미지가 0.9%밖에 차이 나지 않았다(spec.md §C.1-⑬). 바이트 델타는 변화의 증거도 무변화의 증거도 아니므로, 저장소에 캡처를 안 넣으려는 이 대응이 **판정 자체를 못 쓰게 만드는 수치로 대체되면 안 된다.** 남기는 것은 서술이다 — "확대 전 X가 안 읽혔고 확대 후 읽혔다"는 캡처 없이도 재현 가능한 판정이고, 바이트 수는 그렇지 않다.

### B.9 지속시간을 확대 폭 조절 수단으로 오해할 위험 [낮음 · 그러나 조용하다]

재측정에서 "지속시간이 짧을수록 크게 확대된다"는 **인상**이 나왔고, 그것은 바이트 변화율에 근거한 것이어서 §C.1-⑬과 함께 **철회됐다**(spec.md §C.1-⑫). 지속시간이 확대 폭에 미치는 영향은 **미측정**이다.

**대응**: 상수 주석에 폭 관련 서술을 적지 않는다(AC-GEST2-003이 이를 실패 조건으로 건다). 지속시간을 조절해 배율을 제어하는 인자를 만들지 않는다(spec.md §D "지속시간과 확대 배율의 관계"). 실기기에서 확대 폭이 부족해 보이면 만질 곳은 지속시간이 아니라 **간격 산식**이다(B.2).

## §C. 사전 점검 (Pre-flight)

```bash
git branch --show-current && git rev-parse HEAD
pnpm vitest run                 # 기준선 41 파일 805건
pnpm typecheck && pnpm build    # exit 0

# 인터페이스 표면 기준선 (M1 후 12가 된다)
grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts

# 갱신 대상 테스트 더블 (손으로 센 목록 대신 이 명령을 쓴다)
grep -rc "getMinEffectiveSwipeThreshold: " src --include="*.test.ts" | grep -v ":0"

# 런타임 의존성 0 확인 (이 SPEC이 지켜야 하는 불변)
grep -c '"dependencies"' package.json    # 기대: 0

# 기기 연결 (M6 전제)
node dist/cli/bin.js devices
```

**M6 전제 — iOS 기기가 실제로 조작 가능한지 먼저 확인한다.**

```bash
node dist/cli/bin.js doctor --yes
# 확인: wda.reachable:true 그리고 controllable:"ok"
# 응답과 조작 권한은 다른 사실이다 — /status가 200이어도 조작만 500일 수 있다.
# 서명 만료가 가까우면 재빌드 + 기기에서 UI 자동화 재승인이 추가로 필요하다.
```

## §D. 제약

- `DeviceBackend` 기존 10메서드 변경 금지 — `pinch`·`doubleTap` 추가만
- §A.3에 없는 파일 수정 금지. 특히 `scroll.ts` / `scroll-geometry.ts` / `geometry.ts`는 PRESERVE
- **런타임 의존성 추가 금지** — `package.json` `dependencies` 부재 상태를 유지한다
- **제품 코드에서 `adb`·`xcrun`·WDA 직접 호출 금지** — 전부 백엔드 경유
- 코드 주석·문서는 한국어(`code_comments: ko`), 식별자·명령명·오류 코드는 영어
- `--no-verify`, `--amend`, force-push 금지. Conventional Commits + `🗿 MoAI` 트레일러
- **관측하지 않은 것을 PASS로 쓰지 않는다.** mock 통과를 실기기 효과의 근거로 쓰지 않는다

## §E. 자체 검증

마일스톤마다: AC PASS/FAIL 매트릭스 + **실제 명령 출력**, `pnpm vitest run` / `pnpm typecheck` / `pnpm build` 결과, 실기기 확인 항목은 **무엇을 어느 화면에서 봤는지**까지.

각 보고는 5절 형식(주장 / 증거 / 기준선 귀속 / 미검증 / 잔여 위험)을 따른다. **미검증 절이 비어 있다는 것은 "빠뜨린 것이 없다"는 강한 주장**이므로, 의심스러우면 적는다.

## §F. 마일스톤 (번복 가능성 내림차순)

### M1 — `DeviceBackend` 2메서드 가법 확장 + 구현체 2개 [최고 변경 확률]

시그니처가 바뀌면 나머지가 전부 따라 바뀐다. 먼저 확정한다.

**산출물**

1. `src/schema/device-backend.ts` — `pinch(serial, fingers)` · `doubleTap(serial, x, y)` 추가.
   - **`options?`를 두지 않는다(0.4.0 정정).** 0.1.0~0.3.0은 여기 `options?`를 적었으나 **실을 후보가 없다** — 봉투의 두 지속시간은 REQ-GEST2-PINCH-002 ⑤가 봉투 계층의 상수로 고정했고 spec.md §D가 표면 노출을 금지하며, `--amount`·`--from`은 백엔드에 닿기 전에 좌표로 해소된다. 구현은 이미 `pinch(serial, fingers)`로 나왔고(`src/schema/device-backend.ts:309`) 이 문서가 그것에 맞춰진다. 비어 있는 확장점은 §D가 금지한 것을 나중에 들여오는 통로가 된다.
   - `fingers`는 **2개 고정**(`[PinchGesture, PinchGesture]`), 각 원소는 `{ from: SwipePoint; to: SwipePoint }`. 가변 길이로 열지 않는다 — 측정된 것은 포인터 2개뿐이다(spec.md §D "3개 이상의 손가락").
   - 백엔드는 **이미 계산된 좌표**를 받는다(spec.md E5). 방향·비율·화면 크기는 이 계층에 들어오지 않는다.
   - `@MX:ANCHOR` 본문의 "10-method surface" 문구를 갱신한다 — 갱신하지 않으면 앵커가 거짓이 된다.
2. `src/backend/gesture-errors.ts` **신규** — `code = "UNSUPPORTED_GESTURE_ON_ANDROID"`인 오류 클래스. `WdaUnsupportedKeyError`와 같은 형태(`code` 프로퍼티 + `name`).
   - **생성자가 사유를 받는다.** 핀치와 더블탭의 막힌 원인이 다르므로(보안 정책 / 기동 비용) 메시지를 하나로 뭉개지 않는다.
   - `launch-errors.ts`의 선례를 따라 **신규 모듈**이다 — `wda-errors.ts`는 iOS 전용이라 어울리지 않는다.
3. `src/backend/wda-backend.ts` —
   - `performActions`를 **포인터 N개**로 일반화한다. 기존 단일 포인터 호출이 그대로 컴파일·동작해야 한다(B.4).
   - `pinch`: 두 포인터(`finger1`/`finger2`)를 한 봉투에. 각 포인터는 `pointerMove(시작) → pointerDown → pause(120 ms) → pointerMove(끝, 700 ms) → pointerUp`. 좌표는 `toWdaPoint`로 포인트 환산(기존 경로 그대로).
   - **지속시간은 이 계층이 정하고, 이름 붙은 상수로 봉투에 명시적으로 싣는다**(REQ-GEST2-PINCH-002 ⑤ — 0.2.0에서 확정). 0.1.0은 이 결정을 "어느 계층이 정할지"로 열어 뒀는데, 봉투를 만드는 유일한 자리가 `performActions`이므로 상수도 여기 있는 것이 맞다. CLI 표면에 노출하지 않는 것은 `SCROLL_SWIPE_DURATION_MS`·`DOUBLE_TAP_GAP_MS`와 같은 성격이다.
   - `doubleTap`: 한 요청에 `pointerMove → down → up → pause(DOUBLE_TAP_GAP_MS) → down → up`.
   - **세 상수에 이름을 준다** — 더블탭 간격은 **`DOUBLE_TAP_GAP_MS`**(REQ-GEST2-DTAP-002가 이름을 확정), 핀치 봉투의 `pause`와 이동시간은 각각 이름 붙은 `*_MS` 상수(REQ-GEST2-PINCH-002 ⑤). AC-GEST2-003·004의 오라클이 **선언 형태**를 보므로 행 첫머리 `const NAME_MS = <정수>;` 형태로 선언한다.
   - **각 값 옆에 자격을 남긴다.** 60 ms는 "동작이 확인된 값이지 경계값이 아니다"(spec.md §C.1-⑧). 120/700 ms는 "**최초로 확대를 관측한 봉투의 값**이며 경계값도 최적값도 아니다"(§C.1-①·⑪·⑫) — `pointerMove`는 `0 ms`에서도 동작이 관측됐고, 지속시간이 확대 **폭**에 미치는 영향은 미측정이다. **"짧을수록 크게 확대된다" 계열의 서술을 적으면 AC-GEST2-003이 실패한다**(그 인상은 철회됐다).
   - `withRecovery`는 **공개 메서드 한 겹만**(B.5).
4. `src/backend/adb-backend.ts` — 두 메서드 모두 `gesture-errors.ts`의 오류를 던진다. **어떤 `exec`도 부르지 않는다** — 기기에 닿기 전에 끝난다.
5. 트립와이어·테스트 더블 갱신 — `device-backend.test.ts`의 `toHaveLength(10)` → 12 + 문구 갱신, §B.1의 세는 명령이 가리키는 더블 전부.

**왜 1번인가**: `fingers`를 2-튜플로 받을지 앵커+간격으로 받을지 같은 결정이 여기서 굳고, 되돌리기 비싸다. (0.1.0이 여기 함께 열어 뒀던 "지속시간을 어느 계층이 정할지"는 **0.2.0에서 닫혔다** — 봉투 계층이 정하고 상수로 싣는다.)

### M2 — 핀치 기하 순수 함수 [높음 · 산식이 실기기에서 뒤집힐 수 있다]

> **0.4.0 — 이 마일스톤은 재작업 대상이다.** M1·M2 구현이 끝난 뒤 `pinchTravelPx`가 문턱 판정의 대상으로 부적격함이 실행으로 드러났다(spec.md §C.1-⑭, `## Amendments` 0.4.0 결함 2). 아래 산출물 1의 이동량 정의가 바뀌었고, **다른 항목은 그대로다.**

**산출물**

1. `src/cli/commands/pinch-geometry.ts` **신규** — 방향·비율·앵커·화면 크기 → 손가락 2개의 `from`/`to`. `scroll-geometry.ts`와 같은 성격(기기 없이 픽스처로 검증되는 순수 함수).
   - REQ-GEST2-PINCH-002의 ①~③ 간격·배치 산식을 그대로 구현하고, ④의 이동량은 **③이 만든 좌표에서** 잰다(아래 재작업 항목).
   - **판정 3종을 함께 노출한다**: 화면 밖 여부(REQ-GEST2-PINCH-003), 손가락당 이동 거리(REQ-GEST2-PINCH-004의 판정 대상), 그리고 각 거부에 실을 **유효 최대/최소 비율**.
   - **이동량은 실제 좌표에서 잰다 — 간격에서 유도하지 않는다(0.4.0 재작업).** ③이 만든 정수 좌표에서 손가락별 `|to.x − from.x|`를 재고 **작은 쪽**을 돌려준다. 기존 `round((wideGap − narrowGap)/2)`는 표본 절반에서 실제보다 **1px 크게** 읽었고(과소 읽기는 0건), 그 방향이 문턱 아래 제스처를 통과시키는 방향이다. `scroll-geometry.ts:165`가 반올림 **이후** 좌표로 판정하는 것과 같은 자리로 돌아온다.
   - **재작업의 범위가 좁다는 근거 두 가지(실행 확인, spec.md §C.1-⑭)**: ⓐ 실제 이동량은 **앵커에 의존하지 않으므로**(1200 비교 중 0건) 함수 입력을 (비율, 화면)에서 늘릴 필요가 없다. ⓑ 작은 쪽 이동량은 비율에 대해 **단조 비감소**이므로(6000 검사 중 위반 0건) `pinchValidRatioRange`의 이진 탐색 전제가 그대로 성립하고 탐색 코드는 손대지 않는다.
   - `pinchTravelPx`의 `@MX:NOTE`(산식과 실제 이동량이 1px 갈릴 수 있다는 이의)는 **정정과 함께 갱신한다** — 이의가 받아들여졌으므로 그대로 두면 주석이 거짓이 된다.
   - 유효 비율이 **존재하지 않는 경우**를 표현할 수 있어야 한다(앵커가 가장자리에 붙었거나 화면이 너무 작은 경우) — 없는 값을 지어내지 않는다.
   - `narrowGap` 비율은 **이름 붙은 상수**로 두고 "설계 선택이지 실측값이 아니다"를 옆에 적는다(B.2).
2. 픽스처 다양화 — SPEC-GESTURE-001 B.7이 두 번 배운 교훈을 그대로 적용한다: **한 화면 크기로 기하를 검증하면 그 화면의 성질이 규칙처럼 보인다.**
   - 화면: 짝·짝 / 폭 홀 / 홀·홀 최소 세 벌
   - 앵커: 중앙 / 가장자리 근접 / 모서리
   - 기댓값은 **함수를 부르지 않고 손으로 유도한 상수**로 적는다 — 자기 출력을 기댓값으로 쓰면 함수가 틀려도 초록이다(그 SPEC의 동어반복 제거와 같은 규율)

### M3 — `pinch` CLI 명령 [높음 · 사용자 대면]

**산출물**

1. `src/cli/commands/pinch.ts` **신규**. 거부 순서는 `scroll.ts`와 **같은 구조**로 짠다:
   방향 파싱 → 좌표 파싱 → `--amount` 파싱 → `resolveCoordinateMapper`(`--from`) → `resolveTargetDevice` → `getScreenSize` → `getMinEffectiveSwipeThreshold` → 기하 판정 → `backend.pinch`.
   - **앞의 네 단계에서 거부되면 백엔드 조작 호출이 0회여야 한다.** `--from` 해석은 백엔드 호출보다 앞선다(`from-capture.ts`의 `@MX:ANCHOR`).
   - `AMOUNT_TOO_SMALL` 응답 형태는 `scroll`과 **같다**(`requestedRatio` / `minValidRatio` / `minValidRatioBasis`) — 두 명령이 다른 형태를 내면 호출자가 명령별 분기를 하게 된다.
   - `PINCH_OUT_OF_BOUNDS`는 `maxValidRatio`를 싣되, 그런 비율이 없으면 필드를 **생략**한다.
2. `src/cli/router.ts` — `COMMANDS`에 `pinch` 등록.
3. `args.ts`는 **건드리지 않는다** — `--amount`/`--from`/`--stale-ok`가 이미 선언돼 있다. 건드려야 한다고 판단되면 그 자체가 설계가 어긋났다는 신호다.

### M4 — `doubletap` CLI 명령 [중간 · 사용자 대면]

**산출물**

1. `src/cli/commands/doubletap.ts` **신규** — `tap.ts`의 형태를 그대로 따른다: 좌표 파싱 → `resolveCoordinateMapper` → `resolveTargetDevice` → `backend.doubleTap`.
   - 화면 크기도 문턱도 쓰지 않는다. `tap`보다 복잡해지면 무언가 잘못된 것이다.
2. `src/cli/router.ts` — `COMMANDS`에 `doubletap` 등록.
3. 명령명은 **`doubletap`**(한 단어). `double-tap`이 아니다 — 기존 명령이 전부 한 단어이거나 하이픈 없는 형태다(`screenshot`/`scroll`/`swipe`).

### M5 — 페이로드 계약 + 오류 코드 노출 배선 [낮음 · 기계적]

**산출물**

1. `src/schema/command-payloads.ts` — `PinchPayload`(serial · direction · 손가락 2개의 from/to) · `DoubleTapPayload`(serial · x · y).
   - `PinchPayload`는 REQ-GEST2-PINCH-005를 만족해야 한다: **방향과 실제 좌표 둘 다.** 하나만 있으면 방향 반전이 응답에서 드러나지 않는다.
   - 기존 타입의 조합으로 만든다(`SwipePoint` 재사용). 같은 형태를 새로 정의하지 않는다.
2. `src/schema/command-payloads.test.ts` — 두 타입의 키 집합 양방향 소진 검사.
3. `src/cli/commands/types.ts` — `backendFailure`의 타입 있는 오류 통과 목록에 신규 오류를 더하고, 주석의 코드 목록에 한 줄 추가한다.
4. `src/cli/commands/backend-failure.test.ts` — 매핑 표에 1행 추가.

**왜 마지막에서 두 번째인가**: 전부 앞 마일스톤의 결정에 종속된 기계적 배선이다. 앞이 확정되기 전에 하면 두 번 한다.

### M6 — 실기기 e2e [필수 · 마감 조건]

**이 마일스톤 없이는 `completed`로 마감하지 않는다.**

**마감 게이트와 PARTIAL의 구속 관계(0.2.0 명시).** 이 마일스톤의 산출물은 AC-GEST2-011·012이고, 두 AC는 실기기가 없으면 **PARTIAL**로 남는다(acceptance.md 원칙 1). 두 규정을 잇는 문장은 이것이다:

> **PARTIAL ≠ PASS이며, PARTIAL은 `implemented → completed` 전이를 막는다.**

즉 실기기 없이 도달할 수 있는 최대 상태는 **`implemented`**다. 기기가 없다는 사실이 마감의 **면제**가 되지 않는다 — 오히려 그 반대로, 이 SPEC의 유일한 미검증 축(간격 산식, spec.md §C.1-⑨)을 막는 마지막 관문이 여기다. 0.1.0은 "기기 없으면 PARTIAL"(acceptance.md)과 "M6 없이는 마감 금지"(이 문서)를 서로 다른 문서에 따로 적어 두고 잇지 않았다.

**PARTIAL로 남는 경우 무엇을 하는가**: (a) 어느 AC가 왜 PARTIAL인지 progress.md에 남기고, (b) `status`를 `implemented`에서 멈추며, (c) "아마 될 것"이라고 적지 않는다. **이 구속에 예외를 두지 않는다 — Android 거부 확인(아래 4번)도 포함이다**(0.3.0).

**0.3.0 — 4번 면제 조항을 철회한다.** 0.2.0은 여기에 "Android 거부 확인은 기기 부재 시 PARTIAL이 허용되되 마감을 막지 않는다"는 예외를 두었다. 그 조항을 지우는 이유는 셋이다.

1. **전제가 사실이 아니었다.** 면제는 "이 SPEC이 필요로 하지 않는 Android 기기"를 피하려고 섰는데, 그 기기(**SM_G960N**)는 같은 날 M-1~M-4b를 진 기기이고 **지금도 붙어 있다** — 2026-08-25 `devices` 실행 결과 `SM_G960N` / `connectionState: "device"`. 면제는 존재하지 않는 부담을 피하고 있었다. (기기 연결 여부는 몇 시간이면 낡는 사실이므로 **이 철회의 근거로만 쓰고, 아래 구속의 근거로는 쓰지 않는다** — 구속은 acceptance.md 원칙 1에 서지 기기 상태에 서지 않는다.)
2. **예외 하나가 갈라질 표면 하나다.** D2는 "기기 없으면 PARTIAL"(acceptance.md)과 "M6 없이는 마감 금지"(이 문서)가 서로를 모르던 문제였다. 0.2.0의 D2 수정은 두 문서를 이어 놓고 **그 옆에 한 문서에만 사는 새 예외를 만들었다** — 같은 결함 모양의 재생산이다. 예외를 양쪽 문서에 적는 길도 있었지만 그것은 어긋날 표면을 계속 유지하는 선택이고, **예외를 없애면 유지할 표면이 없다.**
3. **면제의 실질 논거는 옳지만 잔여가 있다.** "mock이 거부 경로를 완전히 단언하므로 실기기 절은 보강"이라는 논거 자체는 맞다 — AC-GEST2-008은 mock `adb` 실행기 **0회 호출**을 양성 대조와 함께 단언하므로 거부가 기기에 닿지 않음이 증명되고, 실기기의 "화면이 변하지 않는다"는 그것의 귀결이다. 다만 mock이 보지 못하는 것이 하나 남는다 — **실기기가 실제로 `AdbBackend`로 라우팅되는가.** 그 라우팅은 이미 `completed`된 SPEC의 소관이라 위험은 낮지만 0은 아니고, 확인 비용은 명령 두 번이다.

**기기가 마감 시점에 없으면 어떻게 하는가**: 미리 새겨 둔 면제가 아니라 **그 시점의 명시적 판단**으로 다룬다. 면제를 문서에 새겨 두면 "기기가 없다"는 사실이 자동으로 마감 허가가 된다 — 이 SPEC 계열이 반복해 지워 온 형태다.

**산출물**

1. **핀치 확대**(AC-GEST2-011) — iOS 실기기에서 `pinch out <x> <y>` 실행 후 **화면이 실제로 확대된 것을 캡처로 확증**한다. 판정 기준을 미리 정한다: 확대 전에는 읽히지 않던 요소가 확대 후 읽히는가. 대상 화면은 개인정보가 없는 것을 고른다(B.8).
2. **핀치 축소** — `pinch in`이 반대 방향으로 동작하는지 확인한다. **`out`만 확인하고 `in`을 추론하지 않는다** — 방향 반전은 오류 없이 조용히 일어난다(spec.md §A.5).
3. **더블탭**(AC-GEST2-012) — `doubletap <x> <y>`가 더블탭으로 인식되는지 확증한다. **대조로 `tap` 2회를 같은 좌표에 실행해 그것이 인식되지 **않는** 것도 함께 관측한다** — REQ-GEST2-DTAP-003이 문서에 적을 주장의 근거가 이 대조다.
4. **Android 거부**(AC-GEST2-008) — Android 실기기에서 두 명령이 `UNSUPPORTED_GESTURE_ON_ANDROID`를 반환하고 화면이 변하지 않음을 확인한다. mock이 보지 못하는 것 하나를 여기서 본다: **실기기가 실제로 `AdbBackend`로 라우팅되는가.** 기기가 없으면 **PARTIAL**로 남기며, **그 PARTIAL도 마감을 막는다** — 1~3번과 같은 구속이다(0.3.0, 면제 철회).
5. **결과를 spec.md §C.1에 실측으로 기록한다** — 특히 B.2에서 조정한 값이 있다면 조정된 값과 그 근거를 남긴다.

**판정 규율(B.7)**: 판정은 `ok:true`가 아니라 **화면**으로 한다. 무엇을 어느 앱·어느 화면에서 봤는지 한 줄로 남긴다. 확인하지 못한 항목은 "미측정"으로 적고 빈칸으로 두지 않는다.
