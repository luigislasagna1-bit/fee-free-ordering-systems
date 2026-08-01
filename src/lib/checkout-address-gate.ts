// ── Delivery address classification gate ────────────────────────────────────
// A delivery order on a ZONED store must end up either inside a zone or
// provably outside every zone — never "unknown" (the $7.99 ORD-369250179
// incident: no coords, server geocode came back empty, zone-restricted promos
// refused an order that looked normal).
//
// The order is blocked ONLY while we have no location signal at all:
//   - exact coords (picked suggestion / dragged pin / saved address with
//     coords) count, AND SO DOES a successful text geocode of what they typed
//     (`resolvedZone` — the parent's debounced Nominatim lookup). Requiring a
//     physical dropdown pick when the text already classified is what
//     dead-ended a real customer on 2026-08-01: her saved default had no
//     coords, typing clears coords by design, and the zone line ("You're in
//     Zone X") rendered while Place Order stayed dead. Regression window:
//     b2648ac7 (2026-07-31) → this fix.
//   - genuinely unlocatable addresses (both signals absent) stay blocked,
//     with the pin-drop escape hatch in the modal.
// Stores without zones are never gated (Luigi's call — nothing there depends
// on which zone the address falls in).
export function isAddressNotLocated(args: {
  orderType: string;
  hasZones: boolean;
  lat: number | null | undefined;
  lng: number | null | undefined;
  resolvedZone: object | null | undefined;
}): boolean {
  return (
    args.orderType === "delivery" &&
    args.hasZones &&
    (args.lat == null || args.lng == null) &&
    args.resolvedZone == null
  );
}
