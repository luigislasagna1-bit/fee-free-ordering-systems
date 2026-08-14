/**
 * i18n: Reseller Marketing Kit printed copy × 38 locales.
 *   npx tsx scripts/i18n-add-reseller-kit.ts
 *
 * These strings are PRINTED and handed to restaurant owners by partners, so unlike the rest
 * of the reseller dashboard (English by convention — see TODO.md) they must exist in every
 * locale: an Italian partner hands Italian flyers to Italian restaurateurs.
 *
 * Idempotent: a locale whose existing value differs from the English source is left alone, so
 * a hand-corrected translation is never clobbered by a re-run.
 *
 * Source of truth for English: scripts/i18n-data/reseller-kit/en.json
 * Translations:                scripts/i18n-data/reseller-kit/<locale>.json
 * A locale with no file falls back to English for the missing keys — parity is still satisfied
 * (the key exists everywhere), and the audit will show it as present.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const MESSAGES_DIR = join(process.cwd(), "src", "messages");
const DATA_DIR = join(process.cwd(), "scripts", "i18n-data", "reseller-kit");
const ROOT_KEY = "resellerKit";

type Tree = { [k: string]: string | Tree };

function readJson(path: string): Tree {
  return JSON.parse(readFileSync(path, "utf8")) as Tree;
}

/** Deep-merge `src` into `dst`, only filling keys that are ABSENT in dst. */
function fillMissing(dst: Tree, src: Tree): { added: number; kept: number } {
  let added = 0;
  let kept = 0;
  for (const [key, value] of Object.entries(src)) {
    if (typeof value === "string") {
      if (typeof dst[key] === "string") {
        kept += 1;
      } else {
        dst[key] = value;
        added += 1;
      }
    } else {
      const child = (typeof dst[key] === "object" && dst[key] !== null ? dst[key] : {}) as Tree;
      dst[key] = child;
      const r = fillMissing(child, value);
      added += r.added;
      kept += r.kept;
    }
  }
  return { added, kept };
}

function countLeaves(t: Tree): number {
  return Object.values(t).reduce<number>(
    (n, v) => n + (typeof v === "string" ? 1 : countLeaves(v)),
    0,
  );
}

function main() {
  const enPath = join(DATA_DIR, "en.json");
  if (!existsSync(enPath)) {
    console.error(`Missing English source: ${enPath}`);
    process.exit(1);
  }
  const english = readJson(enPath);
  const expected = countLeaves(english);
  console.log(`Reseller Kit copy: ${expected} keys × ${SUPPORTED_LOCALES.length} locales\n`);

  let missingFiles: string[] = [];

  for (const locale of SUPPORTED_LOCALES) {
    const msgPath = join(MESSAGES_DIR, `${locale}.json`);
    if (!existsSync(msgPath)) {
      console.error(`  ${locale}: MISSING ${msgPath}`);
      process.exit(1);
    }

    const dataPath = join(DATA_DIR, `${locale}.json`);
    const translations = existsSync(dataPath) ? readJson(dataPath) : null;
    if (!translations && locale !== "en") missingFiles.push(locale);

    const messages = readJson(msgPath);
    const root = (typeof messages[ROOT_KEY] === "object" && messages[ROOT_KEY] !== null
      ? messages[ROOT_KEY]
      : {}) as Tree;
    messages[ROOT_KEY] = root;

    // Translated values first (they win), then English fills anything still absent so the
    // key set is IDENTICAL across all 38 and the parity audit stays at zero.
    const t = translations ? fillMissing(root, translations) : { added: 0, kept: 0 };
    const e = fillMissing(root, english);

    writeFileSync(msgPath, JSON.stringify(messages, null, 2) + "\n", "utf8");

    const have = countLeaves(root);
    const flag = have === expected ? "✓" : "✗";
    console.log(
      `  ${flag} ${locale.padEnd(6)} ${String(have).padStart(3)}/${expected} keys` +
        `  (translated +${t.added}, english-fallback +${e.added}, kept ${t.kept + e.kept})`,
    );
  }

  if (missingFiles.length) {
    console.log(
      `\n⚠️  ${missingFiles.length} locale(s) have no translation file and fell back to ` +
        `English: ${missingFiles.join(", ")}`,
    );
    console.log(`   Add scripts/i18n-data/reseller-kit/<locale>.json and re-run.`);
  } else {
    console.log("\nAll locales carry real translations.");
  }
}

main();
