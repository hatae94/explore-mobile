---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어 — 구현 계획"
version: "0.4.0"
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

**개정 0.4.0 컨텍스트 (2026-07-29)**

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 직전 completed: `e8b1849`(0.3.0 마감 — sync + 3-phase close). 같은 날 두 결함이 추가로 실측됐다
- **실기기**: Galaxy S25 Ultra(SM-S938N), Android 16, 무선 ADB — 이번에는 **Settings 앱이 아니라 Chrome으로 `m.naver.com`을 구동**하면서 결함 4가 드러났다
- **호스트**: macOS + Xcode. `devices`가 **23건**을 반환하며 연결된 것은 **2건**(Android 실기기 + 부팅된 iPhone 17 Pro 시뮬레이터), 나머지 **21건은 offline iOS 시뮬레이터** — 결함 5의 조건
- 이 개정도 **코드를 변경한다**. 실측 근거는 **별도 보고서 없이 spec.md §C.4가 1차 기록**이다

### A.5 PRESERVE (수정 금지)

- `src/normalize/uiautomator.ts` · `src/normalize/idb.ts` · `src/normalize/element-query.ts` — 정규화·셀렉터 계약 불변. 이 개정은 정규화 계층을 전혀 건드리지 않는다
- `src/schema/device-backend.ts` — **인터페이스 시그니처 불변.** 두 결함 모두 `AdbBackend` **구현 내부**의 문제이지 인터페이스 공백이 아니다. 여기를 건드리면 SPEC-IOS-001·SPEC-GESTURE-001의 테스트 더블이 전부 깨진다
- `src/backend/idb-backend.ts` · `src/backend/idb-*.ts` — iOS 경로. `launchApp`은 인터페이스를 공유하지만 **본 개정의 대상은 Android 경로뿐이다**(REQ-APP-001 개정의 주어가 `the Android backend`인 이유)
- `src/backend/ime-session-store.ts` — 디스크 영속 IME 세션. 타임아웃 경로에서도 **영속을 유지**하는 것이 요건이므로(REQ-IDEMP-004 불변) 이 파일의 거동을 바꾸지 않는다
- `src/backend/adbkeyboard-installer.ts`의 `pm list packages` 판정 방식 — `exitCode` + `stdout`만 보는 현재 구현이 **옳다**(spec.md §C.3-⑪ Secure Folder 확증). stderr 기반 판정으로 바꾸지 않는다
- SPEC-GESTURE-001이 만든 `getMinEffectiveSwipeThreshold` 관련 경로 — 문턱 산식·파싱 불변

**개정 0.4.0 추가 PRESERVE**

- **`devices` 명령의 출력** (`cli/commands/devices.ts` + 각 백엔드의 `listDevices`) — 미연결 항목을 계속 **전부** 나열한다. M13이 바꾸는 것은 **대상 해석 계층뿐**이며, 인벤토리 명령까지 "일관성 있게" 필터링하면 사용자가 offline 시뮬레이터의 존재를 확인할 방법이 사라진다(spec.md REQ-MULTIDEV-002 불변 조항). `listDevices`가 이미 `connectionState`를 정확히 보고한다 — **정보는 있었고 대상 해석이 쓰지 않았을 뿐이다**
- **`ime-binding-parser.ts`의 `bound`/`currentImeId` 계약** — M14가 `mInputShown`을 같은 덤프에서 읽더라도 **기존 두 필드의 의미·기본값을 바꾸지 않는다**. 특히 `bound`가 마커 부재 시 `false`로 기울어지는 방어적 기본값은 M10의 무음 유실 방지 근거이므로 건드리지 않는다
- **`--keep-keyboard` 플래그의 의미** — 숨김 단계 전체 생략. M14는 숨김의 *수단*을 바꿀 뿐 옵트아웃 의미를 바꾸지 않는다(AC-ANDROID-022 불변)
- **`text` 전송 경로 자체** (`broadcastBase64Text` 및 M10 바인딩 대기, M12 재시도) — 결함 4는 전송 **이후** 단계의 문제다. 전송 경로를 건드리면 0.3.0이 판정한 AC-029·033의 근거가 흔들린다

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
| `src/backend/adb-backend.ts` | **M12** | `setImeToAdbKeyboard`의 `ime enable` 단계: **등록 경쟁 실패 형태에 한정한** 상한 있는 재시도. 다른 실패는 재시도 없이 즉시 전파 |
| `ime enable` 실패 형태 판정 술어 (신규, 배치는 구현 재량) | **M12** | **순수 함수** — `ime enable` 실패의 stdout/stderr/종료 코드 → "등록 경쟁(재시도 가능)" 또는 "그 외(즉시 표면화)". 기기 없이 픽스처로 단위 테스트 가능해야 한다. §C.3-⑫의 실측 메시지가 대표 픽스처다 |
| `src/backend/adb-backend.test.ts` | **M12** | 재시도 성공(1회 실패 후 성공) / **비매칭 실패는 `ime enable` 호출이 정확히 1회**(재시도 없음) / 매칭 실패가 상한까지 지속 → **유한 종료 + 브로드캐스트 argv 미도달** 픽스처 |
| `src/cli/device-targeting.ts` | **M13** | `resolveTargetDevice`가 `connectionState === "device"`로 먼저 걸러낸 뒤 계수·자동 선택·메시지를 만든다. 명시 지정 serial이 목록에 있으나 미연결이면 `DEVICE_NOT_CONNECTED`. `details.availableDevices`는 연결된 기기만 + 미연결은 개수 요약 |
| `src/cli/device-targeting.test.ts` | **M13** | **순수 함수 픽스처로 전부 판정 가능** — 23건(연결 2)·23건(연결 1)·23건(연결 0)·미연결 serial 명시 지정·미상 serial 명시 지정. 실기기 없이 결함 5의 모든 논리를 고정한다 |
| 오류 코드 표면(`DEVICE_NOT_CONNECTED` — 배치는 구현 재량) | **M13** | `CommandErrorInfo.code` 문자열. `ime-errors.ts` 같은 전용 오류 클래스가 필요한지는 구현 재량 — 이 경로는 순수 함수가 이미 구조화된 오류를 반환하므로 throw/`instanceof` 왕복이 불필요할 수 있다 |
| `README.md` · `.claude/skills/explore-mobile/SKILL.md` | **M13** | 자동 선택 설명에 **"연결된"의 정의**를 넣는다. 현재 문구(`exactly one device is connected`)는 약속으로는 옳고 동작만 틀렸으므로, 수정 후에는 문구가 참이 된다 — 다만 offline 항목이 목록에 섞인다는 사실을 함께 적어 사용자가 `devices` 출력과 대조할 수 있게 한다 |
| `src/backend/adb-backend.ts` | **M14** | `hideKeyboard`: `KEYCODE_ESCAPE` → `KEYCODE_BACK`. 전송 전 `mInputShown` 확인 가드. best-effort(모든 실패 swallow) 유지 |
| `src/backend/keycodes.ts` | **M14** | `KEYCODE_ESCAPE` 상수 제거 또는 대체. `ANDROID_KEYCODE.back`(4)이 이미 존재하나 그것은 **공개 `key` 별칭 어휘**이고 이쪽은 내부 구현 세부다 — 재사용할지 별도 상수를 둘지는 구현 재량이되, **왜 BACK인지**(§C.4-⑰/⑱)를 정의 지점에 독블록으로 남긴다 |
| `mInputShown` 파서 (`ime-binding-parser.ts` 확장 또는 신규 — 배치는 구현 재량) | **M14** | **순수 함수** — 덤프 문자열 → 소프트키보드 표시 여부. 기존 `bound`/`currentImeId` 계약은 불변(PRESERVE). **마커 출현 횟수는 미측정**이므로(§C.4-⑱) 정확히 1회를 가정하지 말 것 |
| `src/backend/adb-backend.test.ts` | **M14** | 표시됨 → BACK argv 전송 / 미표시 → **숨김 argv 미도달** / 조회 실패 → 숨김 argv 미도달 + `text`는 성공 / 숨김 전송 실패 → `text`는 성공 / `--keep-keyboard` → 조회조차 하지 않음 |

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

