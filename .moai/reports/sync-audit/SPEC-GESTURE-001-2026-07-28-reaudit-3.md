# Sync Re-Audit #3 — SPEC-GESTURE-001 0.6.0

- **Auditor**: sync-auditor (independent, adversarial stance)
- **Date**: 2026-07-28
- **Delta audited**: `7be7611..467e7df` (5 commits, local-only; everything through `7be7611` is pushed)
- **Prior audits**: 0.3.0 → 0.69 · 0.4.0 → 0.76 · 0.5.0 → 0.86 (pushed)

> **Auditor accountability.** This reopening is my own N3 (0.4.0) reproduced on the other
> platform. At 0.5.0 I accepted prose-only scoping ("iOS's 11pt is not evidence for Android")
> as sufficient, and scored Consistency 0.82 on documentation that was correct but had no
> structural teeth. A constant that is wrong for a whole platform reads exactly like one that is
> right. I should have flagged the platform-independence of `MIN_EFFECTIVE_SWIPE_PX` as a
> structural defect, not a documentation matter.

---

## VERDICT

**PASS-WITH-DEBT** — **0.88**. Delta **0.69 → 0.76 → 0.86 → 0.88**.

The Android defect is genuinely closed and verified live on both platforms. The interface
extension is additive with zero regressions. AC-GEST-029 — an acceptance criterion that audits the
*oracle* of a measurement rather than its value — is the strongest single piece of work in four
rounds. One new MEDIUM finding (density override), one of my prior findings still open (NN1), and
three documentation precision issues remain.

---

## Dimension scores

| Dimension | 0.4.0 | 0.5.0 | 0.6.0 | Reasoning |
|---|---|---|---|---|
| Functionality | 0.72 | 0.84 | **0.86** | Android defect closed and live-verified on both platforms; 10th method additive with 0 regressions (639 tests, 9 prior signatures unchanged); monotonicity holds under a parameterised threshold; `minValidRatio` round-trips correctly on both platforms. Against that: the `wm density` override gap can return a threshold *below* the OS slop (NN7), NN1 remains open, no threshold caching. |
| Security | 0.95 | 0.95 | **0.95** | No new surface. `wm density` output is parsed with a strict regex and unparseable output raises an explicit error rather than defaulting. The serial is the only interpolated value and rides an argv array. The threshold under-estimate is a safety issue, scored under Functionality. |
| Craft | 0.74 | 0.86 | **0.88** | AC-GEST-029 audits what a measurement's decision rule could *distinguish*, not what number it produced — that is a genuinely higher-order check, and it correctly self-implicates the iOS measurement. The discarded first Android measurement was discarded and recorded rather than salvaged. MX provenance notes on both new constants. Against that: `swipe.ts` still untagged, a per-device constant re-queried on every call despite existing per-serial infrastructure, NN5's comment still factually wrong. |
| Consistency | 0.70 | 0.82 | **0.82** | 58 numeric claims executed against the built module — **0 genuine contradictions**; the README's Android example reproduces byte-for-byte against the live device. The "argv-verified only" caveats are correctly replaced with properly scoped claims naming the vendor-override risk. Against that: the README omits the 5/6 horizontal figure §C.3 requires (NN8), NN4 persists in a new form, NN3's iOS half is still uncorrected. |

`4 / (1/0.86 + 1/0.95 + 1/0.88 + 1/0.82)` = **0.8750** → **0.88**

---

## ANDROID DEFECT — closed

`src/schema/device-backend.ts:169-189` (10th member) · `src/backend/adb-backend.ts:509-522`
(derivation) · `src/cli/commands/scroll.ts:120-129` (wiring).

Live on both platforms via the rejection path (which sends no gesture):

```
Android SM-S938N 1440x3120  minValidRatio 0.011039886623620987  basis device-query      → 32px
iOS      402x874            minValidRatio 0.013984236866235733  basis measured-constant → 12px
```

I re-derived the arithmetic rather than trusting it: the Android ratio maps to **exactly 32px**,
and the next ratio below maps to 30px which the predicate rejects — so the probabilistic 31px band
is never emitted at all (the 2px step skips it). The old platform-independent 11 would have
accepted 12px on this device, which measured 0/5.

Regression check on the seams I was asked to probe:

