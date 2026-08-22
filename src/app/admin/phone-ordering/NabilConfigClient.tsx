"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { LOCALE_OPTIONS } from "@/lib/locales";
import { HelpTip } from "@/components/HelpTip";
import FaqManager, { type Faq } from "./FaqManager";
import TextLinksManager, { type TextLink } from "./TextLinksManager";
import BlockedCallersManager, { type BlockedRow } from "./BlockedCallersManager";
import DayDealsManager from "./DayDealsManager";
import VoicePicker from "./VoicePicker";
import TemporaryClosureCard from "./TemporaryClosureCard";

/** The owner-editable VoiceAgentConfig fields this form round-trips. The
 *  index signature carries any extra DB columns through the PATCH untouched. */
type Cfg = {
  agentName: string;
  openGreeting: string;
  closedGreeting: string;
  primaryLanguage: string;
  voice: string;
  voiceSpeed: number;
  ambientNoise: boolean;
  canTakeOrders: boolean;
  canBookReservations: boolean;
  canAnswerFaq: boolean;
  allowPizzaCombo: boolean;
  offerDayDeals: boolean;
  allowAnonymousCallers: boolean;
  pickupPaymentMode: string;
  deliveryPaymentMode: string;
  payByLinkWindowMinutes: number;
  payByLinkPrepMode: string;
  quoteEta: boolean;
  allowScheduledOrders: boolean;
  smsConfirmations: boolean;
  afterHoursBehavior: string;
  transferToNumber: string;
  transferPolicy: string;
  transferDeflectionMessage: string;
  transferTakeMessage: boolean;
  recordCalls: boolean;
  maxCallSeconds: number;
} & Record<string, unknown>;

const DEFAULTS: Cfg = {
  agentName: "",
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
  offerDayDeals: false,
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
  transferPolicy: "immediate",
  transferDeflectionMessage: "",
  transferTakeMessage: true,
  recordCalls: true,
  maxCallSeconds: 600,
};

type SubTab = "general" | "voice" | "ordering" | "payments" | "faq" | "blocked";

/**
 * Nabil settings, reorganized into Loman-style sub-tabs:
 * General / Voice / Ordering / Payments / FAQ / Blocked callers.
 *
 * The four config sub-tabs share one form state + the one existing
 * PATCH /api/admin/phone-ordering endpoint — every pre-existing config key
 * keeps working. FAQ + Text Links and Blocked Callers are their own managers
 * (CRUD APIs from workstream D). Anything the call engine can't do yet
 * (voiceSpeed / ambientNoise) is labeled "coming soon" — honesty over parity.
 */
