# SPEC-GESTURE-002 M6 — Android 거부 실기기 관측

- 일시: 2026-08-26 00:51~00:52 (KST)
- 기기: SM_G960N · Android 10 · `2beb9d2309037ece` · `connectionState: "device"`
- 판정 무대: 크롬에 열린 위키백과 "넓이" 문서 (개인정보 없음)
- 대상 AC: AC-GEST2-008 e2e·manual 절 (plan.md §F M6 산출물 4번)
- 커밋 기준선: `7db5194` (M1~M5)

캡처는 **남기지 않았다.** `.moai/reports/`는 gitignore 대상이 아니고(`git check-ignore` exit 1),
검증 캡처는 상태바·알림 등으로 식별정보를 함께 담을 수 있다. 판정에 필요한 것은
아래 서술이며, 캡처는 세션 스크래치패드에만 두었다.

## 실행한 것

```bash
node dist/cli/bin.js screenshot --device 2beb9d2309037ece --out <scratch>/and-01-before.jpeg
node dist/cli/bin.js pinch out 250 500 --from <scratch>/and-01-before.jpeg --device 2beb9d2309037ece
node dist/cli/bin.js doubletap 250 500 --from <scratch>/and-01-before.jpeg --device 2beb9d2309037ece
node dist/cli/bin.js screenshot --device 2beb9d2309037ece --out <scratch>/and-02-after.jpeg
node dist/cli/bin.js scroll down --device 2beb9d2309037ece            # 양성 대조
node dist/cli/bin.js screenshot --device 2beb9d2309037ece --out <scratch>/and-03-control.jpeg
```

## 관측 결과

| 인수 기준의 주장 | 관측 | 판정 |
|---|---|---|
| `UNSUPPORTED_GESTURE_ON_ANDROID`를 반환한다 | 핀치·더블탭 모두 해당 코드, 프로세스 exit 1 | PASS |
| `ok:true`로 조용히 넘어가지 않는다 | 둘 다 `"ok":false` | PASS |
| 두 메시지가 서로 다르며 각각 막힌 원인의 **종류**를 이름 붙인다 | 핀치 = "원인은 **OS 보안 정책**입니다 … SELinux(Enforcing)가 `/dev/input/event*` 직접 쓰기를 거부" / 더블탭 = "원인은 **명령 기동 비용**입니다(권한 문제가 아닙니다) … 두 탭 시작 간격 392 ms > 인식 창 250~300 ms" | PASS |
| 재시도가 무의미함을 말한다 | 두 메시지 모두 "재시도해도 결과는 같습니다" | PASS |
| 화면이 변하지 않는다 | 실행 전·후 캡처가 같은 문서·같은 스크롤 위치·같은 시계(12:51). **바이트 수로 판정하지 않았다** — 화면 내용으로 판정했다 | PASS |
| (양성 대조) 화면은 변할 수 있었다 | 이어서 `scroll down` → 표 아래로 이동해 "단위·공식·증명" 절이 새로 나타남(12:52) | PASS |
| **실기기가 실제로 `AdbBackend`로 라우팅되는가** (mock이 못 보는 한 가지) | `UnsupportedGestureOnAndroidError`를 던지는 제품 코드 지점은 `src/backend/adb-backend.ts:882`(`pinch`)와 `:907`(`doubleTap`) **둘뿐**이다(`grep -rn 'UnsupportedGestureOnAndroid' src/ --include="*.ts" \| grep -v '\.test\.ts'`). 실기기가 그 오류를 냈다는 것이 곧 그 두 메서드가 실행됐다는 것이고, 따라서 라우팅됐다 | PASS |

**AC-GEST2-008 e2e·manual 절: PASS.**

## 양성 대조에 관한 주석

"화면이 변하지 않았다"는 주장은 화면이 변할 수 있었음을 함께 보이지 않으면
기기가 멈춰 있던 경우와 구별되지 않는다. 그래서 거부 관측 직후 `scroll down`을
실행해 같은 캡처 경로로 변화가 보이는 것을 확인했다. 대조 없이 남겼다면
"불변"은 부재의 증거가 아니라 관측 실패와 구별되지 않는 서술이 됐을 것이다.

## 이 회차에 확인하지 못한 것

- **AC-GEST2-011 (핀치 확대·축소)** — 미측정. PARTIAL.
- **AC-GEST2-012 (더블탭 + `tap` 2회 대조)** — 미측정. PARTIAL.
- **간격 산식 `narrowGap = round(wideGap / 2)`** (spec.md §C.1-⑨) — 여전히 미검증.
  iOS에서만 답할 수 있는 물음이다.

두 PARTIAL은 `implemented → completed` 전이를 막는다(acceptance.md AC-GEST2-011·012,
plan.md §F M6). 따라서 이 시점에 도달 가능한 최대 상태는 `implemented`다.

### iOS를 하지 못한 이유 (관측된 사실)

아이패드로 진행하려 했으나 WDA 러너 **설치가 거부**됐다.

```
Failed to install embedded profile for com.hatae.WebDriverAgentRunner.xctrunner
: 0xe8008012 (This provisioning profile cannot be installed on this device.)
```

프로비저닝 프로파일의 등록 기기 목록이 아이폰 하나뿐이다 — 아이패드가 없다.

```bash
security cms -D -i ~/.explore-mobile/wda/Build/Products/Debug-iphoneos/\
WebDriverAgentRunner-Runner.app/embedded.mobileprovision > /tmp/prov.plist
plutil -extract ProvisionedDevices json -o - /tmp/prov.plist
# → ["00008130-001238880C13803A"]   (아이폰 UDID 하나뿐)
```

기기 잠금이나 승인 팝업 문제가 아니었다. 아이패드 화면에는 아무것도 뜨지 않았고,
`xcodebuild`는 기기에 닿아 설치 단계까지 간 뒤 프로파일에서 거부됐다.

재빌드 경로는 열려 있다 — `wda-build.ts`의 `xcodebuildArgs`가
`-allowProvisioningUpdates` + `CODE_SIGN_STYLE=Automatic`을 싣고, `wda-doctor.ts:279`가
`.xctestrun`이 **없을 때만** 빌드하므로 기존 산출물을 옮겨 두면 재빌드된다.
필요한 값 셋은 이 회차에 복원했다:

| 환경 변수 | 값 |
|---|---|
| `EXPLORE_MOBILE_IOS_TEAM_ID` | `ZZ7R4865P7` (프로파일의 `TeamIdentifier`) |
| `EXPLORE_MOBILE_IOS_BUNDLE_ID` | `com.hatae.WebDriverAgentRunner` (러너 번들의 `.xctrunner` 접미 제거) |
| `EXPLORE_MOBILE_WDA_SOURCE` | `/Users/hatae/WebDriverAgent` |

## 남긴 기기 상태 (다음 세션이 알아야 할 것)

- **아이폰 WDA가 내려가 있다.** 아이패드에 8100 포트를 넘기려고
  `reset --device 00008130-001238880C13803A`를 실행했고(`noOp:false` — 실제로 내려감),
  다시 올리지 않았다. `doctor --yes --device 00008130-001238880C13803A`로 복구한다.
- `~/.explore-mobile/wda`는 원위치에 있다(재빌드용 백업 이동은 되돌렸다).
- 안드로이드 기기의 브라우저는 위키백과 "넓이" 문서에서 한 화면 스크롤된 상태다.
