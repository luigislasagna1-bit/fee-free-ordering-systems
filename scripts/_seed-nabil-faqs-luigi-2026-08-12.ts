/**
 * Load Luigi's OWN 30 FAQs (migrated from his Loman dashboard) into VoiceFaq —
 * for LUIGI'S STORE ONLY, never platform-wide. Luigi asked for this explicitly
 * on 2026-08-12: "load all of these as FAQ for my store only (NOT FOR ALL STORES)".
 *
 * Safety properties:
 *  - Scoped by slug AND re-verified against the owner email before any write.
 *  - Idempotent: skips any question that already exists (case-insensitive).
 *  - NEVER deletes or overwrites an existing FAQ — an owner edit always wins.
 *  - Dry run by default. Pass --apply to write.
 *
 * Note the prompt only ever ships the first 30 active FAQs
 * (services/nabil-voice/src/prompt.ts → faqs.slice(0, 30), and the context route
 * takes 30 ordered by sortOrder), so sortOrder below is the priority order.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = "luigis-lasagna-pizzeria";
const EXPECT_EMAIL_DOMAIN = "luigislasagna";

type Faq = { q: string; a: string; category: string };

const FAQS: Faq[] = [
  // ── Operational / order status ────────────────────────────────────────────
  { q: "What is the status of my order?", category: "operational",
    a: "Your order is being worked on and sent out as soon as possible! Your food should arrive hot and fresh any minute now!" },
  { q: "I'm here to pick up my order after 1am.", category: "operational",
    a: "All pickups after 1am, including for uber drivers, or \"Too good to go pick up\" - please use the intercom by the front doors." },
  { q: "When can I pick up my \"too good to go\" orders?", category: "operational",
    a: "A Too good to go order must be picked up during the associated time frame with the order. You must come into the store with the app installed and ready to swipe for pick up on the app in the allotted time frame." },
  { q: "Do I need to wash the tray before returning?", category: "operational",
    // Loman's copy read "we'll take care of the restaurant" — an obvious typo for
    // "the rest", and Nabil would have read it aloud verbatim. Corrected.
    a: "No, you do not! Simply bring it back to the restaurant and we'll take care of the rest." },

  // ── Dietary / allergen ────────────────────────────────────────────────────
  { q: "Do you serve halal options?", category: "dietary",
    a: "Everything on our menu is halal and we do not carry any pork products in our store." },
  { q: "Do you offer gluten-free options?", category: "allergen",
    a: "Yes! We have a gluten-free pizza." },
  { q: "Do you offer vegan options?", category: "dietary",
    a: "Yes. I recommend using our vegan cheese on your pizzas or our famous vegan lasagna!" },
  { q: "Do you offer vegetarian options?", category: "dietary",
    a: "Yes! Some popular options include our vegetable lasagna, our ravioli, fettuccini, manicotti, spaghetti napoli, and our breads. We also have an option for veggie pizzas." },
  { q: "Is your poutine vegetarian?", category: "dietary",
    a: "Yes the gravy is completely vegetarian" },

  // ── Menu ──────────────────────────────────────────────────────────────────
  { q: "Do you have daily specials?", category: "business_info",
    a: "On Mondays, we offer a medium one topping pizza for only $8.99. Our Tuesday special is a large one topping pizza for $11.99. We Offer specials for Wednesday, Thursday and Friday available Online Only." },
  { q: "Do you have a chicken salad?", category: "business_info",
    a: "Yes many of our salads support adding chicken." },
  { q: "What kinds of wings do you have?", category: "business_info",
    a: "We offer regular wings, they are Baked and then fried to serve and they are not breaded." },
  { q: "What kinds of chicken toppings do you have?", category: "business_info",
    a: "We can only add regular chicken as a topping, shawarma chicken is a specialty pizza." },
  { q: "Do you have stuffed crust?", category: "business_info",
    a: "No unfortunately we don't offer stuffed crust" },
  { q: "Can I order pizza by the slice?", category: "deflection",
    a: "We offer a fresh variety of slices, but they cannot be ordered over the phone. Please place an order online or in person." },
  { q: "Do You Have a Super Party Pizza Challenge?", category: "business_info",
    a: "No, Unfortunately we no longer offer the super party challenge. Sorry about that" },

  // ── Delivery ──────────────────────────────────────────────────────────────
  { q: "What is the delivery fee?", category: "business_info",
    // CHANGED from Luigi's Loman copy ("Orders above $30 get free delivery,
    // otherwise the fee is $7.99"). That is only true in delivery zones 1-3 of
    // 8; zone 4 and beyond are charged $10.99-$49.99, so the original would have
    // promised free delivery to callers we then bill. See OWNER-ACTIONS T-O —
    // once Luigi decides to widen the zones or reword the promo, update this to
    // match, and keep the two in step.
    a: "Delivery is free on orders over $30 within our main delivery area. If you're further out, there's a delivery fee based on the distance - give me your address and I can check it for you." },
  { q: "Do you deliver outside of Milton?", category: "deflection",
    a: "Yes but deliveries outside of milton must be place on our website. Want me to send you a link to order online?" },

  // ── Scheduling / catering ─────────────────────────────────────────────────
  { q: "Can I schedule an order?", category: "deflection",
    a: "We only accept scheduled orders through our website. Would you like me to send you a link?" },
  { q: "Can I place an order for tomorrow night?", category: "deflection",
    a: "We only accept scheduled orders through our website. Would you like me to send you a link?" },
  { q: "Do you offer catering?", category: "deflection",
    a: "We do! Catering orders MUST be placed at least 48 hours in advance through our website. Would you like the link?" },

  // ── Business info ─────────────────────────────────────────────────────────
  { q: "Where are you located?", category: "business_info",
    a: "We are located in Downtown Milton at 17 Commercial Street, just south of the car wash." },
  { q: "Do you have parking?", category: "business_info",
    a: "Yes, our parking is located at the rear of our building, there is a driveway between us and the car wash which takes you to the back parking." },
  { q: "Are you open for the holidays?", category: "business_info",
    a: "Yes, we are open EVERY day of the year, we do not close for any holidays and operate regular hours." },
  { q: "Are you open on Christmas?", category: "business_info",
    a: "Yes we will be open on Christmas" },
  { q: "When was Luigi's founded?", category: "business_info",
    a: "We opened in 2014! We have never changed owners and we serve our authentic food using our original recipes which have never changed!" },
  { q: "Are there other locations?", category: "business_info",
    a: "No, We are currently only operating our Flagship Milton Location" },
  { q: "Is there outdoor seating or any pet friendly areas?", category: "business_info",
    a: "No, unfortunately we do not have any outdoor seating or pet friendly areas." },

  // ── Deflection / escalation ───────────────────────────────────────────────
  { q: "Can I ask about my UberEats order?", category: "deflection",
    a: "If you ordered through Ubereats, please reach out to them directly for assistance." },
  { q: "Can I speak to a human/manager/team member?", category: "escalation",
    a: "Sorry the team is focused on preparing delicious meals for our customers and cannot answer calls. Please direct any questions, concerns or requests to us via the contact us form on our website. I'll send you a link." },
];

const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 1000;

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true, slug: true, email: true },
  });
  if (!r) throw new Error(`Restaurant '${SLUG}' not found — refusing to write.`);
  // Belt and braces: Luigi was explicit that this is HIS store only.
  if (!(r.email ?? "").toLowerCase().includes(EXPECT_EMAIL_DOMAIN)) {
    throw new Error(`Owner email '${r.email}' doesn't look like Luigi's store — refusing to write.`);
  }
  console.log(`Target: ${r.name} (${r.slug}) <${r.email}>  id=${r.id}`);

  for (const f of FAQS) {
    if (f.q.length > MAX_QUESTION_CHARS) throw new Error(`Question too long: ${f.q}`);
    if (f.a.length > MAX_ANSWER_CHARS) throw new Error(`Answer too long for: ${f.q}`);
  }

  const existing = await prisma.voiceFaq.findMany({
    where: { restaurantId: r.id },
    select: { id: true, question: true },
  });
  const have = new Set(existing.map((e) => e.question.trim().toLowerCase()));
  console.log(`Existing FAQs on this store: ${existing.length}`);

  let created = 0, skipped = 0, sortOrder = 10;
  for (const f of FAQS) {
    const key = f.q.trim().toLowerCase();
    if (have.has(key)) { console.log(`  SKIP (already there) ${f.q}`); skipped++; sortOrder += 10; continue; }
    if (apply) {
      await prisma.voiceFaq.create({
        data: {
          restaurantId: r.id,
          question: f.q,
          answer: f.a,
          category: f.category,
          locale: "en",
          source: "owner",
          sortOrder,
          active: true,
        },
      });
    }
    console.log(`  ${apply ? "CREATED" : "would create"} [${f.category}] ${f.q}`);
    created++; sortOrder += 10;
  }

  const total = existing.length + (apply ? created : 0);
  console.log(`\n${apply ? "WROTE" : "DRY RUN"} — created ${created}, skipped ${skipped}, store total now ${total}`);
  console.log(`Prompt ships the first 30 active FAQs by sortOrder.${total > 30 ? "  ⚠️ OVER 30 — the tail will not reach Nabil." : ""}`);
  if (!apply) console.log("\nRe-run with --apply to write.");

  await prisma.$disconnect();
}
main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
