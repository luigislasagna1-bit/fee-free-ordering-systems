"use client";
import { useState } from "react";
import { Gift, Plus, Minus, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { formatCurrency as fmtCurrency } from "@/lib/utils";

type LedgerRow = { id: string; amount: number; reason: string; note: string | null; createdAt: string };

/**
 * Reward Dollars wallet on the admin customer-detail page: live balance, a
 * grant/deduct control (manual gift or correction), and the recent ledger. Posts
 * to /api/admin/customers/[id]/reward-grant (restaurant-scoped). Luigi 2026-06-27.
 */
export function GrantRewardCredit({
  customerId, currency, labelPlural, initialBalance, initialLedger,
}: {
  customerId: string;
  currency: string;
  labelPlural: string | null;
  initialBalance: number;
  initialLedger: LedgerRow[];
}) {
  const t = useTranslations("admin.rewards");
  const fmt = (n: number) => fmtCurrency(n, currency);
  const label = labelPlural?.trim() || t("defaultPlural");

  const [balance, setBalance] = useState(initialBalance);
  const [ledger, setLedger] = useState<LedgerRow[]>(initialLedger);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (sign: 1 | -1) => {
    const value = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (!value || value <= 0) { toast.error(t("grantEnterAmount")); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/reward-grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value * sign, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBalance(data.balance);
      setLedger(data.ledger);
      setAmount(""); setNote("");
      toast.success(sign > 0 ? t("grantAdded") : t("grantDeducted"));
    } catch (e: any) {
      toast.error(e.message || t("grantFailed"));
    } finally {
      setBusy(false);
    }
  };

  const reasonLabel = (reason: string) => {
    const known = ["earn", "grant", "spend", "release", "adjust", "signup_bonus", "expire"];
    return known.includes(reason) ? t(`reason.${reason}`) : reason;
  };

  return (
    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-gray-900">{label}</h2>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-gray-400 font-bold">{t("balance")}</div>
          <div className="text-lg font-bold text-emerald-700">{fmt(balance)}</div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">{t("grantAmount")}</span>
            <div className="mt-1 inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
              <span className="px-2.5 flex items-center bg-gray-50 text-gray-500 text-sm border-r border-gray-300">{currency.toUpperCase()}</span>
              <input
                type="number" min={0} step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                className="w-24 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
            </div>
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <span className="text-xs font-medium text-gray-600">{t("grantNote")}</span>
            <input
              type="text" maxLength={200} value={note}
              onChange={(e) => setNote(e.target.value)} placeholder={t("grantNotePlaceholder")}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </label>
          <button
            type="button" onClick={() => submit(1)} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("grantAdd")}
          </button>
          <button
            type="button" onClick={() => submit(-1)} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Minus className="w-4 h-4" /> {t("grantDeduct")}
          </button>
        </div>

        {ledger.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100 pt-1">
            {ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-600">
                  {reasonLabel(l.reason)}{l.note ? <span className="text-gray-400"> · {l.note}</span> : null}
                </span>
                <span className={l.amount >= 0 ? "text-emerald-600 font-medium" : "text-gray-700 font-medium"}>
                  {l.amount >= 0 ? "+" : "−"} {fmt(Math.abs(l.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
