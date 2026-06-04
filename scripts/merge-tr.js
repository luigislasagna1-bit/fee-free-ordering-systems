// Usage: node scripts/merge-tr.js <workflow-output-file> <dotted.namespace>
// Merges the workflow's translated keys into every src/messages/<code>.json
// under the given namespace. Idempotent; defensive HTML-entity unescaping.
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2];
const NS = process.argv[3];
if (!OUT || !NS) { console.error("args: <output-file> <namespace>"); process.exit(1); }

const MSG = path.join(__dirname, "..", "src", "messages");

function unescapeTags(s) {
  if (typeof s !== "string") return s;
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
function nsRef(root, dotted) {
  const parts = dotted.split(".");
  let o = root;
  for (const p of parts) { o[p] = o[p] || {}; o = o[p]; }
  return o;
}

const raw = JSON.parse(fs.readFileSync(OUT, "utf8"));
const arr = raw.result;
if (!Array.isArray(arr)) throw new Error("result is not an array");

let merged = 0;
const problems = [];
for (const item of arr) {
  if (!item || !item.code || !item.obj) { problems.push(`bad item`); continue; }
  const file = path.join(MSG, `${item.code}.json`);
  if (!fs.existsSync(file)) { problems.push(`${item.code}: missing file`); continue; }
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const target = nsRef(json, NS);
  for (const [k, v] of Object.entries(item.obj)) target[k] = unescapeTags(v);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  merged++;
}
console.log(`merged ${merged} locales into ${NS}`);
if (problems.length) { console.log("PROBLEMS:", problems.join("; ")); }
