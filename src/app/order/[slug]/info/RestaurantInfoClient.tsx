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

const DeliveryZonesMap = dynamic(() => import("../DeliveryZonesMap"), { ssr: false });

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface OpeningHour {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
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
  deliveryZones?: DeliveryZone[];
}

export function RestaurantInfoClient({ restaurant }: { restaurant: Restaurant }) {
  const [inquiry, setInquiry] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const theme = parseTheme(restaurant.themeSettings);

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
    toast.success("Message sent! We'll get back to you soon.");
    setInquiry({ name: "", email: "", phone: "", message: "" });
    setSending(false);
  };

  const fullAddress = [restaurant.address, restaurant.city, restaurant.state, restaurant.zip]
    .filter(Boolean)
    .join(", ");

  const todayIndex = new Date().getDay();
  const todayHours = restaurant.openingHours.find((h) => h.dayOfWeek === todayIndex);

  const pickupTime = svcSettings.pickup?.estimatedTime ?? restaurant.estimatedPickup;
  const deliveryTime = svcSettings.delivery?.estimatedTime ?? restaurant.estimatedDelivery;

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
          <ArrowLeft className="w-4 h-4" /> Order Now
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
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Services</h2>
          <div className="grid grid-cols-2 gap-3">
            {restaurant.acceptsPickup && (
              <ServiceBadge icon={ShoppingBag} label={svcSettings.pickup?.displayName || "Pickup"} detail={`~${pickupTime} min`} primaryColor={p} />
            )}
            {restaurant.acceptsDelivery && (
              <ServiceBadge icon={Truck} label={svcSettings.delivery?.displayName || "Delivery"} detail={`~${deliveryTime} min`} primaryColor={p} />
            )}
            {restaurant.acceptsDineIn && (
              <ServiceBadge icon={UtensilsCrossed} label={svcSettings.dineIn?.displayName || "Dine-In"} primaryColor={p} />
            )}
            {restaurant.acceptsTakeOut && (
              <ServiceBadge icon={Package} label={svcSettings.takeOut?.displayName || "Take Out"} primaryColor={p} />
            )}
            {restaurant.acceptsCatering && (
              <ServiceBadge icon={PartyPopper} label={svcSettings.catering?.displayName || "Catering"} detail="Contact us" primaryColor={p} />
            )}
            {restaurant.acceptsReservations && (
              <ServiceBadge icon={CalendarDays} label={svcSettings.reservations?.displayName || "Reservations"} detail="Book a table" primaryColor={p} />
            )}
          </div>
        </div>

        {/* Today's hours callout */}
        {todayHours && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
            todayHours.isOpen
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>
              {todayHours.isOpen
                ? `Open today ${formatTime(todayHours.openTime)} – ${formatTime(todayHours.closeTime)}`
                : "Closed today"}
            </span>
          </div>
        )}

        {/* Hours */}
        {restaurant.openingHours.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Hours of Operation
            </h2>
            <div className="space-y-1.5">
              {restaurant.openingHours.map((h) => (
                <div
                  key={h.dayOfWeek}
                  className={`flex justify-between items-center text-sm py-1 px-2 rounded-lg ${
                    h.dayOfWeek === todayIndex ? "font-semibold" : "text-gray-600"
                  }`}
                  style={h.dayOfWeek === todayIndex ? { backgroundColor: `${p}15`, color: p } : {}}
                >
                  <span>{DAY_NAMES[h.dayOfWeek]}</span>
                  <span>
                    {h.isOpen
                      ? `${formatTime(h.openTime)} – ${formatTime(h.closeTime)}`
                      : <span className="text-red-500">Closed</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delivery areas */}
        {restaurant.acceptsDelivery
          && restaurant.lat != null && restaurant.lng != null
          && (restaurant.deliveryZones?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" /> Our Delivery Areas
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
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Contact</h2>
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
            <span>Leave Us a Review</span>
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
          <ShoppingBag className="w-5 h-5" /> Order Online
        </Link>

        {/* Inquiry Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-1 flex items-center gap-2">
            <Send className="w-4 h-4" /> Send Us a Message
          </h2>
          <p className="text-xs text-gray-400 mb-4">Catering inquiries, special requests, or just say hello.</p>
          <form onSubmit={sendInquiry} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  required type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={focusRingStyle}
                  value={inquiry.name}
                  onChange={(e) => setInquiry({ ...inquiry, name: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input
                  type="tel"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={focusRingStyle}
                  value={inquiry.phone}
                  onChange={(e) => setInquiry({ ...inquiry, phone: e.target.value })}
                  placeholder="(555) 000-0000"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input
                required type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={focusRingStyle}
                value={inquiry.email}
                onChange={(e) => setInquiry({ ...inquiry, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message *</label>
              <textarea
                required rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                style={focusRingStyle}
                value={inquiry.message}
                onChange={(e) => setInquiry({ ...inquiry, message: e.target.value })}
                placeholder="Tell us about your catering event, special request, or question..."
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="w-full text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
              style={{ backgroundColor: p }}
            >
              {sending ? "Sending..." : "Send Message"}
            </button>
          </form>
        </div>

        {/* Description */}
        {restaurant.description && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">About Us</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{restaurant.description}</p>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pb-4">
          Powered by <span className="font-semibold" style={{ color: p }}>Fee Free Ordering</span>
        </div>
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
