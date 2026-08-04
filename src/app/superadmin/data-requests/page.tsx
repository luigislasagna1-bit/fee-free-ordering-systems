import "server-only";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/platform-auth";
import { DataRequestsClient } from "./DataRequestsClient";

/**
 * Superadmin data-rights fulfillment: action the manual "email support@ to
 * delete my account/data" requests + CASL/RTBF complaints. Previews the match,
 * then anonymizes platform-wide (or restaurant-scoped) via
 * /api/superadmin/data-requests. FULL superadmin only.
 */
export default async function DataRequestsPage() {
  const actor = await requireSuperadmin();
  if (!actor) redirect("/superadmin");
  return <DataRequestsClient />;
}