**리스크 — 미측정 결합항 [해소됨]**: 준비 술어의 두 번째 결합항(바인딩된 IME id)은 최초 검증에서 **미바인딩 창에서 측정되지 않았다**(spec.md §C.3-⑩). **M10 검증 세션에서 관측이 완료됐다**(spec.md §C.3-⑯): 미바인딩 창에서 `mCurId`는 **이미 ADBKeyBoard였고**, 따라서 결합항은 **판별력이 0**이다 — 구현의 `bound` 단독 선택은 이제 논증이 아니라 **관측으로 확증된다**. AC-ANDROID-032는 이 관측 기록으로 충족된다.

### 개정(Amendment, 개정 0.3.0 연장 — M12) — 같은 cold 시퀀스의 **더 앞 단계**에서 드러난 세 번째 결함

M10(`f6e0724`) 실기기 검증은 AC-029·AC-032를 통과시켰지만, **같은 cold 시퀀스의 한 단계 앞**에서 세 번째 경쟁 조건을 드러냈다 — `adb install` → `ime enable`이다. 이것은 **같은 0.3.0 개정의 연장**이며(REQ-INPUT-003의 자가치유 설치 절 위에 선다) 새 개정이 아니다.

**결함 3 — 자가치유 설치 직후의 `ime enable`이 IMMS 미등록으로 실패한다** (`adb-backend.ts` `setImeToAdbKeyboard`, REQ-INPUT-003):
패키지 설치는 **방금 성공했는데도**(`pm list packages` 계수 0 → 1) `ime enable`이 `Unknown input method ... cannot be enabled for user #0`(exit 255)로 실패한다. IMMS가 새로 설치된 IME를 아직 등록하지 못한 창이다(spec.md §C.3-⑫).

**심각도 — 부풀리지 않는다.** 이 실패는 **소리 내어 실패한다(loud)**: `ok:false` + 구체적 메시지를 반환하고 브로드캐스트를 보내지 않는다. 따라서 M10·M11이 죽인 **`ok:true`-무효과(무음, silent)** 부류가 **아니며 심각도가 더 낮다.** 그럼에도 실제 결함인 이유는 **유효한 연산이 사용자에게 보이는 이유 없이 실패(spurious failure of a valid operation)** 하기 때문이다 — `doctor` 직후 또는 `reset` 이후 **첫 한글/이모지 입력이 이유 없이 실패**한다.

**빈도 — 상관이지 원인이 아니다.** cold + **포커스된 입력란** 3/8 실패, 포커스 없음 0/5(CLI)·0/6(raw adb)(spec.md §C.3-⑬). 상관은 강하지만 **표본이 작고 메커니즘은 확립되지 않았다** — 문서·주석·커밋 어디에서도 원인으로 서술하지 않는다. 그럼에도 이 상관이 중요한 것은 **포커스된 입력란이 `text`가 실제로 쓰이는 바로 그 조건**이기 때문이다.

**리스크 — 재시도 조건이 넓어지는 것**: 재시도는 §C.3-⑫의 실패 형태에만 적용된다. 넓히면 모든 `ime enable` 실패를 삼키는 루프가 되어 실제 결함이 상한만큼 지연된 뒤 같은 오류로 나오면서 원인만 흐려진다(AC-ANDROID-034가 이를 고정한다).

**주장 경계 — 왜 준비 신호 폴링이 아닌가**: `ime list -a`를 등록 준비 신호로 쓸 수 있는지 탐침했으나 **간헐 실패 창을 잡지 못해, 실패 중의 값을 한 번도 관측하지 못했다**(spec.md §C.3-⑭). 그 위에 수정을 세우면 §C.3-⑩이 이미 경고한 "미측정을 확립된 사실로 취급하는" 오류를 반복한다. **`ime enable`의 권위 있는 준비 판정은 `ime enable` 자신의 성공**이며, 재시도가 안전한 근거는 **실측된 멱등성**이다(§C.3-⑮: 재실행 시 exit 0 + `already enabled`, `ime list -s`에 중복 없음).

**재시도 상한·백오프는 설계 선택이다** — M10의 5,000ms 대기 상한, `MAX_DURATION_MS`와 같은 부류이며 **측정 의무가 붙지 않는다**.

### 개정(Amendment, 개정 0.4.0) — 브라우저 구동과 2기기 운용이 드러낸 결함 2건

0.3.0 마감(`e8b1849`) **당일**, 검증의 무대를 두 번 옮기자 두 결함이 드러났다 — Settings 앱에서 **Chrome 웹 페이지**로, 1기기에서 **2기기(Android 실기기 + iOS 시뮬레이터)** 로. 둘 다 **기존 REQ에 대한 구현 결함**이며, 본 개정은 REQ에 날을 세워 결함이 **표현 불가능**하게 만들고 AC 10건을 추가한다.

**결함 4 — `text`가 자기 입력을 스스로 지운다** (`adb-backend.ts` `hideKeyboard`, REQ-INPUT-004):
전송 후 소프트키보드를 내리려고 보내는 `KEYCODE_ESCAPE`(111)가 Chrome에서는 **페이지로 전달되어 입력 취소로 해석된다**. `text "..."`가 `{"ok":true}`를 반환하는데 입력란은 비어 있다. 3단계 분리 실측이 삭제의 주체를 ESCAPE 자신으로 좁혔다 — `abc` 착지 → `abc날씨` 착지 → **ESCAPE만 단독 전송** → 플레이스홀더 복귀(spec.md §C.4-⑰). 수정은 `KEYCODE_BACK`(4)이며, BACK은 **웹 입력란과 네이티브 `EditText` 양쪽에서** 키보드를 내리면서 텍스트를 보존한다(§C.4-⑱).

**이 결함이 왜 지금까지 안 잡혔는가 — 그리고 그것이 AC 형태를 정한다.** 네이티브 `EditText`에서는 ESCAPE도 **정상 동작한다.** 이 SPEC의 실기기 검증은 지금까지 **전부 Settings 앱에서** 이뤄졌고, 그래서 M10·M12의 cold/warm 판정까지 모두 통과했다. **판정 무대가 곧 판정력이었다** — 같은 명령, 같은 argv, 같은 봉투인데 화면이 다른 앱이었기 때문이다. 그러므로 AC-ANDROID-036은 **웹 입력란에서만** 판정되며, 네이티브 판정으로 대체할 수 없다(AC-ANDROID-037은 그 반대 방향의 비회귀 확인이다).

**심각도 — 부풀리지도 줄이지도 않는다.** 이것은 **무음(silent) 부류**다: `ok:true`인데 관측 가능한 효과가 없다 — M10·M11이 죽인 바로 그 부류이며 M12의 소리 내는 실패가 **아니다.** 다만 앞선 무음 결함들이 *아무 일도 하지 않았던* 것과 달리, 이것은 **사용자가 방금 요청한 작업의 결과를 능동적으로 파괴한다.** 그리고 얹힌 자리가 **이 도구의 주 용도**다 — 브라우저로 웹 콘텐츠를 구동하는 것.

