"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag, CheckCircle2 } from "lucide-react";

export function AssignCouponForm({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; discount: string } | null>(null);
  const [form, setForm] = useState({
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: "10",
    description: "",
    minimumOrder: "0",
    maxUses: "1",
    expiresAt: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}/assign-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          description: form.description || undefined,
          minimumOrder: Number(form.minimumOrder),
          maxUses: Number(form.maxUses),
          expiresAt: form.expiresAt || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create coupon");
        return;
      }
      const c = data.coupon;
      const discountLabel = form.discountType === "percentage"
        ? `${form.discountValue}% off`
        : `$${form.discountValue} off`;
      setSuccess({ code: c.code, discount: discountLabel });
      // Reset form
      setForm({ ...form, description: "", discountValue: "10" });
      // Refresh the page-server-side to pull the new coupon into the
      // list below the form.
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Discount type</label>
          <select
            value={form.discountType}
            onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {form.discountType === "percentage" ? "Percent (1–100)" : "Amount ($)"}
          </label>
          <input
            type="number"
            min={1}
            max={form.discountType === "percentage" ? 100 : undefined}
            step={form.discountType === "percentage" ? 1 : 0.01}
            required
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Description (optional)
        </label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={`Gift coupon for ${customerName}`}
          maxLength={200}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          Shown to the customer in their account dashboard.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Min. order ($)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.minimumOrder}
            onChange={(e) => setForm({ ...form, minimumOrder: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Max uses</label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Expires (optional)</label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          Coupon <code className="font-mono font-bold">{success.code}</code> ({success.discount}) assigned to {customerName}.
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
        Create &amp; assign coupon
      </button>
    </form>
  );
}
