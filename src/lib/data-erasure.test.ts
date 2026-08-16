/**
 * PII_ERASURE_MAP is documentation-as-code for the whole customer-PII surface,
 * and anonymizeCustomerByEmail is the ONE erasure path. These tests pin the
 * Nabil AI event log (VoiceCallEvent, 2026-08-15) into that path: the map
 * lists it, the transaction deletes it, and it does so BEFORE the VoiceCall
 * scrub nulls the fromDigits key the delete depends on. VoiceMenuSnapshot is
 * asserted ABSENT — it holds a menu, not a person.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, calls } = vi.hoisted(() => {
  const calls: string[] = [];
  const rec = (name: string, result: unknown) =>
    vi.fn(async () => {
      calls.push(name);
      return result;
    });
  const prismaMock: any = {
    customer: { findMany: vi.fn(async () => [{ id: "cust_1", phone: "(416) 833-8405", stripeCustomerId: null }]), updateMany: rec("customer.updateMany", { count: 1 }) },
    order: { findMany: vi.fn(async () => []), updateMany: rec("order.updateMany", { count: 0 }) },
    rewardAccount: { findMany: vi.fn(async () => []) },
    voiceCall: {
      findMany: vi.fn(async () => []),
      updateMany: rec("voiceCall.updateMany", { count: 2 }),
    },
    voiceCallEvent: { deleteMany: rec("voiceCallEvent.deleteMany", { count: 57 }) },
    voiceCallReport: { updateMany: rec("voiceCallReport.updateMany", { count: 3 }) },
    voiceCallReportComment: { updateMany: rec("voiceCallReportComment.updateMany", { count: 5 }) },
    restaurantCustomerAddress: { deleteMany: rec("rca.deleteMany", { count: 0 }) },
    customerPushToken: { deleteMany: rec("cpt.deleteMany", { count: 0 }) },
    giftWalletPass: { updateMany: rec("gwp.updateMany", { count: 0 }) },
    rewardLedger: { updateMany: rec("rl.updateMany", { count: 0 }) },
    orderItem: { updateMany: rec("oi.updateMany", { count: 0 }) },
    orderRating: { updateMany: rec("or.updateMany", { count: 0 }) },
    reservation: { updateMany: rec("reservation.updateMany", { count: 0 }) },
    pendingRewardGrant: { updateMany: rec("prg.updateMany", { count: 0 }) },
    dataRequestLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(prismaMock)),
  };
  return { prismaMock, calls };
});

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/stripe", () => ({ getRestaurantStripe: vi.fn(async () => null) }));
vi.mock("@/lib/suppression", () => ({ suppressEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/voice/twilio-recording", () => ({ deleteRecording: vi.fn(async () => true) }));

import { PII_ERASURE_MAP, REDACTED_REPORT_TEXT, anonymizeCustomerByEmail } from "./data-erasure";

beforeEach(() => {
  calls.length = 0;
});

describe("PII_ERASURE_MAP", () => {
  it("lists the Nabil event log as DELETED and leaves the menu snapshot out", () => {
    expect(PII_ERASURE_MAP.VoiceCallEvent).toEqual({ scope: "restaurant", action: "delete", fields: ["payload"] });
    expect(PII_ERASURE_MAP.VoiceCall.action).toBe("anonymize");
    expect((PII_ERASURE_MAP as Record<string, unknown>).VoiceMenuSnapshot).toBeUndefined();
  });
});

describe("anonymizeCustomerByEmail → VoiceCallReport (Report this call, 2026-08-16)", () => {
  it("scrubs the report text + notes via the parent call's fromDigits, BEFORE the VoiceCall scrub nulls that key, and keeps the rows", async () => {
    const r = await anonymizeCustomerByEmail("rest_1", "Luigi@Example.com");

    const rep = prismaMock.voiceCallReport.updateMany.mock.calls[0][0];
    expect(rep.where).toEqual({ restaurantId: "rest_1", call: { fromDigits: { in: ["4168338405"] } } });
    expect(rep.data).toEqual({ description: REDACTED_REPORT_TEXT, resolution: null });
    const com = prismaMock.voiceCallReportComment.updateMany.mock.calls[0][0];
    expect(com.where).toEqual({ report: { restaurantId: "rest_1", call: { fromDigits: { in: ["4168338405"] } } } });
    expect(com.data).toEqual({ body: REDACTED_REPORT_TEXT });

    const iScrub = calls.indexOf("voiceCall.updateMany");
    expect(calls.indexOf("voiceCallReport.updateMany")).toBeLessThan(iScrub);
    expect(calls.indexOf("voiceCallReportComment.updateMany")).toBeLessThan(iScrub);
    expect(r.counts.VoiceCallReport).toBe(3);
    expect(r.counts.VoiceCallReportComment).toBe(5);
  });

  it("is registered in PII_ERASURE_MAP as anonymize (not delete): the platform keeps its defect history, the caller's words go", () => {
    expect(PII_ERASURE_MAP.VoiceCallReport.action).toBe("anonymize");
    expect(PII_ERASURE_MAP.VoiceCallReport.fields).toEqual(["description", "resolution"]);
    expect(PII_ERASURE_MAP.VoiceCallReportComment.action).toBe("anonymize");
    expect(PII_ERASURE_MAP.VoiceCallReportComment.fields).toEqual(["body"]);
  });
});

describe("anonymizeCustomerByEmail → VoiceCallEvent", () => {
  it("deletes the caller's events via the parent call's fromDigits, BEFORE the VoiceCall scrub nulls that key", async () => {
    const r = await anonymizeCustomerByEmail("rest_1", "Luigi@Example.com");

    const del = prismaMock.voiceCallEvent.deleteMany.mock.calls[0][0];
    // Matched through the relation on the NORMALIZED key (bare digits, NANP 1 dropped).
    expect(del).toEqual({ where: { call: { restaurantId: "rest_1", fromDigits: { in: ["4168338405"] } } } });

    const iDel = calls.indexOf("voiceCallEvent.deleteMany");
    const iScrub = calls.indexOf("voiceCall.updateMany");
    expect(iDel).toBeGreaterThanOrEqual(0);
    expect(iScrub).toBeGreaterThan(iDel);

    expect(r.counts.VoiceCallEvent).toBe(57);
    expect(r.counts.VoiceCall).toBe(2);
  });

  it("skips the voice tables entirely when the person has no phone on file (nothing to key on)", async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([{ id: "cust_2", phone: null, stripeCustomerId: null }]);
    const r = await anonymizeCustomerByEmail("rest_1", "nophone@example.com");
    expect(calls).not.toContain("voiceCallEvent.deleteMany");
    expect(calls).not.toContain("voiceCall.updateMany");
    expect(r.counts.VoiceCallEvent).toBeUndefined();
  });
});
