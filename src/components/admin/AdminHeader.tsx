import type { Session } from "next-auth";
import { Bell } from "lucide-react";
import Link from "next/link";

export function AdminHeader({ session, pendingOrders = 0 }: { session: Session; pendingOrders?: number }) {
  const user = session.user as any;
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div>
        <span className="text-sm text-gray-500">Welcome back,</span>
        <span className="ml-1 font-semibold text-gray-900">{user?.name || user?.email}</span>
      </div>
      <div className="flex items-center gap-4">
        {pendingOrders > 0 && (
          <Link
            href="/admin/orders"
            className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-yellow-100 transition"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            {pendingOrders} pending order{pendingOrders !== 1 ? "s" : ""}
          </Link>
        )}
        <div className="relative p-2 text-gray-400">
          <Bell className="w-5 h-5" />
          {pendingOrders > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
          {(user?.name || user?.email || "?")[0].toUpperCase()}
        </div>
      </div>
    </header>
  );
}
