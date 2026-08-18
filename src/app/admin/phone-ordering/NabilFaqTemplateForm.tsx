"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Loader2, Save } from "lucide-react";

/** Must mirror the TEMPLATES keys in
 *  src/app/api/admin/phone-ordering/onboarding-info/route.ts. */
const FIELDS = [
  { key: "halal", labelKey: "qHalal", type: "text" },
  { key: "vegan", labelKey: "qVegan", type: "text" },
  { key: "vegetarian", labelKey: "qVegetarian", type: "text" },
  { key: "glutenFree", labelKey: "qGlutenFree", type: "text" },
  { key: "allergenNote", labelKey: "qAllergen", type: "textarea" },
  { key: "parking", labelKey: "qParking", type: "text" },
  { key: "specialInfo", labelKey: "qSpecialInfo", type: "textarea" },
  { key: "hoursException", labelKey: "qHoursException", type: "textarea" },
] as const;

type Answers = Record<string, string>;

/**
 * Onboarding wizard, Step 2 — "Tell your agent about your restaurant."
 * Fully self-contained: fetches its own prefill (answers + website + the
 * auto-computed online-ordering link) and POSTs its own save, so it can be
 * embedded both in NabilOnboardingWizard (pre-line) and reopened later from
 * FaqManager's "Quick-start template" entry point (post-line) with no props
 * to thread through. Answers land as VoiceFaq rows (see the route's
 * TEMPLATES map); website becomes a VoiceTextLink. Leaving a field blank
 * never touches an existing answer.
 */
export default function NabilFaqTemplateForm({ onSaved }: { onSaved?: () => void }) {
  const t = useTranslations("admin.phoneOrderingPage.onboarding");
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [website, setWebsite] = useState("");
  const [onlineOrderingLink, setOnlineOrderingLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hoursHref = "/admin/hours";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/phone-ordering/onboarding-info")
      .then((r) => r.json())
      .then((body: { answers?: Answers; website?: string; onlineOrderingLink?: string }) => {
        if (cancelled) return;
        setAnswers(body.answers ?? {});
        setWebsite(body.website ?? "");
        setOnlineOrderingLink(body.onlineOrderingLink ?? "");
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key: string, v: string) => setAnswers((a) => ({ ...a, [key]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/phone-ordering/onboarding-info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...answers, website }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("faqSaved"));
      router.refresh();
      onSaved?.();
    } catch {
      toast.error(t("faqSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{t("dietarySectionTitle")}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{t("dietarySectionHint")}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {FIELDS.filter((f) => ["halal", "vegan", "vegetarian", "glutenFree"].includes(f.key)).map((f) => (
            <label key={f.key} className="block">
              <span className="text-sm font-medium text-gray-800">{t(f.labelKey)}</span>
              <input
                type="text"
                value={answers[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={t("yesNoPlaceholder")}
                maxLength={1000}
                className={inputCls}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block">
          <span className="text-sm font-medium text-gray-800">{t("qAllergen")}</span>
          <textarea
            value={answers.allergenNote ?? ""}
            onChange={(e) => set("allergenNote", e.target.value)}
            rows={2}
            maxLength={1000}
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-800">{t("qParking")}</span>
          <input
            type="text"
            value={answers.parking ?? ""}
            onChange={(e) => set("parking", e.target.value)}
            maxLength={1000}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-800">{t("websiteLabel")}</span>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
            maxLength={500}
            className={inputCls}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className="text-sm font-medium text-gray-800">{t("qSpecialInfo")}</span>
          <textarea
            value={answers.specialInfo ?? ""}
            onChange={(e) => set("specialInfo", e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("specialInfoPlaceholder")}
            className={inputCls}
          />
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-700">{t("hoursTitle")}</p>
        <p className="text-xs text-gray-600 mt-1">
          {t("hoursBody")}{" "}
          <a href={hoursHref} className="text-amber-700 font-semibold hover:text-amber-900">
            {t("hoursFixLink")}
          </a>
        </p>
        <label className="block mt-2">
          <span className="text-sm font-medium text-gray-800">{t("qHoursException")}</span>
          <textarea
            value={answers.hoursException ?? ""}
            onChange={(e) => set("hoursException", e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={t("hoursExceptionPlaceholder")}
            className={inputCls}
          />
        </label>
      </div>

      {onlineOrderingLink && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-700">{t("orderingLinkTitle")}</p>
          <p className="text-xs text-gray-600 mt-1 break-all">{onlineOrderingLink}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t("orderingLinkHint")}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? t("saving") : t("saveFaq")}
      </button>
    </form>
  );
}
