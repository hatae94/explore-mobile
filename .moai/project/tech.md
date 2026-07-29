# explore-mobile — 기술 문서

> 최종 갱신: 2026-07-29 · HEAD `79231f0` (branch `master`)
> 아래 수치는 실행 결과("실행 확인")와 문서 기록("문서 기준")을 구분해 표기한다.

## 1. 스택 개요와 근거

| 항목 | 값 | 근거 |
|---|---|---|
| 언어 | TypeScript, ESM (`"type": "module"`) | `package.json` 실측 |
| 런타임 | Node.js `>= 22` | `package.json` `engines.node`, iOS 웹 경로가 Node 22.4+ 내장 `WebSocket`을 쓰기 때문(§3) |
| 패키지 매니저 | pnpm 10.27.0 | `package.json` `packageManager` |
| 빌드 | `tsc -p tsconfig.build.json` | 실행 확인: exit 0 |
| 타입체크 | `tsc --noEmit -p tsconfig.json` | 실행 확인: exit 0 |
| 테스트 | Vitest 4.1.10 | 실행 확인: 32 files / 702 tests, exit 0 |
| 커버리지 | `@vitest/coverage-v8` | 실행 확인(§6) |
| 라이선스 | MIT | `package.json` |

TypeScript ESM을 택한 이유는 문서화되어 있지 않지만, Node 내장 기능(fetch/WebSocket)을 의존성 없이 쓰겠다는 §3의 의존성 최소화 원칙과 직접 맞물린다 — CJS/ESM 상호운용 문제를 피하는 것이 부수 효과다.

## 2. 두 개의 엄격 플래그가 만드는 코드 스타일

`tsconfig.json`이 `strict: true` 위에 추가로 켠 두 플래그가 이 코드베이스 전역의 스타일을 결정한다:

- **`noUncheckedIndexedAccess: true`** — 배열/객체 인덱스 접근이 항상 `T | undefined`로 취급된다. `src/backend/registry.ts`의 `const device = matches[0]!;`처럼, 직전에 `matches.length !== 1`을 검사해 놓고도 인덱스 접근에는 `!` 단언이 필요하다는 뜻이다. 이 플래그가 강제하는 습관 덕분에 "존재를 가정한 인덱스 접근" 버그가 컴파일 시점에 드러난다.
- **`exactOptionalPropertyTypes: true`** — 선택적 프로퍼티(`prop?: T`)에 `undefined`를 명시적으로 대입하는 것과 프로퍼티를 아예 생략하는 것을 구분한다. `SwipeOptions.durationMs?: number`처럼 "값을 안 줬다"와 "undefined를 줬다"가 타입 레벨에서 달라진다.

두 플래그 모두 `tsconfig.json`(공유 base) → `tsconfig.build.json`(`extends`, `noEmit: false`로 재정의)에 이어진다. 실행 확인: `pnpm typecheck`/`pnpm build` 모두 exit 0으로, 현재 코드베이스는 두 플래그 아래 오류 없음.

## 3. 런타임 의존성 — 정확히 1개, 그리고 회피한 것들

`package.json`의 `dependencies`는 `fast-xml-parser`(`^5.10.1`) **하나뿐**이다(실측). 이는 인터뷰에서 확정된 "의존성 최소화" 제약(§9)의 직접적 결과이며, 각 회피 결정은 코드에 흔적이 남아 있다:

| 흔히 쓰는 라이브러리 | 대신 쓴 것 | 코드 근거 |
|---|---|---|
| `commander` (CLI 인자 파싱) | `node:util.parseArgs` (stdlib) | `src/cli/args.ts`: `import { parseArgs } from "node:util";`, 문서 주석 "Uses `node:util.parseArgs`" |
| `ws` (WebSocket 클라이언트) | Node 내장 `WebSocket` | `engines.node >= 22`가 이 때문에 존재(22.4부터 내장 지원); `src/webview/proxy-service.ts`가 `pageWebSocketUrl` 등을 다룸 |
| `axios`/`node-fetch` (HTTP 클라이언트) | 전역 `fetch` | `src/webview/proxy-service.ts`, `src/backend/apk-downloader.ts`의 `fetchImpl: FetchLike = fetch` — 테스트 가능성을 위해 `FetchLike`로 주입 가능하게 함 |
| ADBKeyBoard APK 번들 | 런타임 다운로드(`doctor`가 GitHub Releases의 고정 태그에서 취득) | ADBKeyBoard는 GPL-2.0이고 이 패키지는 MIT — `vendor/adbkeyboard/README.md`에 라이선스 준수 근거 기록, `src/backend/apk-downloader.ts`가 다운로드/캐시 로직 담당 |

