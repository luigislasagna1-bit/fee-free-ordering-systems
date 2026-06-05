/**
 * /reseller-reports/notifications — in-app notification feed.
 *
 * Shows every notification for the current viewer (reseller or superadmin) —
 * "X replied to your report", "status changed", etc. Opening this page marks
 * them all read (deferred via after()), which clears the bell badge. Same
 * access gate as the rest of the report center. Luigi 2026-06-05.
 */
import { after } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageSquare, RefreshCw, Bell } from "lucide-react";
import { getReportAccess } from "@/lib/reseller-reports-access";
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

export default async function NotificationsPage() {
  const access = await getReportAccess();
  if (!access.canView) redirect("/login");

  const notifications = await listNotifications(access.email);
  // Mark everything read AFTER we've captured the unread state for this render.
  after(() => markAllNotificationsRead(access.email));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/reseller-reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to reports
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-1">
          <Bell className="w-6 h-6 text-emerald-500" /> Notifications
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Replies and status changes on reports you filed or commented on.
        </p>

        {notifications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="text-xs mt-1">You'll be notified here when someone replies or a status changes.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {notifications.map((n) => {
              const unread = n.readAt === null;
              const Inner = (
                <div className={`flex items-start gap-3 p-4 ${unread ? "bg-emerald-50/60" : ""}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${n.kind === "report_status" ? "bg-sky-100 text-sky-600" : "bg-emerald-100 text-emerald-600"}`}>
                    {n.kind === "report_status" ? <RefreshCw className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
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
    </div>
  );
}
