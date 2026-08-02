# SPEC-VISION-001 — design.md

설계 결정 기록. 각 결정은 대안과 채택 근거를 함께 남긴다. 근거의 등급 표기는 `research.md`와 동일하다 — ①은 2026-08-02 직접 관측, ②는 이전 세션 인용.

---

## §A. 인터페이스 변화

### A.1 `DeviceBackend`에서 나가는 것과 들어오는 것

```
제거:  dumpUiHierarchy(serial): Promise<CommonElement[]>
추가:  getScreenSize(serial): Promise<ScreenSize>
```

`ScreenSize`는 이미 `src/cli/commands/scroll-geometry.ts`에 존재하는 타입이다(`deriveScreenSize`의 반환형). 새 타입을 만들지 않고 이를 스키마 계층(`src/schema/device-backend.ts`)으로 옮겨 재사용한다 — 단순화 사다리 2단(이미 있는 것을 재사용)을 먼저 적용한 결과다.

**왜 `getScreenSize`를 백엔드 메서드로 두는가.** 화면 크기 획득 방식이 플랫폼마다 완전히 다르다(Android `wm size` shell, iOS WDA HTTP 또는 PNG 헤더). 호출자(`scroll`)가 분기를 알아야 할 이유가 없고, 기존 `dumpUiHierarchy`도 같은 자리에 있었다. 배선 형태를 바꾸지 않으므로 registry facade 패턴도 그대로 재사용된다.

**대안: `scroll`이 직접 스크린샷을 찍어 PNG 헤더를 읽는다.** 백엔드 메서드가 늘지 않는 장점이 있으나, Android에서 25ms짜리 `wm size` 대신 ~600ms짜리 캡처를 강제하게 된다(① 관측). 기각.

### A.2 `CommonElement`의 처지

`CommonElement`는 `dumpUiHierarchy`의 반환 원소이자 `normalize/{uiautomator,idb,webdom}.ts`의 공통 출력 형식이다. dump가 사라져도 **`normalize/webdom.ts`가 `--web` 경로에서 계속 쓴다**(`web-support.ts:409` `normalizeWebDom`). 따라서 `CommonElement` 타입 자체는 **존치**하고, 네이티브 정규화기 두 개(`uiautomator.ts`, `idb.ts`)만 제거한다.

이는 REQ-VISION-007(웹뷰 회귀 금지)이 강제하는 경계다. "dump를 지우니 공통 요소 스키마도 지운다"는 과잉 제거이며, `--web`을 깨뜨린다.

---

## §B. iOS 백엔드 — WDA HTTP

### B.1 구조

`idb-backend.ts`(프로세스 실행 기반)를 `wda-backend.ts`(HTTP 기반)로 교체한다. 실행기 계층도 대응 교체된다:

```
idb-executor.ts   (프로세스 spawn)   →  wda-client.ts   (HTTP fetch)
idb-errors.ts     (종료코드 매핑)     →  wda-errors.ts   (HTTP 상태 + WDA value 매핑)
idb-target-parse.ts (list-targets)   →  (제거) — 기기 목록은 devicectl/simctl 담당
```

**기기 목록의 출처가 바뀐다.** idb는 목록 조회와 제어를 겸했으나, WDA는 **이미 특정 기기에 붙어 있는 에이전트**이므로 목록을 주지 못한다. iOS 기기 열거는 `xcrun devicectl list devices`(① 51~53ms)로 분리한다. 이 분리가 열거 비용을 크게 낮춘다 — idb 735~763ms → devicectl ~52ms(① 둘 다 관측).

시뮬레이터 목록(`simctl`, ① 92ms)의 존치 여부는 §C.5(spec.md)가 이월한 문제와 같다. 현재 목록에서 시뮬레이터가 전부 `offline`로 나오므로(① 관측), 열거에서 제외하면 추가로 ~92ms를 절약한다. M3에서 확정한다.

### B.2 세션 관리

WDA의 조작 엔드포인트(`/session/:id/actions`, `/session/:id/wda/keys`)는 세션 ID를 요구한다. `/status` 응답이 현재 세션 ID를 포함하므로(① 관측: `"sessionId": "4390BCEE-..."`), **세션을 새로 만들지 않고 `/status`에서 얻는다.**

