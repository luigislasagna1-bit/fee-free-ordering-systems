"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Crown, Plus, Users, Trash2, Pencil, Tag, Gift, Loader2, Check, X, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Group = { id: string; name: string; description: string | null; memberCount: number; updatedAt: string };
type Promo = { id: string; name: string; isActive: boolean; promotionType: string; ruleConfig: any };
type Target = { id: string; promotionId: string; promoName: string; promotionType: string; isActive: boolean; ruleConfig: any; name: string | null; email: string | null; phone: string | null; hasAccount: boolean };

export default function CustomerGroupsClient({ initialGroups, initialMemberLabel, currency }: { initialGroups: Group[]; initialMemberLabel: string; currency: string }) {
  const t = useTranslations("admin.customerGroups");
  // Reuse the Customers list's "Search name, email, phone…" placeholder and
  // the menu editor's "No matches for {query}" — no new strings needed.
  const tCust = useTranslations("admin.customersList");
  const tMenu = useTranslations("admin.menuEditor");
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(initialGroups);

  // What this restaurant calls its VIP recipients (used in the email).
  const [memberLabel, setMemberLabel] = useState(initialMemberLabel);
  const [savingLabel, setSavingLabel] = useState(false);
  async function saveMemberLabel() {
    setSavingLabel(true);
    try {
      const res = await fetch("/api/admin/vip-specials/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberLabel }),
      });
      if (!res.ok) { toast.error(t("memberLabelFailed")); return; }
      toast.success(t("memberLabelSaved"));
    } finally { setSavingLabel(false); }
  }
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  // Inline rename (replaces the old browser prompt()). Luigi 2026-06-30.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // ── Individual specials (give an existing promo to specific people) ───────
  const [promos, setPromos] = useState<Promo[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [pick, setPick] = useState("");
  const [emailsText, setEmailsText] = useState("");
  const [notify, setNotify] = useState(true);
  const [giving, setGiving] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(true);
  // Search scoped to the Individual specials section (name/email/phone) —
  // the 1:1 gift list grows fast. Luigi 2026-07-19.
  const [targetQuery, setTargetQuery] = useState("");

  const reloadIndividuals = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/vip-specials/individuals").then((x) => x.json());
      if (Array.isArray(r.targets)) setTargets(r.targets);
    } catch { /* ignore */ } finally { setLoadingTargets(false); }
  }, []);

  useEffect(() => {
    fetch("/api/admin/vip-specials/pickable").then((x) => x.json()).then((d) => { if (Array.isArray(d.promotions)) setPromos(d.promotions); }).catch(() => {});
    reloadIndividuals();
  }, [reloadIndividuals]);

  async function giveIndividual() {
    const emails = emailsText.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
    if (!pick) return;
    if (!emails.length) { toast.error(t("noValidEmails")); return; }
    setGiving(true);
    try {
      const res = await fetch("/api/admin/vip-specials/individuals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId: pick, emails, notify }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("attachFailed")); return; }
      toast.success(t("given", { count: data.added }));
      if (notify && typeof data.emailed === "number") toast.success(t("notifySent", { count: data.emailed }));
      setEmailsText("");
      await reloadIndividuals();
    } finally { setGiving(false); }
  }

  async function removeTarget(id: string) {
    if (!confirm(t("confirmRemoveSpecial"))) return;
    const res = await fetch(`/api/admin/vip-specials/individuals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("detachFailed")); return; }
    setTargets((s) => s.filter((x) => x.id !== id));
  }

  // Individual-specials search: name / email / phone, case-insensitive.
  const tq = targetQuery.trim().toLowerCase();
  const visibleTargets = tq
    ? targets.filter((x) => `${x.name ?? ""} ${x.email ?? ""} ${x.phone ?? ""}`.toLowerCase().includes(tq))
    : targets;

  function discChip(rc: any): string | null {
    if (typeof rc?.discountPercent === "number" && rc.discountPercent > 0) return `${rc.discountPercent}%`;
    if (typeof rc?.discountAmount === "number" && rc.discountAmount > 0) return formatCurrency(rc.discountAmount, currency);
    return null;
  }
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none";

  async function createGroup() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/customer-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("createFailed")); return; }
      toast.success(t("created", { name: name.trim() }));
      setName(""); setDescription(""); setCreating(false);
      router.refresh();
      setGroups((g) => [{ id: data.group.id, name: data.group.name, description: description.trim() || null, memberCount: 0, updatedAt: new Date().toISOString() }, ...g]);
    } finally { setBusy(false); }
  }

  async function deleteGroup(id: string, gname: string) {
    if (!confirm(t("confirmDelete", { name: gname }))) return;
    const res = await fetch(`/api/admin/customer-groups/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("deleteFailed")); return; }
    setGroups((g) => g.filter((x) => x.id !== id));
    toast.success(t("deleted"));
    router.refresh();
  }

  function startRename(id: string, current: string) {
    setEditingId(id);
    setEditName(current);
  }
  async function saveRename(id: string) {
    const next = editName.trim();
    const current = groups.find((g) => g.id === id)?.name ?? "";
    if (!next || next === current) { setEditingId(null); return; }
    setRenaming(true);
    try {
      const res = await fetch(`/api/admin/customer-groups/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("renameFailed")); return; }
      setGroups((g) => g.map((x) => (x.id === id ? { ...x, name: next } : x)));
      setEditingId(null);
      router.refresh();
    } finally { setRenaming(false); }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="inline-flex items-center gap-1.5 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-600 transition"
        >
          <Plus className="w-4 h-4" /> {t("newGroup")}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t("description")}</p>

      {/* What this restaurant calls its members (used in the VIP email). */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">{t("memberLabelLabel")}</label>
        <div className="flex gap-2">
          <input
            className={inputCls + " flex-1"}
            placeholder={t("memberLabelPlaceholder")}
            value={memberLabel}
            maxLength={40}
            onChange={(e) => setMemberLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveMemberLabel(); }}
          />
          <button onClick={saveMemberLabel} disabled={savingLabel} className="bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
            {savingLabel ? <Loader2 className="w-4 h-4 animate-spin" /> : t("memberLabelSave")}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">{t("memberLabelHint", { label: memberLabel.trim() || t("memberLabelDefault") })}</p>
      </div>

      {creating && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 shadow-sm space-y-3">
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            placeholder={t("groupNamePlaceholder")}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
          />
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            placeholder={t("groupDescPlaceholder")}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={createGroup} disabled={busy || !name.trim()} className="bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("create")}
            </button>
            <button onClick={() => { setCreating(false); setName(""); setDescription(""); }} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2 mt-1">
        <Users className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{t("groupsHeading")}</h2>
      </div>
      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-gray-100 shadow-sm">
          <Crown className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-gray-400 mt-1">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
              {editingId === g.id ? (
                <>
                  <input
                    autoFocus
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={editName}
                    maxLength={80}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(g.id); if (e.key === "Escape") setEditingId(null); }}
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => saveRename(g.id)} disabled={renaming} title={t("memberLabelSave")} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50">{renaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}</button>
                    <button onClick={() => setEditingId(null)} title={t("cancel")} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                </>
              ) : (
                <>
                  <Link href={`/admin/customer-groups/${g.id}`} className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{g.name}</div>
                    {g.description && <div className="text-xs text-gray-400 truncate mt-0.5">{g.description}</div>}
                    <div className="inline-flex items-center gap-1 text-xs text-gray-500 mt-1.5">
                      <Users className="w-3.5 h-3.5" /> {t("memberCount", { count: g.memberCount })}
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link href={`/admin/customer-groups/${g.id}`} className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition">
                      {t("manage")}
                    </Link>
                    <button onClick={() => startRename(g.id, g.name)} title={t("rename")} className="p-1.5 text-gray-400 hover:text-blue-500 rounded"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => deleteGroup(g.id, g.name)} title={t("delete")} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Individual specials (give a promo to specific people) ─────────── */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{t("individualsHeading")}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">{t("individualsSubtitle")}</p>

        {/* Search the individual specials by recipient name/email/phone. */}
        {targets.length > 0 && (
          <div className="relative max-w-xs mb-3">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={targetQuery}
              onChange={(e) => setTargetQuery(e.target.value)}
              placeholder={tCust("searchPlaceholder")}
              className="w-full bg-gray-50 border border-gray-200 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

        {/* Existing individual specials, grouped by promotion */}
        {loadingTargets && (
          <div className="mb-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        )}
        {tq !== "" && targets.length > 0 && visibleTargets.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">{tMenu("noMatchesFor", { query: targetQuery.trim() })}</p>
        )}
        {visibleTargets.length > 0 && (
          <div className="space-y-3 mb-4">
            {Object.values(visibleTargets.reduce((acc, tg) => {
              (acc[tg.promotionId] ??= { promo: tg, people: [] }).people.push(tg);
              return acc;
            }, {} as Record<string, { promo: Target; people: Target[] }>)).map(({ promo, people }) => {
              const c = discChip(promo.ruleConfig);
              return (
                <div key={promo.promotionId} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-gray-900">{promo.promoName}</span>
                    {c && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">{c}</span>}
                    {!promo.isActive && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">{t("inactiveBadge")}</span>}
                    <span className="text-xs text-gray-400 ml-auto">{t("peopleCount", { count: people.length })}</span>
                  </div>
                  <ul className="space-y-1">
                    {people.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-gray-50">
                        <span className="text-sm text-gray-700 min-w-0 truncate">
                          {p.name || p.email || p.phone}
                          <span className={`text-[11px] ml-2 px-1.5 py-0.5 rounded-full ${p.hasAccount ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{p.hasAccount ? t("account") : t("guest")}</span>
                        </span>
                        <button onClick={() => removeTarget(p.id)} title={t("removeTarget")} className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* Give a special to specific people */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          {promos.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noPickable")}</p>
          ) : (
            <>
              <select className={inputCls + " mb-2"} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{t("attachPlaceholder")}</option>
                {promos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{!p.isActive ? ` · ${t("inactiveBadge")}` : ""}</option>
                ))}
              </select>
              <textarea className={inputCls} rows={2} placeholder={t("addMembersPlaceholder")} value={emailsText} onChange={(e) => setEmailsText(e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                {t("notifyPeople")}
              </label>
              <button onClick={giveIndividual} disabled={giving || !pick} className="mt-2 inline-flex items-center gap-1.5 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-600 transition disabled:opacity-50">
                <Plus className="w-4 h-4" /> {giving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("giveSpecial")}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
