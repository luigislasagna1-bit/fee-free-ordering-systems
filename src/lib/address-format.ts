// ─────────────────────────────────────────────────────────────────────────────
// Delivery-address DISPLAY formatting — one implementation for every surface.
//
// Customers type addresses in a hurry, on a phone, in lowercase: "705 rayner
// court", "l9t0p1". That is fine as input and terrible on a kitchen ticket, a
// driver's screen or the owner's email (Luigi 2026-08-12: "many orders come in
// just with lowercase street name — doesn't look good").
//
// The kitchen TILE has capitalized addresses since 2026-07-03; this module is
// that same rule promoted out of KitchenDisplay.tsx so the printed ticket, both
// emails, the admin order page and the tile can never drift apart. Two rules,
// deliberately conservative:
//
//   1. NEVER degrade what the customer capitalized correctly. Only the first
//      letter is lifted, so "McMaster", "O'Brien" and "van der Berg" survive.
//      An ALL-CAPS address is also left alone — shouty, but not wrong, and
//      down-casing it would wreck genuine acronyms.
//   2. Tokens that mix letters and digits are unit/postcode-shaped and read
//      better fully capitalized ("apt 12b" → "Apt 12B") — EXCEPT ordinal street
//      numbers, which keep their lowercase suffix ("1st Ave", not "1ST Ave").
//
// Client-safe: no server imports, so the checkout, the kitchen display and the
// email templates all share it.
// ─────────────────────────────────────────────────────────────────────────────

/** "1st" / "22nd" / "3rd" / "4th" — a street number, not a unit code. */
const ORDINAL_NUMBER = /^\d+(st|nd|rd|th)[.,]?$/i;

/**
 * Capitalize an address part typed by a customer. Idempotent — running it on an
 * already-formatted value is a no-op, which is what lets us normalize on write
 * AND format on display without the two fighting.
 *
 * Do NOT use this on free-text instructions (parking notes, delivery
 * directions) — title-casing prose reads worse than leaving it alone.
 */
export function formatAddressCase(value: string | null | undefined): string {
  const raw = (value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return raw.replace(/\S+/g, (word) => {
    if (ORDINAL_NUMBER.test(word)) return word.toLowerCase();
    if (/\d/.test(word) && /[a-z]/i.test(word)) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/**
 * A customer's typed NAME, under the same rule — "felcy alexander" → "Felcy
 * Alexander", while "McMaster" and "O'Brien" are left alone. Same treatment the
 * kitchen tile has given names since 2026-07-03; aliased rather than duplicated
 * so a change to the rule can never apply to one and not the other.
 */
export const formatCustomerName = formatAddressCase;

/**
 * Postal / ZIP code: always upper-case (universal convention for the codes that
 * contain letters; a no-op for the purely numeric ones), whitespace collapsed,
 * and the space restored for the two formats that are routinely typed without
 * it — Canadian "l9t0p1" → "L9T 0P1" and UK "sw1a1aa" → "SW1A 1AA". Anything
 * else is returned upper-cased and otherwise untouched, so no country's format
 * can be mangled by a rule written for another.
 */
export function formatPostcode(value: string | null | undefined): string {
  const raw = (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!raw) return "";
  const canadian = /^([A-Z]\d[A-Z]) ?(\d[A-Z]\d)$/.exec(raw);
  if (canadian) return `${canadian[1]} ${canadian[2]}`;
  const uk = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/.exec(raw);
  if (uk) return `${uk[1]} ${uk[2]}`;
  return raw;
}

/**
 * Format an already-composed flat address line (`Order.deliveryAddress`), which
 * may carry labelled extras appended by composeFlatDeliveryAddress — "17
 * Commercial St, Apt 4b, Parking: behind the plaza". Segments containing a
 * label ("Parking: …") are left verbatim, because the text after the colon is
 * the customer's own instructions and title-casing a sentence looks wrong.
 */
export function formatAddressLine(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return raw
    .split(",")
    .map((segment) => {
      const part = segment.trim();
      if (!part) return "";
      // "Parking: behind the plaza" → capitalize the label, keep the note.
      const labelled = /^([^:]+):\s*(.+)$/.exec(part);
      if (labelled) return `${formatAddressCase(labelled[1])}: ${labelled[2]}`;
      return formatAddressCase(part);
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * The FULL one-line delivery address, formatted, in GloriaFood's order:
 * street, postcode, city — "705 Rayner Court, L9T 0P1, Milton".
 *
 * Before this existed the order emails printed `Order.deliveryAddress` alone,
 * which is the STREET only — city and postal code live in their own columns and
 * simply never reached the reader (Luigi 2026-08-12). A legacy flat address that
 * already embeds the city or postcode does not get it appended twice; the
 * check is case-insensitive because the whole point is that the stored copy may
 * be lower-case.
 */
export function formatFullDeliveryAddress(parts: {
  street?: string | null;
  city?: string | null;
  postcode?: string | null;
}): string {
  const street = formatAddressLine(parts.street);
  const city = formatAddressCase(parts.city);
  const postcode = formatPostcode(parts.postcode);
  const seen = street.toLowerCase();
  const out = [street];
  // Compare on the raw digits/letters so "L9T 0P1" still matches an embedded
  // "l9t0p1" that was typed without the space.
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (postcode && !squash(seen).includes(squash(postcode))) out.push(postcode);
  if (city && !seen.includes(city.toLowerCase())) out.push(city);
  return out.filter(Boolean).join(", ");
}
