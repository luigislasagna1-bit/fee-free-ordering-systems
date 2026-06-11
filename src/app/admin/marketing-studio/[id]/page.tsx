import Link from "next/link";
import { ArrowLeft, QrCode, MousePointerClick, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { buildSmartLinkUrl } from "@/lib/marketing-studio";
import { ScansChart } from "../ScansChart";

const DAYS = 30;

export default async function SmartLinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null;

  const t = await getTranslations("admin.marketingStudio");
  const tc = await getTranslations("common");

  const [link, restaurant] = await Promise.all([
    prisma.smartLink.findFirst({
      where: { id, restaurantId },
      select: { id: true, code: true, name: true, isActive: true, scanCount: true, orderCount: true, revenueCents: true },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { currency: true } }),
  ]);

  if (!link) {
    return (
      <div className="max-w-3xl">
        <Link href="/admin/marketing-studio" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> {t("pageTitle")}
        </Link>
        <p className="text-sm text-gray-500">{t("emptyTitle")}</p>
      </div>
    );
  }

  const currency = restaurant?.currency ?? "usd";
  const now = Date.now();
  const since = new Date(now - DAYS * 86400000);
  const scans = await prisma.smartLinkScan.findMany({
    where: { smartLinkId: id, scannedAt: { gte: since } },
    select: { scannedAt: true },
    take: 5000,
  });

  const counts = new Map<string, number>();
  for (const s of scans) {
    const k = s.scannedAt.toISOString().slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const daily: { label: string; count: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const k = d.toISOString().slice(0, 10);
    daily.push({ label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, count: counts.get(k) ?? 0 });
  }
  const conv = link.scanCount > 0 ? Math.round((link.orderCount / link.scanCount) * 100) : 0;
  const hasScans = link.scanCount > 0;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/marketing-studio" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2">
        <ArrowLeft className="w-3.5 h-3.5" /> {t("pageTitle")}
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {link.name}
            {!link.isActive && <span className="ml-2 text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded align-middle">{tc("off")}</span>}
          </h1>
          <div className="text-xs text-gray-500 font-mono mt-1 break-all">{buildSmartLinkUrl(link.code)}</div>
        </div>
        <a
          href={`/api/admin/marketing-studio/smart-links/${link.id}/qr?format=png`}
          download
          className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 rounded-lg"
        >
          <QrCode className="w-4 h-4" /> {t("downloadQr")}
        </a>
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat icon={<MousePointerClick className="w-4 h-4" />} label={t("colScans")} value={String(link.scanCount)} />
        <Stat icon={<ShoppingBag className="w-4 h-4" />} label={t("colOrders")} value={String(link.orderCount)} />
        <Stat label={t("colRevenue")} value={formatCurrency(link.revenueCents / 100, currency)} />
        <Stat label={t("colConversion")} value={`${conv}%`} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">{t("scansOverTime")}</div>
        {hasScans ? <ScansChart daily={daily} /> : <p className="text-sm text-gray-400 py-8 text-center">{t("noScansYet")}</p>}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 flex items-center justify-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
