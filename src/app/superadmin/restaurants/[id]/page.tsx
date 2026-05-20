import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RestaurantControls } from "./RestaurantControls";
import { ImpersonateButton } from "../ImpersonateButton";
import {
  Store, Globe, Calendar, CreditCard, ShoppingBag, Users, UtensilsCrossed,
  MapPin, Mail, Phone, Truck, Wallet, Bell, ChefHat, AlertCircle, CheckCircle2,
  ExternalLink, Sparkles, Layers, Star,
} from "lucide-react";

// Auth-gated, full of live data — never cacheable.
export const dynamic = "force-dynamic";

/**
 * /superadmin/restaurants/[id] — comprehensive restaurant detail panel
 * for the platform operator.
 *
 * Mirrors what GloriaFood / UberEats Pulse / DoorDash Merchant Suite
 * show their internal operators, plus what's specific to our platform
 * (entitlements, marketplace, multi-location, reseller attribution).
 * Every section reads LIVE — no stale snapshots, no caching.
 */
export default async function SuperadminRestaurantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "superadmin") redirect("/admin");

  const { id } = await params;

  // Pull everything in parallel — one round-trip even on slow networks.
  const [
    restaurant,
    setupProgress,
    addOnSubs,
    kitchenDevices,
    notificationRecipientCount,
    recentOrders,
    today,
    last30Days,
    pendingOrders,
    parent,
    children,
  ] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id },
      include: {
        subscriptionPlan: true,
        marketplaceListing: true,
        shipdayConfig: true,
        resellerProfile: { select: { id: true, companyName: true, status: true } },
        users: { select: { id: true, email: true, role: true, emailVerifiedAt: true, createdAt: true } },
        _count: {
          select: { orders: true, customers: true, menuItems: true, menuCategories: true, deliveryZones: true, openingHours: true },
        },
      },
    }),
    loadSetupProgress(id).catch(() => null),
    prisma.restaurantAddOn.findMany({
      where: { restaurantId: id },
      include: { addOn: true },
      orderBy: { activatedAt: "desc" },
    }),
    prisma.kitchenDevice.findMany({
      where: { restaurantId: id },
      orderBy: { lastSeenAt: "desc" },
      take: 5,
    }),
    prisma.notificationRecipient.count({
      where: { restaurantId: id, isActive: true },
    }),
    prisma.order.findMany({
      where: { restaurantId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, orderNumber: true, status: true, total: true, type: true,
        customerName: true, paymentMethod: true, paymentStatus: true, createdAt: true,
      },
    }),
    // Today
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return prisma.order.aggregate({
        where: { restaurantId: id, createdAt: { gte: start } },
        _count: true,
        _sum: { total: true },
      });
    })(),
    // Last 30 days
    (async () => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return prisma.order.aggregate({
        where: { restaurantId: id, createdAt: { gte: start } },
        _count: true,
        _sum: { total: true },
      });
    })(),
    prisma.order.count({ where: { restaurantId: id, status: "pending" } }),
    // Parent (if this is a child)
    (async () => {
      const r = await prisma.restaurant.findUnique({
        where: { id },
        select: { parentRestaurantId: true },
      });
      if (!r?.parentRestaurantId) return null;
      return prisma.restaurant.findUnique({
        where: { id: r.parentRestaurantId },
        select: { id: true, name: true, slug: true },
      });
    })(),
    // Children (if this is a parent)
    prisma.restaurant.findMany({
      where: { parentRestaurantId: id },
      select: { id: true, name: true, slug: true, publishedAt: true, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!restaurant) notFound();

  const owner = restaurant.users.find((u) => u.role === "restaurant_admin");
  const ownerEmail = owner?.email ?? restaurant.email ?? null;
  const ownerEmailVerified = !!owner?.emailVerifiedAt;
  const isPublished = !!restaurant.publishedAt;
  const isOnMarketplace = !!restaurant.marketplaceListing?.isListed;

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div>
        <Link href="/superadmin/restaurants" className="text-sm text-gray-500 hover:text-gray-900">
          ← All restaurants
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div className="flex items-start gap-4">
            {restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover bg-gray-100" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white">
                <Store className="w-7 h-7" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{restaurant.slug}</code>
                <span>·</span>
                <span>{restaurant.city ?? "no city"}{restaurant.country ? `, ${restaurant.country}` : ""}</span>
              </div>
              {/* Status badges */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge label={isPublished ? "Published" : "Unpublished"} tone={isPublished ? "emerald" : "amber"} />
                <StatusBadge label={restaurant.isActive ? "Active" : "Paused"} tone={restaurant.isActive ? "emerald" : "gray"} />
                <StatusBadge label={`Subscription: ${restaurant.subscriptionStatus}`} tone={subscriptionTone(restaurant.subscriptionStatus)} />
                {restaurant.stripeChargesEnabled && <StatusBadge label="Stripe ✓" tone="emerald" />}
                {isOnMarketplace && <StatusBadge label="Marketplace" tone="purple" />}
                {parent && <StatusBadge label={`Child of ${parent.name}`} tone="blue" />}
                {children.length > 0 && <StatusBadge label={`Brand parent (${children.length} locations)`} tone="blue" />}
                {restaurant.resellerProfile && (
                  <StatusBadge label={`Reseller: ${restaurant.resellerProfile.companyName ?? "(no name)"}`} tone="orange" />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/order/${restaurant.slug}`}
              target="_blank"
              className="text-sm font-semibold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Order page
            </Link>
            <ImpersonateButton restaurantId={restaurant.id} />
          </div>
        </div>
      </div>

      {/* ── Quick controls (publish / active toggles) ────────────────── */}
      <RestaurantControls
        restaurantId={restaurant.id}
        initialIsPublished={isPublished}
        initialIsActive={restaurant.isActive}
        publishReady={!!setupProgress?.publishReady}
        publishedAt={restaurant.publishedAt?.toISOString() ?? null}
      />

      {/* ── Top-line stats ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={<AlertCircle className="w-4 h-4 text-yellow-600" />}
          label="Pending orders"
          value={pendingOrders.toString()}
          tone={pendingOrders > 0 ? "yellow" : "default"}
        />
        <Stat
          icon={<ShoppingBag className="w-4 h-4 text-blue-600" />}
          label="Orders today"
          value={today._count.toString()}
        />
        <Stat
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          label="Revenue today"
          value={formatCurrency(today._sum.total ?? 0)}
        />
        <Stat
          icon={<Users className="w-4 h-4 text-purple-600" />}
          label="Customers (all-time)"
          value={restaurant._count.customers.toString()}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Owner & access ───────────────────────────────────────── */}
        <Card title="Owner & access" icon={<Users className="w-4 h-4" />}>
          <Field label="Owner email" value={
            ownerEmail ? (
              <span className="flex items-center gap-1.5">
                <code className="text-xs">{ownerEmail}</code>
                {ownerEmailVerified ? (
                  <span title="Verified"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /></span>
                ) : (
                  <span title="Not verified"><AlertCircle className="w-3.5 h-3.5 text-amber-500" /></span>
                )}
              </span>
            ) : <span className="text-gray-400 italic">none</span>
          } />
          <Field label="Phone" value={restaurant.phone ?? <span className="text-gray-400 italic">not set</span>} />
          <Field label="Address" value={
            restaurant.address ? `${restaurant.address}, ${restaurant.city ?? ""} ${restaurant.zip ?? ""}` : <span className="text-gray-400 italic">not set</span>
          } />
          <Field label="Created" value={formatDate(restaurant.createdAt)} />
          <Field label="Updated" value={formatDate(restaurant.updatedAt)} />
          <Field label="Users with access" value={`${restaurant.users.length}`} />
        </Card>

        {/* ── Setup state ──────────────────────────────────────────── */}
        <Card title="Setup state" icon={<CheckCircle2 className="w-4 h-4" />}>
          {setupProgress ? (
            <>
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold">{setupProgress.completedSteps} of {setupProgress.totalSteps} steps complete</span>
                  <span className="font-mono text-xs">{setupProgress.percent}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${setupProgress.publishReady ? "bg-emerald-500" : "bg-amber-500"} transition-all`}
                    style={{ width: `${setupProgress.percent}%` }}
                  />
                </div>
              </div>
              <Field
                label="Publish-ready"
                value={
                  setupProgress.publishReady ? (
                    <span className="text-emerald-700 font-semibold">Yes</span>
                  ) : (
                    <span className="text-amber-700 font-semibold">
                      No — {setupProgress.requiredStepsRemaining.length} required step
                      {setupProgress.requiredStepsRemaining.length === 1 ? "" : "s"} missing
                    </span>
                  )
                }
              />
              {setupProgress.requiredStepsRemaining.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {setupProgress.requiredStepsRemaining.map((s) => (
                    <li key={s.id}>○ {s.label}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500 italic">Couldn&apos;t load setup progress</div>
          )}
        </Card>

        {/* ── Subscription & billing ───────────────────────────────── */}
        <Card title="Subscription & billing" icon={<CreditCard className="w-4 h-4" />}>
          <Field label="Plan" value={restaurant.subscriptionPlan?.name ?? <span className="text-gray-400 italic">none</span>} />
          <Field label="Status" value={<span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${subscriptionTextClass(restaurant.subscriptionStatus)}`}>{restaurant.subscriptionStatus}</span>} />
          <Field label="Trial ends" value={restaurant.trialEndsAt ? formatDate(restaurant.trialEndsAt) : <span className="text-gray-400 italic">—</span>} />
          <Field label="Current period end" value={restaurant.currentPeriodEnd ? formatDate(restaurant.currentPeriodEnd) : <span className="text-gray-400 italic">—</span>} />
          <Field label="Cancel at period end" value={restaurant.cancelAtPeriodEnd ? "Yes" : "No"} />
          <Field
            label="Stripe customer"
            value={restaurant.stripeCustomerId ? <code className="text-xs">{restaurant.stripeCustomerId}</code> : <span className="text-gray-400 italic">none</span>}
          />
          <Field
            label="Stripe subscription"
            value={restaurant.stripeSubscriptionId ? <code className="text-xs">{restaurant.stripeSubscriptionId}</code> : <span className="text-gray-400 italic">none</span>}
          />
        </Card>

        {/* ── Stripe Connect (payment processing) ──────────────────── */}
        <Card title="Stripe Connect (payment processing)" icon={<CreditCard className="w-4 h-4" />}>
          <Field
            label="Connect account"
            value={restaurant.stripeAccountId ? <code className="text-xs">{restaurant.stripeAccountId}</code> : <span className="text-gray-400 italic">not connected</span>}
          />
          <Field label="Status" value={restaurant.stripeAccountStatus ?? "—"} />
          <Field label="Charges enabled" value={restaurant.stripeChargesEnabled ? "✓ Yes" : "✗ No"} />
          <Field label="Payouts enabled" value={restaurant.stripePayoutsEnabled ? "✓ Yes" : "✗ No"} />
        </Card>

        {/* ── Add-ons ──────────────────────────────────────────────── */}
        <Card title={`Add-ons (${addOnSubs.filter(s => ["active", "trialing"].includes(s.status)).length} active)`} icon={<Sparkles className="w-4 h-4" />}>
          {addOnSubs.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No add-on subscriptions.</p>
          ) : (
            <ul className="space-y-2">
              {addOnSubs.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{sub.addOn.name}</div>
                    <div className="text-xs text-gray-500">
                      <code>{sub.addOn.slug}</code> · {formatCurrency(sub.addOn.monthlyPriceCents / 100)}/mo
                    </div>
                  </div>
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${subscriptionTextClass(sub.status)}`}>
                    {sub.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Marketplace ──────────────────────────────────────────── */}
        <Card title="Marketplace" icon={<Sparkles className="w-4 h-4" />}>
          {restaurant.marketplaceListing ? (
            <>
              <Field
                label="Listed publicly"
                value={restaurant.marketplaceListing.isListed
                  ? <span className="text-emerald-700 font-semibold">Yes</span>
                  : <span className="text-amber-700 font-semibold">Paused (subscription active but owner toggled off)</span>}
              />
              <Field label="Featured" value={restaurant.marketplaceListing.marketplaceFeatured ? <span className="text-orange-600 flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-orange-600" /> Yes</span> : "No"} />
              <Field label="Orders this month" value={restaurant.marketplaceListing.currentMonthOrders.toString()} />
              <Field label="Revenue this month" value={formatCurrency(restaurant.marketplaceListing.currentMonthRevenue)} />
              <Field
                label="Lifetime savings vs UberEats"
                value={<span className="text-emerald-700 font-bold">{formatCurrency(restaurant.marketplaceListing.lifetimeSavingsVsUberEatsCents / 100)}</span>}
              />
            </>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No marketplace listing. Subscribes when the &quot;Marketplace&quot; add-on activates.
            </p>
          )}
        </Card>

        {/* ── Operations (kitchen + menu + delivery) ───────────────── */}
        <Card title="Operations" icon={<ChefHat className="w-4 h-4" />}>
          <Field label="Menu categories" value={restaurant._count.menuCategories.toString()} />
          <Field label="Menu items" value={restaurant._count.menuItems.toString()} />
          <Field label="Delivery zones (active)" value={restaurant._count.deliveryZones.toString()} />
          <Field label="Opening hours rows" value={restaurant._count.openingHours.toString()} />
          <Field label="Notification recipients" value={notificationRecipientCount.toString()} />
          <Field label="Total orders (all-time)" value={restaurant._count.orders.toString()} />
          <Field label="Last 30d orders / revenue" value={`${last30Days._count} · ${formatCurrency(last30Days._sum.total ?? 0)}`} />
        </Card>

        {/* ── Kitchen devices ──────────────────────────────────────── */}
        <Card title="Kitchen devices (heartbeats)" icon={<ChefHat className="w-4 h-4" />}>
          {kitchenDevices.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No kitchen devices have checked in.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {kitchenDevices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <code className="text-xs text-gray-500 truncate">{d.deviceHash.slice(0, 16)}…</code>
                  <span className="text-xs text-gray-600">
                    Last seen {formatDate(d.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Multi-location ───────────────────────────────────────── */}
        <Card title="Multi-location" icon={<Layers className="w-4 h-4" />}>
          {parent ? (
            <div className="text-sm">
              <div className="text-gray-500 text-xs mb-1">This is a child of:</div>
              <Link href={`/superadmin/restaurants/${parent.id}`} className="text-blue-600 hover:underline font-semibold">
                {parent.name}
              </Link>
              <div className="text-xs text-gray-400 mt-0.5"><code>{parent.slug}</code></div>
            </div>
          ) : children.length > 0 ? (
            <>
              <div className="text-sm text-gray-500 mb-2">{children.length} child location{children.length === 1 ? "" : "s"}:</div>
              <ul className="space-y-2">
                {children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/superadmin/restaurants/${c.id}`} className="text-blue-600 hover:underline font-semibold truncate">
                      {c.name}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      {c.publishedAt ? <StatusBadge label="Live" tone="emerald" /> : <StatusBadge label="Setup" tone="amber" />}
                      {!c.isActive && <StatusBadge label="Paused" tone="gray" />}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-500 italic">Single-location restaurant (no parent, no children).</p>
          )}
        </Card>

        {/* ── Reseller attribution ─────────────────────────────────── */}
        {restaurant.resellerProfile && (
          <Card title="Reseller attribution" icon={<Users className="w-4 h-4" />}>
            <Field label="Reseller" value={restaurant.resellerProfile.companyName ?? "(no name)"} />
            <Field label="Reseller status" value={<span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${subscriptionTextClass(restaurant.resellerProfile.status)}`}>{restaurant.resellerProfile.status}</span>} />
            <Link href={`/superadmin/resellers/${restaurant.resellerProfile.id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              View reseller profile →
            </Link>
          </Card>
        )}

        {/* ── Domain + widget ──────────────────────────────────────── */}
        <Card title="Domain & widget" icon={<Globe className="w-4 h-4" />}>
          <Field label="Subdomain" value={restaurant.subdomain ?? <span className="text-gray-400 italic">none</span>} />
          <Field
            label="Custom domain"
            value={restaurant.customDomain ? (
              <span>
                <code className="text-xs">{restaurant.customDomain}</code>
                <span className="ml-2 text-xs text-gray-500">({restaurant.customDomainStatus})</span>
              </span>
            ) : <span className="text-gray-400 italic">none</span>}
          />
          <Field
            label="Widget public ID"
            value={restaurant.widgetPublicId ? <code className="text-xs">{restaurant.widgetPublicId}</code> : <span className="text-gray-400 italic">not generated</span>}
          />
          <Field
            label="Widget installed"
            value={restaurant.widgetInstalledAt
              ? <span className="text-emerald-700 font-semibold">✓ {formatDate(restaurant.widgetInstalledAt)}</span>
              : <span className="text-gray-400 italic">not yet detected</span>}
          />
        </Card>
      </div>

      {/* ── Recent orders ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Last 10 orders
          </h3>
          {restaurant._count.orders > 10 && (
            <span className="text-xs text-gray-500">+ {restaurant._count.orders - 10} more</span>
          )}
        </div>
        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 italic">No orders yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Order", "Customer", "Type", "Total", "Status", "Payment", "When"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{o.orderNumber}</td>
                  <td className="px-4 py-2.5 text-gray-700 truncate max-w-[180px]">{o.customerName}</td>
                  <td className="px-4 py-2.5 text-gray-600">{o.type}</td>
                  <td className="px-4 py-2.5 text-gray-900 font-semibold">{formatCurrency(o.total)}</td>
                  <td className="px-4 py-2.5"><StatusBadge label={o.status} tone={orderStatusTone(o.status)} /></td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{o.paymentMethod} · {o.paymentStatus}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
        {icon}{title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 text-xs uppercase tracking-wider font-semibold mt-0.5 shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  );
}

function Stat({ icon, label, value, tone = "default" }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "yellow";
}) {
  const toneClass = tone === "yellow" ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-200";
  return (
    <div className={`rounded-xl border ${toneClass} p-3.5`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "emerald" | "amber" | "red" | "gray" | "blue" | "purple" | "orange" | "yellow" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber:   "bg-amber-100 text-amber-800",
    red:     "bg-red-100 text-red-700",
    gray:    "bg-gray-100 text-gray-700",
    blue:    "bg-blue-100 text-blue-700",
    purple:  "bg-purple-100 text-purple-700",
    orange:  "bg-orange-100 text-orange-700",
    yellow:  "bg-yellow-100 text-yellow-800",
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${tones[tone]}`}>
      {label}
    </span>
  );
}

function subscriptionTone(status: string): "emerald" | "amber" | "red" | "gray" {
  switch (status) {
    case "active": return "emerald";
    case "trialing": return "amber";
    case "past_due": return "red";
    case "cancelled": return "gray";
    default: return "gray";
  }
}

function subscriptionTextClass(status: string): string {
  const tone = subscriptionTone(status);
  return tone === "emerald" ? "bg-emerald-100 text-emerald-700"
    : tone === "amber" ? "bg-amber-100 text-amber-800"
    : tone === "red" ? "bg-red-100 text-red-700"
    : "bg-gray-100 text-gray-700";
}

function orderStatusTone(status: string): "amber" | "blue" | "emerald" | "red" | "gray" {
  switch (status) {
    case "pending": return "amber";
    case "accepted":
    case "preparing": return "blue";
    case "ready":
    case "completed": return "emerald";
    case "rejected":
    case "cancelled": return "red";
    default: return "gray";
  }
}
