# SPEC-CLEAN-001 — plan.md

실행 계획. Tier S이므로 마일스톤 1개다.

## §A. 착수 전 상태

```
base_commit_sha: c2e62be
branch: master
tests(before): 26 files / 550 passed | 2 expected fail
deps(before):  fast-xml-parser ^5.10.1  (유일한 런타임 의존성)
```

### A.1 PRESERVE (수정 금지)

- `scroll-geometry.ts`의 `computeScrollSwipe` · `isDegenerateSwipe` ·
  `roundPixel` · `minNonDegenerateRatio` · `ScrollDirection` ·
  `SwipeCoordinates` — 전부 살아 있다
- `scroll.ts` 운영 코드 — 화면 크기는 이미 `backend.getScreenSize`에서 온다
- `nodeWdaHttpClient` / `SwipeThresholdBasis` **심볼 본체** — `export`만 뗀다
- `src/backend/**` 동작 코드

### A.2 가장 큰 위험

**`scroll.test.ts` 재작성이 동작 검증을 약화시키는 것.** 이 파일은
`deriveScreenSize(CommonElement[])`로 `getScreenSize` mock의 반환값을 만든다.
픽스처를 `ScreenSize` 리터럴로 바꾸는 것은 기계적이지만, **바꾸면서 테스트
케이스를 줄이면** 커버리지가 조용히 사라진다.

방어선: **재작성 전후 테스트 수를 비교한다**(AC-CLEAN-005). 줄면 실패로 본다.

---

## §B. 마일스톤

### M1 — 제거

**순서가 중요하다 — 테스트 재작성 먼저, 삭제 나중.**
삭제부터 하면 테스트가 컴파일되지 않아 "무엇을 보존해야 하는지" 읽을 수 없다.

1. **`scroll.test.ts` 재작성** — `deriveScreenSize(elements)` 호출을 `ScreenSize`
   리터럴로 치환한다. `CommonElement[]` 픽스처(`KNOWN_SCREEN_400X800` 등)는
   그것이 표현하던 화면 크기로 바꾼다. **테스트 수 불변** 확인
2. **`scroll-geometry.test.ts`** — `describe("deriveScreenSize")` 블록과 전용
   `element()` 헬퍼, `CommonElement` import 제거. 나머지 블록은 무수정
3. **삭제**: `schema/common-element.ts` · `common-element.test.ts`
4. **수정**: `scroll-geometry.ts`(`deriveScreenSize` + import 제거) ·
   `device-backend.ts`(재수출 제거, `SwipeThresholdBasis` 비공개화) ·
   `wda-client.ts`(`nodeWdaHttpClient` 비공개화) · `src/index.ts`(export 제거 +
   낡은 헤더 주석 정정)
5. **`package.json`** — `fast-xml-parser` 제거 후 `pnpm install`로 락파일 갱신
6. `pnpm typecheck` → **컴파일러가 잔재를 짚게 한다**
7. `pnpm test` / `pnpm build` / `npx knip`

**D 판정**: 실기기에서 `scroll` 1회 — 화면 크기 경로를 건드리는 테스트를
재작성했으므로 실행으로 확인한다(AC-CLEAN-011).

### 위험

- **`scroll.test.ts`에서 테스트를 줄이고 싶어진다** — 픽스처 변환이 번거로운
  케이스가 있으면 지우고 싶어진다. AC-CLEAN-005가 기계적 방어선이다
- **`export`를 떼려다 심볼을 지운다** — `nodeWdaHttpClient`는 기본 파라미터로
  살아 있다. typecheck가 잡지만, 잡히면 이미 잘못 지운 것이다
- **락파일만 남는다** — `package.json`에서 지우고 `pnpm install`을 안 돌리면
  락파일에 잔재가 남는다

---

## §C. 산출물

| 파일 | 변경 |
|---|---|
| `src/schema/common-element.ts` · `.test.ts` | **삭제** |
| `src/cli/commands/scroll-geometry.ts` | `deriveScreenSize` + import 제거 |
| `src/cli/commands/scroll-geometry.test.ts` | 해당 describe 블록 제거 |
| `src/cli/commands/scroll.test.ts` | 픽스처를 `ScreenSize`로 재작성 |
| `src/schema/device-backend.ts` | 재수출 제거 · `SwipeThresholdBasis` 비공개화 |
| `src/backend/wda-client.ts` | `nodeWdaHttpClient` 비공개화 |
| `src/index.ts` | export 제거 + 헤더 주석 정정 |
| `package.json` · `pnpm-lock.yaml` | `fast-xml-parser` 제거 |
| `CHANGELOG.md` · `README.md` | Removed 항목 · 의존성 0 반영 |

## §D. 완료 조건

AC 12건 충족 · `pnpm test`/`typecheck`/`build` 통과 · `knip` 깨끗 ·
`scroll` 실기기 확인 · **`scroll.test.ts` 테스트 수 불변**.
