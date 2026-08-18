"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Check, ListChecks, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import NabilFaqTemplateForm from "./NabilFaqTemplateForm";

export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  source: string;
  active: boolean;
};

const CATEGORIES = ["dietary", "allergen", "business_info", "operational", "deflection", "escalation"] as const;

/**
 * FAQ manager (Loman parity+): an AI-"Recommended — based on what callers are
 * asking" approve/dismiss banner (rows with source "recommended"), the owner's
 * FAQ list grouped by category with inline edit + active toggles, and an
 * add-FAQ form. CRUD via /api/admin/phone-ordering/faqs (workstream D).
 */
export default function FaqManager({ initialFaqs }: { initialFaqs: Faq[] }) {
  const t = useTranslations("admin.phoneOrderingPage.faqMgr");
  const router = useRouter();
  const [faqs, setFaqs] = useState<Faq[]>(initialFaqs);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  const recommended = faqs.filter((f) => f.source === "recommended");
  const own = faqs.filter((f) => f.source !== "recommended");
  const byCategory = new Map<string, Faq[]>();
  for (const f of own) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category)!.push(f);
  }

  const catLabel = (c: string) =>
    (CATEGORIES as readonly string[]).includes(c) ? t(`cat.${c}`) : c;

  const request = async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error();
      return true;
    } catch {
      toast.error(t("errorToast"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = async (f: Faq) => {
    if (
      await request(`/api/admin/phone-ordering/faqs/${f.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve: true }),
      })
    ) {
      setFaqs((list) => list.map((x) => (x.id === f.id ? { ...x, source: "owner", active: true } : x)));
      toast.success(t("savedToast"));
      router.refresh();
    }
  };

  const remove = async (f: Faq) => {
    if (await request(`/api/admin/phone-ordering/faqs/${f.id}`, { method: "DELETE" })) {
      setFaqs((list) => list.filter((x) => x.id !== f.id));
      router.refresh();
    }
  };

  const saveEdit = async (f: Faq, patch: Partial<Faq>) => {
    if (
      await request(`/api/admin/phone-ordering/faqs/${f.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
    ) {
      setFaqs((list) => list.map((x) => (x.id === f.id ? { ...x, ...patch } : x)));
      setEditingId(null);
      toast.success(t("savedToast"));
      router.refresh();
    }
  };

  const create = async (question: string, answer: string, category: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/phone-ordering/faqs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, answer, category }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json().catch(() => null);
      setFaqs((list) => [
        ...list,
        {
          id: created?.faq?.id ?? created?.id ?? `tmp-${Date.now()}`,
          question,
          answer,
          category,
          source: "owner",
          active: true,
        },
      ]);
      setAdding(false);
      toast.success(t("savedToast"));
      router.refresh();
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-gray-900">{t("title")}</h3>
        <button
          type="button"
          onClick={() => setShowTemplate(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition"
        >
          <ListChecks className="w-3.5 h-3.5" />
          {t("quickStartTemplate")}
        </button>
      </div>

      {showTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowTemplate(false)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">{t("quickStartTitle")}</h3>
                <p className="text-sm text-gray-600 mt-1">{t("quickStartBody")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplate(false)}
                className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center transition flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <NabilFaqTemplateForm
              onSaved={() => {
                setShowTemplate(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}

      {/* AI-recommended banner (PdfImportModal-style review → approve). */}
      {recommended.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
            <Sparkles className="w-4 h-4" />
            {t("recommendedTitle")}
          </div>
          {recommended.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-3 bg-white rounded-lg border border-purple-100 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{f.question}</div>
                {f.answer && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{f.answer}</div>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => approve(f)}
                  disabled={busy}
                  title={t("approve")}
                  className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center transition disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={busy}
                  title={t("dismiss")}
                  className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition disabled:opacity-60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The owner's FAQs, grouped by category. */}
      {own.length === 0 ? (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      ) : (
        Array.from(byCategory.entries()).map(([cat, rows]) => (
          <div key={cat}>
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{catLabel(cat)}</div>
            <div className="space-y-2">
              {rows.map((f) =>
                editingId === f.id ? (
                  <FaqEditForm key={f.id} faq={f} busy={busy} onCancel={() => setEditingId(null)} onSave={(patch) => saveEdit(f, patch)} t={t} />
                ) : (
                  <div key={f.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${f.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{f.question}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{f.answer}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => saveEdit(f, { active: !f.active })}
                        disabled={busy}
                        className={`relative w-9 h-5 rounded-full transition ${f.active ? "bg-emerald-600" : "bg-gray-300"}`}
                        aria-pressed={f.active}
                        title={t("activeLabel")}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition ${f.active ? "translate-x-4" : ""}`} />
                      </button>
                      <button type="button" onClick={() => setEditingId(f.id)} title={t("edit")} className="text-gray-400 hover:text-gray-700 transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(f)} disabled={busy} title={t("delete")} className="text-gray-400 hover:text-red-600 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ))
      )}

      {/* Add form. */}
      {adding ? (
        <FaqEditForm
          faq={{ id: "", question: "", answer: "", category: "business_info", source: "owner", active: true }}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={(patch) => create(patch.question ?? "", patch.answer ?? "", patch.category ?? "business_info")}
          t={t}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition"
        >
          <Plus className="w-4 h-4" />
          {t("addFaq")}
        </button>
      )}
    </div>
  );
}

function FaqEditForm({
  faq,
  busy,
  onCancel,
  onSave,
  t,
}: {
  faq: Faq;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<Faq>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [category, setCategory] = useState(faq.category);
  const valid = question.trim().length > 0 && answer.trim().length > 0;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <label className="block">
        <span className="text-xs text-gray-600">{t("questionLabel")}</span>
        <input
          type="text"
          value={question}
          maxLength={300}
          onChange={(e) => setQuestion(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-600">{t("answerLabel")}</span>
        <textarea
          value={answer}
          rows={2}
          maxLength={1000}
          onChange={(e) => setAnswer(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-600">{t("categoryLabel")}</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`cat.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => onSave({ question: question.trim(), answer: answer.trim(), category })}
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
