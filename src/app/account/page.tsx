import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";
import { AccountActions } from "./AccountActions";
import { ShoppingBag, MapPin, User as UserIcon } from "lucide-react";

/**
 * /account — customer dashboard. Auth-gated. Shows the basics and links
 * out to deeper sections (orders, addresses) that Phase 2 fills in.
 */
export const metadata = { title: "My account — Fee Free Marketplace" };

export default async function CustomerAccountPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?next=/account");

  const [orderCount, addressCount] = await Promise.all([
    // Count orders linked via Customer rows that point at this account.
    prisma.order.count({
      where: { customer: { customerAccountId: account.id } },
    }),
    prisma.customerAddress.count({ where: { customerAccountId: account.id } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {account.name ? `Hi, ${account.name.split(" ")[0]}` : "Welcome back"}
        </h1>
        <p className="text-sm text-gray-600 mt-1">{account.email}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Tile
          icon={<ShoppingBag className="w-5 h-5" />}
          title="Your orders"
          subtitle={
            orderCount === 0
              ? "You haven't placed any orders yet."
              : `${orderCount} order${orderCount === 1 ? "" : "s"} placed`
          }
          href="/account/orders"
          comingSoon
        />
        <Tile
          icon={<MapPin className="w-5 h-5" />}
          title="Saved addresses"
          subtitle={
            addressCount === 0
              ? "No addresses saved yet."
              : `${addressCount} address${addressCount === 1 ? "" : "es"} on file`
          }
          href="/account/addresses"
          comingSoon
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-gray-400" /> Profile
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <dt className="text-gray-500">Name</dt>
          <dd className="col-span-2 text-gray-900">{account.name || <em className="text-gray-400">Not set</em>}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd className="col-span-2 text-gray-900">{account.email}</dd>
          <dt className="text-gray-500">Phone</dt>
          <dd className="col-span-2 text-gray-900">{account.phone || <em className="text-gray-400">Not set</em>}</dd>
          <dt className="text-gray-500">Verified</dt>
          <dd className="col-span-2 text-gray-900">
            {account.emailVerifiedAt
              ? <span className="text-green-700">Verified</span>
              : <span className="text-gray-500">Not yet (we&apos;ll add this soon)</span>}
          </dd>
        </dl>
      </div>

      <AccountActions />

      <p className="text-xs text-gray-500 text-center pt-4">
        Looking for a restaurant?{" "}
        <Link href="/" className="text-emerald-600 hover:underline">Browse the marketplace</Link>.
      </p>
    </div>
  );
}

function Tile({
  icon,
  title,
  subtitle,
  href,
  comingSoon,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
  comingSoon?: boolean;
}) {
  const body = (
    <div className="block bg-white rounded-2xl border border-gray-100 p-5 transition hover:border-emerald-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        {comingSoon && (
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
            Coming soon
          </span>
        )}
      </div>
      <h3 className="font-semibold text-gray-900 mt-3">{title}</h3>
      <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>
    </div>
  );
  return comingSoon ? <div className="opacity-60">{body}</div> : <Link href={href}>{body}</Link>;
}
