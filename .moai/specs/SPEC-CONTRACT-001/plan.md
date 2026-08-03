# SPEC-CONTRACT-001 — plan.md

실행 계획. 마일스톤 2개 — 장치를 달고(M1), **일부러 깨뜨려 작동을 확인한다**(M2).

## §A. 착수 전 상태

```
base_commit_sha: c16c67f
branch: master
tests(before): 25 files / 540 passed | 2 expected fail
```

### A.1 출력 키 집합 기준선 (실기기 실측, 2026-08-03)

이 SPEC은 **형태를 고정**하는 작업이므로, 착수 전 형태를 먼저 적어 둔다.
끝나고 "안 바뀌었다"고 말하려면 비교 대상이 있어야 한다.

```
devices            []serial,model,osVersion,connectionState,isEmulator,platform
doctor(android)    adb,daemon,devices,adbKeyboard
doctor(ios)        adb,daemon,devices,adbKeyboard,wdaEnvironment{devicectl,wda}
screenshot(--out)  serial,savedTo,byteLength
tap                serial,x,y
scroll             serial,direction,from,to
key                serial,key
```

소스에서 확인한 나머지:

```
launch / stop      serial,package
text               serial
swipe              serial,from,to[,durationMs]
screenshot(--out 없음)  serial,byteLength,pngBase64
reset(android)     serial + imeReset,adbKeyboardDisabled,adbKeyboardUninstalled,warnings[,originalImeRestored]
reset(ios)         serial + noOp,message
```

### A.2 PRESERVE (수정 금지)

- `src/backend/**` — 하위 타입(`AdbInstalledCheck`, `WdaCheck`, `ResetResult` 등)은
  이미 선언·수출돼 있다. **재사용만** 한다
- `src/cli/envelope.ts` — `success<T>` 시그니처는 이미 제네릭이라 바꿀 필요가 없다
- 각 명령의 **출력 필드 집합** — 이 SPEC은 고정 장치를 달 뿐이다

### A.3 가장 큰 위험

**타입을 현재 출력에 맞추지 않고, 내가 "맞다고 생각하는" 형태로 쓰는 것.**
그러면 컴파일 에러가 나거나, 더 나쁘게는 출력을 바꿔 버린다.

방어선: §A.1 기준선을 보고 쓰고, 끝나고 같은 명령을 다시 돌려 비교한다
(AC-CONTRACT-007).

---

## §B. 마일스톤

### M1 — 장치 달기

1. `src/schema/command-payloads.ts` 신설 — 명령 10개의 페이로드 타입.
   전부 기존 타입의 **조합**이며 필드 형태를 다시 정의하지 않는다
2. 각 핸들러의 `success()` 호출에 타입 인자 명시
3. `pnpm typecheck` — 타입과 실제 출력이 어긋나면 여기서 잡힌다
4. `src/schema/command-payloads.test.ts` — 타입별 `Record<keyof T, true>` 계약 테스트
5. `doctor` 갈래별 실제 키 집합 테스트 (REQ-CONTRACT-004)

### M2 — 장치가 작동하는지 확인 (핵심)

**통과했다고 적는 것으로는 부족하다.** 일부러 깨뜨려 본다.

6. **핸들러에서 필드 하나 삭제** → 컴파일 실패 확인 → 되돌림 (AC-CONTRACT-004)
7. **타입에서 필드 하나 삭제** → 계약 테스트 실패 확인 → 되돌림 (AC-CONTRACT-005)

두 실험의 **실제 오류 메시지**를 progress에 남긴다. 남기지 않으면 이 SPEC은
"장치를 달았다"까지만 주장할 수 있고 "작동한다"는 주장할 수 없다.

### 실기기 확인

8. §A.1과 같은 명령을 다시 돌려 키 집합 비교 (AC-CONTRACT-007)

### 위험

- **`doctor` 선택 필드를 필수로 선언하면 컴파일이 깨진다** — 갈래 5개 중
  `installAttempt`/`wdaEnvironment`는 특정 갈래에만 실린다
- **`reset`은 스프레드(`...result`)로 만든다** — 타입도 교차 타입으로 맞춰야 하고,
  Android/iOS 두 갈래의 결과 타입이 다르다
- **`swipe`의 `durationMs`는 조건부 스프레드** — 선택 필드로 선언

---

## §C. 산출물

| 파일 | 변경 |
|---|---|
| `src/schema/command-payloads.ts` | 신설 — 페이로드 타입 10개 |
| `src/schema/command-payloads.test.ts` | 신설 — 키 집합 계약 테스트 |
| `src/cli/commands/*.ts` (10개) | `success()`에 타입 인자 명시 |
| `src/cli/router.test.ts` 또는 신규 | `doctor` 갈래별 런타임 키 집합 테스트 |

## §D. 완료 조건

AC 8건 충족 · 게이트 통과 · **깨뜨리기 실험 2건의 오류 메시지가 기록됨** ·
실기기 키 집합이 §A.1과 동일.
