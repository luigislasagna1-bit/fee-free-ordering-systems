"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Bell, ChevronDown, Lock, Mail, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Recipient = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  emailLanguage: string;
  deliveryConfirmed: boolean;
  pickupConfirmed: boolean;
  tableReservationConfirmed: boolean;
  orderAheadConfirmed: boolean;
  dineInConfirmed: boolean;
  orderPlaced: boolean;
  orderAccepted: boolean;
  orderRejected: boolean;
  orderCanceled: boolean;
  orderMissed: boolean;
  orderNotPlaced: boolean;
  lowBattery: boolean;
  badInternet: boolean;
  endOfDayReport: boolean;
  endOfMonthReport: boolean;
};

type CustomerToggles = {
  customerEmailPickupReady: boolean;
  customerEmailDeliveryReady: boolean;
  customerEmailDineInReady: boolean;
  customerEmailOrderRejected: boolean;
  customerEmailOrderConfirm: boolean;
};

const CONFIRMATION_TOGGLES: { key: keyof Recipient; tk: string }[] = [
  { key: "deliveryConfirmed",         tk: "deliveryConfirmed" },
  { key: "pickupConfirmed",           tk: "pickupConfirmed" },
  { key: "tableReservationConfirmed", tk: "tableReservationConfirmed" },
  { key: "orderAheadConfirmed",       tk: "orderAheadConfirmed" },
  { key: "dineInConfirmed",           tk: "dineInConfirmed" },
];

// We hide a few toggles that have no implementation:
//   - orderMissed:    needs every-N-min cron; Vercel Hobby is daily-only.
//   - orderNotPlaced: requires abandoned-cart tracking we don't have yet.
//   - lowBattery / badInternet: tablet-client telemetry; we don't ship a tablet app.
// The schema columns stay so the data isn't lost if we re-enable later.
const OPERATIONAL_TOGGLES: { key: keyof Recipient; tk: string }[] = [
  { key: "orderPlaced",    tk: "orderPlaced" },
  { key: "orderRejected",  tk: "orderRejected" },
  { key: "orderCanceled",  tk: "orderCanceled" },
];

const SYSTEM_TOGGLES: { key: keyof Recipient; tk: string }[] = [
  { key: "endOfDayReport",   tk: "endOfDayReport" },
  { key: "endOfMonthReport", tk: "endOfMonthReport" },
];

const CUSTOMER_TOGGLES: { key: keyof CustomerToggles; tk: string }[] = [
  { key: "customerEmailOrderConfirm",  tk: "orderConfirmation" },
  { key: "customerEmailPickupReady",   tk: "pickupReady" },
  { key: "customerEmailDeliveryReady", tk: "deliveryReady" },
  { key: "customerEmailDineInReady",   tk: "dineInReady" },
  { key: "customerEmailOrderRejected", tk: "orderRejected" },
];

interface Props {
  initialRecipients: Recipient[];
  initialCustomer: CustomerToggles;
}

