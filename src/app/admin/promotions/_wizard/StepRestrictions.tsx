"use client";
/**
 * Step 3 — restrictions, display, and final knobs.
 *
 * All eight restriction families (Happy Hour, Cart Value, Expiration,
 * Order Channel, Client Type, Payment, Delivery Area, Frequency,
 * Exclusivity) plus the display + activation surface live here so the
 * owner sees every gate that affects when/how the promo runs in one
 * scroll.
 */

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { PROMO_DEFAULT_IMAGES } from "@/lib/promo-default-images";

export type Step3Form = {
  // Happy Hour
  daysOfWeek: number[];
  usableHourStart: string; // "HH:MM" or ""
  usableHourEnd: string;
  // Cart Value
  minimumOrder: string;
  // Expiration
  startsAt: string; // datetime-local string ""
  endsAt: string;
  // Order channel + customer type
  orderType: string[]; // ["pickup", "delivery", "dine_in", ...]
  customerType: string; // any | new | returning | member
  // Payment / Delivery
  paymentMethodSlugs: string[];
  deliveryZoneIds: string[];
  // Frequency
  usageLimit: string;
  onceLifetimePerClient: boolean;
  // Exclusivity
  stackingRule: string; // standard | exclusive | master
  // Acquisition channel — website | marketplace | both
  channel: string;
  // Display
  displayMode: string; // menu_visible (VISIBLE) | hidden_coupon_only (HIDDEN)
  highlightThreshold: string;
  imageUrl: string;
  // Coupon / activation
  couponCode: string;
  autoApply: boolean;
  // Banner
  showOnBanner: boolean;
  bannerHeadline: string;
  // Active
  isActive: boolean;
};