**결함 5 — 미연결 기기가 연결된 기기로 계수된다** (`cli/device-targeting.ts` `resolveTargetDevice`, REQ-MULTIDEV-001/002):
`resolveTargetDevice`가 `connectionState`를 **한 번도 읽지 않는다.** 이 Mac에서 `devices`는 23건을 반환하고 연결된 것은 2건인데(나머지 21건은 offline iOS 시뮬레이터 — Xcode가 설치된 Mac이면 어디서나 존재한다), 계수·자동 선택·오류 메시지가 전부 23을 쓴다.

**REQ가 이미 옳게 쓰여 있었다 — 구현이 REQ 자신의 문구를 위반한다.** REQ-MULTIDEV-002는 개정 전에도 "2대 이상의 기기가 **연결되고**"라고 썼다. 문제는 **"연결"이 어디에도 정의돼 있지 않았다**는 것이다. 그래서 이 개정은 새 요구를 세우는 것이 아니라 **이미 있던 낱말에 관찰 가능한 의미를 부여**한다(`connectionState === "device"`).

**심각도 부류가 결함 4와 다르다 — 정확히 기술한다.** 봉투는 거짓말하지 않는다(`ok:false`). 대신 셋이 어긋난다: (a) **오류 메시지 본문이 거짓 수를 주장**하고(`23 devices connected`), (b) **문서화된 자동 선택이 도달 불가**가 되며(README가 약속한 분기가 Xcode 설치 Mac에서 한 번도 발동하지 않는다), (c) 미연결 기기 지정이 **한 층 늦게** 실패한다(백엔드의 `not booted` 메시지는 유익하지만 층이 틀렸다). **무음 부류가 아니며 심각도가 더 낮다.** 그럼에도 결함인 이유는 (b)가 **문서-동작 모순**이고 (a)가 **거짓 진술**이기 때문이다.

**이 결함은 플랫폼 중립이다 — Android 이름의 SPEC 안에 있다고 Android로 좁히지 말 것.** `device-targeting.ts`는 두 백엔드를 **함께** 서비스하고, 실측에서 정의를 위반한 항목 21개는 **전부 iOS 시뮬레이터**였다. 이 문장이 spec.md REQ-MULTIDEV-001과 여기 양쪽에 있는 이유는, 나중에 읽는 사람이 파일 위치만 보고 범위를 오독하는 것을 막기 위해서다.

**mock 사정거리 — 0.3.0과 반대 방향의 규율이 필요하다.** 0.3.0의 세 결함은 전부 mock 사정거리 밖이었고 그것이 문서의 큰 부분을 차지했다. **결함 5는 반대다**: `resolveTargetDevice`는 **`DeviceInfo[]`를 받는 순수 함수**이므로 계수·자동 선택·오류 코드·`details` 구성이 **전부 unit으로 완전히 판정된다.** 기기의 해석도, 시점도, 화면 효과도 개입하지 않는다. 실측 레그는 **배선 확인(보강)** 이지 판정 조건이 아니다 — 이것을 "실측 필수"로 적으면 mock을 일괄 불신하는 과잉교정이 되고, 기기가 없다는 이유로 판정 가능한 AC가 미기록으로 밀린다. **결함 4는 정확히 반대로** 웹 입력란 실측이 아니면 판정되지 않는다(acceptance.md §D.4.2가 이 두 방향을 함께 고정한다).

**리스크 — 응답 계약 변경의 정확한 범위**: 결함 5 수정은 **봉투를 바꾸지 않는다**(미연결 지정 경로는 개정 전에도 `ok:false`였다). 바뀌는 것은 오류 **코드**, 실패 **지점**(기기에 아무것도 보내기 전으로 앞당겨짐), `details.availableDevices` **구성** 셋이다. M10의 `ok:true → ok:false` 같은 봉투 변경이 **아니며**, 그렇게 서술하면 다음 사람이 잘못된 우선순위로 읽는다. 결함 4 수정은 응답 계약을 **전혀** 바꾸지 않는다.

**리스크 — 예방적 가드를 실측으로 승격하는 것**: `mInputShown` 확인 가드는 값싸고 안전해서 넣는 것이지 측정이 요구해서가 아니다. 유일한 반대 시행(미표시 상태 BACK → 포그라운드 무변화)은 예상된 이탈이 **일어나지 않았음**을 보인다(§C.4-⑲). 표본 1회이므로 "이탈하지 않는다"도 확립되지 않았다 — 확립된 것은 "이탈한다가 관측되지 않았다"뿐이다. 문서·주석·커밋에서 이 선을 넘지 않는다.

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

### C.1 개정 0.3.0 사전 점검 (M10·M11·M12 착수 전)

- **기준선 확보**: `pnpm typecheck` / `pnpm build` exit 0, `pnpm vitest run` 653건 green을 **먼저** 찍는다. 이 개정이 더하는 테스트만 증가분이어야 한다.
- **`adb`는 PATH 밖에 있다** — `~/Library/Android/sdk/platform-tools/adb`. `command -v adb` 하나의 실패를 "미설치"로 읽지 않는다(SPEC-GESTURE-001 §C.2가 이 오류를 이미 겪었다). 실기기 판정 전 `export PATH`가 필요하다.
- **기기 연결 확인**: `adb devices`로 SM-S938N 무선 ADB 연결 확인. **기기가 없으면 실측 판정 AC(026·027·029·032)는 미기록으로 남기고 PASS로 승격하지 않는다** — 관측하지 않은 것을 PASS로 주장하지 않는다.
- **기기 기준선 기록**: 기본 IME(`settings get secure default_input_method`), ADBKeyBoard 설치 여부(`pm list packages`), `~/.cache/explore-mobile/ime-sessions.json` 내용, 포그라운드 앱. **M10 판정 종료 후 이 4개를 원상 복원하고 대조 확인한다**(2026-07-29 검증이 그렇게 했다).
- **M10 판정은 기기 상태를 반복 변경한다** — §F M10의 경고 블록을 먼저 읽는다.
- **M12 판정은 M10보다 더 많이, 그리고 포커스된 입력란에서 반복한다** — 결함이 재현된 유일한 조건이 **cold + 포커스된 입력란**(3/8)이었고 포커스 없이는 0/11이었다(spec.md §C.3-⑬). 포커스 없이 도는 판정은 **결함을 만나지 못하고 통과하므로 판정이 아니다.** §F M12의 경고 블록을 먼저 읽는다.

### C.2 개정 0.4.0 사전 점검 (M13·M14 착수 전)

- **기준선 확보**: `pnpm typecheck` / `pnpm build` exit 0, `pnpm vitest run` green을 **먼저** 찍는다(0.3.0 마감 시점 679건). 이 개정이 더하는 테스트만 증가분이어야 한다.
- **M13은 기기가 필요 없다.** `resolveTargetDevice`는 `DeviceInfo[]`를 받는 순수 함수이므로 논리 판정은 **전부 unit**이다. 기기 없이 착수하고 완주할 수 있다 — 실측 레그는 배선 확인용 보강이다.
- **M13의 실측 보강은 기기 구성을 두 번 요구한다(그리고 그 구성은 소모성이다)**:
  - **구성 A — 연결 2대**(Android 실기기 + 부팅된 iPhone 17 Pro 시뮬레이터, offline 21대 존재): 계수·메시지 정정 확인(23 → 2). AC-041.
  - **구성 B — 연결 1대**(시뮬레이터를 종료하여 Android만 연결, offline 22대 존재): **자동 선택 도달 가능성** 확인. AC-042.
  - 두 구성은 **배타적**이므로 한 번에 둘 다 볼 수 없다. B는 A에서 시뮬레이터를 종료하기만 하면 되므로 **A → B 순서가 싸다**(되돌리려면 부팅 대기가 든다).
  - `devices` 원본 출력을 **판정 전에 저장**한다 — 23건의 `connectionState` 분포가 픽스처의 전제이며, 나중에 시뮬레이터를 추가·삭제하면 재현할 수 없다.
