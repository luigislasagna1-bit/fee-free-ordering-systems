"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Truck, User, Users, Key, DollarSign, Check, X, Plus, Trash2 } from "lucide-react";

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

export function DriverPoolClient({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [deliverySource, setDeliverySource] = useState<Initial["deliverySource"]>(initial.deliverySource);
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<Initial["deliveryFeeMode"]>(initial.deliveryFeeMode);
  const [flatDeliveryFee, setFlatDeliveryFee] = useState<number>(initial.flatDeliveryFee);
  const [tieredRules, setTieredRules] = useState<Tier[]>(initial.tieredRules);
  const [apiKey, setApiKey] = useState<string>("");
  const [replacingKey, setReplacingKey] = useState(!initial.hasApiKey);
  const [saving, setSaving] = useState(false);

  // Shipday is required when source is "shipday" or "both" — surface a
  // soft warning if they pick those without credentials.
  const needsShipDay = deliverySource !== "own";
  const missingCredentials = needsShipDay && !initial.hasApiKey && !apiKey;

  async function save() {
    if (missingCredentials) {
      toast.error("Add your ShipDay API key first, or switch source to 'Own drivers'.");
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
        toast.error(data.error || "Failed to save");
        return;
      }
      toast.success("Driver pool settings saved");
      setApiKey("");
      setReplacingKey(false);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-6 h-6 text-blue-500" />
          Driver pool
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Configure how your deliveries get dispatched. Mix your own drivers with
          ShipDay&apos;s third-party pool — or use one exclusively.
        </p>
      </div>

      {/* Section 1: Delivery source */}
      <Section
        title="Delivery source"
        description="Who handles your delivery orders by default?"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SourceCard
            id="own"
            label="Own drivers"
            icon={<User className="w-5 h-5" />}
            description="Your in-house drivers handle every delivery. ShipDay is never invoked."
            selected={deliverySource === "own"}
            onClick={() => setDeliverySource("own")}
          />
          <SourceCard
            id="shipday"
            label="ShipDay only"
            icon={<Truck className="w-5 h-5" />}
            description="Every delivery routes to ShipDay's third-party pool automatically."
            selected={deliverySource === "shipday"}
            onClick={() => setDeliverySource("shipday")}
          />
          <SourceCard
            id="both"
            label="Both — switch per order"
            icon={<Users className="w-5 h-5" />}
            description="Kitchen sees a picker on each delivery order: in-house or pool."
            selected={deliverySource === "both"}
            onClick={() => setDeliverySource("both")}
          />
        </div>
      </Section>

      {/* Section 2: ShipDay credentials — only shown when source isn't "own" */}
      {needsShipDay && (
        <Section
          title="ShipDay credentials"
          description="Paste your ShipDay API key. We encrypt it at rest with the platform's encryption key."
        >
          <div className="space-y-3">
            {initial.hasApiKey && !replacingKey ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-emerald-900">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">API key saved</span>
                  <span className="text-emerald-700">· ••••</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplacingKey(true)}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  Replace
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  ShipDay API key
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your ShipDay API key"
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
                    Cancel — keep the existing key
                  </button>
                )}
                <p className="text-[11px] text-gray-500 mt-2 leading-snug">
                  Find your key in ShipDay → Settings → API. The key is sent
                  encrypted and never logged.
                </p>
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
                  Master enable — actually dispatch to ShipDay
                </span>
              </label>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">
              When off, ShipDay calls are skipped even if &quot;Delivery source&quot; is
              set to ShipDay or Both. Use this to pause dispatch without changing
              your settings (e.g. during a billing dispute).
            </p>
          </div>
        </Section>
      )}

      {/* Section 3: Customer-facing fee */}
      {needsShipDay && (
        <Section
          title="What does the customer pay for delivery?"
          description="ShipDay charges you per delivery. You decide how much of that fee the customer sees."
        >
          <div className="space-y-3">
            <FeeModeOption
              id="pass_through"
              label="Pass-through"
              description="Customer pays the entire ShipDay fee. You absorb nothing."
              selected={deliveryFeeMode === "pass_through"}
              onClick={() => setDeliveryFeeMode("pass_through")}
            />
            <FeeModeOption
              id="flat"
              label="Flat fee"
              description="Customer pays a fixed fee no matter what ShipDay charges. You absorb the gap."
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
                  <span className="text-xs text-gray-500">flat delivery fee shown to customer</span>
                </div>
              )}
            </FeeModeOption>
            <FeeModeOption
              id="tiered"
              label="Tiered by order total"
              description="Charge less (or zero) when the order is bigger. e.g. free over $50."
              selected={deliveryFeeMode === "tiered"}
              onClick={() => setDeliveryFeeMode("tiered")}
            >
              {deliveryFeeMode === "tiered" && (
                <div className="mt-3 space-y-2">
                  {tieredRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-12">Over</span>
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
                      <span className="text-xs text-gray-600">→ customer pays</span>
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
                        aria-label="Remove tier"
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
                    <Plus className="w-3 h-3" /> Add tier
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
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <>Save changes</>
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
  label, icon, description, selected, onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-4 transition ${
        selected ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
        selected ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
      }`}>
        {icon}
      </div>
      <div className="flex items-center gap-2">
        <div className="font-bold text-gray-900 text-sm">{label}</div>
        {selected && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white uppercase tracking-wider">
            Selected
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 mt-1 leading-snug">{description}</p>
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
