import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { audioPassthroughHeaders, parseByteRange, recordingStatusCallbackUrl } from "./twilio-recording";

describe("audioPassthroughHeaders", () => {
  it("forwards the Range trio and sets audio content type + no-store", () => {
    const upstream = new Headers({
      "accept-ranges": "bytes",
      "content-range": "bytes 0-999/38676",
      "content-length": "1000",
      "content-type": "audio/mpeg",
    });
    expect(audioPassthroughHeaders(upstream)).toEqual({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, no-store",
      "accept-ranges": "bytes",
      "content-range": "bytes 0-999/38676",
      "content-length": "1000",
    });
  });

  it("omits absent range headers instead of sending empty ones", () => {
    const out = audioPassthroughHeaders(new Headers({ "content-length": "42" }));
    expect(out).toEqual({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, no-store",
      "accept-ranges": "bytes",
      "content-length": "42",
    });
  });

  it("advertises byte ranges even when the upstream doesn't — the proxy serves them itself", () => {
    const out = audioPassthroughHeaders(new Headers({ "content-type": "audio/mpeg" }));
    expect(out["accept-ranges"]).toBe("bytes");
  });

  it("never leaks other upstream headers (Twilio ids, cookies…)", () => {
    const out = audioPassthroughHeaders(
      new Headers({
        "twilio-request-id": "RQxxx",
        "set-cookie": "secret=1",
        "x-shenanigans": "no",
      }),
    );
    expect(Object.keys(out).sort()).toEqual(["Cache-Control", "Content-Type", "accept-ranges"]);
  });
});

describe("parseByteRange", () => {
  const SIZE = 1000;

  it("parses the open-ended form a player sends when you drag the scrubber", () => {
    expect(parseByteRange("bytes=400-", SIZE)).toEqual({ start: 400, end: 999 });
  });

  it("parses an explicit window and clamps the end to the last byte", () => {
    expect(parseByteRange("bytes=100-199", SIZE)).toEqual({ start: 100, end: 199 });
    expect(parseByteRange("bytes=900-99999", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("parses the suffix form (last N bytes)", () => {
    expect(parseByteRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
    // A suffix longer than the file is the whole file, not a negative start.
    expect(parseByteRange("bytes=-99999", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("reports a start past the end as unsatisfiable, never as the whole file", () => {
    // Serving 200 + whole file here is exactly what makes a player jump back
    // to 0:00 — the bug this parser exists to prevent.
    expect(parseByteRange("bytes=1000-", SIZE)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=5000-6000", SIZE)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=500-400", SIZE)).toBe("unsatisfiable");
  });

  it("falls back to the whole file for absent, malformed or multi-range headers", () => {
    expect(parseByteRange(null, SIZE)).toBeNull();
    expect(parseByteRange("", SIZE)).toBeNull();
    expect(parseByteRange("bytes=abc-def", SIZE)).toBeNull();
    expect(parseByteRange("items=0-10", SIZE)).toBeNull();
    expect(parseByteRange("bytes=0-99,200-299", SIZE)).toBeNull(); // multipart is not ours to serve
    expect(parseByteRange("bytes=-", SIZE)).toBeNull();
  });

  it("is null-safe on an unknown size rather than emitting a bogus range", () => {
    expect(parseByteRange("bytes=0-99", 0)).toBeNull();
  });

  it("is case-insensitive about the unit", () => {
    expect(parseByteRange("Bytes=0-9", SIZE)).toEqual({ start: 0, end: 9 });
  });
});

describe("recordingStatusCallbackUrl", () => {
  const ENV_KEY = "NEXT_PUBLIC_APP_URL";
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[ENV_KEY];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it("uses the configured public base URL (trailing slash trimmed)", () => {
    process.env[ENV_KEY] = "https://example.com/";
    expect(recordingStatusCallbackUrl()).toBe("https://example.com/api/twilio/voice/recording-status");
  });

  it("falls back to the real domain when the env is localhost (Twilio can't reach it)", () => {
    process.env[ENV_KEY] = "http://localhost:3001";
    expect(recordingStatusCallbackUrl()).toBe(
      "https://feefreeordering.com/api/twilio/voice/recording-status",
    );
  });

  it("falls back to the real domain when the env is unset", () => {
    delete process.env[ENV_KEY];
    expect(recordingStatusCallbackUrl()).toBe(
      "https://feefreeordering.com/api/twilio/voice/recording-status",
    );
  });
});
