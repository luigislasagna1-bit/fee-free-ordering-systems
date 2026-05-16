import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Whitelist of platform keys we accept. Anything else gets dropped silently to
// keep the JSON column tidy and prevent injection of arbitrary attributes.
const PLATFORM_KEYS = [
  "instagram", "facebook", "tiktok", "x", "youtube", "linkedin",
  "pinterest", "snapchat", "threads", "whatsapp",
  "yelp", "googleBusiness", "tripadvisor", "website",
] as const;

type Platform = (typeof PLATFORM_KEYS)[number];
type SocialLinks = Partial<Record<Platform, string>>;

function parse(raw: string | null | undefined): SocialLinks {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out: SocialLinks = {};
    for (const k of PLATFORM_KEYS) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { socialLinks: true, marketingTier: true },
  });
  return NextResponse.json({
    socialLinks: parse(r?.socialLinks),
    marketingTier: r?.marketingTier ?? "free",
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const incoming = (body?.socialLinks ?? {}) as Record<string, unknown>;

  const cleaned: SocialLinks = {};
  for (const k of PLATFORM_KEYS) {
    const v = incoming[k];
    if (typeof v === "string" && v.trim()) cleaned[k] = v.trim().slice(0, 500);
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { socialLinks: JSON.stringify(cleaned) },
  });

  return NextResponse.json({ success: true, socialLinks: cleaned });
}
