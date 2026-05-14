import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encrypt";

function maskKey(key: string): string {
  if (!key || key.length < 8) return key;
  const prefix = key.startsWith("pk_live_") ? "pk_live_" :
                 key.startsWith("pk_test_") ? "pk_test_" :
                 key.startsWith("sk_live_") ? "sk_live_" :
                 key.startsWith("sk_test_") ? "sk_test_" :
                 key.startsWith("rk_live_") ? "rk_live_" :
                 key.startsWith("rk_test_") ? "rk_test_" : "";
  const last4 = key.slice(-4);
  return `${prefix}${"*".repeat(8)}${last4}`;
}

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const provider = await prisma.paymentProvider.findUnique({ where: { restaurantId } });
  if (!provider) return NextResponse.json({ provider: null });

  // Never return the secret key — only the masked version
  return NextResponse.json({
    provider: {
      id: provider.id,
      mode: provider.mode,
      publishableKey: provider.publishableKey,
      secretKeyMasked: provider.secretKeyEnc ? maskKey(decryptSecret(provider)) : "",
      isActive: provider.isActive,
      connectMethod: provider.connectMethod,
      stripeAccountId: provider.stripeAccountId,
      lastTestedAt: provider.lastTestedAt,
      lastTestStatus: provider.lastTestStatus,
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { publishableKey, secretKey, mode, isActive, connectMethod } = await req.json();

  // Validate keys if provided
  if (publishableKey) {
    const validPkPrefixes = mode === "live" ? ["pk_live_"] : ["pk_test_"];
    if (!validPkPrefixes.some((p) => publishableKey.startsWith(p))) {
      return NextResponse.json(
        { error: `Publishable key must start with ${validPkPrefixes[0]} for ${mode} mode` },
        { status: 400 }
      );
    }
  }
  if (secretKey) {
    const validSkPrefixes = mode === "live"
      ? ["sk_live_", "rk_live_"]
      : ["sk_test_", "rk_test_"];
    if (!validSkPrefixes.some((p) => secretKey.startsWith(p))) {
      return NextResponse.json(
        { error: `Secret key must start with sk_${mode}_ or rk_${mode}_ for ${mode} mode` },
        { status: 400 }
      );
    }
  }

  const encryptionAvailable = !!process.env.ENCRYPTION_KEY;
  const data: Record<string, unknown> = {};

  if (mode !== undefined) data.mode = mode;
  if (publishableKey !== undefined) data.publishableKey = publishableKey;
  if (isActive !== undefined) data.isActive = isActive;
  if (connectMethod !== undefined) data.connectMethod = connectMethod;

  if (secretKey) {
    if (!encryptionAvailable) {
      return NextResponse.json(
        { error: "ENCRYPTION_KEY is not configured. Ask your system administrator to set it." },
        { status: 500 }
      );
    }
    const { enc, iv, tag } = encrypt(secretKey);
    data.secretKeyEnc = enc;
    data.secretKeyIv = iv;
    data.secretKeyTag = tag;
  }

  const provider = await prisma.paymentProvider.upsert({
    where: { restaurantId },
    update: data,
    create: { restaurantId, ...data },
  });

  return NextResponse.json({
    success: true,
    secretKeyMasked: provider.secretKeyEnc ? maskKey(decryptSecret(provider)) : "",
  });
}

// Helper — only called server-side
function decryptSecret(provider: { secretKeyEnc: string; secretKeyIv: string; secretKeyTag: string }): string {
  if (!provider.secretKeyEnc) return "";
  try {
    return decrypt(provider.secretKeyEnc, provider.secretKeyIv, provider.secretKeyTag);
  } catch {
    return "";
  }
}
