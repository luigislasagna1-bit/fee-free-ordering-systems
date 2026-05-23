"use client";
import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays, Plus, X, Check, Edit2, Trash2, Settings,
  Users, Clock, Phone, Mail, FileText, Table2, Loader2,
  ChevronDown, Save, AlertCircle, RefreshCw, Search,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReservationTable { id: string; name: string; number?: number; section?: string; capacity: number; isActive: boolean; sortOrder: number }
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

// ─── Table Form Modal ─────────────────────────────────────────────────────────

function TableFormModal({ table, onClose, onSaved }: {
  table?: ReservationTable; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !table;
  const [form, setForm] = useState({
    name:     table?.name     ?? "",
    number:   table?.number   ?? "",
    section:  table?.section  ?? "",
    capacity: table?.capacity ?? 4,
    isActive: table?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const url = isNew ? "/api/admin/reservation-tables" : `/api/admin/reservation-tables/${table!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed");
      toast.success(isNew ? "Table added" : "Table updated");
      onSaved();
    } catch { toast.error("Failed to save table"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isNew ? "Add Table" : "Edit Table"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Table Name *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="e.g. Table 1, Booth A" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="e.g. 1" value={form.number}
                onChange={e => setForm(f => ({ ...f, number: e.target.value as any }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="e.g. Indoor, Patio" value={form.section}
                onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (guests)</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.isActive ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}>
            <Check className="w-4 h-4" /> {form.isActive ? "Active" : "Inactive"}
          </button>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Saving..." : isNew ? "Add Table" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reservation Form Modal ───────────────────────────────────────────────────

function ReservationFormModal({ tables, reservation, onClose, onSaved }: {
  tables: ReservationTable[];
  reservation?: Reservation;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    tableId:       reservation?.table?.id     ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.customerName.trim()) { toast.error("Customer name required"); return; }
    setSaving(true);
    try {
      const url = isNew ? "/api/admin/reservations" : `/api/admin/reservations/${reservation!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const body = isNew ? form : { tableId: form.tableId, notes: form.notes, durationMinutes: form.durationMinutes };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      toast.success(isNew ? "Reservation created" : "Reservation updated");
      onSaved();
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const activeTables = tables.filter(t => t.isActive);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isNew ? "New Reservation" : "Edit Reservation"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="Full name" value={form.customerName} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="+1 (555) 000-0000" value={form.customerPhone} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="email@example.com" value={form.customerEmail} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" min={today} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.date} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
              <input type="time" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.time} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Party Size *</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.partySize} disabled={!isNew}
                onChange={e => setForm(f => ({ ...f, partySize: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input type="number" min="30" step="15" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.durationMinutes}
                onChange={e => setForm(f => ({ ...f, durationMinutes: parseInt(e.target.value) || 90 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Table</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.tableId}
                onChange={e => setForm(f => ({ ...f, tableId: e.target.value }))}>
                <option value="">No table assigned</option>
                {activeTables.map(t => (
                  <option key={t.id} value={t.id}>{t.section ? `${t.section} - ` : ""}{t.name} (cap. {t.capacity})</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Notes</label>
              <textarea rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                placeholder="Any special requests..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Saving..." : isNew ? "Create Reservation" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reservations List Tab ────────────────────────────────────────────────────

function ReservationsTab({ tables }: { tables: ReservationTable[] }) {
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
    toast.success(`Status updated to ${STATUS_LABELS[status] ?? status}`);
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
    if (!confirm("Delete this reservation?")) return;
    await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
    toast.success("Reservation deleted");
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
          <button onClick={() => setFilterDate("")} className="text-xs text-gray-500 hover:text-gray-700 px-2">All dates</button>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input className="border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="Search name or code…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setModal({})}
            className="ml-auto flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600">
            <Plus className="w-4 h-4" /> New Reservation
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No reservations found</p>
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
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{r.date} {r.time}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{r.partySize} guests</span>
                      {r.table && <span className="flex items-center gap-1"><Table2 className="w-3.5 h-3.5" />{r.table.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); setModal({ reservation: r }); }}
                      className="p-1.5 text-gray-400 hover:text-blue-500 rounded"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteReservation(r.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
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
            <div className="flex items-center gap-2 text-gray-700"><Clock className="w-3.5 h-3.5 text-gray-400" />{detail.date} at {detail.time} ({detail.durationMinutes} min)</div>
            <div className="flex items-center gap-2 text-gray-700"><Users className="w-3.5 h-3.5 text-gray-400" />{detail.partySize} guests</div>
            {detail.table && <div className="flex items-center gap-2 text-gray-700"><Table2 className="w-3.5 h-3.5 text-gray-400" />{detail.table.name}{detail.table.section ? ` (${detail.table.section})` : ""}</div>}
          </div>

          {detail.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Customer Notes</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{detail.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Staff Notes</p>
            {staffNoteEditing?.id === detail.id ? (
              <div className="space-y-1.5">
                <textarea rows={2} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                  value={staffNoteEditing.note}
                  onChange={e => setStaffNoteEditing({ ...staffNoteEditing, note: e.target.value })} />
                <div className="flex gap-2">
                  <button onClick={saveStaffNote} className="px-3 py-1 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600">Save</button>
                  <button onClick={() => setStaffNoteEditing(null)} className="px-3 py-1 text-gray-500 text-xs hover:text-gray-700">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setStaffNoteEditing({ id: detail.id, note: detail.staffNotes ?? "" })}
                className="w-full text-left text-sm text-gray-500 bg-gray-50 rounded-lg p-2 hover:bg-gray-100 transition min-h-[40px]">
                {detail.staffNotes || <span className="text-gray-400 italic">Click to add staff notes…</span>}
              </button>
            )}
          </div>

          {/* Status actions */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Change Status</p>
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

          {/* Assign table */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Assign Table</p>
            <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={detail.table?.id ?? ""}
              onChange={async e => {
                await fetch(`/api/admin/reservations/${detail.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tableId: e.target.value }),
                });
                load();
              }}>
              <option value="">No table</option>
              {tables.filter(t => t.isActive).map(t => (
                <option key={t.id} value={t.id}>{t.section ? `${t.section} - ` : ""}{t.name} (cap. {t.capacity})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {modal !== null && (
        <ReservationFormModal tables={tables} reservation={modal.reservation}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

// ─── Tables Tab ───────────────────────────────────────────────────────────────

function TablesTab() {
  const [tables, setTables] = useState<ReservationTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ table?: ReservationTable } | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/reservation-tables");
    if (res.ok) setTables(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deleteTable = async (id: string) => {
    if (!confirm("Delete this table? Active reservations will be unlinked.")) return;
    await fetch(`/api/admin/reservation-tables/${id}`, { method: "DELETE" });
    toast.success("Table deleted");
    load();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await fetch(`/api/admin/reservation-tables/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }),
    });
    load();
  };

  const sections = [...new Set(tables.map(t => t.section || "General"))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{tables.length} table{tables.length !== 1 ? "s" : ""} configured</p>
        <button onClick={() => setModal({})}
          className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600">
          <Plus className="w-4 h-4" /> Add Table
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Table2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tables yet</p>
          <p className="text-sm mt-1">Add your first table to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(section => (
            <div key={section}>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">{section}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {tables.filter(t => (t.section || "General") === section).map(t => (
                  <div key={t.id} className={`bg-white border rounded-xl p-4 ${t.isActive ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{t.name}</div>
                        {t.number && <div className="text-xs text-gray-400">#{t.number}</div>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setModal({ table: t })} className="p-1 text-gray-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteTable(t.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500"><Users className="w-3 h-3 inline mr-1" />{t.capacity} guests</span>
                      <button onClick={() => toggleActive(t.id, !t.isActive)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition ${t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <TableFormModal table={modal.table} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ResSettings>({
    minNoticeHours: 2, maxAdvanceDays: 30, slotLengthMinutes: 30,
    maxPerSlot: 10, minGuests: 1, maxGuests: 20,
    autoConfirm: true, allowPreOrder: false, holdMinutes: 15,
    requireDeposit: false, depositAmount: 0,
    cancellationPolicy: "", reservationHours: "{}", blackoutDates: "[]",
  });
  const [hours, setHours] = useState<Record<number, { enabled: boolean; open: string; close: string }>>(
    Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, { enabled: d >= 1 && d <= 5, open: "10:00", close: "22:00" }]))
  );
  const [blackouts, setBlackouts] = useState<string[]>([]);
  const [newBlackout, setNewBlackout] = useState("");

  useEffect(() => {
    fetch("/api/admin/reservation-settings").then(r => r.json()).then(d => {
      setForm(d);
      try { const h = JSON.parse(d.reservationHours || "{}"); if (Object.keys(h).length) setHours(h); } catch {}
      try { setBlackouts(JSON.parse(d.blackoutDates || "[]")); } catch {}
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/reservation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, reservationHours: hours, blackoutDates: blackouts }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Settings saved");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Reservation Behavior</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoConfirm}
              onChange={e => setForm(f => ({ ...f, autoConfirm: e.target.checked }))}
              className="mt-1 w-4 h-4 accent-emerald-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">Auto-confirm reservations</div>
              <p className="text-xs text-gray-500 mt-0.5">
                When ON: bookings that fit your rules confirm instantly. When OFF: you accept or reject each one from the Reservations tab.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowPreOrder}
              onChange={e => setForm(f => ({ ...f, allowPreOrder: e.target.checked }))}
              className="mt-1 w-4 h-4 accent-emerald-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">Allow guests to pre-order their food when booking</div>
              <p className="text-xs text-gray-500 mt-0.5">
                Customers can add menu items to their reservation. Their items appear on the kitchen display when they arrive.
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Booking Rules</h3>
        <div className="grid grid-cols-2 gap-4">
          {([
            ["minNoticeHours", "Min Notice (hours)", "How many hours in advance reservations must be made"],
            ["maxAdvanceDays", "Max Advance (days)", "How many days ahead customers can book"],
            ["slotLengthMinutes", "Time Slot (min)", "Length of each booking slot"],
            ["maxPerSlot", "Max per Slot", "Maximum reservations per time slot"],
            ["minGuests", "Min Guests", "Smallest party size customers can book"],
            ["maxGuests", "Max Guests", "Largest party size customers can book"],
            ["holdMinutes", "Hold table when late (min)", "How long the table is held past the reservation time"],
          ] as [keyof ResSettings, string, string][]).map(([key, label, hint]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="number" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form[key] as number}
                onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))} />
              <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Deposit</h3>
        <div className="flex items-center gap-4">
          <button onClick={() => setForm(f => ({ ...f, requireDeposit: !f.requireDeposit }))}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${form.requireDeposit ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600"}`}>
            {form.requireDeposit ? "Deposit Required ✓" : "No Deposit Required"}
          </button>
          {form.requireDeposit && (
            <div className="relative w-40">
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
              <input type="number" min="0" step="0.01" className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="0.00" value={form.depositAmount}
                onChange={e => setForm(f => ({ ...f, depositAmount: parseFloat(e.target.value) || 0 }))} />
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation Policy</label>
          <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
            placeholder="e.g. Free cancellation up to 24 hours before your reservation…"
            value={form.cancellationPolicy}
            onChange={e => setForm(f => ({ ...f, cancellationPolicy: e.target.value }))} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Reservation Hours</h3>
        <p className="text-xs text-gray-400">Set which hours reservations can be made each day.</p>
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="flex items-center gap-3">
            <button onClick={() => setHours(h => ({ ...h, [d]: { ...h[d], enabled: !h[d].enabled } }))}
              className={`w-16 text-xs font-medium py-1 rounded-lg border transition ${hours[d]?.enabled ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-400"}`}>
              {DAY_NAMES[d]}
            </button>
            {hours[d]?.enabled ? (
              <>
                <input type="time" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={hours[d]?.open ?? "10:00"}
                  onChange={e => setHours(h => ({ ...h, [d]: { ...h[d], open: e.target.value } }))} />
                <span className="text-gray-400 text-sm">to</span>
                <input type="time" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={hours[d]?.close ?? "22:00"}
                  onChange={e => setHours(h => ({ ...h, [d]: { ...h[d], close: e.target.value } }))} />
              </>
            ) : (
              <span className="text-sm text-gray-400">Closed</span>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Blackout Dates</h3>
        <p className="text-xs text-gray-400">Reservations cannot be made on these dates.</p>
        <div className="flex gap-2">
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={newBlackout} onChange={e => setNewBlackout(e.target.value)} />
          <button onClick={() => { if (newBlackout && !blackouts.includes(newBlackout)) { setBlackouts(b => [...b, newBlackout].sort()); setNewBlackout(""); } }}
            className="flex items-center gap-1.5 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg hover:bg-gray-700">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {blackouts.map(d => (
            <span key={d} className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-1 rounded-full">
              {d}
              <button onClick={() => setBlackouts(b => b.filter(x => x !== d))} className="hover:text-red-900"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "reservations" | "tables" | "settings";

export function ReservationsClient() {
  const [activeTab, setActiveTab] = useState<Tab>("reservations");
  const [tables, setTables] = useState<ReservationTable[]>([]);

  useEffect(() => {
    fetch("/api/admin/reservation-tables").then(r => r.ok ? r.json() : []).then(setTables);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Table Reservations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage bookings, tables, and reservation settings</p>
        </div>
      </div>

      {/* Per-tab accent colors — Luigi's UAT note: mono-color tabs are
          confusing, each surface deserves its own scannable identity.
          Reservations = sky (future/calendar), Tables = emerald
          (current floor layout), Settings = slate-900 (config). */}
      <div className="flex border-b border-gray-200 mb-5">
        {([
          ["reservations", "Reservations", CalendarDays, "border-sky-500",     "text-sky-700",     "bg-sky-50",     "text-sky-500"    ],
          ["tables",       "Tables",       Table2,       "border-emerald-500", "text-emerald-700", "bg-emerald-50", "text-emerald-500"],
          ["settings",     "Settings",     Settings,     "border-slate-900",   "text-slate-900",   "bg-slate-100",  "text-slate-600"  ],
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
        {activeTab === "reservations" && <ReservationsTab tables={tables} />}
        {activeTab === "tables"       && <TablesTab />}
        {activeTab === "settings"     && <SettingsTab />}
      </div>
    </div>
  );
}
