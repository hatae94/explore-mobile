---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 구현 계획"
version: "0.3.0"
status: in-progress
created: 2026-07-22
updated: 2026-07-29
author: manager-spec
amendment_of: SPEC-ANDROID-001
---

# 구현 계획 — SPEC-ANDROID-001

> 마일스톤은 **결정 번복 가능성(decision-reversibility)** 순으로 정렬한다. 가장 바뀔 확률이 높은 결정(데이터 모델, 타입 인터페이스, 사용자 대면 흐름)을 먼저 배치하고, 기계적/반복적 단계를 뒤로 미뤄 인간 리뷰가 고-변경 결정에 집중하도록 한다.

## §A. 컨텍스트

`explore-mobile`의 첫 SPEC. Android/adb 원시 제어 명령 + `doctor` 환경 부트스트랩 + 공통 요소 스키마를 구현한다. 그린필드(현재 소스 코드 없음). 개발 방식은 **TDD 기본**(정규화 순수 함수가 핵심 테스트 단위).

**개정 0.3.0 컨텍스트 (2026-07-29)**

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 직전 completed: `7caea74`(0.2.0 마감). 이후 SPEC-GESTURE-001이 여러 차례 개정되며 트리가 앞으로 갔다
- 기준선(검증 보고서 기준, `a843b70`): **653건 green**, `pnpm build` exit 0
- **실기기**: Galaxy S25 Ultra(SM-S938N), Android 16, 1440×3120, 무선 ADB `adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`. 검증 종료 시 기준선 4개 항목(기본 IME=HoneyBoard / ADBKeyBoard 미설치 / `ime-sessions.json` = `{}` / 포그라운드=런처)으로 **복원 확인됨**
- 이 개정은 **결함 2건 수정**이며 **코드를 변경한다**(0.2.0의 docs-only와 다름). 실측 근거 전문: `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md`

### A.5 PRESERVE (수정 금지)

- `src/normalize/uiautomator.ts` · `src/normalize/idb.ts` · `src/normalize/element-query.ts` — 정규화·셀렉터 계약 불변. 이 개정은 정규화 계층을 전혀 건드리지 않는다
- `src/schema/device-backend.ts` — **인터페이스 시그니처 불변.** 두 결함 모두 `AdbBackend` **구현 내부**의 문제이지 인터페이스 공백이 아니다. 여기를 건드리면 SPEC-IOS-001·SPEC-GESTURE-001의 테스트 더블이 전부 깨진다
- `src/backend/idb-backend.ts` · `src/backend/idb-*.ts` — iOS 경로. `launchApp`은 인터페이스를 공유하지만 **본 개정의 대상은 Android 경로뿐이다**(REQ-APP-001 개정의 주어가 `the Android backend`인 이유)
- `src/backend/ime-session-store.ts` — 디스크 영속 IME 세션. 타임아웃 경로에서도 **영속을 유지**하는 것이 요건이므로(REQ-IDEMP-004 불변) 이 파일의 거동을 바꾸지 않는다
- `src/backend/adbkeyboard-installer.ts`의 `pm list packages` 판정 방식 — `exitCode` + `stdout`만 보는 현재 구현이 **옳다**(spec.md §C.3-⑪ Secure Folder 확증). stderr 기반 판정으로 바꾸지 않는다
- SPEC-GESTURE-001이 만든 `getMinEffectiveSwipeThreshold` 관련 경로 — 문턱 산식·파싱 불변

### A.6 수정 대상 (PRESERVE 아님 — 명시)

PRESERVE 목록에 없으면서 실제로 손대는 파일. **여기 없는 파일을 건드리면 범위 이탈이다.**

| 파일 | 마일스톤 | 성격 |
|------|----------|------|
| `src/backend/adb-backend.ts` | **M10** | `inputText` 비-ASCII 경로: `setImeToAdbKeyboard`(및 자가치유 설치) 이후 `broadcastBase64Text` **이전**에 바인딩 준비 대기 삽입. 타임아웃 시 브로드캐스트 미전송 + throw |
| `src/backend/ime-errors.ts` | **M10** | `IME_BIND_TIMEOUT` 전용 오류 타입. `ImeRestoreFailedError`/`AdbKeyboardInstallFailedError`와 같은 자리·같은 이유(CLI가 `instanceof`로 전용 코드 매핑) |
| `dumpsys input_method` 준비 신호 파서 (신규, 배치는 구현 재량) | **M10** | **순수 함수** — 덤프 문자열 → `{bound, currentImeId}`. 기기 없이 픽스처로 단위 테스트 가능해야 한다(§E) |
| `src/cli/commands/text.ts` | **M10** | 새 오류 타입 → `IME_BIND_TIMEOUT` JSON 코드 매핑. 기존 두 `instanceof` 분기와 동일 형태 |
| `src/backend/adb-backend.test.ts` | **M10** | cold(미바인딩→바인딩) / warm(이미 바인딩, 대기 없음) / 타임아웃(**브로드캐스트 argv 미도달 단언**) 픽스처 |
| `src/cli/router.test.ts` | **M10** | `IME_BIND_TIMEOUT` 봉투 단언(`ok:false`) |
| `src/backend/adb-backend.ts` | **M11** | `launchApp`: 런처 컴포넌트 조회 → 명시적 컴포넌트 시작. `-p` 암시적 경로 제거 |
| 런처 컴포넌트 조회 출력 파서 (신규, 배치는 구현 재량) | **M11** | **순수 함수** — 조회 stdout → 컴포넌트 또는 미해석. `No activity found` 단일 행 / 마지막 비어있지 않은 행 / 선행 점 상대 액티비티. **종료 코드를 보지 않는다** |
| `src/backend/ime-errors.ts` **또는** 신규 오류 모듈 | **M11** | `LAUNCHER_ACTIVITY_NOT_FOUND` 전용 오류 타입. 파일명이 `ime-errors`라 어울리지 않으면 신규 모듈 — **배치는 구현 재량**이나 `BACKEND_COMMAND_FAILED`와 구분되는 타입인 것은 규범 |
| `src/cli/commands/launch.ts` | **M11** | 새 오류 타입 → `LAUNCHER_ACTIVITY_NOT_FOUND` 매핑. 현재는 모든 실패가 `BACKEND_COMMAND_FAILED`로 접힌다 |
| `src/backend/adb-backend.test.ts` | **M11** | 조회 성공(2행) / 실패(`No activity found` + **exit 0**) / 선행 점 액티비티 / 명시적 시작 argv 픽스처 |
| `src/cli/router.test.ts` | **M11** | `LAUNCHER_ACTIVITY_NOT_FOUND` 봉투 + **원인 단정 없는 메시지** 단언 |