- **M14 판정은 Settings 앱에서 돌면 결함을 만나지 못한다.** 판정 무대는 **Chrome + 웹 페이지 입력란**이며(실측 대상: `m.naver.com` 검색창), 네이티브 `EditText`는 **비회귀 확인용**이다. §F M14의 경고 블록을 먼저 읽는다.
- **`adb`는 PATH 밖에 있다** — `~/Library/Android/sdk/platform-tools/adb`(§C.1과 동일). M14 실측 전 `export PATH`가 필요하다.
- **M14 판정 후 기기 정리**: Chrome 탭·검색어를 남기지 않고, §C.1의 기기 기준선 4개 항목을 대조 확인한다.

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

**M12 추가 — 간헐 결함의 판정은 "몇 번 돌았는가"를 포함해야 한다.**

- **mock으로 충분한 것**: 재시도가 **상한 안에서 유한 종료**하는가, **비매칭 실패에서 `ime enable`이 정확히 1회만 호출**되는가(재시도 없음), 재시도 소진 시 **브로드캐스트 argv가 mock exec에 도달하지 않는가**. 이 셋은 mock이 정확히 답할 수 있는 질문이다.
- **mock으로 불충분한 것**: 재시도가 **실제 IMMS 등록 창을 실제로 건너뛰는가**(AC-033). mock에는 IMMS 등록이라는 개념이 없다 — 결함 2와 같은 이유다.
- **그리고 M10·M11과 다른 점**: 결함 3은 **간헐적(3/8)** 이다. 결함 1·2는 조건만 맞추면 100% 재현됐으므로 1회 관측이 판정이 됐지만, **결함 3은 1회 green이 판정이 아니다** — 미수정 상태에서도 5/8 확률로 통과한다. 그래서 AC-033은 **시행 횟수를 명시**하며, 그 횟수는 "우연히 통과했을 확률"을 계산 가능한 수준으로 낮추기 위한 것이다.
- **판정 조건도 다르다**: 반복은 **포커스된 입력란**에서 돌아야 한다. 포커스 없이 돌면 baseline 실패율 자체가 0/11이므로(spec.md §C.3-⑬) **결함을 만나지 못한 채 통과한다.**

**개정 0.4.0 추가 — 두 결함이 mock 축의 반대편 끝에 있다. 양쪽 다 정확히 적는다.**

- **M13(결함 5)은 mock으로 전부 판정된다.** `resolveTargetDevice`는 `DeviceInfo[]` → 결과인 **순수 함수**다. 계수가 미연결을 제외하는가, 연결 1대일 때 자동 선택이 발동하는가, 미연결 serial 지정이 `DEVICE_NOT_CONNECTED`를 내는가, `details.availableDevices`가 연결된 기기만 담는가 — **넷 다 픽스처로 완전히 단언된다.** 기기의 *해석*도 argv *사이의 시간*도 *화면 효과*도 개입하지 않는다. 실측 레그는 **배선 확인(보강)** 이다: 실제 `listDevices()`가 offline 시뮬레이터를 `connectionState: "offline"`으로 내는가(§C.4-⑳에서 이미 관측됨), 그리고 실제 CLI가 정정된 메시지를 내는가.
- **이것을 "실측 필수"로 적지 않는 것이 규율이다.** mock을 일괄 불신하는 과잉교정은 (a) 기기가 없을 때 판정 가능한 AC를 미기록으로 밀고, (b) "실측 필수" 표식의 의미를 희석해 **정말로 실측이 아니면 안 되는 AC**(036)와 구별이 안 되게 만든다.
- **M14(결함 4)는 반대로 웹 입력란 실측이 아니면 판정되지 않는다.** mock은 "BACK argv가 구성됐다"까지만 답한다. **"기기가 그 키를 어떻게 해석하는가"** 가 결함의 전부였고 — Chrome은 페이지로 전달, 네이티브는 키보드만 내림 — 그것은 mock에 개념이 없다.
- **mock으로 충분한 것(M14)**: 표시 상태 → BACK argv 전송, **미표시 → 숨김 argv 미도달**(미전송은 mock의 강점), 조회 실패 → 숨김 argv 미도달 + `text` 성공, 숨김 전송 실패 → `text` 성공, `--keep-keyboard` → 조회조차 하지 않음.
- **mock으로 불충분한 것(M14)**: 숨김 후 텍스트가 **웹 입력란에 살아남는가**(AC-036), **네이티브에서도 살아남는가**(AC-037), 키보드가 **실제로 내려갔는가**(AC-038).
- **유효 오라클 — 이번에는 `dumpsys` 필드가 유효하다.** 결함 2에서 `mServedView`가 무효였던 것과 달리, `mInputShown`은 BACK 전후로 `true → false` 전환이 **직접 관측됐다**(§C.4-⑱). 다만 텍스트 생존 판정의 오라클은 여전히 **스크린샷**이다 — `mInputShown`은 키보드 상태만 말하고 입력란 내용은 말하지 않는다. **두 오라클은 서로 다른 질문에 답하며 대체 관계가 아니다.**
- **판정 무대 자체가 판정력이다(M14의 핵심 교훈).** 같은 명령·같은 argv·같은 봉투인데 Settings 앱에서는 통과하고 Chrome에서는 실패했다. 무대를 적지 않은 AC는 **판정처럼 보이지만 판정이 아니다.**

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

### M12 — `ime enable` 등록 경쟁 상한 재시도 [개정 0.3.0 연장 · 결함 3 · 낮은-중간 번복 가능성]

> **선행**: **M10(`f6e0724`)에 의존한다** — 같은 `inputText` cold 시퀀스를 M10이 방금 바꿨고, M12는 그 시퀀스의 **한 단계 앞**(`adb install` → `ime enable`)에 손댄다. **M11과는 무관하다**(§F.10).
>
> **⚠️ 왜 M11 아래에 오는가 — 번복 가능한 표면이 좁다.** M10과 달리 **사용자 대면 응답 계약을 바꾸지 않는다**(`ok:false`였던 것이 `ok:false`로 남고, 다만 이유 없이 발생하는 빈도가 준다). 번복 가능한 결정은 셋뿐이다: (a) **어떤 실패 형태를 재시도 대상으로 볼 것인가**(가장 바뀔 확률 높음), (b) 재시도 상한, (c) 백오프 형태. (b)·(c)는 설계 선택이므로 값이 바뀌어도 계약이 흔들리지 않는다. **번호는 도착 순서지 의존 순서가 아니다** — M12는 M10 검증이 열었다.
>
> **⚠️ 이 마일스톤은 간헐 결함을 다룬다 — 1회 green은 판정이 아니다.** 미수정 상태에서도 5/8 확률로 통과한다. AC-033이 시행 횟수를 명시하는 이유다.
>
> **⚠️ 실측 판정은 M10보다 비싸다.** ADBKeyBoard **설치/제거 사이클을 반복**해야 하고(`reset` → `text` 자가치유 설치 → 관측 → 다시 `reset`), 매 시행이 **포커스된 입력란**에서 이뤄져야 한다 — 결함이 재현된 유일한 조건이다(spec.md §C.3-⑬). 판정 종료 후 §C.1의 기기 기준선 4개 항목을 **복원하고 대조 확인한다**.
>
> **⚠️ 신규 REQ 0건.** 산출물 전부가 REQ-INPUT-003(개정 0.3.0 M12 절) 위에 선다.

