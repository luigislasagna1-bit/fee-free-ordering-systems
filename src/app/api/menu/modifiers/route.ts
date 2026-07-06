import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu, resolveMenuRestaurantId } from "@/lib/brand";

// Modifier groups library: GET all, POST new
export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations read the parent's modifier library (same as menu).
  const menuRestaurantId = await resolveMenuRestaurantId(restaurantId);
  const groups = await prisma.modifierGroup.findMany({
    where: { restaurantId: menuRestaurantId, menuItemId: null },
    orderBy: { sortOrder: "asc" },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = await req.json();
  const { name, description, required, minSelect, maxSelect, maxPerOption, isHidden,
          supportsHalfHalf, pizzaRole, menuItemId, variantId, categoryId, options } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Ownership (stabilization C2): a target item/category/variant supplied in the
  // body MUST belong to the caller's restaurant. Previously honored blindly — an
  // admin could attach a priced (required) group to ANOTHER restaurant's item/
  // category, overcharging that restaurant's customers on its own Stripe (IDOR).
  // POST is blocked for inheriting locations above, so the caller owns its menu
  // directly under restaurantId.
  if (menuItemId && !(await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (categoryId && !(await prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (variantId && !(await prisma.itemVariant.findFirst({ where: { id: variantId, menuItem: { restaurantId } }, select: { id: true } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const count = await prisma.modifierGroup.count({ where: { restaurantId } });

  // If menuItemId provided, it's item-scoped; otherwise library group
  const group = await prisma.modifierGroup.create({
    data: {
      restaurantId: menuItemId ? null : restaurantId,
      menuItemId: menuItemId || null,
      variantId: variantId || null,
      categoryId: categoryId || null,
      name: name.trim(),
      description: description || null,
      required: required ?? false,
      minSelect: minSelect ?? 0,
      maxSelect: maxSelect ?? 1,
      maxPerOption: maxPerOption ?? 1,
      isHidden: isHidden ?? false,
      supportsHalfHalf: supportsHalfHalf ?? false,
      pizzaRole: pizzaRole || null,
      sortOrder: count,
    },
    include: { options: true },
  });

  // Create options if provided
  if (Array.isArray(options)) {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      await prisma.modifierOption.create({
        data: {
          modifierGroupId: group.id,
          name: opt.name,
          priceAdjustment: parseFloat(opt.priceAdjustment ?? 0),
          isDefault: opt.isDefault ?? false,
          isAvailable: opt.isAvailable ?? true,
          sortOrder: i,
        },
      });
    }
  }

  const full = await prisma.modifierGroup.findUnique({
    where: { id: group.id },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(full, { status: 201 });
}
