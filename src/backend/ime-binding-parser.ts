/**
 * Pure parser for `adb shell dumpsys input_method` stdout (REQ-INPUT-004
 * 개정 0.3.0, plan.md §F M10 산출물 1) — extracts the IME-binding readiness
 * signal `AdbBackend.inputText()` polls before sending the base64
 * broadcast that follows an `ime set` switch (spec.md §C.3-⑤/⑧: `ime set`
 * returns as soon as the SETTING is written, but the IME service is not
 * yet bound, and a broadcast fired in that window is silently lost even
 * though the command still returns `{"ok":true}`).
 *
 * `mBoundToMethod=<bool>` appears EXACTLY ONCE in the dump (real-device
 * measured, spec.md §C.3-⑥), so this parse is unambiguous — no
 * disambiguation between multiple candidate matches is needed. The same
 * dump also exposes the actually-bound IME id via `mCurId=<ime id>`,
 * extracted here for completeness/diagnostics.
 *
 * @MX:NOTE — `currentImeId`'s value DURING the unbound window
 * (`bound: false`) WAS measured on a real device in the M10 verification
 * session (spec.md §C.3-⑯, AC-ANDROID-032 — resolved): `mCurId` was
 * ALREADY `com.android.adbkeyboard/.AdbIME` in that unbound window, i.e.
 * before the bind actually completed. A combined predicate (`bound &&
 * currentImeId === ADBKEYBOARD_IME_ID`) would therefore have been TRUE
 * during the failure window too — it has ZERO discriminating power over
 * `bound` alone. Do NOT add this conjunct later because it "looks
 * stricter" — it discriminates nothing and only adds a new failure mode;
 * see `adb-backend.ts`'s `waitForImeBindingReady` doc comment for the
 * readiness predicate this observation confirms.
 */

export interface InputMethodBindingState {
  /** Whether the device's input-method service currently has ANY IME bound (real-device measured to flip false -> true within roughly one adb round-trip after `ime set`, spec.md §C.3-⑦). */
  readonly bound: boolean;
  /** The `mCurId` value, when present — the id of the IME the dump reports as currently bound. `undefined` when the dump has no `mCurId` line at all (defensive — not an observed real-device shape). */
  readonly currentImeId: string | undefined;
}

const BOUND_TO_METHOD_PATTERN = /mBoundToMethod=(true|false)/;
const CUR_ID_PATTERN = /mCurId=(\S+)/;
const INPUT_SHOWN_PATTERN = /mInputShown=(true|false)/;

/**
 * Parses `dumpsys input_method` stdout into a binding-state snapshot.
 *
 * `bound` defaults to `false` when the `mBoundToMethod` marker is absent
 * from the dump (e.g. an unexpected/truncated dump, or a device/API-level
 * shape this parser has not seen) — an unconfirmed readiness signal must
 * never be treated as "ready", since that is precisely the silent-loss
 * defect this readiness gate exists to prevent.
 */
export function parseInputMethodBindingState(dumpsysOutput: string): InputMethodBindingState {
  const boundMatch = BOUND_TO_METHOD_PATTERN.exec(dumpsysOutput);
  const curIdMatch = CUR_ID_PATTERN.exec(dumpsysOutput);
  return {
    bound: boundMatch?.[1] === "true",
    currentImeId: curIdMatch?.[1],
  };
}

/**
 * Parses the SAME `dumpsys input_method` dump for the soft-keyboard
 * visibility marker `mInputShown`, consumed by `AdbBackend`'s pre-hide-
 * keycode guard (REQ-INPUT-004 개정 0.4.0, plan.md §F M14 산출물 1) — the
 * keyboard-hide keycode is sent only when the keyboard is confirmed
 * visible.
 *
 * @MX:NOTE — like `mBoundToMethod` (confirmed to appear EXACTLY ONCE in the
 * dump, spec.md §C.3-⑥), `mInputShown`'s occurrence count has ALSO now been
 * confirmed EXACTLY ONCE, measured in both states (`false` and `true`) on a
 * real device — the M14 real-device verification session resolved the
 * claim boundary spec.md §C.4-⑱ originally left open. This parser takes the
 * FIRST match, which is therefore unambiguous by the same property as
 * `mBoundToMethod`'s parse — not merely "sufficient in practice so far".
 *
 * Defaults to `false` when the marker is absent — deliberately the SAME
 * default value as `parseInputMethodBindingState`'s `bound`, but for a
 * mirrored reason (spec.md §C.4 M14 산출물 1): an unconfirmed `bound`
 * signal must not authorize a broadcast that could be silently lost,
 * while an unconfirmed `mInputShown` signal must not authorize a
 * keyboard-hide keycode that could (per §C.4-⑲'s single, inconclusive
 * counter-trial) navigate the screen away. Both defaults refuse to act on
 * an unconfirmed signal — same principle, applied to two different
 * side-effecting sends.
 */
export function parseSoftKeyboardShown(dumpsysOutput: string): boolean {
  const match = INPUT_SHOWN_PATTERN.exec(dumpsysOutput);
  return match?.[1] === "true";
}
