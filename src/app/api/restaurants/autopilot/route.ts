import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

const CAMPAIGN_TYPES = ["second_order", "cart_abandonment", "reengagement"] as const;

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.autopilotCampaign.findMany({ where: { restaurantId } });

  // Return all 3 campaign types, creating defaults for missing ones
  const campaigns = CAMPAIGN_TYPES.map(type => {
    const found = existing.find(c => c.campaignType === type);
    return found ?? {
      id: null, restaurantId, campaignType: type,
      isEnabled: false, subject: "", emailBody: "", delayHours: type === "cart_abandonment" ? 2 : 24, couponId: null,
    };
  });

  return NextResponse.json(campaigns);
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignType, isEnabled, subject, emailBody, delayHours, couponId } = await req.json();
  if (!campaignType) return NextResponse.json({ error: "campaignType required" }, { status: 400 });

  const campaign = await prisma.autopilotCampaign.upsert({
    where: { restaurantId_campaignType: { restaurantId, campaignType } },
    update: { isEnabled, subject: subject ?? "", emailBody: emailBody ?? "", delayHours: delayHours ?? 24, couponId: couponId ?? null },
    create: { restaurantId, campaignType, isEnabled: isEnabled ?? false, subject: subject ?? "", emailBody: emailBody ?? "", delayHours: delayHours ?? 24, couponId: couponId ?? null },
  });

  return NextResponse.json(campaign);
}
