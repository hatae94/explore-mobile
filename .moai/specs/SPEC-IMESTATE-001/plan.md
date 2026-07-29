---
id: SPEC-IMESTATE-001
title: "기기별 IME 세션 상태 격리 — 구현 계획"
version: "0.2.0"
status: draft
created: 2026-07-29
updated: 2026-07-29
author: hatae
---

# 구현 계획 — SPEC-IMESTATE-001

> 마일스톤 배치 원칙에 예외가 하나 있다. **M1은 변경 확률 때문에 앞에 있는 것이 아니라 게이트이기 때문에 앞에 있다** — 전후 대조 의무(AC-002·021)의 근거가 여기서 만들어진다. M2 이후는 **결정 번복 가능성 내림차순**이며, 가장 미확정인 M3(구 파일 폐기 경로)은 M2에 대한 의존이 허용하는 한 가장 앞에 두었다.
>
> **0.2.0 변경 요약** — plan-auditor 1차 감사 FAIL(0.63) 반영: ① §C·§E의 grep 패턴이 실제로 매치되지 않아 사전 점검과 AC-008이 공허했다(`-F` + 양성 대조로 교체) ② `git diff`가 커밋 후 항상 빈 출력이라 AC-018이 공허했다(기준 SHA 범위 비교로 교체) ③ §B.1의 "재현이 안 될 수 있다 = 최고 리스크"가 실측과 반대였다(재현됨 — 리스크 재배치, §B.2를 최고로) ④ §B.2의 두 번째 후보가 REQ-001 위반인데 M3에서 재개봉 가능했다(명시 기각) ⑤ 영향 파일 `router.test.ts` 누락(5개 구성 지점) ⑥ M2에 REQ-007(배타 생성)·REQ-008(툼스톤) 반영.

## §A. 컨텍스트

- 대상: `/Users/hatae/Documents/personal/explore-mobile`, 브랜치 `master`
- 선행 SPEC: SPEC-ANDROID-001(completed) — IME 세션 저장소와 ADBKeyBoard 경로가 여기서 도입됐다
- 이 SPEC은 **신규 능력이 아니라 결함 수정**이다. 사용자에게 보이는 새 명령·새 플래그·새 응답 필드가 없다.
- 닫는 결함은 둘이다: **① 시리얼 간 유실**(`ime-session-store.ts:22-27` `@MX:NOTE`가 자기 문서화) **② 동일 시리얼 check-then-act**(`adb-backend.ts:454-457`). 증상이 같으므로(복원 불가) 함께 닫는다.

**주 변경 대상 (1파일)**

- `src/backend/ime-session-store.ts` — 저장 배치를 단일 파일에서 기기별 파일로 교체 + 배타 생성 + 툼스톤

**PRESERVE 대상 (수정 금지 — REQ-IMESTATE-006)**

- `src/backend/adb-backend.ts` — **직접** 호출자. `ImeSessionStore` 사용 지점을 바꾸지 않는다. 특히 `:454-457`의 check-then-act는 **그대로 두고** 저장소가 그 의도를 원자적으로 이행한다(REQ-007)
- `src/cli/commands/reset.ts` · `src/cli/commands/doctor.ts` — **간접** 호출자. `ImeSessionStore`를 직접 참조하지 않고 `AdbBackend.getTrackedOriginalIme`/`clearTrackedOriginalIme`를 경유한다(`reset.ts:80, 90`)
- `src/schema/device-backend.ts` — `DeviceBackend` 10개 메서드 표면 불변
- `src/backend/apk-downloader.ts` — `resolveApkCacheDir()`는 읽기만 한다(캐시 디렉터리 결정 규칙 재사용)
- `src/webview/calibration.ts` — 같은 결함군이지만 `spec.md` §C.4로 이월. **이 SPEC에서 건드리지 않는다**

**부수 변경 가능 대상 (테스트 3파일 + barrel)**

- `src/backend/ime-session-store.test.ts` — 신규 AC 대응 테스트 추가
- `src/backend/adb-backend.test.ts` — 저장소 주입 형태 변화에 따른 조정
- `src/cli/router.test.ts` — **구성 지점 5곳**(`:1089 :1139 :1183 :1189 :1235`)과 경로 조립(`:1061`). 생성자 arg1이 파일→디렉터리로 바뀌면 전부 영향권이다
- `src/index.ts` — export 표면 변경 4종(`spec.md` §C.2 표) 반영

