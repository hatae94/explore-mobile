---
id: SPEC-READY-001
title: "기기·환경 가용성 보고의 정확성 — 구현 계획"
version: "0.6.0"
status: completed
created: 2026-08-04
updated: 2026-08-05
author: hatae
---

# 구현 계획 — SPEC-READY-001

> **0.1.0 초안은 "이 계획에 미확정 결정은 없다"고 선언했으나 그것은 사실이 아니었다.** 1차 계획 감사(FAIL 0.66)가 두 개의 빈 결정을 코드로 찾아냈다 — `ro.serialno`를 **누가·어디서** 조회하는가, `unavailableReason`을 **무엇으로** 채우는가. 피하려던 실수(SPEC-IMESTATE-001이 §B.1에 설계 미확정을 남긴 채 착수해 결국 기능을 범위에서 제외한 일)를 같은 자리에서 반복할 뻔했다.
>
> 0.2.0은 그 둘을 §B.3·§B.4에서 확정하고, 그룹핑이 만드는 `--device` 회귀를 요구사항(REQ-READY-006)으로 끌어올렸다. **선언 대신 근거를 적는다** — 각 결정마다 왜 다른 선택지를 기각했는지를 코드 위치와 함께 남긴다. §B.5는 자기 선언이 아니라 자기 점검 목록이다.

---

## §A. 영향 파일

### A.1 변경 대상

| 파일 | 성격 | 마일스톤 |
|---|---|---|
| `src/backend/adb-executor.ts` | `adb` 경로 해석 추가(`:33`의 리터럴 고정을 푼다) | M1 |
| `src/backend/doctor.ts` | `adb` 보고 모양 확장. 손대는 지점은 `:89-98`의 `checkAdbInstalled()` 전체 — 실패 경로가 `:92`(종료 코드)와 `:95-97`(catch) **둘**이고, PATH 부재는 후자로 떨어진다(`spec.md` §C.1-①) | M1 |
| `src/schema/device-backend.ts` | `DeviceConnectionState` 확장(`:33`) + `DeviceInfo`에 필드 2개 추가(`:118-131`) | M2·M3 |
| `src/backend/wda-device-list.ts` | **M2**: `mapConnectionState` 3분기 확장(`:64-66`) + `unavailableReason` 파생. **M3**: 같은 `:90-99` 리터럴에 `alternateSerials`를 추가한다 — iOS는 합칠 대상이 없어 **항상 빈 배열**이지만, 키 집합 고정을 위해 필드는 항상 존재해야 하므로(§B.3) 생략할 수 없다 | M2·M3 |
| `src/backend/adb-backend.ts` | **세 가지**: ① `:311-320`의 `DeviceInfo` 리터럴에 신규 필드 2개 반영(안 하면 타입 검사가 깨진다) ② 전송별 `ro.serialno` 조회 ③ 물리 기기 단위 그룹핑(§B.4) | M2·M3 |
| `src/cli/device-targeting.ts` | `:139`의 대상 조회가 부속 전송 시리얼도 대상으로 삼도록 확장 — REQ-READY-006(그룹핑 회귀 차단) | M3 |
| `src/cli/commands/devices.ts` | `:14`의 `--device` 필터를 부속 시리얼까지 확장 — 이 명령은 `resolveTargetDevice()`를 **거치지 않고** 자체 `all.filter((d) => d.serial === args.device)`를 한다. §B.6을 고쳐도 여기는 그대로이므로 REQ-READY-006의 회귀가 이 경로에 남는다 | M3 |
| **`AdbInstalledCheck` 반환을 고정하는 테스트 3개** — `backend/doctor.test.ts:33,42`(`toEqual({installed, version})`) · `cli/enumeration.test.ts:126`(`mockResolvedValue({installed, version})`) · `cli/router.test.ts:1155,1189`(`vi.spyOn(...).mockResolvedValue({installed, version})`) | §B.2가 `onPath` · `resolvedPath`를 더하므로 `toEqual` 2곳은 **실행 중**, `mockResolvedValue` 3곳은 **타입 검사**에서 깨진다. §B.2의 "기존 필드를 제거하지 않으므로 소비자는 깨지지 않는다"는 **생산 소비자에만** 해당한다 | M1 |
| **`installed`의 *뜻*에 기대는 단언 + 그 픽스처** — `cli/router.test.ts:657`(`expect(data.adb.installed).toBe(false)`) 및 그것을 만드는 `makeDoctor`(`:632`, 생성자 4인자만 넘긴다) | **필드를 더하는 것만으로는 초록이 되지 않는다.** §B.1 구현 후 `installed`의 뜻이 "어디서든 실행 가능한 `adb`를 찾음"으로 바뀌는데, 이 픽스처는 `adbExec`만 가짜로 바꾸고 파일시스템 술어를 주입하지 않는다. 실측: 이 호스트는 `which adb` 실패 + `$ANDROID_HOME/platform-tools/adb` 실행 가능 — 정확히 §B.1이 찾도록 요구하는 배치이므로 `installed`가 `true`가 되어 단언이 뒤집힌다. **`makeDoctor`에 술어를 주입해 "정말 아무 데도 없음"을 만들어야 한다**(§B.1의 이음매가 여기 쓰인다) | M1 |
| **충돌 분기 오류 문구를 정확 비교하는 단언 2곳** — `cli/device-targeting.test.ts:238`(`expect(result.message).toBe("No backend owns device serial 'COLLIDING'.")`) · `:251`(같은 형태, `'A'`) | §B.6.2가 이 **문구를 고치라고** 하므로 두 단언이 **실행 중** 깨진다. 코드(`BACKEND_COMMAND_FAILED`)는 유지하므로 코드 단언은 무사하다 | M3 |
| `src/schema/device-backend.test.ts` | `:31-42`의 키 집합 계약 테스트를 6키 → 8키로 갱신. `Record<keyof DeviceInfo, true>`와 `toHaveLength(6)` **양쪽**이 깨지므로 둘 다 고친다 | M2·M3 |
| **`DeviceInfo` 리터럴을 만들거나 정확 비교하는 테스트 8개** — `registry.test.ts` · `device-targeting.test.ts` · `router.test.ts` · `enumeration.test.ts` · `commands/swipe.test.ts` · `commands/scroll.test.ts` · `adb-backend.test.ts` · `wda-device-list.test.ts` | 필드 2개 반영. 앞의 여섯은 **타입 검사**에서 깨지고(6필드 리터럴을 반환형 `DeviceInfo`로 돌려주는 팩토리 — `Partial<DeviceInfo>` 스프레드는 필수 필드를 못 채운다), 뒤의 둘은 **실행 중** 깨진다(`toEqual` 정확 비교) | M2·M3 |
| `.claude/skills/explore-mobile/SKILL.md` | 계약 서술 동기화 — `:115-121`의 `devices` JSON 예시 포함(6키가 하드코딩돼 있다) | M2·M3 |

