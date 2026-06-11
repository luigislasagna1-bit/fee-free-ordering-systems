import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerTemplate, kitchenTemplate, kitchenCopies, customerCopies, receiptLogoUrl } = await req.json();

  // Receipt-header logo — stored on Restaurant (one upload covers the printed
  // receipt, the editor preview and the email receipt). `null`/"" clears it.
  // Only http(s) or our own /uploads paths are accepted; anything else is
  // ignored rather than failing the whole template save. Luigi 2026-06-11.
  if (receiptLogoUrl !== undefined) {
    const v = typeof receiptLogoUrl === "string" ? receiptLogoUrl.trim() : "";
    const valid =
      v === "" ||
      ((v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/uploads/")) && v.length <= 500);
    if (valid) {
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { receiptLogoUrl: v === "" ? null : v },
      });
    }
  }

  const custExisting = await prisma.receiptTemplate.findFirst({ where: { restaurantId, type: "customer", isDefault: true } });
  if (custExisting) {
    await prisma.receiptTemplate.update({ where: { id: custExisting.id }, data: { template: JSON.stringify(customerTemplate) } });
  } else {
    await prisma.receiptTemplate.create({ data: { restaurantId, name: "Default Customer Receipt", type: "customer", isDefault: true, template: JSON.stringify(customerTemplate) } });
  }

  const kitExisting = await prisma.receiptTemplate.findFirst({ where: { restaurantId, type: "kitchen", isDefault: true } });
  if (kitExisting) {
    await prisma.receiptTemplate.update({ where: { id: kitExisting.id }, data: { template: JSON.stringify(kitchenTemplate) } });
  } else {
    await prisma.receiptTemplate.create({ data: { restaurantId, name: "Kitchen Receipt", type: "kitchen", isDefault: true, template: JSON.stringify(kitchenTemplate) } });
  }

  // Update print copy counts if provided
  if (kitchenCopies !== undefined || customerCopies !== undefined) {
    const data: Record<string, number> = {};
    if (kitchenCopies !== undefined) data.kitchenCopies = Math.min(10, Math.max(0, parseInt(kitchenCopies) || 1));
    if (customerCopies !== undefined) data.customerCopies = Math.min(10, Math.max(0, parseInt(customerCopies) || 1));
    await prisma.printerSettings.upsert({
      where: { restaurantId },
      update: data,
      create: { restaurantId, ...data },
    });
  }

  return NextResponse.json({ success: true });
}
