import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { sendEmailSettingsTest, isEmailEnabled } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions as any) as any;
  if (session?.user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { to } = await req.json();
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
  }

  if (!(await isEmailEnabled())) {
    return NextResponse.json({ error: "No Resend API key configured. Save one first." }, { status: 400 });
  }

  const result = await sendEmailSettingsTest({ to: to.trim().toLowerCase() });

  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error
          ? `Resend rejected the send: ${result.error}. Common causes: From address not on a verified domain, account in sandbox mode (free tier can only send to the account-owner email), or the API key is missing 'Sending access' permission.`
          : "Send failed for unknown reason — check the server console for [Email send error] lines.",
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
