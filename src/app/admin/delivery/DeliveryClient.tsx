"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import {
  Plus, Trash2, Edit2, X, Check, MapPin, Loader2, Eye, EyeOff,
  ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";
import NextLink from "next/link";
import { useTranslations } from "next-intl";

const DeliveryMap = dynamic(() => import("./DeliveryMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-xl">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
    </div>
  ),
});

const ZONE_COLORS = [
  "#10b981", // orange
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ef4444", // red
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#ec4899", // pink
];

type Zone = {
  id: string;
  name: string;
  color: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  isActive: boolean;
  sortOrder: number;
};

type Restaurant = {
  lat: number | null;
  lng: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  name: string | null;
  mapProvider?: "leaflet" | "google";
  googleMapsApiKey?: string | null;
};

const emptyForm = {
  name: "",
  color: ZONE_COLORS[0],
  radiusKm: 5,
  deliveryFee: 0,
  minimumOrder: 0,
  estimatedMinutes: 30,
};

// A coordinate is "set" when it's a non-null, non-zero-island value.
function hasValidCoords(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && !(lat === 0 && lng === 0);
}

export function DeliveryClient({
  zones: initial,
  restaurant,
}: {
  zones: Zone[];
  restaurant: Restaurant | null;
}) {
  const router = useRouter();
  const t = useTranslations("admin.delivery");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
  const [zones, setZones] = useState<Zone[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  // Use null (not 0) when there's no saved location — this prevents the map
  // from treating (0, 0) as a real coordinate and zooming to the null island.
  const [restaurantLat, setRestaurantLat] = useState<number | null>(
    hasValidCoords(restaurant?.lat ?? null, restaurant?.lng ?? null)
      ? restaurant!.lat
      : null
  );
  const [restaurantLng, setRestaurantLng] = useState<number | null>(
    hasValidCoords(restaurant?.lat ?? null, restaurant?.lng ?? null)
      ? restaurant!.lng
      : null
  );

  const locationSet = hasValidCoords(restaurantLat, restaurantLng);

  const reload = async () => {
    const res = await fetch("/api/restaurants/delivery");
    if (res.ok) setZones(await res.json());
  };

  // ── Geocode from profile address ──────────────────────────────────────────
  const geocodeRestaurant = async () => {
    if (!restaurant) return;
    const addr = [restaurant.address, restaurant.city, restaurant.state, restaurant.zip]
      .filter(Boolean)
      .join(", ");
    if (!addr) {
      toast.error("No address set. Please complete your Restaurant Profile first.");
      return;
    }
    setGeolocating(true);
    try {
      const encoded = encodeURIComponent(addr);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
        { headers: { "User-Agent": "FeeFreeOrderingSystems/1.0" } }
      );
      const data = await res.json();
      if (!data.length) {
        toast.error("Could not find this address. Update your address in Restaurant Profile and try again.");
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      setRestaurantLat(lat);
      setRestaurantLng(lng);

      // Persist to DB so Delivery Zones page always loads with correct coords
      await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      toast.success("Restaurant location pinned on map!");
    } catch {
      toast.error("Geocoding failed. Check your internet connection.");
    }
    setGeolocating(false);
  };

  // ── Restaurant marker drag ────────────────────────────────────────────────
  const handleRestaurantMove = async (lat: number, lng: number) => {
    setRestaurantLat(lat);
    setRestaurantLng(lng);
    // Persist updated pin position
    await fetch("/api/restaurants/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    toast.success("Restaurant location updated!");
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Zone name is required"); return; }
    if (!locationSet) {
      toast.error("Set your restaurant location first (zones are concentric circles around it).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          color: form.color,
          radiusKm: parseFloat(String(form.radiusKm)) || 5,
          deliveryFee: parseFloat(String(form.deliveryFee)) || 0,
          minimumOrder: parseFloat(String(form.minimumOrder)) || 0,
          estimatedMinutes: parseInt(String(form.estimatedMinutes)) || 30,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast.success(`Zone "${form.name}" added!`);
      setForm({ ...emptyForm, color: ZONE_COLORS[zones.length % ZONE_COLORS.length] });
      setShowAddForm(false);
      await reload();
      // Re-render the server layout so loadSetupProgress() runs again —
      // this is what makes the floating GuidedSetupPill auto-advance
      // from "Working on: Delivery zones" to "Next: <whatever's next>"
      // the moment the first zone is saved.
      router.refresh();
    } catch (e: any) { toast.error(e.message || "Failed to save zone"); }
    setSaving(false);
  };

  const updateZone = async (id: string, data: Partial<Zone>) => {
    const res = await fetch(`/api/restaurants/delivery/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Failed to update zone"); return; }
    await reload();
  };

  const deleteZone = async (id: string, name: string) => {
    if (!confirm(`Delete delivery zone "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/restaurants/delivery/${id}`, { method: "DELETE" });
    toast.success("Zone deleted");
    if (expandedZone === id) setExpandedZone(null);
    await reload();
  };

  const toggleActive = async (zone: Zone) => {
    await updateZone(zone.id, { isActive: !zone.isActive });
  };

  const nextColor = () => ZONE_COLORS[zones.length % ZONE_COLORS.length];

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-4rem)] -m-6 overflow-hidden">
      {/* ── Map panel ── */}
      <div className="flex-1 relative min-h-[300px] lg:min-h-0">

        {/* No-location warning overlay */}
        {!locationSet && (
          <div className="absolute inset-x-0 top-0 z-[1001] pointer-events-none">
            <div className="m-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 shadow-md pointer-events-auto">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Restaurant location not set</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Delivery zones need your restaurant's coordinates as their origin.{" "}
                  <NextLink href="/admin/profile" className="underline font-medium hover:text-amber-900">
                    Set it in Restaurant Profile
                  </NextLink>{" "}
                  or use the button below to geocode your current address.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Map toolbar */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2" style={{ top: locationSet ? 12 : 90 }}>
          {/* Show "Locate Restaurant" when no location is set */}
          {!locationSet && (
            <button
              onClick={geocodeRestaurant}
              disabled={geolocating}
              className="flex items-center gap-1.5 bg-white text-sm font-medium px-3 py-2 rounded-lg shadow-md border border-gray-200 hover:border-emerald-400 transition disabled:opacity-60"
            >
              {geolocating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <MapPin className="w-3.5 h-3.5 text-emerald-500" />}
              {geolocating ? "Locating…" : "Locate Restaurant"}
            </button>
          )}

          {/* Show "Re-locate" when location is already set */}
          {locationSet && (
            <button
              onClick={geocodeRestaurant}
              disabled={geolocating}
              className="flex items-center gap-1.5 bg-white text-xs px-2 py-1.5 rounded-lg shadow border border-gray-200 hover:border-emerald-300 transition text-gray-600 disabled:opacity-60"
            >
              {geolocating
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <MapPin className="w-3 h-3" />}
              Re-locate
            </button>
          )}

        </div>

        <DeliveryMap
          restaurantLat={restaurantLat}
          restaurantLng={restaurantLng}
          zones={zones}
          selectedZoneId={expandedZone}
          onZoneClick={(id) => setExpandedZone((prev) => (prev === id ? null : id))}
          onRestaurantMove={handleRestaurantMove}
          /** Drag-to-resize via the edge handle. Optimistically updates
           *  the local zone state for immediate visual feedback while
           *  the PATCH request flies; if the PATCH fails (network blip),
           *  the next updateZone refresh corrects it on the server side. */
          onZoneResize={(id, newRadiusKm) => {
            setZones((current) =>
              current.map((z) => (z.id === id ? { ...z, radiusKm: newRadiusKm } : z))
            );
            updateZone(id, { radiusKm: newRadiusKm });
          }}
          provider={restaurant?.mapProvider ?? "leaflet"}
          googleMapsApiKey={restaurant?.googleMapsApiKey ?? undefined}
        />
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-80 xl:w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">{t("title")}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {zones.filter((z) => z.isActive).length} {tCommon("active")}
            </p>
          </div>
          <button
            onClick={() => {
              setShowAddForm(true);
              setForm({ ...emptyForm, color: nextColor() });
            }}
            className="flex items-center gap-1.5 bg-emerald-500 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-emerald-600 transition"
          >
            <Plus className="w-4 h-4" /> {t("newZone")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Add zone form */}
          {showAddForm && (
            <div className="border-b border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-900">{t("newZone")}</h2>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("zoneName")}</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>

                {/* Color picker */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("color")}</label>
                  <div className="flex gap-2 flex-wrap">
                    {ZONE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("radius")}</label>
                    <input
                      type="number" min="0.5" step="0.5"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={form.radiusKm}
                      onChange={(e) => setForm((f) => ({ ...f, radiusKm: parseFloat(e.target.value) || 5 }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("deliveryFee")}</label>
                    <input
                      type="number" min="0" step="0.50"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={form.deliveryFee}
                      onChange={(e) => setForm((f) => ({ ...f, deliveryFee: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("minimumOrder")}</label>
                    <input
                      type="number" min="0" step="1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={form.minimumOrder}
                      onChange={(e) => setForm((f) => ({ ...f, minimumOrder: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("estimatedMinutes")}</label>
                    <input
                      type="number" min="0" step="5"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={form.estimatedMinutes}
                      onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: parseInt(e.target.value) || 30 }))}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex-1 bg-emerald-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-emerald-600 transition disabled:opacity-60"
                  >
                    {saving ? tCommon("loading") : t("newZone")}
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-3 text-sm text-gray-500 hover:text-gray-700"
                  >
                    {tCommon("cancel")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Zone list */}
          {zones.length === 0 && !showAddForm ? (
            <div className="p-8 text-center text-gray-400">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">{t("noZones")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {zones.map((zone) => (
                <ZoneRow
                  key={zone.id}
                  zone={zone}
                  isExpanded={expandedZone === zone.id}
                  onExpand={() => setExpandedZone((prev) => (prev === zone.id ? null : zone.id))}
                  onToggle={() => toggleActive(zone)}
                  onDelete={() => deleteZone(zone.id, zone.name)}
                  onUpdate={(data) => updateZone(zone.id, data)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        {zones.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 bg-gray-50">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Active zone
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Inactive zone
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ZoneRow ──────────────────────────────────────────────────────────────────

function ZoneRow({
  zone, isExpanded, onExpand, onToggle, onDelete, onUpdate,
}: {
  zone: Zone;
  isExpanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (data: Partial<Zone>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: zone.name,
    radiusKm: zone.radiusKm,
    deliveryFee: zone.deliveryFee,
    minimumOrder: zone.minimumOrder,
    estimatedMinutes: zone.estimatedMinutes,
  });
  const [saving, setSaving] = useState(false);

  const saveEdit = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    await onUpdate({
      name: draft.name,
      radiusKm: parseFloat(String(draft.radiusKm)) || zone.radiusKm,
      deliveryFee: parseFloat(String(draft.deliveryFee)) || 0,
      minimumOrder: parseFloat(String(draft.minimumOrder)) || 0,
      estimatedMinutes: parseInt(String(draft.estimatedMinutes)) || 30,
    });
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className={`transition ${isExpanded ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
      {/* Zone header row */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onExpand}>
        <div
          className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white shadow"
          style={{ backgroundColor: zone.isActive ? zone.color : "#9ca3af" }}
        />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${zone.isActive ? "text-gray-900" : "text-gray-400"}`}>
            {zone.name}
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-3 mt-0.5">
            <span>${zone.deliveryFee.toFixed(2)} fee</span>
            {zone.minimumOrder > 0 && <span>min ${zone.minimumOrder.toFixed(2)}</span>}
            <span>{zone.radiusKm} km</span>
            <span>~{zone.estimatedMinutes} min</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title={zone.isActive ? "Deactivate" : "Activate"}
            className={`p-1 rounded transition ${zone.isActive ? "text-green-500 hover:text-green-700" : "text-gray-300 hover:text-green-500"}`}
          >
            {zone.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-emerald-100">
          {!editing ? (
            <div className="pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2 border border-gray-100">
                  <div className="text-gray-400">Radius</div>
                  <div className="font-semibold text-gray-900">{zone.radiusKm} km</div>
                </div>
                <div className="bg-white rounded-lg p-2 border border-gray-100">
                  <div className="text-gray-400">Delivery Fee</div>
                  <div className="font-semibold text-gray-900">${zone.deliveryFee.toFixed(2)}</div>
                </div>
                <div className="bg-white rounded-lg p-2 border border-gray-100">
                  <div className="text-gray-400">Min. Order</div>
                  <div className="font-semibold text-gray-900">${zone.minimumOrder.toFixed(2)}</div>
                </div>
                <div className="bg-white rounded-lg p-2 border border-gray-100">
                  <div className="text-gray-400">Std. Time</div>
                  <div className="font-semibold text-gray-900">~{zone.estimatedMinutes} min</div>
                </div>
                <div className="bg-white rounded-lg p-2 border border-gray-100 col-span-2">
                  <div className="text-gray-400">Status</div>
                  <div className={`font-semibold ${zone.isActive ? "text-green-600" : "text-gray-400"}`}>
                    {zone.isActive ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setDraft({ name: zone.name, radiusKm: zone.radiusKm, deliveryFee: zone.deliveryFee, minimumOrder: zone.minimumOrder, estimatedMinutes: zone.estimatedMinutes });
                    setEditing(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={onToggle}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  {zone.isActive
                    ? <><EyeOff className="w-3.5 h-3.5" /> Deactivate</>
                    : <><Eye className="w-3.5 h-3.5" /> Activate</>}
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-3 space-y-2">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Zone name"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Radius (km)</label>
                  <input
                    type="number" min="0.5" step="0.5"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={draft.radiusKm}
                    onChange={(e) => setDraft((d) => ({ ...d, radiusKm: parseFloat(e.target.value) || 5 }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Fee ($)</label>
                  <input
                    type="number" min="0" step="0.50"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={draft.deliveryFee}
                    onChange={(e) => setDraft((d) => ({ ...d, deliveryFee: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Min ($)</label>
                  <input
                    type="number" min="0" step="1"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={draft.minimumOrder}
                    onChange={(e) => setDraft((d) => ({ ...d, minimumOrder: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Std. Time (min)</label>
                  <input
                    type="number" min="0" step="5"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={draft.estimatedMinutes}
                    onChange={(e) => setDraft((d) => ({ ...d, estimatedMinutes: parseInt(e.target.value) || 30 }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-emerald-600 transition disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
