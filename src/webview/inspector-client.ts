/**
 * WebKit Inspector protocol client (REQ-WEB-PROTO-001..004).
 *
 * This is NOT the Chrome DevTools Protocol. Sending `Runtime.evaluate`,
 * `DOM.getDocument` or `Page.enable` directly is rejected with
 * `'<domain>' domain was not found` (spec.md §C.1-②). Every command must be
 * wrapped in `Target.sendMessageToTarget`, and its reply arrives inside a
 * `Target.dispatchMessageFromTarget` event.
 *
 *   out:  {"id":1,"method":"Target.sendMessageToTarget",
 *          "params":{"targetId":"<announced id>","message":"<inner command JSON>"}}
 *   in:   {"method":"Target.dispatchMessageFromTarget",
 *          "params":{"message":"<inner reply JSON>"}}
 *
 * @MX:ANCHOR — the wrapping contract above is the load-bearing invariant of
 * the whole web path; `dump --web` / `tap --web` / `text --web` all reach the
 * page through this one client.
 * @MX:REASON — unwrapping or bypassing it does not degrade gracefully, it
 * fails outright with a domain-not-found error that reads like a missing
 * feature rather than a malformed frame.
 *
 * The transport is Node's built-in `WebSocket` (Node 22.4+, hence the
 * `engines` floor) — no dependency is added for it. `InspectorSocket` exists
 * so tests can drive the protocol with no proxy, socket, or simulator.
 */

import {
  WebInspectorConnectionError,
  WebInspectorEvaluationError,
  WebInspectorTimeoutError,
} from "./webkit-errors.js";

/** Minimal transport surface the client needs; `WebSocket` is one implementation, a test mock another. */
export interface InspectorSocket {
  send(data: string): void;
  close(): void;
  onMessage(cb: (data: string) => void): void;
  onError(cb: (err: Error) => void): void;
}

export type InspectorSocketFactory = (url: string) => InspectorSocket;

export interface ConnectOptions {
  /** Transport factory. Defaults to Node's built-in `WebSocket`. */
  factory?: InspectorSocketFactory;
  /** Applies both to announcing a target and to each individual command. */
  timeoutMs?: number;
}

