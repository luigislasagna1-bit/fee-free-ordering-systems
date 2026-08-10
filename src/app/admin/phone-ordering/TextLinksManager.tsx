"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Link2, Plus, Trash2 } from "lucide-react";

export type TextLink = {
  id: string;
  kind: string;
  label: string;
  url: string | null;
  active: boolean;
};

const KINDS = ["order_online", "menu", "reservation", "support", "custom"] as const;

/**
 * Text Links manager — the links Nabil texts callers mid-call. Unlike Loman's
 * dead GloriaFood URLs, an EMPTY url means "use the restaurant's branded
 * default" (computed at send time — never 404s). CRUD via
 * /api/admin/phone-ordering/text-links (workstream D).
 */
export default function TextLinksManager({ initialLinks }: { initialLinks: TextLink[] }) {
  const t = useTranslations("admin.phoneOrderingPage.links");
  const router = useRouter();
  const [links, setLinks] = useState<TextLink[]>(initialLinks);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const kindLabel = (k: string) => ((KINDS as readonly string[]).includes(k) ? t(`kind.${k}`) : k);

  const request = async (url: string, init: RequestInit): Promise<Response | null> => {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error();
      return res;
    } catch {
      toast.error(t("errorToast"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const create = async (kind: string, label: string, url: string) => {
    const res = await request("/api/admin/phone-ordering/text-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, label, url: url.trim() || null }),
    });
    if (!res) return;
    const created = await res.json().catch(() => null);
    setLinks((list) => [
      ...list,
      { id: created?.link?.id ?? created?.id ?? `tmp-${Date.now()}`, kind, label, url: url.trim() || null, active: true },
    ]);
    setAdding(false);
    toast.success(t("savedToast"));
    router.refresh();
  };

  const save = async (link: TextLink, patch: Partial<TextLink>) => {
    const res = await request(`/api/admin/phone-ordering/text-links/${link.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res) return;
    setLinks((list) => list.map((x) => (x.id === link.id ? { ...x, ...patch } : x)));
    toast.success(t("savedToast"));
    router.refresh();
  };

  const remove = async (link: TextLink) => {
    const res = await request(`/api/admin/phone-ordering/text-links/${link.id}`, { method: "DELETE" });
    if (!res) return;
    setLinks((list) => list.filter((x) => x.id !== link.id));
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-gray-400" />
          {t("title")}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">{t("explainer")}</p>
      </div>

      {links.length === 0 && !adding && <p className="text-sm text-gray-500">{t("empty")}</p>}

      <div className="space-y-2">
        {links.map((link) => (
          <LinkRow key={link.id} link={link} busy={busy} onSave={(patch) => save(link, patch)} onRemove={() => remove(link)} t={t} kindLabel={kindLabel} />
        ))}
      </div>

      {adding ? (
        <LinkForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={create}
          t={t}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition"
        >
          <Plus className="w-4 h-4" />
          {t("addLink")}
        </button>
      )}
    </div>
  );
}

function LinkRow({
  link,
  busy,
  onSave,
  onRemove,
  t,
  kindLabel,
}: {
  link: TextLink;
  busy: boolean;
  onSave: (patch: Partial<TextLink>) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
  kindLabel: (k: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <LinkForm
        busy={busy}
        initial={link}
        onCancel={() => setEditing(false)}
        onSave={(kind, label, url) => {
          // Send "" (not null) to clear: the PATCH contract only reads `url`
          // when it's a string, and an empty one resets to the branded default.
          onSave({ kind, label, url: url.trim() });
          setEditing(false);
        }}
        t={t}
      />
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{kindLabel(link.kind)}</span>
          <span className="text-sm font-medium text-gray-900 truncate">{link.label}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {link.url || (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              {t("defaultBadge")}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition">
          {t("edit")}
        </button>
        <button type="button" onClick={onRemove} disabled={busy} title={t("delete")} className="text-gray-400 hover:text-red-600 transition">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function LinkForm({
  busy,
  initial,
  onCancel,
  onSave,
  t,
}: {
  busy: boolean;
  initial?: TextLink;
  onCancel: () => void;
  onSave: (kind: string, label: string, url: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [kind, setKind] = useState(initial?.kind ?? "order_online");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const valid = label.trim().length > 0 && (!url.trim() || /^https?:\/\//i.test(url.trim()));
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-gray-600">{t("kindLabel")}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">{t("labelLabel")}</span>
          <input
            type="text"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-gray-600">{t("urlLabel")}</span>
        <input
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
        <span className="text-[11px] text-gray-500">{t("urlEmptyNote")}</span>
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => onSave(kind, label.trim(), url)}
          className="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition"
        >
          {t("save")}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm text-gray-600 hover:text-gray-900 transition">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
