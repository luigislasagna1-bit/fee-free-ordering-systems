import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { EmailSettingsClient } from "./EmailSettingsClient";

export default async function EmailSettingsPage() {
  // Platform secrets — FULL superadmin only. The layout already bounced
  // unauthenticated visitors to /login; a support user lands on the dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

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

  return (
    <EmailSettingsClient
      initial={{
        hasResendKey: !!settings?.resendApiKeyEnc,
        savedKeyPreview,
        decryptOk,
        emailFrom: settings?.emailFrom ?? "",
        updatedAt: settings?.updatedAt ?? null,
        envFallbackPresent: !!process.env.RESEND_API_KEY,
        encryptionKeyConfigured: !!process.env.ENCRYPTION_KEY,
      }}
    />
  );
}
