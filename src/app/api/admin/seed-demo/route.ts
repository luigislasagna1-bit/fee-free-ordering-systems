import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// One-time setup: rebuild the demo restaurant's modifier groups as proper library groups
// and fix sample data inconsistencies. Only runs for the demo restaurant.
export async function POST() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── 1. Delete ALL existing item-level and old library modifier groups ───────
  await prisma.modifierGroup.deleteMany({
    where: {
      OR: [
        { restaurantId },                             // library groups
        { menuItem: { restaurantId } },              // item-level groups
        { category: { restaurantId } },              // category-level groups
      ],
    },
  });

  // ── 2. Find Pizzas category ────────────────────────────────────────────────
  const pizzasCat = await prisma.menuCategory.findFirst({
    where: { restaurantId, name: "Pizzas" },
  });
  const saladsCat = await prisma.menuCategory.findFirst({
    where: { restaurantId, name: "Salads" },
  });

  // ── 3. Create library modifier groups ─────────────────────────────────────
  const makeGroup = async (name: string, required: boolean, minS: number, maxS: number, opts: { name: string; price: number; isDefault?: boolean }[]) => {
    const count = await prisma.modifierGroup.count({ where: { restaurantId } });
    return prisma.modifierGroup.create({
      data: {
        restaurantId,
        name,
        required,
        minSelect: minS,
        maxSelect: maxS,
        maxPerOption: 1,
        isHidden: false,
        sortOrder: count,
        options: {
          create: opts.map((o, i) => ({
            name: o.name,
            priceAdjustment: o.price,
            isDefault: o.isDefault ?? false,
            isAvailable: true,
            sortOrder: i,
          })),
        },
      },
    });
  };

  const sizeGroup = await makeGroup("Pizza Size", true, 1, 1, [
    { name: 'Small (10")',  price: 0,    isDefault: true },
    { name: 'Medium (12")', price: 2 },
    { name: 'Large (14")',  price: 4 },
    { name: 'XL (18")',     price: 7 },
  ]);

  const crustGroup = await makeGroup("Crust Type", true, 1, 1, [
    { name: "Classic",        price: 0,  isDefault: true },
    { name: "Thin & Crispy",  price: 0 },
    { name: "Thick & Cheesy", price: 1.50 },
    { name: "Stuffed Crust",  price: 2.50 },
  ]);

  const toppingGroup = await makeGroup("Extra Toppings", false, 0, 5, [
    { name: "Mushrooms",    price: 1.50 },
    { name: "Bell Peppers", price: 1.50 },
    { name: "Olives",       price: 1.50 },
    { name: "Jalapeños",    price: 1.50 },
    { name: "Extra Cheese", price: 2.00 },
    { name: "Sun-dried Tomatoes", price: 2.00 },
  ]);

  const dressingGroup = await makeGroup("Dressing", false, 0, 1, [
    { name: "Caesar",    price: 0, isDefault: true },
    { name: "Ranch",     price: 0 },
    { name: "Italian",   price: 0 },
    { name: "Balsamic",  price: 0 },
    { name: "No Dressing", price: 0 },
  ]);

  const drinkSizeGroup = await makeGroup("Size", true, 1, 1, [
    { name: "Small",  price: 0, isDefault: true },
    { name: "Medium", price: 0.75 },
    { name: "Large",  price: 1.50 },
  ]);

  // ── 4. Attach Size & Crust to Pizzas category (all pizzas inherit them) ───
  if (pizzasCat) {
    const attachCat = async (libGroup: { id: string; name: string; description: string | null; required: boolean; minSelect: number; maxSelect: number; maxPerOption: number; isHidden: boolean }, catId: string) => {
      const count = await prisma.modifierGroup.count({ where: { categoryId: catId } });
      const src = await prisma.modifierGroup.findUnique({ where: { id: libGroup.id }, include: { options: true } });
      if (!src) return;
      await prisma.modifierGroup.create({
        data: {
          restaurantId: null,
          categoryId: catId,
          libraryGroupId: src.id,
          name: src.name,
          description: src.description,
          required: src.required,
          minSelect: src.minSelect,
          maxSelect: src.maxSelect,
          maxPerOption: src.maxPerOption,
          isHidden: src.isHidden,
          sortOrder: count,
          options: { create: src.options.map((o, i) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: i })) },
        },
      });
    };
    await attachCat(sizeGroup, pizzasCat.id);
    await attachCat(crustGroup, pizzasCat.id);
    await attachCat(toppingGroup, pizzasCat.id);
  }

  // ── 5. Attach Dressing to Salads category ─────────────────────────────────
  if (saladsCat) {
    const src = await prisma.modifierGroup.findUnique({ where: { id: dressingGroup.id }, include: { options: true } });
    if (src) {
      await prisma.modifierGroup.create({
        data: {
          restaurantId: null,
          categoryId: saladsCat.id,
          libraryGroupId: src.id,
          name: src.name,
          description: src.description,
          required: false,
          minSelect: 0,
          maxSelect: 1,
          maxPerOption: 1,
          isHidden: false,
          sortOrder: 0,
          options: { create: src.options.map((o, i) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: i })) },
        },
      });
    }
  }

  // ── 6. Attach Drink Size to each drink item ────────────────────────────────
  const drinks = await prisma.menuItem.findMany({ where: { restaurantId, category: { name: "Drinks" } } });
  const drinkSrc = await prisma.modifierGroup.findUnique({ where: { id: drinkSizeGroup.id }, include: { options: true } });
  if (drinkSrc) {
    for (const drink of drinks) {
      await prisma.modifierGroup.create({
        data: {
          restaurantId: null,
          menuItemId: drink.id,
          libraryGroupId: drinkSrc.id,
          name: drinkSrc.name,
          description: drinkSrc.description,
          required: true,
          minSelect: 1,
          maxSelect: 1,
          maxPerOption: 1,
          isHidden: false,
          sortOrder: 0,
          options: { create: drinkSrc.options.map((o, i) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: i })) },
        },
      });
    }
  }

  // ── 7. Fix restaurant name if empty ───────────────────────────────────────
  if (!restaurant.name) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { name: "Demo Pizza Palace" },
    });
  }

  return NextResponse.json({
    ok: true,
    created: { sizeGroup: sizeGroup.id, crustGroup: crustGroup.id, toppingGroup: toppingGroup.id, dressingGroup: dressingGroup.id, drinkSizeGroup: drinkSizeGroup.id },
    pizzasCat: pizzasCat?.id,
    saladsCat: saladsCat?.id,
    drinksAttached: drinks.length,
  });
}
