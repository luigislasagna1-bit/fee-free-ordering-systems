/**
 * One-shot: read the seo-content-author workflow output JSON and populate the data files.
 * - src/data/solution-pages.ts: replace the empty SOLUTION_PAGES array with feature+cms+city pages.
 * - src/data/competitors.ts: prepend the new competitor entries at the array open.
 * Prints the audit verdict. Run: npx tsx scripts/_assemble-seo-pages.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wi3kv576b.output";

const parsed = JSON.parse(readFileSync(OUT, "utf8"));
const r = parsed.result || parsed;

console.log("=== AUDIT VERDICT ===");
console.log(JSON.stringify(r.review, null, 2));

const solution = [...(r.feature || []), ...(r.cms || []), ...(r.city || [])];
const competitors = r.competitors || [];
console.log(
  `\nsolution: ${solution.length} (feature ${(r.feature || []).length} + cms ${(r.cms || []).length} + city ${(r.city || []).length}); new competitors: ${competitors.length}`,
);
console.log("solution slugs:", solution.map((p: any) => p.slug).join(", "));
console.log("competitor slugs:", competitors.map((c: any) => c.slug).join(", "));

// Audit fixes (v2): shorten over-long metaTitles (SERP truncation) + hedge one meta description.
const TITLE_FIX: Record<string, string> = {
  "qr-code-ordering": "QR Code Ordering for Restaurants | Fee Free Ordering",
  "pizza-ordering-system": "Pizza Ordering System Software | Fee Free Ordering",
  "scheduled-orders": "Scheduled Orders & Pre-Ordering | Fee Free Ordering",
  "restaurant-ordering-system": "Restaurant Ordering System | Fee Free Ordering",
  "restaurant-order-taking-app": "Restaurant Order-Taking App | Fee Free Ordering",
  "commission-free-food-ordering": "Commission-Free Food Ordering | Fee Free Ordering",
  "facebook-ordering": "Facebook Ordering for Restaurants | Fee Free Ordering",
};
for (const p of solution as any[]) {
  if (TITLE_FIX[p.slug]) p.metaTitle = TITLE_FIX[p.slug];
  if (p.slug === "food-delivery-system") {
    p.metaDescription =
      "A food delivery system for restaurants — your own delivery zones, fees, and ETAs at 0% commission on direct orders. Keep the margin delivery apps typically take.";
  }
}

// 1) solution-pages.ts
const SP = "src/data/solution-pages.ts";
let sp = readFileSync(SP, "utf8");
// Replace the whole SOLUTION_PAGES array (empty or already-populated) — idempotent across re-runs.
const re = /export const SOLUTION_PAGES: SolutionPage\[\] = [\s\S]*?;\n\nexport function getSolutionPage/;
if (!re.test(sp)) {
  console.error("FATAL: solution-pages.ts SOLUTION_PAGES array not found");
  process.exit(1);
}
sp = sp.replace(re, `export const SOLUTION_PAGES: SolutionPage[] = ${JSON.stringify(solution, null, 2)};\n\nexport function getSolutionPage`);
writeFileSync(SP, sp, "utf8");
console.log("\n✓ wrote", SP);

// 2) competitors.ts — prepend new entries right after the array open (avoids trailing-comma ambiguity)
const CP = "src/data/competitors.ts";
let cp = readFileSync(CP, "utf8").replace(/\r\n/g, "\n");
const open = "export const COMPETITORS: Competitor[] = [\n";
if (!cp.includes(open)) {
  console.error("FATAL: competitors.ts array-open marker not found");
  process.exit(1);
}
const block = "  " + competitors.map((c: any) => JSON.stringify(c, null, 2)).join(",\n  ") + ",\n";
cp = cp.replace(open, open + block);
writeFileSync(CP, cp, "utf8");
console.log("✓ wrote", CP, `(+${competitors.length} competitors)`);
console.log("\nDone.");