## §B. 알려진 이슈 / 리스크

### B.1 구 파일 폐기 경로 [최고 리스크 — 설계 미확정]

REQ-IMESTATE-003은 "이관 후 구 파일이 조회 대상에서 제거된다"만 요구하고 **방법을 M3에 위임했다.** 후보와 함정:

- **구 파일 통째로 rename** (`ime-sessions.json` → `ime-sessions.json.migrated`) — rename은 원자적이라 이관 주체가 한 프로세스로 자연히 정해진다. 실패(ENOENT = 남이 이미 함)는 무해. **유력 후보.**
- **구 파일에서 항목별 삭제** — **REQ-IMESTATE-001 위반으로 명시 기각.** 공유 파일에 대한 read-modify-write이므로 고치려는 결함을 이관 경로에 재현한다. `spec.md` §D가 제외 항목으로 못박았다. **M3에서 재개봉하지 않는다** — "왜 결함을 재도입하지 않는지 증명하면 가능"이라는 여지는 0.2.0에서 삭제했다.
- **표식 파일로 이관 완료 기록** — 표식이 새 상태이고 실데이터와의 불일치 경로가 생긴다. 단, REQ-008의 툼스톤이 이미 시리얼별 음성 기록을 도입했으므로 그것과 역할이 겹치지 않는지 검토가 필요하다.

M3에서 하나를 택하고 근거를 남긴다. 실질 후보는 rename과 표식 둘뿐이다.

### B.2 대소문자 무구분 파일시스템 [중간 — 볼륨 특성 미측정]

REQ-IMESTATE-002 성질 2의 인코딩 측면은 실행으로 확인됐다(`ABC123`→`414243313233`, `abc123`→`616263313233`, `spec.md` §C.1-⑭). 그러나 **볼륨이 실제로 대소문자를 구분하지 않는지는 측정하지 않았다**(§C.1-⑲).

주의: 인코딩이 소문자 hex이므로 두 시리얼은 애초에 다른 파일명이 되고, 따라서 **대소문자 구분 볼륨에서도 테스트가 통과한다.** AC-005가 볼륨 무구분성 프로브를 동반하는 이유다 — 프로브 없이 PASS로 기록하면 미관측이 관측으로 부당 승격된다.

### B.3 테스트 주입 형태 변화 [중간 — 회귀 직결, 영향 지점 7곳]

현재 `ImeSessionStore`는 `(storePath, io)`를 주입받아 테스트가 실제 `~/.cache`를 건드리지 않는다. 기기별 파일로 바뀌면 첫 인자가 디렉터리가 되고, 구 파일 폴백 때문에 구 파일 경로도 주입 대상이 된다.

영향 지점(실측): `router.test.ts` 5곳 + 경로 조립 1곳, 그 외 `ime-session-store.test.ts` · `adb-backend.test.ts`.

대응: 주입 파라미터에 기본값을 주어 기존 호출 형태를 최대한 보존하고, M4에서 702개 전체 통과를 마감 조건으로 확인한다.

### B.4 재현 하네스의 함정 [중간 — 거짓 음성·거짓 실패 양방향, 실측됨]

결함 존재 자체는 이제 리스크가 아니다 — **결정적 재현이 관측됐다**(`spec.md` §C.1-⑪). 리스크는 하네스 쪽으로 이동했다:

- **거짓 음성**: `setOriginalIme`은 자기 안에서 다시 읽으므로, 두 호출을 순차 `await`하는 하네스는 **재현에 실패한다.** 실제로 첫 시도가 그렇게 실패했고(두 기록 모두 생존), 읽기 배리어를 넣은 뒤에야 재현됐다. 하네스를 순진하게 짜면 "결함이 없다"고 오독한다.
- **거짓 실패**: 가짜 디스크를 단일 변수(blob)로 두면 수정 후에도 경로 차이를 무시해 **여전히 한쪽이 이긴 것처럼 보인다.** 가짜 IO는 반드시 **경로별로 키를 나눈 저장소**여야 한다.
- **전후 대조의 동일성**: 생성자 arg1 의미가 M2에서 바뀌므로, M1 테스트가 경로에 의존하면 M2에서 본문을 수정해야 하고 전후 대조가 서로 다른 두 테스트의 비교로 변질된다. **IO를 주입**해 작성한다.

