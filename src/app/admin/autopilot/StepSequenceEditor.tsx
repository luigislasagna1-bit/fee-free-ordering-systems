"use client";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Mail, Plus, Trash2, Save, Clock, Percent } from "lucide-react";

/**
 * Owner-facing drip-sequence editor (Luigi 2026-06-10). For stepped Autopilot
 * campaigns (reengagement / second_order): an ordered list of follow-up emails,
 * each with its own delay (days from the trigger), discount %, subject + body.
 * The owner picks HOW MANY (add/remove) and HOW MUCH off each. Self-contained —
 * fetches + saves via /api/restaurants/autopilot/steps; the server mirrors each
 * step's % to its WIN promo so the email and the applied discount stay in sync.
 */

type Step = {
  delayHours: number;
  discountPercent: number;
  subject: string;
  emailBody: string;
  isEnabled: boolean;
};

const MAX: Record<string, number> = { reengagement: 5, second_order: 1 };
const TOKENS = ["{customer_name}", "{restaurant_name}", "{restaurant_link}", "{coupon_section}"];

export function StepSequenceEditor({
  campaignType,
  stateEnabled,
}: {
  campaignType: string;
  stateEnabled: boolean;
}) {
  const t = useTranslations("admin.autopilotClient");
  const tc = useTranslations("common");
  const max = MAX[campaignType] ?? 1;
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/restaurants/autopilot/steps?campaignType=${encodeURIComponent(campaignType)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.steps)) {
          setSteps(
            d.steps.map((s: Partial<Step>) => ({
              delayHours: s.delayHours ?? 168,
              discountPercent: s.discountPercent ?? 0,
              subject: s.subject ?? "",
              emailBody: s.emailBody ?? "",
              isEnabled: s.isEnabled !== false,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [campaignType]);

  const update = (i: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const addStep = () => {
    if (steps.length >= max) return;
    const last = steps[steps.length - 1];
    setSteps((prev) => [
      ...prev,
      {
        // +7 days past the previous email, +5% (capped), fresh copy.
        delayHours: (last ? last.delayHours : 0) + 7 * 24,
        discountPercent: Math.min(100, (last ? last.discountPercent : 10) + 5),
        subject: "",
        emailBody: "",
        isEnabled: true,
      },
    ]);
  };

  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (steps.length === 0) {
      toast.error(t("stepsNeedOne"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/autopilot/steps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignType, steps, campaignEnabled: stateEnabled }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("campaignSaved"));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 py-4">…</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">{t("stepsHint")}</p>

      {steps.map((s, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-amber-500" />
              {t("stepLabel", { n: i + 1 })}
            </span>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {tc("remove")}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Clock className="inline w-3 h-3 mr-1" />
                {t("stepDelayLabel")}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  value={Math.max(1, Math.round(s.delayHours / 24))}
                  onChange={(e) => update(i, { delayHours: (parseInt(e.target.value) || 1) * 24 })}
                />
                <span className="text-xs text-gray-500">{t("unitDays")}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Percent className="inline w-3 h-3 mr-1" />
                {t("stepDiscountLabel")}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  value={s.discountPercent}
                  onChange={(e) => update(i, { discountPercent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("emailSubjectLabel")}</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              value={s.subject}
              onChange={(e) => update(i, { subject: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("emailBodyLabel")}</label>
            <div className="text-xs text-gray-400 mb-1.5 flex flex-wrap gap-1.5">
              {TOKENS.map((tok) => (
                <code key={tok} className="bg-gray-100 px-1.5 py-0.5 rounded">{tok}</code>
              ))}
            </div>
            <textarea
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none resize-y"
              value={s.emailBody}
              onChange={(e) => update(i, { emailBody: e.target.value })}
            />
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        {steps.length < max ? (
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            <Plus className="w-4 h-4" />
            {t("stepAdd")}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition"
        >
          <Save className="w-4 h-4" />
          {saving ? t("savingButton") : t("stepsSave")}
        </button>
      </div>
    </div>
  );
}
