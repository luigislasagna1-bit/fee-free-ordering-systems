import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PaymentPageClient } from "./PaymentPageClient";

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("customer.paymentPage");
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t("loading")}</div>}>
      <PaymentPageClient slug={slug} />
    </Suspense>
  );
}
