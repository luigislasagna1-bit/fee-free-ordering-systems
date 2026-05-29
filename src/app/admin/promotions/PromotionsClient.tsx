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
import { useRouter } from "next/navigation";
import {
  Tag, Edit2, Trash2, X, Copy, Eye, EyeOff,
  Star, Crown, Shield, Percent, Gift, Package, Zap, Truck,
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

function stackingBadge(rule: string) {
  if (rule === "master")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1">
        <Star className="w-3 h-3" />
        Master
      </span>
    );
  if (rule === "exclusive")
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
        <Crown className="w-3 h-3" />
        Exclusive
      </span>
    );
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Standard</span>;
}

// ─── Coupon modal (kept — coupons are still edit-in-place) ──────────────────

const emptyCouponForm = {
  code: "",
  description: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: "",
  minimumOrder: "0",
  maxUses: "",
  expiresAt: "",
};

function CouponModal({
  coupon,
  onClose,
  onSaved,
}: {
  coupon?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    coupon
      ? {
          code: coupon.code,
          description: coupon.description || "",
          discountType: coupon.discountType as "percentage" | "fixed",
          discountValue: String(coupon.discountValue),
          minimumOrder: String(coupon.minimumOrder),
          maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
          expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
        }
      : emptyCouponForm,
  );
  const [saving, setSaving] = useState(false);
  const isNew = !coupon;

  const save = async () => {
    if (!form.code.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    if (!form.discountValue) {
      toast.error("Discount value is required");
      return;
    }
    setSaving(true);
    const body = {
      code: form.code.toUpperCase().trim(),
      description: form.description || null,
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      minimumOrder: parseFloat(form.minimumOrder) || 0,
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
    };
    try {
      const url = isNew
        ? "/api/restaurants/coupons"
        : `/api/restaurants/coupons/${coupon.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try {
          const d = await res.json();
          msg = d.error || msg;
        } catch {}
        throw new Error(msg);
      }
      toast.success(isNew ? "Coupon created!" : "Coupon updated!");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {isNew ? "New Coupon Code" : "Edit Coupon"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Coupon Code *
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase font-mono"
                placeholder="SAVE10"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount Type
              </label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.discountType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountType: e.target.value as "percentage" | "fixed",
                  }))
                }
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder={form.discountType === "percentage" ? "10" : "5.00"}
                value={form.discountValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountValue: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min. Order ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="0"
                value={form.minimumOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimumOrder: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Uses
              </label>
              <input
                type="number"
                min="1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="Unlimited"
                value={form.maxUses}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxUses: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires At
              </label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expiresAt: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="10% off your first order"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition"
          >
            {saving ? "Saving..." : isNew ? "Create Coupon" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function CouponCard({
  coupon,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
}: {
  coupon: any;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
  const discountLabel =
    coupon.discountType === "percentage"
      ? `${coupon.discountValue}% off`
      : `$${parseFloat(coupon.discountValue).toFixed(2)} off`;

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
        coupon.isActive && !isExpired
          ? "border-gray-100"
          : "border-gray-100 opacity-60"
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            coupon.isActive ? "bg-blue-50" : "bg-gray-50"
          }`}
        >
          <Tag
            className={`w-5 h-5 ${
              coupon.isActive ? "text-blue-500" : "text-gray-400"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded">
              COUPON
            </span>
            <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">
              {coupon.code}
            </span>
            {!coupon.isActive && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                Inactive
              </span>
            )}
            {isExpired && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                Expired
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-gray-700">
            {discountLabel}
            {coupon.minimumOrder > 0 && (
              <span className="text-gray-400 font-normal">
                {" "}
                (min ${parseFloat(coupon.minimumOrder).toFixed(2)})
              </span>
            )}
          </div>
          {coupon.description && (
            <div className="text-xs text-gray-400 truncate mt-0.5">
              {coupon.description}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            <span>
              {coupon.usedCount}/{coupon.maxUses ?? "∞"} used
            </span>
            {coupon.expiresAt && (
              <span>Expires {new Date(coupon.expiresAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggle}
            title={coupon.isActive ? "Deactivate" : "Activate"}
            className={`p-1.5 rounded transition ${
              coupon.isActive
                ? "text-green-500 hover:text-green-700"
                : "text-gray-400 hover:text-green-500"
            }`}
          >
            {coupon.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
            title="Duplicate"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
          >
            <Edit2 className="w-4 h-4" />
          </button>
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

function PromoCard({
  promo,
  onDelete,
  onToggle,
  onDuplicate,
}: {
  promo: any;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const typeInfo =
    PROMO_TYPE_DISPLAY.find((t) => t.value === promo.promotionType) ??
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
                Inactive
              </span>
            )}
            {stackingBadge(promo.stackingRule)}
            {promo.couponCode && (
              <span className="text-xs bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded border border-blue-100">
                {promo.couponCode}
              </span>
            )}
            {promo.autoApply && !promo.couponCode && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                Auto
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500">{typeInfo.label}</div>
          {promo.description && (
            <div className="text-xs text-gray-400 truncate mt-0.5">
              {promo.description}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            {promo.minimumOrder > 0 && <span>Min ${promo.minimumOrder}</span>}
            {promo.endsAt && (
              <span>Ends {new Date(promo.endsAt).toLocaleDateString()}</span>
            )}
            {promo.usageLimit && (
              <span>
                {promo.usedCount}/{promo.usageLimit} used
              </span>
            )}
            {promo.orderType !== "both" && (
              <span className="capitalize">{promo.orderType} only</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggle}
            title={promo.isActive ? "Deactivate" : "Activate"}
            className={`p-1.5 rounded transition ${
              promo.isActive
                ? "text-green-500 hover:text-green-700"
                : "text-gray-400 hover:text-green-500"
            }`}
          >
            {promo.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
            title="Duplicate"
          >
            <Copy className="w-4 h-4" />
          </button>
          <Link
            href={`/admin/promotions/${promo.id}/edit`}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded"
            title="Edit"
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

type TabFilter = "all" | "promotions" | "coupons" | "active" | "inactive" | "expired";

export function PromotionsClient({
  promotions: initial,
  coupons: initialCoupons,
}: {
  promotions: any[];
  coupons: any[];
  // Kept for backwards compat with page.tsx — wizard now fetches its own.
  categories?: any[];
  menuItems?: any[];
}) {
  const [promotions, setPromotions] = useState(initial);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [couponModal, setCouponModal] = useState<{ kind: "coupon"; coupon?: any } | null>(null);
  const [tab, setTab] = useState<TabFilter>("all");
  const router = useRouter();
  const now = new Date();

  const reloadPromos = async () => {
    const res = await fetch("/api/restaurants/promotions");
    if (res.ok) setPromotions(await res.json());
  };
  const reloadCoupons = async () => {
    const res = await fetch("/api/restaurants/coupons");
    if (res.ok) setCoupons(await res.json());
  };

  const deletePromo = async (id: string) => {
    if (!confirm("Delete this promotion? This cannot be undone.")) return;
    await fetch(`/api/restaurants/promotions/${id}`, { method: "DELETE" });
    toast.success("Promotion deleted");
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
      toast.success("Promotion duplicated");
      await reloadPromos();
      router.refresh();
    } else {
      let msg = "Failed to duplicate";
      try {
        const d = await res.json();
        msg = d.error || msg;
      } catch {}
      toast.error(msg);
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("Delete this coupon? This cannot be undone.")) return;
    await fetch(`/api/restaurants/coupons/${id}`, { method: "DELETE" });
    toast.success("Coupon deleted");
    await reloadCoupons();
  };

  const toggleCoupon = async (coupon: any) => {
    await fetch(`/api/restaurants/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    await reloadCoupons();
  };

  const duplicateCoupon = async (coupon: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _ca, updatedAt: _ua, usedCount: _uc, ...rest } = coupon;
    const res = await fetch("/api/restaurants/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, code: `${rest.code}_COPY` }),
    });
    if (res.ok) {
      toast.success("Coupon duplicated");
      await reloadCoupons();
    } else {
      let msg = "Failed";
      try {
        const d = await res.json();
        msg = d.error || msg;
      } catch {}
      toast.error(msg);
    }
  };

  const filteredPromos = promotions.filter((p) => {
    if (tab === "coupons") return false;
    if (tab === "promotions") return true;
    if (tab === "active") return p.isActive;
    if (tab === "inactive") return !p.isActive;
    if (tab === "expired") return p.endsAt && new Date(p.endsAt) < now;
    return true;
  });
  const filteredCoupons = coupons.filter((c) => {
    if (tab === "promotions") return false;
    if (tab === "coupons") return true;
    if (tab === "active") return c.isActive && !(c.expiresAt && new Date(c.expiresAt) < now);
    if (tab === "inactive") return !c.isActive;
    if (tab === "expired") return c.expiresAt && new Date(c.expiresAt) < now;
    return true;
  });

  const totalAll = promotions.length + coupons.length;
  const totalActive =
    promotions.filter((p) => p.isActive).length +
    coupons.filter((c) => c.isActive && !(c.expiresAt && new Date(c.expiresAt) < now)).length;
  const totalInactive =
    promotions.filter((p) => !p.isActive).length +
    coupons.filter((c) => !c.isActive).length;
  const totalExpired =
    promotions.filter((p) => p.endsAt && new Date(p.endsAt) < now).length +
    coupons.filter((c) => c.expiresAt && new Date(c.expiresAt) < now).length;

  const TABS: { id: TabFilter; label: string; count: number }[] = [
    { id: "all",        label: "All",          count: totalAll },
    { id: "promotions", label: "Promotions",   count: promotions.length },
    { id: "coupons",    label: "Coupon Codes", count: coupons.length },
    { id: "active",     label: "Active",       count: totalActive },
    { id: "inactive",   label: "Inactive",     count: totalInactive },
    { id: "expired",    label: "Expired",      count: totalExpired },
  ];

  const isEmpty = filteredPromos.length === 0 && filteredCoupons.length === 0;

  return (
    <div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 flex items-start gap-3">
        <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Stacking: </span>
          <span className="font-bold text-yellow-700">Master</span> deals apply alongside everything.{" "}
          <span className="font-bold text-amber-700">Exclusive</span> deals block all others except Masters.{" "}
          <span className="font-bold text-gray-700">Standard</span> deals stack with each other. Coupon codes
          are customer-entered and never auto-applied.
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap items-center">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              tab === t.id
                ? "bg-emerald-500 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"
            }`}
          >
            {t.label}{" "}
            <span
              className={`ml-1 text-xs ${
                tab === t.id ? "opacity-80" : "text-gray-400"
              }`}
            >
              ({t.count})
            </span>
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => setCouponModal({ kind: "coupon" })}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50"
          >
            + New coupon code
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-gray-100 shadow-sm">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">No deals found</p>
          <p className="text-sm text-gray-400 mt-1">
            Create promotions or coupon codes to attract and retain customers.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              href="/admin/promotions/new"
              className="bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-emerald-600 transition"
            >
              Create Promotion
            </Link>
            <button
              onClick={() => setCouponModal({ kind: "coupon" })}
              className="bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-600 transition"
            >
              Create Coupon
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPromos.map((p) => (
            <PromoCard
              key={p.id}
              promo={p}
              onDelete={() => deletePromo(p.id)}
              onToggle={() => togglePromo(p)}
              onDuplicate={() => duplicatePromo(p)}
            />
          ))}
          {filteredCoupons.map((c) => (
            <CouponCard
              key={c.id}
              coupon={c}
              onEdit={() => setCouponModal({ kind: "coupon", coupon: c })}
              onDelete={() => deleteCoupon(c.id)}
              onToggle={() => toggleCoupon(c)}
              onDuplicate={() => duplicateCoupon(c)}
            />
          ))}
        </div>
      )}

      {couponModal?.kind === "coupon" && (
        <CouponModal
          coupon={couponModal.coupon}
          onClose={() => setCouponModal(null)}
          onSaved={() => {
            setCouponModal(null);
            reloadCoupons();
          }}
        />
      )}
    </div>
  );
}
