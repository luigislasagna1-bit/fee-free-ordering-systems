"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home,
  Loader2,
  Package,
  Phone,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { DetailOverlay } from "./shared/DetailOverlay";
import { DeliveryStatusChip } from "./shared/DeliveryStatusChip";

/**
 * Restaurant Drivers tab (v1.1 Phase 8, plan §4.4).
 *
 * Card list of every driver who has delivered for this restaurant plus its
 * home-store drivers, from GET .../drivers (3 queries server-side, capped).
 * Card: name, blended rating %, "{n} deliveries for you", last-delivery
 * date, home-store badge, inactive chip, tap-to-call phone button.
 *
 * Tap a card → driver detail sheet (the shared DetailOverlay chrome):
 * identity + your-rating line + call button + recent deliveries for you
 * (GET .../deliveries?driverId= — first page only; a row tap hands off to
 * the shell's delivery detail overlay via onOpenDelivery, where the rating
 * block lives).
 *
 * No own polling — drivers data only refetches when the tab (re)activates
 * or on the manual refresh button (same activation contract as the
 * Deliveries tab: the shell mounts this forever, CSS-hidden, so a
 * mount-only fetch would go stale — gate finding 5a0d9860).
 */

// ── Types (mirror the two API payloads) ──────────────────────────────────────

type DriverRow = {
  id: string;
  name: string;
  phone: string | null;
  ratingPct: number | null;
  isActive: boolean;
  isHomeStore: boolean;
  deliveriesForYou: number;
  lastDeliveredAt: string | null;
  myRating: { avg: number; count: number } | null;
};

type RecentDelivery = {
  id: string;
  status: string;
  completedAt: string;
  order: {
    orderNumber: string;
    customerName: string;
    total: number;
    tip: number;
    currency: string;
  };
};

// ── Component ────────────────────────────────────────────────────────────────