export default function NabilConfigClient({
  initialConfig,
  cashDeliveryBlocked,
  shipdayDispatches = false,
  payAtDoorDelivery = false,
  currency,
  initialFaqs,
  initialTextLinks,
  initialBlockedCallers,
}: {
  initialConfig: Record<string, unknown> | null;
  cashDeliveryBlocked: boolean;
  /** ShipDay is the active dispatcher — only then is pay-at-door a question. */
  shipdayDispatches?: boolean;
  payAtDoorDelivery?: boolean;
  currency: string;
  initialFaqs: Faq[];
  initialTextLinks: TextLink[];
  initialBlockedCallers: BlockedRow[];
}) {
  const t = useTranslations("admin.phoneOrderingPage.config");
  const ts = useTranslations("admin.phoneOrderingPage.settingsTabs");
  // The DB row may carry nulls for optional strings — DEFAULTS backstops the
  // shape and the inputs tolerate null via `value ?? ""`.
  const [cfg, setCfg] = useState<Cfg>(() => ({ ...DEFAULTS, ...(initialConfig ?? {}) }) as Cfg);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<SubTab>("general");
  const set = (k: string, v: unknown) => setCfg((c) => ({ ...c, [k]: v }));
  /** Extra languages Nabil should understand (VoiceAgentConfig.languages, a
   *  JSON string[]). Non-empty ⇒ the TwiML nests <Language code="multi"/>. */
  const extraLanguages: string[] = Array.isArray(cfg.languages)
    ? (cfg.languages as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  // Pay-at-door lives on ShipdayConfig, not VoiceAgentConfig, so it saves on
  // its own the moment it's flipped — and the page is refreshed because the
  // server computes `cashDeliveryBlocked` from it.
  const router = useRouter();
  const [payAtDoor, setPayAtDoor] = useState(payAtDoorDelivery);
  const savePayAtDoor = async (v: boolean) => {
    setPayAtDoor(v);
    try {
      const res = await fetch("/api/admin/phone-ordering/pay-at-door", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payAtDoorDelivery: v }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("saved"));
      router.refresh();
    } catch {
      setPayAtDoor(!v);
      toast.error(t("saveError"));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...cfg,
        // Clamp client-side too so the owner sees what will actually be saved.
        maxCallSeconds: Math.min(1800, Math.max(60, Math.round(Number(cfg.maxCallSeconds) || 600))),
      };
      // `enabled` is owned SOLELY by NabilStatusHeader (the pause toggle). This
      // form's state is seeded once at mount, so replaying that snapshot would
      // silently un-pause (or re-pause) a live line the owner toggled since.
      delete body.enabled;
      // `pauseGreeting` is owned by TemporaryClosureCard (same reasoning —
      // replaying the mount snapshot would clobber a message saved since).
      delete body.pauseGreeting;
      const res = await fetch("/api/admin/phone-ordering", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) toast.success(t("saved"));
      else toast.error(t("saveError"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const isConfigSub = sub === "general" || sub === "voice" || sub === "ordering" || sub === "payments";

  return (
    <div className="space-y-5">
      {/* Sub-tab bar. */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {(
          [
            ["general", ts("general")],
            ["voice", ts("voice")],
            ["ordering", ts("ordering")],
            ["payments", ts("payments")],
            ["faq", ts("faq")],
            ["blocked", ts("blocked")],
          ] as [SubTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
              sub === key
                ? "border-slate-900 text-slate-900 bg-slate-50"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── General ─────────────────────────────────────────────────── */}
      {sub === "general" && (
        <div className="space-y-5">
          {/* Temporary Closure (Loman parity) — self-saving, outside the sticky
              save bar: pause state lives on Restaurant, not this form's cfg. */}
          <TemporaryClosureCard
            initialPauseGreeting={typeof cfg.pauseGreeting === "string" ? cfg.pauseGreeting : ""}
          />
          <Section title={t("agentIdentity")}>
            <Text label={t("agentName")} value={cfg.agentName} placeholder="Nabil" onChange={(v) => set("agentName", v.slice(0, 40))} />
            <p className="text-xs text-gray-500">{t("agentNameHint")}</p>
          </Section>
          <Section title={t("greetings")}>
            <TextArea label={t("openGreeting")} value={cfg.openGreeting} maxLength={200} onChange={(v) => set("openGreeting", v)} />
            <TextArea label={t("closedGreeting")} value={cfg.closedGreeting} maxLength={200} onChange={(v) => set("closedGreeting", v)} />
            <p className="text-xs text-gray-500">{t("greetingHint")}</p>
            {cfg.recordCalls && <p className="text-xs text-amber-600">{ts("consentNote")}</p>}
          </Section>
          <Section title={t("handoff")}>
            <Toggle label={t("allowAnonymous")} checked={!!cfg.allowAnonymousCallers} onChange={(v) => set("allowAnonymousCallers", v)} />
            <Text label={t("transferNumber")} value={cfg.transferToNumber} placeholder="+1..." onChange={(v) => set("transferToNumber", v)} />
            <p className="text-xs text-gray-500">{t("transferHint")}</p>
            {/* A1b (Luigi 2026-08-22): how easily a caller reaches a person —
                enforced by the voice service on every call, never prompt-only. */}
            <Select
              label={t("transferPolicy")}
              value={cfg.transferPolicy || "immediate"}
              options={[
                { value: "immediate", label: t("tpImmediate") },
                { value: "reluctant", label: t("tpReluctant") },
                { value: "never", label: t("tpNever") },
              ]}
              onChange={(v) => set("transferPolicy", v)}
            />
            <p className="text-xs text-gray-500">{t("transferPolicyHint")}</p>
            {(cfg.transferPolicy || "immediate") !== "immediate" && (
              <>
                <TextArea
                  label={t("transferDeflection")}
                  value={typeof cfg.transferDeflectionMessage === "string" ? cfg.transferDeflectionMessage : ""}
                  maxLength={300}
                  onChange={(v) => set("transferDeflectionMessage", v)}
                />
                <p className="text-xs text-gray-500">{t("transferDeflectionHint")}</p>
                <Toggle label={t("transferTakeMessage")} checked={cfg.transferTakeMessage !== false} onChange={(v) => set("transferTakeMessage", v)} />
                <p className="text-xs text-gray-500">{t("transferTakeMessageHint")}</p>
              </>
            )}
            <Toggle label={t("recordCalls")} checked={!!cfg.recordCalls} onChange={(v) => set("recordCalls", v)} />
            <p className="text-xs text-gray-500">{t("recordHint")}</p>
          </Section>
          <TestCallerPhones
            phones={
              Array.isArray(cfg.testCallerPhones)
                ? (cfg.testCallerPhones as unknown[]).filter((x): x is string => typeof x === "string")
                : []
            }
            onChange={(v) => set("testCallerPhones", v)}
            t={t}
          />
        </div>
      )}

      {/* ── Voice ───────────────────────────────────────────────────── */}
      {sub === "voice" && (
        <div className="space-y-5">
          <Section title={t("voice")}>
            <Select
              label={t("primaryLanguage")}
              value={cfg.primaryLanguage}
              options={LOCALE_OPTIONS.map((o) => ({ value: o.code, label: o.label }))}
              onChange={(v) => set("primaryLanguage", v)}
            />
            <VoicePicker
              value={String(cfg.voice || "")}
              speed={Number(cfg.voiceSpeed) || 1}
              onChange={(v) => set("voice", v)}
            />
            {/* Speed is REAL now: it rides ElevenLabs' extended voice attribute
                ("<id>-<model>-<speed>_<stability>_<similarity>"), which is why
                the range is 0.7–1.2 — the values the provider accepts. A wider
                slider would just be clamped, i.e. a lie. */}
            <label className="block pt-1">
              <span className="text-sm text-gray-800 flex items-center gap-1.5">
                {ts("voiceSpeed")}
                <HelpTip text={ts("voiceSpeedHelp")} />
              </span>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-400">{ts("speedSlower")}</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={Math.min(1.2, Math.max(0.7, Number(cfg.voiceSpeed) || 1))}
                  onChange={(e) => set("voiceSpeed", parseFloat(e.target.value))}
                  className="flex-1 accent-sky-600"
                />
                <span className="text-xs text-gray-400">{ts("speedFaster")}</span>
                <span className="text-xs font-semibold text-gray-700 w-11 text-right tabular-nums">
                  {(Math.min(1.2, Math.max(0.7, Number(cfg.voiceSpeed) || 1))).toFixed(2)}×
                </span>
              </div>
            </label>
          </Section>

          {/* Understand callers in any language. ConversationRelay's
              <Language code="multi"/> needs Deepgram STT + ElevenLabs TTS —
              our defaults — so this is real, not aspirational. */}
          <Section title={ts("multilingualTitle")}>
            <p className="text-xs text-gray-500 -mt-1">{ts("multilingualHint")}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {LOCALE_OPTIONS.filter((o) => o.code !== cfg.primaryLanguage).map((o) => {
                const on = extraLanguages.includes(o.code);
                return (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() =>
                      set(
                        "languages",
                        on
                          ? extraLanguages.filter((c) => c !== o.code)
                          : [...extraLanguages, o.code].slice(0, 38),
                      )
                    }
                    className={`text-xs px-2 py-1 rounded-full border transition ${
                      on
                        ? "border-sky-500 bg-sky-50 text-sky-700 font-semibold"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title={t("ambientNoiseSection")}>
            <Toggle label={t("ambientNoise")} checked={!!cfg.ambientNoise} onChange={(v) => set("ambientNoise", v)} />
          </Section>
        </div>
      )}

      {/* ── Ordering ────────────────────────────────────────────────── */}
      {sub === "ordering" && (
        <div className="space-y-5">
          <Section title={t("capabilities")}>
            <Toggle label={t("takeOrders")} checked={!!cfg.canTakeOrders} onChange={(v) => set("canTakeOrders", v)} />
            <Toggle label={t("bookReservations")} checked={!!cfg.canBookReservations} onChange={(v) => set("canBookReservations", v)} />
            <Toggle label={t("answerFaq")} checked={!!cfg.canAnswerFaq} onChange={(v) => set("canAnswerFaq", v)} />
            {/* Positive framing now that building is real — the old inverted
                "transfer these" toggle described a limitation, not a choice. */}
            <Toggle label={t("buildPizzaCombo")} checked={!!cfg.allowPizzaCombo} onChange={(v) => set("allowPizzaCombo", v)} />
            <p className="text-xs text-gray-500">{t("buildPizzaComboHint")}</p>
            {/* Day Deals was fully built and service-wired but had NO toggle —
                the API accepted offerDayDeals, the voice service read it, and
                the only way to change it was a database edit. Finished work
                nobody could reach. Luigi 2026-08-12. */}
            <Toggle label={t("offerDayDeals")} checked={!!cfg.offerDayDeals} onChange={(v) => set("offerDayDeals", v)} />
            <p className="text-xs text-gray-500">{t("offerDayDealsHint")}</p>
            {!!cfg.offerDayDeals && <DayDealsManager currency={currency} />}
          </Section>
          <Section title={t("ordering")}>
            <Toggle label={t("quoteEta")} checked={!!cfg.quoteEta} onChange={(v) => set("quoteEta", v)} />
            <Toggle label={t("scheduledOrders")} checked={!!cfg.allowScheduledOrders} onChange={(v) => set("allowScheduledOrders", v)} />
            {cfg.allowScheduledOrders && <p className="text-xs text-gray-500">{ts("scheduledHint")}</p>}
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
            <label className="block">
              <span className="text-sm text-gray-800 flex items-center gap-1.5">
                {ts("maxCallSeconds")}
                <HelpTip text={ts("maxCallHelp")} />
              </span>
              <input
                type="number"
                value={cfg.maxCallSeconds ?? 600}
                min={60}
                max={1800}
                onChange={(e) => set("maxCallSeconds", parseInt(e.target.value, 10))}
                onBlur={() => set("maxCallSeconds", Math.min(1800, Math.max(60, Math.round(Number(cfg.maxCallSeconds) || 600))))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </label>
          </Section>
        </div>
      )}

      {/* ── Payments ────────────────────────────────────────────────── */}
      {sub === "payments" && (
        <Section title={t("payments")}>
          {/* Honest state: the voice engine takes pay-at-store orders only
              until pay-by-link ships. The matrix saves now so the rollout is
              a flip, but we never imply phone payments already happen. */}
          <p className="text-xs text-amber-600">{ts("paymentsNotLiveNote")}</p>
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
          {/* Pay at the door (Luigi 2026-08-11). ShipDay's own drivers can't
              collect money, which is why delivery was prepaid-only. This turns
              that into a CHOICE: the order is still written to ShipDay so the
              owner sees it where they already work, but no driver is requested
              and delivering it becomes the store's own job. The wording says
              that plainly — an owner must not discover it from a missed order. */}
          {shipdayDispatches && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-1.5">
              <Toggle
                label={ts("payAtDoorTitle")}
                checked={payAtDoor}
                onChange={savePayAtDoor}
              />
              <p className="text-xs text-gray-600">{ts("payAtDoorHint")}</p>
              {payAtDoor && <p className="text-xs text-amber-600">{ts("payAtDoorWarning")}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label={t("payWindow")} value={cfg.payByLinkWindowMinutes} min={1} max={60} onChange={(v) => set("payByLinkWindowMinutes", v)} />
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
      )}

      {/* ── FAQ + Text Links ────────────────────────────────────────── */}
      {sub === "faq" && (
        <div className="space-y-5">
          <FaqManager initialFaqs={initialFaqs} />
          <TextLinksManager initialLinks={initialTextLinks} />
        </div>
      )}

      {/* ── Blocked callers ─────────────────────────────────────────── */}
      {sub === "blocked" && <BlockedCallersManager initialBlocked={initialBlockedCallers} />}

      {/* Save bar — only for the config sub-tabs (the managers save inline). */}
      {isConfigSub && (
        <div className="sticky bottom-0 bg-white/80 backdrop-blur py-3 -mx-1 px-1 border-t border-gray-100">
          <button
            onClick={save}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60 transition"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      )}
    </div>
  );
}

function TestCallerPhones({
  phones,
  onChange,
  t,
}: {
  phones: string[];
  onChange: (v: string[]) => void;
  t: (k: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (phones.length >= 10) return;
    onChange([...phones, v]);
    setDraft("");
  };
  return (
    <Section title={t("testCallers")}>
      <p className="text-xs text-gray-500 -mt-1">{t("testCallersHint")}</p>
      {phones.length > 0 && (
        <ul className="space-y-1.5">
          {phones.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-gray-800">{p}</span>
              <button
                type="button"
                onClick={() => onChange(phones.filter((_, j) => j !== i))}
                className="text-xs text-red-500 hover:text-red-700"
              >
                {t("testCallerRemove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="tel"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={t("testCallerPlaceholder")}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || phones.length >= 10}
          className="px-3 py-1.5 text-sm rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50 transition"
        >
          {t("testCallerAdd")}
        </button>
      </div>
    </Section>
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
    <label className="flex items-center justify-between gap-4 cursor-pointer flex-1">
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
  const len = (value ?? "").length;
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
      {maxLength && (
        // Live counter — turns amber near the cap so owners see it coming.
        <span className={`text-[11px] tabular-nums ${len >= maxLength ? "text-red-500 font-semibold" : len >= maxLength - 20 ? "text-amber-600" : "text-gray-400"}`}>
          {len}/{maxLength}
        </span>
      )}
    </label>
  );
}
function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
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