AC-002·021이 이 세 요건을 명시한다.

### B.5 배타 생성과 툼스톤의 상호작용 [낮음 — 경로 분리로 해소]

REQ-007(배타 생성)과 REQ-008(툼스톤)이 같은 경로를 쓰면 충돌한다 — 툼스톤이 있는 상태에서 레코드 배타 생성이 EEXIST로 실패하면 새 세션을 기록할 수 없다. `spec.md` §A.3-⑥이 이를 **다른 경로**(`<enc>.json` vs `<enc>.cleared`)로 분리해 해소했다. 구현 시 이 분리를 유지하는지만 확인하면 된다(AC-024).

## §C. 사전 점검 (Pre-flight)

구현 시작 전에 아래를 **실행해서** 확인한다. 추론으로 대체하지 않는다.

| # | 확인 | 방법 | 기대 |
|---|---|---|---|
| 0 | **기준 SHA 기록** | `git rev-parse HEAD` → 이 값을 `$BASE`로 보존(AC-018이 사용) | SHA 1개 |
| 1 | 기준선 테스트 통과 | `pnpm test` | 32 files / 702 tests pass, exit 0 |
| 2 | 기준선 타입·빌드 | `pnpm typecheck` · `pnpm build` | 양쪽 exit 0 |
| 3 | 결함 ① 주석 존재 | `grep -n "NOT atomic" src/backend/ime-session-store.ts` | `:22` 부근 매치 |
| 4 | 결함 ② check-then-act 존재 | `grep -n "existingOriginal" src/backend/adb-backend.ts` | `:454` 부근 매치 |
| 5 | 캐시 디렉터리 결정 규칙 | `grep -n "resolveApkCacheDir" src/backend/apk-downloader.ts` | 함수 존재 — 재사용 대상 |
| 6 | 직접 참조 파일 전수 | `grep -rln "ImeSessionStore" src/ \| grep -v test` | **4파일**: `webview/calibration.ts`(주석 참조·§C.4 이월) · `index.ts`(export 표면 변경 대상) · `backend/ime-session-store.ts`(주 변경) · `backend/adb-backend.ts`(직접 호출자). `reset.ts`·`doctor.ts`는 여기 **나오지 않는다** — 간접 호출자다 |
| 7 | export 표면 확인 | `grep -n "ImeSession\|resolveImeSession" src/index.ts` | `:30-34` 5종 — `spec.md` §C.2 표와 일치 |
| 8 | 손실 있는 정리 코드 위치 (**양성 대조**) | `grep -nF 'replace(/[^A-Za-z0-9_-]/g' src/backend/adb-backend.ts` | `:57` 매치 — **재사용 금지 대상**임을 재확인. `-F` 없이는 매치되지 않는다(0.1.0의 결함) |
| 9 | `router.test.ts` 영향 지점 | `grep -n "new ImeSessionStore\|imeStorePath = " src/cli/router.test.ts` | 6행(`:1061` 경로 조립 + `:1089 :1139 :1183 :1189 :1235` 구성) |

## §D. 제약

- `pnpm test` / `pnpm typecheck` / `pnpm build` 3종이 이 프로젝트의 유일한 품질 게이트다. **자동화된 CI 게이트는 없다**(`.moai/project/interview.md:48`) — 초록불은 전부 수동 실행 결과이므로 각 마일스톤 종료 시 직접 실행한다.
- 커버리지 임계값은 `vitest.config.ts`에 설정되어 있지 않다(같은 근거). 커버리지는 목표로 두되 게이트로 착각하지 않는다.
- 런타임 의존성을 추가하지 않는다. 필요한 것은 모두 `node:fs/promises`(배타 생성은 `wx` 플래그) · `node:path` · `node:buffer`로 해결된다.
- 코드 주석은 한국어(`.moai/config/sections/language.yaml` → `code_comments: ko`). 단 식별자·타입명은 영어.
- 잠금(lock)을 도입하지 않는다(`spec.md` §A.3-②). 대기·타임아웃·부생 상태를 만드는 설계는 기각 대상이다.

