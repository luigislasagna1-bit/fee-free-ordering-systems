/**
 * GET/POST /api/public/unsubscribe?token=<signed>
 *
 * The working one-click unsubscribe endpoint (launch Blocker #6) every
 * marketing-class email's RFC 8058 List-Unsubscribe header + footer link
 * points at (see src/lib/unsubscribe.ts for the token + what gets flipped).
 *
 *   POST — RFC 8058 one-click (Gmail/Yahoo's Unsubscribe button posts here
 *          with no cookies): verify the token, flip the opt-out, 200. Also
 *          the target of the human confirmation form below.
 *   GET  — human clicking the footer link: shows a localized CONFIRM page
 *          whose button POSTs back here. GET never mutates — mail scanners
 *          prefetch GET links, and a prefetch must not unsubscribe anyone.
 *
 * No session required — the signed token IS the authorization. Localized via
 * the restaurant's default language (all 38 locales, `unsubscribe.*` keys).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyUnsubscribeToken, applyUnsubscribe, type UnsubscribePayload } from "@/lib/unsubscribe";
import { isSupportedLocale } from "@/lib/locales";

async function resolveContext(payload: UnsubscribePayload): Promise<{ locale: string; restaurantName: string }> {
  try {
    if (payload.k === "customer") {
      const r = await prisma.restaurant.findUnique({
        where: { id: payload.r },
        select: { name: true, defaultLanguage: true },
      });
      return { locale: r?.defaultLanguage || "en", restaurantName: r?.name || "this restaurant" };
    }
    const p = await prisma.prospect.findUnique({
      where: { id: payload.p },
      select: { import: { select: { restaurant: { select: { name: true, defaultLanguage: true } } } } },
    });
    const r = p?.import?.restaurant;
    return { locale: r?.defaultLanguage || "en", restaurantName: r?.name || "this restaurant" };
  } catch {
    return { locale: "en", restaurantName: "this restaurant" };
  }
}

type UnsubStrings = {
  title: string; confirm: string; button: string;
  done: string; doneDetail: string; invalid: string;
};

async function loadStrings(locale: string): Promise<UnsubStrings> {
  const lc = isSupportedLocale(locale) ? locale : "en";
  try {
    const m = (await import(`@/messages/${lc}.json`)).default as any;
    if (m?.unsubscribe?.title) return m.unsubscribe as UnsubStrings;
  } catch { /* fall through to en */ }
  const en = (await import(`@/messages/en.json`)).default as any;
  return en.unsubscribe as UnsubStrings;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? `{${k}}`));

function page(title: string, bodyHtml: string, status = 200): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}main{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;max-width:440px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.06)}h1{font-size:20px;margin:0 0 12px}p{font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 20px}button{background:#111827;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;width:100%}button:hover{background:#374151}</style>
</head><body><main>${bodyHtml}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    const t = await loadStrings("en");
    return page(t.title, `<h1>${esc(t.title)}</h1><p>${esc(t.invalid)}</p>`, 400);
  }
  const { locale, restaurantName } = await resolveContext(payload);
  const t = await loadStrings(locale);
  return page(
    t.title,
    `<h1>${esc(t.title)}</h1>
     <p>${fill(t.confirm, { email: payload.e, name: restaurantName })}</p>
     <form method="POST" action="/api/public/unsubscribe?token=${encodeURIComponent(token)}">
       <button type="submit">${esc(t.button)}</button>
     </form>`,
  );
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    const t = await loadStrings("en");
    return page(t.title, `<h1>${esc(t.title)}</h1><p>${esc(t.invalid)}</p>`, 400);
  }
  const [{ locale, restaurantName }] = await Promise.all([resolveContext(payload)]);
  const result = await applyUnsubscribe(payload);
  const t = await loadStrings(locale);
  if (!result.ok) {
    // Store hiccup — still return 200 so mail providers don't mark the
    // one-click as broken; the customer sees the invalid-link copy and the
    // failure was already logged for manual follow-up.
    return page(t.title, `<h1>${esc(t.title)}</h1><p>${esc(t.invalid)}</p>`);
  }
  return page(
    t.title,
    `<h1>${esc(t.done)}</h1><p>${fill(t.doneDetail, { email: payload.e, name: restaurantName })}</p>`,
  );
}
