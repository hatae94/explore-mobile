# SPEC-INSTALL-001 — plan.md

구현 계획. Tier M · TDD(RED-GREEN-REFACTOR) · 마일스톤 M1~M6.

## §A.1 마일스톤 개요

| M | 제목 | 산출물 | 닫는 AC |
|---|---|---|---|
| M1 | aapt 경로 해결 + 버전 선택 | `src/backend/aapt-executor.ts`, `src/backend/build-tools-version.ts` (+테스트) | 012~015 |
| M2 | APK 메타데이터 추출 | `src/backend/apk-metadata.ts`, `src/backend/apk-metadata-parser.ts` (+테스트) | 008, 010 |
| M3 | `install` 명령 배선 | `src/cli/commands/install.ts`, `args.ts`, `bin.ts`, `router.ts`, `schema/command-payloads.ts` (+테스트) | 002~005, 021, 024~027 |
| M4 | `doctor` aapt 진단 | `src/cli/commands/doctor.ts`, `src/backend/doctor.ts` (+테스트) | — (016은 M5) |
| M5 | 실기기 검증 | `progress.md` §실기기 증거 | 001, 006, 007, 009, 011, 016~024 |
| M6 | 문서 동기화 + 회귀 확인 | `.claude/skills/explore-mobile/SKILL.md`, `src/index.ts` | 028~031, 032~035 |

**M5는 M3 완료 후에만 실행한다.** M5의 실측이 실패 분류의 판정 근거(종료 코드/stdout/stderr, 문구)를 **확정**하며(spec.md §C.4), 확정 결과를 M3의 분류 코드에 되돌려 반영한 뒤 M6로 넘어간다. M5 이전의 M3 분류 구현은 **잠정**이다.

**M5는 기기 승인이 선행되어야 한다.** 2026-08-29 기준 `R3CM50FXC3L`이 `unauthorized`다(acceptance.md §D 등급 실행 전제). 승인 전에는 M1~M4만 진행 가능하다.

---

## §A.2 마일스톤 상세

### M1 — aapt 경로 해결 + 버전 선택

**새 파일**
- `src/backend/build-tools-version.ts` — 버전 문자열 목록에서 최고 버전을 고르는 **순수 함수**. 숫자 성분별 비교(spec.md §C.1).
- `src/backend/aapt-executor.ts` — `resolveAaptPath()` + `spawnAapt()`. `src/backend/adb-executor.ts`의 구조를 그대로 따른다: 4단계 후보 탐색, 존재+실행가능 predicate, 프로세스 단위 메모이제이션, 주입 가능한 predicate seam.

**동작**
- 후보 순서: `PATH` → `$ANDROID_HOME/build-tools/<최고버전>/` → `$ANDROID_SDK_ROOT/build-tools/<최고버전>/` → `~/Library/Android/sdk/build-tools/<최고버전>/`
- 각 위치에서 `aapt2` 우선, 없으면 `aapt`
- 실행은 `src/backend/process-executor.ts`의 `spawnProcess`를 재사용한다 — **새 프로세스 실행 경로를 만들지 않는다**(AC-INSTALL-034). 셸 주입 방어선이 한 곳에 유지된다.

**RED 먼저**: `["9.0.0","35.0.0","36.0.0","36.1.0"]` → `36.1.0`을 고정하는 테스트를 **가장 먼저** 쓴다. 문자열 비교 구현은 `9.0.0`을 골라 실패한다 — 이것이 AC-INSTALL-013의 회귀 방지선이다.

### M2 — APK 메타데이터 추출

**새 파일**
- `src/backend/apk-metadata-parser.ts` — aapt 출력에서 `package` / `versionCode` / `versionName`을 뽑는 **순수 파서**. `launcher-resolve-parser.ts`와 같은 계열: 프로세스를 모르고 문자열만 안다.
- `src/backend/apk-metadata.ts` — 파일 존재 확인 → aapt 실행 → 파서 호출.

**파싱 대상** (2026-08-29 실측, spec.md §A.2 실측 ②)
- `aapt2 dump packagename` → 단일 행 `com.hatae.moyura`
- `aapt dump badging` 첫 줄 → `package: name='…' versionCode='…' versionName='…'`

**순서 규칙**: 파일 부재·APK 아님은 **aapt를 부르기 전/후 모두 기기 접촉 이전**에 판정한다. 기기 executor는 이 단계에서 한 번도 호출되지 않는다(AC-INSTALL-008/009).

**RED 먼저**: 파일명과 **다른** 패키지 이름을 내는 mock을 주고 응답이 mock 출력을 따르는지 고정한다. 파일명 파싱 구현을 잡는 음성 대조다(AC-INSTALL-010).

### M3 — `install` 명령 배선

**새 파일**
- `src/cli/commands/install.ts`

**수정**
- `src/cli/args.ts` — `install`의 위치 인자
- `src/cli/bin.ts` / `src/cli/router.ts` — 명령 등록
- `src/schema/command-payloads.ts` — `InstallCommandPayload`(`serial`/`package`/`versionCode`/`versionName`/`mode`)
- `src/backend/adb-backend.ts` — `installApp(serial, apkPath, opts)` 추가
- `src/schema/device-backend.ts` — 백엔드 인터페이스에 반영. iOS 백엔드는 미지원을 명시적으로 반환한다(조용한 성공 금지)