> **`devices.ts`가 왜 여기 있어야 하는가** (3차 감사 P0): 생산 코드에서 시리얼 동등 조회를 하는 지점은 네 곳이고, 그중 셋은 계획서가 이미 다룬다 — `registry.ts:114`(§A.3, 의도적 미확장) · `device-targeting.ts:139`(§B.6이 넓힘) · `doctor.ts:60`(이미 해석된 `target.serial`을 쓰므로 안전). **`devices.ts:14` 하나만 빠져 있었다.** 그리고 이 경로가 사용자가 가장 먼저 밟는 경로다: 목록을 보고 시리얼을 얻은 뒤 그 시리얼을 다시 쓰는데, 목록 명령이 **방금 자기가 보여 준 부속 시리얼을 거부한다.** `SKILL.md:104`가 *"Every device-facing command accepts `--device <serial>`"*라고 약속한 계약이기도 하다.
>
> **테스트 8개가 왜 여기 있어야 하는가** (3차 감사 P1): `device-backend.test.ts`가 이미 이 표에 있으므로 **테스트 파일은 이 표의 대상**이다. 하나만 넣고 여덟을 뺀 것은 의도적 배제가 아니라 누락이었다.

#### A.1.1 고정 지점을 세는 규칙 (4차 감사 Q1·Q5)

**규칙**: 이 SPEC이 **모양 · 문구 · 의미를 바꾸는 모든 것**의 고정 지점을 센다 — 생산 코드와 테스트 **양쪽**. 세는 대상은 `DeviceInfo` 하나가 아니다.

**"의미"가 세 번째 축이다** (5차 감사 Q6). 0.5.0의 규칙은 "모양이나 문구"까지였고, 그래서 **값의 뜻이 바뀌는 경우**를 못 봤다. 모양이 그대로여도 뜻이 바뀌면 그 뜻에 기대던 단언이 깨진다 — 아래 표 4행이 그 사례다.

| 바뀌는 것 | 어떻게 | 어디서 정하는가 | 마일스톤 |
|---|---|---|---|
| `DeviceInfo` | 모양 (필드 2개 추가) | §B.3 · §B.4 | M2·M3 |
| `AdbInstalledCheck` | 모양 (필드 2개 추가) | §B.2 | M1 |
| 충돌 분기의 오류 메시지 | 문구 | §B.6.2 | M3 |
| **`installed` 값의 뜻** | **의미** — "PATH에서 `adb version` 성공"에서 "**어디서든 실행 가능한 `adb`를 찾음**"으로 | §B.1 · §B.2 | M1 |

**모든 회차가 이 축에서 첫 결함을 냈다** — 1차 D1(Android 리터럴) → 2차 N1(iOS 리터럴) → 3차 P1(테스트 8개) → 4차 Q5(`AdbInstalledCheck`) → 5차 Q6(`installed`의 뜻). 앞의 넷은 **처방을 그 회차의 대상 이름으로 써서** 재발했고, 다섯 번째는 **규칙의 어휘가 한 칸 좁아서**("모양·문구"에 "의미"가 없었다) 재발했다. 그래서 규칙을 대상 이름이 아니라 **"바꾸는 것 전부"**로 쓰고, 축도 셋으로 넓혔다.

**이 목록에 개수를 쓰지 않는 이유도 같다** — 다음 회차가 생기면 곧바로 낡는다. 실제로 0.5.1은 "1차~4차"라고 적었다가 5차가 나오자마자 틀렸다.

**착수 전 탐침** — 아래 중 **어느 하나도 단독으로 완전하지 않다.** 각각의 맹점을 함께 적는다(4차 감사 Q1: 0.3.0의 단일 명령은 기대와 실제 출력이 어긋났고, 총계가 우연히 같아 그 차이가 가려졌다):

```bash
# ① 이름 탐침 — 타입 이름을 import하거나 언급하는 파일
#    맹점: 리터럴만 쓰고 이름을 안 쓰는 파일을 놓친다(adb-backend.test.ts).
#          주석 한 줄에도 걸린다(command-payloads.test.ts).
grep -rln "DeviceInfo" src/ | grep '\.test\.ts$' | sort

# ② 리터럴 탐침 — DeviceInfo 리터럴은 반드시 platform을 갖는다
#    맹점: keyof 기반 계약(device-backend.test.ts)과 platform을 변수로 넘기는
#          팩토리(device-targeting.test.ts)를 놓친다.
grep -rln 'platform: "android"\|platform: "ios"' src/ | grep '\.test\.ts$' | sort

# ③ AdbInstalledCheck 탐침 — installed와 version을 함께 고정하는 지점
grep -rn 'installed:.*version:\|version:.*installed:' src/ --include='*.test.ts'

# ④ 문구 탐침 — 이 SPEC이 고치라고 한 오류 문구를 정확 비교하는 단언
#    모양뿐 아니라 "문구"도 이 SPEC이 바꾸는 것이다(§B.6.2).
grep -rn "No backend owns device serial" src/ --include='*.test.ts'

# ⑤ 의미 탐침 — installed의 "뜻"에 기대는 단언
#    맹점 없음이 아니라 축이 다르다: ①~④는 모양·문구를 보므로 이것을 못 본다.
#    :657처럼 version:이 없는 줄은 탐침 ③에도 안 걸린다.
grep -rn "adb\.installed\|installed).toBe\|checkAdbInstalled" src/ --include='*.test.ts'
```

> **규칙이 실제로 작동한 사례**: 위 ④는 0.5.0에서 규칙을 "모양 **이나 문구**를 바꾸는 것 전부"로 넓힌 직후 그 규칙을 따라가서 찾은 것이다 — `device-targeting.test.ts:238`·`:251`이 §B.6.2가 고치라고 한 문구를 정확 비교하고 있었고, 4차까지 어느 회차도 이 파일 본문을 열지 않았다. 대상을 타입 이름으로 좁게 잡았다면 ④는 애초에 떠오르지 않는다.

**확정 열거는 도구가 한다.** 위 탐침들은 착수 전 근사치일 뿐이며, 이 SPEC이 바꾸는 것이 늘면 탐침도 는다(개수를 세지 않는 이유다 — 0.5.0은 탐침 셋을 적고 "위 셋"이라 썼는데 0.5.1에서 ④가 붙자 곧바로 낡았다). 필드를 실제로 추가한 뒤 `pnpm typecheck`와 `pnpm test`를 돌리면 **깨지는 파일명을 도구가 그대로 뱉는다** — 그것이 유일하게 완전한 목록이며, §E가 마일스톤마다 둘 다 실행하므로 늦어도 그 시점에 전건 드러난다. 문서의 목록은 "착수 전에 규모를 알기 위한 것"이지 "완전하다고 주장하는 것"이 아니다.

> **왜 `adb-backend.ts`가 이 표에 있어야 하는가** (1차 감사 D1이 지적한 누락): 세 가지가 동시에 걸린다. ① `:311-320`이 `DeviceInfo` 객체 리터럴을 만들므로 §B.3·§B.4가 추가하는 **항상 존재하는** 필드 2개를 반영하지 않으면 타입 검사가 깨진다 — 수정이 불가피하다. ② `unauthorized` 상태값을 만드는 곳은 오직 여기다(`:315`) — AC-READY-009·016이 이 상태를 검사 대상으로 지목하므로 이 파일 없이는 판정이 불가능하다. ③ `ro.serialno`를 얻는 `adb -s <serial> shell getprop` 실행 능력(`this.exec`)을 가진 것도 여기뿐이다(§B.4).

### A.2 PRESERVE (이 SPEC이 건드리지 않는다)

