/**
 * Ops-message queue (src/lib/ops-messages.ts): dispatch reaches the superadmin
 * audience + ops inbox through the SAME plumbing as the signup / add-on alerts,
 * stamps sentAt only on a real acceptance, spends an attempt on failure, gives
 * up at OPS_MESSAGE_MAX_ATTEMPTS, and the conditional claim keeps two
 * overlapping cron ticks from double-sending. Prisma + the email helper are
 * mocked; platform-notifications.ts runs for real on top of the mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = {
  id: string;
  subject: string;
  body: string;
  link: string | null;
  ctaLabel: string | null;
  createdAt: Date;
  sentAt: Date | null;
  attempts: number;
  lastError: string | null;
};

const { prismaMock, state, sendMock } = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    superadmins: [{ email: "Admin@FeeFreeOrdering.com", name: "Luigi Admin" }] as Array<{ email: string; name: string | null }>,
    inApp: [] as Array<Record<string, unknown>>,
    /** Hook: run inside updateMany (the claim) — used to simulate a racing tick. */
    onClaim: null as null | ((id: string) => void),
  };
  type SendParams = { to: string; subject: string; [k: string]: unknown };
  type SendResult = { success: boolean; error?: string };
  const sendMock = vi.fn<(p: SendParams) => Promise<SendResult>>(async () => ({ success: true }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaMock: any = {
    user: {
      findMany: vi.fn(async () => state.superadmins),
    },
    resellerNotification: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        state.inApp.push(...data);
        return { count: data.length };
      }),
    },
    opsMessage: {
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `om_${state.rows.length + 1}`,
          subject: data.subject!,
          body: data.body!,
          link: data.link ?? null,
          ctaLabel: data.ctaLabel ?? null,
          createdAt: new Date(),
          sentAt: null,
          attempts: 0,
          lastError: null,
        };
        state.rows.push(row);
        return { id: row.id };
      }),
      findMany: vi.fn(async ({ where, take }: { where: { attempts: { lt: number } }; take: number }) =>
        state.rows
          .filter((r) => r.sentAt === null && r.attempts < where.attempts.lt)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take)
          .map((r) => ({ ...r })),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; sentAt: null; attempts: number }; data: { attempts: { increment: number } } }) => {
        state.onClaim?.(where.id);
        const r = state.rows.find((x) => x.id === where.id);
        if (!r || r.sentAt !== null || r.attempts !== where.attempts) return { count: 0 };
        r.attempts += data.attempts.increment;
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = state.rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
    },
  };
  return { prismaMock, state, sendMock };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/email", () => ({ sendReportNotificationEmail: sendMock }));

import {
  enqueueOpsMessage,
  dispatchPendingOpsMessages,
  OPS_MESSAGE_MAX_ATTEMPTS,
  OPS_MESSAGE_KIND,
  normalizeOpsLink,
  opsCtaUrl,
  opsInAppPreview,
} from "./ops-messages";

function seed(partial: Partial<Row> & { subject: string; body: string }, at = Date.now()): Row {
  const row: Row = {
    id: partial.id ?? `om_${state.rows.length + 1}`,
    subject: partial.subject,
    body: partial.body,
    link: partial.link ?? null,
    ctaLabel: partial.ctaLabel ?? null,
    createdAt: new Date(at),
    sentAt: partial.sentAt ?? null,
    attempts: partial.attempts ?? 0,
    lastError: partial.lastError ?? null,
  };
  state.rows.push(row);
  return row;
}

