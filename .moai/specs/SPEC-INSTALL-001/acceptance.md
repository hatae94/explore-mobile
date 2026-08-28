# SPEC-INSTALL-001 — acceptance.md

인수 기준. 각 AC는 **판정 수단**을 명시하며, 그 수단이 실제로 결함을 잡을 수 있는지를 함께 기록한다.

## 판정 수단 등급

| 등급 | 의미 |
|---|---|
| **G**(grep/정적) | 텍스트·타입 검사로 기계 판정. 존재/부재 판정에 유효 |
| **U**(단위 테스트) | mock 기반. **외부 프로세스(`aapt`, `adb`)의 실제 동작은 판정 불가** |
| **D**(실기기) | 실제 기기에서 관측. 외부 경계 너머의 유일한 판정 수단 |

**mock 한계 원칙**: `aapt`가 실제로 무엇을 출력하는지, `adb install`이 실패를 어떻게 알리는지는 U로 닫을 수 없다. U가 통과해도 D가 실패할 수 있으며 그 반대는 성립하지 않는다. **U만으로 통과 처리된 AC는 없다** — 외부 경계를 건드리는 모든 REQ는 D 항목을 하나 이상 갖는다.

**기기 오염 원칙**: D 등급 판정 중 알림 배너·시스템 팝업이 관측되면 그 회차는 **무효**로 기록하고 재실행한다. 무효 회차도 progress.md에 남긴다.

**양성 대조 원칙**(spec.md §C.5): 부재를 주장하는 판정은 같은 회차에 **존재가 확인되는 대조군**을 함께 조회한다. 대조군이 비면 그 회차는 성공도 실패도 아닌 **무효**다.

**실측 우선 원칙**(spec.md §C.4): 실패 분류의 판정 근거는 M5 실측으로 확정한다. 실측이 이 문서의 기대값과 다르면 **실측이 이기고**, 이 문서를 고친다.

---

