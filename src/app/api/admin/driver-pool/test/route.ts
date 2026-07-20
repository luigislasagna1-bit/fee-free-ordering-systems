import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { decrypt } from "@/lib/encrypt";
import { testShipdayKey } from "@/lib/shipday";

/**
 * POST /api/admin/driver-pool/test  — body: { apiKey?: string }
 *
 * "Test connection" for ShipDay: validates a key against ShipDay's API so the
 * owner can confirm it works WITHOUT placing a real delivery order. Tests the
 * key in the body when present (the one being typed), otherwise the saved
 * (decrypted) key. Owner-scoped + gated on the driver_pool add-on, same as the
 * save route. The key is never logged or returned. Luigi 2026-06-17.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate (LR-SEC-02): testing/probing the ShipDay credential is a config
  // action — owner-only, like the save route. Gate on `role`, not effectiveRole.
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasFeature(restaurantId, "driver_pool"))) {
    return NextResponse.json(
      { ok: false, error: "Subscribe to Driver Pool or Marketplace Monthly to use ShipDay.", code: "addon_required" },
      { status: 412 },
    );
  }

  const body = await req.json().catch(() => ({}));
  let apiKey: string | null = typeof body?.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : null;

  // No key in the body → fall back to the saved (encrypted) key.
  if (!apiKey) {
    const cfg = await prisma.shipdayConfig.findUnique({
      where: { restaurantId },
      select: { apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
    });
    if (cfg?.apiKeyEnc && cfg.apiKeyIv && cfg.apiKeyTag && process.env.ENCRYPTION_KEY) {
      try {
        apiKey = decrypt(cfg.apiKeyEnc, cfg.apiKeyIv, cfg.apiKeyTag);
      } catch {
        /* fall through to "no key" */
      }
    }
  }
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Enter your ShipDay API key first, then test." }, { status: 400 });
  }

  const result = await testShipdayKey(apiKey);
  // Always 200 — the `ok` flag conveys the test result so the client reads it
  // uniformly (a failed key isn't a failed request).
  return NextResponse.json(result);
}
