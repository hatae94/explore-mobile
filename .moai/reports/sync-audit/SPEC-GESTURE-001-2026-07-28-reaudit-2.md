# Sync Re-Audit #2 — SPEC-GESTURE-001 0.5.0

- **Auditor**: sync-auditor (independent, adversarial stance)
- **Date**: 2026-07-28
- **Delta audited**: `471b7ff..7be7611` (7 commits; 24 local commits total, nothing pushed)
- **Prior audits**: 0.3.0 → 0.69 (4 MUST-FIX) · 0.4.0 → 0.76 (N1/N2/N3 MUST-FIX)

---

## VERDICT

**PASS-WITH-DEBT** — **0.86**. Delta **0.69 → 0.76 → 0.86**.

All three MUST-FIX items are genuinely closed, each verified independently against the running
build and the live device — not restated. For the first time in three rounds, **no fix introduced
a regression**, and every numeric claim in the shipped documentation survives mechanical execution
against the built module. The remaining defects are narrower than anything that blocked before.

---

## Dimension scores

| Dimension | 0.3.0 | 0.4.0 | 0.5.0 | Reasoning |
|---|---|---|---|---|
| Functionality | 0.60 | 0.72 | **0.84** | N1/N2/N3 all closed with live evidence; the guard now fires on every screen/axis combination tested (12/12 where 6 previously emitted 1px); the threshold is measured rather than accidental. Remaining: a live-reproduced smooth-scroll false negative (NN1), the raw `swipe` floor asymmetry (NN2), and a tiny-screen advisory loop (NN5). |
| Security | 0.92 | 0.93 | **0.95** | The `--duration` ceiling removes the unbounded-hang path I demonstrated last round (verified: `1e24`-digit input now rejected instead of hanging). No new argv, shell, or injection surface. Exporting `MAX_DURATION_MS` and `buildScrollIntoViewExpression` widens the API surface but only for testability; neither is user input. |
| Craft | 0.72 | 0.74 | **0.86** | The `node:vm` sandbox tests of the *real generated expression* are a genuine advance — and the first one deliberately provides no `window` global, so a regression to the old oracle throws rather than silently passing. That is a structural guard, not a value assertion. MX tags now on the load-bearing predicate with `@MX:ANCHOR` + `@MX:REASON`. Monotonicity re-verified under the new predicate. Remaining: `swipe.ts` still untagged, a factually wrong precondition comment (NN5), no test for the smooth-scroll timing case. |
| Consistency | 0.62 | 0.70 | **0.82** | I executed 78 numeric claims from README / CHANGELOG / spec / acceptance / plan against the built module; the `scroll` examples reproduce byte-for-byte including the `minValidRatio` literal. The `MAX_DURATION_MS` interpolation removes the message/constant drift class that had recurred twice. N6 resolved. Remaining: three qualitative overstatements (NN2/NN3/NN4). |

`4 / (1/0.84 + 1/0.95 + 1/0.86 + 1/0.82)` = **0.8648** → **0.86**

---

## PRIOR MUST-FIX DISPOSITION

### N1 — container scroll silently unreported → **RESOLVED**

`src/cli/commands/web-support.ts:232-235` replaces the `window.scrollY` comparison with the
target element's own `getBoundingClientRect()` across all four edges.

