/**
 * `--web` command wiring (REQ-WEB-ACT-001..005, REQ-WEB-CLI-001..003).
 *
 * `tap` and `text` each delegate here when `--web` is present. The native
 * path in those handlers is untouched, which is what keeps the extension
 * additive (REQ-WEB-CLI-001, AC-WEB-017).
 *
 * **SPEC-VISION-001 M2 (REQ-VISION-002)**: `dump`는 명령 자체가 제거됐고
 * `runWebDump`도 함께 사라졌다 — 사용자 결정으로 `dump --web` 존치가
 * 기각됐다(progress.md §G). `tap --web` / `text --web`의 CSS 셀렉터 경로는
 * 변경 없이 유지된다(REQ-VISION-007, AC-VISION-031). `--index`는 이 파일의
 * `readSelector`가 쓰므로 **웹 전용 플래그로 존치**한다 — 네이티브
 * `--id`/`--text`만 제거됐다.
 *
 * The session lifecycle is: resolve an iOS target -> ensure a proxy ->
 * attach to the page -> do the work -> always release both. Releasing is in
 * a `finally`, so a failure part-way through cannot leave a proxy running
 * (plan.md §B.3).
 *
 * @MX:NOTE — the element lookup runs BEFORE viewport calibration on purpose.
 * Calibration sends a (harmless, overlay-absorbed) tap, and AC-WEB-015
 * requires an unmatched selector to produce no device interaction at all.
 */

import { buildCollectExpression, normalizeWebDomIndexed } from "../../normalize/webdom.js";
import type { IndexedWebElement } from "../../normalize/webdom.js";
import { spawnProcess, type ProcessExecutor } from "../../backend/process-executor.js";
import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { CalibrationStore, resolveViewport } from "../../webview/calibration.js";
import { webRectToDevicePoint, type ViewportMetrics } from "../../webview/coordinates.js";
import { connectWebInspector, type WebInspectorClient } from "../../webview/inspector-client.js";
import {
  openWebProxy,
  toPageSummary,
  type OpenWebProxyOptions,
  type WebPageTarget,
  type WebProxySession,
} from "../../webview/proxy-service.js";
import { AmbiguousWebPageError } from "../../webview/webkit-errors.js";
import type { ParsedCommandArgs } from "../args.js";
import { resolveTargetDevice } from "../device-targeting.js";
import { failure, success, type CommandError, type CommandResult } from "../envelope.js";
import { parseIndex } from "../validators.js";
import { errorMessage } from "./types.js";

/** Everything the web path reaches the outside world through, injectable for tests. */
export interface WebRunDeps {
  openProxy: (options: OpenWebProxyOptions) => Promise<WebProxySession>;
  connect: (url: string) => Promise<WebInspectorClient>;
  store: CalibrationStore;
  exec: ProcessExecutor;
}

/** Built lazily so importing this module does not touch the filesystem. */
export function defaultWebDeps(): WebRunDeps {
  return {
    openProxy: openWebProxy,
    connect: (url: string) => connectWebInspector(url),
    store: new CalibrationStore(),
    exec: spawnProcess,
  };
}

interface WebContext {
  serial: string;
  client: WebInspectorClient;
  /** Which page this command is acting on — echoed into every success response (REQ-WEB-CLI-004). */
  page: WebPageTarget;
}

/**
 * Maps a thrown value to the envelope, preserving the error type's own
 * `code` and — for an ambiguous page — the candidate list, so the caller can
 * act on the error without a second command.
 */
function webFailure(command: string, err: unknown): CommandError {
  const code =
    typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : "WEB_SESSION_FAILED";

  if (err instanceof AmbiguousWebPageError) {
    return failure(command, code, err.message, { pages: err.pages });
  }

  return failure(command, code, errorMessage(err));
}

type TargetResolution = { ok: true; serial: string } | { ok: false; error: CommandError };