## §B. 알려진 이슈 / 리스크

- **ADBKeyBoard 의존성 + 라이선스**: 유니코드 입력이 외부 APK에 의존. **해소됨(개정 0.2.0)** — ADBKeyBoard가 GPL-2.0이고 본 패키지는 MIT이므로 번들 대신 **런타임 다운로드**(고정 참조, 매직바이트 검증, 로컬 캐시). 미재배포로 라이선스 준수(`backend/apk-downloader.ts`, `backend/adbkeyboard.ts`).
- **`doctor` 자동 설치의 권한**: adb/platform-tools 자동 설치는 OS별 패키지 매니저·권한 상승이 필요할 수 있어 항상 자동 설치가 가능하다고 가정 불가.
- **기기 의존 검증**: 스크린샷 유효성/탭·텍스트 효과/한글 입력 착지/다중 기기 격리는 실기기·에뮬레이터가 있어야 검증 가능 → e2e/수동(또는 CI 에뮬레이터).
- **idb 미유지보수(선반영)**: SPEC-02에서 idb 버전 고정 + interface 격리 필요(본 SPEC 아님).

### 개정(Amendment, 개정 0.2.0) — 실기기 하드닝 후 문서-코드 정합화

SPEC이 `completed`(v0.1.2, `e536e11`)로 닫힌 뒤 실기기 검증에서 구현이 5개 커밋에 걸쳐 진화했다. 본 개정(`completed → in-progress`)은 문서를 실제 코드에 맞춰 정정한다(docs-only, 코드 무변경). 진화 항목:

1. **ADBKeyBoard GPL-2.0 런타임 다운로드**(`488ab87`): 번들 → 미재배포 런타임 다운로드(REQ-DOCTOR-003 / §C 정정).
2. **세션 기반 IME + 소프트키보드 자동 숨김**(`ad8c41c`): per-call 복원 폐기, 세션 1회 전환, `text` 후 키보드 숨김(`--keep-keyboard` 옵트아웃).
3. **`text` 자가치유 자동설치**(`d8f1878`): ADBKeyBoard 미설치 시 `text`가 공유 설치기(`backend/adbkeyboard-installer.ts`)로 런타임 설치(REQ-INPUT-003 개정).
4. **요소 셀렉터 tap + text focus**(`e670a78`): `--id`/`--text`/`--index`로 요소 찾아 중심 탭/포커스(REQ-SELECT 신규, `normalize/element-query.ts`).
5. **디스크 영속 IME 세션**(`e8a25e2`): 원래 IME를 `~/.cache/explore-mobile/ime-sessions.json`에 `serial`별 영속화 — 별도 CLI 프로세스 간 생존, 복원은 `reset`/`doctor --clean`에서(REQ-INPUT-004 개정, `backend/ime-session-store.ts`).

### 개정(Amendment, 개정 0.3.0) — 실기기가 드러낸 `ok:true`-무효과 결함 2건

0.2.0 마감(`7caea74`) 이후 2026-07-29 실기기 검증에서 **구현 결함 2건**이 실측됐다. 둘 다 **기존 REQ 위반이 아니라 REQ가 메커니즘을 규정하지 않아 구현이 틀릴 수 있었던 자리**다. 본 개정은 REQ에 날을 세워 결함이 **표현 불가능**하게 만들고, 실측 판정 다리를 가진 AC 8건을 추가한다.

**결함 1 — `launch`가 암시적 인텐트를 쓴다** (`adb-backend.ts` `launchApp`, REQ-APP-001):
`-p <pkg>`는 암시적 해석이라 대상 액티비티가 `android.intent.category.DEFAULT`를 선언해야 매칭된다. 삼성 기본앱 상당수(계산기·시계)가 이를 선언하지 않아 **설치돼 있고 손으로 누르면 열리는데도** `BACKEND_COMMAND_FAILED`로 실패한다(spec.md §C.3-①). 수정은 런처 컴포넌트를 조회한 뒤 **명시적 컴포넌트**로 시작하는 것이다.

