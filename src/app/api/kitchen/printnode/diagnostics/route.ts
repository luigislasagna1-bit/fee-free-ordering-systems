import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import {
  buildPlainTextDiagnostic,
  buildEscPosDiagnostic,
  buildStarPrntDiagnostic,
  buildStarBoldTest,
  type PrinterLanguage,
} from "@/lib/receipt";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as { type: "plaintext" | "escpos_basic" | "starprnt_basic" | "star_bold_test" };
    if (!["plaintext", "escpos_basic", "starprnt_basic", "star_bold_test"].includes(body.type)) {
      return NextResponse.json({ error: "Invalid diagnostic type" }, { status: 400 });
    }

    const ps = await prisma.printerSettings.findUnique({ where: { restaurantId: user.restaurantId } });
    if (!ps?.printNodeApiKeyEnc || !ps.printNodeApiKeyIv || !ps.printNodeApiKeyTag) {
      return NextResponse.json({ error: "PrintNode not configured" }, { status: 400 });
    }
    if (!process.env.ENCRYPTION_KEY) {
      return NextResponse.json({ error: "Encryption key not set" }, { status: 500 });
    }
    if (!ps.selectedPrinterId) {
      return NextResponse.json({ error: "No printer selected" }, { status: 400 });
    }

    const apiKey = decrypt(ps.printNodeApiKeyEnc, ps.printNodeApiKeyIv, ps.printNodeApiKeyTag);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { name: true },
    });
    const restaurantName = restaurant?.name ?? "Restaurant";
    const paperWidth = ps.paperWidth ?? "80mm";

    let buf: Buffer;
    let title: string;
    const contentType = "raw_base64";

    if (body.type === "plaintext") {
      buf   = buildPlainTextDiagnostic(restaurantName, paperWidth);
      title = "Diag: Plain Text";
    } else if (body.type === "escpos_basic") {
      buf   = buildEscPosDiagnostic(restaurantName, paperWidth);
      title = "Diag: ESC/POS Basic";
    } else if (body.type === "star_bold_test") {
      buf   = buildStarBoldTest(restaurantName, paperWidth);
      title = "Diag: Star Bold Test";
    } else {
      buf   = buildStarPrntDiagnostic(restaurantName, paperWidth);
      title = "Diag: StarPRNT Basic";
    }

    console.log("[diagnostics] route=/api/kitchen/printnode/diagnostics", {
      type: body.type,
      printerId: ps.selectedPrinterId,
      printerName: ps.selectedPrinterName,
      contentType,
      payloadBytes: buf.length,
      paperWidth,
    });

    const res = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        Authorization:  "Basic " + Buffer.from(apiKey + ":").toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        printerId:   ps.selectedPrinterId,
        title,
        contentType,
        content:     buf.toString("base64"),
        source:      "Fee Free Ordering - Diagnostics",
        qty:         1,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "Unknown error");
      console.error("[diagnostics] PrintNode error", res.status, err);
      return NextResponse.json({ error: `PrintNode error ${res.status}: ${err}` }, { status: 500 });
    }

    const jobId = await res.json();

    console.log("[diagnostics] job submitted", {
      jobId,
      type: body.type,
      printerId: ps.selectedPrinterId,
      payloadBytes: buf.length,
    });

    return NextResponse.json({
      success: true,
      jobId: typeof jobId === "number" ? jobId : 0,
      payloadBytes: buf.length,
      contentType,
      printerId: ps.selectedPrinterId,
      printerName: ps.selectedPrinterName,
      type: body.type,
    });
  } catch (err: any) {
    console.error("[diagnostics]", err);
    return NextResponse.json({ error: err.message ?? "Diagnostic failed" }, { status: 500 });
  }
}
