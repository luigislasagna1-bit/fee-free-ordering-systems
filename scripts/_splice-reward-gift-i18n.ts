/**
 * Splice the Gift-Reward-Dollars keys into all 37 non-English locale files:
 *   1. 21 admin keys  → admin.rewards, right after "signupBannerDesc" (matches en.json)
 *   2. 10 email keys  → email.rewardGiftInvite object, right after the
 *      email.rewardGift object (brace-tracked; anchor line `"rewardGift": {`)
 * Text-anchored + idempotent; single writer for this feature.
 *
 *   npx tsx scripts/_splice-reward-gift-i18n.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ADMIN_ORDER = [
  "giftTitle", "giftHelp", "giftSubtitle", "giftNamePlaceholder", "giftEmailPlaceholder",
  "giftAmountPlaceholder", "giftNotePlaceholder", "giftConsentReminder", "giftSend", "giftSending",
  "giftSentInstant", "giftSentPending", "giftValidation", "giftInvalidEmail", "giftFailed",
  "giftRevoke", "giftRevoked", "giftRevokeTooLate", "giftStatusPending", "giftStatusClaimed", "giftStatusRevoked",
];
const INVITE_ORDER = [
  ["inv_subject", "subject"], ["inv_preview", "preview"], ["inv_title", "title"],
  ["inv_greeting", "greeting"], ["inv_badge", "badge"], ["inv_body", "body"],
  ["inv_claimLine", "claimLine"], ["inv_howTo", "howTo"], ["inv_cta", "cta"],
  ["inv_ignoreLine", "ignoreLine"],
] as const;

const ADMIN_ANCHOR = /^(\s*)"signupBannerDesc"\s*:/;
const EMAIL_ANCHOR = /^(\s*)"rewardGift"\s*:\s*\{\s*$/;

const packDir = "scripts/i18n-data/reward-gift";
const codes = readdirSync(packDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let spliced = 0;
for (const code of codes) {
  const pack = JSON.parse(readFileSync(`${packDir}/${code}.json`, "utf8")) as Record<string, string>;
  const missing = [...ADMIN_ORDER, ...INVITE_ORDER.map(([k]) => k)].filter((k) => typeof pack[k] !== "string");
  if (missing.length) { console.error(`❌ ${code}: pack missing ${missing.join(", ")}`); process.exit(1); }

  const path = `src/messages/${code}.json`;
  const text = readFileSync(path, "utf8");
  if (text.includes('"giftTitle"') && text.includes('"rewardGiftInvite"')) {
    console.log(`• ${code}: already spliced, skipping`);
    continue;
  }
  const lines = text.split(/\r?\n/);

  // ── 1. admin.rewards gift* after "signupBannerDesc" ──
  if (!text.includes('"giftTitle"')) {
    const ai = lines.findIndex((l) => ADMIN_ANCHOR.test(l));
    if (ai === -1) { console.error(`❌ ${code}: no signupBannerDesc anchor`); process.exit(1); }
    const indent = (lines[ai].match(ADMIN_ANCHOR) as RegExpMatchArray)[1];
    const hasComma = /,\s*$/.test(lines[ai]);
    if (!hasComma) lines[ai] = lines[ai].replace(/\s*$/, "") + ",";
    const newLines = ADMIN_ORDER.map((k, i) => {
      const comma = !hasComma && i === ADMIN_ORDER.length - 1 ? "" : ",";
      return `${indent}${JSON.stringify(k)}: ${JSON.stringify(pack[k])}${comma}`;
    });
    lines.splice(ai + 1, 0, ...newLines);
  }

  // ── 2. email.rewardGiftInvite after the rewardGift object (brace-tracked) ──
  if (!text.includes('"rewardGiftInvite"')) {
    const ei = lines.findIndex((l) => EMAIL_ANCHOR.test(l));
    if (ei === -1) { console.error(`❌ ${code}: no "rewardGift": { anchor`); process.exit(1); }
    const indent = (lines[ei].match(EMAIL_ANCHOR) as RegExpMatchArray)[1];
    // Walk to the matching closing brace of the rewardGift object. Braces
    // inside JSON STRING values ("{amount}" ICU placeholders!) must not count —
    // track in-string state, honoring backslash escapes.
    let depth = 0, close = -1;
    for (let i = ei; i < lines.length; i++) {
      const line = lines[i];
      let inStr = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (inStr) {
          if (ch === "\\") j++; // skip escaped char
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { close = i; break; } }
      }
      if (close !== -1) break;
    }
    if (close === -1) { console.error(`❌ ${code}: unbalanced rewardGift object`); process.exit(1); }
    const closeHasComma = /,\s*$/.test(lines[close]);
    if (!closeHasComma) lines[close] = lines[close].replace(/\s*$/, "") + ",";
    const inner = indent + "  ";
    const obj: string[] = [`${indent}"rewardGiftInvite": {`];
    INVITE_ORDER.forEach(([packKey, jsonKey], i) => {
      const comma = i === INVITE_ORDER.length - 1 ? "" : ",";
      obj.push(`${inner}${JSON.stringify(jsonKey)}: ${JSON.stringify(pack[packKey])}${comma}`);
    });
    obj.push(`${indent}}${closeHasComma ? "," : ""}`);
    lines.splice(close + 1, 0, ...obj);
  }

  writeFileSync(path, lines.join("\n"), "utf8");
  spliced++;
  console.log(`✓ ${code}: spliced 21 admin + 10 email keys`);
}
console.log(`\nDone — spliced ${spliced} locale(s).`);
