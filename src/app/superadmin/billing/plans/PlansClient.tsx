"use client";
import { useState } from "react";
import { Plus, X, RefreshCw, Loader2, CheckCircle2, AlertCircle, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

interface Plan {
  id: string;
  name: string;
  slug: string;
  price: number;
  interval: string;
  description: string | null;
  features: string;
  isActive: boolean;
  stripeProductId: string | null;
  stripePriceId: string | null;
  syncStatus: string;
  syncError: string | null;
  syncedAt: string | Date | null;
}

interface Props {
  initialPlans: Plan[];
  stripeConfigured: boolean;
}

export function PlansClient({ initialPlans, stripeConfigured }: Props) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/superadmin/plans");
    const data = await res.json();
    setPlans(data.plans);
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/superadmin/plans/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(data.changed ? "Synced to Stripe" : "Already up-to-date");
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Deactivate "${name}"? Existing subscribers keep their plan; new signups won't see it.`)) return;
    try {
      const res = await fetch(`/api/superadmin/plans/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Plan deactivated");
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/superadmin/billing" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to Billing
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {!stripeConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Stripe is not configured</p>
            <p>Plans can be created but won't sync to Stripe until you finish setup at <a href="/superadmin/settings/stripe" className="underline font-semibold">Settings → Stripe</a>.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Plan</th>
              <th className="text-left p-3">Price</th>
              <th className="text-left p-3">Stripe Sync</th>
              <th className="text-left p-3">Active</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {plans.map((plan) => (
              <tr key={plan.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <div className="font-semibold text-gray-900">{plan.name}</div>
                  <div className="text-xs text-gray-400">{plan.slug}</div>
                </td>
                <td className="p-3">
                  <div className="font-mono text-gray-700">${plan.price.toFixed(2)}/{plan.interval === "year" ? "yr" : "mo"}</div>
                </td>
                <td className="p-3">
                  <SyncBadge status={plan.syncStatus} error={plan.syncError} priceId={plan.stripePriceId} />
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {plan.isActive ? "Yes" : "No"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={() => handleSync(plan.id)}
                      disabled={!stripeConfigured || syncingId === plan.id}
                      className="text-xs font-medium text-orange-600 hover:text-orange-700 px-2 py-1 rounded hover:bg-orange-50 disabled:opacity-40 transition"
                    >
                      {syncingId === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : "Sync to Stripe"}
                    </button>
                    <button
                      onClick={() => setEditing(plan)}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id, plan.name)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                      title="Deactivate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">No plans yet. Click "New Plan" to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <PlanEditor
          plan={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={async () => { setEditing(null); setCreating(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function SyncBadge({ status, error, priceId }: { status: string; error: string | null; priceId: string | null }) {
  if (status === "synced") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Synced
        {priceId && <code className="text-[10px] text-gray-400 ml-1 font-mono">{priceId.slice(0, 14)}…</code>}
      </span>
    );
  }
  if (status === "syncing") {
    return <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-medium"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing</span>;
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium" title={error ?? ""}>
        <AlertCircle className="w-3.5 h-3.5" /> Error
      </span>
    );
  }
  return <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium"><RefreshCw className="w-3.5 h-3.5" /> Not synced</span>;
}

function PlanEditor({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !plan;
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    slug: plan?.slug ?? "",
    price: plan?.price ?? 29,
    interval: plan?.interval ?? "month",
    description: plan?.description ?? "",
    features: (() => {
      try {
        const arr = JSON.parse(plan?.features ?? "[]");
        return Array.isArray(arr) ? arr.join("\n") : "";
      } catch { return ""; }
    })(),
    isActive: plan?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = {
        ...form,
        price: parseFloat(String(form.price)),
        features: form.features.split("\n").map(s => s.trim()).filter(Boolean),
      };
      const res = await fetch(isNew ? "/api/superadmin/plans" : `/api/superadmin/plans/${plan!.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(isNew ? "Plan created" : "Plan updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 text-lg">{isNew ? "New Plan" : "Edit Plan"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Slug (lowercase, hyphens)</label>
            <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Price (USD)</label>
              <input type="number" step="0.01" min="0" value={form.price}
                onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Interval</label>
              <select value={form.interval} onChange={e => setForm({ ...form, interval: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Features (one per line)</label>
            <textarea value={form.features} onChange={e => setForm({ ...form, features: e.target.value })}
              rows={4}
              placeholder="Unlimited menu items&#10;Email support&#10;Custom domain"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            Active (available for new signups)
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-orange-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isNew ? "Create" : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
