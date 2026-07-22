"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Loader2, Truck, User, Users, Key, Check, X, Lock, ArrowRight, Copy, RefreshCw } from "lucide-react";

/**
 * Driver pool / ShipDay configuration UI.
 *
 * Three logical sections:
 *   1. Delivery source — who actually dispatches your delivery orders
 *      (own / shipday / both). When "both", kitchen gets a per-order picker.
 *   2. ShipDay credentials — API key, master enable.
 *   3. Customer-facing fee math — pass-through / flat / tiered.
 *
 * Saves via PUT /api/admin/driver-pool; router.refresh() so the
 * GuidedSetupPill and any dependent UI re-renders.
 */

type Tier = { minOrderTotal: number; customerFee: number };

type Initial = {
  enabled: boolean;
  driverPoolEnabled: boolean;
  deliverySource: "own" | "shipday" | "both";
  deliveryFeeMode: "pass_through" | "flat" | "tiered";
  flatDeliveryFee: number;
  tieredRules: Tier[];
  hasApiKey: boolean;
  /** Full per-restaurant webhook URL to paste into ShipDay → Integrations.
   *  Null until the first shipday/both save mints the token. */
  webhookUrl: string | null;
  /** True once the first correctly-tokened ShipDay webhook arrived. */
  webhookVerified: boolean;
  /** True once the partner intro (Justin) has been emailed for this
   *  restaurant — drives the "waiting on your ShipDay account" state. */
  partnerContacted: boolean;
};