beforeEach(() => {
  state.rows = [];
  state.inApp = [];
  state.onClaim = null;
  state.superadmins = [{ email: "Admin@FeeFreeOrdering.com", name: "Luigi Admin" }];
  sendMock.mockReset();
  sendMock.mockImplementation(async () => ({ success: true }));
  prismaMock.user.findMany.mockClear();
  delete process.env.PLATFORM_OPS_EMAIL;
  delete process.env.REPORTS_OPS_EMAIL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("enqueueOpsMessage", () => {
  it("stores a trimmed subject/body with the CTA and returns the id", async () => {
    const { id } = await enqueueOpsMessage({
      subject: "  Nabil sim  report ",
      body: "Line one\r\n\r\nLine two\r\n",
      link: "/superadmin/nabil",
      ctaLabel: " Open dashboard ",
    });
    expect(id).toBe("om_1");
    expect(state.rows[0]).toMatchObject({
      subject: "Nabil sim report",
      body: "Line one\n\nLine two",
      link: "/superadmin/nabil",
      ctaLabel: "Open dashboard",
      attempts: 0,
      sentAt: null,
    });
  });

  it("rejects an empty subject or body and unsafe links; drops a CTA label without a link", async () => {
    await expect(enqueueOpsMessage({ subject: " ", body: "x" })).rejects.toThrow(/subject/);
    await expect(enqueueOpsMessage({ subject: "s", body: "  " })).rejects.toThrow(/body/);
    await expect(enqueueOpsMessage({ subject: "s", body: "b", link: "javascript:alert(1)" })).rejects.toThrow(/link/);
    await expect(enqueueOpsMessage({ subject: "s", body: "b", link: "//evil.example" })).rejects.toThrow(/link/);
    await enqueueOpsMessage({ subject: "s", body: "b", ctaLabel: "Open" });
    expect(state.rows[0].ctaLabel).toBeNull();
    expect(normalizeOpsLink("https://feefreeordering.com/superadmin")).toBe("https://feefreeordering.com/superadmin");
    expect(normalizeOpsLink("")).toBeNull();
  });
});

describe("dispatchPendingOpsMessages", () => {
  it("emails every superadmin + the ops inbox, posts the in-app bell, and stamps sentAt", async () => {
    seed({ subject: "Weekly Nabil report", body: "Para one\n\nPara two", link: "/superadmin/nabil", ctaLabel: "Open" });

    const res = await dispatchPendingOpsMessages();

    expect(res).toEqual({ sent: 1, failed: 0 });
    // Audience = superadmin login (lowercased) + support@ ops inbox, deduped.
    const tos = sendMock.mock.calls.map((c) => c[0].to).sort();
    expect(tos).toEqual(["admin@feefreeordering.com", "support@feefreeordering.com"]);
    const first = sendMock.mock.calls.find((c) => c[0].to === "admin@feefreeordering.com")![0];
    expect(first).toMatchObject({
      recipientName: "Luigi",
      subject: "Weekly Nabil report",
      title: "Weekly Nabil report",
      body: "Para one\n\nPara two",
      ctaLabel: "Open",
      ctaUrl: "https://feefreeordering.com/superadmin/nabil",
    });
    // In-app: superadmin login only (the ops inbox is not a panel user).
    expect(state.inApp).toEqual([
      expect.objectContaining({
        recipientEmail: "admin@feefreeordering.com",
        kind: OPS_MESSAGE_KIND,
        title: "Weekly Nabil report",
        body: "Para one Para two",
        linkUrl: "/superadmin/nabil",
      }),
    ]);
    expect(state.rows[0].sentAt).toBeInstanceOf(Date);
    expect(state.rows[0].attempts).toBe(1);
    expect(state.rows[0].lastError).toBeNull();
  });

  it("increments attempts + records lastError when no recipient accepted, and retries next pass", async () => {
    seed({ subject: "Failing", body: "b" });
    sendMock.mockImplementation(async () => ({ success: false, error: "email transport unconfigured" }));

    const res = await dispatchPendingOpsMessages();
    expect(res).toEqual({ sent: 0, failed: 1 });
    expect(state.rows[0].sentAt).toBeNull();
    expect(state.rows[0].attempts).toBe(1);
    expect(state.rows[0].lastError).toMatch(/attempt 1: .*email transport unconfigured/);
    // In-app was posted once on the first attempt …
    expect(state.inApp).toHaveLength(1);

    // … and NOT again on the retry, which succeeds this time.
    sendMock.mockImplementation(async () => ({ success: true }));
    const res2 = await dispatchPendingOpsMessages();
    expect(res2).toEqual({ sent: 1, failed: 0 });
    expect(state.rows[0].attempts).toBe(2);
    expect(state.rows[0].sentAt).toBeInstanceOf(Date);
    expect(state.rows[0].lastError).toBeNull();
    expect(state.inApp).toHaveLength(1);
  });

  it("treats a thrown email helper as a failed attempt (not a crash)", async () => {
    seed({ subject: "Throws", body: "b" });
    sendMock.mockImplementation(async () => {
      throw new Error("boom");
    });
    const res = await dispatchPendingOpsMessages();
    expect(res).toEqual({ sent: 0, failed: 1 });
    expect(state.rows[0].lastError).toMatch(/boom/);
    expect(state.rows[0].sentAt).toBeNull();
  });

  it("stamps sentAt on a PARTIAL fan-out success and notes the failed recipient (no re-send)", async () => {
    seed({ subject: "Partial", body: "b" });
    sendMock.mockImplementation(async (p) =>
      p.to === "support@feefreeordering.com" ? { success: false, error: "bounced" } : { success: true },
    );
    const res = await dispatchPendingOpsMessages();
    expect(res).toEqual({ sent: 1, failed: 0 });
    expect(state.rows[0].sentAt).toBeInstanceOf(Date);
    expect(state.rows[0].lastError).toMatch(/sent to 1\/2.*support@feefreeordering\.com \(bounced\)/);
    // A second pass finds nothing pending.
    sendMock.mockClear();
    expect(await dispatchPendingOpsMessages()).toEqual({ sent: 0, failed: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips rows that already reached the attempt cap and rows already sent", async () => {
    seed({ id: "capped", subject: "Capped", body: "b", attempts: OPS_MESSAGE_MAX_ATTEMPTS, lastError: "attempt 5: x" });
    seed({ id: "done", subject: "Done", body: "b", sentAt: new Date(), attempts: 1 });
    seed({ id: "live", subject: "Live", body: "b", attempts: OPS_MESSAGE_MAX_ATTEMPTS - 1 });

    const res = await dispatchPendingOpsMessages();
    expect(res).toEqual({ sent: 1, failed: 0 });
    const subjects = sendMock.mock.calls.map((c) => c[0].subject);
    expect(new Set(subjects)).toEqual(new Set(["Live"]));
    expect(state.rows.find((r) => r.id === "capped")!.attempts).toBe(OPS_MESSAGE_MAX_ATTEMPTS);
    expect(state.rows.find((r) => r.id === "live")!.sentAt).toBeInstanceOf(Date);
  });

  it("processes oldest first and honours the limit", async () => {
    seed({ id: "newer", subject: "Newer", body: "b" }, Date.now());
    seed({ id: "oldest", subject: "Oldest", body: "b" }, Date.now() - 60_000);
    seed({ id: "middle", subject: "Middle", body: "b" }, Date.now() - 30_000);

    const res = await dispatchPendingOpsMessages({ limit: 2 });
    expect(res).toEqual({ sent: 2, failed: 0 });
    expect(state.rows.find((r) => r.id === "oldest")!.sentAt).toBeInstanceOf(Date);
    expect(state.rows.find((r) => r.id === "middle")!.sentAt).toBeInstanceOf(Date);
    expect(state.rows.find((r) => r.id === "newer")!.sentAt).toBeNull();
  });

  it("the conditional claim prevents a double send when another tick claims first", async () => {
    seed({ id: "raced", subject: "Raced", body: "b" });
    // Simulate a concurrent tick that claimed (bumped attempts) between our
    // SELECT and our UPDATE … WHERE attempts = 0.
    state.onClaim = (id) => {
      const r = state.rows.find((x) => x.id === id)!;
      if (r.attempts === 0) r.attempts = 1; // the other tick's claim lands first
    };
    const res = await dispatchPendingOpsMessages();
    expect(res).toEqual({ sent: 0, failed: 0 });
    expect(sendMock).not.toHaveBeenCalled();
    expect(state.inApp).toHaveLength(0);
    // Only the other tick's claim is reflected; we did not double-bump.
    expect(state.rows[0].attempts).toBe(1);
  });

  it("with an absolute link the CTA passes through, no link ⇒ no CTA, PLATFORM_OPS_EMAIL overrides the inbox", async () => {
    process.env.PLATFORM_OPS_EMAIL = "Ops@Example.com";
    seed({ id: "abs", subject: "Abs", body: "b", link: "https://vercel.com/x", ctaLabel: "Vercel" });
    seed({ id: "nolink", subject: "NoLink", body: "b" });
    await dispatchPendingOpsMessages();
    const abs = sendMock.mock.calls.find((c) => c[0].subject === "Abs")![0];
    expect(abs.ctaUrl).toBe("https://vercel.com/x");
    expect(abs.ctaLabel).toBe("Vercel");
    const nolink = sendMock.mock.calls.find((c) => c[0].subject === "NoLink")![0];
    expect(nolink.ctaUrl).toBeUndefined();
    expect(nolink.ctaLabel).toBeUndefined();
    const tos = new Set(sendMock.mock.calls.map((c) => c[0].to));
    expect(tos).toEqual(new Set(["admin@feefreeordering.com", "ops@example.com"]));
  });

  it("returns immediately when nothing is pending", async () => {
    expect(await dispatchPendingOpsMessages()).toEqual({ sent: 0, failed: 0 });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("opsCtaUrl prefixes app-relative links with the app origin (never localhost)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
    expect(opsCtaUrl("/superadmin")).toBe("https://feefreeordering.com/superadmin");
    process.env.NEXT_PUBLIC_APP_URL = "https://www.feefreeordering.com/";
    expect(opsCtaUrl("/superadmin")).toBe("https://www.feefreeordering.com/superadmin");
    expect(opsCtaUrl("https://x.example/y")).toBe("https://x.example/y");
    expect(opsCtaUrl(null)).toBeUndefined();
  });

  it("opsInAppPreview flattens whitespace and clamps", () => {
    expect(opsInAppPreview("a\n\nb   c\n")).toBe("a b c");
    expect(opsInAppPreview("   ")).toBeNull();
    expect(opsInAppPreview("x".repeat(500))!.length).toBe(240);
  });
});
