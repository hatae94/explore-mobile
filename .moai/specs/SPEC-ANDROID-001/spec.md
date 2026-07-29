---
id: SPEC-ANDROID-001
title: "Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어"
version: "0.4.0"
status: in-progress
created: 2026-07-22
updated: 2026-07-29
author: manager-spec
priority: P0
phase: "v0.1.0 target"
module: "src/"
lifecycle: spec-anchored
tags: "android, adb, cli, mobile-automation, device-control, typescript"
tier: M
amendment_of: SPEC-ANDROID-001
---

# SPEC-ANDROID-001 — Android(adb) 기기 제어 기본기 + 자동 환경 세팅 CLI 코어

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1.0 | 2026-07-22 | manager-spec | 최초 초안(draft) 작성. explore-mobile 프로젝트의 첫 SPEC. Android/adb 제어 원시 명령(primitive) + `doctor` 환경 부트스트랩 + 공통 요소 스키마 정의. |
| 0.1.1 | 2026-07-22 | manager-spec | Clarifications resolved — 4개 clarification 항목 해소를 §C 제약과 REQ-DOCTOR-002/003에 반영(pnpm 개발/npm 배포/npx, Node ≥ 20 LTS, ADBKeyBoard 번들+버전 고정, adb OS별 설치 정책). status는 draft 유지. |
| 0.1.2 | 2026-07-22 | manager-spec | audit iter-1 fixes + Tier M downgrade — SPEC ID를 2-도메인-세그먼트 구 형식에서 `SPEC-ANDROID-001`로 정규식 준수 리네임(D4), 오류 처리 요구사항 §B.10 추가(D3), REQ-INPUT-002 While화(D7)·REQ-IDEMP-001 범위 축소(D8)·REQ-INPUT-005 키셋 열거(D11)·REQ-DOCTOR-001 데몬 health(D3d), §C SOURCES 추가(D2), tier L→M. status는 draft 유지. |

## Amendments

> `completed → in-progress` in-place 개정(amendment). 원래 HISTORY 행은 보존되며, 개정 행만 아래에 추가된다(frontmatter `amendment_of: SPEC-ANDROID-001` 자기참조).

| 개정 버전 | 이전 완료 버전 | prior_completed_sha | 날짜 | 근거(rationale) |
|-----------|----------------|---------------------|------|-----------------|
| 0.2.0 | 0.1.2 | `e536e11` | 2026-07-22 | **실기기 하드닝(real-device hardening) 후 문서-코드 정합화(docs↔code reconciliation).** SPEC이 `completed`(v0.1.2)로 닫힌 뒤, 실기기 검증 과정에서 구현이 5개 커밋에 걸쳐 유의미하게 진화했고(ADBKeyBoard GPL-2.0 런타임 다운로드, 세션 기반 IME + 디스크 영속화, `text` 자가치유 자동설치, 요소 셀렉터 tap/focus, 소프트키보드 자동 숨김) 문서가 드리프트되었다. 본 개정은 관찰 가능한 동작을 실제 코드에 맞춰 정정한다 — 재작성이 아니라 정합화다. 코드는 변경하지 않는다(docs-only). |
| 0.3.0 | 0.2.0 | `7caea74` | 2026-07-29 | **실기기 검증이 드러낸 결함 2건 — 둘 다 `ok:true`인데 관측 가능한 효과가 없는 부류.** 2026-07-29 Galaxy S25 Ultra(SM-S938N, Android 16, 1440×3120, 무선 ADB) 검증에서 두 결함이 실측됐다(`.moai/reports/android-verification/remaining-commands-android-2026-07-29.md`). ① `launch`가 **암시적 인텐트**(`am start -p`)를 써서 `android.intent.category.DEFAULT`를 선언하지 않는 앱(삼성 기본앱 상당수)을 열지 못한다 — 설치돼 있고 손으로 누르면 열리는데도 실패한다. ② 비-ASCII `text`가 **IME 바인딩 전에 브로드캐스트를 쏘아** 입력이 조용히 유실되면서 `{"ok":true}`를 반환한다 — `doctor` 설치 직후 첫 입력과 `reset` 이후 자가치유 경로가 모두 여기에 걸린다. 둘 다 **기존 REQ에 대한 구현 결함**이며, 본 개정은 REQ가 그 결함을 **표현할 수 없게** 되도록 날을 세우고(mechanism을 관찰 가능한 계약으로 승격) AC를 추가한다. **0.2.0(docs-only)과 달리 본 개정은 코드를 변경한다** — M10·M11 구현은 manager-develop 소유다. **두 결함 모두 unit/mock 스위트의 사정거리 밖이다**(mock은 구성된 `adb` argv의 *모양*만 단언할 수 있고, 그 argv를 기기가 *어떻게 해석하는지*는 단언할 수 없다) — 신규 AC가 실측 판정 다리를 갖는 이유가 이것이다. 이 결함 부류는 SPEC-GESTURE-001이 여섯 라운드에 걸쳐 싸운 것과 동일하다. |
| 0.4.0 | 0.3.0 | `e8b1849` | 2026-07-29 | **Chrome 웹 페이지 구동과 2기기 운용(Android 실기기 + iOS 시뮬레이터)이 드러낸 결함 2건.** 0.3.0 마감(`e8b1849`) 직후 같은 날 두 결함이 실측됐다. **결함 4 — `text`가 자기가 방금 입력한 텍스트를 스스로 지운다**: 전송 후 소프트키보드를 내리려고 보내는 `KEYCODE_ESCAPE`가 Chrome 웹 페이지에서는 페이지로 전달되어 **입력 취소**로 해석된다. 네이티브 `EditText`에서는 같은 호출이 정상 동작하므로, 지금까지의 모든 검증(전부 Settings 앱)이 통과했다. 이것은 **`ok:true`인데 관측 가능한 효과가 없는 무음(silent) 부류** — M10·M11이 죽인 바로 그 부류 — 이며, 게다가 **이 도구의 주 용도(브라우저로 웹 콘텐츠 구동)에 정확히 얹힌다.** **결함 5 — 미연결 기기가 연결된 기기로 계수된다**: 대상 해석 계층이 `connectionState`를 전혀 보지 않아, Xcode가 설치된 Mac이면 어디서나 존재하는 offline 시뮬레이터들이 계수·자동 선택·오류 메시지에 섞인다. **심각도 부류는 결함 4와 다르다** — 봉투는 거짓말하지 않지만 **오류 메시지 본문이 거짓 수를 주장**하고(23 대 2), **문서화된 자동 선택이 도달 불가**가 되며, 미연결 기기를 명시 지정하면 **한 층 늦게** 실패한다. 두 결함 모두 **기존 REQ에 대한 구현 결함**이다 — 결함 4는 REQ-INPUT-004가 **틀린 메커니즘을 명시**해서, 결함 5는 REQ-MULTIDEV-002가 스스로 쓴 "연결"이 **어디에도 정의되지 않아서** 생겼다(구현은 REQ 자신의 문구를 위반한다). 본 개정은 REQ가 그 결함을 **표현할 수 없게** 되도록 날을 세우고 AC를 추가한다. **0.2.0(docs-only)과 달리, 0.3.0과 마찬가지로 본 개정은 코드를 변경한다** — M13·M14 구현은 manager-develop 소유다. |

**0.2.0 개정 범위(affected §B REQ IDs):**
- **REQ-INPUT-003** (재작성): 비-ASCII 경로에 ADBKeyBoard **자가치유 자동설치**(shared installer) 추가.
- **REQ-INPUT-004** (재작성): per-call 복원 → **세션 기반 IME + 디스크 영속화 + `reset`시 복원** 모델로 전환. 소프트키보드 자동 숨김(`--keep-keyboard` 옵트아웃) 추가.
- **REQ-DOCTOR-003** (정정): 번들 APK → **런타임 다운로드**(GPL-2.0 미재배포).
- **REQ-ERR-001** (범위 명확화): IME 복원 실패 보고 지점이 `text`(per-call)에서 `reset`/`doctor --clean`으로 이동.
- **REQ-SELECT-001~005** (신설): 요소 셀렉터(`--id`/`--text`/`--index`) 기반 `tap`/`text` — 신규 REQ 그룹.
- **§C 제약** (정정): ADBKeyBoard 라이선스 Apache-2.0 예시 → GPL-2.0, 번들 → 런타임 다운로드-미재배포.
- **§C.2 알려진 한계** (신설): 실기기 노트(resource-id 미설정 앱은 `--text` 필요, 이모지 HTML 엔티티 미디코드).

**0.3.0 개정 범위(affected §B REQ IDs):**
- **REQ-APP-001** (날 세움 — M11): 암시적 인텐트 금지 → **런처 컴포넌트 조회 후 명시적 컴포넌트 시작**. 조회 실패 판정은 stdout 기준(종료 코드 아님), 전용 오류 코드 `LAUNCHER_ACTIVITY_NOT_FOUND`, 원인 단정 금지, **태스크 재개 의미 불변** 명시.
- **REQ-INPUT-003** (절 추가 ×2):
  - **(M10)** 자가치유 설치 직후 곧바로 전환·전송으로 진행 금지 — 준비 신호 확인은 REQ-INPUT-004로 위임.
  - **(M12)** 자가치유 `adb install` **직후의 `ime enable`이 IMMS 미등록으로 실패**할 수 있으므로, **그 실패 형태에 한정한 상한 있는 재시도**를 규정한다. 다른 실패 형태는 재시도하지 않고 즉시 표면화한다(shall not). 재시도 상한·백오프는 **설계 선택**이며 측정 의무가 없다.
- **REQ-INPUT-004** (절 추가 — M10): 브로드캐스트 전 **IME 바인딩 준비 신호 확인 + 상한 있는 대기**. 타임아웃 시 **브로드캐스트 미전송 + `ok:false`**(`IME_BIND_TIMEOUT`) — **응답 계약 변경**(사용자 결정). 상한 값은 설계 선택이지 실측값이 아님(측정 의무 없음). 원래 IME 디스크 영속·warm 경로는 불변.
- **§C.3 실측 메커니즘 사실** (신설 ①~⑪, M12에서 ⑫~⑯ 확장): 암시적-대-명시적 인텐트, 바인딩 경쟁 조건, 폐기된 가설·무효 오라클, 주장 경계, Secure Folder 확증에 더해 — **`ime enable` 등록 경쟁의 실측 실패 형태(⑫), 포커스된 입력란과의 상관(⑬ — 상관이지 원인 아님), `ime list -a`의 미관측 창(⑭), `ime enable` 멱등성 실측(⑮), `mCurId` 결합항 관측 해소(⑯)**. 나중에 읽는 사람이 수정을 다시 결함으로 "단순화"하지 못하도록 고정.
- **신규 REQ 0건**: 세 결함 모두 REQ 공백이 아니라 REQ가 메커니즘을 규정하지 않아 구현이 틀릴 수 있었던 자리다. 신규 오류 코드는 별도 REQ-ERR 항목이 아니라 **소유 REQ 안에서 정의**한다. M12도 신규 REQ를 만들지 않는다.

