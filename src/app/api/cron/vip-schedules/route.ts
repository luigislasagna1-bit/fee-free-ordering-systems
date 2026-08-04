/**
 * VIP recurring scheduler cron (Program 2, 2026-06-27).
 *
 * Fires every due VipSchedule:
 *   - "credit_grant"    → drop Reward Dollars on each recipient (idempotent per
 *                         period via the reward ledger's synthetic orderId, plus a
 *                         VipScheduleGrant audit row).
 *   - "discount_resend" → re-announce a member-only special by email (reuses the
 *                         Phase-1 notify helpers; inactive promos no-op).
 *
 * Recipients are resolved LIVE so members added after the schedule was created are
 * included. Timezone-aware (the send hour is local to the restaurant). A per-day
 * tz guard (`lastFiredDateKey`) makes a second cron tick the same local day a
 * no-op; the ledger's own idempotency is the hard guard against double-grant.
 *
 * Scheduled: every 5 minutes (vercel.json). Dual auth: Bearer $CRON_SECRET or a
 * superadmin session. Serial + try/caught per schedule so one bad row can't stall
 * the batch.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { computeNextRun, periodKeyFor, type Cadence } from "@/lib/vip-schedules";
import { dateKeyInTimezone } from "@/lib/restaurant-hours";
import { grant as grantReward } from "@/lib/reward-ledger";
import { notifyGroupOfSpecial, notifyRecipientsOfSpecial, type SpecialRecipient } from "@/lib/vip-notify";

export const dynamic = "force-dynamic";

type DueSchedule = Awaited<ReturnType<typeof loadDue>>[number];

function loadDue(now: Date) {
  return prisma.vipSchedule.findMany({
    where: { active: true, nextRunAt: { not: null, lte: now } },
    take: 500,
    include: { restaurant: { select: { timezone: true, rewardsEnabled: true } } },
  });
}

const recipientKeyFor = (customerId: string | null, email: string | null) =>
  customerId ? customerId : email ? `email:${email.toLowerCase()}` : null;

/** credit_grant: grant Reward Dollars to every resolvable recipient, idempotent
 *  per (account, period) at the ledger. Returns counts for logging. */
