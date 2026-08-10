# SPEC-IMAGE-001 — progress.md

## §A 개요

캡처 이미지 처리 개선. Tier M · TDD · M1~M6.

---

## §B 근거로 삼은 실측 (2026-08-10, plan-phase)

측정 조건: `master` 브랜치 HEAD `8c8e0b6`, `dist/cli/bin.js` 기존 빌드, macOS Darwin 25.6.0.

| 항목 | Android SM_G960N (2beb9d2309037ece) | iPad Pro 12.9 (00008103-000458360A63401E) |
|---|---|---|
| 해상도 | 1080×2220 | 2732×2048 |
| PNG 크기 | 2,300,794 B | 7,892,077 B |
| 캡처 소요 | 2.39 s | 0.94 s |
| base64 모드 JSON 길이 | 3,067,792 자 | (미측정) |

축소 실측 (`sips -Z <W>`, JPEG q75):

| 대상 | 원본 PNG | 1568 PNG | 1568 JPEG | 1024 JPEG | 768 JPEG |
|---|---|---|---|---|---|
| Android | 2,247 KB | 1,414 KB | 85 KB | 40 KB | 26 KB |
| iPad | 7,707 KB | 2,683 KB | 267 KB | 111 KB | 65 KB |

축소 소요: 0.108 s (iPad 7.7 MB → 1568px).

판독 확인 1건: iPad 1024px JPEG q75(111 KB)에서 메일 위젯 본문 미리보기까지 판독됨. **홈 화면 1장 관측이며 일반화하지 않는다** — AC-IMAGE-016이 닫는다.

코드 확인:
- `src/cli/commands/screenshot.ts:18` — 바이트 무가공 통과
- `src/schema/command-payloads.ts:66-73` — 기하 필드 부재
- `src/backend/wda-backend.ts:398,406` — 배율을 감싸지 않은 캡처에서 도출 (이중 배율 위험의 근원)
- `src/cli/args.ts:57-83` — 옵션 8종
- `package.json` — 런타임 의존성 0개

---

## §C 사용자 결정 (plan-phase)

| 축 | 결정 |
|---|---|
| 범위 | 축소·포맷 변환 + 기하 정보 응답 + CLI 좌표 변환. `--crop` 제외 |
| 기본값 | 축소를 **기본**으로, `--full`로 원본 |
| 좌표 변환 | **CLI가 맡는다** (사이드카 기록) |
| 처리 수단 | **macOS 내장 `sips`** (의존성 0개 추가) |
| 추가 요구 | "이미지 변환에 따른 좌표 계산에 대해 세부검증이 꼭 필요함" → acceptance.md REQ-IMAGE-004 블록(4-a ~ 4-d, AC 14건) |

---

## §D 산출물

| 파일 | 상태 |
|---|---|
| `spec.md` | 작성 완료 |
| `plan.md` | 작성 완료 |
| `acceptance.md` | 작성 완료 (AC 42건) |
| `progress.md` | 작성 완료 |

