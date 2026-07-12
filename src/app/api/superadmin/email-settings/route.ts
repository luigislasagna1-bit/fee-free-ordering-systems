import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encrypt";
import { resetEmailTransport } from "@/lib/email";

// Returns a *safe* view of platform email settings — never returns the full
// decrypted API key, but does return a short masked preview ("re_abc…wXyZ") so
// the super-admin can verify what's stored without exposing the secret.
export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });

  let savedKeyPreview: string | null = null;
  let decryptOk = true;
  if (settings?.resendApiKeyEnc && settings.resendApiKeyIv && settings.resendApiKeyTag && process.env.ENCRYPTION_KEY) {
    try {
      const k = decrypt(settings.resendApiKeyEnc, settings.resendApiKeyIv, settings.resendApiKeyTag);
      savedKeyPreview = k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : "saved";
    } catch {
      decryptOk = false;
    }
  }

  return NextResponse.json({
    hasResendKey: !!settings?.resendApiKeyEnc,
    savedKeyPreview,
    decryptOk,
    emailFrom: settings?.emailFrom ?? "",
    updatedAt: settings?.updatedAt ?? null,
    envFallbackPresent: !!process.env.RESEND_API_KEY,
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: "ENCRYPTION_KEY is not set on the server. Set it in your environment before saving a Resend key." },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { resendApiKey, emailFrom, clearKey } = body;

  const data: Record<string, any> = {
    id: "singleton",
    updatedBy: user.email ?? null,
  };

  if (typeof emailFrom === "string") {
    data.emailFrom = emailFrom.trim().slice(0, 200) || null;
  }

  if (clearKey === true) {
    data.resendApiKeyEnc = null;
    data.resendApiKeyIv = null;
    data.resendApiKeyTag = null;
  } else if (typeof resendApiKey === "string" && resendApiKey.trim()) {
    const key = resendApiKey.trim();
    if (!key.startsWith("re_")) {
      return NextResponse.json({ error: 'Resend API keys start with "re_". Please double-check.' }, { status: 400 });
    }
    const { enc, iv, tag } = encrypt(key);
    data.resendApiKeyEnc = enc;
    data.resendApiKeyIv = iv;
    data.resendApiKeyTag = tag;
  }

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: data,
  });

  // Invalidate the cached Resend client so the next email picks up the new key.
  resetEmailTransport();

  return NextResponse.json({ ok: true });
}
