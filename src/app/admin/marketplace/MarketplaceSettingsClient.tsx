"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles, Eye, EyeOff, Loader2, Check, X, ExternalLink,
  Tag, Image as ImageIcon, AlertCircle, Star, TrendingUp,
  DollarSign, ShoppingBag, Trophy,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * /admin/marketplace editor. Two-column layout:
 *   - Left: form (toggle, tagline, short desc, banner URL, categories, tags)
 *   - Right: live preview of the marketplace tile so the owner sees
 *            exactly what customers will see on /marketplace
 *
 * Categories + tags are chip-style. Add via "Enter" in the input,
 * remove via X on each chip. Capped at 8 each server-side.
 */

type Listing = {
  id: string;
  isListed: boolean;
  marketplaceTagline: string;
  marketplaceShortDesc: string;
  marketplaceBanner: string;
  marketplaceCategories: string[];
  marketplaceTags: string[];
  marketplaceFeatured: boolean;
};

type Restaurant = {
  name: string;
  slug: string;
  city: string | null;
  cuisineType: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
};

type Stats = {
  currentMonthOrders: number;
  currentMonthRevenue: number;
  lifetimeSavingsVsUberEatsCents: number;
  currentMonthStartedAt: string;
  billing: {
    /** $249.99 hard cap — once accruedCents hits this, the rest of the
     *  month's orders are pure margin for the restaurant. */
    capCents: number;
    /** Uncapped per-order accrual: $3 × month-to-date order count. */
    accruedCents: number;
    /** What we'll actually bill: min(accruedCents, capCents). */
    effectiveCents: number;
    /** True once the cap has been reached. */
    capHit: boolean;
  };
};