---

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-10
tier: M
artifacts: 3 (spec.md + plan.md + acceptance.md)
ac_count: 42
d_grade_ac_count: 14
```

위 두 수치는 손으로 센 값이 아니라 아래 명령의 출력이다 (재확인 시 같은 명령을 다시 돌린다):

```bash
grep -o 'AC-IMAGE-[0-9]\{3\}' .moai/specs/SPEC-IMAGE-001/acceptance.md | sort -u | wc -l   # ac_count
grep -o '\*\*D\*\*' .moai/specs/SPEC-IMAGE-001/acceptance.md | wc -l                        # d_grade_ac_count
```

미검증으로 남긴 것 (plan-phase 시점):

- `DEFAULT_MAX_EDGE` / `DEFAULT_QUALITY` / `CAPTURE_STALE_MS` 기본값 — M5 실측이 확정한다
- Android 캡처 2.39 s의 원인 — 계측하지 않았다. 근거 없이 캡처 경로를 바꾸지 않는다 (spec.md §C.5)
- 밀집 화면에서의 축소 판독 가능성 — AC-IMAGE-016
- iPad base64 모드 JSON 길이 — Android만 측정

---

## §E.2 Run-phase Evidence

구현: M1~M6. 방법론 TDD(RED-GREEN-REFACTOR). 실기기 검증 2026-08-10.

### 산출 파일

| 파일 | 성격 |
|---|---|
| `src/image/constants.ts` | 신규 — 상한/포맷/품질/신선도 상수 |
| `src/image/transform.ts` | 신규 — `sips` 축소·재인코딩 |
| `src/image/geometry.ts` | 신규 — 기하 타입 + 좌표 변환 + 사이드카 |
| `src/image/image-errors.ts` | 신규 — 오류 3종 |
| `src/cli/commands/from-capture.ts` | 신규 — `--from` 공유 변환 지점 |
| `src/schema/command-payloads.ts` | 변경 — `ScreenshotPayload`에 기하 7필드 |
| `src/cli/args.ts` | 변경 — `--full`/`--max-edge`/`--format`/`--quality`/`--from`/`--stale-ok` |
| `src/cli/validators.ts` | 변경 — `parseMaxEdge`/`parseQuality`/`parseImageFormat` |
| `src/cli/commands/screenshot.ts` | 변경 — 기본 축소 + 기하 + 사이드카 |
| `src/cli/commands/{tap,swipe,scroll}.ts` | 변경 — `--from` 배선 |
| `.claude/skills/explore-mobile/SKILL.md` | 변경 — M6 문서 동기화 |
| (+ 각각의 `.test.ts`) | 신규/변경 |

### M5 실기기 실측 (2026-08-10)

기기: Android SM_G960N `2beb9d2309037ece` (10) / iPad Pro 12.9 `00008103-000458360A63401E` (26.5.2).
환경: macOS Darwin 25.6.0. **알림 배너·팝업은 어느 회차에서도 관측되지 않았다 — 무효 회차 0건**(spec.md §C.4).

**확정된 기본값** (`--max-edge` 1024, JPEG q75) 기준 실측:

| 항목 | Android | iPad |
|---|---|---|
| 출력 해상도 | 498×1024 | 1024×767 |
| 배율 | 2.168675 | 2.667969 |
| 파일 크기 | 2,300,794 → **41,237 B** (98.2% 감소) | 7,892,077 → **113,223 B** (98.6% 감소) |
| `--full` 해상도 | 1080×2220 | 2732×2048 |
| 캡처 소요 (기본 / `--full`) | 2.53 s / 2.34 s | 0.59 s / 0.49 s |
| base64 모드 JSON | 3,067,792 → **55,350자** (98.2% 감소) | 미측정 |

해상도·크기는 응답이 스스로 보고한 값이 아니라 `sips -g pixelWidth -g pixelHeight`로 **파일에서 독립 측정**한 값이다.

### AC-IMAGE-015 — 3개 배율 명중 (같은 목표: 전화 앱 아이콘)

| 회차 | 캡처 상한 | scale | 이미지 좌표 | 변환된 기기 좌표 | 결과 |
|---|---|---|---|---|---|
| 1 | `--full` | 1.000000 | (161, 1955) | (161, 1955) | 다이얼러 열림 |
| 2 | 1024 | 2.168675 | (74, 902) | (160, 1956) | 다이얼러 열림 |
| 3 | 640 | 3.472669 | (46, 563) | (160, 1955) | 다이얼러 열림 |

세 배율의 변환 결과가 **1px 이내로 수렴**했다. 판정은 `ok:true`가 아니라 탭 전후 스크린샷 대조다.

### AC-IMAGE-017/018 — 양성 대조 (왜곡 사본 생성 절차)

대조 대상이 사라지면 대조는 죽으므로, 생성 절차를 여기 남긴다:

```bash
cp p1-before.jpeg p1-distorted.jpeg
node -e 'const fs=require("fs");
  const g=JSON.parse(fs.readFileSync("p1-before.jpeg.geometry.json","utf8"));
  const d={...g, deviceWidth:g.width, deviceHeight:g.height, scale:1};
  fs.writeFileSync("p1-distorted.jpeg.geometry.json", JSON.stringify(d,null,2));'