/** Resolves the target device and refuses anything that is not iOS (REQ-WEB-CLI-003). */
async function resolveIosTarget(
  command: string,
  args: ParsedCommandArgs,
  backend: DeviceBackend,
): Promise<TargetResolution> {
  let devices: DeviceInfo[];
  try {
    devices = await backend.listDevices();
  } catch (err) {
    return { ok: false, error: failure(command, "BACKEND_COMMAND_FAILED", errorMessage(err)) };
  }

  const target = resolveTargetDevice(devices, args.device);
  if (!target.ok) return { ok: false, error: failure(command, target.code, target.message, target.details) };

  const device = devices.find((d) => d.serial === target.serial);
  if (device === undefined || device.platform !== "ios") {
    return {
      ok: false,
      error: failure(
        command,
        "UNSUPPORTED_ON_PLATFORM",
        "--web is supported on the iOS simulator only; Android WebView uses a different protocol and is a separate SPEC.",
        { serial: target.serial, platform: device?.platform ?? null },
      ),
    };
  }

  return { ok: true, serial: target.serial };
}

/** Opens a proxy + page connection, runs `body`, and always releases both. */
async function runInWebSession(
  command: string,
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  deps: WebRunDeps,
  body: (ctx: WebContext) => Promise<CommandResult>,
): Promise<CommandResult> {
  const target = await resolveIosTarget(command, args, backend);
  if (!target.ok) return target.error;

  let pageIndex: number | undefined;
  if (args.page !== undefined) {
    pageIndex = parseIndex(args.page);
    if (pageIndex === undefined) {
      return failure(command, "INVALID_PAGE", `${command} --page requires a non-negative integer.`, {
        received: args.page,
      });
    }
  }

  let session: WebProxySession;
  try {
    session = await deps.openProxy({ exec: deps.exec, ...(pageIndex !== undefined ? { pageIndex } : {}) });
  } catch (err) {
    return webFailure(command, err);
  }

  let client: WebInspectorClient;
  try {
    client = await deps.connect(session.pageWebSocketUrl);
  } catch (err) {
    session.dispose();
    return webFailure(command, err);
  }

  try {
    return await body({ serial: target.serial, client, page: session.page });
  } catch (err) {
    return webFailure(command, err);
  } finally {
    client.close();
    session.dispose();
  }
}

type SelectorResolution = { ok: true; css: string; index: number } | { ok: false; error: CommandError };

function readSelector(command: string, args: ParsedCommandArgs): SelectorResolution {
  const css = args.web ?? "";
  if (css.length === 0) {
    return {
      ok: false,
      error: failure(command, "MISSING_SELECTOR", `${command} --web requires a CSS selector: ${command} --web "<CSS>".`),
    };
  }

  if (args.index === undefined) return { ok: true, css, index: 0 };

  const index = parseIndex(args.index);
  if (index === undefined) {
    return {
      ok: false,
      error: failure(command, "INVALID_INDEX", `${command} --index requires a non-negative integer.`, {
        received: args.index,
      }),
    };
  }

  return { ok: true, css, index };
}

/**
 * Re-queries the page with the same selector and clicks the node at its RAW
 * position — `sourceIndex`, not the filtered one, since the page still
 * contains the invisible matches the normalizer dropped.
 */
function buildClickExpression(cssSelector: string, sourceIndex: number): string {
  return `(function(){
  var nodes = document.querySelectorAll(${JSON.stringify(cssSelector)});
  var el = nodes[${JSON.stringify(sourceIndex)}];
  if (!el) return false;
  if (typeof el.focus === "function") el.focus();
  el.click();
  return true;
})()`;
}

