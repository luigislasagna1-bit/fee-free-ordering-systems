/**
 * Local end-to-end test for the Claude menu extractor.
 * Reads a PDF from disk, runs it through extractMenuWithClaude, prints the
 * structured output so we can eyeball accuracy before exposing the API to
 * users.
 *
 * Usage:
 *   npx tsx scripts/test-menu-extractor.ts "/c/Users/luigi/Downloads/Luigis Menu.pdf"
 */
import { config as dotenvConfig } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { extractMenuWithClaude } from "../src/lib/menu-extractor";

dotenvConfig({ path: ".env.local" });

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/test-menu-extractor.ts <pdf-path>");
  process.exit(1);
}

async function main() {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(abs);
  console.log(`File: ${abs}`);
  console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`Sending to Claude...\n`);

  const start = Date.now();
  const categories = await extractMenuWithClaude(buffer);
  const elapsed = Date.now() - start;

  console.log(`Done in ${elapsed}ms\n`);
  console.log(`Extracted ${categories.length} categories, ${categories.reduce((s, c) => s + c.items.length, 0)} items total:\n`);

  for (const cat of categories) {
    console.log(`▸ ${cat.name}  (${cat.items.length} items)`);
    for (const item of cat.items) {
      const desc = item.description ? `  — ${item.description.slice(0, 60)}${item.description.length > 60 ? "…" : ""}` : "";
      console.log(`    $${item.price.toFixed(2).padStart(7)}  ${item.name}${desc}`);
    }
    console.log("");
  }
}

main().catch((e) => { console.error("ERROR:", e?.message ?? e); process.exit(1); });