## REQ-INSTALL-001 — `install` 명령

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-001** | 알 수 없는 명령의 `UNKNOWN_COMMAND` 메시지가 나열하는 지원 명령 목록에 `install`이 포함된다 | **D**/**G** `node dist/cli/bin.js --help` 출력에 `install` 포함. baseline: 2026-08-29 기준 13개 미포함 |
| **AC-INSTALL-002** | 성공 응답이 `{ok:true, command:"install", data:{…}}` 형태이며 `serial`/`package`/`versionCode`/`versionName`/`mode` 5필드를 모두 싣는다 | **D** 실기기 + **U** 필드 존재 |
| **AC-INSTALL-003** | 실패 응답이 `{ok:false, command:"install", error:{code,message,details}}` 형태다 | **U** |
| **AC-INSTALL-004** | 인자 없이 호출하면 `INVALID_ARGS`로 실패하고 **기기에 어떤 명령도 보내지 않는다** | **U** 기기 executor mock이 **한 번도 호출되지 않음**을 확인. *이 AC는 조기 실행을 잡는 음성 대조다* |
| **AC-INSTALL-005** | 기기 2대 이상 연결 + `--device` 생략 시 `AMBIGUOUS_DEVICE`로 실패한다 | **U** 다른 명령과 동일 규칙 |

---

## REQ-INSTALL-002 — APK 메타데이터 추출

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-006** | 실제 APK에서 패키지 이름을 추출한다 | **D** `build-1782196453010.apk` → `com.hatae.moyura` (2026-08-29 실측값. **관측이 다르면 실측이 우선**) |
| **AC-INSTALL-007** | 같은 APK에서 `versionCode`/`versionName`을 추출한다 | **D** 기대: `versionCode=1`, `versionName=1.0.0` (2026-08-29 실측) |
| **AC-INSTALL-008** | 존재하지 않는 경로는 `APK_NOT_FOUND`로 실패하며 **기기에 명령을 보내지 않는다** | **U** 기기 executor mock 미호출 확인 |
| **AC-INSTALL-009** | APK가 아닌 파일(예: 텍스트 파일)은 `APK_INVALID`로 실패하며 **기기에 명령을 보내지 않는다** | **D** 실제 aapt에 비-APK 입력. *U로는 aapt의 실제 거부 동작을 확인할 수 없다* |
| **AC-INSTALL-010** | 추출 결과가 요청 인자에서 역산된 값이 아니다 | **U** 파일명과 **다른** 패키지 이름을 내는 aapt mock을 주고, 응답이 mock 출력을 따르는지 확인. *이 AC는 파일명 파싱 구현을 잡는 음성 대조다* |

---

## REQ-INSTALL-003 — aapt 경로 해결

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-011** | `PATH`에 aapt2가 없어도 해결에 성공한다 | **D** 이 호스트가 정확히 그 상태다 — `which aapt2` → not found, 그럼에도 `install`이 동작 |
| **AC-INSTALL-012** | 탐색 순서가 `PATH` → `$ANDROID_HOME` → `$ANDROID_SDK_ROOT` → macOS 기본 위치다 | **U** 주입 predicate로 각 후보만 존재하는 4가지 상태를 각각 확인 |
| **AC-INSTALL-013** | build-tools 버전이 여럿이면 **숫자 성분 비교로 최고 버전**을 고른다 | **U** `["9.0.0","35.0.0","36.0.0","36.1.0"]` → `36.1.0`. *문자열 비교 구현이면 `9.0.0`을 골라 실패한다 — 이 AC는 그 오답을 잡는 음성 대조다* |
| **AC-INSTALL-014** | 후보가 하나도 없으면 `AAPT_NOT_FOUND`로 실패하고, 메시지가 **찾아본 위치를 나열한다** | **U** 모두 부재인 predicate + 메시지에 후보 경로 포함 확인 |
| **AC-INSTALL-015** | build-tools 디렉터리가 비어 있는 경우(SDK는 있으나 build-tools 없음)도 `AAPT_NOT_FOUND`로 실패한다 | **U** spec.md §E 미검증 5번을 닫는다 |
| **AC-INSTALL-016** | `doctor` 출력이 실행 경로와 **같은** aapt 해결 결과를 보고한다 | **D** 같은 호스트에서 `doctor`의 `resolvedPath`와 실제 사용 경로 대조. *두 경로가 갈라지는 상태를 잡는다* |

---

## REQ-INSTALL-004 — 설치 및 덮어쓰기

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-017** | 미설치 상태에서 설치가 성공하고 `mode`가 `"fresh"`다 | **D** 실기기 |
| **AC-INSTALL-018** | 설치 직후 그 패키지가 기기에 존재한다 | **D** 실기기 + **양성 대조 필수**: 같은 회차에 **이미 설치된 것이 확실한 다른 패키지**를 같은 방식으로 조회해 비어 있지 않음을 확인한다. 대조군이 비면 회차 **무효**(spec.md §C.5) |
| **AC-INSTALL-019** | 같은 패키지의 더 높은 `versionCode` APK 설치가 성공하고 `mode`가 `"upgrade"`다 | **D** 실기기. spec.md §E 미검증 1번을 닫는다 |
| **AC-INSTALL-020** | 덮어쓰기 후에도 앱 데이터가 유지된다 | **D** 실기기. 앱에 상태를 남긴 뒤 덮어쓰고 상태 잔존을 화면으로 확인 |
| **AC-INSTALL-021** | 설치 성공 판정이 후속 `launch` 결과에 의존하지 않는다 | **G** `src/cli/commands/install.ts`에 `launch`/`resolve-activity` 호출이 없음. *spec.md §C.2의 회귀 방지선* |

---

## REQ-INSTALL-005 — 실패 원인 구분

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-022** | 다른 서명 키의 APK로 덮어쓰면 `INSTALL_SIGNATURE_MISMATCH`로 실패한다 | **D** 실기기. 같은 패키지명·다른 키로 서명한 APK를 준비해 실행. **판정 근거(종료 코드/stdout/stderr, 문구)는 이 회차의 실측으로 확정하고 기록한다**(spec.md §C.4) |
| **AC-INSTALL-023** | 더 낮은 `versionCode` APK로 덮어쓰면 `INSTALL_VERSION_DOWNGRADE`로 실패한다 | **D** 실기기. 동일하게 판정 근거를 실측으로 확정·기록 |
| **AC-INSTALL-024** | 분류되지 않은 실패는 `INSTALL_FAILED`이며, **원인 문구가 메시지에 보존된다** | **D** 실기기 + **U** 임의 실패 문구를 내는 mock → 그 문구가 메시지에 등장 |
| **AC-INSTALL-025** | 실패 분류가 **종료 코드 단독**에 의존하지 않는다 | **U** 종료 코드 0 + 실패 문구를 내는 mock에서 실패로 판정됨. *spec.md §C.2 함정 ①(실패해도 exit 0)의 회귀 방지선* |
| **AC-INSTALL-026** | 어떤 실패 경로에서도 성공 응답(`ok:true`)이 반환되지 않는다 | **U** 실패 mock 전 종류에 대해 `ok===false` |
| **AC-INSTALL-027** | 실패 시 `INSTALL_FAILED` 메시지가 원인을 하나로 단정하지 않는다(분류 불가일 때) | **G**/**U** 메시지에 단정 표현 대신 관측된 문구가 실림. *`launch.ts:29-34`가 세운 규범의 계승* |
| **AC-INSTALL-036** | `INSTALL_INSUFFICIENT_STORAGE`는 **판정하지 않는다(미판정)** | **판정 수단 없음.** 아래 사유 참조 |

