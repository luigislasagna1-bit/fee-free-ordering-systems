import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../guard";
import {
  LINK_KINDS, MAX_LABEL_CHARS, MAX_TEXT_LINKS, parseSortOrder, sanitizeHttpUrl,
} from "../validators";

export const runtime = "nodejs";

/**
 * Nabil text links — links the agent can SMS mid-call. Collection API.
 *   GET  /api/admin/phone-ordering/text-links   list
 *   POST /api/admin/phone-ordering/text-links   create (cap 10 per restaurant)
 *
 * `url` is optional: null means "compute the branded default at send time"
 * (restaurantOrderUrl() etc. — never a dead link). When provided it must be
 * an absolute http(s) URL — sanitizeHttpUrl builds on sanitizeExternalHref.
 */

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;

  const links = await prisma.voiceTextLink.findMany({
    where: { restaurantId: gate.restaurantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ links });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;

  const body = await req.json().catch(() => ({}));
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!LINK_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind", code: "invalid_kind" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > MAX_LABEL_CHARS) {
    return NextResponse.json({ error: "Invalid label", code: "invalid_label" }, { status: 400 });
  }
  let url: string | null = null;
  if (typeof body.url === "string" && body.url.trim()) {
    url = sanitizeHttpUrl(body.url);
    if (!url) return NextResponse.json({ error: "Invalid URL", code: "invalid_url" }, { status: 400 });
  }

  const count = await prisma.voiceTextLink.count({ where: { restaurantId } });
  if (count >= MAX_TEXT_LINKS) {
    return NextResponse.json({ error: "Link limit reached", code: "link_limit" }, { status: 409 });
  }

  const link = await prisma.voiceTextLink.create({
    data: { restaurantId, kind, label, url, sortOrder: parseSortOrder(body.sortOrder) ?? 0 },
  });
  return NextResponse.json({ ok: true, link });
}
