import { describe, expect, it } from "vitest";
import { hashJson, stableStringify } from "@/lib/voice/sim/snapshot-hash";
import { hydrateComboData, type MenuSnapshot } from "@/lib/voice/sim/snapshot-types";
import luigis from "@/lib/voice/sim/fixtures/luigis.menu.json";

/**
 * The hash is a CONTRACT between the snapshot script and the voice service:
 * both must produce the same `menuHash` for the same /menu body, one from the
 * object before JSON.stringify and one from the object after JSON.parse. These
 * pin the semantics (and one literal vector) so a re-implementation on the
 * service side can be checked against the same numbers.
 */
describe("stableStringify", () => {
  it("is key-order independent, recursively", () => {
    const a = { b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } };
    const b = { a: { c: 2, d: [1, { y: 2, z: 1 }] }, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('{"a":{"c":2,"d":[1,{"y":2,"z":1}]},"b":1}');
  });

  it("keeps array ORDER (arrays are data, not sets)", () => {
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });

  it("matches JSON.stringify semantics: undefined props dropped, Date → ISO, NaN → null", () => {
    const d = new Date("2026-08-15T00:00:00.000Z");
    expect(stableStringify({ x: undefined, y: 1 })).toBe('{"y":1}');
    expect(stableStringify({ d })).toBe(`{"d":"${d.toISOString()}"}`);
    expect(stableStringify([undefined, NaN])).toBe("[null,null]");
    // …so an object and its JSON round-trip hash identically (the whole point).
    const before = { z: d, a: [1, { q: undefined, p: "x" }] };
    const after = JSON.parse(JSON.stringify(before));
    expect(hashJson(before)).toBe(hashJson(after));
  });

  it("does not depend on the pretty `space` argument for the hash", () => {
    const v = { b: [1, 2], a: "x" };
    expect(hashJson(v)).toBe(hashJson(JSON.parse(stableStringify(v, 2))));
  });
});

describe("hashJson", () => {
  it("is sha256(stableStringify) truncated to 16 hex", () => {
    expect(hashJson({})).toMatch(/^[0-9a-f]{16}$/);
    // Pinned vector — sha256('{"a":1,"b":[1,2]}') starts 8baa73198470c7bb. If
    // this changes, the voice service's copy of the algorithm is out of step.
    expect(hashJson({ b: [1, 2], a: 1 })).toBe("8baa73198470c7bb");
    expect(hashJson({ a: 1, b: [1, 2] })).toBe("8baa73198470c7bb");
  });
});

describe("luigis.menu.json fixture", () => {
  const snap = luigis as unknown as MenuSnapshot;

  it("is a version-1 snapshot whose stored hashes match its contents", () => {
    expect(snap.version).toBe(1);
    expect(snap.slug).toBe("luigis-lasagna-pizzeria");
    expect(snap.restaurantId).toBe("cmp7xhd3900000al2jz0db5vi");
    expect(hashJson(snap.menu)).toBe(snap.menuHash);
    expect(hashJson({ menu: snap.menu, items: snap.items, combos: snap.combos, pricing: snap.pricing })).toBe(snap.hash);
  });

  it("carries the 2026-08-15 truncation markers on the real pizza list", () => {
    const pizzas = snap.menu.menu.flatMap((c) => c.items).filter((it) => it.isPizza && it.choiceNames);
    expect(pizzas.length).toBeGreaterThan(0);
    // Luigi's toppings group is 34 long: 12 shown + andMore: 22.
    const capped = pizzas.flatMap((it) => it.choiceNames ?? []).filter((g) => g.andMore);
    expect(capped.length).toBeGreaterThan(0);
    for (const g of capped) expect(g.options.length + (g.andMore ?? 0)).toBeGreaterThan(g.options.length);
  });

  it("every combo hydrates totally — every choiceId resolves, variant restrictions re-applied", () => {
    const ids = Object.keys(snap.combos);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const combo = hydrateComboData(snap, id);
      expect(combo.menuItemId).toBe(id);
      combo.slots.forEach((slot, i) => {
        const stored = snap.combos[id].slots[i];
        expect(slot.choices.map((c) => c.menuItemId)).toEqual(stored.choiceIds);
        for (const ch of slot.choices) {
          const allowed = stored.choiceVariantIds?.[ch.menuItemId];
          if (allowed) expect(ch.variants.map((v) => v.variantId)).toEqual(allowed);
          else expect(ch).toBe(snap.items[ch.menuItemId]);
        }
        expect(slot).not.toHaveProperty("choiceIds");
      });
    }
  });

  it("throws (never silently drops a pick) on a dangling reference", () => {
    const [id] = Object.keys(snap.combos);
    const broken: MenuSnapshot = {
      ...snap,
      combos: {
        [id]: {
          ...snap.combos[id],
          slots: snap.combos[id].slots.map((s) => ({ ...s, choiceIds: [...s.choiceIds, "nope"] })),
        },
      },
    };
    expect(() => hydrateComboData(broken, id)).toThrow(/missing from snapshot.items/);
    expect(() => hydrateComboData(snap, "no-such-combo")).toThrow(/no combo/);
  });
});
