/**
 * Chrome-less, print-optimised flyer page (Luigi 2026-06-10). Lives OUTSIDE
 * /admin so it doesn't inherit the admin sidebar. Auth-gated by getSessionUser
 * (only the owner can print their own flyer). The QR is inlined as a server-
 * generated data-URI so it paints before the print dialog fires.
 */
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseTheme } from "@/lib/theme";
import { buildSmartLinkUrl, flyerWebsiteDefault } from "@/lib/marketing-studio";
import { FlyerCanvas } from "@/app/admin/marketing-studio/FlyerCanvas";
import { PrintTrigger } from "./PrintTrigger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FlyerPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return <div style={{ padding: 40 }}>Unauthorized</div>;

  const asset = await prisma.marketingAsset.findFirst({
    where: { id, restaurantId },
    select: { designJson: true, smartLinkId: true },
  });
  if (!asset) return <div style={{ padding: 40 }}>Not found</div>;

  const [restaurant, link] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true, logoUrl: true, address: true, city: true, phone: true, themeSettings: true,
        slug: true, customDomain: true, customDomainStatus: true, socialLinks: true,
      },
    }),
    asset.smartLinkId ? prisma.smartLink.findFirst({ where: { id: asset.smartLinkId, restaurantId }, select: { code: true } }) : Promise.resolve(null),
  ]);

  let design: { templateId?: string; headline?: string; offerText?: string; phone?: string; website?: string; footerText?: string } = {};
  try { design = JSON.parse(asset.designJson || "{}"); } catch {}

  const theme = parseTheme(restaurant?.themeSettings);
  // Contact: prefer the per-flyer override, else the live restaurant defaults.
  const flyerPhone = design.phone || restaurant?.phone || "";
  const flyerWebsite = design.website || (restaurant ? flyerWebsiteDefault(restaurant) : "");
  const t = await getTranslations("admin.marketingStudio");
  const qrDataUri = link
    ? await QRCode.toDataURL(buildSmartLinkUrl(link.code), { margin: 1, width: 800, errorCorrectionLevel: "M" })
    : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print { body { margin: 0 !important; } .flyer-print-toolbar { display: none !important; } }
        html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #f3f4f6; }
      `}</style>
      <div className="flyer-print-toolbar" style={{ textAlign: "center", padding: "12px", fontFamily: "sans-serif", fontSize: 13, color: "#475569" }}>
        {t("printHint")}
      </div>
      <div style={{ width: "210mm", minHeight: "297mm", margin: "0 auto", background: "#fff" }}>
        <FlyerCanvas
          templateId={design.templateId ?? "bold"}
          restaurantName={restaurant?.name ?? ""}
          logoUrl={restaurant?.logoUrl}
          address={[restaurant?.address, restaurant?.city].filter(Boolean).join(", ")}
          phone={flyerPhone}
          website={flyerWebsite}
          footerText={design.footerText || ""}
          headline={design.headline || ""}
          offerText={design.offerText || ""}
          qrSrc={qrDataUri}
          primaryColor={theme.primaryColor}
          scanLabel={t("scanToOrder")}
        />
      </div>
      <PrintTrigger />
    </>
  );
}
