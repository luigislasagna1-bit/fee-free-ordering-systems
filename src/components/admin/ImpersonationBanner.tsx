"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { useTranslations } from "next-intl";

export function ImpersonationBanner({ restaurantName }: { restaurantName: string }) {
  const t = useTranslations("impersonation");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const exit = async () => {
    setLoading(true);
    await fetch("/api/superadmin/impersonate", { method: "DELETE" });
    router.push("/superadmin/restaurants");
    router.refresh();
  };

  return (
    <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between text-sm flex-shrink-0">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        <span>{t("banner", { restaurant: restaurantName })}</span>
      </div>
      <button
        onClick={exit}
        disabled={loading}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition px-3 py-1 rounded-lg font-medium disabled:opacity-60"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t("backToSuperadmin")}
      </button>
    </div>
  );
}
