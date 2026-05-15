/**
 * Translated label lookup for order/reservation statuses.
 *
 * Called from the kitchen display, admin orders table, and customer
 * status page so the same status renders consistently translated.
 *
 * The `t` argument is the value returned by `useTranslations("kitchen")`
 * — these keys all live under `kitchen.*` in the message files.
 */
type Translator = (key: string) => string;

const KNOWN: Record<string, string> = {
  pending: "pending",
  accepted: "accepted",
  preparing: "preparing",
  ready: "ready",
  completed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",
  confirmed: "confirmed",
  seated: "seated",
  done: "done",
  no_show: "noShow",
};

export function statusLabel(status: string | null | undefined, t: Translator): string {
  if (!status) return "";
  const key = KNOWN[status];
  return key ? t(key) : status;
}