`fast-xml-parser`가 유일하게 남은 이유: Android `uiautomator` 덤프가 XML이고, 이를 파싱하는 표준 라이브러리가 Node stdlib에 없기 때문(정규화 로직 자체는 `src/normalize/uiautomator.ts`의 순수 함수).

## 4. 개발 의존성

`package.json` `devDependencies`(실측):

```
@types/node        ^26.1.1
@vitest/coverage-v8 ^4.1.10
typescript          ^7.0.2
vitest              ^4.1.10
```

프로덕션 코드에 영향을 주지 않는 타입 선언·테스트 러너·커버리지 도구·컴파일러뿐이며, 린터·포매터·번들러는 없다(§7 참조).

## 5. 검증 명령 (전부 실행 확인)

| 명령 | 스크립트 | 실행 결과 |
|---|---|---|
| `pnpm test` | `vitest run` | exit 0 — `Test Files 32 passed (32)`, `Tests 702 passed (702)`, Duration 550ms |
| `pnpm typecheck` | `tsc --noEmit -p tsconfig.json` | exit 0, 출력 없음 |
| `pnpm build` | `tsc -p tsconfig.build.json` | exit 0, 출력 없음 |
| `pnpm test:coverage` | `vitest run --coverage` | exit 0 — 아래 §6 |

`pnpm test:watch`도 `package.json`에 정의되어 있으나(`vitest`), 본 문서 작성 시 대화형 워치 모드는 실행하지 않았다.

## 6. 커버리지 설정과 제외 사유

실행 확인(2026-07-29, `pnpm test:coverage`):

| 범위 | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| 전체 | 93.79% | 90.2% | 90.03% | 95.57% |

`vitest.config.ts`의 `coverage.exclude`가 다음 3개 패턴을 제외한다 — 이유는 파일 내 주석에 명시:

```
src/**/*.test.ts          # 테스트 파일 자체
src/cli/bin.ts            # 프로세스 진입점 접착 코드(실제 process.argv/stdout/exitCode) — 로직(router.ts + commands/*)은 완전히 단위 테스트됨, 이 파일 자체는 의도적으로 제외
src/backend/adb-executor.ts     # 실제 child_process.spawn 배선 — AdbBackend/AdbDoctor의 injected-mock 단위 테스트를 통해 간접 검증되며, 실제 adb 바이너리가 필요해 직접 테스트하지 않음
src/backend/process-executor.ts # 위와 동일한 이유
```

**`vitest.config.ts`에는 `coverage.thresholds` 블록이 없다** — 실측(`grep -n "thresholds" vitest.config.ts`에서 매치 없음). 85% 커버리지 기준은 `.moai/specs/SPEC-IOS-001/acceptance.md`(227행)와 `.moai/specs/SPEC-ANDROID-001/acceptance.md`(442행)에 텍스트로만 존재하며(문서 기준), CI나 vitest 설정으로 기계적으로 강제되지 않는다. 즉 현재 93.79%는 "게이트를 통과해서" 나온 숫자가 아니라 사람 또는 에이전트가 직접 실행해서 확인한 숫자다.

## 7. 자동화된 품질 게이트 부재 — 있는 그대로 기록

이것은 감춰야 할 결함이 아니라 이 프로젝트의 현재 실제 상태다.

- `.github/workflows/`에는 `label-sync.yml` **하나만** 있다(실측: `find .github/workflows -type f`). 테스트·타입체크·빌드를 돌리는 워크플로는 없다.
- `label-sync.yml`은 `main` 브랜치 push에 트리거되지만, 이 저장소의 기본 브랜치는 `master`다(실측: `git remote show origin` → `HEAD branch: master`). 게다가 그 소스 오브 트루스인 `.github/labels.yml` 자체가 존재하지 않는다(실측: 파일 없음).
- `.git_hooks/pre-push`는 `Makefile`이 존재할 때만 `make -C <repo> -s ci-local`을 실행한다. 이 저장소에는 `Makefile`이 없으므로(실측: 파일 없음) **항상 "skip (no Makefile)" 분기를 탄다** — 이 훅은 실제로 `.git/hooks/pre-push`에 설치되어 있음을 확인했지만(실측), 매번 아무 것도 실행하지 않고 통과한다.
- 린터·포매터가 전혀 없다 — ESLint/Prettier/Biome/EditorConfig 설정 파일 모두 없음(실측). 유일한 정적 게이트는 `tsc --noEmit`(strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, §2)뿐이다.
- 85% 커버리지 기준은 문서에만 있다(§6).

