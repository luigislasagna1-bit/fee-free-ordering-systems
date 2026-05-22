/**
 * POST /api/customer/login
 *
 * Verifies the email + password against CustomerAccount, issues the
 * session cookie, returns the profile. Times the bcrypt compare even
 * on miss so attackers can't distinguish "no such user" from "wrong
 * password" via response time.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { signCustomerToken, customerCookieOptions } from "@/lib/customer-session";

/** A dummy hash so non-existent users still trigger a bcrypt compare. */
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const account = await prisma.customerAccount.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, phone: true, passwordHash: true, emailVerifiedAt: true },
  });

  const hashToCheck = account?.passwordHash || DUMMY_HASH;
  const ok = await bcrypt.compare(password, hashToCheck);
  if (!ok || !account) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  await prisma.customerAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });

  const token = signCustomerToken({ customerAccountId: account.id, email: account.email });
  const res = NextResponse.json({
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      phone: account.phone,
      emailVerifiedAt: account.emailVerifiedAt,
    },
  });
  const opts = customerCookieOptions();
  res.cookies.set(opts.name, token, opts);
  return res;
}
