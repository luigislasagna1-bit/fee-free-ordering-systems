"use client";
import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { ArrowLeft, Plus, Printer, Save, Trash2, Link2 } from "lucide-react";
import { FLYER_TEMPLATES } from "@/lib/marketing-templates";
import { FlyerCanvas } from "../FlyerCanvas";

type Branding = { name: string; logoUrl: string | null; address: string; phone: string | null; website: string; primaryColor: string };
type SLink = { id: string; code: string; name: string };
type Flyer = { id: string | null; name: string; smartLinkId: string | null; templateId: string; headline: string; offerText: string; phone: string; website: string; footerText: string };

export function FlyersClient({
  branding,
  links,
  initialAssets,
}: {
  branding: Branding;
  links: SLink[];
  initialAssets: Flyer[];
}) {
  const t = useTranslations("admin.marketingStudio");
  const tc = useTranslations("common");
  const [assets, setAssets] = useState<Flyer[]>(initialAssets);

  const blank = (): Flyer => ({
    id: null,
    name: t("newFlyer"),
    smartLinkId: links[0]?.id ?? null,
    templateId: "bold",
    headline: "",
    offerText: "",
    // Auto-fill contact from the restaurant — editable per flyer.
    phone: branding.phone ?? "",
    website: branding.website ?? "",
    footerText: "",
  });
  const [draft, setDraft] = useState<Flyer>(initialAssets[0] ?? blank());
  const [busy, setBusy] = useState(false);

  if (links.length === 0) {
    return (
      <div className="max-w-2xl">
        <Back t={t} />
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <Link2 className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">{t("needLinkFirst")}</p>
          <Link href="/admin/marketing-studio" className="inline-block mt-3 text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            {t("pageTitle")} →
          </Link>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Flyer>) => setDraft((d) => ({ ...d, ...patch }));

  const persist = async (): Promise<string | null> => {
    const payload = {
      name: draft.name,
      templateId: draft.templateId,
      smartLinkId: draft.smartLinkId,
      headline: draft.headline,
      offerText: draft.offerText,
      phone: draft.phone,
      website: draft.website,
      footerText: draft.footerText,
    };
    const res = draft.id
      ? await fetch(`/api/admin/marketing-studio/assets/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/admin/marketing-studio/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) return null;
    if (draft.id) {
      setAssets((prev) => prev.map((a) => (a.id === draft.id ? { ...draft } : a)));
      return draft.id;
    }
    const d = await res.json();
    const id = d?.asset?.id as string | undefined;
    if (!id) return null;
    const saved = { ...draft, id };
    setDraft(saved);
    setAssets((prev) => [saved, ...prev]);
    return id;
  };

  const save = async () => {
    setBusy(true);
    try {
      const id = await persist();
      if (id) toast.success(t("flyerSaved"));
      else toast.error(t("createError"));
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    setBusy(true);
    try {
      const id = (await persist()) ?? draft.id;
      if (!id) { toast.error(t("createError")); return; }
      window.open(`/flyer-print/${id}`, "_blank");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Flyer) => {
    if (!a.id || !confirm(t("deleteConfirm"))) return;
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
    if (draft.id === a.id) setDraft(blank());
    try { await fetch(`/api/admin/marketing-studio/assets/${a.id}`, { method: "DELETE" }); } catch {}
  };

  const qrSrc = draft.smartLinkId
    ? `/api/admin/marketing-studio/smart-links/${draft.smartLinkId}/qr?format=png`
    : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <Back t={t} />
          <h1 className="text-2xl font-bold text-gray-900">{t("flyersTitle")}</h1>
          <p className="text-sm text-gray-500">{t("flyersHint")}</p>
        </div>
        <button onClick={() => setDraft(blank())} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> {t("newFlyer")}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-4">
          <Field label={tc("name")}>
            <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>

          <Field label={t("templateLabel")}>
            <div className="flex gap-2">
              {FLYER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => set({ templateId: tpl.id })}
                  className={`flex-1 text-sm font-medium py-2 rounded-lg border ${draft.templateId === tpl.id ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                >
                  {t(tpl.nameKey)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("linkLabel")}>
            <select className="input" value={draft.smartLinkId ?? ""} onChange={(e) => set({ smartLinkId: e.target.value || null })}>
              {links.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>

          <Field label={t("headlineLabel")}>
            <input className="input" value={draft.headline} placeholder={t("headlinePlaceholder")} onChange={(e) => set({ headline: e.target.value })} />
          </Field>

          <Field label={t("offerLabel")}>
            <textarea className="input resize-y" rows={2} value={draft.offerText} placeholder={t("offerPlaceholder")} onChange={(e) => set({ offerText: e.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("phoneLabel")}>
              <input className="input" value={draft.phone} placeholder={t("phonePlaceholder")} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label={t("websiteLabel")}>
              <input className="input" value={draft.website} placeholder={t("websitePlaceholder")} onChange={(e) => set({ website: e.target.value })} />
            </Field>
          </div>

          <Field label={t("footerTextLabel")}>
            <input className="input" value={draft.footerText} placeholder={t("footerTextPlaceholder")} onChange={(e) => set({ footerText: e.target.value })} />
          </Field>

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50">
              <Save className="w-4 h-4" /> {tc("save")}
            </button>
            <button onClick={print} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-50">
              <Printer className="w-4 h-4" /> {t("printButton")}
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">{t("previewLabel")}</div>
          <div className="max-w-[300px] mx-auto shadow-lg rounded-xl overflow-hidden">
            <FlyerCanvas
              templateId={draft.templateId}
              restaurantName={branding.name}
              logoUrl={branding.logoUrl}
              address={branding.address}
              phone={draft.phone}
              website={draft.website}
              footerText={draft.footerText}
              headline={draft.headline || t("headlinePlaceholder")}
              offerText={draft.offerText || t("offerPlaceholder")}
              qrSrc={qrSrc}
              primaryColor={branding.primaryColor}
              scanLabel={t("scanToOrder")}
              rounded
            />
          </div>
        </div>
      </div>

      {/* Saved flyers */}
      {assets.length > 0 && (
        <div className="mt-8">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">{t("savedFlyers")}</div>
          <div className="flex flex-wrap gap-2">
            {assets.map((a) => (
              <div key={a.id} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${draft.id === a.id ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
                <button onClick={() => setDraft({ ...a })} className="font-medium text-gray-700 hover:text-emerald-700">{a.name}</button>
                <button onClick={() => remove(a)} className="text-gray-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.input:focus) {
          box-shadow: 0 0 0 2px #10b981;
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}

function Back({ t }: { t: (k: string) => string }) {
  return (
    <Link href="/admin/marketing-studio" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2">
      <ArrowLeft className="w-3.5 h-3.5" /> {t("pageTitle")}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
