// Quick smoke test of the GloriaFood mapper against Luigi's real menu.
// Run: node test-fixtures/test-mapper.mjs
import fs from "node:fs";

// Inline the mapper for now (avoid TS/tsx setup quirks)
const menu = JSON.parse(fs.readFileSync(new URL("./gloriafood-luigis-menu.json", import.meta.url), "utf8"));

function bitmaskToDaysJson(mask) {
  if (mask === 127 || mask === 0) return null;
  const days = [];
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) days.push(i);
  return days.length === 7 ? null : JSON.stringify(days);
}
function clampMoney(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100_000) return 100_000;
  return Math.round(v * 100) / 100;
}
function mapOption(o) {
  return { name: o.name, priceAdjustment: clampMoney(o.price), isDefault: !!o.default, isAvailable: !o.is_out_of_stock };
}
function mapGroup(g) {
  return {
    name: g.name, required: !!g.required, minSelect: g.force_min ?? 0,
    maxSelect: Math.max(1, g.force_max ?? 1),
    maxPerOption: g.allow_quantity ? 99 : 1,
    options: (g.options ?? []).map(mapOption),
  };
}

// Walk + stats (replicates the lib mapper's logic)
let stats = { categories: 0, items: 0, variants: 0, modifierGroups: 0, modifierOptions: 0, skippedInactive: 0, skippedHidden: 0 };
let bbqSample = null;
let heartSample = null;
let byopSample = null;

for (const cat of menu.categories) {
  if (!cat.active) { stats.skippedInactive++; continue; }
  stats.categories++;
  for (const item of cat.items) {
    if (!item.active) { stats.skippedInactive++; continue; }
    const hidden = item.hidden_until && new Date(item.hidden_until).getTime() > Date.now();
    if (hidden) stats.skippedHidden++;
    const sizes = item.sizes ?? [];
    const defSize = sizes.find(s => s.default) ?? sizes[0];
    const basePrice = clampMoney(defSize ? item.price + defSize.price : item.price);
    const variants = sizes.map(s => ({
      name: s.name, price: clampMoney(item.price + s.price),
      isDefault: !!s.default,
      groupCount: (s.groups ?? []).length,
    }));
    stats.variants += variants.length;
    const itemGroups = (item.groups ?? []).map(mapGroup);
    stats.modifierGroups += itemGroups.length;
    stats.modifierOptions += itemGroups.reduce((s, g) => s + g.options.length, 0);
    for (const s of sizes) {
      stats.modifierGroups += (s.groups ?? []).length;
      stats.modifierOptions += (s.groups ?? []).reduce((acc, g) => acc + (g.options ?? []).length, 0);
    }
    const samp = { name: item.name, description: item.description, basePrice, hidden, variants, itemGroupCount: itemGroups.length, availableDays: bitmaskToDaysJson(item.active_days) };
    if (item.name.includes("BBQ Chicken Pizza")) bbqSample = samp;
    if (item.name.includes("HEART") || item.name.includes("Heart")) heartSample = samp;
    if (item.name.includes("Build Your Own")) byopSample = samp;
    stats.items++;
  }
  for (const g of (cat.groups ?? [])) {
    stats.modifierGroups++;
    stats.modifierOptions += (g.options ?? []).length;
  }
}

console.log("STATS:", stats);
console.log("");
console.log("BBQ Chicken Pizza:", JSON.stringify(bbqSample, null, 2));
console.log("");
console.log("HEART SHAPED PIZZA:", JSON.stringify(heartSample, null, 2));
console.log("");
console.log("Build Your Own Pizza:", JSON.stringify(byopSample, null, 2));
