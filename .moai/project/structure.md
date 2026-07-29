# explore-mobile — 구조 문서

> 최종 갱신: 2026-07-29 · branch `master` (HEAD SHA는 기록하지 않음 — 이 문서 자체를 만드는 커밋이 그 SHA를 즉시 진부하게 만들기 때문. 이 문서가 서술하는 코드 트리 상태는 이 문서 3종을 생성/갱신하는 커밋의 부모 트리다.)
> 아키텍처는 정직하게 이름 붙인다: MVC도 아니고, 교과서적 Clean/Hexagonal도 아니고, 마이크로서비스는 더더욱 아니다. **하나의 교체 가능한 드라이버 인터페이스(`DeviceBackend`)를 중심으로 한, 단일 프로세스 단발성(single-shot) CLI 레이어드 파이프라인**이다. 모든 I/O 경계에 의존성 주입이 있어(이것이 기기 없이 테스트 가능한 이유), 순수 함수 정규화 코어를 갖는다.

## 1. 디렉터리 트리 (목적 포함)

```
src/
  schema/       # 계약. schema/ 바깥 계층을 import하지 않는다 — 계층의 바닥.
  normalize/    # 순수 함수. 원시 플랫폼 포맷 -> schema/ 형태.
  backend/      # 서브프로세스 래퍼 + 환경 서비스(doctor/reset). adb/idb를 직접 다루는 유일한 층.
  cli/          # 인자 파싱, 라우터, envelope, 12개 명령 핸들러(cli/commands/).
  webview/      # iOS `--web` 경로 전용(WebKit Inspector Protocol 프록시 클라이언트).
  index.ts      # 공개 라이브러리 진입점(barrel) — §6에 정확한 현재 export 목록.
tests/
  fixtures/     # 데이터만 존재 — 테스트 코드는 없다(uiautomator XML, idb JSON 픽스처).
vendor/
  adbkeyboard/  # ADBKeyBoard(GPL-2.0) 관련 문서 — APK 자체는 번들되지 않는다(tech.md §의존성 참조).
dist/           # tsc -p tsconfig.build.json 산출물 (.gitignore 대상 — dist/, 저장소에 커밋되지 않음)
.moai/specs/    # SPEC-ANDROID-001 / SPEC-IOS-001 / SPEC-WEBVIEW-001 / SPEC-GESTURE-001 (전부 status: completed, 실측)
```

`src/` 최상위는 디렉터리 5개 + 파일 2개(`index.ts` barrel, `skill-wrapper.test.ts` — §7 참조)로 구성된다(`find src -maxdepth 1`로 실측 확인).

## 2. 레이어 의존 방향 (순환 없음)

```
src/schema/  ←  src/normalize/  ←  src/backend/  ←  src/cli/
   (계약)         (순수 정규화)      (서브프로세스)     (인자·라우팅·명령)
```

- `schema/`는 schema/ 바깥의 어떤 계층도 import하지 않는다(내부적으로 `device-backend.ts:24`가 `common-element.ts`의 타입 1건만 import·재수출).
- `normalize/`는 순수 함수 모음(예: `normalizeUiAutomatorXml`, `normalizeIdbAccessibility`). 이 저장소 안에서는 `schema/`의 타입만 참조하지만 외부 의존성이 하나 있다 — `uiautomator.ts:18`이 `fast-xml-parser`를 값으로 import한다(이 패키지의 유일한 런타임 의존성이 소비되는 유일한 지점).
- `backend/`는 `schema/`를 구현하고(`AdbBackend`, `IdbBackend`가 `DeviceBackend` 인터페이스를 구현), 자신의 정규화는 내부에서 `normalize/`를 호출한다.
- `cli/`의 **명령 핸들러**(`src/cli/commands/*.ts`)는 `DeviceBackend` 인터페이스만 보고, `backend/`의 구체 클래스나 raw adb/idb를 직접 알지 못한다(합성 루트 `bin.ts:18-22`와 `router.ts:12-13`은 구체 클래스·백엔드 구현체를 직접 조립하는 자리라 이 범위 밖의 예외이며, 명령 핸들러 쪽 실제 예외는 **§6** 참조).
- `webview/`는 iOS `--web` 경로 전용 보조 계층으로, `cli/commands/web-support.ts`(주 소비자)와 `cli/commands/doctor.ts`(`checkWebInspectorProxy` 진단 호출, `doctor.ts:27`)에서 소비된다.

