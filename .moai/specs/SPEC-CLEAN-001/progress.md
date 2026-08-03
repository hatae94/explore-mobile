# SPEC-CLEAN-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-03
tier: S
artifacts: spec.md, plan.md
base_commit_sha: c2e62be
tests(before): 26 files / 550 passed | 2 expected fail
deps(before):  fast-xml-parser ^5.10.1
```

---

## §E.2 Run-phase Evidence

### M1 — 제거

#### 픽스처 기준값을 제거 전에 확보했다

`scroll.test.ts`는 `deriveScreenSize(CommonElement[])`로 mock의 반환값을 만들고
있었다. 그 함수를 지우면 **각 픽스처가 무슨 크기를 의미했는지 알 수 없어진다.**
지우기 전에 실행해 기준값을 확정했다:

```
KNOWN_SCREEN_400X800    => {"width":400,"height":800}
MULTI_ROOT_WITH_WITNESS => {"width":402,"height":874}
CHROME_ONLY_NO_WITNESS  => undefined
KNOWN_SCREEN_402X874    => {"width":402,"height":874}
KNOWN_SCREEN_12X12      => {"width":12,"height":12}
EMPTY / ZERO_BOUNDS     => undefined
ODD 393x852 / 375x667   => 그대로
```

이 값들을 `ScreenSize` 리터럴로 고정했다. **추측으로 옮겼다면 조용히 다른 화면을
테스트하게 됐을 것이다.**

#### 재작성이 낸 버그를 테스트가 잡았다

첫 재작성에서 `SCREEN_UNKNOWN = undefined`로 두고
`createMockBackend(devices, screen = SCREEN_400X800)`에 넘겼다. **JS 기본 파라미터는
`undefined`를 받으면 기본값으로 대체한다** — "크기 불명" 케이스 3건이 조용히
400x800으로 바뀌었고, 테스트가 즉시 실패했다.

```
FAIL  dump가 빈 배열이면 SCREEN_SIZE_UNKNOWN, 무동작
FAIL  모든 bounds가 0이면 SCREEN_SIZE_UNKNOWN, 무동작
FAIL  Safari 크롬-only dump 결과 -> SCREEN_SIZE_UNKNOWN, 무동작
```

`null`로 바꿔 기본값 대체를 피했다(`screen ?? undefined`로 mock에 전달). 실패가
없었다면 **세 테스트가 아무것도 검증하지 않는 상태로 통과했을 것이다.**

#### 삭제 → 컴파일러가 잔재를 짚는다

`SPEC-WEBVIEW-002`와 같은 순서다. 스키마 삭제 후 `typecheck`가 2건을 짚었고,
정규식이 미처 못 지운 `scroll-geometry.test.ts`의 `deriveScreenSize` 테스트였다.

그 테스트는 **제거된 함수의 동작**을 단언하고 있었다(12x12 화면을 거부하지
않는다). 지우기 전에 그 역할이 다른 곳에 있는지 확인했다 —
`scroll.test.ts:422,442`가 **실제 경로**(`backend.getScreenSize`가 12x12를
돌려주고 아무도 걸러내지 않음)로 같은 전제를 검증한다. 더 강한 형태이므로
제거해도 커버리지 손실이 없다. 그 판단을 주석으로 남겼다.

#### 제거 목록

| 대상 | 처리 |
|---|---|
| `schema/common-element.ts` · `.test.ts` | 삭제 |
| `scroll-geometry.ts` `deriveScreenSize` | 삭제 (나머지 export 6개 유지) |
| `device-backend.ts` `CommonElement` 재수출 | 삭제 |
| `src/index.ts` `CommonElement`/`ElementBounds` export | 삭제 + 헤더 주석 정정 |
| `fast-xml-parser` | `package.json` + 락파일에서 제거 |
| `nodeWdaHttpClient` · `SwipeThresholdBasis` | **`export`만 제거** (심볼 유지) |

#### 게이트

```
$ pnpm typecheck   → exit 0
$ pnpm test        → 25 files / 540 passed | 2 expected fail   (550 → 540)
$ pnpm build       → exit 0
$ npx knip         → 출력 없음 (깨끗)
$ node -e 'console.log(require("./package.json").dependencies)'  → undefined
```

#### 실기기 판정 (AC-CLEAN-011)

```
$ node dist/cli/bin.js scroll down --device 192.168.219.106:36807
{"ok":true,"data":{"direction":"down","from":{"x":720,"y":2262},"to":{"x":720,"y":858}}}

