"use client";
/**
 * ProfileClient — Restaurant Profile admin page.
 *
 * Location section (new):
 * • Address autocomplete using Nominatim (free, no API key needed).
 *   Searching is debounced 400 ms to respect Nominatim's 1 req/s guideline.
 * • Interactive Leaflet map (ProfileMap, SSR-disabled) with a draggable marker.
 * • "Geocode from address fields" button re-geocodes using the structured fields.
 * • On every Save, if lat/lng are still null, an auto-geocode attempt is made
 *   from the address fields before the PUT so the DB is always up to date.
 *
 * IMPORTANT — sub-component pattern:
 * LocationSection is defined at MODULE level (not inside ProfileClient) so that
 * React never remounts it between renders, avoiding the input-focus-loss bug
 * documented in MEMORY.md.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import {
  Save, Store, Image as ImageIcon, Link as LinkIcon, MapPin,
  Loader2, Search, X, CheckCircle2, AlertTriangle,
} from "lucide-react";
import NextLink from "next/link";
import { ImageUpload } from "@/components/admin/ImageUpload";

// Leaflet must be loaded client-side only
const ProfileMap = dynamic(() => import("./ProfileMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Loading map…
    </div>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  name: string; slogan: string; description: string;
  phone: string; email: string;
  address: string; city: string; state: string; zip: string; country: string;
  cuisineType: string; timezone: string;
  taxRate: string; minimumOrder: string; deliveryFee: string;
  estimatedPickup: string; estimatedDelivery: string;
  logoUrl: string; bannerUrl: string;
  reviewLink: string; infoContent: string;
};

/** One result from Nominatim's /search endpoint with addressdetails=1 */
type NominatimPlace = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    province?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
};

type AddressFill = Pick<FormState, "address" | "city" | "state" | "zip" | "country">;

// ─── Simple text field ────────────────────────────────────────────────────────

// Defined at module level to avoid remount/focus-loss on every render
function Field({
  label, field, form, setForm, type = "text", placeholder = "",
}: {
  label: string; field: keyof FormState;
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
        placeholder={placeholder}
        value={form[field] as string}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
      />
    </div>
  );
}

// ─── Location Section ─────────────────────────────────────────────────────────
// Also at module level.

interface LocationSectionProps {
  lat: number | null;
  lng: number | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  onCoordsChange: (lat: number, lng: number) => void;
  onAddressFill: (fill: AddressFill) => void;
  mapProvider: "leaflet" | "google";
  googleMapsApiKey: string | null;
}

