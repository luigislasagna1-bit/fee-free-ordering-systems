import { Suspense } from "react";
import { PaymentPageClient } from "./PaymentPageClient";

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <PaymentPageClient slug={slug} />
    </Suspense>
  );
}