**결함 2 — 비-ASCII `text`가 IME 바인딩 전에 브로드캐스트한다** (`adb-backend.ts` `inputText`, REQ-INPUT-003/004):
`ime set`은 *설정 기록* 시점에 반환하지만 IME 서비스는 아직 바인딩되지 않았고, 그 창의 브로드캐스트는 **조용히 유실**되면서 `{"ok":true}`가 나간다. 5회 분리 실험이 가르는 변수를 **"같은 호출 안에서의 설치"** 로 좁혔고(IME *전환*은 원인이 아님 — #2가 반증), `mBoundToMethod` 참/거짓이 성공/실패를 정확히 갈랐다(spec.md §C.3-⑤/⑧/⑨).

**두 결함의 공통 부류와 그것이 AC 형태를 정하는 이유**: 둘 다 **`ok:true`인데 관측 가능한 효과가 없음** — SPEC-GESTURE-001이 여섯 라운드에 걸쳐 싸운 것과 동일한 부류다. **그리고 둘 다 unit/mock 스위트로는 잡을 수 없다**: mock은 구성된 `adb` argv의 *모양*을 단언할 뿐, 그 argv를 **기기가 어떻게 해석하는지**는 단언할 수 없다. 결함 1은 argv 모양이 완벽히 맞는데 기기 쪽 해석 규칙이 달랐고, 결함 2는 argv 순서가 맞는데 그 사이 시간이 부족했다. 그래서 신규 AC는 **실측 판정 다리를 반드시 갖는다**(AC-ANDROID-026·029는 mock 단독으로 충족 불가 — acceptance.md §D.4).

**이 개정은 코드를 변경한다.** 0.2.0은 docs-only 정합화였으나 0.3.0은 `adb-backend.ts` 두 메서드와 그 오류 표면·테스트를 바꾼다. 구현(M10·M11)은 manager-develop 소유이며, 본 문서는 계약과 판정만 규정한다.

**리스크 — 응답 계약 변경(사용자 승인됨)**: 결함 2 수정으로 **현재 `ok:true`를 반환하던 경로가 `ok:false`(`IME_BIND_TIMEOUT`)가 된다.** 사용자가 "일단 쏴 본다"보다 이쪽을 명시적으로 택했고, 근거는 **그 경로가 이미 깨져 있으며 무음 실패가 오류보다 나쁘다**는 것이다. 별도 AC(AC-ANDROID-031)로 고정한다.

**리스크 — 미측정 결합항**: 준비 술어의 두 번째 결합항(바인딩된 IME id)은 **미바인딩 창에서 측정되지 않았다**(spec.md §C.3-⑩). 구현이 이를 확립된 사실로 취급하면 안 되며, 실기기 확인이 AC-ANDROID-032다.

### Decisions (해소됨 — 2026-07-22, Implementation Kickoff Approval 전 확정)

기존 4개 미해소 항목이 사용자 결정으로 해소되었다. 아래 결정은 spec.md §C 제약과 REQ-DOCTOR-002/003에 반영되었다.

1. **패키지 매니저 / 배포**: 개발은 **pnpm**을 표준으로 사용하고, **npm 레지스트리**에 배포하여 최종 사용자는 전역 설치 없이 `npx`로 실행한다. 개발용 PM(pnpm)은 최종 사용자 `npx` 실행과 **독립적**(사용자는 pnpm 불필요).
2. **adb 자동 설치 정책(OS별)**: macOS는 **사용자 명시 동의 후 Homebrew 자동 설치**, Linux/Windows는 **안내만(정확한 수동 설치 단계 출력, 자동 설치 없음)**. 자동 설치는 절대 무음이 아니며 동의 필수 → REQ-DOCTOR-002 반영.
3. **ADBKeyBoard APK 조달**: 버전 고정된 APK를 패키지에 **번들**(오프라인 재현 가능). 사전 조건 — APK 라이선스가 재배포를 허용함을 검증(예: Apache-2.0)하고 attribution 포함 → REQ-DOCTOR-003 / §C 제약 반영. **[SUPERSEDED — 개정 0.2.0]** 실제 ADBKeyBoard 라이선스는 Apache-2.0이 아니라 **GPL-2.0**으로 확인되어(본 패키지는 MIT) 번들 대신 **런타임 다운로드(미재배포)** 로 전환됨. 위 plan-time 결정은 기록 보존용이며 현재 유효 계약은 REQ-DOCTOR-003(개정)·§C·§B 개정 노트를 따른다.
4. **Node 최소 버전**: **Node 20 LTS 이상**(ESM) → §C 제약 반영.

## §C. 사전 점검 (Pre-flight)

- 그린필드 확인 완료(소스 코드/package.json 없음).
- SPEC ID 중복 없음(`NO_DUPLICATE`), 정규식 self-check `PASS`.
- product/structure/tech.md 미존재 — 필요 시 `/moai project`로 초기화 권장.

### C.1 개정 0.3.0 사전 점검 (M10·M11 착수 전)

- **기준선 확보**: `pnpm typecheck` / `pnpm build` exit 0, `pnpm vitest run` 653건 green을 **먼저** 찍는다. 이 개정이 더하는 테스트만 증가분이어야 한다.
- **`adb`는 PATH 밖에 있다** — `~/Library/Android/sdk/platform-tools/adb`. `command -v adb` 하나의 실패를 "미설치"로 읽지 않는다(SPEC-GESTURE-001 §C.2가 이 오류를 이미 겪었다). 실기기 판정 전 `export PATH`가 필요하다.
- **기기 연결 확인**: `adb devices`로 SM-S938N 무선 ADB 연결 확인. **기기가 없으면 실측 판정 AC(026·027·029·032)는 미기록으로 남기고 PASS로 승격하지 않는다** — 관측하지 않은 것을 PASS로 주장하지 않는다.
- **기기 기준선 기록**: 기본 IME(`settings get secure default_input_method`), ADBKeyBoard 설치 여부(`pm list packages`), `~/.cache/explore-mobile/ime-sessions.json` 내용, 포그라운드 앱. **M10 판정 종료 후 이 4개를 원상 복원하고 대조 확인한다**(2026-07-29 검증이 그렇게 했다).
- **M10 판정은 기기 상태를 반복 변경한다** — §F M10의 경고 블록을 먼저 읽는다.

## §D. 제약

- TypeScript(ESM), Node.js, JSON in/out, `npx` 무설치 실행.
- 3계층 얇은 구조 유지(CLI → 정규화 → adb 래퍼). iOS/idb 백엔드 대체 지점 보존.
- 시간 추정 금지 — 우선순위 라벨로만 표기.

## §E. 자체 검증 (Self-Verification)

- 정규화 순수 함수는 샘플 XML 픽스처로 단위 테스트(기기 불필요).
- adb 서브프로세스는 mock으로 명령 구성(command construction) 테스트.
- 기기 의존 항목은 e2e/manual로 분류(acceptance.md §D 참조).

**개정 0.3.0 추가 — mock의 사정거리를 명시한다.**

- 두 결함 모두 **mock이 구조적으로 잡을 수 없었다**: mock은 구성된 argv의 *모양*만 단언하고, 기기의 *해석*(암시적 인텐트 매칭 규칙)이나 *시점*(IME 바인딩 완료)은 단언할 수 없다. 따라서 M10·M11의 자체 검증은 **mock 레그 + 실측 레그 두 다리**로 보고한다.
- **mock으로 충분한 것**: 새 argv 구성, 파서 순수 함수(조회 출력·`dumpsys` 준비 신호), 오류 타입 → JSON 코드 매핑, **타임아웃 시 브로드캐스트 argv가 mock exec에 도달하지 않음**(미전송은 mock으로 정확히 단언 가능하다).
- **mock으로 불충분한 것**: DEFAULT 미선언 앱이 실제로 열리는가(AC-026), cold 사이클에서 한글이 실제로 착지하는가(AC-029), 태스크 재개 의미(AC-027), 미바인딩 창의 IME id 값(AC-032). 이 넷은 **실측 관측 기록**이 판정 근거다.
- **유효 오라클은 스크린샷뿐이다**(결함 2 판정) — `mServedView`는 성공 시에도 `null`이라 무효다(spec.md §C.3-⑨). 같은 오라클을 다시 시도하지 않는다.

## §F. 마일스톤 (번복 가능성 내림차순)

> 상단일수록 "바뀔 확률이 높은 결정" → 리뷰 집중. 하단일수록 기계적 단계.

### M1 — 공통 요소 스키마 + device-backend interface 설계 [최고 변경 확률]
- 공통 스키마 `{ role, text, id, bounds, tappable, enabled, children }` 타입 확정.
- device-backend interface(추상) 정의 — iOS/idb 대체 지점.
- **iOS 필드 매핑 표(§F.9) 확정** — 스키마가 idb 필드를 수용함을 문서로 검증(AC-ANDROID-006).
- 관련: REQ-SCHEMA-001/003, REQ-ARCH-002/003. `@MX:ANCHOR` 대상.

### M2 — 정규화 계층(순수 함수, uiautomator XML → 공통 스키마) [높은 변경 확률·핵심 테스트 단위]
- `class→role`, `resource-id→id`, `text`/`content-desc→text`, `bounds→bounds`, `clickable+enabled→tappable`.
- 샘플 XML 픽스처 기반 TDD.
- 관련: REQ-SCHEMA-002/004, REQ-DUMP-002.

### M3 — CLI 명령 표면 + JSON in/out 계약 [사용자 대면 흐름]
- 명령 표면: `doctor`/`devices`/`launch`/`stop`/`screenshot`/`tap`/`text`/`key`/`dump`.
- 공통 옵션 `--device <serial>`, 표준 JSON 응답 형태, graceful error 형태.
- 관련: REQ-ARCH-001/005, REQ-MULTIDEV-001/002.

### M4 — adb 서브프로세스 래퍼 + 무상태 원시 명령 [기계적]
- `devices`/`launch`/`stop`/`screenshot`(exec-out)/`tap`/`key` 구현.
- mock 기반 명령 구성 테스트.
- 관련: REQ-DEVICES-001/002, REQ-APP-001/002, REQ-SCREENSHOT-001/002, REQ-INPUT-001/005.

### M5 — 텍스트 입력 + Unicode IME 경로 + 세션 기반 IME [위험 구역]
- ASCII 빠른 경로(`input text`) / 비-ASCII base64 브로드캐스트(`ADB_INPUT_B64`).
- **세션 기반 IME(개정 0.2.0)**: 기기의 현재 활성 IME 조회 → 아직 ADBKeyBoard가 아니면 1회 전환 + 전환 전 원래 IME를 `serial`별 **디스크 영속화**. 매 호출 복원 아님 — 복원은 `reset`/`doctor --clean`에서만. `text` 후 소프트키보드 자동 숨김(`--keep-keyboard` 옵트아웃). ADBKeyBoard 미설치 시 자가치유 설치.
- 관련: REQ-INPUT-002/003/004(개정), REQ-IDEMP-004, REQ-ERR-001. `@MX:WARN` 대상.

### M6 — `doctor` / `reset` 환경 부트스트랩 [부작용 큰 단계]
- adb/platform-tools 감지 → 자동 설치 또는 정확한 수동 안내.
- ADBKeyBoard **런타임 다운로드**(개정 0.2.0: 번들 아님 — GPL-2.0 미재배포, 고정 참조에서 페치+검증+캐시)·설치·활성화. `pm list packages`로 중복 설치 방지(멱등).
- `doctor --clean`/`reset`으로 원래 상태 복원(`ime disable`+`ime reset`+`uninstall`, 세션 영속 원래 IME `ime set` 복원).
- 관련: REQ-DOCTOR-001~005(003 개정), REQ-IDEMP-002, REQ-ERR-002. `@MX:WARN` 대상.

### M7 — 다중 기기 격리 + 동시성 + 멱등성/위생 [기계적·교차 관심사]
- serial 키 상태 격리, 임시 리소스 serial 네임스페이스.
- 멱등성 보장, 잔여 파일 무잔류.
- 관련: REQ-MULTIDEV-003/004, REQ-IDEMP-001/003.

### M8 — 얇은 Claude 스킬 래퍼 [최소·마지막]
- `.claude/skills/` 하위 래퍼 1개 — CLI만 호출(adb 직접 실행 금지).
- 관련: REQ-ARCH-004.

### M9 — 요소 셀렉터 tap/focus [개정 0.2.0, 사용자 대면 흐름]
- `normalize/element-query.ts`(순수 함수, 기기 없이 단위 테스트) — `findElement`(DFS 프리오더, `id`/`text` 정확 매칭, AND 의미, 0-기반 `--index`), `elementCenter`.
- `cli/commands/tap.ts`: `tap --id/--text/--index` → 덤프 트리에서 매칭 요소 중심 탭. 좌표 XOR 셀렉터(`TARGET_CONFLICT`).
- `cli/commands/text.ts`: `text ... --id/--text/--index` → 매칭 요소 포커스 후 타이핑(포커스 실패 시 입력 미전송).
- `cli/args.ts`: `--id`/`--text`(`selectorText`)/`--index` 플래그 + `--keep-keyboard`. `cli/validators.ts`: `parseIndex`(음이 아닌 정수).
- 오류 코드: `ELEMENT_NOT_FOUND`, `TARGET_CONFLICT`, `INVALID_INDEX`.
- 관련: REQ-SELECT-001~005(신규). `@MX:NOTE` 대상(element-query.ts).

### M10 — IME 바인딩 준비 대기 [개정 0.3.0 · 결함 2 · 최고 변경 확률]

> **선행**: 0.2.0 마감(`7caea74`). 이 마일스톤은 **실기기 검증이 연** 것이며 §B 개정 0.3.0 결함 2가 근거다.
>
> **⚠️ 왜 M11보다 먼저 오는가 — 번복 가능성이 더 높다.** 이 마일스톤은 **되돌릴 수 있는 결정 셋**을 담는다: (a) 사용자 대면 **응답 계약 변경**(`ok:true` → `ok:false`), (b) **설계 선택인 대기 상한 값**, (c) **미측정 결합항을 포함한 준비 술어**. M11은 반대로 거의 기계적이다 — 명시적 컴포넌트 시작이 유일하게 옳은 방법이고 번복 가능한 결정은 오류 코드 이름과 메시지 문구뿐이다. 리뷰 주의를 여기 먼저 붙이기 위한 배치이며, **실행 순서 제약은 아니다**(§F.10).
>
> **⚠️ 이 마일스톤은 기기 상태를 반복 변경한다.** cold 경로 판정에는 **ADBKeyBoard 설치/제거 사이클 반복**이 필요하다(`reset`이 제거 → 다음 `text`가 자가치유 설치 → 관측 → 다시 `reset`). 판정 종료 후 §C.1의 기기 기준선 4개 항목을 **복원하고 대조 확인한다**.
>
> **⚠️ 신규 REQ 0건.** 산출물 전부가 REQ-INPUT-003/004(개정 0.3.0)의 조항 위에 선다.

**산출물 1 — 준비 신호 파서(순수 함수).** `dumpsys input_method` 덤프 문자열 → 바인딩 여부 + 바인딩된 IME id. `mBoundToMethod`가 덤프에 **정확히 1회**만 나타나므로 파싱은 모호하지 않다(spec.md §C.3-⑥). 기기 없이 픽스처로 단위 테스트 가능해야 한다. 파일 배치는 구현 재량.

**산출물 2 — 전송 전 상한 있는 대기(`adb-backend.ts`).** `setImeToAdbKeyboard`(및 자가치유 설치) 이후 `broadcastBase64Text` **이전**에 준비 술어가 참이 될 때까지 폴링한다.
- **상한은 설계 선택이다** — SPEC 권고 5,000ms. 정의 지점에 **왜 측정 의무가 없는지**를 `MAX_DURATION_MS`(`src/cli/validators.ts:47-64`)와 같은 형태의 독블록으로 남긴다: 목적은 "무한 대기 금지"뿐이고, 이 값은 기기 거동을 주장하지 않으므로 실측 문턱(`getMinEffectiveSwipeThreshold`)과 부류가 다르다.
- **타임아웃 시 브로드캐스트를 보내지 않고** 전용 오류로 throw. 이것이 mock으로 정확히 단언 가능한 핵심 요건이다(브로드캐스트 argv가 mock exec에 **도달하지 않음**).
- **warm 경로는 대기하지 않는다** — 이미 ADBKeyBoard가 활성·바인딩이면 즉시 전송. 이 개정이 지연을 더하는 것은 cold 경로뿐이다.
- **원래 IME 디스크 영속은 타임아웃에서도 유지**된다(REQ-IDEMP-004 불변) — 전환 성공 후 영속하고, 그 뒤에 대기하는 현재 순서를 유지하면 자연히 충족된다.

**산출물 3 — 오류 표면(`ime-errors.ts` + `cli/commands/text.ts`).** `IME_BIND_TIMEOUT` 전용 타입 + JSON 코드 매핑. 기존 두 `instanceof` 분기와 같은 형태. 메시지는 사용자가 무엇을 할 수 있는지(재시도, `doctor` 선행) 알려준다.

**산출물 4 — 판정.** mock 레그(cold/warm/타임아웃 3형태) + **실측 레그**: `reset` 직후 미설치 상태에서 한글 `text` → 스크린샷으로 착지 확인(AC-029), warm 경로 불변 확인(AC-030), 미바인딩 창의 IME id 값 관측(AC-032).

**AC**: AC-ANDROID-029(cold 착지, **실측 필수**) / AC-ANDROID-030(warm 불변) / AC-ANDROID-031(타임아웃 → 미전송 + `ok:false`) / AC-ANDROID-032(결합항 실기기 확인, **실측 필수**).

### M11 — `launch` 명시적 컴포넌트 시작 [개정 0.3.0 · 결함 1 · 기계적]

> **선행**: 없음 — **M10과 완전히 독립이다**(§F.10). 공유 코드 경로가 0이며(`launchApp` vs `inputText`), 어느 한쪽이 막혀도 다른 쪽은 진행된다.
>
> **⚠️ 신규 REQ 0건.** 산출물 전부가 REQ-APP-001(개정 0.3.0)의 조항 위에 선다.
>
> **⚠️ 실측은 기기 기준선을 거의 건드리지 않는다** — 앱 3개를 여는 것뿐이다. M10의 설치/제거 사이클이 기기를 흔들기 **전에** 이 판정을 돌리는 편이 싸다(§F.10 실행 순서 노트).

**산출물 1 — 조회 출력 파서(순수 함수).** 런처 컴포넌트 조회 stdout → 컴포넌트 또는 미해석.
- 성공은 **2행**이고 **마지막 비어있지 않은 행**이 컴포넌트다. 액티비티가 **선행 점 상대 경로**일 수 있다(`com.sec.android.app.popupcalculator/.Calculator`).
- 실패는 **단일 행 `No activity found`** 이며 **종료 코드는 0이다** — 파서는 **stdout만 본다**. 종료 코드로 판정하면 실패가 성공으로 오판된다(spec.md §C.3-②).
- 기기 없이 픽스처로 단위 테스트 가능. 파일 배치는 구현 재량.

**산출물 2 — 조회 후 명시적 시작(`adb-backend.ts` `launchApp`).** 컴포넌트를 구한 뒤 그 컴포넌트를 명시적으로 지정해 시작한다. 암시적 `-p` 경로는 제거한다. `--user` 인자는 **불필요**함이 실측됐다(§C.3-②) — 넣지 않는다.
- **태스크 재개 의미를 바꾸지 않는다.** 실행 중인 앱을 대상으로 하면 재개를 알리는 **경고 행 + 종료 코드 0**이 나오며 이는 **실패가 아니다**(§C.3-④). 이 경고를 오류로 승격하면 기존 계약이 깨진다.

**산출물 3 — 오류 표면.** `LAUNCHER_ACTIVITY_NOT_FOUND` 전용 타입 + `cli/commands/launch.ts` 매핑(현재는 모든 실패가 `BACKEND_COMMAND_FAILED`로 접힌다). **메시지는 원인을 단정하지 않는다** — "런처 액티비티 없음"과 "패키지 미설치"가 같은 출력을 내므로(§C.3-③) 두 가능성을 함께 제시한다. 거부 시 기기에 **어떤 인텐트도 보내지 않는다**.

**산출물 4 — 판정.** mock 레그(조회 성공 2행 / 실패 + exit 0 / 선행 점 액티비티 / 명시적 시작 argv) + **실측 레그**: DEFAULT 선언 앱(`com.android.settings`)과 **DEFAULT 미선언 앱**(`com.sec.android.app.popupcalculator`, `com.sec.android.app.clockpackage`) 양쪽을 실기기에서 연다. **후자가 이 수정이 실제로 결함을 고쳤음을 증명하는 유일한 판정이다.**

**AC**: AC-ANDROID-025(DEFAULT 선언 앱) / AC-ANDROID-026(**DEFAULT 미선언 앱 — 실측 필수, 회귀 증명**) / AC-ANDROID-027(태스크 재개 불변, 실측) / AC-ANDROID-028(미해석 → 구분된 graceful 오류).

## §F.9 iOS 필드 매핑 표 (iOS-readiness 문서 — AC-ANDROID-006 근거)

> iOS는 본 SPEC에서 **구현하지 않는다**. 아래 표는 공통 스키마/interface가 idb 필드를 재설계 없이 수용함을 증명하는 설계 산출물이다(SPEC-02에서 실제 구현).

| 공통 스키마 필드 | Android (uiautomator) | iOS (idb accessibility) |
|------------------|-----------------------|-------------------------|
| `role` | `class` | `type` / `role` |
| `text` | `text` / `content-desc` | `AXLabel` |
| `id` | `resource-id` | `AXUniqueId` |
| `bounds` | `bounds` | `frame` |
| `tappable` | `clickable` + `enabled` | `AXTraits` + `isEnabled` 조합 파생(§F.9.1) |
| `enabled` | `enabled` | `isEnabled` |
| `children` | 중첩 node | 중첩 element |

idb 참고(SPEC-02 대상): `idb ui describe-all` / `idb ui describe-point`(인지), `idb ui tap`(탭), `idb ui text`(텍스트). idb는 미유지보수(2022-08 v1.1.8) → 버전 고정 + backend interface 뒤 격리.

### F.9.1 iOS 필드 파생 정책 (파생 규칙 명세)

- **`role` 소스 필드 확인**: idb 접근성 요소의 타입은 `type` 필드로 노출된다(예: `Button`, `TextField`, `StaticText`, `Cell`). 일부 버전은 `role` 별칭을 함께 제공하므로, backend 어댑터는 `type`을 1차 소스로, `role`을 보조로 읽어 공통 `role`에 매핑한다(field name 확정: **`type`**, `role`은 alias). SPEC-02에서 실제 idb JSON 스키마로 최종 확정.
- **`tappable` 파생 정책 (AXTraits → tappable)**: iOS에는 Android `clickable`에 직접 대응하는 불리언이 없다. 따라서 `tappable`은 다음 규칙으로 **파생**한다 — `AXTraits`(또는 `traits`)에 상호작용 trait(예: `Button`/`Link`/`SelectableText`에 해당하는 트레이트)가 포함되거나 `type`이 상호작용 타입 집합(Button/Cell/TextField/Switch 등)에 속하고, **동시에** `isEnabled == true`인 경우에만 `tappable = true`. 둘 중 하나라도 불충족이면 `false`. 이 파생 규칙은 Android의 `clickable + enabled → tappable`과 의미상 대칭이다.
- **비구현 확인**: 본 SPEC에서 idb fixture/구현은 범위 밖이므로, 위 파생 정책은 **문서/설계 리뷰 검증**(AC-ANDROID-006)이며 자동화 단위 테스트가 아니다.

## §F.10 마일스톤 의존 관계

```
M1 (스키마+interface) ──> M2 (정규화) ──> M3 (CLI 표면) ──> M4 (adb 래퍼) ──┬──> M5 (text/IME)
                                                                            └──> M6 (doctor/reset)
M5·M6 ──> M7 (다중 기기·멱등성) ──> M8 (스킬 래퍼)
M2·M3·M4 ──> M9 (요소 셀렉터)        [개정 0.2.0]

── 개정 0.3.0 (실기기 결함 2건) ───────────────────────────────────────────

M5·M6 ──> M10 (IME 바인딩 준비 대기)   [결함 2 · 응답 계약 변경 · 상한은 설계 선택]
M4    ──> M11 (launch 명시적 컴포넌트) [결함 1 · 기계적]

M10 ⟂ M11   ← 서로 완전히 독립. 선행 관계가 아니다.
```

**M10과 M11은 서로 독립이며, 나열 순서는 의존이 아니라 번복 가능성 내림차순이다.** 두 마일스톤은 같은 파일(`adb-backend.ts`)을 건드리지만 **서로 다른 메서드**(`inputText` vs `launchApp`)이고, 공유하는 헬퍼·상수·타입이 없다. 한쪽이 막혀도 다른 쪽은 진행되고, 어느 쪽을 먼저 구현해도 결과가 같다.

**왜 한 마일스톤이 아니라 둘인가.** 세 가지가 갈린다.
1. **공유 코드 0** — 위와 같다. 한 마일스톤으로 묶으면 하나의 blocker가 다른 하나를 인질로 잡는다.
2. **판정 장비가 다르다** — M10은 스크린샷 오라클 + ADBKeyBoard 설치/제거 사이클 반복이 필요하고(기기 상태를 반복 변경), M11은 앱 3개를 여는 것으로 끝난다(기기 기준선 거의 무변경). 하나의 판정 세션으로 묶으면 싼 쪽이 비싼 쪽의 비용을 함께 문다.
3. **리스크 성격이 다르다** — M10은 **사용자 대면 응답 계약을 바꾼다**(`ok:true` → `ok:false`). M11은 바꾸지 않는다. 계약 변경은 별도 커밋·별도 롤백 단위여야 한다.

**실행 순서 노트(제약 아님).** 번복 가능성 순서는 M10 → M11이지만, **기기 판정은 M11을 먼저 도는 편이 싸다** — 기기가 기준선(ADBKeyBoard 미설치, 기본 IME=HoneyBoard)에 있을 때 `launch` 3건을 관측해 두면, 이후 M10의 설치/제거 사이클이 상태를 흔들어도 다시 복원할 필요가 없다. 구현 순서와 판정 순서를 분리해도 무방하다.

**이 둘을 연 것은 감사도 새 능력도 아니고 실기기 관측이다.** SPEC-GESTURE-001의 M8이 "새 관측 수단이 생겨" 열린 것과 같은 형태다 — 이전 구현이 부주의했다기보다, **mock으로는 확인할 수 없던 것을 확인할 수 있게 됐고 그 결과 둘이 결함이었다.** 그래서 이 개정의 지속적인 방어는 코드 수정이 아니라 **§C.3의 메커니즘 사실 기록**이다: 같은 계층의 다음 결함도 mock은 잡지 못한다.

## §G. 안티 패턴 (피할 것)

- adb XML을 정규화 없이 그대로 노출(스키마 계약 위반, iOS 플러그인 불가).
- 원래 IME를 프로세스 메모리에만 추적(개정 0.2.0: `text`와 `reset`은 별도 CLI 프로세스이므로 메모리 추적은 복원 불가 → 디스크 영속 필수). ADBKeyBoard 자체를 "원래 IME"로 기록(교차 프로세스 버그).
- 기기에 임시 파일 잔류(exec-out 스트리밍 미사용).
- `--device` 미지정 다중 기기에서 임의의 첫 기기로 조용히 대상 선정(graceful failure 위반).
- 설치 전 `pm list packages` 미확인으로 중복 설치.
- spec.md에 구현 세부(함수명/클래스) 유입.

### 개정 0.3.0 추가 안티 패턴

- **암시적 인텐트로 앱을 연다**(`am start ... -p <pkg>`) — DEFAULT 미선언 앱이 조용히 열리지 않는다(spec.md §C.3-①). 짧아 보인다는 이유로 되돌리지 않는다.
- **런처 컴포넌트 조회의 성패를 종료 코드로 판정한다** — 조회 실패에도 종료 코드는 **0**이므로 실패가 성공으로 오판된다(§C.3-②). stdout을 본다.
- **조회 실패의 원인을 단정하는 오류 메시지**("패키지가 설치되지 않았습니다") — 두 원인이 같은 출력을 내므로 거짓 주장이 된다(§C.3-③).
- **재개 경고 행을 실패로 승격한다** — `am start -n`의 태스크 재개 경고는 종료 코드 0이며 정상 동작이다(§C.3-④).
- **IME 전환/설치 직후 대기 없이 브로드캐스트한다** — 입력이 조용히 유실되며 `ok:true`가 나간다(§C.3-⑤/⑧). 이 개정이 고친 결함 그 자체다.
- **대기 상한을 "실측값"으로 서술한다** — 설계 선택이며 측정 의무가 없다(`MAX_DURATION_MS` 선례). 반대로 **실측 파생값(터치 슬롭 문턱)을 설계 선택처럼 다루는 것**도 같은 오류의 거울상이다.
- **`mServedView`를 판정 오라클로 쓴다** — 성공한 경우에도 `null`이라 무효다(§C.3-⑨). 이미 소진된 길이다.
- **미바인딩 창의 IME id 거동을 확립된 사실로 취급한다** — 측정되지 않았다(§C.3-⑩). 실기기 확인 전에는 가설이다.
- **타임아웃 경로에서 "일단 쏴 보고 `ok:true`"로 되돌린다** — 사용자가 명시적으로 반대 결정을 내렸다(§B 개정 0.3.0).
- **`pm list packages` 판정을 stderr 기반으로 "개선"한다** — Secure Folder 환경에서 오탐이 난다(§C.3-⑪). 현재 구현이 옳다.
- **M10·M11을 한 커밋으로 묶는다** — 응답 계약 변경(M10)은 별도 롤백 단위여야 한다(§F.10).

## §H. 교차 참조

- 요구사항·스키마·로드맵·@MX 대상: `spec.md`
- 인수 기준·엣지 케이스·DoD: `acceptance.md`
- 진행/감사 신호: `progress.md`
- 관련 사실 출처(2026-07-22 문서 확인): adb `input text` 유니코드 불가 / ADBKeyBoard `ADB_INPUT_B64` / `exec-out screencap -p` / `uiautomator dump` 필드셋.
- 개정 0.3.0 실측 근거 전문(2026-07-29, SM-S938N): `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md` — 추린 메커니즘 사실은 spec.md §C.3.
- 설계 선택 상수의 선례(측정 의무 없음의 근거 형태): `src/cli/validators.ts:47-64` `MAX_DURATION_MS`(SPEC-GESTURE-001).
