import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { isSupportedLocale } from "@/lib/locales";
import { requirePhoneOrderingAdmin } from "../guard";
import {
  FAQ_CATEGORIES, MAX_ANSWER_CHARS, MAX_FAQS, MAX_QUESTION_CHARS, parseSortOrder,
} from "../validators";

export const runtime = "nodejs";

/**
 * Nabil FAQ manager — collection API.
 *   GET  /api/admin/phone-ordering/faqs   list (sortOrder, createdAt; includes source)
 *   POST /api/admin/phone-ordering/faqs   create (cap 100 per restaurant)
 */

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const faqs = await prisma.voiceFaq.findMany({
    where: { restaurantId: gate.restaurantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ faqs });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: "Invalid question", code: "invalid_question" }, { status: 400 });
  }
  if (!answer || answer.length > MAX_ANSWER_CHARS) {
    return NextResponse.json({ error: "Invalid answer", code: "invalid_answer" }, { status: 400 });
  }
  // Invalid enum-ish values fall back to defaults (same silent-ignore style
  // as the phone-ordering settings PATCH) rather than 400ing.
  const category =
    typeof body.category === "string" && FAQ_CATEGORIES.has(body.category)
      ? body.category
      : "business_info";

  let locale: string;
  if (isSupportedLocale(body.locale)) {
    locale = body.locale;
  } else {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { defaultLanguage: true },
    });
    locale = restaurant?.defaultLanguage || "en";
  }

  const count = await prisma.voiceFaq.count({ where: { restaurantId } });
  if (count >= MAX_FAQS) {
    return NextResponse.json({ error: "FAQ limit reached", code: "faq_limit" }, { status: 409 });
  }

  const faq = await prisma.voiceFaq.create({
    data: {
      restaurantId,
      question,
      answer,
      category,
      locale,
      source: "owner",
      sortOrder: parseSortOrder(body.sortOrder) ?? 0,
    },
  });
  return NextResponse.json({ ok: true, faq });
}
