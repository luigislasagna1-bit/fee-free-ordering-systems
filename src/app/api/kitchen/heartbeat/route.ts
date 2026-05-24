import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { recordHeartbeat } from "@/lib/kitchen-devices";

export async function POST(req: NextRequest) {
  try {
    // Accept BOTH kitchen and admin sessions — same fix as test-order
    // and orders endpoints (tasks #92 / #93 related). Previously failed
    // 401 when called from inside the native app on the kitchen session.
    const user = await getSessionUser({ preferKitchen: true });
    const role = user?.role;
    if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const restaurantId = user.restaurantId;
    if (!restaurantId) {
      return NextResponse.json({ error: "no_restaurant" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const deviceHash = String(body?.deviceHash || "").trim().slice(0, 64);
    if (!deviceHash || deviceHash.length < 8) {
      return NextResponse.json({ error: "invalid_device_hash" }, { status: 400 });
    }
    const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : null;

    const device = await recordHeartbeat({
      restaurantId,
      deviceHash,
      userAgent,
      label,
    });
    return NextResponse.json({
      ok: true,
      deviceId: device.id,
      lastSeenAt: device.lastSeenAt,
    });
  } catch (err: any) {
    console.error("[kitchen/heartbeat POST]", err);
    return NextResponse.json({ error: "heartbeat_failed" }, { status: 500 });
  }
}
