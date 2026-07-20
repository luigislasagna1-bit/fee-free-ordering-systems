/**
 * Shared RFC-4180 CSV escaping for the admin exports (customers, group
 * members, reservations day sheet, billing invoices). One implementation so
 * an edge-case fix lands everywhere at once — review 2026-07-19: the
 * copy-pasted versions didn't quote a lone carriage return.
 *
 * Wrap in quotes when the value contains a comma, quote, CR or LF; double
 * any internal quotes. Headers stay deliberately English across all exports
 * (stable machine-readable convention, matching the original Customers CSV).
 */
export function escCsv(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