### AC-INSTALL-036 — 미판정 선언 (INSTALL_INSUFFICIENT_STORAGE)

이 코드는 spec.md REQ-INSTALL-005에 정의되어 있으나 **판정 수단을 세울 수 없다.**

- **D로 불가**: 저장 공간 부족을 재현하려면 테스트 기기를 의도적으로 가득 채워야 한다. 되돌리기 어렵고, 같은 기기에서 실행되는 다른 D 등급 AC를 오염시킨다.
- **U로 불가**: 실패 문구를 흉내내는 mock은 **분류 코드가 그 문구에 반응하는지**만 확인할 뿐, 실제 기기가 그 문구를 낸다는 것을 증명하지 못한다(mock 한계 원칙). 그런 U는 통과해도 아무것도 보장하지 않는 **자기충족 테스트**다.

따라서 다음을 규칙으로 둔다:

> `INSTALL_INSUFFICIENT_STORAGE`는 **M5 실측에서 해당 문구가 우연히 관측되기 전까지 발행되지 않는다.** 그때까지 저장 공간 관련 실패는 `INSTALL_FAILED`로 분류되며 원인 문구가 보존된다(AC-INSTALL-024). 관측되면 그 회차의 전문을 근거로 분류를 추가하고 이 AC를 실판정으로 승격한다.

**이 AC를 통과로 기록하는 것은 금지한다.** 미판정은 통과가 아니다. 판정 수단을 세울 수 없을 때는 세운 척하지 않고 없다고 적는다.

---

## REQ-INSTALL-006 — 문서 동기화

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-028** | `SKILL.md` 명령 표에 `install` 행이 있다 | **G** `grep -n 'install' .claude/skills/explore-mobile/SKILL.md` |
| **AC-INSTALL-029** | `SKILL.md` 에러 코드 표에 신규 코드 7개가 모두 있다 | **G** 7개 코드 각각 1건 이상 |
| **AC-INSTALL-030** | `SKILL.md`에 남은 "13개 명령" 취지의 낡은 서술이 없다 | **G** 명령 수를 세는 명령으로 확인하며, 손으로 센 수를 적지 않는다 |
| **AC-INSTALL-031** | 러너가 이 저장소 밖에서 호출할 때의 실행 형식이 기술되어 있다 | **G** `SKILL.md`에 해당 절 존재 |

---

## 전역 회귀 방지

| AC | 기준 | 판정 |
|---|---|---|
| **AC-INSTALL-032** | 기존 13개 명령의 동작이 바뀌지 않는다 | **U** 전체 테스트 스위트 통과 (`pnpm test`) |
| **AC-INSTALL-033** | 타입 검사가 통과한다 | **U** `pnpm typecheck` |
| **AC-INSTALL-034** | 새 외부 프로세스 실행이 기존 `process-executor.ts`를 재사용한다(새 실행 경로를 만들지 않는다) | **G** `src/backend/` 신규 파일에 `spawn`/`exec` 직접 호출 없음. *셸 주입 방어선이 한 곳에 유지되는지 확인* |
| **AC-INSTALL-035** | 스킬의 "adb 직접 호출 금지" 제약이 유지된다 — 러너·스킬이 우회하지 않는다 | **G** `.claude/skills/` 아래에 `adb ` 직접 호출 없음 |

---

## D 등급 실행 전제

**AC-INSTALL-006/009/011/016~024는 실기기 없이 실행할 수 없다.**

2026-08-29 실측: 연결된 Android 기기 `R3CM50FXC3L`의 `connectionState`가 `"unauthorized"`다. 이 상태에서는 D 등급 AC를 **하나도** 실행할 수 없다. 해소(기기 화면에서 USB 디버깅 허용 수락)는 사람이 수행해야 하며, **해소 전에 D 항목을 통과로 기록하는 것은 금지한다** — 미실행은 통과가 아니다.
