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
  const rows = await prisma.customer.findMany({
    where: { restaurantId },
    orderBy: { totalSpent: "desc" },
    select: {
      id: true, name: true, email: true, phone: true,
      totalOrders: true, totalSpent: true, createdAt: true,
      passwordHash: true,
      // Marketing-consent flag — drives the "Marketing" column on the
      // customers list and the new CSV column. Stamped at checkout when
      // the (default-checked) opt-in box is left ticked, or toggled by
      // the customer themselves from /order/<slug>/account.
      marketingConsent: true,
    },
  });
  const customers = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    totalOrders: c.totalOrders,
    totalSpent: c.totalSpent,
    createdAt: c.createdAt.toISOString(),
    hasAccount: !!c.passwordHash,
    marketingConsent: !!c.marketingConsent,
  }));

  return <CustomersClient customers={customers} />;
}
