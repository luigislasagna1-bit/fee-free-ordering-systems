import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { syncPlanToStripe } from "@/lib/stripe/plans";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const result = await syncPlanToStripe(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