```

왜곡 내용: 사이드카가 "이 이미지는 763×1568이고 기기도 763×1568, 배율 1.0"이라고 주장하게 만든다.
이것은 **호출자가 배율을 잊었을 때 정확히 하는 실수**의 재현이며, `geometry.ts`의 비균등 거부(가로·세로 배율 1% 초과 불일치)를 통과하도록 device 크기를 함께 맞춘 형태다.

| 회차 | 보낸 기기 좌표 | 탭 전/후 SHA-256 | 판정 |
|---|---|---|---|
| 올바른 배율 | (161, 1955) | 다름 | 다이얼러 열림 |
| **왜곡 배율 1.0** | (114, 1381) | **완전 동일** | 화면 무변화 = 빗나감 |

왜곡하면 빗나갔으므로 검사는 실제로 변환 경로를 탄다. 이 대조가 성립하지 않았다면 AC-IMAGE-013/014/015를 함께 미충족으로 기록해야 했다.

### AC-IMAGE-016 — 3종 화면 판독 (기본값을 확정한 판정)

| 화면 | 밀도 | 1568px | 1024px |
|---|---|---|---|
| Android 홈 화면 | 낮음 | 판독 | 판독 |
| Android 설정 목록 | 중간 (부제목 소자 포함) | 판독 | 미측정 |
| Android 기기정보 화면 | 높음 (일련번호·IMEI 계열 문자열) | 판독 | **판독** |
| iPad 홈 화면 (위젯 본문 미리보기) | 중간 | 판독 | 판독 |
| iOS 설정 상세 화면 | 중간 | 판독 | 미측정 |

**이 결과가 `DEFAULT_MAX_EDGE`를 1024로 확정했다.**

### AC-IMAGE-016 보강 — 실제 웹 앱 UI (사용자 요청으로 추가 실시)

위 3종은 전부 **네이티브 화면**이었고, 표·채팅 타임라인·작은 글씨 웹페이지는 미검증으로 남아 있었다. 사용자가 그 구멍을 지목해 iPad Chrome에서 자신이 운영하는 웹 앱(`htyong.com`)을 탐색하며 추가 판정했다.

| 화면 | UI 종류 | 최소 요소 | 1024px | 768px |
|---|---|---|---|---|
| 모임 목록 | 카드 리스트 | 회색 소자("… 개설"), 하단 탭 라벨 | 판독 | — |
| 모임 상세 | 멤버 목록 + 배지 | 알약 배지("방장"/"멤버"), "최대 15명" | 판독 | — |
| 모임 상세 | **막대그래프** + 투표 진행률 바 | 막대 아래 요일 글자(수/목/금/토/일), "1표 · 50%", 붉은 안내 소자 | 판독 | — |
| 채팅 | 채팅 타임라인 | 말풍선 시각("오후 07:44") | 판독 | — |
| **일정 조율** | **표/그리드 (최고 밀도)** | 이름 배지(하태현/태용), 날짜 칩의 "+1", 막대 우측 아바타 글자 | **판독** | **판독 실패** |

**판독 하한을 처음으로 실측했다**: 일정 조율 화면을 1568 / 1024 / 768 세 상한으로 찍어 대조한 결과,
- 1568 — 전부 선명
- 1024 — 같은 요소를 모두 읽음. 막대 우측 아바타 글자가 한계에 가까움
- **768 — 이름 배지가 분홍 얼룩이 되고 날짜 칩의 요일·"+1"·안내 문구가 판독 불가**

즉 이 UI의 판독 하한은 **768과 1024 사이**에 있다. 1024는 성립하지만 **그 아래로 내릴 여유는 없다** — 확정값 1024는 안전 여유가 큰 값이 아니라 하한에 가까운 값이다.

**작은 표적 탭 정확도**도 같은 화면에서 확인했다: 1024 이미지에서 폭 약 35px인 날짜 칩 "7/3"을 `tap 113 185 --from`으로 눌러 기기 좌표 (301, 494)가 전달됐고, 선택 상태·헤더("7/3 (금)")·막대 데이터가 모두 7/3으로 바뀌었다. 밀집 UI의 작은 표적에서도 변환이 어긋나지 않는다.

### Android 웹 UI 보강 — 그리고 배율만으로는 설명되지 않는 것

위 보강은 iPad 한 기기였으므로 Android 웹 UI가 미검증으로 남았고, 사용자 요청으로 이어서 판정했다.
Android 기기는 `htyong.com`에 로그인돼 있지 않아 로그인 화면까지만 도달했다 — 계정 로그인은 수행하지 않았다.
판독 가능성은 사이트가 아니라 배율·레이아웃의 문제이므로, 공개 밀집 페이지(위키백과 모바일 `대한민국` 문서의 정보상자 표)로 같은 질문에 답했다.

| 화면 | 상한 | 출력 | scale | 최소 요소 | 판독 |
|---|---|---|---|---|---|
| htyong.com 로그인 | 1024 | 498×1024 | 2.169 | 하단 약관 안내 소자 | 판독 |
| 위키백과 본문 | 1024 | 498×1024 | 2.169 | 한자 병기, 위첨자 각주 `[6]` | 판독 |
| 위키백과 **정보상자 표** | 1024 | 498×1024 | 2.169 | `100,432 km² (107 위)`, `51,169,148명[1] (28위)` | 판독 |
| 위키백과 **정보상자 표** | **768** | 373×768 | **2.895** | 위와 동일 | **판독** |

**배율만으로는 설명되지 않는 관측**: Android의 768px 배율(2.895)은 iPad의 1024px 배율(2.668)보다 **크다**. 그런데 iPad는 1024에서 한계에 가깝고 768에서 깨진 반면, Android는 768에서도 여유롭게 읽혔다.

원인은 **앱의 레이아웃 밀도**다. iPad는 데스크톱 폭 레이아웃을 렌더링해 같은 픽셀에 글자를 더 많이 밀어 넣고, Android 폰은 모바일 레이아웃이라 글자가 뷰포트 대비 크다. 따라서 `DEFAULT_MAX_EDGE`를 묶는 제약은 **배율이 아니라 태블릿·데스크톱 폭 레이아웃**이며, 확정값 1024는 그 최악 조건에서 결정된 값이다. Android는 여유가 있다.

이 사실의 실용적 귀결: 판독이 깨지면 의심해야 할 것은 "기기가 무엇인가"가 아니라 **"그 화면이 데스크톱 폭 레이아웃인가"**이다.

**남은 한계**: Android 웹 판정은 위키백과 표 1종 + 로그인 화면 1종이며, `htyong.com`의 실제 앱 화면(그래프·표 그리드)은 Android에서 미검증이다(로그인 필요).

기본값을 되돌리기 전에 **어느 화면에서 깨졌는지를 먼저 기록**해야 한다. 깨지는 회차는 `--max-edge 1568`로 그 회차만 올리면 된다.

### AC-IMAGE-012 — 반올림 잔차 (관측 기록, 임계 판정 아님)

아래 표는 손으로 계산한 값이 아니라 `dist/image/geometry.js`의 `roundingResidual`을 실행해 뽑은 출력이다.

| 배율 세트 | scale | 이미지 좌표 | 기기 좌표 | 잔차 x | 잔차 y | 비고 |
|---|---|---|---|---|---|---|
| `--full` | 1.000000 | (0, 0) | (0, 0) | 0.000 | 0.000 | - |
| `--full` | 1.000000 | (540, 1110) | (540, 1110) | 0.000 | 0.000 | - |
| `--full` | 1.000000 | (1079, 2219) | (1079, 2219) | 0.000 | 0.000 | - |
| Android 498×1024 | 2.168675 | (0, 0) | (0, 0) | 0.000 | 0.000 | - |
| Android 498×1024 | 2.168675 | (74, 902) | (160, 1956) | 0.482 | 0.145 | - |
| Android 498×1024 | 2.168675 | (497, 1023) | (1078, 2219) | 0.169 | 0.446 | - |
| Android 498×1024 | 2.168675 | (498, 1024) | (1079, 2219) | 1.000 | 1.723 | 경계 잘림 |
| iPad 1024×767 | 2.667969 | (0, 0) | (0, 0) | 0.000 | 0.000 | - |
| iPad 1024×767 | 2.667969 | (512, 384) | (1366, 1025) | 0.000 | 0.500 | - |
| iPad 1024×767 | 2.667969 | (1023, 766) | (2729, 2044) | 0.332 | 0.336 | - |
| iPad 1024×767 | 2.667969 | (1024, 767) | (2731, 2046) | 1.000 | 0.332 | 경계 잘림 |

자르지 않은 좌표의 잔차는 반올림 한계인 0.5 이하다. **경계에서 잘린 좌표는 0.5를 넘는다** — 이 사실을 감추지 않고 그대로 남긴다(자르기는 AC-IMAGE-011이 요구한 동작이며, 그 대가가 잔차 증가다).

### 잠정값을 확정으로 바꾼 두 건

| 상수 | 잠정값 | 확정값 | 근거 |
|---|---|---|---|
| `DEFAULT_MAX_EDGE` | 1568 | **1024** | AC-IMAGE-016 3종 화면 판정 (위) |
| `CAPTURE_STALE_MS` | 60,000 | **300,000** | 잠정값 60초로 정상 비전 루프(캡처→판독→탭)를 돌리자 **62초 경과로 거부**됨. 60초는 낡은 캡처가 아니라 정상 사용을 막는 값이었다 |
| `DEFAULT_QUALITY` | 75 | **75** (유지) | 1024px q75에서 밀집 화면 판독 확인 |

`CAPTURE_STALE_MS` 300초의 한계도 함께 남긴다: 이 값은 화면 전환 속도를 잰 값이 **아니다**. 에이전트가 자기 조작으로 화면을 바꾼 직후의 좌표 오용은 초 단위여서 어떤 상한으로도 잡히지 않는다 — 이 검사가 막는 것은 "긴 중단 뒤 재개하며 몇 분 전 캡처로 탭하는 사고"뿐이다.

### 증거 파일

`.moai/reports/image-verification/` 에 회차별 캡처를 보존한다.

**보존하지 않은 캡처와 그 이유**: 기기정보 밀집 화면(`d4-dense-*`)에는 일련번호·IMEI가, iPad 홈 화면(`i-default`, `i2-before`, `i-full`)에는 메일 위젯의 개인 메일 내용이 찍혀 있었다. `.moai/reports/`는 gitignore 대상이 아니므로 커밋되면 그대로 저장소에 남는다 — 판정 결과는 위 표에 남기고 이미지 파일은 삭제했다. `--full` 원본 PNG 2건(각 2.3 MB)도 저장소 비대화를 피해 삭제했다.

---

### AC-IMAGE-042 — 커버리지 변경 전/후 (같은 명령, `npx vitest run --coverage`)

"변경 전"은 작업 트리를 건드리지 않고 `git archive HEAD`를 별도 위치에 펼쳐 `node_modules`를 심볼릭 링크로 걸어 측정했다.

| | 변경 전 (HEAD `8c8e0b6`) | 변경 후 |
|---|---|---|
| 테스트 파일 | 37 | 41 |
| 테스트 | 744 | 805 |
| Statements | **91.4%** (1212/1326) | **91.46%** (1351/1477) |
| Branch | 87.1% | 86.9% |
| Funcs | 88.1% | 88.77% |
| Lines | 93.85% | 93.67% |

**분모 변화**: 1,326 → 1,477 statements (+151). 분모가 11% 늘었는데 비율이 유지됐다 — 새 코드가 기존 평균과 비슷한 밀도로 덮였다는 뜻이다. `quality.yaml`의 `test_coverage_target: 85`를 상회한다.

신규 모듈 커버리지: `src/image` 91.48% / `screenshot.ts` 93.47% / `from-capture.ts` 91.66%.

Branch·Lines가 각각 0.2%p 내려간 것을 감추지 않는다 — 미덮인 줄은 `from-capture.ts:60`(예상치 못한 예외 재던지기), `screenshot.ts:63,74,130`(인자 거부 분기 일부, 백엔드 예외 경로)이다.

### 품질 게이트

| AC | 명령 | exit |
|---|---|---|
| AC-IMAGE-039 | `npx tsc --noEmit -p tsconfig.json` | 0 |
| AC-IMAGE-040 | `npx pnpm build` | 0 |
| AC-IMAGE-041 | `npx vitest run` | 0 |

### 회귀 확인 (M6)

| AC | 명령 | 결과 |
|---|---|---|
| AC-IMAGE-021 | `git diff -U0 src/backend/wda-backend.ts \| grep -E '^[-+].*(scale: screen.width\|ensureGeometry\|captureScreenshot\()'` | 출력 없음 |
| AC-IMAGE-022 | `grep -n 'screenshot(serial: string)' src/schema/device-backend.ts` | `Promise<Uint8Array>` 유지 |
| AC-IMAGE-036 | `git diff --name-only HEAD -- src/webview/` | 빈 결과 |
| AC-IMAGE-037 | `git diff -U0 src/backend/wda-client.ts \| grep -E '^[-+].*(attempts *= *idempotent\|idempotent *= *options)'` | 출력 없음 |
| (§D.2 강화) | `git diff --name-only HEAD -- src/backend/` | **빈 결과** — 백엔드 전체 무변경 |

마지막 항목이 AC 4건보다 강한 판정이다: 특정 줄이 안 바뀐 것이 아니라 `src/backend/` 디렉터리 전체가 한 줄도 바뀌지 않았다.

### AC-IMAGE-038 — 문서 동기화 검증

`.claude/skills/explore-mobile/SKILL.md`의 낡은 곱셈 지시("If you view a downscaled image, multiply back… multiplied by 1.56")를 제거하고 `--from`/`--full`/기본 축소/사이드카/신선도를 반영했다.

문구만 고치고 끝내지 않고 **문서에 적은 명령을 그대로 실행해 확인**했다:

```
node dist/cli/bin.js screenshot --out ./doc-shot.jpeg
  -> 498×1024, scale 2.1686746987951806        (문서가 적은 값과 일치)
