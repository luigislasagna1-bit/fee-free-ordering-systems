/**
 * PII_ERASURE_MAP is documentation-as-code for the whole customer-PII surface,
 * and anonymizeCustomerByEmail is the ONE erasure path. These tests pin:
 *
 *  - the Nabil AI event log (VoiceCallEvent, 2026-08-15) into the erasure path:
 *    the map lists it, the transaction deletes it, and it does so BEFORE the
 *    VoiceCall scrub nulls the fromDigits key the delete depends on.
 *    VoiceMenuSnapshot is asserted ABSENT — it holds a menu, not a person.
 *  - a FAILED Twilio recording delete leaving recordingSid intact so the audio
 *    can still be reached, and the request logged "partial" rather than a lie.
 *  - ACCESS parity with deletion: every table the map says is exported must
 *    actually appear in the DSAR bundle. Erasure knew about Nabil transcripts
 *    for months while "download my data" returned no trace of them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, calls, deleteRecordingMock } = vi.hoisted(() => {
  const calls: string[] = [];
  const rec = (name: string, result: unknown) =>
    vi.fn(async () => {
      calls.push(name);
      return result;
    });
  const prismaMock: any = {
    customer: { findMany: vi.fn(async () => [{ id: "cust_1", phone: "(416) 833-8405", stripeCustomerId: null }]), updateMany: rec("customer.updateMany", { count: 1 }) },
    customerAccount: { findFirst: vi.fn(async () => null) },
    customerAddress: { findMany: vi.fn(async () => []), deleteMany: rec("ca.deleteMany", { count: 0 }) },
    order: { findMany: vi.fn(async () => []), updateMany: rec("order.updateMany", { count: 0 }) },
    rewardAccount: { findMany: vi.fn(async () => []) },
    voiceCall: {
      findMany: vi.fn(async () => []),
      updateMany: rec("voiceCall.updateMany", { count: 2 }),
    },
    voiceCallEvent: { deleteMany: rec("voiceCallEvent.deleteMany", { count: 57 }) },
    voiceCallReport: { updateMany: rec("voiceCallReport.updateMany", { count: 3 }) },
    voiceCallReportComment: { updateMany: rec("voiceCallReportComment.updateMany", { count: 5 }) },
    voiceCallReview: { updateMany: rec("voiceCallReview.updateMany", { count: 1 }) },
    voiceCallbackRequest: { updateMany: rec("voiceCallbackRequest.updateMany", { count: 1 }), findMany: rec("voiceCallbackRequest.findMany", []) },
    restaurantCustomerAddress: { findMany: vi.fn(async () => []), deleteMany: rec("rca.deleteMany", { count: 0 }) },
    customerPushToken: { deleteMany: rec("cpt.deleteMany", { count: 0 }) },
    giftWalletPass: { updateMany: rec("gwp.updateMany", { count: 0 }) },
    rewardLedger: { updateMany: rec("rl.updateMany", { count: 0 }) },
    orderItem: { findMany: vi.fn(async () => []), updateMany: rec("oi.updateMany", { count: 0 }) },
    orderRating: { findMany: vi.fn(async () => []), updateMany: rec("or.updateMany", { count: 0 }) },
    reservation: { findMany: vi.fn(async () => []), updateMany: rec("reservation.updateMany", { count: 0 }) },
    pendingRewardGrant: { updateMany: rec("prg.updateMany", { count: 0 }) },
    dataRequestLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(prismaMock)),
  };
  const deleteRecordingMock = vi.fn(async (_sid: string) => true);
  return { prismaMock, calls, deleteRecordingMock };
});

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/stripe", () => ({ getRestaurantStripe: vi.fn(async () => null) }));
vi.mock("@/lib/suppression", () => ({ suppressEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/voice/twilio-recording", () => ({ deleteRecording: deleteRecordingMock }));

import {
  PII_ERASURE_MAP,
  DSAR_EXPORTED_SECTIONS,
  anonymizeCustomerByEmail,
  exportPersonData, REDACTED_REPORT_TEXT } from "./data-erasure";

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("PII_ERASURE_MAP", () => {
  it("lists the Nabil event log as DELETED and leaves the menu snapshot out", () => {
    expect(PII_ERASURE_MAP.VoiceCallEvent.action).toBe("delete");
    expect(PII_ERASURE_MAP.VoiceCallEvent.fields).toEqual(["payload"]);
    expect(PII_ERASURE_MAP.VoiceCall.action).toBe("anonymize");
    expect((PII_ERASURE_MAP as Record<string, unknown>).VoiceMenuSnapshot).toBeUndefined();
  });

  it("gives every table an explicit export decision — no entry may be silent about access", () => {
    for (const [table, entry] of Object.entries(PII_ERASURE_MAP)) {
      expect(
        typeof entry.exported === "string" || entry.exported === false,
        `${table} has no 'exported' decision`,
      ).toBe(true);
      if (typeof entry.exported === "string") expect(entry.exported.length).toBeGreaterThan(0);
    }
  });

  it("exports the Nabil call record — the transcript we admit to holding", () => {
    expect(PII_ERASURE_MAP.VoiceCall.exported).toBe("voiceCalls");
    expect(DSAR_EXPORTED_SECTIONS).toContain("voiceCalls");
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

describe("anonymizeCustomerByEmail → a Twilio recording we could NOT delete", () => {
  it("keeps recordingSid so the audio is still reachable, drops everything else, and logs the request PARTIAL", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValueOnce([{ recordingSid: "RE_stuck" }]);
    deleteRecordingMock.mockResolvedValueOnce(false);

    const r = await anonymizeCustomerByEmail("rest_1", "luigi@example.com");

    const [retryScrub, generalScrub] = prismaMock.voiceCall.updateMany.mock.calls.map((c: any[]) => c[0]);

    // The stuck row is scrubbed of every PII field EXCEPT the delete handle.
    expect(retryScrub.where.recordingSid).toEqual({ in: ["RE_stuck"] });
    expect(retryScrub.data).not.toHaveProperty("recordingSid");
    expect(retryScrub.data.recordingUrl).toBeNull();
    expect(retryScrub.data.fromDigits).toBeNull();
    expect(retryScrub.data.summary).toBeNull();

    // Everything else still loses the SID outright.
    expect(generalScrub.data.recordingSid).toBeNull();

    // And we do not claim a clean erasure while audio survives at Twilio.
    expect(r.recordingsPending).toBe(1);
    expect(prismaMock.dataRequestLog.create.mock.calls[0][0].data.status).toBe("partial");
  });

  it("drops the SID and reports completed when Twilio accepted the delete", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValueOnce([{ recordingSid: "RE_ok" }]);

    const r = await anonymizeCustomerByEmail("rest_1", "luigi@example.com");

    expect(deleteRecordingMock).toHaveBeenCalledWith("RE_ok");
    expect(prismaMock.voiceCall.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.voiceCall.updateMany.mock.calls[0][0].data.recordingSid).toBeNull();
    expect(r.recordingsPending).toBe(0);
    expect(prismaMock.dataRequestLog.create.mock.calls[0][0].data.status).toBe("completed");
  });
});

describe("exportPersonData ↔ PII_ERASURE_MAP parity", () => {
  it("returns a section for every table the map promises to export", async () => {
    const bundle = await exportPersonData({ email: "luigi@example.com" });
    expect(DSAR_EXPORTED_SECTIONS.length).toBeGreaterThan(0);
    for (const section of DSAR_EXPORTED_SECTIONS) {
      expect(Object.keys(bundle), `bundle is missing the '${section}' section`).toContain(section);
    }
  });

  it("finds Nabil calls on the normalized phone key, not the email", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValueOnce([
      { id: "vc_1", restaurantId: "rest_1", transcript: [{ role: "user", text: "large pepperoni" }], summary: "Ordered a pizza", recordingSid: "RE_1", recordingDurationSeconds: 62 },
    ]);

    const bundle = await exportPersonData({ email: "luigi@example.com" });

    expect(prismaMock.voiceCall.findMany.mock.calls[0][0].where.fromDigits).toEqual({ in: ["4168338405"] });
    expect(bundle.voiceCalls).toHaveLength(1);
  });

  it("hands back the fact of a recording, never the Twilio handle to it", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValueOnce([
      { id: "vc_1", recordingSid: "RE_1", recordingDurationSeconds: 62 },
      { id: "vc_2", recordingSid: null, recordingDurationSeconds: null },
    ]);

    const bundle = await exportPersonData({ email: "luigi@example.com" });

    expect(bundle.voiceCalls).toEqual([
      { id: "vc_1", recordingDurationSeconds: 62, hasRecording: true },
      { id: "vc_2", recordingDurationSeconds: null, hasRecording: false },
    ]);
    expect(JSON.stringify(bundle)).not.toContain("RE_1");
  });

  it("does not query the voice tables at all for a person with no phone", async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([{ id: "cust_2", phone: null }]);
    const bundle = await exportPersonData({ email: "nophone@example.com" });
    expect(prismaMock.voiceCall.findMany).not.toHaveBeenCalled();
    expect(bundle.voiceCalls).toEqual([]);
  });
});
