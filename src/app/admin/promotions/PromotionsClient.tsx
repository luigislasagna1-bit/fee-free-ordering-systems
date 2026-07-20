"use client";
/**
 * Promotions list UI. Used to host its own create/edit modal but the
 * create/edit flow now lives at /admin/promotions/new and
 * /admin/promotions/[id]/edit (the 3-step wizard). This client component
 * is responsible for:
 *   - Rendering promo + coupon cards with quick actions
 *   - Toggle / delete / duplicate buttons
 *   - The coupon modal (coupons still edit inline — simple form)
 *
 * The page-level "New Promo" button is rendered server-side in page.tsx
 * as a <Link> to /admin/promotions/new.
 */

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Tag, Edit2, Trash2, Copy, EyeOff, Power, PowerOff,
  Star, Crown, Shield, Percent, Gift, Package, Zap, Truck, Search,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Promo type → display meta (label + icon) ───────────────────────────────
// Kept for the list-card display only — the wizard's source of truth is
// src/lib/promo-types.ts.
const PROMO_TYPE_DISPLAY: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "percentage_off",         label: "% Discount on Selected Items", icon: Percent },
  { value: "fixed_cart",             label: "Fixed Discount on Cart",       icon: Tag     },
  { value: "free_delivery",          label: "Free Delivery",                icon: Truck   },
  { value: "bogo",                   label: "Buy One Get One Free",         icon: Gift    },
  { value: "buy_n_get_free",         label: "Buy N Get One Free",           icon: Package },
  { value: "free_item",              label: "Get a FREE Item",              icon: Gift    },
  { value: "meal_bundle",            label: "Meal Bundle",                  icon: Package },
  { value: "meal_bundle_speciality", label: "Meal Bundle with Speciality",  icon: Star    },
  { value: "fixed_combo",            label: "Fixed Discount on Combo Deal", icon: Tag     },
  { value: "percentage_combo",       label: "% Discount on Combo Deal",     icon: Percent },
  { value: "payment_reward",         label: "Payment Method Reward",        icon: Zap     },
  { value: "free_dish_meal",         label: "Free Dish as Part of a Meal",  icon: Gift    },
];

