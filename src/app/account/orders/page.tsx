import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ShoppingBag, ChevronRight, Store } from "lucide-react";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";
import { formatCurrency } from "@/lib/utils";

export const metadata = {
  title: "Your orders — Fee Free Marketplace",
  description: "Your order history across every restaurant on the marketplace.",
};

/**
 * /account/orders — cross-restaurant order history for a signed-in
 * CustomerAccount.
 *
 * The Customer row → CustomerAccount relation lets us pull orders from
 * any restaurant the customer has ordered from. Each row links through
 * to the per-restaurant order-status page (which already exists and is
 * the source of truth for "what's happening with this order").
 *
 * Pagination capped at 50 orders for now — sufficient for almost every
 * customer; if anyone ever has more, we'll add a "Load older" button.
 */
export default async function CustomerOrdersPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?next=/account/orders");

  const orders = await prisma.order.findMany({
    where: { customer: { customerAccountId: account.id } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      type: true,
      total: true,
      createdAt: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to account
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-emerald-600" />
          Your orders
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Every order you&apos;ve placed across all the restaurants on the Fee Free Marketplace.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-2xl">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-700 font-semibold">No orders yet</p>
          <p className="text-xs text-gray-500 mt-1 mb-5">
            When you order from a restaurant on the marketplace, it shows up here.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
          >
            Browse the marketplace
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/order/${o.restaurant.slug}/status/${o.id}`}
              className="block bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {o.restaurant.name}
                    </h3>
                    <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {formatCurrency(Number(o.total))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>#{o.orderNumber}</span>
                    <span>·</span>
                    <span className="capitalize">{o.type.replace("_", " ")}</span>
                    <span>·</span>
                    <StatusPill status={o.status} />
                    <span>·</span>
                    <span>{formatDate(o.createdAt)}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-2" />
              </div>
            </Link>
          ))}
          {orders.length === 50 && (
            <p className="text-xs text-gray-500 text-center pt-4">
              Showing your 50 most recent orders.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60_000));
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    pending:    { tone: "bg-amber-100 text-amber-800",     label: "Pending" },
    accepted:   { tone: "bg-emerald-100 text-emerald-800", label: "Accepted" },
    preparing:  { tone: "bg-emerald-100 text-emerald-800", label: "Preparing" },
    ready:      { tone: "bg-sky-100 text-sky-800",         label: "Ready" },
    completed:  { tone: "bg-slate-200 text-slate-800",     label: "Completed" },
    rejected:   { tone: "bg-rose-100 text-rose-800",       label: "Rejected" },
    cancelled:  { tone: "bg-rose-100 text-rose-800",       label: "Cancelled" },
  };
  const cfg = map[status] ?? { tone: "bg-gray-100 text-gray-700", label: status };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.tone}`}>
      {cfg.label}
    </span>
  );
}
