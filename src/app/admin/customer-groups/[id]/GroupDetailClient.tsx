"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ChevronLeft, Users, Trash2, UserPlus, Gift, Check } from "lucide-react";

type Member = { id: string; name: string | null; email: string | null; phone: string | null; hasAccount: boolean };
type Group = { id: string; name: string; description: string | null };

export default function GroupDetailClient({ group, initialMembers, currency }: { group: Group; initialMembers: Member[]; currency: string }) {
  const t = useTranslations("admin.customerGroups");
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);

  // ── Add members (paste emails — auto-links to existing accounts) ──────────
  const [emailsText, setEmailsText] = useState("");
  const [adding, setAdding] = useState(false);
  async function addMembers() {
    const emails = emailsText.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
    if (!emails.length) { toast.error(t("noValidEmails")); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/customer-groups/${group.id}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("addFailed")); return; }
      toast.success(t("membersAdded", { count: data.added }));
      setEmailsText("");
      router.refresh();
    } finally { setAdding(false); }
  }

  async function removeMember(id: string) {
    const res = await fetch(`/api/admin/customer-groups/${group.id}/members?memberId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("removeFailed")); return; }
    setMembers((m) => m.filter((x) => x.id !== id));
    router.refresh();
  }

  // ── Assign a promotion to the whole group ────────────────────────────────
  const [form, setForm] = useState({
    discountType: "percentage", discountValue: "10", description: "",
    minimumOrder: "0", expiresAt: "", orderType: "both", stackingRule: "standard",
    code: "", oncePerCustomer: false, deliveryMode: "email_and_account",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<{ code: string; granted: number; emailed: number } | null>(null);

  async function assign() {
    const v = Number(form.discountValue);
    if (!Number.isFinite(v) || v <= 0) { toast.error(t("invalidDiscount")); return; }
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/customer-groups/${group.id}/assign-promotion`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountType: form.discountType,
          discountValue: v,
          description: form.description || undefined,
          minimumOrder: Number(form.minimumOrder) || 0,
          expiresAt: form.expiresAt || undefined,
          orderType: form.orderType,
          stackingRule: form.stackingRule,
          code: form.code.trim() || undefined,
          oncePerCustomer: form.oncePerCustomer,
          deliveryMode: form.deliveryMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("assignFailed")); return; }
      setResult({ code: data.code, granted: data.granted, emailed: data.emailed });
      toast.success(t("assignSuccess", { count: data.granted }));
    } finally { setAssigning(false); }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none";

  return (
    <div className="max-w-3xl">
      <Link href="/admin/customer-groups" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft className="w-4 h-4" /> {t("backToGroups")}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
      {group.description && <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>}

      {/* ── Members ─────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-gray-400" />
          <h2 className="font-bold text-gray-900">{t("membersHeading", { count: members.length })}</h2>
        </div>

        <div className="space-y-1.5 mb-4">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noMembers")}</p>
          ) : members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50">
              <div className="min-w-0">
                <span className="text-sm text-gray-800">{m.name || m.email || m.phone}</span>
                {m.email && m.name && <span className="text-xs text-gray-400 ml-2">{m.email}</span>}
                <span className={`text-[11px] ml-2 px-1.5 py-0.5 rounded-full ${m.hasAccount ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                  {m.hasAccount ? t("account") : t("guest")}
                </span>
              </div>
              <button onClick={() => removeMember(m.id)} title={t("remove")} className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">{t("addMembersLabel")}</label>
        <textarea
          className={inputCls}
          rows={2}
          placeholder={t("addMembersPlaceholder")}
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
        />
        <p className="text-[11px] text-gray-400 mt-1">{t("addMembersHint")}</p>
        <button onClick={addMembers} disabled={adding} className="mt-2 inline-flex items-center gap-1.5 bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
          <UserPlus className="w-4 h-4" /> {adding ? "…" : t("addMembers")}
        </button>
      </section>

      {/* ── Assign a promotion to the group ─────────────────────────────── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-gray-900">{t("assignHeading")}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">{t("assignSubtitle")}</p>

        {result ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-1"><Check className="w-4 h-4" /> {t("assignDone")}</div>
            <p className="text-gray-700">{t("assignDoneBody", { count: result.granted, emailed: result.emailed })}</p>
            <p className="mt-2">{t("sharedCodeLabel")}: <code className="font-mono font-bold bg-white border border-emerald-200 text-emerald-700 rounded px-2 py-0.5">{result.code}</code></p>
            <button onClick={() => setResult(null)} className="mt-3 text-xs text-emerald-700 underline">{t("assignAnother")}</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              <select className={inputCls + " flex-1"} value={form.discountType} onChange={(e) => set({ discountType: e.target.value })}>
                <option value="percentage">{t("discountPercent")}</option>
                <option value="fixed">{t("discountFixed")}</option>
              </select>
              <div className="relative w-40">
                <input type="number" min="0" step="0.01" className={inputCls} value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />
                <span className="absolute right-3 top-2 text-gray-400 text-sm">{form.discountType === "percentage" ? "%" : currency.toUpperCase()}</span>
              </div>
            </div>
            <input className={inputCls} placeholder={t("offerDescPlaceholder")} value={form.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">{t("minOrderLabel")}
                <input type="number" min="0" step="0.01" className={inputCls + " mt-1"} value={form.minimumOrder} onChange={(e) => set({ minimumOrder: e.target.value })} />
              </label>
              <label className="text-xs text-gray-500">{t("expiresLabel")}
                <input type="date" className={inputCls + " mt-1"} value={form.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">{t("validForLabel")}
                <select className={inputCls + " mt-1"} value={form.orderType} onChange={(e) => set({ orderType: e.target.value })}>
                  <option value="both">{t("orderTypeBoth")}</option>
                  <option value="pickup">{t("orderTypePickup")}</option>
                  <option value="delivery">{t("orderTypeDelivery")}</option>
                  <option value="dine_in">{t("orderTypeDineIn")}</option>
                  <option value="take_out">{t("orderTypeTakeout")}</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">{t("stackingLabel")}
                <select className={inputCls + " mt-1"} value={form.stackingRule} onChange={(e) => set({ stackingRule: e.target.value })}>
                  <option value="standard">{t("stackingStandard")}</option>
                  <option value="exclusive">{t("stackingExclusive")}</option>
                  <option value="master">{t("stackingMaster")}</option>
                </select>
              </label>
            </div>
            <label className="text-xs text-gray-500 block">{t("customCodeLabel")}
              <input className={inputCls + " mt-1 font-mono uppercase"} placeholder={t("customCodePlaceholder")} value={form.code} maxLength={32} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.oncePerCustomer} onChange={(e) => set({ oncePerCustomer: e.target.checked })} className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
              {t("oncePerCustomer")}
            </label>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("deliveryModeLabel")}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "email_and_account", label: t("deliveryEmailAccount") },
                  { v: "account_only", label: t("deliveryAccountOnly") },
                ].map((o) => (
                  <button key={o.v} type="button" onClick={() => set({ deliveryMode: o.v })}
                    className={`text-left text-xs p-2.5 rounded-xl border-2 transition ${form.deliveryMode === o.v ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold" : "border-gray-200 text-gray-600 hover:border-emerald-200"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={assign} disabled={assigning || members.length === 0} className="inline-flex items-center gap-1.5 bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition disabled:opacity-50">
              <Gift className="w-4 h-4" /> {assigning ? t("assigning") : t("assignButton", { count: members.length })}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
