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
  const arr = Array.isArray(input)
    ? input
    : String(input).split(",");
  const days = arr
    .map((d) => parseInt(String(d).trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  return unique.length === 0 || unique.length === 7 ? null : unique.join(",");
}

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fees = await prisma.serviceFee.findMany({
    where: { restaurantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ fees });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = sanitize(body?.name);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const feeType = ALLOWED_TYPES.includes(body?.feeType) ? body.feeType : "fixed";
  const amount = Math.max(0, Number(body?.amount) || 0);
  const appliesTo = ALLOWED_SCOPES.includes(body?.appliesTo) ? body.appliesTo : "both";
  const daysOfWeek = normalizeDaysOfWeek(body?.daysOfWeek);
  const publicHolidaysOnly = !!body?.publicHolidaysOnly;
  const countryCode = ALLOWED_COUNTRIES.includes(body?.countryCode) ? body.countryCode : "US";
  const isActive = body?.isActive !== false;

  const fee = await prisma.serviceFee.create({
    data: {
      restaurantId,
      name,
      feeType,
      amount,
      appliesTo,
      daysOfWeek,
      publicHolidaysOnly,
      countryCode,
      isActive,
    },
  });
  return NextResponse.json({ fee }, { status: 201 });
}