| Seam | Verified |
|---|---|
| 10th interface member | count = 10; the 9 prior signatures unchanged; 639 tests, typecheck 0, build 0 |
| threshold as an argument, not a module constant | monotonicity re-verified across 4 thresholds × 4 screens × 4 directions × 60k ratios — **0 violations** |
| backend call inserted into `scroll.ts` | wrapped in try/catch → `BACKEND_COMMAND_FAILED`; ordering preserves the no-gesture guarantee |
| iOS unchanged | `minValidRatio` identical to 0.5.0 (`0.013984236866235733`), still 12px |

No residual "9-method" strings in source or user-facing docs; the progress.md hits are historical
M1 log entries, which is correct for a chronological record.

---

## DESIGN DECISION — the 10th method and the `basis` field

**The 10th method is the right call.** The decisive argument is the one the SPEC makes: the
interface asks the *domain* question ("what distance moves this device's screen?") rather than a
proxy ("what is this device's density?"). A density accessor would force `IdbBackend` to fabricate
a `dp × density` decomposition for a value that was never measured that way — inventing an
unmeasured iOS platform rule to satisfy an interface shape. That is a real cost, not a stylistic
one, and avoiding it is worth a method.

**The D3 reconciliation holds, and I checked it rather than accepting it.** D3 forbade a new
backend method for *screen size*, on the grounds that screen size is derivable from `dump`. I
verified the asymmetry: `dumpUiHierarchy` returns bounds, from which screen size is derivable; no
existing method exposes density or any proxy for it. So "screen size is obtainable from `dump`,
density is obtainable from nothing" is a principled distinction, not a rationalisation. The
alternative — a per-platform constant in the command layer — would put platform knowledge in the
platform-agnostic layer, which is what `DeviceBackend` exists to prevent.

The conservative-constant option was correctly rejected: it asserts a bound for unmeasured
densities, and would over-reject on low-density devices while still being wrong on high-density
ones.

**The `basis` field earns its place, with one imprecision.** It is derived by the same code path
that computes the number, so it has no independent drift surface — the staleness risk is close to
zero. And it makes machine-readable exactly the distinction whose absence caused this reopening:
an agent receiving `minValidRatio` can now tell whether it came from its own device. That is the
same family of measure as REQ-GEST-SCROLL-005 (put the direction and coordinates in the response so
the caller can verify without a second call).

The imprecision: Android's value is a **platform rule parameterised by a device query**
(`8dp × queried density`), not a quantity queried from the device. The token `"device-query"`
invites a caller to believe the whole threshold came from their device, when only the density did —
the same shape of provenance-overstatement the field exists to prevent, one level down. Mitigated
by the interface doc and README:382-388, which spell out the formula. Reported as NN9 (LOW).

---

## MEASUREMENT ASSESSMENT

**The 8dp rule is sound, and the evidence is predictive rather than fitted.** This is the strongest
part of the measurement: `8dp × 3.75 = 30.0px` was computed from the platform constant and the
device's own density, and the measured boundary landed **exactly** there — 30px = 0/8, 31px = 6/8
(first movement). A derivation that predicts the boundary to the pixel, with the documented rule
`distance > slop`, is materially better evidence than a curve fitted to the data. I confirmed 8dp
is the AOSP default (`ViewConfiguration.TOUCH_SLOP = 8`, scaled by
`(int)(TOUCH_SLOP * density + 0.5f)`).

I also checked the rounding mismatch: the code uses `floor(8 × density) + 2` while Android uses
`round(8 × density)`. Since `round(x) ≤ floor(x) + 1`, the code's threshold is **always strictly
greater** than the OS slop — verified across 420/480/600/640 dpi. The margin absorbs the
discrepancy; there is no density at which floor-vs-round makes the threshold too low.

**The 2px margin is defensible but does not fully deliver its stated goal.** Its purpose is to
clear the probabilistic band at `slop + 1` (31px: 6/8 vertical, 5/6 horizontal). It achieves that
vertically — 32px measured 8/8 — but **horizontally 32px was itself 5/6**. So the chosen threshold
is not measured-reliable on the horizontal axis. §C.3 records this explicitly and refuses to write
"32px always moves", which is the correct disposition. The README does not carry the figure (NN8).

**The 11pt disposition is correct — do not re-measure.** The coordinator asked me to judge whether
the tap discovery invalidates M7's iOS number. It does not, and the reasoning is checkable:

