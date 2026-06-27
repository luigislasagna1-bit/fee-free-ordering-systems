/**
 * Individual VIP-special targets (attach a member-only promotion to specific
 * people, not a whole group). Mirrors the group link model but the target is an
 * individual: an account (customerId) and/or a person by email.
 *
 *   GET    ?customerId=…   — list individual targets (optionally for one customer)
 *   POST   { promotionId, emails?[], customerIds?[], notify? }  — attach
 *   DELETE ?id=…           — remove one target
 *
 * Pasted emails auto-link to an existing account; the special then auto-applies
 * for that person (signed in OR typing the email at checkout) — no code. All
 * scoped to the owner's restaurant.
 */
import { NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyRecipientsOfSpecial, type SpecialRecipient } from "@/lib/vip-notify";

export async function GET(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const customerId = new URL(req.url).searchParams.get("customerId") || undefined;

  const rows = await prisma.customerGroupPromotion.findMany({
    where: { restaurantId, groupId: null, ...(customerId ? { customerId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true, promotionId: true, customerId: true, email: true, createdAt: true,
      promotion: { select: { id: true, name: true, promotionType: true, isActive: true, ruleConfig: true } },
      customer: { select: { name: true, email: true, passwordHash: true } },
    },
  });
  const targets = rows.map((t) => ({
    id: t.id,
    promotionId: t.promotionId,
    promoName: t.promotion.name,
    promotionType: t.promotion.promotionType,
    isActive: t.promotion.isActive,
    ruleConfig: t.promotion.ruleConfig,
    name: t.customer?.name ?? null,
    email: t.email ?? t.customer?.email ?? null,
    hasAccount: !!t.customer?.passwordHash,
  }));
  return NextResponse.json({ targets });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const promotionId = typeof body.promotionId === "string" ? body.promotionId : "";
  if (!promotionId) return NextResponse.json({ error: "promotionId is required" }, { status: 400 });

  // Never trust the client's id — the promotion must belong to this restaurant.
  const promo = await prisma.promotion.findUnique({ where: { id: promotionId }, select: { id: true, restaurantId: true } });
  if (!promo || promo.restaurantId !== restaurantId) return NextResponse.json({ error: "Promotion not found" }, { status: 404 });

  const emails = [...new Set((Array.isArray(body.emails) ? body.emails : []).map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => e.includes("@") && e.length <= 200))] as string[];
  const customerIds = (Array.isArray(body.customerIds) ? body.customerIds : []).map((x: unknown) => String(x));
  if (!emails.length && !customerIds.length) return NextResponse.json({ error: "Add at least one email or customer." }, { status: 400 });

  // Resolve account info (scoped) for passed customers + email matches.
  const [passed, matched, existing] = await Promise.all([
    customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds }, restaurantId }, select: { id: true, email: true, name: true, passwordHash: true } }) : Promise.resolve([]),
    emails.length ? prisma.customer.findMany({ where: { restaurantId, email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true, name: true, passwordHash: true } }) : Promise.resolve([]),
    prisma.customerGroupPromotion.findMany({ where: { promotionId, groupId: null, restaurantId }, select: { customerId: true, email: true } }),
  ]);
  const matchByEmail = new Map(matched.map((c) => [c.email!.toLowerCase(), c]));
  const haveCust = new Set(existing.map((e) => e.customerId).filter(Boolean) as string[]);
  const haveEmail = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]);

  const toCreate: Array<{ promotionId: string; restaurantId: string; customerId?: string; email?: string }> = [];
  const recipients: SpecialRecipient[] = [];

  for (const c of passed) {
    if (haveCust.has(c.id)) continue;
    haveCust.add(c.id);
    const em = c.email?.toLowerCase() ?? undefined;
    toCreate.push({ promotionId, restaurantId, customerId: c.id, email: em });
    if (em) { haveEmail.add(em); recipients.push({ email: em, name: c.name, hasAccount: !!c.passwordHash }); }
  }
  for (const em of emails) {
    const c = matchByEmail.get(em);
    if (c) {
      if (haveCust.has(c.id)) continue;
      haveCust.add(c.id); haveEmail.add(em);
      toCreate.push({ promotionId, restaurantId, customerId: c.id, email: em });
      recipients.push({ email: em, name: c.name, hasAccount: !!c.passwordHash });
    } else {
      if (haveEmail.has(em)) continue;
      haveEmail.add(em);
      toCreate.push({ promotionId, restaurantId, email: em });
      recipients.push({ email: em, name: null, hasAccount: false });
    }
  }

  if (toCreate.length) await prisma.customerGroupPromotion.createMany({ data: toCreate, skipDuplicates: true });

  let emailed = 0;
  if (body.notify === true && recipients.length) {
    emailed = recipients.length;
    after(async () => {
      try { await notifyRecipientsOfSpecial({ promotionId, restaurantId, recipients }); }
      catch (e) { console.error("[vip-specials individuals notify]", e); }
    });
  }
  return NextResponse.json({ ok: true, added: toCreate.length, emailed });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  // Scoped delete; groupId:null guard so this route only removes individual targets.
  await prisma.customerGroupPromotion.deleteMany({ where: { id, restaurantId, groupId: null } });
  return NextResponse.json({ ok: true });
}