> **M12는 같은 0.3.0 개정의 연장이지 새 개정이 아니다.** M10 실기기 검증이 **같은 cold 시퀀스의 더 앞 단계**(`adb install` → `ime enable`)에서 세 번째 결함을 드러냈고, 그것이 REQ-INPUT-003의 자가치유 설치 절 위에 서기 때문에 위 목록을 확장할 뿐 새 Amendments 행을 추가하지 않는다. **다만 심각도 부류는 다르다** — M10·M11이 죽인 것은 `ok:true`인데 효과가 없는 **무음(silent)** 부류였고, M12가 고치는 것은 `ok:false` + 구체적 메시지를 내는 **소리 내는(loud)** 실패다(§C.3-⑫). 더 낮은 심각도이며, 그럼에도 실제 결함인 이유는 **유효한 연산이 사용자에게 보이는 이유 없이 실패(spurious failure of a valid operation)** 하기 때문이다.

**0.4.0 개정 범위(affected §B REQ IDs):**
- **REQ-MULTIDEV-001 / REQ-MULTIDEV-002** (날 세움 — M13): **"연결(connected)"의 정의를 신설**한다(`connectionState === "device"`). 계수·자동 선택·오류 메시지가 모두 그 정의를 쓴다는 조항, **문서화된 자동 선택의 도달 가능성(reachability)** 조항, 명시 지정한 미연결 기기 전용 오류 코드 **`DEVICE_NOT_CONNECTED`**, `details.availableDevices` 구성 결정, 그리고 **본 REQ가 플랫폼 중립**임의 명시(Android 이름의 SPEC 안에 있으나 대상 해석 계층은 두 백엔드를 함께 서비스하며, 실측에서 위반 항목은 전부 iOS 시뮬레이터였다).
- **REQ-INPUT-004** (날 세움 — M14): 소프트키보드 숨김 절 — 숨김 메커니즘을 `KEYCODE_ESCAPE` → **`KEYCODE_BACK`** 으로 교체하고, 그 위에 **"자기 입력을 파괴하지 않는다"** 는 상위 관찰 계약을 세운다. 키보드가 실제로 올라와 있는지 확인하는 **예방적 가드**(주장 경계 명시 — 실측으로 강제되지 않았고 반대 관측 1건이 있다). **best-effort 의미와 응답 계약은 불변**이다.
- **§C.4 실측 메커니즘 사실** (신설 ⑰~㉒): ESCAPE 삭제 연쇄, BACK의 양 표면 실측, 예방적 가드의 주장 경계와 반대 관측, 23 대 2 기기 계수, 도달 불가한 자동 선택, 미연결 기기 지정의 늦은 실패.
- **신규 REQ 0건**: 0.3.0과 같은 이유다 — 두 결함 모두 REQ 공백이 아니라, REQ가 **틀린 메커니즘을 명시**했거나(결함 4) **자기가 쓴 용어를 정의하지 않아서**(결함 5) 구현이 틀릴 수 있었던 자리다. 신규 오류 코드는 별도 REQ-ERR 항목이 아니라 **소유 REQ 안에서 정의**한다.

> **응답 계약 변경의 정확한 범위(부풀리지 않는다).** 결함 5 수정은 **봉투(`ok`)를 바꾸지 않는다** — 미연결 기기 지정 경로는 개정 전에도 `ok:false`였다. 바뀌는 것은 (a) 오류 **코드**(`BACKEND_COMMAND_FAILED` → `DEVICE_NOT_CONNECTED`), (b) 실패가 나는 **지점**(백엔드 실행 후 → 대상 해석 시점, 즉 기기에 아무것도 보내기 전), (c) `AMBIGUOUS_DEVICE`/`DEVICE_NOT_FOUND`의 **`details.availableDevices` 구성**이다. M10의 `ok:true → ok:false` 같은 봉투 변경이 **아니다**. 결함 4 수정은 응답 계약을 **전혀** 바꾸지 않는다(숨김은 개정 전에도 best-effort였다).

---

## §A. 개요 (Context & Goal)

### A.1 배경

`explore-mobile`은 오픈소스이며 **에이전트 비종속(agent-agnostic, Claude + Codex)** 도구로, 자연어 프롬프트가 모바일 기기(에뮬레이터/시뮬레이터/실기기)를 구동·탐색할 수 있도록 `adb`(Android)와 `idb`(iOS)를 감싼다. 최종 목표는 **다중 기기 상호작용 테스트를 포함한 모바일 테스트 자동화**다.

본 SPEC(SPEC-01)은 그 토대인 **Android/adb 제어 기본기와 자동 환경 세팅 CLI 코어**를 정의한다. iOS/idb, WebView 인지, 프롬프트 탐색 루프, Codex 래퍼는 후속 SPEC(§로드맵)으로 분리한다.

### A.2 목표 (WHY)

- 자연어 에이전트가 호출할 수 있는 **JSON in/out CLI 원시 명령** 집합을 제공한다.
- **전역 설치 없이 `npx`로 실행**되는 오픈소스 배포 형태를 만든다.
- adb 백엔드를 얇은 계층으로 감싸 **향후 iOS/idb 백엔드가 재설계 없이 연결**되도록 한다.
- 한국어/이모지 입력, 다중 기기, 멱등성/리소스 위생을 **첫 SPEC부터 1급 요구사항**으로 다룬다.

### A.3 핵심 데이터 모델 — 공통 요소 스키마 (Common Element Schema)

모든 UI 인지 결과는 아래 공통 스키마로 정규화된다. 이 스키마는 본 SPEC의 가장 중요한 설계 산출물이며, iOS 백엔드가 나중에 그대로 매핑되어야 하는 **불변 계약(invariant contract)**이다.

```json
{
  "role": "string",
  "text": "string",
  "id": "string",
  "bounds": { "x": 0, "y": 0, "w": 0, "h": 0 },
  "tappable": true,
  "enabled": true,
  "children": []
}
```

Android(uiautomator) 매핑: `class → role`, `resource-id → id`, `text`/`content-desc → text`, `bounds → bounds`, `clickable + enabled → tappable`.

> **[HARD 설계 제약]** 이 스키마와 device-backend interface는 idb의 iOS 접근성 필드(AXLabel → text, AXUniqueId → id, frame → bounds, type/role → role)가 **재설계 없이** 플러그인될 수 있도록 설계되어야 한다. iOS는 본 SPEC에서 구현하지 않으나, iOS 필드 매핑 표는 `plan.md`에 문서화한다(AC-ANDROID-006).

### A.4 아키텍처 계층 (thin layers)

```
[ agent (Claude skill wrapper) ]      ← CLI만 호출 (adb 직접 실행 금지)
            │  (JSON in/out)
            ▼
[ CLI 명령 계층 ]                      ← doctor / devices / launch / stop / screenshot / tap / text / key / dump
            │
            ▼
[ 정규화 계층 (adb XML → 공통 스키마) ]  ← 순수 함수, 기기 없이 단위 테스트 가능
            │
            ▼
[ adb 서브프로세스 래퍼 ]              ← device-backend interface (iOS/idb 대체 지점)
```

---

## §B. 요구사항 (GEARS)

> 표기: GEARS 5패턴(Ubiquitous / When 이벤트 / While 상태 / Where 역량 게이트 / When 감지된-이상상태). 구조 키워드(**When/While/Where/shall/shall not**)는 영어로 유지하고 본문은 한국어로 기술한다.

### B.1 아키텍처 · 배포 (REQ-ARCH)

- **REQ-ARCH-001** (Ubiquitous): The CLI core **shall** 에이전트 비종속(agent-agnostic)이어야 하며, 모든 명령은 표준 입력/출력에서 **JSON in/out**을 주고받는다.
- **REQ-ARCH-002** (Ubiquitous): The CLI core **shall** `CLI 명령 계층 → 정규화 계층 → adb 서브프로세스 래퍼`의 3계층 구조를 유지한다.
- **REQ-ARCH-003** (Where): **Where** iOS/idb 백엔드가 향후 추가되는 경우, the device-backend interface **shall** 재설계 없이 iOS 백엔드를 연결할 수 있도록 얇게(thin) 정의되어야 한다.
- **REQ-ARCH-004** (Ubiquitous): The Claude skill wrapper **shall** CLI만 호출해야 하며, adb를 직접 실행하지 **않는다**(shall not).
- **REQ-ARCH-005** (Ubiquitous): The CLI **shall** `npx`를 통해 전역 설치(global install) 없이 실행 가능해야 한다.

### B.2 공통 요소 스키마 · 정규화 (REQ-SCHEMA)

- **REQ-SCHEMA-001** (Ubiquitous): The normalization layer **shall** UI 요소를 공통 스키마 `{ role, text, id, bounds:{x,y,w,h}, tappable, enabled, children:[...] }`로 표현한다.
- **REQ-SCHEMA-002** (When 이벤트): **When** Android uiautomator XML을 정규화할 때, the normalization layer **shall** `class→role`, `resource-id→id`, `text`/`content-desc→text`, `bounds→bounds`, `clickable+enabled→tappable` 매핑을 적용한다.
- **REQ-SCHEMA-003** (Ubiquitous): The common element schema **shall** idb의 iOS 접근성 필드 집합(AXLabel, AXUniqueId, frame, type/role)을 재설계 없이 수용할 수 있어야 한다.
- **REQ-SCHEMA-004** (Ubiquitous): The normalization layer **shall** 순수 함수(pure function)로 구현되어 기기 없이 XML 픽스처만으로 단위 테스트가 가능해야 한다.

### B.3 환경 부트스트랩 (REQ-DOCTOR)

- **REQ-DOCTOR-001** (When 이벤트): **When** `doctor` 명령이 실행될 때, the CLI **shall** adb/platform-tools 설치 여부, **adb 데몬/서버 상태(health)**, 기기 연결 상태를 점검한다(설치 여부만이 아니라 데몬 기동 여부 포함).
- **REQ-DOCTOR-002** (When 감지된-이상상태): **When** adb 또는 platform-tools가 감지되지 않은 경우, the CLI **shall** OS별 정책을 적용한다 — macOS에서는 **사용자의 명시적 동의를 받은 뒤** Homebrew로 자동 설치하고(무음 설치 금지), Linux/Windows에서는 자동 설치 없이 **정확한 수동 설치 단계만 안내**한다.
- **REQ-DOCTOR-003** (When 이벤트): **When** `doctor`가 실행될 때, the CLI **shall** ADBKeyBoard APK를 **버전 고정(pinned) 참조로 공식 GitHub 릴리스에서 런타임에 다운로드**하여 Unicode IME를 설치하고 활성화(`ime enable`)한다. ADBKeyBoard는 **GPL-2.0**이고 본 패키지는 MIT이므로, 컴파일된 APK를 npm 패키지에 **번들·재배포하지 않는다**(라이선스 준수). 다운로드는 고정 태그(`master` 금지)에서만 이루어지고, `adb install` 전에 ZIP/APK 매직바이트(`PK`)로 검증하며, 로컬(`~/.cache/explore-mobile/`)에 캐시하여 반복 실행 시 재다운로드하지 않는다(멱등). 다운로드 실패(네트워크/404/무효 파일)는 REQ-ERR-002로 graceful 처리하고 수동 설치를 안내한다.
- **REQ-DOCTOR-004** (When 이벤트): **When** `doctor --clean`(또는 `reset`)이 실행될 때, the CLI **shall** 원래 IME를 복원하고 임시 리소스를 제거하여 기기를 원래 상태로 되돌린다.
- **REQ-DOCTOR-005** (Ubiquitous): The `doctor` command **shall** 모든 점검·설치 결과를 JSON으로 보고한다.

