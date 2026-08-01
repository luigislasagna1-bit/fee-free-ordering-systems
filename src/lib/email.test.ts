/**
 * The not-sent paths of the email transport must NEVER report success.
 *
 * Incident 2026-08-01: send() returned { success: true } from both the
 * "[Email placeholder]" path (no transport outside prod) and the dev
 * suppression path (ALLOW_DEV_EMAIL unset), so a credit-transfer run stamped
 * emailSentAt on 15 gift emails that never left. These tests pin the contract:
 * success: true means Resend accepted the email — every other outcome is
 * { success: false }, with suppressed: true marking intentional dev silence.
 *
 * Neither path reaches the Resend API, so no network is involved: the
 * placeholder path never constructs a client, and the suppression path
 * returns before client.emails.send().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// No DB in tests — getTransport's PlatformSettings lookup throws and is
// swallowed by its try/catch, leaving only the env-var key (which we control).
vi.mock("@/lib/db", () => ({ default: {} }));

import { sendEmailSettingsTest, resetEmailTransport } from "@/lib/email";

describe("email transport not-sent paths report failure", () => {
  beforeEach(() => {
    // The transport caches its client for 60s — clear between tests so each
    // env stub builds its own.
    resetEmailTransport();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEmailTransport();
  });

  it("no transport outside prod (placeholder path) → success:false + suppressed", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ALLOW_DEV_EMAIL", "");
    const res = await sendEmailSettingsTest({ to: "nobody@example.com" });
    expect(res.success).toBe(false);
    expect(res.suppressed).toBe(true);
    expect(res.error).toBeTruthy();
  });

  it("dev suppression with a working transport → success:false + suppressed", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_never_called");
    vi.stubEnv("ALLOW_DEV_EMAIL", "");
    const res = await sendEmailSettingsTest({ to: "nobody@example.com" });
    expect(res.success).toBe(false);
    expect(res.suppressed).toBe(true);
    expect(res.error).toContain("ALLOW_DEV_EMAIL");
  });
});
