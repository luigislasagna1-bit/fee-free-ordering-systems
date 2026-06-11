/**
 * /reseller/notifications — the reseller panel's own notification feed.
 *
 * Unlike /reseller-reports/notifications (which is gated behind a report-center
 * invite), this lives inside the reseller dashboard and is open to EVERY
 * approved reseller. It surfaces all of their platform notifications — a new
 * restaurant signing up under them, a client subscribing to / cancelling a paid
 * add-on, plus any report replies — all of which are stored as
 * ResellerNotification rows keyed by the viewer's email. Opening the page marks
 * them read (deferred), which clears the sidebar bell badge. Luigi 2026-06-11.
 */
import { after } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, MessageSquare, RefreshCw, Store, Sparkles, XCircle } from "lucide-react";
import { ROLES } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { listNotifications, markAllNotificationsRead } from "@/lib/reseller-reports-workflow";

export const dynamic = "force-dynamic";

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** Icon + accent per notification kind. Unknown kinds fall back to the bell. */
function iconFor(kind: string): { Icon: typeof Bell; cls: string } {
  switch (kind) {
    case "restaurant_signup":
      return { Icon: Store, cls: "bg-emerald-100 text-emerald-600" };
    case "addon_activated":
      return { Icon: Sparkles, cls: "bg-amber-100 text-amber-600" };
    case "addon_cancelled":
      return { Icon: XCircle, cls: "bg-rose-100 text-rose-600" };
    case "report_status":
      return { Icon: RefreshCw, cls: "bg-sky-100 text-sky-600" };
    case "report_comment":
      return { Icon: MessageSquare, cls: "bg-emerald-100 text-emerald-600" };
    default:
      return { Icon: Bell, cls: "bg-gray-100 text-gray-500" };
  }
}

export default async function ResellerNotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Approved resellers only (incl. a superadmin impersonating one). Same
  // admission shape as the reseller layout.
  if (user.effectiveRole !== ROLES.RESELLER_PARTNER) redirect("/login");
  const profile = user.resellerProfileId
    ? await prisma.resellerProfile.findUnique({
        where: { id: user.resellerProfileId },
        select: { status: true },
      })
    : null;
  if (profile?.status !== "approved") redirect("/reseller");

  const email = user.email;
  const notifications = await listNotifications(email);
  // Mark read AFTER we've captured the unread state for this render.
  after(() => markAllNotificationsRead(email));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-1">
        <Bell className="w-6 h-6 text-emerald-500" /> Notifications
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        New restaurants under you, add-on subscriptions and cancellations, and report updates.
      </p>

      {notifications.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs mt-1">You'll be notified here when a restaurant signs up or changes a paid add-on.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {notifications.map((n) => {
            const unread = n.readAt === null;
            const { Icon, cls } = iconFor(n.kind);
            const Inner = (
              <div className={`flex items-start gap-3 p-4 ${unread ? "bg-emerald-50/60" : ""}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${cls}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {unread && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
                    <p className={`text-sm truncate ${unread ? "font-semibold text-gray-900" : "text-gray-700"}`}>{n.title}</p>
                  </div>
                  {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            );
            return n.linkUrl ? (
              <Link key={n.id} href={n.linkUrl} className="block hover:bg-gray-50 transition">{Inner}</Link>
            ) : (
              <div key={n.id}>{Inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
