# SPEC-ANDROID-002 — plan.md

실행 계획. Tier S이므로 마일스톤 1개다.

## §A. 착수 전 상태

### A.1 기준 커밋

```
base_commit_sha: (착수 시점 HEAD로 기록)
branch: master
```

### A.2 PRESERVE 목록 (수정 금지)

- `src/backend/adb-backend.ts` — 파서 호출부. 입력이 옳게 들어오면 그대로 동작한다
- `src/backend/device-list-parser.test.ts`의 **기존 픽스처 6종** — 새 픽스처만 추가
- `src/index.ts` — `parseAdbDevicesList` 재수출. 시그니처가 안 바뀌므로 무변경
- `src/webview/`, `src/backend/wda-*.ts` — 무관

### A.3 병행 SPEC 회피

`SPEC-VISION-002`가 `src/backend/wda-client.ts`를 건드린다. 파일이 겹치지 않으므로
동시 진행이 가능하나, 커밋은 SPEC별로 분리한다.

---

## §B. 마일스톤

### M1 — 탭 우선 분리 + 폴백

**RED**

1. `device-list-parser.test.ts`에 실기기 `od -c` 관측 그대로의 픽스처를 추가한다:
   `adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp\tdevice`
   기대: `serial`이 온전히 보존되고 `state === "device"` (AC-SERIAL-001)
2. 탭 없이 공백만 있는 줄의 폴백 픽스처를 추가한다 (AC-SERIAL-003)
3. 공백 포함 serial + `-l` 롱포맷 `model:` 픽스처를 추가한다 (AC-SERIAL-004)
4. `pnpm test`로 **RED 확인** — 1번이 실패해야 한다. 실패하지 않으면 픽스처가
   결함을 재현하지 못한 것이므로 픽스처부터 고친다

**GREEN**

5. `device-list-parser.ts:38`의 분리 규칙을 바꾼다. 탭이 있으면 탭 기준, 없으면
   기존 공백 기준으로 폴백한다 (REQ-SERIAL-001 / 002)
6. `pnpm test` — 신규 3건 통과 + **기존 6종 무수정 통과** (AC-SERIAL-002)

**REFACTOR**

7. `@MX:NOTE`를 갱신한다 — 왜 탭이 실제 구분자인지, 폴백을 왜 남겼는지.
   근거(실기기 `od -c` 관측)를 주석에 남긴다
8. `pnpm typecheck` / `pnpm build` (AC-SERIAL-007)

**D 판정 시도**

9. mDNS 이름 충돌 상태를 만들 수 있는지 시도한다. 성공하면 실기기에서 `devices`
   출력과 명령 1건을 관측해 AC-SERIAL-006을 닫는다
10. 유발하지 못하면 **「명시적 미검증」으로 기록**하고 닫는다. 유발 절차를
    progress.md에 남겨 다음 사람이 다시 조사하지 않게 한다

### 위험

- **폴백 분기가 새 표면을 만든다.** 탭/공백 두 경로가 생기므로, 기존 픽스처가
  폴백 경로로 흘러 들어가는지 확인해야 한다 — 기존 6종이 전부 통과하는 것이
  그 확인이다
- **`\s+`를 그냥 `\t+`로 바꾸면 회귀한다.** 탭 없이 공백만 쓰는 adb 출력이
  존재할 가능성을 관측으로 배제하지 않았다. 폴백은 선택이 아니라 필수다

---

## §C. 산출물

| 파일 | 변경 |
|---|---|
| `src/backend/device-list-parser.ts` | 분리 규칙 + `@MX:NOTE` |
| `src/backend/device-list-parser.test.ts` | 픽스처 3건 추가 (기존 무수정) |
| `.moai/specs/SPEC-ANDROID-002/progress.md` | §E.1~§E.4 |

## §D. 완료 조건

`pnpm test` 전부 통과(순증 3건) · `typecheck` 0 · `build` 0 ·
AC-SERIAL-001~005·007 충족 · AC-SERIAL-006은 충족 또는 **명시적 미검증**.
