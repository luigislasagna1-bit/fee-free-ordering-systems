/**
 * Menu change log (Fabrizio 2026-07-08) — an append-only audit of owner edits in
 * the menu editor, so the owner can see WHAT changed and WHEN. Phase 1 covers
 * create / update / delete of menu ITEMS and CATEGORIES with a human summary.
 *
 * FIRE-AND-FORGET: a log write must NEVER break the edit it describes, so every
 * call is wrapped in try/catch and awaited-but-swallowed. Writes land only in the
 * dedicated MenuChangeLog side-table (never a customer hot path).
 */
import prisma from "@/lib/db";
import type { SessionUser } from "@/lib/session";

export type MenuChangeAction = "create" | "update" | "delete" | "duplicate" | "import";
export type MenuChangeEntity = "item" | "category" | "modifier_group" | "modifier_option" | "attachment";

export async function logMenuChange(opts: {
  user: SessionUser;
  restaurantId: string;
  entityType: MenuChangeEntity;
  entityId?: string | null;
  entityName?: string | null;
  action: MenuChangeAction;
  summary: string;
}): Promise<void> {
  try {
    await prisma.menuChangeLog.create({
      data: {
        restaurantId: opts.restaurantId,
        actorUserId: opts.user.id ?? null,
        actorEmail: (opts.user.email ?? "").toLowerCase(),
        actorName: opts.user.name ?? null,
        // Record HOW the edit was made when it was via impersonation, so a
        // superadmin/reseller acting on the owner's behalf is visible in the log.
        viaImpersonation: opts.user.isImpersonating ? (opts.user.impersonationMode ?? "impersonation") : null,
        entityType: opts.entityType,
        entityId: opts.entityId ?? null,
        entityName: opts.entityName ?? null,
        action: opts.action,
        summary: opts.summary.slice(0, 500),
      },
    });
  } catch (err) {
    // Never let an audit failure break the actual menu edit.
    console.error("[menu-change-log] write failed", err);
  }
}

/** Build a short "which fields changed" clause from the keys the caller actually
 *  set in its update payload (no extra query). e.g. ["price","forDelivery"] →
 *  "price, delivery". Keeps the summary readable without a full field diff. */
export function changedFieldsSummary(fields: string[]): string {
  const label: Record<string, string> = {
    price: "price", name: "name", description: "description", imageUrl: "image",
    isHidden: "visibility", visibility: "visibility", isSoldOut: "sold-out",
    forPickup: "pickup", forDelivery: "delivery", isCatering: "catering",
    fulfilment: "availability", pinnedToTop: "pinned", accentColor: "colour",
    isRefundableDeposit: "deposit", depositAmount: "deposit amount",
    hasVariants: "sizes", availableDays: "availability",
  };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fields) {
    const l = label[f] ?? f;
    if (!seen.has(l)) { seen.add(l); out.push(l); }
  }
  return out.join(", ");
}
