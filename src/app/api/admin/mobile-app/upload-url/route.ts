import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";

/**
 * Client-direct Blob upload tokens for Branded Mobile App assets (app icon /
 * splash source images). Clone of the menu-import PDF pattern
 * (src/app/api/menu/import-pdf/upload-url/route.ts) — the browser uploads
 * straight to Vercel Blob with a short-lived token from here, then PATCHes
 * just the URL onto the project. PNG only, 8MB cap, path prefix
 * branded-apps/ keeps listings tidy; security comes from the session +
 * entitlement, not the (opaque) path.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Owner-level action (mints a write token for the store-listing icon) —
  // kitchen_staff sessions are excluded, same as the project/approve routes.
  if (!restaurantId || user.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasFeature(restaurantId, "app_store_listing"))) {
    return NextResponse.json({ error: "app_store_listing_required" }, { status: 402 });
  }

  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("branded-apps/")) {
          throw new Error("Pathname must start with branded-apps/");
        }
        return {
          allowedContentTypes: ["image/png"],
          maximumSizeInBytes: 8 * 1024 * 1024, // 8 MB — a 1024² PNG is far under
          tokenPayload: JSON.stringify({ restaurantId, userId: user.id }),
          validUntil: Date.now() + 5 * 60_000,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log(`[branded-app] asset uploaded: ${blob.url} (${blob.pathname})`);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload token generation failed";
    console.error("[branded-app/upload-url] handleUpload failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
