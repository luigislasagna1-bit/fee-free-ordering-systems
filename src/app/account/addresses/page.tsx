import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";
import { AddressesClient, type SavedAddress } from "./AddressesClient";

// metadata stays English — static-metadata i18n deferred (same as /marketplace)
export const metadata = {
  title: "Saved addresses — Fee Free Marketplace",
  description: "Manage your delivery addresses.",
};

export default async function CustomerAddressesPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?next=/account/addresses");
  const t = await getTranslations("marketplaceAccount.addresses");

  const rows = await prisma.customerAddress.findMany({
    where: { customerAccountId: account.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  // Serialise dates to plain strings for the client boundary.
  const initial: SavedAddress[] = rows.map((a) => ({
    id: a.id,
    label: a.label,
    street: a.street,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    isDefault: a.isDefault,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {t("backToAccount")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-emerald-600" />
          {t("title")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("subtitle")}
        </p>
      </div>

      <AddressesClient initial={initial} />
    </div>
  );
}
