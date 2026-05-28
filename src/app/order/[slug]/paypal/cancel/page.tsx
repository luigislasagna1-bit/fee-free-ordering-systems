/**
 * /order/[slug]/paypal/cancel?orderId=...
 *
 * Landing page when the customer cancels the PayPal flow (clicks "Cancel
 * and return" in PayPal's UI). The Order row stays in paymentStatus="pending"
 * — they can re-try by going back to the menu and re-checking out. We do
 * NOT delete the row server-side so they could in theory pay later, but
 * a stale-order cron eventually voids unpaid orders.
 */

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";

export default function PaypalCancelPage() {
  const params = useParams<{ slug: string }>();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
          <Info className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-gray-900">Payment cancelled</h1>
        <p className="mt-2 text-sm text-gray-600">
          You cancelled the PayPal payment. No charge was made. You can return
          to the menu and place a new order, or pick a different payment method.
        </p>
        <Link
          href={`/order/${params.slug}`}
          className="inline-flex items-center gap-2 mt-5 bg-gray-900 hover:bg-gray-700 text-white font-semibold px-4 py-2 rounded-lg text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to menu
        </Link>
      </div>
    </div>
  );
}
