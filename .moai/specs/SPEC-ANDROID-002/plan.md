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

### M1 — 상태 토큰 분리 + 폴백

> 0.2.0 개정: 「탭 우선」 방안은 착수 직전 실측으로 반증됐다(spec.md §A.2).
> `-l`에는 탭이 없다.

**RED**

1. `device-list-parser.test.ts`에 실기기 `adb devices -l` 관측 그대로의 픽스처를
   추가한다 (**탭 없음, 공백 1개**):
   `adb-R3CY106LKVX-xtn5zd (2)._adb-tls-connect._tcp device product:pa3qksx model:SM_S938N device:pa3q transport_id:124`
   기대: serial 온전 보존 + `state === "device"` + `model === "SM_S938N"`
   (AC-SERIAL-001 / 004 — `device:pa3q`를 상태로 오인하지 않는지 함께 본다)
2. 탭 구분 형식(`adb devices`) 픽스처를 추가한다 (AC-SERIAL-003)
3. `pnpm test`로 **RED 확인** — 1번이 실패해야 한다. 실패하지 않으면 픽스처가
   결함을 재현하지 못한 것이므로 픽스처부터 고친다

**GREEN**

4. `device-list-parser.ts:38`의 분리 규칙을 상태 토큰 탐색으로 바꾼다.
   상태 토큰을 못 찾으면 기존 정규식으로 폴백 (REQ-SERIAL-001 / 002)
5. `pnpm test` — 신규 통과 + **기존 6종 무수정 통과** (AC-SERIAL-002)

**REFACTOR**

6. `@MX:NOTE`를 갱신한다 — 왜 탭이 아니라 상태 토큰인지, `-l`에 탭이 없다는
   실측 근거와 폴백을 남긴 이유를 적는다
7. `pnpm typecheck` / `pnpm build` (AC-SERIAL-007)

**D 판정 (유발 가능 — 0.2.0)**

8. 충돌 기기가 연결된 상태에서 `node dist/cli/bin.js devices`를 재실행해,
   serial이 온전하고 `connectionState: "device"`인지 확인한다 (AC-SERIAL-006)
9. 수정 전 출력을 progress.md에 함께 남겨 전후 대조가 되게 한다

### 위험

- **`device:<value>`를 상태로 오인할 수 있다.** `-l` 부가 필드에 `device:pa3q`가
  있다. 상태 토큰 매칭은 **단독 토큰**만 잡아야 한다(뒤에 콜론이 오면 제외).
  AC-SERIAL-004가 이 대조를 담당한다
- **폴백 분기가 새 표면을 만든다.** 기존 6종이 어느 경로로 흐르든 결과가 같아야
  한다 — 무수정 통과가 그 확인이다
- **상태 열거값을 좁게 잡으면 조용히 폴백된다.** 폴백은 기존 동작이라 터지지
  않고 조용히 예전처럼 잘린다. 열거에 없는 상태가 나오면 그 줄은 개선 없이
  통과한다는 뜻 — `no permissions`가 그 예이며 범위 밖으로 명시했다

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
