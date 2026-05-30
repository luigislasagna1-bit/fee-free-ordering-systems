import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { syncPizzaConfigAttachments } from "@/lib/pizza-config";
import { blockIfInheritingMenu } from "@/lib/brand";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations can't create items — must customize first.
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = await req.json();
  const { name, description, price, categoryId, imageUrl, isHidden, isSoldOut,
          forPickup, forDelivery, isCatering, availableDays, availableFrom, availableTo,
          hasVariants, variants, pizzaConfig } = body;
  if (!name || price === undefined || !categoryId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  try {
    const existing = await prisma.menuItem.count({ where: { categoryId } });
    const item = await prisma.menuItem.create({
      data: {
        restaurantId, categoryId, name, description: description || null,
        price: parseFloat(price), imageUrl: imageUrl || null,
        isHidden: isHidden ?? false,
        isSoldOut: isSoldOut ?? false, forPickup: forPickup ?? true,
        forDelivery: forDelivery ?? true, isCatering: !!isCatering,
        hasVariants: hasVariants ?? false,
        availableDays: availableDays ? JSON.stringify(availableDays) : null,
        availableFrom: availableFrom || null, availableTo: availableTo || null,
        sortOrder: existing,
        pizzaConfig: pizzaConfig ?? null,
      },
    });

    // Create variants if provided
    if (hasVariants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        await prisma.itemVariant.create({
          data: { menuItemId: item.id, name: variants[i].name, price: parseFloat(variants[i].price), sortOrder: i, isDefault: i === 0 },
        });
      }
    }

    await syncPizzaConfigAttachments(item.id, restaurantId, pizzaConfig);

    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/menu/items]", e);
    return NextResponse.json({ error: e.message ?? "Database error" }, { status: 500 });
  }
}
