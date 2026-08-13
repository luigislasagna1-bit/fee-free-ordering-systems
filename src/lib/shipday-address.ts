// ─────────────────────────────────────────────────────────────────────────────
// ShipDay address composition — ONE builder for the pickup + dropoff addresses
// we hand ShipDay, and through ShipDay to DoorDash Drive and Uber Direct.
//
// WHY THIS EXISTS (Luigi 2026-08-13): every Uber Direct quote came back "out of
// delivery area", on addresses 1–3 km from the store, while the SAME order
// attached to DoorDash fine. The cause is an asymmetry between the two couriers:
//
//   • DoorDash Drive honours the coordinates we send (deliveryLatitude /
//     deliveryLongitude) — so our exact checkout pin carried it, and a thin
//     address string never mattered.
//   • Uber Direct "always geocodes the provided dropoff address, even when
//     dropoff latitude and longitude are included" (developer.uber.com/docs/
//     deliveries/guides/geocoding). Our coordinates are DISCARDED; the address
//     STRING is the only thing Uber sees.
//
// And the string we were sending was `[deliveryAddress, deliveryCity,
// deliveryZip]` — for a live Milton order: "1095 Ezard Cres, Milton, L9T 6W9".
// No province. No country. `Order` has no column for either. Uber geocodes an
// unqualified "Milton" against its default (US) market, lands on one of the
// several US Miltons hundreds of km away, and correctly reports that the drop
// is outside the pickup store's service radius — every single time.
//
// Two further ways the fields were "not lining up", both fixed here:
//
//   2. The street line was a KITCHEN line, not a geocodable one.
//      composeFlatDeliveryAddress() bakes unit/floor/intercom/building/
//      neighbourhood/parking into Order.deliveryAddress, so orders reached Uber
//      as "6911 Derry Road West, Apt RBC Branch, Milton, L9T 7H5" — and could
//      reach it as "…, Parking: behind the plaza". A geocoder has to guess what
//      any of that means. The structured parts live in
//      Order.deliveryAddressData, so we can send a clean street and route the
//      rest to the driver INSTRUCTION, where a human actually reads it.
//   3. Postcodes were sent exactly as stored — the restaurant's own record
//      holds "L9T2H6" with no space. formatPostcode() canonicalizes.
//
// The single-line format matches ShipDay's own SDK (Address.get_single_line):
// street, unit, city, state, zip, country. The structured `pickup` / `dropoff`
// breakdowns match Address.get_breakdown / the Node SDK's Address fields.
// ─────────────────────────────────────────────────────────────────────────────

import { formatAddressCase, formatAddressLine, formatPostcode } from "@/lib/address-format";
import { regionForCountry } from "@/lib/regions";
import type { DeliveryAddressData, DeliveryFieldKey } from "@/lib/delivery-address-fields";

/** ShipDay's structured address breakdown — the shape `pickup` / `dropoff` take. */
export type ShipdayAddress = {
  unit?: string;
  street: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

/**
 * ISO country code → the name a geocoder can't misread. We deliberately send
 * the NAME rather than the 2-letter code: "CA" is Canada to ISO-3166 and
 * California to every North-American address parser, and that single ambiguity
 * is the class of bug this whole module exists to kill. Unknown code → returned
 * as-is (better than dropping the only country signal we have).
 */
export function countryName(code: string | null | undefined): string | undefined {
  const raw = (code ?? "").trim();
  if (!raw) return undefined;
  return regionForCountry(raw)?.name ?? raw;
}

/**
 * Address extras that must NOT sit in a geocodable street line but MUST still
 * reach the driver. `unit` is deliberately absent — it stays in the address (it
 * is part of where the food goes, and every geocoder tolerates "Apt 4B").
 */
const INSTRUCTION_FIELDS: ReadonlyArray<{ key: DeliveryFieldKey; label: string }> = [
  { key: "building", label: "Building" },
  { key: "floor", label: "Floor" },
  { key: "intercom", label: "Intercom" },
  { key: "neighbourhood", label: "Neighbourhood" },
  { key: "parking", label: "Parking" },
];

/**
 * Coerce Order.deliveryAddressData (a `Json?` column, so `unknown` off the DB)
 * into the structured field map. Returns null when the order predates the
 * structured form — callers then fall back to the flat columns.
 */
export function readDeliveryAddressData(raw: unknown): DeliveryAddressData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: DeliveryAddressData = {};
  let any = false;
  for (const key of ["street", "city", "postcode", "neighbourhood", "building", "intercom", "floor", "apartment", "parking"] as DeliveryFieldKey[]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = v.trim();
      any = true;
    }
  }
  return any ? out : null;
}

