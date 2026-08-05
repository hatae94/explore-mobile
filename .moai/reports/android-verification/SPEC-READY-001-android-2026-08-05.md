# SPEC-READY-001 — Android 실기기 검증 기록 (AC-READY-013)

- 일시: 2026-08-05
- 기기: Samsung SM-G960N (Galaxy S9), Android 10 (SDK 29), 1440×2960 (override 1080×2220)
- 연결: USB(`usb:32-4`) + 무선 IP(`192.168.219.104:5555`) — 관측을 위해 조성, 관측 후 원상복구
- adb: 1.0.41 / 36.0.2, `~/Library/Android/sdk/platform-tools/adb` (**PATH에는 없음**)
- 대상 커밋: `ab2f633` (SPEC 0.5.2, `status: completed`, origin/master와 `0 0`)

이 문서는 **기록 전용**이다. SPEC은 이미 마감·푸시됐고, 아래 내용을 반영하려면 별도 amendment(0.6.0)가 필요하다. 이번 관측은 AC를 뒤집지 않고 **확인**해 주는 방향이므로 amendment는 착수하지 않았다.

---

## 0. 왜 이 관측이 미뤄져 있었나

AC-READY-013은 `e2e·manual` — 같은 물리 기기가 **둘 이상의 전송으로 잡히는** 실기기가 있어야 성립한다. 마감 시점에는 그 상태가 없어 미관측으로 남았다.

이번 세션 진입 시에도 없었다. `adb devices -l`이 `SM_G960N`을 **1행**만 보였고, CLI `devices`의 `alternateSerials`는 `[]`였다. 합치기가 실패한 것이 아니라 **합칠 대상이 없었다.**

### 이 폰에는 "무선 디버깅" 토글이 없다

```
$ adb shell settings get global adb_wifi_enabled
null
$ adb shell getprop ro.build.version.sdk
29
```

`adb_wifi_enabled`는 Android 11부터 생기는 키다. 이 폰은 Android 10이라 개발자 옵션에 무선 디버깅 스위치 자체가 없고, **손으로 켤 방법이 없다.** 두 번째 전송을 만드는 유일한 길은 USB 연결 위에서 `adb tcpip <port>`다. 다음 관측자가 개발자 옵션을 뒤지느라 시간을 쓰지 않도록 남긴다.

### 조성 절차 (되돌리는 법 포함)

```
$ adb tcpip 5555                        # restarting in TCP mode port: 5555
$ adb wait-for-device
$ adb connect 192.168.219.104:5555      # connected

  ... 관측 ...

$ adb disconnect 192.168.219.104:5555
$ adb usb                               # restarting in USB mode
```

폰 화면은 건드리지 않았고, 앱 설치·데이터 변경도 없다.

---

## 1. Given 성립 — 같은 model이 2행

```
$ adb devices -l
2beb9d2309037ece       device usb:32-4 product:starlteks model:SM_G960N transport_id:2
192.168.219.104:5555   device         product:starlteks model:SM_G960N transport_id:3
```

전송 조합은 **USB + 무선 IP**. AC가 "전송의 종류는 묻지 않는다"로 넓혀 둔 덕에 그대로 성립한다.

---

## 2. Then — ①②③④ 전부 성립

### ① `devices`에서 1개 항목

```
$ node dist/cli/bin.js devices
{"serial":"192.168.219.104:5555","model":"SM_G960N","osVersion":"10",
 "connectionState":"device","unavailableReason":null,
 "alternateSerials":["2beb9d2309037ece"],"isEmulator":false,"platform":"android"}
```

원본 adb는 2행인데 CLI는 안드로이드 항목 1개 — 그룹핑이 실제로 일하고 있다는 대조다. (나머지 2개 항목은 별개의 iOS 기기)

### ② `alternateSerials`에 나머지 전송

대표 `192.168.219.104:5555`, 부속 `["2beb9d2309037ece"]`.

