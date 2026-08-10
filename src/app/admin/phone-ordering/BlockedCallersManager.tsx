"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Ban, Plus } from "lucide-react";

export type BlockedRow = {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string; // ISO — serialized by the server wrapper
};

/**
 * Blocked callers — Nabil politely declines calls from these numbers. List +
 * unblock + add-by-number, via /api/admin/phone-ordering/blocked-callers
 * (workstream D).
 */
export default function BlockedCallersManager({ initialBlocked }: { initialBlocked: BlockedRow[] }) {
  const t = useTranslations("admin.phoneOrderingPage.blocked");
  const router = useRouter();
  const [rows, setRows] = useState<BlockedRow[]>(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const add = async () => {
    const cleaned = phone.trim();
    // Loose E.164-ish sanity check — the API validates for real.
    if (!/^\+?[\d\s().-]{7,20}$/.test(cleaned)) {
      toast.error(t("invalidPhone"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/phone-ordering/blocked-callers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: cleaned, reason: reason.trim() || null }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json().catch(() => null);
      // The API answers { ok, caller } with the SANITIZED phone — use its row so
      // Unblock hits a real id, and de-dupe by phone because the POST upserts.
      const c = created?.caller as { id?: string; phone?: string; reason?: string | null; createdAt?: string } | undefined;
      const savedPhone = c?.phone ?? cleaned;
      setRows((list) => [
        {
          id: c?.id ?? `tmp-${Date.now()}`,
          phone: savedPhone,
          reason: c?.reason ?? (reason.trim() || null),
          createdAt: c?.createdAt ?? new Date().toISOString(),
        },
        ...list.filter((x) => x.phone !== savedPhone),
      ]);
      setPhone("");
      setReason("");
      toast.success(t("addedToast"));
      router.refresh();
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusy(false);
    }
  };

  const unblock = async (row: BlockedRow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/phone-ordering/blocked-callers/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRows((list) => list.filter((x) => x.id !== row.id));
      toast.success(t("removedToast"));
      router.refresh();
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <Ban className="w-4 h-4 text-red-400" />
          {t("title")}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">{t("explainer")}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-gray-900">{row.phone}</div>
                {row.reason && <div className="text-xs text-gray-500 mt-0.5 truncate">{row.reason}</div>}
              </div>
              <button
                type="button"
                onClick={() => unblock(row)}
                disabled={busy}
                className="text-xs font-semibold text-red-500 hover:text-red-700 transition flex-shrink-0 disabled:opacity-60"
              >
                {t("unblock")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add-by-number form. */}
      <div className="flex items-end gap-2 flex-wrap pt-1 border-t border-gray-100">
        <label className="block">
          <span className="text-xs text-gray-600">{t("phoneLabel")}</span>
          <input
            type="tel"
            value={phone}
            placeholder="+1..."
            onChange={(e) => setPhone(e.target.value)}
            className="mt-0.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono w-44 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="text-xs text-gray-600">{t("reasonLabel")}</span>
          <input
            type="text"
            value={reason}
            maxLength={140}
            onChange={(e) => setReason(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={busy || !phone.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" />
          {t("addBlock")}
        </button>
      </div>
    </div>
  );
}