### B.4 기기 목록 (REQ-DEVICES)

- **REQ-DEVICES-001** (When 이벤트): **When** `devices` 명령이 실행될 때, the CLI **shall** 연결된 모든 기기를 나열하고 각 항목에 `serial`, `model`, Android 버전, `connection state`를 포함한다.
- **REQ-DEVICES-002** (Ubiquitous): The `devices` command **shall** 각 기기가 emulator인지 physical device인지 구분하여 표시한다.

### B.5 앱 제어 (REQ-APP)

- **REQ-APP-001** (When 이벤트 — **개정 0.3.0**): **When** `launch <package>`가 Android 기기를 대상으로 실행될 때, the Android backend **shall** 먼저 대상 패키지의 **런처 컴포넌트를 조회**한 뒤(MAIN + LAUNCHER 카테고리 해석), 그 컴포넌트를 **명시적 컴포넌트(explicit component)** 로 지정해 앱을 시작한다. the Android backend **shall not** 패키지만 지정하는 **암시적 인텐트 해석**으로 앱을 시작한다 — 암시적 해석은 대상 액티비티가 `android.intent.category.DEFAULT`를 선언한 경우에만 매칭되며, 이를 선언하지 않는 앱(§C.3-①에서 3개 패키지로 실측)은 **설치돼 있고 런처 액티비티가 정상 조회되며 손으로 누르면 열리는데도** 실패한다.
  - **판정 기준(observable)**: 컴포넌트 조회의 성공/실패는 **stdout 내용으로 판정하며 종료 코드로 판정하지 않는다**(shall not) — 조회가 실패해도 종료 코드는 0이다(§C.3-②).
  - **When** 런처 컴포넌트가 해석되지 않는 경우, the CLI **shall** `BACKEND_COMMAND_FAILED`와 **구분되는 전용 오류 코드 `LAUNCHER_ACTIVITY_NOT_FOUND`** 로 graceful 하게 거부하고, 기기에는 **어떤 시작 인텐트도 전송하지 않는다**(shall not). 이 오류 메시지는 원인을 **"런처 액티비티 없음" 또는 "패키지 미설치" 중 하나로 단정해서는 안 된다**(shall not) — 두 경우가 **동일한 출력**을 내므로 구분 불가하다(§C.3-③). 메시지는 두 가능성을 함께 제시한다.
  - **불변(non-regression)**: 명시적 컴포넌트 시작은 **기존 태스크 재개(task resume) 의미를 바꾸지 않는다** — 이미 실행 중인 앱을 대상으로 하면 새 인스턴스를 만들지 않고 기존 태스크를 앞으로 가져오며 앱 내부 상태가 보존된다(§C.3-④ 실측). 이 재개 동작은 **의도된 계약**이며, 재개를 알리는 경고 행은 **실패가 아니다** — 나중에 읽는 사람이 이를 "결함"으로 보고 되돌려서는 안 된다.
- **REQ-APP-002** (When 이벤트): **When** `stop <package>`가 실행될 때, the CLI **shall** 지정한 앱을 강제 종료(force-stop)한다.

### B.6 화면 캡처 (REQ-SCREENSHOT)

- **REQ-SCREENSHOT-001** (When 이벤트): **When** `screenshot` 명령이 실행될 때, the CLI **shall** `adb exec-out screencap -p`로 PNG를 호스트로 스트리밍한다.
- **REQ-SCREENSHOT-002** (Unwanted): The `screenshot` command **shall not** 기기에 파일을 남긴다.

### B.7 입력 원시 명령 (REQ-INPUT)

- **REQ-INPUT-001** (When 이벤트): **When** `tap <x> <y>`가 실행될 때, the CLI **shall** `adb shell input tap`으로 좌표를 탭한다.
- **REQ-INPUT-002** (While 상태): **While** 입력 문자열이 ASCII로만 구성된 상태일 때, the `text` command **shall** `adb shell input text` 빠른 경로(fast path)를 사용한다(비-ASCII 경로 REQ-INPUT-003과 대칭).
- **REQ-INPUT-003** (When 이벤트 — **개정 0.3.0**): **When** `text "<...>"`의 입력에 비-ASCII(한글/이모지)가 포함된 경우, the CLI **shall** ADBKeyBoard IME를 통해 base64 브로드캐스트(`ADB_INPUT_B64`)로 입력한다. **When** 대상 기기에 ADBKeyBoard가 설치되어 있지 않은 경우, the `text` command **shall** 공유 설치기(shared installer)를 통해 **런타임에 자동 설치(self-heal)** 한 뒤 진행한다(설치 실패 시 REQ-ERR-002로 graceful 처리, 기기 상태 무변경). 이 자가치유 경로는 `doctor`의 설치 로직과 동일한 공유 헬퍼를 사용한다 — `reset`이 ADBKeyBoard를 제거하므로 리셋 이후/신규 기기에서도 `text`가 스스로 재설치할 수 있어야 한다. **추가(개정 0.3.0 — M10)**: **When** 자가치유 설치가 방금 수행된 경우, the Android backend **shall not** 설치 직후 곧바로 IME 전환·브로드캐스트로 진행한다 — 설치 직후는 IME 서비스가 아직 등록·바인딩되지 않은 대표적 창이며, 5회 분리 실험에서 실패는 **오직 "같은 호출 안에서 설치한" 조건에서만** 발생했다(§C.3-⑧). 준비 신호 확인과 대기 계약은 REQ-INPUT-004(개정 0.3.0)가 규정한다.

  **추가(개정 0.3.0 — M12, `ime enable` 등록 경쟁)**: **When** 자가치유 `adb install`이 성공한 직후의 `ime enable`이 **"해당 IME를 알 수 없어 활성화할 수 없다"는 형태로 실패한 경우**(§C.3-⑫의 실측 메시지·종료 코드), the Android backend **shall** `ime enable`을 **상한 있는(bounded) 횟수만큼 재시도**한다. 패키지는 방금 설치에 성공했고(`pm list packages` 계수 0 → 1) IMMS가 새로 설치된 IME를 아직 등록하지 못한 것일 뿐이므로, 이 실패는 **일시적**이다.
  - **재시도 대상은 이 실패 형태뿐이다(shall not)**: `ime enable`의 **다른 실패**는 재시도하지 않고 **즉시 표면화**한다. 재시도가 모든 실패를 삼키는 루프가 되면, 실제로 고쳐야 할 실패(권한·API 레벨·기기 상태)가 상한만큼 지연된 뒤 같은 오류로 나오면서 원인만 흐려진다.
  - **재시도 상한과 백오프는 설계 선택이다(측정 의무 없음)**: M10의 대기 상한 5,000ms 및 `MAX_DURATION_MS`(`src/cli/validators.ts`)와 같은 부류다. 목적은 "무한 재시도 금지"뿐이며, 이 값들은 기기 거동을 주장하지 않는다 — 실측 파생값(터치 슬롭 문턱)과 부류가 다르다.
  - **왜 준비 신호 폴링이 아니라 재시도인가**: `ime list -a`를 등록 준비 신호로 쓸 수 있는지 탐침했으나 **간헐 실패 창을 잡지 못했고, 따라서 실패 중의 `ime list -a` 값을 한 번도 관측하지 못했다**(§C.3-⑭). 관측하지 않은 신호 위에 수정을 세우는 것은 §C.3-⑩이 이미 경고한 바로 그 오류다. **`ime enable`의 권위 있는 준비 판정은 `ime enable` 자신의 성공이며**, 재시도가 안전한 근거는 **실측된 멱등성**이다(§C.3-⑮).
  - **심각도(정확히 기술한다)**: 이 실패는 **소리 내어 실패한다** — `ok:false` + 구체적 메시지를 반환하고 브로드캐스트를 보내지 않는다. M10·M11이 죽인 **`ok:true`-무효과(무음)** 부류가 **아니며**, 그보다 심각도가 낮다. 그럼에도 결함인 이유는 `doctor` 직후 또는 `reset` 이후 **첫 한글/이모지 입력이 사용자에게 보이는 이유 없이 실패**하기 때문이다.