node dist/cli/bin.js tap 74 902 --from ./doc-shot.jpeg
  -> {"x":160,"y":1956}                        (문서가 적은 값과 일치)
ls doc-shot.jpeg.geometry.json                 (문서가 약속한 사이드카 존재)
```

반대 문장 grep으로 잔재도 확인했다: `grep -i 'multiply\|1\.56\|full-size capture'` → 새로 쓴 "Do **not** multiply coordinates yourself" 한 줄만 남았다.

---

### AC 판정 집계

| REQ | AC | 판정 |
|---|---|---|
| REQ-IMAGE-001 | 001(D) 002(D) 003(U) 004(D) | 4/4 충족 |
| REQ-IMAGE-002 | 005(D) 006(U) 007(U) | 3/3 충족 |
| REQ-IMAGE-003 | 008(U+G) 009(U) | 2/2 충족 |
| REQ-IMAGE-004 | 010~012(U) 013~016(D) 017(D) 018(G) 019(U) 020(D) 021(G) 022(G) 023(U+D) | 14/14 충족 |
| REQ-IMAGE-005 | 024(U+D) 025(U) 026(U) | 3/3 충족 |
| REQ-IMAGE-006 | 027(U) 028(U) 029(U) | 3/3 충족 |
| REQ-IMAGE-007 | 030(D) 031(U) | 2/2 충족 |
| REQ-IMAGE-008 | 032~034(U) | 3/3 충족 |
| REQ-IMAGE-009 | 035(U) 036(G) 037(G) 038(G) | 4/4 충족 |
| 품질 게이트 | 039~042 | 4/4 충족 |

**42/42 충족. 미충족 AC 없음.** AC 총 개수는 손으로 센 값이 아니라 다음 명령의 출력과 대조했다:

```bash
grep -o 'AC-IMAGE-[0-9]\{3\}' .moai/specs/SPEC-IMAGE-001/acceptance.md | sort -u | wc -l
```

**충족의 한계를 함께 남긴다** — 통과했다는 사실이 곧 "위험이 사라졌다"는 뜻은 아니다:

- AC-IMAGE-016(판독)의 1024px 근거는 네이티브 3종 + iPad 웹 앱 5화면 + Android 웹 3화면이다. iPad 표 그리드가 **768px에서 깨지는 것**을 확인해 하한이 768~1024 사이임을 실측했다 — 1024는 여유 있는 값이 아니라 **최악 조건(태블릿·데스크톱 폭 레이아웃)의 하한에 가까운 값**이다. Android는 768px에서도 읽혔으므로 여유가 있다. `htyong.com`의 앱 화면은 Android에서 미검증이다(기기가 로그인돼 있지 않아 로그인 화면까지만 도달).
- AC-IMAGE-030은 Android만 측정했다 — iPad base64 길이는 plan-phase부터 계속 미측정이다.
- `CAPTURE_STALE_MS` 300초는 화면 전환 속도를 잰 값이 아니다(§E.2 참조).
- AC-IMAGE-004는 임계 판정이 아니라 관측 기록이다 — "지배하지 않는다"의 수치 기준은 SPEC이 정하지 않았다.
- spec.md §C.5의 미확인 질문 2건(Android 캡처 2.39초의 원인, base64 모드 존치 여부)은 이 SPEC이 닫지 않는다. 그대로 열려 있다.

---

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-10
methodology: tdd
milestones_complete: M1, M2, M3, M4, M5, M6
tests_total: 805
tests_passed: 805
typecheck: pass
build: pass
```

