"use client";
import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Link2, Plus, Copy, Check, Trash2, ToggleLeft, ToggleRight, MousePointerClick, ShoppingBag, X, QrCode } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type SmartLink = {
  id: string;
  code: string;
  name: string;
  url: string;
  targetPath: string;
  isActive: boolean;
  scanCount: number;
  orderCount: number;
  revenueCents: number;
  createdAt: string;
};

export function MarketingStudioClient({ currency, initialLinks }: { currency: string; initialLinks: SmartLink[] }) {
  const t = useTranslations("admin.marketingStudio");
  const tc = useTranslations("common");
  const [links, setLinks] = useState<SmartLink[]>(initialLinks);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing-studio/smart-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error();
      setLinks((prev) => [d.link, ...prev]);
      setShowCreate(false);
      setName("");
      toast.success(t("created"));
    } catch {
      toast.error(t("createError"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: SmartLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 1500);
    } catch {
      toast.error(t("copyError"));
    }
  };

  const toggle = async (link: SmartLink) => {
    const next = !link.isActive;
    setLinks((prev) => prev.map((x) => (x.id === link.id ? { ...x, isActive: next } : x)));
    try {
      await fetch(`/api/admin/marketing-studio/smart-links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
    } catch {
      setLinks((prev) => prev.map((x) => (x.id === link.id ? { ...x, isActive: !next } : x)));
    }
  };

  const remove = async (link: SmartLink) => {
    if (!confirm(t("deleteConfirm"))) return;
    setLinks((prev) => prev.filter((x) => x.id !== link.id));
    try {
      await fetch(`/api/admin/marketing-studio/smart-links/${link.id}`, { method: "DELETE" });
    } catch {
      /* best-effort */
    }
  };

  const conv = (l: SmartLink) => (l.scanCount > 0 ? Math.round((l.orderCount / l.scanCount) * 100) : 0);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500">{t("pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/marketing-studio/flyers"
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 rounded-lg transition"
          >
            <QrCode className="w-4 h-4" /> {t("flyersTitle")}
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-4 h-4" /> {t("newLink")}
          </button>
        </div>
      </div>

      {links.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <Link2 className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-800">{t("emptyTitle")}</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <Link href={`/admin/marketing-studio/${l.id}`} className="hover:text-emerald-600">{l.name}</Link>
                    {!l.isActive && <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{tc("off")}</span>}
                  </div>
                  <button
                    onClick={() => copy(l)}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 font-mono truncate max-w-full"
                    title={t("copyUrl")}
                  >
                    {copied === l.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="truncate">{l.url}</span>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={`/api/admin/marketing-studio/smart-links/${l.id}/qr?format=png`}
                    download
                    className="p-1.5 text-gray-400 hover:text-emerald-600"
                    title={t("downloadQr")}
                  >
                    <QrCode className="w-4 h-4" />
                  </a>
                  <button onClick={() => toggle(l)} className="p-1.5 text-gray-400 hover:text-gray-700" title={l.isActive ? tc("active") : tc("off")}>
                    {l.isActive ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => remove(l)} className="p-1.5 text-gray-400 hover:text-rose-600" title={tc("delete")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Stat icon={<MousePointerClick className="w-3.5 h-3.5" />} label={t("colScans")} value={String(l.scanCount)} />
                <Stat icon={<ShoppingBag className="w-3.5 h-3.5" />} label={t("colOrders")} value={String(l.orderCount)} />
                <Stat label={t("colRevenue")} value={formatCurrency(l.revenueCents / 100, currency)} />
                <Stat label={t("colConversion")} value={`${conv(l)}%`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{t("createTitle")}</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tc("name")}</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder={t("namePlaceholder")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t("pointsToHint")}</p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={create}
                disabled={busy || !name.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {t("createButton")}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg">
                {tc("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 flex items-center justify-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
