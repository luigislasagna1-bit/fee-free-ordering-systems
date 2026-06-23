"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Phone, Mail, MapPin, Clock, Truck, ShoppingBag, UtensilsCrossed,
  Star, Send, ArrowLeft, ChevronRight, PartyPopper, ExternalLink,
  Package, CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";
import { parseTheme } from "@/lib/theme";
import { useTranslations } from "next-intl";
import { PoweredByFeeFree } from "@/components/PoweredByFeeFree";

const DeliveryZonesMap = dynamic(() => import("../DeliveryZonesMap"), { ssr: false });

import { formatTime as fmt, type HoursFormat } from "@/lib/format-time";
import { localDowAndHHMM, liveOpenStatus } from "@/lib/restaurant-hours";
import { groupHoursByService, type HoursGroup } from "@/lib/service-hours";
import { serviceLabel } from "@/lib/service-labels";

function formatTime(t: string, hoursFmt: HoursFormat = "24h") {
  return fmt(t, hoursFmt);
}

interface OpeningHour {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  /** null/"" = the default ("General") hours; otherwise "pickup" |
   *  "delivery" | "reservation". */
  service?: string | null;
  closesNextDay?: boolean;
}

interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  isActive: boolean;
}

interface Restaurant {
  slug: string;
  name: string;
  slogan?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
  mapProvider?: "leaflet" | "google";
  googleMapsApiKey?: string | null;
  logoUrl?: string;
  bannerUrl?: string;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  acceptsDineIn: boolean;
  acceptsCatering: boolean;
  acceptsTakeOut?: boolean;
  acceptsReservations?: boolean;
  estimatedPickup: number;
  estimatedDelivery: number;
  reviewLink?: string;
  infoContent?: string;
  themeSettings?: string | null;
  serviceSettings?: string | null;
  openingHours: OpeningHour[];
  /** IANA timezone (e.g. "America/Toronto"). Required to compute the
   *  correct day-of-week at the restaurant — the customer's browser tz
   *  can differ. Stable across the Restaurant model lifetime. */
  timezone?: string;
  deliveryZones?: DeliveryZone[];
}

