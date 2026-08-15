/**
 * Fixture integrity for the torture suite: every id a scenario expects must
 * exist in the menu snapshot it runs against, every option/topping name must
 * be a real option on that item, and every scenario id must be unique. Fails
 * LOUDLY when the menu changes underneath the suite, instead of letting the
 * suite quietly fail for the wrong reason.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_SCENARIOS, CRITICAL, INJECTION } from "./scenarios/index";
import { L } from "./scenarios/luigis-ids";
import type { CanonicalLine, CanonicalPick, MenuSnapshot } from "./snapshot-types";

const snap: MenuSnapshot = JSON.parse(readFileSync(join(__dirname, "fixtures", "luigis.menu.json"), "utf8"));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function optionNames(itemId: string): Set<string> {
  const it = snap.items[itemId];
  const out = new Set<string>();
  for (const g of it?.modifierGroups ?? []) for (const o of g.options) out.add(norm(o.name));
  return out;
}
function variantNames(itemId: string): Set<string> {
  return new Set((snap.items[itemId]?.variants ?? []).map((v) => norm(v.name)));
}

function checkLine(l: CanonicalLine | CanonicalPick, where: string) {
  const ids = [l.item, ...((l as any).itemAlt ?? [])];
  for (const id of ids) expect(snap.items[id], `${where}: unknown item id ${id}`).toBeTruthy();
  const opts = optionNames(l.item);
  for (const o of l.options) expect(opts.has(norm(o)), `${where}: option "${o}" not on ${snap.items[l.item]?.name}`).toBe(true);
  if (l.halves) {
    for (const side of ["left", "right", "whole"] as const) {
      for (const t of l.halves[side]) {
        const bare = t.replace(/^\d+x\s*/, "");
        expect(opts.has(norm(bare)), `${where}: topping "${t}" not on ${snap.items[l.item]?.name}`).toBe(true);
      }
    }
  }
  if ((l as CanonicalLine).size) {
    const vs = variantNames(l.item);
    if (vs.size) expect(vs.has(norm((l as CanonicalLine).size!)), `${where}: size "${(l as CanonicalLine).size}" not a variant of ${snap.items[l.item]?.name}`).toBe(true);
  }
  for (const p of (l as CanonicalLine).picks ?? []) checkLine(p, `${where} pick ${p.slot}`);
}

describe("torture-suite fixture integrity", () => {
  it("every id in luigis-ids exists in the snapshot", () => {
    for (const [k, v] of Object.entries(L)) {
      if (k === "restaurant") continue;
      expect(snap.items[v], `L.${k} = ${v} missing from fixture`).toBeTruthy();
    }
  });
  it("scenario ids are unique and suites are populated", () => {
    const ids = ALL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CRITICAL.length).toBeGreaterThanOrEqual(25);
    expect(INJECTION.length).toBe(10);
  });
  for (const s of ALL_SCENARIOS) {
    it(`${s.id}: expected cart is expressible on the ${s.restaurant} menu`, () => {
      expect(s.restaurant).toBe("luigis");
      for (const [i, line] of s.expected.cart.lines.entries()) checkLine(line, `${s.id} line ${i + 1}`);
      if (s.caller.mode === "script") expect(s.caller.turns.length).toBeGreaterThan(0);
    });
  }
  it("combo picks reference real slot choices", () => {
    for (const s of ALL_SCENARIOS) {
      for (const line of s.expected.cart.lines) {
        if (!line.picks) continue;
        const combo = snap.combos[line.item];
        expect(combo, `${s.id}: ${line.item} is not a combo`).toBeTruthy();
        const allChoices = new Set(combo.slots.flatMap((sl) => sl.choiceIds));
        for (const p of line.picks) expect(allChoices.has(p.item), `${s.id}: pick ${p.item} not a choice of ${combo.name}`).toBe(true);
      }
    }
  });
});