**산출물 1 — 실패 형태 판정 술어(순수 함수).** `ime enable` 실패의 stdout/stderr/종료 코드 → **"등록 경쟁(재시도 가능)"** 또는 **"그 외(즉시 표면화)"**. 대표 픽스처는 spec.md §C.3-⑫의 실측 문자열(`Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #0`, exit 255)이다. 기기 없이 단위 테스트 가능해야 한다. 매칭 폭·문자열 정확도는 구현 재량이나, **"모든 실패가 매칭된다"로 넓히는 것은 규범 위반**이다(AC-034).

**산출물 2 — 상한 있는 재시도(`adb-backend.ts` `setImeToAdbKeyboard`).** `ime enable` 실패가 위 술어에 매칭될 때만 재시도한다.
- **재시도 상한과 백오프는 설계 선택이다** — 정의 지점에 **왜 측정 의무가 없는지**를 M10의 `IME_BIND_TIMEOUT_MS` 및 `MAX_DURATION_MS`(`src/cli/validators.ts:47-64`)와 같은 형태의 독블록으로 남긴다. 목적은 "무한 재시도 금지"뿐이며, 이 값은 기기 거동을 주장하지 않는다.
- **재시도가 안전한 근거는 실측된 멱등성이다**(spec.md §C.3-⑮) — 이미 활성화된 IME에 `ime enable`을 재실행하면 exit 0 + `already enabled`이고 `ime list -s`에 중복이 생기지 않는다. 이 근거를 주석에 남긴다.
- **비매칭 실패는 재시도하지 않고 즉시 전파한다.** mock으로 정확히 단언 가능한 핵심 요건이다(`ime enable` 호출 횟수 정확히 1회).
- **재시도 소진 시**에도 브로드캐스트를 보내지 않는다 — 기존 `assertSuccess` 전파 경로가 그대로 유지되면 자연히 충족된다. **새 오류 코드를 만들지 않는다**(신규 오류 표면 0건 — 이 실패는 이미 소리 내어 실패하고 있었고, M12는 그 빈도를 줄일 뿐이다).

**산출물 3 — 판정.** mock 레그(재시도 성공 / 비매칭 1회 / 상한 소진 3형태) + **실측 레그**: cold 사이클을 **포커스된 입력란에서 반복**하며 `ime enable` 실패 0회 + 문자열 착지를 확인(AC-033).

**AC**: AC-ANDROID-033(**cold 반복 시행에서 등록 경쟁 회복 — 실측 필수, 시행 횟수 명시**) / AC-ANDROID-034(비매칭 실패 즉시 표면화, 재시도 없음) / AC-ANDROID-035(재시도 상한·유한 종료).

**심각도 서술 규율(문서·주석·커밋 공통).** 이 결함을 **무음 실패(silent)** 로 서술하지 않는다 — `ok:false` + 구체적 메시지를 내는 **소리 내는 실패(loud)** 이며 M10·M11 부류보다 심각도가 낮다. 정확한 표현은 **"유효한 연산의 이유 없는 실패(spurious failure of a valid operation)"** 다. 마찬가지로 **포커스 상관을 원인으로 서술하지 않는다**(spec.md §C.3-⑬).

### M13 — 대상 기기 해석의 "연결" 정의 [개정 0.4.0 · 결함 5 · 최고 변경 확률]

> **선행**: 없음 — **M10·M11·M12 전부와 독립이다**(§F.10). `device-targeting.ts` vs `adb-backend.ts`로 공유 코드가 0이다.
>
> **⚠️ 왜 M14보다 먼저 오는가 — 번복 가능한 표면이 더 넓다.** 이 마일스톤은 **되돌릴 수 있는 결정 넷**을 담는다: (a) `details.availableDevices` **응답 형태 변경**(연결된 기기만 + 미연결은 개수 요약 — 사용자 대면), (b) 전용 오류 코드를 **둘 것인가와 그 이름**(`DEVICE_NOT_CONNECTED`), (c) 실패 **지점**을 백엔드에서 대상 해석 계층으로 앞당기는 것, (d) `unauthorized`를 미연결로 볼 것인가(현재 정의는 본다 — 대상으로 삼을 수 없으므로). 반대로 M14의 메커니즘 선택(BACK)은 **실측이 사실상 강제**하며 번복 가능한 것은 예방적 가드뿐이다. 리뷰 주의를 여기 먼저 붙이기 위한 배치이며 **실행 순서 제약이 아니다**(§F.10).
>
> **⚠️ 이 마일스톤은 플랫폼 중립이다.** `device-targeting.ts`는 두 백엔드를 함께 서비스하고, 실측 위반 항목 21개는 **전부 iOS 시뮬레이터**였다. Android 경로로 좁히면 결함이 그대로 남는다(spec.md REQ-MULTIDEV-001 개정).
>
> **⚠️ 기기가 필요 없다.** 논리 판정은 전부 순수 함수 unit이다. 실측은 **배선 확인 보강**이며, 기기 구성 A/B 두 가지를 요구한다(§C.2).
>
> **⚠️ 신규 REQ 0건.** 산출물 전부가 REQ-MULTIDEV-001/002(개정 0.4.0)의 조항 위에 선다.

**산출물 1 — "연결" 정의를 쓰는 대상 해석(`cli/device-targeting.ts`).** `connectionState === "device"`로 먼저 거른 뒤 계수·자동 선택·메시지를 만든다.
- **계수**: 미연결 항목은 세지 않는다. 실측에서 23 → 2가 된다.
- **자동 선택**: 연결 1대면 미연결이 몇 개든 그 1대를 고른다. **문서화된 동작의 복구**이지 새 기능이 아니다.
- **0대**: `NO_DEVICE`. 목록에 미연결 항목이 있으면 메시지에 그 사실을 포함한다 — "있는데 부팅 안 됨"과 "아무것도 없음"은 사용자에게 다른 조치를 뜻한다.
- **`devices` 명령은 건드리지 않는다**(PRESERVE) — 인벤토리는 여전히 전부 나열한다.

**산출물 2 — 명시 지정한 미연결 기기의 전용 오류(`DEVICE_NOT_CONNECTED`).** 목록에 있으나 연결 상태가 아니면 `DEVICE_NOT_FOUND`(없음)와도 `BACKEND_COMMAND_FAILED`(늦은 실패)와도 구분되는 코드로 거부하고 **백엔드를 실행하지 않는다**. 메시지는 관측된 `connectionState` 값을 포함한다. 오류 클래스/`instanceof` 왕복이 필요한지는 구현 재량 — 이 경로는 순수 함수가 이미 구조화된 오류를 반환한다.

**산출물 3 — `details.availableDevices` 구성.** 연결된 기기만 나열 + 미연결은 **개수만** 요약. 근거와 기각한 대안(전체 분할 나열)은 spec.md REQ-MULTIDEV-002 개정 조항에 있다. 요약 필드명은 구현 재량이나, **전체를 덤프하지 않는 것**은 규범이다.

**산출물 4 — 문서 정정(`README.md`, 스킬 SKILL.md).** 자동 선택 설명에 "연결된"의 정의를 넣는다. 현재 문구는 **약속으로는 옳고 동작만 틀렸으므로**, 수정 후 문구가 참이 된다 — 문구를 약화시키는 방향이 아니라 정의를 보강하는 방향이다.

**산출물 5 — 판정.** unit 레그(23/연결2, 23/연결1, 23/연결0, 미연결 serial 지정, 미상 serial 지정) + **실측 보강 레그**: 구성 A에서 메시지가 2를 말하는가, 구성 B에서 자동 선택이 발동하는가, 미연결 시뮬레이터 지정이 백엔드 도달 전에 거부되는가.

**AC**: AC-ANDROID-041(계수·메시지 정정) / AC-042(자동 선택 도달 가능성) / AC-043(`DEVICE_NOT_CONNECTED`) / AC-044(`details` 구성) / AC-045(`devices` 출력 불변).