Live-verified on my **own** fixture (an `overflow:auto` container I injected, independent of the
implementer's test page), running the shipped expression body verbatim:

```
container case:  windowScrollY 0 -> 0        (0.4.0 oracle would report moved:false)
                 containerScrollTop 0 -> 958  (a real 958px scroll)
                 element rectTop 1081 -> 123
                 shipped oracle -> { found: true, moved: true }   ✓
```

Backed by four `node:vm` tests (`web-support.test.ts`) that execute the generated string against
fake DOM stand-ins. The container-generalization test supplies **no `window` global at all**, so
any regression to a `window.scrollY` oracle throws a `ReferenceError` rather than quietly passing.
That is a better guard than an equality assertion, and I could not find a way to make it pass with
the old implementation.

### N2 — guard inert on odd-dimension screens → **RESOLVED**

`src/cli/commands/scroll-geometry.ts:187-191` — the predicate is now
`Math.max(|dx|,|dy|) < MIN_EFFECTIVE_SWIPE_PX` (11), replacing `from === to`. Distance-based, so
the half-integer-centre accident that made the old predicate unreachable on odd axes is gone.

Live on 402×874, all four directions at `--amount 1e-9` → `AMOUNT_TOO_SMALL`, zero gestures.
Module-level across the three screens where I originally found the hole:

| screen | down | left | 0.4.0 behaviour |
|---|---|---|---|
| 402×874 | reject | reject | rejected only below 0.00127 / 0.00276 |
| 393×852 | reject | reject | **left emitted 1px, `ok:true`** |
| 375×667 | reject | reject | **both axes emitted 1px, `ok:true`** |

12/12 combinations now reject; 6 of them previously emitted a 1px swipe reported as success.

### N3 — `minValidRatio` recommended a value that does not move the screen → **RESOLVED**

`minNonDegenerateRatio` delegates to `isDegenerateSwipe`, so the boundary moved with the predicate
— no separate change needed, which is the right coupling. Every screen/axis now yields 11–12px,
at or above the measured floor. The README's worked examples reproduce **exactly** against the
built CLI, including the literal:

```
$ scroll down --amount 0.001  -> AMOUNT_TOO_SMALL  minValidRatio 0.013984236866235733   (README:356 identical)
$ scroll down --amount 0.002  -> AMOUNT_TOO_SMALL                                        (README:359 identical)
$ scroll down --amount 0.014  -> ok  from{201,443} to{201,431}  = 12px                   (README:362 identical)
```

---

## MEASUREMENT ASSESSMENT

**Method: sound.** The protocol controls for precisely the three confounds I hit in my own audits:

| confound | M7's control | I hit this in |
|---|---|---|
| status-bar clock changes the screenshot hash | body-region comparison with the status bar cropped | audit #1 (had to measure a noise baseline) |
| page saturates at its scroll end → false negative | 40pt checkerboard with room on both axes + reverse swipe after each detected move | audit #1 (page bottomed out mid-test) |
| single trial cannot see intermittency | repeated trials per candidate (10–15 near the boundary) | audit #2 (3/5 vs 5/5 duration reliability) |

A noise baseline was taken first (3 no-gesture captures, identical hashes). Bisection with
per-candidate repetition is the right shape for a step function. I re-verified the downstream
consequence independently: monotonicity of degeneracy in ratio still holds under the new
predicate (0 violations across 6 screens × 4 directions × 100k ratios), so the bisection that
derives `minValidRatio` from this threshold remains valid.

**The noise reading: admissible, but not established — and it does not matter.**

I tested it rather than accepting it. Vertical data: 4–8pt = 0/25 combined; 9–10pt = 3/30 combined.

- Fisher exact, two-sided: **p = 0.242**. The hypothesis "9–10pt movement occurs at the same rate
  as 4–8pt (i.e. it is noise)" **cannot be rejected** — the noise reading is admissible.
- But it is not *established* either: if the true sub-threshold movement rate were 10%, observing
  0/25 at 4–8pt would still happen 7.2% of the time. The data is consistent with **both** a clean
  step function and a probabilistic band.

So the coordinator's framing is right: **11pt is the *reliable* floor, not provably *the* floor.**
Crucially, the distinction does not change the decision. Under either reading, 9pt moved 1/15 (7%)
and 10pt moved 2/15 (13%). A floor of 9 or 10 would admit gestures that do nothing ~90% of the
time — reproducing the exact `ok:true`-with-no-effect class the guard exists to stop. 11pt is the
smallest distance with 100% observed movement on **both** axes (15/15 vertical, 10/10 horizontal),
and choosing it is the conservative call the SPEC's own doctrine requires.

manager-spec flagging this as an open judgment and quoting the per-candidate trial counts into
plan.md is exactly right, and it is why I could re-decide it rather than take it on faith. The
only place the reading leaks into an over-claim is README's prose (NN3).

**Scoping is correctly stated.** README:367-374 confines the number to one iPhone 17 Pro simulator
on iOS 26.0 and explicitly disclaims real hardware, other models, and Android. `MIN_EFFECTIVE_SWIPE_PX`'s
own comment repeats the Android disclaimer. That is honest scoping of a single-device measurement.

---

## AC VERIFICATION — all 25

**My tally: 22 PASS / 3 PARTIAL / 0 FAIL**, against the claimed 23 / 2 / 0.
I now **agree** on AC-GEST-018 (upgraded from my prior PARTIAL). I still differ on **AC-GEST-013**.

| AC | Claimed | Mine | Basis |
|---|---|---|---|
| 001 | PASS | PASS | Inspection + suite (argv path untouched) |
| 002 | PASS | PASS | **Re-ran live** (`--duration 500` works; ceiling branch added) |
| 003 | PASS | PASS | Inspection (unchanged; live-verified in audit #1) |
| 004 | PASS | PASS | **Re-ran** — 622/622, typecheck 0, build 0, interface grep = 9 |
| 005 | PASS | PASS | **Re-ran live** — `--amount 0.014` moves; `swipe --duration 500` accepted |
| 006 | PARTIAL | **PARTIAL (agree)** | `adb` absent; Android unmeasurable here |
| 007 | PASS | PASS | Direction invariant holds for every accepted scroll |
| 008 | PASS | PASS | **Re-ran** — grep = 9 |
| 009 | PASS | PASS | Inspection (unchanged) |
| 010 | PASS | PASS | Executed directly (audit #1) |
| 011 | PASS | PASS | **Re-ran live** — scroll succeeds, no `SCREEN_SIZE_UNKNOWN` |
| 012 | PASS | PASS | Accepted on inspection (destructive to re-run) |
| 013 | PASS | **PARTIAL** | The container understatement is fixed, but a smooth-scrolling container produces a real scroll that goes **unmarked** (NN1) — live-reproduced. Narrower than my 0.4.0 objection, and would be PASS once NN1 lands |
| 014 | PASS | PASS | Inspection (unit-scoped) |
| 015 | PASS | PASS | **Re-ran live** — ~20 responses, all single parseable JSON |
| 016 | PASS | PASS | Direction + coordinates reported on every success |
| 017 | PASS | PASS | Executed directly (audit #1) |
| 018 | PASS | **PASS (upgraded from my prior PARTIAL)** | The boundary now clears the measured floor (`0.014` → 12px, moves) and the stale `0.002`-as-working assertion is gone. Both grounds for my objection are removed |
| 019 | PASS | PASS | **Re-ran live** — `0` rejected, `1` accepted, coordinate `0` still valid |
| 020 | PARTIAL | **PARTIAL (agree)** | acceptance.md explicitly permits; intermittency is the finding |
| 021 | PASS | PASS | Closed live in audit #2; now additionally covered by the vm-sandbox rect test |
| 022 | PASS | PASS | **Re-ran** — 12/12 screen×direction combinations reject a degenerate ratio |
| 023 | PASS | PASS | **Re-ran live** — container scroll credited (`scrollTop 0→958`, `moved:true`) |
| 024 | PASS | PASS | **Re-ran** — provenance present in `spec.md` §C.1-⑭ + code comment; `minValidRatio` round-trip verified live (rejected value → advised value → success at 12px) |
| 025 | PASS | PASS | **Re-ran live** — `60000` accepted, `60001` and 25-digit input rejected, no hang |

---

## NEW FINDINGS

### NN1 — `scroll-behavior: smooth` makes a real scroll report as no-scroll
**[MEDIUM][certain]** `src/cli/commands/web-support.ts:232-235`

`scrollIntoView` honours CSS `scroll-behavior: smooth` and animates **asynchronously**. The oracle
samples the element rect immediately after the call, so it sees the pre-scroll rect and reports
`moved: false` — while the scroll then happens.

Live-reproduced on my own fixture (a fixed-position `overflow:auto` container with
`scroll-behavior: smooth`, sized to sit fully inside the viewport so only the container needs to
scroll):

```
immediately after scrollIntoView:
  containerScrollTop  0 -> 0
  element rectTop     1202 -> 1202
  shipped oracle ->   { found: true, moved: false }     <- reports "page did not move"

~11 s later (same element, same container):
  containerScrollTop  958        <- the scroll DID happen
  element rectTop     244
```

Two consequences, both in the failure family this SPEC exists to close:

1. **A side effect is reported as absent.** REQ-GEST-WEB-002's rationale is that a scroll-position
   change must never be silent; here it is.
2. **The M4 feature silently degrades.** The re-measure (`findWebElement` → `webRectToDevicePoint`)
   also runs immediately, so it reads the same stale off-viewport rect, fails to convert, and the
   command falls through to the JS `click()` path. On any site with smooth scrolling, the native
   off-viewport tap that REQ-GEST-WEB-001 exists to provide never fires — and reports `js-click`,
   i.e. "no scroll was needed".

This is **not a 0.5.0 regression** — the 0.4.0 `window.scrollY` oracle had the identical timing
flaw, and I did not probe it then. It surfaces now because 0.5.0 is the round that claims the
oracle is general and evidence-based.

**Fix (one word)**: `el.scrollIntoView({block: "center", behavior: "instant"})`. `behavior:"instant"`
overrides the CSS `scroll-behavior` and forces a synchronous scroll, which makes the rect
comparison — and the subsequent re-measure — valid again. Add a vm-sandbox test whose fake element
changes its rect only on a later call, to pin the timing assumption.

### NN2 — raw `swipe` neither enforces nor discloses the measured floor
**[MEDIUM-LOW][certain]** `src/cli/commands/swipe.ts` (no floor check); `README.md:230-300`

The floor is enforced only in `scroll`. Live:

```
$ swipe 201 500 201 505 --duration 500     # 5px, less than half the measured 11pt floor
{"ok":true,"command":"swipe","data":{...,"from":{"x":201,"y":500},"to":{"x":201,"y":505},"durationMs":500}}
```

`ok:true` for a gesture the project has just measured cannot move the screen. Enforcement is
arguably out of scope under design decision D1 (`swipe` is a raw primitive; the caller chose the
coordinates) — but D1 justifies *not injecting behaviour*, not *not disclosing*. The project
established exactly this norm one round ago: REQ-GEST-SWIPE-006 requires the omitted-`--duration`
unreliability to be disclosed **in the section where the command is documented**. The floor
asymmetry is the same situation and gets no such disclosure — the `swipe` section mentions the
floor only in passing, inside the duration-ceiling paragraph ("Unlike the touch-slop floor `scroll`
measures"), which tells the reader `scroll` has one but not that `swipe` will happily report success
below it.

**Fix**: one sentence in the `swipe` section — a swipe shorter than the measured floor is accepted
and sends the gesture, but is not expected to move the screen; use `scroll`, or a distance above
the floor. (Or extend REQ-GEST-SWIPE-006 to cover it explicitly.)

### NN3 — "nothing happens" below the floor is contradicted by the project's own trial data
**[LOW][certain]** `README.md:336-339`

> "a minimum drag distance below which the OS treats a gesture as a tap rather than a scroll…
> **Below that many device pixels nothing happens**"

The measurement recorded 1/15 movement at 9pt and 2/15 at 10pt. Something does happen below the
floor, occasionally. The precise claim — and the one the data supports — is that movement below
the floor is **unreliable**, which is exactly why the guard rejects it. This is the mildest instance
of the pattern I have flagged in all three rounds (prose asserting more than the measurement), and
unlike the earlier ones it misleads no caller into a broken action.

**Fix**: "below that distance movement is unreliable — measured 0/25 at 4–8pt and 1–2/15 at 9–10pt,
against 25/25 at 11pt."

### NN4 — the "steps of two device pixels" claim is true only for even-length axes
**[LOW][certain]** `README.md:349-352`

> "The distance is centre-symmetric, so it grows in steps of two device pixels — the boundary jumps
> straight from a rejected 10px distance to an accepted 12px one, with no ratio landing on exactly
> the measured floor itself"

True on 402×874 (verified exhaustively: achievable distances are 0,2,4,…, and 11 is unreachable).
False on odd-length axes, where the half-integer centre yields **odd** distances:

| screen / axis | achievable distances | is 11 reachable? | `minValidRatio` distance |
|---|---|---|---|
| 402×874 down / left | 0,2,4,6,8,10,12… | no | 12px / 12px |
| 393×852 **left** (393 odd) | 1,3,5,7,9,**11**,13… | **yes** | 11px |
| 375×667 down and left (both odd) | 1,3,5,7,9,**11**,13… | **yes** | 11px |

Functionally harmless — 11px is exactly the measured floor and `< 11` admits it, and 11pt measured
15/15 and 10/10 — but the sentence generalises a property of the example screen, which is the same
shape of error as the parity hole itself (N2). Worth correcting precisely because this SPEC has
already been bitten twice by treating one screen's arithmetic as a rule.

**Fix**: scope the sentence to even-length axes, or state that odd axes step by one and can land on
the floor exactly.

### NN5 — the `ratio = 1` precondition now fails below 13pt, and its stated justification is wrong
**[LOW][certain]** `src/cli/commands/scroll-geometry.ts:214-216`

The comment says ratio = 1 is assumed non-degenerate, and that a screen small enough to break the
assumption "is already rejected by REQ-GEST-SCROLL-004's screen-size rejection". Both halves need
revisiting now that the threshold is 11 rather than 0:

- The assumption breaks for **any dimension ≤ 12** (was: essentially never). At 12×12, ratio = 1
  produces a 10px distance, below the floor.
- The justification is **false**: `deriveScreenSize` accepts a 12×12 hierarchy with a witness at
  `{0,0,12,12}` — it only rejects non-positive or witness-less sizes. Verified:
  `deriveScreenSize([{bounds:{x:0,y:0,w:12,h:12}}])` → `{width:12,height:12}`.
- Consequence: `minNonDegenerateRatio` exhausts its search and returns `hi = 1`, so
  `AMOUNT_TOO_SMALL` advises `minValidRatio: 1` — a value that is **itself rejected**. The caller
  is handed an unusable remedy, the same shape as N3, on an unrealistic screen.

No real device is affected (the smallest listed screen is 375pt), hence LOW. But the raised
threshold shrank this assumption's safety margin from ~375× to ~1.08×, and the comment now asserts
a protection that does not exist.

**Fix**: have `minNonDegenerateRatio` verify the returned bound is non-degenerate and signal
"unreachable on this screen" when it is not; `scrollCommand` can then fall back to
`SCREEN_SIZE_UNKNOWN` rather than advising a rejected value. Correct the comment either way.

### NN6 — `swipe.ts` still carries no `@MX:` tags
**[INFO][certain]**

`scroll-geometry.ts` 5, `validators.ts` 1, `scroll.ts` 1, `web-support.ts` 1 — `swipe.ts` 0.
Prior N8 remains partially open. Not blocking.

---

## PRIOR SHOULD-FIX DISPOSITION

| Item | Status |
|---|---|
| **N4** (horizontal scroll invisible to the oracle) | **RESOLVED** — subsumed by the rect oracle; covered by a dedicated vm test asserting a left/right-only rect change counts as movement |
| **N5** (tautological AC-018 boundary assertion) | **RESOLVED** — the boundary is now anchored to the measured `MIN_EFFECTIVE_SWIPE_PX` rather than to `minNonDegenerateRatio`'s own output, and AC-GEST-022 adds odd-axis fixtures |
| **N6** (self-referential status row) | **RESOLVED** — the row is gone; frontmatter is now the single source of status |
| **N7** (`--duration` ceiling) | **RESOLVED** — bounded at 60,000 ms; live-verified that the 25-digit input that previously hung is now rejected instantly |
| **N8** (MX tags) | **PARTIAL** — `swipe.ts` still untagged (NN6) |
| **N9** (`reset` / `AMBIGUOUS_DEVICE`) | **DEFERRED, correctly** — recorded in `spec.md` §C.4 and routed to SPEC-IOS-001; out of this SPEC's remit, and the deferral is documented rather than silent |
| `--web` proxy instability disclosure | **STILL OPEN** — it cost me a large share of this audit again (see Environment) |

---

## Verified non-issues

1. **`MAX_DURATION_MS` interpolation (`1e3ff63`)** — correct, and the right call. Message and
   constant cannot drift; live output reads "…at most 60000" and matches the constant exactly.
   This closes a class that had recurred twice ("non-negative" after `0` became invalid;
   "positive integer" after the ceiling landed).
2. **Monotonicity under the new predicate** — re-verified, 0 violations across 6 screens × 4
   directions × 100k ratios. `minNonDegenerateRatio`'s bisection remains sound.
3. **`Math.max(dx, dy)` as the scroll-axis distance** — correct for every `computeScrollSwipe`
   output, since the non-scroll axis is identical at both endpoints by construction.
4. **CHANGELOG two-block structure** — reads clearly, and the judgment call was right. Each block is
   version-labelled; the 0.4.0 block carries a forward pointer where its account was superseded
   ("the oracle itself was refined again in the 0.5.0 amendment below"); the 0.5.0 block states the
   relationship explicitly ("closed four defects but left three more open in the same failure
   family"); and the `Added` section — where a reader looks for *current* behaviour — describes the
   final rect-based oracle, not the superseded `scrollY` one. Collapsing the two would have hidden
   that a fix was found incomplete, which is exactly the signal a reader assessing maturity needs.
5. **AC traceability** — 25/25 in both acceptance.md and progress.md.
6. **Doc numeric sweep** — 78 numeric claims executed against the built module; every claim that
   asserts *success* is reproducible, and the `minValidRatio` literal in README matches the module
   bit-for-bit. No stale-number defects of the class that bit acceptance.md at 0.4.0.

### On the sweep technique (the coordinator asked whether this generalises)

It does, and it is cheap. The script at
`<scratch>/docsweep.mjs` extracts every `--amount N`, `--duration N`, and `minValidRatio: N`
occurrence from README / CHANGELOG / spec / acceptance / plan, then **executes each value against
the built module** and reports whether the module accepts or rejects it. That is what catches "a
number that was true before the measurement and false after" — grep cannot, because the prose
around such a number is perfectly current.

Two notes for making it a permanent gate:
- It is deliberately over-inclusive: 32 of 78 hits were flagged, but most were docs correctly
  *describing* a rejection (`--duration 0` → `INVALID_DURATION`). The signal needs a second pass
  keyed on whether the surrounding text claims success. A cheap proxy that worked well: only flag
  when the same line or the next contains `"ok":true`.
- The highest-value variant is the round-trip: take each `minValidRatio` the module emits, feed it
  back through the CLI, and assert success. That single check would have caught 0.4.0's N3
  automatically.

Worth wiring into `/moai gate` as a docs-numeric check for any SPEC that publishes measured
constants.

---

## REMAINING MUST-FIX BEFORE PUSH

**None.** All three prior MUST-FIX items are closed and independently verified; no regression was
introduced; and no shipped numeric claim is false.

## SHOULD-FIX (ordered)

1. **NN1** — `behavior: "instant"` on the `scrollIntoView` call. One word, closes a live-reproduced
   silent side effect and an equally silent degradation of the M4 native-tap path.
2. **NN2** — disclose (or enforce) the movement floor for raw `swipe`, per the project's own
   REQ-GEST-SWIPE-006 norm.
3. **NN3** — "nothing happens" → "movement is unreliable", with the trial counts.
4. **NN4** — scope the steps-of-two sentence to even-length axes.
5. **NN5** — make `minNonDegenerateRatio` refuse to advise a value it would itself reject; correct
   the precondition comment.
6. **NN6** — `@MX:` tags on `swipe.ts`.
7. Disclose the `--web` proxy instability in the `tap --web` command reference.

## SAFE TO PUSH

**Yes.**

I have withheld this twice, so the change deserves its reasoning. My blocking criteria in both
prior rounds were (a) a behavioural regression against the previous commit, or (b) a factual claim
in shipped documentation that measurement contradicts. Neither holds now: the container regression
is fixed and re-verified on my own independent fixture, and all 78 numeric doc claims survive
execution against the built module — including the `minValidRatio` literal that was wrong last
round. NN1 is a genuine MEDIUM defect, but it is pre-existing rather than newly introduced, it is
narrower than either prior blocker, and its fix is a single argument. NN3's overstatement is
qualitative prose in a sentence that immediately supplies the correct provenance and scoping; it
misleads no caller into a broken action.

The trajectory matters too: three rounds, each one closing the prior round's findings with
reproducible evidence, and this is the first with no regression and no false number.

---

## Environment note

The `--web` inspector proxy was again the dominant cost of this audit — a page would attach for
one or two calls and then return `NO_WEB_PAGE`, repeatedly. What reliably recovered it was
`pkill -f ios_webkit_debug_proxy` followed by a retry; Safari itself and the page were fine
throughout (confirmed by `xcrun simctl io … screenshot`, which showed my fixture rendered
correctly while the inspector claimed no debuggable page). `idb` did not wedge this session.

Actions taken, all outside the repo:
- Served an independent audit fixture from the scratchpad on port 8951; **server stopped** at the end.
- Injected test DOM into the loaded page (containers, smooth-scroll wrapper) — discarded on navigation.
- Cleared leftover `ios_webkit_debug_proxy` processes.
- Restored Safari to `en.wikipedia.org/wiki/Netscape`.
- Left **only** the iPhone 17 Pro booted, as required.

`git status --porcelain --untracked-files=no` is empty; no implementation file, SPEC artifact,
README, or CHANGELOG was modified by this audit.

## Evidence index

| Claim | Command | Observed |
|---|---|---|
| Test baseline | `pnpm vitest run` | exit 0 — 29 files, **622** tests |
| Type / build | `pnpm typecheck`, `pnpm build` | exit 0, exit 0 |
| Coverage | `pnpm vitest run --coverage` | 93.45% stmts / 89.78% branch / 95.31% lines |
| N1 | shipped oracle on my own `overflow:auto` fixture | `scrollTop 0→958`, `scrollY 0→0`, `moved:true` |
| N2 | `scroll {up,down,left,right} --amount 1e-9` + 3-screen module sweep | 4/4 live reject; 12/12 combinations reject |
| N3 | README examples vs live CLI | byte-identical, incl. `minValidRatio 0.013984236866235733` |
| NN1 | smooth container, shipped oracle | `moved:false` immediately; `scrollTop 958` after |
| NN2 | `swipe 201 500 201 505 --duration 500` | `ok:true` for a 5px gesture |
| NN4 | exhaustive distance scan, 3 screens | even axes step by 2; odd axes step by 1 and reach 11 |
| NN5 | `deriveScreenSize([{0,0,12,12}])` + `minNonDegenerateRatio` | size accepted; advised ratio 1 is itself degenerate |
| N7 closure | `--duration 60000 / 60001 / 25-digit` | accepted / rejected / rejected, no hang |
| Measurement | Fisher exact on the recorded trials | p = 0.242 — noise reading admissible, not established |
| Monotonicity | 6 screens × 4 directions × 100k ratios | 0 violations |
| Doc numerics | `docsweep.mjs` | 78 claims executed; no false success claim |
