# Sync Re-Audit — SPEC-GESTURE-001 0.4.0

- **Auditor**: sync-auditor (independent, adversarial stance)
- **Date**: 2026-07-28
- **Delta audited**: `737b9fb..471b7ff` (6 commits; 17 local commits total, nothing pushed)
- **Prior audit**: PASS-WITH-DEBT 0.69, SAFE TO PUSH: No, 4 MUST-FIX items

---

## VERDICT

**PASS-WITH-DEBT** — **0.76** (harmonic mean). Delta **0.69 → 0.76**.

Three of the four MUST-FIX items are genuinely closed with live evidence, not restated.
F1 is **PARTIAL**: the new guard works on the audited screen and is provably inert on a whole
class of real devices. The fixes also introduced one behavioral regression and re-committed the
prior audit's core charge — asserting as fact a claim contradicted by measurement.

---

## Dimension scores

| Dimension | 0.3.0 | 0.4.0 | Reasoning |
|---|---|---|---|
| Functionality | 0.60 | **0.72** | F2/F3/F4 genuinely closed and live-verified; 553 tests green. Against that: F1 closes only on even-dimension screens (live-reproduced failing on iPhone 16), the `minValidRatio` remedy moves the screen 0/3 trials, and the F4 fix introduced a container-scroll regression. Two `ok:true`-with-no-observable-effect paths remain reachable — the exact class this amendment targeted. |
| Security | 0.92 | **0.93** | Surface unchanged: no new argv or shell path; `readScrollIntoViewOutcome` type-narrows defensively and degrades to `{found:false,moved:false}`. Validation tightened (`parsePositiveInteger`). `--duration` still unbounded (F7 unresolved, now live-confirmed as a hang). |
| Craft | 0.72 | **0.74** | Coverage up (93.43% stmts / 95.29% lines). `minNonDegenerateRatio`'s monotonicity assumption is explicitly argued and I verified it holds (0 violations across 4.8M samples). MX tags partially added. Against that: AC-GEST-018's boundary assertion is tautological, and the test matrix again omits the dimension that hid the bug — the same structural gap AC-GEST-020's own note names. |
| Consistency | 0.62 | **0.70** | Docs substantially corrected: the F5 contradiction is gone at source, the Android caveat is now local to both commands, `-scrolled` semantics now match the code. Against that: the `minValidRatio` claim is measurably false in both README and CHANGELOG, the `native` row is now wrong for container scrolls, and F9 persists with a new wrong value. |

`4 / (1/0.72 + 1/0.93 + 1/0.74 + 1/0.70)` = **0.7628** → **0.76**

---

## PRIOR MUST-FIX DISPOSITION

### F1 — zero-distance scroll reported as success → **PARTIAL**

**Closed on even-dimension screens.** `src/cli/commands/scroll-geometry.ts:155-157`
(`isDegenerateSwipe`) + `src/cli/commands/scroll.ts:119-126` (`AMOUNT_TOO_SMALL`). Live on
402×874, all four directions: the degenerate band is rejected with zero gestures, and the
boundary value succeeds.

```
scroll down --amount 0.001  -> AMOUNT_TOO_SMALL {"requestedRatio":0.001,"minValidRatio":0.001271294429898262}
scroll left --amount 0.002  -> AMOUNT_TOO_SMALL {"requestedRatio":0.002,"minValidRatio":0.0027639586478471756}
```

**NOT closed on odd-dimension screens** — see N2. Live on a real iPhone 16 (393×852):
`scroll left --amount 0.000000001` → `ok:true`, `from{196,426}` → `to{197,426}`, screenshot
byte-identical. The guard never fires on an odd axis.

**And the remedy it hands back does not work** — see N3. `minValidRatio` on 402×874 yields a 2px
swipe that moved the screen **0/3 trials**.

### F2 — duration-less swipe documented as a working mode → **RESOLVED** (documentation obligation)

`README.md:232-236` now reads "omit it to use the platform default duration (see the reliability
caveat below before relying on the default)", followed by a dedicated paragraph at `README.md:255-268`.
The old contradiction is removed **at source**, not supplemented: the sentence that previously
presented omission as normal now carries the forward reference, and the caveat paragraph sits
inside the same `swipe` section a swipe-only reader would read.

