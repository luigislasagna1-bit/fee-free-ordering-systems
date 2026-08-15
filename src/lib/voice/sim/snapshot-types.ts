import type { ComboData, ComboSlotData, ItemData } from "@/lib/voice/order-line-compiler";
import type { VoiceMenuPayload } from "@/lib/voice/menu-payload";
import type { VoiceContextPayload } from "@/lib/voice/context-payload";

/**
 * A frozen, on-disk copy of everything the Nabil voice agent can see for one
 * restaurant — the `get_menu` payload, the `check_hours_and_services` payload,
 * and the `get_item_options` detail for EVERY orderable item — so the agent
 * can be exercised offline (simulator / regression tests) against the exact
 * data a real call would have had, without a database.
 *
 * Produced by `scripts/nabil-snapshot-menu.ts`; fixtures live in
 * `src/lib/voice/sim/fixtures/<slug>.menu.json`. Pure types + one pure
 * helper here — no Prisma, no Next — so the voice service and vitest can both
 * import this file.
 */

/** A combo slot as STORED: `choices` (full ItemData[]) is replaced by
 *  `choiceIds` pointing into `MenuSnapshot.items`, which keeps the fixture
 *  from repeating a 40-topping pizza once per slot that can hold it. */
export type SnapshotComboSlot = Omit<ComboSlotData, "choices"> & {
  /** Every eligible pick, by menuItemId — each id is guaranteed present in
   *  `MenuSnapshot.items` (the script loads any missing ones), so hydration
   *  is total. */
  choiceIds: string[];
  /** Only when the combo restricts which SIZES of a pick are orderable inside
   *  it (`comboAllowedVariantIds`): choiceId → allowed variantIds. Absent ⇒
   *  the pick keeps all of its variants. Kept so `hydrateComboData` rebuilds
   *  exactly what `loadComboData` returned — the order route 400s on a size
   *  outside that set, so a lossy fixture would let the simulator "sell" it. */
  choiceVariantIds?: Record<string, string[]>;
};

export type SnapshotComboData = Omit<ComboData, "slots"> & { slots: SnapshotComboSlot[] };

export type SnapshotPricing = {
  currency: string;
  taxRatePct: number | null;
  deliveryFee: number | null;
  minimumOrder: number | null;
  /** `context.delivery.zones` verbatim (name / minimumOrder / deliveryFee /
   *  estimatedMinutes) — typed loosely so a richer zone shape later doesn't
   *  invalidate old fixtures. */
  zones: unknown[];
};

/** Hand-curated test addresses (empty from the script). `zoneName` / `fee` are
 *  the EXPECTED answers a simulator asserts against, not data the agent reads. */
export type SnapshotAddress = {
  street: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  zoneName: string | null;
  fee: number | null;
};

export type MenuSnapshot = {
  version: 1;
  slug: string;
  restaurantId: string;
  /** After brand-menu inheritance — the restaurant whose menu rows were read.
   *  Same as `restaurantId` for a single-location store. */
  menuRestaurantId: string;
  /** ISO instant the snapshot was taken. Everything time-dependent in `menu`
   *  and `context` (open/closed, today's deals, `notToday`) was evaluated at
   *  this instant in the restaurant's timezone. */
  capturedAt: string;
  /** hashJson(menu) — the voice service computes the SAME over the /menu body
   *  it receives, so a fixture can be matched to (or aged out against) live. */
  menuHash: string;
  /** hashJson({ menu, items, combos, pricing }) — identity of the whole
   *  orderable surface, ignoring `context` (hours change every day). */
  hash: string;
  menu: VoiceMenuPayload;
  context: VoiceContextPayload;
  /** EVERY orderable item (simple, pizza, combo) — the `item` half of the
   *  `get_item_options` envelope, keyed by menuItemId. */
  items: Record<string, ItemData>;
  /** The `combo` half of `get_item_options` for every combo item, keyed by
   *  menuItemId, with slot choices stored as ids (see SnapshotComboSlot). */
  combos: Record<string, SnapshotComboData>;
  pricing: SnapshotPricing;
  addresses: SnapshotAddress[];
};

/**
 * Rebuilds the exact `ComboData` that `loadComboData` returned for combo
 * `id`, resolving each slot's `choiceIds` against `snapshot.items` (and
 * re-applying any per-pick variant restriction). Throws — rather than
 * silently dropping a pick — when a referenced item is missing, because a
 * fixture that "loses" a choice would make the simulator refuse food the
 * store sells, which is precisely the failure the fixture exists to catch.
 */
export function hydrateComboData(snapshot: MenuSnapshot, id: string): ComboData {
  const stored = snapshot.combos[id];
  if (!stored) throw new Error(`hydrateComboData: no combo ${id} in snapshot for ${snapshot.slug}`);
  const { slots, ...rest } = stored;
  return {
    ...rest,
    slots: slots.map(({ choiceIds, choiceVariantIds, ...slot }): ComboSlotData => ({
      ...slot,
      choices: choiceIds.map((cid) => {
        const item = snapshot.items[cid];
        if (!item) {
          throw new Error(`hydrateComboData: combo ${id} slot ${slot.id} references item ${cid} missing from snapshot.items`);
        }
        const allowed = choiceVariantIds?.[cid];
        return allowed
          ? { ...item, variants: item.variants.filter((v) => allowed.includes(v.variantId)) }
          : item;
      }),
    })),
  };
}
