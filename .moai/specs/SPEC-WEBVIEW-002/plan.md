# SPEC-WEBVIEW-002 — plan.md

실행 계획. 삭제가 주제라 마일스톤 2개다 — 코드 제거(M1)와 문서·SPEC 정리(M2).

## §A. 착수 전 상태

### A.1 기준 커밋

```
base_commit_sha: 5a6d44f
branch: master
tests(before): 32 files / 696 passed | 2 expected fail
```

### A.2 PRESERVE 목록 (수정 금지)

- `src/backend/**` — 웹과 무관
- `src/cli/commands/{scroll,swipe,screenshot,key,devices,launch,stop}.ts`
- `src/cli/commands/scroll-geometry.ts` + `CommonElement` 스키마 — spec.md §C.2.
  운영 데드코드지만 **이 SPEC이 만든 것이 아니다**
- `src/index.ts` — 공개 export 무변경 (AC-WEBRM-010)
- `.claude/skills/explore-mobile/` — 웹 언급 0건이라 이번 제거의 영향 없음.
  스킬 동기화는 별개 작업

### A.3 Tier 판단 근거

파일 수는 Tier L 기준(>15)이나 **전량 삭제**라 위험 프로파일이 다르다 — 새 로직이
0이고, 접점이 4곳으로 실측 확인됐으며(spec.md §C.1), 조사는 착수 전에 끝났다.
Tier M(3 artifacts)으로 진행하고 이 판단을 여기 남긴다.

---

## §B. 마일스톤

### M1 — 코드 제거

**삭제 (13파일)**

```
src/webview/{calibration,coordinates,inspector-client,proxy-service}.ts
src/webview/{calibration,coordinates,inspector-client,proxy-service}.test.ts
src/webview/webkit-errors.ts
src/normalize/webdom.ts · webdom.test.ts
src/cli/commands/web-support.ts · web-support.test.ts
```

**수정 (6파일)**

1. `cli/commands/tap.ts` — 가드 한 줄 + import 제거
2. `cli/commands/text.ts` — 동일
3. `cli/commands/doctor.ts` — `checkWebInspectorProxy` import·호출·출력 필드 제거
4. `cli/args.ts` — `web`·`page`·`index` 옵션 정의와 `--web` 값 보정 로직 제거
5. `cli/args.test.ts` · `cli/router.test.ts` — 웹 단언 정리
6. `schema/common-element.ts` · `schema/device-backend.ts` — 낡아지는 주석 정정
   (REQ-WEBRM-006)

**순서**: 삭제 → `pnpm typecheck`로 **깨진 참조를 컴파일러가 전부 잡게 한다**.
grep으로 참조를 찾아 지우는 것보다 확실하다. 그다음 수정.

**검증**

```
pnpm typecheck   → exit 0   (참조 잔재 0)
pnpm test        → 전부 통과
pnpm build       → exit 0
grep -rn 'webview/\|web-support\|webdom' src   → 0건
```

### M2 — 문서 · SPEC 정리

1. `README.md` — 「iOS 웹 콘텐츠(`--web`)」 절 삭제, 「읽기 경로는 스크린샷
   하나다」와 정합화, 로드맵 갱신
2. `CHANGELOG.md` — **Removed** 항목. `doctor` 출력 필드 소멸을 **breaking
   change로 명시**(REQ-WEBRM-005)
3. `SPEC-WEBVIEW-001` frontmatter → `status: superseded`
4. `SPEC-VISION-001` progress.md §E.4 — `AC-VISION-008`의 `--index` 절 미충족이
   **해소됨을 기록**(AC-WEBRM-023). 열린 항목이 6건 → 5건
5. 이 SPEC의 progress.md §E.1~§E.4

### 실기기 판정 (D)

기기가 붙어 있으면 M1 직후 수행한다:

- `doctor` 실행 → `webInspectorProxy` 부재 + 나머지 검사 정상 (AC-WEBRM-013/015)
- 캡처 → 좌표 tap → 검증 캡처 (AC-WEBRM-012)
- `tap --web "button"` → `INVALID_ARGS`이고 **화면이 바뀌지 않음**을 캡처로 확인
  (AC-WEBRM-007). 조용한 좌표 탭 강등이 없어야 한다

기기가 없으면 **명시적 미검증**으로 기록하고 닫는다.

### 위험

- **삭제가 비전 경로를 건드릴 위험** — 가장 큰 위험이지만 접점이 가드 한 줄이라
  낮다. `git diff --name-only`에 PRESERVE 파일이 없어야 한다(AC-WEBRM-011)
- **`--index` 제거가 다른 명령을 깰 위험** — 소비자가 `web-support.ts` 하나임을
  실측했다. typecheck가 잔재를 잡는다
- **`doctor` 계약 변경을 조용히 넘길 위험** — 이 필드를 단언하는 테스트가 0건이라
  테스트가 안 깨진다. **테스트 통과를 무영향의 증거로 쓰면 안 된다** —
  CHANGELOG 명시(AC-WEBRM-014)가 이 위험의 방어선이다
- **`AMBIGUOUS_PAGE`와 `AMBIGUOUS_DEVICE` 혼동** — 이름이 비슷하다. 후자는 남는다

---

## §C. 완료 조건

AC 23건 중 G/U 항목 전부 충족 · D 항목은 충족 또는 명시적 미검증 ·
`pnpm test`/`typecheck`/`build` 통과 · PRESERVE 목록 파일 무변경.
