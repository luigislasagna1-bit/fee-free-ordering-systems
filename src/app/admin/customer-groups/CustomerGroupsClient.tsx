"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Crown, Plus, Users, Trash2, Pencil } from "lucide-react";

type Group = { id: string; name: string; description: string | null; memberCount: number; updatedAt: string };

export default function CustomerGroupsClient({ initialGroups }: { initialGroups: Group[] }) {
  const t = useTranslations("admin.customerGroups");
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function renameGroup(id: string, current: string) {
    const next = prompt(t("renamePrompt"), current);
    if (next == null || !next.trim() || next.trim() === current) return;
    const res = await fetch(`/api/admin/customer-groups/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || t("renameFailed")); return; }
    setGroups((g) => g.map((x) => (x.id === id ? { ...x, name: next.trim() } : x)));
    router.refresh();
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
      <p className="text-sm text-gray-500 mb-5">{t("description")}</p>

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
              {busy ? "…" : t("create")}
            </button>
            <button onClick={() => { setCreating(false); setName(""); setDescription(""); }} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

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
                <button onClick={() => renameGroup(g.id, g.name)} title={t("rename")} className="p-1.5 text-gray-400 hover:text-blue-500 rounded"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteGroup(g.id, g.name)} title={t("delete")} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