- The tap confound biases a measurement **downward** — a short swipe taps something, the screen
  changes, and the oracle falsely records "moved". It produces false *positives* at sub-slop
  distances.
- M7's iOS data shows the opposite of a contaminated measurement: 4–8pt = 0/25, 9–10pt = 3/30.
  Almost no spurious movement below the threshold. A tap-fooled oracle would have shown more.
- The checkerboard fixture had zero interactive elements, so the confound had nothing to fire on.

The amendment's own framing — that the methodology "happened to be safe" and the *reasoning* was
not airtight even though the *number* probably is — is precisely right, and AC-GEST-029 converts
that from a retrospective observation into a pre-condition for every future measurement. One
caveat worth recording: of AC-GEST-029's three conditions, the iOS measurement satisfies (1) and
(2) retroactively but not (3) (a `dump` pre-check of what sits under the start point was never
performed). The SPEC acknowledges the retroactive gap; the number stands on the fixture property,
not on the check having been done.

---

## AC VERIFICATION — all 29

**My tally: 27 PASS / 2 PARTIAL / 0 FAIL**, against the claimed 28 / 1 / 0.
I **agree** with the AC-GEST-006 promotion. I still differ on **AC-GEST-013**.

| AC | Claimed | Mine | Basis |
|---|---|---|---|
| 001–005 | PASS | PASS | 002/004/005 **re-ran** (639 tests, typecheck/build 0, live swipe path); 001/003 inspection |
| 006 | **PASS** (promoted) | **PASS (agree)** | **Re-ran both promotion conditions live**: `adb` on PATH and the device enumerated (`SM-S938N`); the CLI reports it as an `android` platform device and the threshold round-trip exercised the end-to-end path |
| 007 | PASS | PASS | Direction invariant holds for every accepted scroll |
| 008 | PASS | PASS | **Re-ran** — interface member count = 10, and the AC's own guard (no screen-size accessor) still holds |
| 009–012 | PASS | PASS | Inspection / prior-audit executions; unchanged this delta |
| 013 | PASS | **PARTIAL** | Unchanged from my 0.5.0 finding — `web-support.ts` was **not touched** in this delta (`git diff --name-only` returns 0 files for it), so the smooth-scroll case (NN1) still reports a real scroll as no-scroll |
| 014–017 | PASS | PASS | Inspection / prior executions |
| 018 | PASS | PASS | **Re-ran live on both platforms** — boundary clears each platform's own floor |
| 019 | PASS | PASS | Inspection (validator unchanged this delta) |
| 020 | PARTIAL | **PARTIAL (agree)** | acceptance.md explicitly permits; intermittency unchanged |
| 021 | PASS | PASS | Closed live in audit #2; vm tests unchanged |
| 022 | PASS | PASS | **Re-ran** — odd-axis rejection holds under the parameterised threshold |
| 023 | PASS | PASS | Verified live in audit #3; oracle unchanged |
| 024 | PASS | PASS | **Re-ran** — provenance present for both platforms; round-trip verified on each |
| 025 | PASS | PASS | Inspection (ceiling unchanged) |
| 026 | PASS | PASS | **Re-ran** — drove the real `AdbBackend` with a stub executor across 5 density outputs; derivation matches `floor(8×d)+2` in every case |
| 027 | PASS | PASS | **Re-ran** — 10th member additive, `basis` present in the live payload on both platforms, no density accessor on the interface |
| 028 | PASS | PASS | **Re-ran the round-trip live** — Android `minValidRatio` maps to exactly 32px, the value below to 30px (rejected) |
| 029 | PASS | PASS | **Accepted on inspection** — a document-oracle AC; I verified the three pre-conditions are recorded in §C.1-⑰ and that the iOS retroactive gap is disclosed |

---

## NEW FINDINGS

### NN7 — `wm density` override is ignored, and the error direction can put the threshold *below* the OS slop
**[MEDIUM][certain]** `src/backend/adb-backend.ts:112-118` (`parsePhysicalDensity`)

