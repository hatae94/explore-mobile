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
 * (`bound: false`) was never measured on a real device (spec.md §C.3-⑩,
 * AC-ANDROID-032 — an explicitly open, not-yet-verified item). Do NOT
 * treat `currentImeId` as an established readiness signal without a
 * real-device observation backing that use — see `adb-backend.ts`'s
 * `waitForImeBindingReady` doc comment for the design decision this
 * parser's caller made pending that verification.
 */

export interface InputMethodBindingState {
  /** Whether the device's input-method service currently has ANY IME bound (real-device measured to flip false -> true within roughly one adb round-trip after `ime set`, spec.md §C.3-⑦). */
  readonly bound: boolean;
  /** The `mCurId` value, when present — the id of the IME the dump reports as currently bound. `undefined` when the dump has no `mCurId` line at all (defensive — not an observed real-device shape). */
  readonly currentImeId: string | undefined;
}

const BOUND_TO_METHOD_PATTERN = /mBoundToMethod=(true|false)/;
const CUR_ID_PATTERN = /mCurId=(\S+)/;

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
