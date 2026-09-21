# Sync Re-Audit #4 — SPEC-GESTURE-001 0.7.0

- **Auditor**: sync-auditor (independent, adversarial stance)
- **Date**: 2026-07-28
- **Delta audited**: `467e7df..d1401e3` (5 commits, local-only)
- **Prior audits**: 0.3.0 → 0.69 · 0.4.0 → 0.76 · 0.5.0 → 0.86 · 0.6.0 → 0.88 (pushed)

---

## VERDICT

**PASS-WITH-DEBT** — **0.89**. Delta **0.69 → 0.76 → 0.86 → 0.88 → 0.89**.

NN7 and NN1 — the top two of my SHOULD-FIX list, one of them carried three rounds — are both
genuinely closed and verified live. NN8 and NN4 are closed and verified by execution against the
built module. For the first time in five rounds I have **no AC disagreement** with the claim. One
new LOW finding was introduced by the NN1 fix, and two flagged documentation gaps remain.

---

## Dimension scores

| Dimension | 0.5.0 | 0.6.0 | 0.7.0 | Reasoning |
|---|---|---|---|---|
| Functionality | 0.84 | 0.86 | **0.90** | NN7 closed (parser verified across 8 well-formed + 5 malformed shapes) and NN1 closed (live side-by-side against the old body on the same element). No regression: 644 tests, interface still 10 members, and this device's threshold unchanged at 32px. Remaining: the `behavior:"instant"` enum cliff on older WebKit (NF3), NN5, NN10. |
| Security | 0.95 | 0.95 | **0.95** | Unchanged surface. The parser still errors rather than guessing on every malformed input I threw at it. `behavior:"instant"` overriding page CSS is a documented product decision, not a security matter. |
| Craft | 0.86 | 0.88 | **0.88** | AC-030 names the fixture that would fail it and explicitly refuses to claim the unmeasured direction; AC-031 requires RED-first and deliberately asserts no argument; AC-032 is a documentation AC with two checkable criteria, honestly recorded unmet at M9 and promoted with evidence at sync. Against that: `swipe.ts` still untagged, NN5's comment still false, no threshold caching, and AC-027's falsified count survived a second round after being flagged. |
| Consistency | 0.82 | 0.82 | **0.85** | Numeric sweep clean (58 claims, 0 genuine contradictions) even though the docs agent quoted rather than re-measured. NN8 and NN4 both correctly closed — I re-derived every claim in the rewritten passages. AC-032 traceably promoted. Remaining: NN3's iOS half, AC-027's stale count, the Android settle delay missing from the SPEC body, `--web` disclosure. |

`4 / (1/0.90 + 1/0.95 + 1/0.88 + 1/0.85)` = **0.8935** → **0.89**

---

## NN7 / NN1 / NN8 / NN4

### NN7 — **CLOSED** · `src/backend/adb-backend.ts:117-136` (`parseEffectiveDensity`)

Reads `Override density:` when present, falls back to `Physical density:`. I drove the real
`AdbBackend` with stub executors across thirteen inputs:

| input | threshold | note |
|---|---|---|
| `Physical 600` (this device) | 32px | regression guard — unchanged from 0.6.0 |
| `Physical 600` + `Override 480` (shrink) | 26px | |
| `Physical 480` + `Override 600` (**enlarge**) | **32px** | was 26px — the shipped defect |
| Override listed *first* | 26px | order-independent |
| extra whitespace / CRLF | 26px | robust |
| `Physical 420` / `640` | 23 / 34px | |
| empty · no density line · non-numeric · `0` · `-600` | **error** | never a guessed threshold |

The interface did not grow — the fix is confined to the parser, which is the right blast radius.

### NN1 — **CLOSED** · `src/cli/commands/web-support.ts:251`

Live, on a `scroll-behavior: smooth` container, running **both** expression bodies against the
**same element** in one round-trip:

```
computedScrollBehavior: "smooth"
OLD (0.6.0)  scrollTop 0 -> 0     rectTop 1202 -> 1202   moved: false
NEW (0.7.0)  scrollTop 0 -> 958   rectTop 1202 -> 244    moved: true
```