**대안: 명령마다 `POST /session`으로 새 세션 생성.** 세션 생성은 앱 활성화를 수반해 화면 상태를 바꿀 수 있고 비용도 크다. 기각.

세션 ID가 없거나 만료된 경우의 재획득 절차는 M3에서 확정한다. 이 지점은 현재 미검증이다 — `/status`가 항상 유효한 세션 ID를 주는지 확인하지 않았다.

### B.3 실패의 가시성 (REQ-VISION-003)

WDA는 사용자가 사전에 기동해 두어야 하는 외부 프로세스다(② 수동 관문 3개 + `iproxy`). 접속 실패는 **흔한 정상 상태**이지 예외적 사고가 아니다. 따라서:

- 접속 실패는 전용 오류 코드(`WDA_UNREACHABLE`)로 반환하며, 메시지에 복구 절차(WDA 기동 명령, `iproxy 8100:8100 -u <UDID>`)를 포함한다.
- 오류를 삼키고 다른 경로로 대체하지 않는다. 조용한 폴백은 "왜 안 되는지 모르는 상태"를 만든다.

이는 `doctor`가 WDA 상태를 점검 항목으로 갖는다는 뜻이기도 하다 — `doctor`가 idb 점검을 잃는 대신 WDA 점검을 얻는다.

---

## §C. 좌표계 (REQ-VISION-006)

### C.1 배율은 하드코딩하지 않고 도출한다

인용값 ÷3(②)은 특정 기기(iPhone16,2)의 값이다. 기기마다 다르므로 상수로 박으면 다른 기기에서 조용히 틀린다.

도출 방법: **스크린샷 해상도 ÷ WDA 창 크기 = 배율**. 두 값 모두 관측 가능하다.

```
Android:  캡처 1440×3120,  wm size 1440×3120   → 배율 1.0  (① 관측)
iOS:      캡처 1290×2796,  WDA  430×932        → 배율 3.0  (② 인용)
```

Android가 1.0인 것은 ① 관측으로 확인했다(PNG IHDR 파싱 = `wm size` 출력). iOS 3.0은 인용이며, 실기기에서 두 값을 실제로 읽어 재확인하는 것이 M3의 일이다.

### C.2 배율 적용 지점

호출자는 **항상 스크린샷 픽셀 좌표**를 넘긴다. 배율 변환은 백엔드 내부에서 일어난다. 이유: 호출자가 플랫폼을 몰라도 되게 하는 것이 `DeviceBackend` 추상화의 존재 이유이고, 배율을 호출자에게 노출하면 iOS/Android 분기가 CLI 계층으로 새어 나온다.

**주의 — 별개 축**: 에이전트에게 표시되는 이미지의 다운스케일 배율(예 ×1.56)은 이 계약과 무관하다. 그것은 표시 계층의 문제이며 CLI는 관여하지 않는다. 이 구분을 문서에 명시하지 않으면 두 배율이 섞여 곱해질 위험이 있다(과거 Android에서 표시 배율 누락으로 오탭한 기록이 있다).

---

## §D. 열거 1회화 (REQ-VISION-005)

### D.1 현재 구조와 중복의 위치

```
tapCommand
  ├─ backend.listDevices()          ← 열거 1회차
  ├─ resolveTargetDevice(devices, args.device)   → serial 확정
  └─ backend.tap(serial, x, y)
       └─ BackendRegistry.tap
            └─ resolveOwningBackend(serial)
                 └─ resolveBackend(serial)
                      └─ listAllDevices()        ← 열거 2회차 (중복)
```

2회차 열거는 이미 1회차에서 확정된 정보(어느 백엔드가 이 serial을 소유하는가)를 다시 계산한다.

### D.2 채택: 해석 단계가 백엔드를 함께 반환한다

`resolveTargetDevice`가 serial뿐 아니라 **소유 백엔드까지** 반환하도록 하고, 명령 핸들러가 그 백엔드를 직접 호출한다. registry facade의 `resolveOwningBackend` 경유가 사라진다.

```
tapCommand
  ├─ registry.listAllDevices()                    ← 열거 1회 (유일)
  ├─ resolveTargetDevice(devices, args.device)    → { serial, backend }
  └─ backend.tap(serial, x, y)                    ← 이미 확정된 백엔드 직접 호출
```

`BackendRegistry`는 `listAllDevices()`와 `resolveBackend()`를 계속 제공하되, **`DeviceBackend` facade 구현(137~195행의 8개 위임 메서드)은 제거**한다. 이 facade가 중복의 발생원이기 때문이다.

