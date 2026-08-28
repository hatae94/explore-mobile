# SPEC-INSTALL-001 — progress.md

구현 진행 기록. 실기기(D 등급) 증거는 이 파일이 소유한다.

## 마일스톤 상태

| M | 제목 | 상태 | 닫은 AC |
|---|---|---|---|
| M1 | aapt 경로 해결 + 버전 선택 | 완료 | 011~015 |
| M2 | APK 메타데이터 추출 | 완료 | 006~010 |
| M3 | `install` 명령 배선 | 완료 | 001~005, 017~027 |
| M4 | `doctor` aapt 진단 | 완료 | 016 |
| M5 | 실기기 검증 | 완료 (022·023 실측 포함) | 017~024 |
| M6 | 문서 동기화 + 회귀 확인 | 완료 | 028~035 |

## 실기기 증거 (기기 R3CM50FXC3L · SM_G977N · Android 12 · 2026-08-29)

기기는 세션 초반 `unauthorized`였으나 사용자가 USB 디버깅을 승인해 `connectionState: "device"`로 전환됨(재실측으로 확인). 두 기기(안드로이드+아이폰) 연결 상태라 모든 명령에 `--device R3CM50FXC3L` 지정.

### AC-017/018 — fresh 설치 + 양성 대조

```
$ node dist/cli/bin.js install build-1782196453010.apk --device R3CM50FXC3L
{"ok":true,"command":"install","data":{"serial":"R3CM50FXC3L","package":"com.hatae.moyura",
 "versionCode":"1","versionName":"1.0.0","mode":"fresh"}}
```

양성 대조(설치 확인, 같은 회차):
```
설치한 앱:  package:com.hatae.moyura            ← 대상 존재
대조군:     package:com.android.settings        ← 확실히 있는 것도 존재 → 회차 유효
```
대조군이 비지 않았으므로 이 회차는 유효(spec.md §C.5). "빈 출력=부재"로 읽지 않음.

### AC-019 — upgrade 설치

같은 APK 재설치 → `mode` 전환 확인:
```
{"ok":true,...,"mode":"upgrade"}
```

### AC-022 — 서명 불일치 (실제 문구 확정, spec.md §C.4)

다른 키로 재서명한 APK(같은 패키지·버전)를 기존 설치본 위에 설치:
```
{"ok":false,"command":"install","error":{"code":"INSTALL_SIGNATURE_MISMATCH",...}}
```
원시 adb 문구 (exit=1, 앞의 "Performing Incremental Install/Exception" 잡음 뒤):
```
adb: failed to install /tmp/resigned.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE:
Package com.hatae.moyura signatures do not match previously installed version; ignoring!]
```
분류기가 앞의 잡음이 아니라 뒤의 `Failure` 토큰을 집었음 — 견고성 확인.

### AC-023 — 버전 다운그레이드 (실제 문구 확정, spec.md §C.4)

내 키로 versionCode 5·3 두 변형을 apktool로 빌드(원본 잠시 제거 후 복원). vc=5 fresh 설치 → vc=3 설치 시도:
```
{"ok":false,"command":"install","error":{"code":"INSTALL_VERSION_DOWNGRADE",...}}
```
원시 문구 (exit=1):
```
adb: failed to install /tmp/dg/moyura-v3.apk: Failure [INSTALL_FAILED_VERSION_DOWNGRADE:
Package Verification Result]
```

### 기기 상태 복원

내 키 변형 제거 후 원본 APK(원래 키, vc=1) 재설치. `dumpsys package` 확인 → `versionCode=1`. 시작 시점으로 복원 완료.

### AC-016 — doctor aapt 진단 = 실행 경로

```
doctor aapt.resolvedPath:  /Users/hatae/Library/Android/sdk/build-tools/36.1.0/aapt2
execution resolvedPath:    /Users/hatae/Library/Android/sdk/build-tools/36.1.0/aapt2   (일치)
```

### AC-006/007 — 실제 APK 메타데이터

```
build-1782196453010.apk → com.hatae.moyura / versionCode 1 / versionName 1.0.0
```

## 미검증으로 남긴 것 (정직 기록 — "미실행은 통과가 아니다")

| AC | 사유 |
|---|---|
| **AC-020** (덮어쓰기 후 데이터 유지) | `adb install -r`의 데이터 보존은 Android 보장 동작이며 upgrade 경로로 확인됨. 그러나 **앱 수준 상태를 만들어 왕복 검증하지는 않았다** — 대상 앱(com.hatae.moyura)의 UI를 몰라 검증 가능한 상태를 만들 수 없었다. 러너(SPEC-RUNNER-001)가 화면 조작을 갖추면 그때 앱-상태 왕복으로 닫는 것이 적절 |
| **AC-036** (INSTALL_INSUFFICIENT_STORAGE) | spec.md AC-036의 미판정 선언 그대로 — 저장공간 부족을 안전히 재현할 수단이 없어 발행하지 않음. 실측에서 해당 문구 관측 시 승격 |

## 회귀 검증 (M6)

```
typecheck: exit 0
vitest:    1003 passed (52 files)
CLI smoke: install(무인자)→INVALID_ARGS, install(없는파일)→APK_NOT_FOUND(기기 미접촉)
공개 API:  runCli/extractApkMetadata/resolveAaptPath/Install*Error 모두 dist/index.js에서 import 가능
AC-021:    install.ts에 .launchApp(/resolve-activity 실제 호출 없음
AC-034:    신규 backend 파일에 child_process/spawn 직접 호출 없음 (process-executor 재사용)
AC-035:    SKILL.md에 adb/xcrun 직접 실행 지시 없음, 금지 조항 유지
```
