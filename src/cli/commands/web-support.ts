/**
 * `--web` command wiring (REQ-WEB-ACT-001..005, REQ-WEB-CLI-001..003).
 *
 * `dump`, `tap`, and `text` each delegate here when `--web` is present. The
 * native path in those handlers is untouched, which is what keeps the
 * extension additive (REQ-WEB-CLI-001, AC-WEB-017).
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

import { buildCollectExpression, normalizeWebDom, normalizeWebDomIndexed } from "../../normalize/webdom.js";
import type { IndexedWebElement } from "../../normalize/webdom.js";
import { spawnProcess, type ProcessExecutor } from "../../backend/process-executor.js";
import type { DeviceBackend, DeviceInfo } from "../../schema/device-backend.js";
import { CalibrationStore, resolveViewport } from "../../webview/calibration.js";
import { webRectToDevicePoint, type ViewportMetrics } from "../../webview/coordinates.js";
import { connectWebInspector, type WebInspectorClient } from "../../webview/inspector-client.js";
import { openWebProxy, type OpenWebProxyOptions, type WebProxySession } from "../../webview/proxy-service.js";
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
}

/** Maps a thrown value to the envelope, preserving the error type's own `code` when it has one. */
function webFailure(command: string, err: unknown): CommandError {
  const code =
    typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : "WEB_SESSION_FAILED";
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

  let session: WebProxySession;
  try {
    session = await deps.openProxy({ exec: deps.exec });
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
    return await body({ serial: target.serial, client });
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

/** How the element was reached — reported to the caller so a fallback is never silent (REQ-WEB-ACT-002). */
interface Activation {
  method: "native" | "js-click";
  x?: number;
  y?: number;
}

/**
 * Taps the element's centre natively when its coordinate can be trusted,
 * and falls back to an in-page `click()` when it cannot (off-viewport).
 *
 * Returns `null` when the page no longer has a node at that position.
 */
async function activateElement(
  ctx: WebContext,
  backend: DeviceBackend,
  css: string,
  entry: IndexedWebElement,
  viewport: ViewportMetrics,
): Promise<Activation | null> {
  const point = webRectToDevicePoint(entry.element.bounds, viewport);

  if (point !== null) {
    await backend.tap(ctx.serial, point.x, point.y);
    return { method: "native", x: point.x, y: point.y };
  }

  const clicked = await ctx.client.evaluate<unknown>(buildClickExpression(css, entry.sourceIndex));
  return clicked === true ? { method: "js-click" } : null;
}

/** Collects the selector's matches and returns the one at `index`, or `null`. */
async function findWebElement(ctx: WebContext, css: string, index: number): Promise<IndexedWebElement | null> {
  const collected = await ctx.client.evaluate<unknown>(buildCollectExpression(css));
  return normalizeWebDomIndexed(collected)[index] ?? null;
}

const NOT_FOUND_MESSAGE = "No visible element matched the given CSS selector.";

/**
 * Rejects a command that mixes the web selector with a native target.
 *
 * Silently honouring one and dropping the other is the failure mode this
 * guards: the caller asked for two different elements and would be told the
 * command succeeded.
 */
function nativeTargetConflict(command: string, args: ParsedCommandArgs, includeCoordinates: boolean): CommandError | null {
  const hasCoordinates = includeCoordinates && args.positionals.length > 0;
  const hasNativeSelector = args.id !== undefined || args.selectorText !== undefined;
  if (!hasCoordinates && !hasNativeSelector) return null;

  return failure(
    command,
    "TARGET_CONFLICT",
    `${command} --web targets by CSS selector; it cannot be combined with ${includeCoordinates ? "coordinates or " : ""}--id/--text.`,
  );
}

/** `dump --web [<CSS>]` — the page's interactive surface, normalized. */
export async function runWebDump(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  deps: WebRunDeps = defaultWebDeps(),
): Promise<CommandResult> {
  const css = args.web !== undefined && args.web.length > 0 ? args.web : undefined;

  return runInWebSession("dump", args, backend, deps, async (ctx) => {
    const collected = await ctx.client.evaluate<unknown>(buildCollectExpression(css));
    return success("dump", { serial: ctx.serial, mode: "web", elements: normalizeWebDom(collected) });
  });
}

/** `tap --web "<CSS>"` — native tap by default, JS click when the coordinate cannot be trusted. */
export async function runWebTap(
  args: ParsedCommandArgs,
  backend: DeviceBackend,
  deps: WebRunDeps = defaultWebDeps(),
): Promise<CommandResult> {
  const conflict = nativeTargetConflict("tap", args, true);
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

    const activation = await activateElement(ctx, backend, selector.css, entry, viewport);
    if (activation === null) {
      return failure("tap", "ELEMENT_NOT_FOUND", NOT_FOUND_MESSAGE, {
        selector: { css: selector.css, index: selector.index },
      });
    }

    return success("tap", {
      serial: ctx.serial,
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

  const conflict = nativeTargetConflict("text", args, false);
  if (conflict !== null) return conflict;

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
    const activation = await activateElement(ctx, backend, selector.css, entry, viewport);
    if (activation === null) {
      return failure("text", "ELEMENT_NOT_FOUND", NOT_FOUND_MESSAGE, {
        selector: { css: selector.css, index: selector.index },
      });
    }

    await backend.inputText(ctx.serial, text, { hideKeyboardAfter: !args.keepKeyboard });

    return success("text", {
      serial: ctx.serial,
      selector: { css: selector.css, index: selector.index },
      ...activation,
    });
  });
}