이 방향 덕분에 iOS 백엔드(SPEC-IOS-001)는 CLI/정규화 계층을 재설계하지 않고 `DeviceBackend`의 새 구현체(`IdbBackend`)를 추가하는 것만으로 들어왔다 — `src/schema/device-backend.ts`의 문서 주석이 이를 직접 서술한다.

## 3. `DeviceBackend` + `BackendRegistry` 계약

`src/schema/device-backend.ts`의 `DeviceBackend` 인터페이스는 **10개 메서드**를 정의한다(`grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` = 10, 실행 확인): `listDevices`, `dumpUiHierarchy`, `screenshot`, `tap`, `inputText`, `sendKeyEvent`, `launchApp`, `stopApp`, `swipe`, `getMinEffectiveSwipeThreshold`.

- 처음 8개는 SPEC-ANDROID-001이 정의했고, `swipe`(SPEC-GESTURE-001 M1)와 `getMinEffectiveSwipeThreshold`(M8)가 추가만 되었다 — 기존 8개는 형태·동작 불변.
- `AdbBackend`와 `IdbBackend`가 **동일한 10-메서드 표면**을 구현한다(`device-backend.ts`의 `@MX:ANCHOR` 주석이 이를 불변식으로 못박는다). CLI 명령 핸들러와 백엔드 레지스트리 전체가 이 표면에 의존하므로, 여기를 바꾸면 모든 백엔드와 명령 계층에 파급된다.
- `BackendRegistry`(`src/backend/registry.ts`)는 그 자체로 `DeviceBackend`를 **구현**한다 — 진짜 백엔드가 아니라 시리얼→백엔드 라우팅을 위한 **파사드**다. `listAllDevices()`가 이용 가능한 모든 백엔드(adb + idb)의 기기 목록을 병합하고, 그 외 모든 메서드는 `resolveOwningBackend(serial)`로 소유 백엔드를 찾아 위임한다. 이 설계 덕분에 `bin.ts`는 `BackendRegistry` 인스턴스 하나만 만들어 `runCli`에 넘기면 되고, `cli/router.ts`·명령 핸들러·`device-targeting.ts`의 `resolveTargetDevice`는 시그니처 변경 없이 크로스플랫폼 라우팅을 얻는다.
- 우아한 성능 저하(graceful degradation): 한 백엔드의 `isAvailable()`이 false이거나 목록 조회 중 예외를 던지면, 그 백엔드는 0개 기기를 기여하고 나머지는 정상 작동한다 — "idb 미설치 → Android 기기만 보임"이 이 메커니즘으로 구현된다.
- 시리얼 충돌 정책: 병합된 목록에서 동일 시리얼이 2개 이상 매치되면 임의로 하나를 고르지 않고 `null`(= not found)을 반환한다(`resolveBackend`의 `@MX:NOTE`).

## 4. 정규화 계층과 공통 요소 스키마

`src/schema/common-element.ts`의 `CommonElement`가 모든 백엔드가 정규화 결과를 담는 **불변 계약**이다:

```
{ role, text, id, bounds{x,y,w,h}, tappable, enabled, children[] }
```

- Android: `class → role`, `resource-id → id`, `text/content-desc → text`, `bounds → bounds`, `(clickable && enabled) → tappable`.
- iOS(idb): `type → role`(주 소스, AX-접두 `role`은 폴백), `AXLabel → text`, `AXUniqueId → id`, `frame{x,y,width,height} → bounds`, `enabled`(필드명이 `isEnabled`가 아니라 `enabled` — 원래 SPEC-ANDROID-001의 가정은 틀렸고 SPEC-IOS-001에서 idb 실제 JSON 출력 대조로 정정됨), `tappable`은 `AXTraits` 필드가 실제로 존재하지 않아 `(type/role/subrole이 상호작용을 나타냄 OR custom_actions 비어있지 않음) AND enabled===true`로 도출.

