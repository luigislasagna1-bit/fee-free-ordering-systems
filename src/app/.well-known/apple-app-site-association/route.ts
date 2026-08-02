import { NextRequest, NextResponse } from "next/server";
import { resolveWellKnownTenant } from "@/lib/branded-app/wellknown-tenant";

/**
 * Per-tenant iOS Universal Links (Luigi 2026-08-02). Apple's CDN fetches
 * https://<host>/.well-known/apple-app-site-association (no extension —
 * src/proxy.ts explicitly excludes .well-known/ from host rewriting so this
 * dynamic route answers on every branded host). Resolves Host → tenant →
 * serves appID = <teamId>.<bundleId>; the team id comes from the tenant's
 * apple_asc_key credential row (non-secret companion field).
 *
 * Host resolution (isActive/verified gates, suspended-app exclusion) lives
 * in wellknown-tenant.ts, shared with the Android sibling route.
 *
 * Must be served as application/json WITHOUT a redirect — Apple refuses both
 * redirects and wrong content types.
 */
export async function GET(req: NextRequest) {
  const empty = { applinks: { apps: [], details: [] } };
  const restaurant = await resolveWellKnownTenant(req.headers.get("host") ?? "");
  const row = restaurant?.brandedAppProject?.platforms.find((p) => p.platform === "ios");
  const teamId = restaurant?.brandedAppProject?.credentials[0]?.appleTeamId;
  if (!row?.packageName || !teamId) {
    return NextResponse.json(empty, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${teamId}.${row.packageName}`],
            components: [{ "/": "/*" }],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
