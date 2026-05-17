"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  notes: string | null;
  resellerProfile: {
    id: string;
    companyName: string | null;
    payoutMethod: string | null;
    user: { email: string; name: string | null };
  };
  _count: { commissions: number };
};

export function PayoutsClient({ initial }: { initial: Payout[] }) {
  const [payouts] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "mark-paid" | "reject", extra?: any) {
    setBusy(`${id}-${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/payouts/${id}/${action}`, {
        method: "POST",
        headers: extra ? { "Content-Type": "application/json" } : {},
        body: extra ? JSON.stringify(extra) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      window.location.reload();
    } catch {
      setError("Action failed");
    } finally {
      setBusy(null);
    }
  }

  const buckets = {
    requested: payouts.filter((p) => p.status === "requested"),
    approved: payouts.filter((p) => p.status === "approved"),
    historical: payouts.filter((p) => p.status === "paid" || p.status === "rejected"),
  };

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Payouts</h1>
      <p className="text-sm text-gray-500 mb-6">Reseller payout requests. Approve → send money → mark paid.</p>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <Section title={`Requested (${buckets.requested.length})`}>
        {buckets.requested.length === 0 ? (
          <Empty text="No new payout requests." />
        ) : (
          buckets.requested.map((p) => (
            <PayoutRow
              key={p.id}
              p={p}
              busyKey={busy}
              onApprove={() => act(p.id, "approve")}
              onReject={() => {
                const reason = prompt("Reason for rejection (optional):") ?? undefined;
                act(p.id, "reject", reason ? { reason } : undefined);
              }}
              onMarkPaid={() => {
                const payoutReference = prompt("Payout reference (PayPal txn id, bank reference, etc.):") ?? undefined;
                act(p.id, "mark-paid", payoutReference ? { payoutReference } : undefined);
              }}
            />
          ))
        )}
      </Section>

      <Section title={`Approved — waiting for you to send money (${buckets.approved.length})`}>
        {buckets.approved.length === 0 ? (
          <Empty text="Nothing waiting." />
        ) : (
          buckets.approved.map((p) => (
            <PayoutRow
              key={p.id}
              p={p}
              busyKey={busy}
              onMarkPaid={() => {
                const payoutReference = prompt("Payout reference (PayPal txn id, bank reference, etc.):") ?? undefined;
                act(p.id, "mark-paid", payoutReference ? { payoutReference } : undefined);
              }}
              onReject={() => {
                const reason = prompt("Reason for rejection (optional):") ?? undefined;
                act(p.id, "reject", reason ? { reason } : undefined);
              }}
            />
          ))
        )}
      </Section>

      <Section title="History">
        {buckets.historical.length === 0 ? (
          <Empty text="No history yet." />
        ) : (
          buckets.historical.map((p) => (
            <PayoutRow key={p.id} p={p} busyKey={busy} historical />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-gray-900 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-500">{text}</div>;
}

function PayoutRow({
  p,
  busyKey,
  onApprove,
  onReject,
  onMarkPaid,
  historical,
}: {
  p: Payout;
  busyKey: string | null;
  onApprove?: () => void;
  onReject?: () => void;
  onMarkPaid?: () => void;
  historical?: boolean;
}) {
  const isBusy = (action: string) => busyKey === `${p.id}-${action}`;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <div className="font-semibold text-gray-900">
          {p.resellerProfile.companyName ?? p.resellerProfile.user.name ?? p.resellerProfile.user.email}
        </div>
        <div className="text-xs text-gray-500">
          {p.resellerProfile.user.email} · payout via {p.resellerProfile.payoutMethod ?? "(not set)"}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-gray-900">{formatCurrency(p.amountCents / 100)}</div>
        <div className="text-xs text-gray-500">
          {p._count.commissions} commission{p._count.commissions === 1 ? "" : "s"} ·{" "}
          {new Date(p.requestedAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={p.status} />
        {!historical && p.status === "requested" && (
          <>
            <button
              onClick={onApprove}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md disabled:opacity-50"
            >
              {isBusy("approve") ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              Approve
            </button>
            <button
              onClick={onMarkPaid}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md disabled:opacity-50"
            >
              {isBusy("mark-paid") ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Mark paid
            </button>
            <button
              onClick={onReject}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1.5 rounded-md disabled:opacity-50"
            >
              {isBusy("reject") ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Reject
            </button>
          </>
        )}
        {!historical && p.status === "approved" && (
          <>
            <button
              onClick={onMarkPaid}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md disabled:opacity-50"
            >
              {isBusy("mark-paid") ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Mark paid
            </button>
            <button
              onClick={onReject}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1.5 rounded-md disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {historical && p.payoutReference && (
          <span className="text-xs text-gray-500 font-mono break-all max-w-[200px]">{p.payoutReference}</span>
        )}
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
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