function LocationSection({
  lat, lng, address, city, state, zip, country,
  onCoordsChange, onAddressFill,
  mapProvider, googleMapsApiKey,
}: LocationSectionProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const locationSet = lat !== null && lng !== null;

  // ── Autocomplete search ─────────────────────────────────────────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    setShowDropdown(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
          { headers: { "User-Agent": "FeeFreeOrderingSystems/1.0" } }
        );
        if (res.ok) setSuggestions(await res.json());
      } catch {
        // Silently ignore — network hiccup shouldn't break the form
      }
      setSearching(false);
    }, 400);
  }, []);

  // ── Select a suggestion ─────────────────────────────────────────────────
  const selectPlace = useCallback((place: NominatimPlace) => {
    const newLat = parseFloat(place.lat);
    const newLng = parseFloat(place.lon);
    onCoordsChange(newLat, newLng);

    // Decompose Nominatim's addressdetails into our structured fields
    const a = place.address;
    const streetNum = a.house_number ?? "";
    const road = a.road ?? "";
    const streetLine = [streetNum, road].filter(Boolean).join(" ")
      || place.display_name.split(",")[0]; // fallback: first segment

    onAddressFill({
      address: streetLine,
      city: a.city || a.town || a.village || a.municipality || a.county || "",
      state: a.state || a.province || "",
      zip: a.postcode || "",
      country: (a.country_code ?? "").toUpperCase() || "CA",
    });

    setQuery(place.display_name);
    setSuggestions([]);
    setShowDropdown(false);
  }, [onCoordsChange, onAddressFill]);

  // ── Geocode from existing address fields ────────────────────────────────
  const geocodeFromFields = useCallback(async () => {
    const addrStr = [address, city, state, zip, country].filter(Boolean).join(", ");
    if (!addrStr.trim()) {
      toast.error("Fill in the address fields first.");
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(addrStr)}&format=json&limit=1`,
        { headers: { "User-Agent": "FeeFreeOrderingSystems/1.0" } }
      );
      const data: NominatimPlace[] = await res.json();
      if (data.length) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        onCoordsChange(newLat, newLng);
        toast.success("Location pinned from address!");
      } else {
        toast.error("Could not geocode this address. Try the search box above.");
      }
    } catch {
      toast.error("Geocoding failed. Check your internet connection.");
    }
    setGeocoding(false);
  }, [address, city, state, zip, country, onCoordsChange]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-orange-500" /> Location Pin
      </div>

      {/* Coordinates status badge */}
      <div className="mb-4">
        {locationSet ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-green-700 font-medium">Location pinned</span>
            <span className="text-gray-400 font-mono text-xs">
              {lat!.toFixed(6)}, {lng!.toFixed(6)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">No location set</span>
            <span className="text-amber-600 text-xs">
              — Delivery Zones will not work correctly until this is set.
            </span>
          </div>
        )}
      </div>

      {/* Address search / autocomplete */}
      <div className="relative mb-3" ref={dropdownRef}>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Search &amp; select your restaurant address
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="Start typing your restaurant address…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
          )}
          {!searching && query && (
            <button
              onClick={() => { setQuery(""); setSuggestions([]); setShowDropdown(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((place) => (
              <button
                key={place.place_id}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-50 border-b border-gray-50 last:border-0 transition"
                onClick={() => selectPlace(place)}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-800 leading-snug">{place.display_name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* "Geocode from fields" button */}
      <button
        type="button"
        onClick={geocodeFromFields}
        disabled={geocoding}
        className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium mb-4 disabled:opacity-60 transition"
      >
        {geocoding
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <MapPin className="w-3.5 h-3.5" />}
        {geocoding ? "Geocoding…" : "Geocode from address fields below"}
      </button>

      {/* Interactive map */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 280 }}>
        <ProfileMap
          lat={lat}
          lng={lng}
          onMove={onCoordsChange}
          provider={mapProvider}
          googleMapsApiKey={googleMapsApiKey ?? undefined}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Click the map or drag the orange pin to fine-tune your exact location.
        This is used as the origin for all delivery zone radius calculations.
      </p>
    </div>
  );
}

// ─── Main ProfileClient ───────────────────────────────────────────────────────

export function ProfileClient({ restaurant }: { restaurant: any }) {
  const [form, setForm] = useState<FormState>({
    name: restaurant?.name || "",
    slogan: restaurant?.slogan || "",
    description: restaurant?.description || "",
    phone: restaurant?.phone || "",
    email: restaurant?.email || "",
    address: restaurant?.address || "",
    city: restaurant?.city || "",
    state: restaurant?.state || "",
    zip: restaurant?.zip || "",
    country: restaurant?.country || "CA",
    cuisineType: restaurant?.cuisineType || "",
    timezone: restaurant?.timezone || "America/New_York",
    taxRate: String(restaurant?.taxRate ?? 0),
    minimumOrder: String(restaurant?.minimumOrder ?? 0),
    deliveryFee: String(restaurant?.deliveryFee ?? 0),
    estimatedPickup: String(restaurant?.estimatedPickup ?? 20),
    estimatedDelivery: String(restaurant?.estimatedDelivery ?? 45),
    logoUrl: restaurant?.logoUrl || "",
    bannerUrl: restaurant?.bannerUrl || "",
    reviewLink: restaurant?.reviewLink || "",
    infoContent: restaurant?.infoContent || "",
  });

  // lat/lng are managed separately — they're not part of the main text form
  const [lat, setLat] = useState<number | null>(restaurant?.lat ?? null);
  const [lng, setLng] = useState<number | null>(restaurant?.lng ?? null);

  const [loading, setLoading] = useState(false);

  const handleCoordsChange = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
  }, []);

  const handleAddressFill = useCallback((fill: AddressFill) => {
    setForm((f) => ({ ...f, ...fill }));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────
  const save = async () => {
    setLoading(true);
    try {
      let saveLat = lat;
      let saveLng = lng;

      // Auto-geocode if we have an address but no coordinates yet
      if ((saveLat === null || saveLng === null) && form.address) {
        const addrStr = [form.address, form.city, form.state, form.zip, form.country]
          .filter(Boolean)
          .join(", ");
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search` +
            `?q=${encodeURIComponent(addrStr)}&format=json&limit=1`,
            { headers: { "User-Agent": "FeeFreeOrderingSystems/1.0" } }
          );
          const data: NominatimPlace[] = await res.json();
          if (data.length) {
            saveLat = parseFloat(data[0].lat);
            saveLng = parseFloat(data[0].lon);
            setLat(saveLat);
            setLng(saveLng);
          }
        } catch {
          // Non-fatal — still save the form data even if geocoding fails
        }
      }

      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          taxRate: parseFloat(form.taxRate) || 0,
          minimumOrder: parseFloat(form.minimumOrder) || 0,
          deliveryFee: parseFloat(form.deliveryFee) || 0,
          estimatedPickup: parseInt(form.estimatedPickup) || 20,
          estimatedDelivery: parseInt(form.estimatedDelivery) || 45,
          lat: saveLat,
          lng: saveLng,
        }),
      });

      if (!res.ok) throw new Error("Failed");
      toast.success("Profile saved!");
    } catch {
      toast.error("Failed to save profile");
    }
    setLoading(false);
  };

  const fp = { form, setForm };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Restaurant Profile</h1>
        <button
          onClick={save}
          disabled={loading}
          className="flex items-center gap-2 bg-orange-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition text-sm disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {loading ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="space-y-6">
        {/* ── Basic Info ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Store className="w-4 h-4" /> Basic Info
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field {...fp} label="Restaurant Name" field="name" placeholder="Pizza Palace" />
            <Field {...fp} label="Cuisine Type" field="cuisineType" placeholder="Italian / Pizza" />
            <div className="md:col-span-2">
              <Field {...fp} label="Slogan" field="slogan" placeholder="Fresh ingredients, bold flavors" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Tell customers about your restaurant…"
              />
            </div>
          </div>
        </div>

        {/* ── Branding ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> Branding
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <ImageUpload
              label="Restaurant Logo"
              value={form.logoUrl}
              onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))}
              aspectRatio="square"
            />
            <ImageUpload
              label="Banner Image"
              value={form.bannerUrl}
              onChange={(url) => setForm((f) => ({ ...f, bannerUrl: url }))}
              aspectRatio="wide"
            />
          </div>
        </div>

        {/* ── Contact & Location ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
            Contact &amp; Location
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field {...fp} label="Phone" field="phone" type="tel" placeholder="(555) 123-4567" />
            <Field {...fp} label="Email" field="email" type="email" placeholder="info@restaurant.com" />
            <Field {...fp} label="Street Address" field="address" placeholder="123 Main St" />
            <Field {...fp} label="City" field="city" placeholder="Milton" />
            <Field {...fp} label="Province / State" field="state" placeholder="ON" />
            <Field {...fp} label="Postal / Zip Code" field="zip" placeholder="L9T 2H6" />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              >
                <option value="CA">Canada</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="NZ">New Zealand</option>
                <option value="IE">Ireland</option>
                <option value="MX">Mexico</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Location Pin (new) ─────────────────────────────────────── */}
        <LocationSection
          lat={lat}
          lng={lng}
          address={form.address}
          city={form.city}
          state={form.state}
          zip={form.zip}
          country={form.country}
          onCoordsChange={handleCoordsChange}
          onAddressFill={handleAddressFill}
          mapProvider={restaurant?.mapProvider ?? "leaflet"}
          googleMapsApiKey={restaurant?.googleMapsApiKey ?? null}
        />

        {/* ── Services ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-gray-700 uppercase tracking-wide">Services</div>
              <p className="text-xs text-gray-500 mt-1">
                Enable or configure Pickup, Delivery, Dine-In, Catering, and Reservations.
              </p>
            </div>
            <NextLink
              href="/admin/services"
              className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 transition"
            >
              Manage Services →
            </NextLink>
          </div>
        </div>

        {/* ── Ordering Settings ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
            Ordering Settings
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field {...fp} label="Est. Pickup Time (minutes)" field="estimatedPickup" type="number" />
            <Field {...fp} label="Est. Delivery Time (minutes)" field="estimatedDelivery" type="number" />
            <Field {...fp} label="Minimum Order ($)" field="minimumOrder" type="number" />
            <Field {...fp} label="Delivery Fee ($)" field="deliveryFee" type="number" />
            <Field {...fp} label="Tax Rate (%)" field="taxRate" type="number" />
          </div>
        </div>

        {/* ── Info Page ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" /> Info Page
          </div>
          <div className="space-y-4">
            <Field {...fp} label="Google / Yelp Review Link" field="reviewLink" placeholder="https://g.page/…" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom CTA / Extra Info (JSON)
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-mono"
                rows={4}
                value={form.infoContent}
                onChange={(e) => setForm((f) => ({ ...f, infoContent: e.target.value }))}
                placeholder={`{"ctaLabel": "Join Our VIP Club", "ctaUrl": "https://...", "ctaDescription": "Get exclusive deals!"}`}
              />
              <p className="text-xs text-gray-400 mt-1">
                Optional JSON to configure a custom CTA button on your info page.
              </p>
            </div>
          </div>
        </div>

        {/* ── Your Links ─────────────────────────────────────────────── */}
        {restaurant?.slug && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Your Links</div>
            <div className="space-y-2">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-0.5">Ordering Page</div>
                <div className="font-mono text-orange-700 text-sm">/order/{restaurant.slug}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-0.5">Restaurant Info Page</div>
                <div className="font-mono text-blue-700 text-sm">/order/{restaurant.slug}/info</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
