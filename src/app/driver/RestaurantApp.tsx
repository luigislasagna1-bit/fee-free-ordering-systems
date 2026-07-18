"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bike,
  CalendarClock,
  DollarSign,
  Globe,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  Send,
  Settings,
  Star,
  Store,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency, PLATFORM_CURRENCY } from "@/lib/utils";
import { haversineKm } from "@/lib/geocode";
import { LOCALE_OPTIONS } from "@/lib/locales";
import { BottomNav, type BottomNavTab } from "./shared/BottomNav";
import { ShellHeader } from "./shared/ShellHeader";
import { RoleSwitch } from "./RoleSwitch";
import { clearPrefCookie } from "./shared/role-pref";

/**
 * RestaurantApp — the restaurant-role app shell (v1.1 plan §4.1). Serves
 * owners who reach /driver with an admin session (+ optional driver session
 * on the same device via the ffd-role-pref tie-break).
 *
 * One poller: GET /api/admin/feefree-delivery/ops every 10s, paused on
 * document.hidden, refetch on focus + after dispatch mutations, fanned out
 * via OpsCtx so tabs NEVER spin their own intervals (plan §4.1).
 *
 * 401 from the ops route → hard-navigate /driver/login (session expired or
 * impersonation ended). No auth-dependent server redirects (tab state is
 * React state, plan §4.1 / AGENTS.md).
 *
 * Tabs (Phase 6 R1): Dispatch (default) + Account. Deliveries and Drivers
 * are Phase 7/8 — they are absent from the nav in this phase (hidden, never
 * dead, plan §7 "your call" clause).
 *
 * Visual language: same dark-native shell as DriverApp (bg-gray-900, emerald
 * active state, safe-area header + bottom nav) — kills the light-panel-in-
 * dark-shell seam that RestaurantDispatch had (plan §4.1).
 */

// ── Types ────────────────────────────────────────────────────────────────────

type HeldOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
};

type ActiveDelivery = {
  id: string;
  status: string;
  driver: { name: string; ratingPct: number | null } | null;
  order: {
    orderNumber: string;
    customerName: string;
    deliveryLat: number | null;
    deliveryLng: number | null;
  };
};

type OpsPayload = {
  enabled: boolean;
  autoSend: boolean;
  owedCents: number;
  deliveredThisWeek: number;
  nextChargeAt: string; // ISO string
  currency: string;
  held: HeldOrder[];
  active: ActiveDelivery[];
  restLat: number | null;
  restLng: number | null;
};

type TabId = "dispatch" | "account";

// ── Context ──────────────────────────────────────────────────────────────────
//
// Internal to this module: one poller at the shell level, all tabs read via
// useOps(). No tab creates its own interval.

type OpsCtxValue = {
  data: OpsPayload | null;
  loading: boolean;
  refetch: () => void;
};

const OpsCtx = createContext<OpsCtxValue>({
  data: null,
  loading: true,
  refetch: () => {},
});

function useOps(): OpsCtxValue {
  return useContext(OpsCtx);
}

// ── Active-delivery status chip ──────────────────────────────────────────────
//
// Reads admin.feefreeDelivery st_* keys — the same namespace as the desktop
// panel (plan §6: "st_delivered/failed/returned/cancelled usable by desktop
// too"). The new terminal st_* keys shipped in en.json this phase.

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-600/40 text-gray-300",
  assigned: "bg-blue-500/15 text-blue-400",
  accepted: "bg-amber-500/15 text-amber-400",
  started: "bg-amber-500/15 text-amber-400",
  picked_up: "bg-emerald-500/15 text-emerald-400",
  out_for_delivery: "bg-emerald-500/15 text-emerald-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-rose-500/15 text-rose-400",
  returned: "bg-gray-600/40 text-gray-300",
  cancelled: "bg-gray-600/40 text-gray-300",
};

