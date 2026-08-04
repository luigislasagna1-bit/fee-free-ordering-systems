/**
 * GET/POST /api/public/data-request?token=<signed>
 *
 * The self-serve data-rights endpoint the "Delete my personal data" and
 * "Download my data" footer links point at (CASL/GDPR/PIPEDA). Mirrors the
 * unsubscribe route exactly: the signed token (src/lib/data-request.ts) IS the
 * authorization — no session — and names WHO wants WHAT (delete | export) at
 * WHICH restaurant.
 *
 *   GET  — human clicking the link: a localized CONFIRM page whose button POSTs
 *          back. GET NEVER mutates (mail scanners prefetch GET links).
 *   POST — execute. `delete` anonymizes via src/lib/data-erasure.ts; `export`
 *          emails the data to the ON-FILE address only (never rendered here).
 *          Rate-limited per-IP + per-subject.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyDataRequestToken, type DataRequestPayload } from "@/lib/data-request";
import { anonymizeCustomerByEmail, exportPersonData, subjectHash } from "@/lib/data-erasure";
import { sendDataExportEmail, sendErasureConfirmationEmail } from "@/lib/email";
import { rateLimitShared, getClientIp } from "@/lib/rate-limit";
import { isSupportedLocale } from "@/lib/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveContext(payload: DataRequestPayload): Promise<{ locale: string; restaurantName: string }> {
  try {
    const r = await prisma.restaurant.findUnique({
      where: { id: payload.r },
      select: { name: true, defaultLanguage: true },
    });
    return { locale: r?.defaultLanguage || "en", restaurantName: r?.name || "this restaurant" };
  } catch {
    return { locale: "en", restaurantName: "this restaurant" };
  }
}

type DR = {
  deleteTitle: string; deleteConfirm: string; deleteButton: string; deleteDone: string; deleteDoneDetail: string;
  exportTitle: string; exportConfirm: string; exportButton: string; exportDone: string; exportDoneDetail: string;
  invalid: string;
};

async function loadStrings(locale: string): Promise<DR> {
  const lc = isSupportedLocale(locale) ? locale : "en";
  try {
    const m = (await import(`@/messages/${lc}.json`)).default as any;
    if (m?.dataRequest?.deleteTitle) return m.dataRequest as DR;
  } catch { /* fall through to en */ }
  return ((await import(`@/messages/en.json`)).default as any).dataRequest as DR;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? `{${k}}`));

function page(title: string, bodyHtml: string, status = 200): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}main{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;max-width:460px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.06)}h1{font-size:20px;margin:0 0 12px}p{font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 20px}button{color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;width:100%}button:hover{filter:brightness(.94)}</style>
</head><body><main>${bodyHtml}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const payload = verifyDataRequestToken(token);
  if (!payload) {
    const t = await loadStrings("en");
    return page(t.deleteTitle, `<h1>${esc(t.deleteTitle)}</h1><p>${esc(t.invalid)}</p>`, 400);
  }
  const { locale, restaurantName } = await resolveContext(payload);
  const t = await loadStrings(locale);
  const isDelete = payload.a === "delete";
  const title = isDelete ? t.deleteTitle : t.exportTitle;
  const confirm = isDelete ? t.deleteConfirm : t.exportConfirm;
  const button = isDelete ? t.deleteButton : t.exportButton;
  // Delete is destructive → red button; export → neutral dark.
  const btnStyle = isDelete ? "background:#dc2626" : "background:#111827";
  return page(
    title,
    `<h1>${esc(title)}</h1>
     <p>${fill(confirm, { email: payload.e, name: restaurantName })}</p>
     <form method="POST" action="/api/public/data-request?token=${encodeURIComponent(token)}">
       <button type="submit" style="${btnStyle}">${esc(button)}</button>
     </form>`,
  );
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const payload = verifyDataRequestToken(token);
  if (!payload) {
    const t = await loadStrings("en");
    return page(t.deleteTitle, `<h1>${esc(t.deleteTitle)}</h1><p>${esc(t.invalid)}</p>`, 400);
  }

  // Rate limit: per-IP AND per-subject, so a leaked link can't be hammered.
  const ipOk = await rateLimitShared(`datareq:ip:${getClientIp(req)}`, 5, 60_000);
  const subjOk = await rateLimitShared(`datareq:sub:${subjectHash(payload.e)}`, 5, 60 * 60_000);
  const { locale, restaurantName } = await resolveContext(payload);
  const t = await loadStrings(locale);
  if (!ipOk || !subjOk) {
    return page(t.deleteTitle, `<h1>${esc(t.deleteTitle)}</h1><p>${esc(t.invalid)}</p>`, 429);
  }

  try {
    if (payload.a === "delete") {
      // Capture the address for the confirmation email BEFORE it's scrubbed.
      const to = payload.e;
      await anonymizeCustomerByEmail(payload.r, payload.e, { actor: { via: "self-token" } });
      // Fire-and-forget confirmation to the (now-removed) address.
      sendErasureConfirmationEmail({ to, restaurantName }).catch(() => {});
      return page(
        t.deleteDone,
        `<h1>${esc(t.deleteDone)}</h1><p>${fill(t.deleteDoneDetail, { email: to, name: restaurantName })}</p>`,
      );
    }
    // export
    const bundle = await exportPersonData({ restaurantId: payload.r, email: payload.e });
    await sendDataExportEmail({
      to: payload.e,
      restaurantName,
      jsonContent: JSON.stringify(bundle, null, 2),
    });
    return page(
      t.exportDone,
      `<h1>${esc(t.exportDone)}</h1><p>${fill(t.exportDoneDetail, { email: payload.e, name: restaurantName })}</p>`,
    );
  } catch (e) {
    console.error("[data-request] failed:", e);
    // 200 so mail providers don't flag the link broken; the failure is logged.
    return page(t.deleteTitle, `<h1>${esc(t.deleteTitle)}</h1><p>${esc(t.invalid)}</p>`);
  }
}
