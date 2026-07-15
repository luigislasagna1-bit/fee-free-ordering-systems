"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bike, MapPin, Radio } from "lucide-react";

type Tracking = {
  active: boolean;
  status?: string;
  delivered?: boolean;
  enRoute?: boolean;
  findingDriver?: boolean;
  driverName?: string | null;
  driver?: { lat: number; lng: number; at: string | null } | null;
  destination?: { lat: number; lng: number } | null;
  etaMinutes?: number | null;
};

/**
 * Customer-facing live driver tracking (FeeFreeDelivery). Polls the public
 * tracking endpoint; while the driver is en route it shows the driver's name, a
 * rough ETA, and a live map pin (key-free OpenStreetMap embed centered on the
 * driver's last position). Renders nothing when there's no in-house driver
 * assignment, so it's inert for ShipDay / self-delivery orders.
 */
export function DriverTrackingCard({ orderId, themeColor }: { orderId: string; themeColor?: string }) {
  const t = useTranslations("customer.tracking");
  const [data, setData] = useState<Tracking | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/orders/${orderId}/delivery-tracking`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Tracking;
        if (alive) setData(json);
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const iv = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [orderId]);

  if (!data?.active || data.delivered) return null;

  const accent = themeColor || "#10b981";
  const driver = data.driver;

  // OSM embed centered on the driver with a marker — a live pin, no API key.
  const mapSrc =
    driver &&
    `https://www.openstreetmap.org/export/embed.html?bbox=${driver.lng - 0.01}%2C${driver.lat - 0.008}%2C${driver.lng + 0.01}%2C${driver.lat + 0.008}&layer=mapnik&marker=${driver.lat}%2C${driver.lng}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 no-print">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white" style={{ backgroundColor: accent }}>
            <Bike className="w-4 h-4" />
          </span>
          {data.findingDriver ? t("findingDriverTitle") : data.enRoute ? t("onTheWayTitle") : t("headingToStoreTitle")}
        </div>
        {data.enRoute && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: accent }}>
            <Radio className="w-3.5 h-3.5 animate-pulse" /> {t("live")}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 mt-2">
        {data.findingDriver
          ? t("findingDriverBody")
          : data.driverName
            ? data.enRoute
              ? t("onTheWayNamed", { name: data.driverName })
              : t("headingToStoreNamed", { name: data.driverName })
            : data.enRoute
              ? t("onTheWayGeneric")
              : t("headingToStoreGeneric")}
      </p>

      {data.enRoute && data.etaMinutes != null && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold rounded-full px-3 py-1" style={{ backgroundColor: `${accent}18`, color: accent }}>
          <MapPin className="w-4 h-4" /> {t("etaAway", { minutes: data.etaMinutes })}
        </div>
      )}

      {mapSrc && (
        <div className="mt-4 rounded-xl overflow-hidden border border-gray-200">
          <iframe
            title={t("mapTitle")}
            src={mapSrc}
            className="w-full h-56"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  );
}