export function RestaurantDriversTab({
  active = true,
  onOpenDelivery,
}: {
  /** CSS-visibility gate — the parent hides this tab via the `hidden` class. */
  active?: boolean;
  /** Recent-delivery row tapped → the shell opens its delivery overlay. */
  onOpenDelivery: (id: string) => void;
}) {
  const tApp = useTranslations("feefreeApp");
  // driver.refresh labels the sibling tabs' refresh controls ×38 — reuse.
  const tDriver = useTranslations("driver");
  const locale = useLocale();

  const [rows, setRows] = useState<DriverRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/feefree-delivery/drivers", {
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        if (seq === seqRef.current) setFailed(true);
        return;
      }
      const data = await res.json();
      if (seq !== seqRef.current) return;
      if (Array.isArray(data?.drivers)) {
        setRows(data.drivers);
      } else {
        setFailed(true);
      }
    } catch {
      if (seq === seqRef.current) setFailed(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // Refetch EVERY time the tab becomes active — the shell mounts this
  // forever (CSS-hidden), so mount-only would go stale (gate finding
  // 5a0d9860, same contract as the Deliveries tab).
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  return (
    <main className="px-4 py-4 pb-24 max-w-lg mx-auto space-y-3">
      {/* Manual refresh */}
      <div className="flex justify-end -mb-1">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-gray-400 hover:text-white disabled:opacity-50"
          title={tDriver("refresh")}
          aria-label={tDriver("refresh")}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && rows === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      ) : failed && (rows === null || rows.length === 0) ? (
        <div className="py-10 text-center space-y-4">
          <Users className="w-10 h-10 mx-auto text-gray-700" />
          <p className="text-sm text-gray-400">{tApp("driversLoadFailed")}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            <RefreshCw className="w-4 h-4" />
            {tDriver("refresh")}
          </button>
        </div>
      ) : rows === null || rows.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <Users className="w-10 h-10 mx-auto text-gray-700" />
          <p className="text-sm text-gray-500">{tApp("noDriversYet")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(d);
                }
              }}
              className="w-full text-left bg-gray-800 border border-gray-700 hover:border-gray-600 active:border-gray-500 rounded-2xl p-4 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-bold text-white flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                    <span className="truncate">{d.name}</span>
                    {d.ratingPct != null && (
                      <span className="inline-flex items-center gap-0.5 text-amber-400 text-xs font-semibold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {Math.round(d.ratingPct)}%
                      </span>
                    )}
                    {d.isHomeStore && (
                      <span className="inline-flex items-center gap-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                        <Home className="w-2.5 h-2.5" />
                        {tApp("homeStore")}
                      </span>
                    )}
                    {!d.isActive && (
                      <span className="bg-gray-700 text-gray-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                        {tApp("inactive")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {tApp("deliveriesForYou", { n: d.deliveriesForYou })}
                  </div>
                  {d.lastDeliveredAt && (
                    <div className="text-[11px] text-gray-500">
                      {tApp("lastDelivery", {
                        date: new Date(d.lastDeliveredAt).toLocaleDateString(
                          locale,
                          { month: "short", day: "numeric" },
                        ),
                      })}
                    </div>
                  )}
                </div>
                {d.phone && (
                  <a
                    href={`tel:${d.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={tApp("callDriver")}
                    title={tApp("callDriver")}
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Driver detail sheet — client state, never a route. The shell's
          delivery overlay (also z-40, rendered LATER in the shell tree)
          stacks above this when a recent-delivery row is tapped. */}
      {selected && (
        <DriverSheet
          driver={selected}
          onClose={() => setSelected(null)}
          onOpenDelivery={onOpenDelivery}
        />
      )}
    </main>
  );
}

// ── Driver detail sheet ──────────────────────────────────────────────────────

function DriverSheet({
  driver,
  onClose,
  onOpenDelivery,
}: {
  driver: DriverRow;
  onClose: () => void;
  onOpenDelivery: (id: string) => void;
}) {
  const tApp = useTranslations("feefreeApp");
  const tDriver = useTranslations("driver");
  const locale = useLocale();

  const [recent, setRecent] = useState<RecentDelivery[] | null>(null);
  const [recentFailed, setRecentFailed] = useState(false);

  const loadRecent = useCallback(async () => {
    setRecent(null);
    setRecentFailed(false);
    try {
      const res = await fetch(
        `/api/admin/feefree-delivery/deliveries?driverId=${encodeURIComponent(driver.id)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        setRecentFailed(true);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data?.rows)) {
        setRecent(data.rows);
      } else {
        setRecentFailed(true);
      }
    } catch {
      setRecentFailed(true);
    }
  }, [driver.id]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  return (
    <DetailOverlay
      title={driver.name}
      subtitle={driver.phone ?? undefined}
      onClose={onClose}
    >
      {/* Identity card */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
          {driver.ratingPct != null && (
            <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              {Math.round(driver.ratingPct)}%
            </span>
          )}
          {driver.isHomeStore && (
            <span className="inline-flex items-center gap-0.5 bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              <Home className="w-3 h-3" />
              {tApp("homeStore")}
            </span>
          )}
          {!driver.isActive && (
            <span className="bg-gray-700 text-gray-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {tApp("inactive")}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400">
          {tApp("deliveriesForYou", { n: driver.deliveriesForYou })}
        </div>
        {driver.myRating && driver.myRating.count > 0 && (
          <div className="text-xs text-gray-400 flex items-center gap-1">
            {tApp("yourRating")}:
            <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {driver.myRating.avg.toFixed(1)}
            </span>
            <span className="text-gray-500">({driver.myRating.count})</span>
          </div>
        )}
        {driver.phone && (
          <a
            href={`tel:${driver.phone}`}
            className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2.5 rounded-xl"
          >
            <Phone className="w-4 h-4" />
            {tApp("callDriver")}
          </a>
        )}
      </section>

      {/* Recent deliveries for this restaurant (first keyset page only —
          full history stays on the Deliveries tab). */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {tApp("recentForYou")}
        </h3>
        {recent === null && !recentFailed ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          </div>
        ) : recentFailed ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-gray-400">
              {tApp("deliveriesLoadFailed")}
            </p>
            <button
              type="button"
              onClick={loadRecent}
              className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
            >
              <RefreshCw className="w-4 h-4" />
              {tDriver("refresh")}
            </button>
          </div>
        ) : recent !== null && recent.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <Package className="w-8 h-8 mx-auto text-gray-700" />
            <p className="text-sm text-gray-500">
              {tApp("noCompletedDeliveries")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent?.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenDelivery(r.id)}
                className="w-full text-left bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      #{r.order.orderNumber}
                      <span className="text-gray-400 font-normal">
                        {" "}
                        · {r.order.customerName}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-gray-400">
                      <DeliveryStatusChip status={r.status} />
                      <span>
                        {new Date(r.completedAt).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-emerald-400 flex-shrink-0">
                    {formatCurrency(r.order.total, r.order.currency)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </DetailOverlay>
  );
}
