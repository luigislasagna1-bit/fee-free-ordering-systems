import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encrypt";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user?.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ps = await prisma.printerSettings.findUnique({
      where: { restaurantId: user.restaurantId },
    });

    if (!ps?.printNodeApiKeyEnc || !ps.printNodeApiKeyIv || !ps.printNodeApiKeyTag) {
      return NextResponse.json({ error: "No API key configured. Enter your PrintNode API key first." }, { status: 400 });
    }
    if (!process.env.ENCRYPTION_KEY) {
      return NextResponse.json({ error: "Encryption not configured on this server" }, { status: 500 });
    }

    const apiKey = decrypt(ps.printNodeApiKeyEnc, ps.printNodeApiKeyIv, ps.printNodeApiKeyTag);

    const whoami = await fetch("https://api.printnode.com/whoami", {
      headers: {
        Authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"),
      },
    });

    if (!whoami.ok) {
      await prisma.printerSettings.update({
        where: { restaurantId: user.restaurantId },
        data: { printNodeConnected: false, printNodeAccountName: null },
      });
      const errText = await whoami.text().catch(() => "Unknown error");
      return NextResponse.json({
        error: whoami.status === 401
          ? "Invalid API key. Please check your PrintNode API key."
          : `PrintNode returned ${whoami.status}: ${errText}`,
      }, { status: 400 });
    }

    const account = await whoami.json();

    // Fetch printers
    const printersRes = await fetch("https://api.printnode.com/printers", {
      headers: {
        Authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"),
      },
    });

    const printersRaw = printersRes.ok ? await printersRes.json() : [];
    const printers = Array.isArray(printersRaw)
      ? printersRaw.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          state: p.state ?? "unknown",
          computer: p.computer?.name ?? "Unknown computer",
        }))
      : [];

    await prisma.printerSettings.update({
      where: { restaurantId: user.restaurantId },
      data: {
        printNodeConnected: true,
        printNodeAccountName: account.email ?? account.firstname ?? "PrintNode Account",
      },
    });

    return NextResponse.json({
      success: true,
      accountName: account.email ?? account.firstname ?? "PrintNode Account",
      printers,
    });
  } catch (err: any) {
    console.error("[printnode/test]", err);
    return NextResponse.json({ error: err.message ?? "Connection test failed" }, { status: 500 });
  }
}