function StackingBadge({ rule }: { rule: string }) {
  const t = useTranslations("admin.promotionsList");
  if (rule === "master")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1">
        <Star className="w-3 h-3" />
        {t("stackingMaster")}
      </span>
    );
  if (rule === "exclusive")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
        <Crown className="w-3 h-3" />
        {t("stackingExclusive")}
      </span>
    );
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t("stackingStandard")}</span>;
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function PromoCard({
  promo,
  deadTargets = false,
  onDelete,
  onToggle,
  onDuplicate,
}: {
  promo: any;
  deadTargets?: boolean;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const t = useTranslations("admin.promotionsList");
  const typeInfo =
    PROMO_TYPE_DISPLAY.find((pt) => pt.value === promo.promotionType) ??
    PROMO_TYPE_DISPLAY[0];
  const Icon = typeInfo.icon;

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
        promo.isActive ? "border-gray-100" : "border-gray-100 opacity-60"
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            promo.isActive ? "bg-emerald-50" : "bg-gray-50"
          }`}
        >
          <Icon
            className={`w-5 h-5 ${
              promo.isActive ? "text-emerald-500" : "text-gray-400"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900">{promo.name}</span>
            {!promo.isActive && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {t("badgeInactive")}
              </span>
            )}
            {/* DEAD-TARGET quarantine badge (Luigi 2026-07-05): the promo's
                dishes no longer exist on the served menu — it is hidden from
                customers until the owner re-selects its dishes. */}
            {deadTargets && (
              <span className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200 font-semibold">
                ⚠ {t("badgeDeadTargets")}
              </span>
            )}
            <StackingBadge rule={promo.stackingRule} />
            {promo.couponCode && (
              <span className="text-xs bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded border border-blue-100">
                {promo.couponCode}
              </span>
            )}
            {promo.autoApply && !promo.couponCode && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                {t("badgeAuto")}
              </span>
            )}
            {/* Visible/Hidden marker so a menu-visible code promo is
                distinguishable from a hidden code-only one (audit #17). */}
            {promo.displayMode === "hidden_coupon_only" && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                <EyeOff className="w-3 h-3" />
                {t("badgeHidden")}
              </span>
            )}
            {/* WHY-NOT-PUBLIC badges (Luigi 2026-07-02 — "10+ promos enabled
                but only 1 shows"; every non-obvious reason a promo won't tile
                on the public page/website is now stated on its row). Hidden
                code-only promos already carry the badge above. */}
            {promo.isActive && promo.displayMode !== "hidden_coupon_only" && (
              (((promo as any)._count?.groupLinks ?? 0) > 0) ? (
                <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200" title={t("whyVipTip")}>
                  <EyeOff className="w-3 h-3" />
                  {t("whyVip")}
                </span>
              ) : promo.channel === "marketplace" ? (
                <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-200" title={t("whyMarketplaceTip")}>
                  <EyeOff className="w-3 h-3" />
                  {t("whyMarketplace")}
                </span>
              ) : !(promo as any).showOnBanner ? (
                <span className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200" title={t("whyBannerOffTip")}>
                  <EyeOff className="w-3 h-3" />
                  {t("whyBannerOff")}
                </span>
              ) : null
            )}
          </div>
          <div className="text-sm text-gray-500">{typeInfo.label}</div>
          {promo.description && (
            <div className="text-xs text-gray-400 truncate mt-0.5">
              {promo.description}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            {/* Member-only (VIP) badge — attached to ≥1 VIP group, so it applies
                only to members, not the public menu. Luigi 2026-06-27. */}
            {(((promo as any)._count?.groupLinks ?? 0) > 0) && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">
                {t("labelVip")}
              </span>
            )}
            {/* CREATED-FOR badge (pre-made promos) + a USED count even when the
                promo has no usage limit. Luigi 2026-06-09. */}
            {promo.campaignRef && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                {isGroupRef(promo.campaignRef) ? t("labelVip") : isAssignedRef(promo.campaignRef) ? t("labelAssigned") : campaignLabel(promo.campaignRef)}
              </span>
            )}
            {promo.campaignRef && !promo.usageLimit && (
              <span>{t("usedCount", { used: promo.usedCount, max: "∞" })}</span>
            )}
            {promo.minimumOrder > 0 && <span>{t("minOrder", { amount: promo.minimumOrder })}</span>}
            {promo.endsAt && (
              <span>{t("endsOn", { date: new Date(promo.endsAt).toLocaleDateString() })}</span>
            )}
            {promo.usageLimit && (
              <span>
                {t("usedCount", { used: promo.usedCount, max: promo.usageLimit })}
              </span>
            )}
            {promo.orderType !== "both" && (
              <span className="capitalize">{t("orderTypeOnly", { type: promo.orderType ?? "" })}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggle}
            title={promo.isActive ? t("titleDeactivate") : t("titleActivate")}
            className={`p-1.5 rounded transition ${
              promo.isActive
                ? "text-green-500 hover:text-green-700"
                : "text-gray-400 hover:text-green-500"
            }`}
          >
            {/* Power (not Eye) for active/inactive — the eye metaphor now belongs
                to the Visible/Hidden display model (audit #19). */}
            {promo.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
            title={t("titleDuplicate")}
          >
            <Copy className="w-4 h-4" />
          </button>
          <Link
            href={`/admin/promotions/${promo.id}/edit`}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
            title={t("titleEdit")}
          >
            <Edit2 className="w-4 h-4" />
          </Link>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PromotionsClient ──────────────────────────────────────────────────────

type TabFilter = "all" | "promotions" | "active" | "inactive" | "expired" | "selfmade" | "premade" | "assigned";

/** Friendly "created for" label for a pre-made (campaign-owned) promo. The
 *  campaign names are PRODUCT names (proper nouns), so they're the same in
 *  every language — no translation key needed. Luigi 2026-06-09. */
/** A promotion assigned to a specific customer (campaignRef "assigned_manual")
 *  OR to a whole VIP group ("assigned_group:<id>") — both belong in the
 *  Assigned tab, not Pre-made. */
function isGroupRef(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith("assigned_group");
}
function isAssignedRef(ref: string | null | undefined): boolean {
  return !!ref && (ref.startsWith("assigned_manual") || ref.startsWith("assigned_group"));
}

function campaignLabel(ref: string | null | undefined): string | null {
  if (!ref) return null;
  // Kickstarter / Autopilot are product brand names — never translated.
  // "Assigned" is handled at the call site with t() so it localizes.
  if (ref.startsWith("kickstarter")) return "Kickstarter";
  if (ref.startsWith("autopilot")) return "Autopilot";
  return "Campaign";
}

export function PromotionsClient({
  promotions: initial,
  deadPromoIds = [],
}: {
  promotions: any[];
  // Kept for backwards compat with page.tsx — wizard now fetches its own.
  categories?: any[];
  menuItems?: any[];
  /** Promos whose which-dishes picks resolve to NOTHING on the served menu
   *  (dish deleted etc.) — quarantined from the customer page; badge them
   *  here so the owner knows to re-select (Luigi 2026-07-05). */
  deadPromoIds?: string[];
}) {
  const t = useTranslations("admin.promotionsList");
  // Generic "No matches for {query}" already exists in the menu editor — reuse it.
  const tMenu = useTranslations("admin.menuEditor");
  const [promotions, setPromotions] = useState(initial);
  const [tab, setTab] = useState<TabFilter>("all");
  // Name/coupon-code search — 1:1 assigned gift promos make this list long
  // (Luigi 2026-07-19). Client-side, same as the Customers list.
  const [query, setQuery] = useState("");
  const router = useRouter();
  const now = new Date();

  const reloadPromos = async () => {
    const res = await fetch("/api/restaurants/promotions");
    if (res.ok) setPromotions(await res.json());
  };

  const deletePromo = async (id: string) => {
    if (!confirm(t("confirmDeletePromotion"))) return;
    await fetch(`/api/restaurants/promotions/${id}`, { method: "DELETE" });
    toast.success(t("promotionDeleted"));
    await reloadPromos();
    router.refresh();
  };

  const togglePromo = async (promo: any) => {
    await fetch(`/api/restaurants/promotions/${promo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !promo.isActive }),
    });
    await reloadPromos();
  };

  const duplicatePromo = async (promo: any) => {
    // Prefer the dedicated duplicate endpoint (handles entitlement +
    // unique-coupon-code collision detection server-side).
    const res = await fetch(`/api/restaurants/promotions/${promo.id}/duplicate`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success(t("promotionDuplicated"));
      await reloadPromos();
      router.refresh();
    } else {
      let msg = t("errorFailedToDuplicate");
      try {
        const d = await res.json();
        msg = d.error || msg;
      } catch {}
      toast.error(msg);
    }
  };

  const q = query.trim().toLowerCase();
  const filteredPromos = promotions.filter((p) => {
    // Search matches promo NAME and COUPON CODE (case-insensitive substring).
    if (q && !`${p.name ?? ""} ${p.couponCode ?? ""}`.toLowerCase().includes(q)) return false;
    if (tab === "promotions") return true;
    if (tab === "active") return p.isActive;
    if (tab === "inactive") return !p.isActive;
    if (tab === "expired") return p.endsAt && new Date(p.endsAt) < now;
    // Self-made = owner-created (no campaignRef); Pre-made = auto-created by a
    // Kickstarter/Autopilot campaign. Assigned = 1:1 gifts (campaignRef
    // "assigned_manual") — kept out of Pre-made so per-customer gifts don't
    // flood it (audit confusing#18). Luigi 2026-06-09 / 2026-06-26.
    if (tab === "selfmade") return !p.campaignRef;
    if (tab === "premade") return !!p.campaignRef && !isAssignedRef(p.campaignRef);
    if (tab === "assigned") return isAssignedRef(p.campaignRef);
    return true;
  });

  const totalAll = promotions.length;
  const totalActive = promotions.filter((p) => p.isActive).length;
  const totalInactive = promotions.filter((p) => !p.isActive).length;
  const totalExpired = promotions.filter((p) => p.endsAt && new Date(p.endsAt) < now).length;

  const assignedCount = promotions.filter((p) => isAssignedRef(p.campaignRef)).length;
  const premadeCount = promotions.filter((p) => !!p.campaignRef && !isAssignedRef(p.campaignRef)).length;
  const selfmadeCount = promotions.filter((p) => !p.campaignRef).length;

  const TABS: { id: TabFilter; label: string; count: number }[] = [
    { id: "all",        label: t("tabAll"),         count: totalAll },
    { id: "selfmade",   label: t("tabSelfMade"),    count: selfmadeCount },
    { id: "premade",    label: t("tabPreMade"),     count: premadeCount },
    // Only surface the Assigned tab once at least one gift exists.
    ...(assignedCount > 0 ? [{ id: "assigned" as TabFilter, label: t("tabAssigned"), count: assignedCount }] : []),
    { id: "active",     label: t("tabActive"),      count: totalActive },
    { id: "inactive",   label: t("tabInactive"),    count: totalInactive },
    { id: "expired",    label: t("tabExpired"),      count: totalExpired },
  ];

  const isEmpty = filteredPromos.length === 0;

  return (
    <div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 flex items-start gap-3">
        <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          {t.rich("stackingInfo", {
            label: (c) => <span className="font-semibold">{c}</span>,
            master: (c) => <span className="font-bold text-yellow-700">{c}</span>,
            exclusive: (c) => <span className="font-bold text-amber-700">{c}</span>,
            standard: (c) => <span className="font-bold text-gray-700">{c}</span>,
          })}
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap items-center">
        {TABS.map((tab_item) => (
          <button
            key={tab_item.id}
            onClick={() => setTab(tab_item.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              tab === tab_item.id
                ? "bg-emerald-500 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"
            }`}
          >
            {tab_item.label}{" "}
            <span
              className={`ml-1 text-xs ${
                tab === tab_item.id ? "opacity-80" : "text-gray-400"
              }`}
            >
              ({tab_item.count})
            </span>
          </button>
        ))}
        {/* Name / coupon-code search (matches the Customers list styling). */}
        <div className="ml-auto relative flex-1 max-w-xs min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-gray-50 border border-gray-200 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {isEmpty ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-gray-100 shadow-sm">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          {q ? (
            /* Empty because of the search box, not because there are no promos. */
            <p className="text-gray-500 font-medium">{tMenu("noMatchesFor", { query: query.trim() })}</p>
          ) : (
            <>
              <p className="text-gray-500 font-medium">{t("emptyStateTitle")}</p>
              <p className="text-sm text-gray-400 mt-1">
                {t.rich("emptyStateBody", {
                  newPromo: (c) => <span className="font-semibold text-emerald-600">{c}</span>,
                })}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPromos.map((p) => (
            <PromoCard
              key={p.id}
              promo={p}
              deadTargets={deadPromoIds.includes(p.id)}
              onDelete={() => deletePromo(p.id)}
              onToggle={() => togglePromo(p)}
              onDuplicate={() => duplicatePromo(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
