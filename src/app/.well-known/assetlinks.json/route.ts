import { NextRequest, NextResponse } from "next/server";
import { resolveWellKnownTenant } from "@/lib/branded-app/wellknown-tenant";

/**
 * Per-tenant Android App Links verification (Luigi 2026-08-02).
 *
 * Each branded customer app bakes an autoVerify intent filter for ITS host;
 * Android verifies by fetching https://<host>/.well-known/assetlinks.json.
 * This dynamic route resolves the REQUEST HOST → the tenant whose branded
 * domain/subdomain it is → serves that tenant's package name + the Play App
 * Signing app-signing-key SHA-256 fingerprint(s) recorded in superadmin
 * (BrandedAppPlatform.certSha256, from Play Console → App integrity).
 *
 * Host resolution (isActive/verified gates, suspended-app exclusion) lives
 * in wellknown-tenant.ts, shared with the iOS sibling route — see that file
 * for why those gates matter. Empty array (valid, verification simply
 * fails) when the host maps to no eligible app.
 */
export async function GET(req: NextRequest) {
  const restaurant = await resolveWellKnownTenant(req.headers.get("host") ?? "");
  const row = restaurant?.brandedAppProject?.platforms.find((p) => p.platform === "android");
  if (!row?.packageName || !row.certSha256) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: row.packageName,
        sha256_cert_fingerprints: row.certSha256.split(",").map((f: string) => f.trim()).filter(Boolean),
      },
    },
  ];
  return NextResponse.json(statements, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
