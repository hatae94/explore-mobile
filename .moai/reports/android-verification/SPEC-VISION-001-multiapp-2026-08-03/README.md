# SPEC-VISION-001 — Android 다중 앱 실기기 검증 (2026-08-03)

M1·M2가 미뤄둔 D등급 AC를 닫은 뒤, **설치된 여러 앱에서 추가 검증**한 기록.
각 주장에는 이 디렉터리의 스크린샷 파일명을 근거로 붙인다.

## 측정 조건 (baseline 귀속)

```
트리   : HEAD = 4ca5260 (M2 커밋). 소스 코드 변경 없음 — 검증만 수행
기기   : R3CY106LKVX / SM-S938N / Android 16 / USB 유선
화면   : 1440x3120, density 600(3.75x), 디스플레이 1개, 터치 슬롭 30px
대조   : 181199e (pre-M1) — 별도 git worktree에 펼쳐 빌드 후 제거. master 미변경
IME    : com.android.adbkeyboard/.AdbIME
```

앱 선정 기준: 금융·메신저·개인정보 앱은 **전부 제외**(스크린샷이 증거로 남으므로).
설치된 서드파티 앱 198개 중 아래 4개 + 시스템 설정을 사용했다.

## 앱별 검증 결과

| # | 앱 | 검증 목적 | 결과 |
|---|---|---|---|
| 1 | `com.android.settings` | `getScreenSize` 실기기 파싱 · 제거 전후 좌표 대조 | PASS |
| 2 | `com.sec.android.app.popupcalculator` | 비전 루프 e2e (좌표 탭 명중) · `launch -p` 회귀 | PASS |
| 3 | `com.wbrawner.simplemarkdown` | 한글+이모지 입력 | PASS (단, **결함 1건 발견**) |
| 4 | `com.vitotechnology.StarWalk2Free` | 전체화면 Unity 앱에서 OLD/NEW 화면 크기 도출 대조 | 발산 미재현 |
| 5 | `com.sec.android.app.clockpackage` | `launch -p` 회귀 · `getScreenSize` 재확인 | PASS |

---

## 1. 설정 — 제거 전후 좌표 대조 (AC-VISION-005)

**증거**: `01-settings-before-scroll.png` `02-settings-after-scroll-NEW.png` `03-settings-after-scroll-OLD.png`

```
무대 리셋 절차: stop -> launch (매 측정 전)

OLD(181199e, dump 파생)   "from":{"x":720,"y":2262},"to":{"x":720,"y":858}   x3
NEW(4ca5260, wm size 파생) "from":{"x":720,"y":2262},"to":{"x":720,"y":858}   x3
```

3쌍 전부 일치. 스크롤 결과 화면도 동일(시계·배터리 표시만 상이).

---

## 2. 계산기 — 비전 루프 end-to-end (AC-VISION-033 Android)

**증거**: `04-calc-launch.png` `05-calc-after-tap-1.png` `06-calc-after-equals-3.png`

캡처 → 스크린샷에서 좌표 판정 → 탭 → 검증 캡처의 전 경로를 돌렸다.
스크린샷 표시 배율(923x2000 → 1440x3120, x1.56)을 곱해 실제 좌표를 산출했다.

| 버튼 | 표시 좌표 | 실제 좌표 | 결과 |
|---|---|---|---|
| `1` | (145, 1645) | (226, 2566) | 화면에 `1` 표시 |
| `+` | (780, 1645) | (1217, 2566) | — |
| `2` | (355, 1645) | (554, 2566) | — |
| `=` | (780, 1850) | (1217, 2886) | 화면에 **`3`** 표시 |

**오라클**: `ok:true`가 아니라 **화면에 표시된 숫자**. `1 + 2 = 3`이 맞았으므로
좌표 4개 전부 의도한 요소에 명중했다.

**부수 확인**: `launch`가 계산기를 정상적으로 열었다. 이 앱은 이전에
`am start -p`(암시적 인텐트)로 열리지 않던 사례이며, 명시적 컴포넌트 시작으로
바뀐 수정이 실기기에서 회귀 없이 동작함을 재확인했다.

---

## 3. Simple Markdown — 한글+이모지 입력, 그리고 무음 실패 결함

**증거**: `07-markdown-launch-dialog.png` `08-markdown-SILENT-FAILURE.png` `09-markdown-korean-ok.png`

### 3.1 발견한 결함 — `text`가 포커스 없이도 `ok:true`를 반환한다

편집기 **본문 한가운데**(1440x3120 기준 718, 780)를 탭한 뒤 입력을 보냈더니:

```
$ node dist/cli/bin.js text '안녕하세요 반갑습니다 🙂' --device R3CY106LKVX
{"ok":true,"command":"text","data":{"serial":"R3CY106LKVX"}}
```

그러나 화면은 플레이스홀더 그대로였다(`08-markdown-SILENT-FAILURE.png`).
스크린샷 바이트 크기가 직전 캡처와 완전히 동일(65886)해 화면 무변화가 먼저 드러났다.

입력 직후 관측한 상태:

```
default_input_method = com.android.adbkeyboard/.AdbIME   (IME 전환 성공)
mBoundToMethod       = true                              (바인딩 완료)
mInputShown          = false
mServedView          = DecorView{... 0,0-1440,3120}[MainActivity]
```