위 테스트 수치는 손으로 센 값이 아니라 아래 명령의 출력이다:

```bash
npx vitest run 2>&1 | tail -5      # tests_total / tests_passed
npx tsc --noEmit -p tsconfig.json  # typecheck (exit 0)
npx pnpm build                     # build (exit 0)
```

---

## §E.4 Sync-phase Audit-Ready Signal

```
sync_status: audit-ready
sync_complete_at: 2026-08-10
sync_commit_sha: 341403d
tests_total: 805
tests_passed: 805
typecheck: pass
build: pass
```

위 수치는 sync 시점에 **다시 돌려서** 얻은 값이다 — run 단계 수치를 물려받지 않았다.
증거 로그: `.moai/state/verify/sync-image-001/{1-vitest,2-tsc,3-build}.log`.

### sync가 찾아낸 것 — 문서 드리프트 2건

run 단계가 `SKILL.md`의 낡은 곱셈 지시를 지웠지만(AC-IMAGE-038), **같은 지시가 README에도
있었고 거기는 지워지지 않았다.** `README.md`의 「읽기 경로는 스크린샷 하나다」 절이
"표시용 축소 이미지를 쓴다면 배율을 곱해야 한다 … 1.56을 곱해야"라고 적고 있었다.

이 문장은 낡은 정도가 아니라 **지금은 틀린 지시**다: `--from`을 쓰면서 이 지시를 따르면
곱셈이 두 번 일어나 빗나간다. 한 파일에서 고친 문구가 다른 파일에 남아 있었다는 뜻이고,
문서 동기화 검증을 SPEC이 지목한 파일 하나로 한정한 것이 구멍이었다.

