/**
 * POST /api/customer/signup
 *
 * Creates a marketplace-wide CustomerAccount, hashes the password,
 * issues the session cookie, and returns the new account profile.
 *
 * If a CustomerAccount with this email already exists, returns 409
 * (the client can prompt the user to sign in instead).
 *
 * Body: { email, password, name?, phone? }
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { signCustomerToken, customerCookieOptions } from "@/lib/customer-session";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; name?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const name = body.name?.trim() || null;
  const phone = body.phone?.trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const existing = await prisma.customerAccount.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists. Try signing in." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const account = await prisma.customerAccount.create({
    data: {
      email,
      passwordHash,
      name,
      phone,
      lastLoginAt: new Date(),
    },
    select: { id: true, email: true, name: true, phone: true, emailVerifiedAt: true },
  });

  // BACKFILL: if Customer rows already exist for this email across any
  // restaurant (from previous guest orders), link them to this new
  // account so the user immediately sees their past order history.
  // Per-restaurant scoping means we may link multiple Customer rows.
  await prisma.customer.updateMany({
    where: { email, customerAccountId: null },
    data: { customerAccountId: account.id },
  });

  const token = signCustomerToken({ customerAccountId: account.id, email: account.email });
  const res = NextResponse.json({ account });
  const opts = customerCookieOptions();
  res.cookies.set(opts.name, token, opts);
  return res;
}
