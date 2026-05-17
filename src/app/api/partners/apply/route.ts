import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password";
import { ROLES } from "@/lib/roles";

/**
 * Public reseller application endpoint.
 *
 * Creates a User with role=pending_reseller and a ResellerProfile{status:"pending"}.
 * Superadmin reviews the application at /superadmin/resellers and either
 * approves (flips role → reseller_partner, status → approved) or rejects.
 *
 * Email enumeration: same response for "email already in use" as for a
 * successful application — matches the /api/auth/register pattern.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`apply:${ip}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many application attempts. Please try again later." }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { name, email, password, companyName, website, country, applicationNotes } = body ?? {};

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const emailClean = String(email).trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const pwError = validatePassword(String(password));
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const nameClean = String(name).trim().slice(0, 100);
  if (nameClean.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }

  // Same opaque response whether the email exists or not — prevents enumeration.
  const existing = await prisma.user.findUnique({ where: { email: emailClean } });
  if (existing) {
    return NextResponse.json({ ok: true, status: "submitted" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email: emailClean,
      name: nameClean,
      passwordHash,
      role: ROLES.PENDING_RESELLER,
      resellerProfile: {
        create: {
          status: "pending",
          companyName: companyName ? String(companyName).trim().slice(0, 200) : null,
          website: website ? String(website).trim().slice(0, 500) : null,
          country: country ? String(country).trim().slice(0, 100) : null,
          applicationNotes: applicationNotes
            ? String(applicationNotes).trim().slice(0, 2000)
            : null,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, status: "submitted" });
}
