---
id: SPEC-IOS-001
title: "iOS 시뮬레이터(idb) 백엔드 — 설계"
version: "0.1.0"
status: draft
created: 2026-07-22
updated: 2026-07-22
author: manager-spec
---

# 설계 — SPEC-IOS-001

> Tier L 설계 문서. 3개 확정 아키텍처 결정(spec.md §A.3)을 상세 설계한다. **번복 가능성 내림차순**: 데이터 모델/인터페이스 diff(§A) → 레지스트리 라우팅(§C) → idb 정규화 파생(§F) → 백엔드/환경 서비스(§B/§E) → 오류 코드(§D). 설계는 관찰 가능한 계약 수준까지만 규정하고 구체 시그니처는 Run 단계 확정.

## §A. 인터페이스 diff (@MX:ANCHOR — 최고 변경 확률)

### A.1 DeviceInfo.platform (가법)

```ts
// src/schema/device-backend.ts (개정)
export type DevicePlatform = "android" | "ios";

export interface DeviceInfo {
  serial: string;
  model: string;
  osVersion: string;
  connectionState: DeviceConnectionState;
  isEmulator: boolean;
  platform: DevicePlatform;   // ★ 신규(가법)
}
```

- 가법 변경: 기존 소비자(device-list-parser, device-targeting)는 필드 무시 가능하나, 생성 지점(각 백엔드 `listDevices`)은 반드시 설정.
- `AdbBackend.listDevices` → `platform: "android"`; `IdbBackend.listDevices` → `platform: "ios"`.

### A.2 dumpUiHierarchy 반환 타입 (정규화 이관)

```ts
// BEFORE
dumpUiHierarchy(serial: string): Promise<string>;      // 원시 XML
// AFTER
dumpUiHierarchy(serial: string): Promise<CommonElement[]>;  // 정규화 완료
```

- **원자적 변경 집합**(하나라도 빠지면 컴파일 실패):
  1. `device-backend.ts`: 메서드 시그니처.
  2. `adb-backend.ts`: `dumpUiHierarchy`가 XML 수집 후 `normalizeUiAutomatorXml(catResult.stdout.toString("utf-8"))`를 내부 호출 → `CommonElement[]` 반환. (기존 dump→cat→cleanup 로직 보존, 마지막 반환만 변경.)
  3. `cli/commands/dump.ts`: `import { normalizeUiAutomatorXml }` 제거; `const elements = await backend.dumpUiHierarchy(target.serial)`.
  4. `cli/commands/tap.ts`(`tapBySelector`): 동일 제거; `const elements = await backend.dumpUiHierarchy(target.serial)`.
  5. `cli/commands/text.ts`(`focusElementBySelector`): 동일 제거.
- **소비자 검증**: `normalizeUiAutomatorXml`의 현재 직접 호출자 = { dump.ts, tap.ts, text.ts, uiautomator.test.ts }. 변경 후 프로덕션 직접 호출자 = { adb-backend.ts } (+ 테스트). `normalize/uiautomator.ts` 자체는 무변경(순수 함수 그대로, 호출 위치만 이동).
- **blast radius(정확 — D4)**: 명령 계층 import-and-call 소비자 = **정확히 3개**(dump.ts/tap.ts/text.ts). 추가로 `src/index.ts:24`의 re-export(`export { normalizeUiAutomatorXml }`)는 **무영향**(심볼 존속 — 파괴 없음). 갱신 필요 테스트(SPEC 구현 범위): `src/cli/router.test.ts`(raw-XML mock + 명령 계층 정규화 단언, `:415` 및 XML 문자열 mock 다수), `src/backend/adb-backend.test.ts`(`dumpUiHierarchy` 문자열 반환 mock + `ADB_COMMAND_FAILED` 기대치).
- **@MX:ANCHOR 유지 근거**: `normalizeUiAutomatorXml`은 여전히 AdbBackend + 테스트에서 호출(fan_in 유지). device-backend.ts는 모든 백엔드/명령이 의존하는 불변 계약 → ANCHOR 강화.

