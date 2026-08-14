/**
 * GET /api/reseller/marketing-kit/render
 *   ?asset=<templateId>&size=<sizeId>&format=png|pdf&locale=<code>&preview=1
 *
 * Renders (or serves from cache) one personalised marketing asset for the signed-in partner.
 *
 * Cache-first: the render is a pure function of (template, size, brand, personalisation,
 * locale), so we HMAC that tuple and check Blob before doing any work. A hit is a redirect;
 * only a miss pays for a render. That is what lets the live preview re-request on every edit
 * without melting anything.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimitShared, getClientIp } from "@/lib/rate-limit";
import { isSupportedLocale } from "@/lib/locales";
import { requireKitReseller } from "@/lib/reseller-kit/guard";
import { kitTemplate, visibleKitTemplates } from "@/lib/reseller-kit/catalog";
import { kitSize } from "@/lib/reseller-kit/sizes";
import { buildKitSpec } from "@/lib/reseller-kit/spec";
import { renderAssetPng, buildPdf, KitRenderError } from "@/lib/reseller-kit/render";
import { renderHash, putRender, HAS_BLOB } from "@/lib/reseller-kit/cache";
import { resolveResellerKitBrand } from "@/lib/reseller-kit/brand";
import { isRenderableLocale } from "@/lib/reseller-kit/fonts";
import { loadPriceRows } from "@/lib/reseller-kit/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Rendering is CPU-bound; the default budget is too tight if a cold isolate also has to fetch
// fonts. Same precedent as src/app/api/cron/backup/route.ts.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireKitReseller();
  if (gate instanceof NextResponse) return gate;
  const { resellerProfileId, profile } = gate;

  const url = new URL(req.url);
  const assetId = url.searchParams.get("asset") ?? "";
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "png";
  const preview = url.searchParams.get("preview") === "1";

  const template = kitTemplate(assetId);
  if (!template) return NextResponse.json({ error: "Unknown asset" }, { status: 400 });

  const prefs = profile.kitProfile;
  const brand = resolveResellerKitBrand(profile, prefs?.accentColor ?? null);

  // A template may be restricted to certain brand tiers (e.g. forced platform branding).
  if (!visibleKitTemplates(brand).some((t) => t.id === template.id)) {
    return NextResponse.json({ error: "Asset not available for your account" }, { status: 403 });
  }

  const sizeId = url.searchParams.get("size") ?? template.sizes[0];
  if (!template.sizes.includes(sizeId) || !kitSize(sizeId)) {
    return NextResponse.json({ error: "Unknown size" }, { status: 400 });
  }

  const localeParam = url.searchParams.get("locale") ?? prefs?.outputLocale ?? "en";
  const locale = isSupportedLocale(localeParam) ? localeParam : "en";
  if (!isRenderableLocale(locale)) {
    return NextResponse.json(
      { error: "not_renderable_locale", locale },
      { status: 409 },
    );
  }

  // Cheap guard on every request (hit or miss), then a stricter one only when we actually
  // render. Fails open by design — a rate-store outage must not break downloads.
  if (!(await rateLimitShared(`mk:req:${resellerProfileId}`, 240, 10 * 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!(await rateLimitShared(`mk:ip:${getClientIp(req)}`, 300, 10 * 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const priceRows = await loadPriceRows({
    enabled: template.showsPlatformPricing && !!prefs?.showPricing,
    brandTier: brand.tier,
  });

  let overrides: Record<string, string> = {};
  try {
    const parsed = JSON.parse(prefs?.overridesJson ?? "{}") as Record<string, unknown>;
    const forTemplate = parsed[template.id];
    if (forTemplate && typeof forTemplate === "object") {
      overrides = forTemplate as Record<string, string>;
    }
  } catch {
    /* malformed overrides must never break a render */
  }

  // The preview is the SAME renderer at a fraction of the DPI, so what the partner sees on
  // screen is a true miniature of the file they download — not a browser's approximation.
  const scale = preview ? 0.35 : 1;

  const { ctx, hashInput, size: renderSize } = await buildKitSpec({
    template,
    sizeId,
    dpiScale: scale,
    profile,
    prefs: {
      contactName: prefs?.contactName,
      contactEmail: prefs?.contactEmail,
      contactPhone: prefs?.contactPhone,
      contactWebsite: prefs?.contactWebsite,
      accentColor: prefs?.accentColor,
      showPricing: prefs?.showPricing,
      overrides,
    },
    locale,
    priceRows,
  });

  const hash = renderHash(hashInput);
  const filename = `${template.id}-${sizeId}-${locale}.${format}`;

  if (HAS_BLOB) {
    const existing = await prisma.marketingKitRender
      .findUnique({ where: { hash }, select: { pngUrl: true, pdfUrl: true } })
      .catch(() => null);
    const cached = existing && (format === "png" ? existing.pngUrl : existing.pdfUrl);
    if (cached) {
      // Fire-and-forget: a cache-hit must never wait on a bookkeeping write.
      void prisma.marketingKitRender
        .update({ where: { hash }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
      const res = NextResponse.redirect(cached, 302);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  }

  if (!(await rateLimitShared(`mk:render:${resellerProfileId}`, 60, 10 * 60_000))) {
    return NextResponse.json({ error: "Too many renders, please wait a moment" }, { status: 429 });
  }
  // Platform-wide circuit breaker: caps total render load however many partners pile in.
  if (!(await rateLimitShared("mk:global", 400, 60_000))) {
    const res = NextResponse.json({ error: "Busy, try again shortly" }, { status: 503 });
    res.headers.set("Retry-After", "60");
    return res;
  }

  const size = kitSize(sizeId)!;
  let png: Buffer;
  try {
    // renderSize carries the (possibly scaled) DPI that ctx.geom was built from — passing
    // anything else here draws a full-size layout into a mismatched canvas and crops it.
    png = await renderAssetPng(template, renderSize!, ctx);
  } catch (err) {
    console.error("[reseller-kit] render failed", err);
    const message = err instanceof KitRenderError ? "render_failed" : "render_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const body = format === "pdf" ? await buildPdf(png, size) : png;
  const contentType = format === "pdf" ? "application/pdf" : "image/png";

  if (HAS_BLOB) {
    const pngUrl = format === "png" ? await putRender(resellerProfileId, hash, "png", png) : null;
    const pdfUrl = format === "pdf" ? await putRender(resellerProfileId, hash, "pdf", body) : null;
    if (pngUrl || pdfUrl) {
      await prisma.marketingKitRender
        .upsert({
          where: { hash },
          create: {
            hash, resellerProfileId, templateId: template.id, sizeId, locale,
            pngUrl: pngUrl ?? "", pdfUrl: pdfUrl ?? "",
            bytes: body.length,
          },
          update: {
            ...(pngUrl ? { pngUrl } : {}),
            ...(pdfUrl ? { pdfUrl } : {}),
            lastUsedAt: new Date(),
          },
        })
        .catch((e) => console.error("[reseller-kit] cache upsert failed", e));
      const target = pngUrl ?? pdfUrl!;
      const res = NextResponse.redirect(target, 302);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  }

  // No Blob (local dev) or the upload failed — stream the bytes we already have.
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...(preview ? {} : { "Content-Disposition": `attachment; filename="${filename}"` }),
      "Cache-Control": "private, no-store",
    },
  });
}
