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

import { Plus, Trash2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { PROMO_DEFAULT_IMAGES } from "@/lib/promo-default-images";

export type ShowtimeSchedule = {
  dayOfWeek: number;
  hourStart: number; // minutes since midnight
  hourEnd: number;
};

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
  // Limited Showtime (display-time gate)
  limitedShowtimeSchedules: ShowtimeSchedule[];
  // Display
  displayMode: string; // menu_visible | hidden_coupon_only | popup
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

function hhmmToMin(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return Math.max(0, Math.min(1440, (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)));
}

function minToHHMM(min: number): string {
  const m = Math.max(0, Math.min(1440, Math.floor(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function StepRestrictions({
  form,
  setForm,
  paymentMethods,
  deliveryZones,
  currencySymbol = "$",
  isOnMarketplace = false,
}: {
  form: Step3Form;
  setForm: (patch: Partial<Step3Form>) => void;
  paymentMethods: string[]; // restaurant's enabled payment slugs
  deliveryZones: { id: string; name: string }[];
  currencySymbol?: string;
  /** Only restaurants actually listed on the marketplace see the channel
   *  picker — otherwise the choice is meaningless. Luigi 2026-06-09. */
  isOnMarketplace?: boolean;
}) {
  const t = useTranslations("admin.promoStepRestrictions");

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

  const addShowtime = () => {
    setForm({
      limitedShowtimeSchedules: [
        ...form.limitedShowtimeSchedules,
        { dayOfWeek: 1, hourStart: 720, hourEnd: 900 },
      ],
    });
  };

  const updateShowtime = (idx: number, patch: Partial<ShowtimeSchedule>) => {
    setForm({
      limitedShowtimeSchedules: form.limitedShowtimeSchedules.map((s, i) =>
        i === idx ? { ...s, ...patch } : s,
      ),
    });
  };

  const removeShowtime = (idx: number) => {
    setForm({
      limitedShowtimeSchedules: form.limitedShowtimeSchedules.filter((_, i) => i !== idx),
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
            className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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

      {/* MARKETPLACE CHANNEL — only shown to restaurants actually listed on
          the marketplace (the choice is meaningless otherwise). Luigi 2026-06-09. */}
      {isOnMarketplace && (
        <Section title={t("channelTitle")} subtitle={t("channelSubtitle")}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {CHANNEL_OPTIONS.map((r) => {
              const active = form.channel === r.value;
              return (
                <button
                  key={r.value}
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

      {/* LIMITED SHOWTIME (visibility windows) */}
      <Section
        title={t("limitedShowtimeTitle")}
        subtitle={t("limitedShowtimeSubtitle")}
      >
        <div className="space-y-2">
          {form.limitedShowtimeSchedules.length === 0 && (
            <p className="text-xs text-gray-400">
              {t("limitedShowtimeEmpty")}
            </p>
          )}
          {form.limitedShowtimeSchedules.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-white"
            >
              <select
                value={s.dayOfWeek}
                onChange={(e) =>
                  updateShowtime(i, { dayOfWeek: parseInt(e.target.value, 10) })
                }
                className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {DAY_NAMES.map((d, idx) => (
                  <option key={idx} value={idx}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={minToHHMM(s.hourStart)}
                onChange={(e) =>
                  updateShowtime(i, { hourStart: hhmmToMin(e.target.value) })
                }
                className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-xs text-gray-400">{t("showtimeTo")}</span>
              <input
                type="time"
                value={minToHHMM(s.hourEnd)}
                onChange={(e) =>
                  updateShowtime(i, { hourEnd: hhmmToMin(e.target.value) })
                }
                className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                onClick={() => removeShowtime(i)}
                className="ml-auto p-1.5 text-gray-300 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addShowtime}
            className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> {t("addShowtime")}
          </button>
        </div>
      </Section>

      {/* DISPLAY MODE */}
      <Section title={t("displayModeTitle")} subtitle={t("displayModeSubtitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            {
              value: "menu_visible",
              label: t("displayModeMenuVisibleLabel"),
              desc: t("displayModeMenuVisibleDesc"),
            },
            {
              value: "hidden_coupon_only",
              label: t("displayModeCouponOnlyLabel"),
              desc: t("displayModeCouponOnlyDesc"),
            },
            {
              value: "popup",
              label: t("displayModePopupLabel"),
              desc: t("displayModePopupDesc"),
            },
          ].map((opt) => {
            const active = form.displayMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setForm({ displayMode: opt.value })}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  active
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-emerald-200"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    active ? "text-emerald-700" : "text-gray-700"
                  }`}
                >
                  {opt.label}
                </div>
                <div className="text-xs text-gray-500 leading-snug">{opt.desc}</div>
              </button>
            );
          })}
        </div>
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
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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

      {/* ACTIVATION */}
      <Section title={t("activationTitle")} subtitle={t("activationSubtitle")}>
        <Toggle
          label={t("autoApplyLabel")}
          sub={
            form.autoApply
              ? t("autoApplyOnSub")
              : t("autoApplyOffSub")
          }
          checked={form.autoApply}
          onChange={(v) => setForm({ autoApply: v })}
        />
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">
            {t("couponCodeLabel")}{" "}
            {!form.autoApply && (
              <span className="text-red-500 font-semibold">{t("couponCodeRequired")}</span>
            )}
            {form.autoApply && (
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
            <p className="text-xs text-red-500 mt-1">
              {t("couponCodeMissingError")}
            </p>
          )}
        </div>
      </Section>

      {/* BANNER */}
      <Section title={t("bannerTitle")} subtitle={t("bannerSubtitle")}>
        <Toggle
          label={t("showOnBannerLabel")}
          sub={t("showOnBannerSub")}
          checked={form.showOnBanner}
          onChange={(v) => setForm({ showOnBanner: v })}
        />
        {form.showOnBanner && (
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">
              {t("bannerHeadlineLabel")}{" "}
              <span className="text-gray-400">{t("bannerHeadlineOptional")}</span>
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
