import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../guard";
import { MAX_ANSWER_CHARS, MAX_FAQS, MAX_TEXT_LINKS, sanitizeHttpUrl } from "../validators";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

export const runtime = "nodejs";

/**
 * Nabil onboarding wizard, Step 2 — "Tell your agent about your restaurant."
 * A short guided form (not a blank FAQ editor): each answered prompt below
 * becomes ONE VoiceFaq row under a fixed, canonical question so the model
 * reads it the same way every time (see prompt.ts's faqSection()). Re-submit
 * the same wizard later (from FaqManager's "Quick-start template" entry
 * point) and an answer UPDATES its existing row — this is the owner's own
 * form, resubmitting is expected to mean "here's the current answer," unlike
 * scripts/_seed-nabil-faqs-luigi-2026-08-12.ts's skip-if-exists rule, which
 * only guards against clobbering data during an unrelated maintenance script.
 * Leaving a field blank never touches or deletes an existing row for it.
 *
 *   POST /api/admin/phone-ordering/onboarding-info
 *   { halal?, vegan?, vegetarian?, glutenFree?, allergenNote?, parking?,
 *     specialInfo?, hoursException?, website? } — all optional strings.
 */

const TEMPLATES: Record<string, { question: string; category: string }> = {
  halal: { question: "Do you have halal options?", category: "dietary" },
  vegan: { question: "Do you have vegan options?", category: "dietary" },
  vegetarian: { question: "Do you have vegetarian options?", category: "dietary" },
  glutenFree: { question: "Do you have gluten-free options?", category: "dietary" },
  allergenNote: { question: "Do you have an allergen or cross-contamination policy?", category: "allergen" },
  parking: { question: "Do you have parking?", category: "business_info" },
  specialInfo: { question: "Is there anything else customers often ask about your restaurant?", category: "business_info" },
  hoursException: { question: "Are there any exceptions to your posted hours callers should know about?", category: "operational" },
};

/** Prefill: current answers for each template prompt (from any matching VoiceFaq
 *  row, however it was created) + the saved website link, if any. Used by both
 *  the onboarding wizard and FaqManager's "Quick-start template" re-entry point
 *  so a restaurant editing this later sees what's already saved. */
export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const [faqs, websiteLink, restaurant] = await Promise.all([
    prisma.voiceFaq.findMany({ where: { restaurantId }, select: { question: true, category: true, answer: true } }),
    prisma.voiceTextLink.findFirst({ where: { restaurantId, kind: "custom", label: "Website" }, select: { url: true } }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, subdomain: true, customDomain: true, customDomainStatus: true },
    }),
  ]);
  const byKey = new Map(faqs.map((f) => [`${f.question.trim().toLowerCase()}::${f.category}`, f.answer]));

  const answers: Record<string, string> = {};
  for (const [key, tmpl] of Object.entries(TEMPLATES)) {
    const answer = byKey.get(`${tmpl.question.trim().toLowerCase()}::${tmpl.category}`);
    if (answer) answers[key] = answer;
  }

  return NextResponse.json({
    answers,
    website: websiteLink?.url ?? "",
    // Read-only preview — already auto-computed from restaurantOrderUrl(),
    // never re-entered by the owner.
    onlineOrderingLink: restaurant ? restaurantOrderUrl(restaurant) : "",
  });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const answers: Array<{ key: string; question: string; category: string; answer: string }> = [];
  for (const [key, tmpl] of Object.entries(TEMPLATES)) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    const answer = raw.trim().slice(0, MAX_ANSWER_CHARS);
    if (!answer) continue;
    answers.push({ key, question: tmpl.question, category: tmpl.category, answer });
  }
  const website = typeof body.website === "string" ? sanitizeHttpUrl(body.website) : null;

  if (!answers.length && !website) {
    return NextResponse.json({ ok: true, faqCreated: 0, faqUpdated: 0, websiteSaved: false });
  }

  const [restaurant, existingFaqs, existingLinkCount] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { defaultLanguage: true } }),
    prisma.voiceFaq.findMany({
      where: { restaurantId },
      select: { id: true, question: true, category: true },
    }),
    website ? prisma.voiceTextLink.count({ where: { restaurantId } }) : Promise.resolve(0),
  ]);
  const locale = restaurant?.defaultLanguage || "en";
  const byKey = new Map(existingFaqs.map((f) => [`${f.question.trim().toLowerCase()}::${f.category}`, f.id]));

  let roomForNewFaqs = Math.max(0, MAX_FAQS - existingFaqs.length);
  // Mixed VoiceFaq/VoiceTextLink writes batched into one $transaction below —
  // `any[]` sidesteps Prisma's overload resolution across two models' PrismaPromise types.
  const ops: any[] = [];
  let created = 0;
  let updated = 0;
  for (const a of answers) {
    const existingId = byKey.get(`${a.question.trim().toLowerCase()}::${a.category}`);
    if (existingId) {
      ops.push(prisma.voiceFaq.update({ where: { id: existingId }, data: { answer: a.answer, active: true } }));
      updated++;
    } else if (roomForNewFaqs > 0) {
      ops.push(
        prisma.voiceFaq.create({
          data: { restaurantId, question: a.question, answer: a.answer, category: a.category, locale, source: "owner" },
        }),
      );
      created++;
      roomForNewFaqs--;
    }
  }

  let websiteSaved = false;
  if (website) {
    const existingWebsiteLink = await prisma.voiceTextLink.findFirst({
      where: { restaurantId, kind: "custom", label: "Website" },
      select: { id: true },
    });
    if (existingWebsiteLink) {
      ops.push(prisma.voiceTextLink.update({ where: { id: existingWebsiteLink.id }, data: { url: website, active: true } }));
      websiteSaved = true;
    } else if (existingLinkCount < MAX_TEXT_LINKS) {
      ops.push(prisma.voiceTextLink.create({ data: { restaurantId, kind: "custom", label: "Website", url: website } }));
      websiteSaved = true;
    }
  }

  if (ops.length) await prisma.$transaction(ops);

  return NextResponse.json({ ok: true, faqCreated: created, faqUpdated: updated, websiteSaved });
}
