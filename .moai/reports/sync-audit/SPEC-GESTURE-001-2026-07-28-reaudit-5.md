# Sync Re-Audit #5 — SPEC-GESTURE-001 0.8.0 (debt sweep)

- **Auditor**: sync-auditor (independent, adversarial stance)
- **Date**: 2026-07-28
- **Delta audited**: `d1401e3..3f04cf4` (5 commits, local-only)
- **Prior audits**: 0.3.0 → 0.69 · 0.4.0 → 0.76 · 0.5.0 → 0.86 · 0.6.0 → 0.88 · 0.7.0 → 0.89 (pushed)

---

## VERDICT

**PASS-WITH-DEBT** — **0.91**. Delta **0.69 → 0.76 → 0.86 → 0.88 → 0.89 → 0.91**.

All nine carried items are closed, verified at the new `file:line` and live on both platforms. Zero
new REQs for a pure debt sweep is the right discipline. Two things keep this short of a clean PASS:
NN10 shipped ~60 lines whose benefit cannot materialize on the product's own surface, and the AC
fixed for a stale hand-count kept a hand-written line list beside the new grep — which drifted again
inside this very round.

---

## Dimension scores

| Dimension | 0.7.0 | 0.8.0 | Reasoning |
|---|---|---|---|
| Functionality | 0.90 | **0.91** | Nine items closed; live-verified on both platforms with byte-identical values to 0.7.0 (regression guard); 657 tests, interface still 10. NN5's omission edge behaves correctly at both extremes. NN10 is correct-but-inert rather than defective. |
| Security | 0.95 | **0.95** | Unchanged surface. The `try`/`catch` lives inside the page script and narrows a failure mode rather than widening reach; the density parser is untouched this round. |
| Craft | 0.88 | **0.88** | NF1's fix — replacing a hand-count with a grep the AC now carries — is the genuinely durable answer, and the amendment ran it rather than trusting M8's number. Sweep discipline is good (0 new REQs, 2 ACs, 3 prose corrections). Against: NN10 ships complexity whose benefit the CLI path cannot realize, and the AC-027 line list re-drifted in the same round. |
| Consistency | 0.85 | **0.89** | Numeric sweep clean (62 claims, 0 genuine contradictions). NN3, NN9, NF3 and the `--web` disclosure are each corrected precisely at the level I raised them, and the NF3 passage explicitly disclaims equivalence rather than implying parity. Against: the AC-027 line-list residue. |

`4 / (1/0.91 + 1/0.95 + 1/0.88 + 1/0.89)` = **0.9067** → **0.91**

---

## NINE ITEMS

| # | Item | Status | Citation / evidence |
|---|---|---|---|
| NF1 | AC-027 "4 files / 7 points" | **CLOSED (with residue)** | `acceptance.md:393-397` now carries a grep; I executed it verbatim → **6 files / 9 sites**, matching. Residue below. |
| NF2 | Android settle delay absent from SPEC body | **CLOSED** | `spec.md` §C.1-㉒ (5 mentions) + §C.3 + `acceptance.md:54` AC-GEST-033 |
| NN9 | `basis` overstates by one level | **CLOSED** | `README.md:408-420` — "**Not** a value read off the device — a fixed platform rule, `floor(8dp × density) + 2px`, with one free parameter (density)… What changes with the device is the parameter, not the rule." Exactly the one-level correction I raised. AC-027 additionally binds the *property*, not the token. |
| NF3 | `behavior:"instant"` enum cliff | **CLOSED** | `web-support.ts:249-253` — `try { …behavior:"instant" } catch { …no behavior }` inside the page script |
| NN5 | false comment + self-rejecting recommendation | **CLOSED** | `scroll-geometry.ts:226-230` returns `number \| undefined` with an early return when `ratio=1` is itself degenerate; `scroll.ts:158` spreads the fields conditionally; the false "already rejected by REQ-GEST-SCROLL-004" justification is **gone** (grep returns nothing) |
| NN10 | threshold re-queried every call | **IMPLEMENTED, INERT** | `adb-backend.ts:144-206` — see ruling |
| NN6 | `swipe.ts` no `@MX` tags | **CLOSED** | 1 tag |
| NN3 | README iOS "nothing happens" | **CLOSED** | `README.md:355-361` — string removed; now "movement is **unreliable, not guaranteed absent**" with 9pt 1/15 and 10pt 2/15 cited |
| `--web` | proxy instability only in Status | **CLOSED** | `README.md:743` — relocated next to the proxy lifecycle, with `pkill -f ios_webkit_debug_proxy` as the recovery step |

Live regression guard — both platforms, via the rejection path (sends nothing):

```
Android  minValidRatio 0.011039886623620987  basis device-query        (byte-identical to 0.7.0)
iOS      minValidRatio 0.013984236866235733  basis measured-constant   (byte-identical to 0.7.0)
```

