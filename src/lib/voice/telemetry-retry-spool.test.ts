/**
 * A3 — durable telemetry: bounded retry (services/nabil-voice/src/retry.ts),
 * the process-level spool (telemetry-spool.ts) and the ack-based event sink
 * (events.ts). 2026-08-21: one 8 s POST with no retry lost a $69 placed order
 * (logged `error`) and turned a lunch-hour setup death into a 0 s "abandoned".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRetryableStatus, postWithRetry, type PostResult } from "../../../services/nabil-voice/src/retry";
import { MAX_ATTEMPTS, MAX_ENTRIES, _resetSpool, drainSpool, pumpSpool, spoolSize, spoolStats, spoolTelemetry } from "../../../services/nabil-voice/src/telemetry-spool";
import { createEventSink } from "../../../services/nabil-voice/src/events";

const ok: PostResult = { ok: true, status: 200, json: { ok: true } };
const res = (status: number): PostResult => ({ ok: status < 400, status, json: {} });
const noSleep = async () => undefined;

describe("postWithRetry", () => {
  it("returns at once on success — no extra calls", async () => {
    const post = vi.fn().mockResolvedValue(ok);
    const r = await postWithRetry(post, "/x", { a: 1 }, { sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/x", { a: 1 }, undefined);
  });

  it("retries a 5xx / a thrown timeout and returns the eventual success with the attempt count", async () => {
    const post = vi.fn().mockResolvedValueOnce(res(503)).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(ok);
    const sleeps: number[] = [];
    const r = await postWithRetry(post, "/x", {}, { attempts: 3, backoffMs: [10, 20], sleep: async (ms) => void sleeps.push(ms) });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it("a 4xx is a contract bug — returned immediately, never retried", async () => {
    const post = vi.fn().mockResolvedValue(res(400));
    const r = await postWithRetry(post, "/x", {}, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("gives up after `attempts`, reporting the last error, without throwing", async () => {
    const post = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const r = await postWithRetry(post, "/x", {}, { attempts: 3, sleep: noSleep });
    expect(r).toMatchObject({ ok: false, status: 0, attempts: 3, error: "ECONNRESET" });
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("retryable = no response, 408, 429, 5xx", () => {
    expect([0, 408, 429, 500, 502, 503].every(isRetryableStatus)).toBe(true);
    expect([200, 400, 401, 403, 404, 409].some(isRetryableStatus)).toBe(false);
  });
});

describe("telemetry spool", () => {
  beforeEach(() => _resetSpool());

  it("a spooled payload is delivered on the next pump and removed", async () => {
    spoolTelemetry("end", "CA1", "/api/internal/voice/call-log", { event: "end", callSid: "CA1" }, 1000);
    expect(spoolSize()).toBe(1);
    const post = vi.fn().mockResolvedValue(ok);
    const r = await pumpSpool(post, 1000);
    expect(post).toHaveBeenCalledWith("/api/internal/voice/call-log", { event: "end", callSid: "CA1" }, 15_000);
    expect(r).toEqual({ sent: 1, failed: 0, remaining: 0 });
  });

  it("a transient failure backs off exponentially and is retried only when due", async () => {
    spoolTelemetry("end", "CA1", "/p", {}, 0);
    const post = vi.fn().mockResolvedValue(res(503));
    expect(await pumpSpool(post, 0)).toEqual({ sent: 0, failed: 1, remaining: 1 });
    // Not due yet (30 s after the first failure).
    expect(await pumpSpool(post, 10_000)).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect(post).toHaveBeenCalledTimes(1);
    // Due at +30 s; second failure → next at +60 s.
    expect(await pumpSpool(post, 30_000)).toEqual({ sent: 0, failed: 1, remaining: 1 });
    expect(await pumpSpool(post, 60_000)).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect(await pumpSpool(post, 90_000)).toEqual({ sent: 0, failed: 1, remaining: 1 });
    post.mockResolvedValue(ok);
    expect(await pumpSpool(post, 10 * 60_000)).toEqual({ sent: 1, failed: 0, remaining: 0 });
  });

  it("a 4xx is dropped for good (retrying a contract error cannot help)", async () => {
    spoolTelemetry("end", "CA1", "/p", {}, 0);
    const post = vi.fn().mockResolvedValue(res(400));
    expect(await pumpSpool(post, 0)).toEqual({ sent: 0, failed: 0, remaining: 0 });
  });

  it("gives up after MAX_ATTEMPTS transient failures and counts it", async () => {
    spoolTelemetry("end", "CA1", "/p", {}, 0);
    const post = vi.fn().mockResolvedValue(res(502));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await pumpSpool(post, 0, true);
    expect(spoolSize()).toBe(0);
    expect(spoolStats().droppedForAttempts).toBe(1);
  });

  it("is bounded: the oldest payload is dropped past MAX_ENTRIES", () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) spoolTelemetry("end", `CA${i}`, "/p", { i }, 0);
    expect(spoolSize()).toBe(MAX_ENTRIES);
    expect(spoolStats().droppedForCapacity).toBe(5);
  });

  it("drainSpool sends everything regardless of backoff, bounded by its budget", async () => {
    spoolTelemetry("end", "CA1", "/p", {}, 0);
    spoolTelemetry("events", "CA2", "/p", {}, 0);
    const post = vi.fn().mockResolvedValue(res(500));
    await pumpSpool(post, 0); // both now backed off 30 s
    post.mockResolvedValue(ok);
    expect(await drainSpool(post, 5000)).toEqual({ sent: 2, failed: 0, remaining: 0 });
    expect(await drainSpool(post, 5000)).toEqual({ sent: 0, failed: 0, remaining: 0 });
  });
});

describe("event sink peek/ack", () => {
  it("peek leaves events in place; ack removes only what landed; drain still empties", () => {
    let t = 0;
    const sink = createEventSink(() => ++t);
    sink.emit({ type: "error", turn: 0, where: "x", message: "a" } as never);
    sink.emit({ type: "error", turn: 0, where: "x", message: "b" } as never);
    sink.emit({ type: "error", turn: 0, where: "x", message: "c" } as never);
    const first = sink.peek();
    expect(first.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(sink.size()).toBe(3);
    sink.ack(2);
    expect(sink.peek().map((e) => e.seq)).toEqual([3]);
    sink.ack(1); // stale ack — nothing to remove
    expect(sink.size()).toBe(1);
    expect(sink.drain().map((e) => e.seq)).toEqual([3]);
    expect(sink.size()).toBe(0);
  });
});
