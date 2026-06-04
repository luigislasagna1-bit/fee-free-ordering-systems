import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import {
  buildKitchenReceiptFromConfig,
  buildCustomerReceiptFromConfig,
  buildReservationReceipt,
  SAMPLE_RECEIPT_ORDER,
  type ReceiptOrder,
  type ReceiptRestaurant,
  type PrinterLanguage,
} from "@/lib/receipt";
import { parseReceiptConfig } from "@/lib/receipt-schema";

async function getKeyAndSettings(restaurantId: string) {
  const ps = await prisma.printerSettings.findUnique({ where: { restaurantId } });
  if (!ps?.printNodeApiKeyEnc || !ps.printNodeApiKeyIv || !ps.printNodeApiKeyTag) return null;
  if (!process.env.ENCRYPTION_KEY) return null;
  const apiKey = decrypt(ps.printNodeApiKeyEnc, ps.printNodeApiKeyIv, ps.printNodeApiKeyTag);
  return { apiKey, ps };
}

async function getTemplates(restaurantId: string) {
  const rows = await prisma.receiptTemplate.findMany({
    where: { restaurantId, isDefault: true },
    select: { type: true, template: true },
  });
  const kitchenRaw  = rows.find((r) => r.type === "kitchen")?.template  ?? null;
  const customerRaw = rows.find((r) => r.type === "customer")?.template ?? null;
  return {
    kitchenConfig:  parseReceiptConfig(kitchenRaw,  "kitchen"),
    customerConfig: parseReceiptConfig(customerRaw, "customer"),
  };
}

// ── Hex-dump helper ─────────────────────────────────────────────────────────
// Dumps the printer command buffer as annotated hex so we can see what bytes
// are actually being sent to the Star printer.  Marks every ESC sequence that
// affects formatting (bold, inverse, size, alignment, init, cut) so we can
// verify ESC E 01 (bold on) is in fact landing immediately before the text it
// should make bold.  No behavior change — pure observability.
function hexDump(buf: Buffer, maxBytes = 1200): string {
  const lines: string[] = [];
  const len = Math.min(buf.length, maxBytes);
  const ESC = 0x1B;

  const markers = new Map<number, string>();
  for (let i = 0; i < len - 1; i++) {
    if (buf[i] !== ESC) continue;
    const n = buf[i + 1];
    if      (n === 0x45 && i + 2 < len) markers.set(i, buf[i + 2] === 1 ? "BOLD ON  (ESC E 01)" : "BOLD OFF (ESC E 00)");
    else if (n === 0x34)                markers.set(i, "INVERSE ON  (ESC 4)");
    else if (n === 0x35)                markers.set(i, "INVERSE OFF (ESC 5)");
    else if (n === 0x69 && i + 3 < len) markers.set(i, `SIZE H=${buf[i + 2]} W=${buf[i + 3]} (ESC i)`);
    else if (n === 0x40)                markers.set(i, "INIT (ESC @)");
    else if (n === 0x64 && i + 2 < len) markers.set(i, `CUT ${buf[i + 2]} (ESC d)`);
    else if (n === 0x46)                markers.set(i, "STAR-LINE BOLD ON  (ESC F)");
    else if (n === 0x48)                markers.set(i, "STAR-LINE BOLD OFF (ESC H)");
    else if (n === 0x21 && i + 2 < len) markers.set(i, `ESC ! 0x${buf[i + 2].toString(16).padStart(2, "0")}`);
    else if (n === 0x1D && i + 3 < len && buf[i + 2] === 0x61) {
      const a = buf[i + 3];
      markers.set(i, `ALIGN ${a === 0 ? "LEFT" : a === 1 ? "CENTER" : a === 2 ? "RIGHT" : "?"} (ESC GS a ${a})`);
    }
  }

  for (let off = 0; off < len; off += 16) {
    // Emit marker annotations for any ESC sequence starting in this row.
    for (let i = off; i < off + 16 && i < len; i++) {
      if (markers.has(i)) lines.push(`        // @${i.toString(16).padStart(4, "0")}  ${markers.get(i)}`);
    }
    const slice = buf.subarray(off, Math.min(off + 16, len));
    const hex   = Array.from(slice).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(slice).map((b) => b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : ".").join("");
    lines.push(`${off.toString(16).padStart(4, "0")}: ${hex.padEnd(48)}  ${ascii}`);
  }

  if (buf.length > maxBytes) {
    lines.push(`... (${buf.length - maxBytes} more bytes truncated)`);
  }
  return lines.join("\n");
}