각 백엔드가 **자신의 원시 포맷을 내부에서** 정규화 함수(`normalizeUiAutomatorXml`, `normalizeIdbAccessibility`)로 변환한 뒤 `CommonElement[]`를 반환한다 — `DeviceBackend.dumpUiHierarchy`의 반환 타입 자체가 `CommonElement[]`다(원시 문자열이 아니다). 이 덕분에 명령 계층(`dump.ts`/`tap.ts`/`text.ts`)은 raw 플랫폼 포맷을 절대 보지 않고, 셀렉터 기반 `tap`/`text`가 iOS에서도 명령 계층 변경 없이 동작한다.

웹 콘텐츠 경로는 별도 정규화 함수 `normalize/webdom.ts`가 담당하며, `src/webview/` 하위 프록시 클라이언트가 수집한 WebKit Inspector Protocol 결과를 같은 `CommonElement` 형태로 변환한다.

## 5. 플랫폼 지식이 의도적으로 배제된 경계

이 프로젝트의 가장 흥미로운 구조적 사실: **어디에 플랫폼 지식이 모여 있고, 어디서 의도적으로 배제되었는가.**

- **밀도(density)/화면 크기 접근자가 인터페이스에 없다.** `device-backend.ts`는 `getMinEffectiveSwipeThreshold`가 "이 기기를 신뢰성 있게 움직이는 최소 스와이프 거리"라는 **도메인 질문**만 묻도록 설계했다 — "이 기기의 밀도가 얼마인가"를 노출하면 `IdbBackend`가 한 번도 그렇게 측정된 적 없는 값(iOS의 11pt)에 대해 `dp × density` 규칙을 억지로 지어내야 한다. `SwipeThreshold.basis: "device-query" | "measured-constant"`가 그 답이 어떻게 얻어졌는지(살아있는 기기 질의 vs 다른 기기에서 측정된 상수)를 구분해, 두 값이 서로 바꿔치기될 수 없게 만든다.
- **`src/cli/commands/*` 명령 핸들러는 원칙적으로 raw `adb`/`idb` 문자열을 인자로 직접 다루지 않는다** — 명령 계층은 `DeviceBackend` 인터페이스만 통해 동작하도록 설계되었다(`types.ts`의 문서 주석: "CLI -> normalize/device-backend interface -> adb/idb wrapper"). 다만 grep 검증(`grep -n "adb\|idb" src/cli/commands/*.ts`) 결과 완전히 0건은 아니다 — §6의 예외 참조.
- `.claude/skills/explore-mobile/` 스킬 자체가 raw 플랫폼 명령을 절대 호출하지 않는다는 것은 **`src/skill-wrapper.test.ts`**(87줄)가 기계적으로 강제한다 — `.claude/skills/explore-mobile/` 디렉터리 전체를 스캔해 독립 단어 `adb`가 등장하면 실패하는 정규식(`/(^|[^A-Za-z])adb([^A-Za-z]|$)/`)을 쓴다. 이 테스트는 스킬 디렉터리 안에 있지 않고 `src/` 안에 있다(정정 — 인터뷰/사전 조사 메모는 "스킬 디렉터리에 있는 테스트"로 서술했으나 실제로는 `src/skill-wrapper.test.ts`가 스킬 디렉터리를 대상으로 검사하는 구조).

## 6. 경계의 실제 예외 (실측)

grep으로 확인한 결과, "명령 핸들러는 adb/idb 문자열을 전혀 모른다"는 원칙에는 다음과 같은 실제 예외가 있다 — 전부 의도적이고 근거가 코드 주석에 남아 있다:

