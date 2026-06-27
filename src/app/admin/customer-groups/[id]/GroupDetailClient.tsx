"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ChevronLeft, Users, Trash2, UserPlus, Gift, Plus, Tag, ExternalLink } from "lucide-react";

type Member = { id: string; name: string | null; email: string | null; phone: string | null; hasAccount: boolean };
type Group = { id: string; name: string; description: string | null };
type Promo = { id: string; name: string; promotionType: string; isActive: boolean; displayMode: string; couponCode: string | null; ruleConfig: any; minimumOrder: number };
type Special = Promo & { linkId: string };
type Pickable = Promo & { groupCount: number };

export default function GroupDetailClient({ group, initialMembers, initialSpecials, initialPickable, currency }: {
  group: Group; initialMembers: Member[]; initialSpecials: Special[]; initialPickable: Pickable[]; currency: string;
}) {
  const t = useTranslations("admin.customerGroups");
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [specials, setSpecials] = useState<Special[]>(initialSpecials);
  const [pickable, setPickable] = useState<Pickable[]>(initialPickable);

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
      // Re-fetch the member list so the table updates immediately — useState is
      // seeded once and router.refresh() alone doesn't re-sync it. Luigi 2026-06-27.
      await reloadMembers();
      router.refresh();
    } finally { setAdding(false); }
  }

  async function reloadMembers() {
    try {
      const g = await fetch(`/api/admin/customer-groups/${group.id}`).then((r) => r.json());
      if (Array.isArray(g.members)) setMembers(g.members);
    } catch { /* keep current list */ }
  }

  async function removeMember(id: string) {
    const res = await fetch(`/api/admin/customer-groups/${group.id}/members?memberId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("removeFailed")); return; }
    setMembers((m) => m.filter((x) => x.id !== id));
    router.refresh();
  }

  // ── Member specials: attach an existing promotion to the whole group ──────
  // (Phase 1) — picking a promotion you already built makes it member-only:
  // hidden from the public menu, auto-applied for members at checkout.
  const [pick, setPick] = useState("");
  const [attaching, setAttaching] = useState(false);

  async function reloadSpecials() {
    try {
      const g = await fetch(`/api/admin/customer-groups/${group.id}`).then((r) => r.json());
      if (Array.isArray(g.specials)) setSpecials(g.specials);
      if (Array.isArray(g.pickable)) setPickable(g.pickable);
    } catch { /* keep current */ }
  }

  async function attachSpecial() {
    if (!pick) return;
    setAttaching(true);
    try {
      const res = await fetch(`/api/admin/customer-groups/${group.id}/promotions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId: pick }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("attachFailed")); return; }
      toast.success(t("attached"));
      setPick("");
      await reloadSpecials();
      router.refresh();
    } finally { setAttaching(false); }
  }

  async function detachSpecial(promotionId: string) {
    const res = await fetch(`/api/admin/customer-groups/${group.id}/promotions?promotionId=${encodeURIComponent(promotionId)}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("detachFailed")); return; }
    setSpecials((s) => s.filter((x) => x.id !== promotionId));
    toast.success(t("detached"));
    await reloadSpecials();
    router.refresh();
  }

  function discountChip(p: Promo): string | null {
    const rc = p.ruleConfig || {};
    if (typeof rc.discountPercent === "number" && rc.discountPercent > 0) return `${rc.discountPercent}%`;
    if (typeof rc.discountAmount === "number" && rc.discountAmount > 0) return `${currency.toUpperCase()} ${rc.discountAmount}`;
    return null;
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
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addMembers(); }}
        />
        <p className="text-[11px] text-gray-400 mt-1">{t("addMembersHint")}</p>
        <button onClick={addMembers} disabled={adding} className="mt-2 inline-flex items-center gap-1.5 bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
          <UserPlus className="w-4 h-4" /> {adding ? "…" : t("addMembers")}
        </button>
      </section>

      {/* ── Member specials (attach existing promotions) ─────────────────── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-gray-900">{t("specialsHeading")}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">{t("specialsSubtitle")}</p>

        {/* Attached specials */}
        <div className="space-y-1.5 mb-4">
          {specials.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noSpecials")}</p>
          ) : specials.map((s) => {
            const chip = discountChip(s);
            return (
              <div key={s.linkId} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-gray-100 bg-gray-50/50">
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{s.name}</span>
                  {chip && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">{chip}</span>}
                  {!s.isActive && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">{t("inactiveBadge")}</span>}
                </div>
                <button onClick={() => detachSpecial(s.id)} title={t("detach")} className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>

        {/* Attach a promotion */}
        <label className="block text-xs font-medium text-gray-600 mb-1">{t("attachLabel")}</label>
        {pickable.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noPickable")}</p>
        ) : (
          <div className="flex gap-2">
            <select className={inputCls + " flex-1"} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{t("attachPlaceholder")}</option>
              {pickable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{!p.isActive ? ` · ${t("inactiveBadge")}` : ""}
                </option>
              ))}
            </select>
            <button onClick={attachSpecial} disabled={attaching || !pick} className="inline-flex items-center gap-1.5 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-600 transition disabled:opacity-50">
              <Plus className="w-4 h-4" /> {attaching ? "…" : t("attach")}
            </button>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2">{t("memberOnlyNote")}</p>
        <Link href="/admin/promotions/new" className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-2 hover:underline">
          <ExternalLink className="w-3.5 h-3.5" /> {t("createNewPromo")}
        </Link>
      </section>
    </div>
  );
}