NN5's omission edge, exercised at both extremes:

| screen / threshold | response |
|---|---|
| 12×12 @ 11px · 30×30 @ 32px | fields **omitted** |
| 402×874 @ 11px · 1440×3120 @ 32px | `minValidRatio` + `minValidRatioBasis` present |

---

## NN10 RULING — the cache does not earn its complexity

**The coordinator's analysis is correct on the CLI path, and incomplete.** `AdbBackend` is a public
library export (`src/index.ts` → `export { AdbBackend }`, reachable via `package.json` `main` /
`exports`), so a programmatic consumer constructing one backend and issuing repeated `scroll` calls
in one process **would** hit the cache. It is not dead code.

But that does not rescue it:

1. **The documented product is the CLI** ("Agent-agnostic CLI for driving mobile devices"), and on
   that path the cache provably cannot hit — `bin.ts:41` runs `runCli` once per process and
   `scroll.ts:126` is the single production call site, so the threshold is queried at most once per
   process. The first call is always a miss.
2. **Neither benefit I originally cited materializes there.** I raised NN10 for per-call latency and
   for transient-adb-failure resilience. With one query per process, latency is unchanged and the
   first (only) call is exactly as exposed to a transient failure as before.
3. **It introduces a hazard it must then mitigate.** A cached threshold can go stale in the
   enlarging-density direction, supplying a below-slop value — and a below-slop swipe is a **tap**
   (§C.1-⑱), not a no-op. The 5 s TTL exists solely to bound a hazard the cache itself creates. The
   TTL reasoning is genuinely good, but it argues *"if you cache, you must expire"*, never *"you
   should cache"*.
4. **Cost**: ~60 lines, a new constant, an injectable clock threaded through the constructor, plus
   tests — against a benefit realized only on an undocumented secondary surface.

**Ruling: it does not earn its complexity as shipped.** Under the simplicity ladder, a change whose
only realized benefit is off the product surface, and which adds a hazard requiring its own
mitigation, is a net negative. Two acceptable dispositions:

- **(a) Revert** — restores ~60 lines and removes the staleness hazard entirely. My recommendation.
- **(b) Keep and scope it** — document it as a library-consumer optimization (it is currently
  documented *nowhere* user-facing, deliberately), so the next reader does not mistake it for a CLI
  characteristic.

What is **not** acceptable is leaving it undocumented and unexplained as a CLI-path no-op.

**Credit where due**: M10 disclosed the inertness itself rather than reporting a benefit it had not
verified, and the docs pass deliberately declined to document a cache that changes nothing a user
can observe. Both were the right calls, and the self-disclosure is what made this rulable at all.
This is a scoping misjudgment, not an integrity problem — and it is my own item, raised on reasoning
I did not verify against the call graph before raising it.

---

## NF3 SHAPE — I refute my own description; M10's correction is right

**M10 is correct and my audit #4 description was wrong.** I read
`src/webview/inspector-client.ts:199-202` directly:

```ts
if (reply.result.wasThrown === true) {
  call.reject(new WebInspectorEvaluationError(`Page threw during evaluation: ...`));
  return;
}
```

A thrown page value makes `evaluate()` **reject**, not resolve. My claim — that the throw would be
swallowed, `readScrollIntoViewOutcome` would receive a non-conforming value, and every off-viewport
tap would silently degrade to `js-click` — is refuted by the code.

**One refinement to M10's correction.** M10 reported the pre-fix shape as `WEB_SESSION_FAILED`. It
would actually surface as **`WEB_EVAL_THREW`**: `WebInspectorEvaluationError` carries
`public readonly code = "WEB_EVAL_THREW"` (`webkit-errors.ts:36`), and `webFailure`
(`web-support.ts`) propagates `err.code` whenever it is a string, falling back to
`WEB_SESSION_FAILED` only when the thrown value carries no code. So the true pre-fix shape is an
outright `{"ok":false,…,"error":{"code":"WEB_EVAL_THREW",…}}` envelope.

**Why this matters beyond bookkeeping.** "Silent" was the load-bearing word in my finding — a silent
degrade is dangerous precisely because the caller cannot see it. An explicit error envelope is
*louder and safer*. The finding was correctly rated LOW, but the reasoning that made it sound
concerning was wrong. The fix remains correct and worth having: it converts a hard command failure
into graceful degradation on old WebKit. I got the severity right by accident, not by analysis.

The README states this uncertainty honestly rather than papering over it
(`README.md:687-689`: the enum-throw was confirmed live, but which of two pre-fix failure shapes it
would have produced was not).