The parser reads only the `Physical density:` line. When a user changes **Display size** (a
standard consumer setting on this very device's vendor), `wm density` also reports
`Override density:`, and the override is the density the OS actually uses — including for
`getScaledTouchSlop()`.

Driving the real `AdbBackend` with a stub executor over exact `wm density` outputs:

| `wm density` output | OS slop | code threshold | verdict |
|---|---|---|---|
| `Physical 600` (this device) | 30px | 32px | OK |
| `Physical 600` + `Override 480` (display size **shrunk**) | 24px | 32px | OK — conservative |
| `Physical 480` + `Override 600` (display size **enlarged**) | 30px | **26px** | **below slop** |
| `Physical 420` | 21px | 23px | OK |
| `Physical 640` | 32px | 34px | OK |

In the enlarged-display case a `scroll` producing 26–30px is accepted and sent. Per this
amendment's own headline finding, Android then interprets it as a **tap on whatever is under the
start point** — an irreversible side effect reported as `ok:true`. §C.3 records the
Physical/Override distinction as an open question, which is honest, but it does not state the
*direction* of harm, and the consequence is now materially worse than when the SPEC treated
sub-threshold gestures as no-ops.

**Why this is not push-blocking**: before 0.6.0, Android used the iOS constant (11px) and
under-rejected on *every* Android device. Shipping 0.6.0 shrinks the affected population from all
Android devices to Android devices with an enlarged display-size override. Blocking would keep the
strictly worse state live.

**Fix**: prefer `Override density` when the line is present (it is the density the OS uses); fall
back to Physical otherwise. This is a two-line regex change and removes the open question rather
than documenting it. If the team prefers to keep it open pending measurement, the interim safe
choice is `max(physical, override)`, which cannot under-estimate.

### NN8 — README omits the horizontal 5/6 figure that §C.3 requires
**[LOW-MEDIUM][certain]** `README.md:411-417` vs `spec.md` §C.3

§C.3 states the standard explicitly: *"권장 문턱조차 가로축 100%가 측정으로 확정되지는 않았다 …
'32px면 항상 움직인다'고 쓰지 않는다."* The README discloses the band qualitatively
(`README.md:385-388`, "probabilistic, not a clean cutoff") but reports only the verification
round-trip — "moved the screen 3 out of 3 times on every retry, in all four directions" — and never
surfaces that the measurement itself put horizontal 32px at **5/6**. A reader gets 3/3 with no
counter-datum, which is a stronger impression than §C.3 permits.

**Fix**: one clause — "vertically 8/8 at the chosen floor, horizontally 5/6; the residual is
recorded as unresolved in §C.3."

### NN9 — `"device-query"` overstates Android's provenance by one level
**[LOW][high]** `src/schema/device-backend.ts:52-70`

Android's threshold is a **platform rule parameterised by a device query** (`8dp × queried
density`), not a value queried from the device. The token invites the reading that the whole
threshold came from this device. Mitigated by the interface doc and README:382-388, which state
the formula — but the field's entire justification is provenance precision, so the taxonomy being
one level coarse than the thing it describes is worth noting.

**Fix**: either rename to `"derived-from-device"` / keep `"measured-constant"`, or add a third
value (`"platform-rule × device-query"`). Low priority; the docs carry the detail today.

### NN10 — the per-device threshold is re-queried on every `scroll`
**[LOW][certain]** `src/backend/adb-backend.ts:509-522`; no caching

Every Android `scroll` issues an extra `adb shell wm density` round-trip, though density is
constant for a device between display-size changes. `AdbBackend` already carries per-serial session
state (`ImeSessionStore`) so the infrastructure exists. Two costs: latency on every scroll, and a
transient adb failure now fails the whole command via `BACKEND_COMMAND_FAILED` where previously
there was no such dependency.

**Fix**: cache per serial, with the cache invalidated on the same events that already reset
per-serial state. (Note this interacts with NN7 — if the override fix lands, a display-size change
invalidates the cached value, so the cache should not outlive a session.)

### NN4 (carried, **still open in a new form**) — the step-of-two claim
**[LOW][certain]** `README.md:365-370`

The rewrite addressed a different axis than the one I reported. It now distinguishes iOS (odd
floor) from Android (even floor) and states "with no ratio landing on exactly the measured floor
itself" for iOS. The determinant is the **screen axis'** parity, not the floor's:

| screen | achievable distances | accepted distance at `minValidRatio` |
|---|---|---|
| 402×874 (even) | 0,2,4,6,8,10,12… | 12px |
| 393×852 — `left` (393 odd) | 1,3,5,7,9,**11**,13… | **11px — exactly the floor** |
| 375×667 (both odd) | 1,3,5,7,9,**11**,13… | **11px — exactly the floor** |

So on an iPhone SE the accepted distance *does* land exactly on the 11px floor, contradicting the
sentence. Functionally harmless — 11px is the measured floor, admitted by `< 11`, and measured
15/15 and 10/10. But this is the third round in which a property of one screen's arithmetic was
stated as a general rule, which is the same reasoning error that produced N2.

### NN3 (carried, **half-corrected**) — "nothing happens" below the floor
**[LOW][certain]** `README.md:352-354`

Now reads "Below that many device pixels nothing happens (or, on Android, something *else* happens
…)". The Android half is a genuine improvement. The iOS half is unchanged and still contradicted by
the project's own trial data (9pt 1/15, 10pt 2/15). **Fix**: "movement is unreliable" rather than
"nothing happens".

### NN5 (carried) — `ratio = 1` precondition, margin shrinking further
**[LOW][certain]** `src/cli/commands/scroll-geometry.ts:207-209`

The comment still claims a screen small enough to break the assumption "is already rejected by
REQ-GEST-SCROLL-004", which remains false (`deriveScreenSize` accepts a 12×12 hierarchy with a
witness). The raised per-platform thresholds shrink the margin further:

| threshold | precondition holds only for dimension ≥ |
|---|---|
| 11px (iOS) | 13px |
| 23px (420 dpi) | 25px |
| 32px (600 dpi) | 36px |
| 34px (640 dpi) | 38px |

Still far below any real screen. Unchanged severity, but the trend is one-directional.

### NN1 (carried, **unresolved**) — smooth-scroll false negative
**[MEDIUM][certain]** `src/cli/commands/web-support.ts:233`

`el.scrollIntoView({block: "center"})` — no `behavior: "instant"`. `web-support.ts` was not
modified in this delta (0 files in `git diff --name-only`). My 0.5.0 live reproduction stands: with
`scroll-behavior: smooth`, the rect is unchanged at sample time → `moved:false` → the response omits
`-scrolled` while the container demonstrably scrolls, and the immediate re-measure reads a stale
rect so the native tap degrades to the JS fallback. Fix remains one argument.

### NN6 (carried) — `swipe.ts` still carries no `@MX:` tags
**[INFO][certain]** Others improved this delta (`adb-backend.ts` 6, `idb-backend.ts` 12,
`device-backend.ts` 2, `scroll-geometry.ts` 4).

---

## PRIOR SHOULD-FIX DISPOSITION

| Item | Status |
|---|---|
| **NN1** (`behavior:"instant"`) | **UNRESOLVED** — file untouched |
| **NN2** (raw `swipe` threshold disclosure) | **RESOLVED, and improved by the reopening.** The threshold being per-platform made a numeric disclosure impossible, so the docs disclose the *consequence* instead — `README.md:260-266` now warns that a sub-threshold swipe is a tap, not a no-op, and §C.3 records that `swipe` is deliberately unprotected under D1. That is a better answer than the number I originally asked for |
| **NN3** (README "nothing happens") | **PARTIAL** — Android clause added, iOS half unchanged |
| **NN4** (steps-of-two) | **PARTIAL** — rewritten along the wrong axis; original inaccuracy persists |
| **NN5** (`ratio=1` precondition) | **UNRESOLVED** — margin shrank further |
| **NN6** (`swipe.ts` MX tags) | **UNRESOLVED** |
| `--web` proxy disclosure | **UNRESOLVED** — still only in Status, not the `tap --web` reference |

---

## Verified non-issues

1. **Doc numerics** — 58 numeric claims executed against the built module; the 3 flagged hits are
   all historical narratives quoting the *0.3.0* defect (`"--duration 0 was accepted and reported
   ok:true"`). **0 genuine stale numbers.** The README's Android and iOS examples reproduce
   byte-for-byte against the live devices.
2. **`floor` vs `round` in the slop derivation** — safe at every density; the 2px margin strictly
   dominates the ≤1px discrepancy.
3. **Monotonicity under a parameterised threshold** — 0 violations across 4 thresholds × 4 screens
   × 4 directions.
4. **The 31px probabilistic band is unreachable** — the centre-symmetric 2px step means Android's
   accepted distance jumps 30 → 32, skipping the 6/8 band entirely. A pleasant consequence of the
   geometry that the docs do not claim but which holds.
5. **Interface additivity** — the 9 prior signatures are unchanged; the diff is purely additive.
6. **AC traceability** — 29/29 in both acceptance.md and progress.md.
7. **`sips --cropOffset`** — I did not re-litigate this; the coordinator's check that M7's and M8's
   crops both exclude the status bar is consistent with M7's data showing a clean 0/25 below the
   threshold, which a clock-contaminated oracle could not produce.

---

## REMAINING MUST-FIX BEFORE PUSH

**None.** See NN7's disposition: 0.6.0 strictly reduces the affected population versus the
currently-pushed 0.5.0, so withholding it would preserve the worse state.

## SHOULD-FIX (ordered)

1. **NN7** — read `Override density` when present (or `max(physical, override)` as an interim).
   This is the only finding that can produce an irreversible side effect, and it is a two-line fix.
2. **NN1** — `behavior: "instant"` on `scrollIntoView`.
3. **NN8** — surface the horizontal 5/6 in the README, per §C.3's own standard.
4. **NN3** — "movement is unreliable" for the iOS half.
5. **NN4** — scope the step-of-two sentence to screen-axis parity, not floor parity.
6. **NN10** — cache the per-serial threshold.
7. **NN9** — sharpen the `basis` taxonomy.
8. **NN5** — correct the precondition comment; make `minNonDegenerateRatio` refuse to advise a
   value it would itself reject.
9. **NN6** — `@MX:` tags on `swipe.ts`.
10. Disclose the `--web` proxy instability in the `tap --web` reference.

## SAFE TO PUSH

**Yes.**

No regression: the 9 prior interface signatures are unchanged, 639 tests pass, and iOS behaviour is
identical to the pushed 0.5.0 (`minValidRatio` byte-identical). No false numeric claim: 58 doc
numbers execute correctly against the module. The one MEDIUM new finding (NN7) is a *narrowing* of
a defect that is currently live on origin — 0.5.0 under-rejects on every Android device; 0.6.0
under-rejects only on those with an enlarged display-size override. NN1 is a carried MEDIUM whose
fix is one argument, unchanged in severity since I first cleared a push with it open.

---

## Environment note

No gestures were sent to the Android device — every Android interaction was either a read-only
query (`adb devices`, `wm density`, `wm size`) or a `scroll` rejection path, which the CLI confirms
sends nothing. This was deliberate given the tap hazard. No fixture server was started and no
`adb reverse` tunnel was created, so neither needed cleanup.

Verified on exit: working tree clean (`git status --porcelain --untracked-files=no` empty), Android
device healthy with `Physical density: 600` unchanged, only the iPhone 17 Pro booted, no listener on
8935, `adb reverse --list` empty.

## Evidence index

| Claim | Command | Observed |
|---|---|---|
| Test baseline | `pnpm vitest run` | exit 0 — 29 files, **639** tests |
| Type / build | `pnpm typecheck`, `pnpm build` | exit 0, exit 0 |
| Interface | `grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` | 10 |
| Android threshold | live `scroll --amount 0.001` (rejection path) | `minValidRatio 0.011039886623620987`, `basis device-query` |
| iOS threshold | live `scroll --amount 0.001` (rejection path) | `minValidRatio 0.013984236866235733`, `basis measured-constant` |
| Android arithmetic | module recompute | ratio → exactly 32px; next lower → 30px, rejected |
| Device density | `adb shell wm density` | `Physical density: 600` (no Override line) |
| NN7 | real `AdbBackend` + stub executor, 5 density outputs | `Physical 480 / Override 600` → 26px vs OS slop 30px |
| `floor` vs `round` | derivation across 420/480/600/640 dpi | threshold strictly > slop in every case |
| NN4 | exhaustive distance scan, 3 iOS screens | odd axes step by 1 and land exactly on the 11px floor |
| NN5 | `isDegenerateSwipe` at 4 thresholds | precondition holds only above 13 / 25 / 36 / 38 px |
| Monotonicity | 4 thresholds × 4 screens × 4 directions × 60k ratios | 0 violations |
| Doc numerics | `docsweep2.mjs` | 58 claims executed; 3 hits, all historical narrative; 0 genuine |
