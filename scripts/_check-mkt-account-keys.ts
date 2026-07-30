/** Static check: every t("key") call in the marketplace /account tree resolves
 *  against en.json (tsc can't validate message keys — MISSING_MESSAGE is a
 *  runtime error). Parses translator declarations + their call sites. */
import { readFileSync } from "node:fs";
import { globSync } from "glob";

const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));
const files = globSync("src/app/account/**/*.tsx");

function resolve(path: string): boolean {
  let node: any = en;
  for (const p of path.split(".")) {
    if (node == null || typeof node !== "object" || !(p in node)) return false;
    node = node[p];
  }
  return typeof node === "string";
}

let missing = 0, checked = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const translators: Record<string, string> = {};
  const declRe = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+getTranslations|useTranslations)\(\s*(?:"([^"]*)"|)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) translators[m[1]] = m[2] ?? "";
  for (const [name, ns] of Object.entries(translators)) {
    const callRe = new RegExp(`\\b${name}(?:\\.rich|\\.has|\\.markup)?\\(\\s*"([^"]+)"`, "g");
    while ((m = callRe.exec(src))) {
      const full = ns ? `${ns}.${m[1]}` : m[1];
      checked++;
      if (!resolve(full)) { console.log(`❌ ${file}: ${name}("${m[1]}") → ${full} MISSING`); missing++; }
    }
  }
}
console.log(`${checked} call sites checked across ${files.length} files — ${missing} missing`);
process.exitCode = missing ? 1 : 0;
