import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { CustomersClient } from "./CustomersClient";

/**
 * /admin/customers — the editable CRM hub.
 *
 * Distinct from the analytical surfaces under Reports → Clients:
 *   - /admin/reports/online-ordering/clients = cohort dashboard
 *     (returning vs new, with marketing add-on upsells)
 *   - /admin/reports/list/clients = date-range spreadsheet with CSV export
 *
 * This page is where the owner reaches out to customers, assigns personal
 * coupons, leaves internal notes, sees who's signed up vs. a guest.
 * Each row links to /admin/customers/[id] for the detail view.
 */

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null;

  // Pull ALL customers; the client-side filter / search is fast enough
  // at the scale of a single restaurant's customer base. We compute
  // `hasAccount` server-side so we don't ship the raw passwordHash
  // (sensitive, even if hashed) to the browser.
  // Wallet balances ride along in ONE restaurant-scoped query (not per-row)
  // and the reward column only shows when the master toggle is ON
  // (feature-gated visibility). Luigi 2026-07-19.
  const [rows, wallets, restaurant] = await Promise.all([
    prisma.customer.findMany({
      where: { restaurantId },
      orderBy: { totalSpent: "desc" },
      select: {
        id: true, name: true, email: true, phone: true,
        totalOrders: true, totalSpent: true, createdAt: true,
        passwordHash: true,
        // When the customer created their account (null for guests) —
        // distinct from createdAt, which is when the row appeared (first
        // order). Drives the new "Signed up" column.
        signedUpAt: true,
        // Marketing-consent flag — drives the "Marketing" column on the
        // customers list and the new CSV column. Stamped at checkout when
        // the (default-checked) opt-in box is left ticked, or toggled by
        // the customer themselves from /order/<slug>/account.
        marketingConsent: true,
      },
    }),
    prisma.rewardAccount.findMany({
      where: { restaurantId },
      select: { customerId: true, balance: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { rewardsEnabled: true, rewardLabelPlural: true },
    }),
  ]);
  const balanceByCustomer = new Map(wallets.map((w) => [w.customerId, w.balance]));
  const customers = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    totalOrders: c.totalOrders,
    totalSpent: c.totalSpent,
    createdAt: c.createdAt.toISOString(),
    signedUpAt: c.signedUpAt ? c.signedUpAt.toISOString() : null,
    hasAccount: !!c.passwordHash,
    marketingConsent: !!c.marketingConsent,
    rewardBalance: balanceByCustomer.get(c.id) ?? 0,
  }));

  return (
    <CustomersClient
      customers={customers}
      rewardsEnabled={restaurant?.rewardsEnabled ?? false}
      rewardLabel={restaurant?.rewardLabelPlural?.trim() || "Reward Dollars"}
    />
  );
}
