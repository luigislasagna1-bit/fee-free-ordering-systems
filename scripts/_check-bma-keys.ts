/** Static check: every t("key") call in the Branded Mobile App surfaces
 *  resolves against en.json (tsc can't validate message keys —
 *  MISSING_MESSAGE is a runtime error). Clone of _check-mkt-account-keys.ts
 *  scoped to the BMA trees. Dynamic keys (t(`events.${...}`)) are checked
 *  separately below against the messageKey catalogs. */
import { readFileSync } from "node:fs";
import { globSync } from "glob";

const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));
const files = globSync("src/app/admin/mobile-app/**/*.tsx")
  .concat(globSync("src/app/superadmin/branded-apps/**/*.tsx"))
  .concat(globSync("src/app/order/[slug]/account/PushPrefsToggle.tsx"))
  .concat(globSync("src/components/PushPermissionPrompt.tsx"));

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
      if (!resolve(full)) { console.log(`MISSING ${file}: ${name}("${m[1]}") -> ${full}`); missing++; }
    }
  }
}

// Dynamic event keys: every messageKey the server can emit must exist under
// admin.brandedApp.events.* (StatusView renders t(`events.${messageKey}`)).
const eventKeys = Object.keys(en.admin.brandedApp.events ?? {});
const serverSrc = ["src/lib/branded-app/project.ts", "src/app/api/admin/mobile-app/approve/route.ts", "src/app/api/superadmin/branded-apps/[id]/route.ts"]
  .map((f) => readFileSync(f, "utf8")).join("\n");
const emitted = [...serverSrc.matchAll(/messageKey:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]);
for (const k of new Set(emitted)) {
  checked++;
  if (!eventKeys.includes(k)) { console.log(`MISSING event key: admin.brandedApp.events.${k}`); missing++; }
}
// Status label/body keys for all 7 statuses (StatusView + queue render these
// dynamically from the status string).
for (const s of ["draft", "submitted", "needs_owner", "building", "in_store_review", "live", "suspended"]) {
  const camel = s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  const pascal = camel[0].toUpperCase() + camel.slice(1);
  // Both namespaces key on statusLabelKey()'s "status<Pascal>" form.
  for (const key of [`admin.brandedApp.status.status${pascal}`, `admin.brandedApp.statusBody.status${pascal}`]) {
    checked++;
    if (!resolve(key)) { console.log(`MISSING status key: ${key}`); missing++; }
  }
}
console.log(`${checked} call sites checked across ${files.length} files - ${missing} missing`);
process.exitCode = missing ? 1 : 0;