// Single PrintNode submission attempt using node:https directly.
// Reliability features (do NOT remove — each one was added to fix a
// real observed failure mode):
//   1. agent: false        — bypasses Node's global HTTPS connection pool.
//                            Without this, stale pooled connections cause
//                            sporadic ETIMEDOUT / ECONNRESET on subsequent prints.
//   2. Connection: close   — PrintNode closes its side after the response so
//                            the next print establishes a fresh connection
//                            instead of reusing a half-dead one.
//   3. res.on("error")     — REQUIRED.  Without this handler, any response-
//                            stream error causes the Promise to NEVER settle,
//                            and the Next.js route hangs forever.
//   4. settled guard       — prevents double-resolve/reject if a timeout and
//                            an error fire in quick succession.
//   5. req.setTimeout(15s) — hard ceiling so a hung connection doesn't lock
//                            the route handler indefinitely.
async function submitJobOnce(
  apiKey: string,
  printerId: number,
  title: string,
  data: Buffer,
  copies: number,
  attempt: number,
): Promise<number> {
  const payload = JSON.stringify({
    printerId,
    title:       `${title} [${Date.now()}]`,
    contentType: "raw_base64",
    content:     data.toString("base64"),
    source:      "Fee Free Ordering",
    qty:         copies,
  });

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const tag = `[printnode/print attempt=${attempt}]`;

    const req = https.request({
      hostname: "api.printnode.com",
      path:     "/printjobs",
      method:   "POST",
      agent:    false,
      headers: {
        "Authorization":  "Basic " + Buffer.from(apiKey + ":").toString("base64"),
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Connection":     "close",
      },
    }, (res) => {
      let body = "";
      res.on("data",  (c: Buffer) => { body += c.toString(); });
      res.on("error", (err) => {
        console.error(`${tag} response stream error: ${err.message}`);
        settle(() => reject(new Error(`PrintNode response stream error: ${err.message}`)));
      });
      res.on("end", () => {
        res.destroy();
        const status = res.statusCode ?? 0;
        console.log(`${tag} HTTP ${status} body="${body.slice(0, 200)}"`);
        if (status >= 400) {
          settle(() => reject(new Error(`PrintNode HTTP ${status}: ${body}`)));
          return;
        }
        try {
          const jobId = JSON.parse(body);
          if (typeof jobId !== "number") {
            settle(() => reject(new Error(`PrintNode unexpected response: ${body.slice(0, 100)}`)));
            return;
          }
          console.log(`${tag} DONE jobId=#${jobId}`);
          settle(() => resolve(jobId));
        } catch {
          settle(() => reject(new Error(`PrintNode non-JSON response: ${body.slice(0, 100)}`)));
        }
      });
    });

    req.setTimeout(15_000, () => {
      console.error(`${tag} timeout after 15s`);
      req.destroy(new Error("PrintNode request timed out"));
    });
    req.on("error", (err) => {
      console.error(`${tag} request error: ${err.message}`);
      settle(() => reject(new Error(`PrintNode network error: ${err.message}`)));
    });

    req.write(payload);
    req.end();
  });
}

