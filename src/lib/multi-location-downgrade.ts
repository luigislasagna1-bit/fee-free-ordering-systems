import "server-only";
import prisma from "@/lib/db";
import { copyBrandMenuToLocation } from "@/lib/brand";

/**
 * Multi-Location downgrade cascade (Luigi 2026-06-15).
 *
 * When a brand PARENT's Multi-Location add-on lapses for non-payment and the
 * grace period expires, the brand can no longer manage a network — so the LIVE
 * inheritance link to each CHILD must be severed: children can't keep importing
 * menu / hours / zones from a parent that isn't paying. This is a big, cross-
 * restaurant downgrade, so the dunning cron also NOTIFIES each child owner (see
 * caller) — the child then either manages its own location or contacts the
 * brand to resolve.
 *
 * "Reset to self-managing" is done so each child keeps WORKING, never empties:
 *   - menu: if the child was on the brand menu, copy the brand menu into the
 *     child's OWN rows first (an editable starting point), then useBrandMenu=false.
 *   - hours / zones / availability: clear inheritedSettings → the child falls
 *     back to its OWN rows, which were cloned at creation (so never empty).
 *   - lockedSettings: cleared — a non-paying parent can no longer tie the
 *     child's hands.
 *
 * Idempotent + best-effort per child: a child already self-managing is a no-op,
 * and one child failing never aborts the rest.
 */

export interface AffectedChild {
  id: string;
  name: string;
  /** Child owner contact for the "your brand's add-on lapsed" notice. */
  email: string | null;
  defaultLanguage: string | null;
}

export async function cascadeMultiLocationDowngrade(parentId: string): Promise<AffectedChild[]> {
  const children = await prisma.restaurant.findMany({
    where: { parentRestaurantId: parentId },
    select: {
      id: true,
      name: true,
      email: true,
      defaultLanguage: true,
      useBrandMenu: true,
    },
  });

  for (const child of children) {
    try {
      if (child.useBrandMenu) {
        // Give the child a working, editable copy of the brand menu BEFORE we
        // cut the live link — otherwise flipping useBrandMenu off would leave
        // it with an empty menu. copyBrandMenuToLocation is idempotent.
        await copyBrandMenuToLocation(parentId, child.id).catch((e) => {
          console.error(`[dunning] copyBrandMenuToLocation failed for child ${child.id}`, e);
        });
      }
      await prisma.restaurant.update({
        where: { id: child.id },
        data: {
          useBrandMenu: false,
          // Empty maps ⇒ isInheriting() is false for every setting, so the
          // child reads its OWN hours/zones/availability rows from now on.
          inheritedSettings: {},
          lockedSettings: {},
        },
      });
    } catch (e) {
      console.error(`[dunning] multi-location cascade failed for child ${child.id}`, e);
    }
  }

  return children.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    defaultLanguage: c.defaultLanguage,
  }));
}