export function DriverPoolClient({
  initial,
  driverPoolEntitled,
  hideSourceSelector = false,
}: {
  initial: Initial;
  driverPoolEntitled: boolean;
  /** When embedded under the provider chooser (which owns the own/shipday/feefree
   *  choice), hide the own/shipday/both source cards and lock the source to
   *  ShipDay — this panel is only shown when ShipDay is the chosen provider. */
  hideSourceSelector?: boolean;
}) {
  const t = useTranslations("admin.driverPool");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [deliverySource, setDeliverySource] = useState<Initial["deliverySource"]>(
    hideSourceSelector ? "shipday" : initial.deliverySource,
  );
  // Fee-mode fields are read-only pass-through now (the picker UI was removed —
  // dormant scaffolding; fees come from Delivery Zones). Saved values echo back
  // unchanged so the API payload shape stays identical.
  const [deliveryFeeMode] = useState<Initial["deliveryFeeMode"]>(initial.deliveryFeeMode);
  const [flatDeliveryFee] = useState<number>(initial.flatDeliveryFee);
  const [tieredRules] = useState<Tier[]>(initial.tieredRules);
  const [apiKey, setApiKey] = useState<string>("");
  const [replacingKey, setReplacingKey] = useState(!initial.hasApiKey);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // "Do you have a Shipday account?" gate — a saved key implies yes; otherwise
  // ask, so a brand-new restaurant is routed to create one. Luigi/Justin 2026-06-17.
  const [hasAccount, setHasAccount] = useState<"yes" | "no" | null>(initial.hasApiKey ? "yes" : null);
  // "Have ShipDay contact me" (no-account path) — fires the three-way intro
  // email (owner + Justin + ops). partnerContacted persists across visits so
  // the waiting state survives a reload. Luigi/Justin handoff 2026-07-12.
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(initial.partnerContacted);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Shipday is required when source is "shipday" or "both" — surface a
  // soft warning if they pick those without credentials.
  const needsShipDay = deliverySource !== "own";
  const missingCredentials = needsShipDay && !initial.hasApiKey && !apiKey;
  // Entitlement gate — clicking a locked tile shows a toast pointing
  // to the add-ons page instead of changing state.
  function handleSourceClick(next: Initial["deliverySource"]) {
    if (next !== "own" && !driverPoolEntitled) {
      toast.error(t("toastSubscribeToUnlock"));
      return;
    }
    setDeliverySource(next);
  }

  async function save() {
    if (needsShipDay && !driverPoolEntitled) {
      toast.error(t("toastSubscribeFirst"));
      return;
    }
    if (missingCredentials) {
      toast.error(t("toastAddApiKeyFirst"));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        enabled,
        deliveryFeeMode,
        flatDeliveryFee,
        tieredRules,
      };
      // The provider chooser owns deliverySource when this panel is embedded
      // (hideSourceSelector) — including it here would silently rewrite a
      // legacy "both" store to "shipday" on a mere settings save, killing the
      // kitchen's mid-shift toggle without an explicit provider choice. The
      // route accepts partial bodies; the enable/entitlement gates still fire
      // on `enabled: true` alone. Standalone mode keeps saving the user's pick.
      if (!hideSourceSelector) payload.deliverySource = deliverySource;
      // Only send the API key when the user actually typed a new one.
      // Sending an empty string would clobber the saved key.
      if (replacingKey && apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }
      const res = await fetch("/api/admin/driver-pool", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // ShipDay needs a working online payment method first (drivers can't
        // collect at the door) — localized toast for that specific refusal.
        if (data.code === "online_payment_required") {
          toast.error(t("toastOnlinePaymentRequired"), { duration: 8000 });
          return;
        }
        toast.error(data.error || t("toastFailedToSave"));
        return;
      }
      toast.success(t("toastSaved"));
      setApiKey("");
      setReplacingKey(false);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || t("toastFailedToSave"));
    } finally {
      setSaving(false);
    }
  }

  // "Have ShipDay contact me" — the guided handoff for owners WITHOUT a
  // ShipDay account: one click emails the three-way intro (Justin + owner +
  // ops) so the account is created with the partner discount + credits +
  // scheduled onboarding, instead of the owner signing up cold. Idempotent
  // server-side; alreadySent still flips the local waiting state.
  async function contactShipday() {
    if (!driverPoolEntitled) { toast.error(t("toastSubscribeFirst")); return; }
    setContactSending(true);
    try {
      const res = await fetch("/api/admin/driver-pool/contact", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || t("contactMeFailed"));
        return;
      }
      setContactSent(true);
      toast.success(data?.alreadySent ? t("contactMeAlready") : t("contactMeSent"), { duration: 9000 });
    } catch {
      toast.error(t("contactMeFailed"));
    } finally {
      setContactSending(false);
    }
  }

  // "Test connection" — validate the key against ShipDay WITHOUT placing a real
  // order. Tests the key being typed (if any), else the saved one. Luigi 2026-06-17.
  async function testConnection() {
    if (!driverPoolEntitled) { toast.error(t("toastSubscribeFirst")); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/driver-pool/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined }),
      });
      const data = await res.json();
      if (data?.ok) {
        setTestResult({ ok: true, msg: t("testSuccess") });
      } else {
        setTestResult({ ok: false, msg: t("testFailed", { error: data?.error || t("errorUnknown") }) });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: t("testFailed", { error: e?.message || t("errorNetwork") }) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-6 h-6 text-blue-500" />
          {t("heading")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("headingDescription")}
        </p>
      </div>

      {/* Setup progress — GloriaFood-style guided steps, derived from saved
          state so the owner can leave mid-setup and resume exactly where they
          were. Only meaningful once a ShipDay source is picked. */}
      {needsShipDay && driverPoolEntitled && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">{t("stepsTitle")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <StepChip n={1} label={t("step1Label")} done={initial.hasApiKey} active={!initial.hasApiKey} />
            <StepChip n={2} label={t("step2Label")} done={initial.webhookVerified} active={initial.hasApiKey && !initial.webhookVerified} />
            <StepChip n={3} label={t("step3Label")} done={initial.enabled && initial.hasApiKey} active={initial.hasApiKey && initial.webhookVerified && !initial.enabled} />
          </div>
        </div>
      )}

      {/* Section 1: Delivery source (hidden when driven by the provider chooser) */}
      {!hideSourceSelector && (
      <Section
        title={t("deliverySourceTitle")}
        description={t("deliverySourceDescription")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SourceCard
            id="own"
            label={t("sourceOwnLabel")}
            icon={<User className="w-5 h-5" />}
            description={t("sourceOwnDescription")}
            selected={deliverySource === "own"}
            onClick={() => handleSourceClick("own")}
          />
          <SourceCard
            id="shipday"
            label={t("sourceShipdayLabel")}
            icon={<Truck className="w-5 h-5" />}
            description={t("sourceShipdayDescription")}
            selected={deliverySource === "shipday"}
            onClick={() => handleSourceClick("shipday")}
            locked={!driverPoolEntitled}
          />
          <SourceCard
            id="both"
            label={t("sourceBothLabel")}
            icon={<Users className="w-5 h-5" />}
            description={t("sourceBothDescription")}
            selected={deliverySource === "both"}
            onClick={() => handleSourceClick("both")}
            locked={!driverPoolEntitled}
          />
        </div>
        {/* How ShipDay dispatch works — the rules Luigi set 2026-07-04, spelled
            out where the owner flips the switch: ON auto-sends every new
            delivery (⇒ prepaid online only), no per-order switching after
            acceptance, OFF still allows manual dispatch from the ShipDay app. */}
        <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 p-4">
          <div className="text-sm font-bold text-blue-900">{t("howItWorksTitle")}</div>
          <ul className="mt-2 space-y-1.5 text-[13px] text-blue-900/90 leading-snug list-disc pl-4">
            <li>{t("howItWorksOn")}</li>
            <li>{t("howItWorksNoSwitch")}</li>
            <li>{t("howItWorksOff")}</li>
          </ul>
        </div>
        {!driverPoolEntitled && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-amber-900 leading-relaxed">
              {t.rich("lockedNotice", {
                strong: (c) => <strong>{c}</strong>,
              })}
            </div>
            <Link
              href="/admin/billing/add-ons"
              className="flex-shrink-0 inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
            >
              {t("getDriverPool")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </Section>
      )}

      {/* Section 2: ShipDay credentials — only shown when source isn't "own" */}
      {needsShipDay && (
        <Section
          title={t("credentialsTitle")}
          description={t("credentialsDescription")}
        >
          <div className="space-y-3">
            {/* Partner benefit — exclusive to restaurants connecting Shipday
                THROUGH Fee Free Ordering. Surfaces Justin's offer (≈20% off +
                ≈60 days credits + guided onboarding) so owners see the value.
                Luigi/Justin 2026-06-17. */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <div className="text-sm font-bold text-blue-900">{t("partnerOfferTitle")}</div>
              <p className="text-[13px] text-blue-900/90 mt-1 leading-snug">{t("partnerOfferBody")}</p>
            </div>

            {initial.hasApiKey && !replacingKey ? (
              /* A key is already saved. */
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-emerald-900">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">{t("apiKeySaved")}</span>
                  <span className="text-emerald-700">· ••••</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplacingKey(true)}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  {t("replaceKey")}
                </button>
              </div>
            ) : hasAccount === null ? (
              /* Account-check gate — CloudWaitress-style "do you have an account?" */
              <div className="border border-gray-200 rounded-lg px-4 py-3">
                <div className="text-sm font-medium text-gray-800 mb-2">{t("accountQuestion")}</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHasAccount("yes")} className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                    {t("accountYes")}
                  </button>
                  <button type="button" onClick={() => setHasAccount("no")} className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                    {t("accountNo")}
                  </button>
                </div>
              </div>
            ) : hasAccount === "no" ? (
              /* No account — the PARTNER HANDOFF is the primary path (Justin's
                 rule: never leave the ball entirely in the restaurant's court).
                 One click emails a three-way intro; signing up cold on
                 shipday.com stays as the self-serve fallback. */
              <div className="border border-gray-200 rounded-lg px-4 py-3 space-y-2">
                {contactSent ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] text-emerald-900 leading-snug">{t("waitingBanner")}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] text-gray-700 leading-snug">{t("contactMeNote")}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={contactShipday}
                        disabled={contactSending}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
                      >
                        {contactSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {t("contactMeButton")} {!contactSending && <ArrowRight className="w-4 h-4" />}
                      </button>
                      <a
                        href="https://www.shipday.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:underline"
                      >
                        {t("createAccount")}
                      </a>
                    </div>
                  </>
                )}
                <button type="button" onClick={() => setHasAccount("yes")} className="text-xs text-gray-500 hover:underline">
                  {t("haveAccountInstead")}
                </button>
              </div>
            ) : (
              /* Yes, they have an account — enter the API key. */
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  {t("apiKeyLabel")}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t("apiKeyPlaceholder")}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
                    autoComplete="off"
                  />
                </div>
                {initial.hasApiKey && (
                  <button
                    type="button"
                    onClick={() => { setReplacingKey(false); setApiKey(""); }}
                    className="mt-2 text-xs text-gray-500 hover:underline"
                  >
                    {t("cancelReplaceKey")}
                  </button>
                )}
                <p className="text-[11px] text-gray-500 mt-2 leading-snug">
                  {t("apiKeyHint")}
                </p>
              </div>
            )}

            {/* Test connection — only when a key is in play (saved or being
                entered). Confirms the key works WITHOUT placing a real order.
                (Luigi 2026-06-17 "need to test this".) */}
            {((initial.hasApiKey && !replacingKey) || hasAccount === "yes") && (
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  {testing ? t("testing") : t("testConnection")}
                </button>
                {testResult && (
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${testResult.ok ? "text-emerald-700" : "text-rose-700"}`}>
                    {testResult.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {testResult.msg}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-500 rounded focus:ring-2 focus:ring-blue-400"
                />
                <span className="text-sm font-medium text-gray-700">
                  {t("masterEnableLabel")}
                </span>
              </label>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">
              {t("masterEnableHint")}
            </p>
          </div>
        </Section>
      )}

      {/* Section 2b: Live driver status webhook — the owner pastes their
          personal tokened URL into ShipDay → Integrations so driver events
          (picked up, delivered) flow back into their orders. Verified state
          is stamped server-side by the first correctly-tokened webhook. */}
      {needsShipDay && driverPoolEntitled && (
        <Section title={t("webhookTitle")} description={t("webhookDescription")}>
          {initial.webhookUrl ? (
            <div className="space-y-3">
              <ol className="list-decimal pl-5 space-y-1.5 text-[13px] text-gray-700 leading-snug">
                <li>{t("webhookInstruction1")}</li>
                <li>{t("webhookInstruction2")}</li>
                <li>{t("webhookInstruction3")}</li>
              </ol>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 min-w-[240px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[12px] font-mono text-gray-800 break-all select-all">
                  {initial.webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(initial.webhookUrl!);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2500);
                    } catch {
                      toast.error(t("toastFailedToSave"));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50"
                >
                  {copiedWebhook ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copiedWebhook ? t("webhookCopied") : t("webhookCopy")}
                </button>
              </div>
              {initial.webhookVerified ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-emerald-900">{t("webhookVerifiedMsg")}</span>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[13px] text-amber-900">{t("webhookWaiting")}</span>
                  <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="text-xs font-semibold text-amber-800 hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> {t("webhookCheckNow")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-gray-600 leading-snug">{t("webhookSaveFirst")}</p>
          )}
        </Section>
      )}

      {/* Section 3: where delivery fees actually live. The old
          pass-through/flat/tiered picker was DORMANT scaffolding — nothing in
          the money path ever read ShipdayConfig.deliveryFeeMode, so checkout
          priced delivery from Delivery Zones the whole time. An owner setting
          "Flat $0" here believed they'd made delivery free and hadn't. Replaced
          with the truth + a link (Luigi caught it live, 2026-07-12). Schema
          fields kept for a future wired-in version. */}
      {needsShipDay && (
        <Section title={t("feeFromZonesTitle")}>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
            <p className="text-[13px] text-gray-700 leading-snug">{t("feeFromZonesBody")}</p>
            <Link
              href="/admin/delivery"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline"
            >
              {t("feeFromZonesLink")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Section>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow transition flex items-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t("saving")}</>
          ) : (
            <>{t("saveChanges")}</>
          )}
        </button>
      </div>
    </div>
  );
}

/** One step in the setup-progress strip: number → ✓ when done, blue ring on
 *  the current step. Purely presentational — state is derived by the caller. */
function StepChip({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 ${
        done ? "border-emerald-200 bg-emerald-50" : active ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          done ? "bg-emerald-500 text-white" : active ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </div>
      <span className={`text-xs font-semibold leading-tight ${done ? "text-emerald-900" : active ? "text-blue-900" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {description && <p className="text-sm text-gray-600 mt-1 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}

function SourceCard({
  label, icon, description, selected, onClick, locked = false,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  selected: boolean;
  onClick: () => void;
  /** True when this option requires the driver_pool entitlement and
   *  the restaurant doesn't have it. Renders the card greyed-out with
   *  a Lock badge; click still calls onClick (which toasts the upsell). */
  locked?: boolean;
}) {
  const t = useTranslations("admin.driverPool");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-4 transition ${
        locked
          ? "border-gray-200 bg-gray-50 hover:border-gray-300 cursor-not-allowed"
          : selected
          ? "border-blue-400 bg-blue-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
        locked ? "bg-gray-200 text-gray-400" : selected ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
      }`}>
        {icon}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`font-bold text-sm ${locked ? "text-gray-500" : "text-gray-900"}`}>{label}</div>
        {locked && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase tracking-wider inline-flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" /> {t("addonRequired")}
          </span>
        )}
        {!locked && selected && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white uppercase tracking-wider">
            {t("selected")}
          </span>
        )}
      </div>
      <p className={`text-xs mt-1 leading-snug ${locked ? "text-gray-500" : "text-gray-600"}`}>{description}</p>
    </button>
  );
}