async function runCreditGrant(s: DueSchedule, periodKey: string): Promise<{ granted: number; skipped: number }> {
  const amount = s.amount ?? 0;
  if (amount <= 0) return { granted: 0, skipped: 0 };

  // Resolve recipients live.
  const members: Array<{ customerId: string | null; email: string | null; name: string | null }> = s.groupId
    ? (await prisma.customerGroupMember.findMany({
        where: { groupId: s.groupId },
        select: { customerId: true, email: true, name: true },
      }))
    : [{ customerId: s.customerId ?? null, email: s.email ?? null, name: null }];

  let granted = 0, skipped = 0;
  // Everyone credited must be TOLD, and told how to use it. Until 2026-07-31
  // this path granted money in silence: for an email-only recipient it even
  // created a brand-new Customer row purely to hold the credit, so a person who
  // had never ordered was given a balance nobody ever mentioned to them. Luigi's
  // rule — anyone we send credit to gets clear instructions, 100%.
  const toNotify: Array<{ email: string; name: string; customerId: string }> = [];
  // Synthetic ledger key — same across recipients (accountId differs), so the
  // ledger's @@unique([accountId, orderId, reason]) makes each grant exactly-once
  // per period. Luigi 2026-06-27.
  const syntheticOrderId = `sched:${s.id}:${periodKey}`;

  for (const m of members) {
    const rkey = recipientKeyFor(m.customerId, m.email);
    if (!rkey) { skipped++; continue; } // phone/name-only → no wallet target

    // Resolve a Customer.id (the wallet key). Find-or-create for an email-only
    // recipient so a not-yet-customer the owner added still gets credited.
    let customerId = m.customerId ?? null;
    if (!customerId && m.email) {
      const email = m.email.toLowerCase();
      const existing = await prisma.customer.findFirst({ where: { restaurantId: s.restaurantId, email }, select: { id: true } });
      customerId = existing?.id
        ?? (await prisma.customer.create({ data: { restaurantId: s.restaurantId, email, name: m.name ?? email }, select: { id: true } })).id;
    }
    if (!customerId) { skipped++; continue; }

    const res = await grantReward({
      restaurantId: s.restaurantId,
      customerId,
      amount,
      reason: "grant",
      note: s.note ?? null,
      orderId: syntheticOrderId,
    });
    if (res.ok) {
      granted++;
      // Queue rather than send inside the loop: one mail hiccup must not stall
      // the rest of the batch, and the ledger write is already done.
      const notifyEmail = (m.email ?? "").trim().toLowerCase();
      if (notifyEmail) toNotify.push({ email: notifyEmail, name: m.name ?? "", customerId });
    }

    // Best-effort audit row (the ledger is the real guard). P2002 = already logged.
    await prisma.vipScheduleGrant.create({
      data: { scheduleId: s.id, periodKey, recipientKey: rkey, customerId, email: m.email?.toLowerCase() ?? null, amount },
    }).catch(() => {});
  }
  // ── Tell them ────────────────────────────────────────────────────────────
  // Which email depends on whether they can actually reach the money: someone
  // with no account cannot sign in, so "sign in to your account" would be a
  // dead end — they get the invite that walks them through creating one. Same
  // branch the two admin gift routes use, so all three paths agree.
  if (toNotify.length > 0) {
    try {
      const r = await prisma.restaurant.findUnique({
        where: { id: s.restaurantId },
        select: {
          name: true, email: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true,
          defaultLanguage: true, currency: true, rewardLabelSingular: true, rewardLabelPlural: true,
        },
      });
      if (r) {
        const { sendRewardGiftEmail, sendRewardGiftInviteEmail } = await import("@/lib/email");
        const { isAccountCustomer } = await import("@/lib/reward-gifts");
        const { getBalance } = await import("@/lib/reward-ledger");
        const { formatCurrency } = await import("@/lib/utils");
        const { restaurantOrderUrl } = await import("@/lib/restaurant-url");

        const rewardLabel = r.rewardLabelPlural?.trim() || r.rewardLabelSingular?.trim() || "Reward Dollars";
        const amountLabel = formatCurrency(amount, r.currency);
        const locale = r.defaultLanguage || "en";
        const orderUrl = restaurantOrderUrl(r as any, "");
        // A branded host's ROOT serves the marketing site, so the invite must
        // link at the signup form explicitly.
        const signupUrl = restaurantOrderUrl(r as any, "/account/signup");

        const rows = await prisma.customer.findMany({
          where: { id: { in: toNotify.map((x) => x.customerId) } },
          select: { id: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
        });
        const byId = new Map(rows.map((x) => [x.id, x]));

        for (const person of toNotify) {
          const row = byId.get(person.customerId);
          const hasAccount = !!row && isAccountCustomer(row as any);
          const common = {
            to: person.email,
            restaurantId: s.restaurantId,
            customerName: person.name || "",
            restaurantName: r.name,
            amountLabel,
            rewardLabel,
            note: s.note ?? null,
            restaurantEmail: r.email,
            locale,
          };
          if (hasAccount) {
            const balance = await getBalance({ restaurantId: s.restaurantId, customerId: person.customerId });
            await sendRewardGiftEmail({
              ...common,
              balanceLabel: formatCurrency(balance, r.currency),
              orderUrl,
            }).catch((e) => console.error("[vip-schedule credit email]", e instanceof Error ? e.message : e));
          } else {
            await sendRewardGiftInviteEmail({ ...common, orderUrl: signupUrl })
              .catch((e) => console.error("[vip-schedule credit invite]", e instanceof Error ? e.message : e));
          }
        }
      }
    } catch (e) {
      // Never fail the grant because the notification failed — the money is
      // already banked and the owner can resend from the admin.
      console.error("[vip-schedule credit notify]", e instanceof Error ? e.message : e);
    }
  }

  return { granted, skipped };
}

/** discount_resend: re-announce the member-only special by email. */
async function runDiscountResend(s: DueSchedule): Promise<number> {
  if (!s.promotionId) return 0;
  if (s.groupId) {
    return notifyGroupOfSpecial({ groupId: s.groupId, promotionId: s.promotionId, restaurantId: s.restaurantId });
  }
  // Individual target → build one recipient.
  const recipients: SpecialRecipient[] = [];
  if (s.customerId) {
    const c = await prisma.customer.findUnique({ where: { id: s.customerId }, select: { email: true, name: true, passwordHash: true } });
    if (c?.email) recipients.push({ email: c.email, name: c.name ?? null, hasAccount: !!c.passwordHash });
  } else if (s.email) {
    const email = s.email.toLowerCase();
    const acct = await prisma.customer.findFirst({ where: { restaurantId: s.restaurantId, email, passwordHash: { not: null } }, select: { id: true } });
    recipients.push({ email, name: null, hasAccount: !!acct });
  }
  if (recipients.length === 0) return 0;
  return notifyRecipientsOfSpecial({ promotionId: s.promotionId, restaurantId: s.restaurantId, recipients });
}

async function runSchedules() {
  const now = new Date();
  const due = await loadDue(now);
  if (due.length === 0) return { ok: true, due: 0, fired: 0 };

  let fired = 0;
  for (const s of due) {
    try {
      const tz = s.restaurant?.timezone || undefined;
      const todayKey = tz ? dateKeyInTimezone(now, tz) : new Date().toISOString().slice(0, 10);

      // Already fired this local day → just advance (don't double-send).
      if (s.lastFiredDateKey === todayKey) {
        const next = s.cadence === "once" ? null : computeNextRun(s as any, now, tz);
        await prisma.vipSchedule.update({
          where: { id: s.id },
          data: { nextRunAt: next, active: s.cadence === "once" ? false : s.active },
        });
        continue;
      }

      // Bucket this fire by the SCHEDULED time so the period guard is stable.
      const periodKey = periodKeyFor(s.cadence as Cadence, s.nextRunAt ?? now, tz);

      if (s.kind === "credit_grant") {
        if (s.restaurant?.rewardsEnabled) await runCreditGrant(s, periodKey);
        else console.warn(`[cron/vip-schedules] credit_grant ${s.id} skipped — Reward Dollars off for restaurant ${s.restaurantId}`);
      } else if (s.kind === "discount_resend") {
        await runDiscountResend(s);
      }

      const next = s.cadence === "once" ? null : computeNextRun(s as any, now, tz);
      await prisma.vipSchedule.update({
        where: { id: s.id },
        data: {
          lastRunAt: now,
          lastFiredDateKey: todayKey,
          runCount: { increment: 1 },
          nextRunAt: next,
          active: s.cadence === "once" ? false : s.active,
        },
      });
      fired++;
    } catch (e) {
      console.error(`[cron/vip-schedules] schedule ${s.id} failed`, e);
    }
  }
  return { ok: true, due: due.length, fired };
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    return NextResponse.json(await runSchedules());
  } catch (err: any) {
    console.error("[cron/vip-schedules]", err);
    return NextResponse.json({ ok: false, error: err.message ?? "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
