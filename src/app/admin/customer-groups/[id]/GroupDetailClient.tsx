"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ChevronLeft, Users, Trash2, UserPlus, Gift, Plus, Tag, ExternalLink, Mail, Pencil, Loader2, Search, Download, Percent, X } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";
import { escCsv } from "@/lib/csv";
import { ScheduleEditor } from "../ScheduleEditor";

type Member = { id: string; name: string | null; email: string | null; phone: string | null; hasAccount: boolean };
type Group = { id: string; name: string; description: string | null; memberLabel: string | null; rewardEarnPercent: number | null };
type Promo = { id: string; name: string; promotionType: string; isActive: boolean; displayMode: string; couponCode: string | null; ruleConfig: any; minimumOrder: number };
type Special = Promo & { linkId: string };
type Pickable = Promo & { groupCount: number };

export default function GroupDetailClient({ group, initialMembers, initialSpecials, initialPickable, currency, rewardsEnabled, rewardLabelPlural }: {
  group: Group; initialMembers: Member[]; initialSpecials: Special[]; initialPickable: Pickable[]; currency: string;
  /** Already earn-gated by the page: rewardsEnabled && rewardEarnEnabled —
   *  with earning off the ledger never pays a group rate, so the card must
   *  not render (review 2026-07-19). */
  rewardsEnabled: boolean;
  /** RAW nullable label — the translated default resolves HERE, not as a
   *  hardcoded-English page fallback (review 2026-07-19). */
  rewardLabelPlural: string | null;
}) {
  const t = useTranslations("admin.customerGroups");
  // Reused strings: Customers list search placeholder + Export CSV label,
  // menu editor's generic "No matches for {query}".
  const tCust = useTranslations("admin.customersList");
  const tMenu = useTranslations("admin.menuEditor");
  // Earn-rate card strings live with the rest of the rewards copy; toasts are
  // the shared admin saved/saveFailed pair.
  const tRewards = useTranslations("admin.rewards");
  const tToasts = useTranslations("admin.toasts");
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [specials, setSpecials] = useState<Special[]>(initialSpecials);
  const [pickable, setPickable] = useState<Pickable[]>(initialPickable);

  // ── Edit the group's name + description (so a typed description like a brand
  //    line can be changed/cleared after creation). Luigi 2026-06-27. ──────────
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editDesc, setEditDesc] = useState(group.description ?? "");
  const [editLabel, setEditLabel] = useState(group.memberLabel ?? "");
  const [info, setInfo] = useState({ name: group.name, description: group.description ?? "" });
  const [savingInfo, setSavingInfo] = useState(false);
  async function saveDetails() {
    const name = editName.trim();
    if (!name) { toast.error(t("renameFailed")); return; }
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/admin/customer-groups/${group.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: editDesc.trim(), memberLabel: editLabel.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("renameFailed")); return; }
      setInfo({ name, description: editDesc.trim() });
      setEditing(false);
      router.refresh();
    } finally { setSavingInfo(false); }
  }

  // ── Group earn-rate override ("VIP members earn double") — % of the earn
  //    basis for this group's members instead of the restaurant base rate.
  //    Personal > highest group > base (resolution in reward-earn-rate.ts). ───
  const [ratePct, setRatePct] = useState<number | null>(group.rewardEarnPercent);
  const [rateDraft, setRateDraft] = useState(group.rewardEarnPercent != null ? String(group.rewardEarnPercent) : "");
  const [savingRate, setSavingRate] = useState(false);
  // Mirror of the server clamp (≤0 clears, else ≤100 at 2dp) so the input
  // shows what stuck — a typed 0 must CLEAR, never become a 0.01% downgrade.
  const clampPct = (n: number) => (n <= 0 ? null : Math.round(Math.min(100, n) * 100) / 100);
  const rateParsed = rateDraft.trim() === "" ? null : parseFloat(rateDraft);
  const rateValid = rateParsed === null || Number.isFinite(rateParsed);
  const rateDirty = rateValid && (rateParsed === null ? ratePct != null : rateParsed !== ratePct);
  async function saveRate(value: number | null) {
    setSavingRate(true);
    try {
      const res = await fetch(`/api/admin/customer-groups/${group.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardEarnPercent: value }),
      });
      if (!res.ok) { toast.error(tToasts("saveFailed")); return; }
      setRatePct(value);
      setRateDraft(value != null ? String(value) : "");
      toast.success(tToasts("saved"));
      router.refresh();
    } finally { setSavingRate(false); }
  }

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
    if (!confirm(t("confirmRemoveMember"))) return;
    const res = await fetch(`/api/admin/customer-groups/${group.id}/members?memberId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("removeFailed")); return; }
    setMembers((m) => m.filter((x) => x.id !== id));
    router.refresh();
  }

  // ── Member search + CSV export (Luigi 2026-07-19) ──────────────────────────
  const [memberQuery, setMemberQuery] = useState("");
  const mq = memberQuery.trim().toLowerCase();
  const visibleMembers = mq
    ? members.filter((m) => `${m.name ?? ""} ${m.email ?? ""} ${m.phone ?? ""}`.toLowerCase().includes(mq))
    : members;
  // The server fetch is capped at 1000 rows (page.tsx take: 1000) — exactly
  // 1000 means the list is (almost certainly) truncated, so show "1000+".
  // Frozen at mount: client-side add/remove must not flip truncation state.
  const capped = useRef(initialMembers.length === 1000).current;

  /** RFC-4180 CSV of the currently VISIBLE (search-filtered) members — same
   *  esc()/BOM/filename pattern as the Customers export. */
  function exportCsv() {
    const lines = [["Name", "Email", "Phone", "Has account"].join(",")];
    for (const m of visibleMembers) {
      lines.push([escCsv(m.name), escCsv(m.email), escCsv(m.phone), escCsv(m.hasAccount ? "yes" : "no")].join(","));
    }
    // Flag the server-side truncation inside the file itself so an exported
    // list is never silently mistaken for the complete membership. Padded to
    // the full column count so parsers keep a rectangular table.
    if (capped) lines.push([escCsv(`# ${t("membersCsvCapNote")}`), "", "", ""].join(","));
    // UTF-8 BOM so Excel reads accented characters correctly.
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `group-members-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Member specials: attach an existing promotion to the whole group ──────
  // (Phase 1) — picking a promotion you already built makes it member-only:
  // hidden from the public menu, auto-applied for members at checkout.
  const [pick, setPick] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [notifyOnAttach, setNotifyOnAttach] = useState(true);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

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
        body: JSON.stringify({ promotionId: pick, notify: notifyOnAttach }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("attachFailed")); return; }
      toast.success(t("attached"));
      if (notifyOnAttach && typeof data.emailed === "number") toast.success(t("notifySent", { count: data.emailed }));
      setPick("");
      await reloadSpecials();
      router.refresh();
    } finally { setAttaching(false); }
  }

  async function notifyMembers(promotionId: string) {
    setNotifyingId(promotionId);
    try {
      const res = await fetch(`/api/admin/customer-groups/${group.id}/promotions/notify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("notifyFailed")); return; }
      toast.success(t("notifySent", { count: data.emailed }));
    } finally { setNotifyingId(null); }
  }

  async function detachSpecial(promotionId: string) {
    if (!confirm(t("confirmRemoveSpecial"))) return;
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2 max-w-md">
              <input className={inputCls} value={editName} maxLength={80} placeholder={t("groupNamePlaceholder")} onChange={(e) => setEditName(e.target.value)} />
              <input className={inputCls} value={editDesc} maxLength={500} placeholder={t("groupDescPlaceholder")} onChange={(e) => setEditDesc(e.target.value)} />
              {/* Per-group "what do you call your members" — overrides the
                  restaurant default for THIS group's VIP emails. Luigi 2026-06-30. */}
              <label className="block text-xs font-medium text-gray-600 pt-1">{t("memberLabelLabel")}</label>
              <input className={inputCls} value={editLabel} maxLength={40} placeholder={t("memberLabelPlaceholder")} onChange={(e) => setEditLabel(e.target.value)} />
              <p className="text-[11px] text-gray-400">{t("memberLabelGroupHint")}</p>
              <div className="flex gap-2">
                <button onClick={saveDetails} disabled={savingInfo} className="bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">{savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : t("memberLabelSave")}</button>
                <button onClick={() => { setEditing(false); setEditName(info.name); setEditDesc(info.description); setEditLabel(group.memberLabel ?? ""); }} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition">{t("cancel")}</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{info.name}</h1>
              {info.description && <p className="text-sm text-gray-500 mt-0.5">{info.description}</p>}
            </>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} title={t("rename")} className="p-1.5 text-gray-400 hover:text-blue-500 rounded flex-shrink-0"><Pencil className="w-4 h-4" /></button>
        )}
      </div>

      {/* ── Members ─────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Users className="w-5 h-5 text-gray-400" />
          {/* "1000+" when the server cap was hit — the true count may be higher. */}
          <h2 className="font-bold text-gray-900">{t("membersHeading", { count: capped ? "1000+" : members.length })}</h2>
          {members.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleMembers.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" /> {tCust("exportCsv")}
            </button>
          )}
        </div>

        {/* Member search (name / email / phone) — the export follows it. */}
        {members.length > 0 && (
          <div className="relative max-w-xs mb-3">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder={tCust("searchPlaceholder")}
              className="w-full bg-gray-50 border border-gray-200 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

        <div className="space-y-1.5 mb-4">
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noMembers")}</p>
          ) : visibleMembers.length === 0 ? (
            <p className="text-sm text-gray-400">{tMenu("noMatchesFor", { query: memberQuery.trim() })}</p>
          ) : visibleMembers.map((m) => (
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
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && emailsText.trim()) addMembers(); }}
        />
        <p className="text-[11px] text-gray-400 mt-1">{t("addMembersHint")}</p>
        <button onClick={addMembers} disabled={adding || !emailsText.trim()} className="mt-2 inline-flex items-center gap-1.5 bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
          <UserPlus className="w-4 h-4" /> {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : t("addMembers")}
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
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => notifyMembers(s.id)} disabled={notifyingId === s.id} title={t("notifyMembers")} className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                    <Mail className="w-3.5 h-3.5" /> {notifyingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("notifyMembers")}
                  </button>
                  <button onClick={() => detachSpecial(s.id)} title={t("detach")} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Attach a promotion */}
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {t("attachLabel")} <HelpTip text={t("memberOnlyNote")} />
        </label>
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
              <Plus className="w-4 h-4" /> {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : t("attach")}
            </button>
          </div>
        )}
        {pickable.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-600 mt-2">
            <input type="checkbox" checked={notifyOnAttach} onChange={(e) => setNotifyOnAttach(e.target.checked)} className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
            {t("notifyOnAttach")}
          </label>
        )}
        <Link href="/admin/promotions/new" className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-2 hover:underline">
          <ExternalLink className="w-3.5 h-3.5" /> {t("createNewPromo")}
        </Link>
      </section>

      {/* ── Earn-rate override for this group's members ──────────────────── */}
      {rewardsEnabled && (
        <section className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mt-5">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-gray-900">{tRewards("groupRateCardTitle")}</h2>
            <HelpTip text={tRewards("groupRatesExplainer")} />
          </div>
          <p className="text-sm text-gray-500 mb-3">{tRewards("groupRateCardDesc", { label: rewardLabelPlural?.trim() || tRewards("defaultPlural") })}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
              <input
                type="number" min={0.01} max={100} step="0.01"
                value={rateDraft}
                placeholder={tRewards("ratePlaceholder")}
                onChange={(e) => setRateDraft(e.target.value)}
                className="w-24 px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
              <span className="px-2.5 flex items-center bg-gray-50 text-gray-500 text-sm border-l border-gray-300">%</span>
            </div>
            {rateDirty && (
              <button
                type="button"
                onClick={() => saveRate(rateParsed === null ? null : clampPct(rateParsed))}
                disabled={savingRate}
                className="inline-flex items-center gap-1.5 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-600 transition disabled:opacity-50"
              >
                {savingRate ? <Loader2 className="w-4 h-4 animate-spin" /> : t("memberLabelSave")}
              </button>
            )}
            {!rateDirty && ratePct != null && (
              <button
                type="button"
                onClick={() => saveRate(null)}
                disabled={savingRate}
                title={tRewards("rateClear")}
                aria-label={tRewards("rateClear")}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
              >
                {savingRate ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Automations: recurring credit grants / scheduled re-sends ──────── */}
      <ScheduleEditor target={{ groupId: group.id }} rewardsEnabled={rewardsEnabled} currency={currency} rewardLabelPlural={rewardLabelPlural?.trim() || tRewards("defaultPlural")} />
    </div>
  );
}
