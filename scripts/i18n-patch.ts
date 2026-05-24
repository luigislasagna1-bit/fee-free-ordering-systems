/**
 * One-shot i18n gap patcher.
 *
 * Takes a per-locale dictionary of key → translation and writes it back
 * into src/messages/<loc>.json, preserving the existing structure and
 * indentation. Idempotent — running twice produces the same result.
 *
 * Used by #65 to fill the genuine gaps surfaced by i18n-audit.ts (the
 * 2 missing checkout.cardOnPickup/cardOnDelivery keys + a handful of
 * words that need actual translation like Catering / Canada).
 *
 * Skipped: the bulk of "untranslated" hits from the audit which are
 * legitimately the same word across languages (Total, Subtotal, Menu,
 * Type, Status, Notes, Description, Banner, Logo, Slogan, CVC, Sauce —
 * all valid in fr/es/it/pt unchanged in the restaurant/tech context).
 *
 * Run: npx tsx scripts/i18n-patch.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = join(process.cwd(), "src", "messages");

/** Per-locale translation patches. Outer key = locale; inner = dotted key path. */
const PATCHES: Record<string, Record<string, string>> = {
  fr: {
    "checkout.cardOnPickup":     "Paiement par carte au retrait",
    "checkout.cardOnDelivery":   "Paiement par carte à la livraison",
    "ordering.catering":         "Traiteur",
    "admin.services.catering":   "Traiteur",
    "receipt.orderTypes.catering":      "TRAITEUR",
    "receipt.orderTypesLower.catering": "traiteur",
    "admin.serviceFees.ca":      "Canada",
  },
  es: {
    "checkout.cardOnPickup":     "Pago con tarjeta al recoger",
    "checkout.cardOnDelivery":   "Pago con tarjeta en la entrega",
    "ordering.catering":         "Catering",
    "admin.services.catering":   "Catering",
    "receipt.orderTypes.catering":      "CATERING",
    "receipt.orderTypesLower.catering": "catering",
    "admin.serviceFees.ca":      "Canadá",
  },
  it: {
    "checkout.cardOnPickup":     "Carta al ritiro",
    "checkout.cardOnDelivery":   "Carta alla consegna",
    "auth.password":             "Password",
    "ordering.catering":         "Catering",
    "admin.services.catering":   "Catering",
    "admin.profile.slogan":      "Slogan",
    "admin.profile.logo":        "Logo",
    "admin.serviceFees.ca":      "Canada",
    "admin.settings.account":    "Account",
    "admin.settings.password":   "Password",
    "admin.websiteTheme.logo":   "Logo",
    "admin.websiteTheme.banner": "Banner",
    "admin.mapSettings.google":  "Google Maps",
    "receipt.orderTypes.catering":      "CATERING",
    "receipt.orderTypesLower.catering": "catering",
  },
  pt: {
    "checkout.cardOnPickup":     "Cartão na retirada",
    "checkout.cardOnDelivery":   "Cartão na entrega",
    "ordering.catering":         "Catering",
    "admin.services.catering":   "Catering",
    "admin.profile.slogan":      "Slogan",
    "admin.menu.title":          "Menu",
    "admin.sidebar.menu":        "Menu",
    "ordering.menu":             "Menu",
    "checkout.item":             "Item",
    "common.menu":               "Menu",
    "common.status":             "Status",
    "receipt.orderTypes.catering":      "CATERING",
    "receipt.orderTypesLower.catering": "catering",
    "admin.serviceFees.ca":      "Canadá",
  },
};

/** Walk a dotted key path into a nested object, creating sub-objects as needed. */
function setDeep(obj: Record<string, unknown>, dottedKey: string, value: string): void {
  const parts = dottedKey.split(".");
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cursor[part] !== "object" || cursor[part] === null || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

let totalApplied = 0;
for (const [loc, patches] of Object.entries(PATCHES)) {
  const path = join(MESSAGES_DIR, `${loc}.json`);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  let appliedHere = 0;
  for (const [key, value] of Object.entries(patches)) {
    setDeep(data, key, value);
    appliedHere++;
  }
  // Preserve 2-space indentation + trailing newline to match existing
  // formatting (so the diff stays surgical, not a whole-file rewrite).
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✓ ${loc}: ${appliedHere} keys patched`);
  totalApplied += appliedHere;
}

console.log(`\nTotal: ${totalApplied} translation patches applied across ${Object.keys(PATCHES).length} locales.`);