## §B. IdbBackend 설계 (8-명령 parity)

```ts
// src/backend/idb-backend.ts (신규)
export class IdbBackend implements DeviceBackend {
  constructor(private readonly exec: IdbExecutor = spawnIdb) {}
  // 8개 메서드 — 아래 매핑
}
```

| DeviceBackend 메서드 | idb 명령(추정 argv) | 정규화/반환 | 비고 |
|----------------------|---------------------|-------------|------|
| `listDevices()` | `idb list-targets --json` | udid→serial, target_type→isEmulator, platform:"ios" | 필드명 Run 확정(§research §3) |
| `dumpUiHierarchy(serial)` | `idb ui describe-all --udid <serial> --json` | `normalizeIdbAccessibility(json)` → CommonElement[] | 평면 배열(§F) |
| `screenshot(serial)` | `idb screenshot --udid <serial>` | PNG Uint8Array | stdout 스트림 |
| `tap(serial,x,y)` | `idb ui tap --udid <serial> <x> <y>` | void | |
| `inputText(serial,text,opts)` | `idb ui text --udid <serial> "<text>"` | void | Unicode-native, IME 절차 없음; `hideKeyboardAfter` no-op |
| `sendKeyEvent(serial,alias)` | `idb ui key --udid <serial> <HID코드>` | void | 미대응 별칭 거부(§keycodes) |
| `launchApp(serial,bundleId)` | `idb launch --udid <serial> <bundleId>` | void | |
| `stopApp(serial,bundleId)` | `idb terminate --udid <serial> <bundleId>` | void | |

- **executor**: `src/backend/idb-executor.ts` — `spawnIdb: IdbExecutor = (args) => spawnProcess("idb", args)`. `adb-executor.ts`를 정확히 미러(process-executor.ts 위 얇은 래퍼, binary만 "idb"). shell 미사용(argv 배열) — 주입 방지 계승.
- **`--udid` 플래그**: idb의 대상 지정 플래그는 `--udid`로 추정(게이트 결정: **DEFER** — run-phase 확정, plan.md §B.0). 지정 방식이 다르면 이 argv 표만 조정하면 됨(격리 효과).
- **오류 처리**: idb exitCode≠0 → 메시지에 stderr 담아 throw(AdbBackend `assertSuccess` 패턴 미러). 명령 계층이 `BACKEND_COMMAND_FAILED`로, 또는 IdbBackend가 `IDB_COMMAND_FAILED`로 표면화.

## §C. 백엔드 레지스트리 (사용자 대면 라우팅)

### C.1 인터페이스

```ts
// src/backend/registry.ts (신규)
export interface RegisteredBackend {
  platform: DevicePlatform;
  backend: DeviceBackend;
  isAvailable(): Promise<boolean>;   // 도구 설치 여부(adb/idb)
}

export class BackendRegistry {
  constructor(private readonly backends: RegisteredBackend[]) {}
  async listAllDevices(): Promise<DeviceInfo[]>;                 // 가용 백엔드 병합 + platform 태깅
  async resolveBackend(serial: string): Promise<{ backend: DeviceBackend; device: DeviceInfo } | null>;
}
```

### C.2 동작

- **`listAllDevices()`**: 각 `RegisteredBackend`에 대해 `isAvailable()` true인 것만 `listDevices()` 호출 → 결과 병합. 백엔드가 반환한 DeviceInfo에 platform이 이미 설정되어 있음(각 백엔드 책임). 한 백엔드 실패(예: idb executor throw)는 catch하여 그 백엔드만 제외하고 나머지는 진행(graceful degradation — REQ-IOS-ARCH-003).
- **`resolveBackend(serial)`**: `listAllDevices()`에서 serial 매칭 → 소유 백엔드 반환. 미매칭이면 null(명령 계층이 `DEVICE_NOT_FOUND`).
- **graceful degradation**: `isAvailable()` false(도구 미설치)면 그 백엔드는 아예 조회하지 않음 → 0대 기여. idb 미설치 시 Android만, adb 미설치 시 iOS만.