`1202`, `958` and `244` are the identical values I measured in audit #3 — where `958`/`244` only
appeared ~11 s later. `behavior:"instant"` makes the final position available at sample time, which
closes both consequences I reported: the scroll is now marked, and the re-measure gets the true
post-scroll rect so the native tap no longer degrades to the JS fallback.

### NN8 — **CLOSED** · `README.md:440-446`

The counter-evidence now sits with the round-trip claim: "vertically, 32px measured a clean 8 out
of 8, but horizontally it measured only 5 out of 6, so the floor is **not** established as fully
reliable on that axis, and the residual band is recorded as unresolved rather than papered over."
That is §C.3's standard, met at the point of the claim rather than a link away.

### NN4 — **CLOSED** · `README.md:368-383`

Rescoped to the axis I actually reported. I re-derived every claim in the passage:

| screen / axis | achievable distances | accepted at `minValidRatio` |
|---|---|---|
| 402×874 both (even) | 0,2,4,6,8,10,12,14 | 12px |
| 393×852 `down` (852 even) | 0,2,4,6,8,10,12,14 | 12px |
| 393×852 `left` (393 **odd**) | 1,3,5,7,9,**11**,13,15 | **11px — exactly the floor** |
| 375×667 both (**odd**) | 1,3,5,7,9,**11**,13,15 | **11px — exactly the floor** |
| 1440×3120 both (even, Android floor 32) | 0,2,4,…,32 | **32px — exactly the floor** |

