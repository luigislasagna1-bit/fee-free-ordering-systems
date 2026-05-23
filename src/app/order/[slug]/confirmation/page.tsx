import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { CheckCircle, Clock, MapPin, ArrowRight } from "lucide-react";

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { slug } = await params;
  const { orderId } = await searchParams;
  if (!orderId) notFound();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: true,
      items: { include: { modifiers: true } },
    },
  });

  if (!order || order.restaurant.slug !== slug) notFound();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h1>
        <p className="text-gray-500 mb-6">
          Your order has been received and is waiting for confirmation from {order.restaurant.name}.
        </p>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="text-sm text-gray-600 mb-1">Order Number</div>
          <div className="text-2xl font-bold text-emerald-500">{order.orderNumber}</div>
        </div>

        <div className="text-left space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-5 h-5 text-gray-400" />
            <span className="text-gray-600">
              Estimated {order.type}: {order.type === "pickup" ? order.restaurant.estimatedPickup : order.restaurant.estimatedDelivery} min
            </span>
          </div>
          {order.type === "delivery" && order.deliveryAddress && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-5 h-5 text-gray-400" />
              <span className="text-gray-600">{order.deliveryAddress}, {order.deliveryCity}</span>
            </div>
          )}
        </div>

        {/* Order items */}
        <div className="border border-gray-100 rounded-xl p-4 mb-6 text-left">
          <div className="text-sm font-semibold text-gray-700 mb-3">Order Summary</div>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.quantity}× {item.name}</span>
                <span className="text-gray-600">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
            {order.taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(order.taxAmount)}</span></div>}
            {order.deliveryFee > 0 && <div className="flex justify-between text-gray-600"><span>Delivery</span><span>{formatCurrency(order.deliveryFee)}</span></div>}
            <div className="flex justify-between font-bold text-gray-900"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/order/${slug}/status/${order.id}`}
            className="flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition"
          >
            Track Order Status <ArrowRight className="w-4 h-4" />
          </Link>
          {/* Send marketplace customers back to the grid (where they were
              browsing). Direct-customers get the restaurant-menu link as
              before. Same logic as the status page. */}
          {order.viaMarketplace ? (
            <Link href="/" className="text-gray-500 text-sm hover:text-gray-700 transition">
              ← Browse other restaurants
            </Link>
          ) : (
            <Link href={`/order/${slug}`} className="text-gray-500 text-sm hover:text-gray-700 transition">
              Place another order
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
