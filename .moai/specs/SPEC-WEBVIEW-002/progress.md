# SPEC-WEBVIEW-002 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

```
plan_status: audit-ready
plan_complete_at: 2026-08-03
tier: M
artifacts: spec.md, plan.md, acceptance.md
```

### 기준 커밋

```
base_commit_sha: 5a6d44f
branch: master
tests(before): 32 files / 696 passed | 2 expected fail
```

### Tier 판단

파일 수는 Tier L 기준(>15)이나 **전량 삭제**라 위험 프로파일이 다르다 — 새 로직
0, 접점 4곳 실측 확인, 조사는 착수 전 완료. Tier M으로 진행했다(plan.md §A.3).

---

## §E.2 Run-phase Evidence

### M1 — 코드 제거

#### 삭제 → 컴파일러가 잔재를 잡게 한다

grep으로 참조를 뒤지는 대신 **먼저 지우고 typecheck에 맡겼다.** 13파일 삭제 후
컴파일러가 정확히 3파일을 짚었다:

```
src/cli/commands/doctor.ts
src/cli/commands/tap.ts
src/cli/commands/text.ts
```

착수 전 분석이 예측한 접점 4곳 중 3곳이다(나머지 `args.ts`는 플래그 정의만
있어 컴파일이 깨지지 않는다). **분석과 컴파일러가 일치했다.**

#### 수정 6파일

| 파일 | 변경 |
|---|---|
| `cli/commands/tap.ts` | 가드 한 줄 + import 제거 |
| `cli/commands/text.ts` | 동일 |
| `cli/commands/doctor.ts` | `checkWebInspectorProxy` 제거 + `spawnProcess` 죽은 import 제거 |
| `cli/args.ts` | `web`·`page`·`index` 옵션 + `normalizeWebFlagArgv` 제거 |
| `cli/args.test.ts` | 웹 파싱 테스트 정리 + **제거 플래그 거부 테스트로 대체** |
| `schema/{common-element,device-backend}.ts` | 낡아지는 주석 정정 (REQ-WEBRM-006) |

`args.test.ts`는 삭제만 하지 않고 **회귀 가드를 남겼다** — `--web`/`--page`/
`--index`를 주면 던지는지 확인한다. 누가 플래그를 되돌리면 여기서 먼저 깨진다.

#### 비전 경로 무회귀의 첫 증거

플래그 제거 직후 실행에서 **`args.test.ts`만 9건 실패하고 나머지 546건이 그대로
통과**했다. 접점이 가장자리라는 분석이 실행으로 확인된 지점이다.

#### 게이트

```
$ pnpm typecheck   → exit 0
$ pnpm test        → 26 files / 550 passed | 2 expected fail   (696 → 550)
$ pnpm build       → exit 0
```

#### AC 기계 판정에서 드러난 것 — 내 grep이 헐거웠다

```
AC-WEBRM-006 초안 판정: grep -rn 'args\.web|args\.page|args\.index'  → 1건
```

걸린 것은 `wda-device-list.test.ts:112`의 **`args.indexOf(...)`** 였다 —
`Array.prototype.indexOf`이지 `args.index`가 아니다. 패턴에 단어 경계를 넣어
다시 재면 0건이다:

```
$ grep -rnE 'args\.(web|page|index)\b' src --include='*.ts'   → 0건
```

**이번 세션에서 세 번째로 같은 실수다** — 결함 ③(문구에서 정책 역추론),
`AC-WDAERR-007`(주석 언급이 diff 검사에 걸림), 그리고 이것. acceptance.md의
판정 명령을 단어 경계 포함으로 고쳤다.

#### 실기기 판정 (D)

```
① doctor (iOS 대상) — AC-WEBRM-013/015
   wdaEnvironment keys: ["devicectl","wda"]      ← webInspectorProxy 소멸
   devicectl.available: true · wda.reachable: true, build "WDA 16.1.1 / iOS 26.5.2"

② tap --web 거부 + 화면 무변화 — AC-WEBRM-007
   $ tap --web "button"  → {"ok":false,"error":{"code":"INVALID_ARGS", …}}
   before/after 스크린샷 SHA1: 4281b78493f8 / 4281b78493f8   ← 동일
   조용한 좌표 탭 강등이 없음을 해시로 확인했다

③ 비전 루프 — AC-WEBRM-012
   캡처 → tap 543 2956 → 검증 캡처
   URL htyong.com/profile → /explore, 하단 내비 「탐색」 활성화
   판정은 스크린샷으로 했다 (ok:true를 오라클로 쓰지 않았다)
```

무대 앱은 Chrome/htyong.com이었다. **「저장」 버튼은 폼을 제출하므로 피하고**
되돌리기 쉬운 하단 내비게이션을 눌렀다 — 측정용 조작도 실제 조작이다.

#### AC 판정

