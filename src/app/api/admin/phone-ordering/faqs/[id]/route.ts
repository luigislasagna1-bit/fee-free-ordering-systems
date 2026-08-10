import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../../guard";
import {
  FAQ_CATEGORIES, MAX_ANSWER_CHARS, MAX_QUESTION_CHARS, parseSortOrder,
} from "../../validators";

export const runtime = "nodejs";

/**
 * Nabil FAQ manager — item API.
 *   PATCH  /api/admin/phone-ordering/faqs/[id]   edit / toggle / approve
 *   DELETE /api/admin/phone-ordering/faqs/[id]   remove (also "dismiss" for recommended)
 *
 * Approve flow: PATCH {approve:true} on an AI-recommended FAQ flips
 * source "recommended" → "owner" and activates it — the accept action on
 * the "Recommended — based on what callers are asking" banner.
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const faq = await prisma.voiceFaq.findUnique({ where: { id }, select: { restaurantId: true, source: true } });
  if (!faq || faq.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.question === "string") {
    const question = body.question.trim();
    if (!question || question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json({ error: "Invalid question", code: "invalid_question" }, { status: 400 });
    }
    data.question = question;
  }
  if (typeof body.answer === "string") {
    const answer = body.answer.trim();
    if (!answer || answer.length > MAX_ANSWER_CHARS) {
      return NextResponse.json({ error: "Invalid answer", code: "invalid_answer" }, { status: 400 });
    }
    data.answer = answer;
  }
  if (typeof body.category === "string" && FAQ_CATEGORIES.has(body.category)) data.category = body.category;
  if (typeof body.active === "boolean") data.active = body.active;
  const sortOrder = parseSortOrder(body.sortOrder);
  if (sortOrder !== null) data.sortOrder = sortOrder;

  if (body.approve === true && faq.source === "recommended") {
    data.source = "owner";
    data.active = true;
  }

  const updated = await prisma.voiceFaq.update({ where: { id }, data });
  return NextResponse.json({ ok: true, faq: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const faq = await prisma.voiceFaq.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!faq || faq.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.voiceFaq.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
