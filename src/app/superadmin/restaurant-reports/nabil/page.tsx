import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform-auth";
import NabilReportsListClient from "./NabilReportsListClient";

/**
 * Superadmin — Restaurant Reports › Nabil AI reports (Luigi 2026-08-16).
 * Calls a restaurant flagged from its call page. English-only (superadmin
 * convention). Data loads client-side from /api/superadmin/restaurant-reports/nabil.
 */
export const dynamic = "force-dynamic";

export default async function NabilReportsPage() {
  const staff = await requirePlatformStaff();
  if (!staff) return <div className="p-8 text-sm text-gray-500">Forbidden.</div>;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/superadmin/restaurant-reports" className="text-sm text-gray-500 hover:text-gray-900">
          &larr; Restaurant Reports
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Nabil AI reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          A restaurant pressed “Report this call”. Open one to hear the call, read the transcript and the cart the
          engine built, set a status, and reply — the restaurant sees the thread on its call page.
        </p>
      </div>
      <NabilReportsListClient />
    </div>
  );
}