/**
 * Re-queries the page with the same selector and scrolls the node at its RAW
 * `sourceIndex` into view (REQ-GEST-WEB-001). Mirrors {@link buildClickExpression}'s
 * addressing scheme so both paths always agree on which node they mean.
 *
 * Returns `{found, moved}` rather than a bare boolean (SPEC-GESTURE-001
 * M6/0.4.0 amendment — F4, REQ-GEST-WEB-002 강화). `found` only says the
 * node existed and `scrollIntoView` was called on it; it says nothing about
 * whether the page actually moved.
 *
 * `moved` is decided by comparing the TARGET ELEMENT's own
 * `getBoundingClientRect()` immediately before and after the call
 * (SPEC-GESTURE-001 M7/0.5.0 amendment — C-3, REQ-GEST-WEB-002 sentence
 * already permitted this oracle: "scrollY 또는 대상 요소의 사각형"). The
 * element rect is the GENERAL oracle — a single predicate covers (i) window
 * scroll, (ii) an ancestor `overflow:auto` container scrolling (the element
 * moves on screen even though `window.scrollY` never changes — measured:
 * `containerScrollTop 0->755`, `scrollY 1626->1626`, and the 0.4.0
 * `window.scrollY`-only oracle reported `native`, i.e. "no movement", which
 * was a behavioral regression against `737b9fb`), and (iii) horizontal
 * scroll (`window.scrollY` cannot see an X-axis move at all). `window.scrollY`
 * alone misses (ii) and (iii); the element's own rect cannot.
 *
 * `scrollIntoView` is called with `behavior: "instant"` (SPEC-GESTURE-001
 * M9/0.7.0 amendment, REQ-GEST-WEB-001/002 0.7.0 note, spec.md §C.1-㉑).
 * Without it, a page (or ancestor container) declaring CSS
 * `scroll-behavior: smooth` makes the scroll ASYNCHRONOUS — the "after"
 * rect sampled immediately below would then reflect the PRE-scroll
 * position even though a scroll genuinely happens moments later, so `moved`
 * would wrongly read `false` for a scroll that did occur, AND the same
 * stale rect would be reused for coordinate conversion, silently degrading
 * a native tap to the JS `click()` fallback (measured:
 * `containerScrollTop 0 -> 0` immediately after the call, `-> 958` about
 * 11s later). Forcing an instant/synchronous scroll makes the "after"
 * sample always reflect the true post-scroll position. This deliberately
 * ignores the page's own `scroll-behavior` — the CLI's purpose is a
 * trustworthy coordinate, not animation fidelity (spec.md §A.2); waiting
 * for the animation to finish was rejected because there is no standard
 * completion signal, which would reopen the unbounded-wait hazard the
 * `--duration` ceiling already closed (spec.md §C.1-⑮).
 *
 * The call is wrapped in a `try`/`catch` (SPEC-GESTURE-001 M10/0.8.0
 * amendment, NF3): WebKit validates `ScrollBehavior` as an IDL enum, so a
 * WebKit build that predates `"instant"` (Safari < 17.4) throws a
 * `TypeError` for it (confirmed live on-simulator by the 5th-round audit;
 * NOT independently re-verified in this milestone — the live web proxy in
 * this environment is flaky, plan.md §C.1). Left uncaught, that throw would
 * propagate out of this whole evaluated expression: per
 * `webview/inspector-client.ts`'s `wasThrown` handling, `evaluate()` would
 * REJECT rather than resolve with a value, which `runInWebSession`'s catch
 * turns into an outright `WEB_SESSION_FAILED` for the command — NOT
 * necessarily the "quietly resolves to `{found:false,moved:false}` and
 * degrades to `js-click`" shape the cliff is sometimes described as
 * (that shape requires `evaluate()` to resolve rather than reject; this
 * codebase's transport rejects on a thrown page value). Either way — an
 * outright failure or a silent js-click degrade, depending on transport
 * behavior this milestone did not re-verify live — the fix is the same:
 * catching the throw INSIDE the page-side script, before it ever reaches
 * the transport boundary, closes the cliff regardless of which shape it
 * would otherwise take (this codebase's SPEC deliberately declares no
 * WebKit/iOS version floor — spec.md §D — so this fallback, not a version
 * check, is the mitigation). On a throw, the fallback re-issues the call
 * with NO `behavior` argument at all, letting the page's own CSS
 * `scroll-behavior` govern. **This is NOT an equivalent substitute for the
 * primary call** — without an explicit `behavior`, a page/container
 * declaring `scroll-behavior: smooth` makes the fallback scroll
 * ASYNCHRONOUS again, so the "after" rect below can be sampled before the
 * animation finishes, reopening the exact async-sampling defect M9 closed
 * (spec.md §C.1-㉑) on this narrower path. The fallback is an IMPROVEMENT
 * over throwing (it narrows the degraded surface from "every off-viewport
 * tap" to "old WebKit + a smooth-scrolling page/container"), not a fix of
 * equal strength — do not read the two branches as behaviorally identical.
 */
