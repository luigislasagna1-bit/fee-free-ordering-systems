// One-shot injector: add the 7 admin.menuEditor pizza-role keys to every
// non-English locale, inserted right after "canBeHalfHalf" (textual insert =
// minimal diff). Reads the translations straight from the translation
// workflow's output. Idempotent + JSON-validated before writing.
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/w6e94g0wo.output";
const TR = JSON.parse(readFileSync(SRC, "utf8")).result.translations;
const ORDER = ["pizzaRoleLabel", "pizzaRoleHint", "pizzaRoleNone", "pizzaRoleCrust", "pizzaRoleSauce", "pizzaRoleCheese", "pizzaRoleTopping"];

let ok = 0, skipped = 0;
const failed = [];
for (const t of TR) {
  const path = `src/messages/${t.locale}.json`;
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { failed.push(`${t.locale}: file not found`); continue; }
  if (raw.includes('"pizzaRoleLabel"')) { skipped++; continue; } // already injected
  for (const k of ORDER) if (typeof t[k] !== "string" || !t[k].trim()) { failed.push(`${t.locale}: missing ${k}`); }
  if (failed.some(f => f.startsWith(t.locale + ":"))) continue;

  const re = /^([ \t]*)"canBeHalfHalf"[ \t]*:[ \t]*("(?:[^"\\]|\\.)*")([ \t]*,?)[ \t]*$/m;
  const m = raw.match(re);
  if (!m) { failed.push(`${t.locale}: canBeHalfHalf anchor not found`); continue; }
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const indent = m[1];
  const hadComma = m[3].includes(",");
  const lineEnd = m.index + m[0].length;
  const vals = ORDER.map(k => `${indent}${JSON.stringify(k)}: ${JSON.stringify(t[k])}`);

  let next;
  if (hadComma) {
    const block = vals.map(v => v + ",").join(nl);
    next = raw.slice(0, lineEnd) + nl + block + raw.slice(lineEnd);
  } else {
    // canBeHalfHalf was the last key — give it a comma, omit it on our last line.
    const block = vals.map((v, i) => v + (i < vals.length - 1 ? "," : "")).join(nl);
    next = raw.slice(0, m.index) + m[0].replace(/[ \t]*$/, "") + "," + nl + block + raw.slice(lineEnd);
  }
  try { JSON.parse(next); } catch (e) { failed.push(`${t.locale}: invalid JSON after insert — ${e.message}`); continue; }
  writeFileSync(path, next, "utf8");
  ok++;
}
console.log(`pizzaRole inject — injected:${ok} skipped(existing):${skipped} failed:${failed.length} (of ${TR.length})`);
failed.forEach(f => console.log("  ✗ " + f));
process.exit(failed.length ? 1 : 0);