- **REQ-INPUT-004** (While 상태 — **개정 0.3.0, 0.4.0**): **While** 비-ASCII `text` 입력이 IME 전환을 요구하는 경우, the `text` command **shall** 기기의 **현재 활성 IME를 조회(live source of truth)** 하여 아직 ADBKeyBoard가 아니면 ADBKeyBoard로 **한 번만 전환**하고, 전환 직전의 원래 IME를 **`serial`별로 디스크에 영속화**한다(별도 CLI 프로세스 간 생존 — `~/.cache/explore-mobile/ime-sessions.json`). the `text` command **shall not** 매 호출마다 원래 IME를 복원한다(세션 유지 — 실기기에서 매 입력 후 복원 시 소프트키보드 깜빡임/레이아웃 재트리거 발생). 원래 IME 복원은 오직 **`reset` / `doctor --clean`** 실행 시 수행된다(디스크에 영속된 원본을 읽어 `ime set`으로 복원하고 항목을 삭제; 복원 실패 시 REQ-ERR-001로 원래 IME id 보고). 추가로, **When** `text` 전송이 완료되면, the CLI **shall** 기본적으로 소프트키보드를 숨기며, **Where** `--keep-keyboard`가 지정된 경우 숨김을 생략한다.

  **추가(개정 0.4.0 — 소프트키보드 숨김이 자기 입력을 파괴하는 결함)**: **When** `text` 전송 후 소프트키보드를 숨기는 경우, the `text` command **shall not** 방금 자신이 입력한 텍스트를 파괴한다. 이것이 **숨김 메커니즘 선택을 구속하는 상위 관찰 계약**이며, 특정 keycode보다 위에 선다 — 어떤 수단을 쓰든 입력이 살아남아야 한다.
  - **메커니즘(관찰 가능한 계약으로 승격)**: the Android backend **shall** `KEYCODE_BACK`(4)로 소프트키보드를 숨기며, `KEYCODE_ESCAPE`(111)를 사용해서는 **안 된다**(shall not). 근거는 실측이다 — Chrome 웹 페이지 입력란에서 ESCAPE는 **페이지로 전달되어 입력 취소로 해석**되고 방금 입력한 텍스트를 지운다(§C.4-⑰). BACK은 **웹 입력란과 네이티브 `EditText` 양쪽에서** 키보드를 내리면서 텍스트를 보존한다(§C.4-⑱). 따라서 BACK은 이 자리에서 ESCAPE보다 **엄격히 우월**하다 — 네이티브 경로를 퇴행시키지 않으면서 웹 경로를 고친다.
  - **결함 부류(정확히 기술한다)**: 이 실패는 **무음(silent)** 이다 — 명령이 `{"ok":true}`를 반환하는데 입력란은 비어 있다. M10·M11이 죽인 부류와 **같으며**, M12의 소리 내는 실패와는 다르다. 게다가 아무 일도 안 하는 것이 아니라 **사용자가 방금 요청한 작업의 결과를 능동적으로 파괴한다**. 네이티브 `EditText`에서는 정상 동작하므로 Settings 앱에서만 검증하면 **영원히 통과한다** — 판정은 반드시 웹 입력란에서 이뤄져야 한다(AC-ANDROID-036).
  - **가드(예방적)**: the Android backend **shall** 소프트키보드가 실제로 표시된 상태임을 기기에서 확인한 뒤에만 숨김 키를 전송하고, 표시되지 않았으면 **전송하지 않는다**(shall not). 판정 신호는 `dumpsys input_method`의 `mInputShown`이며, M10 준비 신호 파서가 **이미 같은 덤프를 읽는다** — 새 adb 표면이 아니다.
    - **주장 경계 — 이 가드는 예방적이며 실측으로 강제되지 않았다**: 근거는 "소비되지 않은 BACK은 앱의 뒤로가기 동작"이라는 **일반 논거**다. 실제로 `mInputShown=false` 상태에서 BACK을 보낸 **1회 시행**(Settings `SearchActivity`)에서는 **포그라운드가 바뀌지 않았다** — 즉 "키보드가 없을 때 BACK이 화면을 이탈시킨다"는 **여기서 관측되지 않았다**(§C.4-⑲). 문서·주석·커밋 어디에서도 이 가드의 근거를 **실측으로 서술해서는 안 된다**(shall not) — 미측정을 확립된 사실로 취급하는 것은 §C.3-⑩이 이미 경고한 오류다.
  - **불변(non-regression) — best-effort**: 숨김 단계의 실패는 `text` 명령을 실패시키지 **않는다**(shall not). 표시 여부 조회의 실패도 마찬가지이며, 이 경우 숨김을 **생략**한다(조회 실패를 "표시됨"으로 낙관하지 않는다 — 확인되지 않은 신호 위에서 파괴 가능한 키를 쏘지 않는다). 전송이 이미 성공했으면 봉투는 `ok:true`다(AC-ANDROID-022 불변).
  - **불변(non-regression) — 옵트아웃**: `--keep-keyboard`의 의미는 바뀌지 않는다(숨김 단계 전체를 생략).

  **추가(개정 0.3.0 — IME 바인딩 경쟁 조건)**: **While** ADBKeyBoard IME가 아직 **바인딩되지 않은(not bound)** 상태일 때, the Android backend **shall not** base64 브로드캐스트를 전송한다. `ime set`은 *설정 값이 기록되는 즉시* 반환하지만 IME 서비스는 그 시점에 아직 바인딩되지 않았고, 그 창에서 발사된 브로드캐스트는 **조용히 유실된다** — 명령은 `{"ok":true}`를 반환하는데 포커스된 입력란에는 아무것도 들어가지 않는다(§C.3-⑤/⑧ 실측). 따라서 the Android backend **shall** 전송 전에 기기의 **바인딩 준비 신호**(§C.3-⑥)를 확인하고, 준비될 때까지 **상한이 있는(bounded) 대기**를 수행한다.
  - **준비 술어(readiness predicate)**: 바인딩 여부 플래그가 참이고 **동시에** 바인딩된 IME id가 ADBKeyBoard여야 한다. **두 번째 결합항은 실측으로 확립되지 않았다** — 미바인딩 창에서의 IME id 값은 관측되지 않았다(§C.3-⑩). 구현은 이 결합항의 실제 거동을 **실기기에서 확인해야 하며**(AC-ANDROID-032), 이미 확립된 사실로 취급해서는 안 된다(shall not).
  - **상한 값의 성격 — 설계 선택이지 실측값이 아니다**: 대기 상한은 **설계 선택(design choice)** 이며 `MAX_DURATION_MS`(SPEC-GESTURE-001 `src/cli/validators.ts`)와 같은 부류다. 터치 슬롭 문턱(`getMinEffectiveSwipeThreshold`)처럼 기기 거동을 주장하는 **실측 파생값과 다르며, 따라서 측정 의무가 붙지 않는다**. 목적은 "무한 대기 금지"뿐이므로 **넉넉하되 유한한** 값이면 충분하다(SPEC 권고: 5,000ms — 실측된 전환 시점은 대략 adb 왕복 1회다, §C.3-⑦). 다른 값을 택하려면 이 근거를 재검토한다. 폴링 간격은 구현 재량이다.
  - **When** 상한 안에 준비 신호가 관측되지 않은 경우, the CLI **shall** 브로드캐스트를 **전송하지 않고**(shall not) `ok:false` + 전용 오류 코드 **`IME_BIND_TIMEOUT`** 을 반환한다. the CLI **shall not** 이 경로에서 `ok:true`를 반환한다 — 이는 **의도된 응답 계약 변경**(사용자 결정)이며, 현재 `ok:true`를 받던 경로가 오류가 된다. 근거: 그 경로는 이미 깨져 있고 **무음 실패가 오류보다 나쁘다**(AC-ANDROID-031).
  - **불변(non-regression) 1**: 타임아웃으로 실패해도 전환 직전 원래 IME의 **디스크 영속은 유지된다** — 이후 `reset`/`doctor --clean`이 여전히 복원할 수 있다(REQ-IDEMP-004 불변).
  - **불변(non-regression) 2 — warm 경로**: 기기의 활성 IME가 **이미 ADBKeyBoard이고 바인딩된** 상태면 대기 없이 즉시 전송한다(AC-ANDROID-030). 본 개정이 지연을 더하는 것은 **cold 경로뿐**이다.
- **REQ-INPUT-005** (When 이벤트): **When** `key <name>`이 실행될 때, the CLI **shall** `adb shell input keyevent`로 키 이벤트를 전송한다. 지원 키 별칭 → Android KEYCODE 매핑: `back`→BACK(4), `home`→HOME(3), `enter`→ENTER(66), `menu`→MENU(82), `app_switch`→APP_SWITCH(187), `up`/`down`/`left`/`right`→DPAD_UP/DOWN/LEFT/RIGHT(19/20/21/22), `del`→DEL(67), `tab`→TAB(61), `power`→POWER(26), `volume_up`/`volume_down`→VOLUME_UP/DOWN(24/25). 목록 외 별칭은 graceful 오류로 거부한다(전체 keycode는 Android `KeyEvent` KEYCODE 목록 참조).

### B.7.1 요소 셀렉터 (REQ-SELECT) — 신규 역량(개정 0.2.0)

> 좌표를 미리 알 수 없는 실기기 자동화를 위해, `dump` 트리에서 요소를 찾아 그 중심을 대상으로 삼는 셀렉터 기반 입력. 순수 함수 매칭(`element-query.ts`, 기기 없이 단위 테스트 가능) + 명령 계층 통합(`tap.ts`/`text.ts`/`args.ts`).

- **REQ-SELECT-001** (Where 역량 게이트): **Where** `tap`에 셀렉터 플래그(`--id`/`--text`)가 지정된 경우, the CLI **shall** 현재 UI 덤프 트리에서 매칭 요소를 찾아 그 **중심 좌표를 탭**한다(좌표 모드 `tap <x> <y>`는 불변). 매칭 요소가 비-tappable(`clickable && enabled == false`)이어도 탭은 수행하되 warning을 함께 보고한다.
- **REQ-SELECT-002** (Where 역량 게이트): **Where** `text`에 셀렉터 플래그(`--id`/`--text`)가 지정된 경우, the CLI **shall** 매칭 요소의 중심을 **탭하여 포커스한 뒤** 텍스트를 입력한다(auto-focus then type).
- **REQ-SELECT-003** (When 감지된-이상상태): **When** `tap`에 좌표와 셀렉터가 **동시에** 주어진 경우, the CLI **shall** `TARGET_CONFLICT` graceful 오류로 거부한다(좌표 XOR 셀렉터 — 둘 중 하나만 허용, 임의 선택 없음).
- **REQ-SELECT-004** (When 감지된-이상상태): **When** 셀렉터에 매칭되는 요소가 없거나 `--index`가 매칭 수 범위를 벗어난 경우, the CLI **shall** `ELEMENT_NOT_FOUND`를 반환하고 좌표/블라인드 입력으로 **폴백하지 않는다**(`text`의 경우 포커스 실패 시 입력을 전송하지 않음 — 엉뚱한 포커스로 타이핑 방지).
- **REQ-SELECT-005** (When 감지된-이상상태 / While 상태): **When** `--index`가 음이 아닌 정수가 아닌 경우, the CLI **shall** `INVALID_INDEX`로 거부한다. **While** 셀렉터가 2개 이상의 요소에 매칭되는 경우, the CLI **shall** 0-기반 `--index`(기본 0)로 N번째 매칭을 선택한다. 셀렉터 매칭은 `id`(정확히 일치) / `text`(trim 후 정확히 일치)이며 둘 다 주어지면 **AND 의미**(더 좁은 매칭)를 적용한다. `content-desc`는 정규화 시 `text`로 접히므로 `--text`가 content-desc 파생 텍스트도 매칭한다.

### B.8 UI 계층 덤프 (REQ-DUMP)

- **REQ-DUMP-001** (When 이벤트): **When** `dump` 명령이 실행될 때, the CLI **shall** `uiautomator dump`로 UI 계층(XML)을 수집한다.
- **REQ-DUMP-002** (When 이벤트): **When** UI 계층 XML을 수집한 뒤, the CLI **shall** 이를 공통 요소 스키마로 정규화한 JSON을 출력한다.

### B.9 다중 기기 · 멱등성 · 리소스 위생 (REQ-MULTIDEV / REQ-IDEMP)