**원인**: 비어 있는 편집기의 EditText는 한 줄 높이만 차지하므로, 본문 한가운데를
탭한 좌표는 입력란 *아래의 빈 공간*이었다. 포커스가 잡히지 않아 브로드캐스트가
착지할 곳이 없었고, 그럼에도 `text`는 `ok:true`를 반환했다.

플레이스홀더 글자 위(225, 621)를 탭하니 포커스가 잡혔다:

```
mInputShown  = true
mServedView  = h7{... VFED..... .F...... 0,0-1440,3120 ...}
```

### 3.2 포커스 확보 후 입력 — 성공

**증거**: `09-markdown-korean-ok.png`

`안녕하세요 반갑습니다 🙂`가 그대로 입력됐다. 제목이 `Untitled.md` →
`Untitled.md*`로 바뀐 것(별표 = 미저장 변경)이 앱 상태 기반의 두 번째 오라클이다.

### 3.3 미해결로 남기는 것

이 결함을 **기계적으로 검출할 방법은 이번에 확정하지 못했다.** 관측된
`mServedView` / `mInputShown` 차이는 실패/성공 사례에서 갈렸지만, 기존 기록에
"`mServedView`는 입력 성공 여부의 오라클이 아니다 — 입력이 실제로 들어간
경우에도 `null`로 나온다"는 반례가 있다. 따라서 이 두 필드를 판별식으로
채택하려면 **별도 검증이 선행되어야 한다.** 이 문서는 결함의 존재만 기록한다.

---

## 4. Star Walk 2 — 전체화면 Unity 앱에서의 OLD/NEW 대조

**증거**: `10-starwalk-fullscreen-splash.png` `11-starwalk-after-scroll.png`

`progress.md`에 기록한 잔여 위험 — "루트 요소 bounds가 화면 전체와 다른 앱에서는
두 방식이 갈릴 수 있다" — 을 정면으로 시험했다. 이 앱은 상태바·내비게이션바가 없는
완전 몰입형 전체화면이며 Unity 기반(`MessagingUnityPlayerActivity`)이다.

```
OLD(181199e, dump 파생)   "from":{"x":720,"y":2262},"to":{"x":720,"y":858}
NEW(4ca5260, wm size 파생) "from":{"x":720,"y":2262},"to":{"x":720,"y":858}
```

**결과: 발산 미재현.** 두 방식이 같은 값을 냈다.

**이것이 증명하지 않는 것**: 위험이 해소됐다는 뜻이 아니다. 이 기기의 이 앱에서
루트 DecorView bounds가 `0,0-1440,3120`으로 화면 전체와 일치했을 뿐이다.
분할화면·팝업뷰·프리폼 윈도우 등 루트 bounds가 실제로 달라지는 조건은
시험하지 못했다.

---

## 5. 시계 — `launch` 회귀 + `getScreenSize` 재확인

**증거**: `12-clock-launch.png`

```
$ node dist/cli/bin.js launch com.sec.android.app.clockpackage --device R3CY106LKVX
{"ok":true,...}
$ node dist/cli/bin.js scroll down --device R3CY106LKVX
{"ok":true,...,"from":{"x":720,"y":2262},"to":{"x":720,"y":858}}
```

계산기와 함께 `am start -p`로 열리지 않던 사례. 정상 실행 확인.

---

## 종합 — `getScreenSize` 일관성

`wm size` 기반 화면 크기 도출이 **성격이 다른 4개 무대**에서 동일한 값을 냈다.

| 무대 | 유형 | scroll 좌표 |
|---|---|---|
| 설정 | 시스템 앱, 일반 창 | 720,2262 → 720,858 |
| Star Walk 2 | Unity, 몰입형 전체화면 | 720,2262 → 720,858 |
| 시계 | 시스템 앱, 탭 UI | 720,2262 → 720,858 |
| (계산기) | 스크롤 없음 — 좌표 탭으로 검증 | — |

## 미검증으로 남는 것

1. **`text` 무음 실패의 기계적 검출 방법** — §3.3. 별도 SPEC 후보.
2. **분할화면·팝업뷰·프리폼 윈도우** — §4. 루트 bounds가 실제로 달라지는 조건.
3. **화면 크기 override(`wm size WxH`)가 설정된 기기** — 미관측.
4. **AC-VISION-031 (`--web` 회귀)** — 브라우저 무대 미구성.
5. **AC-VISION-024의 "이후" 값** — M5(열거 1회화) 완료 후에만 측정 가능.

## 잔여 위험

- 좌표 판정에 스크린샷 표시 배율(x1.56)을 사람이 곱해야 한다. M2가 `--id`/`--text`
  셀렉터를 제거했으므로 배율 계산을 우회할 CLI 경로가 더 이상 없다. 이번 검증은
  전부 명중했지만, 배율을 빠뜨리면 조용히 다른 곳을 탭한다.
- CLI는 `spawnAdb`가 바이너리명을 `"adb"`로 고정한다. PATH에 adb가 없으면 Android
  기기를 전혀 보지 못하며, 이번 검증은 PATH를 보정한 상태에서 수행했다.
  `doctor`는 이 상태를 `adb:{installed:false}` + 복구 안내로 정확히 보고한다.
