import { requirePlatformStaff } from "@/lib/platform-auth";
import BrandedAppsQueueClient from "./BrandedAppsQueueClient";

/**
 * Superadmin — Branded Mobile App fulfillment queue (Luigi 2026-08-02).
 * English-only (superadmin convention). Data loads client-side from
 * /api/superadmin/branded-apps so the queue refreshes without a reload.
 */
export default async function BrandedAppsPage() {
  const staff = await requirePlatformStaff();
  if (!staff) {
    return <div className="p-8 text-sm text-gray-500">Forbidden.</div>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Branded Apps</h1>
        <p className="text-sm text-gray-500 mt-1">
          White-label customer-app projects — verify store access, run builds, record store responses.
        </p>
      </div>
      <BrandedAppsQueueClient />
    </div>
  );
}
