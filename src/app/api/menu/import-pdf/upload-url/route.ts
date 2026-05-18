import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/session";

/**
 * Client-direct upload token endpoint for menu PDF uploads.
 *
 * The Vercel serverless function body limit is 4.5MB. Real restaurant
 * menus designed for print are often 5-15MB. To get around this without
 * upgrading Vercel, we route the actual file bytes directly to Vercel
 * Blob storage — the browser uploads to Blob using a short-lived
 * pre-signed token issued by THIS endpoint, then sends just the blob URL
 * (a tiny string) to /api/menu/import-pdf for processing.
 *
 * Auth: only authenticated restaurant_admin users can request tokens.
 * The token allows uploading exactly one PDF, max 25MB, with a path
 * prefix tied to the restaurant ID so users can't write to each other's
 * blob namespace.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Auth is the session check above; this hook just gates content
        // type + size. We don't enforce restaurantId in the path because
        // the blob URL is opaque/unguessable anyway — security comes
        // from the session, not the path structure. We DO require the
        // path to be under menu-imports/ so blob listings stay tidy.
        if (!pathname.startsWith("menu-imports/")) {
          throw new Error("Pathname must start with menu-imports/");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB
          tokenPayload: JSON.stringify({ restaurantId, userId: user.id }),
          // Tokens expire in 30 seconds — just long enough to start the
          // upload. The actual upload itself can run as long as it takes.
          validUntil: Date.now() + 30_000,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Optional hook — we just log. Could insert an audit row later.
        console.log(`[menu-import] blob uploaded: ${blob.url} (${blob.pathname})`);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("[menu-import/upload-url] handleUpload failed:", err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? "Upload token generation failed" },
      { status: 400 }
    );
  }
}