export function NotificationsClient({ initialRecipients, initialCustomer }: Props) {
  const t = useTranslations("admin.notifications");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [customer, setCustomer] = useState<CustomerToggles>(initialCustomer);
  const [openId, setOpenId] = useState<string | null>(initialRecipients[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const updateRecipient = async (id: string, patch: Partial<Recipient>) => {
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    try {
      const res = await fetch(`/api/admin/notification-recipients/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error(tToasts("saveFailed"));
    }
  };

  const updateCustomer = async (patch: Partial<CustomerToggles>) => {
    setCustomer(prev => ({ ...prev, ...patch }));
    try {
      const res = await fetch(`/api/admin/notification-customer`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error(tToasts("saveFailed"));
    }
  };

  const addRecipient = async () => {
    if (!newEmail) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/notification-recipients`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setRecipients(prev => [...prev, data]);
      setOpenId(data.id);
      setNewEmail(""); setNewName(""); setShowAdd(false);
      toast.success(tToasts("created"));
    } catch (e: any) {
      toast.error(e.message || tToasts("createFailed"));
    }
    setAdding(false);
  };

  const removeRecipient = async (id: string) => {
    if (!confirm(tToasts("deleted") + "?")) return;
    try {
      const res = await fetch(`/api/admin/notification-recipients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRecipients(prev => prev.filter(r => r.id !== id));
      toast.success(tToasts("deleted"));
    } catch {
      toast.error(tToasts("deleteFailed"));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="w-6 h-6 text-emerald-500" /> {t("title")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t("staffRecipientsHelp")}</p>
      </div>

      {/* Restaurant staff recipients */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("staffRecipients")}</h2>

        {recipients.map((r, i) => (
          <RecipientCard
            key={r.id}
            recipient={r}
            isOpen={openId === r.id}
            onToggleOpen={() => setOpenId(openId === r.id ? null : r.id)}
            onUpdate={(patch) => updateRecipient(r.id, patch)}
            onRemove={i > 0 ? () => removeRecipient(r.id) : undefined}
          />
        ))}

        {showAdd ? (
          <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{t("addRecipient")}</span>
              <button onClick={() => { setShowAdd(false); setNewEmail(""); setNewName(""); }} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="email" placeholder="email@example.com" value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text" placeholder={t("recipientName")} value={newName}
                onChange={e => setNewName(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={addRecipient} disabled={adding || !newEmail}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
            >
              {adding ? tCommon("loading") : t("addRecipient")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            <Plus className="w-4 h-4" /> {t("addRecipient")}
          </button>
        )}
      </section>

      {/* Customer-side toggles */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("customerEmails")}</h2>
        <div className="bg-white border border-gray-200 rounded-2xl">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">{t("customerEmailsHelp")}</span>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {CUSTOMER_TOGGLES.map(it => (
              <ToggleRow
                key={it.key}
                label={t(it.tk)}
                checked={customer[it.key]}
                onChange={(v) => updateCustomer({ [it.key]: v } as Partial<CustomerToggles>)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function RecipientCard({
  recipient, isOpen, onToggleOpen, onUpdate, onRemove,
}: {
  recipient: Recipient;
  isOpen: boolean;
  onToggleOpen: () => void;
  onUpdate: (patch: Partial<Recipient>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={onToggleOpen}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition"
      >
        <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-800 flex-1 text-left truncate">{recipient.email}</span>
        {!onRemove && <Lock className="w-3.5 h-3.5 text-gray-300" aria-label="Owner email" />}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          <ToggleGroup groupKey="confirmations" items={CONFIRMATION_TOGGLES} recipient={recipient} onUpdate={onUpdate} />
          <ToggleGroup groupKey="operational"   items={OPERATIONAL_TOGGLES}  recipient={recipient} onUpdate={onUpdate} />
          <ToggleGroup groupKey="system"        items={SYSTEM_TOGGLES}       recipient={recipient} onUpdate={onUpdate} />

          {onRemove && (
            <RemoveButton onRemove={onRemove} />
          )}
        </div>
      )}
    </div>
  );
}

function ToggleGroup({
  groupKey, items, recipient, onUpdate,
}: {
  groupKey: string;
  items: { key: keyof Recipient; tk: string }[];
  recipient: Recipient;
  onUpdate: (patch: Partial<Recipient>) => void;
}) {
  const t = useTranslations("admin.notifications");
  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{t(groupKey)}</div>
      <div className="space-y-1.5">
        {items.map(it => (
          <ToggleRow
            key={String(it.key)}
            label={t(it.tk)}
            checked={!!recipient[it.key]}
            onChange={(v) => onUpdate({ [it.key]: v } as Partial<Recipient>)}
          />
        ))}
      </div>
    </div>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const tCommon = useTranslations("common");
  return (
    <div className="pt-2 border-t border-gray-100">
      <button
        onClick={onRemove}
        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
      >
        <Trash2 className="w-3.5 h-3.5" /> {tCommon("delete")}
      </button>
    </div>
  );
}

function ToggleRow({
  label, checked, onChange, hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700">{label}</div>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </label>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition ${
        checked ? "bg-emerald-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        } mt-0.5`}
      />
    </button>
  );
}
