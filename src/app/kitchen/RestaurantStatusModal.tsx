"use client";
import { currencySymbol } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  X, Pause, Play, AlertTriangle, Loader2, Package, Search, CheckCircle2,
  Sliders, Sun, Moon, Volume2, VolumeX, Printer, RefreshCw, BarChart3, ChevronRight,
  ZoomIn,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Kitchen-side restaurant Settings panel (header button label = "Settings").
 *
 * Two responsibilities, both kitchen staff need from the floor:
 *
 *   1. Pause services — when the kitchen is slammed, the chef hits a
 *      single button to stop new pickup / delivery / etc. orders for
 *      30 min / 1h / 2h / rest of day. Auto-resumes when the
 *      timestamp passes — no remembering to flip it back. Per-service
 *      so a backed-up kitchen can still take pickups while pausing
 *      delivery, or vice versa.
 *
 *   2. Item availability & pricing — quick per-item Mark out / Restock
 *      toggle PLUS an inline price input so the owner can bump a price
 *      without leaving the kitchen tablet. Both fields write to
 *      MenuItem, which is the same row read by /admin/menu and
 *      /order/[slug], so changes are reflected everywhere immediately.
 *
 * Posts to /api/kitchen/pause-services and /api/kitchen/menu-stock.
 * Luigi 2026-06-01 GloriaFood-parity; pricing 2026-06-02.
 */

type ServiceKey =
  | "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

interface StatusModalProps {
  open: boolean;
  onClose: () => void;
  /** Active services for this restaurant — only these get shown in
   *  the pause panel (no point offering to pause "delivery" for a
   *  pickup-only shop). */
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  acceptsDineIn: boolean;
  acceptsCatering: boolean;
  acceptsTakeOut: boolean;
  acceptsReservations: boolean;
  /** Current pausedUntil per service — null = active, future Date = paused. */
  pausedUntilByService: Partial<Record<ServiceKey, string | null>>;
  /** Notify parent so it can refetch fresh restaurant + menu state. */
  onChange?: () => void;
  /** Preferences-tab props (Luigi 2026-06-02 header declutter). The
   *  kitchen header used to host dedicated buttons for Refresh, Sound,
   *  Day/Night, Printer setup, and Day report — those buttons are
   *  gone now and this modal's Preferences tab hosts the entry points
   *  instead. The actual sub-modals (sound settings, printer setup,
   *  day report) stay where they were — we just open them from here. */
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  /** Kitchen display zoom (restaurateur accessibility feedback, 2026-07-03):
   *  1 = standard, 1.2 / 1.5 = bigger text + numbers. Per-device. */
  zoomLevel: number;
  onSetZoom: (z: number) => void;
  onRefresh: () => void;
  onOpenSound: () => void;
  onOpenPrinter: () => void;
  onOpenDayReport: () => void;
  /** Status hints so the Preferences rows can show meaningful subtitles
   *  (e.g. "Printer: Direct: 192.168.1.50" or "Sound: muted"). */
  alertMuted: boolean;
  alertVolume: number;
  printerReady: boolean;
  printerLabel: string | null;
  /** Restaurant currency, for the item-price inputs' symbol. */
  currency?: string;
}

const SERVICE_LABEL_KEYS: Record<ServiceKey, string> = {
  pickup: "svcPickup",
  delivery: "svcDelivery",
  dineIn: "svcDineIn",
  catering: "svcCatering",
  takeOut: "svcTakeBake",
  reservations: "svcReservations",
};

const DURATION_PRESETS: { labelKey: string; minutes: number }[] = [
  { labelKey: "dur30m", minutes: 30 },
  { labelKey: "dur1h", minutes: 60 },
  { labelKey: "dur2h", minutes: 120 },
];

