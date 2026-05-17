import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encrypt";
import { resetStripeCache } from "@/lib/stripe";

function preview(value: string): string {
  return value.length > 12 ? `${value.slice(0, 7)}…${value.slice(-4)}` : "saved";
}

export async function PUT(req: NextRequest) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: "ENCRYPTION_KEY is not set on the server. Add it to env vars and redeploy." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode === "live" ? "live" : "test";
  const enabled: boolean = !!body.enabled;
  const publishableKey: string | null = typeof body.publishableKey === "string"
    ? body.publishableKey.trim() || null
    : null;
  const secretKey: string | null = typeof body.secretKey === "string" && body.secretKey.trim()
    ? body.secretKey.trim()
    : null;
  const webhookSecret: string | null = typeof body.webhookSecret === "string" && body.webhookSecret.trim()
    ? body.webhookSecret.trim()
    : null;

  // Light validation — Stripe keys all have known prefixes.
  if (publishableKey && !/^pk_(test|live)_/.test(publishableKey)) {
    return NextResponse.json({ error: "Publishable key should start with pk_test_ or pk_live_" }, { status: 400 });
  }
  if (secretKey && !/^sk_(test|live)_/.test(secretKey)) {
    return NextResponse.json({ error: "Secret key should start with sk_test_ or sk_live_" }, { status: 400 });
  }
  if (webhookSecret && !/^whsec_/.test(webhookSecret)) {
    return NextResponse.json({ error: "Webhook secret should start with whsec_" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    stripeMode: mode,
    stripeEnabled: enabled,
    stripePublishableKey: publishableKey,
    updatedBy: session.user.email ?? null,
  };

  let secretKeyPreviewOut: string | null = null;
  if (secretKey) {
    const env = encrypt(secretKey);
    update.stripeSecretKeyEnc = env.enc;
    update.stripeSecretKeyIv = env.iv;
    update.stripeSecretKeyTag = env.tag;
    secretKeyPreviewOut = preview(secretKey);
  }

  let webhookSecretPreviewOut: string | null = null;
  if (webhookSecret) {
    const env = encrypt(webhookSecret);
    update.stripeWebhookSecretEnc = env.enc;
    update.stripeWebhookSecretIv = env.iv;
    update.stripeWebhookSecretTag = env.tag;
    webhookSecretPreviewOut = preview(webhookSecret);
  }

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update,
    create: { id: "singleton", ...update },
  });

  resetStripeCache();

  return NextResponse.json({
    ok: true,
    secretKeyPreview: secretKeyPreviewOut,
    webhookSecretPreview: webhookSecretPreviewOut,
  });
}
