import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const ALLOWED_TYPES = ["fixed", "percent"];
const ALLOWED_SCOPES = ["pickup", "delivery", "both"];
const ALLOWED_COUNTRIES = ["US", "CA"];

function sanitize(s: unknown, max = 100): string {
  return String(s ?? "").trim().slice(0, max);
}

function normalizeDaysOfWeek(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === "string" && input.trim() === "") return null;
  const arr = Array.isArray(input) ? input : String(input).split(",");
  const days = arr
    .map((d) => parseInt(String(d).trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  return unique.length === 0 || unique.length === 7 ? null : unique.join(",");
}

async function authorize(id: string) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const fee = await prisma.serviceFee.findFirst({ where: { id, restaurantId } });
  if (!fee) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { restaurantId, fee };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = sanitize(body.name);
  if (ALLOWED_TYPES.includes(body.feeType)) data.feeType = body.feeType;
  if (body.amount != null) data.amount = Math.max(0, Number(body.amount) || 0);
  if (ALLOWED_SCOPES.includes(body.appliesTo)) data.appliesTo = body.appliesTo;
  if ("daysOfWeek" in body) data.daysOfWeek = normalizeDaysOfWeek(body.daysOfWeek);
  if (typeof body.publicHolidaysOnly === "boolean") data.publicHolidaysOnly = body.publicHolidaysOnly;
  if (ALLOWED_COUNTRIES.includes(body.countryCode)) data.countryCode = body.countryCode;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const updated = await prisma.serviceFee.update({ where: { id }, data });
  return NextResponse.json({ fee: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  await prisma.serviceFee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