export function buildScrollIntoViewExpression(cssSelector: string, sourceIndex: number): string {
  return `(function(){
  var nodes = document.querySelectorAll(${JSON.stringify(cssSelector)});
  var el = nodes[${JSON.stringify(sourceIndex)}];
  if (!el) return { found: false, moved: false };
  var before = el.getBoundingClientRect();
  try {
    el.scrollIntoView({block: "center", behavior: "instant"});
  } catch (e) {
    el.scrollIntoView({block: "center"});
  }
  var after = el.getBoundingClientRect();
  var moved = before.top !== after.top || before.left !== after.left ||
    before.bottom !== after.bottom || before.right !== after.right;
  return { found: true, moved: moved };
})()`;
}

/** The shape {@link buildScrollIntoViewExpression} evaluates to on the page. */
interface ScrollIntoViewOutcome {
  found: boolean;
  moved: boolean;
}

/** Narrows an `evaluate<unknown>` result to {@link ScrollIntoViewOutcome}, defaulting to "nothing happened" otherwise. */
function readScrollIntoViewOutcome(value: unknown): ScrollIntoViewOutcome {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { found?: unknown }).found === "boolean" &&
    typeof (value as { moved?: unknown }).moved === "boolean"
  ) {
    return value as ScrollIntoViewOutcome;
  }
  return { found: false, moved: false };
}

/**
 * How the element was reached — reported to the caller so a fallback (or a
 * page-scrolling side effect) is never silent (REQ-WEB-ACT-002, REQ-GEST-WEB-002).
 * The `-scrolled` suffix marks that the page's scroll position ACTUALLY
 * CHANGED as a side effect (evidenced by a `window.scrollY` comparison,
 * SPEC-GESTURE-001 M6/0.4.0 amendment — F4) — not merely that
 * `scrollIntoView` was called on an existing node.
 */
interface Activation {
  method: "native" | "native-scrolled" | "js-click" | "js-click-scrolled";
  x?: number;
  y?: number;
}

/**
 * Taps the element's centre natively when its coordinate can be trusted.
 *
 * When it cannot (off-viewport), scrolls the element into view and
 * re-measures before retrying natively (REQ-GEST-WEB-001) — the pre-scroll
 * rectangle is stale by definition, so reusing it would tap the wrong place.
 * Falls back to the existing in-page `click()` only if the coordinate is
 * still unconvertible after that (REQ-GEST-WEB-003).
 *
 * Returns `null` when the page no longer has a node at that position.
 */
async function activateElement(
  ctx: WebContext,
  backend: DeviceBackend,
  css: string,
  entry: IndexedWebElement,
  index: number,
  viewport: ViewportMetrics,
): Promise<Activation | null> {
  const point = webRectToDevicePoint(entry.element.bounds, viewport);

  if (point !== null) {
    await backend.tap(ctx.serial, point.x, point.y);
    return { method: "native", x: point.x, y: point.y };
  }

  const scrollResult = await ctx.client.evaluate<unknown>(buildScrollIntoViewExpression(css, entry.sourceIndex));
  const { found, moved } = readScrollIntoViewOutcome(scrollResult);
  if (found) {
    const reEntry = await findWebElement(ctx, css, index);
    if (reEntry !== null) {
      const rePoint = webRectToDevicePoint(reEntry.element.bounds, viewport);
      if (rePoint !== null) {
        await backend.tap(ctx.serial, rePoint.x, rePoint.y);
        return { method: moved ? "native-scrolled" : "native", x: rePoint.x, y: rePoint.y };
      }
    }
  }

  const clicked = await ctx.client.evaluate<unknown>(buildClickExpression(css, entry.sourceIndex));
  if (clicked !== true) return null;
  return { method: moved ? "js-click-scrolled" : "js-click" };
}

/** Collects the selector's matches and returns the one at `index`, or `null`. */
async function findWebElement(ctx: WebContext, css: string, index: number): Promise<IndexedWebElement | null> {
  const collected = await ctx.client.evaluate<unknown>(buildCollectExpression(css));
  return normalizeWebDomIndexed(collected)[index] ?? null;
}

