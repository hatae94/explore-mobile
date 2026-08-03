# SPEC-WEBVIEW-002 — acceptance.md

인수 기준. 각 AC는 **판정 수단**을 명시한다.

## 판정 수단 등급

| 등급 | 의미 |
|---|---|
| **G**(grep/정적) | 텍스트·타입 검사로 기계 판정. 존재/부재 판정에 유효 |
| **U**(단위 테스트) | mock 기반. 외부 프로세스·HTTP의 실제 동작은 판정 불가 |
| **D**(실기기) | 실제 기기에서 관측 |

**이 SPEC은 제거가 주제다.** 부재 판정은 G가 정확한 수단이며, 제거가 남긴
회귀 여부는 U(기존 테스트 무수정 통과)와 D(비전 루프 실측)로 본다.

---

## REQ-WEBRM-001 — 모듈 삭제

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-001** | `src/webview/` 디렉터리가 존재하지 않는다 | **G** `ls src/webview` → 없음 |
| **AC-WEBRM-002** | `src/normalize/webdom.ts`·`webdom.test.ts`가 없다 | **G** |
| **AC-WEBRM-003** | `src/cli/commands/web-support.ts`·`web-support.test.ts`가 없다 | **G** |
| **AC-WEBRM-004** | 저장소 전체에 `webview/`·`web-support`·`webdom` import가 0건이다 | **G** grep |

## REQ-WEBRM-002 — 플래그 제거

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-005** | `args.ts`에 `web`·`page`·`index` 옵션 정의가 없다 | **G** |
| **AC-WEBRM-006** | `args.web`/`args.page`/`args.index` 참조가 0건이다 | **G** 아래 판정 명령 |

**AC-WEBRM-006 판정 명령 (착수 중 정정)**: 초안의 `grep 'args\.index'`는
`args.indexOf(...)`(Array 메서드)에 걸린다 — 실제로 오탐 1건이 나왔다.
**단어 경계**를 넣어야 한다:

```bash
grep -rnE 'args\.(web|page|index)\b' src --include='*.ts'
# 기대: 출력 없음
```

## REQ-WEBRM-003 — 조용한 대체 금지

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-007** | `tap --web "button"`이 `INVALID_ARGS`로 거부되고 좌표 탭이 일어나지 않는다 | **U** + **D** 실기기 1회. 기기 화면이 바뀌지 않음을 캡처로 확인 |
| **AC-WEBRM-008** | `tap --page 1` / `tap --index 0`도 동일하게 거부된다 | **U** |

## REQ-WEBRM-004 — 비전 경로 무회귀

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-009** | 비전 경로 명령 9종의 기존 테스트가 **무수정** 통과한다 | **U** 삭제된 웹 테스트 외 나머지 전부 |
| **AC-WEBRM-010** | `src/index.ts` 공개 export가 변경되지 않는다 | **G** `git diff src/index.ts` → 빈 결과 |
| **AC-WEBRM-011** | `src/backend/`·`scroll.ts`·`swipe.ts`·`screenshot.ts` 등 비전 경로 파일이 수정되지 않는다 | **G** `git diff --name-only`에 부재 |
| **AC-WEBRM-012** | **실기기에서 비전 루프가 동작한다** — 캡처 → 좌표 tap → 검증 캡처 | **D** 필수. **U 불가** — 제거가 런타임에 무엇을 깼는지는 실행해야 안다 |

## REQ-WEBRM-005 — `doctor` 계약 변경

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-013** | `doctor` 출력에 `webInspectorProxy` 필드가 없다 | **G** + **D** 실기기 `doctor` 실행 |
| **AC-WEBRM-014** | CHANGELOG에 이 필드 소멸이 **breaking change로 명시**된다 | **G** grep |
| **AC-WEBRM-015** | `doctor`의 나머지 검사(`adb`·`devicectl`·`wda`)가 그대로 동작한다 | **D** 실기기 실행 |

## REQ-WEBRM-006 — 낡은 주석 정정

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-016** | `schema/common-element.ts`에 「남은 소비자는 웹 경로」 취지 서술이 없다 | **G** |
| **AC-WEBRM-017** | `schema/device-backend.ts`의 re-export 근거 주석이 `--web`을 인용하지 않는다 | **G** |
| **AC-WEBRM-018** | 저장소 소스에 `--web`을 **현존 기능으로** 서술하는 문장이 없다 (이력 기록은 예외) | **G** |

## 문서

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-019** | README에서 「iOS 웹 콘텐츠(`--web`)」 절이 사라지고, 「읽기 경로는 스크린샷 하나다」와 모순이 없다 | **G** |
| **AC-WEBRM-020** | `SPEC-WEBVIEW-001` frontmatter가 `status: superseded`다 | **G** |

## 게이트

| AC | 기준 | 판정 |
|---|---|---|
| **AC-WEBRM-021** | `pnpm test` 전부 통과 | **U** exit 0 |
| **AC-WEBRM-022** | `pnpm typecheck` / `pnpm build` 통과 | **G** exit 0 |
| **AC-WEBRM-023** | `AC-VISION-008`의 `--index` 절이 이제 충족됨을 기록한다 | **G** SPEC-VISION-001 progress.md §E.4 갱신 |

---

## 미충족 허용 조건

`AC-WEBRM-012`(비전 루프 실기기)와 `AC-WEBRM-007`의 D 부분은 기기가 연결돼
있어야 한다. **기기가 없으면 명시적 미검증으로 기록하고 닫는다** — U 통과를 D
판정으로 올리지 않는다(`SPEC-VISION-001` acceptance.md 「mock 한계 원칙」 승계).
