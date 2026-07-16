"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Bike, Plus, Loader2, X, Circle, MapPin, Star, Smartphone, Copy, Check, ExternalLink } from "lucide-react";

type Driver = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  hourlyRateCents: number;
  homeRestaurantId: string | null;
  homeRestaurantName: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  ratingPct: number;
  deliveredCount: number;
  cancelledCount: number;
  activeJobs: number;
  hasLocation: boolean;
  lastLocationAt: string | null;
  createdAt: string;
};
type Restaurant = { id: string; name: string };

const emptyForm = { name: "", email: "", phone: "", password: "", homeRestaurantId: "", hourlyRate: "" };

export function DriversClient({
  initialDrivers,
  restaurants,
  driverAppUrl,
}: {
  initialDrivers: Driver[];
  restaurants: Restaurant[];
  driverAppUrl: string;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createDriver() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      toast.error("Name, email, and an 8+ character password are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          homeRestaurantId: form.homeRestaurantId || undefined,
          hourlyRateCents: form.hourlyRate ? Math.round(parseFloat(form.hourlyRate) * 100) : 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Couldn't create driver.");
        return;
      }
      toast.success("Driver created.");
      setForm(emptyForm);
      setShowAdd(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function patchDriver(id: string, body: Record<string, unknown>, okMsg: string) {
    const res = await fetch(`/api/superadmin/drivers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Update failed.");
      return;
    }
    toast.success(okMsg);
    router.refresh();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Delivery Drivers</h1>
            <p className="text-sm text-gray-500">Fee Free Delivery in-house driver pool.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showAdd ? "Cancel" : "New driver"}
        </button>
      </div>

      {/* Where drivers sign in — the standalone /driver PWA. */}
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-emerald-900">Fee Free Delivery app</div>
          <p className="text-xs text-emerald-800/90 mt-0.5">
            One app for both drivers and restaurants. Drivers sign in with the email + password you set (auto-emailed to them on create); restaurant owners open the same link and sign in with their existing dashboard login to assign orders. It installs to the home screen (Add to Home Screen) and works like a native app.
          </p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <code className="text-[13px] font-mono bg-white border border-emerald-200 rounded-lg px-3 py-1.5 text-emerald-900 break-all select-all">
              {driverAppUrl}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(driverAppUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  toast.error("Couldn't copy");
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg px-3 py-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={driverAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg px-3 py-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Add a driver</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email (their login)">
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Temporary password (8+ chars)">
              <input type="text" className="input font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="auto-emailed to the driver on save" />
            </Field>
            <Field label="Phone (optional)">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Home store (optional)">
              <select className="input" value={form.homeRestaurantId} onChange={(e) => setForm({ ...form, homeRestaurantId: e.target.value })}>
                <option value="">— none —</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Hourly rate ($, optional)">
              <input type="number" min="0" step="0.50" className="input" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4">
            <button onClick={createDriver} disabled={saving} className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create driver
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {initialDrivers.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Bike className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No drivers yet. Add your first driver above.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Home store</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Active jobs</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {initialDrivers.map((d) => (
                <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{d.name}</div>
                    <div className="text-xs text-gray-500">{d.email}{d.phone ? ` · ${d.phone}` : ""}</div>
                    {d.hasLocation && (
                      <div className="text-[11px] text-emerald-600 inline-flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> last seen {d.lastLocationAt ? new Date(d.lastLocationAt).toLocaleString() : "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.homeRestaurantName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{d.hourlyRateCents ? `$${(d.hourlyRateCents / 100).toFixed(2)}/hr` : "—"}</td>
                  <td className="px-4 py-3">
                    {d.activeJobs > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" /> {d.activeJobs}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="inline-flex items-center gap-1 font-semibold" title={`${d.deliveredCount} delivered · ${d.cancelledCount} cancelled`}>
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {Math.round(d.ratingPct)}%
                    </span>
                    {d.ratingCount > 0 && (
                      <span className="ml-2 text-xs text-gray-400">{d.ratingAvg?.toFixed(1)}★ ({d.ratingCount})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${d.isActive ? "text-emerald-700" : "text-gray-400"}`}>
                      <Circle className={`w-2 h-2 ${d.isActive ? "fill-emerald-500 text-emerald-500" : "fill-gray-300 text-gray-300"}`} /> {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => patchDriver(d.id, { isActive: !d.isActive }, d.isActive ? "Driver deactivated." : "Driver reactivated.")}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                    >
                      {d.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`.input{width:100%;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem}.input:focus{outline:none;box-shadow:0 0 0 2px #10b981}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