**결론**: 지금까지 CHANGELOG.md/README.md에 기록된 모든 "초록불"(테스트 통과, 커버리지 수치, 실기기 검증)은 사람 또는 에이전트가 수동으로 명령을 실행해서 얻은 결과다. 자동화된 CI가 이를 재확인하지 않는다.

## 8. §제약 — 인터뷰에서 확정된 3가지, 코드 근거 포함

인터뷰(`.moai/project/interview.md` Stage A Round 2)에서 사용자가 선택한 3가지 제약이다.

### 8.1 조용한 성공 금지 (`ok:true`인데 기기 효과 없음 = 결함)

2026-07-29 하루에 고친 실기기 결함 5건 중 4건이 이 부류였다(CHANGELOG.md Notes 절, 문서 기준):

- `launch`가 암시적 인텐트를 써서 `category.DEFAULT`를 선언하지 않은 앱을 못 여는데도 `ok:true`를 반환
- IME 바인딩 준비 전에 텍스트를 보내 아무 입력도 안 되는데 `ok:true`
- 소프트 키보드 숨김이 자신이 방금 보낸 웹 입력을 지우는데 `ok:true`
- 미연결 기기를 연결로 계수해 `AMBIGUOUS_DEVICE` 메시지의 기기 수 자체가 틀림

**따르는 규율**: mock 테스트는 구성된 argv까지만 검증하고, 기기가 그 argv를 어떻게 해석하는지는 검증하지 못한다. 이 저장소의 702개 단위 테스트는 전부 이 한계 안에 있으며, 효과·타이밍·화면 변화의 최종 판정은 실기기/실시뮬레이터 실행으로만 이루어진다(`README.md` Status 절 각 항목이 "확인 방법"까지 기록).

### 8.2 의존성 최소화

§3에서 다룬 표(정확히 1개 런타임 의존성 + 각 회피 사유)가 이 제약의 코드 레벨 증거다.

### 8.3 JSON 입출력 계약 고정

모든 명령이 stdout에 JSON 문서 정확히 1개를 찍고 자유 텍스트를 내지 않는다는 계약은:

- `src/cli/envelope.ts`의 `success`/`failure` 헬퍼가 응답 형태를 강제
- `src/cli/router.ts`의 `runCli`가 "절대 throw하지 않고 항상 `CommandResult`로 귀결"됨을 문서 주석(`REQ-ARCH-001`)에 명시하고, 핸들러 예외까지 `INTERNAL_ERROR` envelope로 감쌈(방어적 코딩, `router.ts` 89-95행)
- 오류도 항상 `error.code`라는 구조화된 코드로만 나간다 — 실측한 실제 에러 코드 예시: `AMBIGUOUS_DEVICE`, `DEVICE_NOT_FOUND`, `DEVICE_NOT_CONNECTED`, `NO_DEVICE`, `APK_DOWNLOAD_FAILED`, `APK_INSTALL_FAILED`, `IME_ENABLE_FAILED`, `IME_RESTORE_FAILED`, `PM_LIST_FAILED`, `AMOUNT_TOO_SMALL`, `IWDP_NOT_INSTALLED`, `NO_WEB_PAGE`, `UNSUPPORTED_ON_PLATFORM`, `UNSUPPORTED_KEY_ON_IOS` 등(`grep -n 'code:' src/**/*.ts` 실행 결과에서 추출)

## 9. 발견 사항 — 이 계약과 어긋나는 문서 (수정하지 않음, 기록만)

- `.claude/skills/explore-mobile/SKILL.md`가 여전히 존재하지 않는 에러 코드 `ADB_COMMAND_FAILED`/`APK_NOT_BUNDLED`를 `error.code` 예시 목록에 나열한다. 실제 코드베이스에는 이 두 코드가 존재하지 않는다(§8.3의 실측 목록에 없음; `ADB_COMMAND_FAILED`는 `src/backend/ime-errors.ts` 주석 안에 "generic ADB_COMMAND_FAILED로의 성급한 강등을 피한다"는 **비교 대상**으로만 남아 있고 실제로 던져지지 않음).
- 같은 파일의 명령 참조 표는 12개 명령 중 10개만 문서화한다 — `swipe`/`scroll`과 `--web` 플래그가 빠져 있다(실측: SKILL.md 본문에 두 명령 섹션 없음).

이 문서(`tech.md`)는 이 불일치를 고치지 않는다(작업 지시에 따라 스코프 밖) — 대신 이 응답의 `findings` 절에 다시 정리한다.
