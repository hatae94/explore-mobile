---
id: SPEC-GESTURE-001
title: "제스처 원시 동작 — 구현 계획"
version: "0.1.0"
status: draft
created: 2026-07-27
updated: 2026-07-27
author: hatae
---

# 구현 계획 — SPEC-GESTURE-001

> 마일스톤은 **번복 가능성 내림차순**. 가장 바뀔 확률이 높은 결정(인터페이스 확장)을 앞에 둔다.

## §A. 컨텍스트

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 선행: SPEC-ANDROID-001 / SPEC-IOS-001 / SPEC-WEBVIEW-001(0.2.0) 모두 completed
- 기준선: 테스트 438건, typecheck·build exit 0, 커버리지 92.95%
- **선행 스파이크 완료**: iOS swipe 계약, `scrollIntoView` 성립, 화면 크기 파생 가능성을 실측(spec.md §C.1)

### A.5 PRESERVE (수정 금지)

- `src/normalize/uiautomator.ts`, `src/normalize/idb.ts`, `src/normalize/webdom.ts` — 정규화 계약 불변
- `src/webview/inspector-client.ts`, `src/webview/proxy-service.ts`, `src/webview/calibration.ts` — 0.2.0에서 막 개정됨
- `DeviceBackend`의 **기존 8개 메서드** — 시그니처·동작 불변(가법 확장만)

## §B. 알려진 이슈 / 리스크

### B.1 Android 미실측 [최고 리스크]

`adb shell input swipe`는 **문서 근거뿐**이고 기기 확인이 없다(spec.md §C.2). 이 프로젝트는 문서 가정이 틀렸던 전례가 있다 — SPEC-IOS-001에서 idb 가정 3건이 전부 틀렸다.

**대응**: Android 구현은 argv 구성까지만 단위 검증하고, AC-GEST-006을 **PARTIAL로 명시 마감**한다. "아마 될 것"이라고 쓰지 않는다. 기기가 연결되면 승격한다.

### B.2 `scroll` 방향 의미 [중간, 그러나 조용히 틀리기 쉬움]

`scroll down`이 "손가락을 아래로"인지 "내용을 아래로"인지는 사람마다 다르게 읽는다. 반대로 구현하면 **오류 없이 반대로 동작**한다.

**대응**: `scroll down` = "아래 내용을 본다"(손가락은 위로)로 확정하고, 응답에 방향과 실제 좌표를 함께 실어 호출자가 즉시 확인할 수 있게 한다. 테스트에 좌표 부등호를 명시적으로 박는다(AC-GEST-007).

### B.3 화면 크기 파생의 Android 쪽 근거 [중간]

루트 노드 bounds가 화면 전체라는 것은 iOS는 실측, **Android는 픽스처 근거뿐**이다(§C.1-④).

**대응**: 크기를 못 믿겠으면 추측하지 않고 `SCREEN_SIZE_UNKNOWN`으로 거부한다(REQ-GEST-SCROLL-004). 잘못된 좌표로 스와이프하는 것보다 거부가 낫다 — 제스처는 되돌릴 수 없다.

### B.4 `tap --web` 회귀 위험 [중간]

0.2.0에서 막 고친 경로를 다시 건드린다. 화면 안 요소의 기존 동작이 바뀌면 안 된다.

**대응**: 화면 **안** 요소는 코드 경로가 바뀌지 않도록 분기를 뒤에 붙인다. 기존 웹 테스트 전건 통과를 게이트로 삼는다.

## §C. 사전 점검 (Pre-flight)

```bash
pnpm vitest run                      # 기준선 438
pnpm typecheck && pnpm build         # exit 0
xcrun simctl list devices booted     # 시뮬레이터
adb devices                          # Android 연결 여부 → AC-GEST-006 판정에 사용
idb ui swipe --help                  # 계약 재확인
```

## §D. 제약

- `DeviceBackend` 기존 8메서드 변경 금지 — `swipe` 추가만
- `--no-verify`, `--amend`, force-push 금지
- Conventional Commits + `🗿 MoAI` 트레일러
- 관측하지 않은 것을 PASS로 쓰지 않는다

## §E. 자체 검증

마일스톤마다: AC PASS/FAIL 매트릭스 + 실제 명령 출력, `vitest`/`typecheck`/`build` 결과, 실기기 확인 가능 항목은 관측 결과.

## §F. 마일스톤 (번복 가능성 내림차순)

### M1 — `DeviceBackend.swipe` 인터페이스 + 두 백엔드 [최고 변경 확률]

인터페이스 형태가 바뀌면 나머지가 전부 따라 바뀐다. 먼저 확정한다.

`swipe(serial, from, to, options?)` 추가 → `AdbBackend`·`IdbBackend` 구현 → argv 구성 단위 테스트. iOS는 시뮬레이터로 즉시 실측(AC-GEST-005), Android는 argv까지만(AC-GEST-006 PARTIAL).

**왜 1번인가**: 9번째 메서드의 시그니처는 되돌리기 비싸다. `from`/`to`를 객체로 받을지 좌표 4개로 받을지 같은 결정이 여기서 굳는다.

### M2 — `swipe` CLI 명령 [높음 · 사용자 대면]

`swipe <x1> <y1> <x2> <y2> [--duration]` 라우터 배선 + 좌표 검증(`INVALID_COORDINATES`). REQ-GEST-SWIPE-001~003.

### M3 — `scroll` 편의 계층 [중간]

방향·비율 → 좌표 변환 **순수 함수** + 화면 크기 파생. 기기 없이 테스트 가능해야 한다. 크기 불명 시 거부. REQ-GEST-SCROLL-001~004.

순수 함수로 떼는 이유: 방향 의미(B.2)가 조용히 틀리기 쉬운 부분이라 픽스처로 못박아야 한다.

### M4 — `tap --web` 화면 밖 요소 보강 [중간 · 회귀 주의]

뷰포트 밖일 때 `scrollIntoView` → 재측정 → 네이티브 탭, 실패 시 기존 JS 폴백. 스크롤 발생을 `method`에 구분 표기. REQ-GEST-WEB-001~003.

기존 웹 테스트 전건 통과가 전제(B.4).

### M5 — 실기기 e2e [필수 · 마감 조건]

iOS 시뮬레이터에서: `swipe`로 화면 이동 확증 → `scroll down`/`up` 왕복 → 화면 밖 웹 요소를 `tap --web`으로 눌러 페이지 전환 확증. Android는 기기가 있으면 스와이프 확인, 없으면 PARTIAL 기록.

**이 마일스톤 없이는 `completed` 마감하지 않는다.**

## §G. 마일스톤 의존 관계

```
M1 (인터페이스+백엔드) ──> M2 (swipe 명령) ──┐
                                            ├──> M5 (e2e)
                          M3 (scroll) ──────┤
                          M4 (웹 보강) ─────┘
```

M3는 M1의 `swipe`를 호출하므로 M1 뒤. M4는 웹 경로 단독이라 M1과 독립이지만, e2e는 함께 돈다.
