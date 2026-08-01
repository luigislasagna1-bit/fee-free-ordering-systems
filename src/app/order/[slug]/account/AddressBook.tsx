"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Loader2, MapPin, Plus, Trash2, Check, X } from "lucide-react";
import { useGoogleMaps } from "@/lib/use-google-maps";
import { resolveMapsBrowserKey } from "@/lib/maps-key";
import { composeStreetLine } from "@/lib/delivery-address-fields";

// Leaflet touches `window`, so the map pin must be client-only. Reuses the
// exact same draggable pin checkout uses for non-Google restaurants.
const LeafletPin = dynamic(() => import("../CheckoutLeafletPin"), { ssr: false });

/** Places predictions via the callback form so statuses keep their meaning:
 *  no matches = an empty list (normal), anything else = reject, which flips
 *  the session to the OSM proxy fallback. (Same wrapper as CheckoutModal.) */
function svcGetPredictions(
  svc: google.maps.places.AutocompleteService,
  req: google.maps.places.AutocompletionRequest,
): Promise<google.maps.places.AutocompletePrediction[]> {
  return new Promise((resolve, reject) => {
    svc.getPlacePredictions(req, (preds, status) => {
      const S = google.maps.places.PlacesServiceStatus;
      if (status === S.OK || status === S.ZERO_RESULTS) resolve(preds ?? []);
      else reject(new Error(String(status)));
    });
  });
}

type Address = {
  id: string;
  label: string | null;
  street: string;
  city: string;
  state: string | null;
  zip: string | null;
  country: string;
  isDefault: boolean;
};