Every sentence in the rewritten passage matches. The Android sentence ("lands exactly on an even
axis") also checks out.

---

## MEASUREMENT GRADING — honest, and better-founded than it claims

The three tiers are accurate as stated: Physical-governs **disproved**; Override-governs
**consistent with measurement + AOSP**; the enlarged-direction numbers **derived, not measured**.
Narrowing the Override-480 boundary to `[22, 25)` rather than a pixel-precise value is correct —
the run sampled 22/25/32, not a bisection, so `[22, 25)` is exactly what the data supports and
claiming §C.1-⑰'s precision here would have been an over-claim.

I then tested something the SPEC does not state, and it strengthens the case. Enumerating the
shipped derivation against **every** surviving hypothesis:

| config | code reads | code threshold | Physical governs *(disproved)* | Override governs | min(P,O) governs |
|---|---|---|---|---|---|
| no override (600) | 600 | 32px | OK (slop 30) | OK (30) | OK (30) |
| shrink P600 O480 | 480 | 26px | **UNSAFE (30)** | OK (24) | OK (24) |
| enlarge P480 O600 | 600 | 32px | OK (24) | OK (30) | OK (24) |

Two conclusions:

1. **The fix is safe in every configuration under both surviving hypotheses**, including the
   unmeasured enlarged direction. If `min(P,O)` turns out to govern, the code over-rejects there
   (32px against a 24px slop) — the conservative direction, never an unintended tap. So the
   unmeasured direction needs measuring for *precision of the number*, not for *safety*.
2. **The one direction that was measured is precisely the one that discriminates the new code's
   only danger case.** Under Physical-governs the shrink config would be unsafe (26px against a
   30px slop); the measurement ran in exactly that config and observed 25px moving 4/6, which is
   impossible if the slop were 30. The measurement eliminated the sole hypothesis under which the
   shipped code is unsafe.

So the grading is honest and, if anything, **under-sells its own result**. The SPEC could convert
"derived, not measured" from a standing caveat into a bounded-risk statement — "unmeasured, but
safe under every hypothesis the measurement leaves standing" — without weakening the evidence
discipline. That is a strengthening opportunity, not a defect.

**On the NN1 disposition** (implementation defect + §C.1 fact row + binding annotation, no REQ
change): correct, and consistent with how the 0.5.0 container-scroll fix was handled, which I
accepted then. REQ-GEST-WEB-001 already said re-measure *after* the pull-in and REQ-GEST-WEB-002
already required observed movement — the defect was that the sample was taken before either
condition could be true. Nothing in the REQ text needed to change; what was missing was the fact
that `scrollIntoView` can be asynchronous. Recording that as a fact row plus a binding annotation
puts it where the next implementer will hit it. AC-031 deliberately admitting either
implementation (force-instant or await-completion) is also right: it constrains the contract, not
the mechanism, and `plan.md` picking force-instant with a stated rationale (no standard completion
signal → would reopen the unbounded-wait hazard the `--duration` ceiling closed) is a defensible
choice at the right layer.

---

## AC VERIFICATION — all 32

**My tally: 31 PASS / 1 PARTIAL / 0 FAIL — I agree with the claim exactly.** First round in five
with no disagreement.

| AC | Claimed | Mine | Basis |
|---|---|---|---|
| 001–005 | PASS | PASS | 004 **re-ran** (644 tests, typecheck/build 0); others inspection / prior executions |
| 006 | PASS | PASS | **Re-ran** — `adb` on PATH, device enumerated, CLI reports it as `android` |
| 007–012 | PASS | PASS | Inspection / prior-audit executions; untouched this delta |
| **013** | PASS | **PASS (upgraded from my two-round PARTIAL)** | The sole ground for my objection was NN1. **Re-ran live**: the shipped body now returns `moved:true` where the 0.6.0 body returns `moved:false` on the same smooth-scroll element. Objection withdrawn |
| 014–019 | PASS | PASS | Inspection / prior executions |
| 020 | PARTIAL | **PARTIAL (agree)** | acceptance.md explicitly permits; intermittency unchanged |
| 021 | PASS | PASS | Guarded by the vm suite; AC-031 explicitly re-confirms it did not loosen |
| 022–025 | PASS | PASS | 022 **re-ran** (odd-axis rejection under the parameterised threshold); others inspection |
| 026–028 | PASS | PASS | 026/028 **re-ran** — derivation arithmetic across densities, and the Android `minValidRatio` round-trip live via the rejection path |
| 029 | PASS | PASS | **Accepted on inspection** — document-oracle AC; the three pre-conditions are recorded and the iOS retroactive gap disclosed |
| **030** | PASS | PASS | **Re-ran** — all four named fixtures plus 9 more shapes; fixture C returns 32px (was 26px), A unchanged at 32px, D still an explicit error, and a `max(P,O)` implementation would indeed fail B (26px expected, max gives 32px) |
| **031** | PASS | PASS | **Re-ran live** — and I independently confirmed the RED: the 0.6.0 body gives `moved:false` on the same element, so the test genuinely discriminates |
| **032** | PASS | PASS | **Verified both criteria directly**: the horizontal 5/6 is present at `README.md:440-446`, and the parity rescoping at `:368-383` matches my own module recomputation exactly. M9 recorded it unmet honestly; the docs pass promoted it with an evidence table at `progress.md:1527-1531` |

---

## NEW FINDINGS

### NF3 — `behavior: "instant"` throws on WebKit builds that predate it, silently degrading every off-viewport tap
**[LOW][certain]** `src/cli/commands/web-support.ts:251`

WebKit **validates** the `ScrollBehavior` enum. Confirmed live on the connected simulator:

```
scrollIntoView({block:'center', behavior:'instant'})      -> accepted
scrollIntoView({block:'center', behavior:'bogus-value'})  -> THREW TypeError
```

So on a WebKit that does not recognise `"instant"` (Safari < 17.4), the shipped expression throws.
The throw is swallowed downstream — `readScrollIntoViewOutcome` receives a non-conforming value and
returns `{found:false, moved:false}` — so the command falls through to the JS `click()` path for
**every** off-viewport element, not just smooth-scrolling ones. That is a broader degradation than
the defect being fixed, and it is silent: the response reads `js-click`, which is a legitimate value.

No supported configuration is affected today — the project's simulators are iOS 18.6 and 26.0, both
well past 17.4 — and the failure degrades safely rather than mis-tapping. But the codebase states no
minimum iOS/WebKit version, and this is the first construct in the file that has a version floor.

**Fix**: either document the WebKit floor next to the `behavior:"instant"` rationale (the comment
already explains *why* instant, not *since when*), or make it defensive:
```js
try { el.scrollIntoView({block:"center", behavior:"instant"}); }
catch (e) { el.scrollIntoView({block:"center"}); }
```
Three lines, removes the cliff, and preserves current behaviour everywhere it works.

### NF1 — `acceptance.md` AC-GEST-027 asserts a count its own implementation falsified
**[LOW][certain]** `.moai/specs/SPEC-GESTURE-001/acceptance.md:389`

The AC still says test doubles are "**4개 파일 7개 지점**". M8 recorded the true figure at
`progress.md:1129` — "**실제로는 6개 파일 9개 지점**" — and explained why (M2/M3 added
`swipe.test.ts`/`scroll.test.ts` `createMockBackend`, which also needed updating). This was flagged
to me last round and survived this round's docs pass uncorrected.

No runtime impact, but it is an acceptance criterion whose stated, numerically checkable claim is
false — the same class this SPEC has spent four amendments eliminating everywhere else. It also
degrades the AC's value as a tripwire: a future interface change following the AC's list would miss
two files.

**Fix**: correct to 6 files / 9 sites and name the two additional files. (AC-GEST-004's identical
phrase at `:101` is M1-era and was accurate then; leave it, or annotate it as historical.)

### NF2 — the Android scroll-settle delay lives only in the run log
**[LOW][certain]** `progress.md` (12 mentions) vs `spec.md` §C.1/§C.3 (absent)

The ~1 s settle delay needed after an Android scroll before the screen state is stable was
discovered during device verification and is recorded only in `progress.md`. §C.1 has no fact row
for it and §C.3 no limitation entry, so a reader of the SPEC body — the artifact meant to survive
the run log — will not find it. It is an operational property of the platform in the same family as
the fling asymmetry that *did* get a §C.3 entry.

**Fix**: one §C.1 fact row (or a §C.3 bullet next to the fling entry).

---

## PRIOR SHOULD-FIX DISPOSITION

| Item | Status |
|---|---|
| **NN7** (density override) | **RESOLVED** — and by measurement rather than my suggested interim, which is the better outcome |
| **NN1** (`behavior:"instant"`) | **RESOLVED** — carried three rounds, closed and live-verified |
| **NN8** (horizontal 5/6) | **RESOLVED** |
| **NN4** (step parity scoping) | **RESOLVED** — correctly rescoped to screen-axis length |
| **NN3** (README "nothing happens", iOS half) | **UNRESOLVED** — `README.md:355` unchanged; still contradicted by 9pt 1/15, 10pt 2/15 |
| **NN5** (`ratio=1` precondition comment) | **UNRESOLVED** — `scroll-geometry.ts:209` still claims such screens are "already rejected by REQ-GEST-SCROLL-004", which remains false |
| **NN6** (`swipe.ts` MX tags) | **UNRESOLVED** — still 0 |
| **NN9** (`basis` taxonomy) | **UNRESOLVED** — enum unchanged |
| **NN10** (threshold caching) | **UNRESOLVED** — `wm density` still queried on every Android `scroll` |
| `--web` proxy disclosure | **UNRESOLVED** — 0 mentions in the `tap --web` reference; it cost me a large share of this audit again |

**What this round should have caught**: NF1 was handed over explicitly last round and went through a
full docs pass untouched. It is one line. Of the six carried items, five are one-to-three-line edits;
the pattern is that carried LOW items are not being swept even when a docs pass is already open.

---

## Verified non-issues

1. **Doc numerics** — 58 claims executed; the 3 hits are all historical narratives quoting the
   *0.3.0* defect. **0 genuine stale numbers.** Notably this held even though the docs agent
   disclosed it quoted §C.1-⑰/⑳'s raw trials rather than re-measuring — quoting is adequate here
   precisely because the sweep can catch drift mechanically, and it found none.
2. **Parser robustness** — order-independent, whitespace- and CRLF-tolerant, and every malformed
   input errors rather than returning a guessed threshold.
3. **No regression from the interface** — still 10 members; this device's threshold still 32px.
4. **AC-031's RED is real** — I confirmed independently that the 0.6.0 body fails the same stub
   contract, so the test discriminates rather than merely passing.
5. **`max(physical, override)` correctly rejected** — I verified it would return 32px on the shrink
   fixture where the effective threshold is 26px, i.e. over-rejection. The SPEC's reason for
   discarding my interim is sound now that the direction is measured.
6. **AC traceability** — 32/32 in both artifacts; the deliberately-unmet AC-032 has an explicit
   promotion record rather than a silent flip.

---

## REMAINING MUST-FIX BEFORE PUSH

**None.**

## SHOULD-FIX (ordered)

1. **NF3** — three-line try/catch fallback, or document the WebKit floor.
2. **NF1** — correct AC-GEST-027's file/site count (flagged twice now).
3. **NN3** — "movement is unreliable" for the iOS half of `README.md:355`.
4. **NF2** — a §C.1 or §C.3 entry for the Android settle delay.
5. **NN5** — correct the false precondition justification; make `minNonDegenerateRatio` refuse to
   advise a value it would itself reject.
6. **NN10** — cache the per-serial threshold (invalidate on session reset, since a display-size
   change now alters it).
7. **NN9** — sharpen the `basis` taxonomy.
8. **NN6** — `@MX:` tags on `swipe.ts`.
9. `--web` proxy instability in the `tap --web` reference.

Items 3–9 are all one-to-three-line edits that have now been carried between one and three rounds.
They would be better swept in a single pass than re-listed a fourth time.

## SAFE TO PUSH

**Yes.**

No regression: 644 tests, interface unchanged at 10 members, and the measured device's threshold
still 32px. No false numeric claim: 58 doc numbers execute correctly. Both of my top-priority
findings are closed with live verification — NN1 side-by-side against the old body on the same
element, NN7 across thirteen parser inputs. The single new finding (NF3) affects no supported
configuration and degrades safely. The evidence grading behind the density fix is honest, and my own
hypothesis enumeration shows the fix is safe under every hypothesis the measurement leaves standing.

---

## Environment note

No gestures were sent to the Android device — every Android interaction was a read-only query
(`adb devices`, `wm density`) or a `scroll` rejection path, which sends nothing. The device's
display density was **not** changed, per the constraint. On iOS I served a fixture on port 8952 and
injected a smooth-scroll container into the loaded page; both are gone.

The WebKit proxy was as flaky as warned — `NO_WEB_PAGE` with the page demonstrably loaded, recovered
by `pkill -f ios_webkit_debug_proxy` and retrying. The NN1 comparison took four attempts.

Verified on exit: working tree clean, Android at `Physical density: 600` with no Override line, only
the iPhone 17 Pro booted, no listener on 8952, `adb reverse --list` empty, Safari restored.

## Evidence index

| Claim | Command | Observed |
|---|---|---|
| Test baseline | `pnpm vitest run` | exit 0 — 29 files, **644** tests |
| Type / build | `pnpm typecheck`, `pnpm build` | exit 0, exit 0 |
| Interface | `grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` | 10 (unchanged) |
| NN7 | real `AdbBackend` + stub executors, 13 inputs | enlarge fixture 26px → **32px**; malformed all error |
| NN1 | old vs new expression body, same element, live | `moved:false` vs `moved:true`; `rectTop 1202→1202` vs `1202→244` |
| NN8 | `README.md:440-446` | horizontal 5/6 present alongside the 3/3 |
| NN4 | module recomputation, 5 screen/axis combinations | every claim in `README.md:368-383` matches |
| Hypothesis safety | enumeration over 3 configs × 3 hypotheses | only unsafe cell is under the disproved hypothesis |
| NF3 | live WebKit enum probe | `behavior:'bogus-value'` → `TypeError` |
| NF1 | `acceptance.md:389` vs `progress.md:1129` | "4 files / 7 points" vs "actually 6 files / 9 sites" |
| NF2 | `spec.md` grep vs `progress.md` grep | 0 vs 12 mentions of the settle delay |
| Android live | `scroll --amount 0.001` (rejection path) | `minValidRatio 0.011039886623620987`, `basis device-query` |
| Doc numerics | `docsweep2.mjs` | 58 executed; 3 hits, all historical; 0 genuine |