**On the 3/5-vs-5/5 framing** — this is the honest framing, not a hedge. It states both
measurements, explicitly refuses to generalize either ("session-variable, neither a dependable
default nor a guaranteed no-op"), and gives an actionable recommendation (`500`, confirmed 5/5).
Claiming a fixed failure rate from 10 total trials would have been the dishonest option.
REQ-GEST-SWIPE-006's "disclose where the command is documented" is satisfied — verified by
reading the section in isolation.

I did **not** re-measure the 3/5 ratio myself (the web-inspector oracle was too flaky this
session); accepted on the strength of the disclosure's own hedging.

### F3 — `--duration 0` accepted → **RESOLVED**

`src/cli/validators.ts:31-35` (`parsePositiveInteger`), wired at `:66-68`. The predicate is
deliberately separate from `parseCoordinate`'s, which is the correct call — sharing one would make
AC-GEST-003 and AC-GEST-019 mutually exclusive. Live-verified all three branches:

```
swipe … --duration 0   -> INVALID_DURATION "swipe --duration requires a positive integer number of milliseconds."
swipe … --duration 1   -> ok, durationMs:1
swipe 0 0 0 100        -> ok, to:{x:0,y:100}      # coordinate 0 preserved
```

The coordinator's own `3feabfd` message change is correct and matches the observed output verbatim.

### F4 / F5 — `-scrolled` overstatement + README contradiction → **RESOLVED**, but see N1

`src/cli/commands/web-support.ts:218-227` computes `moved` from a `window.scrollY` comparison
inside the same expression; `:289-304` branches the method on `moved`, not on `found`.

Live-verified on the **exact** regression case I reported in the first audit — Wikipedia's
off-canvas drawer links, replicating the shipped expression verbatim against the real elements:

| element | scrollY | moved | 0.3.0 reported | 0.4.0 reports |
|---|---|---|---|---|
| (genuine off-viewport) | 0 → 1626 | true | `native-scrolled` | `native-scrolled` |
| "Home" (drawer) | 1626 → 1626 | false | `js-click-scrolled` | **`js-click`** |
| "Random" (drawer) | 1626 → 1626 | false | `js-click-scrolled` | **`js-click`** |

The docs match the code: `README.md:415-425` now says the suffix is set "only when the page's
scroll position is **measured to have actually changed**", names `window.scrollY` as the
mechanism, and describes the old defect. F5's contradiction is gone.

---

## AC VERIFICATION — all 21

**My tally: 17 PASS / 4 PARTIAL / 0 FAIL**, against the claimed 19 / 2 / 0.
I now **agree** on AC-GEST-007, 013→(see below), 016 — two of my three prior disagreements are
resolved by the fix. I **disagree** on AC-GEST-013 and AC-GEST-018.

| AC | Claimed | Mine | Basis |
|---|---|---|---|
| 001 | PASS | PASS | Inspection + suite (argv unchanged) |
| 002 | PASS | PASS | **Re-ran live** — `--duration 500` works; `0` now also rejected |
| 003 | PASS | PASS | Accepted on inspection (unchanged since prior audit, re-verified there) |
| 004 | PASS | PASS | **Re-ran** — 553/553, typecheck 0, build 0, interface grep = 9 |
| 005 | PASS | PASS | **Re-ran live** — `--amount 0.5` moved 3/3 screenshot trials |
| 006 | PARTIAL | **PARTIAL (agree)** | `adb` still absent |
| 007 | PASS | **PASS (upgraded from my prior PARTIAL)** | The degenerate band is now rejected, so `to.y < from.y` holds for every *accepted* scroll. Even the 1px odd-screen case preserves direction (`left` → `to.x > from.x`, live) |
| 008 | PASS | PASS | **Re-ran** — grep = 9; live dump derives 402×874 with witness |
| 009 | PASS | PASS | Accepted on inspection (re-verified in prior audit) |
| 010 | PASS | PASS | Executed directly (prior audit) |
| 011 | PASS | PASS | **Re-ran live** — scroll down/up succeed, no `SCREEN_SIZE_UNKNOWN` |
| 012 | PASS | PASS | Accepted — not re-run (destructive) |
| 013 | PASS | **PARTIAL** | The overstatement is fixed, but the container case (N1) is a real scroll that goes **unmarked** — `method:"native"`. AC-GEST-013's Given is the AC-GEST-012 situation, which a container-scrolled element satisfies |
| 014 | PASS | PASS | Inspection (unit-scoped AC) |
| 015 | PASS | PASS | **Re-ran live** — ~25 responses, all single parseable JSON |
| 016 | PASS | **PASS (upgraded from my prior PARTIAL)** | Same reasoning as 007 |
| 017 | PASS | PASS | Executed directly (prior audit) |
| 018 | PASS | **PARTIAL** | **Re-ran live**, all 4 directions on 402×874 — passes exactly as written. But the AC's own promise ("동작 경계", "그 화면에서 유효한 최소 비율") is not delivered: the reported boundary moves the screen 0/3 (N3), and the guard is inert on odd dimensions (N2). The AC fixture is even×even, so it cannot catch either |
| 019 | PASS | PASS | **Re-ran live** — all three branches incl. the shared-parser trap |
| 020 | PARTIAL | **PARTIAL (agree)** | acceptance.md explicitly permits; I did not re-measure the ratio |
| 021 | PASS(unit)/GAP(live) | **PASS** | **GAP closed** — I reproduced it live: the shipped expression run verbatim against the real drawer elements gives `moved:false` → `js-click`. Full CLI-level e2e still blocked by proxy flakiness (see Environment) |

---

## NEW FINDINGS

### N1 — container scroll is now silent (**regression** introduced by the F4 fix)
**[MEDIUM][certain]** `src/cli/commands/web-support.ts:222-226`

`moved` samples only `window.scrollY`. `scrollIntoView` on an element inside an `overflow:auto`
container scrolls **the container**, leaving `window.scrollY` untouched. Live-proven on the real
device by injecting a scrollable container into the page:

```
case: container-scroll
  windowScrollY      1626 -> 1626      (unchanged)
  containerScrollTop    0 -> 755       (a real 755px scroll)
  moved (as computed by the CLI): false
  postConvertible: true
  0.4.0 reports: "native"       <- README: "Tapped directly — the page never moved."
  0.3.0 reported: "native-scrolled"   <- correct here
```

This is a strict regression against `737b9fb`: a genuine scroll side effect that the old code
surfaced is now suppressed. It violates REQ-GEST-WEB-002's own rationale ("페이지 스크롤 위치는
부작용이므로 조용히 바꾸지 않는다") — the fix traded an overstatement for an understatement, and an
understatement is the one REQ-GEST-WEB-002 was written to prevent.

**Fix**: derive `moved` from evidence that covers all scroll containers. The cheapest correct
signal is already at hand — compare the target element's own rect before and after inside the same
expression (`before.top !== after.top || before.left !== after.left`), which the SPEC itself lists
as an acceptable oracle ("호출 전후의 `scrollY`(**또는 대상 요소의 사각형**)를 비교", spec.md
REQ-GEST-WEB-002). That covers window, container, and horizontal scrolls in one predicate.

### N2 — `AMOUNT_TOO_SMALL` never fires on odd-dimension screens (F1 residual; **not** introduced by the fix)
**[HIGH][certain]** `src/cli/commands/scroll-geometry.ts:115-139` + `:155-157`

`computeScrollSwipe` places both endpoints at `center ± half`. When the screen dimension is **odd**,
`center` is a half-integer (e.g. 393/2 = 196.5), so `Math.round(center+ε) = 197` and
`Math.round(center−ε) = 196` for arbitrarily small ε — the endpoints can never collapse, so
`isDegenerateSwipe` is never true and the guard is unreachable on that axis.

Live reproduction on a real **iPhone 16 simulator (393×852)**, booted for this purpose:

```
# vertical axis (852, even) — guard works
scroll down  --amount 0.0000001   -> AMOUNT_TOO_SMALL  minValidRatio 0.0013041216880083084

# horizontal axis (393, ODD) — guard inert
scroll left  --amount 0.0000001   -> {"ok":true,...,"from":{"x":196,"y":426},"to":{"x":197,"y":426}}
scroll right --amount 0.0000001   -> {"ok":true,...,"from":{"x":197,"y":426},"to":{"x":196,"y":426}}
scroll left  --amount 0.000000001 -> {"ok":true,...,"from":{"x":196,"y":426},"to":{"x":197,"y":426}}
screenshot SHA-256 before/after all three: 0d209079abb0142c -> 0d209079abb0142c   (byte-identical)
```

Computed thresholds (`9.31e-10` == the binary search's 2^-30 floor == "never fires"):

| device | size | vertical | horizontal |
|---|---|---|---|
| iPhone 17 Pro | 402×874 | 0.00127 | 0.00276 |
| iPhone 16 / 15 | 393×852 | 0.00130 | **9.31e-10 — inert** |
| iPhone SE | 375×667 | **9.31e-10 — inert** | **9.31e-10 — inert** |

This directly contradicts the amendment's own load-bearing rationale. spec.md REQ-GEST-SCROLL-007
rejects the 1px clamp because *"1px은 어떤 터치 슬롭 임계값보다도 작아 기기에서는 여전히 아무 일도
일어나지 않을 가능성이 크다"* and *"'1px이면 움직인다'는 것은 아무도 측정하지 않은 기기 동작 주장"*.
The implementation then **emits exactly that 1px swipe** on odd axes and reports `ok:true`.

**On the design decision itself** (the coordinator asked me to judge it): the reasoning is
**sound and I agree with it**. Rejecting beats clamping — clamping converts a detectable failure
into an undetectable one, and the SPEC is right that "1px moves the screen" is unmeasured. My
objection is not to the decision but to the predicate chosen to implement it: `from === to` after
rounding encodes *"the coordinates differ"*, which is not the same proposition as *"this gesture
could move the screen"*. The decision promises the latter; the predicate delivers the former, and
the gap is exactly where devices with an odd logical dimension fall through.

**Fix**: make the predicate express the decision. Require a minimum travel in **pixels** — e.g.
reject when `|from − to|` on the scroll axis is below a documented, measured threshold — instead
of testing endpoint equality. Whatever threshold is chosen must be measured, per the SPEC's own
standard (this audit's data point: on 402×874, 2px moved 0/3, 4px moved 1/3, 40px moved 3/3).

### N3 — `minValidRatio` does not move the screen; README and CHANGELOG assert that it does
**[MEDIUM][certain]** `src/cli/commands/scroll.ts:124`; claim at `README.md:332-333` and `CHANGELOG.md:255`

Both documents state: *"`details.minValidRatio` reports the smallest ratio that **would move this
specific screen**."* Measured on 402×874 with a validated screenshot oracle (noise baseline: 3
identical hashes with no command):

| `--amount` | swipe distance | moved |
|---|---|---|
| `0.001271294429898262` (= the reported `minValidRatio`) | 2px | **0/3 trials** |
| `0.002` (README's own success example) | 4px | 1/3 trials |
| `0.05` | 40px | 3/3 trials |
| `0.5` (default) | 394px | 3/3 trials |

So the actionable payload of the new error code sends the caller to a value that returns `ok:true`
and moves nothing — back into the original defect class via a 2px swipe instead of a 0px one. This
is the prior audit's central charge recurring: **a factual claim in shipped documentation that the
project's own measurement contradicts.** acceptance.md AC-GEST-018 carries the same wording
("그 화면에서 **유효한** 최소 비율").

**Fix**: either (a) make `minNonDegenerateRatio` return a ratio meeting a measured
minimum-travel threshold (pairs naturally with N2's fix), or (b) if the value stays as-is, rename
the concept and correct both documents to say it is the smallest ratio producing *distinct
coordinates*, explicitly noting that distinct coordinates do not guarantee movement.

### N4 — `moved` ignores horizontal scrolling
**[LOW][high]** `src/cli/commands/web-support.ts:222-226`

Same root cause as N1: only `scrollY` is sampled. `scrollIntoView`'s default `inline: "nearest"`
can scroll the page horizontally; an element already vertically centred but off to the side yields
`scrollX` change with `scrollY` unchanged → `moved:false`. My live attempt to isolate this also
moved `scrollY` (1626→1484), so I could not produce a clean horizontal-only counterexample —
hence "high", not "certain". Fixed by the same rect-delta change recommended in N1.

### N5 — AC-GEST-018's boundary assertion is tautological
**[LOW][certain]** `.moai/specs/SPEC-GESTURE-001/progress.md:736` (evidence line) + the AC-GEST-018 tests

The boundary case is verified using `minNonDegenerateRatio()`'s **own output** as the expected
boundary, so it asserts that the function agrees with itself. On an odd-dimension screen the
function returns ~1e-9 and the resulting 1px swipe is non-degenerate — the test would still pass.
The direction-asymmetry guard (`expect(verticalBoundary).not.toBeCloseTo(horizontalBoundary, 5)`)
also passes on 393×852 (0.0013 vs 1e-9), because it asserts *difference*, not correctness.

This is the same structural failure mode AC-GEST-020's own note diagnoses for F2 ("AC 세트의 구멍"):
the amendment closed one AC-set hole while leaving another of identical shape. The fixture screen
(402×874) is even on both axes, so no test in the suite exercises odd parity.

**Fix**: add a fixture with an odd dimension (e.g. 393×852) to `scroll-geometry.test.ts` and assert
an absolute pixel floor, not endpoint inequality.

### N6 — F9 persists with a new wrong value
**[LOW][certain]** `.moai/specs/SPEC-GESTURE-001/spec.md:240` vs frontmatter

Frontmatter is `status: completed` (0.4.0, re-closed at `e10995f`); the §E roadmap row reads
`**in-progress (0.4.0 amendment)**`. The row was correctly updated *during* the amendment and not
updated again at re-close, so the same drift I reported at 0.3.0 (`draft` vs `completed`) is still
present, now as `in-progress` vs `completed`. Cosmetic and internal-only.

### N7 — F7 unresolved, now live-confirmed as a hang
**[LOW][certain]** `src/cli/validators.ts:31-35`

`--duration` still has no upper bound. `swipe 1 1 2 2 --duration 1000000000000000000000000`
converts to `--duration 1e+21` and **hung indefinitely** during this audit — I had to kill the
process and its `idb` child. Previously reported as a computed risk; now observed.
**Fix**: cap at a sane ceiling (e.g. 60000 ms) and reject above it with `INVALID_DURATION`.

### N8 — MX tag gap partially closed
**[INFO][certain]**

`scroll-geometry.ts` = 2, `scroll.ts` = 1, `web-support.ts` = 1; `swipe.ts` and `validators.ts`
remain at 0. Prior F8 was SHOULD-FIX; partial progress noted, not blocking.

### N9 — `reset`'s `AMBIGUOUS_DEVICE` severity re-assessed: INFO → **LOW-MEDIUM**
**[LOW-MEDIUM][certain]** pre-existing, SPEC-IOS-001 scope — out of this SPEC's remit

The coordinator asked whether my prior INFO rating still holds. **It does not.** I independently
reproduced the `idb_companion` wedge this session (`idb` hung while `xcrun simctl` kept working),
and confirmed the project's own recovery command cannot be used:

```
$ node dist/cli/bin.js reset
{"ok":false,"command":"reset","error":{"code":"AMBIGUOUS_DEVICE","message":"23 devices connected; specify --device <serial>."}}
```

Only 1–2 of those 23 are in `connectionState: "device"`; the rest are shut-down simulators. This is
now a twice-observed blocked recovery path, not a cosmetic message defect. It is genuinely mitigable
(`reset --device <serial>` works, and `devices --device <serial>` correctly returns one device), so
the defect is discoverability rather than impossibility — hence LOW-MEDIUM rather than HIGH. Recovery
in practice required `pkill -f idb_companion`. Worth its own SPEC-IOS-001 follow-up: filter the count
to connected devices, or auto-select when exactly one device is connected.

---

## Verified non-issues (recorded so they are not re-litigated)

1. **Binary-search monotonicity** — `minNonDegenerateRatio` assumes degeneracy is monotone in ratio.
   I brute-forced 6 screen sizes × 4 directions × 200,000 ratios: **0 violations**. The returned
   value is also never itself degenerate. The documented assumption holds.
2. **`ratio = 1` non-degenerate** — the documented precondition of the binary search. Holds even for
   1×1 and 2×2 screens (verified).
3. **`parsePositiveInteger` separation** — the deliberate split from `parseCoordinate` is correct and
   necessary; live-verified that `--duration 0` rejects while coordinate `0` stays valid.
4. **`readScrollIntoViewOutcome`** — defensive narrowing; an unexpected shape degrades to
   `{found:false, moved:false}`, i.e. straight to the JS-click fallback. Safe direction.
5. **`AMOUNT_TOO_SMALL` vs `INVALID_AMOUNT` as separate codes** — correct. The rejection is
   screen-size-dependent and cannot be decided by a static validator; the SPEC's reasoning is sound.
6. **README worked examples** — reproduced verbatim on device (`0.001` → `AMOUNT_TOO_SMALL` with
   `minValidRatio 0.001271294429898262`; `0.002` → `ok` with `from.y=438 to.y=436`).
7. **Android caveat locality (prior F6)** — now present in both the `swipe` and `scroll` sections,
   with the concrete detail that not even `adb shell input swipe --help` could be run.
8. **AC traceability** — 21/21 traced in progress.md; acceptance.md is the SSOT for the count.

---

## REMAINING MUST-FIX BEFORE PUSH

1. **N1** — restore the container/horizontal scroll signal. Derive `moved` from the target
   element's rect delta rather than `window.scrollY` alone. This is a regression against `737b9fb`
   and the smallest of the three fixes.
2. **N3** — correct the `minValidRatio` claim in `README.md:332-333`, `CHANGELOG.md:255`, and
   acceptance.md AC-GEST-018, **or** make the value satisfy the claim. Shipping a measurably false
   factual claim is the exact charge the 0.4.0 amendment was raised to answer.
3. **N2** — replace the endpoint-equality predicate with a measured minimum-pixel-travel threshold,
   so `AMOUNT_TOO_SMALL` fires on odd-dimension screens (iPhone 15/16/SE class). Add an
   odd-dimension fixture (N5) so the suite can see it.

## SHOULD-FIX LATER

1. **N4** — folded into N1's fix if the rect-delta approach is taken.
2. **N6** — `spec.md` §E row (needs `manager-spec`).
3. **N7** — bound `--duration` above.
4. **N8** — `@MX:` tags on `swipe.ts` / `validators.ts`.
5. **N9** — SPEC-IOS-001 follow-up: `reset`/`AMBIGUOUS_DEVICE` device counting.
6. Disclose the `--web` proxy instability in the `tap --web` command reference — it blocked
   verification repeatedly in both audits and is currently only mentioned in the Status section.

## SAFE TO PUSH

**No.** N1 is a behavioral regression against the pre-amendment commit, and N3 ships a factual
claim this audit measured to be false — both are small, local fixes, and the amendment's own
standard ("관측하지 않은 것을 근거로 삼지 않는다") is what rules them out.

That said, this is a materially better tree than 0.3.0: three of four MUST-FIX items are closed
with reproducible live evidence, the SPEC amendment correctly identified two of my findings as REQ
defects rather than implementation defects, and the documentation rewrite is a genuine improvement
rather than a restatement.

---

## Environment note

The simulator wedged twice during this audit. Actions taken (no repo files touched):

- Killed a wedged `idb_companion`; `idb` respawned it and recovered.
- Rebooted the iPhone 17 Pro after SpringBoard entered a degraded state (blank home screen) —
  triggered by my own boundary test `swipe 0 0 0 100`, a corner-origin drag that is a documented-valid
  input per AC-GEST-019.
- Booted iPhone 16 (`21F398E3-…`) for the N2 reproduction and **shut it down afterwards**.
- Restored Safari to `en.wikipedia.org/wiki/Netscape` via `xcrun simctl openurl`.
- Killed leftover `ios_webkit_debug_proxy` processes and the hung `--duration 1e+21` swipe.

`git status --porcelain --untracked-files=no` is empty; no implementation file, SPEC artifact,
README, or CHANGELOG was modified by this audit.

## Evidence index

| Claim | Command | Observed |
|---|---|---|
| Test baseline | `pnpm vitest run` | exit 0 — 29 files, **553** tests |
| Type / build | `pnpm typecheck`, `pnpm build` | exit 0, exit 0 |
| Coverage | `pnpm vitest run --coverage` | 93.43% stmts / 89.76% branch / 95.29% lines |
| Interface | `grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` | 9 |
| F1 closure | `scroll down --amount 0.0001 / 0.001 / 0.0012`, `scroll left --amount 0.002` | `AMOUNT_TOO_SMALL`, zero gestures |
| F1 boundary | `--amount <minValidRatio>` × 4 directions | all `ok:true`, `from ≠ to` |
| F3 closure | `--duration 0 / 1`, `swipe 0 0 0 100` | `INVALID_DURATION` / ok / ok |
| F4 closure | in-page replication of the shipped expression on real drawer links | `scrollY 1626→1626`, `moved:false` → `js-click` |
| N1 | injected `overflow:auto` container on the live page | `scrollTop 0→755`, `scrollY` unchanged, reports `native` |
| N2 | real iPhone 16 (393×852), `scroll left --amount 1e-9` | `ok:true`, 1px, screenshot byte-identical |
| N3 | 3 trials each at 4 ratios, screenshot oracle (noise baseline 3/3 identical) | 2px 0/3, 4px 1/3, 40px 3/3, 394px 3/3 |
| N7 | `swipe … --duration 1000000000000000000000000` | hung indefinitely; killed |
| Monotonicity | 6 screens × 4 directions × 200k ratios | 0 violations, 0 degenerate `minValidRatio` |
| N9 | `node dist/cli/bin.js reset` | `AMBIGUOUS_DEVICE` "23 devices connected" |
