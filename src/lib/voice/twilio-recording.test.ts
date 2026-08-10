import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { audioPassthroughHeaders, recordingStatusCallbackUrl } from "./twilio-recording";

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
      "content-length": "42",
    });
  });

  it("never leaks other upstream headers (Twilio ids, cookies…)", () => {
    const out = audioPassthroughHeaders(
      new Headers({
        "twilio-request-id": "RQxxx",
        "set-cookie": "secret=1",
        "x-shenanigans": "no",
      }),
    );
    expect(Object.keys(out).sort()).toEqual(["Cache-Control", "Content-Type"]);
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
