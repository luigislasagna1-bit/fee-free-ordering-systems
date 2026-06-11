"use client";
import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays, Plus, X, Edit2, Trash2, Settings,
  Users, Clock, Phone, Mail, Table2, Loader2, Save,
  RefreshCw, Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { formatTime, type HoursFormat } from "@/lib/format-time";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reservation {
  id: string; confirmationCode: string; status: string;
  customerName: string; customerEmail?: string; customerPhone?: string;
  partySize: number; date: string; time: string; durationMinutes: number;
  notes?: string; staffNotes?: string; depositPaid: boolean; depositAmount: number;
  table?: { id: string; name: string; section?: string };
  createdAt: string;
}
interface ResSettings {
  minNoticeHours: number; maxAdvanceDays: number; slotLengthMinutes: number;
  maxPerSlot: number; minGuests: number; maxGuests: number;
  autoConfirm: boolean; allowPreOrder: boolean; holdMinutes: number;
  requireDeposit: boolean; depositAmount: number;
  cancellationPolicy: string; reservationHours: string; blackoutDates: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  seated:    "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  no_show:   "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", seated: "Seated",
  completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Reservation Form Modal ───────────────────────────────────────────────────

function ReservationFormModal({ reservation, onClose, onSaved }: {
  reservation?: Reservation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.reservationsList");
  const isNew = !reservation;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    customerName:  reservation?.customerName  ?? "",
    customerEmail: reservation?.customerEmail ?? "",
    customerPhone: reservation?.customerPhone ?? "",
    partySize:     reservation?.partySize     ?? 2,
    date:          reservation?.date          ?? today,
    time:          reservation?.time          ?? "19:00",
    durationMinutes: reservation?.durationMinutes ?? 90,
    notes:         reservation?.notes         ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.customerName.trim()) { toast.error(t("errorCustomerNameRequired")); return; }
    setSaving(true);
    try {
      const url = isNew ? "/api/admin/reservations" : `/api/admin/reservations/${reservation!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const body = isNew ? form : { notes: form.notes, durationMinutes: form.durationMinutes };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      toast.success(isNew ? t("toastReservationCreated") : t("toastReservationUpdated"));
      onSaved();
    } catch { toast.error(t("errorFailedToSave")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isNew ? t("modalTitleNew") : t("modalTitleEdit")}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelCustomerName")}</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder={t("placeholderFullName")} value={form.customerName} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelPhone")}</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder={t("placeholderPhone")} value={form.customerPhone} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelEmail")}</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder={t("placeholderEmail")} value={form.customerEmail} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelDate")}</label>
              <input type="date" min={today} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.date} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelTime")}</label>
              <input type="time" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.time} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelPartySize")}</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.partySize} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, partySize: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelDuration")}</label>
              <input type="number" min="30" step="15" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.durationMinutes}
                onChange={e => setForm(f => ({ ...f, durationMinutes: parseInt(e.target.value) || 90 }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("labelCustomerNotes")}</label>
              <textarea rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                placeholder={t("placeholderSpecialRequests")} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">{t("buttonCancel")}</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? t("buttonSaving") : isNew ? t("buttonCreateReservation") : t("buttonSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reservations List Tab ────────────────────────────────────────────────────

function ReservationsTab({ hoursFormat }: { hoursFormat: HoursFormat }) {
  const t = useTranslations("admin.reservationsList");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ reservation?: Reservation } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [staffNoteEditing, setStaffNoteEditing] = useState<{ id: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDate) params.set("date", filterDate);
    if (filterStatus !== "all") params.set("status", filterStatus);
    const res = await fetch(`/api/admin/reservations?${params}`);
    if (res.ok) setReservations(await res.json());
    setLoading(false);
  }, [filterDate, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast.success(t("toastStatusUpdated", { status: STATUS_LABELS[status] ?? status }));
    load();
  };

  const saveStaffNote = async () => {
    if (!staffNoteEditing) return;
    await fetch(`/api/admin/reservations/${staffNoteEditing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffNotes: staffNoteEditing.note }),
    });
    setStaffNoteEditing(null);
    load();
  };

  const deleteReservation = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
    toast.success(t("toastReservationDeleted"));
    load();
  };

  const filtered = reservations.filter(r =>
    !search || r.customerName.toLowerCase().includes(search.toLowerCase())
      || r.confirmationCode.toLowerCase().includes(search.toLowerCase())
      || r.customerPhone?.includes(search)
  );

  const detail = detailId ? filtered.find(r => r.id === detailId) : null;

  return (
    <div className="flex gap-4 h-full">
      {/* List */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          <button onClick={() => setFilterDate("")} className="text-xs text-gray-500 hover:text-gray-700 px-2">{t("filterAllDates")}</button>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">{t("filterAllStatuses")}</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input className="border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("placeholderSearch")} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setModal({})}
            className="ml-auto flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600">
            <Plus className="w-4 h-4" /> {t("buttonNewReservation")}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t("emptyNoReservations")}</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {filtered.map(r => (
              <div key={r.id}
                onClick={() => setDetailId(detailId === r.id ? null : r.id)}
                className={`bg-white border rounded-xl p-4 cursor-pointer hover:border-emerald-200 transition ${detailId === r.id ? "border-emerald-400 shadow-sm" : "border-gray-100"}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{r.customerName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">#{r.confirmationCode}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{r.date} {formatTime(r.time, hoursFormat)}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{t("guests", { n: r.partySize })}</span>
                      {r.table && <span className="flex items-center gap-1"><Table2 className="w-3.5 h-3.5" />{r.table.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); setModal({ reservation: r }); }}
                      className="p-2.5 text-gray-400 hover:text-blue-500 rounded-lg touch-manipulation"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteReservation(r.id); }}
                      className="p-2.5 text-gray-400 hover:text-red-500 rounded-lg touch-manipulation"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detail && (
        <div className="w-80 flex-shrink-0 bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4 overflow-y-auto self-start sticky top-0">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900">{detail.customerName}</h3>
              <span className="text-xs font-mono text-gray-500">#{detail.confirmationCode}</span>
            </div>
            <button onClick={() => setDetailId(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-1 text-sm">
            {detail.customerPhone && <div className="flex items-center gap-2 text-gray-700"><Phone className="w-3.5 h-3.5 text-gray-400" />{detail.customerPhone}</div>}
            {detail.customerEmail && <div className="flex items-center gap-2 text-gray-700"><Mail className="w-3.5 h-3.5 text-gray-400" />{detail.customerEmail}</div>}
            <div className="flex items-center gap-2 text-gray-700"><Clock className="w-3.5 h-3.5 text-gray-400" />{detail.date} at {formatTime(detail.time, hoursFormat)} ({detail.durationMinutes} min)</div>
            <div className="flex items-center gap-2 text-gray-700"><Users className="w-3.5 h-3.5 text-gray-400" />{t("guests", { n: detail.partySize })}</div>
            {detail.table && <div className="flex items-center gap-2 text-gray-700"><Table2 className="w-3.5 h-3.5 text-gray-400" />{detail.table.name}{detail.table.section ? ` (${detail.table.section})` : ""}</div>}
          </div>

          {detail.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">{t("labelCustomerNotes")}</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{detail.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">{t("labelStaffNotes")}</p>
            {staffNoteEditing?.id === detail.id ? (
              <div className="space-y-1.5">
                <textarea rows={2} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                  value={staffNoteEditing.note}
                  onChange={e => setStaffNoteEditing({ ...staffNoteEditing, note: e.target.value })} />
                <div className="flex gap-2">
                  <button onClick={saveStaffNote} className="px-3 py-1 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600">{t("buttonSave")}</button>
                  <button onClick={() => setStaffNoteEditing(null)} className="px-3 py-1 text-gray-500 text-xs hover:text-gray-700">{t("buttonCancel")}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setStaffNoteEditing({ id: detail.id, note: detail.staffNotes ?? "" })}
                className="w-full text-left text-sm text-gray-500 bg-gray-50 rounded-lg p-2 hover:bg-gray-100 transition min-h-[40px]">
                {detail.staffNotes || <span className="text-gray-400 italic">{t("placeholderStaffNotes")}</span>}
              </button>
            )}
          </div>

          {/* Status actions */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">{t("labelChangeStatus")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {["confirmed","seated","completed","cancelled","no_show"].map(s => (
                <button key={s} onClick={() => updateStatus(detail.id, s)}
                  disabled={detail.status === s}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-40 ${detail.status === s ? STATUS_COLORS[s] : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}

      {modal !== null && (
        <ReservationFormModal reservation={modal.reservation}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
//
// GloriaFood-style settings panel (per Luigi's 2026-05-28 redesign). Owners
// configure reservations with seven knobs and nothing else:
//
//   1. Do you offer table reservation?              (Yes / No)
//   2. Minimum guests                               (party size)
//   3. Maximum guests                               (party size)
//   4. Minimum time in advance                      (minutes)
//   5. Maximum time in advance                      (days)
//   6. When guests are late, hold table for         (minutes)
//   7. Allow guests to pre-order their food         (toggle)
//
// Everything else that was on the old panel (auto-confirm logic, slot
// length, max per slot, deposits, cancellation policy, per-day reservation
// hours, blackout dates, custom table layout) has been intentionally
// removed. The Tables tab itself was also dropped 2026-05-28 — GloriaFood
// doesn't expose per-table management, and the kitchen display + the
// reservations list are sufficient floor-management surface.
//
// Defaults match the screenshot Luigi sent:
//   minGuests=2, maxGuests=8, minNoticeMinutes=15, maxAdvanceDays=8,
//   holdMinutes=15, allowPreOrder=false.

interface SimpleSettingsForm {
  acceptsReservations: boolean;
  minGuests: number;
  maxGuests: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  holdMinutes: number;
  /** Customer-facing time-slot interval. 30 = "7:00 PM, 7:30 PM, 8:00
   *  PM, …", 15 = "7:00, 7:15, 7:30 …", 60 = on the hour only.
   *  Persisted as ReservationSettings.slotLengthMinutes — drives the
   *  generateTimeSlots step in ReservationModal. Default 30 matches
   *  the schema default + GloriaFood's out-of-the-box behaviour. */
  slotLengthMinutes: number;
  allowPreOrder: boolean;
  /** Manual vs automatic acceptance. true = reservation arrives with
   *  status="confirmed" (auto-accepted, kitchen shows toast only).
   *  false = arrives with status="pending" (kitchen ring fires
   *  continuously until staff accept/reject). Mirrors the
   *  Restaurant.autoAcceptOrders pattern for ordering. GloriaFood
   *  parity 2026-06-01. */
  autoConfirm: boolean;
}

/** Allowed slot intervals. 5/10/15/20/30/45/60 covers the common
 *  restaurant patterns — fine-grained for high-turnover counter
 *  service (10/15) and coarse for white-tablecloth slots (45/60). */
const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;

function SettingsTab() {
  const t = useTranslations("admin.reservationsList");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SimpleSettingsForm>({
    acceptsReservations: true,
    minGuests: 2,
    maxGuests: 8,
    minNoticeMinutes: 15,
    maxAdvanceDays: 8,
    holdMinutes: 15,
    slotLengthMinutes: 30,
    allowPreOrder: false,
    autoConfirm: true,
  });

  useEffect(() => {
    // Pull current values from the existing /api/admin/reservation-settings
    // endpoint (which still serves the full row) + the restaurant-level
    // acceptsReservations toggle. Only map the fields we still surface.
    Promise.all([
      fetch("/api/admin/reservation-settings").then(r => r.ok ? r.json() : null),
      fetch("/api/restaurants/profile").then(r => r.ok ? r.json() : null),
    ]).then(([s, r]) => {
      setForm(f => ({
        acceptsReservations: r?.acceptsReservations ?? f.acceptsReservations,
        minGuests: s?.minGuests ?? f.minGuests,
        maxGuests: s?.maxGuests ?? f.maxGuests,
        // Prefer minNoticeMinutes when present; fall back to legacy
        // minNoticeHours * 60 for older rows.
        minNoticeMinutes: s?.minNoticeMinutes ?? (s?.minNoticeHours != null ? s.minNoticeHours * 60 : f.minNoticeMinutes),
        maxAdvanceDays: s?.maxAdvanceDays ?? f.maxAdvanceDays,
        holdMinutes: s?.holdMinutes ?? f.holdMinutes,
        slotLengthMinutes: s?.slotLengthMinutes ?? f.slotLengthMinutes,
        allowPreOrder: s?.allowPreOrder ?? f.allowPreOrder,
        autoConfirm: typeof s?.autoConfirm === "boolean" ? s.autoConfirm : f.autoConfirm,
      }));
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Save BOTH settings rows in parallel:
      //   - ReservationSettings row for the GloriaFood-style booking
      //     rules (min/max guests, notice, hold, pre-order, etc).
      //   - Restaurant row for the master acceptsReservations toggle.
      //
      // We also write minNoticeHours = floor(minutes / 60) for
      // backward-compat with any legacy code that still reads the
      // hours field. minNoticeMinutes is the source of truth.
      const minNoticeHours = Math.floor(form.minNoticeMinutes / 60);
      const [resA, resB] = await Promise.all([
        fetch("/api/admin/reservation-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            minGuests: form.minGuests,
            maxGuests: form.maxGuests,
            minNoticeMinutes: form.minNoticeMinutes,
            minNoticeHours,
            maxAdvanceDays: form.maxAdvanceDays,
            holdMinutes: form.holdMinutes,
            slotLengthMinutes: form.slotLengthMinutes,
            allowPreOrder: form.allowPreOrder,
            autoConfirm: form.autoConfirm,
          }),
        }),
        fetch("/api/restaurants/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acceptsReservations: form.acceptsReservations }),
        }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed");
      toast.success(t("toastSettingsSaved"));
    } catch {
      toast.error(t("errorFailedToSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t("buttonSaveSettings")}
        </button>
      </div>

      {/* Acceptance mode — manual vs auto. Mirrors the
          Restaurant.autoAcceptOrders pattern on the ordering side.
          Manual: kitchen ring fires continuously on each new
          reservation until staff hit Accept or Decline. Auto: the
          reservation arrives already confirmed; the kitchen sees a
          one-time toast/chime instead of the alarm loop.
          GloriaFood-parity (Luigi 2026-06-01). Only meaningful when
          acceptsReservations=true, but harmless to leave editable
          either way. */}
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-opacity ${form.acceptsReservations ? "" : "opacity-60"}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{t("headingReservationAcceptance")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {form.autoConfirm
                ? t("descAutoConfirmOn")
                : t("descAutoConfirmOff")}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, autoConfirm: true }))}
              className={`px-4 py-1.5 text-sm font-semibold transition ${
                form.autoConfirm ? "bg-emerald-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("buttonAutomatic")}
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, autoConfirm: false }))}
              className={`px-4 py-1.5 text-sm font-semibold transition ${
                !form.autoConfirm ? "bg-amber-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("buttonManual")}
            </button>
          </div>
        </div>
      </div>

      {/* Master enable toggle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900">{t("headingOfferTableReservation")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("descOfferTableReservation")}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, acceptsReservations: true }))}
              className={`px-4 py-1.5 text-sm font-semibold transition ${
                form.acceptsReservations
                  ? "bg-emerald-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("buttonYes")}
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, acceptsReservations: false }))}
              className={`px-4 py-1.5 text-sm font-semibold transition ${
                !form.acceptsReservations
                  ? "bg-rose-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("buttonNo")}
            </button>
          </div>
        </div>
      </div>

      {/* Booking rules — six numeric knobs + the pre-order toggle. Greyed
          out when acceptsReservations is OFF (still editable so an owner
          can configure first, flip the master switch on later). */}
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-opacity ${
        form.acceptsReservations ? "" : "opacity-60"
      }`}>
        <h3 className="font-semibold text-gray-900 mb-4">{t("headingSettings")}</h3>
        <div className="space-y-4">
          <NumberRow
            label={t("labelMinGuests")}
            unit={t("unitGuests")}
            value={form.minGuests}
            min={1}
            onChange={(v) => setForm(f => ({ ...f, minGuests: v }))}
          />
          <NumberRow
            label={t("labelMaxGuests")}
            unit={t("unitGuests")}
            value={form.maxGuests}
            min={1}
            onChange={(v) => setForm(f => ({ ...f, maxGuests: v }))}
          />
          <NumberRow
            label={t("labelMinNotice")}
            unit={t("unitMin")}
            value={form.minNoticeMinutes}
            min={0}
            onChange={(v) => setForm(f => ({ ...f, minNoticeMinutes: v }))}
          />
          <NumberRow
            label={t("labelMaxAdvance")}
            unit={t("unitDays")}
            value={form.maxAdvanceDays}
            min={1}
            onChange={(v) => setForm(f => ({ ...f, maxAdvanceDays: v }))}
          />
          <NumberRow
            label={t("labelHoldTable")}
            unit={t("unitMin")}
            value={form.holdMinutes}
            min={0}
            onChange={(v) => setForm(f => ({ ...f, holdMinutes: v }))}
          />
          {/* Slot-interval picker. Drives the customer-facing time
              dropdown in ReservationModal — 30 = "7:00, 7:30, 8:00",
              15 = "7:00, 7:15, 7:30 …", 60 = on the hour only.
              Smaller intervals = more booking surface area, larger
              intervals = simpler kitchen flow. Owner picks the trade-
              off. */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <label className="text-sm text-gray-800 block">
                {t("labelSlotInterval")}
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {t("descSlotInterval")}
              </p>
            </div>
            <select
              value={form.slotLengthMinutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, slotLengthMinutes: parseInt(e.target.value, 10) }))
              }
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              {SLOT_INTERVAL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t("optionEveryMinutes", { m })}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm text-gray-800">
                {t("labelAllowPreOrder")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.allowPreOrder}
                onClick={() => setForm(f => ({ ...f, allowPreOrder: !f.allowPreOrder }))}
                className={`relative inline-flex h-6 w-11 rounded-full transition ${
                  form.allowPreOrder ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition mt-0.5 ${
                    form.allowPreOrder ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberRow({
  label, unit, value, min, onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-800">{label}:</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min ?? 0, parseInt(e.target.value) || 0))}
          className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
        <span className="text-xs text-gray-500 w-12">{unit}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "reservations" | "settings";

export function ReservationsClient({ hoursFormat = "24h" }: { hoursFormat?: HoursFormat }) {
  const t = useTranslations("admin.reservationsList");
  const [activeTab, setActiveTab] = useState<Tab>("reservations");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("pageSubtitle")}</p>
        </div>
      </div>

      {/* Per-tab accent colors — Luigi's UAT note: mono-color tabs are
          confusing, each surface deserves its own scannable identity.
          Reservations = sky (future/calendar), Settings = slate-900 (config).
          (Tables tab removed 2026-05-28 per GloriaFood parity.) */}
      <div className="flex border-b border-gray-200 mb-5">
        {([
          ["reservations", t("tabReservations"), CalendarDays, "border-sky-500",   "text-sky-700",   "bg-sky-50",    "text-sky-500"  ],
          ["settings",     t("tabSettings"),     Settings,     "border-slate-900", "text-slate-900", "bg-slate-100", "text-slate-600"],
        ] as [Tab, string, any, string, string, string, string][]).map(([tab, label, Icon, activeBorder, activeText, activeBg, inactiveIcon]) => {
          const isActive = activeTab === tab;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                isActive
                  ? `${activeBorder} ${activeText} ${activeBg}`
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <Icon className={`w-4 h-4 ${isActive ? activeText : inactiveIcon}`} />{label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "reservations" && <ReservationsTab hoursFormat={hoursFormat} />}
        {activeTab === "settings"     && <SettingsTab />}
      </div>
    </div>
  );
}
