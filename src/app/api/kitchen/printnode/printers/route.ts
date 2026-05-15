import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encrypt";

export async function GET() {
  try {
    const user = await getSessionUser({ preferKitchen: true });
    if (!user?.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ps = await prisma.printerSettings.findUnique({
      where: { restaurantId: user.restaurantId },
    });

    if (!ps?.printNodeApiKeyEnc || !ps.printNodeApiKeyIv || !ps.printNodeApiKeyTag) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }
    if (!process.env.ENCRYPTION_KEY) {
      return NextResponse.json({ error: "Encryption not configured" }, { status: 500 });
    }

    const apiKey = decrypt(ps.printNodeApiKeyEnc, ps.printNodeApiKeyIv, ps.printNodeApiKeyTag);

    const res = await fetch("https://api.printnode.com/printers", {
      headers: {
        Authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"),
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch printers from PrintNode" }, { status: 502 });
    }

    const raw = await res.json();
    const printers = Array.isArray(raw)
      ? raw.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          state: p.state ?? "unknown",
          computer: p.computer?.name ?? "Unknown",
        }))
      : [];

    return NextResponse.json({ printers });
  } catch (err: any) {
    console.error("[printnode/printers]", err);
    return NextResponse.json({ error: err.message ?? "Failed to fetch printers" }, { status: 500 });
  }
}
