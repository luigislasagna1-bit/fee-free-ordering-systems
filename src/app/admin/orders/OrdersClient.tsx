"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ShoppingBag, Search, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

const STATUS_FILTERS = ["all", "pending", "accepted", "preparing", "ready", "completed", "rejected"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-blue-100 text-blue-700",
  preparing: "bg-emerald-100 text-emerald-700",
  ready: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

export function OrdersClient({ orders }: { orders: any[] }) {
  const t = useTranslations("admin.orders");
  const tCommon = useTranslations("common");
  const tCheckout = useTranslations("checkout");
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Track pending count so we can alert when new orders arrive
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const prevPendingRef = useRef<number | null>(null);

  // Auto-refresh every 5 seconds via RSC re-render
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  // Toast when new pending orders arrive (skip first render)
  useEffect(() => {
    if (prevPendingRef.current !== null && pendingCount > prevPendingRef.current) {
      const diff = pendingCount - prevPendingRef.current;
      toast(`${diff} new order${diff > 1 ? "s" : ""} received!`, {
        icon: "🔔",
        duration: 6000,
        style: { background: "#1f2937", color: "#fff", border: "1px solid #374151" },
      });
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount]);

  const filtered = orders.filter((o) => {
    const matchesStatus = filter === "all" || o.status === filter;
    const matchesSearch =
      !search ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerEmail?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-semibold px-3 py-1.5 rounded-full animate-pulse">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              {pendingCount} {t("pending")}
            </div>
          )}
          <span className="text-sm text-gray-500">{orders.length} {tCommon("total")}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={tCommon("search")}
            className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${filter === s ? "bg-emerald-500 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              {t(s as any)}
              {s === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-yellow-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{t("noOrders")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((order) => (
              <div key={order.id} className={order.status === "pending" ? "border-l-4 border-l-yellow-400" : ""}>
                <div
                  className="p-3 sm:p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 truncate">{order.customerName}</div>
                    <div className="text-xs sm:text-sm text-gray-500 truncate">
                      <span className="font-mono">{order.orderNumber}</span> · {order.type} ·{" "}
                      <span className="hidden sm:inline">{formatDate(order.createdAt)}</span>
                      <span className="sm:hidden">{new Date(order.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-3 flex-shrink-0">
                    <span className="font-bold text-gray-900 text-sm sm:text-base whitespace-nowrap">{formatCurrency(order.total)}</span>
                    <span className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 sm:py-1 rounded-full whitespace-nowrap ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                      {(() => { try { return t(order.status as any); } catch { return order.status; } })()}
                    </span>
                  </div>
                </div>

                {expanded === order.id && (
                  <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                    <div className="grid md:grid-cols-2 gap-4 pt-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("customer")}</div>
                        <div className="text-sm text-gray-700 space-y-1">
                          <div>{order.customerName}</div>
                          {order.customerEmail && <div>{order.customerEmail}</div>}
                          {order.customerPhone && <div>{order.customerPhone}</div>}
                          {order.type === "delivery" && order.deliveryAddress && (
                            <div>{order.deliveryAddress}, {order.deliveryCity} {order.deliveryZip}</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{tCommon("details")}</div>
                        <div className="space-y-2">
                          {order.items.map((item: any) => (
                            <div key={item.id} className="text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-800">{item.quantity}× {item.name}</span>
                                <span className="text-gray-600">{formatCurrency(item.subtotal)}</span>
                              </div>
                              {item.modifiers?.map((mod: any) => (
                                <div key={mod.id} className="text-xs text-gray-500 pl-4">+ {mod.name}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-200 mt-3 pt-3 space-y-1 text-sm">
                          <div className="flex justify-between text-gray-600"><span>{tCommon("subtotal")}</span><span>{formatCurrency(order.subtotal)}</span></div>
                          {order.taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>{tCheckout("tax")}</span><span>{formatCurrency(order.taxAmount)}</span></div>}
                          {order.deliveryFee > 0 && <div className="flex justify-between text-gray-600"><span>{tCheckout("delivery")}</span><span>{formatCurrency(order.deliveryFee)}</span></div>}
                          <div className="flex justify-between font-bold text-gray-900"><span>{tCommon("total")}</span><span>{formatCurrency(order.total)}</span></div>
                        </div>
                      </div>
                    </div>
                    {order.notes && (
                      <div className="mt-3 text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <span className="font-medium text-yellow-800">{tCommon("notes")}: </span>
                        <span className="text-yellow-700">{order.notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
