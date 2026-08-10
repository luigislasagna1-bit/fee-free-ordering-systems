import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePhoneOrderingAdmin } from "../../guard";
import { LINK_KINDS, MAX_LABEL_CHARS, parseSortOrder, sanitizeHttpUrl } from "../../validators";

export const runtime = "nodejs";

/**
 * Nabil text links — item API.
 *   PATCH  /api/admin/phone-ordering/text-links/[id]   edit / toggle
 *   DELETE /api/admin/phone-ordering/text-links/[id]   remove
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const link = await prisma.voiceTextLink.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!link || link.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.kind === "string" && LINK_KINDS.has(body.kind)) data.kind = body.kind;
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label || label.length > MAX_LABEL_CHARS) {
      return NextResponse.json({ error: "Invalid label", code: "invalid_label" }, { status: 400 });
    }
    data.label = label;
  }
  if (typeof body.url === "string") {
    // Empty string clears back to the branded default (url: null).
    if (!body.url.trim()) {
      data.url = null;
    } else {
      const url = sanitizeHttpUrl(body.url);
      if (!url) return NextResponse.json({ error: "Invalid URL", code: "invalid_url" }, { status: 400 });
      data.url = url;
    }
  }
  if (typeof body.active === "boolean") data.active = body.active;
  const sortOrder = parseSortOrder(body.sortOrder);
  if (sortOrder !== null) data.sortOrder = sortOrder;

  const updated = await prisma.voiceTextLink.update({ where: { id }, data });
  return NextResponse.json({ ok: true, link: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await ctx.params;

  const link = await prisma.voiceTextLink.findUnique({ where: { id }, select: { restaurantId: true } });
  if (!link || link.restaurantId !== gate.restaurantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.voiceTextLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