**대안 1: registry에 열거 결과를 캐시한다.** 호출 수는 줄지만 캐시 무효화 시점(기기 연결/해제)이라는 새 문제를 만든다. 프로세스가 명령 1회 수명이므로 캐시의 이득이 구조 단순화보다 작다. 기각.

**대안 2: facade를 유지하고 serial→backend 맵만 캐시한다.** 대안 1의 축소판이며 같은 무효화 문제를 갖는다. 기각.

### D.3 파급 — 타입 변화가 모든 명령에 닿는다

`resolveTargetDevice`의 반환형이 바뀌므로 이를 쓰는 **모든 명령 핸들러**(`devices` 제외 11개)가 영향을 받는다. 이는 기계적 변경이며, 컴파일러가 누락을 잡아 준다(TypeScript strict).

`bin.ts`가 `runCli(argv, registry, doctor)`로 registry를 `DeviceBackend`인 척 넘기던 배선도 함께 바뀐다 — registry는 이제 `DeviceBackend`를 구현하지 않는다.

---

## §E. 제거 순서와 안전성

### E.1 순서 제약의 근거

```
M1 (화면 크기 소스)  →  M2 (dump 제거)
```

역순은 `scroll`을 중간 상태에서 깨뜨린다(spec.md §C.1). M1이 `getScreenSize`를 세우고 `scroll`을 그쪽으로 옮긴 뒤에야 `dumpUiHierarchy`를 지울 수 있다.

```
M3 (WDA 교체)  →  M4 (idb 잔재 제거)
```

역순은 iOS 제어 경로가 비는 구간을 만든다. M3이 대체 경로를 세운 뒤 M4가 구 경로를 지운다.

```
M5 (열거 1회화)는 M4 이후
```

M4가 idb 백엔드를 지우면 registry에 등록되는 백엔드 구성이 바뀐다. 그 뒤에 열거 구조를 바꾸는 편이 한 번의 수정으로 끝난다.

### E.2 각 마일스톤은 통과 가능한 상태로 끝난다

중간 커밋이 빌드·테스트를 통과하지 못하는 구간을 만들지 않는다. 특히 M2는 제거량이 크므로, 인터페이스에서 메서드를 지우는 순간 컴파일이 깨지는 파일들을 같은 마일스톤 안에서 모두 처리한다.

### E.3 테스트의 처지

제거되는 기능의 테스트는 함께 제거된다(`idb-*.test.ts`, `element-query.test.ts`, `uiautomator.test.ts` 등). 이는 커버리지 수치를 움직이므로, **제거 전후 커버리지를 같은 명령으로 측정해 기록**한다 — 분모가 줄어 수치가 오르는 것을 개선으로 오독하지 않기 위해서다.

새로 필요한 테스트:
- `getScreenSize`의 플랫폼별 파싱(`wm size` 출력 형식, WDA 창 크기 응답, PNG IHDR)
- 배율 도출 로직
- 열거 1회 보장 — 이것은 mock으로 호출 횟수를 세면 판정 가능하다(단위 테스트가 유효한 드문 항목)
- WDA 접속 실패 시 오류 코드·메시지

**mock의 한계**: 외부 CLI/HTTP 호출의 실제 동작은 mock으로 판정할 수 없다. WDA 실기기 동작, `wm size` 실제 출력, 비전 루프 end-to-end는 M6의 실측이 유일한 판정 수단이다. 이 경계는 `acceptance.md`가 AC별로 명시한다.

---

## §F. 미확정 사항 (마일스톤에서 닫는다)

| 항목 | 닫는 시점 | 내용 |
|---|---|---|
| WDA 창 크기 엔드포인트 | M3 | `/window/size` 존재·응답 형식 미확인(`research.md` §6-2). 폴백은 PNG IHDR |
| WDA 세션 ID 재획득 | M3 | `/status`가 항상 유효한 세션 ID를 주는지 미확인 |
| 시뮬레이터 목록 존치 | M3 | `simctl` 열거(~92ms) 제외 여부 |
| `dump --web` 존치 | M2 | spec.md §C.4 |
| iOS 배율 실측 | M3 | ÷3은 인용값. 캡처 해상도와 창 크기를 실제로 읽어 도출 |
