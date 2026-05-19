import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { syncPizzaConfigAttachments } from "@/lib/pizza-config";
import { blockIfInheritingMenu } from "@/lib/brand";

async function getRestaurantId() {
  const user = await getSessionUser();
  return user?.restaurantId;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
      modifierGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  const body = await req.json();
  const { name, description, price, categoryId, imageUrl, isAvailable, isFeatured, isHidden,
          isSoldOut, forPickup, forDelivery, availableDays, availableFrom, availableTo,
          hasVariants, sortOrder, variants, pizzaConfig } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description || null;
  if (price !== undefined) updateData.price = parseFloat(price);
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
  if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
  if (isHidden !== undefined) updateData.isHidden = isHidden;
  if (isSoldOut !== undefined) updateData.isSoldOut = isSoldOut;
  if (forPickup !== undefined) updateData.forPickup = forPickup;
  if (forDelivery !== undefined) updateData.forDelivery = forDelivery;
  if (availableDays !== undefined) updateData.availableDays = availableDays ? JSON.stringify(availableDays) : null;
  if (availableFrom !== undefined) updateData.availableFrom = availableFrom;
  if (availableTo !== undefined) updateData.availableTo = availableTo;
  if (hasVariants !== undefined) updateData.hasVariants = hasVariants;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  // pizzaConfig: null clears the pizza builder; a JSON string enables it
  if (pizzaConfig !== undefined) updateData.pizzaConfig = pizzaConfig;

  try {
    await prisma.menuItem.updateMany({ where: { id, restaurantId }, data: updateData });

    // Sync variants if provided
    if (hasVariants && Array.isArray(variants)) {
      await prisma.itemVariant.deleteMany({ where: { menuItemId: id } });
      for (let i = 0; i < variants.length; i++) {
        await prisma.itemVariant.create({
          data: { menuItemId: id, name: variants[i].name, price: parseFloat(variants[i].price), sortOrder: i, isDefault: i === 0 },
        });
      }
    }

    if (pizzaConfig !== undefined) {
      await syncPizzaConfigAttachments(id, restaurantId, pizzaConfig);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /api/menu/items/:id]", e);
    return NextResponse.json({ error: e.message ?? "Database error" }, { status: 500 });
  }
}

// Full update (same as PATCH but semantically a full replace)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return PATCH(req, { params });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    await prisma.menuItem.deleteMany({ where: { id, restaurantId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/menu/items/:id]", e);
    return NextResponse.json({ error: e.message ?? "Delete failed" }, { status: 500 });
  }
}
