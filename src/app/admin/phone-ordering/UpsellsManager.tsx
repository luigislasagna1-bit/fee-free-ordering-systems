"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Upsell = {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  note: string | null;
  active: boolean;
};

const MAX_ACTIVE = 5;

/**
 * Featured Upsells manager (client island): cards with active toggle, note
 * edit and remove; an add-picker over the restaurant's menu items. The API
 * (workstream D) enforces the 5-active cap server-side and answers 409 —
 * this UI mirrors the cap optimistically and surfaces the 409 as a toast.
 */
export default function UpsellsManager({
  initialUpsells,
  menuItems,
  currency,
}: {
  initialUpsells: Upsell[];
  menuItems: { id: string; name: string; price: number }[];
  currency: string;
}) {
  const t = useTranslations("admin.phoneOrderingPage.upsells");
  const router = useRouter();
  const [upsells, setUpsells] = useState<Upsell[]>(initialUpsells);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const activeCount = upsells.filter((u) => u.active).length;
  const limitReached = activeCount >= MAX_ACTIVE;

  const candidates = useMemo(() => {
    const taken = new Set(upsells.map((u) => u.menuItemId));
    const q = search.trim().toLowerCase();
    return menuItems
      .filter((m) => !taken.has(m.id) && (!q || m.name.toLowerCase().includes(q)))
      .slice(0, 30);
  }, [menuItems, upsells, search]);

  const call = async (input: RequestInfo, init: RequestInit): Promise<Response | null> => {
    setBusy(true);
    try {
      return await fetch(input, init);
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  };

  const add = async (menuItemId: string) => {
    const res = await call("/api/admin/phone-ordering/upsells", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ menuItemId }),
    });
    if (res?.status === 409) {
      toast.error(t("limitToast"));
      return;
    }
    if (!res?.ok) {
      toast.error(t("updateError"));
      return;
    }
    const item = menuItems.find((m) => m.id === menuItemId);
    const created = await res.json().catch(() => null);
    if (item) {
      setUpsells((u) => [
        ...u,
        {
          id: created?.upsell?.id ?? created?.id ?? menuItemId,
          menuItemId,
          name: item.name,
          price: item.price,
          note: null,
          active: true,
        },
      ]);
    }
    toast.success(t("addedToast"));
    setSearch("");
    router.refresh();
  };

  const patch = async (id: string, body: Record<string, unknown>, revert: () => void) => {
    const res = await call(`/api/admin/phone-ordering/upsells/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res?.status === 409) {
      revert();
      toast.error(t("limitToast"));
      return;
    }
    if (!res?.ok) {
      revert();
      toast.error(t("updateError"));
      return;
    }
    router.refresh();
  };

  const toggleActive = (u: Upsell) => {
    const next = !u.active;
    setUpsells((list) => list.map((x) => (x.id === u.id ? { ...x, active: next } : x)));
    void patch(u.id, { active: next }, () =>
      setUpsells((list) => list.map((x) => (x.id === u.id ? { ...x, active: !next } : x))),
    );
  };

  const saveNote = (u: Upsell, note: string) => {
    const prev = u.note;
    const clean = note.trim() || null;
    if (clean === prev) return;
    setUpsells((list) => list.map((x) => (x.id === u.id ? { ...x, note: clean } : x)));
    void patch(u.id, { note: clean ?? "" }, () =>
      setUpsells((list) => list.map((x) => (x.id === u.id ? { ...x, note: prev } : x))),
    );
  };

  const remove = async (u: Upsell) => {
    const res = await call(`/api/admin/phone-ordering/upsells/${u.id}`, { method: "DELETE" });
    if (!res?.ok) {
      toast.error(t("updateError"));
      return;
    }
    setUpsells((list) => list.filter((x) => x.id !== u.id));
    toast.success(t("removedToast"));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Current upsells. */}
      {upsells.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {t("empty")}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {upsells.map((u) => (
            <div key={u.id} className={`rounded-xl border bg-white p-4 space-y-3 ${u.active ? "border-emerald-200" : "border-gray-200 opacity-75"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{u.name}</div>
                  <div className="text-sm text-gray-500">{formatCurrency(u.price, currency)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(u)}
                  disabled={busy}
                  className={`relative w-10 h-6 rounded-full transition flex-shrink-0 ${u.active ? "bg-emerald-600" : "bg-gray-300"}`}
                  aria-pressed={u.active}
                  title={u.active ? t("active") : t("inactive")}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${u.active ? "translate-x-4" : ""}`} />
                </button>
              </div>
              <label className="block">
                <span className="text-[11px] text-gray-500">{t("noteLabel")}</span>
                <input
                  type="text"
                  defaultValue={u.note ?? ""}
                  placeholder={t("notePlaceholder")}
                  maxLength={140}
                  onBlur={(e) => saveNote(u, e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </label>
              <button
                type="button"
                onClick={() => remove(u)}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t("remove")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add picker. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-emerald-600" />
            {t("addUpsell")}
          </h3>
          <span className={`text-xs font-semibold ${limitReached ? "text-amber-600" : "text-gray-400"}`}>
            {activeCount}/{MAX_ACTIVE}
          </span>
        </div>
        {limitReached && <p className="text-xs text-amber-600">{t("limitReached")}</p>}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchMenu")}
          disabled={limitReached}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
        {!limitReached && (
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {candidates.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">{t("noMenuItems")}</p>
            ) : (
              candidates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => add(m.id)}
                  disabled={busy}
                  className="w-full flex items-center justify-between gap-3 py-2 px-1 text-left hover:bg-gray-50 rounded transition disabled:opacity-60"
                >
                  <span className="text-sm text-gray-800 truncate">{m.name}</span>
                  <span className="text-sm text-gray-500 flex-shrink-0">{formatCurrency(m.price, currency)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
