import Link from "next/link";
import { ArrowRight, Flag, PhoneCall } from "lucide-react";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { VOICE_CALL_REPORT_OPEN_STATUSES } from "@/lib/voice/call-reports";

/**
 * Superadmin — Restaurant Reports hub (Luigi 2026-08-16). Restaurants flag
 * things for the platform to look at; each kind gets a sub-section. Today:
 * "Nabil AI reports" (a call taken wrong, wrong price, robotic voice, dropped
 * call). English-only by superadmin convention.
 */
export const dynamic = "force-dynamic";

export default async function RestaurantReportsHub() {
  const staff = await requirePlatformStaff();
  if (!staff) return <div className="p-8 text-sm text-gray-500">Forbidden.</div>;

  const [newCount, openCount, urgentOpen, total] = await Promise.all([
    prisma.voiceCallReport.count({ where: { status: "NEW" } }),
    prisma.voiceCallReport.count({ where: { status: { in: [...VOICE_CALL_REPORT_OPEN_STATUSES] } } }),
    prisma.voiceCallReport.count({ where: { status: { in: [...VOICE_CALL_REPORT_OPEN_STATUSES] }, urgent: true } }),
    prisma.voiceCallReport.count(),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Flag className="w-6 h-6 text-emerald-600" /> Restaurant Reports
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Issues restaurants flag for the platform. Each report is worked here — status, a notes thread the restaurant
          reads on its side, and the evidence next to it — so a fix is a conversation, not a guess.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/superadmin/restaurant-reports/nabil"
          className="group rounded-xl border border-gray-200 bg-white p-5 hover:border-emerald-300 hover:shadow-sm transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <PhoneCall className="w-5 h-5" />
              </span>
              <div>
                <div className="font-semibold text-gray-900">Nabil AI reports</div>
                <div className="text-xs text-gray-500">Calls a restaurant reported — wrong order, wrong price, voice, technical</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 mt-1" />
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap text-xs">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${newCount ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
              {newCount} new
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">{openCount} open</span>
            {urgentOpen > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white">{urgentOpen} urgent</span>
            )}
            <span className="text-gray-400">{total} all time</span>
          </div>
        </Link>

        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-5 text-sm text-gray-400">
          More report types (ordering, kitchen display, payments) will land here as restaurants get a &ldquo;Report&rdquo; button on
          those screens.
        </div>
      </div>
    </div>
  );
}