같은 절의 테스트 수치도 낡아 있었다(`25 files / 540 tests`, 2026-08-03 기준 → 실제 `41 / 805`).

수정 후 반대 문장 grep으로 잔재를 확인했다:

```bash
grep -n '곱해야\|1\.56\|shot\.png\|PNG 캡처\|923×2000' README.md   # → 출력 없음
grep -n '곱' README.md   # → 남은 6건 모두 "직접 곱하지 않는다" 방향
```

### sync가 찾아낸 것 — @MX 태그 누락 1건

`src/cli/commands/from-capture.ts`에 @MX 태그가 0건이었다. 이 파일의
`resolveCoordinateMapper`는 fan_in이 3이다:

```bash
$ grep -rn "from-capture" src/ | grep -v "\.test\.ts"
src/cli/commands/tap.ts:25 · scroll.ts:37 · swipe.ts:31
```

constitution은 fan_in ≥ 3에 `@MX:ANCHOR`를 요구한다. 산문 주석은 충실했지만 태그 형식이
아니어서 기계가 세지 못했다. `geometry.ts`의 ANCHOR(변환 산술)와 **다른 불변조건**을
지킨다는 점을 명시해 부착했다 — 이 파일이 지키는 것은 산술이 아니라 **거부 시점**
(사이드카 부재·낡음을 백엔드 호출 **전에** 거른다)이다.