**On the fallback's non-equivalence** (the coordinator's question 3): neither surface implies parity.
`README.md:678-683` says it outright — "**This is an improvement over throwing, not an equivalent to
the primary call above**" — and names the reopened path (old WebKit *and* a smooth-scrolling
page/container). The docblock at `web-support.ts:264-269` says the same. **"No declared version floor
+ defensive fallback" is the right combination**: a floor would be a claim about configurations
nothing here has tested, which is precisely the class of unverified assertion this SPEC has spent
five amendments eliminating. The fallback degrades on a narrower path than the cliff it replaces, and
both surfaces say so.

---

## MEASUREMENT / SWEEP DISCIPLINE

**Zero new REQs is correct for this scope.** I checked whether anything was under-treated — a
concern that needed a REQ and got a comment:

- **NN9** — treated as prose, token retained. Right call: AC-027 explicitly binds the *distinguishable
  property* rather than the token name ("이 AC는 토큰의 이름을 검사하지 않는다"). A REQ change here
  would have been over-treatment of a vocabulary issue.
- **NF3** — no REQ. Right: an implementation detail under REQ-GEST-WEB-001/002, whose text already
  required re-measurement after the pull-in.
- **NF2** — got §C.1 fact row + §C.3 limitation + an AC. Appropriate weight for a platform fact.
- **NN5 / NN3 / NN6 / `--web`** — comment, prose, tags, relocation respectively. All proportionate.

Nothing was under-treated. If anything, **NN10 was over-treated** — it was implemented when the
right answer was to decline it (see ruling).

---

## AC VERIFICATION — all 34

**My tally: 33 PASS / 1 PARTIAL / 0 FAIL — I agree with the claim.** Second consecutive round with
no disagreement.

| AC | Claimed | Mine | Basis |
|---|---|---|---|
| 001–012 | PASS | PASS | 004 **re-ran** (657 tests, typecheck/build 0, interface 10); others inspection / prior executions |
| 013 | PASS | PASS | NN1 closed at 0.7.0 and live-verified then; `web-support.ts` scroll-behavior path unchanged in intent this round |
| 014–019 | PASS | PASS | Inspection / prior executions |
| 020 | PARTIAL | **PARTIAL (agree)** | acceptance.md explicitly permits; intermittency unchanged |
| 021–026 | PASS | PASS | 022 / 026 verified in prior rounds; threshold parameterisation unchanged this round |
| 027 | PASS | PASS | **Re-ran the AC's own grep verbatim** → 6 files / 9 sites, matching its stated expectation |
| 028–029 | PASS | PASS | 028 **re-ran live** (Android round-trip, byte-identical); 029 document oracle on inspection |
| 030 | PASS | PASS | **Re-ran** — parser still returns 32px for this device and reads Override when present |
| 031–032 | PASS | PASS | Verified live at 0.7.0; unchanged this round |
| 033 | PASS | PASS | **Accepted on inspection** — document oracle; §C.1-㉒ + §C.3 present, and the record honestly notes the condition was already satisfied by M8's methodology rather than newly created |
| 034 | PASS | PASS | **Re-ran at module level** — `minValidRatio` returns `undefined` exactly where it would otherwise recommend a self-rejecting value (12×12 @ 11px, 30×30 @ 32px), and carries a value on both real screens |

---

## NEW FINDINGS

### NF4 — the AC fixed for a stale hand-count kept a hand-written line list, which drifted in the same round
**[LOW][certain]** `.moai/specs/SPEC-GESTURE-001/acceptance.md:399`

The durable half of NF1's fix is right: the AC now carries a grep, and I executed it verbatim to
6 files / 9 sites. But the AC also kept an illustrative line-number list beside it, and I checked
each entry against the file:

| cited | actual | |
|---|---|---|
| `device-backend.test.ts:22` · `router.test.ts:46/:87/:369/:448` · `registry.test.ts:42` · `web-support.test.ts:101` · `swipe.test.ts:39` | match | ok |
| **`scroll.test.ts:108`** | **`:127`** | **stale** |

M10's own test additions shifted that line, and the list was not re-derived. One of nine entries is
already wrong — in the round whose purpose was to eliminate a stale hand-maintained number from this
exact AC.

The point is not the single wrong number; it is that the fix put a self-verifying artifact (the
grep) and a non-self-verifying artifact (the line list) side by side, and only the second one can
rot. The line list adds no verification power the grep lacks.

**Fix**: delete the line list, or generate it from the grep at the moment of writing and mark it
explicitly as a non-normative snapshot. The counts and file set are already fully covered by the
command.

### NF5 — the threshold cache is user-invisible by design but has no internal record of that decision
**[INFO][certain]** `src/backend/adb-backend.ts:144-206`

Following from the NN10 ruling: the docs pass deliberately did not document the cache as a
user-facing characteristic — correct, since it changes nothing a CLI user can observe. But that
decision now exists only in the sync-phase record. A future reader of `adb-backend.ts` finds an
elaborate TTL rationale and no statement that the cache currently cannot hit on the CLI path, and
may reasonably infer it is load-bearing.

