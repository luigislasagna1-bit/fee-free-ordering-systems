/**
 * services/nabil-voice/src/observability.ts — the import-free half of error
 * reporting: redaction (nothing that could carry speech leaves the process),
 * the pluggable sink (a no-op without Sentry), refractories, and the process
 * crash handlers. sentry.ts is deliberately NOT imported here (it loads the
 * real SDK); its wiring is verified by the Fly smoke.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureError,
  createRefractory,
  flushObservability,
  hasErrorSink,
  installProcessHandlers,
  redactDeep,
  redactEvent,
  redactString,
  setErrorSink,
} from "../../../services/nabil-voice/src/observability";

afterEach(() => setErrorSink(null));

describe("redactString", () => {
  it("masks NANP phone numbers in every common shape, keeping the last four", () => {
    expect(redactString("call me at 416 833 8405 please")).toBe("call me at ***-8405 please");
    expect(redactString("+1 (416) 833-8405")).toBe("***-8405");
    expect(redactString("4168338405")).toBe("***-8405");
  });
  it("masks long digit runs and the voice sentinel email, and hides email local parts", () => {
    expect(redactString("order 123456789 placed")).toBe("order [digits] placed");
    expect(redactString("123456 ok")).toBe("123456 ok");
    expect(redactString("voice.4168338405@voice.nabil.invalid")).toBe("voice.***@voice.nabil.invalid");
    expect(redactString("mail sam@example.com now")).toBe("mail ***@example.com now");
  });
});

describe("redactDeep", () => {
  it("drops values under speech/identity keys, masks strings elsewhere, keeps numbers, does not mutate", () => {
    const input = {
      transcript: [{ role: "user", text: "hello" }],
      deliveryAddress: "1050 Diefenbaker",
      customerName: "Roya",
      fromNumber: "+14168338405",
      phone: "289",
      status: 500,
      note: "call 416 833 8405",
      nested: { list: ["4168338405", 7], email: "a@b.com" },
    };
    const snapshot = JSON.stringify(input);
    const out = redactDeep(input) as any;
    expect(out.transcript).toBe("[dropped]");
    expect(out.deliveryAddress).toBe("[dropped]");
    expect(out.customerName).toBe("[dropped]");
    expect(out.fromNumber).toBe("[dropped]");
    expect(out.phone).toBe("[dropped]");
    expect(out.status).toBe(500);
    expect(out.note).toBe("call ***-8405");
    expect(out.nested.list).toEqual(["***-8405", 7]);
    expect(out.nested.email).toBe("[dropped]");
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it("caps recursion depth", () => {
    let deep: any = "x";
    for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(() => redactDeep(deep)).not.toThrow();
    expect(JSON.stringify(redactDeep(deep))).toContain("[redacted-depth]");
  });
});

describe("redactEvent (Sentry beforeSend)", () => {
  it("scrubs message + exception values + extra + breadcrumbs + request, drops user, keeps tags/release/stack frames", () => {
    const event = {
      event_id: "e1",
      release: "nabil-voice@abc",
      message: "failed for 4168338405",
      tags: { callSid: "CA1", where: "tool" },
      user: { id: "u1", ip_address: "1.2.3.4" },
      exception: {
        values: [
          {
            type: "Error",
            value: "GET /returning-caller?phone=4168338405 -> 500",
            stacktrace: { frames: [{ filename: "session.ts", lineno: 12 }] },
          },
        ],
      },
      extra: { transcript: "hello there", status: 500 },
      breadcrumbs: [{ message: "dial 4168338405" }],
      request: { url: "https://x/y?phone=4168338405" },
    };
    const out = redactEvent(event) as any;
    expect(out.event_id).toBe("e1");
    expect(out.release).toBe("nabil-voice@abc");
    expect(out.tags).toEqual({ callSid: "CA1", where: "tool" });
    expect(out.user).toBeUndefined();
    expect(out.message).toBe("failed for ***-8405");
    expect(out.exception.values[0].value).toBe("GET /returning-caller?phone=***-8405 -> 500");
    expect(out.exception.values[0].stacktrace).toEqual({ frames: [{ filename: "session.ts", lineno: 12 }] });
    expect(out.extra).toEqual({ transcript: "[dropped]", status: 500 });
    expect(out.breadcrumbs).toEqual([{ message: "dial ***-8405" }]);
    expect(out.request.url).toBe("https://x/y?phone=***-8405");
  });
});

describe("captureError / sink / flush", () => {
  it("is a no-op without a sink and never throws even if the sink does", () => {
    expect(hasErrorSink()).toBe(false);
    expect(() => captureError(new Error("x"), { where: "t" })).not.toThrow();
    setErrorSink({
      capture: () => {
        throw new Error("sink broke");
      },
      flush: async () => true,
    });
    expect(hasErrorSink()).toBe(true);
    expect(() => captureError(new Error("x"), { where: "t" })).not.toThrow();
  });
  it("forwards err + ctx to the sink; flush resolves even when the sink hangs", async () => {
    const capture = vi.fn();
    setErrorSink({ capture, flush: () => new Promise(() => undefined) });
    const err = new Error("boom");
    captureError(err, { where: "tool", callSid: "CA1" });
    expect(capture).toHaveBeenCalledWith(err, { where: "tool", callSid: "CA1" });
    await expect(flushObservability(20)).resolves.toBeUndefined();
  });
});

describe("createRefractory", () => {
  it("fires, then not inside the window, then again after it; reset re-arms", () => {
    let t = 1000;
    const r = createRefractory(100, () => t);
    expect(r.fire()).toBe(true);
    t = 1050;
    expect(r.fire()).toBe(false);
    t = 1101;
    expect(r.fire()).toBe(true);
    r.reset();
    expect(r.fire()).toBe(true);
  });
});

describe("installProcessHandlers", () => {
  it("uncaughtException → captured, flushed, exit(1); unhandledRejection → captured only, no exit", async () => {
    const listeners: Record<string, (...a: any[]) => void> = {};
    const proc = { on: (evt: string, l: (...a: any[]) => void) => (listeners[evt] = l) };
    const exit = vi.fn();
    const log = vi.fn();
    const capture = vi.fn();
    setErrorSink({ capture, flush: async () => true });
    installProcessHandlers({ proc, exit, log, flushMs: 10 });

    listeners.unhandledRejection(new Error("stray"));
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { where: "process.unhandledRejection" });
    expect(exit).not.toHaveBeenCalled();

    listeners.uncaughtException(new Error("fatal"));
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { where: "process.uncaughtException" });
    await new Promise((r) => setTimeout(r, 30));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("the module's import graph", () => {
  it("imports nothing — session.ts/tools.ts/fallback.ts import THIS file, and they must never pay for @sentry/node", () => {
    const src = readFileSync(new URL("../../../services/nabil-voice/src/observability.ts", import.meta.url), "utf8");
    const imports = src.match(/^\s*import\s.+$/gm) ?? [];
    expect(imports).toEqual([]);
  });
});