export function AddressBook({
  country,
  googleMapsApiKey = null,
  restaurantLat = null,
  restaurantLng = null,
  restaurantCity = null,
}: {
  country?: string;
  /** Platform Google key resolved server-side (getPlatformGoogleKey) — same
   *  prop contract as the ordering page. Null/empty ⇒ OSM-only, as before. */
  googleMapsApiKey?: string | null;
  /** Restaurant coords + town: bias Places toward the store's neighbourhood,
   *  exactly like checkout (5 km circle + town-anchored parallel query). */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  restaurantCity?: string | null;
}) {
  const t = useTranslations("addressBook");
  const [list, setList] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateVal] = useState("");
  const [zip, setZip] = useState("");
  // Pin-confirmed coords — set when a suggestion is picked or the pin dragged.
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // ── Address autocomplete — same dual-provider lane as checkout ──────────
  //    Google-keyed (platform key) → Places predictions, biased toward the
  //    restaurant; otherwise / on failure → the free OpenStreetMap proxy
  //    (/api/public/geocode/search). Places was added 2026-08-01 because the
  //    OSM lane is weak on Canadian house numbers — parity with checkout.
  const mapsKey = resolveMapsBrowserKey(googleMapsApiKey);
  const googleEnabled = !!mapsKey;
  const { isLoaded: gmapsLoaded } = useGoogleMaps(mapsKey);
  const placesSessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const placesAutoSvcRef = useRef<google.maps.places.AutocompleteService | null>(null);
  // A hard Places denial (dead key/quota) sticks for the session: later
  // keystrokes skip the doomed Google call and go straight to the OSM proxy.
  const googleDeniedRef = useRef(false);
  type Suggestion =
    | { kind: "google"; label: string; secondary: string; placeId: string }
    | { kind: "osm"; label: string; lat: number; lng: number; line1: string; city: string; postcode: string };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const justPickedRef = useRef(false);
  useEffect(() => {
    // Don't re-query the value we just filled from a chosen suggestion.
    if (justPickedRef.current) { justPickedRef.current = false; return; }
    const q = street.trim();
    if (q.length < 3) { setSuggestions([]); setSuggestOpen(false); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      const googleReady = !googleDeniedRef.current && googleEnabled && gmapsLoaded
        && typeof google !== "undefined" && !!google.maps?.places;
      if (googleReady) {
        try {
          if (!placesAutoSvcRef.current) {
            placesAutoSvcRef.current = new google.maps.places.AutocompleteService();
          }
          if (!placesSessionTokenRef.current) {
            placesSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
          }
          const req: google.maps.places.AutocompletionRequest = {
            input: q,
            sessionToken: placesSessionTokenRef.current,
            types: ["address"],
          };
          if (country) req.componentRestrictions = { country: country.toLowerCase() };
          // Bias toward the restaurant — tight 5 km circle + origin for
          // nearest-first sorting (measured tuning: see CheckoutModal).
          if (restaurantLat != null && restaurantLng != null) {
            req.location = new google.maps.LatLng(restaurantLat, restaurantLng);
            req.radius = 5_000;
            req.origin = new google.maps.LatLng(restaurantLat, restaurantLng);
          }
          // Parallel town-anchored query (town-first completes short partials
          // that the plain query misses — see CheckoutModal). Its failure must
          // NOT flip googleDeniedRef (pre-caught to []).
          const town = (restaurantCity || "").trim();
          const townQuery = town && !q.toLowerCase().includes(town.toLowerCase())
            ? svcGetPredictions(placesAutoSvcRef.current, { ...req, input: `${town} ${q}` }).catch(() => [])
            : Promise.resolve([] as google.maps.places.AutocompletePrediction[]);
          const [near, inTown] = await Promise.all([
            svcGetPredictions(placesAutoSvcRef.current, req),
            townQuery,
          ]);
          if (ctrl.signal.aborted) return;
          // Town hits lead, then everything nearest-first; dedupe on place_id.
          const seenIds = new Set<string>();
          const merged = [...inTown, ...near].filter((p) => !seenIds.has(p.place_id) && !!seenIds.add(p.place_id));
          merged.sort((a, b) =>
            ((a as { distance_meters?: number }).distance_meters ?? Infinity)
            - ((b as { distance_meters?: number }).distance_meters ?? Infinity));
          setSuggestions(merged.slice(0, 6).map((p): Suggestion => ({
            kind: "google",
            label: p.structured_formatting?.main_text || p.description,
            secondary: p.structured_formatting?.secondary_text || "",
            placeId: p.place_id,
          })));
          setSuggestOpen(true);
          return;
        } catch {
          // Hard rejection (key denied / quota dead) — remember it so we stop
          // paying the doomed round-trip on every keystroke; OSM takes over.
          googleDeniedRef.current = true;
        }
      }
      try {
        const params = new URLSearchParams({ q });
        if (country) params.set("country", country);
        const res = await fetch(`/api/public/geocode/search?${params.toString()}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        setSuggestions(Array.isArray(data.suggestions)
          ? data.suggestions.map((s: { label: string; lat: number; lng: number; line1: string; city: string; postcode: string }): Suggestion => ({ kind: "osm", ...s }))
          : []);
        setSuggestOpen(true);
      } catch { /* aborted / network — leave list as-is */ }
    }, 400);
    return () => { clearTimeout(id); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [street, country, googleEnabled, gmapsLoaded, restaurantLat, restaurantLng, restaurantCity]);
  const pickSuggestion = (s: Extract<Suggestion, { kind: "osm" }>) => {
    justPickedRef.current = true;
    setSuggestOpen(false);
    setSuggestions([]);
    setStreet(s.line1 || street);
    if (s.city) setCity(s.city);
    if (s.postcode) setZip(s.postcode);
    setLat(s.lat);
    setLng(s.lng);
  };
  const pickGoogleSuggestion = (sug: Extract<Suggestion, { kind: "google" }>) => {
    setSuggestOpen(false);
    setSuggestions([]);
    if (typeof google === "undefined" || !google.maps?.places) return;
    if (!placesServiceRef.current) {
      // PlacesService needs a host node; a detached div is the documented
      // pattern when results aren't rendered on a Google map.
      placesServiceRef.current = new google.maps.places.PlacesService(document.createElement("div"));
    }
    // getDetails closes the per-session billing window the token opened.
    const sessionToken = placesSessionTokenRef.current ?? undefined;
    placesSessionTokenRef.current = null;
    placesServiceRef.current.getDetails(
      { placeId: sug.placeId, fields: ["address_components", "formatted_address", "geometry"], sessionToken },
      (place, status) => {
        justPickedRef.current = true;
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.address_components) {
          const get = (type: string) =>
            place.address_components!.find((c) => c.types.includes(type))?.long_name ?? "";
          // House-number position follows the restaurant's country convention
          // ("Via Mazzini 13" vs "13 Main St") — same rule as checkout.
          const streetLine = composeStreetLine(get("route"), get("street_number"), country);
          const cityName = get("locality") || get("sublocality") || get("administrative_area_level_2");
          const postal = get("postal_code");
          setStreet(streetLine || place.formatted_address || sug.label);
          if (cityName) setCity(cityName);
          if (postal) setZip(postal);
          const loc = place.geometry?.location;
          if (loc) { setLat(loc.lat()); setLng(loc.lng()); }
        } else {
          // Details unavailable (quota/transient): keep the fullest picked
          // label so the choice isn't lost, and DROP any coords from a
          // previous pick (checkout parity) — the row saves coordinate-less
          // and the backfill/order write-back heal it later.
          setStreet(sug.secondary ? `${sug.label}, ${sug.secondary}` : sug.label);
          setLat(null);
          setLng(null);
        }
      },
    );
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/public/restaurant-customer/addresses");
      const d = r.ok ? await r.json() : { addresses: [] };
      setList(d.addresses ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!street.trim() || !city.trim()) {
      setErr(t("streetCityRequired"));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/public/restaurant-customer/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined, street, city, state, zip, lat, lng }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Failed (${r.status})`);
      }
      setLabel(""); setStreet(""); setCity(""); setStateVal(""); setZip(""); setLat(null); setLng(null);
      setShowForm(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/public/restaurant-customer/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/public/restaurant-customer/addresses/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {list.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-sm text-gray-500">
          {t("empty")}
        </div>
      )}
      {list.map((a) => (
        <div
          key={a.id}
          className="bg-white rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{a.label ?? t("addressFallback")}</span>
              {a.isDefault && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {t("defaultBadge")}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-0.5 truncate">
              {a.street}
              {a.city ? `, ${a.city}` : ""}
              {a.state ? ` ${a.state}` : ""}
              {a.zip ? ` ${a.zip}` : ""}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            {!a.isDefault && (
              <button
                onClick={() => setDefault(a.id)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold px-2 py-1"
                title={t("makeDefault")}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => remove(a.id)}
              className="text-gray-400 hover:text-red-600 px-2 py-1"
              title={t("delete")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            placeholder={t("labelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={30}
          />
          <div className="relative">
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("streetPlaceholder")}
              value={street}
              onChange={(e) => {
                // Manual typing invalidates picked/dragged coords — the saved
                // row must fall back to the text geocode, not a stale pin
                // (checkout parity, Luigi 2026-07-19; gap #2 of the 2026-08-01
                // checkout-address follow-up).
                setStreet(e.target.value);
                setLat(null);
                setLng(null);
              }}
              onFocus={() => { if (suggestions.length) setSuggestOpen(true); }}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              maxLength={200}
              autoComplete="off"
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={s.kind === "google" ? s.placeId : `${s.lat}-${s.lng}-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (s.kind === "google" ? pickGoogleSuggestion(s) : pickSuggestion(s))}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-emerald-50 flex items-start gap-1.5 border-b border-gray-50 last:border-0"
                  >
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="truncate">
                      {s.label}
                      {s.kind === "google" && s.secondary ? <span className="text-gray-400"> · {s.secondary}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("cityPlaceholder")}
              value={city}
              onChange={(e) => { setCity(e.target.value); setLat(null); setLng(null); }}
              maxLength={100}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("postalPlaceholder")}
              value={zip}
              onChange={(e) => { setZip(e.target.value); setLat(null); setLng(null); }}
              maxLength={20}
            />
          </div>
          {lat != null && lng != null && (
            <div>
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <LeafletPin center={{ lat, lng }} lat={lat} lng={lng} onMove={(la, lo) => { setLat(la); setLng(lo); }} />
              </div>
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" /> {t("pinHint")}</p>
            </div>
          )}
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setErr(null); }}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> {t("cancel")}
            </button>
            <button
              onClick={add}
              disabled={saving || !street.trim() || !city.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-white border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {t("addAddress")}
        </button>
      )}
    </div>
  );
}
