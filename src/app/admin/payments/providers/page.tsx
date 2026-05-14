import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { ProvidersClient } from "./ProvidersClient";

export default async function ProvidersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const provider = restaurantId
    ? await prisma.paymentProvider.findUnique({ where: { restaurantId } })
    : null;

  const encryptionConfigured = !!process.env.ENCRYPTION_KEY;

  return (
    <ProvidersClient
      savedProvider={
        provider
          ? {
              mode: provider.mode,
              publishableKey: provider.publishableKey,
              isActive: provider.isActive,
              connectMethod: provider.connectMethod,
              stripeAccountId: provider.stripeAccountId ?? undefined,
              lastTestedAt: provider.lastTestedAt?.toISOString() ?? null,
              lastTestStatus: provider.lastTestStatus ?? null,
              hasSecretKey: !!provider.secretKeyEnc,
            }
          : null
      }
      encryptionConfigured={encryptionConfigured}
    />
  );
}
