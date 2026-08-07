"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { LOCALE_OPTIONS } from "@/lib/locales";

type Cfg = Record<string, any>;

const DEFAULTS: Cfg = {
  enabled: false,
  openGreeting: "",
  closedGreeting: "",
  primaryLanguage: "en",
  voice: "",
  voiceSpeed: 1,
  ambientNoise: false,
  canTakeOrders: true,
  canBookReservations: true,
  canAnswerFaq: true,
  allowPizzaCombo: false,
  allowAnonymousCallers: true,
  pickupPaymentMode: "unpaid",
  deliveryPaymentMode: "unpaid",
  payByLinkWindowMinutes: 10,
  payByLinkPrepMode: "cook_now",
  quoteEta: true,
  allowScheduledOrders: false,
  smsConfirmations: true,
  afterHoursBehavior: "take_orders",
  transferToNumber: "",
  recordCalls: true,
};

export default function NabilConfigClient({
  initialConfig,
  number,
  cashDeliveryBlocked,
}: {
  initialConfig: Cfg | null;
  number: { phoneNumber: string; status: string } | null;
  cashDeliveryBlocked: boolean;
}) {
  const t = useTranslations("admin.phoneOrderingPage.config");
  const [cfg, setCfg] = useState<Cfg>({ ...DEFAULTS, ...(initialConfig || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/phone-ordering", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (res.ok) toast.success(t("saved"));
      else toast.error(t("saveError"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Number + master enable */}
      <Section title={t("status")}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-gray-600">{t("numberLabel")}</div>
            <div className="font-mono font-semibold text-gray-900">
              {number?.phoneNumber || <span className="text-amber-600 font-sans font-normal">{t("noNumber")}</span>}
            </div>
          </div>
          <Toggle label={t("enable")} checked={!!cfg.enabled} onChange={(v) => set("enabled", v)} />
        </div>
        <p className="text-xs text-gray-500 mt-2">{t("enableHint")}</p>
      </Section>

      {/* Greetings */}
      <Section title={t("greetings")}>
        <TextArea label={t("openGreeting")} value={cfg.openGreeting} maxLength={200} onChange={(v) => set("openGreeting", v)} />
        <TextArea label={t("closedGreeting")} value={cfg.closedGreeting} maxLength={200} onChange={(v) => set("closedGreeting", v)} />
        <p className="text-xs text-gray-500">{t("greetingHint")}</p>
      </Section>

      {/* Voice */}
      <Section title={t("voice")}>
        <Select
          label={t("primaryLanguage")}
          value={cfg.primaryLanguage}
          options={LOCALE_OPTIONS.map((o) => ({ value: o.code, label: o.label }))}
          onChange={(v) => set("primaryLanguage", v)}
        />
        <Text label={t("voiceId")} value={cfg.voice} placeholder="ElevenLabs voice id (optional)" onChange={(v) => set("voice", v)} />
        <Toggle label={t("ambientNoise")} checked={!!cfg.ambientNoise} onChange={(v) => set("ambientNoise", v)} />
        <p className="text-xs text-gray-500">{t("voiceHint")}</p>
      </Section>

      {/* Capabilities */}
      <Section title={t("capabilities")}>
        <Toggle label={t("takeOrders")} checked={!!cfg.canTakeOrders} onChange={(v) => set("canTakeOrders", v)} />
        <Toggle label={t("bookReservations")} checked={!!cfg.canBookReservations} onChange={(v) => set("canBookReservations", v)} />
        <Toggle label={t("answerFaq")} checked={!!cfg.canAnswerFaq} onChange={(v) => set("canAnswerFaq", v)} />
        <Toggle label={t("transferPizzaCombo")} checked={!cfg.allowPizzaCombo} onChange={(v) => set("allowPizzaCombo", !v)} />
        <Toggle label={t("allowAnonymous")} checked={!!cfg.allowAnonymousCallers} onChange={(v) => set("allowAnonymousCallers", v)} />
      </Section>

      {/* Payments */}
      <Section title={t("payments")}>
        <Select
          label={t("pickupPayment")}
          value={cfg.pickupPaymentMode}
          options={[
            { value: "unpaid", label: t("modeUnpaid") },
            { value: "paid", label: t("modePaid") },
            { value: "both", label: t("modeBoth") },
          ]}
          onChange={(v) => set("pickupPaymentMode", v)}
        />
        <Select
          label={t("deliveryPayment")}
          value={cashDeliveryBlocked ? "paid" : cfg.deliveryPaymentMode}
          disabled={cashDeliveryBlocked}
          options={[
            { value: "unpaid", label: t("modeUnpaid") },
            { value: "paid", label: t("modePaid") },
            { value: "both", label: t("modeBoth") },
          ]}
          onChange={(v) => set("deliveryPaymentMode", v)}
        />
        {cashDeliveryBlocked && <p className="text-xs text-amber-600">{t("shipdayNote")}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Number label={t("payWindow")} value={cfg.payByLinkWindowMinutes} min={1} max={60} onChange={(v) => set("payByLinkWindowMinutes", v)} />
          <Select
            label={t("prepMode")}
            value={cfg.payByLinkPrepMode}
            options={[
              { value: "cook_now", label: t("prepCookNow") },
              { value: "hold_until_paid", label: t("prepHold") },
            ]}
            onChange={(v) => set("payByLinkPrepMode", v)}
          />
        </div>
      </Section>

      {/* Ordering + after-hours */}
      <Section title={t("ordering")}>
        <Toggle label={t("quoteEta")} checked={!!cfg.quoteEta} onChange={(v) => set("quoteEta", v)} />
        <Toggle label={t("scheduledOrders")} checked={!!cfg.allowScheduledOrders} onChange={(v) => set("allowScheduledOrders", v)} />
        <Toggle label={t("smsConfirmations")} checked={!!cfg.smsConfirmations} onChange={(v) => set("smsConfirmations", v)} />
        <Select
          label={t("afterHours")}
          value={cfg.afterHoursBehavior}
          options={[
            { value: "take_orders", label: t("ahTakeOrders") },
            { value: "reservations_only", label: t("ahReservations") },
            { value: "message_only", label: t("ahMessage") },
            { value: "transfer", label: t("ahTransfer") },
          ]}
          onChange={(v) => set("afterHoursBehavior", v)}
        />
      </Section>

      {/* Handoff + recording */}
      <Section title={t("handoff")}>
        <Text label={t("transferNumber")} value={cfg.transferToNumber} placeholder="+1..." onChange={(v) => set("transferToNumber", v)} />
        <p className="text-xs text-gray-500">{t("transferHint")}</p>
        <Toggle label={t("recordCalls")} checked={!!cfg.recordCalls} onChange={(v) => set("recordCalls", v)} />
        <p className="text-xs text-gray-500">{t("recordHint")}</p>
      </Section>

      <div className="sticky bottom-0 bg-white/80 backdrop-blur py-3 -mx-1 px-1 border-t border-gray-100">
        <button
          onClick={save}
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60 transition"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}

/* ── small building blocks ─────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-gray-800">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition ${checked ? "bg-amber-600" : "bg-gray-300"}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}
function Text({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-800">{label}</span>
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}
function TextArea({ label, value, maxLength, onChange }: { label: string; value: string; maxLength?: number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-800">{label}</span>
      <textarea
        value={value ?? ""}
        maxLength={maxLength}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
      {maxLength && <span className="text-[11px] text-gray-400">{(value ?? "").length}/{maxLength}</span>}
    </label>
  );
}
function Number({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-800">{label}</span>
      <input
        type="number"
        value={value ?? 0}
        min={min}
        max={max}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    </label>
  );
}
function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-800">{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
