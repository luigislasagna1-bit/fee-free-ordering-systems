"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Percent, LogIn } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Profile = {
  id: string;
  status: string;
  companyName: string | null;
  website: string | null;
  country: string | null;
  applicationNotes: string | null;
  approvedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  totalEarnedCents: number;
  totalPaidCents: number;
  referralCode: string;
  customCommissionRate: number | null;
  user: { id: string; email: string; name: string | null };
};

export function ResellerDetailClient({ initial }: { initial: Profile }) {
  const [profile] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local state for the custom-rate input — empty string means "use default tiers"
  const [rateInput, setRateInput] = useState<string>(
    initial.customCommissionRate !== null && initial.customCommissionRate !== undefined
      ? String(initial.customCommissionRate)
      : ""
  );
  const [rateSaved, setRateSaved] = useState(false);

  async function saveCustomRate() {
    setBusy("rate");
    setError(null);
    setRateSaved(false);
    try {
      const value = rateInput.trim();
      const res = await fetch(`/api/superadmin/resellers/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCommissionRate: value === "" ? null : Number(value) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save rate");
        return;
      }
      setRateSaved(true);
      setTimeout(() => setRateSaved(false), 3000);
    } catch {
      setError("Could not save rate");
    } finally {
      setBusy(null);
    }
  }

  async function action(path: string, body?: any) {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/resellers/${profile.id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      // Refresh by reloading profile via re-fetch
      window.location.reload();
    } catch {
      setError("Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile.user.name ?? profile.user.email}</h1>
          <p className="text-sm text-gray-500">{profile.user.email}</p>
          {profile.companyName && <p className="text-sm text-gray-700 mt-0.5">{profile.companyName}</p>}
        </div>
        <StatusPill status={profile.status} />
      </div>

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
        <Row label="Website">{profile.website ? <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700">{profile.website}</a> : "—"}</Row>
        <Row label="Country">{profile.country ?? "—"}</Row>
        <Row label="Referral code"><code className="text-xs">{profile.referralCode}</code></Row>
        <Row label="Approved at">{profile.approvedAt ? new Date(profile.approvedAt).toLocaleString() : "—"}</Row>
        <Row label="Lifetime earned">{formatCurrency(profile.totalEarnedCents / 100)}</Row>
        <Row label="Lifetime paid">{formatCurrency(profile.totalPaidCents / 100)}</Row>
      </dl>

      {profile.applicationNotes && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Application notes</div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{profile.applicationNotes}</p>
        </div>
      )}

      {profile.suspendedReason && profile.status !== "approved" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
          <strong>Reason:</strong> {profile.suspendedReason}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {/* Custom commission rate — overrides the default 4-tier table when set. */}
      {profile.status === "approved" && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-gray-700" />
            <h3 className="text-sm font-bold text-gray-900">Custom commission rate</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Leave blank to use the default tiers (0% &lt; 5, 5% 5–25, 10% 26–50, 15% 51+).
            Setting a value here pins this reseller to that flat rate on every paid invoice going forward.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="e.g. 7"
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <Percent className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <button
              onClick={saveCustomRate}
              disabled={busy === "rate"}
              className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {busy === "rate" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save rate
            </button>
            {rateSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* SA → Reseller impersonation — only when approved. */}
        {profile.status === "approved" && (
          <button
            onClick={async () => {
              setBusy("impersonate");
              setError(null);
              try {
                const res = await fetch(`/api/superadmin/resellers/${profile.id}/impersonate`, {
                  method: "POST",
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  setError(data.error || "Could not start impersonation");
                  return;
                }
                window.location.assign("/reseller");
              } catch {
                setError("Could not start impersonation");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold text-sm px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {busy === "impersonate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Log in as this reseller
          </button>
        )}
        {profile.status === "pending" && (
          <>
            <Action onClick={() => action("approve")} busy={busy === "approve"} variant="primary" icon={<CheckCircle2 className="w-4 h-4" />}>
              Approve
            </Action>
            <Action
              onClick={() => {
                const reason = prompt("Reason for rejection (optional):") ?? undefined;
                action("reject", reason ? { reason } : undefined);
              }}
              busy={busy === "reject"}
              variant="danger"
              icon={<XCircle className="w-4 h-4" />}
            >
              Reject
            </Action>
          </>
        )}
        {profile.status === "approved" && (
          <Action
            onClick={() => {
              const reason = prompt("Reason for suspension (optional):") ?? undefined;
              action("suspend", reason ? { reason } : undefined);
            }}
            busy={busy === "suspend"}
            variant="warn"
            icon={<AlertTriangle className="w-4 h-4" />}
          >
            Suspend
          </Action>
        )}
        {profile.status === "suspended" && (
          <Action
            onClick={() => action("unsuspend")}
            busy={busy === "unsuspend"}
            variant="primary"
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            Unsuspend
          </Action>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-50 py-1">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 text-right">{children}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    suspended: "bg-red-100 text-red-700",
    rejected: "bg-gray-200 text-gray-700",
  };
  return <span className={`text-xs font-semibold px-3 py-1 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

function Action({
  onClick,
  busy,
  children,
  variant,
  icon,
}: {
  onClick: () => void;
  busy: boolean;
  children: React.ReactNode;
  variant: "primary" | "warn" | "danger";
  icon: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-white",
    warn: "bg-yellow-500 hover:bg-yellow-600 text-white",
    danger: "bg-red-500 hover:bg-red-600 text-white",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-2 font-semibold text-sm px-4 py-2 rounded-lg transition disabled:opacity-50 ${styles[variant]}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