## §E. 자체 검증 (Self-Verification)

각 마일스톤 종료 시 아래를 실행하고 **출력을 근거로** 보고한다. "통과했을 것"은 보고가 아니다.

```bash
pnpm test          # 32 files / 702+ tests, exit 0
pnpm typecheck     # exit 0
pnpm build         # exit 0
```

이 SPEC 고유의 검증:

```bash
# 호출자 무수정 확인 (REQ-IMESTATE-006 / AC-018)
# $BASE = §C 0번에서 기록한 M1 착수 직전 SHA. 리비전 없는 git diff는
# 커밋 후 항상 빈 출력이라 공허하다 — 반드시 범위 비교로 실행한다.
git diff --name-only "$BASE"..HEAD -- \
  src/backend/adb-backend.ts src/cli/commands/reset.ts src/cli/commands/doctor.ts
# 기대: 출력 없음

# 손실 있는 정리 코드 미재사용 확인 (spec.md §A.3-④ / AC-008)
# ① 양성 대조 — 패턴이 유효함을 먼저 증명 (기대: :57 매치)
grep -nF 'replace(/[^A-Za-z0-9_-]/g' src/backend/adb-backend.ts
# ② 본 검사 (기대: 매치 없음)
grep -nF 'replace(/[^A-Za-z0-9_-]/g' src/backend/ime-session-store.ts

# 잠금 미도입 확인 (spec.md §A.3-② / §D)
grep -nEi 'lockfile|flock|acquireLock|\.lock' src/backend/ime-session-store.ts
# 기대: 매치 없음
```

## §F. 마일스톤

### M1 — 재현 선행 [게이트 · 두 결함 모두 실패 확인이 통과 조건]

목적: 전후 대조 의무(AC-002·021)의 근거를 만든다. **두 결함을 먼저 재현하고, 재현되는 것을 확인한 뒤에만 다음으로 간다.**

- **결함 ①(시리얼 간)**: 서로 다른 시리얼 2개의 `setOriginalIme`을 강제 인터리빙 → 한쪽 기록 소멸 확인.
- **결함 ②(동일 시리얼)**: 같은 시리얼에 대해 "부재 확인 → 기록"을 두 주체가 강제 인터리빙 → 나중 값이 앞선 값을 덮는 것 확인.
- **하네스 요건 (§B.4 — 필수)**: ① 가짜 IO는 **경로별 키 저장소**(단일 blob 금지) ② 인터리빙은 `setOriginalIme` **내부**에서 강제(순차 await는 재현 실패) ③ 테스트는 **IO를 주입**해 작성(경로 의존 금지 — M2의 arg1 의미 변화에도 본문 유지).
- 산출: 실패하는 테스트 2건 + 관측 기록. 호스트 파일 I/O만 관여하므로 실기기가 필요하지 않다(`spec.md` §C.3).
- **게이트**: 두 재현이 모두 성립하지 않으면 중단하고 전제를 재검토한다. 결정적 재현은 감사 중 이미 관측됐으므로(`spec.md` §C.1-⑪) 실패는 하네스 결함을 먼저 의심한다.

### M2 — 기기별 저장소 + 배타 생성 + 툼스톤 [핵심 · 규칙은 SPEC에서 확정됨]

- 시리얼 → 파일명 인코딩을 순수 함수로 구현한다: UTF-8 바이트 → 소문자 hex. 확장자는 레코드 `.json` / 툼스톤 `.cleared`. 역변환도 제공해 추적성을 확보한다.
- `<cache-dir>/ime-sessions/` 아래에 기기별 레코드를 읽고 쓴다. 레코드 내용에 원본 시리얼 필드를 포함한다(REQ-002 / AC-007).
- **레코드 생성은 배타 생성**(`wx`)으로 한다. EEXIST는 오류가 아니라 "다른 프로세스가 이겼다"는 정상 결과로 처리하고 기존 값을 보존한다(REQ-007 / AC-021·022).
- **`clear`는 레코드를 제거하고 툼스톤을 만든다.** 조회는 3단계(레코드 → 툼스톤 → 구 파일)를 이 순서로 따른다(REQ-008 / AC-015·023).
- **새 세션 시작 시 툼스톤을 멱등하게 제거**한다. 레코드 파일 우선 규칙이 이기는지 확인한다(AC-024).
- 공개 메서드 3개의 시그니처를 보존한 채 내부만 교체한다(REQ-006 / AC-017).
- 읽기 견고성을 유지한다: 없는 파일 · 빈 파일 · 깨진 JSON · 기대 밖 모양 → `undefined`, 예외 전파 금지(REQ-004 / AC-014).
- `src/index.ts` export 표면을 `spec.md` §C.2 표대로 조정한다.
- **M1의 재현 테스트 2건이 이 시점에 통과로 바뀌어야 한다.**