**처리 순서** (앞 단계 실패 시 뒤로 진행하지 않는다)
```
1. 인자 검증          → INVALID_ARGS
2. APK 메타데이터     → APK_NOT_FOUND / APK_INVALID / AAPT_NOT_FOUND   (기기 미접촉)
3. 기기 대상 해결     → NO_DEVICE / AMBIGUOUS_DEVICE / DEVICE_NOT_*
4. 설치 실행          → INSTALL_* 계열
5. 성공 응답 구성
```

**분류 규칙 (M5 전까지 잠정)**: 종료 코드 **단독**으로 판정하지 않는다 — `launch`의 실측이 "실패해도 exit 0"을 보였다(spec.md §C.2 함정 ①). 종료 코드와 출력을 **함께** 보되, 최종 근거는 M5 실측으로 확정한다.

**RED 먼저**: 종료 코드 0 + 실패 문구를 내는 mock에서 실패로 판정되는 테스트를 **가장 먼저** 쓴다(AC-INSTALL-025).

**금지**: `install.ts`가 `launch`/`resolve-activity`를 부르지 않는다(AC-INSTALL-021, spec.md §C.2).

### M4 — `doctor` aapt 진단

**수정**
- `src/backend/doctor.ts` — `checkAaptInstalled()` 추가. `checkAdbInstalled()`와 같은 모양(`installed` / `onPath` / `resolvedPath`)에 `buildToolsVersion`을 더한다.
- `src/cli/commands/doctor.ts` — Android 대상 출력에 `aapt` 항목 추가. iOS 대상에서는 `adbKeyboard`처럼 skipped 표시.

진단 경로와 실행 경로가 **같은 해결 함수**를 쓴다 — 두 경로가 다른 바이너리를 가리키는 상태를 만들지 않는다(AC-INSTALL-016).

### M5 — 실기기 검증

**선행 조건**: `R3CM50FXC3L`의 `unauthorized` 해소. 사람이 기기 화면에서 수행.

**준비물 (3종 APK)**
| APK | 용도 | 만드는 법 |
|---|---|---|
| 기준본 | fresh 설치 (AC-017/018) | `build-1782196453010.apk` (`com.hatae.moyura`, versionCode=1) |
| 상위 버전 | upgrade (AC-019/020) | 같은 키·같은 패키지·versionCode 2 |
| 다른 키 | 서명 불일치 (AC-022) | 같은 패키지·**다른 서명 키** |

다운그레이드(AC-023)는 상위 버전을 설치한 뒤 기준본을 덮어써서 만든다.

**기록 의무**: 각 실패 회차마다 **종료 코드·stdout·stderr를 전문 그대로** progress.md에 남긴다. 이것이 spec.md §C.4가 요구하는 확정 근거이며, M3 분류 구현으로 되돌려 반영한다.

**AC-018 양성 대조**: 설치 확인 조회를 할 때 같은 회차에 **이미 설치된 것이 확실한 다른 패키지**를 함께 조회한다. 대조군이 비면 회차를 **무효**로 기록한다 — 빈 출력은 부재의 증거가 아니다(spec.md §C.5).

**오염 처리**: 알림 배너·시스템 팝업이 관측된 회차는 무효로 기록하고 재실행한다. 무효 회차도 남긴다.

### M6 — 문서 동기화 + 회귀 확인

**수정**
- `.claude/skills/explore-mobile/SKILL.md` — 명령 표에 `install` 행, 에러 코드 표에 신규 7개, 러너의 저장소 밖 호출 형식 절
- `src/index.ts` — 새 공개 타입 내보내기 (러너가 모듈로 소비한다)

**낡은 수치 처리**: "13개 명령" 취지의 서술이 남지 않도록 한다. 손으로 센 수를 적지 않고 **세는 명령의 결과**로 확인한다(AC-INSTALL-030).

**회귀 확인**: `pnpm typecheck` + `pnpm test` 통과(AC-032/033).

---

## §B. 위험과 완화

| 위험 | 완화 |
|---|---|
| 실패 문구가 기기·OS 버전마다 다르다 | 분류되지 않은 실패는 `INSTALL_FAILED`로 두고 **원인 문구를 보존**한다(AC-024). 단정하지 않는다 |
| M5 실측이 M3 구현을 뒤집는다 | 예상된 경로다. M3 분류를 **잠정**으로 선언하고 M5→M3 되돌림을 계획에 넣었다 |
| 기기 승인이 지연되어 M5가 막힌다 | M1~M4는 기기 없이 진행 가능. M5 미실행을 **통과로 기록하지 않는다** |
| aapt가 없는 사용자 환경 | `AAPT_NOT_FOUND` + `doctor` 진단으로 안내. adb가 이미 같은 방식으로 처리한다 |
| 새 프로세스 실행 경로가 셸 주입 표면을 연다 | `spawnProcess` 재사용을 AC로 고정(AC-034) |

## §C. 이 SPEC이 끝나면 가능해지는 것

APK 경로 하나로 앱을 기기에 올릴 수 있게 된다. 그 위에 얹힐 **테스트 러너**(별도 프로젝트, `runCli`를 모듈로 호출 + `claude -p`가 수행)는 이 SPEC의 범위 밖이며, 자체 SPEC을 갖는다.
