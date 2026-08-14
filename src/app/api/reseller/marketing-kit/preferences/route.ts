/**
 * GET  /api/reseller/marketing-kit/preferences — resolved defaults + brand + referral info
 * PATCH /api/reseller/marketing-kit/preferences — save the partner's personalisation
 *
 * Manual coercion, no zod — matches the convention in src/app/api/reseller/restaurants/route.ts.
 * Every value is length-capped and emoji-stripped before it can reach a render.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimitShared } from "@/lib/rate-limit";
import { isSupportedLocale } from "@/lib/locales";
import { requireKitReseller } from "@/lib/reseller-kit/guard";
import { resolveResellerKitBrand } from "@/lib/reseller-kit/brand";
import { buildResellerReferralUrl } from "@/lib/reseller/referral-url";
import { visibleKitTemplates } from "@/lib/reseller-kit/catalog";
import { isKitTemplate } from "@/lib/reseller-kit/catalog";
import { sanitizeField } from "@/lib/reseller-kit/images";
import { FIELD_LIMITS } from "@/lib/reseller-kit/spec";
import { isRenderableLocale } from "@/lib/reseller-kit/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_OVERRIDES_BYTES = 8_000;
const MAX_OVERRIDE_TEMPLATES = 24;

export async function GET() {
  const gate = await requireKitReseller();
  if (gate instanceof NextResponse) return gate;
  const { profile } = gate;

  const prefs = profile.kitProfile;
  const brand = resolveResellerKitBrand(profile, prefs?.accentColor ?? null);
  const referral = buildResellerReferralUrl(profile);

  return NextResponse.json({
    brand: {
      tier: brand.tier,
      brandName: brand.brandName,
      logoUrl: brand.logoUrl,
      colors: brand.colors,
      allowPlatformMark: brand.allowPlatformMark,
      landingBrandMismatch: brand.landingBrandMismatch,
      degradedReason: brand.degradedReason,
      country: brand.country,
    },
    referral: {
      url: referral.url,
      displayUrl: referral.displayUrl,
      kind: referral.kind,
      perishable: referral.perishable,
    },
    templates: visibleKitTemplates(brand).map((t) => ({
      id: t.id,
      audience: t.audience,
      sizes: t.sizes,
      fields: t.fields,
      showsPlatformPricing: t.showsPlatformPricing,
    })),
    preferences: {
      // Prefilled from the account, but NOT persisted until the partner saves — so what is
      // printed is always something they confirmed.
      contactName: prefs?.contactName ?? profile.user?.name ?? "",
      contactEmail: prefs?.contactEmail ?? profile.user?.email ?? "",
      contactPhone: prefs?.contactPhone ?? "",
      contactWebsite: prefs?.contactWebsite ?? "",
      accentColor: prefs?.accentColor ?? "",
      showPricing: prefs?.showPricing ?? false,
      outputLocale: prefs?.outputLocale ?? "en",
      overrides: safeParse(prefs?.overridesJson),
      saved: !!prefs,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireKitReseller();
  if (gate instanceof NextResponse) return gate;
  const { resellerProfileId } = gate;

  if (!(await rateLimitShared(`mk:prefs:${resellerProfileId}`, 60, 10 * 60_000))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  // Present-fields-only, so a partial save never blanks a field the client didn't send.
  if ("contactName" in body) data.contactName = sanitizeField(str(body.contactName), FIELD_LIMITS.contactName);
  if ("contactPhone" in body) data.contactPhone = sanitizeField(str(body.contactPhone), FIELD_LIMITS.contactPhone);
  if ("contactWebsite" in body) data.contactWebsite = sanitizeField(str(body.contactWebsite), FIELD_LIMITS.contactWebsite);

  if ("contactEmail" in body) {
    const email = sanitizeField(str(body.contactEmail), FIELD_LIMITS.contactEmail);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    data.contactEmail = email;
  }

  if ("accentColor" in body) {
    const raw = str(body.accentColor).trim();
    if (raw && !HEX.test(raw)) {
      return NextResponse.json({ error: "Colour must be a 6-digit hex like #10B981" }, { status: 400 });
    }
    data.accentColor = raw || null;
  }

  if ("showPricing" in body) data.showPricing = !!body.showPricing;

  if ("outputLocale" in body) {
    const loc = str(body.outputLocale);
    if (!isSupportedLocale(loc)) {
      return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
    }
    if (!isRenderableLocale(loc)) {
      return NextResponse.json(
        { error: "That language can't be printed yet — see the note on the page." },
        { status: 400 },
      );
    }
    data.outputLocale = loc;
  }

  if ("overrides" in body) {
    const raw = body.overrides;
    if (raw !== null && typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid overrides" }, { status: 400 });
    }
    const clean: Record<string, Record<string, string>> = {};
    let templates = 0;
    for (const [templateId, fields] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (!isKitTemplate(templateId)) continue; // silently drop unknown ids
      if (++templates > MAX_OVERRIDE_TEMPLATES) break;
      if (!fields || typeof fields !== "object") continue;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
        const limit = (FIELD_LIMITS as Record<string, number>)[key] ?? 160;
        const v = sanitizeField(str(value), limit);
        if (v) out[key] = v;
      }
      if (Object.keys(out).length) clean[templateId] = out;
    }
    const serialized = JSON.stringify(clean);
    if (serialized.length > MAX_OVERRIDES_BYTES) {
      return NextResponse.json({ error: "Too much custom text" }, { status: 400 });
    }
    data.overridesJson = serialized;
  }

  const saved = await prisma.resellerKitProfile.upsert({
    where: { resellerProfileId },
    create: { resellerProfileId, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, preferences: { ...saved, overrides: safeParse(saved.overridesJson) } });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function safeParse(json: string | null | undefined): Record<string, Record<string, string>> {
  try {
    const parsed = JSON.parse(json ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