M6 기록(1440x3120, override 없음): {720,2262} → {720,858}
```

**좌표가 정확히 일치한다.** 화면 크기 경로가 이 SPEC의 핵심 위험이었고, 실행이
무회귀를 확증했다.

#### AC 판정

| AC | 등급 | 판정 |
|---|---|---|
| AC-CLEAN-001 (스키마 삭제) | G | **PASS** |
| AC-CLEAN-002 (참조 0) | **T** | **PASS** — typecheck exit 0이 곧 증명 |
| AC-CLEAN-003 (`deriveScreenSize` 삭제) | G+T | **PASS** |
| AC-CLEAN-004 (나머지 export 유지) | T | **PASS** — 기존 테스트 통과 |
| AC-CLEAN-005 (테스트 재작성, 삭제 아님) | U | **PASS** — `scroll.test.ts` 70건 유지 |
| AC-CLEAN-006 (의존성 제거) | G | **PASS** — package.json·락파일 0건 |
| AC-CLEAN-007 (런타임 의존성 0) | G | **PASS** — `dependencies` 부재 |
| AC-CLEAN-008 (심볼 유지·비공개화) | T | **PASS** — typecheck + knip 무보고 |
| AC-CLEAN-009 (knip 깨끗) | T | **PASS** |
| AC-CLEAN-010 (게이트) | U/G | **PASS** |
| AC-CLEAN-011 (실기기 scroll) | **D** | **PASS** — 좌표 M6 기록과 일치 |
| AC-CLEAN-012 (index.ts 헤더) | G | **PASS** |

**12/12 PASS · 미충족 0건.**

#### 미검증 (Gaps)

1. **`scroll-geometry.test.ts`의 테스트 수는 줄었다.** `deriveScreenSize` 전용
   블록(테스트 8건)이 사라졌기 때문이다. AC-CLEAN-005의 불변 조건은
   **`scroll.test.ts`에 걸었고** 그쪽은 70건 그대로다 — 삭제된 것은 제거된
   함수의 테스트이지 동작 테스트가 아니다.
2. **iOS 기기에서 재확인하지 않았다.** `scroll`은 Android에서 닫았다. 화면 크기
   경로는 백엔드마다 다르므로(`wm size` vs WDA `/window/size`) iOS 쪽은
   `SPEC-WEBVIEW-002`의 `doctor` 확인까지만이다.
3. **`knip`을 CI에 배선하지 않았다.** 일회성 `npx`로만 돌렸다 — 도구 도입은
   범위 밖으로 뒀다(spec.md §A.5.1).

---

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-03
milestones: M1 (완료)
run_commit_sha: e725bd9
gates: pnpm test 25 files / 540 passed | 2 expected fail
       pnpm typecheck exit 0 · pnpm build exit 0 · knip clean
ac: 12/12 PASS · 미충족 0건
```

---

## §E.4 Sync-phase Audit-Ready Signal

```
sync_status: audit-ready
sync_complete_at: 2026-08-03
sync_commit_sha: e725bd9
artifacts_updated: README.md, CHANGELOG.md, progress.md
```

`CHANGELOG` **Removed** 항목에 공개 API 제거를 breaking change로, 의존성 0을
사실로 기록했다. `README` 요구사항 절에 「런타임 의존성 0개」를 추가하고 테스트
수치를 540으로 갱신했다.

---

## §F Phase 4 Mode Selection

```
tier: S
scope: 2 삭제 + 7 수정
domains: 1 (데드코드 정리)
concurrency benefit: LOW — 기준값 확보 → 재작성 → 삭제 → typecheck 순차 의존
Decision: sub-agent
```

병렬화 이득이 없다. 특히 **기준값 확보가 삭제보다 반드시 앞서야 하므로**
순서가 강제된다 — 먼저 지우면 픽스처의 의미를 복원할 수 없다.