| AC | 등급 | 판정 |
|---|---|---|
| AC-WEBRM-001~003 (모듈 삭제) | G | **PASS** — 13파일 삭제 |
| AC-WEBRM-004 (import 잔재 0) | G | **PASS** — 남은 1건은 `common-element.ts`의 이력 서술 |
| AC-WEBRM-005~006 (플래그 제거) | G | **PASS** — 단어 경계 패턴으로 0건 |
| AC-WEBRM-007 (조용한 대체 금지) | U+**D** | **PASS** — 거부 + 화면 해시 동일 |
| AC-WEBRM-008 (`--page`/`--index`도 거부) | U | **PASS** |
| AC-WEBRM-009 (비전 경로 무회귀) | U | **PASS** — 삭제분 외 전부 통과 |
| AC-WEBRM-010 (`src/index.ts` 무변경) | G | **PASS** — `git diff` 빈 결과 |
| AC-WEBRM-011 (PRESERVE 무변경) | G | **PASS** — 수정 파일 6개가 전부 예정 대상 |
| AC-WEBRM-012 (비전 루프 실기기) | **D** | **PASS** — 화면 전환 스크린샷 확증 |
| AC-WEBRM-013 (`doctor` 필드 소멸) | G+**D** | **PASS** |
| AC-WEBRM-014 (CHANGELOG breaking 명시) | G | **PASS** |
| AC-WEBRM-015 (`doctor` 나머지 정상) | **D** | **PASS** |
| AC-WEBRM-016~018 (주석 정정) | G | **PASS** |
| AC-WEBRM-019~020 (문서·supersede) | G | **PASS** |
| AC-WEBRM-021~022 (게이트) | U/G | **PASS** |
| AC-WEBRM-023 (`AC-VISION-008` 해소 기록) | G | **PASS** |

**23/23 PASS · 미충족 0건.**

#### 미검증 (Gaps)

1. **`CommonElement` / `scroll-geometry.ts`를 정리하지 않았다.** `deriveScreenSize`의
   운영 호출처는 0건이고(테스트 픽스처 헬퍼만) 이제 이 타입의 생산자도 없다.
   **`SPEC-VISION-001` M1이 남긴 기존 데드코드이며 이 SPEC이 만든 것이 아니다** —
   범위 규율에 따라 `@MX:DEBT`로 기록만 했다(spec.md §C.2).
2. **`Node >= 22` 하한을 내리지 않았다.** 하한을 올린 유일한 이유(`WebSocket`)가
   사라졌으나 소비자 대상 변경이라 별도 판단으로 남겼다(spec.md §A.4).
3. **`doctor` 필드 소멸을 감지하는 테스트는 여전히 0건이다.** 원래도 없었다 —
   그래서 삭제해도 테스트가 안 깨졌다. **테스트 통과를 무영향의 증거로 쓸 수 없는
   사례**이며, CHANGELOG의 breaking 명시가 유일한 방어선이다.
4. **iOS 기기에서 비전 루프를 재확인하지 않았다.** AC-WEBRM-012는 Android에서
   닫았다. iOS 경로는 `doctor`의 `wda.reachable: true`까지만 확인했다.

---

## §E.3 Run-phase Audit-Ready Signal

```
run_status: audit-ready
run_complete_at: 2026-08-03
milestones: M1 (코드 제거) · M2 (문서·SPEC 정리)
run_commit_sha: pending-backfill-2026-08-03
gates: pnpm test 26 files / 550 passed | 2 expected fail
       pnpm typecheck exit 0 · pnpm build exit 0
ac: 23/23 PASS · 미충족 0건
```

---

## §E.4 Sync-phase Audit-Ready Signal

```
sync_status: audit-ready
sync_complete_at: 2026-08-03
sync_commit_sha: pending-backfill-2026-08-03
artifacts_updated: README.md, CHANGELOG.md, SPEC-WEBVIEW-001(frontmatter),
                   SPEC-VISION-001/progress.md(§E.4 A2·B2), progress.md
```

### 문서 동기화

| 문서 | 변경 |
|---|---|
| `README.md` | `--web` 절 삭제 · 최상단 "시뮬레이터 제어" 서술 정정 · `ios-webkit-debug-proxy` 요구사항 삭제 · 명령표 각주 삭제 · Node 하한 이유 정정 · 테스트 수치 550 · 로드맵 |
| `CHANGELOG.md` | **Removed** 항목. `doctor` 필드 소멸과 플래그 거부를 **breaking change로 명시** |
| `SPEC-WEBVIEW-001` | `status: completed → superseded` |
| `SPEC-VISION-001` progress.md | §E.4 A2(`AC-VISION-008` **해소**) · B2(`--web` 프록시 결함 **소멸**) |

### 열린 항목 변화

`SPEC-VISION-001`의 열린 6건 중 **2건이 닫혔다** → 4건:

- ~~`AC-VISION-008` `--index` 절~~ — 상한이던 SPEC-WEBVIEW-001이 supersede되며 해소
- ~~`--web` 프록시 기동 결함~~ — 서술 대상 코드가 소멸

남은 4건: `AC-VISION-004`(미검증) · `AC-VISION-015`(조건 근사) ·
`AC-WDAERR-005`(미검증) · `AC-VISION-031`(대상 소멸, 이력으로 보존).

---

## §F Phase 4 Mode Selection

```
tier: M
scope: 13 삭제 + 6 수정
domains: 1 (웹 경로 제거)
concurrency benefit: LOW — 삭제는 순차 의존(삭제 → typecheck → 수정)
Decision: sub-agent
```

Mode 6(workflow)은 기계적 대량 변환 조건(≈30파일)에 미달하고, 무엇보다 **삭제
순서에 의존성이 있다**(먼저 지워야 컴파일러가 잔재를 짚는다). 병렬화 이득이 없어
기본값 Mode 5로 진행했다.