const NOT_FOUND_MESSAGE = "No visible element matched the given CSS selector.";

/**
 * Rejects `tap --web "<CSS>" <x> <y>` — a coordinate AND a CSS selector.
 *
 * Silently honouring one and dropping the other is the failure mode this
 * guards: the caller asked for two different targets and would be told the
 * command succeeded.
 *
 * **SPEC-VISION-001 M2**: the native-selector arm (`--id`/`--text`) is gone
 * with those flags, so only the coordinate arm remains. `text --web` can no
 * longer conflict at all — its sole positional IS the string to type — which
 * is why `runWebText` no longer calls this.
 */
function coordinateTargetConflict(command: string, args: ParsedCommandArgs): CommandError | null {
  if (args.positionals.length === 0) return null;

  return failure(
    command,
    "TARGET_CONFLICT",
    `${command} --web targets by CSS selector; it cannot be combined with coordinates.`,
  );
}

/** `tap --web "<CSS>"` — native tap by default, JS click when the coordinate cannot be trusted. */
export async function runWebTap(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  deps: WebRunDeps = defaultWebDeps(),
): Promise<CommandResult> {
  const conflict = coordinateTargetConflict("tap", args);
  if (conflict !== null) return conflict;

  const selector = readSelector("tap", args);
  if (!selector.ok) return selector.error;

  return runInWebSession("tap", args, backend, deps, async (ctx) => {
    const entry = await findWebElement(ctx, selector.css, selector.index);
    if (entry === null) {
      return failure("tap", "ELEMENT_NOT_FOUND", NOT_FOUND_MESSAGE, {
        selector: { css: selector.css, index: selector.index },
      });
    }

    const viewport = await resolveViewport(
      ctx.serial,
      ctx.client,
      (x, y) => backend.tap(ctx.serial, x, y),
      deps.store,
    );

    const activation = await activateElement(ctx, backend, selector.css, entry, selector.index, viewport);
    if (activation === null) {
      return failure("tap", "ELEMENT_NOT_FOUND", NOT_FOUND_MESSAGE, {
        selector: { css: selector.css, index: selector.index },
      });
    }

    return success("tap", {
      serial: ctx.serial,
      page: toPageSummary(ctx.page),
      selector: { css: selector.css, index: selector.index },
      tappable: entry.element.tappable,
      ...activation,
    });
  });
}

/** `text "<string>" --web "<CSS>"` — activate the element to focus it, then type through the normal input path. */
export async function runWebText(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  deps: WebRunDeps = defaultWebDeps(),
): Promise<CommandResult> {
  const text = args.positionals[0];
  if (text === undefined) {
    return failure("text", "MISSING_TEXT", 'text requires an input string: text "<...>" --web "<CSS>".');
  }

  const selector = readSelector("text", args);
  if (!selector.ok) return selector.error;

  return runInWebSession("text", args, backend, deps, async (ctx) => {
    const entry = await findWebElement(ctx, selector.css, selector.index);
    if (entry === null) {
      return failure("text", "ELEMENT_NOT_FOUND", NOT_FOUND_MESSAGE, {
        selector: { css: selector.css, index: selector.index },
      });
    }

    const viewport = await resolveViewport(
      ctx.serial,
      ctx.client,
      (x, y) => backend.tap(ctx.serial, x, y),
      deps.store,
    );

    // Activating focuses the field. A native tap also raises the soft
    // keyboard, which a programmatic `focus()` does not reliably do on iOS.
    const activation = await activateElement(ctx, backend, selector.css, entry, selector.index, viewport);
    if (activation === null) {
      return failure("text", "ELEMENT_NOT_FOUND", NOT_FOUND_MESSAGE, {
        selector: { css: selector.css, index: selector.index },
      });
    }

    await backend.inputText(ctx.serial, text, { hideKeyboardAfter: !args.keepKeyboard });

    return success("text", {
      serial: ctx.serial,
      page: toPageSummary(ctx.page),
      selector: { css: selector.css, index: selector.index },
      ...activation,
    });
  });
}
