import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { StripeSettingsClient } from "./StripeSettingsClient";

function preview(value: string | null): string | null {
  if (!value) return null;
  return value.length > 12 ? `${value.slice(0, 7)}…${value.slice(-4)}` : "saved";
}

export default async function StripeSettingsPage() {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.role !== "superadmin") redirect("/login");

  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  const k = process.env.ENCRYPTION_KEY;

  let secretKeyPreview: string | null = null;
  let webhookSecretPreview: string | null = null;
  let decryptOk = true;

  if (settings?.stripeSecretKeyEnc && settings.stripeSecretKeyIv && settings.stripeSecretKeyTag && k) {
    try {
      secretKeyPreview = preview(decrypt(settings.stripeSecretKeyEnc, settings.stripeSecretKeyIv, settings.stripeSecretKeyTag));
    } catch {
      decryptOk = false;
    }
  }
  if (settings?.stripeWebhookSecretEnc && settings.stripeWebhookSecretIv && settings.stripeWebhookSecretTag && k) {
    try {
      webhookSecretPreview = preview(decrypt(settings.stripeWebhookSecretEnc, settings.stripeWebhookSecretIv, settings.stripeWebhookSecretTag));
    } catch {
      decryptOk = false;
    }
  }

  return (
    <StripeSettingsClient
      initial={{
        mode: (settings?.stripeMode as "test" | "live" | null) ?? null,
        enabled: !!settings?.stripeEnabled,
        publishableKey: settings?.stripePublishableKey ?? "",
        hasSecretKey: !!settings?.stripeSecretKeyEnc,
        secretKeyPreview,
        hasWebhookSecret: !!settings?.stripeWebhookSecretEnc,
        webhookSecretPreview,
        decryptOk,
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
        envSecretPresent: !!process.env.STRIPE_SECRET_KEY,
        envPublishablePresent: !!process.env.STRIPE_PUBLISHABLE_KEY,
        envWebhookPresent: !!process.env.STRIPE_WEBHOOK_SECRET,
        encryptionKeyConfigured: !!k,
      }}
    />
  );
}