export function RestaurantStatusModal({
  open, onClose,
  acceptsPickup, acceptsDelivery, acceptsDineIn,
  acceptsCatering, acceptsTakeOut, acceptsReservations,
  pausedUntilByService,
  onChange,
  themeMode, onToggleTheme,
  zoomLevel, onSetZoom,
  onRefresh, onOpenSound, onOpenPrinter, onOpenDayReport,
  alertMuted, alertVolume, printerReady, printerLabel, currency,
}: StatusModalProps) {
  const t = useTranslations("kitchen");
  const curSym = currencySymbol(currency ?? "usd");
  const [tab, setTab] = useState<"pause" | "stock" | "prefs" | "report">("pause");
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set());
  const [pauseBusy, setPauseBusy] = useState(false);

  // Build the list of services the kitchen can actually pause.
  const availableServices = (
    [
      acceptsPickup       ? ("pickup"       as ServiceKey) : null,
      acceptsDelivery     ? ("delivery"     as ServiceKey) : null,
      acceptsDineIn       ? ("dineIn"       as ServiceKey) : null,
      acceptsCatering     ? ("catering"     as ServiceKey) : null,
      acceptsTakeOut      ? ("takeOut"      as ServiceKey) : null,
      acceptsReservations ? ("reservations" as ServiceKey) : null,
    ].filter(Boolean) as ServiceKey[]
  );

  const isPaused = (s: ServiceKey): boolean => {
    const until = pausedUntilByService?.[s];
    if (!until) return false;
    return new Date(until).getTime() > Date.now();
  };

  const togglePick = (s: ServiceKey) => {
    setSelectedServices((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const submitPause = useCallback(async (mode: "duration" | "restOfDay" | "resume", durationMinutes?: number) => {
    if (selectedServices.size === 0) {
      toast.error(t("pausePickFirst"));
      return;
    }
    setPauseBusy(true);
    try {
      const body: Record<string, unknown> = {
        services: Array.from(selectedServices),
      };
      if (mode === "resume") body.resume = true;
      else if (mode === "restOfDay") body.restOfDay = true;
      else if (mode === "duration") body.durationMinutes = durationMinutes;
      const res = await fetch("/api/kitchen/pause-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || t("pauseFailedStatus", { status: res.status }));
      }
      toast.success(mode === "resume"
        ? t("pauseToastResumed", { n: selectedServices.size })
        : t("pauseToastPaused", { n: selectedServices.size }));
      setSelectedServices(new Set());
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericFailed"));
    } finally {
      setPauseBusy(false);
    }
  }, [selectedServices, onChange, t]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {t("rsTitle")}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab("pause")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "pause" ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Pause className="w-4 h-4 inline mr-1.5" /> {t("rsTabPause")}
          </button>
          <button
            type="button"
            onClick={() => setTab("stock")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "stock" ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Package className="w-4 h-4 inline mr-1.5" /> {t("rsTabStock")}
          </button>
          <button
            type="button"
            onClick={() => setTab("prefs")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "prefs" ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Sliders className="w-4 h-4 inline mr-1.5" /> {t("rsTabPrefs")}
          </button>
          <button
            type="button"
            onClick={() => setTab("report")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              tab === "report" ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-1.5" /> {t("rsTabDayReport")}
          </button>
        </div>

        {tab === "pause" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              {t("pauseIntro")}
            </p>

            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                {t("pausePickServices")}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableServices.length === 0 ? (
                  <div className="col-span-full text-sm text-gray-500 py-4">
                    {t("pauseNoServices")}
                  </div>
                ) : availableServices.map((s) => {
                  const paused = isPaused(s);
                  const picked = selectedServices.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => togglePick(s)}
                      className={`relative px-3 py-2 rounded-xl border text-sm font-semibold transition text-left ${
                        picked
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                          : paused
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-gray-200 bg-white text-gray-800 hover:border-emerald-300"
                      }`}
                    >
                      {t(SERVICE_LABEL_KEYS[s])}
                      {paused && (
                        <span className="block text-[10px] mt-0.5 opacity-70">
                          {t("pausedUntil", { time: new Date(pausedUntilByService[s]!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}
                        </span>
                      )}
                      {picked && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 absolute top-1.5 right-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                {t("pauseHowLong")}
              </div>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.labelKey}
                    type="button"
                    disabled={pauseBusy || selectedServices.size === 0}
                    onClick={() => submitPause("duration", d.minutes)}
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition"
                  >
                    {t("pauseFor", { duration: t(d.labelKey) })}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pauseBusy || selectedServices.size === 0}
                  onClick={() => submitPause("restOfDay")}
                  className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition"
                >
                  {t("pauseRestOfDay")}
                </button>
                <button
                  type="button"
                  disabled={pauseBusy || selectedServices.size === 0}
                  onClick={() => submitPause("resume")}
                  className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold transition inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> {t("pauseResumeNow")}
                </button>
              </div>
              {pauseBusy && (
                <div className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("pauseSaving")}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "stock" && (
          <StockPanel onChange={onChange} curSym={curSym} />
        )}

        {tab === "prefs" && (
          <PreferencesPanel
            themeMode={themeMode}
            onToggleTheme={onToggleTheme}
            zoomLevel={zoomLevel}
            onSetZoom={onSetZoom}
            onRefresh={() => { onRefresh(); onClose(); }}
            onOpenSound={() => { onOpenSound(); onClose(); }}
            onOpenPrinter={() => { onOpenPrinter(); onClose(); }}
            alertMuted={alertMuted}
            alertVolume={alertVolume}
            printerReady={printerReady}
            printerLabel={printerLabel}
          />
        )}

        {/* End-of-day report — its OWN tab/section now (Luigi 2026-06-16), no
            longer buried inside Preferences. Opens the full day-report modal. */}
        {tab === "report" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <p className="text-xs text-gray-600 leading-relaxed">
              {t("eodIntroPanel")}
            </p>
            <PrefRow
              icon={<BarChart3 className="w-5 h-5" />}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              title={t("eodRowTitle")}
              subtitle={t("eodRowSubtitle")}
              onClick={() => { onOpenDayReport(); onClose(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Preferences tab — the new home for the buttons that used to live
 *  on the kitchen header (Refresh, Sound, Day/Night, Printer, Day
 *  report). Each row opens the corresponding sub-modal that already
 *  exists in KitchenDisplay — we don't re-implement those, we just
 *  surface them from a cleaner control-panel hub. */
function PreferencesPanel({
  themeMode, onToggleTheme,
  zoomLevel, onSetZoom,
  onRefresh, onOpenSound, onOpenPrinter,
  alertMuted, alertVolume, printerReady, printerLabel,
}: {
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  zoomLevel: number;
  onSetZoom: (z: number) => void;
  onRefresh: () => void;
  onOpenSound: () => void;
  onOpenPrinter: () => void;
  alertMuted: boolean;
  alertVolume: number;
  printerReady: boolean;
  printerLabel: string | null;
}) {
  const tk = useTranslations("kitchen");
  const soundSubtitle = alertMuted || alertVolume === 0
    ? tk("prefsSoundMuted")
    : alertVolume < 0.5
      ? tk("prefsSoundVolumeLow", { n: Math.round(alertVolume * 100) })
      : tk("prefsSoundVolume", { n: Math.round(alertVolume * 100) });
  const soundTone = alertMuted || alertVolume === 0
    ? "text-red-600"
    : alertVolume < 0.5
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-2">
      <p className="text-xs text-gray-600 leading-relaxed mb-3">
        {tk("prefsIntro")}
      </p>

      {/* Sound */}
      <PrefRow
        icon={alertMuted || alertVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        iconBg="bg-emerald-50"
        iconColor={soundTone}
        title={tk("prefsSoundTitle")}
        subtitle={soundSubtitle}
        onClick={onOpenSound}
      />

      {/* Day / Night — inline toggle, no sub-modal */}
      <button
        type="button"
        onClick={onToggleTheme}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:bg-gray-50 transition text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
          {themeMode === "light"
            ? <Sun className="w-5 h-5 text-amber-500" />
            : <Moon className="w-5 h-5 text-indigo-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{tk("prefsDayNight")}</div>
          <div className="text-xs text-gray-500 truncate">
            {/* Two plain keys instead of an ICU select — the parity audit's
                stripper can't handle custom select branch names (day {…}). */}
            {tk(themeMode === "light" ? "prefsDayNightNowDay" : "prefsDayNightNowNight")}
          </div>
        </div>
        <div className={`text-xs font-bold px-2 py-1 rounded-full ${
          themeMode === "light"
            ? "bg-amber-100 text-amber-700"
            : "bg-indigo-100 text-indigo-700"
        }`}>
          {themeMode === "light" ? tk("prefsBadgeDay") : tk("prefsBadgeNight")}
        </div>
      </button>

      {/* Zoom / text size — restaurateur accessibility feedback (2026-07-03):
          scale the whole display so text + numbers are easier to read. Saved
          per DEVICE; the choice applies instantly, no restart. */}
      <div className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 bg-white text-left">
        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
          <ZoomIn className="w-5 h-5 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{tk("zoomTitle")}</div>
          <div className="text-xs text-gray-500 truncate">{tk("zoomSubtitle")}</div>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
          {([1, 1.2, 1.5] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => onSetZoom(z)}
              className={`px-2.5 py-1.5 text-xs font-bold transition ${
                zoomLevel === z
                  ? "bg-violet-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {z === 1 ? tk("zoomStandard") : `${z}×`}
            </button>
          ))}
        </div>
      </div>

      {/* Printer */}
      <PrefRow
        icon={<Printer className="w-5 h-5" />}
        iconBg="bg-emerald-50"
        iconColor={printerReady ? "text-emerald-600" : "text-gray-400"}
        title={tk("prefsPrinterTitle")}
        subtitle={printerLabel ?? tk("prefsPrinterNone")}
        onClick={onOpenPrinter}
      />

      {/* Refresh */}
      <PrefRow
        icon={<RefreshCw className="w-5 h-5" />}
        iconBg="bg-sky-50"
        iconColor="text-sky-600"
        title={tk("prefsRefreshTitle")}
        subtitle={tk("prefsRefreshSubtitle")}
        onClick={onRefresh}
      />
    </div>
  );
}

function PrefRow({
  icon, iconBg, iconColor, title, subtitle, onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:bg-gray-50 transition text-left"
    >
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500 truncate">{subtitle}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </button>
  );
}

interface StockItem {
  id: string;
  name: string;
  isSoldOut: boolean;
  price: number;
  hasVariants: boolean;
  variants: { id: string; name: string; price: number; sortOrder: number }[];
  category: { name: string; sortOrder: number } | null;
}

function StockPanel({ onChange, curSym }: { onChange?: () => void; curSym: string }) {
  const t = useTranslations("kitchen");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // Per-item draft for the inline price input — keyed by item id, holds
  // the raw text the user is typing. Committed (saved) on blur or
  // Enter; reverted on Escape. We don't write keystroke-by-keystroke
  // so the kitchen doesn't fire 14 PATCHes while the owner types
  // "12.50". Items not in this map render the canonical it.price.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceBusyIds, setPriceBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/kitchen/menu-stock");
      const d = r.ok ? await r.json() : { items: [] };
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (it: StockItem) => {
    setBusyIds((s) => new Set(s).add(it.id));
    try {
      const r = await fetch(`/api/kitchen/menu-stock/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSoldOut: !it.isSoldOut }),
      });
      if (!r.ok) throw new Error(t("genericFailed"));
      setItems((cur) => cur.map((i) => i.id === it.id ? { ...i, isSoldOut: !it.isSoldOut } : i));
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericFailed"));
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(it.id);
        return next;
      });
    }
  };

  // Commit a draft price for a VARIANT (size). Same UX as the base
  // commitPrice below — local validate, PATCH the new
  // /api/kitchen/menu-stock/variant/[id] route, mutate the in-memory
  // it.variants[] entry on success so the input reverts cleanly.
  const commitVariantPrice = async (it: StockItem, v: StockItem["variants"][number]) => {
    const raw = priceDrafts[v.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const next = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(next) || next < 0 || next > 9999) {
      toast.error(t("stockPriceInvalid"));
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[v.id];
        return cp;
      });
      return;
    }
    const rounded = Math.round(next * 100) / 100;
    if (rounded === v.price) {
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[v.id];
        return cp;
      });
      return;
    }
    setPriceBusyIds((s) => new Set(s).add(v.id));
    try {
      const r = await fetch(`/api/kitchen/menu-stock/variant/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: rounded }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || t("genericFailed"));
      }
      setItems((cur) => cur.map((i) => i.id === it.id
        ? { ...i, variants: i.variants.map((vv) => vv.id === v.id ? { ...vv, price: rounded } : vv) }
        : i,
      ));
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[v.id];
        return cp;
      });
      toast.success(`${it.name} · ${v.name}: ${curSym}${rounded.toFixed(2)}`);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("stockPriceSaveFailed"));
    } finally {
      setPriceBusyIds((s) => {
        const cp = new Set(s);
        cp.delete(v.id);
        return cp;
      });
    }
  };

  // Commit a draft price for the given item. Validates locally so a
  // typo (empty string, NaN, negative, > 9999) shows an immediate
  // toast instead of a backend round-trip. On success we update the
  // local item row so the input reverts to formatted server state on
  // the next blur.
  const commitPrice = async (it: StockItem) => {
    const raw = priceDrafts[it.id];
    if (raw === undefined) return; // no draft = nothing to commit
    const trimmed = raw.trim();
    // No change → quietly clear the draft.
    const next = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(next) || next < 0 || next > 9999) {
      toast.error(t("stockPriceInvalid"));
      // Revert by clearing the draft so the canonical price renders.
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[it.id];
        return cp;
      });
      return;
    }
    const rounded = Math.round(next * 100) / 100;
    if (rounded === it.price) {
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[it.id];
        return cp;
      });
      return;
    }
    setPriceBusyIds((s) => new Set(s).add(it.id));
    try {
      const r = await fetch(`/api/kitchen/menu-stock/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: rounded }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || t("genericFailed"));
      }
      setItems((cur) => cur.map((i) => i.id === it.id ? { ...i, price: rounded } : i));
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[it.id];
        return cp;
      });
      toast.success(t("stockPriceUpdated", { price: `${curSym}${rounded.toFixed(2)}` }));
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("stockPriceSaveFailed"));
    } finally {
      setPriceBusyIds((s) => {
        const cp = new Set(s);
        cp.delete(it.id);
        return cp;
      });
    }
  };

  const filtered = query.trim()
    ? items.filter((it) =>
        it.name.toLowerCase().includes(query.toLowerCase()) ||
        (it.category?.name ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("stockSearchPlaceholder")}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500 inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("stockLoading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          {query.trim() ? t("stockNoMatch") : t("stockNoItems")}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {filtered.map((it) => {
            const hasVariants = it.hasVariants && it.variants.length > 0;
            // Two rendering modes:
            //   - hasVariants → header row with Mark out/Restock (no base
            //     price input — MenuItem.price isn't what the customer
            //     pays for variant items, so editing it would be a silent
            //     no-op and that's exactly the bug we're fixing). Below
            //     the header, one nested row per variant with its own
            //     live-editable price.
            //   - no variants → original single row: base price input +
            //     Mark out / Restock button.
            if (hasVariants) {
              return (
                <li key={it.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold truncate ${it.isSoldOut ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {it.name}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {it.category?.name ?? ""}
                        {it.category && " · "}
                        <span className="italic">{t("stockPricedBySize")}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(it)}
                      disabled={busyIds.has(it.id)}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                        it.isSoldOut
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                          : "bg-amber-500 hover:bg-amber-600 text-white"
                      } ${busyIds.has(it.id) ? "opacity-50 cursor-wait" : ""}`}
                    >
                      {busyIds.has(it.id)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : it.isSoldOut ? t("stockRestock") : t("stockMarkOut")}
                    </button>
                  </div>
                  <ul className="mt-2 ml-4 border-l border-gray-200 pl-3 space-y-1.5">
                    {it.variants.map((v) => {
                      const vDraft = priceDrafts[v.id];
                      const vInputValue = vDraft !== undefined ? vDraft : v.price.toFixed(2);
                      const vBusy = priceBusyIds.has(v.id);
                      return (
                        <li key={v.id} className="flex items-center justify-between gap-2">
                          <div className="text-xs text-gray-700 min-w-0 flex-1 truncate">{v.name}</div>
                          <div className="flex-shrink-0 flex items-center gap-1 text-xs">
                            <span className="text-gray-400">{curSym}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={vInputValue}
                              disabled={vBusy}
                              onChange={(e) => setPriceDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                              onBlur={() => commitVariantPrice(it, v)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Escape") {
                                  setPriceDrafts((d) => {
                                    const cp = { ...d };
                                    delete cp[v.id];
                                    return cp;
                                  });
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
                              aria-label={t("stockPriceAriaVariant", { item: it.name, variant: v.name })}
                            />
                            {vBusy && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }

            const draft = priceDrafts[it.id];
            const inputValue = draft !== undefined ? draft : it.price.toFixed(2);
            const priceBusy = priceBusyIds.has(it.id);
            return (
              <li key={it.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold truncate ${it.isSoldOut ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {it.name}
                  </div>
                  {it.category && (
                    <div className="text-[11px] text-gray-500 truncate">{it.category.name}</div>
                  )}
                </div>
                {/* Inline price editor — sits LEFT of the Mark out /
                    Restock button. Owner taps in, edits, blurs (or hits
                    Enter) to save. Escape reverts. Writes propagate to
                    the same MenuItem.price row read by /admin/menu and
                    /order/[slug] so changes are immediately reflected
                    everywhere. */}
                <div className="flex-shrink-0 flex items-center gap-1 text-xs">
                  <span className="text-gray-400">{curSym}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={inputValue}
                    disabled={priceBusy}
                    onChange={(e) => setPriceDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    onBlur={() => commitPrice(it)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      } else if (e.key === "Escape") {
                        setPriceDrafts((d) => {
                          const cp = { ...d };
                          delete cp[it.id];
                          return cp;
                        });
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
                    aria-label={t("stockPriceAria", { item: it.name })}
                  />
                  {priceBusy && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(it)}
                  disabled={busyIds.has(it.id)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    it.isSoldOut
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-amber-500 hover:bg-amber-600 text-white"
                  } ${busyIds.has(it.id) ? "opacity-50 cursor-wait" : ""}`}
                >
                  {busyIds.has(it.id)
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : it.isSoldOut ? t("stockRestock") : t("stockMarkOut")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        {t("stockFooterHint")}
      </p>
    </div>
  );
}
