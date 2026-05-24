import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Users, Mail, Phone } from "lucide-react";

export default async function CustomersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const customers = await prisma.customer.findMany({
    where: { restaurantId },
    orderBy: { totalSpent: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <span className="text-sm text-gray-500 flex-shrink-0">{customers.length} customers</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {customers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No customers yet. They&apos;ll appear here after their first order.</p>
          </div>
        ) : (
          <>
            {/* Mobile: card layout — table is unusable on phones (6 cols
                wouldn't fit even with horizontal scroll, since the user
                has to scroll vertically through 50+ rows). Cards stack
                naturally and put the most important data (name + spend)
                up top. */}
            <ul className="divide-y divide-gray-100 md:hidden">
              {customers.map((c) => (
                <li key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 truncate">{c.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.totalOrders} order{c.totalOrders === 1 ? "" : "s"} · since {formatDate(c.createdAt)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900">{formatCurrency(c.totalSpent)}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">total spent</div>
                    </div>
                  </div>
                  {(c.email || c.phone) && (
                    <div className="mt-2 flex flex-col gap-1 text-xs text-gray-600">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-emerald-700 truncate">
                          <Mail className="w-3 h-3 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{c.email}</span>
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-emerald-700">
                          <Phone className="w-3 h-3 flex-shrink-0 text-gray-400" />
                          {c.phone}
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Desktop: traditional 6-column table. Horizontal-scroll
                wrapper retained as a safety net for narrow desktops. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Name", "Email", "Phone", "Orders", "Total Spent", "First Order"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.totalOrders}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(c.totalSpent)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
