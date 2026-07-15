"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Wallet, ExternalLink, AlertCircle } from "lucide-react";
import { formatCurrency , PLATFORM_CURRENCY } from "@/lib/utils";

type Payout = {
  id: string;
  amountCents: number;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  payoutReference: string | null;
  _count: { commissions: number };
};

const MIN_CENTS = 50_00;

export function PayoutsClient({
  initial,
  availableCents,
  payoutMethodConfigured,
}: {
  initial: Payout[];
  availableCents: number;
  payoutMethodConfigured: boolean;
}) {
  const [payouts, setPayouts] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = availableCents >= MIN_CENTS && payoutMethodConfigured;
  const hasInFlight = payouts.some((p) => p.status === "requested" || p.status === "approved");

  async function request() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/payouts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not request payout");
        return;
      }
      const list = await fetch("/api/reseller/payouts").then((r) => r.json());
      setPayouts(list.payouts ?? []);
    } catch {
      setError("Could not request payout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Payouts</h1>
      <p className="text-sm text-gray-500 mb-6">Request a payout when your available balance is at least $50.</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
              <Wallet className="w-3.5 h-3.5" /> Available balance
            </div>
            <div className="text-3xl font-bold text-gray-900 mt-1">
              {formatCurrency(availableCents / 100, PLATFORM_CURRENCY)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Minimum payout: $50.00</div>
          </div>
          <button
            onClick={request}
            disabled={busy || !eligible || hasInFlight}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            Request payout
          </button>
        </div>
        {!payoutMethodConfigured && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>
              Configure how we should send your money on the{" "}
              <Link href="/reseller/profile" className="underline font-semibold">
                Profile page
              </Link>{" "}
              before requesting a payout.
            </span>
          </div>
        )}
        {hasInFlight && (
          <div className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            You already have a payout in flight. We'll mark it paid once it's been sent.
          </div>
        )}
        {error && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Requested</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">Commissions</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Reference</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  No payouts yet.
                </td>
              </tr>
            )}
            {payouts.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">
                  {new Date(p.requestedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatCurrency(p.amountCents / 100, PLATFORM_CURRENCY)}
                </td>
                <td className="px-4 py-3 text-gray-700">{p._count.commissions} item(s)</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                  {p.rejectedReason && (
                    <div className="text-[11px] text-red-600 mt-0.5">{p.rejectedReason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 break-all max-w-[200px]">
                  {p.payoutReference ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    requested: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