### C.3 크로스-플랫폼 device-targeting 확장

`resolveTargetDevice`(현재 단일 DeviceInfo[] + requestedSerial)는 레지스트리의 병합 목록을 입력받아 그대로 동작한다(로직 변경 최소):
- `--device <serial>` 지정 → 병합 목록에서 매칭. 미매칭 → `DEVICE_NOT_FOUND`.
- 생략 + 0대 → `NO_DEVICE`.
- 생략 + 1대 → 선택.
- 생략 + 2대 이상(플랫폼 가로질러) → `AMBIGUOUS_DEVICE` + 플랫폼별 목록(REQ-IOS-ARCH-004).
- **serial 충돌 엣지**(Android serial == iOS udid, 극히 드묾): `resolveBackend`가 2건 매칭 시 임의 선택 금지 — `AMBIGUOUS_DEVICE`(또는 명시적 `SERIAL_COLLISION`)로 거부. Run 단계 정책 확정.

### C.4 router/bin 스레딩

현재: `runCli(argv, backend, doctor)` — 단일 DeviceBackend + 단일 AdbDoctor. 명령 핸들러는 `(args, backend, doctor)` 수신.

개정안(설계 옵션 — Run 단계 확정):
- `bin.ts`: `AdbBackend`+`IdbBackend`+각 환경서비스로 `BackendRegistry`와 `DoctorRegistry`(§E) 구성 → `runCli(argv, registry)`.
- `router.ts`/`CommandHandler`: 핸들러가 레지스트리를 받아 (a) 대상 serial 해석 → 소유 백엔드 확보, (b) 그 백엔드로 명령 수행. 즉 핸들러 시그니처가 `(args, registry)` 또는 `(args, resolvedBackend, resolvedDoctor)`로 조정.
- **하위호환**: 기존 테스트가 `runCli(argv, backend)`를 다수 호출하므로, 레지스트리를 단일 백엔드로 감싸는 어댑터(단일-백엔드 레지스트리) 또는 오버로드로 브리지하여 마이그레이션 비용 최소화(design 옵션 — Run 단계 결정). `reset.ts`의 `backend instanceof AdbBackend` 내로잉 패턴은 유지(IdbBackend는 해당 분기 스킵).

## §D. 오류 코드 일반화 (7개 파일 · 우선순위 확정)

- 레지스트리 경유 명령 계층 **7개 파일**(`dump.ts`/`tap.ts`/`text.ts`/`screenshot.ts`/`launch.ts`/`stop.ts`/`key.ts` — 각 `:26`대 `ADB_COMMAND_FAILED`)이 플랫폼 비종속 → catch 지점 플랫폼 미인지. 7개 전부 `ADB_COMMAND_FAILED` → `BACKEND_COMMAND_FAILED`(중립). 8-명령 parity로 이들 전부 IdbBackend로도 라우팅되므로, 미변경 시 iOS 실패에서 Android 특정 코드 누출.
- **오류 코드 우선순위(D7 — 결정적)**: 명령 계층 catch = 최종 경계 → top-level `error.code = BACKEND_COMMAND_FAILED`가 idb 서브프로세스 일반 실패에 항상 우선. `IDB_COMMAND_FAILED`(IdbBackend 내부)는 `message`/`details` 세부로 실림(top-level 아님). 명령 핸들러가 `instanceof`로 인식하는 타입 지정 오류는 그 자체 코드 우선(text.ts 기존 패턴). 우선순위: **타입 지정 인식 오류 > `BACKEND_COMMAND_FAILED` > (message/details의) `IDB_COMMAND_FAILED`**.
- **계약 변경**: CLI JSON `error.code` 변경 → 기존 테스트/소비자 갱신(`router.test.ts`/`adb-backend.test.ts` 등 `ADB_COMMAND_FAILED` 기대치). 대안(플랫폼별 코드)은 catch 지점 플랫폼 판별 곤란으로 기각.
- `envelope.ts`의 `failure()`는 무변경(코드 문자열만 다르게 전달).

