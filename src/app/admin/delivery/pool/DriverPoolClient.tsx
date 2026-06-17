"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Loader2, Truck, User, Users, Key, DollarSign, Check, X, Plus, Trash2, Lock, ArrowRight } from "lucide-react";

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
};

export function DriverPoolClient({ initial, driverPoolEntitled }: { initial: Initial; driverPoolEntitled: boolean }) {
  const t = useTranslations("admin.driverPool");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [deliverySource, setDeliverySource] = useState<Initial["deliverySource"]>(initial.deliverySource);
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<Initial["deliveryFeeMode"]>(initial.deliveryFeeMode);
  const [flatDeliveryFee, setFlatDeliveryFee] = useState<number>(initial.flatDeliveryFee);
  const [tieredRules, setTieredRules] = useState<Tier[]>(initial.tieredRules);
  const [apiKey, setApiKey] = useState<string>("");
  const [replacingKey, setReplacingKey] = useState(!initial.hasApiKey);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // "Do you have a Shipday account?" gate — a saved key implies yes; otherwise
  // ask, so a brand-new restaurant is routed to create one. Luigi/Justin 2026-06-17.
  const [hasAccount, setHasAccount] = useState<"yes" | "no" | null>(initial.hasApiKey ? "yes" : null);

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
        deliverySource,
        deliveryFeeMode,
        flatDeliveryFee,
        tieredRules,
      };
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
        setTestResult({ ok: false, msg: t("testFailed", { error: data?.error || "Unknown error" }) });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: t("testFailed", { error: e?.message || "Network error" }) });
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

      {/* Section 1: Delivery source */}
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
              /* No account — send them to Shipday + explain the partner handoff. */
              <div className="border border-gray-200 rounded-lg px-4 py-3 space-y-2">
                <p className="text-[13px] text-gray-700 leading-snug">{t("noAccountConnectNote")}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href="https://www.shipday.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {t("createAccount")} <ArrowRight className="w-4 h-4" />
                  </a>
                  <button type="button" onClick={() => setHasAccount("yes")} className="text-xs text-gray-500 hover:underline">
                    {t("haveAccountInstead")}
                  </button>
                </div>
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

      {/* Section 3: Customer-facing fee */}
      {needsShipDay && (
        <Section
          title={t("feeSectionTitle")}
          description={t("feeSectionDescription")}
        >
          <div className="space-y-3">
            <FeeModeOption
              id="pass_through"
              label={t("feePassThroughLabel")}
              description={t("feePassThroughDescription")}
              selected={deliveryFeeMode === "pass_through"}
              onClick={() => setDeliveryFeeMode("pass_through")}
            />
            <FeeModeOption
              id="flat"
              label={t("feeFlatLabel")}
              description={t("feeFlatDescription")}
              selected={deliveryFeeMode === "flat"}
              onClick={() => setDeliveryFeeMode("flat")}
            >
              {deliveryFeeMode === "flat" && (
                <div className="mt-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={flatDeliveryFee}
                    onChange={(e) => setFlatDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <span className="text-xs text-gray-500">{t("flatFeeInputHint")}</span>
                </div>
              )}
            </FeeModeOption>
            <FeeModeOption
              id="tiered"
              label={t("feeTieredLabel")}
              description={t("feeTieredDescription")}
              selected={deliveryFeeMode === "tiered"}
              onClick={() => setDeliveryFeeMode("tiered")}
            >
              {deliveryFeeMode === "tiered" && (
                <div className="mt-3 space-y-2">
                  {tieredRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-12">{t("tierOver")}</span>
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rule.minOrderTotal}
                        onChange={(e) => {
                          const next = [...tieredRules];
                          next[i] = { ...rule, minOrderTotal: parseFloat(e.target.value) || 0 };
                          setTieredRules(next);
                        }}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <span className="text-xs text-gray-600">{t("tierCustomerPays")}</span>
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rule.customerFee}
                        onChange={(e) => {
                          const next = [...tieredRules];
                          next[i] = { ...rule, customerFee: parseFloat(e.target.value) || 0 };
                          setTieredRules(next);
                        }}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setTieredRules(tieredRules.filter((_, j) => j !== i))}
                        className="p-1 text-gray-400 hover:text-red-500"
                        aria-label={t("removeTierAriaLabel")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTieredRules([...tieredRules, { minOrderTotal: 0, customerFee: 0 }])}
                    className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {t("addTier")}
                  </button>
                </div>
              )}
            </FeeModeOption>
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

function FeeModeOption({
  label, description, selected, onClick, children,
}: {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 p-4 transition ${
        selected ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
          selected ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
        }`}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-sm">{label}</div>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">{description}</p>
          {children}
        </div>
      </div>
    </button>
  );
}