export type DropoffSource = {
  /** Order.deliveryAddress — the flat kitchen line (street + baked-in extras). */
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryZip: string | null;
  /** Order.deliveryAddressData — structured, when the order has it. */
  deliveryAddressData?: unknown;
  /** The STORE's state + country. A delivery is inside the store's own zones
   *  (Luigi's widest is 21 km), so the store's province/country is the
   *  customer's — and no Order column carries either. */
  restaurantState: string | null;
  restaurantCountry: string | null;
};

/**
 * The customer's address, structured and geocodable.
 *
 * Street precedence: the STRUCTURED street when the order has one (clean — no
 * baked-in floor/parking prose), else the flat column (legacy orders, which we
 * cannot safely un-bake). Everything else is formatted, never invented.
 */
export function buildDropoffAddress(o: DropoffSource): ShipdayAddress {
  const data = readDeliveryAddressData(o.deliveryAddressData);
  const street = data?.street
    ? formatAddressLine(data.street)
    : formatAddressLine(o.deliveryAddress);
  const unit = data?.apartment ? formatAddressCase(data.apartment) : undefined;
  return compact({
    unit,
    street,
    city: formatAddressCase(data?.city ?? o.deliveryCity),
    state: formatAddressCase(o.restaurantState),
    zip: formatPostcode(data?.postcode ?? o.deliveryZip),
    country: countryName(o.restaurantCountry),
  });
}

export type PickupSource = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
};

/** The store's address, structured — same treatment, plus the missing country. */
export function buildPickupAddress(r: PickupSource): ShipdayAddress {
  return compact({
    street: formatAddressLine(r.address),
    city: formatAddressCase(r.city),
    state: formatAddressCase(r.state),
    zip: formatPostcode(r.zip),
    country: countryName(r.country),
  });
}

/**
 * ShipDay's single-line form (Address.get_single_line): street, unit, city,
 * state, zip, country. This is the field Uber geocodes, so it must be complete
 * — a missing country is the whole bug.
 */
export function singleLineAddress(a: ShipdayAddress): string {
  return [a.street, a.unit, a.city, a.state, a.zip, a.country].filter(Boolean).join(", ");
}

/**
 * The driver-facing instruction: the customer's own note, PLUS the address
 * extras we kept out of the geocodable street. Nothing the customer typed is
 * lost — it moves from a field a machine has to parse into one a human reads.
 * Returns undefined when there's nothing to say.
 */
export function buildDeliveryInstruction(notes: string | null, rawData: unknown): string | undefined {
  const data = readDeliveryAddressData(rawData);
  const parts: string[] = [];
  if (data) {
    for (const { key, label } of INSTRUCTION_FIELDS) {
      const v = data[key];
      if (v?.trim()) parts.push(`${label}: ${v.trim()}`);
    }
  }
  if (notes?.trim()) parts.push(notes.trim());
  return parts.length ? parts.join(" · ") : undefined;
}

/** Drop empty/blank keys so ShipDay's breakdown carries only real values. */
function compact(a: { street: string } & Partial<ShipdayAddress>): ShipdayAddress {
  const out: ShipdayAddress = { street: a.street };
  for (const k of ["unit", "city", "state", "zip", "country"] as const) {
    const v = a[k];
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}