| 파일 | 예외 내용 | 근거 |
|---|---|---|
| `src/cli/commands/reset.ts` | `instanceof AdbBackend`로 세션 원본 IME를 복원 — iOS에는 이 개념 자체가 없음(idb 텍스트 입력은 상태 없음) | 파일 내 문서 주석 |
| `src/cli/commands/reset.ts`, `src/cli/commands/doctor.ts` | `resolvedDevice?.platform === "ios"` 분기(`grep -n 'platform === "ios"' src/cli/commands/*.ts`로 이 2개 파일만 매치) | iOS 전용 진단/복원 경로가 필요 |
| `src/cli/commands/doctor.ts` | 응답 JSON 필드명 자체가 `adb`/`adbKeyboard`/`idbEnvironment` — 이건 raw 명령 호출이 아니라 **플랫폼별 진단 결과를 담는 데이터 필드 이름**이라 위 원칙과 결이 다른 항목 | `doctor.ts` 본문 |
| `src/cli/commands/key.ts` | `import { UnsupportedKeyOnIosError } from "../../backend/idb-errors.js"` — 에러 타입 import(문자열 인자 아님) | — |
| `src/cli/commands/screenshot.ts`, `src/cli/commands/types.ts`, `src/cli/commands/text.ts` | 문서 주석 안에서 `adb`/`idb`를 설명 목적으로 언급(실행되는 로직 아님) | — |

즉 "명령 핸들러에 adb/idb 리터럴이 전혀 없다"는 서술은 실행 로직 기준으로는 대체로 맞지만, 문서 주석·에러 타입 import·진단 필드명까지 포함하면 완전히 0건은 아니다. 이 문서는 grep으로 실측한 결과를 그대로 남긴다.

## 7. 테스트 위치와 컨벤션

- **co-location**: 테스트는 `src/**/*.test.ts`로 소스 파일 옆에 위치한다(예: `src/backend/adb-backend.ts` ↔ `src/backend/adb-backend.test.ts`). `vitest.config.ts`의 `test.include: ["src/**/*.test.ts"]`가 이를 강제.
- **`tests/fixtures/`는 데이터 전용** — 테스트 코드가 아니라 uiautomator XML(5개 파일: basic/malformed/no-bounds/text-priority/unicode)과 idb JSON(2개 파일: basic/flat-multi) 픽스처만 존재.
- 커버리지 대상에서 제외되는 파일은 `vitest.config.ts`의 `coverage.exclude`에 명시(테스트 파일 자체, `cli/bin.ts`, `backend/adb-executor.ts`, `backend/process-executor.ts`) — 이유는 `tech.md` §커버리지 설정 참조.
- 실행 확인: `pnpm test` → 32개 테스트 파일, 702개 테스트, 모두 통과(exit 0).

## 8. `src/index.ts` barrel의 현재 상태 (발견 사항)

`src/index.ts`의 문서 주석은 여전히 "Public library entry point for SPEC-ANDROID-001... All 8 milestones are implemented"라고 서술하며 iOS/레지스트리/제스처 관련 언급이 없다. 실제 export 목록을 확인한 결과, 이 문서 주석뿐 아니라 **export 자체도** `IdbBackend`, `BackendRegistry`, `swipe`/제스처 관련 타입, `src/webview/` 중 어느 것도 포함하지 않는다(SPEC-ANDROID-001 시절 표면 그대로). 실제로는 `CommonElement`/`DeviceBackend`/`KEY_ALIASES`/`normalizeUiAutomatorXml`/`AdbBackend`/`parseAdbDevicesList`/`PerSerialState`/`ImeSessionStore` 계열/`AdbKeyboard*` 에러·상수/`ApkAcquirer`/`AdbDoctor`/`ProcessExecutor`/envelope 헬퍼(`success`/`failure`/`CommandResult`)/`runCli`까지 폭넓게 export하지만, 그 목록 안에 iOS·레지스트리·제스처·webview 관련 항목은 하나도 없다는 것이 핵심 발견이다. 이는 이 문서(`structure.md`)가 수정할 대상이 아니라(코드 파일 `src/index.ts` 자체가 대상), 이 절(§8)에 발견 사항으로만 기록해 둔다.