| 파일 | 이유 |
|---|---|
| `src/backend/ime-session-store.ts` | SPEC-IMESTATE-001 소관. 이 SPEC은 키 **설계**를 바꾸지 않는다(`spec.md` §D.2) |
| `src/cli/commands/*.ts` (**생산 파일만**) | 명령 동작이 아니라 보고만 바꾼다. **예외 둘** — ① `devices.ts`는 §A.1로 승격(REQ-READY-006, 3차 감사 P0) ② 이 글롭은 생산 파일을 뜻하며 같은 디렉터리의 `*.test.ts`(`swipe.test.ts` · `scroll.test.ts`)는 §A.1 소관이다(3차 감사 P1) |
| `src/backend/apk-downloader.ts` | 설치 정책 무변경(`spec.md` §D.2) |

### A.3 확인만 하고 수정하지 않는 파일

`src/backend/registry.ts` — 그룹핑이 `AdbBackend` 안에서 끝나므로(§B.4) 이 파일은 **무변경**이다. 확인할 것이 둘 있다.

1. `listAllDevices()`가 한 명령 안에서 기기가 열거되는 **유일한 지점**이라는 REQ-VISION-005 불변이 유지되는가(`registry.ts:53-56` 주석 + `cli/enumeration.test.ts`가 호출 횟수를 센다). 그룹핑을 백엔드 안으로 넣는 선택이 이 불변을 건드리지 않음을 **읽어서 확인**한다.
2. **`resolveBackend()`(`registry.ts:112-123`)도 시리얼 동등 조회를 한다** — `devices.filter((d) => d.serial === serial)`. §B.6이 `device-targeting.ts` 쪽만 넓히므로 **두 조회 경로의 동작이 갈린다**(2차 감사 N5). 지금은 회귀가 아니다: 이 메서드에 **생산 호출자가 없음**을 확인했다. 개수를 여기 박지 않고 세는 명령을 남긴다 — 0.3.0은 "주석 2건"이라 적었으나 실제로는 3건이었다(3차 감사 P4, §C 행 1과 같은 규율):