### README에 적은 값은 실행해서 얻었다

문서에 넣을 응답을 손으로 짓지 않고 Android SM_G960N `2beb9d2309037ece`에서 실제로 찍었다:

| 명령 | 실제 출력 |
|---|---|
| `screenshot --out ./shot.jpeg` | 498×1024, 41,268 B, scale 2.1686746987951806, jpeg |
| `tap 250 400 --from ./shot.jpeg` | `{"x":542,"y":867}` |
| `screenshot --full --out ./full.png` | 1080×2220, 2,300,950 B, scale 1, png |

기본 대비 `--full`은 2,300,950 → 41,268 B로 **98.2% 감소** — run 단계 §E.2의 98.2%와 일치한다.

탭 좌표 (250, 400)은 캡처를 **실제로 열어 보고** 아이콘이 없는 빈 배경임을 확인한 뒤 골랐다.
캡처 파일은 저장소 밖 임시 경로에 썼다 — `.moai/reports/`는 gitignore 대상이 아니어서
기기 화면이 저장소에 남는 사고가 이 프로젝트에서 이미 한 번 있었다.

### sync가 닫지 않은 것

- run 단계 §E.2 말미의 미검증 항목(iPad base64 길이, Android `htyong.com` 앱 화면,
  `spec.md` §C.5의 열린 질문 2건)은 그대로 열려 있다. sync는 문서만 맞췄다.
