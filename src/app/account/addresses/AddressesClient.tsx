"use client";
import { useState } from "react";
import { Plus, Trash2, Star, Loader2, MapPin, X, Check } from "lucide-react";

export type SavedAddress = {
  id: string;
  label: string | null;
  street: string;
  city: string;
  state: string | null;
  zip: string | null;
  country: string;
  isDefault: boolean;
};

/**
 * Customer addresses CRUD UI. Server-renders the initial list; all
 * subsequent operations go through /api/customer/addresses[/id].
 *
 * State machine is intentionally simple — we don't optimistic-update.
 * After every successful API call we replace local state with the
 * authoritative server response, which keeps default-flag invariants
 * (only one default) honest without us re-implementing them client-side.
 */
export function AddressesClient({ initial }: { initial: SavedAddress[] }) {
  const [addresses, setAddresses] = useState<SavedAddress[]>(initial);
  const [showAddForm, setShowAddForm] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/customer/addresses");
      if (!res.ok) return;
      const data = await res.json();
      setAddresses(data.addresses);
    } catch {
      // Network blip — keep the local list as-is. Next mutation refresh
      // will catch up.
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {addresses.length === 0 && !showAddForm && (
        <div className="text-center py-12 bg-white border border-gray-100 rounded-2xl">
          <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-4">No addresses saved yet.</p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
          >
            <Plus className="w-4 h-4" />
            Add an address
          </button>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="space-y-3">
          {addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onDelete={async () => {
                if (!confirm("Delete this address?")) return;
                const res = await fetch(`/api/customer/addresses/${a.id}`, { method: "DELETE" });
                if (!res.ok) {
                  setError("Failed to delete.");
                  return;
                }
                await refresh();
              }}
              onSetDefault={async () => {
                const res = await fetch(`/api/customer/addresses/${a.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isDefault: true }),
                });
                if (!res.ok) {
                  setError("Failed to set default.");
                  return;
                }
                await refresh();
              }}
            />
          ))}

          {!showAddForm && addresses.length < 10 && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 rounded-2xl p-4 text-sm font-semibold text-gray-600 hover:text-emerald-700 transition inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add another address
            </button>
          )}
        </div>
      )}

      {showAddForm && (
        <AddAddressForm
          existingCount={addresses.length}
          onCancel={() => {
            setShowAddForm(false);
            setError(null);
          }}
          onSaved={async () => {
            setShowAddForm(false);
            setError(null);
            await refresh();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function AddressCard({
  address, onDelete, onSetDefault,
}: {
  address: SavedAddress;
  onDelete: () => void | Promise<void>;
  onSetDefault: () => void | Promise<void>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 truncate">
                {address.label || "Address"}
              </h3>
              {address.isDefault && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 fill-emerald-700" /> Default
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 mt-1 leading-relaxed">
              {address.street}
              <br />
              {address.city}
              {address.state ? `, ${address.state}` : ""}
              {address.zip ? ` ${address.zip}` : ""}
              {address.country !== "CA" ? ` · ${address.country}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!address.isDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              className="text-xs text-emerald-700 hover:text-emerald-900 hover:underline"
            >
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function AddAddressForm({
  existingCount, onCancel, onSaved, onError,
}: {
  existingCount: number;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    label: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "CA",
    isDefault: existingCount === 0,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    onError(null);
    try {
      const res = await fetch("/api/customer/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data?.error || "Failed to save.");
        setSubmitting(false);
        return;
      }
      await onSaved();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3 ring-2 ring-emerald-50"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 inline-flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-600" />
          New address
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-700 p-1 -m-1"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <Field label="Label (optional)">
        <input
          type="text"
          maxLength={40}
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Home, Work, Mom's place…"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
        />
      </Field>

      <Field label="Street" required>
        <input
          type="text"
          required
          maxLength={200}
          value={form.street}
          onChange={(e) => setForm({ ...form, street: e.target.value })}
          placeholder="123 Main St, Apt 4B"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="City" required>
          <input
            type="text"
            required
            maxLength={100}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </Field>
        <Field label="Province / State">
          <input
            type="text"
            maxLength={80}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            placeholder="ON"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Postal / Zip">
          <input
            type="text"
            maxLength={20}
            value={form.zip}
            onChange={(e) => setForm({ ...form, zip: e.target.value })}
            placeholder="L9E 1C7"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </Field>
        <Field label="Country (ISO-2)">
          <input
            type="text"
            maxLength={2}
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase().slice(0, 2) })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 font-mono uppercase"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          className="rounded text-emerald-600 focus:ring-emerald-500"
        />
        <span>Set as default delivery address</span>
      </label>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting || !form.street || !form.city}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save address</>}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
