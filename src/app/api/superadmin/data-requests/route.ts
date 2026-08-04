/**
 * Superadmin data-rights fulfillment — the tool support uses to close the
 * manual "email support@ to delete my account" requests (and CASL/RTBF
 * complaints). GET previews the match; POST executes.
 *
 *   GET  ?email=…                → { customers, orders, restaurants } match counts
 *   POST { email, scope? }       → erase (scope "platform" [default] | "restaurant"+restaurantId)
 *
 * requireSuperadmin() gates both. The AdminAuditLog records only a HASH of the
 * email, never the address itself (the whole point was to erase it).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import { anonymizePersonEverywhere, anonymizeCustomerByEmail, subjectHash } from "@/lib/data-erasure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const insensitive = { equals: email, mode: "insensitive" as const };

  const [customers, orders, account] = await Promise.all([
    prisma.customer.findMany({ where: { email: insensitive }, select: { restaurantId: true } }),
    prisma.order.count({ where: { customerEmail: insensitive } }),
    prisma.customerAccount.findFirst({ where: { email: insensitive }, select: { id: true } }),
  ]);
  const restaurantIds = [...new Set(customers.map((c) => c.restaurantId))];

  return NextResponse.json({
    email,
    customers: customers.length,
    orders,
    restaurants: restaurantIds.length,
    hasMarketplaceAccount: !!account,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { email?: string; scope?: "platform" | "restaurant"; restaurantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const scope = body.scope === "restaurant" ? "restaurant" : "platform";
  if (scope === "restaurant" && !body.restaurantId) {
    return NextResponse.json({ error: "restaurantId required for restaurant scope" }, { status: 400 });
  }

  const result =
    scope === "restaurant"
      ? await anonymizeCustomerByEmail(body.restaurantId!, email, { actor: { via: "superadmin", userId: admin.id } })
      : await anonymizePersonEverywhere(email, { actor: { via: "superadmin", userId: admin.id } });

  await writeAuditLog({
    actor: admin,
    action: "data-request.erase",
    entity: `email-hash:${subjectHash(email)}`,
    detail: { scope, counts: result.counts, stripeStatus: result.stripeStatus },
  });

  return NextResponse.json({ ok: true, scope, counts: result.counts, stripeStatus: result.stripeStatus });
}
