import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { syncAddOnToStripe } from "@/lib/addons";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const result = await syncAddOnToStripe(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "sync_failed" },
      { status: 502 }
    );
  }
}
