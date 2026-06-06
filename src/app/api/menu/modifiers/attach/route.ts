import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { deleteModifierGroupsCascade } from "@/lib/modifier-delete";

// POST: attach a library modifier group to an item or category (creates a linked copy)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const blocked = await blockIfInheritingMenu(restaurantId);
    if (blocked) return blocked;

    const { libraryGroupId, menuItemId, categoryId } = await req.json();
    if (!libraryGroupId) return NextResponse.json({ error: "libraryGroupId required" }, { status: 400 });
    if (!menuItemId && !categoryId) return NextResponse.json({ error: "menuItemId or categoryId required" }, { status: 400 });

    // Fetch the library group — must be a restaurant-level library group
    const source = await prisma.modifierGroup.findFirst({
      where: { id: libraryGroupId, restaurantId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return NextResponse.json({ error: "Library group not found" }, { status: 404 });

    // Check not already attached
    const existing = await prisma.modifierGroup.findFirst({
      where: {
        libraryGroupId,
        ...(menuItemId ? { menuItemId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    });
    if (existing) return NextResponse.json({ error: "Already attached" }, { status: 409 });

    const siblingCount = await prisma.modifierGroup.count({
      where: menuItemId ? { menuItemId } : { categoryId },
    });

    const copy = await prisma.modifierGroup.create({
      data: {
        restaurantId: null,
        menuItemId: menuItemId || null,
        categoryId: categoryId || null,
        libraryGroupId: source.id,
        name: source.name,
        description: source.description,
        required: source.required,
        minSelect: source.minSelect,
        maxSelect: source.maxSelect,
        maxPerOption: source.maxPerOption,
        isHidden: source.isHidden,
        sortOrder: siblingCount,
        options: {
          create: source.options.map((opt, i) => ({
            name: opt.name,
            priceAdjustment: opt.priceAdjustment,
            isDefault: opt.isDefault,
            isAvailable: opt.isAvailable,
            sortOrder: i,
          })),
        },
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });

    // ── Cascade cleanup ────────────────────────────────────────────
    // When we just attached at the CATEGORY level, every item in that
    // category that ALREADY had a direct attachment of the same
    // library group now has it twice — once at item level (blue chip)
    // and once inherited from the category (green chip). The customer
    // sees both, which is a UX bug Luigi flagged 2026-06-01: "added
    // Cheese Options to the category but some items came out blue
    // and some green."
    //
    // Fix: delete the duplicate item-level attachments. The category
    // attachment becomes the single source of truth; every item in
    // the category will render the same inherited (green) chip.
    if (categoryId) {
      const itemIdsInCategory = await prisma.menuItem.findMany({
        where: { categoryId },
        select: { id: true },
      });
      const itemIds = itemIdsInCategory.map((i) => i.id);
      if (itemIds.length > 0) {
        const duplicates = await prisma.modifierGroup.findMany({
          where: {
            menuItemId: { in: itemIds },
            libraryGroupId,
            id: { not: copy.id }, // never the row we just created
          },
          select: { id: true },
        });
        if (duplicates.length > 0) {
          await prisma.modifierGroup.deleteMany({
            where: { id: { in: duplicates.map((d) => d.id) } },
          });
          console.log("[modifiers/attach] cleaned up", duplicates.length,
            "duplicate item-level attachments after category attach");
        }
      }
    }

    return NextResponse.json(copy, { status: 201 });
  } catch (e: any) {
    console.error("[modifiers/attach POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: detach a modifier group from an item or category.
// Works for:
//   - item-level library attachments (menuItemId set, libraryGroupId set)
//   - item-level direct modifiers (menuItemId set, no libraryGroupId)
//   - category-level attachments (categoryId set)
// Does NOT allow deleting restaurant-level library groups (those are deleted via /api/menu/modifiers/:id)
export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const blocked = await blockIfInheritingMenu(restaurantId);
    if (blocked) return blocked;

    const { groupId } = await req.json();
    if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

    // Find the group and verify it belongs to this restaurant via its item or category
    const group = await prisma.modifierGroup.findUnique({ where: { id: groupId } });
    if (!group) return NextResponse.json({ error: "Modifier group not found" }, { status: 404 });

    // Security: verify ownership. The group must be scoped to an item or category belonging to this restaurant,
    // OR be a direct restaurant-level group (library group).
    let authorized = false;

    if (group.restaurantId === restaurantId) {
      authorized = true; // it's a library group for this restaurant
    } else if (group.menuItemId) {
      const item = await prisma.menuItem.findFirst({ where: { id: group.menuItemId, restaurantId } });
      if (item) authorized = true;
    } else if (group.categoryId) {
      const cat = await prisma.menuCategory.findFirst({ where: { id: group.categoryId, restaurantId } });
      if (cat) authorized = true;
    }

    if (!authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Cascade-safe delete (nulls OrderItemModifier refs first) so detaching a
    // group that's been used on a real order doesn't fail on an FK constraint.
    await deleteModifierGroupsCascade([groupId]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[modifiers/attach DELETE]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
