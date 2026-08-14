import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { resolveResellerKitBrand, RESELLER_KIT_BRAND_SELECT } from "@/lib/reseller-kit/brand";
import { RESELLER_REFERRAL_URL_SELECT, buildResellerReferralUrl } from "@/lib/reseller/referral-url";
import { visibleKitTemplates } from "@/lib/reseller-kit/catalog";
import { MarketingKitClient } from "./MarketingKitClient";

/**
 * /reseller/marketing-kit — the partner's ready-to-print collateral.
 *
 * Fills in the "Pitch one-pager … includes a QR code linking to your referral signup URL"
 * card that /reseller/sales/partner-resources has advertised as "Soon" since it shipped.
 *
 * English chrome, matching every other page under /reseller (the area has no i18n by
 * convention — TODO.md). The PRINTED copy is a different matter and is translated into all
 * 38 locales, because a partner hands those flyers to restaurateurs in their own language.
 */
export default async function ResellerMarketingKitPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      ...RESELLER_KIT_BRAND_SELECT,
      ...RESELLER_REFERRAL_URL_SELECT,
      user: { select: { email: true, name: true } },
      kitProfile: true,
    },
  });
  if (!profile) redirect("/reseller/holding");
  if (profile.status !== "approved") redirect("/reseller/holding");

  const prefs = profile.kitProfile;
  const brand = resolveResellerKitBrand(profile, prefs?.accentColor ?? null);
  const referral = buildResellerReferralUrl(profile);
  const templates = visibleKitTemplates(brand);

  return (
    <MarketingKitClient
      brand={{
        tier: brand.tier,
        brandName: brand.brandName,
        primary: brand.colors.primary,
        landingBrandMismatch: brand.landingBrandMismatch,
        degradedReason: brand.degradedReason,
      }}
      referral={{
        url: referral.url,
        displayUrl: referral.displayUrl,
        kind: referral.kind,
        perishable: referral.perishable,
      }}
      templates={templates.map((t) => ({
        id: t.id,
        sizes: t.sizes,
        fields: t.fields,
        showsPlatformPricing: t.showsPlatformPricing,
      }))}
      initialPrefs={{
        contactName: prefs?.contactName ?? profile.user?.name ?? "",
        contactEmail: prefs?.contactEmail ?? profile.user?.email ?? "",
        contactPhone: prefs?.contactPhone ?? "",
        accentColor: prefs?.accentColor ?? "",
        showPricing: prefs?.showPricing ?? false,
        outputLocale: prefs?.outputLocale ?? "en",
        overrides: safeParse(prefs?.overridesJson),
      }}
    />
  );
}

function safeParse(json: string | null | undefined): Record<string, Record<string, string>> {
  try {
    const parsed = JSON.parse(json ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
