import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encrypt";

export async function GET() {
  try {
    const user = await getSessionUser({ preferKitchen: true });
    if (!user?.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ps = await prisma.printerSettings.findUnique({
      where: { restaurantId: user.restaurantId },
    });

    const encryptionConfigured = !!process.env.ENCRYPTION_KEY;
    let hasApiKey = false;
    if (ps?.printNodeApiKeyEnc && ps.printNodeApiKeyIv && ps.printNodeApiKeyTag && encryptionConfigured) {
      hasApiKey = true;
    }

    return NextResponse.json({
      settings: ps ? {
        printNodeConnected: ps.printNodeConnected,
        printNodeAccountName: ps.printNodeAccountName,
        selectedPrinterId: ps.selectedPrinterId,
        selectedPrinterName: ps.selectedPrinterName,
        autoPrint: ps.autoPrint,
        printKitchen: ps.printKitchen,
        printCustomer: ps.printCustomer,
        kitchenCopies: ps.kitchenCopies,
        customerCopies: ps.customerCopies,
        paperWidth: ps.paperWidth,
        fontSize: ps.fontSize,
        showLargeOrderNumber: ps.showLargeOrderNumber,
        showLogo: ps.showLogo,
        printerLanguage: ps.printerLanguage ?? "escpos",
        hasApiKey,
      } : null,
      encryptionConfigured,
    });
  } catch (err: any) {
    console.error("[printnode/settings GET]", err);
    return NextResponse.json({ error: err.message ?? "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser({ preferKitchen: true });
    if (!user?.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      apiKey, selectedPrinterId, selectedPrinterName,
      autoPrint, printKitchen, printCustomer,
      kitchenCopies, customerCopies, paperWidth,
      fontSize, showLargeOrderNumber, showLogo, printerLanguage,
    } = body;

    const data: Record<string, unknown> = {};

    if (apiKey !== undefined && apiKey !== "") {
      if (!process.env.ENCRYPTION_KEY) {
        return NextResponse.json({ error: "Encryption not configured on this server" }, { status: 500 });
      }
      const { enc, iv, tag } = encrypt(String(apiKey));
      data.printNodeApiKeyEnc = enc;
      data.printNodeApiKeyIv = iv;
      data.printNodeApiKeyTag = tag;
      data.printNodeConnected = false;
      data.printNodeAccountName = null;
    }

    if (selectedPrinterId !== undefined) data.selectedPrinterId = selectedPrinterId;
    if (selectedPrinterName !== undefined) data.selectedPrinterName = selectedPrinterName;
    if (autoPrint !== undefined) data.autoPrint = autoPrint;
    if (printKitchen !== undefined) data.printKitchen = printKitchen;
    if (printCustomer !== undefined) data.printCustomer = printCustomer;
    if (kitchenCopies !== undefined) data.kitchenCopies = Math.min(Math.max(1, Number(kitchenCopies)), 5);
    if (customerCopies !== undefined) data.customerCopies = Math.min(Math.max(1, Number(customerCopies)), 5);
    if (paperWidth !== undefined) data.paperWidth = paperWidth;
    if (fontSize !== undefined) data.fontSize = fontSize;
    if (showLargeOrderNumber !== undefined) data.showLargeOrderNumber = showLargeOrderNumber;
    if (showLogo !== undefined) data.showLogo = showLogo;
    if (printerLanguage !== undefined && ["escpos", "starprnt", "plaintext"].includes(printerLanguage)) {
      data.printerLanguage = printerLanguage;
    }

    await prisma.printerSettings.upsert({
      where: { restaurantId: user.restaurantId },
      create: { restaurantId: user.restaurantId, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[printnode/settings PUT]", err);
    return NextResponse.json({ error: err.message ?? "Failed to save settings" }, { status: 500 });
  }
}
