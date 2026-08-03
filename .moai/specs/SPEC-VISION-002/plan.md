# SPEC-VISION-002 — plan.md

실행 계획. Tier S이므로 마일스톤 1개다.

## §A. 착수 전 상태

### A.1 기준 커밋

```
base_commit_sha: (착수 시점 HEAD로 기록)
branch: master
```

### A.2 PRESERVE 목록 (수정 금지)

- **`wda-client.ts:207-208`의 재시도 분기** — `idempotent ? 3 : 1`.
  AC-WDAERR-007이 `git diff` 0건으로 검증한다
- **`waitUntilResponsive` / `isResponsive` / `PROBE_*` 상수** — §C.2 미확인 질문
  영역이며 계측 없이 건드리지 않는다
- `wda-errors.ts`의 클래스 계층과 `code` 프로퍼티 — `types.ts`의
  `backendFailure` 경로가 의존한다
- `src/webview/` — SPEC-WEBVIEW-001 소유
- `src/backend/device-list-parser.ts` — SPEC-ANDROID-002 소유

### A.3 병행 SPEC 회피

`SPEC-ANDROID-002`가 `device-list-parser.ts`를 건드린다. 파일이 겹치지 않으므로
동시 진행이 가능하나, 커밋은 SPEC별로 분리한다.

---

## §B. 마일스톤

### M1 — 문구를 호출 성격에 맞춘다

**RED**

1. **먼저 조작 호출의 현행 문구를 고정하는 테스트를 쓴다** (AC-WDAERR-003).
   이것이 회귀 방지선이므로 순서를 바꾸지 않는다. 이 테스트는 지금 통과해야 한다
2. 멱등 호출이 응답 유실로 실패하는 상황을 주입하는 테스트를 쓴다:
   - 메시지에 "조작이 적용" 취지 문구가 없을 것 (AC-WDAERR-001)
   - "재시도를 수행하지 않았다"고 말하지 않을 것 (AC-WDAERR-002)
   - `code === "WDA_RESPONSE_LOST"` (AC-WDAERR-004)
3. `pnpm test`로 **RED 확인** — 2번의 두 항목이 실패해야 한다

**GREEN**

4. `requestEnvelope`가 `WdaResponseLostError`를 던질 때 `idempotent`와 실제
   시도 횟수(`attempts`)를 문장 생성에 반영한다 (REQ-WDAERR-001 / 002)
5. 조작 경로 문장은 현행 그대로 유지 (REQ-WDAERR-003)
6. `pnpm test` — 신규 통과 + 기존 전부 통과

**REFACTOR**

7. `src/cli/commands/types.ts:52`의 코드 설명 주석을 정정한다 (AC-WDAERR-006).
   현재 `WDA_RESPONSE_LOST → 적용됐을 수 있다, 스크린샷으로 확인하라`는 조작
   기준 서술이다
8. `wda-client.ts` 헤더/`@MX` 주석에서 이 결함의 진단 이력을 한 줄로 남긴다 —
   "메시지에서 정책을 역추론하지 말 것"이 이 파일의 교훈이다
9. `git diff src/backend/wda-client.ts | grep -c 'idempotent ? 3 : 1'` → 0
   (AC-WDAERR-007)
10. `pnpm typecheck` / `pnpm build` (AC-WDAERR-008)

**D 판정 시도**

11. 실기기에서 응답 유실이 다시 발생하면 그때의 문구를 캡처해 AC-WDAERR-005를
    닫는다. 의도적 유발 절차는 없으므로 **기회 관측**이다
12. 세션 안에 만나지 못하면 **명시적 미검증으로 기록**한다

### 위험

- **가장 큰 위험은 정책 변경으로 번지는 것이다.** M6의 원래 진단이 "재시도를
  허용하라"였기 때문에 그 방향으로 끌려가기 쉽다. AC-WDAERR-007이 기계적
  방지선이지만, 착수 시 §A.2 PRESERVE를 먼저 읽는 것이 1차 방어다
- **조작 문구를 "정리"하고 싶어진다.** 두 분기를 만들면서 공통 문장을 뽑고 싶은
  충동이 생기는데, 조작 문구는 M3 실측이 근거인 정확한 문장이다. AC-WDAERR-003의
  고정 테스트를 먼저 쓰는 이유다
- 문구 판정 테스트가 문자열 완전 일치에 의존하면 잘 깨진다 — 「금지 문구가 없을
  것」과 「필수 취지가 있을 것」 수준으로 느슨하게 판정한다

---

## §C. 산출물

| 파일 | 변경 |
|---|---|
| `src/backend/wda-client.ts` | `WdaResponseLostError` 문장 생성 분기 + 주석 |
| `src/backend/wda-client.test.ts` | 픽스처 추가 (조작 고정 1건 + 멱등 3건) |
| `src/cli/commands/types.ts` | 코드 설명 주석 정정 (주석만) |
| `.moai/specs/SPEC-VISION-002/progress.md` | §E.1~§E.4 |

## §D. 완료 조건

`pnpm test` 전부 통과 · `typecheck` 0 · `build` 0 ·
AC-WDAERR-001~004·006~008 충족 · AC-WDAERR-005는 기회 관측 또는 **명시적 미검증**.