- **REQ-MULTIDEV-001** (Ubiquitous — **개정 0.4.0**): Every command **shall** `--device <serial>` 옵션을 수용하고 adb `-s`로 대상 기기를 지정한다.

  **추가(개정 0.4.0 — "연결"의 정의)**: 기기 목록의 한 항목이 **연결됨(connected)** 이라 함은 그 항목의 `connectionState`가 `"device"`인 상태를 말한다. `offline` · `unauthorized` 항목은 목록에 나타나더라도 **연결된 기기가 아니다** — 대상으로 삼을 수 없기 때문이다. 이 정의는 REQ-MULTIDEV-002가 개정 0.4.0 이전부터 이미 쓰고 있던 "연결"이라는 낱말에 **비로소 관찰 가능한 의미를 부여**하며, 정의가 없었던 것이 결함 5가 생긴 자리다.
  - **플랫폼 중립(scope)**: 이 정의와 그것을 쓰는 대상 해석 규칙은 **플랫폼 중립**이다. 대상 해석 계층은 Android/iOS 두 백엔드를 **함께** 서비스하며, 실측에서 정의를 위반한 항목 21개는 **전부 iOS 시뮬레이터**였다(§C.4-⑳). 본 REQ가 Android 이름의 SPEC 안에 있다는 이유로 수정 범위를 Android 경로로 좁혀서는 **안 된다**(shall not) — 나중에 읽는 사람이 이 조항을 Android 문제로 오독하지 않도록 여기 못 박는다.
  - **When** `--device <serial>`가 명시됐고 그 serial이 기기 목록에 **존재하지만 연결 상태가 아닌** 경우, the CLI **shall** `DEVICE_NOT_FOUND`(존재하지 않음)와도 백엔드 실행 실패(`BACKEND_COMMAND_FAILED`)와도 **구분되는 전용 오류 코드 `DEVICE_NOT_CONNECTED`** 로 거부하고, **백엔드 명령을 실행하지 않는다**(shall not). 오류 메시지는 관측된 `connectionState` 값을 포함한다. 근거: 개정 전 이 경로는 대상 해석을 통과한 뒤 **한 층 늦게** 백엔드에서 실패했고(§C.4-㉒), 메시지가 유익하더라도 **잡아야 할 층이 아니었다**. 사용자에게 필요한 정보는 "없다"가 아니라 **"있는데 부팅·연결되지 않았다"** 이며, 후자만이 조치 가능하다.
  - **관계(REQ-ERR-003)**: 본 조항은 REQ-ERR-003("offline/unauthorized 대상 → 상태를 명시한 graceful 오류")을 대체하지 않는다. 같은 요구를 **더 이른 지점**에서, **전용 코드**로 충족한다 — 감지 지점이 백엔드에서 대상 해석 계층으로 앞당겨지는 것뿐이다.
- **REQ-MULTIDEV-002** (When 감지된-이상상태 — **개정 0.4.0**): **When** **연결된**(REQ-MULTIDEV-001의 정의) 기기가 2대 이상이고 `--device`가 생략된 경우, the CLI **shall** 실행을 중단하고 **명확한 오류 메시지와 기기 목록**을 출력한다(graceful failure).

  **추가(개정 0.4.0 — 계수·자동 선택·메시지가 모두 그 정의를 쓴다)**: the CLI **shall** 대상 기기 계수, 자동 선택, 오류 메시지 생성 **모두**에서 연결된 기기만을 대상으로 삼으며, 미연결 항목을 **계수에 포함해서는 안 된다**(shall not). 실측에서 이 호스트의 목록은 **23건**이었고 그중 연결된 것은 **2건**이었다 — 미연결을 포함한 오류 메시지(`23 devices connected; ...`)는 **사실이 아닌 수를 주장**했다(§C.4-⑳). 봉투는 `ok:false`로 정직했으나 **메시지 본문이 거짓이었다**.
  - **자동 선택의 도달 가능성(reachability)**: **While** 연결된 기기가 정확히 1대인 경우, the CLI **shall** 미연결 항목이 목록에 몇 개 있든 그 1대를 자동 선택한다. **문서화된 동작은 실제로 도달 가능해야 한다** — 원시 목록 길이로 계수하면 Xcode가 설치된 Mac에서 길이가 **결코 1이 되지 않아** 자동 선택 분기가 한 번도 발동하지 않고, README/스킬 문서와 동작이 모순된다(§C.4-㉑). 이 조항이 요구하는 것은 새 기능이 아니라 **이미 문서화된 기능의 복구**다.
  - **`details.availableDevices` 구성(결정)**: 오류의 `details.availableDevices`는 **연결된 기기만** 나열한다(shall). 미연결 항목은 **개수만** 별도로 요약 보고하고 전체 항목을 덤프하지 **않는다**(shall not). 근거 셋 — (i) 이 필드의 용도는 사용자가 `--device` 값을 **고르는** 것이고, 대상으로 삼을 수 없는 항목은 후보가 아니므로 나열은 사용자가 머릿속에서 걸러야 할 잡음이다; (ii) 잡음의 크기가 **무한정 자란다** — 사용자가 시뮬레이터를 만들수록 늘기만 하며 사용자가 한 일과 무관하다; (iii) 그럼에도 완전히 숨기면 "내 시뮬레이터는 왜 없지?"라는 새 혼란이 생기므로 **개수 요약이 발견 가능성을 보존**한다. **전체 분할 나열(연결/미연결 두 목록)은 기각한다** — 이 변경을 촉발한 비용(23건 덤프)을 그대로 두면서 스키마 분기만 늘린다. 전체 목록이 필요한 사용자에게는 **`devices` 명령이 이미 그 인벤토리**이며, 오류 메시지가 그쪽을 가리키면 충분하다.
  - **불변(non-regression) — `devices` 출력**: `devices` 명령의 출력은 **바뀌지 않는다**. 미연결 항목을 계속 전부 나열하고 `connectionState`로 구별한다(REQ-DEVICES-001 불변). 본 개정이 바꾸는 것은 **대상 해석(targeting) 계층뿐**이다 — 인벤토리 명령까지 "일관성 있게" 필터링하면 사용자가 offline 시뮬레이터의 존재를 확인할 방법이 사라진다.
  - **When** 연결된 기기가 0대인 경우, the CLI **shall** `NO_DEVICE`를 반환한다. 목록에 미연결 항목이 있으면 메시지에 그 사실을 포함한다 — "있는데 부팅되지 않았다"와 "아무것도 없다"는 사용자에게 다른 조치를 뜻한다.
- **REQ-MULTIDEV-003** (Ubiquitous): The CLI **shall** 기기별 상태(원래 IME, 임시 리소스)를 `serial`을 키로 격리(isolation)한다.
- **REQ-MULTIDEV-004** (Ubiquitous): The CLI **shall** 임시 리소스를 `serial`로 네임스페이스화하여 동시 실행(concurrency)에 안전해야 한다.
- **REQ-IDEMP-001** (Ubiquitous): The setup/install/`doctor` operations **shall** 멱등(idempotent)해야 한다. (참고: `tap`/`text`/`key`/`screenshot`은 기기 효과 측면에서 본질적으로 비멱등이므로 멱등 대상에서 제외 — AC-ANDROID-005는 설치 멱등성만 검증한다.)
- **REQ-IDEMP-002** (When 이벤트): **When** 앱 또는 IME 설치가 요청될 때, the CLI **shall** `pm list packages`로 기존 설치 여부를 먼저 확인하여 **중복 설치를 하지 않는다**.
- **REQ-IDEMP-003** (Unwanted): The CLI **shall not** 기기에 잔여 파일을 남긴다(exec-out 스트리밍 우선).
- **REQ-IDEMP-004** (While 상태): **While** 비-ASCII `text`가 IME 전환 후 전송 단계에서 오류로 종료되는 경우에도, the CLI **shall** 전환 직전의 원래 IME를 디스크에 영속하여(유실 방지) 이후 `reset`/`doctor --clean`이 복원할 수 있도록 보장한다(REQ-INPUT-004 개정과 결합 — 매 호출 즉시 복원이 아니라 영속 후 reset 복원, cleanup-safe).

### B.10 오류 처리 (REQ-ERR)

- **REQ-ERR-001** (When 감지된-이상상태): **When** 원래 IME 복원이 실패한 경우, the CLI **shall** 실패를 보고하고 **원래 IME id를 출력**하여 사용자가 수동 복구(`ime set <id>`)할 수 있게 한다(무음 실패 금지).
- **REQ-ERR-002** (When 감지된-이상상태): **When** ADBKeyBoard 설치가 실패한 경우(비호환 API 레벨/설치 거부 등), the CLI **shall** graceful 오류로 원인과 대안(수동 설치 안내)을 JSON으로 보고하고 기기 상태를 변경하지 않는다.
- **REQ-ERR-003** (When 감지된-이상상태): **When** 대상 기기가 `offline` 또는 `unauthorized` 상태인 경우, the CLI **shall** 조용히 진행하지 않고 상태를 명시한 graceful 오류를 반환한다.
- **REQ-ERR-004** (When 감지된-이상상태): **When** adb 데몬이 실행 중이 아니거나 서버 기동에 실패한 경우, the CLI **shall** graceful 오류를 반환하고 `doctor`는 데몬 health를 점검·안내한다(설치 성공만으로 정상으로 간주하지 않음).

---

## §C. 제약 (Constraints)

- **언어/런타임**: TypeScript(ESM), **Node.js 20 LTS 이상**. 오픈소스.
- **패키지 매니저/배포**: 개발은 **pnpm**을 표준으로 사용하고, **npm 레지스트리**에 배포하여 최종 사용자는 전역 설치 없이 `npx`로 실행한다. 개발용 PM(pnpm)은 최종 사용자 `npx` 실행과 독립적이다(사용자는 pnpm 불필요).
- **입출력 규약**: 모든 명령은 JSON in/out.
- **외부 의존성**: `adb`(platform-tools), ADBKeyBoard APK(Unicode IME). idb는 본 SPEC 범위 아님.
  - **adb 설치 정책(OS별)**: macOS는 사용자 명시 동의 후 Homebrew 자동 설치, Linux/Windows는 안내만(자동 설치 없음). 무음 설치 금지(REQ-DOCTOR-002).
  - **ADBKeyBoard 조달**: ADBKeyBoard는 **GPL-2.0** 라이선스이고 본 패키지(explore-mobile)는 **MIT**이므로, 컴파일된 APK를 npm 패키지에 **번들·재배포하지 않는다**. 대신 버전 고정(pinned) 참조로 공식 GitHub 릴리스에서 **런타임에 다운로드**하고(매직바이트 검증 + 로컬 캐시, 멱등), 실패 시 수동 설치를 안내한다(REQ-DOCTOR-003). GPL-2.0 바이너리를 MIT 배포물에 번들하는 것은 라이선스 위반이므로 런타임 다운로드는 의도된 준수 선택이다.
