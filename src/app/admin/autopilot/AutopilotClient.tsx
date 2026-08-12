"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import {
  Zap, ShoppingBag, ShoppingCart, Users, Mail, Clock, Tag,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Save, AlertTriangle,
  Target, Crown, ExternalLink,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { StepSequenceEditor } from "./StepSequenceEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string | null;
  campaignType: string;
  isEnabled: boolean;
  subject: string;
  emailBody: string;
  delayHours: number;
  couponId: string | null;
}

interface MasterState {
  masterEnabled: boolean;
  secondOrderEnabled: boolean;
  reEngageEnabled: boolean;
  cartAbandonmentEnabled: boolean;
  // What members of a "club" group get from each campaign. Luigi 2026-08-11.
  reEngageVipMode: VipModeValue;
  secondOrderVipMode: VipModeValue;
  cartAbandonVipMode: VipModeValue;
}

type VipModeValue = "offer" | "no_offer" | "skip";

/** campaignType → the AutopilotState field holding its club policy. */
const VIP_MODE_KEY: Record<string, "reEngageVipMode" | "secondOrderVipMode" | "cartAbandonVipMode"> = {
  reengagement: "reEngageVipMode",
  second_order: "secondOrderVipMode",
  cart_abandonment: "cartAbandonVipMode",
};

// ─── Campaign config ──────────────────────────────────────────────────────────
//
// `stateKey` is the field on AutopilotState that this campaign's individual
// toggle binds to — used by CampaignCard to switch the per-campaign gate
// independently of the AutopilotCampaign config's `isEnabled` flag (the
// AutopilotCampaign row owns subject/body/delay, AutopilotState owns the
// boolean gate the cron actually reads).

const CAMPAIGN_CONFIGS = [
  {
    type: "second_order",
    stateKey: "secondOrderEnabled" as const,
    icon: ShoppingBag,
    color: "orange",
    defaultDelay: 24,
  },
  {
    type: "cart_abandonment",
    stateKey: "cartAbandonmentEnabled" as const,
    icon: ShoppingCart,
    color: "blue",
    defaultDelay: 2,
  },
  {
    type: "reengagement",
    stateKey: "reEngageEnabled" as const,
    icon: Users,
    color: "purple",
    defaultDelay: 168, // 7 days in hours
  },
];

