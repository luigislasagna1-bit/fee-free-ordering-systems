/** End-to-end: paste an Uber URL → resolver → sandbox commit → verify DB → clean up.
 *  Proves the FULL admin/public import path for Uber (not just the mapper).
 *  Run: node --env-file=.env.local --env-file=.env --import tsx scripts/_uber-import-e2e.ts */
import { buildImportPreview } from "../src/lib/menu-import/resolve";
import { provisionSandbox, commitSandboxMenu, deleteSandbox } from "../src/lib/menu-import/sandbox";
import prisma from "../src/lib/db";

async function main() {
  const url = process.argv[2] || "https://www.ubereats.com/ca/store/koozina/A3-4qfqIUWqTxgcHUiPbpw";
  console.log("Resolving:", url);
  const { source, preview, sourceLabel } = await buildImportPreview(url);
  console.log(`source=${source} label=${sourceLabel} → ${preview.stats.categories} cats / ${preview.stats.items} items / ${preview.stats.modifierGroups} groups / ${preview.stats.modifierOptions} opts`);

  let sandboxId: string | null = null;
  try {
    const sb = await provisionSandbox({
      restaurantName: preview.sourceMenuName || "Uber E2E",
      email: "uber-e2e@example.com",
      ipHash: "e2e-test-hash",
      sourceLabel,
    });
    sandboxId = sb.restaurantId;
    console.log(`\nprovisioned sandbox ${sb.slug} (${sb.restaurantId}) — committing…`);
    await commitSandboxMenu(sb.restaurantId, preview);

    // Verify what landed in the DB.
    const [cats, items, groups, opts, variants] = await Promise.all([
      prisma.menuCategory.count({ where: { restaurantId: sb.restaurantId } }),
      prisma.menuItem.count({ where: { restaurantId: sb.restaurantId } }),
      prisma.modifierGroup.count({ where: { restaurantId: sb.restaurantId } }),
      prisma.modifierOption.count({ where: { modifierGroup: { restaurantId: sb.restaurantId } } }),
      prisma.itemVariant.count({ where: { menuItem: { restaurantId: sb.restaurantId } } }),
    ]);
    console.log("\n=== DB AFTER COMMIT ===");
    console.log(`categories: ${cats}`);
    console.log(`items:      ${items}`);
    console.log(`variants:   ${variants}`);
    console.log(`mod groups: ${groups}  (library + attached)`);
    console.log(`mod options:${opts}`);

    // Spot-check a real item + its group.
    const sample = await prisma.menuItem.findFirst({
      where: { restaurantId: sb.restaurantId, name: "Greek Salad" },
      select: {
        name: true, price: true,
        modifierGroups: { select: { name: true, minSelect: true, maxSelect: true, options: { select: { name: true } } } },
      },
    });
    console.log("\n=== SPOT CHECK: Greek Salad ===");
    console.log(JSON.stringify(sample, null, 2));

    const ok = cats === preview.stats.categories && items === preview.stats.items;
    console.log(`\n${ok ? "✅ DB counts match the preview." : "⚠ COUNT MISMATCH vs preview"}`);
  } finally {
    if (sandboxId) {
      await deleteSandbox(sandboxId);
      console.log(`\ncleaned up sandbox ${sandboxId}`);
    }
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
