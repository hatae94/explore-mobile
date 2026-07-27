/**
 * Distinct error types thrown by the WebKit Inspector client, mirroring the
 * `idb-errors.ts` / `ime-errors.ts` pattern: a `code` property lets a caller
 * `instanceof`-check and surface a dedicated JSON error code instead of a
 * generic failure message.
 */

/**
 * Thrown when the inspector connection cannot be established, errors at the
 * transport level, or is torn down while calls are still in flight.
 *
 * @MX:NOTE — "connected to the proxy" and "attached to a page target" are
 * different things: the proxy accepts the socket and only then announces a
 * target. A socket that opens but never announces one is this error, not a
 * timeout of an individual command.
 */
export class WebInspectorConnectionError extends Error {
  public readonly code = "WEB_INSPECTOR_UNREACHABLE";

  constructor(message: string) {
    super(message);
    this.name = "WebInspectorConnectionError";
  }
}

/**
 * Thrown when an evaluation completes but the page reported a thrown value.
 *
 * @MX:WARN — WebKit signals this with `wasThrown: true`, NOT with CDP's
 * `exceptionDetails` field (spec.md §C.1-③).
 * @MX:REASON — code written against Chrome DevTools Protocol looks for
 * `exceptionDetails`, finds nothing, and reports a thrown error as success.
 * That silent-success path is exactly what this error type exists to close.
 */
export class WebInspectorEvaluationError extends Error {
  public readonly code = "WEB_EVAL_THREW";

  constructor(message: string) {
    super(message);
    this.name = "WebInspectorEvaluationError";
  }
}

/** Thrown when a command receives no reply within the configured window; the connection is torn down with it. */
export class WebInspectorTimeoutError extends Error {
  public readonly code = "WEB_INSPECTOR_TIMEOUT";

  constructor(message: string) {
    super(message);
    this.name = "WebInspectorTimeoutError";
  }
}

/**
 * Thrown when `ios_webkit_debug_proxy` is not on PATH (REQ-WEB-PROXY-003).
 * A graceful refusal carrying install guidance — never a crash.
 */
export class IwdpNotInstalledError extends Error {
  public readonly code = "IWDP_NOT_INSTALLED";

  constructor(message: string) {
    super(message);
    this.name = "IwdpNotInstalledError";
  }
}

/**
 * Thrown when there is no debuggable web page to attach to
 * (REQ-WEB-PROXY-004) — either no simulator is exposing a Web Inspector
 * socket, or one is but has no page open.
 *
 * @MX:NOTE — both causes share this code deliberately (the SPEC defines no
 * separate one), so the `message` is what distinguishes them. Keep it
 * specific enough to act on.
 */
export class NoWebPageError extends Error {
  public readonly code = "NO_WEB_PAGE";

  constructor(message: string) {
    super(message);
    this.name = "NoWebPageError";
  }
}

/** One debuggable page, as listed for the caller to choose from. */
export interface WebPageSummary {
  index: number;
  title: string;
  url: string;
}

/**
 * Thrown when several pages are debuggable and none was chosen
 * (REQ-WEB-PROXY-005, 0.2.0 amendment).
 *
 * @MX:WARN — do NOT replace this with a heuristic that picks one.
 * @MX:REASON — 0.1.0 took the first page, and one link tap was enough to
 * make the first page a stale target that was no longer on screen: every
 * later `--web` command then read and tapped a page the user could not see,
 * with no error. The proxy does not report which target is frontmost, so
 * any guess can be silently wrong; refusing with the list is the same
 * contract `AMBIGUOUS_DEVICE` already uses for multiple devices.
 */
export class AmbiguousWebPageError extends Error {
  public readonly code = "AMBIGUOUS_PAGE";

  constructor(
    message: string,
    public readonly pages: WebPageSummary[],
  ) {
    super(message);
    this.name = "AmbiguousWebPageError";
  }
}