## §E. iOS 환경 서비스 (AdbDoctor 병렬)

```ts
// src/backend/idb-doctor.ts (신규)
export class IdbDoctor {
  async checkIdbInstalled(): Promise<{ installed: boolean; version: string | null }>;
  async checkCompanion(): Promise<{ present: boolean }>;
  async checkSimulatorBooted(serial?: string): Promise<{ booted: boolean; message?: string }>;
  async installGuidance(): Promise<InstallGuidance>;  // macOS pip/brew 안내 or 비-macOS 미지원
  async resetDevice(serial: string): Promise<IosResetResult>;  // near-no-op
}
```

- **점검**: `idb --version`(설치), `idb_companion` 존재(brew 경로/PATH), 부팅 시뮬레이터(`idb list-targets`에 Booted 상태).
- **설치 정책**: iOS 시뮬레이터는 **macOS + Xcode 전용**. macOS: `pip3 install fb-idb==1.1.8` + `brew tap facebook/fb && brew install idb-companion` 안내(자동 설치는 사용자 동의 후 — SPEC-01 REQ-DOCTOR-002 정신 계승, 무음 금지). 비-macOS: 미지원 명시(설치 시도 없음).
- **reset 의미(near-no-op — REQ-IOS-DOCTOR-004)**: iOS에는 제거할 ADBKeyBoard도, 복원할 세션 IME도, 잔여 임시 파일도 없다(idb 텍스트는 무상태 Unicode-native, describe-all/screenshot은 스트림). 따라서 `resetDevice`는:
  - 관찰 가능한 정리 동작 없음 → `{ noOp: true, message: "iOS는 정리할 IME/APK 상태가 없습니다 (idb 텍스트는 무상태)." }` 보고.
  - 시뮬레이터 erase(`idb`의 파괴적 초기화)는 **의미가 다르므로 강제하지 않는다**(사용자가 명시 요청하지 않는 한 미수행).
- **doctor/reset 플랫폼 분기(REQ-IOS-DOCTOR-003)**: 대상 기기의 `platform`으로 환경 서비스 선택. 기기 미지정 일반 `doctor`는 두 환경(adb+idb) 가용성을 함께 보고. `DoctorRegistry`(platform→서비스) 또는 명령 핸들러 내 분기(`device.platform === "ios" ? idbDoctor : adbDoctor`).

## §F. idb 정규화 파생 (핵심 순수 함수)

```ts
// src/normalize/idb.ts (신규)
export function normalizeIdbAccessibility(json: unknown): CommonElement[];
```

### F.1 매핑(검증됨 — research.md §2)

| CommonElement | idb 소스 | 파생 규칙 |
|---------------|----------|-----------|
| `role` | `type`(1차) / `role`(보조) | `type` 우선; 없으면 `role`; 둘 다 없으면 `""` |
| `text` | `AXLabel`(1차) | `AXLabel`; (입력 필드 값은 `AXValue` — §F.2 결정) |
| `id` | `AXUniqueId` | 문자열; 없으면 `""` |
| `bounds` | `frame{x,y,width,height}` | `{ x, y, w: width, h: height }`; 누락/비수치 → `{0,0,0,0}` |
| `tappable` | 파생 | §F.3 |
| `enabled` | `enabled` | 불리언; **NOT `isEnabled`** |
| `children` | (없음) | `[]` — describe-all은 평면 배열 |

### F.2 text 소스 결정(AXLabel vs AXValue)