export function StepRestrictions({
  form,
  setForm,
  paymentMethods,
  deliveryZones,
  currencySymbol = "$",
  isOnMarketplace = false,
  promotionType = "",
}: {
  form: Step3Form;
  setForm: (patch: Partial<Step3Form>) => void;
  paymentMethods: string[]; // restaurant's enabled payment slugs
  deliveryZones: { id: string; name: string }[];
  currencySymbol?: string;
  /** Only restaurants actually listed on the marketplace see the channel
   *  picker — otherwise the choice is meaningless. Luigi 2026-06-09. */
  isOnMarketplace?: boolean;
  /** Used to hide the "Hidden" option for bundle types that need a visible
   *  composer to be orderable (audit dead#2). */
  promotionType?: string;
}) {
  const t = useTranslations("admin.promoStepRestrictions");
  // Bundles are composed from a visible card — coupon code + auto-apply are
  // inert for them, so those controls are hidden (Luigi 2026-06-27).
  const isBundle = ["meal_bundle", "meal_bundle_speciality"].includes(promotionType);

  const DAY_NAMES = [
    t("daySun"),
    t("dayMon"),
    t("dayTue"),
    t("dayWed"),
    t("dayThu"),
    t("dayFri"),
    t("daySat"),
  ];

  const ORDER_CHANNELS: { value: string; label: string }[] = [
    { value: "pickup", label: t("channelPickup") },
    { value: "delivery", label: t("channelDelivery") },
    { value: "dine_in", label: t("channelDineIn") },
    // Value is "take_out" to match the customer order type (Order.type). Legacy
    // promos stored "takeout"; the engine normalizes both. Luigi 2026-06-07.
    { value: "take_out", label: t("channelTakeout") },
    { value: "catering", label: t("channelCatering") },
  ];

  const STACKING_RULES = [
    { value: "standard", label: t("stackingStandardLabel"), desc: t("stackingStandardDesc") },
    { value: "exclusive", label: t("stackingExclusiveLabel"), desc: t("stackingExclusiveDesc") },
    { value: "master", label: t("stackingMasterLabel"), desc: t("stackingMasterDesc") },
  ];

  const CHANNEL_OPTIONS = [
    { value: "website", label: t("channelWebsiteLabel") },
    { value: "marketplace", label: t("channelMarketplaceLabel") },
    { value: "both", label: t("channelBothLabel") },
  ];

  const toggleDay = (d: number) => {
    const days = form.daysOfWeek.includes(d)
      ? form.daysOfWeek.filter((x) => x !== d)
      : [...form.daysOfWeek, d].sort((a, b) => a - b);
    setForm({ daysOfWeek: days });
  };

  const toggleChannel = (c: string) => {
    setForm({
      orderType: form.orderType.includes(c)
        ? form.orderType.filter((x) => x !== c)
        : [...form.orderType, c],
    });
  };

  const togglePayment = (slug: string) => {
    setForm({
      paymentMethodSlugs: form.paymentMethodSlugs.includes(slug)
        ? form.paymentMethodSlugs.filter((s) => s !== slug)
        : [...form.paymentMethodSlugs, slug],
    });
  };

  const toggleZone = (id: string) => {
    setForm({
      deliveryZoneIds: form.deliveryZoneIds.includes(id)
        ? form.deliveryZoneIds.filter((z) => z !== id)
        : [...form.deliveryZoneIds, id],
    });
  };

  return (
    <div className="space-y-7">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-gray-900">{t("pageTitle")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("pageSubtitle")}
        </p>
      </div>

      {/* MARKETPLACE CHANNEL — placed FIRST so it's unmissable. Only shown to
          restaurants actually listed on the marketplace. Luigi 2026-06-09. */}
      {isOnMarketplace && (
        <Section title={t("channelTitle")} subtitle={t("channelSubtitle")}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {CHANNEL_OPTIONS.map((r) => {
              const active = form.channel === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm({ channel: r.value })}
                  className={`flex items-center justify-center p-3 rounded-xl border-2 text-center transition ${
                    active
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 hover:border-emerald-200"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      active ? "text-emerald-700" : "text-gray-700"
                    }`}
                  >
                    {r.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* HAPPY HOUR (days + usable-hour window) */}
      <Section title={t("happyHourTitle")} subtitle={t("happyHourSubtitle")}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            {t("daysOfWeekLabel")}
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {DAY_NAMES.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={`w-11 h-9 rounded-lg border text-xs font-medium transition ${
                  form.daysOfWeek.includes(i)
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-400"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("usableFromLabel")}</label>
            <input
              type="time"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.usableHourStart}
              onChange={(e) => setForm({ usableHourStart: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("usableToLabel")}</label>
            <input
              type="time"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.usableHourEnd}
              onChange={(e) => setForm({ usableHourEnd: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {t("happyHourHint")}
        </p>
      </Section>

      {/* CART VALUE */}
      <Section title={t("cartValueTitle")} subtitle={t("cartValueSubtitle")}>
        <div className="relative w-48">
          <span className="absolute left-3 top-2 text-gray-400 text-sm">{currencySymbol}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            // Pad left enough to clear a MULTI-char currency prefix (e.g. "CA$")
            // so the typed number never overlaps it. Luigi 2026-06-09.
            style={{ paddingLeft: `calc(0.75rem + ${currencySymbol.length}ch + 0.25rem)` }}
            className="w-full border border-gray-300 rounded-lg pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={form.minimumOrder}
            onChange={(e) => setForm({ minimumOrder: e.target.value })}
          />
        </div>
      </Section>

      {/* EXPIRATION */}
      <Section title={t("expirationTitle")} subtitle={t("expirationSubtitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("startsAtLabel")}</label>
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.startsAt}
              onChange={(e) => setForm({ startsAt: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("endsAtLabel")}</label>
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.endsAt}
              onChange={(e) => setForm({ endsAt: e.target.value })}
            />
          </div>
        </div>
      </Section>

      {/* ORDER CHANNEL */}
      <Section title={t("orderChannelTitle")} subtitle={t("orderChannelSubtitle")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ORDER_CHANNELS.map((c) => (
            <label
              key={c.value}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={form.orderType.includes(c.value)}
                onChange={() => toggleChannel(c.value)}
                className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700">{c.label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* CLIENT TYPE */}
      <Section title={t("clientTypeTitle")} subtitle={t("clientTypeSubtitle")}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { value: "any", label: t("clientTypeAny") },
            { value: "new", label: t("clientTypeNew") },
            { value: "returning", label: t("clientTypeReturning") },
            { value: "member", label: t("clientTypeMember") },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setForm({ customerType: opt.value })}
              className={`py-2 px-3 rounded-lg border-2 text-sm transition ${
                form.customerType === opt.value
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                  : "border-gray-200 text-gray-600 hover:border-emerald-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      {/* PAYMENT */}
      <Section
        title={t("paymentTitle")}
        subtitle={t("paymentSubtitle")}
      >
        {paymentMethods.length === 0 ? (
          <p className="text-xs text-gray-400">
            {t("paymentNoMethods")}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {paymentMethods.map((slug) => (
              <label
                key={slug}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={form.paymentMethodSlugs.includes(slug)}
                  onChange={() => togglePayment(slug)}
                  className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700 capitalize">
                  {slug.replace(/_/g, " ")}
                </span>
              </label>
            ))}
          </div>
        )}
      </Section>

      {/* DELIVERY AREA (only when delivery is a chosen channel) */}
      {form.orderType.includes("delivery") && (
        <Section
          title={t("deliveryAreaTitle")}
          subtitle={t("deliveryAreaSubtitle")}
        >
          {deliveryZones.length === 0 ? (
            <p className="text-xs text-gray-400">
              {t("deliveryAreaNoZones")}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {deliveryZones.map((z) => (
                <label
                  key={z.id}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={form.deliveryZoneIds.includes(z.id)}
                    onChange={() => toggleZone(z.id)}
                    className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{z.name}</span>
                </label>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* FREQUENCY */}
      <Section title={t("frequencyTitle")} subtitle={t("frequencySubtitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("usageLimitLabel")}
            </label>
            <input
              type="number"
              min="1"
              className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.usageLimit}
              onChange={(e) => setForm({ usageLimit: e.target.value })}
              placeholder={t("usageLimitPlaceholder")}
            />
          </div>
          <Toggle
            label={t("oncePerCustomerLabel")}
            sub={t("oncePerCustomerSub")}
            checked={form.onceLifetimePerClient}
            onChange={(v) => setForm({ onceLifetimePerClient: v })}
          />
        </div>
      </Section>

      {/* EXCLUSIVITY */}
      <Section title={t("exclusivityTitle")} subtitle={t("exclusivitySubtitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {STACKING_RULES.map((r) => {
            const active = form.stackingRule === r.value;
            return (
              <button
                key={r.value}
                onClick={() => setForm({ stackingRule: r.value })}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition ${
                  active
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-emerald-200"
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    active ? "text-emerald-700" : "text-gray-700"
                  }`}
                >
                  {r.label}
                </span>
                <span className="text-xs text-gray-500 leading-snug">{r.desc}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* VISIBILITY & REDEMPTION — Visible vs Hidden + how it applies.
          Consolidates the old Display Mode / Activation / Banner sections and
          drops the dead Limited Showtime + "popup" mode (Luigi 2026-06-26). */}
      <Section title={t("displayModeTitle")} subtitle={t("displayModeSubtitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { value: "menu_visible", label: t("displayModeMenuVisibleLabel"), desc: t("displayModeMenuVisibleDesc") },
            // Bundles need a visible composer to be orderable — a Hidden
            // (code-only) bundle is permanently inert, so don't offer it for
            // bundle types (audit dead#2).
            ...(["meal_bundle", "meal_bundle_speciality"].includes(promotionType)
              ? []
              : [{ value: "hidden_coupon_only", label: t("displayModeCouponOnlyLabel"), desc: t("displayModeCouponOnlyDesc") }]),
          ].map((opt) => {
            const active = form.displayMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  opt.value === "hidden_coupon_only"
                    ? setForm({ displayMode: "hidden_coupon_only", autoApply: false, showOnBanner: false })
                    : setForm({ displayMode: "menu_visible" })
                }
                className={`text-left p-3 rounded-xl border-2 transition ${
                  active ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-200"
                }`}
              >
                <div className={`text-sm font-semibold ${active ? "text-emerald-700" : "text-gray-700"}`}>{opt.label}</div>
                <div className="text-xs text-gray-500 leading-snug">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Visible-only: how it applies (auto vs code) + banner pinning. */}
        {form.displayMode !== "hidden_coupon_only" && (
          <div className="mt-4 space-y-3">
            {/* Bundles are BUILT from a visible "Build your deal" card — a coupon
                code can't open the composer and auto-apply doesn't apply, so
                those controls are hidden for bundle types (Luigi 2026-06-27). */}
            {isBundle ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
                💡 Customers build this bundle from a “Build your deal” card on your menu. Pin it to the banner below so it’s easy to find. (A bundle can’t be auto-applied or unlocked by a code.)
              </p>
            ) : (
              <Toggle
                label={t("autoApplyLabel")}
                sub={form.autoApply ? t("autoApplyOnSub") : t("autoApplyOffSub")}
                checked={form.autoApply}
                onChange={(v) => setForm({ autoApply: v })}
              />
            )}
            <Toggle
              label={t("showOnBannerLabel")}
              sub={t("showOnBannerSub")}
              checked={form.showOnBanner}
              onChange={(v) => setForm({ showOnBanner: v })}
            />
            {form.showOnBanner && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t("bannerHeadlineLabel")} <span className="text-gray-400">{t("bannerHeadlineOptional")}</span>
                </label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={form.bannerHeadline}
                  onChange={(e) => setForm({ bannerHeadline: e.target.value })}
                  placeholder={t("bannerHeadlinePlaceholder")}
                  maxLength={80}
                />
              </div>
            )}
          </div>
        )}

        {/* Hidden: code-only explainer. */}
        {form.displayMode === "hidden_coupon_only" && (
          <p className="mt-3 text-xs text-gray-500">{t("hiddenCodeInfo")}</p>
        )}

        {/* Coupon code — optional when auto-applying, REQUIRED otherwise (hidden,
            or visible-but-not-auto). The server enforces the same invariant.
            Hidden for bundles: a code can't open the bundle composer, so it's
            inert there (Luigi 2026-06-27). */}
        {!isBundle && (
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">
            {t("couponCodeLabel")}{" "}
            {!form.autoApply ? (
              <span className="text-red-500 font-semibold">{t("couponCodeRequired")}</span>
            ) : (
              <span className="text-gray-400 font-normal">{t("couponCodeOptional")}</span>
            )}
          </label>
          <input
            className={`w-full sm:w-72 border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:ring-2 focus:outline-none ${
              !form.autoApply && !form.couponCode.trim()
                ? "border-red-300 focus:ring-red-500"
                : "border-gray-300 focus:ring-emerald-500"
            }`}
            value={form.couponCode}
            onChange={(e) => setForm({ couponCode: e.target.value.toUpperCase() })}
            placeholder={t("couponCodePlaceholder")}
          />
          {!form.autoApply && !form.couponCode.trim() && (
            <p className="text-xs text-red-500 mt-1">{t("couponCodeMissingError")}</p>
          )}
        </div>
        )}
      </Section>

      {/* HIGHLIGHT THRESHOLD + IMAGE */}
      <Section title={t("displayDetailsTitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("highlightThresholdLabel")}
            </label>
            <div className="relative w-40">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">{currencySymbol}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                style={{ paddingLeft: `calc(0.75rem + ${currencySymbol.length}ch + 0.25rem)` }}
                className="w-full border border-gray-300 rounded-lg pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.highlightThreshold}
                onChange={(e) => setForm({ highlightThreshold: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {t("highlightThresholdHint")}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">{t("promoCardImageLabel")}</label>
            {/* Default-image gallery — pick one of our designed backgrounds
                with a click. Shows a check mark on the active one. */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PROMO_DEFAULT_IMAGES.map((opt) => {
                const active = form.imageUrl === opt.url;
                return (
                  <button
                    key={opt.url}
                    type="button"
                    onClick={() => setForm({ imageUrl: active ? "" : opt.url })}
                    title={opt.description}
                    className={`relative rounded-lg overflow-hidden border-2 transition aspect-[2/1] ${
                      active
                        ? "border-emerald-500 ring-2 ring-emerald-200"
                        : "border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    <img
                      src={opt.url}
                      alt={opt.label}
                      className="w-full h-full object-cover"
                    />
                    {active && (
                      <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                      <div className="text-[10px] font-semibold text-white text-left">
                        {opt.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 mb-2">{t("orUploadOwn")}</div>
            <ImageUpload
              value={form.imageUrl}
              onChange={(url) => setForm({ imageUrl: url })}
              aspectRatio="wide"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t("imageUploadHint")}
            </p>
          </div>
        </div>
      </Section>

      {/* ACTIVE */}
      <div className="border-t pt-5">
        <Toggle
          label={t("promoIsActiveLabel")}
          sub={t("promoIsActiveSub")}
          checked={form.isActive}
          onChange={(v) => setForm({ isActive: v })}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {sub && <div className="text-xs text-gray-500 leading-snug">{sub}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 rounded-full transition flex-shrink-0 mt-1 ${
          checked ? "bg-emerald-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition mt-0.5 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
