import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { EmailSettingsClient } from "./EmailSettingsClient";

export default async function EmailSettingsPage() {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.role !== "superadmin") redirect("/login");

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