export function MarketplaceSettingsClient({
  initialListing,
  restaurant,
  stats,
  isSuperadmin,
}: {
  initialListing: Listing;
  restaurant: Restaurant;
  stats: Stats;
  isSuperadmin: boolean;
}) {
  const t = useTranslations("admin.marketplaceSettings");
  const router = useRouter();
  const [listing, setListing] = useState<Listing>(initialListing);
  const [saving, setSaving] = useState(false);
  const [catDraft, setCatDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  const update = <K extends keyof Listing>(key: K, value: Listing[K]) => {
    setListing((l) => ({ ...l, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/marketplace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isListed: listing.isListed,
          marketplaceTagline: listing.marketplaceTagline,
          marketplaceShortDesc: listing.marketplaceShortDesc,
          marketplaceBanner: listing.marketplaceBanner,
          marketplaceCategories: listing.marketplaceCategories,
          marketplaceTags: listing.marketplaceTags,
          ...(isSuperadmin
            ? { marketplaceFeatured: listing.marketplaceFeatured }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("saveError"));
        return;
      }
      toast.success(t("saveSuccess"));
      setDirty(false);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    const v = catDraft.trim().toLowerCase();
    if (!v || listing.marketplaceCategories.includes(v) || listing.marketplaceCategories.length >= 8) return;
    update("marketplaceCategories", [...listing.marketplaceCategories, v]);
    setCatDraft("");
  };
  const removeCategory = (c: string) => {
    update("marketplaceCategories", listing.marketplaceCategories.filter((x) => x !== c));
  };

  const addTag = () => {
    const v = tagDraft.trim();
    if (!v || listing.marketplaceTags.includes(v) || listing.marketplaceTags.length >= 8) return;
    update("marketplaceTags", [...listing.marketplaceTags, v]);
    setTagDraft("");
  };
  const removeTag = (tag: string) => {
    update("marketplaceTags", listing.marketplaceTags.filter((x) => x !== tag));
  };

  const previewBanner = listing.marketplaceBanner || restaurant.bannerUrl;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-500" />
            {t("pageTitle")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t.rich("pageSubtitle", {
              name: restaurant.name,
              semibold: (c) => <span className="font-semibold">{c}</span>,
            })}
          </p>
        </div>
        {/* Plain <a> rather than next/link <Link> — the marketplace
            listing page does a server-side redirect that next/link's
            client-side prefetch + soft-navigation interaction has
            been flaky on (Luigi 2026-06-01: "view your listing link
            here doesnt work"). Adding rel + noopener for safety. */}
        <a
          href={`/marketplace/${restaurant.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5"
        >
          {t("viewLiveListing")} <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Listed/paused state banner */}
      <div className={`rounded-2xl p-4 mb-6 flex items-start gap-3 border ${
        listing.isListed
          ? "bg-green-50 border-green-200 text-green-900"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          listing.isListed ? "bg-green-500 text-white" : "bg-amber-500 text-white"
        }`}>
          {listing.isListed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">
            {listing.isListed ? t("statusLiveHeading") : t("statusPausedHeading")}
          </p>
          <p className="text-xs mt-0.5 opacity-90">
            {listing.isListed
              ? t("statusLiveDetail")
              : t("statusPausedDetail")}
          </p>
        </div>
        <button
          onClick={() => update("isListed", !listing.isListed)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
            listing.isListed
              ? "bg-white text-amber-700 hover:bg-amber-100 border border-amber-300"
              : "bg-green-500 text-white hover:bg-green-600"
          }`}
        >
          {listing.isListed ? t("buttonPause") : t("buttonGoLive")}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── LEFT: Form ───────────────────────────────────── */}
        <div className="space-y-5">
          {/* Tagline */}
          <Field label={t("fieldTaglineLabel")} hint={t("fieldTaglineHint")}>
            <input
              type="text"
              value={listing.marketplaceTagline}
              onChange={(e) => update("marketplaceTagline", e.target.value)}
              maxLength={200}
              placeholder={t("fieldTaglinePlaceholder")}
              className="w-full rounded-xl px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <CharCount value={listing.marketplaceTagline} max={200} />
          </Field>

          {/* Short description */}
          <Field
            label={t("fieldShortDescLabel")}
            hint={t("fieldShortDescHint")}
          >
            <textarea
              value={listing.marketplaceShortDesc}
              onChange={(e) => update("marketplaceShortDesc", e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t("fieldShortDescPlaceholder")}
              className="w-full rounded-xl px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
            <CharCount value={listing.marketplaceShortDesc} max={500} />
          </Field>

          {/* Banner URL override */}
          <Field
            label={t("fieldBannerLabel")}
            hint={t("fieldBannerHint")}
          >
            <div className="flex gap-2">
              <input
                type="url"
                value={listing.marketplaceBanner}
                onChange={(e) => update("marketplaceBanner", e.target.value)}
                placeholder="https://…"
                className="flex-1 rounded-xl px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {listing.marketplaceBanner && (
                <button
                  onClick={() => update("marketplaceBanner", "")}
                  className="px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                  title={t("buttonClearOverrideTitle")}
                >
                  {t("buttonClear")}
                </button>
              )}
            </div>
          </Field>

          {/* Categories */}
          <Field
            label={t("fieldCategoriesLabel")}
            hint={t("fieldCategoriesHint")}
          >
            <div className="flex flex-wrap gap-1.5 mb-2">
              {listing.marketplaceCategories.map((c) => (
                <Chip key={c} label={c} onRemove={() => removeCategory(c)} variant="cat" />
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={catDraft}
                onChange={(e) => setCatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder={t("fieldCategoriesPlaceholder")}
                maxLength={40}
                className="flex-1 rounded-xl px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                disabled={listing.marketplaceCategories.length >= 8}
              />
              <button
                onClick={addCategory}
                disabled={!catDraft.trim() || listing.marketplaceCategories.length >= 8}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("buttonAdd")}
              </button>
            </div>
          </Field>

          {/* Tags */}
          <Field
            label={t("fieldTagsLabel")}
            hint={t("fieldTagsHint")}
          >
            <div className="flex flex-wrap gap-1.5 mb-2">
              {listing.marketplaceTags.map((tag) => (
                <Chip key={tag} label={tag} onRemove={() => removeTag(tag)} variant="tag" />
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t("fieldTagsPlaceholder")}
                maxLength={40}
                className="flex-1 rounded-xl px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                disabled={listing.marketplaceTags.length >= 8}
              />
              <button
                onClick={addTag}
                disabled={!tagDraft.trim() || listing.marketplaceTags.length >= 8}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("buttonAdd")}
              </button>
            </div>
          </Field>

          {/* Superadmin-only: featured */}
          {isSuperadmin && (
            <Field
              label={t("fieldFeaturedLabel")}
              hint={t("fieldFeaturedHint")}
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={listing.marketplaceFeatured}
                  onChange={(e) => update("marketplaceFeatured", e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="flex items-center gap-1.5">
                  <Star className={`w-4 h-4 ${listing.marketplaceFeatured ? "text-emerald-500 fill-emerald-500" : "text-gray-300"}`} />
                  {t("fieldFeaturedCheckboxLabel")}
                </span>
              </label>
            </Field>
          )}

          {/* Save bar */}
          <div className="sticky bottom-4 z-10 bg-white border border-gray-200 rounded-2xl shadow-lg p-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              {dirty ? t("unsavedChanges") : t("allChangesSaved")}
            </span>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="px-5 py-2 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? t("buttonSaving") : t("buttonSaveChanges")}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Live preview ───────────────────────────────── */}
        <div>
          <div className="sticky top-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> {t("livePreviewLabel")}
            </p>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${
                listing.marketplaceFeatured ? "border-emerald-300 ring-2 ring-emerald-100" : "border-gray-100"
              }`}>
                <div className="relative h-32 sm:h-40 bg-gradient-to-br from-emerald-200 to-emerald-100 overflow-hidden">
                  {previewBanner && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewBanner} alt={restaurant.name} className="w-full h-full object-cover" />
                  )}
                  {listing.marketplaceFeatured && (
                    <span className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3 fill-white" /> {t("badgeFeatured")}
                    </span>
                  )}
                  {restaurant.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={restaurant.logoUrl}
                      alt=""
                      className="absolute bottom-2 left-2 w-12 h-12 rounded-xl border-2 border-white shadow-md object-cover bg-white"
                    />
                  )}
                </div>
                <div className="p-3.5">
                  <h3 className="font-bold text-gray-900 leading-tight truncate">{restaurant.name}</h3>
                  {listing.marketplaceTagline && (
                    <p className="text-xs text-gray-600 line-clamp-1 italic">{listing.marketplaceTagline}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    {restaurant.city && <span>{restaurant.city}</span>}
                    {restaurant.cuisineType && <span>· {restaurant.cuisineType}</span>}
                  </div>
                  {listing.marketplaceTags.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {listing.marketplaceTags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {!listing.isListed && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {t.rich("previewPausedNotice", {
                      strong: (c) => <strong>{c}</strong>,
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* ── Lifetime savings hero card ── */}
            <div className="mt-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider opacity-90">
                  {t("lifetimeSavingsHeading")}
                </span>
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {formatCurrency(stats.lifetimeSavingsVsUberEatsCents / 100)}
              </div>
              <p className="text-xs mt-1.5 opacity-90 leading-relaxed">
                {t("lifetimeSavingsDetail")}
              </p>
            </div>

            {/* ── This-month panel ── */}
            <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  {t("thisBillingMonth")}
                </p>
                <span className="text-[10px] text-gray-400">
                  {t("since", { date: new Date(stats.currentMonthStartedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCell
                  icon={<ShoppingBag className="w-3.5 h-3.5" />}
                  label={t("statOrders")}
                  value={String(stats.currentMonthOrders)}
                  color="text-blue-600"
                  bg="bg-blue-50"
                />
                <StatCell
                  icon={<DollarSign className="w-3.5 h-3.5" />}
                  label={t("statRevenue")}
                  value={formatCurrency(stats.currentMonthRevenue, (restaurant as any).currency)}
                  color="text-emerald-600"
                  bg="bg-emerald-50"
                />
              </div>

              {/* Marketplace is included FREE (Luigi 2026-07-14): no monthly or
                  per-order fee. This panel replaces the old monthly/PAYG billing
                  cards; the order/revenue StatCells above still show volume. */}
              <div className="mt-4 rounded-xl p-3 border border-emerald-200 bg-emerald-50">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    {t("billingHeading")}
                  </span>
                </div>
                <div className="text-xl font-bold text-emerald-900">{t("includedFree")}</div>
                <p className="text-[11px] mt-1 leading-snug text-emerald-800">{t("includedDetail")}</p>
              </div>

              {stats.currentMonthOrders === 0 && (
                <p className="mt-3 text-[11px] text-gray-500 italic leading-relaxed">
                  {t.rich("noOrdersYet", {
                    link: (c) => <Link href="/marketplace" className="text-emerald-600 hover:underline">{c}</Link>,
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  return (
    <div className={`text-[10px] mt-0.5 text-right ${len > max * 0.9 ? "text-amber-600" : "text-gray-400"}`}>
      {len} / {max}
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${bg}`}>
      <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${color}`}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}

function Chip({
  label,
  onRemove,
  variant,
}: {
  label: string;
  onRemove: () => void;
  variant: "cat" | "tag";
}) {
  const t = useTranslations("admin.marketplaceSettings");
  const colors = variant === "cat"
    ? "bg-amber-100 text-amber-700"
    : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${colors}`}>
      {variant === "cat" ? <Tag className="w-3 h-3" /> : null}
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-black/10 rounded-full p-0.5"
        title={t("buttonRemoveTitle")}
        type="button"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
