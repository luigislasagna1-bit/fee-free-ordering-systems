import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";
import { AccountActions } from "./AccountActions";
import { ResendVerifyButton } from "./ResendVerifyButton";
import { MarketplaceProfileEditor } from "./MarketplaceProfileEditor";
import { MarketplaceReorderCard } from "./orders/MarketplaceReorderCard";
import { formatCurrency } from "@/lib/utils";
import {
  ShoppingBag, MapPin, User as UserIcon, MailCheck, MailWarning, CheckCircle2,
  Tag, Repeat, Store, ChevronRight, Clock,
} from "lucide-react";

/**
 * /account — customer dashboard. Auth-gated. The hub the user lands on
 * after signing in. Surfaces every major capability of the marketplace
 * customer account in one place so they don't have to click into
 * sub-pages to see the essentials:
 *
 *   - Hello + verification state
 *   - Inline editable profile (name / phone, with reset-password link)
 *   - Tiles → orders / addresses
 *   - "Order again" rail (3 most recent successful baskets, cross-restaurant)
 *   - Personal coupons (assigned across every restaurant on the marketplace)
 *   - Recent order history (last 5)
 *   - Favourite restaurants (top 3 by order count)
 *   - Sign-out
 *
 * Mirrors the per-restaurant /order/[slug]/account dashboard so the
 * marketplace surface area matches what restaurants already get
 * (Luigi feedback 2026-05-31 — "marketplace account should have a lot,
 * all or more functions similar to what we created for each
 * individual restaurant account members section").
 */
export const metadata = { title: "My account — Fee Free Marketplace" };

export const dynamic = "force-dynamic";

