/**
 * M2 — WebKit Inspector protocol client (REQ-WEB-PROTO-001..004,
 * AC-WEB-005..008).
 *
 * Every test drives a mock socket: no proxy, no simulator, no network. The
 * protocol shapes asserted here are the ones observed on the wire during the
 * M1/spike sessions (progress.md §E.2, spec.md §C.1-②/③).
 */

import { describe, expect, it, vi } from "vitest";
import {
  WebInspectorConnectionError,
  WebInspectorEvaluationError,
  WebInspectorTimeoutError,
} from "./webkit-errors.js";
import { connectWebInspector, type InspectorSocket } from "./inspector-client.js";

/** Scriptable stand-in for a WebSocket, exposing the frames the client sent. */
class MockSocket implements InspectorSocket {
  readonly sent: string[] = [];
  closed = false;
  private messageCb: ((data: string) => void) | undefined;
  private errorCb: ((err: Error) => void) | undefined;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  onMessage(cb: (data: string) => void): void {
    this.messageCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }

  // --- test drivers ---
  emitRaw(data: string): void {
    this.messageCb?.(data);
  }

  emitError(err: Error): void {
    this.errorCb?.(err);
  }

  /** Emits the unprompted `Target.targetCreated` event the proxy sends after connect. */
  emitTargetCreated(targetId: string): void {
    this.emitRaw(JSON.stringify({ method: "Target.targetCreated", params: { targetInfo: { targetId } } }));
  }

  /** Emits a wrapped reply for the inner command with the given id. */
  emitReply(innerId: number, result: unknown, wasThrown = false): void {
    this.emitRaw(
      JSON.stringify({
        method: "Target.dispatchMessageFromTarget",
        params: { message: JSON.stringify({ id: innerId, result: { result, wasThrown } }) },
      }),
    );
  }

  /** The inner (unwrapped) command of the Nth frame the client sent. */
  innerCommand(n: number): { id: number; method: string; params: Record<string, unknown> } {
    const outer = JSON.parse(this.sent[n] ?? "{}") as { params?: { message?: string } };
    return JSON.parse(outer.params?.message ?? "{}") as {
      id: number;
      method: string;
      params: Record<string, unknown>;
    };
  }

  outerFrame(n: number): { method: string; params: { targetId: string; message: string } } {
    return JSON.parse(this.sent[n] ?? "{}") as {
      method: string;
      params: { targetId: string; message: string };
    };
  }
}

/** Connects a client against a freshly-scripted mock that reports `targetId`. */
async function connected(targetId = "page-12"): Promise<{ client: Awaited<ReturnType<typeof connectWebInspector>>; socket: MockSocket }> {
  const socket = new MockSocket();
  const pending = connectWebInspector("ws://localhost:9222/devtools/page/1", { factory: () => socket });
  socket.emitTargetCreated(targetId);
  return { client: await pending, socket };
}

