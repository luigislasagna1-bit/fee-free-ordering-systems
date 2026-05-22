/**
 * Read-only inspection of recent StripeWebhookEvent rows on the active
 * DATABASE_URL (whichever one is uncommented in .env.local at run time).
 *
 * Shows:
 *   - last 20 events with type + status
 *   - event-type counts (last 7 days)
 *   - whether `setup_intent.succeeded` or `checkout.session.completed`
 *     have EVER been received
 *
 * Run: `npx tsx scripts/inspect-stripe-events.ts`
 *
 * To target the prod DB instead of dev: swap the active DATABASE_URL
 * line in .env.local before running. The script does NOT write to the
 * database.
 */
import prisma from "@/lib/db";

async function main() {
  const events = await prisma.stripeWebhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      stripeEventId: true,
      eventType: true,
      status: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  console.log(`Last ${events.length} StripeWebhookEvent rows:\n`);
  for (const e of events) {
    const date = e.createdAt.toISOString().slice(0, 19);
    const err = e.errorMessage ? `  ⚠ ${e.errorMessage.slice(0, 80)}` : "";
    console.log(`  ${date}  ${e.status.padEnd(20)} ${e.eventType}${err}`);
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const counts = await prisma.stripeWebhookEvent.groupBy({
    by: ["eventType"],
    _count: { _all: true },
    where: { createdAt: { gte: since } },
    orderBy: { _count: { eventType: "desc" } } as any,
  });

  console.log(`\nEvent type counts (last 7 days):\n`);
  for (const c of counts) {
    console.log(`  ${String(c._count._all).padStart(5)}  ${c.eventType}`);
  }

  const interesting = ["setup_intent.succeeded", "checkout.session.completed"];
  console.log(`\nKey events EVER received:\n`);
  for (const type of interesting) {
    const found = await prisma.stripeWebhookEvent.findFirst({
      where: { eventType: type },
      orderBy: { createdAt: "desc" },
    });
    console.log(`  ${type}: ${found ? `YES (last ${found.createdAt.toISOString().slice(0, 19)})` : "never"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
