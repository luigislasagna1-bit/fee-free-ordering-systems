/** Live end-to-end check of the Uber Eats importer against a real store.
 *  Usage: npx tsx scripts/_uber-import-live.ts "<uber store url or uuid>" */
import { parseUberSource, fetchUberMenu, mapUberMenu } from "../src/lib/menu-import/ubereats";

async function main() {
  const input = process.argv[2] || "https://www.ubereats.com/ca/store/koozina/A3-4qfqIUWqTxgcHUiPbpw";
  const src = parseUberSource(input);
  console.log(`Store UUID: ${src.storeUuid} (locale ${src.localeCode})\nFetching…`);
  const t0 = Date.now();
  const menu = await fetchUberMenu(src, { onProgress: (d, t) => process.stdout.write(`\r  modifiers ${d}/${t}`) });
  const preview = mapUberMenu(menu);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const items = preview.categories.flatMap((c) => c.items);
  console.log("=== STATS ===");
  console.log(`menu: ${preview.sourceMenuName} | currency ${preview.currency}`);
  console.log(`categories: ${preview.stats.categories}`);
  console.log(`items: ${preview.stats.items}`);
  console.log(`modifier groups: ${preview.stats.modifierGroups}`);
  console.log(`modifier options: ${preview.stats.modifierOptions}`);
  console.log(`items with photo: ${items.filter((i) => i.sourceImageUrl).length}`);
  console.log(`items with modifiers: ${items.filter((i) => i.itemGroups.length).length}`);

  console.log("\n=== CATEGORIES ===");
  for (const c of preview.categories) {
    console.log(`  ${c.name} — ${c.items.length} items`);
  }

  console.log("\n=== SPOT CHECK: items with the most modifier groups ===");
  const richest = [...items].sort((a, b) => b.itemGroups.length - a.itemGroups.length).slice(0, 3);
  for (const it of richest) {
    console.log(`\n  ${it.name}  ($${it.basePrice.toFixed(2)})${it.sourceImageUrl ? "  [photo]" : ""}`);
    for (const g of it.itemGroups) {
      console.log(`     • ${g.name}  (min ${g.minSelect} / max ${g.maxSelect}${g.required ? ", required" : ""})`);
      for (const o of g.options.slice(0, 5)) {
        console.log(`         - ${o.name}${o.priceAdjustment ? ` +$${o.priceAdjustment.toFixed(2)}` : ""}`);
      }
      if (g.options.length > 5) console.log(`         …(+${g.options.length - 5} more)`);
    }
  }

  console.log("\n=== SPOT CHECK: a photo URL (would re-host to Blob) ===");
  const photo = items.find((i) => i.sourceImageUrl);
  console.log(`  ${photo?.name}: ${photo?.sourceImageUrl}`);

  // Sanity assertions
  const problems: string[] = [];
  if (preview.stats.categories < 1) problems.push("no categories");
  if (preview.stats.items < 1) problems.push("no items");
  if (items.some((i) => i.basePrice < 0)) problems.push("negative price");
  if (items.some((i) => !i.name)) problems.push("empty item name");
  console.log(`\n${problems.length ? "⚠ PROBLEMS: " + problems.join(", ") : "✅ No structural problems detected."}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