describe("connectWebInspector", () => {
  it("takes the targetId from the Target.targetCreated event and uses that exact value", async () => {
    // A value deliberately unlike the spike's "page-1": hardcoding is the failure this guards.
    const { client, socket } = await connected("page-9987");
    client.evaluate("1").catch(() => undefined);
    expect(socket.outerFrame(0).params.targetId).toBe("page-9987");
    client.close();
  });

  it("rejects with a connection error when no target is announced in time", async () => {
    vi.useFakeTimers();
    try {
      const socket = new MockSocket();
      const pending = connectWebInspector("ws://x", { factory: () => socket, timeoutMs: 1000 });
      const assertion = expect(pending).rejects.toBeInstanceOf(WebInspectorConnectionError);
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
      expect(socket.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the socket itself errors", async () => {
    const socket = new MockSocket();
    const pending = connectWebInspector("ws://x", { factory: () => socket });
    const assertion = expect(pending).rejects.toBeInstanceOf(WebInspectorConnectionError);
    socket.emitError(new Error("ECONNREFUSED"));
    await assertion;
  });
});

describe("evaluate", () => {
  it("wraps the command in Target.sendMessageToTarget and never sends it bare", async () => {
    const { client, socket } = await connected();
    client.evaluate("document.title").catch(() => undefined);

    const outer = socket.outerFrame(0);
    expect(outer.method).toBe("Target.sendMessageToTarget");

    const inner = socket.innerCommand(0);
    expect(inner.method).toBe("Runtime.evaluate");
    expect(inner.params).toMatchObject({ expression: "document.title", returnByValue: true });

    // The bare command must not appear as a top-level frame: unwrapped commands
    // are rejected with "'<domain>' domain was not found" (spec.md §C.1-②).
    expect(socket.sent.every((f) => (JSON.parse(f) as { method: string }).method === "Target.sendMessageToTarget")).toBe(
      true,
    );
    client.close();
  });

  it("unwraps Target.dispatchMessageFromTarget and resolves the evaluated value", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate<string>("document.title");
    socket.emitReply(socket.innerCommand(0).id, { type: "string", value: "NAVER" });
    await expect(pending).resolves.toBe("NAVER");
    client.close();
  });

  it("resolves structured values returned by value", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate<{ w: number }>("({w:402})");
    socket.emitReply(socket.innerCommand(0).id, { type: "object", value: { w: 402 } });
    await expect(pending).resolves.toEqual({ w: 402 });
    client.close();
  });

  it("treats wasThrown as an error — WebKit uses it instead of CDP's exceptionDetails", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate("boom()");
    socket.emitReply(socket.innerCommand(0).id, { type: "object", description: "ReferenceError: boom" }, true);
    await expect(pending).rejects.toBeInstanceOf(WebInspectorEvaluationError);
    client.close();
  });

  it("times out and closes the connection instead of waiting forever", async () => {
    vi.useFakeTimers();
    try {
      const socket = new MockSocket();
      const pending = connectWebInspector("ws://x", { factory: () => socket, timeoutMs: 500 });
      socket.emitTargetCreated("page-1");
      const client = await pending;

      const evaluation = client.evaluate("neverAnswered()");
      const assertion = expect(evaluation).rejects.toBeInstanceOf(WebInspectorTimeoutError);
      await vi.advanceTimersByTimeAsync(501);
      await assertion;
      expect(socket.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("correlates concurrent evaluations by their own inner ids", async () => {
    const { client, socket } = await connected();
    const first = client.evaluate<string>("a");
    const second = client.evaluate<string>("b");

    // Reply out of order: the second command answers first.
    socket.emitReply(socket.innerCommand(1).id, { type: "string", value: "B" });
    socket.emitReply(socket.innerCommand(0).id, { type: "string", value: "A" });

    await expect(first).resolves.toBe("A");
    await expect(second).resolves.toBe("B");
    client.close();
  });

  it("ignores unparseable and unrelated frames rather than crashing", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate<string>("a");

    socket.emitRaw("<not json>");
    socket.emitRaw(JSON.stringify({ method: "Target.targetCreated", params: { targetInfo: { targetId: "other" } } }));
    socket.emitRaw(JSON.stringify({ method: "Some.unrelatedEvent", params: {} }));
    socket.emitReply(999, { type: "string", value: "wrong" });
    socket.emitReply(socket.innerCommand(0).id, { type: "string", value: "right" });

    await expect(pending).resolves.toBe("right");
    client.close();
  });

  it("ignores dispatch frames whose envelope is the wrong shape", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate<string>("a");

    socket.emitRaw(JSON.stringify({ method: "Target.dispatchMessageFromTarget", params: "not an object" }));
    socket.emitRaw(JSON.stringify({ method: "Target.dispatchMessageFromTarget", params: { message: 42 } }));
    socket.emitRaw(
      JSON.stringify({ method: "Target.dispatchMessageFromTarget", params: { message: "{not json}" } }),
    );
    socket.emitRaw(
      JSON.stringify({
        method: "Target.dispatchMessageFromTarget",
        params: { message: JSON.stringify({ id: "not-a-number", result: {} }) },
      }),
    );

    socket.emitReply(socket.innerCommand(0).id, { type: "string", value: "survived" });
    await expect(pending).resolves.toBe("survived");
    client.close();
  });

  it("rejects a reply that carries a protocol error instead of resolving it as empty", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate("a");
    socket.emitRaw(
      JSON.stringify({
        method: "Target.dispatchMessageFromTarget",
        params: {
          message: JSON.stringify({ id: 1, error: { message: "'Runtime' domain was not found" } }),
        },
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(WebInspectorEvaluationError);
    client.close();
  });

  it("rejects a reply that carries no result at all", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate("a");
    socket.emitRaw(
      JSON.stringify({
        method: "Target.dispatchMessageFromTarget",
        params: { message: JSON.stringify({ id: 1 }) },
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(WebInspectorEvaluationError);
    client.close();
  });

  it("keeps waiting when targetCreated announces a non-string id", async () => {
    vi.useFakeTimers();
    try {
      const socket = new MockSocket();
      const pending = connectWebInspector("ws://x", { factory: () => socket, timeoutMs: 300 });
      const assertion = expect(pending).rejects.toBeInstanceOf(WebInspectorConnectionError);
      socket.emitRaw(JSON.stringify({ method: "Target.targetCreated", params: { targetInfo: { targetId: 7 } } }));
      await vi.advanceTimersByTimeAsync(301);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a send failure instead of hanging on it", async () => {
    const socket = new MockSocket();
    const pending = connectWebInspector("ws://x", { factory: () => socket });
    socket.emitTargetCreated("page-1");
    const client = await pending;

    socket.send = () => {
      throw new Error("socket is closing");
    };
    await expect(client.evaluate("a")).rejects.toBeInstanceOf(WebInspectorConnectionError);
    client.close();
  });

  it("rejects a new evaluation attempted after close", async () => {
    const { client } = await connected();
    client.close();
    await expect(client.evaluate("a")).rejects.toBeInstanceOf(WebInspectorConnectionError);
  });

  it("surfaces a transport error to in-flight calls once attached", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate("a");
    socket.emitError(new Error("ECONNRESET"));
    await expect(pending).rejects.toBeInstanceOf(WebInspectorConnectionError);
    expect(socket.closed).toBe(true);
    client.close();
  });

  it("rejects in-flight evaluations when the client is closed", async () => {
    const { client, socket } = await connected();
    const pending = client.evaluate("slow()");
    client.close();
    await expect(pending).rejects.toBeInstanceOf(WebInspectorConnectionError);
    expect(socket.closed).toBe(true);
  });
});