**Fix**: if the cache is kept (NN10 disposition (b)), add one line to the `thresholdCache` docblock
recording that the CLI path issues at most one query per process, so the cache's benefit is
presently library-consumers-only. If reverted, this dissolves.

---

## Verified non-issues

1. **Doc numerics** — 62 claims executed against the built module; the 3 hits are the same
   historical narratives quoting the *0.3.0* defect (`"--duration 0 was accepted and reported
   ok:true"`). **0 genuine stale numbers**, sixth round running.
2. **No regression from the sweep** — 657 tests, typecheck/build exit 0, interface still 10 members,
   and both platforms' `minValidRatio` / `basis` byte-identical to 0.7.0.
3. **NN5's edge is genuinely handled, not merely typed** — the early return fires at exactly the
   screens where the old code would have recommended a value it then rejects.
4. **NF3 non-equivalence is stated on both surfaces** — docblock and README, in the same terms.
5. **AC traceability** — 34/34 in both artifacts; the tally is stated in CHANGELOG against
   `acceptance.md` as SSOT.
6. **AC-033's honesty** — recorded as "PASS (already satisfied)" rather than claiming the amendment
   created the condition. That is the correct way to close an AC whose requirement predates it.

---

## On the carry-over pattern (asked bluntly)

**It did not recur.** All nine items closed in one round, which is what I asked for and did not get
in the two prior rounds. The pattern I flagged twice — carried LOW items surviving an open docs pass
untouched — is broken here.

What replaced it is a smaller, subtler variant worth naming: **the fix for a rot-prone artifact
introduced a second rot-prone artifact next to it** (NF4). The grep cannot go stale; the line list
beside it already has. That is not the same failure — it is a much cheaper one — but it is the same
shape, and it is worth watching that a durable fix is not routinely accompanied by a fragile
companion.

---

## REMAINING MUST-FIX BEFORE PUSH

**None.**

## SHOULD-FIX (ordered)

1. **NN10 disposition** — revert the cache, or keep it and document the scope (NF5). Leaving it as
   an undocumented CLI-path no-op is the one outcome to avoid.
2. **NF4** — delete AC-027's hand-written line list, or mark it a non-normative snapshot.

Both are small. Neither blocks.

## SAFE TO PUSH

**Yes.**

No regression: 657 tests, interface unchanged at 10, and both platforms' threshold values
byte-identical to the pushed 0.7.0. No false numeric claim: 62 doc numbers execute correctly. All
nine carried items are closed at cited locations and verified live where a device could verify them.
The two open items are a complexity judgment on inert-but-correct code and a doc-list residue —
neither can produce a wrong gesture, a wrong number, or a silent side effect.

---

## Environment note

No gestures were sent to the Android device — read-only queries (`adb devices`, `wm density`) and
`scroll` rejection paths only, which the CLI confirms send nothing. Display density was **not**
changed. No fixture server was started and no `adb reverse` tunnel created, so neither needed
cleanup; the iOS WebKit proxy was not needed this round.

Verified on exit: working tree clean, Android at `Physical density: 600` with no Override line, only
the iPhone 17 Pro booted, `adb reverse --list` empty.

## Evidence index

| Claim | Command | Observed |
|---|---|---|
| Test baseline | `pnpm vitest run` | exit 0 — 29 files, **657** tests |
| Type / build | `pnpm typecheck`, `pnpm build` | exit 0, exit 0 |
| Interface | `grep -cE '^  [a-zA-Z]+\(' src/schema/device-backend.ts` | 10 (unchanged) |
| New REQs | `git diff … spec.md \| grep '신설'` | 0 |
| NF1 | AC-027's own grep, executed verbatim | 6 files / 9 sites — matches |
| NF4 | each cited line vs actual | 8/9 match; `scroll.test.ts:108` → actual `:127` |
| NF3 shape | `inspector-client.ts:199-202` + `webkit-errors.ts:36` + `webFailure` | rejects → `WEB_EVAL_THREW` envelope, not a silent `js-click` |
| NN10 | `grep -rn getMinEffectiveSwipeThreshold src \| grep -v test` + `bin.ts:41` | one production call site; `runCli` once per process |
| NN10 library surface | `src/index.ts` | `export { AdbBackend }` — cache reachable for library consumers |
| NN5 | `minNonDegenerateRatio` at 4 screen/threshold pairs | `undefined` on degenerate screens, value on real ones |
| NN3 | `grep "nothing happens" README.md` | no match; replaced with the 1/15 and 2/15 figures |
| Live both platforms | `scroll --amount 0.001` (rejection path) | Android `0.011039886623620987` / `device-query`; iOS `0.013984236866235733` / `measured-constant` |
| Doc numerics | `docsweep2.mjs` | 62 executed; 3 hits, all historical; 0 genuine |