### M14 — 소프트키보드 숨김이 자기 입력을 파괴하는 결함 [개정 0.4.0 · 결함 4 · 낮은 번복 가능성 · 높은 심각도]

> **선행**: 없음 — **M13과 완전히 독립이며**(공유 코드 0), M10·M12와도 파일은 같지만 메서드가 다르다(`hideKeyboard` vs `inputText` 본체·`setImeToAdbKeyboard`). **다만 `hideKeyboard`는 `inputText` 말미에서 호출되므로 M10/M12 테스트 픽스처가 숨김 argv를 관측한다** — 그 픽스처의 기대 keycode를 함께 갱신해야 한다(§F.10).
>
> **⚠️ 번복 가능성이 낮다는 것이 심각도가 낮다는 뜻이 아니다.** 이 결함은 **무음 부류**(`ok:true` + 효과 없음)이고 **주 용도에 얹혀 있다.** 배치가 아래인 이유는 오직 하나 — **번복 가능한 결정이 좁기 때문**이다. 메커니즘(BACK)은 실측이 사실상 강제하고, 응답 계약은 바뀌지 않으며, 남는 재량은 **예방적 가드**와 **조회 실패 시의 처분**뿐이다. §F는 심각도가 아니라 번복 가능성 순으로 정렬한다.
>
> **⚠️ 판정 무대를 틀리면 결함을 만나지 못한다.** 네이티브 `EditText`에서는 ESCAPE도 정상 동작하므로, Settings 앱에서 도는 판정은 **수정 전에도 통과한다.** 판정은 **Chrome + 웹 페이지 입력란**에서 이뤄져야 한다(AC-036). 네이티브 판정(AC-037)은 **비회귀 확인**이지 결함 판정이 아니다.
>
> **⚠️ 신규 REQ 0건.** 산출물 전부가 REQ-INPUT-004(개정 0.4.0)의 조항 위에 선다.

**산출물 1 — 표시 여부 파서(순수 함수).** `dumpsys input_method` 덤프 → 소프트키보드 표시 여부(`mInputShown`). 기존 `ime-binding-parser.ts`를 확장할지 별도 함수를 둘지는 구현 재량이나, **기존 `bound`/`currentImeId` 계약은 불변**이다(PRESERVE).
- **주장 경계**: `mBoundToMethod`가 덤프에 정확히 1회 나타난다는 §C.3-⑥의 확인은 `mInputShown`에 대해 **수행되지 않았다**(§C.4-⑱). **출현 횟수를 1회로 가정하지 말 것** — 가정한다면 그 가정을 주석에 명시하고 §C.3-⑥과 부류가 다름을 적는다.
- **마커 부재 시 기본값**: `bound`와 **반대 방향**으로 기울인다. `bound`는 부재 시 `false`(= 전송 안 함)가 안전했지만, `mInputShown` 부재 시 `false`(= 숨김 안 함)는 **키보드가 남는 사소한 UX 문제**이고 `true`(= 숨김 전송)는 **화면 이탈 가능성**이다. 안전한 쪽은 `false`이며, 두 파서의 기본값이 같은 방향인 것은 **우연이 아니라 같은 원리**(확인되지 않은 신호 위에서 부작용 있는 동작을 하지 않는다)다.

**산출물 2 — 숨김 메커니즘 교체(`adb-backend.ts` `hideKeyboard`).** `KEYCODE_ESCAPE`(111) → `KEYCODE_BACK`(4).
- **정의 지점에 왜 BACK인지 독블록을 남긴다** — §C.4-⑰(ESCAPE가 Chrome에서 입력을 지운다)와 §C.4-⑱(BACK은 양 표면에서 텍스트 보존)을 인용한다. **이 주석이 없으면 다음 사람이 "back은 뒤로가기니까 escape가 더 맞아 보인다"로 되돌린다.**
- **`ANDROID_KEYCODE.back`(4) 재사용 여부는 구현 재량**이나, 그것은 공개 `key` 별칭 어휘이고 이쪽은 내부 구현 세부라는 기존 구분(`keycodes.ts` 독블록)을 유지한다.

**산출물 3 — 표시 여부 가드.** 표시된 상태에서만 숨김 키를 보낸다.
- **이 가드는 예방적이며 실측 강제가 아니다** — 정의 지점 주석에 **왜 측정 의무가 없는지가 아니라, 무엇이 측정되지 않았는지**를 적는다: 미표시 상태 BACK 1회 시행에서 **포그라운드는 바뀌지 않았다**(§C.4-⑲). "이탈한다"가 관측되지 않았으므로 가드는 **값싼 보험**이지 관측된 위험의 대응이 아니다. 이 선을 넘는 주석은 §C.3-⑩이 경고한 오류의 재발이다.
- **조회 실패 시 숨김을 생략한다** — 확인되지 않은 신호 위에서 파괴 가능한 키를 쏘지 않는다. 그리고 이 생략이 `text`를 실패시키지 않는다.

**산출물 4 — best-effort 불변 확인.** 숨김 단계의 어떤 실패도 `text`를 실패시키지 않는다(기존 try/catch swallow 유지). `--keep-keyboard`는 숨김 단계 전체를 생략한다(조회조차 하지 않는다).

**산출물 5 — 기존 테스트 픽스처 갱신.** `inputText` 경로 테스트가 숨김 argv를 관측하므로 기대 keycode를 갱신한다. **이것은 M10/M12 AC의 판정을 바꾸지 않는다** — 바뀌는 것은 숨김 단계의 argv뿐이고 전송 경로는 PRESERVE다.

**산출물 6 — 판정.** mock 레그(표시/미표시/조회 실패/전송 실패/`--keep-keyboard` 5형태) + **실측 레그**: Chrome 웹 입력란에서 텍스트 생존(AC-036, **결함 회귀 증명**), 네이티브 `EditText`에서 텍스트 생존(AC-037, 비회귀), 두 표면 모두에서 키보드가 실제로 내려감(AC-038).

**AC**: AC-ANDROID-036(**웹 입력란 텍스트 생존 — 실측 필수, 회귀 증명**) / AC-037(네이티브 비회귀, 실측) / AC-038(키보드 실제 숨김, 실측) / AC-039(숨김 실패가 `text`를 실패시키지 않음) / AC-040(가드 — 미표시 시 미전송).

**심각도 서술 규율(문서·주석·커밋 공통).** 결함 4는 **무음 실패(silent)** 이며 M10·M11과 같은 부류다 — M12의 소리 내는 실패로 서술하지 않는다. 결함 5는 **반대로** 무음이 아니다 — 봉투는 정직하고 **메시지 본문이 거짓**이며 **문서-동작이 모순**이다. 두 결함을 같은 부류로 뭉뚱그리면 다음 사람이 잘못된 우선순위로 읽는다.

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
M10   ──> M12 (ime enable 상한 재시도) [결함 3 · 계약 불변 · 상한은 설계 선택]

M10 ⟂ M11   ← 서로 완전히 독립. 선행 관계가 아니다.
M12 ⟂ M11   ← 서로 완전히 독립.
M12 ← M10   ← 진짜 선행 관계. 같은 cold 시퀀스를 M10이 방금 바꿨다.

── 개정 0.4.0 (Chrome 웹 구동 · 2기기 운용 결함 2건) ──────────────────────

M3   ──> M13 (대상 해석의 "연결" 정의)  [결함 5 · 플랫폼 중립 · 응답 형태 변경 · 기기 불필요]
M5   ──> M14 (숨김 메커니즘 BACK + 가드) [결함 4 · 무음 부류 · 계약 불변 · 웹 판정 필수]