### M3 — 구 단일 파일 이관·폐기 경로 [최고 변경 확률 · 설계 확정 포함]

- 조회 3단계 중 3단계(구 파일 폴백)를 구현한다(REQ-003 / AC-009·010).
- 이관은 결과적으로 멱등하다 — 같은 내용을 같은 경로에 배타 생성하므로 승자가 누구든 최종 상태가 같다(AC-011).
- **폐기 방법을 §B.1의 실질 후보 두 개(통째 rename / 표식) 중에서 확정하고 근거를 코드 주석과 `spec.md` §C에 남긴다.** 항목별 삭제는 REQ-001 위반으로 이미 기각됐으므로 후보가 아니다.
- 구 파일이 애초에 없는 경우(신규 설치)에 이관 경로가 아무 부작용도 일으키지 않아야 한다(AC-012).
- AC-013의 관측 절차(이관 유발 → 구 파일 직접 변조 → 비가시성 확인)가 어떤 폐기 방법에서도 통과하는지 확인한다.

### M4 — 회귀 확인 [필수 · 호출자 무수정 증명]

- §E의 자체 검증 전체를 실행한다(범위 비교 `git diff` + 양성 대조 grep + 잠금 미도입 grep 포함).
- 기존 702개 테스트가 전부 통과하는지 확인한다. 조정이 필요한 테스트가 있으면 **조정 사실과 이유를 기록한다** — 통과시키기 위해 단정을 약화시키는 것은 금지한다. 영향 예상: `ime-session-store.test.ts` · `adb-backend.test.ts` · `router.test.ts`(6지점).
- 단일 기기 경로(한 기기에 한글 입력 → `reset` 복원)가 이전과 동일하게 동작하는지 확인한다(AC-020, 실기기 확보 시).

### M5 — 두 프로세스 실측 [마감 조건]

- 빌드 산출물 `dist/backend/ime-session-store.js`를 직접 임포트하는 스크립트 2개를 동시 실행한다(`node --input-type=module`). CLI `text`를 거치지 않으므로 실기기·adb가 불필요하다(AC-003).
- M1의 관측과 대조한다: 수정 전에 유실이 관측됐다면 수정 후에는 관측되지 않아야 한다. 수정 전에 관측되지 않았다면 "이 마일스톤은 유실 부재만 확인했고 결함 해소를 증명하지는 못했다"고 정직하게 기록한다(`spec.md` §C.1-⑰의 자연 발생 타이밍은 미관측 항목이다).
- 실기기 확보 시 Android 2대로 `text`(한글) 병렬 → `reset` 양쪽 복원까지 확인한다. **미확보 시 미관측으로 기록하고 마감한다**(`spec.md` §C.3).

## §G. 마일스톤 의존 관계

```
M1 (재현 게이트 · 결함 ①②)
 └─> M2 (기기별 저장소 + 배타 생성 + 툼스톤)   ← M1의 테스트 2건이 여기서 통과로 전환
      └─> M3 (구 파일 이관·폐기)                ← M2의 기기별 경로가 존재해야 이관 대상이 생김
           └─> M4 (회귀 확인)
                └─> M5 (두 프로세스 실측 · 마감)
```

- M1은 게이트다. 통과하지 않으면 M2 이후가 전부 무효다.
- M3은 §B.1 기준으로 가장 번복 가능성이 높다. M2 완료 직후에 배치해 인간 리뷰가 이 결정에 집중할 수 있게 했다.
- M5는 M4 이후여야 한다 — 회귀가 남은 상태의 실측은 무엇을 측정한 것인지 불명확해진다.
