/** Code → messages audit: verify every static t("literal") call in src/
 *  resolves to a real key in en.json. Complements i18n-audit.ts (which
 *  checks locale-file parity but never looks at the code).
 *
 *  A missing key does NOT throw in prod — next-intl renders the raw key
 *  path ("admin.foo.bar") in the UI, in every language. We shipped that
 *  bug twice (profile/services sweep, then 5 more singletons) before
 *  this audit existed.
 *
 *  Shadowing-aware: a variable name may be bound to different namespaces
 *  in different components within one file (CheckoutModal binds `tc` to
 *  "checkout" AND "common"). A key counts as resolved if it exists under
 *  ANY namespace bound to that variable name in the file.
 *
 *  Limitation: template-literal keys (t(`campaign_${type}_title`)) are
 *  skipped — their domains can't be enumerated statically. When adding a
 *  dynamic key pattern, eyeball that every possible value has messages
 *  (see the enumerations checked manually on 2026-06-12: autopilot
 *  campaign types, METHOD_IDS, pricing add-on slugs, info.days 0-6).
 *
 *    npx tsx scripts/i18n-audit-keys.ts        # exit 1 if anything is missing
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const en = JSON.parse(readFileSync(join("src", "messages", "en.json"), "utf8"));
function hasKey(dotted: string): boolean {
  let cur: unknown = en;
  for (const p of dotted.split(".")) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else return false;
  }
  return typeof cur === "string";
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(fp, acc);
    } else if (/\.(tsx|ts)$/.test(e.name)) acc.push(fp);
  }
  return acc;
}

const missing: { file: string; key: string; namespaces: string }[] = [];
let files = 0;

for (const f of walk("src")) {
  files++;
  const src = readFileSync(f, "utf8");
  const nsMap = new Map<string, Set<string>>();
  for (const m of src.matchAll(
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  )) {
    if (!nsMap.has(m[1])) nsMap.set(m[1], new Set());
    nsMap.get(m[1])!.add(m[2]);
  }
  for (const [v, namespaces] of nsMap) {
    // ['"$] in the key class excludes template literals (dynamic keys).
    const re = new RegExp("\\b" + v + "(?:\\.rich)?\\(\\s*['\"]([^'\"$]+)['\"]", "g");
    for (const m of src.matchAll(re)) {
      const resolvable = [...namespaces].some((ns) => hasKey(`${ns}.${m[1]}`));
      if (!resolvable) {
        missing.push({ file: f.replace(/\\/g, "/"), key: m[1], namespaces: [...namespaces].join("|") });
      }
    }
  }
}

console.log(`Scanned ${files} files under src/.`);
if (missing.length) {
  console.log(`✗ ${missing.length} t() call(s) reference keys that do not exist in en.json:`);
  for (const m of missing) console.log(`  ${m.namespaces}.${m.key}   (${m.file})`);
  process.exit(1);
}
console.log('✓ Every static t("literal") call resolves to a real en.json key.');