- **검증된 기술 사실(2026-07-22 문서 확인, ground truth)**:
  - `adb shell input text`는 유니코드를 전송할 수 없다 → 한국어 입력은 ADBKeyBoard + base64 브로드캐스트(`ADB_INPUT_B64`)가 신뢰 경로이다. IME 전환은 **세션 기반**으로 한 번만 수행하고(전환 전 원래 IME를 `serial`별로 디스크에 영속화), 매 호출 복원이 아니라 **`reset`/`doctor --clean` 시점에** 원래 IME를 복원한다(별도 CLI 프로세스 간 생존 — REQ-INPUT-004/REQ-ERR-001 개정).
  - `adb exec-out screencap -p`는 기기에 파일을 남기지 않고 PNG를 호스트로 스트리밍한다.
  - `uiautomator dump`는 `class`/`resource-id`/`text`/`content-desc`/`bounds`/`clickable` 필드를 가진 UI 계층 XML을 생성한다.

### C.1 출처 (SOURCES) — §C ground-truth 근거

> Tier M(3-artifact)에는 research.md가 없으므로, ground-truth 기술 사실의 출처를 인라인으로 명시한다.

- idb 명령 레퍼런스: `https://fbidb.io/docs/commands`
- idb 접근성(accessibility) 필드: `https://fbidb.io/docs/accessibility`
- idb 저장소(유지보수 상태/버전): `https://github.com/facebook/idb`
- ADBKeyBoard(Unicode IME, `ADB_INPUT_B64` 브로드캐스트): `https://github.com/senzhk/ADBKeyBoard`
- Android WebView 원격 디버깅(CDP): `https://developer.chrome.com` (WebView remote debugging)
- iOS WebView 디버깅 프록시: `ios-webkit-debug-proxy` (`https://github.com/google/ios-webkit-debug-proxy`)
- adb `input text` 유니코드 제약 및 IME 우회 근거: Appium Unicode 입력 문서(Appium docs, unicode keyboard/IME)

> 주의: 위 URL은 계획 근거 표기이며, 구현 시 최신 상태를 재검증한다(WebSearch→WebFetch). 특히 idb는 미유지보수이므로 SPEC-02에서 버전 고정 시 재확인.

### C.2 알려진 한계 (Known Limitations — 실기기 노트, 개정 0.2.0)

> 실기기 하드닝 과정에서 관찰된 한계. 회피책과 후속 개선 후보를 함께 기록한다.

- **resource-id/testID 미설정 앱은 `--id` 셀렉터로 찾을 수 없다**: 일부 앱(특히 React Native — 실기기 `com.hatae.moyura`에서 확인)은 요소에 `resource-id`를 부여하지 않는다. 이 경우 `tap --id`/`text --id`는 매칭 실패(`ELEMENT_NOT_FOUND`)하므로, 표시 텍스트/접근성 레이블 기반 `--text` 셀렉터를 사용해야 한다(`content-desc`도 `--text`로 매칭됨).
- **이모지가 정규화 텍스트에서 HTML 엔티티로 노출된다**: 현재 `dump` 정규화 출력에서 이모지가 디코드되지 않은 HTML/문자 엔티티 형태로 나타난다(예: `text` 필드에 원문 이모지가 아닌 엔티티 문자열). 입력(`text "...😸"`)은 정상 동작하나(base64 브로드캐스트), 덤프 결과의 이모지 디코드는 **후속 개선 후보**다(입력 경로에는 영향 없음).

### C.3 실측 메커니즘 사실 (개정 0.3.0) — 수정을 다시 결함으로 되돌리지 않기 위한 고정

> **출처 ①~⑪**: `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md` (2026-07-29). 전문을 여기 옮기지 않는다 — 아래는 REQ와 AC가 딛고 서는 **메커니즘 사실만** 추린 것이다.
> **출처 ⑫~⑯**: M10(`f6e0724`) 실기기 검증 세션 실측(2026-07-29, **동일 기기**). 별도 보고서 파일이 없으므로 **이 표가 그 관측의 1차 기록**이다.
> **기기(공통)**: Galaxy S25 Ultra(SM-S938N), Android 16, 1440×3120, 무선 ADB(`adb-R3CY106LKVX-xtn5zd._adb-tls-connect._tcp`).
>
> 이 절이 존재하는 이유: 세 결함 모두 "그 명령이 왜 그렇게 생겼는지"가 문서에 없어서 발생했다. **여기 적힌 것을 모르는 사람은 수정을 "단순화"하다가 결함을 그대로 복원한다.** 검증 수준 칸의 **미측정(명시)** 은 빈칸이 아니라 **주장 경계**다 — 그 행의 내용을 확립된 사실처럼 쓰면 안 된다.