- 기본: `text ← AXLabel`(요소의 접근성 라벨).
- 입력 필드의 **현재 값**은 `AXValue`에 담긴다(라벨과 값이 다를 수 있음). SPEC-01의 `text` 셀렉터/덤프 소비 목적은 "라벨로 요소 찾기"이므로 `AXLabel` 기본이 적절.
- Run 단계: 입력 필드 값 확인이 필요한 유스케이스가 있으면 `AXValue`를 보조 필드로 노출하거나 `text` 폴백(`AXLabel || AXValue`) 결정. 본 설계 기본은 `AXLabel` 단독.

### F.3 tappable 파생 (정정 — AXTraits 부재)

```
tappable =
  ( type ∈ INTERACTIVE_TYPES        // {Button, Cell, TextField, Switch, Link, ...}
    OR role/subrole 상호작용 지시
    OR custom_actions.length > 0 )
  AND enabled === true
```

- **AXTraits 미사용**: idb 출력에 `AXTraits`가 존재하지 않음(research.md §2). SPEC-01 §F.9.1의 AXTraits 기반 규칙은 폐기하고 위 규칙으로 대체.
- Android `clickable && enabled → tappable`과 **의미상 대칭**(상호작용 가능 AND 활성).
- `INTERACTIVE_TYPES` 최종 집합은 Run 단계 실 픽스처로 보정(다양한 iOS 요소 타입 관찰 후 확정).
- `custom_actions` 비어있지 않음을 상호작용 신호로 포함(예시 요소 `"custom_actions":["Edit mode","Today"]` — 상호작용 가능 요소가 액션을 가짐).
- **스키마 doc-comment 정정(D5)**: `src/schema/common-element.ts`의 iOS 매핑 주석이 옛 `derived(AXTraits, isEnabled) -> tappable` 가정 + `AC-ANDROID-006 (design-only)` 참조를 담고 있어, 본 파생 규칙(AXTraits 부재, `enabled`) + 실 구현으로 정정한다(M1/M3, spec.md §F @MX 대상).

### F.4 never-throws

- `json`이 배열이 아니거나 파싱 실패 → `[]`. 개별 요소 매핑 실패 → 그 요소 스킵 또는 안전 기본값. SPEC-01 `normalizeUiAutomatorXml`의 graceful 계약을 그대로 계승(runtime boundary guard).

## §G. iOS 키 별칭 → HID (부분 맵)

```ts
// src/backend/keycodes-ios.ts (신규) — 값은 USB HID usage, Run 단계 확정
export const IOS_HID_KEYCODE: Partial<Record<KeyAlias, number>> = {
  enter: /* Return */,  del: /* Backspace */,
  up:/*..*/, down:/*..*/, left:/*..*/, right:/*..*/, tab:/*..*/,
  // home/back/menu/app_switch/power/volume_* → 미대응(HID 키보드 없음)
};
```

- 별칭 어휘(`schema/key-alias.ts`)는 백엔드 비종속 계약 → 무변경. Android는 `keycodes.ts`(KEYCODE), iOS는 `keycodes-ios.ts`(HID) 각자 소유(SPEC-01의 "별칭은 계약, 코드맵은 백엔드별" 원칙 계승).
- 미대응 별칭 → `IdbBackend.sendKeyEvent`가 `UNSUPPORTED_KEY_ON_IOS` throw → 명령 계층 graceful 오류(무음 금지).
- 정확한 HID 값은 표준(USB HID Usage Tables) 기준 가정, idb 해석은 run-phase 확정(게이트 결정: **DEFER** — plan.md §B.0).

## §H. 교차 참조

- 요구사항/스키마: `spec.md`
- 마일스톤/필드 매핑 표(§F.9): `plan.md`
- 인수 기준: `acceptance.md`
- idb JSON 검증/명령 시그니처/버전: `research.md`
- 토대 인터페이스: `src/schema/device-backend.ts`, `src/backend/adb-backend.ts`, `src/normalize/uiautomator.ts`, `src/normalize/element-query.ts`, `src/cli/{router,bin,device-targeting}.ts`, `src/backend/doctor.ts`