```bash
# 기대: 정의 1건 + 주석 몇 건. 실제 호출(`.resolveBackend(`)은 0건이어야 한다
grep -rn "resolveBackend" src/ | grep -v '\.test\.ts'
grep -rn "\.resolveBackend(" src/ | grep -v '\.test\.ts' | wc -l   # 기대: 0
```

따라서 **의도적으로 넓히지 않고**, 비대칭이 존재한다는 사실만 기록한다. 나중에 이 메서드를 쓰는 코드가 생기면 그때 같은 확장을 적용해야 한다 — 그 사실을 모른 채 쓰면 부속 시리얼로만 `DEVICE_NOT_FOUND`가 나는 경로가 부활한다.

> 0.1.0에서 이 자리에 있던 `src/cli/device-targeting.ts`는 §A.1(변경 대상)로 **승격**되었다. 1차 감사 D3이 지적한 대로, 0.1.0은 이 파일의 영향을 auto-select와 `AMBIGUOUS_DEVICE`에 한정해 보았으나 `--device` 조회 경로(`:139`)가 빠져 있었고, 그곳이 실제 회귀 지점이다(REQ-READY-006).

---

## §B. 확정된 설계 결정

### B.1 `adb` 경로 해석 (M1)

탐색 순서는 `spec.md` REQ-READY-001의 4단계를 그대로 따른다. 추가 확정:

- **해석은 1회 수행하고 결과를 재사용한다** — 명령마다 파일시스템을 훑지 않는다.
- **해석의 주인은 `adb-executor.ts`다** (4차 감사 Q4). 0.3.0은 §A.1에서 `adb-executor.ts`를, §B.1에서 `AdbDoctor` 생성자를 가리켜 **주체가 갈렸다.** 확정한다:
  - `adb-executor.ts`가 `resolveAdbPath()`를 갖는다 — 메모이즈된 1회 해석. 같은 파일의 `spawnAdb`(`:33`)가 그 결과를 써서 실제 명령을 실행한다. **실행 경로가 해석의 1차 소비자**다.
  - `AdbDoctor`는 같은 함수를 불러 **보고**한다(`installed` · `onPath` · `resolvedPath`). 자기 해석을 따로 하지 않는다 — 두 벌이 생기면 보고와 실행이 다른 `adb`를 가리킬 수 있고, 그것이 이 SPEC이 닫는 결함과 같은 계열이다.
  - 따라서 "1회"는 **프로세스 안에서 1회**이고, 보고 경로와 실행 경로가 그 하나를 공유한다.
- **넷 다 실패했을 때만** "찾지 못함"이다.
- 탐색은 **존재+실행 가능** 여부로 판정한다. 존재하지만 실행되지 않는 경우(권한 없음 등)는 "찾지 못함"과 구별해 사유에 남긴다.
- **판정 술어는 주입 가능하게 분리한다** (3차 감사 P2). 후보 경로의 존재·실행 가능 판정을 술어 하나로 뽑고, `resolveAdbPath()`가 그것을 **선택적 인자**로 받는다(기본값은 실제 파일시스템 조회). `AdbDoctor`는 같은 술어를 생성자 다섯 번째 인자로 받아 `resolveAdbPath()`에 그대로 넘긴다 — 이 저장소의 기존 패턴 그대로다: 생성자가 이미 `adbExec` · `processExec` · `acquireApk` · `platform` 넷을 **기본값과 함께** 주입받으므로(`doctor.ts:80-86`), 다섯 번째를 같은 방식으로 더하면 `bin.ts:25`의 `new AdbDoctor()` 무인자 호출이 그대로 동작한다.
  - **왜 이음매가 필요한가**: `acceptance.md` AC-002·003·004가 "주입된 가짜 파일시스템"을 전제로 삼는데 **이 저장소에는 파일시스템 주입 패턴이 없었다.** 이음매를 정하지 않으면 구현자는 "술어를 뽑는다" vs "이음매 없이 실제 임시 디렉터리를 쓴다" 중에서 고르게 되고, 후자를 고르면 AC-002·003의 검증 방식 표기(`unit(mock)`)가 사실과 달라진다.
  - **AC-018은 이 이음매를 쓰지 않는다** — 그쪽은 진짜 파일시스템으로 판정하는 것이 목적이므로(원칙 ④), 이음매를 우회해 실제 임시 디렉터리를 쓴다. 둘은 서로를 대체하지 않는다.

> 0.1.0은 이 구별의 근거로 `doctor.ts:102` 주석을 인용했으나, 그 주석은 **다른 축**을 말한다 — `checkDaemonHealth()`의 설명이며 구별하는 것은 "adb 설치됨" vs "데몬 정상"이다(*"a present binary can still have a daemon that fails to start"*). "존재 vs 실행 가능"과는 다른 문제이므로 인용을 뺀다(1차 감사 S1).

### B.2 `doctor`의 `adb` 보고 모양 (M1)

기존 `{installed, version}`에 두 필드를 **가법으로** 추가한다:

| 필드 | 값 | 의미 |
|---|---|---|
| `installed` | boolean | 실행 가능한 `adb`를 찾았는가 (기존 의미 확장: PATH 밖도 true) |
| `onPath` | boolean | 그것이 `PATH`로 찾아졌는가 |
| `resolvedPath` | string \| null | 찾은 절대 경로. 못 찾았으면 null |

**`installed:true` + `onPath:false`일 때 설치를 권하지 않는다.** 대신 `resolvedPath`와 PATH 추가 방법을 안내한다.

기존 필드를 제거하지 않으므로 `installed`만 보던 소비자는 깨지지 않는다 — 오히려 **오늘 false였던 것이 true가 되어 정상 동작하게 된다.**

### B.3 iOS 가용성 상태값 (M2)

`DeviceConnectionState`에 **`"unavailable"`**을 추가한다: `"device" | "offline" | "unauthorized" | "unavailable"`.

- 의미: **물리적으로는 잡히지만 지금 조작할 수 없다.**
- `tunnelState`가 `"connected"` → `device`(기존 유지). 그 외 값이 **존재하면** → `unavailable`. 항목 자체가 없으면 → `offline`.
- 사유 필드 **`unavailableReason: string | null`**를 기기 항목에 추가한다. `unavailable`이 아닌 상태에서는 `null`.

**왜 `null`을 두고 필드를 항상 싣는가**: SPEC-CONTRACT-001이 키 집합을 계약으로 검사한다. 조건부로 나타나는 키는 그 계약을 불안정하게 만든다. 항상 존재하고 값이 `null`이면 키 집합이 고정된다.

#### B.3.1 `unavailableReason` 파생 규칙 (확정 — 1차 감사 D9)

0.1.0은 타입(`string | null`)과 null 조건만 정했고 **내용 규칙이 없었다.** 그런데 이 필드가 담는 것이 이 SPEC의 목표 그 자체다 — "왜 못 쓰는지와 **무엇을 하면 되는지**가 JSON에서 구별되게"(`spec.md` §A.2). 내용 규칙 없이는 AC-READY-006②("원인을 식별할 수 있다")가 기계적으로 판정되지 않는다.

**규칙**: `unavailableReason`은 두 부분을 이어 붙인 문자열이다.

```
<관측된 tunnelState 원문> — <그 값에 대한 행동 안내>
```

1. **앞부분은 반드시 원본 `tunnelState` 값을 그대로 포함한다.** 진단 정보를 잃지 않고, 아래 매핑표에 없는 새 값이 나와도 사용자가 무엇을 봤는지 알 수 있다.
2. **뒷부분은 아래 매핑표에서 가져온다.** 표에 없는 값이면 뒷부분을 생략하고 원문만 싣는다 — 모르는 값에 대해 안내를 지어내지 않는다.

| 관측된 `tunnelState` | 행동 안내 | 출처 |
|---|---|---|
| `"disconnected"` | 터널이 연결되지 않았다 — WDA·신뢰 설정을 확인한다 | 2026-08-04 JSON 실측(`spec.md` §C.1-②) |
| `"unavailable"` | 터널을 쓸 수 없다 — 기기 잠금 해제 후 WDA를 다시 띄운다 | 2026-08-04 JSON 실측(`spec.md` §C.1-②) |
| `"connected (no DDI)"` | 개발자 디스크 이미지가 안 올라왔다 — 이미지 마운트가 필요하다 | `wda-device-list.ts:60-62` 주석(표 형식 관측, JSON 경로에서는 미관측) |

**이름 충돌 주의**: 표 2행의 원본 값 `"unavailable"`은 이 SPEC이 추가하는 `connectionState`의 값 `"unavailable"`과 **글자만 같고 다른 축이다.** 둘은 1:1 대응도 아니다 — `"disconnected"`도 `"unavailable"`도 모두 `connectionState: "unavailable"`로 간다. 코드·테스트·문구에서 어느 쪽을 말하는지 항상 밝힌다(`spec.md` §C.1-② 3번).

**값 집합을 고정된 것으로 가정하지 않는다**: 같은 물리 기기의 `tunnelState`가 하루 안에 `"disconnected"` → `"unavailable"`로 바뀌는 것을 관측했다(`spec.md` §C.1-② 2번). 매핑표는 **알려진 값의 목록**이지 **전체 값의 목록**이 아니며, 규칙 2(모르는 값은 원문만)가 그 미지의 영역을 안전하게 흡수한다.

### B.4 물리 기기 단위 식별 (M3)

- **동일성 판정**: `ro.serialno` (실측 근거 `spec.md` §C.1-③).
- **조회 실패 시**: 그 전송은 **합치지 않고 독립 항목으로 남긴다.** 값을 모르면서 합치는 것이 값을 모르는 채 나누는 것보다 위험하다 — 다른 기기를 하나로 접을 수 있다.
- **조회를 아예 하지 않는 경우도 같다**(2차 감사 N7). §D의 비용 제약은 `state === "device"`가 아닌 전송에는 `ro.serialno`를 묻지 않는다. **묻지 않았다**와 **물었는데 실패했다**는 원인이 다르지만 아는 것은 똑같이 없으므로, 처분도 똑같다 — 합치지 않고 독립 항목으로 남긴다. 그 항목의 `connectionState`는 `adb devices -l`이 보고한 그대로이며(`offline`·`unauthorized` 등) 그룹핑은 그 값을 바꾸지 않는다. 두 경우를 다르게 처리하려면 근거가 필요한데, 지금 그 근거가 없다.
- **대표 전송 선택**: 같은 `ro.serialno`를 가진 전송 시리얼을 **사전순 정렬해 첫 번째**를 대표로 삼는다. 이 규칙은 임의적이지만 **한 번의 목록 조회 안에서 결정적**이다 — 요구사항이 요구하는 것은 그 결정성이지 특정 우선순위가 아니며, 근거 없는 우선순위 규칙(예: "유선 우선")은 만들지 않는다.
  - **이 규칙이 주지 않는 것**(1차 감사 D8): 재연결을 가로지르는 안정성. 사전순은 그때 존재하는 전송 시리얼들 사이의 순서이므로, 전송 구성이 바뀌면 대표가 뒤집힐 수 있다. 실측: §C.1-③이 기록한 쌍(`192.168.219.106:…` + `adb-…_tcp`)에서는 `1…` < `a…`이라 IP 시리얼이 대표이지만, 같은 날 늦게 관측한 쌍(`R3CY106LKVX` + `adb-…_tcp`)에서는 `R…` < `a…`이라 USB 시리얼이 대표가 된다. `spec.md` REQ-READY-004 근거문을 이 규칙에 맞춰 정정했고(0.2.0), 세션 너머 영속 키 설계는 `spec.md` §D.2대로 범위 밖으로 남는다.
- **나머지 전송**: `alternateSerials: string[]`로 항목에 싣는다. 없으면 빈 배열(키 집합 고정 — B.3과 같은 이유).

#### B.4.1 조회 주체와 그룹핑 위치 (확정 — 1차 감사 D2)

0.1.0은 그룹핑 위치를 `registry.ts:73`으로 지정하고 "입력: 전송 목록 + **식별자 맵**"이라고만 적었다. **그 식별자 맵을 만드는 주체가 어디에도 없었다** — 그리고 지정한 그 지점에서는 만들 수도 없다.

**확정: `AdbBackend.listDevices()`가 조회도 그룹핑도 모두 수행한다.**

- **조회**: 전송마다 `adb -s <전송 시리얼> shell getprop ro.serialno`를 실행한다. 이 실행 능력(`this.exec`)을 가진 것은 이 클래스뿐이다.
- **그룹핑**: 같은 메서드 안에서, 조회 결과를 들고 바로 합친다. 그룹핑 규칙 자체는 **순수 함수로 분리**해 실기기 없이 판정 가능하게 한다(§F M3) — 입력은 `(전송 목록, 전송→ro.serialno 맵)`이고 출력은 합쳐진 목록이다.

**기각한 두 대안과 그 이유** (코드로 확인함):

| 대안 | 기각 이유 |
|---|---|
| `registry.ts:73`에서 그룹핑 (0.1.0 원안) | **물리적으로 불가능하다.** `BackendRegistry`는 `RegisteredBackend[]`만 들고 있고(`registry.ts:38-39`), `DeviceBackend` 인터페이스 10개 메서드(`device-backend.ts:148-231`)에 `getprop`도 임의 명령 실행도 없다. 이 지점에서 `ro.serialno`를 얻을 경로가 없다. 식별자를 `DeviceInfo`에 필드로 실어 보내면 가능해지지만, 그러면 계약 필드가 3개로 늘어 동기화 범위(계약 테스트·`SKILL.md` 예시)가 그만큼 넓어진다 |
| `DeviceBackend` 인터페이스에 메서드 추가 | `device-backend.ts:22-29`의 `@MX:ANCHOR` 계약을 건드린다 — 주석이 *"changing it ripples through every backend and the command layer above it"*라고 명시한다. 게다가 `WdaBackend`(iOS)는 **의미 없는 구현**을 강제로 갖게 된다 |

**왜 백엔드 안이 옳은가**: 다중 전송 중복은 **Android에만 존재하는 현상**이다. `devicectl`은 실기기를 UDID 1개로 열거하므로 iOS에는 합칠 대상이 없다(`wda-device-list.ts:87-88` — udid 없는 항목은 아예 버린다). 플랫폼 하나에만 있는 규칙을 플랫폼 중립 지점(`registry.ts`)에 올리면 그 지점이 Android 지식을 갖게 되고, 그것이 원안의 세 번째 문제였다.

**파급**: `registry.ts`는 무변경(§A.3), `DeviceBackend` 인터페이스도 무변경, `DeviceInfo` 신규 필드는 `unavailableReason`·`alternateSerials` **2개로 끝나 키 집합은 6 → 8**이 된다.

### B.5 확정 상태 자기 점검

0.1.0의 "확정하지 않은 것은 없다"는 **선언이었고 사실이 아니었다.** 0.2.0은 선언 대신 점검 목록을 둔다 — 각 요구사항의 구현 자유도가 어디서 소진되는지를 명시하고, 소진되지 않은 것은 소진되지 않았다고 적는다.

> **이 표는 네 회차 연속으로 과잉 선언했다.** 1차 D2(REQ-004의 조회 주체) · 2차 N3(REQ-006이 §A.1을 가리킴) · 3차 P2(REQ-001의 주입 이음매) · 4차 Q3(REQ-006이 경로 B를 안 다룸) — 매번 "없음"이라 적은 자리에 결정이 남아 있었다. **표를 쓰는 것만으로는 부족하다**는 것이 네 번의 증거다. 이 행들을 읽을 때는 "없음"을 믿지 말고, 해당 §B 절이 **구현자가 물을 법한 질문에 실제로 답하는지**를 보라 — 어느 함수가 하는가 · 무엇을 돌려주는가 · 실패하면 어떻게 되는가 · 다른 경로에도 같은 규칙이 적용되는가.

| 요구사항 | 자유도가 소진되는 지점 | 남은 자유도 |
|---|---|---|
| REQ-READY-001 | §B.1 (탐색 순서·1회 해석·판정 기준) | 없음 |
| REQ-READY-002 | §B.2 (`installed`/`onPath`/`resolvedPath` 3필드 + 권유 조건) | 안내 **문구**의 표현. 판정은 AC-004④·005③이 "권유 존재 여부"로 하므로 문구 자체는 자유 |
| REQ-READY-003 | §B.3 (값 이름·3분기 규칙) + §B.3.1 (사유 파생 규칙·매핑표) | 매핑표에 **없는** `tunnelState` 값의 안내 문구 — 규칙 2가 "원문만 싣는다"로 닫아 두었으므로 구현 자유도가 아니라 미지 입력의 처리다 |
| REQ-READY-004 | §B.4 (동일성 판정·실패 시 동작·대표 선택) + §B.4.1 (조회 주체·그룹핑 위치) | 없음 |
| REQ-READY-005 | 설계 결정이 아니라 실행 항목 — §F M5 | 대조 지점은 AC-014가 4곳으로 고정 |
| REQ-READY-006 | §B.6 (반환 `serial` 정규화 · 충돌 분기) | 없음 |

> **0.2.0의 이 행은 §A.1(파일 표)을 가리키며 "자유도 없음"이라고 적었다 — 그것이 틀렸다**(2차 감사 N3). 파일 표는 *어디를 고치는지*를 말할 뿐 *무엇을 결정했는지*를 말하지 않는다. 실제로 두 결정이 열려 있었고, §B.6이 그것을 닫는다. 미확정을 막으려고 만든 이 표 안에서 미확정이 재발했다는 사실 자체를 기록으로 남긴다.

### B.6 부속 시리얼 대상 조회 (M3 — REQ-READY-006)

`device-targeting.ts:139`의 조회를 넓히는 것만으로는 두 가지가 정해지지 않는다. 둘 다 확정한다.

#### B.6.1 반환 `serial`은 **대표 시리얼로 정규화한다**

부속 시리얼로 지정해도 해석 결과의 `serial`은 그 항목의 **대표 시리얼**이고, 이후 모든 `adb -s`가 그 값을 받는다. 현재 코드(`device-targeting.ts:107`의 `withOwner`가 `serial: device.serial`을 반환)가 조회 조건만 넓히면 자연히 하는 동작이므로 **`withOwner`는 수정하지 않는다.**

**왜 정규화인가**: 기기별 상태가 `serial`을 키로 쓴다. 지정 방식에 따라 키가 갈리면 같은 폰의 상태가 두 곳에 나뉘어 저장되고, 그것은 SPEC-IMESTATE-001이 닫은 결함과 **증상이 같은 새 경로**다. `spec.md` §D.2가 영속 키 설계를 범위 밖에 두었으므로, 이 SPEC이 할 수 있는 최소한은 **한 번의 실행 안에서 키가 하나로 유지되게** 하는 것이다.

**받아들이는 대가**: 사용자가 고른 전송이 조용히 다른 전송으로 바뀔 수 있고, 그 대표는 사전순이라 **임의**다. 즉 이 규칙은 "어느 전송이 쓰이는가"에 대한 사용자 선택권을 없앤다. 전송을 골라 지정하는 것이 의미 있는 상황이 나타나면 이 결정을 다시 본다 — 그때는 `--transport` 같은 별도 표면이지 `--device`의 의미 변경이 아니다.

#### B.6.2 충돌 분기(`matches.length > 1`)는 **부속 시리얼까지 포함해 판정한다**

`device-targeting.ts:150`은 한 시리얼이 둘 이상 항목에 걸리면 대상을 고르지 않고 거부한다. 조회를 넓히면 걸리는 경우도 넓어진다 — 어떤 시리얼이 A 항목의 대표이면서 동시에 B 항목의 부속일 수 있다. **그 경우도 충돌로 판정해 거부한다.** 판정 기준은 "요청 시리얼이 대표 또는 부속으로 매치된 항목 수 > 1"이다.

**왜 거부가 옳은가**: 그런 상태는 그룹핑이 잘못됐거나 두 물리 기기가 같은 이름을 주장한다는 뜻이고, 둘 다 **아무 쪽이나 고르면 엉뚱한 기기를 조작하게 되는** 상황이다. §B.4가 "값을 모르면서 합치지 않는다"를 택한 것과 같은 이유다 — 나누는 실수는 목록이 길어질 뿐이지만 잘못 고르는 실수는 기기를 잘못 조작한다.

#### B.6.3 `devices` 명령 경로도 같은 두 규칙을 따른다 (4차 감사 Q3)

§B.6.1·§B.6.2는 `resolveTargetDevice()`(경로 A)를 기준으로 썼으나, `devices.ts:14`는 **그 함수를 거치지 않는 별도 경로**(경로 B)다. 두 경로에 같은 규칙을 적는다.

| 규칙 | 경로 A `resolveTargetDevice()` | 경로 B `devicesCommand` |
|---|---|---|
| 조회 범위 | 대표 + 부속 시리얼 | **같다** |
| 정규화 | 반환 `serial`이 대표(`withOwner`가 자동으로) | **같다** — 필터가 돌려주는 것이 합쳐진 항목 자체이므로 그 `serial`이 곧 대표다. 추가 코드 불필요 |
| 충돌(둘 이상 항목에 걸림) | 거부, `BACKEND_COMMAND_FAILED` | **거부하고 같은 코드 `BACKEND_COMMAND_FAILED`를 낸다**(5차 감사 Q7 — 0.5.1은 "거부한다"까지만 적고 코드를 비워 뒀다). `devices`는 오늘도 매치 0건이면 `DEVICE_NOT_FOUND`를 내므로(`:15-20`) 거부 자체는 기존 성질이고, 코드를 경로 A와 **같게** 두는 이유는 이 표의 원칙 그대로다 — 의도적 차이는 마지막 행 하나뿐이어야 하고, 같은 사건("요청 시리얼이 한 기기로 특정되지 않는다")에 경로마다 다른 코드를 내면 Skill이 경로별로 분기해야 한다 |
| 연결 상태 검사 | `"device"`가 아니면 `DEVICE_NOT_CONNECTED`(`:160-167`) | **하지 않는다**(기존 동작 유지) — `devices`는 목록 명령이므로 연결 안 된 기기도 보여 주는 것이 목적이다. 이 차이는 의도적이며 이 SPEC이 바꾸지 않는다 |

마지막 행이 두 경로의 **유일한 의도적 차이**다. 나머지 셋은 같아야 한다 — 다르면 사용자가 `devices --device X`와 `tap --device X`에서 다른 답을 받는다.

**오류 코드는 유지하고 문구만 고친다** (3차 감사 P3). 기존 분기는 `BACKEND_COMMAND_FAILED` 코드에 `No backend owns device serial 'X'.` 문구를 낸다(`device-targeting.ts:150-157`).

- **코드는 그대로 둔다** — 이유는 최소 변경이다. 이 분기는 오늘도 이 코드를 내고 있고, 적용 범위가 넓어졌다고 해서 **다른 사건이 된 것은 아니다**(둘 다 "요청 시리얼이 한 기기로 특정되지 않는다"이다). 새 코드를 만들면 Skill 소비자가 분기해야 할 값이 하나 늘고, 그것은 이 SPEC이 요구하지 않는 확장이다.
  - **0.3.0이 여기 적었던 근거 두 개는 사실이 아니었다**(4차 감사 Q2 — 확인하지 않고 썼다). ① `BACKEND_COMMAND_FAILED`는 `SKILL.md`에 **아예 등장하지 않는다**(`grep -n "BACKEND_COMMAND_FAILED" .claude/skills/explore-mobile/SKILL.md` → 매치 0). 문서의 오류 코드 표는 *"Codes you will actually meet"*를 표방하므로 이 코드는 그 표의 항목이 아니다. ② `spec.md` §D.2에는 "계약 확장"이라는 범위 제외 항목이 **없다** — 다섯 항목은 자동 설치 정책 · WDA 자동 기동 · 영속 키 설계 · iOS 시뮬레이터 · 새 기기 제어 기능이다. 오히려 REQ-READY-003이 "이 요구사항은 **출력 계약을 바꾼다**"고 명시한다.
  - 근거가 틀렸어도 **결론은 유지한다** — 위의 최소 변경 논거로 다시 세운다. 다만 이 코드가 `SKILL.md`에 없다는 사실 자체는 REQ-READY-005의 동기화 대상 후보이므로 M5에서 함께 본다.
- **문구는 고친다** — 부속 시리얼 충돌은 백엔드 소유권과 무관한 사건인데 현재 문구는 소유권을 말한다. 사용자가 원인을 오해하며, 그것이 이 SPEC이 닫으려는 결함 유형(잘못된 복구 행동 유발)이다. 문구는 "한 시리얼이 둘 이상 기기 항목에 걸린다"는 사실과 그때 무엇을 보면 되는지를 말해야 한다.
- 기대 코드는 AC-READY-020이 못박는다.

---

## §C. 사전 점검 (착수 전 실행)

각 행은 **실행 가능한 명령**이고, 아래 표는 작성 후 전건 실행해 기대와 대조했다(2026-08-04).

**없음-검사를 쓰지 않는다.** 초안의 행 5는 `grep -rn "ANDROID_HOME|platform-tools|resolveAdb" src/`로 "출력 없음"을 기대했으나, 실행해 보니 **6건이 나왔다** — `brew install android-platform-tools` 안내 문구와, 이름만 비슷한 무관한 함수 `resolveAdbBackend`(백엔드 선택용)에 걸렸다. 이 SPEC이 지적하는 결함(무관한 텍스트에 오탐하는 grep)을 계획서가 그대로 재현한 셈이다. **부재를 뒤지는 대신 결함의 직접 증거를 찾는 존재-검사로 교체했다** — 존재-검사는 매치 자체가 증거이므로 양성 대조가 필요 없다.

| # | 항목 | 명령 | 기대 |
|---|---|---|---|
| 0 | **기준 SHA 기록** | `git rev-parse HEAD` | 값을 `progress.md` §E.2에 기록하고 `$BASE`로 사용. **`plan.md`에 적지 않는다** — `manager-develop`은 이 파일 본문을 수정할 수 없다 |
| 1 | 기준선 테스트 | `pnpm test` | exit 0. **개수를 여기 하드코딩하지 않는다** — 실측값을 `progress.md` §E.2에 기록하고 대조한다 |
| 2 | 기준선 타입·빌드 | `pnpm typecheck` · `pnpm build` | 양쪽 exit 0 |
| 3 | 상태 열거형 현재값 | `grep -n "DeviceConnectionState =" src/schema/device-backend.ts` | `"device" \| "offline" \| "unauthorized"` 3값 |
| 4 | iOS 매핑 현재 동작 | `grep -n -A 3 "function mapConnectionState" src/backend/wda-device-list.ts` | `=== "connected" ? "device" : "offline"` |
| 5 | `adb` 경로 해석 부재의 **직접 증거** | `grep -n 'spawnProcess("adb"' src/backend/adb-executor.ts` | `:33` 매치 — 바이너리 이름이 **리터럴로 고정**돼 있다. 같은 파일 11행 주석도 *"this module only fixes the binary name to `adb`"*라고 적고 있다. M1 완료 후 이 줄은 바뀌어 있어야 하므로 전후 대조 지점이기도 하다 |
| 6 | 계약 테스트 위치 (**확정**) | `grep -n "keyof DeviceInfo" src/schema/device-backend.test.ts` | `:32` 매치 — 키 집합 계약의 SSOT는 `device-backend.test.ts:31-42`다(`Record<keyof DeviceInfo, true>` 6키 + `expect(Object.keys(fieldPresence)).toHaveLength(6)`). 0.1.0은 `grep -rln "connectionState" src/ \| grep test`로 **목록을 찾아보라**고 미뤘고 그 결과는 9개 파일이라 갱신 대상이 특정되지 않았다(1차 감사 S5). `command-payloads.ts:44-47`이 명시적으로 이 파일에 위임하고 있음도 확인 |
| 6b | 그룹핑 비용 기준선 | `grep -n "getprop" src/backend/adb-backend.ts` | `:303` 1건 — 오늘 `listDevices()`는 연결된 기기마다 `getprop ro.build.version.release`를 **1회** 실행한다. §B.4.1이 전송마다 `getprop ro.serialno`를 더하므로 이 지점이 2배가 된다. §D 비용 제약의 기준선 |
| 7 | 실기기 연결 여부 | `node dist/cli/bin.js devices` | Android 1대 이상이 `device` 상태여야 M4 실측 가능. 없으면 M4는 **미관측으로 기록** |

---

## §D. 제약

- **동의 없는 설치 금지** — `doctor`의 자동 설치 정책은 무변경(`spec.md` §D.2). 이 SPEC은 권유 조건만 좁힌다.
- **`--no-verify` 금지**, `--amend` 금지, main 강제 푸시 금지.
- **PRESERVE 목록(§A.2) 무수정.**
- **기존 상태값의 의미를 바꾸지 않는다** — `device` · `offline` · `unauthorized`의 뜻은 그대로다. `unavailable`은 지금까지 `offline`으로 접혔던 부분집합만 가져간다.
- **런타임 관리 파일 무수정** — `.moai/state/*`, `.moai/cache/*`. 커밋 시 디렉터리 통째 `git add` 금지(2026-08-04 실측: 하위 `.moai/state/`가 루트 `.gitignore`를 빠져나가 추적된 사고가 있었다).
- **`ro.serialno` 조회 비용을 명시적으로 수용한다** (1차 감사 S8). §B.4.1의 조회는 `listDevices()`의 서브프로세스 수를 늘린다 — 오늘은 연결된 기기마다 `getprop ro.build.version.release` 1회(`adb-backend.ts:303`)이고, 여기에 전송마다 `getprop ro.serialno`가 더해져 **최대 2배**가 된다. 이 코드베이스는 열거 비용을 전용 테스트로 관리한다(`registry.ts:53-56` — "이 메서드가 열거되는 **유일한** 지점", `cli/enumeration.test.ts`가 호출 횟수를 센다, REQ-VISION-005). 따라서 다음을 제약으로 둔다:
  - **열거 횟수는 늘리지 않는다** — `listAllDevices()` 호출 횟수 불변. `cli/enumeration.test.ts`가 이를 계속 지킨다.
  - **`getprop` 호출은 늘어나는 것을 허용한다** — 단 전송당 `ro.serialno` **1회**를 상한으로 하고, `state === "device"`가 아닌 전송에는 조회하지 않는다(오늘 `ro.build.version.release`가 이미 쓰는 조건과 같다).
  - 두 제약을 합치면 증가분은 "연결된 전송 수"에 선형이며 그 이상은 아니다.

---

## §E. 자체 검증 (Self-Verification)

각 마일스톤 종료 시 실행하고 **출력을 근거로** 보고한다. "통과했을 것"은 보고가 아니다.

**§F M4와의 관계**: 마일스톤마다 실행하는 것은 그 시점의 상태를 보는 것이고, M4가 "§E 전체를 실행한다"고 한 것은 **모든 변경이 들어온 뒤 한 번 더 통합 실행**한다는 뜻이다. 둘은 대체 관계가 아니라 누적 관계다.

**양성 대조 대상은 마일스톤마다 다르다** (2차 감사 N2). 아래 ①과 ③-a는 "이 SPEC이 반드시 수정하는 파일이 감지되는가"를 묻는데, **그 파일은 마일스톤마다 다르다.** 아직 손대지 않은 파일을 대조 대상으로 쓰면 출력이 비고, 아무 문제가 없는데도 대조가 실패로 읽힌다. `$TOUCHED`를 그 마일스톤이 **반드시 고치는** 파일로 두고 실행한다:

| 마일스톤 | `$TOUCHED` | 근거 |
|---|---|---|
| M1 | `src/backend/adb-executor.ts` | §A.1 — M1 배정, `:33`의 리터럴 고정을 반드시 푼다 |
| M2 | `src/schema/device-backend.ts` | §A.1 — `DeviceConnectionState`에 `unavailable` 추가 |
| M3 | `src/schema/device-backend.ts` | §A.1 — `DeviceInfo`에 `alternateSerials` 추가 |
| M4·M5 | `src/schema/device-backend.ts` | 이 시점에는 M2·M3가 이미 들어와 있다 |

```bash
pnpm test          # exit 0 (개수는 progress.md §E.2 기준선과 대조)
pnpm typecheck     # exit 0
pnpm build         # exit 0
```

이 SPEC 고유의 검증:

```bash
# 호출자 무수정 (PRESERVE — $BASE는 progress.md §E.2 기록값)
# ① 양성 대조 — 이 마일스톤이 반드시 수정하는 파일이 감지되는가 (기대: 출력 있음)
#    $TOUCHED는 위 표에서 이번 마일스톤의 값을 쓴다. 고정 파일을 쓰면 M1 끝에서
#    빈 출력이 나와 문제가 없는데도 대조가 실패로 읽힌다(2차 감사 N2).
git diff --name-only "$BASE" -- "$TOUCHED"
# ② 본 검사 (기대: 출력 없음)
git diff --name-only "$BASE" -- \
  src/backend/ime-session-store.ts src/backend/apk-downloader.ts
# ③-a 양성 대조 — ③이 쓰는 리비전 범위가 살아 있는가 (기대: 출력 있음)
#     ①은 git diff 경로만 증명하므로 git log의 "$BASE"..HEAD 범위가 깨진 경우를
#     잡지 못한다. 빈 $BASE로 실행하면 git log는 조용히 종료하고 출력이 없어
#     "출력 없음 = 위반 없음"으로 읽혀 ③이 공허하게 통과한다(1차 감사 S3).
git log --oneline "$BASE"..HEAD -- "$TOUCHED"
# ③-b 본 검사 — 원상 복구된 변경까지 잡는다 (기대: 출력 없음)
git log --oneline "$BASE"..HEAD -- \
  src/backend/ime-session-store.ts src/backend/apk-downloader.ts

# 상태 열거형이 실제로 확장됐는가 (기대: unavailable 포함 4값)
grep -n "DeviceConnectionState =" src/schema/device-backend.ts

# 키 집합 고정 확인 — 조건부 키가 생기지 않았는가
pnpm vitest run -t "connectionState"
```

**문서 동기화는 grep으로 확인하지 않는다.** `SKILL.md`의 서술이 코드와 맞는지는 문자열 존재가 아니라 **의미 일치**의 문제이므로, M5에서 해당 절을 코드와 나란히 놓고 **읽어서 확인**한다. 없음-검사로 만들면 양성 대조를 붙일 대상이 없어 공허해진다(`acceptance.md` 원칙 ②).

---

## §F. 마일스톤

배치 원칙: **번복 가능성 내림차순.** 계약을 바꾸는 결정이 가장 되돌리기 비싸므로 앞에 둔다. 단 M1은 예외로 맨 앞인데, 번복 가능성 때문이 아니라 **M4 실측의 전제**이기 때문이다 — `adb`를 못 찾으면 Android 실측 자체가 불가능하다.

### M1 — `adb` 경로 해석 + 구별 보고 [전제]

- §B.1의 4단계 탐색을 구현한다. 해석은 1회 수행 후 재사용.
- §B.2의 `doctor` 보고 모양(`onPath` · `resolvedPath`)을 추가한다.
- `installed:true` + `onPath:false`에서 **설치를 권하지 않는지** 확인한다.
- 판정: PATH에서 `adb`를 제거한 환경에서 Android 명령이 **정상 동작**해야 한다(`acceptance.md` AC-READY-001·002).

### M2 — iOS 가용성 상태 + 계약 반영 [계약 변경 · 번복 비용 최대]

- §B.3의 `unavailable` 값과 `unavailableReason` 필드를 추가한다.
- `mapConnectionState`를 3분기로 확장한다(`connected` / 그 외 값 존재 / 값 부재).
- SPEC-CONTRACT-001의 키 집합 계약 테스트를 **같은 변경에서** 갱신한다.
- **기존 3값의 의미가 바뀌지 않았음**을 테스트로 못박는다(§D 제약).

### M3 — 물리 기기 단위 식별

- §B.4 · §B.4.1대로 **`AdbBackend.listDevices()` 안에서** `ro.serialno` 조회 · 그룹핑 · 사전순 대표 선택 · `alternateSerials`를 구현한다. `registry.ts`와 `DeviceBackend` 인터페이스는 건드리지 않는다.
- 그룹핑 규칙을 **순수 함수로 분리**해 실기기 없이 판정 가능하게 한다 — 입력은 `(전송 목록, 전송→ro.serialno 맵)`, 출력은 합쳐진 목록. 맵을 만드는 주체는 `AdbBackend`이고 순수 함수는 그것을 받기만 한다.
- `ro.serialno` 조회 실패 시 **합치지 않는** 경로를 테스트로 고정한다.
- **REQ-READY-006**: `device-targeting.ts:139`의 대상 조회를 부속 전송 시리얼까지로 넓힌다. 그룹핑과 **같은 마일스톤에서** 한다 — 그룹핑만 먼저 들어가면 그 사이에 `--device` 회귀가 실재하는 상태가 된다.
- §D의 비용 제약(전송당 `ro.serialno` 1회, 연결된 전송만)을 지키는지 `cli/enumeration.test.ts`로 확인한다.

### M4 — 실기기 회귀 확인 [필수 · `spec.md` §E.4 이행]

- §E 자체 검증 전체를 실행한다.
- **실기기로 4건을 각각 재현 확인**한다. 각각 대응하는 인수 기준이 있다:
  1. PATH 밖 `adb`로 Android 명령이 동작한다 — AC-READY-001
  2. iOS가 `unavailable`로 **사유와 함께** 보고된다 — AC-READY-019(§B.3.1 매핑표대로 원문 + 안내가 실렸는지 확인)
  3. 중복 전송 기기가 1개 항목으로 보고된다 — AC-READY-013①②
  4. 합쳐져 사라진 전송 시리얼로 `--device`를 지정해도 같은 기기가 대상이 된다 — AC-READY-013③ (REQ-READY-006의 실환경 판정)
- 실기기 미확보 시 **미관측으로 기록하고 PASS로 계상하지 않는다.** 단 이 SPEC은 §C-④의 근거로 실측을 요구하므로, 미관측 상태로 마감하면 그 사실을 마감 보고에 명시한다.

### M5 — 문서 동기화 [마감 조건]

- `SKILL.md`의 다음 서술을 코드와 대조해 갱신한다: § Known traps의 `doctor` 정확성 주장, § Device targeting의 `connectionState` 설명, § Command reference의 `doctor` 행.
- **읽어서 확인**한다(§E 참조). 갱신한 절과 대조한 코드 위치를 `progress.md`에 남긴다.

---

## §G. 마일스톤 의존 관계

```
M1 (adb 경로 해석)                    ← M4 Android 실측의 전제
 ├─> M2 (iOS 상태값 + 계약)           ← 계약 변경, 번복 비용 최대
 └─> M3 (물리 기기 식별)              ← M1의 adb 접근이 있어야 ro.serialno 조회 가능
      └─> M4 (실기기 회귀 확인)
           └─> M5 (문서 동기화 · 마감)
```

- M2와 M3는 서로 독립이다 — 다루는 백엔드가 다르다(iOS 매핑 vs Android 그룹핑). 순서를 바꿔도 되지만 **동시에 진행하지 않는다.** 두 마일스톤이 각각 `DeviceInfo`에 필드를 하나씩 추가하므로, **`DeviceInfo`를 만들거나 그 모양을 고정하는 모든 지점**이 양쪽에서 편집된다. **그 지점의 목록과 개수는 여기 적지 않는다** — §A.1과 §A.1.1이 소유한다. 이 자리에 개수를 적을 때마다 틀렸기 때문이다(0.1.0 "하나" · 0.2.0 "셋" · 0.3.0 "넷" · 0.4.0은 그것을 명령으로 바꾸면서도 바로 윗줄에 "생산 3곳·테스트 9개"를 다시 박아 자기 선언과 모순됐다 — 4차 감사 Q1).

여기서 §G가 말하는 것은 개수가 아니라 **순서 제약** 하나다: 그 지점들이 M2·M3 **양쪽**에서 편집되므로 두 마일스톤을 동시에 진행하지 않는다.
- 먼저 끝난 쪽이 키 집합을 7로 만들고 나중 쪽이 8로 만든다 — 중간 상태에서도 계약 테스트가 통과해야 하므로, 각 마일스톤은 **자기 필드까지 반영한 개수**로 테스트를 갱신하고 커밋한다.
- M5가 마지막인 이유: 문서는 코드가 확정된 뒤에 맞춘다. 반대로 하면 문서가 다시 코드와 어긋난다 — 이 SPEC이 닫으려는 결함(REQ-READY-005)을 스스로 재현하게 된다.