- 문서 동기화 검증 범위가 SPEC 지목 파일에 한정돼 있던 구멍은 이번에 README를 손으로
  찾아 메웠을 뿐, **다음에 같은 일이 재발하지 않을 장치는 만들지 않았다.**
- `.moai/reports/image-verification/` 아래 증거 캡처는 run 단계 결정대로 개인정보가 찍힌
  것들이 삭제된 상태이며, sync는 되살리지 않았다.

---

## §F Phase 4 Mode Selection

```
Decision: sub-agent
```

입력 파라미터: tier M / 파일 약 11개 / 도메인 2개(TypeScript CLI + 실기기 검증) / 언어 구성 100% TypeScript / 병렬 이득 LOW(코딩 중심).

| 모드 | 선택 | 근거 |
|---|---|---|
| trivial | 아니오 | 의미 변경이 있는 다파일 구현이다 |
| background | 아니오 | 파일 쓰기가 필요하다 |
| agent-team | 아니오 | RETIRED |
| parallel | 아니오 | 코딩 중심이라 병렬 이득이 낮다 |
| sub-agent | **예** | 기본 대체안이며 코딩 작업의 안전한 기본값 |
| workflow | 아니오 | 파일 수가 ~30 미만이고 기계적 단일 규칙 변환이 아니다 |

실행 형태: 이 세션은 에이전트 위임 없이 순차 직접 실행으로 수행됐다(세션 제약). 병행 쓰기는 발생하지 않았다.