// True iff the error is a transient network failure that's worth retrying.
// HTTP 4xx/5xx errors from PrintNode itself are NOT retried — those reflect
// configuration / payload problems that won't be fixed by trying again.
function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /network error|timed out|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|stream error/i.test(msg);
}

async function submitJob(
  apiKey: string,
  printerId: number,
  title: string,
  data: Buffer,
  copies = 1,
): Promise<number> {
  console.log(
    `\n[printnode/print] HEX DUMP — title="${title}" — ${data.length} bytes (lang=raw_base64)\n` +
    hexDump(data, 1200) +
    `\n[printnode/print] END HEX DUMP\n`
  );

  // Retry transient network failures up to 2 additional times (3 attempts total).
  // PrintNode reports the same job-id is safe to re-submit because the title
  // already includes a unique timestamp suffix per call.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await submitJobOnce(apiKey, printerId, title, data, copies, attempt);
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || attempt === 3) throw err;
      const backoffMs = 400 * attempt;   // 400ms, 800ms before retries 2 and 3
      console.warn(`[printnode/print] transient failure (attempt ${attempt}): ${err instanceof Error ? err.message : err}; retrying in ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  // Unreachable, but TypeScript requires a final throw.
  throw lastErr instanceof Error ? lastErr : new Error("PrintNode submission failed");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser({ preferKitchen: true });
    if (!user?.restaurantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as {
      type?: "kitchen" | "customer" | "both" | "test" | "test_kitchen" | "test_customer";
      orderId?: string;
      reservationId?: string;
      // Optional inline templates — used for "test this current draft" prints from
      // the receipt template editor.  When present, these REPLACE the saved DB
      // templates for this single request, so the user can preview unsaved edits.
      kitchenTemplate?: unknown;
      customerTemplate?: unknown;
    };

    const ctx = await getKeyAndSettings(user.restaurantId);
    if (!ctx) {
      return NextResponse.json(
        { error: "PrintNode not configured. Enter your API key in Printer Setup." },
        { status: 400 },
      );
    }
    const { apiKey, ps } = ctx;

    if (!ps.selectedPrinterId) {
      return NextResponse.json(
        { error: "No printer selected. Select a printer in Printer Setup." },
        { status: 400 },
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { name: true, address: true, city: true, state: true, zip: true, phone: true, email: true, defaultLanguage: true, currency: true, timezone: true },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

    const { defaultLanguage, ...restaurantForReceipt } = restaurant;
    const receiptRestaurant: ReceiptRestaurant = restaurantForReceipt;
    const locale = defaultLanguage || "en";
    const paperWidth = ps.paperWidth ?? "80mm";
    const lang = (ps.printerLanguage ?? "escpos") as PrinterLanguage;

    console.log("[printnode/print] ─── PRINT JOB ───────────────────────────────", {
      timestamp:   new Date().toISOString(),
      type:        body.type,
      orderId:     body.orderId,
      restaurantId: user.restaurantId,
      printerId:   ps.selectedPrinterId,
      printerName: ps.selectedPrinterName,
      contentType: "raw_base64",
      paperWidth,
      lang,
      kitchenCopies:  ps.kitchenCopies,
      customerCopies: ps.customerCopies,
      logoEnabled: false,   // StarPRNT image commands disabled pending fix
    });

    // Load the saved template configs from DB — single source of truth
    let { kitchenConfig, customerConfig } = await getTemplates(user.restaurantId);

    // If client provided inline templates (used by the editor's "Test this receipt"
    // button to preview unsaved edits), override the loaded configs for this request.
    if (body.kitchenTemplate !== undefined) {
      kitchenConfig = parseReceiptConfig(JSON.stringify(body.kitchenTemplate), "kitchen");
    }
    if (body.customerTemplate !== undefined) {
      customerConfig = parseReceiptConfig(JSON.stringify(body.customerTemplate), "customer");
    }

    // ── Test print (both receipts at once) ───────────────────────────────────
    if (body.type === "test") {
      const sampleOrder = { ...SAMPLE_RECEIPT_ORDER, createdAt: new Date().toISOString() };
      const kitBuf  = await buildKitchenReceiptFromConfig(sampleOrder, receiptRestaurant, kitchenConfig, paperWidth, lang, locale);
      const custBuf = await buildCustomerReceiptFromConfig(sampleOrder, receiptRestaurant, customerConfig, paperWidth, lang, locale);
      const buf     = Buffer.concat([kitBuf, custBuf]);
      const jobId   = await submitJob(apiKey, ps.selectedPrinterId, "Test Receipt", buf, 1);

      await prisma.printLog.create({
        data: {
          restaurantId: user.restaurantId,
          receiptType:  "test",
          printerName:  ps.selectedPrinterName ?? undefined,
          printNodeJobId: jobId,
          status: "sent",
        },
      });
      return NextResponse.json({ success: true, jobId });
    }

    // ── Test print (single type — kitchen or customer only) ──────────────────
    // Used by the receipt template editor so the user can compare the printed
    // output of ONE receipt type at a time against the live preview.
    if (body.type === "test_kitchen" || body.type === "test_customer") {
      const sampleOrder = { ...SAMPLE_RECEIPT_ORDER, createdAt: new Date().toISOString() };
      const isKitchen = body.type === "test_kitchen";
      const buf = isKitchen
        ? await buildKitchenReceiptFromConfig(sampleOrder, receiptRestaurant, kitchenConfig, paperWidth, lang, locale)
        : await buildCustomerReceiptFromConfig(sampleOrder, receiptRestaurant, customerConfig, paperWidth, lang, locale);
      const jobId = await submitJob(
        apiKey,
        ps.selectedPrinterId,
        isKitchen ? "Test Kitchen Receipt" : "Test Customer Receipt",
        buf,
        1,
      );

      await prisma.printLog.create({
        data: {
          restaurantId: user.restaurantId,
          receiptType:  isKitchen ? "test_kitchen" : "test_customer",
          printerName:  ps.selectedPrinterName ?? undefined,
          printNodeJobId: jobId,
          status: "sent",
        },
      });
      return NextResponse.json({ success: true, jobId });
    }

    // ── Reservation print ─────────────────────────────────────────────────────
    if (body.reservationId) {
      const reservation = await prisma.reservation.findFirst({
        where: { id: body.reservationId, restaurantId: user.restaurantId },
        include: { table: true },
      });
      if (!reservation) {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }

      const buf = await buildReservationReceipt({
        restaurantName: receiptRestaurant.name,
        confirmationCode: reservation.confirmationCode,
        customerName: reservation.customerName,
        customerPhone: reservation.customerPhone,
        customerEmail: reservation.customerEmail,
        partySize: reservation.partySize,
        date: reservation.date,
        time: reservation.time,
        tableName: reservation.table?.name ?? null,
        notes: reservation.notes,
        depositAmount: reservation.depositAmount,
        depositPaid: reservation.depositPaid,
        preOrderTotal: reservation.preOrderTotal,
        status: reservation.status,
        createdAt: new Date(),
        currency: receiptRestaurant.currency,
        timezone: receiptRestaurant.timezone,
      }, paperWidth, lang, locale);

      const jobId = await submitJob(
        apiKey,
        ps.selectedPrinterId,
        `Reservation ${reservation.confirmationCode}`,
        buf,
        ps.kitchenCopies ?? 1,
      );

      await prisma.printLog.create({
        data: {
          restaurantId: user.restaurantId,
          receiptType:  "reservation",
          printerName:  ps.selectedPrinterName ?? undefined,
          printNodeJobId: jobId,
          status: "sent",
        },
      });
      return NextResponse.json({ success: true, jobId });
    }

    // ── Order print ───────────────────────────────────────────────────────────
    if (!body.orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: body.orderId, restaurantId: user.restaurantId },
      include: { items: { include: { modifiers: true } }, deliveryZone: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const receiptOrder: ReceiptOrder = {
      orderNumber:     order.orderNumber,
      type:            order.type,
      status:          order.status,
      customerName:    order.customerName,
      customerPhone:   order.customerPhone,
      customerEmail:   order.customerEmail,
      deliveryAddress: order.deliveryAddress,
      deliveryCity:    order.deliveryCity,
      deliveryZoneName: order.deliveryZone?.name ?? null,
      deliveryEstimatedMinutes: order.deliveryEstimatedMinutes ?? null,
      notes:           order.notes,
      subtotal:        order.subtotal,
      taxAmount:       order.taxAmount,
      deliveryFee:     order.deliveryFee,
      tip:             order.tip,
      couponDiscount:  order.couponDiscount,
      promoDiscount:   order.promoDiscount,
      appliedPromos:   (order as any).appliedPromos ?? null,
      total:           order.total,
      paymentMethod:   order.paymentMethod,
      paymentStatus:   order.paymentStatus,
      createdAt:       order.createdAt,
      estimatedReady:  order.estimatedReady,
      preparationTime: order.preparationTime,
      items: order.items.map((item) => ({
        // item.name already contains the variant suffix from /api/orders POST,
        // so re-appending variantName here would double-print it.
        name:      item.name,
        quantity:  item.quantity,
        price:     item.price,
        subtotal:  item.subtotal,
        notes:     item.notes,
        modifiers: item.modifiers.map((m) => ({ name: m.name, priceAdjustment: m.priceAdjustment })),
        // Bundle children pass-through for receipt rendering.
        bundleItems: Array.isArray((item as any).bundleItems) ? (item as any).bundleItems : null,
      })),
    };

    const doKitchen  = body.type === "kitchen"  || body.type === "both";
    const doCustomer = body.type === "customer" || body.type === "both";
    const logs: { receiptType: string; jobId: number }[] = [];

    if (doKitchen) {
      const buf   = await buildKitchenReceiptFromConfig(receiptOrder, receiptRestaurant, kitchenConfig, paperWidth, lang, locale);
      console.log("[printnode/print] kitchen payload", {
        bytes: buf.length, lang, paperWidth,
        copies: ps.kitchenCopies,
        firstBytes: buf.slice(0, 8).toString("hex"),
      });
      const jobId = await submitJob(apiKey, ps.selectedPrinterId, `Kitchen #${order.orderNumber}`, buf, ps.kitchenCopies);
      await prisma.printLog.create({
        data: {
          restaurantId: user.restaurantId, orderId: order.id,
          orderNumber: order.orderNumber,  receiptType: "kitchen",
          printerName: ps.selectedPrinterName ?? undefined,
          printNodeJobId: jobId, status: "sent",
        },
      });
      logs.push({ receiptType: "kitchen", jobId });
    }

    if (doCustomer) {
      const buf   = await buildCustomerReceiptFromConfig(receiptOrder, receiptRestaurant, customerConfig, paperWidth, lang, locale);
      console.log("[printnode/print] customer payload", {
        bytes: buf.length, lang, paperWidth,
        copies: ps.customerCopies,
        firstBytes: buf.slice(0, 8).toString("hex"),
      });
      const jobId = await submitJob(apiKey, ps.selectedPrinterId, `Customer #${order.orderNumber}`, buf, ps.customerCopies);
      await prisma.printLog.create({
        data: {
          restaurantId: user.restaurantId, orderId: order.id,
          orderNumber: order.orderNumber,  receiptType: "customer",
          printerName: ps.selectedPrinterName ?? undefined,
          printNodeJobId: jobId, status: "sent",
        },
      });
      logs.push({ receiptType: "customer", jobId });
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    console.error("[printnode/print]", err);
    return NextResponse.json({ error: err.message ?? "Print failed" }, { status: 500 });
  }
}
