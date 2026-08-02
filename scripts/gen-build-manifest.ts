/**
 * Branded Mobile App — build-manifest generator (Luigi 2026-08-02).
 *
 * DB → one JSON file describing EVERYTHING a tenant build needs (identity,
 * server URL, branding, versioning). Consumed by gen-customer-cap-config.mjs,
 * gen-customer-assets.js and build-customer-android.mjs, and by the Codemagic
 * customer-ios workflow (passed base64 in FF_MANIFEST_JSON).
 *
 * NO SECRETS EVER — signing keys/ASC keys travel through the encrypted
 * credential store, never through this manifest.
 *
 *   npx tsx scripts/gen-build-manifest.ts <restaurant-slug> [outfile]
 */
import { config as cfg } from "dotenv";
cfg({ path: ".env.local" });
cfg({ path: ".env" });
import { writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveBundleId, isValidBundleId } from "../src/lib/branded-app/validate";
import { parseTheme } from "../src/lib/theme";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

export interface BuildManifest {
  restaurantId: string;
  slug: string;
  displayName: string;
  bundleId: string; // iOS
  androidApplicationId: string;
  serverUrl: string;
  deepLinkHost: string;
  primaryColor: string;
  appIconUrl: string | null;
  splashIconUrl: string | null;
  versionCode: number;
  versionName: string;
  configVersion: number;
}

/** Shared shell version — bump when the native capability set changes. */
const SHELL_VERSION = "1.0.0";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/gen-build-manifest.ts <restaurant-slug> [outfile]");
    process.exit(1);
  }
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, subdomain: true,
      customDomain: true, customDomainStatus: true,
      themeSettings: true, logoUrl: true,
      brandedAppProject: { include: { platforms: true } },
    },
  });
  if (!restaurant) { console.error(`No restaurant "${slug}"`); process.exit(1); }
  const project = restaurant.brandedAppProject;
  if (!project) { console.error("No branded-app project — run the wizard first."); process.exit(1); }
  if (!project.approvedAt || !project.approvedConfig) {
    console.error("Project has no APPROVED config — the owner must approve before any build.");
    process.exit(1);
  }
  const approved = project.approvedConfig as Record<string, unknown>;

  // Host: verified custom domain > subdomain > platform path. The shell's
  // server.url is the tenant's most-branded host — proxy.ts serves the
  // ordering page at its root.
  const host = restaurant.customDomain && restaurant.customDomainStatus === "verified"
    ? restaurant.customDomain
    : restaurant.subdomain
      ? `${restaurant.subdomain}.feefreeordering.com`
      : null;
  const serverUrl = host ? `https://${host}/` : `https://feefreeordering.com/order/${restaurant.slug}`;
  const deepLinkHost = host ?? "feefreeordering.com";

  // Bundle IDs: superadmin-set on the platform row wins; else derive AND
  // PERSIST — a derived id that's only ever computed in memory is never
  // uniqueness-checked, so two restaurants whose slugs sanitize to the same
  // segment (or a fresh restaurant whose derived id happens to match an
  // older tenant's) would silently build identical package names. Deriving
  // once and writing it to packageName makes every subsequent build reuse
  // the SAME id (stable across rebuilds) and puts it under the DB's
  // @unique(packageName) constraint + the superadmin clash-check UI.
  const androidRow = project.platforms.find((p) => p.platform === "android");
  const iosRow = project.platforms.find((p) => p.platform === "ios");
  const derived = deriveBundleId({ customDomain: restaurant.customDomain, slug: restaurant.slug });

  async function resolveId(row: typeof androidRow) {
    if (!row) return derived;
    if (row.packageName) return row.packageName;
    try {
      await prisma.brandedAppPlatform.update({ where: { id: row.id }, data: { packageName: derived } });
      return derived;
    } catch (e: any) {
      if (e?.code === "P2002") {
        console.error(`Derived bundle id "${derived}" already belongs to another restaurant's ${row.platform} app — set a unique packageName for this platform in superadmin before building.`);
        process.exit(1);
      }
      throw e;
    }
  }
  const androidApplicationId = await resolveId(androidRow);
  const bundleId = await resolveId(iosRow);
  if (!isValidBundleId(androidApplicationId) || !isValidBundleId(bundleId)) {
    console.error("Derived/overridden bundle id is invalid — fix packageName in superadmin.");
    process.exit(1);
  }

  // Branding: approved snapshot first; useWebsiteBranding pulls the live theme.
  // theme.primaryColor comes from Restaurant.themeSettings, which the
  // owner-facing PATCH /api/restaurants/profile stores as free-form JSON
  // with NO colour-format check — it reaches an Android XML resource file
  // and sharp's PNG generation raw, so validate here (the one place all
  // branches converge) rather than trust either source.
  const theme = parseTheme(restaurant.themeSettings);
  const rawColor = (approved.useWebsiteBranding !== false
    ? theme.primaryColor
    : (approved.primaryColorHex as string)) || theme.primaryColor || "#10b981";
  const primaryColor = HEX_COLOR.test(String(rawColor)) ? String(rawColor) : "#10b981";
  if (primaryColor !== rawColor) {
    console.warn(`primaryColor "${rawColor}" is not a valid #rrggbb hex — falling back to ${primaryColor}`);
  }

  const manifest: BuildManifest = {
    restaurantId: restaurant.id,
    slug: restaurant.slug,
    displayName: String(approved.appName ?? restaurant.name).slice(0, 30),
    bundleId,
    androidApplicationId,
    serverUrl,
    deepLinkHost,
    primaryColor,
    appIconUrl: (approved.appIconUrl as string) ?? null,
    splashIconUrl: (approved.splashIconUrl as string) ?? (approved.appIconUrl as string) ?? null,
    // Claim the version code NOW, atomically — not read-and-hope. Reading
    // nextBuildNumber plain (the old behavior) let two manifest generations
    // run before either build got uploaded + "build-recorded" both compute
    // the SAME versionCode; Play rejects the second upload as a duplicate.
    // Superadmin's build-recorded action no longer increments — this claim
    // IS the increment, so every manifest generation gets a distinct number
    // even if the resulting build is later abandoned.
    versionCode: androidRow
      ? (await prisma.brandedAppPlatform.update({
          where: { id: androidRow.id },
          data: { nextBuildNumber: { increment: 1 } },
          select: { nextBuildNumber: true },
        })).nextBuildNumber - 1
      : 1,
    versionName: SHELL_VERSION,
    configVersion: project.approvedConfigVersion,
  };

  const out = process.argv[3] ?? `store-assets/customer-builds/${restaurant.slug}/manifest.json`;
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log(`manifest → ${out}`);
  console.log(JSON.stringify(manifest, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