const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; badge: string }> = {
  orange: { bg: "bg-emerald-50", icon: "text-emerald-500", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  blue:   { bg: "bg-blue-50",    icon: "text-blue-500",    border: "border-blue-200",    badge: "bg-blue-100 text-blue-700"   },
  purple: { bg: "bg-amber-50",   icon: "text-amber-500",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700" },
};

// ─── CampaignCard ─────────────────────────────────────────────────────────────

function CampaignCard({
  config, campaign, stateEnabled, masterEnabled, emailConfigured, coupons, result, codeLive, hasClubs, vipMode, currency = "usd", onChange, onToggleStateEnabled, onChangeVipMode,
}: {
  config: typeof CAMPAIGN_CONFIGS[0];
  campaign: Campaign;
  /** AutopilotState toggle — the per-campaign master gate the CRON reads. */
  stateEnabled: boolean;
  /** AutopilotState.masterEnabled — when off, everything is disabled. */
  masterEnabled: boolean;
  /** False when this campaign's coupon row is inactive/expired, so its emails
   *  would go out with no offer. Undefined = not checked. */
  codeLive?: boolean;
  /** The restaurant has at least one group marked "already gets club pricing",
   *  so the per-campaign policy control is worth showing. Luigi 2026-08-11. */
  hasClubs: boolean;
  /** What club members get from THIS campaign. */
  vipMode: "offer" | "no_offer" | "skip";
  emailConfigured: boolean;
  coupons: { id: string; code: string; description?: string | null }[];
  /** Sent / Sales (last 30d) for this campaign. Luigi 2026-06-09. */
  result?: { sent: number; sales: number };
  currency?: string;
  onChange: (updated: Partial<Campaign>) => void;
  onToggleStateEnabled: (next: boolean) => void;
  onChangeVipMode: (next: "offer" | "no_offer" | "skip") => void;
}) {
  const t = useTranslations("admin.autopilotClient");
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const colors = COLOR_MAP[config.color];
  const Icon = config.icon;
  const disabled = !masterEnabled;
  const active = stateEnabled && masterEnabled;

  const delayDays = Math.round(campaign.delayHours / 24);
  const delayDisplay = config.type === "reengagement"
    ? t("delayDays", { n: delayDays })
    : campaign.delayHours < 24
      ? t("delayHours", { n: campaign.delayHours })
      : t("delayDays", { n: delayDays });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/autopilot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType: config.type,
          // Keep AutopilotCampaign.isEnabled mirrored to the AutopilotState
          // gate so /admin/autopilot doesn't get into a confusing state.
          isEnabled: stateEnabled,
          subject: campaign.subject,
          emailBody: campaign.emailBody,
          delayHours: campaign.delayHours,
          couponId: campaign.couponId || null,
        }),
      });
      if (!res.ok) {
        let msg = t("saveFailed");
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      toast.success(t("campaignSaved"));
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const toggle = () => {
    if (disabled) {
      toast(t("masterToggleHint"), { icon: "ℹ️" });
      return;
    }
    onToggleStateEnabled(!stateEnabled);
  };

  // Campaign-type-specific translated strings
  const campaignTitle = t(`campaign_${config.type}_title` as any);
  const campaignTagline = t(`campaign_${config.type}_tagline` as any);
  const campaignDescription = t(`campaign_${config.type}_description` as any);
  const campaignTriggerLabel = t(`campaign_${config.type}_triggerLabel` as any);
  // The default subject/body are EMAIL TEMPLATES, not UI copy: they carry the
  // owner-editable tokens ({customer_name}, {restaurant_name}, {restaurant_link},
  // {coupon_section}) that applyEmailTokens() substitutes at SEND time
  // (src/lib/email.ts). next-intl reads `{x}` as an ICU argument, so t() logged a
  // FORMATTING_ERROR per token and rendered the fallback — the placeholder showed
  // "admin.autopilotClient.campaign_…" instead of the template. Only in dev:
  // use-intl's production build skips compiling a message when no values are
  // passed, which is exactly why this survived unnoticed in prod.
  // `t.raw` skips the ICU pass in BOTH builds, so the tokens reach the
  // placeholder byte-for-byte — what the owner needs to see and copy. Never put
  // these back through t(): the console floods and the placeholder breaks again.
  const campaignDefaultSubject = t.raw(`campaign_${config.type}_defaultSubject`) as string;
  const campaignDefaultBody = t.raw(`campaign_${config.type}_defaultBody`) as string;

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${active ? colors.border : "border-gray-100"} ${disabled ? "opacity-60" : ""}`}
      title={disabled ? t("disabledTitle") : undefined}
    >
      {/* Header */}
      <div className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{campaignTitle}</span>
            {active && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>{t("activeBadge")}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{campaignTagline}</p>
          {active && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {t("triggerLabel", { delay: delayDisplay })}
            </p>
          )}
          {/* Results (Luigi 2026-06-09, E): Sent / Sales last 30d / Fees ($0 —
              Fee Free never bills per message). Shown for every campaign that
              has any send history, active or stopped. */}
          {result && result.sent > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
              <span className="text-gray-500">{t("resultSent")}: <span className="font-semibold text-gray-800">{result.sent.toLocaleString()}</span></span>
              <span className="text-gray-500">{t("resultSales")}: <span className="font-semibold text-emerald-600">{formatCurrency(result.sales, currency)}</span></span>
              <span className="text-gray-500">{t("resultFees")}: <span className="font-semibold text-gray-800">{formatCurrency(0, currency)}</span></span>
            </div>
          )}
          {/* CODE HEALTH (Luigi 2026-08-11, Ben Bilton's WIN1 report). A campaign
              reading "Active" while its coupon row is switched off or expired ran
              undetected here for five weeks — 54 emails carrying a dead code. The
              drip no longer ships one, but a silent downgrade to a couponless
              email is still not what the owner signed up for, so say it out loud
              on the card that claims the campaign is running. */}
          {active && codeLive === false && (
            <div className="flex items-start gap-2 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">{t("codeNotLiveTitle")}</span>{" "}
                {t("codeNotLiveBody")}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={toggle}
            disabled={disabled}
            className={`flex items-center gap-2 text-sm font-medium transition ${disabled ? "cursor-not-allowed" : "text-gray-600 hover:text-gray-800"}`}
          >
            {stateEnabled
              ? <ToggleRight className={`w-8 h-8 ${disabled ? "text-gray-300" : "text-emerald-500"}`} />
              : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            disabled={disabled}
            className={`p-2 rounded-lg transition ${disabled ? "text-gray-300 cursor-not-allowed" : "text-gray-400 hover:text-gray-600"}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && !disabled && (
        <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">
          {!emailConfigured && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <span className="font-semibold">{t("emailNotConfiguredTitle")}</span>{" "}
                {t("emailNotConfiguredBody")}
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600">{campaignDescription}</p>

          {/* ── What club members get from THIS campaign (Luigi 2026-08-11) ──
              Hidden entirely when the owner hasn't marked any group as a club —
              there is nothing for it to govern, and an inert control on every
              restaurant's page is just noise. */}
          {hasClubs && (
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-900">{t("vipModeTitle")}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{t("vipModeDesc")}</p>
              <div className="flex flex-wrap gap-2">
                {(["offer", "no_offer", "skip"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChangeVipMode(mode)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition ${
                      vipMode === mode
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span className="block font-semibold">{t(`vipMode_${mode}_label` as any)}</span>
                    <span className="block text-[11px] opacity-80">{t(`vipMode_${mode}_desc` as any)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stepped campaigns (reengagement / second_order) → the drip-sequence
              editor: owner-configured count + delay + % per email. cart_abandonment
              keeps the single-email config below. Luigi 2026-06-10. */}
          {config.type !== "cart_abandonment" ? (
            <StepSequenceEditor campaignType={config.type} stateEnabled={stateEnabled} />
          ) : (
          <>
          {/* Trigger delay */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {campaignTriggerLabel}
            </label>
            {/* cart_abandonment only (stepped campaigns use the StepSequenceEditor
                above); the delay is in HOURS. */}
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="168"
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={campaign.delayHours}
                onChange={e => onChange({ delayHours: parseInt(e.target.value) || 24 })} />
              <span className="text-sm text-gray-500">{t("unitHours")}</span>
            </div>
          </div>

          {/* Linked coupon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Tag className="inline w-3.5 h-3.5 mr-1" />
              {t("attachCouponLabel")}
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={campaign.couponId ?? ""}
              onChange={e => onChange({ couponId: e.target.value || null })}
            >
              <option value="">{t("noCouponOption")}</option>
              {coupons.map(c => (
                <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ""}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">{t.rich("couponSectionHint", {
              code: (c) => <code className="bg-gray-100 px-1 rounded">{c}</code>,
              // "Use <code>{coupon_section}</code> in your email body…" — the
              // brace pair is the literal email token we're telling the owner to
              // type, not an ICU variable, but next-intl can't tell the
              // difference and threw FORMATTING_ERROR for the missing value. This
              // one broke in PRODUCTION too (unlike the templates above: passing
              // any values defeats use-intl's no-compile hot path), so every
              // owner in all 38 locales saw the bare key here instead of the
              // hint. It needs its rich <code> tag, so t.raw is out; feeding the
              // token back as its own value renders it verbatim. All 38 locales
              // use exactly {coupon_section} here (parity audit enforces it).
              coupon_section: "{coupon_section}",
            })}</p>
          </div>

          {/* Email subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="inline w-3.5 h-3.5 mr-1" />
              {t("emailSubjectLabel")}
            </label>
            <input type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={campaignDefaultSubject}
              value={campaign.subject}
              onChange={e => onChange({ subject: e.target.value })} />
          </div>

          {/* Email body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("emailBodyLabel")}</label>
            <div className="text-xs text-gray-400 mb-1.5 flex flex-wrap gap-2">
              {["{customer_name}", "{restaurant_name}", "{restaurant_link}", "{coupon_section}"].map(tok => (
                <code key={tok} className="bg-gray-100 px-1.5 py-0.5 rounded">{tok}</code>
              ))}
            </div>
            <textarea rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-y"
              placeholder={campaignDefaultBody}
              value={campaign.emailBody}
              onChange={e => onChange({ emailBody: e.target.value })} />
          </div>

          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition">
              <Save className="w-4 h-4" />
              {saving ? t("savingButton") : t("saveButton")}
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AutopilotClient ──────────────────────────────────────────────────────────

export function AutopilotClient({
  campaigns: initialCampaigns,
  coupons,
  emailConfigured,
  results = {},
  codeHealth = {},
  clubs = { names: [], memberCount: 0 },
  currency = "usd",
}: {
  campaigns: Campaign[];
  coupons: { id: string; code: string; description?: string | null }[];
  emailConfigured: boolean;
  /** Per-campaignType results (Sent / Sales last 30d). Luigi 2026-06-09. */
  results?: Record<string, { sent: number; sales: number }>;
  /** Per-campaignType: does this campaign still have a redeemable coupon row?
   *  Luigi 2026-08-11 — an "Active" campaign advertising a switched-off code
   *  went unnoticed for five weeks. */
  codeHealth?: Record<string, boolean>;
  /** Groups the owner has marked as "already gets club pricing", and how many
   *  DISTINCT people they hold. Drives the audience summary + each campaign's
   *  club-policy control. Empty = no clubs, so the controls stay hidden and
   *  Autopilot behaves exactly as it did before. Luigi 2026-08-11. */
  clubs?: { names: string[]; memberCount: number };
  currency?: string;
}) {
  const t = useTranslations("admin.autopilotClient");
  const clubCount = clubs.memberCount;
  const clubNames = clubs.names.join(", ");
  const [campaigns, setCampaigns] = useState<Campaign[]>(() =>
    CAMPAIGN_CONFIGS.map(config => {
      const found = initialCampaigns.find(c => c.campaignType === config.type);
      return found ?? {
        id: null, campaignType: config.type,
        isEnabled: false, subject: "", emailBody: "",
        delayHours: config.defaultDelay, couponId: null,
      };
    })
  );

  // AutopilotState — the master gate + per-campaign cron toggles. Loaded
  // on mount from /api/restaurants/autopilot/master.
  const [master, setMaster] = useState<MasterState>({
    masterEnabled: false,
    secondOrderEnabled: false,
    reEngageEnabled: false,
    cartAbandonmentEnabled: false,
    reEngageVipMode: "no_offer",
    secondOrderVipMode: "no_offer",
    cartAbandonVipMode: "no_offer",
  });
  const [masterLoaded, setMasterLoaded] = useState(false);
  const [masterSaving, setMasterSaving] = useState(false);

  useEffect(() => {
    fetch("/api/restaurants/autopilot/master")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setMaster({
            masterEnabled: !!data.masterEnabled,
            secondOrderEnabled: !!data.secondOrderEnabled,
            reEngageEnabled: !!data.reEngageEnabled,
            cartAbandonmentEnabled: !!data.cartAbandonmentEnabled,
            reEngageVipMode: (data.reEngageVipMode ?? "no_offer") as VipModeValue,
            secondOrderVipMode: (data.secondOrderVipMode ?? "no_offer") as VipModeValue,
            cartAbandonVipMode: (data.cartAbandonVipMode ?? "no_offer") as VipModeValue,
          });
        }
        setMasterLoaded(true);
      })
      .catch(() => setMasterLoaded(true));
  }, []);

  const patchMaster = async (patch: Partial<MasterState>) => {
    // Optimistic update so the toggles feel instant.
    const next = { ...master, ...patch };
    setMaster(next);
    setMasterSaving(true);
    try {
      const res = await fetch("/api/restaurants/autopilot/master", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        // Roll back optimistic update on failure.
        setMaster(master);
        let msg = t("failedToUpdate");
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        toast.error(msg);
      }
    } catch (e: any) {
      setMaster(master);
      toast.error(e.message || t("networkError"));
    }
    setMasterSaving(false);
  };

  const update = (type: string, partial: Partial<Campaign>) => {
    setCampaigns(prev => prev.map(c => c.campaignType === type ? { ...c, ...partial } : c));
  };

  const activeCampaigns = master.masterEnabled
    ? CAMPAIGN_CONFIGS.filter(c => master[c.stateKey]).length
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
        </div>
        <p className="text-sm text-gray-500 ml-13">
          {t("pageSubtitle")}
        </p>
      </div>

      {/* ── Master toggle — GloriaFood-style "Activate Autopilot Selling?" gate */}
      <div
        className={`mb-6 rounded-2xl border p-6 shadow-sm transition ${
          master.masterEnabled
            ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">
              {t("masterToggleHeading")}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {master.masterEnabled
                ? t("masterToggleOnDesc")
                : t("masterToggleOffDesc")}
            </p>
          </div>
          <button
            onClick={() => patchMaster({ masterEnabled: !master.masterEnabled })}
            disabled={!masterLoaded || masterSaving}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl font-bold text-base transition shadow-sm ${
              master.masterEnabled
                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                : "bg-white border-2 border-gray-300 text-gray-700 hover:border-gray-400"
            } disabled:opacity-50`}
            aria-pressed={master.masterEnabled}
          >
            {master.masterEnabled
              ? <><ToggleRight className="w-6 h-6" /> {t("masterToggleYes")}</>
              : <><ToggleLeft className="w-6 h-6" /> {t("masterToggleNo")}</>}
          </button>
        </div>
      </div>

      {/* Overview card */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 text-lg mb-2">{t("howItWorksTitle")}</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
            <div><span className="font-semibold block">{t("step1Title")}</span>{t("step1Body")}</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
            <div><span className="font-semibold block">{t("step2Title")}</span>{t("step2Body")}</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
            <div><span className="font-semibold block">{t("step3Title")}</span>{t("step3Body")}</div>
          </div>
        </div>
        {activeCampaigns > 0 && (
          <div className="mt-4 text-sm font-semibold text-emerald-700">
            {t("activeCampaignsCount", { active: activeCampaigns, total: CAMPAIGN_CONFIGS.length })}
          </div>
        )}
      </div>

      {/* ── Who gets Autopilot offers ────────────────────────────────────────
          Replaces the old "Segment-based targeting — Coming Soon" card, which
          promised exactly this. Sits ABOVE the campaign cards because it
          governs all of them. Luigi 2026-08-11 (Ben Bilton, a VIP member, was
          emailed a 5%-off win-back on top of his 30% club discount). */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Target className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 mb-1">{t("audienceTitle")}</h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              {clubCount > 0 ? t("audienceSkipping", { count: clubCount, groups: clubNames }) : t("audienceNoClubs")}
            </p>
            <Link
              href="/admin/customer-groups"
              className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-2 hover:underline"
            >
              {t("audienceManage")} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Campaign cards */}
      <div className="space-y-4">
        {CAMPAIGN_CONFIGS.map((config, i) => (
          <CampaignCard
            key={config.type}
            config={config}
            campaign={campaigns[i]}
            stateEnabled={master[config.stateKey]}
            masterEnabled={master.masterEnabled}
            emailConfigured={emailConfigured}
            coupons={coupons}
            result={results[config.type]}
            codeLive={codeHealth[config.type]}
            hasClubs={clubCount > 0}
            vipMode={master[VIP_MODE_KEY[config.type]] ?? "no_offer"}
            onChangeVipMode={(next) => patchMaster({ [VIP_MODE_KEY[config.type]]: next } as Partial<MasterState>)}
            currency={currency}
            onChange={partial => update(config.type, partial)}
            onToggleStateEnabled={(next) => patchMaster({ [config.stateKey]: next } as Partial<MasterState>)}
          />
        ))}
      </div>
    </div>
  );
}