export default async function CustomerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?next=/account");

  const now = new Date();

  // Fan-out the dashboard reads in parallel. Every query is keyed off
  // the CustomerAccount id (or Customer rows that point at it), and
  // every list has an explicit `take` cap — no unbounded reads even
  // for a power user with thousands of orders.
  const [
    orderCount,
    addressCount,
    recentOrders,
    orderAgainBaskets,
    personalCoupons,
    favRestaurants,
  ] = await Promise.all([
    prisma.order.count({
      where: { customer: { customerAccountId: account.id } },
    }),
    prisma.customerAddress.count({ where: { customerAccountId: account.id } }),
    prisma.order.findMany({
      where: { customer: { customerAccountId: account.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, orderNumber: true, total: true, status: true,
        type: true, createdAt: true,
        restaurant: { select: { name: true, slug: true, currency: true } },
      },
    }),
    // 3 most recent successful baskets across every restaurant for the
    // marketplace-wide "Order again" rail. Mirrors the per-restaurant
    // rail that lives on /order/[slug]/account.
    prisma.order.findMany({
      where: {
        customer: { customerAccountId: account.id },
        status: { notIn: ["cancelled", "rejected"] },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true, total: true, createdAt: true,
        restaurant: { select: { name: true, slug: true, currency: true } },
        items: { select: { name: true, quantity: true }, take: 4 },
      },
    }),
    // Personal coupons that any restaurant has assigned to this
    // customer (via Customer.customerAccountId linkage). Active +
    // not-yet-expired + still has uses left. Capped at 8 — anyone
    // with more can scroll the orders page; this is a teaser.
    prisma.coupon.findMany({
      where: {
        isActive: true,
        customer: { customerAccountId: account.id },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, code: true, description: true, discountType: true,
        discountValue: true, minimumOrder: true, maxUses: true,
        usedCount: true, expiresAt: true,
        restaurant: { select: { name: true, slug: true, currency: true } },
      },
    }),
    // Favourite restaurants — top 3 the customer has ordered from
    // most. groupBy on restaurantId then resolve to name/slug. Sort
    // by order count desc.
    prisma.order
      .groupBy({
        by: ["restaurantId"],
        where: { customer: { customerAccountId: account.id } },
        _count: { restaurantId: true },
        orderBy: { _count: { restaurantId: "desc" } },
        take: 3,
      })
      .then(async (rows) => {
        if (rows.length === 0) return [];
        const restaurants = await prisma.restaurant.findMany({
          where: { id: { in: rows.map((r) => r.restaurantId) }, isActive: true },
          select: { id: true, name: true, slug: true, cuisineType: true },
        });
        // Preserve the order-by-count ordering when zipping.
        return rows
          .map((r) => {
            const rest = restaurants.find((x) => x.id === r.restaurantId);
            return rest ? { ...rest, orderCount: r._count.restaurantId } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
      }),
  ]);

  const usableCoupons = personalCoupons.filter(
    (c) => c.maxUses === null || c.usedCount < c.maxUses,
  );

  // Verification toast — set by GET /api/customer/verify-email after consuming
  // the token. "ok" = success, "invalid" = token bad/expired/already-used.
  const { verified } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {account.name ? `Hi, ${account.name.split(" ")[0]}` : "Welcome back"}
        </h1>
        <p className="text-sm text-gray-600 mt-1">{account.email}</p>
      </div>

      {/* Just-verified success toast */}
      {verified === "ok" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-900">Email verified!</p>
            <p className="text-xs text-emerald-800 mt-0.5">
              Your email address is now confirmed. Enhanced features like saved cards + order-status notifications are unlocked.
            </p>
          </div>
        </div>
      )}
      {verified === "invalid" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <MailWarning className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">That verification link didn&apos;t work</p>
            <p className="text-xs text-amber-800 mt-0.5">
              It may have expired or been used already. Click <strong>Resend verification email</strong> below to get a fresh link.
            </p>
          </div>
        </div>
      )}

      {/* Verification prompt — only when the account is not yet verified.
          Hidden once they verify, so the dashboard isn't cluttered for
          returning customers. */}
      {!account.emailVerifiedAt && verified !== "ok" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3 mb-3">
            <MailCheck className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Verify your email</p>
              <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                We sent a verification link to <strong>{account.email}</strong> when you signed up. Click the button in that email to confirm it&apos;s really you — it unlocks saved cards and order-status notifications.
              </p>
              <p className="text-xs text-emerald-800 mt-2">
                Didn&apos;t receive it? Check your spam folder, or click below to send a new one.
              </p>
            </div>
          </div>
          <ResendVerifyButton />
        </div>
      )}

      {/* Inline-editable profile card. Used to be read-only — Luigi
          audit 2026-05-31 called this out: marketplace account should
          match the per-restaurant /order/[slug]/account capabilities. */}
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
              ? <span className="text-emerald-700 font-semibold">✓ Verified</span>
              : <span className="text-amber-700">Not yet — check your inbox</span>}
          </dd>
        </dl>
        <MarketplaceProfileEditor
          initialName={account.name}
          initialEmail={account.email}
          initialPhone={account.phone}
        />
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
        />
      </div>

      {/* Order again — cross-restaurant rail. Top 3 successful baskets
          with a one-click reorder. Toast/Skip/Grubhub/DoorDash all
          promote this above the order history list because repeat
          customers account for most volume. */}
      {orderAgainBaskets.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-emerald-600" />
              Order again
            </h2>
            <Link
              href="/account/orders"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-0.5"
            >
              See all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {orderAgainBaskets.map((o) => (
              <MarketplaceReorderCard
                key={o.id}
                restaurantName={o.restaurant.name}
                restaurantSlug={o.restaurant.slug}
                orderId={o.id}
                itemSummary={o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
                formattedTotal={formatCurrency(Number(o.total), o.restaurant.currency)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Personal coupons — anything the restaurant assigned directly
          to this customer (Customer.customerAccountId linkage). Surfaces
          codes from every restaurant the customer has signed up at
          on the marketplace. */}
      {usableCoupons.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-600" />
            Your coupons ({usableCoupons.length})
          </h2>
          <ul className="space-y-2">
            {usableCoupons.map((c) => {
              const remaining = c.maxUses === null
                ? "Unlimited uses"
                : `${Math.max(0, c.maxUses - c.usedCount)} use${(c.maxUses - c.usedCount) === 1 ? "" : "s"} left`;
              const discount = c.discountType === "percentage"
                ? `${c.discountValue}% off`
                : `${formatCurrency(c.discountValue, c.restaurant?.currency)} off`;
              return (
                <li
                  key={c.id}
                  className="bg-white rounded-xl border border-emerald-200 p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-emerald-700">{discount}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.description ?? "Personal coupon"}
                      {c.restaurant?.name && (
                        <>
                          {" · "}
                          <Link
                            href={`/order/${c.restaurant.slug}`}
                            className="text-emerald-600 hover:underline font-semibold"
                          >
                            {c.restaurant.name}
                          </Link>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      {remaining}
                      {c.minimumOrder > 0 && <> · Min. order {formatCurrency(c.minimumOrder, c.restaurant?.currency)}</>}
                      {c.expiresAt && <> · Expires {new Date(c.expiresAt).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <code className="bg-emerald-50 text-emerald-800 font-mono font-bold text-sm px-3 py-1.5 rounded border border-emerald-200">
                      {c.code}
                    </code>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Favourite restaurants — top 3 by order count. Each is a
          one-click jump back to that restaurant's menu, matching the
          "places you order from often" hub on Skip/Grubhub. */}
      {favRestaurants.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Store className="w-4 h-4 text-emerald-600" />
            Your favourites
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {favRestaurants.map((r) => (
              <Link
                key={r.id}
                href={`/order/${r.slug}`}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:shadow-sm transition flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{r.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {r.cuisineType ? `${r.cuisineType} · ` : ""}{r.orderCount} order{r.orderCount === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent orders snapshot — top 5 with deep link to status pages.
          Doubles the marketplace dashboard as a quick way to track
          recent business without leaving the hub. */}
      {recentOrders.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              Recent orders
            </h2>
            <Link
              href="/account/orders"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-0.5"
            >
              See all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <ul className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/order/${o.restaurant.slug}/status/${o.id}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">
                      {o.restaurant.name}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      #{o.orderNumber}
                      {" · "}{o.type}
                      {" · "}
                      {new Date(o.createdAt).toLocaleDateString(undefined, {
                        month: "short", day: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">
                      {formatCurrency(Number(o.total), o.restaurant.currency)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mt-0.5">
                      {o.status}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
