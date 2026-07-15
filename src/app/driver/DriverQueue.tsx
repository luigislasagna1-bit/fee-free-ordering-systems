"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Bike, Loader2, MapPin, Navigation, Phone, LogOut, Package,
  CheckCircle2, Clock, DollarSign, Radio, RefreshCw, Star,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { mapsDirectionsUrl } from "@/lib/delivery-eta";
import { haversineKm } from "@/lib/geocode";

type Assignment = {
  id: string;
  status: string;
  mine: boolean;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string | null;
    customerAddress: string;
    deliveryLat: number | null;
    deliveryLng: number | null;
    notes: string | null;
    total: number;
    tip: number | null;
    scheduledFor: string | null;
    restaurantName: string;
    restaurantAddress: string;
    restaurantPhone: string | null;
    restaurantLat: number | null;
    restaurantLng: number | null;
    currency: string | null;
  };
};

// Assignment statuses that mean the driver is actively on a run → stream GPS.
const ACTIVE = new Set(["accepted", "started", "picked_up", "out_for_delivery"]);
// After pickup the driver heads to the CUSTOMER; before, to the RESTAURANT.
const HEADING_TO_CUSTOMER = new Set(["picked_up", "out_for_delivery"]);

export function DriverQueue({ driverName, rating = null }: { driverName: string; rating?: number | null }) {
  const t = useTranslations("driver");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [gpsOn, setGpsOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/assignments", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the queue + heartbeat.
  useEffect(() => {
    load();
    const poll = setInterval(load, 8000);
    const beat = setInterval(async () => {
      const res = await fetch("/api/driver/heartbeat", { method: "POST" }).catch(() => null);
      if (res && res.status === 401) window.location.assign("/driver/login");
    }, 30000);
    return () => {
      clearInterval(poll);
      clearInterval(beat);
    };
  }, [load]);

  // The one active job we're streaming GPS for (first mine + active).
  const activeAssignment = assignments.find((a) => a.mine && ACTIVE.has(a.status));

  // GPS while on an active run; POST throttled to ~10s.
  //   • Native app (Capacitor) → @capacitor-community/background-geolocation:
  //     keeps streaming with the phone LOCKED / app backgrounded (Android
  //     foreground service; iOS background location). This is why the driver
  //     app is worth wrapping natively — a PWA can't do this.
  //   • Web → browser watchPosition (foreground only; stops when the tab hides).
  // Same throttled POST to /api/driver/location for both paths.
  const lastSentRef = useRef(0);
  useEffect(() => {
    if (!activeAssignment) {
      setGpsOn(false);
      return;
    }
    const assignmentId = activeAssignment.id;
    const post = (lat: number, lng: number, accuracy?: number | null) => {
      const now = Date.now();
      if (now - lastSentRef.current < 10000) return; // throttle
      lastSentRef.current = now;
      fetch("/api/driver/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, accuracy: accuracy ?? null, assignmentId }),
      }).catch(() => {});
    };

    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      // Dynamic import so @capacitor/core never runs at SSR/module-eval on the server.
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const BG = registerPlugin<{
          addWatcher(opts: Record<string, unknown>, cb: (loc: { latitude: number; longitude: number; accuracy?: number } | null, err?: unknown) => void): Promise<string>;
          removeWatcher(opts: { id: string }): Promise<void>;
        }>("BackgroundGeolocation");
        let watcherId: string | null = null;
        try {
          watcherId = await BG.addWatcher(
            {
              backgroundTitle: t("appName"),
              backgroundMessage: t("gpsBgMessage"),
              requestPermissions: true,
              stale: false,
              distanceFilter: 15,
            },
            (loc, err) => {
              if (err || !loc) {
                if (!loc) setGpsOn(false);
                return;
              }
              setGpsOn(true);
              post(loc.latitude, loc.longitude, loc.accuracy);
            },
          );
        } catch {
          setGpsOn(false);
        }
        // If the effect was torn down while addWatcher was awaiting, remove now.
        if (cancelled && watcherId) {
          BG.removeWatcher({ id: watcherId }).catch(() => {});
          return;
        }
        cleanup = () => {
          if (watcherId) BG.removeWatcher({ id: watcherId }).catch(() => {});
          setGpsOn(false);
        };
      } else {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          setGpsOn(false);
          return;
        }
        setGpsOn(true);
        const id = navigator.geolocation.watchPosition(
          (pos) => post(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
          () => setGpsOn(false),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        );
        if (cancelled) {
          navigator.geolocation.clearWatch(id);
          return;
        }
        cleanup = () => {
          navigator.geolocation.clearWatch(id);
          setGpsOn(false);
        };
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [activeAssignment?.id, t]);

  async function advance(a: Assignment, next: string) {
    setActing(a.id);
    try {
      const res = await fetch(`/api/driver/assignments/${a.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.code === "claim_conflict" ? t("alreadyClaimed") : t("actionFailed"));
        await load();
        return;
      }
      toast.success(t("statusUpdated"));
      await load();
    } finally {
      setActing(null);
    }
  }

  const openJobs = assignments.filter((a) => !a.mine);
  const myJobs = assignments.filter((a) => a.mine);

  return (
    <div className="min-h-screen [min-height:100dvh] bg-gray-900 text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">{t("appName")}</div>
            <div className="text-xs text-gray-400 leading-tight flex items-center gap-1.5">
              {driverName}
              {rating != null && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {Math.round(rating)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {gpsOn && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <Radio className="w-3.5 h-3.5 animate-pulse" /> {t("gpsLive")}
            </span>
          )}
          <button onClick={() => load()} className="text-gray-400 hover:text-white" title={t("refresh")}>
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/driver/login" })}
            className="text-gray-400 hover:text-white"
            title={t("signOut")}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-6 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <>
            {/* My active jobs */}
            {myJobs.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{t("myJobsTitle")}</h2>
                {myJobs.map((a) => (
                  <JobCard key={a.id} a={a} acting={acting === a.id} onAdvance={advance} t={t} />
                ))}
              </section>
            )}

            {/* Open queue */}
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{t("openQueueTitle")}</h2>
              {openJobs.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{t("emptyQueue")}</p>
                </div>
              ) : (
                openJobs.map((a) => (
                  <JobCard key={a.id} a={a} acting={acting === a.id} onAdvance={advance} t={t} />
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function JobCard({
  a,
  acting,
  onAdvance,
  t,
}: {
  a: Assignment;
  acting: boolean;
  onAdvance: (a: Assignment, next: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tCommon = useTranslations("common");
  const o = a.order;
  const toCustomer = HEADING_TO_CUSTOMER.has(a.status);
  const navTarget = toCustomer ? o.customerAddress : o.restaurantAddress;
  // Straight-line distance restaurant → customer (the trip length / "how far from
  // the store"), shown so a driver can size up a job before accepting. Only when
  // both ends are geocoded. Luigi 2026-07-15.
  const distKm =
    o.restaurantLat != null && o.restaurantLng != null && o.deliveryLat != null && o.deliveryLng != null
      ? Math.round(haversineKm(o.restaurantLat, o.restaurantLng, o.deliveryLat, o.deliveryLng) * 10) / 10
      : null;
  // "Can't complete this delivery" is destructive (it hands the order back to
  // the pool) and the button is a small tap target — guard it with a confirm so
  // an accidental tap never drops a live delivery (Luigi 2026-07-15).
  const [confirmFail, setConfirmFail] = useState(false);

  // The single primary action for this stage.
  let primary: { next: string; label: string } | null = null;
  if (a.status === "queued") primary = { next: "accepted", label: t("accept") };
  else if (a.status === "accepted") primary = { next: "started", label: t("start") };
  else if (a.status === "started") primary = { next: "picked_up", label: t("pickedUp") };
  else if (a.status === "picked_up" || a.status === "out_for_delivery") primary = { next: "delivered", label: t("delivered") };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold">#{o.orderNumber}</div>
          <div className="text-xs text-gray-400">
            {statusLabel(a.status, t)}
            {distKm != null && <span className="text-gray-500"> · {tCommon("kmFromStore", { km: distKm })}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-emerald-400">{money(o.total, o.currency)}</div>
          {o.tip != null && o.tip > 0 && <div className="text-[11px] text-gray-400">{t("tip")} {money(o.tip, o.currency)}</div>}
        </div>
      </div>

      {o.scheduledFor && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 rounded-full px-2 py-0.5">
          <Clock className="w-3 h-3" /> {new Date(o.scheduledFor).toLocaleString()}
        </div>
      )}

      {/* Pickup + dropoff */}
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <Package className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-gray-300 font-medium">{o.restaurantName}</div>
            <div className="text-xs text-gray-500">{o.restaurantAddress}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-gray-300 font-medium">{o.customerName}</div>
            <div className="text-xs text-gray-500">{o.customerAddress}</div>
            {o.notes && <div className="text-xs text-amber-300/80 mt-0.5">{o.notes}</div>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 space-y-2">
        {primary && (
          <button
            onClick={() => onAdvance(a, primary!.next)}
            disabled={acting}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {primary.label}
          </button>
        )}

        {a.mine && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={mapsDirectionsUrl(navTarget)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-2.5 rounded-xl"
            >
              <Navigation className="w-4 h-4" /> {t("openInMaps")}
            </a>
            {(toCustomer ? o.customerPhone : o.restaurantPhone) ? (
              <a
                href={`tel:${toCustomer ? o.customerPhone : o.restaurantPhone}`}
                className="flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-2.5 rounded-xl"
              >
                <Phone className="w-4 h-4" /> {toCustomer ? t("callCustomer") : t("callRestaurant")}
              </a>
            ) : (
              <div />
            )}
          </div>
        )}

        {a.mine && a.status !== "delivered" && (
          <button
            onClick={() => setConfirmFail(true)}
            disabled={acting}
            className="w-full text-xs text-gray-500 hover:text-rose-400 py-1"
          >
            {t("cantComplete")}
          </button>
        )}
      </div>

      {/* Confirm before bailing on a delivery — releases it back to the pool. */}
      {confirmFail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setConfirmFail(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">{t("cantCompleteConfirmTitle")}</h3>
            <p className="text-sm text-gray-400 mt-2">{t("cantCompleteConfirmBody")}</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmFail(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                {t("cantCompleteConfirmNo")}
              </button>
              <button
                onClick={() => { setConfirmFail(false); onAdvance(a, "failed"); }}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-sm"
              >
                {t("cantCompleteConfirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function money(n: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
  }
}

function statusLabel(status: string, t: ReturnType<typeof useTranslations>): string {
  try {
    return t(`status_${status}` as any);
  } catch {
    return status;
  }
}