function ActiveStatusChip({ status }: { status: string }) {
  const t = useTranslations("admin.feefreeDelivery");
  // Map to the st_* translation keys that live in admin.feefreeDelivery.
  const KEY: Record<string, string> = {
    queued: "st_queued",
    assigned: "st_assigned",
    accepted: "st_accepted",
    started: "st_started",
    picked_up: "st_enroute",
    out_for_delivery: "st_enroute",
    delivered: "st_delivered",
    failed: "st_failed",
    returned: "st_returned",
    cancelled: "st_cancelled",
  };
  const key = KEY[status];
  const label = key ? t(key) : status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        STATUS_COLORS[status] ?? "bg-gray-600/40 text-gray-300"
      }`}
    >
      {label}
    </span>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${
        checked ? "bg-emerald-500" : "bg-gray-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Dispatch tab ─────────────────────────────────────────────────────────────

function DispatchTab({ onGoToAccount }: { onGoToAccount: () => void }) {
  const { data, loading, refetch } = useOps();
  const t = useTranslations("admin.feefreeDelivery");
  const tApp = useTranslations("feefreeApp");
  const tCommon = useTranslations("common");

  // Per-order busy/error state for the "Send to driver" actions.
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const [dispatchErr, setDispatchErr] = useState<Record<string, boolean>>({});

  async function sendToDriver(orderId: string) {
    setDispatching((p) => ({ ...p, [orderId]: true }));
    setDispatchErr((p) => ({ ...p, [orderId]: false }));
    try {
      const res = await fetch("/api/admin/feefree-delivery/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        setDispatchErr((p) => ({ ...p, [orderId]: true }));
      } else {
        // Refetch ops so the order leaves the held list and enters active.
        refetch();
      }
    } catch {
      setDispatchErr((p) => ({ ...p, [orderId]: true }));
    } finally {
      setDispatching((p) => ({ ...p, [orderId]: false }));
    }
  }

  // First load — show spinner before any data arrives.
  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Not-enabled card — deep-links to Account tab (never bounces to desktop,
  // plan §4.2).
  if (data && !data.enabled) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 mx-auto">
            <Bike className="w-6 h-6" />
          </div>
          <h2 className="font-bold text-white">{tApp("notEnabledTitle")}</h2>
          <p className="text-sm text-gray-400">{tApp("notEnabledBody")}</p>
          <button
            type="button"
            onClick={onGoToAccount}
            className="inline-flex items-center gap-1.5 mt-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            <Settings className="w-4 h-4" />
            {tApp("notEnabledTurnOn")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="px-4 py-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Held orders (amber) — awaiting manual dispatch (autoSend off) */}
      {data && data.held.length > 0 ? (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
            {t("heldTitle")}
          </h3>
          <div className="space-y-2">
            {data.held.map((o) => (
              <div
                key={o.id}
                className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm min-w-0">
                    <span className="font-semibold text-white">
                      #{o.orderNumber}
                    </span>
                    <span className="text-gray-300"> · {o.customerName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendToDriver(o.id)}
                    disabled={dispatching[o.id]}
                    className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                  >
                    {dispatching[o.id] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {dispatching[o.id] ? t("sending") : t("sendToDriver")}
                  </button>
                </div>
                {dispatchErr[o.id] && (
                  <p className="text-xs text-rose-400 text-right">
                    {t("sendFailed")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        data && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5">
            <p className="text-sm text-gray-400">{tApp("noHeldOrders")}</p>
          </div>
        )
      )}

      {/* Active deliveries — all data from the ops poll, zero per-row fetches */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
          {t("activeDeliveries")}
        </h3>
        {data && data.active.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noActiveDeliveries")}</p>
        ) : (
          <div className="space-y-2">
            {data?.active.map((a) => {
              // restaurant→customer distance (common.kmFromStore convention,
              // plan §3.3 — never "trip distance").
              const distKm =
                data.restLat != null &&
                data.restLng != null &&
                a.order.deliveryLat != null &&
                a.order.deliveryLng != null
                  ? Math.round(
                      haversineKm(
                        data.restLat,
                        data.restLng,
                        a.order.deliveryLat,
                        a.order.deliveryLng,
                      ) * 10,
                    ) / 10
                  : null;
              return (
                <div
                  key={a.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3"
                >
                  <div className="text-sm min-w-0 space-y-0.5">
                    <div>
                      <span className="font-semibold text-white">
                        #{a.order.orderNumber}
                      </span>
                      <span className="text-gray-300">
                        {" "}
                        · {a.order.customerName}
                      </span>
                    </div>
                    {distKm != null && (
                      <div className="text-xs text-gray-400">
                        {tCommon("kmFromStore", { km: distKm })}
                      </div>
                    )}
                    <div className="text-xs text-gray-400">
                      {a.driver ? (
                        <>
                          {a.driver.name}
                          {a.driver.ratingPct != null && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-amber-400">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {Math.round(a.driver.ratingPct)}%
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-500">{t("unassigned")}</span>
                      )}
                    </div>
                  </div>
                  <ActiveStatusChip status={a.status} />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

// ── Account tab ──────────────────────────────────────────────────────────────

function AccountTab({
  restaurantName,
  userName,
  userEmail,
}: {
  restaurantName: string;
  userName: string;
  userEmail: string;
}) {
  const { data, refetch } = useOps();
  const t = useTranslations("admin.feefreeDelivery");
  const tApp = useTranslations("feefreeApp");
  const tDriver = useTranslations("driver");
  const tShared = useTranslations("feefreeShared");

  // Mirror the ops flags into local state for immediate UI feedback (optimistic
  // toggle UX — useEffect syncs from server state after each refetch so the
  // UI never diverges permanently even if a PUT fails).
  const [enabled, setEnabled] = useState(data?.enabled ?? false);
  const [autoSend, setAutoSend] = useState(data?.autoSend ?? false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [savingAutoSend, setSavingAutoSend] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  // Sync from ops context whenever a refetch lands new data.
  useEffect(() => {
    if (data != null) {
      setEnabled(data.enabled);
      setAutoSend(data.autoSend);
    }
  }, [data]);

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    setSavingEnabled(true);
    try {
      const res = await fetch("/api/admin/feefree-delivery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert
      } else {
        refetch();
      }
    } catch {
      setEnabled(!next); // revert
    } finally {
      setSavingEnabled(false);
    }
  }

  async function toggleAutoSend(next: boolean) {
    setAutoSend(next);
    setSavingAutoSend(true);
    try {
      const res = await fetch("/api/admin/feefree-delivery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSend: next }),
      });
      if (!res.ok) {
        setAutoSend(!next); // revert
      } else {
        refetch();
      }
    } catch {
      setAutoSend(!next); // revert
    } finally {
      setSavingAutoSend(false);
    }
  }

  // Relocated DispatchLogout mechanics (plan §2.4): CSRF+POST to admin signout,
  // hard-redirect to /driver/login. pref-clear MUST travel with this sign-out.
  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    // Clear ffd-role-pref first (plan §2.4 — the clear travels with the
    // relocated sign-out button, never left on a button that no longer exists).
    clearPrefCookie();
    try {
      const { csrfToken } = await fetch("/api/auth/csrf", {
        cache: "no-store",
      }).then((r) => r.json());
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: "/driver/login",
          json: "true",
        }),
      });
    } catch {
      // best effort — the hard redirect below still reaches the login page
    }
    window.location.href = "/driver/login";
  }

  const initials = restaurantName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="px-4 py-4 pb-24 max-w-lg mx-auto space-y-3">
      {/* Identity */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {initials || <Store className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white leading-snug">{restaurantName}</div>
            <div className="text-xs text-gray-400 truncate">{userName}</div>
            <div className="text-xs text-gray-500 truncate">{userEmail}</div>
          </div>
        </div>
      </section>

      {/* Fee Free Delivery settings — existing GET/PUT toggles (plan §4.5).
          "More delivery settings" deep-links to /admin/delivery/pool — money-
          config UIs are NOT duplicated here (plan §4.5). */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-700">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {/* "Fee Free Delivery" is a brand name — reuse driver.appName key */}
            {tDriver("appName")}
          </h2>
        </div>
        <div className="divide-y divide-gray-700">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white">{t("enableLabel")}</div>
              <div className="text-xs text-gray-500 leading-snug mt-0.5">
                {t("enableHint")}
              </div>
            </div>
            <Toggle
              checked={enabled}
              onChange={toggleEnabled}
              disabled={savingEnabled}
              ariaLabel={t("enableLabel")}
            />
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white">{t("autoSendLabel")}</div>
              <div className="text-xs text-gray-500 leading-snug mt-0.5">
                {autoSend ? t("autoSendOnHint") : t("autoSendOffHint")}
              </div>
            </div>
            <Toggle
              checked={autoSend}
              onChange={toggleAutoSend}
              disabled={savingAutoSend}
              ariaLabel={t("autoSendLabel")}
            />
          </div>
          <a
            href="/admin/delivery/pool"
            className="flex items-center gap-2 px-4 py-3 text-sm text-emerald-400 hover:text-emerald-300 active:text-emerald-300"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {tApp("moreDeliverySettings")}
          </a>
        </div>
      </section>

      {/* Billing summary — all PLATFORM_CURRENCY (plan §4.5, §8 currency split).
          Data comes exclusively from the ops poll — no extra fetch. */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-700">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {tApp("billingTitle")}
          </h2>
        </div>
        <div className="divide-y divide-gray-700">
          <div className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-gray-500" />
              {t("amountOwed")}
            </span>
            <span className="font-bold text-white">
              {data != null
                ? formatCurrency(data.owedCents / 100, PLATFORM_CURRENCY)
                : "—"}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-gray-500" />
              {t("deliveriesThisWeek")}
            </span>
            <span className="font-bold text-white">
              {data?.deliveredThisWeek ?? "—"}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-gray-500" />
              {t("nextCharge")}
            </span>
            <span className="font-semibold text-white">
              {data?.nextChargeAt
                ? new Date(data.nextChargeAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* App section: language switcher, "Open full dashboard", sign-out.
          LanguageRow is rendered standalone (it carries its own card styling).
          Sign-out is the relocated DispatchLogout + pref-clear (plan §2.4). */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-700">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {tApp("appSectionTitle")}
          </h2>
        </div>
        <div className="divide-y divide-gray-700">
          {/* LanguageRow wraps its own bg-gray-800 card; render it without
              the outer container so it fits the divide-y list naturally. */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Globe className="w-4 h-4 text-gray-500" />
              {tShared("language")}
            </div>
            {/* Inline the select here rather than wrapping LanguageRow, so
                the language row matches the divide-y list style. LanguageRow
                is still available for use as a standalone card elsewhere. */}
            <LanguageSwitcherInline />
          </div>
          <a
            href="/admin"
            className="flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:text-white active:text-white"
          >
            <LayoutDashboard className="w-4 h-4 text-gray-500 flex-shrink-0" />
            {tApp("openFullDashboard")}
          </a>
          <button
            type="button"
            onClick={logout}
            disabled={logoutBusy}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-rose-400 hover:text-rose-300 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {tDriver("signOut")}
            {logoutBusy && <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />}
          </button>
        </div>
      </section>
    </main>
  );
}

// ── Language switcher (inline row variant) ───────────────────────────────────
//
// Used inside the Account tab's divide-y list. Shares the same cookie
// mechanism as LanguageRow but without LanguageRow's outer card styling
// (which would double-box inside a divide-y section).

function LanguageSwitcherInline() {
  const currentLocale = useLocale();
  function onChange(next: string) {
    if (next === currentLocale) return;
    document.cookie = `ff-staff-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  }
  return (
    <select
      value={currentLocale}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
    >
      {LOCALE_OPTIONS.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function RestaurantApp({
  restaurantName,
  userName,
  userEmail,
  hasOtherRole,
}: {
  /**
   * Display name for the restaurant shown in the header subtitle and the
   * Account identity card.
   */
  restaurantName: string;
  /** Admin user's name (from getSessionUser().name in page.tsx). */
  userName: string;
  /** Admin user's email (from getSessionUser().email in page.tsx). */
  userEmail: string;
  /**
   * Whether a driver session is ALSO present on this device (controls the
   * RoleSwitch behaviour — in-app flip vs. deep-link /driver/login?as=driver,
   * plan §2.3/§2.4). Derived from !!driver in page.tsx, never from the client.
   */
  hasOtherRole: boolean;
}) {
  const tApp = useTranslations("feefreeApp");
  const tDriver = useTranslations("driver");

  const [tab, setTab] = useState<TabId>("dispatch");
  const [accountMounted, setAccountMounted] = useState(false);

  // ONE ops poll at the shell level — tabs read via useOps(), never create
  // their own intervals (plan §4.1).
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOps = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feefree-delivery/ops", {
        cache: "no-store",
      });
      if (res.status === 401) {
        // Session expired or restaurant session superseded — hard-nav to login
        // (plan §4.1 / §5.4). No auth-dependent server redirect by construction.
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) return;
      const data: OpsPayload = await res.json();
      setOps(data);
    } finally {
      setOpsLoading(false);
    }
  }, []);

  // Initial fetch + 10s interval. Paused on document.hidden: the interval
  // callback skips hidden documents; focus listener covers the "return from
  // sleep" case where no interval fired while hidden (plan §4.1).
  useEffect(() => {
    fetchOps();
    intervalRef.current = setInterval(() => {
      if (!document.hidden) fetchOps();
    }, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOps]);

  // Refetch on window focus — covers locked-phone return and task-switch
  // (the document.hidden guard is separate from the focus trigger).
  useEffect(() => {
    const onFocus = () => fetchOps();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchOps]);

  const heldCount = ops?.held.length ?? 0;

  // Phase 6 R1: Dispatch + Account only. Deliveries and Drivers are Phases 7/8
  // — they are absent from the nav (hidden), never dead placeholders (plan §7).
  const tabs: BottomNavTab<TabId>[] = [
    {
      id: "dispatch",
      label: tApp("tabDispatch"),
      icon: Bike,
      badge: heldCount,
    },
    {
      id: "account",
      label: tApp("tabAccount"),
      icon: Settings,
    },
  ];

  function goToAccount() {
    setAccountMounted(true);
    setTab("account");
  }

  return (
    <OpsCtx.Provider value={{ data: ops, loading: opsLoading, refetch: fetchOps }}>
      <div className="min-h-screen [min-height:100dvh] bg-gray-900 text-white">
        {/* ONE shared header across all tabs. RoleSwitch mounts here exactly
            once (plan §2.4) — it is the only dual-role switcher in this shell. */}
        <ShellHeader
          icon={<Store className="w-5 h-5 text-white" />}
          title={tDriver("appName")}
          subtitle={restaurantName}
          right={<RoleSwitch role="restaurant" hasOtherRole={hasOtherRole} />}
        />

        {/* Dispatch — always mounted, CSS-hidden when Account is active.
            No persistent background process on this tab, but consistent with
            the driver shell's mount-always pattern for future Deliveries tab
            (which may carry a poller of its own in Phase 7). */}
        <div className={tab === "dispatch" ? undefined : "hidden"}>
          <DispatchTab onGoToAccount={goToAccount} />
        </div>

        {/* Account — lazily mounted on first activation, stays mounted
            afterwards. Reads from OpsCtx — no own fetch. */}
        <div className={tab === "account" ? undefined : "hidden"}>
          {accountMounted && (
            <AccountTab
              restaurantName={restaurantName}
              userName={userName}
              userEmail={userEmail}
            />
          )}
        </div>

        <BottomNav
          tabs={tabs}
          active={tab}
          onSelect={(id) => {
            if (id === "account") setAccountMounted(true);
            setTab(id);
          }}
        />
      </div>
    </OpsCtx.Provider>
  );
}
