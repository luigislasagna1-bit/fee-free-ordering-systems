import "server-only";
import prisma from "@/lib/db";

/**
 * Server-side helpers for Nabil AI call reports (the DB half; the shared
 * vocabulary is in ./call-reports.ts so client components can import it).
 */

/** Superadmin nav badge: reports nobody has picked up yet. One indexed count
 *  ((status, urgent, createdAt) index) per superadmin page render — cheap, and
 *  the superadmin panel is not a customer hot path. Best-effort: 0 on error so
 *  a DB blip never takes the whole panel down. */
export async function countNewNabilCallReports(): Promise<number> {
  try {
    return await prisma.voiceCallReport.count({ where: { status: "NEW" } });
  } catch (e) {
    console.error("[call-reports] count failed", e);
    return 0;
  }
}
