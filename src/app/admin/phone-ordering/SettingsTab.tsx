import prisma from "@/lib/db";
import { shouldDispatchToShipday } from "@/lib/shipday";
import NabilConfigClient from "./NabilConfigClient";

/**
 * Settings tab — server wrapper that loads the VoiceAgentConfig plus the
 * FAQ / text-link / blocked-caller lists, then hands everything to the
 * sub-tabbed client (General / Voice / Ordering / Payments / FAQ / Blocked).
 */
export default async function SettingsTab({ restaurantId }: { restaurantId: string }) {
  const [config, cashDeliveryBlocked, faqs, textLinks, blockedCallers] = await Promise.all([
    prisma.voiceAgentConfig.findUnique({ where: { restaurantId } }),
    shouldDispatchToShipday(restaurantId).catch(() => false),
    prisma.voiceFaq.findMany({
      where: { restaurantId },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, question: true, answer: true, category: true, source: true, active: true },
    }),
    prisma.voiceTextLink.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, kind: true, label: true, url: true, active: true },
    }),
    prisma.blockedCaller.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, phone: true, reason: true, createdAt: true },
    }),
  ]);

  return (
    <NabilConfigClient
      initialConfig={config as Record<string, unknown> | null}
      cashDeliveryBlocked={!!cashDeliveryBlocked}
      initialFaqs={faqs}
      initialTextLinks={textLinks}
      initialBlockedCallers={blockedCallers.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))}
    />
  );
}