export function RestaurantInfoClient({
  restaurant,
  showPoweredBy = true,
}: {
  restaurant: Restaurant;
  /** Show the clickable "Powered by Fee Free Ordering" credit (free marketing +
   *  SEO backlink). False only for reseller white-label accounts. Luigi 2026-06-22. */
  showPoweredBy?: boolean;
}) {
  const tInfo = useTranslations("info");
  const tOrdering = useTranslations("ordering");
  const [inquiry, setInquiry] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const theme = parseTheme(restaurant.themeSettings);
  const hoursFmt: HoursFormat = (restaurant as any).hoursFormat === "12h" ? "12h" : "24h";

  // Parse serviceSettings for display names and descriptions
  let svcSettings: Record<string, { displayName?: string; description?: string; estimatedTime?: number }> = {};
  try {
    if (restaurant.serviceSettings) svcSettings = JSON.parse(restaurant.serviceSettings);
  } catch { /* ignore */ }

  let cta: { ctaLabel?: string; ctaUrl?: string; ctaDescription?: string } = {};
  try {
    if (restaurant.infoContent) cta = JSON.parse(restaurant.infoContent);
  } catch { /* ignore */ }

  const sendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success("✓");
    setInquiry({ name: "", email: "", phone: "", message: "" });
    setSending(false);
  };

  const fullAddress = [restaurant.address, restaurant.city, restaurant.state, restaurant.zip]
    .filter(Boolean)
    .join(", ");

  // Project to the restaurant's IANA timezone — `new Date().getDay()`
  // returns the customer's BROWSER weekday, which can be a different day
  // when the customer is in a far-off timezone or it's near midnight at
  // the restaurant. Luigi 2026-05-30: "consistent EVERYWHERE."
  const { dow: todayIndex } = localDowAndHHMM(new Date(), restaurant.timezone);
  // Prefer the default (service=null) row for today so this callout matches the
  // general open/closed sign (driven by liveOpenStatus below) rather than a
  // per-service row that happened to come first in the array.
  const todayHours =
    restaurant.openingHours.find((h) => h.dayOfWeek === todayIndex && (h.service == null || h.service === "")) ??
    restaurant.openingHours.find((h) => h.dayOfWeek === todayIndex);
  // Live "open right now" status (not just "is today an open day") so the
  // callout reflects reality: at 10 AM with a noon opening it reads
  // "Closed · Opens 12:00", not a misleading green "Open". The info page
  // doesn't load holiday rows, so this is weekly-hours + timezone only —
  // the ordering page and hosted site handle holidays in full.
  const infoLiveStatus = liveOpenStatus(
    restaurant.openingHours as any,
    new Date(),
    hoursFmt,
    undefined,
    restaurant.timezone,
  );
  const infoIsOpenNow = infoLiveStatus.kind === "open";

  const pickupTime = svcSettings.pickup?.estimatedTime ?? restaurant.estimatedPickup;
  const deliveryTime = svcSettings.delivery?.estimatedTime ?? restaurant.estimatedDelivery;

  // Opening hours, grouped by service so per-service times are readable —
  // a General section + one per service with its own hours, or a single plain
  // list when there's no per-service customisation (logic in groupHoursByService).
  // Reseller request, Fabrizio 2026-06-21.
  const hoursGroups = groupHoursByService(restaurant.openingHours as any);
  const groupLabel = (key: HoursGroup["key"]): string | null => {
    switch (key) {
      case "general": return tInfo("generalHours");
      case "pickup": return serviceLabel("pickup", svcSettings, tOrdering);
      case "delivery": return serviceLabel("delivery", svcSettings, tOrdering);
      case "reservation": return serviceLabel("reservations", svcSettings, tOrdering);
      default: return null; // "all" → single list, no heading
    }
  };

  const p = theme.primaryColor;
  const focusRingStyle = { outlineColor: p };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative h-48 md:h-64 overflow-hidden"
        style={{ background: restaurant.bannerUrl ? undefined : `linear-gradient(135deg, ${p}, ${theme.accentColor})` }}
      >
        {restaurant.bannerUrl && (
          <img src={restaurant.bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/50" />

        <Link
          href={`/order/${restaurant.slug}`}
          className="absolute top-4 left-4 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/30 transition"
        >
          <ArrowLeft className="w-4 h-4" /> {tInfo("viewMenu")}
        </Link>

        <div className="absolute bottom-4 left-4 flex items-end gap-3">
          {restaurant.logoUrl ? (
            <img src={restaurant.logoUrl} alt={restaurant.name} className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-lg" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-white/20 border-2 border-white flex items-center justify-center">
              <UtensilsCrossed className="w-8 h-8 text-white" />
            </div>
          )}
          <div className="text-white">
            <h1 className="text-xl md:text-2xl font-bold leading-tight">{restaurant.name}</h1>
            {restaurant.slogan && <p className="text-sm text-white/80 italic">{restaurant.slogan}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Services */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">{tInfo("ourServices")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {restaurant.acceptsPickup && (
              <ServiceBadge icon={ShoppingBag} label={serviceLabel("pickup", svcSettings, tOrdering)} detail={`~${pickupTime} ${tOrdering("minutes")}`} primaryColor={p} />
            )}
            {restaurant.acceptsDelivery && (
              <ServiceBadge icon={Truck} label={serviceLabel("delivery", svcSettings, tOrdering)} detail={`~${deliveryTime} ${tOrdering("minutes")}`} primaryColor={p} />
            )}
            {restaurant.acceptsDineIn && (
              <ServiceBadge icon={UtensilsCrossed} label={serviceLabel("dineIn", svcSettings, tOrdering)} primaryColor={p} />
            )}
            {restaurant.acceptsTakeOut && (
              <ServiceBadge icon={Package} label={serviceLabel("takeOut", svcSettings, tOrdering)} primaryColor={p} />
            )}
            {restaurant.acceptsCatering && (
              <ServiceBadge icon={PartyPopper} label={serviceLabel("catering", svcSettings, tOrdering)} primaryColor={p} />
            )}
            {restaurant.acceptsReservations && (
              <a href={`/order/${restaurant.slug}?reservation=1`} className="contents">
                <ServiceBadge icon={CalendarDays} label={serviceLabel("reservations", svcSettings, tOrdering)} detail={tInfo("bookATable")} primaryColor={p} />
              </a>
            )}
          </div>
        </div>

        {/* Today's hours callout — driven by LIVE open-now status so it never
            shows a green "Open" while the shop is actually closed (e.g. before
            its noon opening). Closed states use amber + an "order for later"
            hint, mirroring the ordering page banner. */}
        {todayHours && (
          <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${
            infoIsOpenNow
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}>
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>
                {infoLiveStatus.kind === "open"
                  ? (todayHours.isOpen && todayHours.openTime && todayHours.closeTime
                      // Show the LIVE close (handles being open via YESTERDAY's
                      // overnight window) instead of today's calendar row, so at
                      // 1 AM it reads "– 3:00" not "– 00:00". Luigi 2026-06-16.
                      ? `${tInfo("open")} · ${formatTime(todayHours.openTime, hoursFmt)} – ${infoLiveStatus.closesAt}`
                      : tInfo("open"))
                  : infoLiveStatus.kind === "opens_at"
                    ? `${tInfo("closed")} · ${tOrdering("opensAtLabel", { time: infoLiveStatus.opensAt })}`
                    : tInfo("closedToday")}
              </span>
            </div>
            {!infoIsOpenNow && (
              <div className="mt-1 ml-7 text-xs">{tOrdering("closedOrderLater")}</div>
            )}
          </div>
        )}

        {/* Hours — grouped by service, each panel led by a service icon + a live
            "open now" chip; today's row carries a Today pill. Closed reads as a
            calm gray pill (not alarming red) so the eye lands on OPEN hours. */}
        {restaurant.openingHours.length > 0 && hoursGroups.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2.5">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${p}14` }}
              >
                <Clock className="w-4 h-4" style={{ color: p }} />
              </span>
              {tInfo("openingHours")}
            </h2>
            <div className="space-y-3">
              {hoursGroups.map((group) => {
                const label = groupLabel(group.key);
                // Service icon so each section is recognizable even when the
                // owner's label is in another language (e.g. "Consegna").
                const ServiceIcon =
                  group.key === "pickup"
                    ? ShoppingBag
                    : group.key === "delivery"
                      ? Truck
                      : group.key === "reservation"
                        ? CalendarDays
                        : Clock;
                // Per-service live "can I use this right now?" status — only on
                // service-specific sections; the single "all" list already sits
                // under the live callout above, so a chip there would duplicate it.
                const status = label
                  ? liveOpenStatus(group.rows as any, new Date(), hoursFmt, undefined, restaurant.timezone)
                  : null;
                const isOpenNow = status?.kind === "open";
                return (
                  <div key={group.key} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                    {label && (
                      <div className="flex items-center gap-2.5 mb-2.5 px-1">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${p}14` }}
                        >
                          <ServiceIcon className="w-4 h-4" style={{ color: p }} />
                        </span>
                        <span className="text-sm font-bold tracking-tight flex-1 min-w-0 truncate" style={{ color: p }}>
                          {label}
                        </span>
                        {isOpenNow ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{ backgroundColor: `${p}14`, color: p }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p }} aria-hidden="true" />
                            {tInfo("openNow")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 bg-gray-100 text-gray-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" aria-hidden="true" />
                            {status?.kind === "opens_at"
                              ? tInfo("opensShort", { time: status.opensAt })
                              : tInfo("closed")}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {group.rows.map((h) => {
                        const isToday = h.dayOfWeek === todayIndex;
                        return (
                          <div
                            key={`${group.key}-${h.dayOfWeek}`}
                            className={`flex justify-between items-center gap-3 text-sm py-2 px-2.5 rounded-lg transition ${
                              isToday ? "font-semibold" : "text-gray-600"
                            }`}
                            style={isToday ? { backgroundColor: `${p}14`, color: p } : {}}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{tInfo(`days.${h.dayOfWeek}`)}</span>
                              {isToday && (
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md leading-none flex-shrink-0 text-white"
                                  style={{ backgroundColor: p }}
                                >
                                  {tInfo("today")}
                                </span>
                              )}
                            </span>
                            {h.isOpen ? (
                              <span className="tabular-nums whitespace-nowrap text-right flex-shrink-0">
                                {formatTime(h.openTime, hoursFmt)} – {formatTime(h.closeTime, hoursFmt)}
                              </span>
                            ) : (
                              <span
                                className={`text-[11px] font-medium uppercase tracking-[0.04em] px-2.5 py-1 rounded-full leading-none whitespace-nowrap flex-shrink-0 ${
                                  isToday ? "" : "text-gray-400 bg-gray-100"
                                }`}
                              >
                                {tInfo("closed")}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Delivery areas */}
        {restaurant.acceptsDelivery
          && restaurant.lat != null && restaurant.lng != null
          && (restaurant.deliveryZones?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" /> {tInfo("ourDeliveryAreas")}
            </h2>
            <DeliveryZonesMap
              restaurantLat={restaurant.lat}
              restaurantLng={restaurant.lng}
              zones={restaurant.deliveryZones as any}
              provider={restaurant.mapProvider ?? "leaflet"}
              googleMapsApiKey={restaurant.googleMapsApiKey ?? undefined}
            />
            <ul className="mt-3 space-y-1.5 text-sm">
              {restaurant.deliveryZones!.map((z) => (
                <li key={z.id} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
                  <span className="font-semibold">{z.name}</span>
                  <span className="text-gray-500">
                    — Min ${z.minimumOrder.toFixed(2)}, Fee ${z.deliveryFee.toFixed(2)}, ~{z.estimatedMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Contact */}
        {(restaurant.phone || restaurant.email || fullAddress) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">{tInfo("contact")}</h2>
            <div className="space-y-3">
              {restaurant.phone && (
                <a href={`tel:${restaurant.phone}`} className="flex items-center gap-3 text-sm text-gray-700 transition group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition" style={{ backgroundColor: `${p}18` }}>
                    <Phone className="w-4 h-4" style={{ color: p }} />
                  </div>
                  <span>{restaurant.phone}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-gray-300" />
                </a>
              )}
              {restaurant.email && (
                <a href={`mailto:${restaurant.email}`} className="flex items-center gap-3 text-sm text-gray-700 transition group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition" style={{ backgroundColor: `${p}18` }}>
                    <Mail className="w-4 h-4" style={{ color: p }} />
                  </div>
                  <span>{restaurant.email}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-gray-300" />
                </a>
              )}
              {fullAddress && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-gray-700 transition group"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition" style={{ backgroundColor: `${p}18` }}>
                    <MapPin className="w-4 h-4" style={{ color: p }} />
                  </div>
                  <span>{fullAddress}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-gray-300" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Review CTA */}
        {restaurant.reviewLink && (
          <a
            href={restaurant.reviewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold px-5 py-4 rounded-xl transition shadow-sm w-full"
          >
            <Star className="w-5 h-5 fill-yellow-700 text-yellow-700" />
            <span>{tInfo("leaveAReview")}</span>
            <ExternalLink className="w-4 h-4 ml-auto" />
          </a>
        )}

        {/* Custom CTA */}
        {cta.ctaLabel && cta.ctaUrl && (
          <a
            href={cta.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-white font-semibold px-5 py-4 rounded-xl transition shadow-sm w-full"
            style={{ backgroundColor: p }}
          >
            <PartyPopper className="w-5 h-5" />
            <div className="flex-1">
              <div>{cta.ctaLabel}</div>
              {cta.ctaDescription && (
                <div className="text-xs font-normal opacity-80 mt-0.5">{cta.ctaDescription}</div>
              )}
            </div>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}

        {/* Order Now */}
        <Link
          href={`/order/${restaurant.slug}`}
          className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold px-5 py-4 rounded-xl transition shadow-sm w-full text-center"
        >
          <ShoppingBag className="w-5 h-5" /> {tInfo("viewMenu")}
        </Link>

        {/* Inquiry Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-2">
            <Send className="w-4 h-4" /> {tInfo("contact")}
          </h2>
          <form onSubmit={sendInquiry} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{tInfo("contact")} *</label>
                <input
                  required type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={focusRingStyle}
                  value={inquiry.name}
                  onChange={(e) => setInquiry({ ...inquiry, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{tInfo("phone")}</label>
                <input
                  type="tel"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={focusRingStyle}
                  value={inquiry.phone}
                  onChange={(e) => setInquiry({ ...inquiry, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{tInfo("email")} *</label>
              <input
                required type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={focusRingStyle}
                value={inquiry.email}
                onChange={(e) => setInquiry({ ...inquiry, email: e.target.value })}
              />
            </div>
            <div>
              <textarea
                required rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                style={focusRingStyle}
                value={inquiry.message}
                onChange={(e) => setInquiry({ ...inquiry, message: e.target.value })}
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="w-full text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
              style={{ backgroundColor: p }}
            >
              {sending ? "…" : tOrdering("apply")}
            </button>
          </form>
        </div>

        {/* Description */}
        {restaurant.description && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">{tInfo("aboutUs")}</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{restaurant.description}</p>
          </div>
        )}

        {showPoweredBy && (
          <PoweredByFeeFree color={p} className="text-center text-xs text-gray-400 pb-4" />
        )}
      </div>
    </div>
  );
}

function ServiceBadge({ icon: Icon, label, detail, primaryColor }: { icon: any; label: string; detail?: string; primaryColor: string }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border"
      style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}25` }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: primaryColor }}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {detail && <div className="text-xs text-gray-500">{detail}</div>}
      </div>
    </div>
  );
}