대표가 **무선** 쪽으로 잡힌 것은 설계대로다. `src/backend/device-grouping.ts:23-29`가 그룹 내 **사전순 첫 전송 시리얼**을 대표로 삼는다고 적고 있고, `"192..."` < `"2beb..."`(`'1'` < `'2'`)이다. 같은 주석이 "재연결 간 안정성 주장이 아니다"라고 명시해 둔 점도 확인했다 — 무선 시리얼이 재연결마다 바뀔 수 있다는 기존 관측과 어긋나지 않는다.

### ③ 두 시리얼 모두 같은 기기를 대상으로 함 — 경로 A (`resolveTargetDevice`)

```
$ node dist/cli/bin.js screenshot --device 192.168.219.104:5555 --out shot-wifi.png
{"ok":true,"command":"screenshot",
 "data":{"serial":"192.168.219.104:5555","byteLength":1149613}}

$ node dist/cli/bin.js screenshot --device 2beb9d2309037ece --out shot-usb.png
{"ok":true,"command":"screenshot",
 "data":{"serial":"192.168.219.104:5555","byteLength":1149613}}
```

`DEVICE_NOT_FOUND` 없음. 부수 관측 두 가지:

- 응답의 `serial`이 **양쪽 모두 대표로 정규화**됐다 — 부속으로 요청해도 돌아오는 값은 대표다.
- `byteLength`가 1,149,613으로 동일 — 같은 화면을 찍었다.

### ④ `devices --device <부속시리얼>`도 그 기기를 돌려줌 — 경로 B (자체 필터)

```
$ node dist/cli/bin.js devices --device 192.168.219.104:5555   → 합쳐진 항목 1개
$ node dist/cli/bin.js devices --device 2beb9d2309037ece       → 합쳐진 항목 1개 (동일)
```

AC가 ④를 따로 지목한 이유 — `devices`만 공용 경로를 안 쓰므로 혼자 깨진 채 남을 수 있다 — 를 코드로도 확인했다. `src/cli/commands/devices.ts:26`이 `matchesRequestedSerial`을 쓰고, 그 술어가 `device.serial === requested || device.alternateSerials.includes(requested)`이다. `grep -rln resolveTargetDevice src/cli/commands/`에 `devices.ts`가 걸리지만 **4행 주석**이며 호출이 아니다.

---

## 3. 음성 대조 — 검사가 살아 있다

합쳐진 상태에서 없는 시리얼을 넣으면 두 경로 모두 거부한다:

```
$ node dist/cli/bin.js devices    --device NOPE-NOT-A-REAL-SERIAL → DEVICE_NOT_FOUND
$ node dist/cli/bin.js screenshot --device NOPE-NOT-A-REAL-SERIAL → DEVICE_NOT_FOUND
```

검사가 죽어서 통과한 것이 아니다.

---

## 4. 원상복구 확인

```
$ adb devices -l               → SM_G960N 1행 (usb:32-4)
$ node dist/cli/bin.js devices → alternateSerials: []
$ adb connect 192.168.219.104:5555 → failed to connect: Connection refused
```

---

## 5. 부수 관측 — `osVersion`이 빈 문자열로 나온 적이 있다 (별건, 판정 보류)

`adb usb` 직후 **첫** `devices` 호출에서:

```
{"serial":"2beb9d2309037ece","model":"SM_G960N","osVersion":"", ...}
```

2초 간격 3회 재확인은 모두 `"10"`이었고, `adb shell getprop ro.build.version.release`도 `10`이었다. adbd 재시작 창에서 `getprop`이 빈 값을 돌려줄 때 CLI가 **오류나 표식 없이 빈 문자열을 그대로 싣는다**는 뜻으로 보인다.

**1회 관측이며, 결함인지 허용된 저하인지는 판정하지 않는다.** 재현 조건(adbd 재시작 직후)이 특수하고, 코드에서 빈 값 처리 지점을 확인하지 않았다. 확인 없이 결함으로 올리지 않는다.

---

## 6. 판정

**AC-READY-013 — PASS** (①②③④ 전부 성립, e2e·manual, 실기기)

SPEC 0.5.2는 `status: completed`이므로 이 판정을 acceptance.md에 반영하려면 amendment(0.6.0)가 필요하다. 이번에는 착수하지 않았다.