M13 ⟂ M14              ← 서로 완전히 독립(공유 코드 0).
M13 ⟂ M10·M11·M12      ← 파일도 다르다(`device-targeting.ts` vs `adb-backend.ts`).
M14 ~ M10·M12          ← 선행 관계는 아니나 **테스트 픽스처를 공유한다**(아래).
```

**M13은 기존 어느 마일스톤과도 무관하다.** `cli/device-targeting.ts`는 `adb-backend.ts`와 공유 코드가 0이고, **두 백엔드가 함께 쓰는 플랫폼 중립 계층**이라는 점에서 오히려 SPEC-IOS-001과 접점이 크다 — 실측 위반 항목이 전부 iOS 시뮬레이터였던 이유다.

**M14는 M10·M12와 선행 관계가 아니지만 테스트 픽스처를 공유한다.** `hideKeyboard`는 `inputText` 말미에서 호출되므로, M10(바인딩 대기)·M12(재시도)를 위해 작성된 `inputText` 경로 테스트가 **숨김 argv를 함께 관측한다.** M14는 그 기대 keycode를 갱신해야 하며, 이것은 **의존이 아니라 접촉면**이다 — M10/M12의 AC 판정은 바뀌지 않는다(전송 경로는 PRESERVE, 바뀌는 것은 전송 *이후* 단계의 argv뿐).

**왜 M13이 M14보다 위인가 — 번복 가능성이지 심각도가 아니다.** 심각도는 **M14가 더 높다**(무음 부류 + 주 용도에 얹힘). 그러나 §F는 처음부터 **번복 가능성 내림차순**으로 정렬되며, 그 축에서는 M13이 위다:

| | M13 (결함 5) | M14 (결함 4) |
|---|---|---|
| 번복 가능한 결정 | **4개** — `details` 응답 형태, 전용 코드 유무·이름, 실패 지점 이동, `unauthorized` 취급 | **2개** — 예방적 가드, 조회 실패 시 처분 |
| 응답 계약 | **바뀐다**(코드·지점·`details` 구성) | **안 바뀐다** |
| 메커니즘 선택 | 정의는 설계 결정 | **실측이 사실상 강제**(BACK만 텍스트를 보존) |
| 심각도 | 낮음(봉투 정직, 메시지 거짓) | **높음**(무음, `ok:true` + 효과 없음) |

M10이 M11보다 위였던 것과 같은 논리다 — **응답 계약을 바꾸는 쪽에 리뷰 주의를 먼저 붙인다.**

**왜 한 마일스톤이 아니라 둘인가.** M10/M11과 동일한 세 기준이 그대로 갈린다.
1. **공유 코드 0** — `device-targeting.ts`(순수 함수, 플랫폼 중립) vs `adb-backend.ts`의 private `hideKeyboard`. 한 마일스톤으로 묶으면 하나의 blocker가 다른 하나를 인질로 잡는다.
2. **판정 장비가 다르다** — M13은 **기기가 아예 필요 없고**(논리는 전부 순수 함수 unit) 실측 보강도 기기 구성 A/B 전환으로 끝난다. M14는 **Chrome 구동 + 웹 입력란 + 스크린샷 오라클 + 네이티브 비회귀**를 요구한다. 묶으면 싼 쪽이 비싼 쪽의 비용을 함께 문다.
3. **롤백 단위가 다르다** — M13은 **응답 형태를 바꾸고** 두 백엔드가 공유하는 파일을 건드린다(SPEC-IOS-001 영향권). M14는 Android 백엔드의 private 헬퍼에 갇히고 계약을 바꾸지 않는다. 계약 변경은 별도 커밋·별도 롤백 단위여야 한다.

**실행 순서 노트(제약 아님).** 번복 가능성 순서는 M13 → M14지만, **기기 판정 비용은 반대로 M13이 싸다.** M13은 기기 없이 완주할 수 있고 실측 보강은 `devices` 두 번 + 실패 호출 두어 번이다(기기 상태를 **전혀 바꾸지 않는다**). M14는 Chrome 구동·입력란 포커스·스크린샷을 요구한다. **한 세션에 몰아 돌 때는 M13 실측 → M14 실측 순이 싸다** — M13이 기기를 흔들지 않으므로 M14의 기준선을 먼저 확보할 필요도 없다.

**M13의 실측 보강은 기기 구성이 배타적이라는 점을 주의한다.** 계수 판정(AC-041)은 **연결 2대**를, 자동 선택 판정(AC-042)은 **연결 1대**를 요구한다 — 동시에 볼 수 없다. 시뮬레이터를 종료하면 A → B로 넘어가므로 **A를 먼저** 돈다(되돌리려면 부팅 대기가 든다). 다만 **둘 다 unit으로 이미 판정되므로**, 구성 전환이 어려우면 실측 보강을 생략해도 AC는 충족된다(§E 참조) — 이것이 M14의 실측 필수 AC와 결정적으로 다른 점이다.

**M12는 M10에 의존한다(진짜 선행).** 두 마일스톤은 **같은 메서드의 같은 cold 시퀀스**를 건드린다 — M10은 `ime set` **이후**(전송 직전)에 대기를 넣었고, M12는 그보다 **앞**(`adb install` → `ime enable`)에 재시도를 넣는다. 최종 cold 시퀀스는 `pm list` → `install` → **`ime enable`(+M12 재시도)** → `ime set` → **`dumpsys` 바인딩 대기(M10)** → `broadcast`가 된다. M10 없이 M12를 먼저 넣으면 같은 함수의 테스트 픽스처가 두 번 재작성되고, 두 변경의 회귀 원인이 뒤섞인다.

**M12는 M11과 무관하다.** `inputText` vs `launchApp` — 공유 코드가 0이며, M11이 막혀도 M12는 진행되고 그 역도 같다.

**M12의 실측은 M10보다 비싸고, 실행 순서에 실질적 영향을 준다.** M11(앱 3개 열기, 기준선 거의 무변경) → M10(설치/제거 사이클) → M12(**포커스된 입력란에서 설치/제거 사이클을 다수 반복**) 순으로 기기 비용이 증가한다. 기기 판정을 한 세션에 몰아 돌 때는 이 순서가 가장 싸다.

**왜 M10에 접어 넣지 않고 별도 마일스톤인가.**
1. **M10은 이미 커밋됐다**(`f6e0724`) — 접어 넣으면 이미 판정된 AC의 근거 커밋이 사후 변경된다.
2. **판정 형태가 다르다** — M10은 결정론적 결함이라 1회 관측이 판정이었지만, M12는 **간헐(3/8)** 이라 시행 횟수가 판정의 일부다.
3. **롤백 단위가 다르다** — M10은 응답 계약을 바꿨고 M12는 바꾸지 않는다. 계약을 바꾸지 않는 변경이 계약 변경 커밋에 섞여 함께 되돌려질 이유가 없다.

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

**M12 추가 안티 패턴**

- **`ime enable` 재시도를 실패 형태와 무관하게 적용한다** — 모든 실패를 삼키는 루프가 되어, 권한·API 레벨·기기 상태 같은 **진짜 실패가 상한만큼 지연된 뒤 같은 오류로 나오면서 원인만 흐려진다**(spec.md §C.3-⑫, AC-034).
- **재시도를 `ime list -a` 준비 신호 폴링으로 "개선"한다** — 그 신호는 **실패 창에서 한 번도 관측된 적이 없다**(§C.3-⑭). 관측하지 않은 것 위에 수정을 세우는 것은 §C.3-⑩이 이미 경고한 오류의 반복이다. `ime enable`의 권위 있는 준비 판정은 `ime enable` 자신의 성공이다.
- **재시도 상한·백오프를 "실측값"으로 서술한다** — 설계 선택이며 측정 의무가 없다(M10 상한·`MAX_DURATION_MS` 선례).
- **결함 3을 "무음 실패"로 서술한다** — `ok:false` + 구체적 메시지를 내는 **소리 내는 실패**이며 M10·M11의 `ok:true`-무효과 부류가 **아니다**. 심각도를 부풀리면 다음 사람이 잘못된 우선순위로 읽는다. 정확한 표현은 **"유효한 연산의 이유 없는 실패"** 다.
- **포커스된 입력란 상관을 원인으로 서술한다** — 3/8 대 0/11은 강한 상관이지만 **표본이 작고 메커니즘은 미확립**이다(§C.3-⑬). 반대로, 상관이 약하다고 판정 조건에서 빼는 것도 오류다 — **포커스 없이 도는 판정은 결함을 만나지 못한 채 통과한다**.
- **간헐 결함을 1회 green으로 판정한다** — 미수정 상태에서도 5/8 확률로 통과한다. AC-033의 시행 횟수는 장식이 아니다.
- **M12에 새 오류 코드를 만든다** — 이 실패는 이미 소리 내어 실패하고 있었다. M12는 빈도를 줄일 뿐 응답 계약을 바꾸지 않는다.
- **M12를 M10 커밋에 접어 넣거나 M10 없이 먼저 넣는다** — 전자는 이미 판정된 AC의 근거 커밋을 사후 변경하고, 후자는 같은 함수의 픽스처를 두 번 재작성하며 두 변경의 회귀 원인을 뒤섞는다(§F.10).

### 개정 0.4.0 추가 안티 패턴

- **소프트키보드 숨김을 `KEYCODE_ESCAPE`로 되돌린다** — "back은 뒤로가기니까 escape가 더 맞아 보인다"는 그럴듯함이 정확히 이 결함을 만들었다. ESCAPE는 Chrome 웹 입력란에서 **방금 입력한 텍스트를 지운다**(spec.md §C.4-⑰). BACK은 두 표면 모두에서 텍스트를 보존한다(§C.4-⑱).
- **키보드 숨김 판정을 Settings 앱(네이티브 `EditText`)에서만 돈다** — 네이티브에서는 **ESCAPE도 정상 동작하므로 수정 전에도 통과한다.** 무대를 적지 않은 AC는 판정처럼 보이지만 판정이 아니다. 결함 4가 M10·M12 판정을 전부 통과한 이유가 이것이다.
- **표시 여부 가드의 근거를 실측으로 서술한다** — 이 가드는 **예방적**이며, 유일한 반대 시행에서 예상된 화면 이탈은 **일어나지 않았다**(§C.4-⑲). "BACK이 화면을 이탈시킨다"는 **관측되지 않았다**. 반대로 이 관측을 근거로 **가드를 제거하는 것**도 오류다 — 표본 1회는 "이탈하지 않는다"도 확립하지 못한다.
- **`mInputShown` 조회 실패를 "표시됨"으로 낙관하여 숨김을 강행한다** — 확인되지 않은 신호 위에서 파괴 가능한 키를 쏘는 것이며, `bound` 파서가 부재 시 `false`로 기울인 것과 **같은 원리**를 어긴다.
- **숨김 실패를 `text` 실패로 승격한다** — 숨김은 개정 전에도 best-effort였고 전송은 이미 성공했다. 이 개정은 숨김의 *수단*을 바꿀 뿐 응답 계약을 바꾸지 않는다(AC-ANDROID-022/039 불변).
- **`mInputShown`이 덤프에 정확히 1회 나타난다고 가정한다** — `mBoundToMethod`에 대한 §C.3-⑥의 확인은 이 마커에 **수행되지 않았다**(§C.4-⑱). 미측정을 확립된 사실로 쓰는 것은 §C.3-⑩이 이미 경고한 오류다.
- **결함 5 수정을 Android 경로로 좁힌다** — `device-targeting.ts`는 두 백엔드를 함께 서비스하고 **실측 위반 항목 21개는 전부 iOS 시뮬레이터**였다. 파일이 Android 이름의 SPEC 아래 있다는 것은 범위 근거가 아니다(§C.4-⑳).
- **`devices` 명령까지 "일관성 있게" 미연결 항목을 필터링한다** — 인벤토리 명령은 사용자가 offline 시뮬레이터의 존재를 확인하는 **유일한 창구**다. 본 개정이 바꾸는 것은 **대상 해석 계층뿐**이다(REQ-MULTIDEV-002 불변 조항).
- **`details.availableDevices`에 미연결 항목을 다시 넣는다("정보가 많을수록 좋다")** — 사용자가 읽어야 하는 오류에 23행을 쏟는 것 자체가 사용성 문제이고, 그 수는 **사용자가 한 일과 무관하게 늘기만 한다**(§C.4-⑳/㉑). 전체가 필요하면 `devices`가 이미 그 인벤토리다.
- **미연결 기기 지정을 `DEVICE_NOT_FOUND`로 접는다** — "존재하지 않음"과 "존재하는데 부팅되지 않음"은 사용자에게 **다른 조치**를 뜻하며, 후자만 조치 가능하다(§C.4-㉒).
- **결함 5를 "무음 실패"로 서술한다** — 봉투는 `ok:false`로 정직했다. 거짓말한 것은 **메시지 본문**(23)이고, 나머지는 **문서-동작 모순**과 **늦은 실패**다. 결함 4(무음)와 같은 부류로 뭉뚱그리면 다음 사람이 잘못된 우선순위로 읽는다.
- **결함 5의 AC를 "실측 필수"로 적는다** — `resolveTargetDevice`는 순수 함수이고 **논리는 전부 mock으로 판정된다**. 실측 필수 표식을 남발하면 (a) 기기가 없을 때 판정 가능한 AC가 미기록으로 밀리고, (b) **정말로 실측이 아니면 안 되는 AC**(036)와 구별이 안 된다. mock 불신은 mock 과신의 거울상 오류다.
- **M13과 M14를 한 커밋으로 묶는다** — 응답 형태를 바꾸고 두 백엔드가 공유하는 파일을 건드리는 M13은 **별도 롤백 단위**여야 한다(§F.10).

## §H. 교차 참조

- 요구사항·스키마·로드맵·@MX 대상: `spec.md`
- 인수 기준·엣지 케이스·DoD: `acceptance.md`
- 진행/감사 신호: `progress.md`
- 관련 사실 출처(2026-07-22 문서 확인): adb `input text` 유니코드 불가 / ADBKeyBoard `ADB_INPUT_B64` / `exec-out screencap -p` / `uiautomator dump` 필드셋.
- 개정 0.3.0 실측 근거 전문(2026-07-29, SM-S938N): `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md` — 추린 메커니즘 사실은 spec.md §C.3.
- 개정 0.4.0 실측 근거: **별도 보고서 없음** — spec.md §C.4 표가 1차 기록이다(Chrome/naver.com 구동 + 2기기 운용, 2026-07-29).
- 결함 4가 손대는 지점의 현재 구현: `src/backend/adb-backend.ts`의 `hideKeyboard`(best-effort, 실패 swallow) + `src/backend/keycodes.ts`의 `KEYCODE_ESCAPE` 독블록.
- 결함 5가 손대는 지점의 현재 구현: `src/cli/device-targeting.ts`의 `resolveTargetDevice` — `connectionState`를 읽지 않는다. 상태 열거는 `src/schema/device-backend.ts`의 `DeviceConnectionState`(`"device" | "offline" | "unauthorized"`).
- 설계 선택 상수의 선례(측정 의무 없음의 근거 형태): `src/cli/validators.ts:47-64` `MAX_DURATION_MS`(SPEC-GESTURE-001).