export interface WebInspectorClient {
  /** The target this client is attached to, as announced by the proxy — never a hardcoded value. */
  readonly targetId: string;
  /** Evaluates `expression` in the page and resolves its value (`returnByValue`). */
  evaluate<T>(expression: string): Promise<T>;
  /** Tears down the connection, rejecting anything still in flight. */
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses one wire frame, returning `null` for anything that is not a JSON
 * object. Discarding these is protocol filtering, not error swallowing: the
 * proxy multiplexes frames for events we never subscribed to, and a frame we
 * cannot read is not evidence that the command we are waiting on failed —
 * that case is covered by the per-command timeout.
 */
function parseFrame(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Extracts the targetId from a `Target.targetCreated` event, or `null` if this frame is not one. */
function readAnnouncedTargetId(frame: Record<string, unknown>): string | null {
  if (frame.method !== "Target.targetCreated") return null;
  if (!isRecord(frame.params)) return null;
  const info = frame.params.targetInfo;
  if (!isRecord(info)) return null;
  return typeof info.targetId === "string" ? info.targetId : null;
}

/** Best-effort human-readable text for a thrown/errored protocol result. */
function describeFailure(value: unknown): string {
  if (isRecord(value)) {
    if (typeof value.description === "string") return value.description;
    if (typeof value.message === "string") return value.message;
    if (typeof value.value === "string") return value.value;
  }
  return JSON.stringify(value) ?? "unknown error";
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The live client plus the two hooks `connectWebInspector` wires into the socket. */
interface ClientBundle {
  client: WebInspectorClient;
  dispatch: (frame: Record<string, unknown>) => void;
  failTransport: (err: Error) => void;
}

function createClient(socket: InspectorSocket, targetId: string, timeoutMs: number): ClientBundle {
  const pending = new Map<number, PendingCall>();
  let nextInnerId = 1;
  let nextOuterId = 1;
  let closed = false;

  function rejectAllPending(err: Error): void {
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(err);
    }
    pending.clear();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    rejectAllPending(new WebInspectorConnectionError(`Inspector connection to target ${targetId} was closed.`));
    socket.close();
  }

  function call(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (closed) {
      return Promise.reject(
        new WebInspectorConnectionError(`Inspector connection to target ${targetId} is already closed.`),
      );
    }

    const innerId = nextInnerId++;
    const message = JSON.stringify({ id: innerId, method, params });

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(innerId);
        reject(new WebInspectorTimeoutError(`${method} received no reply within ${timeoutMs}ms.`));
        close();
      }, timeoutMs);

      pending.set(innerId, { resolve, reject, timer });

      try {
        socket.send(
          JSON.stringify({
            id: nextOuterId++,
            method: "Target.sendMessageToTarget",
            params: { targetId, message },
          }),
        );
      } catch (err) {
        pending.delete(innerId);
        clearTimeout(timer);
        reject(
          new WebInspectorConnectionError(
            `Failed to send ${method}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  function dispatch(frame: Record<string, unknown>): void {
    if (frame.method !== "Target.dispatchMessageFromTarget") return;
    if (!isRecord(frame.params)) return;
    if (typeof frame.params.message !== "string") return;

    const reply = parseFrame(frame.params.message);
    if (reply === null || typeof reply.id !== "number") return;

    const call = pending.get(reply.id);
    if (call === undefined) return;
    pending.delete(reply.id);
    clearTimeout(call.timer);

    // A protocol-level rejection (bad method, detached target) arrives as
    // `error` rather than as a thrown page value; without this branch it
    // would resolve as `undefined` and read like an empty page.
    if (isRecord(reply.error)) {
      call.reject(new WebInspectorEvaluationError(`Inspector rejected the command: ${describeFailure(reply.error)}`));
      return;
    }

    if (!isRecord(reply.result)) {
      call.reject(new WebInspectorEvaluationError("Inspector reply carried no result."));
      return;
    }

    if (reply.result.wasThrown === true) {
      call.reject(new WebInspectorEvaluationError(`Page threw during evaluation: ${describeFailure(reply.result.result)}`));
      return;
    }

    call.resolve(isRecord(reply.result.result) ? reply.result.result.value : undefined);
  }

  const client: WebInspectorClient = {
    targetId,
    evaluate<T>(expression: string): Promise<T> {
      return call("Runtime.evaluate", { expression, returnByValue: true }) as Promise<T>;
    },
    close,
  };

  return {
    client,
    dispatch,
    failTransport: (err: Error) => {
      if (closed) return;
      closed = true;
      rejectAllPending(new WebInspectorConnectionError(`Inspector transport failed: ${err.message}`));
      socket.close();
    },
  };
}

/** Node's built-in `WebSocket` adapted to {@link InspectorSocket}. */
export const nativeWebSocketFactory: InspectorSocketFactory = (url: string): InspectorSocket => {
  const ws = new WebSocket(url);
  return {
    send: (data: string) => ws.send(data),
    close: () => ws.close(),
    onMessage: (cb) => {
      ws.addEventListener("message", (event: MessageEvent) => {
        cb(typeof event.data === "string" ? event.data : String(event.data));
      });
    },
    onError: (cb) => {
      ws.addEventListener("error", () => cb(new Error(`WebSocket transport error on ${url}`)));
    },
  };
};

/**
 * Opens an inspector connection and waits for the proxy to announce a page
 * target (REQ-WEB-PROTO-002).
 *
 * The targetId is read from the `Target.targetCreated` event and never
 * assumed: it changes between sessions (the spike observed `page-1`, a later
 * session on the same simulator and page observed `page-12`), so a hardcoded
 * value silently addresses a target that no longer exists.
 *
 * When more than one target is announced, the first wins — a deliberate
 * single-page scope for this SPEC (plan.md §B.2); "no page at all" is caught
 * upstream by the proxy layer's `NO_WEB_PAGE` check (REQ-WEB-PROXY-004).
 */
export function connectWebInspector(url: string, options: ConnectOptions = {}): Promise<WebInspectorClient> {
  const factory = options.factory ?? nativeWebSocketFactory;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const socket = factory(url);

  return new Promise<WebInspectorClient>((resolve, reject) => {
    let bundle: ClientBundle | undefined;
    let attached = false;

    const timer = setTimeout(() => {
      if (attached) return;
      attached = true;
      socket.close();
      reject(new WebInspectorConnectionError(`No page target was announced within ${timeoutMs}ms at ${url}.`));
    }, timeoutMs);

    socket.onError((err) => {
      if (attached) {
        bundle?.failTransport(err);
        return;
      }
      attached = true;
      clearTimeout(timer);
      socket.close();
      reject(new WebInspectorConnectionError(`Could not reach the inspector at ${url}: ${err.message}`));
    });

    socket.onMessage((data) => {
      const frame = parseFrame(data);
      if (frame === null) return;

      if (!attached) {
        const announced = readAnnouncedTargetId(frame);
        if (announced === null) return;
        attached = true;
        clearTimeout(timer);
        bundle = createClient(socket, announced, timeoutMs);
        resolve(bundle.client);
        return;
      }

      bundle?.dispatch(frame);
    });
  });
}