| # | 관측 사실 | 근거 (관측한 것) | 검증 수준 |
|---|-----------|------------------|-----------|
| ① | **`am start ... -p <pkg>`는 암시적(implicit) 인텐트 해석이다** — 대상 액티비티가 `android.intent.category.DEFAULT`를 선언해야만 매칭된다. 실제 런처는 명시적 컴포넌트로 띄우므로 이 제약을 받지 않는다 | 3개 패키지 실측: `com.android.settings`(`/.Settings`, `isDefault=true`) → `-p` **성공**; `com.sec.android.app.popupcalculator`(`/.Calculator`, DEFAULT 미선언) → `-p` **실패** / 명시적 컴포넌트 **성공**; `com.sec.android.app.clockpackage`(`/.ClockPackage`, DEFAULT 미선언) → `-p` **실패**. 셋 다 user 0에 설치돼 있고 런처 액티비티가 정상 조회되며 손으로 누르면 열린다 — **앱이 없어서가 아니라 실행 방식이 틀려서** 실패한다. 삼성 기본앱 상당수가 여기 걸린다 | **실측(Android)** |
| ② | **런처 컴포넌트 조회의 판정은 stdout으로 해야 하며 종료 코드로는 불가능하다.** 조회 명령(`cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER <pkg>`)은 성공 시 **2행**을 내며 **마지막 비어있지 않은 행**이 컴포넌트다(액티비티가 선행 점 상대 경로일 수 있다 — 예: `com.sec.android.app.popupcalculator/.Calculator`). 실패 시 **단일 행 `No activity found`** 를 내는데 **종료 코드는 여전히 0이다** | 위 3개 패키지 조회에서 직접 관측. `--user` 인자는 **불필요**했다 | **실측(Android)** |
| ③ | **"런처 액티비티 없음"과 "패키지 미존재"는 같은 출력을 낸다** — 조회 결과만으로 두 원인을 구분할 수 없다 | 양쪽 모두 `No activity found` 단일 행. 따라서 오류 메시지가 원인을 단정하면 **거짓을 주장하게 된다**(REQ-APP-001 개정의 단정 금지 조항 근거) | **실측(Android)** |
| ④ | **명시적 컴포넌트 시작(`am start -n <component>`)은 기존 태스크 재개 의미를 보존한다** — 새 인스턴스를 만들지 않는다 | 실행 중인 앱 대상 실측: `Warning: Activity not started, its current task has been brought to the front`, **종료 코드 0**, 앱 내부 상태 그대로 유지. **경고 행은 실패가 아니다.** 개정 전 `-p` 경로의 재개 동작과 동일하며, 이 수정은 재개 의미를 **바꾸지 않는다** | **실측(Android)** |
| ⑤ | **`ime set`은 IME 서비스가 바인딩되기 전에 반환한다** — 설정 값 기록 시점에 반환할 뿐이다. 그 창에서 발사한 base64 브로드캐스트는 **조용히 유실**되며 명령은 `{"ok":true}`를 반환한다 | 현재 구현은 `ensureAdbKeyboardInstalled` → `setImeToAdbKeyboard`(`ime enable` + `ime set`) → `broadcastBase64Text`를 **대기 없이 연달아** 보낸다(`adb-backend.ts`). 손으로 같은 adb 단계를 1초 간격을 두고 실행하면 **성공한다** — 논리 오류가 아니라 **경쟁 조건**이다 | **실측(Android)** |
| ⑥ | **바인딩 준비 신호는 `dumpsys input_method`에 있다.** `mBoundToMethod=<bool>`이 덤프 안에 **정확히 1회**만 나타나므로 파싱이 모호하지 않다. 같은 덤프가 **실제로 바인딩된 IME id**(`mCurId=<ime id>`)도 노출한다 | 실측 관측값: `mCurId=com.android.adbkeyboard/.AdbIME` | **실측(Android)** |
| ⑦ | **cold 사이클에서 `ime set` 직후에는 `mBoundToMethod=false`이며, 대략 adb 왕복 1회 안에 `true`로 뒤집힌다** | 직접 관측. 대기 상한(REQ-INPUT-004 개정)의 권고값이 넉넉해도 되는 근거다 — **다만 이 관측이 상한 값을 정하지는 않는다**(상한은 설계 선택) | **실측(Android)** |
| ⑧ | **결정 실험 — 가르는 변수는 "바인딩 여부"다.** 같은 cold 사이클, 입력란 포커스 확보, 오라클은 스크린샷: `mBoundToMethod=false`에서 발사 → **텍스트 유실 + `ok:true`**; `mBoundToMethod=true`에서 발사 → **텍스트 착지** | 5회 분리 실험 보강: 같은 호출 안에서 **설치** → 실패(#1 `doctor` 설치 직후 / #4 `reset` 직후 미설치 상태에서 자가치유) · IME **전환만** → 성공(#2, `알림` 착지) · **이미 바인딩** → 성공(#3 `알림알림`, #5 `카메라`). 즉 **IME 전환은 원인이 아니다.** 실패 직후 포그라운드가 원래 액티비티에서 되돌아가 있는 현상도 함께 관측됐다 | **실측(Android)** |
| ⑨ | **폐기된 가설과 무효 오라클(재수행 금지)** | (i) 최초 가설 **"IME 전환이 입력 연결을 끊는다"는 틀렸다** — ⑧의 #2가 전환을 포함하고도 성공해 반증했다. (ii) `dumpsys input_method`의 **`mServedView`는 오라클로 무효다** — 성공한 경우에도 `null`로 나왔다. **유효한 오라클은 스크린샷뿐이었다.** 같은 판정 수단을 다시 시도하는 것은 이미 소진된 길이다 | **실측(Android, 반증)** |
| ⑩ | **주장 경계 — `mCurId`는 미바인딩 창에서 측정되지 않았다** *(→ ⑯에서 해소됨; 이 행은 2026-07-29 최초 검증 시점의 기록으로 보존한다)* | `mBoundToMethod`의 `false → true` 전환은 **직접 실측**했다. 그러나 `false`인 창에서 `mCurId`가 무슨 값이었는지는 **별도로 측정하지 않았다**. 두 필드를 결합한 준비 술어를 쓰는 구현은 그 거동을 **실기기에서 확인해야 하며**(AC-ANDROID-032), 확립된 사실로 제시해서는 안 된다 | **미측정(명시) → ⑯에서 측정됨** |
| ⑪ | **Secure Folder 확증 — 현재 `pm list packages` 판정 방식이 옳다(되돌리지 말 것)** | 이 기기는 Secure Folder(유저 150)가 실행 중이라 `pm list packages`가 stderr에 `SecurityException: Shell does not have permission to access user 150`을 출력한다. 그러나 **종료 코드는 0이고 stdout은 user 0의 686개 패키지를 정상 반환**한다. `ensureAdbKeyboardInstalled`(`adbkeyboard-installer.ts`)는 `exitCode`와 `stdout`만 보므로 영향받지 않는다 — **"stderr가 비어 있어야 성공"으로 "개선"하면 여기서 오탐이 난다.** 결함이 아니라 기존 구현이 옳다는 실기기 확증이다 | **실측(Android)** |
| ⑫ | **`ime enable` 등록 경쟁 — 설치는 성공했는데 IMMS가 아직 IME를 모른다.** 실패는 **소리 내어(loud)** 난다 — `ok:false` + 특정 메시지 + 브로드캐스트 미전송 | CLI 출력 그대로: `{"ok":false,"command":"text","error":{"code":"BACKEND_COMMAND_FAILED","message":"adb shell ime enable (ADBKeyBoard) failed (exit 255): Unknown input method com.android.adbkeyboard/.AdbIME cannot be enabled for user #0"}}`. **같은 호출에서 패키지 설치는 방금 성공했다**(`pm list packages` 계수 0 → 1). 즉 "미설치"가 아니라 **"설치됐는데 아직 등록 안 됨"** 이다. **이 부류는 M10·M11이 죽인 `ok:true`-무효과(무음) 부류가 아니다** — 봉투가 거짓말하지 않으므로 심각도가 더 낮다. 그럼에도 결함인 이유는 `doctor` 직후·`reset` 이후 **첫 비-ASCII 입력이 이유 없이 실패**하기 때문이다 | **실측(Android)** |
| ⑬ | **포커스된 입력란과의 상관 — 상관이지 원인이 아니다(claim boundary)** | 실측 빈도: cold + **포커스된 입력란**(소프트키보드 올라온 상태) → **3/8 실패**; cold, 포커스 없음(CLI 경유) → **0/5**; cold, 포커스 없음(raw adb) → **0/6**. 상관은 강하지만 **표본이 작고 메커니즘은 확립되지 않았다** — **원인으로 서술하지 말 것**. 이 상관이 중요한 이유는 별개다: **포커스된 입력란은 `text`가 실제로 쓰이는 바로 그 조건**이므로, 실사용 빈도가 위 3/8에 가깝다 | **실측(Android) — 상관만, 인과 미확립** |
| ⑭ | **`ime list -a`는 준비 신호로 검증되지 않았다 — 미관측 창(재수행 시 이 경계를 먼저 읽을 것)** | `ime list -a`를 등록 준비 신호로 쓸 수 있는지 탐침했으나 **간헐 실패 창을 잡는 데 실패했고, 따라서 실패가 일어나는 동안의 `ime list -a` 값을 한 번도 관측하지 못했다**. 이 신호 위에 수정을 세우면 **측정되지 않은 것을 단정**하게 되며, 그것은 ⑩이 이미 경고한 오류다. 결론: **`ime enable`의 권위 있는 준비 판정은 `ime enable` 자신의 성공**이다 → 그래서 M12는 신호 폴링이 아니라 **재시도**를 택한다 | **미측정(명시)** |
| ⑮ | **`ime enable`은 멱등이다 — 그래서 재시도가 안전하다** | 이미 활성화된 IME에 `ime enable`을 다시 실행: **종료 코드 0** + `Input method com.android.adbkeyboard/.AdbIME: already enabled for user #0`. `ime list -s`에 **중복 항목이 생기지 않는다**. 재시도가 기기 상태를 누적 변경하지 않음을 실측으로 확인한 것이며, M12 재시도 계약의 안전 근거다 | **실측(Android)** |
| ⑯ | **`mCurId` 결합항 관측 해소 — 결합항은 판별력이 0이므로 `bound` 단독이 옳다(관측으로 확증)** | ⑩이 남겨 둔 미측정 항목을 실기기에서 관측했다: **미바인딩 창(`mBoundToMethod=false`)에서 `mCurId`는 이미 `com.android.adbkeyboard/.AdbIME`였다.** 즉 `bound && mCurId == ADBKeyBoard` 결합 술어는 **`bound` 단독과 같은 시점에 참이 되며, 판별력이 전혀 없다**(zero discriminating power). 구현이 `bound` 단독을 택한 것은 이제 **논증이 아니라 관측으로 확증된다**. AC-ANDROID-032가 요구한 산출물(관측 기록)이 이 행이다 | **실측(Android)** |

### C.4 실측 메커니즘 사실 (개정 0.4.0) — Chrome 웹 구동 · 2기기 운용

> **출처 ⑰~㉒**: 2026-07-29 Chrome/naver.com 구동 세션 및 2기기(Android 실기기 + iOS 시뮬레이터) 운용 실측. 별도 보고서 파일이 없으므로 **이 표가 그 관측의 1차 기록**이다. 번호는 §C.3에서 **이어진다**(⑯ 다음) — 교차 참조가 전역적으로 유일하도록.
> **기기/호스트**: Galaxy S25 Ultra(SM-S938N), Android 16, 무선 ADB / macOS 호스트(Xcode 설치, iPhone 17 Pro 시뮬레이터 1대 부팅 + offline 시뮬레이터 21대).
>
> §C.3과 같은 이유로 존재한다: **여기 적힌 것을 모르는 사람은 수정을 "단순화"하다가 결함을 그대로 복원한다.** 검증 수준 칸의 **미측정(명시)** · **예방적** 은 빈칸이 아니라 **주장 경계**다.

| # | 관측 사실 | 근거 (관측한 것) | 검증 수준 |
|---|-----------|------------------|-----------|
| ⑰ | **`KEYCODE_ESCAPE`가 Chrome 웹 입력란에서 방금 입력한 텍스트를 지운다** — 삭제의 주체는 ESCAPE 자신이다(전송·IME·포커스가 아니다) | Chrome으로 `m.naver.com` 구동, 3단계 분리 실측: (1) `text "abc" --keep-keyboard` → 검색창에 `abc` 착지, 자동완성 노출. (2) `text "날씨" --keep-keyboard`(전체 cold 경로: install → enable → switch → bind 대기 → broadcast) → 검색창 `abc날씨`. (3) `adb shell input keyevent 111`을 **단독으로**, 다른 어떤 것도 하지 않고 전송 → 검색창이 **플레이스홀더로 되돌아감**. Chrome은 ESCAPE를 페이지로 전달하고, 페이지에서 ESCAPE는 텍스트 입력의 관례적 취소/되돌리기다. 네이티브 `EditText`는 같은 키에서 **키보드만 내린다** — 그래서 지금까지의 모든 검증(전부 Settings 앱)이 통과했다 | **실측(Android, 3단계 분리)** |
| ⑱ | **`KEYCODE_BACK`은 두 표면 모두에서 키보드를 내리면서 텍스트를 보존한다** — 이 자리에서 ESCAPE보다 **엄격히 우월**하다 | **Chrome 웹 입력란**: 입력 텍스트 있음 + `mInputShown=true` → BACK → `mInputShown=false` **그리고 텍스트 생존**(자동완성 계속 표시). **네이티브 EditText(Settings 검색)**: 동일 결과 — 키보드 숨겨지고 텍스트 생존. 즉 BACK은 **네이티브 경로를 퇴행시키지 않으면서** 웹 경로를 고친다. 부수 관측: `mInputShown=<bool>`은 `dumpsys input_method`에 노출되며 **M10 파서(`ime-binding-parser.ts`)가 이미 같은 덤프를 읽는다** — 새 adb 표면이 아니다. **다만 주장 경계**: `mBoundToMethod`가 덤프에 정확히 1회 나타난다는 §C.3-⑥의 확인은 `mInputShown`에 대해 **수행되지 않았다**. 출현 횟수는 **미측정**이며 파서가 이를 확립된 사실로 가정해서는 안 된다 | **실측(Android, 양 표면)** — 마커 출현 횟수는 **미측정(명시)** |
| ⑲ | **주장 경계 — "키보드가 없을 때 BACK을 보내면 화면을 이탈한다"는 관측되지 않았다.** 표시 여부 가드는 **예방적**이지 실측으로 강제된 것이 아니다 | 가드의 근거는 **"소비되지 않은 BACK은 앱의 뒤로가기 동작"이라는 일반 논거**다. 실제로 `mInputShown=false` 상태에서 BACK을 보낸 **단 1회의 시행**(Settings `SearchActivity`)에서 **포그라운드는 바뀌지 않았다** — 예상된 이탈이 **일어나지 않았다**. 표본 1회이므로 "이탈하지 않는다"도 확립된 사실이 아니다; 확립된 것은 **"이탈한다"가 관측되지 않았다**는 사실뿐이다. 가드를 유지하는 것은 값싸고 안전하기 때문이지 측정이 그것을 요구해서가 아니며, 이 반대 관측을 지우고 가드를 실측 강제로 서술하면 §C.3-⑩이 경고한 오류의 재발이다 | **예방적 설계 + 반대 관측 1건(명시)** |
| ⑳ | **미연결 기기가 연결된 기기로 계수된다 — 이 호스트에서 23건 대 2건.** 위반 항목은 **전부 iOS**이므로 이 결함은 Android 문제가 아니다 | 이 Mac에서 `devices`는 **23건**을 반환한다: `connectionState: "device"`가 **2건**(Android 실기기 + 부팅된 iPhone 17 Pro 시뮬레이터), 나머지 **21건은 offline iOS 시뮬레이터**. `simctl`은 Xcode가 설치된 Mac이면 어디서나 이 목록을 낸다 — **사용자가 무엇을 해서 생긴 것이 아니라 환경의 기본값**이고, 개수는 시뮬레이터를 만들수록 늘기만 한다. `resolveTargetDevice`(`src/cli/device-targeting.ts`)는 `connectionState`를 **한 번도 읽지 않고** 원시 목록으로 계수·자동 선택한다. `devices` 자신이 `connectionState`를 정확히 보고하므로(2건이 `"device"`) **정보는 이미 있었고 대상 해석 계층이 쓰지 않았을 뿐이다** | **실측(호스트 macOS + Xcode, 2기기 연결)** |
| ㉑ | **문서화된 자동 선택이 도달 불가다** — 문서와 동작이 모순된다 | README(`Omit it when exactly one device is connected — it is auto-selected.`)와 스킬 문서가 같은 약속을 한다. 그러나 원시 목록 길이로 계수하므로 Xcode가 설치된 Mac에서 길이는 **결코 1이 되지 않고**, 자동 선택 분기는 **한 번도 발동하지 않는다**. 실제로 나오는 오류는 `23 devices connected; specify --device <serial>.` — 봉투는 `ok:false`로 정직하지만 **메시지 본문이 거짓 수를 주장**하고, `details.availableDevices`가 23건을 전부 덤프한다(사용자가 읽어야 하는 오류에 23행을 쏟는 것 자체가 별개의 사용성 문제다) | **실측(호스트)** |
| ㉒ | **명시 지정한 미연결 기기는 대상 해석을 통과한 뒤 한 층 늦게 실패한다** — 유익하지만 틀린 층 | `--device <offline-simulator-serial>` → 대상 해석 **통과** → 백엔드에서 실패: `BACKEND_COMMAND_FAILED` / `idb ui describe-all failed (exit 1): Cannot run accessibility commands against ... as it is not booted`. 대조군: `--device <unknown-serial>` → `DEVICE_NOT_FOUND`로 **올바르게** 거부된다. 즉 "존재하지 않음"은 잡히는데 **"존재하지만 부팅되지 않음"은 잡히지 않는다**. 사용자에게 필요한 정보는 "없다"가 아니라 "있는데 부팅되지 않았다"이며 후자만 조치 가능하다 | **실측(호스트, offline 시뮬레이터 지정)** |

---

## §D. 범위에서 제외 (Exclusions)

본 SPEC(SPEC-01)은 Android/adb 기본기와 환경 부트스트랩만 다룬다. 아래 항목은 **out of scope**이며 후속 SPEC으로 분리한다. 어느 것도 버려지지 않도록 §E 로드맵에 커밋한다.

### Out of Scope — iOS/idb 구현
- iOS 시뮬레이터/실기기 제어(`idb ui describe-all`/`describe-point`/`tap`/`text`)는 구현하지 않는다 → SPEC-02.
- 본 SPEC은 device-backend interface와 공통 스키마가 iOS를 **수용 가능**함만 설계로 검증한다(코드 구현 아님).

### Out of Scope — WebView / 브라우저 DOM 인지
- Android Chrome DevTools Protocol(`adb forward`) 및 iOS `ios_webkit_debug_proxy`를 통한 WebView/DOM 인지는 다루지 않는다 → SPEC-03.

### Out of Scope — 탐색 루프 · 다중 기기 시나리오 오케스트레이션
- 프롬프트 구동 탐색 루프와 다중 기기 상호작용 시나리오 오케스트레이션은 다루지 않는다 → SPEC-04.

### Out of Scope — Codex 래퍼 · 광범위 패키징
- Codex 스킬 래퍼와 확장 패키징은 다루지 않는다(본 SPEC은 얇은 Claude 스킬 래퍼 1개만) → SPEC-05.

### Out of Scope — 구현 세부(HOW)
- 구체 함수명/클래스 구조/내부 API 스키마는 본 SPEC이 규정하지 않는다(Run 단계로 이연). 본 SPEC은 관찰 가능한 동작·계약·데이터 모델만 규정한다.

---

## §E. 로드맵 (후속 SPEC 커밋)

| SPEC | 제목(가칭) | 상태 | 핵심 메모 |
|------|-----------|------|-----------|
| SPEC-02 | iOS(idb) 백엔드 | **커밋(must-do)** | idb는 미유지보수(최종 릴리스 2022-08 v1.1.8), companion+Python+Xcode14 필요 → **idb 버전을 고정(pin)하고 backend interface 뒤로 격리**. |
| SPEC-03 | WebView/DOM 인지 | 커밋 | Android CDP(`adb forward`) / iOS `ios_webkit_debug_proxy`. **한계: webview가 debug-enabled여야 함(black-box)**. |
| SPEC-04 | 탐색 루프 · 다중 기기 시나리오 | 커밋 | 프롬프트 구동 탐색 + 다중 기기 상호작용 테스트 오케스트레이션. |
| SPEC-05 | Codex 래퍼 · 패키징 | 커밋 | Codex 스킬 래퍼 + 배포 확장. |

---

## §F. @MX 태그 대상 (식별)

> 아래는 @MX 태그 대상 목록이다(MoAI MX 프로토콜). Run 단계에서 부착되었고, 개정 0.2.0(실기기 하드닝)에서 추가된 신규 코드 경로의 태그도 반영한다.

| 대상 | 태그 | 근거 |
|------|------|------|
| 정규화 함수 (uiautomator XML → 공통 스키마, `normalize/uiautomator.ts`) | `@MX:ANCHOR` | 불변 계약 + 높은 fan_in(모든 `dump`/인지 경로가 의존). iOS 플러그인 지점. |
| device-backend interface (`schema/device-backend.ts`) | `@MX:ANCHOR` | iOS/idb 대체를 위한 불변 계약(REQ-ARCH-003). |
| adb 백엔드 구현(`backend/adb-backend.ts` — `AdbBackend`) | `@MX:ANCHOR` | Android device-backend interface 참조 구현(REQ-ARCH-003), 모든 device 명령이 의존. |
| 세션 기반 IME 전환 + 자가치유 설치(`AdbBackend.inputText`) | `@MX:WARN` + `@MX:REASON` | 위험 구역: 세션 전환 후 `reset` 전까지 미복원 상태 유지, 복원 실패 시 기기 입력 상태 손상(REQ-INPUT-003/004 개정). |
| 디스크 영속 IME 세션 저장소(`backend/ime-session-store.ts`) | `@MX:NOTE` | 프로세스 간 IME 세션 영속(REQ-INPUT-004 개정). read-modify-write 비원자성(동시 다른-serial 쓰기 경합) 한계 문서화. |
| 런타임 APK 다운로드(`backend/apk-downloader.ts`) | `@MX:WARN` + `@MX:REASON` | 유일한 런타임 네트워크 페치 경로: 고정 참조에서 GPL-2.0 APK 다운로드→매직바이트 검증→`adb install`(REQ-DOCTOR-003 개정). |
| 요소 셀렉터 매칭(`normalize/element-query.ts`) | `@MX:NOTE` | `id`+`text` 동시 지정 시 AND 의미(더 좁은 매칭) — 신규 역량(REQ-SELECT). |
| IME 바인딩 준비 대기(`AdbBackend.inputText` 전송 직전 — 개정 0.3.0) | `@MX:WARN` + `@MX:REASON` | 위험 구역: 이 대기를 제거하거나 술어를 느슨하게 하면 `ok:true`-무효과 결함이 그대로 복원된다(§C.3-⑤/⑧). 대기 상한은 **설계 선택이지 실측값이 아니다**(§C.3-⑦, `MAX_DURATION_MS` 선례). 준비 술어가 `bound` 단독인 것은 §C.3-⑯ 관측으로 확증됐다 — `mCurId` 결합항은 판별력이 0이다. |
| `ime enable` 등록 경쟁 재시도(자가치유 설치 직후 — 개정 0.3.0 M12) | `@MX:WARN` + `@MX:REASON` | 위험 구역: 재시도 조건을 **실패 형태에 한정하지 않고 넓히면** 모든 `ime enable` 실패를 삼키는 루프가 되어, 실제 결함이 상한만큼 지연된 뒤 같은 오류로 나오면서 원인만 흐려진다(§C.3-⑫). 재시도가 안전한 근거는 **실측된 멱등성**(§C.3-⑮)이며, 상한·백오프는 **설계 선택이지 실측값이 아니다**. 준비 신호 폴링(`ime list -a`)으로 "개선"하지 말 것 — 그 신호는 실패 창에서 **관측된 적이 없다**(§C.3-⑭). |
| 런처 컴포넌트 조회 후 명시적 시작(`AdbBackend.launchApp` — 개정 0.3.0) | `@MX:WARN` + `@MX:REASON` | 위험 구역: 암시적 인텐트(`-p`)로 "단순화"하면 DEFAULT 미선언 앱이 다시 열리지 않는다(§C.3-①). 조회 실패 판정을 종료 코드로 바꾸면 실패가 성공으로 오판된다(§C.3-②). |
| 소프트키보드 숨김(`AdbBackend`의 `hideKeyboard` — 개정 0.4.0) | `@MX:WARN` + `@MX:REASON` | 위험 구역: `KEYCODE_BACK`을 `KEYCODE_ESCAPE`로 되돌리면 **Chrome 웹 입력란에서 방금 입력한 텍스트가 지워지는 무음 결함이 그대로 복원된다**(§C.4-⑰). 네이티브 `EditText`에서는 ESCAPE도 정상 동작하므로 **Settings 앱에서만 검증하면 회귀를 영원히 놓친다**(§C.4-⑱). 표시 여부 가드는 **예방적이며 실측 강제가 아니다** — 근거를 실측으로 서술하지 말 것(§C.4-⑲). 숨김은 best-effort이며 실패가 `text`를 실패시키지 않는다. |
| 대상 기기 해석 + "연결" 정의(`cli/device-targeting.ts` — 개정 0.4.0) | `@MX:ANCHOR` + `@MX:REASON` | 불변 계약 + 높은 fan_in(모든 기기 대상 명령이 경유) + **플랫폼 중립**(Android/iOS 두 백엔드를 함께 서비스). 연결 정의(`connectionState === "device"`)를 되돌리거나 계수에서 빼면 Xcode 설치 Mac 전체에서 **문서화된 자동 선택이 다시 도달 불가**가 되고 오류 메시지가 거짓 수를 주장한다(§C.4-⑳/㉑). Android 이름의 SPEC에 있다는 이유로 Android 경로로 좁히지 말 것 — 실측 위반 항목은 전부 iOS였다. |
| 다중 기기 serial 격리 / 임시 리소스 네임스페이스 | `@MX:WARN` + `@MX:REASON` | 동시 실행 경합(concurrency) 위험(REQ-MULTIDEV-003/004). |
| `doctor` 자동 설치(호스트/기기 환경 변경, `backend/doctor.ts`) | `@MX:WARN` + `@MX:REASON` | 호스트·기기 환경을 변경하는 부작용(`brew install`/APK 설치/uninstall). |
| 기기 의존 경로(스크린샷 유효성, 탭/텍스트 효과 등 e2e 미검증) | `@MX:TODO` | 단위 테스트 불가, e2e/수동 검증까지 미완. |
| exec-out 스트리밍(기기 파일 무잔류) | `@MX:NOTE` | 리소스 위생 의도 문서화(REQ-IDEMP-003). |

---

## §G. 교차 참조

- 구현 계획·마일스톤·iOS 필드 매핑 표: `plan.md`
- 인수 기준(Given-When-Then)·엣지 케이스·DoD: `acceptance.md`
- 진행 상태·감사 신호: `progress.md`
- 개정 0.3.0 실측 근거 전문: `.moai/reports/android-verification/remaining-commands-android-2026-07-29.md`
- 개정 0.4.0 실측 근거: **별도 보고서 없음** — §C.4 표가 1차 기록이다(Chrome/naver.com 구동 세션 + 2기기 운용, 2026-07-29).
