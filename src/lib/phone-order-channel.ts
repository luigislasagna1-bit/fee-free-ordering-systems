/**
 * The `Order.channel` value that marks a Nabil AI PHONE order.
 *
 * Stamped by /api/orders on its `x-internal-key` branch when the voice service
 * places the order (the same "voice" slug the Sales "by channel" report colours
 * pink — see `ChannelSlug` in src/lib/reports/channels.ts). Every surface that
 * treats a phone order differently keys on THIS constant, so a rename can never
 * drift between them:
 *   - the printed receipts (PHONE ORDER / NOT PAID banner, the `phone` template)
 *     — src/lib/receipt-schema.ts re-exports it;
 *   - the kitchen display (PHONE ORDER pill + NOT PAID / PAID chip)
 *     — src/app/kitchen/kitchen-types.ts re-exports it.
 *
 * Deliberately a zero-import module: the kitchen display bundle (a hot path on
 * tablets) must not pull the default receipt templates in just for one string.
 * Luigi 2026-08-16.
 */
export const PHONE_ORDER_CHANNEL = "voice" as const;

/** True when the order was placed by phone through Nabil AI. */
export function isPhoneOrderChannel(channel: string | null | undefined): boolean {
  return channel === PHONE_ORDER_CHANNEL;
}
